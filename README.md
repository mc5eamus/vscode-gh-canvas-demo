# Copilot Canvas demo: Pulse Lab

A fictional blood-pressure device operated by **you and Copilot on the same
canvas** in **Visual Studio Code** (not Visual Studio). All readings are synthetic.
This is not a medical device, diagnostic tool, or source of medical advice. Do not
enter patient data or connect real hardware.

## Demo ideas

| Idea | Human interaction | Agent interaction |
| --- | --- | --- |
| **Pulse Lab — implemented here** | Choose a scenario, simulate a reading, reset | Change the scenario, take readings, inspect shared history |
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

Both entry points use the same host-owned state; changing browser-only controls
is not sufficient to demonstrate agent collaboration. State is in memory, scoped
to the open canvas instance, with a bounded recent history. A newly opened
instance or restarted host starts fresh. This demo does not export patient files.

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
```

The pinned SDK is a **development dependency** for checking the real
`createCanvas` declaration; the running Copilot host supplies its own compatible
SDK. Tests use Node's built-in runner—no additional test framework or linter.
They exercise synthetic scenarios, invalid inputs, bounded history, instance
isolation/cleanup, SDK metadata, HTTP protections, and live SSE updates shared
between browser requests and agent-action handlers. They do **not** substitute
for validating canvas discovery or a remote connection in VS Code.

| File in the extension | Responsibility |
| --- | --- |
| `extension.mjs` | Register with `joinSession({ canvases: [createCanvas(...)] })` |
| `canvas.mjs` | Per-instance loopback server, lifecycle, actions, and live state stream |
| `simulation.mjs` | Shared deterministic simulation and ten-attempt history |
| `public/` | Accessible controls and rendering; relative URLs support the remote proxy |
| `test/canvas.test.mjs` | Built-in Node unit/integration checks |

Agent actions are `get_state`, `set_scenario` (input `scenario`: `steady`,
`elevated`, or `motion`), `take_reading`, and `reset`. The initial canvas needs no
input. Both humans and agents call the same dispatcher. Each instance has its
own unguessable URL, localhost-only listener, no CORS access, bounded request
bodies, and restrictive content security policy. No free-form HTML is rendered.
No hooks, sensitive environment variables, or automatic agent prompts are used.

### References

- [VS Code canvases](https://code.visualstudio.com/docs/agents/run/canvases)
- [Canvas structure and repository/user scope](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions)
- [Sample canvas extensions](https://github.com/github/awesome-copilot/tree/main/extensions)
- [SDK extension discovery and automatic module resolution](https://github.com/github/copilot-sdk/blob/main/nodejs/docs/extensions.md)
- [Agent plugin packaging](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)