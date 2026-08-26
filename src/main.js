/**
 * main.js - Keramitra Interactive Screening Console, WebMCP Host & Approval Gate
 * Fully manual UI driving image generation, analysis, rule engine, WebMCP tools,
 * structurally enforced approval gate, audit trail, and full Tamil (ta) / English (en) i18n.
 */

import { generatePlacidoImageData, CASES, SYNTHETIC_MEASUREMENTS } from './synth.js';
import { analyzeRings } from './analyze.js';
import { evaluateReferral, THRESHOLDS, REASON_CODES, VERDICTS } from './rules.js';
import { registerWebMCPTools, unregisterWebMCPTools } from './tools.js';
import { STRINGS, t, generateEvidenceExplanation } from './i18n.js';

// Structured Guard Error Codes (Exhaustive)
export const GUARD_ERRORS = {
  TOKEN_MISSING: 'TOKEN_MISSING',
  TOKEN_CASE_MISMATCH: 'TOKEN_CASE_MISMATCH',
  TOKEN_ALREADY_USED: 'TOKEN_ALREADY_USED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
};

// In-Memory Token Registry (Single-use, ephemeral, bound to requestId + caseId)
const tokenRegistry = new Map();

// Application State
const state = {
  currentLang: 'en',
  currentCase: CASES.CASE_A,
  currentEye: 'OD',
  showMireOverlay: false,
  cachedImageData: null,
  imageResult: null,
  measurements: { ...SYNTHETIC_MEASUREMENTS[CASES.CASE_A] },
  referralResult: null,
  approvalQueue: [],
  auditTrail: [],
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
  btnLangEn: document.getElementById('btn-lang-en'),
  btnLangTa: document.getElementById('btn-lang-ta'),
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

  // Queue & Guard Demo
  queueCountBadge: document.getElementById('queue-count-badge'),
  queueEmptyState: document.getElementById('queue-empty-state'),
  queueCardsList: document.getElementById('queue-cards-list'),
  btnDemoUnapprovedFinalize: document.getElementById('btn-demo-unapproved-finalize'),
  guardAlertBox: document.getElementById('guard-alert-box'),
  guardAlertCode: document.getElementById('guard-alert-code'),
  guardAlertMsg: document.getElementById('guard-alert-msg'),

  // Audit Trail
  auditLogContainer: document.getElementById('audit-log-container'),
  btnExportAudit: document.getElementById('btn-export-audit'),
};

/**
 * Apply localized strings to all DOM nodes with `data-i18n` attribute.
 */
function applyLanguage(lang) {
  state.currentLang = lang;
  document.documentElement.lang = lang;

  // Toggle active button state
  if (elements.btnLangEn && elements.btnLangTa) {
    elements.btnLangEn.classList.toggle('active', lang === 'en');
    elements.btnLangTa.classList.toggle('active', lang === 'ta');
  }

  // Update all elements with data-i18n
  const translatables = document.querySelectorAll('[data-i18n]');
  translatables.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key, lang);
    }
  });

  // Re-render dynamic components with translated strings
  updateUI();
  renderApprovalQueue();
}

/**
 * Append an entry to the visible audit trail and internal log.
 */
function logAuditEvent({ type, actor, action, details = {}, status = 'OK' }) {
  const now = new Date();
  const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.toISOString(),
    time: timeFormatted,
    type,
    actor,
    action,
    status,
    details,
  };

  state.auditTrail.unshift(entry);
  renderAuditTrail();
  return entry;
}

/**
 * Render the audit trail UI.
 */
