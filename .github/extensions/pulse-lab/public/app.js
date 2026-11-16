const element = (id) => document.getElementById(id);
const controls = [element("scenario"), element("measure"), element("reset")];
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

async function act(action, input = {}) {
  busy = true;
  updateControls();
  element("error").textContent = "";
  try {
    const response = await fetch("./action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, input }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Host rejected the action (${response.status}).`);
    // SSE is authoritative, so an older HTTP response cannot overwrite a newer agent action.
  } catch (error) {
    element("error").textContent = `${error.message} Check the connection before retrying.`;
    if (currentState) render(currentState);
  } finally {
    busy = false;
    updateControls();
  }
}

element("scenario").addEventListener("change", (event) => {
  void act("set_scenario", { scenario: event.target.value });
});
element("measure").addEventListener("click", () => { void act("take_reading"); });
element("reset").addEventListener("click", () => { void act("reset"); });

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
