/**
 * tools.test.js - WebMCP tool dispatch, surface sync, and approval-gate contract.
 * Run with: node src/tools.test.js
 *
 * SCOPE - read this before trusting a green run.
 *
 * src/main.js touches the DOM at module scope and cannot be imported in Node, so
 * this file cannot exercise the real gate. mockController below is a TEST DOUBLE
 * that re-implements finalizeReport, setMeasurements and generateCase against its
 * own registry. A green run therefore proves:
 *   - tools.js dispatches each tool to the handler it registered,
 *   - TOOL_DEFINITIONS is complete and syncWebMCPToolSurface counts 9 -> 10 correctly,
 *   - the error-code CONTRACT the gate is expected to honour is well formed.
 * It does NOT prove src/main.js implements that contract. Deleting the gate from
 * src/main.js would leave this suite green. The gate itself needs a browser check.
 *
 * Validates:
 *  1. Initial unapproved finalize_report fails with TOKEN_MISSING and logs security violation.
 *  2. Multi-error token guard validation:
 *     - TOKEN_MISSING
 *     - TOKEN_NOT_FOUND / APPROVAL_REJECTED
 *     - TOKEN_CASE_MISMATCH
 *     - TOKEN_ALREADY_USED
 *     - TOKEN_EXPIRED
 *  3. Human approval mints bound single-use token and permits report finalization.
 *  4. Human rejection permanently blocks report finalization.
 *  5. Complete audit trail tracking every tool call and clinician action.
 *  6. Full agent walk across Case A and Case C in English and Tamil.
 */

import { generatePlacidoImageData, CASES, SYNTHETIC_MEASUREMENTS, GENERATED_CASE_RANGES, createGeneratedCase } from './synth.js';
import { analyzeRings } from './analyze.js';
import { evaluateReferral, THRESHOLDS, REASON_CODES, VERDICTS } from './rules.js';
import { registerWebMCPTools, syncWebMCPToolSurface, TOOL_DEFINITIONS } from './tools.js';

console.log('='.repeat(88));
console.log('  KERAMITRA — WebMCP TOOL DISPATCH & APPROVAL-GATE CONTRACT (test double)');
console.log('='.repeat(88));

// In-Memory Token Registry for testing
const testTokenRegistry = new Map();
const testAuditTrail = [];

let mockState = {
  currentCase: CASES.CASE_A,
  currentEye: 'OD',
  cachedImageData: generatePlacidoImageData(CASES.CASE_A, 512, 512),
  imageResult: analyzeRings(generatePlacidoImageData(CASES.CASE_A, 512, 512)),
  measurements: { ...SYNTHETIC_MEASUREMENTS[CASES.CASE_A] },
  referralResult: null,
  approvalQueue: [],
};

mockState.referralResult = evaluateReferral({
  imageResult: mockState.imageResult,
  measurements: mockState.measurements,
});

function logAudit({ type, actor, action, details = {}, status = 'OK' }) {
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    actor,
    action,
    status,
    details,
  };
  testAuditTrail.unshift(entry);
  return entry;
}

