#!/usr/bin/env node
/**
 * mcp-server.js — Model Context Protocol server for Keramitra.
 * Run with: npm run mcp        (stdio transport; point any MCP client at it)
 *
 * WHY THIS IS A BRIDGE AND NOT A HEADLESS CLONE
 *
 * The obvious way to expose these tools over MCP is to run the application logic
 * in Node and answer calls directly. That would be a mistake here, because the
 * one thing this project claims is that a report cannot be finalized without a
 * human clicking Approve in a browser. A headless server has no browser and no
 * human, so it would have to fake the approval — and the claim would be worth
 * nothing.
 *
 * So this server owns no application logic at all. It relays calls to a live
 * browser tab over loopback HTTP and returns whatever that tab's tools return.
 * The agent is remote, the clinician is at the screen, and the gate between them
 * is the same one the UI enforces. An agent driving this server can do every
 * benign thing and still cannot finalize a report until a person clicks.
 *
 *   MCP client ──stdio JSON-RPC──► this server ──HTTP──► browser tab
 *                                                          │
 *                                              window.keramitraTools
 *                                                          │
 *                                            the real gate, the real DOM
 *
 * The tool list is not fixed. It is whatever the page's view-scoped WebMCP
 * surface currently is, so `tools/list` changes as the clinician navigates, and
 * the server emits notifications/tools/list_changed when it does. Most MCP
 * servers publish one static list; this one cannot, because the page's own
 * surface is a function of its state.
 *
 * Zero dependencies: JSON-RPC over stdio is newline-delimited JSON, and the
 * relay is Node's own http module. Nothing is installed to run this.
 */

import { createServer } from 'node:http';
import { createInterface } from 'node:readline';

const RELAY_PORT = Number(process.env.KERAMITRA_BRIDGE_PORT ?? 8787);
const RELAY_HOST = '127.0.0.1';          // loopback only; never exposed off-machine
const CALL_TIMEOUT_MS = 60_000;
const POLL_HOLD_MS = 25_000;

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'keramitra-webmcp-bridge', version: '1.0.0' };

// ── Bridge state ──────────────────────────────────────────────────────────────
let attachedSession = null;      // id of the browser tab currently bridged
let lastSeenAt = 0;
let liveSurface = [];            // the page's current WebMCP tool surface
const pendingCalls = [];         // queued for the page to pick up
const inflight = new Map();      // callId -> { resolve, reject, timer }
const waitingPollers = [];       // held long-poll responses
let callSeq = 0;
let clientInitialized = false;

const log = (...a) => console.error('[keramitra-mcp]', ...a);   // stdout is protocol-only

function sessionIsLive() {
  return Boolean(attachedSession) && Date.now() - lastSeenAt < 90_000;
}

/** Hand a queued call to a waiting poller, if both exist. */
function drainPollers() {
  while (waitingPollers.length > 0 && pendingCalls.length > 0) {
    const res = waitingPollers.shift();
    clearTimeout(res.__holdTimer);
    sendJson(res, 200, { call: pendingCalls.shift() });
  }
}

function dispatchToPage(name, args) {
  return new Promise((resolve, reject) => {
    if (!sessionIsLive()) {
      reject(new Error(
        'No Keramitra browser session is attached. Start the app with `npm run dev` and open ' +
        `http://localhost:5173/?bridge=1 so the page can attach to this bridge on port ${RELAY_PORT}.`
      ));
      return;
    }
    const id = `call_${(callSeq += 1)}`;
    const timer = setTimeout(() => {
      inflight.delete(id);
      reject(new Error(`Tool '${name}' timed out after ${CALL_TIMEOUT_MS / 1000}s waiting for the browser tab.`));
    }, CALL_TIMEOUT_MS);
    inflight.set(id, { resolve, reject, timer });
    pendingCalls.push({ id, name, args });
    drainPollers();
  });
}

