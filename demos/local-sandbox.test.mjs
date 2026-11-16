import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { probe } from "./local-sandbox.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "sandbox-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const outside = join(root, "copilot-sandbox-demo.fixture");
  await mkdir(workspace);
  await mkdir(outside);
  return { root, workspace, outside };
}

test("unisolated writes are repeatable and leave existing files untouched", async (t) => {
  const { workspace, outside } = await fixture(t);
  const existing = join(outside, "keep.txt");
  await writeFile(existing, "leave this alone");
  const first = await probe(workspace, outside, "unisolated");
  const second = await probe(workspace, outside, "unisolated");
  assert.equal(first.passed, true);
  assert.equal(second.passed, true);
  assert.equal(first.workspace.status, "written");
  assert.equal(first.outside.status, "written");
  assert.notEqual(first.outside.path, second.outside.path);
  assert.equal(await readFile(first.workspace.path, "utf8"),
    "Synthetic sandbox demo artifact. No user data.\n");
  assert.equal(await readFile(first.outside.path, "utf8"),
    await readFile(first.workspace.path, "utf8"));
  assert.equal(await readFile(existing, "utf8"), "leave this alone");
});

test("an outside write is a failed isolation expectation, not a simulated block", async (t) => {
  const { workspace, outside } = await fixture(t);
  const result = await probe(workspace, outside, "isolated");
  assert.equal(result.outside.status, "written");
  assert.equal(result.passed, false);
});

test("runtime permission denial allows workspace work and reports the actual error", async (t) => {
  const { workspace, outside } = await fixture(t);
  // This checks error handling, not VS Code's OS sandbox implementation.
  for (const expected of ["isolated", "unisolated"]) {
    const child = spawnSync(process.execPath, [
      "--experimental-permission", "--allow-fs-read=*", `--allow-fs-write=${workspace}`,
      "--input-type=module", "--eval",
      `import { probe } from ${JSON.stringify(new URL("./local-sandbox.mjs", import.meta.url).href)};
       console.log(JSON.stringify(await probe(${JSON.stringify(workspace)},
         ${JSON.stringify(outside)}, ${JSON.stringify(expected)})));`,
    ], { encoding: "utf8", timeout: 10000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.workspace.status, "written");
    assert.equal(result.outside.status, "blocked");
    assert.equal(result.outside.code, "ERR_ACCESS_DENIED");
    assert.equal(result.passed, expected === "isolated");
    assert.match(await readFile(result.workspace.path, "utf8"), /Synthetic sandbox demo/);
    assert.deepEqual(await readdir(outside), []);
  }
});

test("bad arguments and missing fixtures fail before writing workspace artifacts", async (t) => {
  const { root, workspace, outside } = await fixture(t);
  await assert.rejects(probe(workspace, outside, "pretend"), /Usage/);
  await assert.rejects(probe(workspace, "relative-path", "isolated"), /Usage/);
  await assert.rejects(probe(workspace, join(root, "missing"), "isolated"), { code: "ENOENT" });
  const ordinaryDirectory = join(root, "ordinary-directory");
  await mkdir(ordinaryDirectory);
  await assert.rejects(probe(workspace, ordinaryDirectory, "isolated"), /disposable directory/);
  const file = join(root, "copilot-sandbox-demo.file");
  await writeFile(file, "not a directory");
  await assert.rejects(probe(workspace, file, "isolated"), /disposable directory/);
  assert.deepEqual(await readdir(workspace), []);
});

test("fixtures cannot overlap the workspace, including via a symlink", async (t) => {
  const { root, workspace } = await fixture(t);
  const nested = join(workspace, "copilot-sandbox-demo.nested");
  await mkdir(nested);
  for (const outside of [workspace, root, nested]) {
    await assert.rejects(probe(workspace, outside, "isolated"), /outside/);
  }
  const link = join(root, "copilot-sandbox-demo.link");
  await symlink(nested, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(probe(workspace, link, "isolated"), /outside/);
  assert.deepEqual(await readdir(workspace), ["copilot-sandbox-demo.nested"]);
});

test("CLI rejects missing arguments with a nonzero exit status", () => {
  const child = spawnSync(process.execPath, [
    fileURLToPath(new URL("./local-sandbox.mjs", import.meta.url)),
  ], { encoding: "utf8", timeout: 10000 });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Usage/);
});
