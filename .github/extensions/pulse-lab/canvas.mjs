import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createSimulation } from "./simulation.mjs";

const assets = new Map([
  ["", ["index.html", "text/html; charset=utf-8"]],
  ["app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["style.css", ["style.css", "text/css; charset=utf-8"]],
]);
const actions = [
  ["get_state", "Inspect synthetic state and the last ten attempts; never diagnose.", {}],
  ["set_scenario", "Select a fictional device scenario, not a patient condition.", {
    scenario: { type: "string", enum: ["steady", "elevated", "motion"] },
  }],
  ["take_reading", "Generate one fixed synthetic reading or simulated motion error.", {}],
  ["reset", "Clear this instance's synthetic history and restore the steady scenario.", {}],
];

async function startInstance() {
  const dispatch = createSimulation();
  const clients = new Set();
  // An unguessable URL scopes browser access without exposing a public port.
  const prefix = `/${randomBytes(24).toString("hex")}/`;
  const send = (res, state) => res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  const invoke = (action, input, source) => {
    const state = dispatch(action, input, source);
    if (action !== "get_state") {
      for (const client of clients) send(client, state);
    }
    return state;
  };

  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
    const reply = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (!req.url?.startsWith(prefix)) return reply(404, { error: "Not found." });
    const route = req.url.slice(prefix.length);
    if (req.method !== "GET" && req.headers["sec-fetch-site"] === "cross-site") {
      return reply(403, { error: "Cross-site requests are not allowed." });
    }
    try {
      if (req.method === "GET" && assets.has(route)) {
        const [file, type] = assets.get(route);
        const content = await readFile(new URL(`public/${file}`, import.meta.url));
        res.writeHead(200, { "Content-Type": type });
        return res.end(content);
      }
      if (req.method === "GET" && route === "events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
        clients.add(res);
        send(res, dispatch("get_state"));
        res.on("close", () => clients.delete(res));
        return;
      }
      if (req.method === "POST" && route === "action") {
        if (req.headers["content-type"] !== "application/json") {
          return reply(415, { error: "Expected application/json." });
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 1024) return reply(413, { error: "Request too large." });
        }
        const { action, input } = JSON.parse(body);
        return reply(200, invoke(action, input, "human"));
      }
      reply(404, { error: "Not found." });
    } catch {
      if (!res.headersSent) reply(400, { error: "Invalid request or unavailable canvas asset." });
      else res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": heartbeat\n\n");
  }, 15000);
  heartbeat.unref();
  return {
    url: `http://127.0.0.1:${server.address().port}${prefix}`,
    invoke,
    close() {
      clearInterval(heartbeat);
      for (const client of clients) client.end();
      clients.clear();
      return new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    },
  };
}

export function createPulseLab() {
  const instances = new Map();
  const close = async (instanceId) => {
    const pending = instances.get(instanceId);
    instances.delete(instanceId);
    if (pending) await (await pending).close();
  };
  return {
    options: {
      id: "pulse-lab",
      displayName: "Pulse Lab",
      description: "Simulation-only blood-pressure bench with shared human/agent controls. No medical advice.",
      actions: actions.map(([name, description, properties]) => ({
        name,
        description,
        inputSchema: {
          type: "object",
          properties,
          required: Object.keys(properties),
          additionalProperties: false,
        },
        async handler({ instanceId, input }) {
          const instance = await instances.get(instanceId);
          if (!instance) throw new Error("Open Pulse Lab before invoking an action.");
          return instance.invoke(name, input, "agent");
        },
      })),
      async open({ instanceId }) {
        if (!instances.has(instanceId)) instances.set(instanceId, startInstance());
        let instance;
        try {
          instance = await instances.get(instanceId);
        } catch (error) {
          instances.delete(instanceId);
          throw error;
        }
        return { url: instance.url, title: "Pulse Lab · simulation only", status: "ready" };
      },
      onClose: ({ instanceId }) => close(instanceId),
    },
    dispose: () => Promise.all([...instances.keys()].map(close)),
  };
}
