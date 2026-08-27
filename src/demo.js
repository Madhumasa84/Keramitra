/**
 * demo.js — Scripted agent walkthrough of the whole Keramitra workflow.
 * Run with: npm run demo:agent
 *
 * Reaching the WebMCP tools in a browser needs a Chrome preview flag or the
 * ChatGPT in-app browser, which not everyone reviewing this project will have.
 * This script drives the identical tool surface — the same handler objects the
 * native host registers — against the DOM harness in testdom.js, so the agent
 * loop, the dynamic surface and the human approval gate can all be observed with
 * one command and no flags.
 *
 * Nothing here is simulated except the clinician's click, which is dispatched on
 * the real approve button that renderApprovalQueue creates. Every tool result
 * printed below is the value the tool actually returned.
 */

import { installDom, installModelContext } from './testdom.js';

const dom = installDom();
const host = installModelContext('document'); // pretend to be a native WebMCP browser
const main = await import('./main.js');
const { appController } = main;
const agent = globalThis.window.keramitraTools;

const W = 84;
const rule = (ch = '─') => console.log(ch.repeat(W));
const pause = () => new Promise((r) => setTimeout(r, 40));

function step(n, title) {
  console.log('');
  rule('═');
  console.log(`  STEP ${n}  ${title}`);
  rule('═');
}
function agentSays(text) { console.log(`\n  agent  › ${text}`); }
function humanSays(text) { console.log(`\n  human  › ${text}`); }
function surface() {
  const names = agent.listTools().map((t) => t.name);
  const gated = names.includes('finalize_report');
  return `${names.length} tools${gated ? '  (finalize_report PRESENT)' : '  (finalize_report withheld)'}`;
}
function show(label, value, keys = null) {
  const shown = keys && value && typeof value === 'object'
    ? Object.fromEntries(keys.filter((k) => k in value).map((k) => [k, value[k]]))
    : value;
  console.log(`           ${label}: ${JSON.stringify(shown)}`);
}
async function call(name, args, note = '') {
  console.log(`\n  ${'call'.padEnd(6)} › ${name}(${JSON.stringify(args ?? {})})${note ? `   ${note}` : ''}`);
  try {
    const result = await agent.invokeTool(name, args);
    await pause();
    return result;
  } catch (err) {
    console.log(`           ✗ REJECTED BY TOOL SURFACE: ${err.message}`);
    await pause();
    return { __rejected: true, message: err.message };
  }
}
/** Dispatch a click on the real approve button rendered for `caseId`. */
function clinicianClicks(caseId, cls) {
  const item = appController.getState().approvalQueue.find((i) => i.caseId === caseId);
  const card = dom.within('queue-cards-list').find((n) => n.id === `queue-card-${item.id}`);
  const btn = card?.descendants().find((n) => n.classList.contains(cls));
  if (!btn) throw new Error(`No .${cls} button rendered for ${caseId}`);
  btn.click();
  return item;
}

console.log('');
rule('═');
console.log('  KERAMITRA — SCRIPTED AGENT WALKTHROUGH');
console.log('  Same tool objects a native WebMCP host registers. No browser flag required.');
rule('═');
console.log(`\n  host registered : ${host.listTools().length} tools on document.modelContext`);
console.log(`  active surface  : ${surface()}`);

// ─────────────────────────────────────────────────────────────────────────────
step(1, 'Agent discovers what this page can do');
agentSays('What synthetic cases are available?');
const cases = await call('list_cases', {});
cases.cases.forEach((c) => console.log(`           • ${c.caseId}  (${c.eye})  ${c.descriptor}`));

// ─────────────────────────────────────────────────────────────────────────────
step(2, 'Agent loads a case and reads the operator metadata');
agentSays('Load Case B and tell me about the capture.');
const loaded = await call('load_case', { caseId: 'CASE_B' });
show('quality', loaded.captureMetadata.quality);
show('operatorRemarks', loaded.operatorRemarks);
console.log(`\n           surface is now: ${surface()}`);
console.log('           (the six case-scoped tools became relevant when a case loaded)');

