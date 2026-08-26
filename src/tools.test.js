/**
 * tools.test.js - End-to-End Validation of all 8 WebMCP Tools
 * Run with: node src/tools.test.js
 *
 * Tests that an agent can discover all 8 tools, walk Case A and Case C end-to-end,
 * test Case B referral & human-in-the-loop approval guard, and generate multi-language explanations.
 */

import { generatePlacidoImageData, CASES, SYNTHETIC_MEASUREMENTS } from './synth.js';
import { analyzeRings } from './analyze.js';
import { evaluateReferral, THRESHOLDS, REASON_CODES, VERDICTS } from './rules.js';
import { registerWebMCPTools, TOOL_DEFINITIONS } from './tools.js';

console.log('='.repeat(88));
console.log('  KERAMITRA — WEBMCP TOOLS REGISTRATION & AGENT FLOW TEST');
console.log('='.repeat(88));

// 1. Setup Headless App Controller Mock
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
    return { eye: mockState.currentEye, caseId };
  },
  analyzeActiveCase: () => {
    mockState.imageResult = analyzeRings(mockState.cachedImageData);
    mockState.referralResult = evaluateReferral({
      imageResult: mockState.imageResult,
      measurements: mockState.measurements,
    });
    return mockState.imageResult;
  },
  getMeasurements: () => ({ ...mockState.measurements }),
  evaluateActiveReferral: () => {
    mockState.referralResult = evaluateReferral({
      imageResult: mockState.imageResult,
      measurements: mockState.measurements,
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
    return item;
  },
  finalizeReport: ({ caseId, approvalToken }) => {
    const item = mockState.approvalQueue.find((i) => i.id === approvalToken);
    if (!item) {
      return { status: 'blocked', error: `No request found for ${approvalToken}`, caseId, approvalToken };
    }
    if (item.status === 'PENDING') {
      return { status: 'blocked', error: 'Request is pending clinician approval.', caseId, approvalToken };
    }
    if (item.status === 'REJECTED') {
      return { status: 'blocked', error: 'Request was rejected by clinician.', caseId, approvalToken };
    }
    return {
      status: 'finalized',
      caseId: item.caseId,
      approvalToken,
      verdict: item.verdict,
      reasonCodes: item.reasonCodes,
      measurements: item.measurements,
      imageMetrics: item.imageResult?.metrics,
      finalizedAt: new Date().toISOString(),
      message: 'Report finalized with human clinical sign-off.',
    };
  },
};

// Register tools
const { handlers } = registerWebMCPTools(mockController);

// Helper to invoke registered tool
async function callTool(name, args = {}) {
  const handler = handlers[name];
  if (!handler) throw new Error(`Tool ${name} not found`);
  return await handler(args);
}

// ── Test 1: Tool Registry Check ──────────────────────────────────────────────
console.log('\n--- 1. TOOL DEFINITIONS & SCHEMAS ---\n');
console.log(`Registered WebMCP Tools count: ${TOOL_DEFINITIONS.length} (Expected: 8)`);

const requiredTools = [
  'list_cases',
  'load_case',
  'analyze_rings',
  'get_measurements',
  'evaluate_referral',
  'explain_evidence',
  'request_approval',
  'finalize_report',
];

const registeredNames = TOOL_DEFINITIONS.map((t) => t.name);
console.table(
  TOOL_DEFINITIONS.map((t) => ({
    'Tool Name': t.name,
    'Required Props': t.inputSchema.required ? t.inputSchema.required.join(', ') : '(none)',
    'Description': t.description.slice(0, 75) + '...',
  }))
);

let allToolsPresent = requiredTools.every((t) => registeredNames.includes(t));
console.log(`\nAll 8 required tools present: ${allToolsPresent ? 'PASS' : 'FAIL'}`);

// ── Test 2: Agent Walkthrough — Case A End-to-End ─────────────────────────────
console.log('\n--- 2. AGENT WALKTHROUGH: CASE A (NORMAL) ---\n');

const casesList = await callTool('list_cases');
console.log('[Step 1: list_cases] Returned cases:', casesList.cases.map((c) => c.caseId).join(', '));

const loadResA = await callTool('load_case', { caseId: CASES.CASE_A });
console.log('[Step 2: load_case(CASE_A)] Result:', loadResA.message);

const imgResA = await callTool('analyze_rings', { caseId: CASES.CASE_A });
console.log(`[Step 3: analyze_rings] Rings: ${imgResA.ringCount}, SpacingCV: ${imgResA.spacingCV}, I-S: ${imgResA.isAsymmetry}, Quality: ${imgResA.quality}`);

const measResA = await callTool('get_measurements', { caseId: CASES.CASE_A });
console.log(`[Step 4: get_measurements] K2: ${measResA.measurements.K2} D, Pachymetry: ${measResA.measurements.pachymetry} µm`);

const evalResA = await callTool('evaluate_referral', { caseId: CASES.CASE_A });
console.log(`[Step 5: evaluate_referral] Verdict: ${evalResA.verdict}, Codes: [${evalResA.reasonCodes.join(', ')}]`);

const explResA_en = await callTool('explain_evidence', { caseId: CASES.CASE_A, language: 'en' });
console.log(`[Step 6: explain_evidence (EN)]:\n  "${explResA_en.explanation}"`);

const explResA_ta = await callTool('explain_evidence', { caseId: CASES.CASE_A, language: 'ta' });
console.log(`[Step 7: explain_evidence (TA)]:\n  "${explResA_ta.explanation}"`);

// ── Test 3: Agent Walkthrough — Case C (Artefacts & Repeat Scan) ───────────────
console.log('\n--- 3. AGENT WALKTHROUGH: CASE C (OCCLUSION & GLARE) ---\n');

const loadResC = await callTool('load_case', { caseId: CASES.CASE_C });
console.log('[Step 1: load_case(CASE_C)] Result:', loadResC.message);

const imgResC = await callTool('analyze_rings', { caseId: CASES.CASE_C });
console.log(`[Step 2: analyze_rings] Usable Meridians: ${imgResC.meridiansUsable}/360, Quality: ${imgResC.quality}`);

const evalResC = await callTool('evaluate_referral', { caseId: CASES.CASE_C });
console.log(`[Step 3: evaluate_referral] Verdict: ${evalResC.verdict}, Codes: [${evalResC.reasonCodes.join(', ')}]`);

const explResC_en = await callTool('explain_evidence', { caseId: CASES.CASE_C, language: 'en' });
console.log(`[Step 4: explain_evidence (EN)]:\n  "${explResC_en.explanation}"`);

const explResC_ta = await callTool('explain_evidence', { caseId: CASES.CASE_C, language: 'ta' });
console.log(`[Step 4b: explain_evidence (TA)]:\n  "${explResC_ta.explanation}"`);

const reqAppResC = await callTool('request_approval', {
  caseId: CASES.CASE_C,
  proposedAction: 'Order repeat Placido capture due to upper lid occlusion',
});
console.log(`[Step 5: request_approval] Queued Request ID: ${reqAppResC.requestId}, Status: ${reqAppResC.status}`);

// ── Test 4: Agent Walkthrough — Case B & Guarded Finalize Report ───────────────
console.log('\n--- 4. AGENT WALKTHROUGH: CASE B & GUARDED ACTION (FINALIZE REPORT) ---\n');

await callTool('load_case', { caseId: CASES.CASE_B });
const evalResB = await callTool('evaluate_referral', { caseId: CASES.CASE_B });
console.log(`[Case B Evaluation] Verdict: ${evalResB.verdict}, Codes: [${evalResB.reasonCodes.join(', ')}]`);

const reqAppResB = await callTool('request_approval', {
  caseId: CASES.CASE_B,
  proposedAction: 'Refer to corneal specialist for ectasia review',
});
console.log(`[Case B Queued] Request ID: ${reqAppResB.requestId}, Status: ${reqAppResB.status}`);

// Attempt finalize before human approval (Must be BLOCKED)
const finalizeAttempt1 = await callTool('finalize_report', {
  caseId: CASES.CASE_B,
  approvalToken: reqAppResB.requestId,
});
console.log(`[Guarded Action Check 1 - While Pending] Status: ${finalizeAttempt1.status} (Expected: blocked)`);

// Simulate Clinician Clicking "Approve referral" in UI
console.log('[Clinician Action] Clinician clicks "Approve referral" in Approval Queue...');
const queueItem = mockState.approvalQueue.find((i) => i.id === reqAppResB.requestId);
queueItem.status = 'APPROVED';

// Attempt finalize after human approval (Must SUCCEED)
const finalizeAttempt2 = await callTool('finalize_report', {
  caseId: CASES.CASE_B,
  approvalToken: reqAppResB.requestId,
});
console.log(`[Guarded Action Check 2 - After Approval] Status: ${finalizeAttempt2.status}, Message: "${finalizeAttempt2.message}"`);

// ── Acceptance Criteria Verification ──────────────────────────────────────────
console.log('\n--- ACCEPTANCE CRITERIA VERIFICATION ---');

let pass = true;

function assertCheck(label, cond) {
  console.log(`${cond ? '✓' : '✗'} ${label}: ${cond ? 'PASS' : 'FAIL'}`);
  if (!cond) pass = false;
}

assertCheck('All 8 WebMCP tools registered with JSON schemas', TOOL_DEFINITIONS.length === 8 && allToolsPresent);
assertCheck('Case A evaluated to ROUTINE_FOLLOWUP via WebMCP tools', evalResA.verdict === 'ROUTINE_FOLLOWUP');
assertCheck('Case C evaluated to REPEAT_SCAN via WebMCP tools', evalResC.verdict === 'REPEAT_SCAN');
assertCheck('Case C reasonCodes contain IMG_REPEAT_REQUIRED', evalResC.reasonCodes.includes('IMG_REPEAT_REQUIRED'));
assertCheck('Case B evaluated to REFER with TWO_DOMAIN_ABNORMAL', evalResB.verdict === 'REFER' && evalResB.reasonCodes.includes('TWO_DOMAIN_ABNORMAL'));
assertCheck('explain_evidence outputs valid English reasoning', explResA_en.explanation.length > 50 && explResC_en.explanation.length > 50);
assertCheck('explain_evidence outputs valid Tamil reasoning', explResA_ta.explanation.includes('வழக்கமான') && explResC_ta.explanation.includes('தர'));
assertCheck('finalize_report blocked when pending human approval', finalizeAttempt1.status === 'blocked');
assertCheck('finalize_report succeeded when human approved in queue', finalizeAttempt2.status === 'finalized');

console.log('\n' + '='.repeat(88));
if (pass) {
  console.log('  ALL PROMPT 5 ACCEPTANCE CRITERIA PASSED.');
} else {
  console.error('  VALIDATION FAILED.');
  process.exit(1);
}
console.log('='.repeat(88) + '\n');
