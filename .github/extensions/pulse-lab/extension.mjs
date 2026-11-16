import { createCanvas, joinSession } from "@github/copilot-sdk/extension";
import { createPulseLab } from "./canvas.mjs";

let session;
const lab = createPulseLab({
  sendMessage: (message) => {
    if (!session) throw new Error("Copilot session is not ready.");
    return session.send(message);
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void lab.dispose().finally(() => process.exit(0));
  });
}
try {
  session = await joinSession({ canvases: [createCanvas(lab.options)] });
} catch (error) {
  await lab.dispose();
  throw error;
}