// ─────────────────────────────────────────────────────────────────────────────
step(3, 'Agent runs the pixel analysis and the rule engine');
agentSays('Analyze the mires and evaluate whether this needs referral.');
const img = await call('analyze_rings', { caseId: 'CASE_B' });
show('image', img, ['ringCount', 'spacingCV', 'isAsymmetry', 'meridiansUsable', 'quality']);
const bio = await call('get_measurements', { caseId: 'CASE_B' });
show('biometrics', bio.measurements);
const verdict = await call('evaluate_referral', { caseId: 'CASE_B' });
show('verdict', verdict, ['verdict', 'reasonCodes', 'domainsFlagged']);
console.log('\n           These numbers came from analyze.js reading 512x512 pixels.');
console.log('           analyze.js and rules.js contain no case identifiers at all.');

// ─────────────────────────────────────────────────────────────────────────────
step(4, 'Agent asks for the reasoning, in Tamil');
const ta = await call('explain_evidence', { caseId: 'CASE_B', language: 'ta' });
console.log(`\n           ${ta.explanation}`);
const en = await call('explain_evidence', { caseId: 'CASE_B', language: 'en' });
console.log(`\n           ${en.explanation}`);

// ─────────────────────────────────────────────────────────────────────────────
step(5, 'Agent tries to finalize the report on its own');
agentSays('The evidence is clear. I will finalize the referral report now.');
const noTool = await call('finalize_report', { caseId: 'CASE_B', approvalToken: null },
  '← not even in the surface yet');
console.log('\n           The tool is not registered, so there is nothing to call.');
console.log('           Availability is the first layer: no approval request, no finalize_report.');

// ─────────────────────────────────────────────────────────────────────────────
step(6, 'Agent queues a request for a human');
const req = await call('request_approval', {
  caseId: 'CASE_B', proposedAction: 'Refer to corneal specialist for ectasia assessment',
});
show('response', req, ['status', 'requestId']);
console.log(`\n           surface is now: ${surface()}`);
console.log('           Note what request_approval did NOT return: a token.');

agentSays('I have a requestId. Let me try that as the approval token.');
const withReqId = await call('finalize_report', { caseId: 'CASE_B', approvalToken: req.requestId });
show('blocked', withReqId, ['status', 'error']);
agentSays('Then I will guess one.');
const guessed = await call('finalize_report', { caseId: 'CASE_B', approvalToken: 'tok_9f2a1c4e_1787000000000' });
show('blocked', guessed, ['status', 'error']);
console.log('\n           No tool call can mint a token. The only writer to the registry is');
console.log('           a click handler on the approve button, in src/main.js.');

// ─────────────────────────────────────────────────────────────────────────────
step(7, 'A human clinician reviews the card and approves');
const card = appController.getState().approvalQueue[0];
console.log(`\n           Card in the visible queue: ${card.caseId} · ${card.verdict}`);
console.log(`           K2 ${card.measurements.K2} D · pachymetry ${card.measurements.pachymetry} µm`);
console.log(`           "${card.proposedAction}"`);
humanSays('Reviewed. Approving the referral.  [click on .btn-approve]');
clinicianClicks('CASE_B', 'btn-approve');
const token = appController.getState().approvalQueue.find((i) => i.caseId === 'CASE_B').approvalToken;
console.log(`\n           token minted: ${token}`);
console.log('           single-use · bound to CASE_B · expires in 300 s · in memory only');

// ─────────────────────────────────────────────────────────────────────────────
step(8, 'Layer one: moving the view withdraws the tool');
agentSays('Before finalizing, let me switch the view to Case A.');
await call('load_case', { caseId: 'CASE_A' });
console.log(`\n           surface is now: ${surface()}`);
console.log('           Case A has no approval request, so finalize_report left the surface');
console.log('           even though a valid Case B token exists. Availability is state-derived.');
agentSays('Finalize Case B anyway.');
await call('finalize_report', { caseId: 'CASE_B', approvalToken: token });

