import { createCanvas, joinSession } from "@github/copilot-sdk/extension";
import { createPulseLab } from "./canvas.mjs";

const lab = createPulseLab();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void lab.dispose().finally(() => process.exit(0));
  });
}
try {
  await joinSession({ canvases: [createCanvas(lab.options)] });
} catch (error) {
  await lab.dispose();
  throw error;
}
