/**
 * bridge.js — attaches this tab to the local MCP bridge server.
 *
 * OFF BY DEFAULT. It activates only when the page is opened with `?bridge=1`,
 * so an ordinary visitor to the deployed site never contacts anything. When it
 * is on, the local MCP server (src/mcp-server.js, `npm run mcp`) can relay an
 * agent's tool calls into this tab.
 *
 * The tab executes those calls through exactly the same entry point the in-page
 * WebMCP host uses — window.keramitraTools.invokeTool — so a bridged agent gets
 * the same dynamic surface, the same argument validation, the same audit trail,
 * and the same approval gate. It gains no privilege by arriving over HTTP: it
 * still cannot finalize a report until a human clicks Approve on this screen.
 *
 * The relay is loopback-only and the page is the client, so nothing here opens a
 * port or accepts an inbound connection.
 */

const DEFAULT_PORT = 8787;

function bridgeConfig() {
  // Absent in non-browser hosts (the Node test harness, SSR); the bridge is simply off.
  if (typeof window === 'undefined' || typeof window.location?.search !== 'string') return null;
  if (typeof fetch !== 'function') return null;
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('bridge');
  if (!flag || flag === '0' || flag === 'false') return null;
  const port = Number(params.get('bridgePort') ?? DEFAULT_PORT);
  return {
    base: `http://127.0.0.1:${Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT}`,
    session: `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

/**
 * @param {object} deps
 * @param {() => Array<object>} deps.listTools   current WebMCP surface
 * @param {(name: string, args: object) => Promise<any>} deps.invokeTool
 * @param {(status: object) => void} [deps.onStatus]
 */
export function connectBridge({ listTools, invokeTool, onStatus = () => {} }) {
  const config = bridgeConfig();
  if (!config) return { enabled: false };

  const state = { enabled: true, attached: false, calls: 0, lastError: null, session: config.session };
  let stopped = false;

  const report = () => onStatus({ ...state });

  async function post(path, body) {
    const res = await fetch(`${config.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Bridge ${path} responded ${res.status}`);
    return res.json();
  }

  /** Publish the current surface so the MCP tool list mirrors this view. */
  async function publishSurface() {
    if (stopped || !state.attached) return;
    try {
      await post('/bridge/surface', { session: config.session, tools: listTools() });
    } catch (err) {
      state.lastError = err.message;
      report();
    }
  }

  async function runOneCall(call) {
    let payload;
    try {
      const result = await invokeTool(call.name, call.args ?? {});
      payload = { id: call.id, ok: true, result };
    } catch (err) {
      // A guard rejection is a legitimate answer, not a transport failure.
      payload = { id: call.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    state.calls += 1;
    report();
    try { await post('/bridge/result', payload); } catch (err) { state.lastError = err.message; report(); }
    await publishSurface();
  }

  async function pollLoop() {
    while (!stopped) {
      try {
        const res = await fetch(`${config.base}/bridge/poll?session=${encodeURIComponent(config.session)}`);
        if (!res.ok) throw new Error(`poll responded ${res.status}`);
        const { call } = await res.json();
        if (!state.attached) { state.attached = true; state.lastError = null; report(); }
        if (call) await runOneCall(call);
      } catch (err) {
        if (state.attached || state.lastError === null) {
          state.attached = false;
          state.lastError = err.message;
          report();
        }
        await new Promise((r) => setTimeout(r, 2000));   // relay not up yet; retry
      }
    }
  }

  (async () => {
    try {
      await post('/bridge/hello', { session: config.session, tools: listTools() });
      state.attached = true;
      report();
    } catch (err) {
      state.lastError = err.message;
      report();
    }
    pollLoop();
  })();

  return {
    enabled: true,
    session: config.session,
    publishSurface,
    getStatus: () => ({ ...state }),
    stop: () => { stopped = true; },
  };
}
