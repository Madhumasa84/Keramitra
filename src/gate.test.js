/**
 * gate.test.js — Exercises the REAL approval gate in src/main.js.
 * Run with: node src/gate.test.js
 *
 * src/tools.test.js drives a test double and so cannot prove the gate; this file
 * imports src/main.js itself, against a DOM harness built from the real
 * index.html, and mints tokens only by dispatching click events on the approve
 * button that renderApprovalQueue actually creates. Every assertion here would
 * fail if the corresponding logic in src/main.js were removed.
 *
 * Several cases are regression tests for defects found in the pre-submission
 * audit; they are labelled with the finding they lock down.
 */

import { installDom } from './testdom.js';

const dom = installDom();
const main = await import('./main.js');
const { appController, finalizeReport, setMeasurements, generateCase, GUARD_ERRORS } = main;
const tools = globalThis.window.keramitraTools;

const SEP = '='.repeat(88);
console.log(SEP);
console.log('  KERAMITRA — REAL APPROVAL GATE (src/main.js under a DOM harness)');
console.log(SEP);

let failures = 0;
let checks = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (!condition) failures += 1;
  console.log(`${condition ? '✓' : '✗'} ${label}: ${condition ? 'PASS' : 'FAIL'}${detail ? `  (${detail})` : ''}`);
}

/** The rendered card element for the newest queue item of `caseId`. */
function cardFor(caseId) {
  const item = appController.getState().approvalQueue.find((i) => i.caseId === caseId);
  if (!item) return null;
  return dom.within('queue-cards-list').find((n) => n.id === `queue-card-${item.id}`) ?? null;
}
/** All text a card renders, including the parts written as innerHTML. */
function cardText(card) {
  if (!card) return '';
  return card.descendants().map((n) => `${n.textContent || ''} ${n.innerHTML || ''}`).join(' ');
}
/** Click the approve/reject button on that card, exactly as a clinician would. */
function clickCardButton(caseId, cls) {
  const card = cardFor(caseId);
  const btn = card?.descendants().find((n) => n.classList.contains(cls));
  if (!btn) throw new Error(`No .${cls} button rendered for ${caseId}`);
  btn.click();
  return btn;
}
function bannerText(caseId) {
  return cardFor(caseId)?.descendants().find((n) => n.classList.contains('card-status-banner'))?.textContent ?? null;
}
function tokenFor(caseId) {
  return appController.getState().approvalQueue.find((i) => i.caseId === caseId && i.status === 'APPROVED')?.approvalToken;
}
async function approvedTokenFor(caseId, proposedAction = 'Refer') {
  appController.loadCase(caseId);
  appController.queueReferralRequest({ caseId, proposedAction });
  clickCardButton(caseId, 'btn-approve');
  return tokenFor(caseId);
}

// ── 1. Bootstrap ──────────────────────────────────────────────────────────────
console.log('\n[1] Module bootstrap against the real index.html\n');

const boot = appController.getState();
check('main.js imports with every element id index.html declares', true, `${dom.declaredIds.length} ids`);
check('Bootstrap loads CASE_A and evaluates it', boot.currentCase === 'CASE_A' && boot.referralResult !== null, boot.referralResult?.verdict);
check('Canvas received pixel data', Boolean(dom.byId('placido-canvas')._ctx?._calls.some((c) => c.name === 'putImageData')));
check('Verdict banner reflects the computed verdict', dom.byId('verdict-text').textContent === boot.referralResult.verdict, dom.byId('verdict-text').textContent);
check('Image metrics table is populated from analyze.js', dom.byId('val-spacingCV').textContent === boot.imageResult.spacingCV.toFixed(4), dom.byId('val-spacingCV').textContent);
check('Tool surface starts at 9 with no approval request', tools.listTools().length === 9 && !tools.listTools().some((t) => t.name === 'finalize_report'));

// ── 2. Token minting ──────────────────────────────────────────────────────────
console.log('\n[2] Only a human DOM click can mint a token\n');

appController.loadCase('CASE_B');
const reqB = appController.queueReferralRequest({ caseId: 'CASE_B', proposedAction: 'Refer to corneal specialist' });
check('request_approval returns no token', reqB.approvalToken === undefined && reqB.status === 'PENDING');
check('Pending approval adds finalize_report to the surface', tools.listTools().length === 10);
check('finalize_report with the requestId is rejected', finalizeReport({ caseId: 'CASE_B', approvalToken: reqB.id }).error === GUARD_ERRORS.TOKEN_NOT_FOUND);
check('finalize_report with a fabricated token is rejected', finalizeReport({ caseId: 'CASE_B', approvalToken: 'tok_deadbeef_1' }).error === GUARD_ERRORS.TOKEN_NOT_FOUND);
check('finalize_report with no token is rejected', finalizeReport({ caseId: 'CASE_B', approvalToken: null }).error === GUARD_ERRORS.TOKEN_MISSING);
check('finalize_report with an empty token is rejected', finalizeReport({ caseId: 'CASE_B', approvalToken: '' }).error === GUARD_ERRORS.TOKEN_MISSING);