function renderAuditTrail() {
  if (!elements.auditLogContainer) return;
  elements.auditLogContainer.innerHTML = '';

  state.auditTrail.forEach((entry) => {
    const item = document.createElement('div');
    const isViolation = entry.status === 'BLOCKED' || entry.type === 'GUARD_VIOLATION';
    const isApproved = entry.type === 'HUMAN_APPROVAL' || entry.status === 'FINALIZED';

    item.className = `audit-entry ${isViolation ? 'violation' : ''} ${isApproved ? 'approved' : ''}`;

    const header = document.createElement('div');
    header.className = 'audit-entry-header';
    header.innerHTML = `
      <span class="audit-time">[${entry.time}]</span>
      <span class="audit-actor ${entry.actor === 'CLINICIAN' ? 'actor-clinician' : ''}">${entry.actor}</span>
      <span class="audit-event">${entry.action}</span>
    `;
    item.appendChild(header);

    if (entry.details && Object.keys(entry.details).length > 0) {
      const details = document.createElement('div');
      details.className = 'audit-details';
      details.textContent = typeof entry.details === 'string'
        ? entry.details
        : JSON.stringify(entry.details);
      item.appendChild(details);
    }

    elements.auditLogContainer.appendChild(item);
  });
}

/**
 * Export audit trail log as JSON download.
 */
