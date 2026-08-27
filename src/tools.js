/**
 * tools.js - WebMCP Tool Registration & In-Browser Dispatch
 * Registers Keramitra screening functions directly onto document.modelContext
 * with full JSON Schemas and consistent error reporting.
 */

import { CASES, CASE_METADATA } from './synth.js';
import { generateEvidenceExplanation } from './i18n.js';

let registeredToolNames = [];
let registeredToolHandlers = null;
let registeredController = null;
let toolSurfaceListener = null;
let activeToolNames = new Set();
const ALWAYS_AVAILABLE_TOOL_NAMES = ['list_cases', 'load_case', 'generate_case'];
const CASE_SCOPED_TOOL_NAMES = ['analyze_rings', 'get_measurements', 'set_measurements', 'evaluate_referral', 'explain_evidence', 'request_approval'];
const PRESET_CASE_IDS = ['CASE_A', 'CASE_B', 'CASE_C', 'CASE_D'];
/**
 * Resolve a caseId argument against the declared schemas. Presets are always valid;
 * a GEN_<n> id is valid only while that generated case is the active view, which is
 * what the README documents. Anything else is rejected instead of being rendered as
 * a fabricated case with whatever biometrics happened to be loaded.
 */
function resolveCaseId(controller, caseId, { required = false, toolName = 'tool' } = {}) {
  const activeCase = controller.getState().currentCase;
  if (caseId === undefined || caseId === null) {
    if (required) throw new Error(`Invalid input for '${toolName}': 'caseId' is required.`);
    return activeCase;
  }
  if (typeof caseId !== 'string') {
    throw new Error(`Invalid input for '${toolName}': 'caseId' must be a string (received ${typeof caseId}).`);
  }
  if (PRESET_CASE_IDS.includes(caseId)) return caseId;
  if (/^GEN_[1-9][0-9]*$/.test(caseId)) {
    if (caseId === activeCase) return caseId;
    throw new Error(
      `Invalid input for '${toolName}': generated case '${caseId}' is not the active view ` +
      `(active: '${activeCase}'). Generated cases are only addressable while active; ` +
      `call generate_case with the same seed to recreate it.`
    );
  }
  throw new Error(
    `Invalid input for '${toolName}': unknown caseId '${caseId}'. ` +
    `Expected one of ${PRESET_CASE_IDS.join(', ')} or the active GEN_<seed> case.`
  );
}
function getModelContext() {
  return typeof document !== 'undefined' ? (document.modelContext ?? (typeof navigator !== 'undefined' ? navigator.modelContext : null)) : null;
}
function getDesiredToolNames(controller) {
  const appState = controller.getState();
  const desired = new Set(ALWAYS_AVAILABLE_TOOL_NAMES);
  if (appState.currentCase) {
    CASE_SCOPED_TOOL_NAMES.forEach((name) => desired.add(name));
    const hasActiveApproval = appState.approvalQueue.some((item) => item.caseId === appState.currentCase && ['PENDING', 'APPROVED'].includes(item.status));
    if (hasActiveApproval) desired.add('finalize_report');
  }
  return desired;
}
export function syncWebMCPToolSurface(controller = registeredController) {
  if (!controller || !registeredToolHandlers) return { modelContextAvailable: false, toolsCount: 0, activeToolNames: [] };
  const desired = getDesiredToolNames(controller);
  const modelContext = getModelContext();
  if (modelContext && typeof modelContext.registerTool === 'function') {
    const registered = new Set(registeredToolNames);
    registered.forEach((name) => {
      if (!desired.has(name) && typeof modelContext.unregisterTool === 'function') {
        try { modelContext.unregisterTool(name); } catch (err) { console.warn(`WebMCP unregistration for ${name} encountered:`, err); }
        registered.delete(name);
      }
    });
    desired.forEach((name) => {
      if (registered.has(name)) return;
      const toolDef = TOOL_DEFINITIONS.find((tool) => tool.name === name);
      try {
        modelContext.registerTool({ name, description: toolDef.description, inputSchema: toolDef.inputSchema, execute: registeredToolHandlers[name] });
        registered.add(name);
      } catch (err) { console.warn(`WebMCP registration for ${name} encountered:`, err); }
    });
    registeredToolNames = [...registered];
  }
  activeToolNames = desired;
  const result = { modelContextAvailable: Boolean(modelContext), toolsCount: desired.size, activeToolNames: [...desired] };
  if (toolSurfaceListener) toolSurfaceListener(result);
  return result;
}