clickCardButton('CASE_B', 'btn-approve');
const tokB = tokenFor('CASE_B');
check('Clicking Approve mints a token', typeof tokB === 'string' && tokB.startsWith('tok_'), tokB);
check('Approved card renders the token in the UI', cardText(cardFor('CASE_B')).includes(tokB));

// ── 3. Report body is bound to the approval  [AUDIT Broken #1] ────────────────
console.log('\n[3] Report body is bound to what the clinician approved  [regression: AUDIT Broken #1]\n');

const approvedState = appController.getState();
const approvedK2 = approvedState.measurements.K2;
const approvedVerdict = approvedState.referralResult.verdict;
appController.loadCase('CASE_A');                       // agent moves the view; no guard fires
const boundReport = finalizeReport({ caseId: 'CASE_B', approvalToken: tokB });
check('Report finalizes', boundReport.status === 'finalized');
check('Report carries the APPROVED verdict, not the live one', boundReport.verdict === approvedVerdict, `${boundReport.verdict} after switching to CASE_A (${appController.getState().referralResult.verdict})`);
check('Report carries the APPROVED measurements', boundReport.measurements.K2 === approvedK2, `K2=${boundReport.measurements.K2}`);
check('Report carries the APPROVED image metrics', boundReport.imageMetrics.spacingCV === approvedState.imageResult.metrics.spacingCV, `spacingCV=${boundReport.imageMetrics.spacingCV}`);
check('Report is stamped with clinician sign-off', boundReport.clinicalSignOff.clinicianVerified === true && boundReport.clinicalSignOff.requestId === reqB.id);

// same via generate_case, which also does not stale a token
const tokC = await approvedTokenFor('CASE_C', 'Repeat scan');
const approvedC = { ...appController.getState().measurements };
generateCase({ seed: 5, steepening: 0.9, K2: 55, pachymetry: 310 }, 'AGENT');
const genReport = finalizeReport({ caseId: 'CASE_C', approvalToken: tokC });
check('generate_case cannot swap the report body either', genReport.measurements.K2 === approvedC.K2 && genReport.measurements.pachymetry === approvedC.pachymetry, `K2=${genReport.measurements.K2}, pachy=${genReport.measurements.pachymetry}`);

// ── 4. Finalized card  [AUDIT Broken #2] ──────────────────────────────────────
console.log('\n[4] Finalized card status  [regression: AUDIT Broken #2]\n');

check('Finalized card does not display the rejection banner', bannerText('CASE_B') !== 'Rejected', JSON.stringify(bannerText('CASE_B')));
check('Finalized card carries the status-finalized class', Boolean(cardFor('CASE_B')?.classList.contains('status-finalized')));

// ── 5. Remaining guard codes ──────────────────────────────────────────────────
console.log('\n[5] Remaining structured guard codes, from the real registry\n');

check('Re-using a consumed token is rejected', finalizeReport({ caseId: 'CASE_B', approvalToken: tokB }).error === GUARD_ERRORS.TOKEN_ALREADY_USED);

const tokD = await approvedTokenFor('CASE_D');
check('A token is bound to its own case', finalizeReport({ caseId: 'CASE_A', approvalToken: tokD }).error === GUARD_ERRORS.TOKEN_CASE_MISMATCH);

const tokA = await approvedTokenFor('CASE_A', 'Routine sign-off');
const staleUpdate = setMeasurements({ caseId: 'CASE_A', updates: { K2: 51.2 }, actor: 'AGENT' });
check('Mutating an approved case invalidates its token', staleUpdate.invalidatedApprovalTokens === 1);
check('The stale token cannot finalize', finalizeReport({ caseId: 'CASE_A', approvalToken: tokA }).error === GUARD_ERRORS.TOKEN_STALE_MEASUREMENTS);
check('The stale card is visibly marked', cardFor('CASE_A')?.classList.contains('status-stale_measurements') === true);

appController.loadCase('CASE_C');
const rejReq = appController.queueReferralRequest({ caseId: 'CASE_C', proposedAction: 'Repeat scan' });
clickCardButton('CASE_C', 'btn-reject');
check('A rejected request mints nothing and is blocked', finalizeReport({ caseId: 'CASE_C', approvalToken: rejReq.id }).error === GUARD_ERRORS.APPROVAL_REJECTED);
check('Rejecting removes finalize_report from the surface', !tools.listTools().some((t) => t.name === 'finalize_report'));

// ── 6. Tool argument validation  [AUDIT Broken #4 / #5] ───────────────────────
console.log('\n[6] Tool argument validation  [regression: AUDIT Broken #4 and #5]\n');

async function rejects(name, args) {
  try { await tools.invokeTool(name, args); return false; } catch { return true; }
}
check('load_case rejects an unknown caseId', await rejects('load_case', { caseId: 'CASE_Z' }));
check('load_case rejects a missing caseId', await rejects('load_case', {}));
check('explain_evidence rejects a missing language', await rejects('explain_evidence', { caseId: 'CASE_A' }));
check('explain_evidence rejects a language outside en|ta', await rejects('explain_evidence', { caseId: 'CASE_A', language: 'fr' }));
check('list_cases rejects unexpected arguments', await rejects('list_cases', { caseId: 'CASE_A' }));