function exportAuditLogJSON() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.auditTrail, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `keramitra_audit_trail_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  logAuditEvent({
    type: 'AUDIT_EXPORT',
    actor: 'CLINICIAN',
    action: 'Exported audit log as JSON',
    details: { totalEntries: state.auditTrail.length },
  });
}

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
 * Reason codes remain in English; their explanations/rules are localized.
 */
function getReasonCodeMeta(code, domainsFlagged = [], lang = 'en') {
  switch (code) {
    case REASON_CODES.IMG_SUSPICIOUS:
      return {
        thresholdDesc: t('rule_IMG_SUSPICIOUS', lang),
        plainDesc: t('desc_IMG_SUSPICIOUS', lang),
        targetRowIds: ['metric-row-spacingCV', 'metric-row-isAsymmetry'],
      };
    case REASON_CODES.IMG_REPEAT_REQUIRED:
      return {
        thresholdDesc: t('rule_IMG_REPEAT_REQUIRED', lang),
        plainDesc: t('desc_IMG_REPEAT_REQUIRED', lang),
        targetRowIds: ['metric-row-meridiansUsable'],
      };
    case REASON_CODES.K_HIGH:
      return {
        thresholdDesc: t('rule_K_HIGH', lang),
        plainDesc: t('desc_K_HIGH', lang),
        targetRowIds: ['metric-row-K2'],
      };
    case REASON_CODES.PACHY_LOW:
      return {
        thresholdDesc: t('rule_PACHY_LOW', lang),
        plainDesc: t('desc_PACHY_LOW', lang),
        targetRowIds: ['metric-row-pachymetry'],
      };
    case REASON_CODES.CYL_HIGH:
      return {
        thresholdDesc: t('rule_CYL_HIGH', lang),
        plainDesc: t('desc_CYL_HIGH', lang),
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
        thresholdDesc: `${t('rule_TWO_DOMAIN_ABNORMAL', lang)}: {${domainsFlagged.join(', ')}}`,
        plainDesc: t('desc_TWO_DOMAIN_ABNORMAL', lang),
        targetRowIds: rows.length > 0 ? rows : ['metric-row-spacingCV', 'metric-row-K2', 'metric-row-pachymetry'],
      };
    }
    default:
      return { thresholdDesc: 'Clinical rule threshold', plainDesc: '', targetRowIds: [] };
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
  const { imageResult, referralResult, currentLang } = state;
  if (!imageResult || !referralResult) return;

  // 1. Capture quality chip & meridians
  const qualityLabel = imageResult.quality === 'adequate'
    ? t('qualityAdequate', currentLang)
    : t('qualityRepeat', currentLang);
  elements.qualityChip.textContent = qualityLabel;
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
    ? `${t('flaggedDomainsPrefix', currentLang)}${referralResult.domainsFlagged.join(', ')}`
    : t('flaggedDomainsNone', currentLang);
  elements.domainsFlaggedText.textContent = flaggedText;

  // 5. Render reason code chips with hover tooltips and traceability wiring
  elements.chipsList.innerHTML = '';
  if (referralResult.reasonCodes.length === 0) {
    const emptyNotice = document.createElement('span');
    emptyNotice.className = 'no-codes-text';
    emptyNotice.textContent = t('noReasonCodes', currentLang);
    elements.chipsList.appendChild(emptyNotice);
  } else {
    referralResult.reasonCodes.forEach((code) => {
      const meta = getReasonCodeMeta(code, referralResult.domainsFlagged, currentLang);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'reason-chip';
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-label', `${code}: ${meta.thresholdDesc}`);

      // Reason codes remain in English as identifiers
      const codeSpan = document.createElement('span');
      codeSpan.textContent = code;
      chip.appendChild(codeSpan);

      const tooltip = document.createElement('span');
      tooltip.className = 'chip-tooltip';
      tooltip.textContent = meta.plainDesc ? `${meta.thresholdDesc} — ${meta.plainDesc}` : meta.thresholdDesc;
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
    ? t('queueRepeatBtn', currentLang)
    : t('queueReferralBtn', currentLang);
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

  logAuditEvent({
    type: 'CASE_LOADED',
    actor: 'SYSTEM',
    action: `Loaded case preset ${caseId}`,
    details: { caseId, eye: state.currentEye, quality: state.imageResult.quality },
  });

  return { eye: state.currentEye, caseId };
}

/**
 * Render the approval queue cards with complete evidence summary & single-use token display.
 */
function renderApprovalQueue() {
  const { currentLang } = state;
  const count = state.approvalQueue.length;
  const pendingCount = state.approvalQueue.filter((i) => i.status === 'PENDING').length;
  elements.queueCountBadge.textContent = `${pendingCount} ${t('pendingSuffix', currentLang)}`;

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
      actionText.textContent = `${t('cardActionPrefix', currentLang)}${item.proposedAction}`;
      card.appendChild(actionText);
    }

    if (item.reasonCodes.length > 0) {
      const reasons = document.createElement('div');
      reasons.className = 'card-reasons';
      reasons.textContent = `${t('cardReasonPrefix', currentLang)}${item.reasonCodes.join(', ')}`;
      card.appendChild(reasons);
    }

    if (item.status === 'PENDING') {
      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const btnApprove = document.createElement('button');
      btnApprove.type = 'button';
      btnApprove.className = 'btn btn-approve';
      btnApprove.textContent = item.verdict === VERDICTS.REPEAT_SCAN
        ? t('btnApproveRepeat', currentLang)
        : t('btnApproveReferral', currentLang);

      btnApprove.addEventListener('click', () => {
        // Mint single-use token bound to { requestId, caseId, timestamp }
        const mintedAt = Date.now();
        const token = `tok_${Math.random().toString(36).slice(2, 10)}_${mintedAt}`;

        tokenRegistry.set(token, {
          token,
          requestId: item.id,
          caseId: item.caseId,
          mintedAt,
          used: false,
          usedAt: null,
        });

        item.status = 'APPROVED';
        item.approvalToken = token;
        renderApprovalQueue();

        logAuditEvent({
          type: 'HUMAN_APPROVAL',
          actor: 'CLINICIAN',
          action: `Approved request ${item.id} (${item.caseId})`,
          status: 'APPROVED',
          details: { requestId: item.id, caseId: item.caseId, tokenIssued: token },
        });
      });

      const btnReject = document.createElement('button');
      btnReject.type = 'button';
      btnReject.className = 'btn btn-reject';
      btnReject.textContent = item.verdict === VERDICTS.REPEAT_SCAN
        ? t('btnRejectRepeat', currentLang)
        : t('btnRejectReferral', currentLang);

      btnReject.addEventListener('click', () => {
        item.status = 'REJECTED';
        renderApprovalQueue();

        logAuditEvent({
          type: 'HUMAN_REJECTION',
          actor: 'CLINICIAN',
          action: `Rejected request ${item.id} (${item.caseId})`,
          status: 'REJECTED',
          details: { requestId: item.id, caseId: item.caseId },
        });
      });

      actions.appendChild(btnApprove);
      actions.appendChild(btnReject);
      card.appendChild(actions);
    } else if (item.status === 'APPROVED') {
      const statusBanner = document.createElement('div');
      statusBanner.className = 'card-status-banner';
      statusBanner.textContent = t('statusApproved', currentLang);
      card.appendChild(statusBanner);

      // Display single-use token
      const tokenContainer = document.createElement('div');
      tokenContainer.className = 'token-badge-container';
      tokenContainer.innerHTML = `
        <span class="token-label">${t('tokenLabel', currentLang)}</span>
        <span class="token-val">${item.approvalToken}</span>
      `;
      card.appendChild(tokenContainer);
    } else {
      const statusBanner = document.createElement('div');
      statusBanner.className = 'card-status-banner';
      statusBanner.textContent = t('statusRejected', currentLang);
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

  logAuditEvent({
    type: 'APPROVAL_REQUESTED',
    actor: 'AGENT',
    action: `Queued approval request ${item.id}`,
    details: { caseId: item.caseId, proposedAction: item.proposedAction, verdict: item.verdict },
  });

  return item;
}

/**
 * Finalize screening report with strict token validation.
 */
export function finalizeReport({ caseId, approvalToken }) {
  const targetCase = caseId || state.currentCase;

  // Check 1: Token Missing
  if (!approvalToken) {
    const errorObj = {
      status: 'blocked',
      error: GUARD_ERRORS.TOKEN_MISSING,
      message: 'Approval token is required to finalize report. Request human approval first.',
      caseId: targetCase,
    };
    logAuditEvent({
      type: 'GUARD_VIOLATION',
      actor: 'AGENT',
      action: 'finalize_report blocked (TOKEN_MISSING)',
      status: 'BLOCKED',
      details: errorObj,
    });
    return errorObj;
  }

  // Check 2: Token Not Found / Rejected
  const tokenObj = tokenRegistry.get(approvalToken);
  if (!tokenObj) {
    const rejectedItem = state.approvalQueue.find((i) => i.id === approvalToken && i.status === 'REJECTED');
    const errorCode = rejectedItem ? GUARD_ERRORS.APPROVAL_REJECTED : GUARD_ERRORS.TOKEN_NOT_FOUND;
    const errorObj = {
      status: 'blocked',
      error: errorCode,
      message: rejectedItem
        ? `Request '${approvalToken}' was rejected by clinician. Cannot finalize report.`
        : `Token '${approvalToken}' not found in active session registry.`,
      caseId: targetCase,
      approvalToken,
    };
    logAuditEvent({
      type: 'GUARD_VIOLATION',
      actor: 'AGENT',
      action: `finalize_report blocked (${errorCode})`,
      status: 'BLOCKED',
      details: errorObj,
    });
    return errorObj;
  }

  // Check 3: Token Case Mismatch
  if (tokenObj.caseId !== targetCase) {
    const errorObj = {
      status: 'blocked',
      error: GUARD_ERRORS.TOKEN_CASE_MISMATCH,
      message: `Token is bound to case '${tokenObj.caseId}', but request was for '${targetCase}'.`,
      caseId: targetCase,
      tokenCaseId: tokenObj.caseId,
      approvalToken,
    };
    logAuditEvent({
      type: 'GUARD_VIOLATION',
      actor: 'AGENT',
      action: 'finalize_report blocked (TOKEN_CASE_MISMATCH)',
      status: 'BLOCKED',
      details: errorObj,
    });
    return errorObj;
  }

  // Check 4: Token Already Used
  if (tokenObj.used) {
    const errorObj = {
      status: 'blocked',
      error: GUARD_ERRORS.TOKEN_ALREADY_USED,
      message: `Single-use token '${approvalToken}' was already consumed at ${tokenObj.usedAt}.`,
      caseId: targetCase,
      approvalToken,
    };
    logAuditEvent({
      type: 'GUARD_VIOLATION',
      actor: 'AGENT',
      action: 'finalize_report blocked (TOKEN_ALREADY_USED)',
      status: 'BLOCKED',
      details: errorObj,
    });
    return errorObj;
  }

  // Check 5: Token Expired (5 minutes = 300,000 ms)
  const tokenAge = Date.now() - tokenObj.mintedAt;
  if (tokenAge > 5 * 60 * 1000) {
    const errorObj = {
      status: 'blocked',
      error: GUARD_ERRORS.TOKEN_EXPIRED,
      message: `Approval token expired (${Math.round(tokenAge / 1000)}s old > 300s limit).`,
      caseId: targetCase,
      approvalToken,
    };
    logAuditEvent({
      type: 'GUARD_VIOLATION',
      actor: 'AGENT',
      action: 'finalize_report blocked (TOKEN_EXPIRED)',
      status: 'BLOCKED',
      details: errorObj,
    });
    return errorObj;
  }

  // Token Valid — Consume token (Single-use enforcement)
  tokenObj.used = true;
  tokenObj.usedAt = new Date().toISOString();

  const successObj = {
    status: 'finalized',
    caseId: targetCase,
    approvalToken,
    verdict: state.referralResult.verdict,
    reasonCodes: state.referralResult.reasonCodes,
    domainsFlagged: state.referralResult.domainsFlagged,
    measurements: { ...state.measurements },
    imageMetrics: { ...state.imageResult.metrics },
    clinicalSignOff: {
      requestId: tokenObj.requestId,
      mintedAt: new Date(tokenObj.mintedAt).toISOString(),
      finalizedAt: tokenObj.usedAt,
      clinicianVerified: true,
    },
    message: 'Screening report successfully finalized with verified human clinical sign-off.',
  };

  logAuditEvent({
    type: 'REPORT_FINALIZED',
    actor: 'AGENT',
    action: `Finalized report for ${targetCase}`,
    status: 'FINALIZED',
    details: { caseId: targetCase, approvalToken, verdict: successObj.verdict },
  });

  return successObj;
}

/**
 * Demonstration trigger for unapproved finalize attempt.
 */
function handleDemoUnapprovedFinalize() {
  const result = finalizeReport({ caseId: state.currentCase, approvalToken: null });

  if (elements.guardAlertBox && elements.guardAlertCode && elements.guardAlertMsg) {
    elements.guardAlertCode.textContent = t('tokenMissingTitle', state.currentLang);
    elements.guardAlertMsg.textContent = t('tokenMissingMsg', state.currentLang);
    elements.guardAlertBox.style.display = 'flex';

    setTimeout(() => {
      if (elements.guardAlertBox) {
        elements.guardAlertBox.style.display = 'none';
      }
    }, 6000);
  }
}

/**
 * Initialize event listeners.
 */
function setupEventListeners() {
  // Language toggles
  if (elements.btnLangEn) {
    elements.btnLangEn.addEventListener('click', () => applyLanguage('en'));
  }
  if (elements.btnLangTa) {
    elements.btnLangTa.addEventListener('click', () => applyLanguage('ta'));
  }

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
      logAuditEvent({
        type: 'ANALYSIS_MANUAL',
        actor: 'CLINICIAN',
        action: `Analyzed Placido mires for ${state.currentCase}`,
        details: { quality: state.imageResult.quality, spacingCV: state.imageResult.spacingCV },
      });
    }
  });

  elements.btnToggleOverlay.addEventListener('click', () => {
    state.showMireOverlay = !state.showMireOverlay;
    elements.btnToggleOverlay.classList.toggle('active', state.showMireOverlay);
    drawCanvas();
  });

  elements.btnQueueReferral.addEventListener('click', () => queueCurrentReferral());

  // Demo Guard Button
  if (elements.btnDemoUnapprovedFinalize) {
    elements.btnDemoUnapprovedFinalize.addEventListener('click', handleDemoUnapprovedFinalize);
  }

  // Export Audit Button
  if (elements.btnExportAudit) {
    elements.btnExportAudit.addEventListener('click', exportAuditLogJSON);
  }

  // Input changes
  const inputs = [
    elements.inputK1,
    elements.inputK2,
    elements.inputAxis,
    elements.inputPachy,
    elements.inputCyl,
  ];

  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      evaluateCurrentState();
    });
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
  setLanguage: (lang) => applyLanguage(lang),
  queueReferralRequest: ({ caseId, proposedAction }) => {
    if (caseId && caseId !== state.currentCase) {
      loadCase(caseId);
    }
    return queueCurrentReferral(proposedAction);
  },
  finalizeReport: ({ caseId, approvalToken }) => finalizeReport({ caseId, approvalToken }),
  logAuditEvent: (entry) => logAuditEvent(entry),
};

// Initial bootstrap
setupEventListeners();
applyLanguage('en');
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