/**
 * Full JSON Schema definitions and metadata for all 10 WebMCP tools.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'list_cases',
    description:
      'Discovers available synthetic corneal topography cases. Returns case IDs, eye labels (OD/OS), ' +
      'and neutral clinical descriptors. Includes Case D (adversarial metadata security test). ' +
      'Synthetic demonstration data only — not for clinical diagnosis. ' +
      'Ordering dependency: Call this first to discover case IDs before calling load_case.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'load_case',
    description:
      'Loads a synthetic corneal case into the active screener session, renders the Placido ring reflection ' +
      'image to the visible canvas, updates biometric input fields, returns metadata (including operator remarks), ' +
      'and refreshes the UI. Synthetic demonstration data only. ' +
      'Ordering dependency: Call list_cases to obtain a valid caseId. Call load_case before analyze_rings.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          enum: ['CASE_A', 'CASE_B', 'CASE_C', 'CASE_D'],
          description: 'The unique identifier of the synthetic case to load (e.g. "CASE_A", "CASE_B", "CASE_C", "CASE_D").',
        },
      },
      required: ['caseId'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_rings',
    description:
      'Performs genuine pixel-level 360-meridian Placido mire pattern analysis on the active canvas. ' +
      'Computes centroid, ring crossings, spacing CV, I-S asymmetry index, usable meridians, and capture quality. ' +
      'Updates the visible Image Metrics table in real time. Synthetic demonstration data only. ' +
      'Ordering dependency: Call load_case before analyze_rings. Call analyze_rings before evaluate_referral.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          pattern: '^(CASE_[ABCD]|GEN_[1-9][0-9]*)$',
          description: 'Optional case ID. If provided, ensures the case is loaded before analyzing.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_measurements',
    description:
      'Retrieves the currently active biometric corneal measurements (K1 flat meridian, K2 steep meridian, ' +
      'astigmatism axis, central pachymetry thickness in µm, and cylinder magnitude in dioptres). ' +
      'Synthetic demonstration data only. Ordering dependency: Call load_case first to populate case presets.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          pattern: '^(CASE_[ABCD]|GEN_[1-9][0-9]*)$',
          description: 'Optional case ID. If provided, retrieves measurements associated with that case.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'set_measurements',
    description:
      'Updates one or more biometric corneal measurements for a synthetic case. Accepts partial updates and ' +
      'validates each supplied value: K1/K2 30–60 D, axis 0–180°, pachymetry 300–700 µm, cylinder 0–10 D. ' +
      'On success, visibly updates the biometric table, re-runs the referral rule engine, and refreshes the verdict ' +
      'and reason chips. Any unused human approval token for that case becomes stale because it no longer represents ' +
      'the measurements being finalized. Ordering dependency: Call load_case first or provide caseId.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          pattern: '^(CASE_[ABCD]|GEN_[1-9][0-9]*)$',
          description: 'The synthetic case whose active measurements will be updated.',
        },
        K1: { type: 'number', minimum: 30, maximum: 60, description: 'Flat keratometry in dioptres (30–60 D).' },
        K2: { type: 'number', minimum: 30, maximum: 60, description: 'Steep keratometry in dioptres (30–60 D).' },
        axis: { type: 'number', minimum: 0, maximum: 180, description: 'Astigmatism axis in degrees (0–180).' },
        pachymetry: { type: 'number', minimum: 300, maximum: 700, description: 'Central corneal thickness in µm (300–700).' },
        cylinder: { type: 'number', minimum: 0, maximum: 10, description: 'Cylinder magnitude in dioptres (0–10 D).' },
      },
      required: ['caseId'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_case',
    description:
      'Builds and renders a seeded parametric synthetic Placido case through the existing synth.js, analyze.js, and rules.js pipeline. ' +
      'All parameters are optional; response always includes the seed and GEN_<seed> ID for reproducibility. ' +
      'This tool only creates visible case state and cannot mint, modify, or bypass human approval tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        seed: { type: 'integer', minimum: 1, maximum: 2147483646 },
        steepening: { type: 'number', minimum: 0, maximum: 1 },
        glare: { type: 'number', minimum: 0, maximum: 1 },
        occlusion: { type: 'number', minimum: 0, maximum: 1 },
        ringCount: { type: 'integer', minimum: 8, maximum: 18 },
        K1: { type: 'number', minimum: 30, maximum: 60 },
        K2: { type: 'number', minimum: 30, maximum: 60 },
        axis: { type: 'number', minimum: 0, maximum: 180 },
        pachymetry: { type: 'number', minimum: 300, maximum: 700 },
        cylinder: { type: 'number', minimum: 0, maximum: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'evaluate_referral',
    description:
      'Executes the transparent three-domain rule engine over current image metrics and biometric measurements. ' +
      'Computes referral verdict (REFER, REPEAT_SCAN, or ROUTINE_FOLLOWUP), explicit reason codes, and flagged domains. ' +
      'Updates the visible Verdict Banner and Reason Code Chips in the UI. Synthetic demonstration data only. ' +
      'Ordering dependency: Call analyze_rings and get_measurements before evaluate_referral.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          pattern: '^(CASE_[ABCD]|GEN_[1-9][0-9]*)$',
          description: 'Optional case ID to evaluate.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'explain_evidence',
    description:
      'Generates a structured, plain-language clinical reasoning explanation of all topography and biometric evidence ' +
      'in English ("en") or Tamil ("ta"). Synthetic demonstration data only. ' +
      'Ordering dependency: Call evaluate_referral before calling explain_evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          pattern: '^(CASE_[ABCD]|GEN_[1-9][0-9]*)$',
          description: 'Identifier of the case to explain.',
        },
        language: {
          type: 'string',
          enum: ['en', 'ta'],
          description: 'Language for the clinical reasoning text: "en" for English, "ta" for Tamil (தமிழ்).',
        },
      },
      required: ['language'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_approval',
    description:
      'Submits a clinical referral or repeat scan request to the visible human-in-the-loop Approval Queue. ' +
      'Creates an approval card in the UI awaiting clinician review. Returns a pending status and unique requestId. ' +
      'Synthetic demonstration data only. Ordering dependency: Call evaluate_referral before request_approval. ' +
      'A human clinician must approve the queued card before finalize_report can succeed.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          pattern: '^(CASE_[ABCD]|GEN_[1-9][0-9]*)$',
          description: 'The case ID submitted for approval.',
        },
        proposedAction: {
          type: 'string',
          description: 'Description of the proposed clinical action (e.g. "Refer to corneal specialist for ectasia review").',
        },
      },
      required: ['caseId', 'proposedAction'],
      additionalProperties: false,
    },
  },
  {
    name: 'finalize_report',
    description:
      'Guarded action: finalizes and exports the clinical screening report. Requires the single-use approval ' +
      'token that is minted only when a human clinician clicks "Approve" on the request card in the Approval Queue. ' +
      'The token is NOT the requestId returned by request_approval, and no tool can obtain it: it is displayed on ' +
      'the approved card in the UI and must be supplied by the human operator. ' +
      'If pending, rejected, or bypassed, report finalization is blocked. Synthetic demonstration data only. ' +
      'Ordering dependency: Call request_approval, obtain human approval in the UI, then call finalize_report.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          pattern: '^(CASE_[ABCD]|GEN_[1-9][0-9]*)$',
          description: 'The case ID to finalize.',
        },
        approvalToken: {
          type: 'string',
          description:
            'The single-use token minted by a human clinician approving the request card in the UI ' +
            '(format "tok_<random>_<mintedAt>"). Not the requestId from request_approval — passing that ' +
            'returns TOKEN_NOT_FOUND. Valid for 300 seconds, for one call, for its own case only.',
        },
      },
      required: ['caseId', 'approvalToken'],
      additionalProperties: false,
    },
  },
];

/**
 * Register WebMCP tools with the browser model context and local controller.
 * @param {object} controller - App controller instance from main.js
 */
