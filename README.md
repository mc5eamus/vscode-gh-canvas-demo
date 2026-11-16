# Copilot Canvas demo: Pulse Lab

A fictional blood-pressure device operated by **you and Copilot on the same
canvas** in **Visual Studio Code** (not Visual Studio). All readings are synthetic.
This is not a medical device, diagnostic tool, or source of medical advice. Do not
enter patient data or connect real hardware.

## Demo ideas

| Idea | Human interaction | Agent interaction |
| --- | --- | --- |
| **Pulse Lab — implemented here** | Choose a scenario, simulate a reading, reset, ask Copilot from the canvas | Change the scenario, take readings, inspect shared history, summarize a canvas snapshot in chat |
| **[Local sandbox probe — implemented here](#demonstrate-local-agent-sandboxing)** | Prepare a disposable outside-workspace folder and compare artifacts | Run the same file-writing task under the local terminal sandbox; workspace write succeeds, outside write is blocked |
| Fictional pulse-oximeter bench | Adjust a simulated signal-quality control | Compare synthetic traces and explain UI changes |
| Equipment readiness board | Move fictional devices between inspection stages | Update checklists and summarize remaining demo tasks |

Pulse Lab is a repository-scoped canvas extension under
`.github/extensions/pulse-lab`. It uses the host-provided Copilot SDK, Node built-ins,
and plain HTML/CSS/JavaScript. There is no build step, external service, credential,
or hardware access.

## Prerequisites

- Desktop VS Code with the [Canvases feature](https://code.visualstudio.com/docs/agents/run/canvases)
  available, signed in to GitHub Copilot.
- Enable `chat.canvases.enabled` in Settings, then start a **new Copilot harness**
  session and send a first message to initialize it. The setting does not retrofit
  existing sessions.
- Canvases require an agent session. They are not supported in Claude, Codex,
  Local harness sessions, or browser clients such as `vscode.dev`.
- Node.js 22.12+ and npm are needed for development checks below; the Copilot
  host loads the extension and supplies its SDK via its module resolver.
  Running the canvas does not require `npm install`.

## Run the included canvas locally

1. Open this repository in desktop VS Code and initialize a new Copilot harness
   session as above.
2. Ask: **“List available canvases and open Pulse Lab.”** Review any trust prompts
   before approving. Inspect the source first: canvas extensions execute code.
3. Alternatively, use **Add Context (+) > Canvas…**, or **Add Tab (+) > Canvas**
   in the Agents window. The canvas requires no input.
4. In **Chat: Open Customizations > Canvases**, inspect the workspace extension's
   source if it is not apparent which copy was loaded.

### Five-minute presentation

1. Point out the **simulation-only** notice and empty history.
2. Choose **Steady** and select **Simulate reading**. A synthetic reading appears.
3. Ask the agent:

   ```text
   Inspect Pulse Lab's current state and report the last synthetic reading.
   Do not interpret it as a medical finding.
   ```

   The answer should match the row you just created in the UI.
4. Ask:

   ```text
   In Pulse Lab, select the elevated scenario and simulate a reading.
   ```

   The selection, latest reading, and history should update in the open canvas.
5. Select **Motion artifact**, then **Simulate reading**. The attempt should show
   a simulated error, not a valid reading. Ask the agent to inspect that result.
6. Ask the agent to reset the demo. The canvas should return to Steady with no
   history. Also try Reset in the UI, then have the agent confirm the empty state.
7. Select **Ask Copilot to summarize** in the canvas, then switch to chat. A new
   request and Copilot's summary should appear without typing a chat message.
   The empty history should be reported as no readings, not an invented result.

Both entry points use the same host-owned state; changing browser-only controls
is not sufficient to demonstrate agent collaboration. State is in memory, scoped
to the open canvas instance, with a bounded recent history. A newly opened
instance or restarted host starts fresh. This demo does not export patient files.

### Scenario 1: control the canvas from Copilot chat

With Pulse Lab open, send this in the **same Copilot session**:

```text
In Pulse Lab, select the elevated scenario and simulate a reading.
Then inspect the state. Describe only the synthetic result, not a medical finding.
```

Copilot uses `set_scenario`, `take_reading`, and `get_state`. The open canvas
should select Elevated, show **146 / 92 mmHg** and **84 bpm**, and add a history
row marked **agent**, without a refresh. Ask **“Reset Pulse Lab”** and verify
Steady, zero attempts, and an empty history. These are real shared-state actions,
not instructions for the user to click the controls.

### Scenario 2: control Copilot chat from the canvas

1. In the canvas, choose **Motion artifact** and select **Simulate reading**.
2. Select **Ask Copilot to summarize** in the **Copilot chat ↔ canvas** panel.
   This explicitly sends a fixed summary request plus this instance's synthetic
   snapshot to its joined Copilot session; no chat typing or copy/paste is needed.
3. Wait for **Sent to Copilot chat**, then switch to chat. Copilot should report
   the scenario, attempt count, and simulated motion error—not invent a reading
   or offer medical advice. The request asks for a summary, not state changes.
4. Reset the canvas and press the button again to demonstrate the no-readings
   case. You can also try Steady or Elevated for a fixed synthetic result.

The button uses `session.send({ prompt, mode: "enqueue" })`: a busy chat queues the
request rather than being interrupted. “Sent” confirms submission, not completion
of Copilot's response. The snapshot is captured by the host when it receives the
button request; later canvas changes do not alter that message. With multiple
instances open, the message identifies its source instance.

Opening the canvas, changing controls, receiving live updates, and invoking
agent actions never send chat messages automatically. There is no free-form
prompt or patient-data input. While submitting, controls are disabled to prevent
double-clicks. If delivery fails or times out, check chat before retrying: a
message may already have arrived. Reopen Pulse Lab in a supported Copilot
session if chat is unavailable.

## Demonstrate local agent sandboxing

**Scenario:** an agent generates a synthetic artifact in the workspace, then tries
to write a second copy outside it. Without isolation, both writes succeed. With
the outside directory configured read-only, only the workspace write succeeds.
This is a separate terminal demo, not a canvas or simulated permission toggle.
VS Code enforces the sandbox; `demos/local-sandbox.mjs` only measures file writes.
It never reads personal files, overwrites existing files, launches commands, or
uses the network. Every run uses new artifact names.

### Prerequisites and safe setup

- Use a local **Copilot harness** session with its default terminal tool, Node.js
  22.12+, and a VS Code build supporting
  [agent sandboxing](https://code.visualstudio.com/docs/agents/run/agent-sandboxing).
  The similarly named **Local harness** has different sandbox controls.
- This walkthrough uses a POSIX shell on macOS 15+ or supported glibc Linux/WSL2.
  Linux requires `bubblewrap`, `slirp4netns`, util-linux, compatible `iptables`,
  and permission to create the required namespaces. See the linked prerequisites;
  WSL1 and Alpine/musl are unsupported by this VS Code sandbox runtime.
- Use a disposable checkout, not a sensitive workspace. Do not relax an
  organization policy to run this demo. Ordinary terminal approval is not
  sandboxing, and an agent refusing a command is not proof of OS isolation.

In a **human-operated, ordinary terminal** at the repository root, prepare a
fresh fixture and run the unisolated control:

```bash
repo="$(pwd -P)"
outside="$(mktemp -d "$HOME/copilot-sandbox-demo.XXXXXX")"
outside="$(cd "$outside" && pwd -P)"
printf 'Workspace: %s\nOutside fixture: %s\n' "$repo" "$outside"
node "$repo/demos/local-sandbox.mjs" "$outside" unisolated
ls -la "$outside"
```

Keep this terminal open for verification and cleanup. The fixture must be
outside the checkout, not its parent. Do not use a real configuration directory
or `/tmp` as the presentation target: temporary paths can have special grants.
Expect `workspace.status: "written"`, `outside.status: "written"`, and
`passed: true`. The printed paths contain only the fixed synthetic text.

### Run the same task with isolation

1. Save your current sandbox settings, then configure the following on the
   **local execution host**. Replace the placeholder with the exact absolute
   fixture path printed above; shell variables such as `$outside` do not expand
   in settings JSON. Preserve existing path restrictions when merging settings.

   ```json
   {
     "chat.agent.sandbox.enabled": "on",
     "chat.agent.sandbox.allowUnsandboxedCommands": false,
     "chat.agent.sandbox.network.allowNetwork": false,
     "chat.agent.sandbox.fileSystem.userConfiguredPaths": {
       "readwritePaths": [],
       "readonlyPaths": ["/absolute/path/to/copilot-sandbox-demo.XXXXXX"],
       "deniedPaths": []
     }
   }
   ```

2. Start a **new Copilot harness session** in this checkout. Run `/sandbox policy`
   and verify sandboxing is active, the workspace is writable, and the fixture
   is read-only. The explicit read-only rule avoids relying on default
   outside-workspace restrictions. Do not use a denied/unreadable fixture: the
   probe must be able to validate that it exists before attempting the write.
3. Ask the agent, substituting both absolute paths:

   ```text
   Demonstrate the local sandbox using only our disposable fixture.
   Use the default terminal tool, with /absolute/path/to/checkout as the working
   directory, to run:
   node "/absolute/path/to/checkout/demos/local-sandbox.mjs" "/absolute/path/to/copilot-sandbox-demo.XXXXXX" isolated
   Report the two write statuses, the OS error code, and passed.
   Do not modify the probe, change permissions, use another tool to write the
   files, or retry outside the sandbox. A blocked outside write is expected.
   ```

4. Expect a new workspace artifact, `outside.status: "blocked"`, an error such
   as `EACCES`, `EPERM`, or `EROFS`, and `passed: true`. In your original ordinary
   terminal, inspect the printed workspace artifact and run `ls -la "$outside"`
   again: the unisolated artifact remains, but the isolated attempt added none.

| Run | Workspace write | Outside write | Result |
| --- | --- | --- | --- |
| Ordinary terminal, `unisolated` | Written | Written | Pass |
| Sandboxed agent terminal, `isolated` | Written | Blocked | Pass |
| Sandbox missing or misconfigured, `isolated` | Written | Written | **Fail**, exit 1 |

The last argument asserts the expected outcome; it does not enable or disable
isolation. The actual write is always attempted. Missing paths, invalid setup,
and non-permission errors fail rather than masquerading as a successful block.
If Node cannot start, the workspace write fails, or the agent never runs the
command, that is not a successful demonstration. Check prerequisites and
`/sandbox policy`; do not approve an unsandboxed fallback.

The comparison proves a file-write restriction for this terminal process and
its children, not isolation of every agent tool, all home-directory reads, or
network traffic. Network is disabled in the example policy, but is not probed.
Do not run an untrusted payload as the unisolated control.

### Cleanup and checks

After the demo, remove only its artifacts from the original ordinary terminal:

```bash
rm -f -- "$outside"/sandbox-probe-*.txt "$repo"/.sandbox-demo-*/artifact.txt
rmdir -- "$outside" "$repo"/.sandbox-demo-*/
```

`rmdir` refuses to remove nonempty directories; inspect unexpected contents
instead of using recursive deletion. Restore your previous sandbox settings,
remove the fixture-specific rule, and close the demo session. Workspace output
directories are gitignored; no fixture or sandbox policy is committed.

Run the focused checks without installing dependencies:

```bash
node --check "$repo/demos/local-sandbox.mjs"
node --test "$repo/demos/local-sandbox.test.mjs"
```

These tests cover the unisolated task, repeatability, invalid fixtures, and
denial handling using Node's permission model. That model is **not** a substitute
for the OS sandbox; perform the VS Code walkthrough on the presentation machine.

## Demonstrate canvas creation

Use a separate scratch workspace to avoid overwriting the included extension.
If `/create-canvas` is available in your session, send:

```text
/create-canvas Create a repository-scoped fictional pulse-oximeter bench.
Use only fixed synthetic data, no patient input, networking, or hardware access.
Show a permanent simulation-only notice. Let the human and agent select a
signal-quality scenario, generate a simulated sample, inspect shared history,
and reset. Expose agent-callable actions for these controls and open the canvas.
```

Inspect the generated extension and demonstrate one UI action followed by an
agent inspection, then one agent action reflected in the UI. The generated
result can vary; the included Pulse Lab is the repeatable presentation path.
If the creation skill is missing, use the included extension and check your
client/harness support rather than substituting an ordinary browser page.

## Remote agent → connected VS Code canvas

The **host** runs the agent, extension, and simulation state. The **client** is
your desktop VS Code displaying the canvas. A GitHub cloud coding-agent task
does not automatically stream a canvas into an arbitrary editor: this walkthrough
requires a connected, supported **remote Agent Host**.

1. Make this repository available on the remote host. The extension must exist
   on that host, not just in the client's local checkout.
2. In desktop VS Code on the client, enable:

   ```json
   {
     "chat.canvases.enabled": true,
     "workbench.browser.enableRemoteProxy": true
   }
   ```

3. Open the **Agents window**, choose **New Session**, and use the **Environment**
   picker to connect via **SSH** to your host and select its repository folder.
   Alternatively, use an authenticated **Dev Tunnel** or a registered
   **GitHub Environment**. Keep the host awake and the connection running.
   See [remote agent sessions](https://code.visualstudio.com/docs/agents/run/remote-agent-sessions)
   for authentication and host setup. Never enable anonymous tunnel access.
4. Select the **Copilot** harness, send a first message, and ask the agent to
   report its OS and working directory without changing files. Verify these
   belong to the intended remote host and checkout.
5. Ask: **“List available canvases and open Pulse Lab from this remote
   workspace.”** Its canvas should appear in your connected desktop Agents
   window. VS Code's remote proxy carries the canvas connection; do not expose
   a public HTTP port or hardcode the client's `localhost`.
6. Repeat the local presentation: click **Simulate reading** in the client,
   ask the remote agent to inspect it, and have the remote agent change the
   scenario and simulate another reading. Check that the same canvas updates.
   Then select **Ask Copilot to summarize** and verify the reply appears in that
   remote session's chat, not a separate local session.
7. Close only the canvas tab, then reopen the **Running** canvas from the canvas
   menu to demonstrate returning to the same instance. A new instance is a fresh
   simulation, not persisted history.

This is different from merely opening a Remote SSH workspace or a browser preview.
Use the desktop Agents window with a connected Copilot Agent Host for this demo.

## Package and share

### Repository sharing

Share this repository at a reviewed commit or tag. Recipients open their copy
in VS Code and follow the local steps; `.github/extensions/pulse-lab` is the
team-shared extension. No registry publishing is required.

### Portable extension archive

From the repository root in a POSIX shell:

```bash
cd .github/extensions/pulse-lab
npm pack --dry-run
npm pack
```

Review the listed files before distributing `pulse-lab-1.0.0.tgz` from that
directory. The `files` allowlist includes the entry point, canvas server,
simulation module, and three UI assets (plus npm's package metadata). It excludes
tests, `node_modules`, and session state. The package is marked private to prevent
accidental registry publishing. This is a
source-extension archive, **not a VSIX** and not something to install from the
VS Code Extensions panel. Do not use `npm publish`.

The recipient reviews the archive, then extracts it into an **empty** personal
extension directory on the machine that runs the agent:

```bash
mkdir -p "$HOME/.copilot/extensions/pulse-lab"
# Stop if this directory already contains an installed version.
tar -tzf pulse-lab-1.0.0.tgz
tar -xzf pulse-lab-1.0.0.tgz \
  -C "$HOME/.copilot/extensions/pulse-lab" --strip-components=1
```

Start a fresh Copilot session and verify Pulse Lab under **Customizations >
Canvases**, then open it and repeat the two-way interaction check. Alternatively,
extract into `.github/extensions/pulse-lab` in another workspace for repository
scope. Avoid installing both workspace and user copies during a demo; otherwise
check the source group to ensure you open the intended version.

The archive contains code, not a running session or reading history. For remote
sessions, install it on the **remote host**. To remove a user copy, disable the
extension in Customizations and remove its installation folder after the session
ends; workspace extensions are managed by the repository.

## Troubleshooting and verification

| Symptom | Check |
| --- | --- |
| No canvas menu | Enable canvases, select Copilot, start a new session, send a message |
| Pulse Lab missing | Check the selected workspace/host, extension source folder, and extension load errors |
| Remote canvas fails to display | Use desktop Agents window, enable remote proxy, verify host connection and extension availability there |
| Only a browser page opens | That is not proof of canvas discovery or bidirectional agent interaction |
| Canvas cannot send to chat | Open it in a supported Copilot session; check chat before retrying a failed or timed-out send |
| “Sent” appears but no reply yet | Switch to the canvas's session chat; the request may be queued behind ongoing work |
| State appears to reset | Check whether a new canvas instance or host was started |
| Packaged copy differs | Check for duplicate user/workspace installs and compare the reviewed package version |

Before presenting, perform the full local and remote walkthroughs in your target
VS Code build. Feature availability and the extension API can change.

### Development checks

From the repository root:

```bash
npm --prefix .github/extensions/pulse-lab ci --ignore-scripts
npm --prefix .github/extensions/pulse-lab run check
npm --prefix .github/extensions/pulse-lab test
node --test "$(pwd -P)/demos/local-sandbox.test.mjs"
```

The pinned SDK is a **development dependency** for checking the real
`createCanvas` declaration; the running Copilot host supplies its own compatible
SDK. Tests use Node's built-in runner—no additional test framework or linter.
They exercise synthetic scenarios, invalid inputs, bounded history, instance
isolation/cleanup, SDK metadata, HTTP protections, and live SSE updates shared
between browser requests and agent-action handlers. Canvas-to-chat tests inject
a fake message sender to verify instance-scoped snapshots, explicit sends only,
request validation, unavailable chat, concurrent submissions, and send failures.
They do **not** substitute for validating real chat delivery, canvas discovery,
or a remote connection in VS Code.

| File in the extension | Responsibility |
| --- | --- |
| `extension.mjs` | Register the canvas with `joinSession` and forward explicit messages to that session |
| `canvas.mjs` | Per-instance loopback server, lifecycle, actions, live state stream, and fixed chat requests |
| `simulation.mjs` | Shared deterministic simulation and ten-attempt history |
| `public/` | Accessible controls and rendering; relative URLs support the remote proxy |
| `test/canvas.test.mjs` | Built-in Node unit/integration checks |

Agent actions are `get_state`, `set_scenario` (input `scenario`: `steady`,
`elevated`, or `motion`), `take_reading`, and `reset`. The initial canvas needs no
input. Both humans and agents call the same dispatcher. Each instance has its
own unguessable URL, localhost-only listener, no CORS access, bounded request
bodies, and restrictive content security policy. No free-form HTML is rendered.
The browser-only `POST chat` endpoint accepts an empty JSON object and constructs
the summary prompt from host-owned state; it is not an agent-callable action.
No hooks, sensitive environment variables, or automatic agent prompts are used.

### References

- [VS Code canvases](https://code.visualstudio.com/docs/agents/run/canvases)
- [Canvas structure and repository/user scope](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions)
- [Sample canvas extensions](https://github.com/github/awesome-copilot/tree/main/extensions)
- [SDK extension discovery and automatic module resolution](https://github.com/github/copilot-sdk/blob/main/nodejs/docs/extensions.md)
- [Agent plugin packaging](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)