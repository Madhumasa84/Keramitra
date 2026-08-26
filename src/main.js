/**
 * main.js - Keramitra Interactive Screening Console & WebMCP Host
 * Fully manual UI driving image generation, analysis, rule engine, and WebMCP tools.
 */

import { generatePlacidoImageData, CASES, SYNTHETIC_MEASUREMENTS } from './synth.js';
import { analyzeRings } from './analyze.js';
import { evaluateReferral, THRESHOLDS, REASON_CODES, VERDICTS } from './rules.js';
import { registerWebMCPTools, unregisterWebMCPTools } from './tools.js';

// Application State
const state = {
  currentCase: CASES.CASE_A,
  currentEye: 'OD',
  showMireOverlay: false,
  cachedImageData: null,
  imageResult: null,
  measurements: { ...SYNTHETIC_MEASUREMENTS[CASES.CASE_A] },
  referralResult: null,
  approvalQueue: [],
};

// DOM Element References
const elements = {
  canvas: document.getElementById('placido-canvas'),
  eyeBadge: document.getElementById('eye-badge'),
  btnCaseA: document.getElementById('btn-case-a'),
  btnCaseB: document.getElementById('btn-case-b'),
  btnCaseC: document.getElementById('btn-case-c'),
  btnEyeOD: document.getElementById('btn-eye-od'),
  btnEyeOS: document.getElementById('btn-eye-os'),
  btnAnalyze: document.getElementById('btn-analyze'),
  btnToggleOverlay: document.getElementById('btn-toggle-overlay'),
  qualityChip: document.getElementById('quality-chip'),
  usableMeridiansVal: document.getElementById('usable-meridians-val'),
  
  // Table metrics
  valRingCount: document.getElementById('val-ringCount'),
  valSpacingCV: document.getElementById('val-spacingCV'),
  valIsAsymmetry: document.getElementById('val-isAsymmetry'),
  valMeridiansUsable: document.getElementById('val-meridiansUsable'),
  valMeanInferior: document.getElementById('val-meanInferior'),
  valMeanSuperior: document.getElementById('val-meanSuperior'),
  valCentroid: document.getElementById('val-centroid'),

  // Inputs
  inputK1: document.getElementById('input-k1'),
  inputK2: document.getElementById('input-k2'),
  inputAxis: document.getElementById('input-axis'),
  inputPachy: document.getElementById('input-pachy'),
  inputCyl: document.getElementById('input-cyl'),

  // Verdict & Chips
  verdictBanner: document.getElementById('verdict-banner'),
  verdictText: document.getElementById('verdict-text'),
  domainsFlaggedText: document.getElementById('domains-flagged-text'),
  chipsList: document.getElementById('chips-list'),
  btnQueueReferral: document.getElementById('btn-queue-referral'),

  // Queue
  queueCountBadge: document.getElementById('queue-count-badge'),
  queueEmptyState: document.getElementById('queue-empty-state'),
  queueCardsList: document.getElementById('queue-cards-list'),
};

/**
 * Render image data to canvas with optional diagnostic overlays.
 */
