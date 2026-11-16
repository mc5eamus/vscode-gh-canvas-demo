const scenarios = {
  steady: { systolic: 118, diastolic: 76, pulse: 68 },
  elevated: { systolic: 146, diastolic: 92, pulse: 84 },
  motion: null,
};

export function createSimulation() {
  let state = freshState();

  function freshState() {
    return {
      simulationOnly: true,
      scenario: "steady",
      attempts: 0,
      history: [],
      lastAction: "Ready for a synthetic reading.",
    };
  }

  return function dispatch(action, input = {}, source = "agent") {
    switch (action) {
      case "get_state":
        break;
      case "set_scenario":
        if (!input || typeof input.scenario !== "string" || !Object.hasOwn(scenarios, input.scenario)) {
          throw new Error("Choose steady, elevated, or motion.");
        }
        state.scenario = input.scenario;
        state.lastAction = `${source} selected ${state.scenario}.`;
        break;
      case "take_reading": {
        state.attempts += 1;
        const reading = {
          id: state.attempts,
          time: new Date().toISOString(),
          scenario: state.scenario,
          source,
          values: scenarios[state.scenario],
          error: state.scenario === "motion" ? "Simulated motion artifact — no reading." : null,
        };
        state.history = [reading, ...state.history].slice(0, 10);
        state.lastAction = `${source} simulated attempt ${reading.id}.`;
        break;
      }
      case "reset":
        state = freshState();
        state.lastAction = `${source} reset the simulation.`;
        break;
      default:
        throw new Error("Unknown simulation action.");
    }
    return structuredClone(state);
  };
}
