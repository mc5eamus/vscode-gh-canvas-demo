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

test("browser actions and agent actions share state and stream live updates", { timeout: 10000 }, async (t) => {
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