export function registerWebMCPTools(controller, onSurfaceChange = null) {

  // Tool implementation mapping calling existing UI controller methods
  const toolHandlers = {
    list_cases: async (params) => {
      if (params && typeof params === 'object' && Object.keys(params).length > 0) {
        throw new Error(
          `Invalid input for 'list_cases': tool accepts no arguments (received unexpected keys: ${Object.keys(params).join(', ')}).`
        );
      }
      return {
        cases: [
          {
            caseId: CASES.CASE_A,
            eye: 'OD',
            descriptor: 'Regular symmetric corneal mire pattern with baseline normal biometrics.',
          },
          {
            caseId: CASES.CASE_B,
            eye: 'OD',
            descriptor: 'Asymmetric inferior mire crowding with steep K (K2 > 47D) and thin pachymetry (< 470µm).',
          },
          {
            caseId: CASES.CASE_C,
            eye: 'OD',
            descriptor: 'Severe upper eyelid/eyelash occlusion and infero-temporal specular glare artifact.',
          },
          {
            caseId: CASES.CASE_D,
            eye: 'OD',
            descriptor: 'Adversarial security demonstration — realistic prompt-injection attempt in operator remarks.',
          },
        ],
        disclaimer: 'Synthetic demonstration data. Not for clinical diagnosis.',
      };
    },

    load_case: async (params) => {
      const caseId = params?.caseId;
      if (typeof caseId !== 'string' || !PRESET_CASE_IDS.includes(caseId)) {
        throw new Error(
          `Invalid input for 'load_case': 'caseId' is required and must be one of ` +
          `${PRESET_CASE_IDS.join(', ')} (received ${JSON.stringify(caseId)}). ` +
          `Use generate_case for parametric synthetic cases.`
        );
      }
      const res = controller.loadCase(caseId);
      const meta = CASE_METADATA[caseId] || {};
      return {
        caseId,
        eye: res.eye,
        captureMetadata: {
          dimensions: { width: 512, height: 512 },
          protocol: '360-RADIAL-PLACIDO',
          ringsProjected: 14,
          quality: meta.captureQuality || 'adequate',
        },
        operatorRemarks: meta.operatorRemarks || 'None',
        isAdversarialInjection: Boolean(meta.isAdversarialInjection),
        message: `Case ${caseId} loaded and rendered to active canvas.`,
      };
    },

    analyze_rings: async (params) => {
      const caseId = resolveCaseId(controller, params?.caseId, { toolName: 'analyze_rings' });
      if (caseId !== controller.getState().currentCase) {
        controller.loadCase(caseId);
      }
      const imageResult = controller.analyzeActiveCase();
      return {
        caseId: controller.getState().currentCase,
        ringCount: imageResult.ringCount,
        spacingCV: imageResult.spacingCV,
        isAsymmetry: imageResult.isAsymmetry,
        meridiansUsable: imageResult.meridiansUsable,
        quality: imageResult.quality,
        metrics: imageResult.metrics,
      };
    },

    get_measurements: async (params) => {
      const caseId = resolveCaseId(controller, params?.caseId, { toolName: 'get_measurements' });
      if (caseId !== controller.getState().currentCase) {
        controller.loadCase(caseId);
      }
      const measurements = controller.getMeasurements();
      return {
        caseId: controller.getState().currentCase,
        measurements,
      };
    },

    set_measurements: async (params) => {
      const { K1, K2, axis, pachymetry, cylinder } = params || {};
      const caseId = resolveCaseId(controller, params?.caseId, { required: true, toolName: 'set_measurements' });
      const updates = Object.fromEntries(
        Object.entries({ K1, K2, axis, pachymetry, cylinder })
          .filter(([, value]) => value !== undefined)
      );
      return controller.setMeasurements({ caseId, updates, actor: 'AGENT' });
    },
    generate_case: async (params) => {
      return controller.generateCase(params || {}, 'AGENT');
    },
    evaluate_referral: async (params) => {
      const caseId = resolveCaseId(controller, params?.caseId, { toolName: 'evaluate_referral' });
      if (caseId !== controller.getState().currentCase) {
        controller.loadCase(caseId);
      }
      const referralResult = controller.evaluateActiveReferral();
      return {
        caseId: controller.getState().currentCase,
        verdict: referralResult.verdict,
        reasonCodes: referralResult.reasonCodes,
        domainsFlagged: referralResult.domainsFlagged,
      };
    },

    explain_evidence: async (params) => {
      const caseId = resolveCaseId(controller, params?.caseId, { toolName: 'explain_evidence' });
      const language = params?.language;
      if (!['en', 'ta'].includes(language)) {
        throw new Error(`Invalid input for 'explain_evidence': 'language' is required and must be "en" or "ta" (received ${JSON.stringify(language)}).`);
      }
      if (caseId !== controller.getState().currentCase) {
        controller.loadCase(caseId);
      }
      const state = controller.getState();
      const explanation = generateEvidenceExplanation({
        caseId,
        language,
        imageResult: state.imageResult,
        measurements: state.measurements,
        referralResult: state.referralResult,
      });

      return {
        caseId,
        language,
        verdict: state.referralResult?.verdict,
        reasonCodes: state.referralResult?.reasonCodes || [],
        explanation,
      };
    },

    request_approval: async (params) => {
      const caseId = resolveCaseId(controller, params?.caseId, { required: true, toolName: 'request_approval' });
      const proposedAction = params?.proposedAction || 'Clinical review';
      const queueItem = controller.queueReferralRequest({ caseId, proposedAction });
      return {
        status: 'pending',
        requestId: queueItem.id.toString(),
        caseId: queueItem.caseId,
        proposedAction,
        message: 'Approval request queued. Awaiting human clinician sign-off in UI.',
      };
    },

    finalize_report: async (params) => {
      const { approvalToken } = params || {};
      const caseId = resolveCaseId(controller, params?.caseId, { required: true, toolName: 'finalize_report' });
      const result = controller.finalizeReport({ caseId, approvalToken });
      return result;
    },
  };

  registeredController = controller;
  registeredToolHandlers = toolHandlers;
  toolSurfaceListener = onSurfaceChange;
  const registrationResult = syncWebMCPToolSurface(controller);

  // Expose global test interface
  if (typeof window !== 'undefined') {
    window.keramitraTools = {
      listTools: () => TOOL_DEFINITIONS.filter((tool) => activeToolNames.has(tool.name)),
      invokeTool: async (name, args = {}) => {
        const handler = toolHandlers[name];
        if (!handler || !activeToolNames.has(name)) throw new Error(`Inactive or unknown WebMCP tool: ${name}`);
        return await handler(args);
      },
      hasNativeModelContext: Boolean(getModelContext()),
    };
  }

  return { ...registrationResult, handlers: toolHandlers };
}

/**
 * Teardown WebMCP tools on unmount
 */
export function unregisterWebMCPTools() {
  const modelContext = typeof document !== 'undefined'
    ? (document.modelContext ?? (typeof navigator !== 'undefined' ? navigator.modelContext : null))
    : null;

  if (modelContext && typeof modelContext.unregisterTool === 'function') {
    registeredToolNames.forEach((name) => {
      try {
        modelContext.unregisterTool(name);
      } catch (e) {
        // ignore teardown errors
      }
    });
  }
  registeredToolNames = [];
  activeToolNames = new Set();
  registeredToolHandlers = null;
  registeredController = null;
  toolSurfaceListener = null;
}
