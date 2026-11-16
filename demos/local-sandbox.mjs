import { mkdtemp, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const artifact = "Synthetic sandbox demo artifact. No user data.\n";
const permissionErrors = new Set(["EACCES", "EPERM", "EROFS", "ERR_ACCESS_DENIED"]);

function contains(parent, child) {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export async function probe(workspaceDirectory, outsideDirectory, expected) {
  if (!["isolated", "unisolated"].includes(expected) || !isAbsolute(outsideDirectory)) {
    throw new Error("Usage: node demos/local-sandbox.mjs <absolute-fixture-directory> <isolated|unisolated>");
  }
  const workspace = await realpath(workspaceDirectory);
  const outside = await realpath(outsideDirectory);
  if (contains(workspace, outside) || contains(outside, workspace)) {
    throw new Error("The disposable fixture must be outside, and not contain, the workspace.");
  }
  if (!/^copilot-sandbox-demo\.[a-zA-Z0-9_-]+$/.test(basename(outside)) ||
      !(await stat(outside)).isDirectory()) {
    throw new Error("Use a disposable directory created with the copilot-sandbox-demo. prefix.");
  }

  const output = await mkdtemp(join(workspace, ".sandbox-demo-"));
  const workspacePath = join(output, "artifact.txt");
  const outsidePath = join(outside, `sandbox-probe-${basename(output)}.txt`);
  await writeFile(workspacePath, artifact, { flag: "wx", mode: 0o600 });
  const result = {
    expected,
    workspace: { path: workspacePath, status: "written" },
    outside: { path: outsidePath, status: "written" },
  };
  try {
    await writeFile(outsidePath, artifact, { flag: "wx", mode: 0o600 });
  } catch (error) {
    result.outside.status = permissionErrors.has(error.code) ? "blocked" : "error";
    result.outside.code = error.code ?? "UNKNOWN";
  }
  result.passed = result.outside.status === (expected === "isolated" ? "blocked" : "written");
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) {
      throw new Error("Usage: node demos/local-sandbox.mjs <absolute-fixture-directory> <isolated|unisolated>");
    }
    const workspace = fileURLToPath(new URL("..", import.meta.url));
    const result = await probe(workspace, process.argv[2], process.argv[3]);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    console.error(`${error.code ?? "ERROR"}: ${error.message}`);
    process.exitCode = 1;
  }
}
