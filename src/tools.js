/**
 * tools.js - WebMCP Tool Registration & Dispatcher
 * Exposes Keramitra screening capabilities as standard WebMCP tools.
 *
 * Spec moved the getter Navigator → Document (May 2026 draft).
 * navigator.modelContext remains a deprecated alias; support both.
 */

import { CASES } from './synth.js';
import { generateEvidenceExplanation } from './i18n.js';

let registeredToolNames = [];

/**
 * Full JSON Schema definitions and metadata for all 8 WebMCP tools.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'list_cases',
    description:
      'Discovers available synthetic corneal topography cases. Returns case IDs, eye labels (OD/OS), ' +
      'and neutral clinical descriptors. Synthetic demonstration data only — not for clinical diagnosis. ' +
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
      'image to the visible canvas, updates biometric input fields, and refreshes the UI. Synthetic demonstration ' +
      'data only. Ordering dependency: Call list_cases to obtain a valid caseId. Call load_case before analyze_rings.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          enum: ['CASE_A', 'CASE_B', 'CASE_C'],
          description: 'The unique identifier of the synthetic case to load (e.g. "CASE_A", "CASE_B", "CASE_C").',
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
          enum: ['CASE_A', 'CASE_B', 'CASE_C'],
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
          enum: ['CASE_A', 'CASE_B', 'CASE_C'],
          description: 'Optional case ID. If provided, retrieves measurements associated with that case.',
        },
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
          enum: ['CASE_A', 'CASE_B', 'CASE_C'],
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
          enum: ['CASE_A', 'CASE_B', 'CASE_C'],
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
          enum: ['CASE_A', 'CASE_B', 'CASE_C'],
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
      'Guarded action: finalizes and exports the clinical screening report. Requires a valid approvalToken / requestId ' +
      'from an approval request that has been explicitly approved by a human clinician in the Approval Queue. ' +
      'If pending or rejected, report finalization is blocked. Synthetic demonstration data only. ' +
      'Ordering dependency: Call request_approval, obtain human approval in the UI, then call finalize_report.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: {
          type: 'string',
          enum: ['CASE_A', 'CASE_B', 'CASE_C'],
          description: 'The case ID to finalize.',
        },
        approvalToken: {
          type: 'string',
          description: 'The unique requestId received from request_approval.',
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
export function registerWebMCPTools(controller) {
  // Spec moved the getter Navigator → Document (May 2026 draft).
  // navigator.modelContext remains a deprecated alias; support both.
  const modelContext = typeof document !== 'undefined'
    ? (document.modelContext ?? (typeof navigator !== 'undefined' ? navigator.modelContext : null))
    : null;

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
        ],
        disclaimer: 'Synthetic demonstration data. Not for clinical diagnosis.',
      };
    },

    load_case: async (params) => {
      const caseId = params?.caseId || CASES.CASE_A;
      const res = controller.loadCase(caseId);
      return {
        caseId,
        eye: res.eye,
        captureMetadata: {
          dimensions: { width: 512, height: 512 },
          protocol: '360-RADIAL-PLACIDO',
          ringsProjected: 14,
        },
        message: `Case ${caseId} loaded and rendered to active canvas.`,
      };
    },

    analyze_rings: async (params) => {
      if (params?.caseId && params.caseId !== controller.getState().currentCase) {
        controller.loadCase(params.caseId);
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
      if (params?.caseId && params.caseId !== controller.getState().currentCase) {
        controller.loadCase(params.caseId);
      }
      const measurements = controller.getMeasurements();
      return {
        caseId: controller.getState().currentCase,
        measurements,
      };
    },

    evaluate_referral: async (params) => {
      if (params?.caseId && params.caseId !== controller.getState().currentCase) {
        controller.loadCase(params.caseId);
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
      const caseId = params?.caseId || controller.getState().currentCase;
      const language = params?.language || 'en';
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
      const caseId = params?.caseId || controller.getState().currentCase;
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
      const { caseId, approvalToken } = params || {};
      const result = controller.finalizeReport({ caseId, approvalToken });
      return result;
    },
  };

  // Register in native WebMCP modelContext if supported
  if (modelContext && typeof modelContext.registerTool === 'function') {
    TOOL_DEFINITIONS.forEach((toolDef) => {
      try {
        modelContext.registerTool({
          name: toolDef.name,
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
          execute: toolHandlers[toolDef.name],
        });
        registeredToolNames.push(toolDef.name);
      } catch (err) {
        console.warn(`WebMCP registration for ${toolDef.name} encountered:`, err);
      }
    });
    console.info(`[WebMCP] Successfully registered ${registeredToolNames.length} tools on document.modelContext`);
  }

  // Expose global test interface
  if (typeof window !== 'undefined') {
    window.keramitraTools = {
      listTools: () => TOOL_DEFINITIONS,
      invokeTool: async (name, args = {}) => {
        const handler = toolHandlers[name];
        if (!handler) throw new Error(`Unknown WebMCP tool: ${name}`);
        return await handler(args);
      },
      hasNativeModelContext: Boolean(modelContext),
    };
  }

  return {
    modelContextAvailable: Boolean(modelContext),
    toolsCount: TOOL_DEFINITIONS.length,
    handlers: toolHandlers,
  };
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
}