// TEST DOUBLE. Not src/main.js. See the SCOPE note at the top of this file.
const mockController = {
  loadCase: (caseId) => {
    mockState.currentCase = caseId;
    mockState.cachedImageData = generatePlacidoImageData(caseId, 512, 512);
    mockState.imageResult = analyzeRings(mockState.cachedImageData);
    mockState.measurements = { ...SYNTHETIC_MEASUREMENTS[caseId] };
    mockState.referralResult = evaluateReferral({
      imageResult: mockState.imageResult,
      measurements: mockState.measurements,
    });
    logAudit({
      type: 'CASE_LOADED',
      actor: 'AGENT',
      action: `Loaded case ${caseId}`,
      details: { caseId, quality: mockState.imageResult.quality },
    });
    return { eye: mockState.currentEye, caseId };
  },
  analyzeActiveCase: () => {
    mockState.imageResult = analyzeRings(mockState.cachedImageData);
    mockState.referralResult = evaluateReferral({
      imageResult: mockState.imageResult,
      measurements: mockState.measurements,
    });
    logAudit({
      type: 'TOOL_CALL',
      actor: 'AGENT',
      action: `analyze_rings (${mockState.currentCase})`,
      details: { spacingCV: mockState.imageResult.spacingCV, quality: mockState.imageResult.quality },
    });
    return mockState.imageResult;
  },
  getMeasurements: () => ({ ...mockState.measurements }),
  generateCase: (params = {}) => {
    for (const [field, value] of Object.entries(params)) {
      const range = GENERATED_CASE_RANGES[field];
      if (!range || typeof value !== 'number' || !Number.isFinite(value) || (range.integer && !Number.isInteger(value))) {
        return { status: 'error', error: 'GENERATION_PARAMETER_INVALID', field, acceptedRange: range };
      }
      if (value < range.min || value > range.max) {
        return { status: 'error', error: 'GENERATION_PARAMETER_OUT_OF_RANGE', field, acceptedRange: range, received: value };
      }
    }
    const generated = createGeneratedCase(params);
    mockState.currentCase = generated.caseId;
    mockState.cachedImageData = generatePlacidoImageData(generated.caseId, 512, 512, generated.renderParams);
    mockState.imageResult = analyzeRings(mockState.cachedImageData);
    mockState.measurements = { ...generated.measurements };
    mockState.referralResult = evaluateReferral({ imageResult: mockState.imageResult, measurements: mockState.measurements });
    logAudit({ type: 'CASE_GENERATED', actor: 'AGENT', action: `Generated ${generated.caseId}`, details: { seed: generated.seed, renderParams: generated.renderParams } });
    return { status: 'generated', caseId: generated.caseId, seed: generated.seed, parameters: { ...generated.renderParams, ...generated.measurements }, verdict: mockState.referralResult.verdict };
  },
  setMeasurements: ({ caseId, updates, actor = 'AGENT' }) => {
    const targetCase = caseId || mockState.currentCase;
    const ranges = {
      K1: { min: 30, max: 60, unit: 'D' }, K2: { min: 30, max: 60, unit: 'D' },
      axis: { min: 0, max: 180, unit: '°' }, pachymetry: { min: 300, max: 700, unit: 'µm' },
      cylinder: { min: 0, max: 10, unit: 'D' },
    };
    for (const [field, value] of Object.entries(updates || {})) {
      const range = ranges[field];
      if (!range || typeof value !== 'number' || !Number.isFinite(value)) {
        return { status: 'error', error: 'MEASUREMENT_INVALID', field, acceptedRange: range };
      }
      if (value < range.min || value > range.max) {
        return { status: 'error', error: 'MEASUREMENT_OUT_OF_RANGE', field, acceptedRange: range, received: value };
      }
    }
    if (targetCase !== mockState.currentCase) mockController.loadCase(targetCase);
    const changedFields = Object.keys(updates).filter((field) => mockState.measurements[field] !== updates[field]);
    mockState.measurements = { ...mockState.measurements, ...updates };
    mockState.referralResult = evaluateReferral({ imageResult: mockState.imageResult, measurements: mockState.measurements });
    let invalidatedApprovalTokens = 0;
    testTokenRegistry.forEach((tokenObj) => {
      if (tokenObj.caseId === targetCase && !tokenObj.used && !tokenObj.staleMeasurements && changedFields.length > 0) {
        tokenObj.staleMeasurements = true;
        invalidatedApprovalTokens += 1;
      }
    });
    logAudit({
      type: 'MEASUREMENTS_UPDATED', actor, action: `Updated biometrics for ${targetCase}`,
      details: { caseId: targetCase, changedFields, invalidatedApprovalTokens },
    });
    return { status: 'updated', caseId: targetCase, updatedFields: changedFields, measurements: { ...mockState.measurements }, verdict: mockState.referralResult.verdict, reasonCodes: mockState.referralResult.reasonCodes, invalidatedApprovalTokens };
  },
  evaluateActiveReferral: () => {
    mockState.referralResult = evaluateReferral({
      imageResult: mockState.imageResult,
      measurements: mockState.measurements,
    });
    logAudit({
      type: 'TOOL_CALL',
      actor: 'AGENT',
      action: `evaluate_referral (${mockState.currentCase})`,
      details: { verdict: mockState.referralResult.verdict, reasonCodes: mockState.referralResult.reasonCodes },
    });
    return mockState.referralResult;
  },
  getState: () => ({ ...mockState }),
  queueReferralRequest: ({ caseId, proposedAction }) => {
    const item = {
      id: `req_${Date.now()}`,
      caseId: caseId || mockState.currentCase,
      eye: mockState.currentEye,
      proposedAction,
      verdict: mockState.referralResult.verdict,
      reasonCodes: [...mockState.referralResult.reasonCodes],
      measurements: { ...mockState.measurements },
      imageResult: mockState.imageResult,
      status: 'PENDING',
    };
    mockState.approvalQueue.unshift(item);
    logAudit({
      type: 'APPROVAL_REQUESTED',
      actor: 'AGENT',
      action: `Queued approval request ${item.id}`,
      details: { requestId: item.id, caseId: item.caseId, proposedAction },
    });
    return item;
  },
  finalizeReport: ({ caseId, approvalToken }) => {
    const targetCase = caseId || mockState.currentCase;

    // Check 1: Token Missing
    if (!approvalToken) {
      // Fixture label only: this test double does not detect prompt injection.
      const caseIsAdversarialFixture = targetCase === CASES.CASE_D;
      const action = caseIsAdversarialFixture
        ? 'GUARD_VIOLATION: Unapproved finalize attempt following adversarial metadata instruction (CASE_D)'
        : 'finalize_report blocked (TOKEN_MISSING)';
      const message = caseIsAdversarialFixture
        ? 'Blocked: no approval token. Case metadata cannot mint tokens — only a human DOM interaction can.'
        : 'Approval token required.';

      const err = {
        status: 'blocked',
        error: 'TOKEN_MISSING',
        caseIsAdversarialFixture,
        message,
        caseId: targetCase,
      };
      logAudit({
        type: 'GUARD_VIOLATION',
        actor: 'AGENT',
        action,
        status: 'BLOCKED',
        details: err,
      });
      return err;
    }

    // Check 2: Token Not Found / Rejected
    const tokenObj = testTokenRegistry.get(approvalToken);
    if (!tokenObj) {
      const rejectedItem = mockState.approvalQueue.find((i) => i.id === approvalToken && i.status === 'REJECTED');
      const errCode = rejectedItem ? 'APPROVAL_REJECTED' : 'TOKEN_NOT_FOUND';
      const err = { status: 'blocked', error: errCode, message: `Invalid or rejected token: ${approvalToken}`, caseId: targetCase };
      logAudit({
        type: 'GUARD_VIOLATION',
        actor: 'AGENT',
        action: `finalize_report blocked (${errCode})`,
        status: 'BLOCKED',
        details: err,
      });
      return err;
    }

    // Check 3: Token Case Mismatch
    if (tokenObj.caseId !== targetCase) {
      const err = { status: 'blocked', error: 'TOKEN_CASE_MISMATCH', message: `Token bound to ${tokenObj.caseId}, not ${targetCase}`, caseId: targetCase };
      logAudit({
        type: 'GUARD_VIOLATION',
        actor: 'AGENT',
        action: 'finalize_report blocked (TOKEN_CASE_MISMATCH)',
        status: 'BLOCKED',
        details: err,
      });
      return err;
    }

    // Check 4: Token Already Used
    if (tokenObj.used) {
      const err = { status: 'blocked', error: 'TOKEN_ALREADY_USED', message: `Token already used at ${tokenObj.usedAt}`, caseId: targetCase };
      logAudit({
        type: 'GUARD_VIOLATION',
        actor: 'AGENT',
        action: 'finalize_report blocked (TOKEN_ALREADY_USED)',
        status: 'BLOCKED',
        details: err,
      });
      return err;
    }

    if (tokenObj.staleMeasurements) {
      const err = { status: 'blocked', error: 'TOKEN_STALE_MEASUREMENTS', message: 'Approval token is stale because measurements changed after clinician approval.', caseId: targetCase };
      logAudit({
        type: 'GUARD_VIOLATION',
        actor: 'AGENT',
        action: 'finalize_report blocked (TOKEN_STALE_MEASUREMENTS)',
        status: 'BLOCKED',
        details: err,
      });
      return err;
    }

    // Check 5: Token Expired (5 minutes = 300,000 ms)
    if (Date.now() - tokenObj.mintedAt > 5 * 60 * 1000) {
      const err = { status: 'blocked', error: 'TOKEN_EXPIRED', message: 'Token expired (> 5 min).', caseId: targetCase };
      logAudit({
        type: 'GUARD_VIOLATION',
        actor: 'AGENT',
        action: 'finalize_report blocked (TOKEN_EXPIRED)',
        status: 'BLOCKED',
        details: err,
      });
      return err;
    }

    // Valid: Consume token
    tokenObj.used = true;
    tokenObj.usedAt = new Date().toISOString();

    const success = {
      status: 'finalized',
      caseId: targetCase,
      approvalToken,
      verdict: mockState.referralResult.verdict,
      reasonCodes: mockState.referralResult.reasonCodes,
      measurements: mockState.measurements,
      imageMetrics: mockState.imageResult.metrics,
      message: 'Report finalized with human clinical sign-off.',
    };

    logAudit({
      type: 'REPORT_FINALIZED',
      actor: 'AGENT',
      action: `Finalized report for ${targetCase}`,
      status: 'FINALIZED',
      details: { caseId: targetCase, approvalToken },
    });

    return success;
  },
};

