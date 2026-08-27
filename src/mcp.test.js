/**
 * mcp.test.js — Drives src/mcp-server.js as a real MCP client over stdio.
 * Run with: node src/mcp.test.js
 *
 * Spawns the server, speaks JSON-RPC 2.0 on its stdin/stdout, and attaches a
 * simulated browser tab to the loopback relay. The tab executes calls through the
 * genuine window.keramitraTools of a real src/main.js instance running under the
 * DOM harness, so a tool call arriving over MCP travels the same path a Chrome
 * WebMCP host would take, ending at the same approval gate.
 *
 * What this proves: the protocol handshake, that tools/list mirrors the page's
 * live view-scoped surface, that the surface change is announced, and that an
 * agent with full MCP access still cannot finalize a report without a human click.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { installDom } from './testdom.js';

const PORT = 8799;                                   // not the default, so a running server is untouched
const BASE = `http://127.0.0.1:${PORT}`;
const SEP = '='.repeat(88);

let failures = 0;
let checks = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (!condition) failures += 1;
  console.log(`${condition ? '✓' : '✗'} ${label}: ${condition ? 'PASS' : 'FAIL'}${detail ? `  (${detail})` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(SEP);
console.log('  KERAMITRA — MCP BRIDGE (real stdio client against src/mcp-server.js)');
console.log(SEP);

// ── The browser tab, running the real application ─────────────────────────────
const dom = installDom();
const main = await import('./main.js');
const { appController } = main;
const page = globalThis.window.keramitraTools;

function clinicianApproves(caseId) {
  const item = appController.getState().approvalQueue.find((i) => i.caseId === caseId);
  const card = dom.within('queue-cards-list').find((n) => n.id === `queue-card-${item.id}`);
  card.descendants().find((n) => n.classList.contains('btn-approve')).click();
  return appController.getState().approvalQueue.find((i) => i.caseId === caseId).approvalToken;
}

// ── The MCP client ────────────────────────────────────────────────────────────
const server = spawn(process.execPath, ['src/mcp-server.js'], {
  env: { ...process.env, KERAMITRA_BRIDGE_PORT: String(PORT) },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const serverLog = [];
createInterface({ input: server.stderr }).on('line', (l) => serverLog.push(l));

let rpcId = 0;
const awaiting = new Map();
const notifications = [];
createInterface({ input: server.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id !== undefined && awaiting.has(msg.id)) {
    const { resolve } = awaiting.get(msg.id);
    awaiting.delete(msg.id);
    resolve(msg);
  } else if (msg.method) {
    notifications.push(msg.method);
  }
});
function rpc(method, params) {
  const id = (rpcId += 1);
  return new Promise((resolve, reject) => {
    awaiting.set(id, { resolve, reject });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => { if (awaiting.has(id)) { awaiting.delete(id); reject(new Error(`${method} timed out`)); } }, 15000);
  });
}
function notifyServer(method) {
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
}

// ── Simulated tab: attach to the relay and service its poll loop ──────────────
let tabRunning = true;
async function attachTab() {
  await fetch(`${BASE}/bridge/hello`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session: 'test_tab', tools: page.listTools() }),
  });
}
async function publishSurface() {
  await fetch(`${BASE}/bridge/surface`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session: 'test_tab', tools: page.listTools() }),
  });
}
async function pollLoop() {
  while (tabRunning) {
    try {
      const res = await fetch(`${BASE}/bridge/poll?session=test_tab`);
      const { call } = await res.json();
      if (!call) continue;
      let payload;
      try {
        payload = { id: call.id, ok: true, result: await page.invokeTool(call.name, call.args ?? {}) };
      } catch (err) {
        payload = { id: call.id, ok: false, error: err.message };
      }
      await fetch(`${BASE}/bridge/result`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      await publishSurface();
    } catch { await sleep(150); }
  }
}

await sleep(600);   // let the relay bind

// ── 1. Protocol handshake ─────────────────────────────────────────────────────
console.log('\n[1] MCP handshake\n');
const init = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'keramitra-test-client', version: '1.0.0' },
});
check('initialize returns a result', Boolean(init.result));
check('Server echoes the negotiated protocol version', init.result.protocolVersion === '2025-06-18', init.result.protocolVersion);
check('Server advertises tools with listChanged', init.result.capabilities?.tools?.listChanged === true);
check('Server identifies itself', init.result.serverInfo?.name === 'keramitra-webmcp-bridge', JSON.stringify(init.result.serverInfo));
check('Instructions warn the model about the human gate', /human clinician clicks Approve/i.test(init.result.instructions ?? ''));
notifyServer('notifications/initialized');
const pong = await rpc('ping', {});
check('ping responds', Boolean(pong.result));

// ── 2. Tool list before any tab is attached ───────────────────────────────────
console.log('\n[2] With no browser tab attached\n');
const emptyList = await rpc('tools/list', {});
check('tools/list is empty rather than advertising tools nothing can serve', emptyList.result.tools.length === 0);
const orphan = await rpc('tools/call', { name: 'list_cases', arguments: {} });
check('tools/call reports a tool error, not a protocol error', orphan.result?.isError === true && !orphan.error);
check('The error explains how to attach a tab', /npm run dev|bridge=1/i.test(orphan.result.content[0].text), orphan.result.content[0].text.slice(0, 72));

// ── 3. Attach the tab; the surface becomes live ───────────────────────────────
console.log('\n[3] Tab attached — the MCP tool list mirrors the page view\n');
await attachTab();
pollLoop();
await sleep(250);

const listed = await rpc('tools/list', {});
const names = listed.result.tools.map((t) => t.name);
check('tools/list now mirrors the page surface', names.length === 9, `${names.length} tools`);
check('finalize_report is absent with no approval request', !names.includes('finalize_report'));
check('Descriptors carry the real inputSchema', Boolean(listed.result.tools.find((t) => t.name === 'load_case')?.inputSchema?.properties?.caseId));
check('Attaching announced a tool-list change', notifications.includes('notifications/tools/list_changed'));

// ── 4. An agent drives the real application over MCP ──────────────────────────
console.log('\n[4] Agent drives the real page over MCP\n');
const parse = (r) => JSON.parse(r.result.content[0].text);

const cases = parse(await rpc('tools/call', { name: 'list_cases', arguments: {} }));
check('list_cases returns the four synthetic cases', cases.cases.length === 4);
await rpc('tools/call', { name: 'load_case', arguments: { caseId: 'CASE_B' } });
check('load_case moved the real application state', appController.getState().currentCase === 'CASE_B');
const analysis = parse(await rpc('tools/call', { name: 'analyze_rings', arguments: { caseId: 'CASE_B' } }));
check('analyze_rings returns pixel-derived metrics', analysis.spacingCV === appController.getState().imageResult.spacingCV, `spacingCV=${analysis.spacingCV}`);
const evaluation = parse(await rpc('tools/call', { name: 'evaluate_referral', arguments: { caseId: 'CASE_B' } }));
check('evaluate_referral returns the rule-engine verdict', evaluation.verdict === 'REFER', evaluation.reasonCodes.join(','));

const badCase = await rpc('tools/call', { name: 'load_case', arguments: { caseId: 'CASE_Z' } });
check('Argument validation reaches the MCP client as a tool error',
  badCase.result.isError === true && /must be one of CASE_A/i.test(badCase.result.content[0].text),
  badCase.result.content[0].text.slice(0, 76));
const badGen = await rpc('tools/call', { name: 'analyze_rings', arguments: { caseId: 'GEN_9' } });
check('A generated id that is not the active view is rejected over MCP',
  badGen.result.isError === true && /not the active view/i.test(badGen.result.content[0].text));

// ── 5. The gate holds over MCP ────────────────────────────────────────────────
console.log('\n[5] The approval gate holds against a remote agent\n');
const beforeCount = notifications.filter((n) => n === 'notifications/tools/list_changed').length;
await rpc('tools/call', { name: 'load_case', arguments: { caseId: 'CASE_B' } });
await rpc('tools/call', { name: 'evaluate_referral', arguments: { caseId: 'CASE_B' } });
const queued = parse(await rpc('tools/call', {
  name: 'request_approval', arguments: { caseId: 'CASE_B', proposedAction: 'Refer to corneal specialist' },
}));
check('request_approval returns a requestId and no token', queued.status === 'pending' && Boolean(queued.requestId) && queued.approvalToken === undefined);
await sleep(200);
const widened = await rpc('tools/list', {});
check('The MCP tool list widened to 10 without the client asking', widened.result.tools.length === 10 && widened.result.tools.some((t) => t.name === 'finalize_report'));
check('The widening was announced as a list change', notifications.filter((n) => n === 'notifications/tools/list_changed').length > beforeCount);

const withReqId = parse(await rpc('tools/call', {
  name: 'finalize_report', arguments: { caseId: 'CASE_B', approvalToken: queued.requestId },
}));
check('The requestId is not a token', withReqId.error === 'TOKEN_NOT_FOUND');
const guessed = parse(await rpc('tools/call', {
  name: 'finalize_report', arguments: { caseId: 'CASE_B', approvalToken: 'tok_forged_1787000000000' },
}));
check('A forged token is rejected', guessed.error === 'TOKEN_NOT_FOUND');
check('No report was finalized by the agent alone', appController.getState().auditTrail.every((e) => e.type !== 'REPORT_FINALIZED'));

console.log('\n    — a human now clicks Approve in the browser —\n');
const token = clinicianApproves('CASE_B');
await publishSurface();
const finalized = parse(await rpc('tools/call', {
  name: 'finalize_report', arguments: { caseId: 'CASE_B', approvalToken: token },
}));
check('With the human-minted token the report finalizes', finalized.status === 'finalized' && finalized.caseId === 'CASE_B', finalized.verdict);
check('The report carries the approved measurements', finalized.measurements.K2 === 48.6, `K2=${finalized.measurements.K2}`);
// Finalizing leaves no PENDING or APPROVED request, so the surface withdraws the tool
// before the token is even examined — single use enforced a layer earlier than expected.
await sleep(200);
const afterFinalize = await rpc('tools/list', {});
check('Finalizing withdraws finalize_report from the MCP tool list',
  !afterFinalize.result.tools.some((t) => t.name === 'finalize_report'),
  `${afterFinalize.result.tools.length} tools`);
const reused = await rpc('tools/call', {
  name: 'finalize_report', arguments: { caseId: 'CASE_B', approvalToken: token },
});
check('Reusing the token over MCP is refused by the surface',
  reused.result.isError === true && /Inactive or unknown/i.test(reused.result.content[0].text));
check('And the token itself is spent, checked directly against the gate',
  main.finalizeReport({ caseId: 'CASE_B', approvalToken: token }).error === 'TOKEN_ALREADY_USED');

// ── 6. Bridged calls are audited like any other ───────────────────────────────
console.log('\n[6] Bridged calls are audited and inspectable like any other\n');
const trail = appController.getState().auditTrail;
check('The finalize is in the page audit trail', trail.some((e) => e.type === 'REPORT_FINALIZED' && e.details.caseId === 'CASE_B'));
check('Guard violations from MCP calls are recorded', trail.filter((e) => e.type === 'GUARD_VIOLATION').length >= 2);
check('Bridged calls appear in the Inspector call log', page.getCallLog().some((c) => c.name === 'finalize_report'));

// ── Teardown ──────────────────────────────────────────────────────────────────
tabRunning = false;
server.stdin.end();
server.kill('SIGTERM');
await sleep(200);

console.log('\n' + SEP);
if (failures === 0) {
  console.log(`  ALL ${checks} MCP BRIDGE CHECKS PASSED.`);
} else {
  console.error(`  ${failures} of ${checks} MCP BRIDGE CHECKS FAILED.`);
  console.error('  server stderr:\n    ' + serverLog.join('\n    '));
  process.exit(1);
}
console.log(SEP + '\n');
process.exit(0);