function drawCanvas() {
  if (!elements.canvas || !state.cachedImageData) return;
  const ctx = elements.canvas.getContext('2d');
  const { width, height, data } = state.cachedImageData;

  // Put base image
  const imgDataObj = ctx.createImageData(width, height);
  imgDataObj.data.set(data);
  ctx.putImageData(imgDataObj, 0, 0);

  // Optional mire overlay for visual validation of detected centroid / sectors
  if (state.showMireOverlay && state.imageResult) {
    const { centroid } = state.imageResult.metrics;
    ctx.save();

    // Draw Centroid Crosshair
    ctx.strokeStyle = '#d4973b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centroid.x - 12, centroid.y);
    ctx.lineTo(centroid.x + 12, centroid.y);
    ctx.moveTo(centroid.x, centroid.y - 12);
    ctx.lineTo(centroid.x, centroid.y + 12);
    ctx.stroke();

    // Draw Superior Sector Wedge (30° - 150°)
    ctx.strokeStyle = 'rgba(82, 196, 106, 0.4)';
    ctx.beginPath();
    ctx.arc(centroid.x, centroid.y, 220, -150 * Math.PI / 180, -30 * Math.PI / 180, false);
    ctx.stroke();

    // Draw Inferior Sector Wedge (210° - 330°)
    ctx.strokeStyle = 'rgba(224, 122, 60, 0.4)';
    ctx.beginPath();
    ctx.arc(centroid.x, centroid.y, 220, -330 * Math.PI / 180, -210 * Math.PI / 180, false);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Map reason codes to threshold descriptions and target table row IDs for traceability.
 */
function getReasonCodeMeta(code, domainsFlagged = []) {
  switch (code) {
    case REASON_CODES.IMG_SUSPICIOUS:
      return {
        thresholdDesc: `spacingCV > ${THRESHOLDS.IMG_SPACING_CV} OR isAsymmetry < ${THRESHOLDS.IMG_IS_ASYMMETRY}`,
        targetRowIds: ['metric-row-spacingCV', 'metric-row-isAsymmetry'],
      };
    case REASON_CODES.IMG_REPEAT_REQUIRED:
      return {
        thresholdDesc: `quality === "repeat_required" (usable meridians < ${THRESHOLDS.IMG_MERIDIANS_USABLE})`,
        targetRowIds: ['metric-row-meridiansUsable'],
      };
    case REASON_CODES.K_HIGH:
      return {
        thresholdDesc: `Steep K (K2) > ${THRESHOLDS.K_STEEP_MAX.toFixed(1)} D`,
        targetRowIds: ['metric-row-K2'],
      };
    case REASON_CODES.PACHY_LOW:
      return {
        thresholdDesc: `Central thickness < ${THRESHOLDS.PACHY_CENTRAL_MIN.toFixed(0)} µm`,
        targetRowIds: ['metric-row-pachymetry'],
      };
    case REASON_CODES.CYL_HIGH:
      return {
        thresholdDesc: `Cylinder magnitude > ${THRESHOLDS.CYL_MAG_MAX.toFixed(2)} D`,
        targetRowIds: ['metric-row-cylinder'],
      };
    case REASON_CODES.TWO_DOMAIN_ABNORMAL: {
      const rows = [];
      if (domainsFlagged.includes('image')) {
        rows.push('metric-row-spacingCV', 'metric-row-isAsymmetry');
      }
      if (domainsFlagged.includes('keratometry')) {
        rows.push('metric-row-K2');
      }
      if (domainsFlagged.includes('pachymetry')) {
        rows.push('metric-row-pachymetry');
      }
      return {
        thresholdDesc: `≥ ${THRESHOLDS.TWO_DOMAIN_MIN_COUNT} independent domains abnormal: {${domainsFlagged.join(', ')}}`,
        targetRowIds: rows.length > 0 ? rows : ['metric-row-spacingCV', 'metric-row-K2', 'metric-row-pachymetry'],
      };
    }
    default:
      return { thresholdDesc: 'Clinical rule threshold', targetRowIds: [] };
  }
}

/**
 * Highlight and clear source metric table rows for traceability.
 */
function setSourceHighlight(rowIds, highlight) {
  rowIds.forEach((id) => {
    const row = document.getElementById(id);
    if (row) {
      if (highlight) {
        row.classList.add('source-highlight');
      } else {
        row.classList.remove('source-highlight');
      }
    }
  });
}

/**
 * Read numerical measurements from input fields.
 */
function readMeasurementsFromInputs() {
  return {
    K1: parseFloat(elements.inputK1.value) || 0,
    K2: parseFloat(elements.inputK2.value) || 0,
    axis: parseFloat(elements.inputAxis.value) || 0,
    pachymetry: parseFloat(elements.inputPachy.value) || 0,
    cylinder: parseFloat(elements.inputCyl.value) || 0,
  };
}

/**
 * Update UI with current analysis and referral evaluation results.
 */
function updateUI() {
  const { imageResult, referralResult } = state;
  if (!imageResult || !referralResult) return;

  // 1. Capture quality chip & meridians
  elements.qualityChip.textContent = imageResult.quality === 'adequate'
    ? 'ADEQUATE'
    : 'REPEAT_REQUIRED';
  elements.qualityChip.className = `quality-chip ${imageResult.quality}`;
  elements.usableMeridiansVal.textContent = `${imageResult.meridiansUsable} / 360`;

  // 2. Image metrics table
  elements.valRingCount.textContent = imageResult.ringCount;
  elements.valSpacingCV.textContent = imageResult.spacingCV.toFixed(4);
  elements.valIsAsymmetry.textContent = imageResult.isAsymmetry.toFixed(4);
  elements.valMeridiansUsable.textContent = `${imageResult.meridiansUsable} / 360`;
  elements.valMeanInferior.textContent = imageResult.metrics.meanInferiorSpacing.toFixed(2);
  elements.valMeanSuperior.textContent = imageResult.metrics.meanSuperiorSpacing.toFixed(2);
  elements.valCentroid.textContent = `(${imageResult.metrics.centroid.x.toFixed(1)}, ${imageResult.metrics.centroid.y.toFixed(1)})`;

  // 3. Verdict banner
  elements.verdictText.textContent = referralResult.verdict;
  elements.verdictBanner.className = `verdict-banner verdict-${referralResult.verdict}`;

  // 4. Domains flagged
  const flaggedText = referralResult.domainsFlagged.length > 0
    ? `Flagged domains: ${referralResult.domainsFlagged.join(', ')}`
    : 'Flagged domains: none';
  elements.domainsFlaggedText.textContent = flaggedText;

  // 5. Render reason code chips with hover tooltips and traceability wiring
  elements.chipsList.innerHTML = '';
  if (referralResult.reasonCodes.length === 0) {
    const emptyNotice = document.createElement('span');
    emptyNotice.className = 'no-codes-text';
    emptyNotice.textContent = 'None (all parameters within normal limits)';
    elements.chipsList.appendChild(emptyNotice);
  } else {
    referralResult.reasonCodes.forEach((code) => {
      const meta = getReasonCodeMeta(code, referralResult.domainsFlagged);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'reason-chip';
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-label', `${code}: ${meta.thresholdDesc}`);

      const codeSpan = document.createElement('span');
      codeSpan.textContent = code;
      chip.appendChild(codeSpan);

      const tooltip = document.createElement('span');
      tooltip.className = 'chip-tooltip';
      tooltip.textContent = `Rule: ${meta.thresholdDesc}`;
      chip.appendChild(tooltip);

      // Traceability interaction: mouse & keyboard focus
      chip.addEventListener('mouseenter', () => setSourceHighlight(meta.targetRowIds, true));
      chip.addEventListener('mouseleave', () => setSourceHighlight(meta.targetRowIds, false));
      chip.addEventListener('focus', () => setSourceHighlight(meta.targetRowIds, true));
      chip.addEventListener('blur', () => setSourceHighlight(meta.targetRowIds, false));

      elements.chipsList.appendChild(chip);
    });
  }

  // Update submit referral button text according to active verdict
  elements.btnQueueReferral.textContent = referralResult.verdict === VERDICTS.REPEAT_SCAN
    ? 'Queue repeat scan request'
    : 'Submit referral for approval';
}

/**
 * Run evaluation with current inputs.
 */
function evaluateCurrentState() {
  state.measurements = readMeasurementsFromInputs();
  state.referralResult = evaluateReferral({
    imageResult: state.imageResult,
    measurements: state.measurements,
  });
  updateUI();
  return state.referralResult;
}

/**
 * Load a case preset, generate synthetic image, analyze, and render.
 */
function loadCase(caseId) {
  state.currentCase = caseId;

  // Update case button active state
  elements.btnCaseA.classList.toggle('active', caseId === CASES.CASE_A);
  elements.btnCaseB.classList.toggle('active', caseId === CASES.CASE_B);
  elements.btnCaseC.classList.toggle('active', caseId === CASES.CASE_C);

  // Populate inputs with case preset
  const preset = SYNTHETIC_MEASUREMENTS[caseId];
  if (preset) {
    elements.inputK1.value = preset.K1.toFixed(1);
    elements.inputK2.value = preset.K2.toFixed(1);
    elements.inputAxis.value = preset.axis;
    elements.inputPachy.value = preset.pachymetry;
    elements.inputCyl.value = preset.cylinder.toFixed(2);
  }

  // Generate synthetic image data
  state.cachedImageData = generatePlacidoImageData(caseId, 512, 512);

  // Analyze rings
  state.imageResult = analyzeRings(state.cachedImageData);

  // Redraw canvas
  drawCanvas();

  // Evaluate referral rules
  evaluateCurrentState();

  return { eye: state.currentEye, caseId };
}

/**
 * Render the approval queue cards.
 */
function renderApprovalQueue() {
  const count = state.approvalQueue.length;
  const pendingCount = state.approvalQueue.filter((i) => i.status === 'PENDING').length;
  elements.queueCountBadge.textContent = `${pendingCount} pending`;

  if (count === 0) {
    elements.queueEmptyState.style.display = 'block';
    elements.queueCardsList.innerHTML = '';
    return;
  }

  elements.queueEmptyState.style.display = 'none';
  elements.queueCardsList.innerHTML = '';

  state.approvalQueue.forEach((item) => {
    const card = document.createElement('div');
    card.className = `queue-card status-${item.status.toLowerCase()}`;
    card.id = `queue-card-${item.id}`;

    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `
      <span class="card-title">${item.caseId} &bull; ${item.eye}</span>
      <span class="card-time">${item.time} &bull; ID: ${item.id}</span>
    `;
    card.appendChild(header);

    const verdictRow = document.createElement('div');
    verdictRow.className = 'card-verdict-row';
    verdictRow.innerHTML = `
      <span class="card-verdict-badge ${item.verdict}">${item.verdict}</span>
      <span class="meta-label">K2: ${item.measurements.K2}D &bull; Pachy: ${item.measurements.pachymetry}µm</span>
    `;
    card.appendChild(verdictRow);

    if (item.proposedAction) {
      const actionText = document.createElement('div');
      actionText.className = 'meta-label';
      actionText.style.color = 'var(--text-primary)';
      actionText.textContent = `Action: ${item.proposedAction}`;
      card.appendChild(actionText);
    }

    if (item.reasonCodes.length > 0) {
      const reasons = document.createElement('div');
      reasons.className = 'card-reasons';
      reasons.textContent = `Codes: ${item.reasonCodes.join(', ')}`;
      card.appendChild(reasons);
    }

    if (item.status === 'PENDING') {
      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const btnApprove = document.createElement('button');
      btnApprove.type = 'button';
      btnApprove.className = 'btn btn-approve';
      btnApprove.textContent = item.verdict === VERDICTS.REPEAT_SCAN ? 'Approve repeat scan' : 'Approve referral';
      btnApprove.addEventListener('click', () => {
        item.status = 'APPROVED';
        renderApprovalQueue();
      });

      const btnReject = document.createElement('button');
      btnReject.type = 'button';
      btnReject.className = 'btn btn-reject';
      btnReject.textContent = item.verdict === VERDICTS.REPEAT_SCAN ? 'Reject repeat scan' : 'Reject referral';
      btnReject.addEventListener('click', () => {
        item.status = 'REJECTED';
        renderApprovalQueue();
      });

      actions.appendChild(btnApprove);
      actions.appendChild(btnReject);
      card.appendChild(actions);
    } else {
      const statusBanner = document.createElement('div');
      statusBanner.className = 'card-status-banner';
      statusBanner.textContent = item.status === 'APPROVED' ? 'Approved' : 'Rejected';
      card.appendChild(statusBanner);
    }

    elements.queueCardsList.appendChild(card);
  });
}

/**
 * Queue a referral decision into the approval list.
 */
function queueCurrentReferral(proposedAction = '') {
  if (!state.referralResult) return null;

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const defaultAction = state.referralResult.verdict === VERDICTS.REPEAT_SCAN
    ? 'Order repeat topography capture'
    : 'Refer for specialist corneal assessment';

  const item = {
    id: `req_${Date.now()}`,
    caseId: state.currentCase,
    eye: state.currentEye,
    time: timeStr,
    proposedAction: proposedAction || defaultAction,
    verdict: state.referralResult.verdict,
    reasonCodes: [...state.referralResult.reasonCodes],
    measurements: { ...state.measurements },
    imageResult: state.imageResult,
    status: 'PENDING',
  };

  state.approvalQueue.unshift(item);
  renderApprovalQueue();
  return item;
}

/**
 * Initialize event listeners.
 */
function setupEventListeners() {
  // Case presets
  elements.btnCaseA.addEventListener('click', () => loadCase(CASES.CASE_A));
  elements.btnCaseB.addEventListener('click', () => loadCase(CASES.CASE_B));
  elements.btnCaseC.addEventListener('click', () => loadCase(CASES.CASE_C));

  // Eye selection
  elements.btnEyeOD.addEventListener('click', () => {
    state.currentEye = 'OD';
    elements.eyeBadge.textContent = 'OD';
    elements.btnEyeOD.classList.add('active');
    elements.btnEyeOS.classList.remove('active');
  });

  elements.btnEyeOS.addEventListener('click', () => {
    state.currentEye = 'OS';
    elements.eyeBadge.textContent = 'OS';
    elements.btnEyeOS.classList.add('active');
    elements.btnEyeOD.classList.remove('active');
  });

  // Action buttons
  elements.btnAnalyze.addEventListener('click', () => {
    if (state.cachedImageData) {
      state.imageResult = analyzeRings(state.cachedImageData);
      evaluateCurrentState();
    }
  });

  elements.btnToggleOverlay.addEventListener('click', () => {
    state.showMireOverlay = !state.showMireOverlay;
    elements.btnToggleOverlay.classList.toggle('active', state.showMireOverlay);
    drawCanvas();
  });

  elements.btnQueueReferral.addEventListener('click', () => queueCurrentReferral());

  // Input changes
  const inputs = [
    elements.inputK1,
    elements.inputK2,
    elements.inputAxis,
    elements.inputPachy,
    elements.inputCyl,
  ];

  inputs.forEach((input) => {
    input.addEventListener('input', evaluateCurrentState);
  });
}

// Controller API passed to WebMCP tools to guarantee single unified logic path
export const appController = {
  loadCase: (caseId) => loadCase(caseId),
  analyzeActiveCase: () => {
    if (state.cachedImageData) {
      state.imageResult = analyzeRings(state.cachedImageData);
      evaluateCurrentState();
    }
    return state.imageResult;
  },
  getMeasurements: () => ({ ...state.measurements }),
  evaluateActiveReferral: () => evaluateCurrentState(),
  getState: () => ({ ...state }),
  queueReferralRequest: ({ caseId, proposedAction }) => {
    if (caseId && caseId !== state.currentCase) {
      loadCase(caseId);
    }
    return queueCurrentReferral(proposedAction);
  },
  finalizeReport: ({ caseId, approvalToken }) => {
    const queueItem = state.approvalQueue.find((item) => item.id === approvalToken);
    if (!queueItem) {
      return {
        status: 'blocked',
        error: `Cannot finalize report: No approval request found for token '${approvalToken}'. Call request_approval first.`,
        caseId,
        approvalToken,
      };
    }

    if (queueItem.status === 'PENDING') {
      return {
        status: 'blocked',
        error: `Cannot finalize report: Request '${approvalToken}' is still pending clinician review in the Approval Queue.`,
        caseId,
        approvalToken,
        queueStatus: 'PENDING',
      };
    }

    if (queueItem.status === 'REJECTED') {
      return {
        status: 'blocked',
        error: `Cannot finalize report: Request '${approvalToken}' was rejected by clinician.`,
        caseId,
        approvalToken,
        queueStatus: 'REJECTED',
      };
    }

    // Status is APPROVED
    return {
      status: 'finalized',
      caseId: queueItem.caseId,
      approvalToken,
      verdict: queueItem.verdict,
      reasonCodes: queueItem.reasonCodes,
      measurements: queueItem.measurements,
      imageMetrics: queueItem.imageResult?.metrics,
      finalizedAt: new Date().toISOString(),
      message: 'Screening report successfully finalized with verified human clinical sign-off.',
    };
  },
};

// Initial bootstrap
setupEventListeners();
loadCase(CASES.CASE_A);
renderApprovalQueue();

// Register WebMCP Tools
const registrationResult = registerWebMCPTools(appController);

// Update WebMCP status badge & setup instructions
const webmcpBadge = document.getElementById('webmcp-badge');
if (webmcpBadge) {
  if (registrationResult.modelContextAvailable) {
    webmcpBadge.textContent = `ACTIVE [${registrationResult.toolsCount} TOOLS]`;
    webmcpBadge.className = 'webmcp-badge active';
    webmcpBadge.title = 'WebMCP Document Model Context API active and connected.';
  } else {
    webmcpBadge.textContent = `SHIM [${registrationResult.toolsCount} TOOLS]`;
    webmcpBadge.className = 'webmcp-badge shimmed';
    webmcpBadge.title = 'Native ModelContext not detected. Enable chrome://flags/#enable-model-context in Chrome 146+ or use WebMCP shim.';
  }
}

// Teardown registration on window unload
window.addEventListener('beforeunload', () => {
  unregisterWebMCPTools();
});
