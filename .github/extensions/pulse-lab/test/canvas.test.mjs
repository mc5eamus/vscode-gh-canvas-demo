import assert from "node:assert/strict";
import { test } from "node:test";
import { createCanvas } from "@github/copilot-sdk/extension";
import { createPulseLab } from "../canvas.mjs";
import { createSimulation } from "../simulation.mjs";

test("synthetic scenarios, invalid input, bounded history, snapshots, and reset", () => {
  const dispatch = createSimulation();
  const initial = dispatch("get_state");
  assert.equal(initial.simulationOnly, true);
  assert.equal(initial.scenario, "steady");
  assert.deepEqual(initial.history, []);
  const first = dispatch("take_reading");
  assert.deepEqual(first.history[0].values, { systolic: 118, diastolic: 76, pulse: 68 });
  first.history[0].values.systolic = 999;
  assert.equal(dispatch("get_state").history[0].values.systolic, 118);

  for (const scenario of ["unknown", "__proto__", ["steady"], null, 1]) {
    assert.throws(() => dispatch("set_scenario", { scenario }), /Choose/);
  }
  assert.throws(() => dispatch("set_scenario", null), /Choose/);
  assert.throws(() => dispatch("unknown"), /Unknown/);
  assert.equal(dispatch("get_state").scenario, "steady");

  dispatch("set_scenario", { scenario: "elevated" });
  assert.deepEqual(dispatch("take_reading").history[0].values,
    { systolic: 146, diastolic: 92, pulse: 84 });
  dispatch("set_scenario", { scenario: "motion" });
  const failed = dispatch("take_reading");
  assert.equal(failed.history[0].values, null);
  assert.match(failed.history[0].error, /motion artifact/);
  for (let i = 0; i < 12; i++) dispatch("take_reading");
  const bounded = dispatch("get_state");
  assert.equal(bounded.attempts, 15);
  assert.equal(bounded.history.length, 10);
  assert.deepEqual(bounded.history.map((entry) => entry.id), [15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
  const reset = dispatch("reset");
  assert.equal(reset.scenario, "steady");
  assert.equal(reset.attempts, 0);
  assert.deepEqual(reset.history, []);
});

test("SDK declaration and instance lifecycle preserve focus and isolate state", async (t) => {
  const lab = createPulseLab();
  t.after(() => lab.dispose());
  const canvas = createCanvas(lab.options);
  assert.equal(canvas.declaration.id, "pulse-lab");
  assert.deepEqual(canvas.declaration.actions.map((action) => action.name),
    ["get_state", "set_scenario", "take_reading", "reset"]);
  const invoke = (name, instanceId) =>
    lab.options.actions.find((action) => action.name === name).handler({ instanceId });
  await assert.rejects(invoke("get_state", "missing"), /Open Pulse Lab/);
  const [first, focused] = await Promise.all([
    canvas.open({ instanceId: "one" }), canvas.open({ instanceId: "one" }),
  ]);
  assert.equal(first.url, focused.url);
  assert.equal(new URL(first.url).hostname, "127.0.0.1");
  const second = await canvas.open({ instanceId: "two" });
  assert.notEqual(first.url, second.url);
  await invoke("take_reading", "one");
  assert.equal((await invoke("get_state", "two")).attempts, 0);
  assert.equal((await invoke("get_state", "one")).attempts, 1);
  await canvas.onClose({ instanceId: "one" });
  await assert.rejects(invoke("get_state", "one"), /Open Pulse Lab/);
  await assert.rejects(fetch(first.url));
  const reopened = await canvas.open({ instanceId: "one" });
  assert.notEqual(reopened.url, first.url);
  assert.equal((await invoke("get_state", "one")).attempts, 0);
});

test("chat-to-canvas actions and browser actions share state and stream live updates", { timeout: 10000 }, async (t) => {
  const lab = createPulseLab();
  t.after(() => lab.dispose());
  const { url } = await lab.options.open({ instanceId: "shared" });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${url}events`, { signal: controller.signal });
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const reader = stream.body.getReader();
  let buffer = "";
  const nextState = async () => {
    while (!buffer.includes("\n\n")) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      buffer += new TextDecoder().decode(value);
    }
    const end = buffer.indexOf("\n\n");
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    return JSON.parse(frame.split("\ndata: ")[1]);
  };
  assert.equal((await nextState()).attempts, 0);
  const post = (action, input) => fetch(`${url}action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  assert.equal((await post("take_reading")).status, 200);
  assert.equal((await nextState()).history[0].source, "human");
  const agent = (name, input) => lab.options.actions.find((action) => action.name === name)
    .handler({ instanceId: "shared", input });
  assert.equal((await agent("get_state")).attempts, 1);
  await agent("set_scenario", { scenario: "elevated" });
  assert.equal((await nextState()).scenario, "elevated");
  await agent("take_reading");
  const updated = await nextState();
  assert.equal(updated.history[0].source, "agent");
  assert.equal(updated.history[0].values.systolic, 146);
  await post("set_scenario", { scenario: "motion" });
  await nextState();
  await post("take_reading");
  assert.equal((await nextState()).history[0].values, null);
  await agent("reset");
  assert.deepEqual((await nextState()).history, []);
  await post("take_reading");
  await nextState();
  await post("reset");
  assert.equal((await nextState()).attempts, 0);
  assert.equal((await agent("get_state")).attempts, 0);
});

test("HTTP assets and malformed/unauthorized requests", async (t) => {
  const lab = createPulseLab();
  t.after(() => lab.dispose());
  const { url } = await lab.options.open({ instanceId: "http" });
  // The host may embed the initial document cross-site; mutations must not be.
  const page = await fetch(url, { headers: { "Sec-Fetch-Site": "cross-site" } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SIMULATION ONLY/);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  for (const asset of ["app.js", "style.css"]) {
    assert.equal((await fetch(`${url}${asset}`)).status, 200);
  }
  assert.equal((await fetch(new URL("/", url))).status, 404);
  assert.equal((await fetch(`${url}package.json`)).status, 404);
  assert.equal((await fetch(`${url}action`)).status, 404);
  const post = (body, headers = { "Content-Type": "application/json" }) =>
    fetch(`${url}action`, { method: "POST", headers, body });
  assert.equal((await post("{}",
    { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await post("{}", { "Content-Type": "text/plain" })).status, 415);
  for (const body of ["{", "null", "{}", '{"action":"unknown"}',
    '{"action":"set_scenario","input":{"scenario":"__proto__"}}']) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post(" ".repeat(1100))).status, 413);
  const state = await (await post('{"action":"get_state"}')).json();
  assert.equal(state.attempts, 0);
  assert.equal(state.scenario, "steady");
});

test("canvas-to-chat sends only an explicit, instance-scoped synthetic snapshot", async (t) => {
  const messages = [];
  const lab = createPulseLab({
    sendMessage: async (message) => { messages.push(message); return "message-id"; },
  });
  t.after(() => lab.dispose());
  const { url } = await lab.options.open({ instanceId: "chat-one" });
  await lab.options.open({ instanceId: "chat-two" });
  const agent = (name, instanceId = "chat-one", input) =>
    lab.options.actions.find((action) => action.name === name).handler({ instanceId, input });
  await fetch(`${url}action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"action":"take_reading"}',
  });
  await agent("set_scenario", "chat-two", { scenario: "elevated" });
  await agent("take_reading", "chat-two");
  assert.deepEqual(messages, []);

  const ask = () => fetch(`${url}chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const before = await agent("get_state");
  const sent = await ask();
  assert.equal(sent.status, 202);
  assert.match((await sent.json()).message, /Switch to chat/);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].mode, "enqueue");
  assert.match(messages[0].prompt, /canvas instance "chat-one"/);
  assert.match(messages[0].prompt, /Do not diagnose, give medical advice, modify files, or change canvas state/);
  const snapshot = (message) => JSON.parse(message.prompt.split("\n\n")[1]);
  assert.deepEqual(snapshot(messages[0]), before);
  assert.equal(snapshot(messages[0]).history[0].source, "human");
  assert.deepEqual(await agent("get_state"), before);

  await agent("set_scenario", "chat-one", { scenario: "motion" });
  await agent("take_reading");
  assert.equal(messages.length, 1);
  assert.equal((await ask()).status, 202);
  assert.match(snapshot(messages[1]).history[0].error, /motion artifact/);
  assert.equal(snapshot(messages[1]).history[0].values, null);
  await agent("reset");
  assert.equal((await ask()).status, 202);
  assert.deepEqual(snapshot(messages[2]).history, []);
  assert.equal(snapshot(messages[2]).attempts, 0);
  assert.equal((await agent("get_state", "chat-two")).scenario, "elevated");
});

test("canvas-to-chat rejects malformed and cross-site requests without sending", async (t) => {
  let sends = 0;
  const lab = createPulseLab({ sendMessage: async () => { sends += 1; } });
  t.after(() => lab.dispose());
  const { url } = await lab.options.open({ instanceId: "chat-http" });
  const post = (body, headers = { "Content-Type": "application/json" }) =>
    fetch(`${url}chat`, { method: "POST", headers, body });
  assert.equal((await fetch(`${url}chat`)).status, 404);
  assert.equal((await fetch(new URL("/chat", url), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  })).status, 404);
  assert.equal((await post("{}",
    { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await post("{}", { "Content-Type": "text/plain" })).status, 415);
  for (const body of ["{", "null", "[]", "1", '""', '{"prompt":"custom"}',
    '{"state":{"scenario":"elevated"}}', '{"__proto__":{}}']) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post(" ".repeat(1100))).status, 413);
  assert.equal(sends, 0);

  const offline = createPulseLab();
  t.after(() => offline.dispose());
  const { url: offlineUrl } = await offline.options.open({ instanceId: "offline" });
  const unavailable = await fetch(`${offlineUrl}chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /Copilot chat is unavailable/);
});

test("canvas-to-chat handles pending sends, failures, and explicit retries", { timeout: 10000 }, async (t) => {
  const started = Promise.withResolvers();
  const delivery = Promise.withResolvers();
  let sends = 0;
  const lab = createPulseLab({
    sendMessage: async () => {
      sends += 1;
      if (sends === 1) {
        started.resolve();
        return delivery.promise;
      }
      return "message-id";
    },
  });
  t.after(() => lab.dispose());
  const { url } = await lab.options.open({ instanceId: "chat-pending" });
  const ask = () => fetch(`${url}chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const first = ask();
  await started.promise;
  assert.equal((await ask()).status, 409);
  assert.equal(sends, 1);
  delivery.reject(new Error("Internal session failure details"));
  const failed = await first;
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).error, "Could not confirm delivery to Copilot chat.");
  assert.equal((await ask()).status, 202);
  assert.equal(sends, 2);
});