// ── HTTP relay (browser side) ─────────────────────────────────────────────────
function sendJson(res, status, body) {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

const relay = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${RELAY_HOST}`);

  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  try {
    // Page announces itself and publishes its current tool surface.
    if (req.method === 'POST' && url.pathname === '/bridge/hello') {
      const body = await readBody(req);
      attachedSession = body.session ?? `session_${Date.now()}`;
      lastSeenAt = Date.now();
      liveSurface = Array.isArray(body.tools) ? body.tools : [];
      log(`browser attached (${attachedSession}) — surface: ${liveSurface.length} tools`);
      notifyToolsChanged();
      sendJson(res, 200, { ok: true, session: attachedSession, bridge: SERVER_INFO });
      return;
    }

    // Page publishes a new surface after any state transition.
    if (req.method === 'POST' && url.pathname === '/bridge/surface') {
      const body = await readBody(req);
      lastSeenAt = Date.now();
      const next = Array.isArray(body.tools) ? body.tools : [];
      const changed = next.map((t) => t.name).join(',') !== liveSurface.map((t) => t.name).join(',');
      liveSurface = next;
      if (changed) {
        log(`surface changed — ${liveSurface.length} tools: ${liveSurface.map((t) => t.name).join(', ')}`);
        notifyToolsChanged();
      }
      sendJson(res, 200, { ok: true, changed });
      return;
    }

    // Page long-polls for work.
    if (req.method === 'GET' && url.pathname === '/bridge/poll') {
      lastSeenAt = Date.now();
      if (pendingCalls.length > 0) { sendJson(res, 200, { call: pendingCalls.shift() }); return; }
      res.__holdTimer = setTimeout(() => {
        const i = waitingPollers.indexOf(res);
        if (i !== -1) waitingPollers.splice(i, 1);
        sendJson(res, 200, { call: null });
      }, POLL_HOLD_MS);
      waitingPollers.push(res);
      return;
    }

    // Page returns a result.
    if (req.method === 'POST' && url.pathname === '/bridge/result') {
      const body = await readBody(req);
      lastSeenAt = Date.now();
      const entry = inflight.get(body.id);
      if (entry) {
        clearTimeout(entry.timer);
        inflight.delete(body.id);
        if (body.ok) entry.resolve(body.result);
        else entry.reject(new Error(body.error ?? 'Tool call failed in the browser tab.'));
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/bridge/status') {
      sendJson(res, 200, {
        attached: sessionIsLive(),
        session: attachedSession,
        surface: liveSurface.map((t) => t.name),
        queued: pendingCalls.length,
        inflight: inflight.size,
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

// ── MCP: JSON-RPC 2.0 over stdio ──────────────────────────────────────────────
function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
function respond(id, result) { write({ jsonrpc: '2.0', id, result }); }
function respondError(id, code, message, data) {
  write({ jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } });
}
function notify(method, params) {
  if (!clientInitialized) return;
  write(params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params });
}
function notifyToolsChanged() { notify('notifications/tools/list_changed'); }

/** Map the page's live WebMCP surface onto MCP tool descriptors. */
function mcpTools() {
  return liveSurface.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {}, additionalProperties: false },
  }));
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      const version = SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0];
      respond(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: true } },
        serverInfo: SERVER_INFO,
        instructions:
          'Keramitra is a synthetic corneal-topography screener. This server relays tool calls to a live ' +
          'browser tab; the tool list mirrors that tab\'s current view and changes as it navigates. ' +
          'finalize_report is deliberately unreachable until a human clinician clicks Approve in the ' +
          'browser UI — no tool call can mint an approval token. Synthetic demonstration data only.',
      });
      return;
    }

    case 'ping':
      respond(id, {});
      return;

    case 'tools/list': {
      if (!sessionIsLive()) {
        // Honest empty surface rather than a fixed list the page might not honour.
        respond(id, { tools: [] });
        return;
      }
      respond(id, { tools: mcpTools() });
      return;
    }

    case 'tools/call': {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (!name) { respondError(id, -32602, 'tools/call requires a tool name.'); return; }
      try {
        const result = await dispatchToPage(name, args);
        respond(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (err) {
        // Tool-level failures are reported as results with isError, per the MCP spec,
        // so the model can read the guard's structured error and adapt.
        respond(id, {
          content: [{ type: 'text', text: err.message }],
          isError: true,
        });
      }
      return;
    }

    default:
      respondError(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try { msg = JSON.parse(text); } catch { respondError(null, -32700, 'Parse error'); return; }

  if (msg.method === 'notifications/initialized') { clientInitialized = true; return; }
  if (msg.id === undefined) return;                       // any other notification
  try { await handleRequest(msg); }
  catch (err) { respondError(msg.id, -32603, `Internal error: ${err.message}`); }
});

relay.listen(RELAY_PORT, RELAY_HOST, () => {
  log(`bridge relay listening on http://${RELAY_HOST}:${RELAY_PORT}`);
  log(`waiting for a browser tab — open http://localhost:5173/?bridge=1`);
  log('MCP stdio transport ready.');
});

function shutdown() { try { relay.close(); } catch { /* already closed */ } process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
rl.on('close', shutdown);
