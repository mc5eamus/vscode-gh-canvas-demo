const element = (id) => document.getElementById(id);
const controls = [element("scenario"), element("measure"), element("reset"), element("ask-copilot")];
let connected = false;
let busy = false;
let currentState;

function updateControls() {
  for (const control of controls) control.disabled = !connected || busy;
}

function render(state) {
  currentState = state;
  element("scenario").value = state.scenario;
  element("last-action").textContent = state.lastAction;
  element("count").textContent = `${state.attempts} attempts`;
  const latest = state.history[0];
  element("pressure").textContent = latest?.values
    ? `${latest.values.systolic} / ${latest.values.diastolic}` : "— / —";
  element("pulse").textContent = latest?.values?.pulse ?? "—";
  element("result").textContent = latest
    ? latest.error ?? `Fixed synthetic ${latest.scenario} sample. Not a clinical finding.`
    : "No readings yet. Choose a scenario to begin.";
  element("history").replaceChildren(...state.history.map((reading) => {
    const row = document.createElement("tr");
    const values = reading.values;
    for (const text of [
      `#${reading.id}`, reading.scenario,
      values ? `${values.systolic}/${values.diastolic} mmHg · ${values.pulse} bpm` : reading.error,
      reading.source,
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    return row;
  }));
}

async function request(route, body) {
  if (!connected || busy) return;
  busy = true;
  updateControls();
  element("error").textContent = "";
  const isChat = route === "chat";
  if (isChat) element("chat-status").textContent = "Sending to Copilot chat…";
  try {
    const response = await fetch(`./${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error ?? `Host rejected the request (${response.status}).`);
    }
    if (isChat) element("chat-status").textContent = (await response.json()).message;
    // SSE is authoritative, so an older HTTP response cannot overwrite a newer agent action.
  } catch (error) {
    if (isChat) element("chat-status").textContent = "";
    element("error").textContent = `${error.message} ${isChat
      ? "Check Copilot chat before retrying to avoid duplicate messages."
      : "Check the connection before retrying."}`;
    if (currentState) render(currentState);
  } finally {
    busy = false;
    updateControls();
  }
}

const act = (action, input = {}) => request("action", { action, input });
element("scenario").addEventListener("change", (event) => {
  void act("set_scenario", { scenario: event.target.value });
});
element("measure").addEventListener("click", () => { void act("take_reading"); });
element("reset").addEventListener("click", () => { void act("reset"); });
element("ask-copilot").addEventListener("click", () => { void request("chat", {}); });

const events = new EventSource("./events");
events.addEventListener("state", (event) => {
  render(JSON.parse(event.data));
  connected = true;
  element("connection").textContent = "Connected · shared host state";
  updateControls();
});
events.onerror = () => {
  connected = false;
  element("connection").textContent = "Disconnected · showing last known state; reconnecting…";
  updateControls();
};
window.addEventListener("pagehide", () => events.close());