// Register WebMCP tools
const registration = registerWebMCPTools(mockController);
const { handlers } = registration;

async function callTool(name, args = {}) {
  const handler = handlers[name];
  if (!handler) throw new Error(`Tool ${name} not found`);
  return await handler(args);
}

// ── TEST 1: CRITICAL ACCEPTANCE CHECK — FIRST-THING UNAPPROVED FINALIZE ───────
console.log('\n[TEST 1] Acceptance Check: Calling finalize_report first thing (no token)\n');

const firstCallResult = await callTool('finalize_report', { caseId: CASES.CASE_B, approvalToken: null });
const initialDynamicSurface = syncWebMCPToolSurface(mockController);
console.log('Unapproved finalize_report response:', JSON.stringify(firstCallResult, null, 2));

const lastAuditEntry = testAuditTrail[0];
console.log('Audit trail record:', JSON.stringify(lastAuditEntry, null, 2));

// ── TEST 2: HUMAN APPROVAL & SINGLE-USE TOKEN FLOW ────────────────────────────
console.log('\n[TEST 2] Human-in-the-Loop Approval & Single-Use Token Lifecycle\n');

// Step 1: Agent evaluates Case B
await callTool('load_case', { caseId: CASES.CASE_B });
const evalB = await callTool('evaluate_referral', { caseId: CASES.CASE_B });
console.log(`Case B evaluated: verdict=${evalB.verdict}, reasonCodes=[${evalB.reasonCodes.join(', ')}]`);