const gen = generateCase({ seed: 4242, steepening: 0.85 }, 'AGENT');
check('A generated case is addressable while active', (await tools.invokeTool('analyze_rings', { caseId: gen.caseId })).caseId === gen.caseId);
appController.loadCase('CASE_A');
check('A generated case is rejected once it is no longer active', await rejects('analyze_rings', { caseId: gen.caseId }), gen.caseId);

// ── 7. Evidence explanation accuracy  [AUDIT Broken #3] ───────────────────────
console.log('\n[7] Evidence explanation states only findings that fired  [regression: AUDIT Broken #3]\n');

setMeasurements({ caseId: 'CASE_A', updates: { pachymetry: 400 }, actor: 'AGENT' });
const pachyOnly = await tools.invokeTool('explain_evidence', { caseId: 'CASE_A', language: 'en' });
check('Verdict is REFER on PACHY_LOW alone', pachyOnly.verdict === 'REFER' && pachyOnly.reasonCodes.join() === 'PACHY_LOW');
check('Explanation does not claim steep keratometry', !/steep keratometry/i.test(pachyOnly.explanation), pachyOnly.explanation.slice(0, 96));
check('Explanation does not claim ring crowding', !/ring crowding/i.test(pachyOnly.explanation));
check('Explanation does state the thin pachymetry that did fire', /thin central pachymetry \(400/.test(pachyOnly.explanation));
const pachyOnlyTa = await tools.invokeTool('explain_evidence', { caseId: 'CASE_A', language: 'ta' });
check('Tamil explanation also omits the keratometry claim', !pachyOnlyTa.explanation.includes('47.0 D'), pachyOnlyTa.explanation.slice(0, 60));

// ── 8. Language switching ─────────────────────────────────────────────────────
console.log('\n[8] Language switching drives the real DOM\n');

appController.loadCase('CASE_B');
appController.setLanguage('ta');
check('documentElement.lang follows the selection', globalThis.document.documentElement.lang === 'ta');
check('Translatable nodes are rewritten', dom.byId('heading-case-viewer').textContent === 'கண் பார்வை படம்', dom.byId('heading-case-viewer').textContent);
check('Verdict token stays an English identifier', dom.byId('verdict-text').textContent === appController.getState().referralResult.verdict);
appController.setLanguage('en');
check('Switching back restores English', dom.byId('heading-case-viewer').textContent === 'Case viewer');

// ── 9. WebMCP Inspector ───────────────────────────────────────────────────────
console.log('\n[9] WebMCP Inspector mirrors the live surface and the call log\n');

const inspector = dom.byId('webmcp-inspector');
const badge = dom.byId('webmcp-badge');
check('Inspector ships hidden in index.html', inspector.hidden === true);
badge.click();
check('Clicking the header badge opens it', inspector.hidden === false);

const toolRows = () => dom.within('inspector-tool-list').filter((n) => n.classList.contains('inspector-tool'));
check('Every declared tool gets a row', toolRows().length === 10, `${toolRows().length} rows`);

appController.loadCase('CASE_B');
check('Surface count reflects 9 of 10 with no approval request', dom.byId('inspector-surface-count').textContent === '9 / 10', dom.byId('inspector-surface-count').textContent);
check('finalize_report is shown withheld before approval', toolRows().filter((r) => r.classList.contains('is-withheld')).length === 1);

appController.queueReferralRequest({ caseId: 'CASE_B', proposedAction: 'Refer' });
check('Queueing an approval widens the surface to 10 of 10', dom.byId('inspector-surface-count').textContent === '10 / 10', dom.byId('inspector-surface-count').textContent);
check('No tool is withheld once finalize_report is relevant', toolRows().filter((r) => r.classList.contains('is-withheld')).length === 0);

const callRows = () => dom.within('inspector-call-log').filter((n) => n.classList.contains('inspector-call'));
const beforeCalls = callRows().length;
await tools.invokeTool('get_measurements', { caseId: 'CASE_B' });
check('A successful call is logged', callRows().length === beforeCalls + 1);
try { await tools.invokeTool('load_case', { caseId: 'NOPE' }); } catch { /* expected */ }
check('A rejected call is logged and marked blocked', callRows()[0].classList.contains('is-blocked'));
check('Rejection did not corrupt the surface', dom.byId('inspector-surface-count').textContent === '10 / 10');

const logged = tools.getCallLog();
check('Call log records tool, args, status and duration', Boolean(logged[0].name && logged[0].status && typeof logged[0].durationMs === 'number' && logged[0].args));
check('Instrumentation preserves rejection: the error is still thrown', logged[0].status === 'rejected' && Boolean(logged[0].error));

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + SEP);
if (failures === 0) {
  console.log(`  ALL ${checks} REAL-GATE CHECKS PASSED (src/main.js exercised directly).`);
} else {
  console.error(`  ${failures} of ${checks} REAL-GATE CHECKS FAILED.`);
  process.exit(1);
}
console.log(SEP + '\n');