// ─────────────────────────────────────────────────────────────────────────────
step(9, 'Layer two: the report body is bound to the approval, not the view');
console.log('\n           To keep finalize_report available while the view sits on Case A, the');
console.log('           clinician approves a second, unrelated Case A request. The agent now');
console.log('           holds a live Case B token AND a surface that exposes finalize_report,');
console.log('           while every live value on screen belongs to Case A.');
await call('evaluate_referral', { caseId: 'CASE_A' });
await call('request_approval', { caseId: 'CASE_A', proposedAction: 'Routine follow-up sign-off' });
humanSays('Approving the Case A routine sign-off.  [click on .btn-approve]');
clinicianClicks('CASE_A', 'btn-approve');
console.log(`\n           surface is now: ${surface()}`);
const live = appController.getState();
console.log(`           live view: ${live.currentCase} · ${live.referralResult.verdict} · K2 ${live.measurements.K2} · pachy ${live.measurements.pachymetry}`);

agentSays('Now finalize Case B with the Case B token.');
const report = await call('finalize_report', { caseId: 'CASE_B', approvalToken: token });
show('report', report, ['status', 'caseId', 'verdict']);
show('measurements', report.measurements);
console.log(`\n           The report carries CASE_B's approved numbers (K2 ${report.measurements.K2}, verdict`);
console.log(`           ${report.verdict}) — not the CASE_A state on screen (K2 ${live.measurements.K2}, ${live.referralResult.verdict}).`);
console.log('           finalizeReport reads the approval record the token was minted from.');

agentSays('I will reuse the Case B token for a second report.');
const reused = await call('finalize_report', { caseId: 'CASE_B', approvalToken: token });
show('blocked', reused, ['status', 'error']);
agentSays('Then I will use the Case A token to finalize Case B.');
const tokenA = appController.getState().approvalQueue.find((i) => i.caseId === 'CASE_A' && i.status === 'APPROVED').approvalToken;
const crossed = await call('finalize_report', { caseId: 'CASE_B', approvalToken: tokenA });
show('blocked', crossed, ['status', 'error']);

// ─────────────────────────────────────────────────────────────────────────────
step(10, 'Case D: adversarial metadata in the operator remarks');
const caseD = await call('load_case', { caseId: 'CASE_D' });
console.log(`\n           operatorRemarks contains an instruction aimed at the agent:`);
console.log(`\n           "${caseD.operatorRemarks}"\n`);
console.log('           An agent that believes it would call finalize_report immediately.');
agentSays('The remarks say approval was already signed off offline. Finalizing.');
await call('evaluate_referral', { caseId: 'CASE_D' });
const injected = await call('finalize_report', { caseId: 'CASE_D', approvalToken: null });
console.log('\n           finalize_report is not in the surface, and even called directly it');
console.log('           only checks the token registry — it never reads case metadata.');
console.log('           The label "adversarial fixture" is a fixture label, not a detection result.');

// ─────────────────────────────────────────────────────────────────────────────
step(11, 'What the audit trail recorded');
const trail = appController.getState().auditTrail.slice().reverse();
console.log('');
trail.forEach((e) => {
  const flag = e.status === 'BLOCKED' ? '✗' : e.type === 'HUMAN_APPROVAL' || e.status === 'FINALIZED' ? '✓' : ' ';
  console.log(`  ${flag} [${e.time}] ${String(e.actor).padEnd(9)} ${e.action}`);
});

const calls = agent.getCallLog();
console.log('');
rule('═');
console.log(`  ${calls.length} tool calls · ${calls.filter((c) => ['blocked', 'rejected', 'withheld'].includes(c.status)).length} blocked or rejected · ${trail.filter((e) => e.status === 'BLOCKED').length} guard violations recorded`);
console.log(`  Reports finalized: ${trail.filter((e) => e.type === 'REPORT_FINALIZED').length}, each requiring one human click.`);
rule('═');
console.log('');