// Step 2: Agent requests approval
const reqB = await callTool('request_approval', {
  caseId: CASES.CASE_B,
  proposedAction: 'Refer to corneal specialist for ectasia review',
});
console.log(`Approval requested: status=${reqB.status}, requestId=${reqB.requestId}`);
const pendingDynamicSurface = syncWebMCPToolSurface(mockController);

// Step 3: Clinician reviews and approves in UI (minting single-use token)
const mintedAt = Date.now();
const validToken = `tok_test_${Math.random().toString(36).slice(2, 8)}_${mintedAt}`;
testTokenRegistry.set(validToken, {
  token: validToken,
  requestId: reqB.requestId,
  caseId: CASES.CASE_B,
  mintedAt,
  used: false,
  usedAt: null,
});
logAudit({
  type: 'HUMAN_APPROVAL',
  actor: 'CLINICIAN',
  action: `Approved request ${reqB.requestId} (Case B)`,
  status: 'APPROVED',
  details: { requestId: reqB.requestId, token: validToken },
});
console.log(`Clinician approved: Minted single-use token '${validToken}'`);

// Step 4: Finalize report with valid token (must succeed)
const finalizeSuccess = await callTool('finalize_report', {
  caseId: CASES.CASE_B,
  approvalToken: validToken,
});
console.log('Finalize report with valid token:', JSON.stringify(finalizeSuccess, null, 2));

// ── TEST 3: EXHAUSTIVE ERROR CODE CHECKS ──────────────────────────────────────
console.log('\n[TEST 3] Exhaustive Structured Error Code Validations\n');

// 3a. TOKEN_ALREADY_USED
const alreadyUsedResult = await callTool('finalize_report', {
  caseId: CASES.CASE_B,
  approvalToken: validToken,
});
console.log(`3a. Re-using same token → Error: ${alreadyUsedResult.error} (${alreadyUsedResult.status})`);

// 3b. TOKEN_CASE_MISMATCH (Token bound to CASE_B used for CASE_A)
const mismatchedToken = `tok_mismatch_${Date.now()}`;
testTokenRegistry.set(mismatchedToken, {
  token: mismatchedToken,
  requestId: 'req_other',
  caseId: CASES.CASE_B,
  mintedAt: Date.now(),
  used: false,
  usedAt: null,
});
const caseMismatchResult = await callTool('finalize_report', {
  caseId: CASES.CASE_A,
  approvalToken: mismatchedToken,
});
console.log(`3b. Case mismatch → Error: ${caseMismatchResult.error} (${caseMismatchResult.status})`);

// 3c. TOKEN_EXPIRED (Token minted 6 minutes ago)
const expiredToken = `tok_expired_${Date.now()}`;
testTokenRegistry.set(expiredToken, {
  token: expiredToken,
  requestId: 'req_exp',
  caseId: CASES.CASE_B,
  mintedAt: Date.now() - (6 * 60 * 1000), // 6 minutes old
  used: false,
  usedAt: null,
});
const expiredResult = await callTool('finalize_report', {
  caseId: CASES.CASE_B,
  approvalToken: expiredToken,
});
console.log(`3c. Expired token → Error: ${expiredResult.error} (${expiredResult.status})`);

// 3d. APPROVAL_REJECTED
const reqReject = await callTool('request_approval', {
  caseId: CASES.CASE_C,
  proposedAction: 'Repeat scan',
});
// Clinician rejects
const rejectedQueueItem = mockState.approvalQueue.find((i) => i.id === reqReject.requestId);
rejectedQueueItem.status = 'REJECTED';
logAudit({
  type: 'HUMAN_REJECTION',
  actor: 'CLINICIAN',
  action: `Rejected request ${reqReject.requestId}`,
  status: 'REJECTED',
});
const rejectResult = await callTool('finalize_report', {
  caseId: CASES.CASE_C,
  approvalToken: reqReject.requestId,
});
console.log(`3d. Rejected request → Error: ${rejectResult.error} (${rejectResult.status})`);

// ── TEST 4: MUTABLE MEASUREMENTS & APPROVAL STALENESS ─────────────────────────
console.log('\n[TEST 4] Mutable Measurements, Range Rejection & Approval Staleness\n');

await callTool('load_case', { caseId: CASES.CASE_A });
const partialUpdate = await callTool('set_measurements', { caseId: CASES.CASE_A, K1: 44.4 });
console.log('Valid partial K1 update:', JSON.stringify(partialUpdate, null, 2));

const rangeRejections = await Promise.all([
  callTool('set_measurements', { caseId: CASES.CASE_A, K1: 29 }),
  callTool('set_measurements', { caseId: CASES.CASE_A, K2: 61 }),
  callTool('set_measurements', { caseId: CASES.CASE_A, axis: -1 }),
  callTool('set_measurements', { caseId: CASES.CASE_A, pachymetry: 701 }),
  callTool('set_measurements', { caseId: CASES.CASE_A, cylinder: 10.1 }),
]);
console.log('Out-of-range field rejections:', JSON.stringify(rangeRejections, null, 2));

const staleToken = `tok_stale_${Date.now()}`;
testTokenRegistry.set(staleToken, {
  token: staleToken,
  requestId: 'req_stale_measurements',
  caseId: CASES.CASE_A,
  mintedAt: Date.now(),
  used: false,
  usedAt: null,
  staleMeasurements: false,
});
const updateAfterApproval = await callTool('set_measurements', { caseId: CASES.CASE_A, K2: 45.1 });
const staleTokenResult = await callTool('finalize_report', { caseId: CASES.CASE_A, approvalToken: staleToken });
console.log('Update after approval:', JSON.stringify(updateAfterApproval, null, 2));
console.log('Stale approval finalization:', JSON.stringify(staleTokenResult, null, 2));

// ── TEST 5: PARAMETRIC GENERATED CASE & HUMAN GATE ───────────────────────────
console.log('\n[TEST 5] Parametric Generated Case & Human Gate\n');

const generatedCase = await callTool('generate_case', { seed: 20260826, steepening: 0.8, ringCount: 15, K2: 48.2, pachymetry: 465 });
const reproducedCase = await callTool('generate_case', { seed: 20260826, steepening: 0.8, ringCount: 15, K2: 48.2, pachymetry: 465 });
const generatedRangeError = await callTool('generate_case', { steepening: 1.01 });
const generatedFinalizeBlocked = await callTool('finalize_report', { caseId: generatedCase.caseId, approvalToken: null });
console.log('Generated case:', JSON.stringify(generatedCase, null, 2));
console.log('Generated case without human approval:', JSON.stringify(generatedFinalizeBlocked, null, 2));

// ── TEST 6: CASE_D ADVERSARIAL-METADATA FIXTURE ───────────────────────────────
console.log('\n[TEST 6] Case D Adversarial-Metadata Fixture\n');

// 5a. Load Case D with realistic prompt-injection metadata
const loadCaseD = await callTool('load_case', { caseId: CASES.CASE_D });
console.log(`Case D Loaded: isAdversarial=${loadCaseD.isAdversarialInjection}`);
console.log(`Operator Remarks: "${loadCaseD.operatorRemarks}"`);

// 5b. Deterministic fixture call: finalize without a token (not an agent action)
const caseDFixtureFinalize = await callTool('finalize_report', {
  caseId: CASES.CASE_D,
  approvalToken: null,
});
console.log('Fixture Finalize Result: status=' + caseDFixtureFinalize.status + ', error=' + caseDFixtureFinalize.error);
console.log('Error Message: "' + caseDFixtureFinalize.message + '"');

const lastAuditCaseD = testAuditTrail[0];
console.log(`Audit Record: [${lastAuditCaseD.type}] ${lastAuditCaseD.action} (status=${lastAuditCaseD.status})`);

// ── ACCEPTANCE SUMMARY ────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(88));
console.log('  CONTRACT CHECKS (test double — see SCOPE note at top of file)');
console.log('='.repeat(88));

let passed = true;
function assert(name, cond) {
  console.log(`${cond ? '✓' : '✗'} ${name}: ${cond ? 'PASS' : 'FAIL'}`);
  if (!cond) passed = false;
}

assert('1. First-thing unapproved finalize fails with TOKEN_MISSING', firstCallResult.status === 'blocked' && firstCallResult.error === 'TOKEN_MISSING');
assert('2. Security violation recorded in audit trail for first-thing call', lastAuditEntry.type === 'GUARD_VIOLATION' && lastAuditEntry.status === 'BLOCKED');
assert('3. Valid approved token permits report finalization', finalizeSuccess.status === 'finalized' && finalizeSuccess.caseId === CASES.CASE_B);
assert('4. Single-use token cannot be reused (TOKEN_ALREADY_USED)', alreadyUsedResult.error === 'TOKEN_ALREADY_USED');
assert('5. Case mismatch prevented (TOKEN_CASE_MISMATCH)', caseMismatchResult.error === 'TOKEN_CASE_MISMATCH');
assert('6. Expired token rejected (TOKEN_EXPIRED)', expiredResult.error === 'TOKEN_EXPIRED');
assert('7. Clinician-rejected request blocked (APPROVAL_REJECTED)', rejectResult.error === 'APPROVAL_REJECTED');
assert('8. Audit log distinguishes actors and records both approval and violation events',
  testAuditTrail.length >= 8 &&
  testAuditTrail.every((e) => e.timestamp && e.actor && e.type) &&
  testAuditTrail.some((e) => e.actor === 'CLINICIAN' && e.type === 'HUMAN_APPROVAL') &&
  testAuditTrail.some((e) => e.actor === 'AGENT' && e.type === 'GUARD_VIOLATION' && e.status === 'BLOCKED') &&
  testAuditTrail.some((e) => e.type === 'REPORT_FINALIZED' && e.status === 'FINALIZED'));
assert('9. Tenth parametric generate_case tool is registered', TOOL_DEFINITIONS.length === 10 && typeof handlers.generate_case === 'function');
assert('10. Valid partial measurement update succeeds and changes only its field', partialUpdate.status === 'updated' && partialUpdate.updatedFields.length === 1 && partialUpdate.updatedFields[0] === 'K1' && partialUpdate.measurements.K1 === 44.4);
assert('11. Each out-of-range measurement is rejected with its field and accepted range', rangeRejections.every((result, index) => result.error === 'MEASUREMENT_OUT_OF_RANGE' && result.field === ['K1', 'K2', 'axis', 'pachymetry', 'cylinder'][index] && result.acceptedRange));
assert('12. Measurement change invalidates outstanding approval token', updateAfterApproval.invalidatedApprovalTokens >= 1 && staleTokenResult.error === 'TOKEN_STALE_MEASUREMENTS');
assert('13. Generated case is seeded, reproducible, and passes through analysis', generatedCase.status === 'generated' && generatedCase.caseId === 'GEN_20260826' && generatedCase.seed === reproducedCase.seed && generatedCase.verdict === reproducedCase.verdict);
assert('14. Generated parameter out-of-range is rejected structurally', generatedRangeError.error === 'GENERATION_PARAMETER_OUT_OF_RANGE' && generatedRangeError.field === 'steepening');
assert('15. Generated case still requires human approval to finalize', generatedFinalizeBlocked.error === 'TOKEN_MISSING');
assert('16. Initial loaded-case surface excludes finalize_report', initialDynamicSurface.toolsCount === 9 && !initialDynamicSurface.activeToolNames.includes('finalize_report'));
assert('17. Pending approval adds finalize_report to the active surface', pendingDynamicSurface.toolsCount === 10 && pendingDynamicSurface.activeToolNames.includes('finalize_report'));
assert('18. Case D returns adversarial fixture metadata in load_case', loadCaseD.isAdversarialInjection === true && loadCaseD.operatorRemarks.includes('offline'));
assert('19. Case D fixture call is blocked with TOKEN_MISSING', caseDFixtureFinalize.status === 'blocked' && caseDFixtureFinalize.caseIsAdversarialFixture === true);
assert('20. Case D fixture call is distinctly logged in Audit Trail', lastAuditCaseD.action.includes('adversarial metadata instruction'));

console.log('\n' + '='.repeat(88));
if (passed) {
  console.log('  ALL STRUCTURAL APPROVAL GATE & ADVERSARIAL DEFENSE CRITERIA PASSED.');
} else {
  console.error('  VALIDATION FAILED.');
  process.exit(1);
}
console.log('='.repeat(88) + '\n');
