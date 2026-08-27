/**
 * i18n.js - Comprehensive Multi-Language Dictionary & Evidence Explanations
 * Supports English ('en') and Tamil ('ta').
 * Plain spoken register for Tamil, using accurate outreach terminology (கார்னியா).
 */

import { CASES } from './synth.js';
import { VERDICTS, REASON_CODES } from './rules.js';

/**
 * Static UI and System String Catalog
 */
export const STRINGS = {
  en: {
    // Header & Meta
    systemTitle: 'KERAMITRA',
    systemSubtitle: 'Placido Mire Topography & Decision Support',
    protocolLabel: 'Protocol',
    protocolVal: '360-RADIAL-PLACIDO',
    modeLabel: 'Mode',
    modeVal: 'MANUAL_SCREENING',
    webmcpLabel: 'WebMCP',
    noHostBanner: 'No WebMCP host detected — neither document.modelContext nor navigator.modelContext is present, so no tools are registered and no agent can discover them. The tools are still callable by hand from the DevTools console via window.keramitraTools. Enable the WebMCP preview flag in Chrome Canary/Dev for native execution.',
    badgeNoHost: 'NO WebMCP HOST — CONSOLE ONLY',
    badgeNoHostTitle: 'No document.modelContext or navigator.modelContext. Nothing is registered with a host; window.keramitraTools remains callable from the console.',
    badgeNativeTitle: 'Native WebMCP (document.modelContext) active and connected.',

    // Panels & Headers
    caseViewerTitle: 'Case viewer',
    evidenceTitle: 'Evidence',
    evidenceSubtitle: 'MEASUREMENTS & DERIVED METRICS',
    approvalQueueTitle: 'Approval queue',

    // Case Controls
    casePresetLabel: 'Case preset',
    caseA: 'Case A',
    caseB: 'Case B',
    caseC: 'Case C',
    caseD: 'Case D (Security demo)',
    eyeLabel: 'Eye',
    eyeOD: 'OD (Right)',
    eyeOS: 'OS (Left)',
    captureQualityLabel: 'Capture quality',
    usableMeridiansLabel: 'Usable meridians',
    operatorRemarksLabel: 'Operator remarks',
    adversarialBadge: 'ADVERSARIAL METADATA',
    generatedCaseLabel: 'Generated case',
    steepeningLabel: 'Inferior steepening',
    generatorNote: 'Drag to regenerate a seeded synthetic capture through the same pixel analysis pipeline.',
    seedPrefix: 'Seed: ',
    seedRandom: 'random',
    generatedOperatorNote: 'Generated synthetic capture; no operator metadata.',
    analyzeCaptureBtn: 'Analyze capture',
    toggleOverlayBtn: 'Toggle mire overlay',
    qualityAdequate: 'ADEQUATE',
    qualityRepeat: 'REPEAT_REQUIRED',
    qualityEvaluating: 'Evaluating...',

    // Image Metrics Table
    imageMetricsTitle: 'Placido ring metrics (analyze.js)',
    imageMetricsSubtitle: 'Computed across 360 radial meridians',
    colMetric: 'Metric',
    colValue: 'Value',
    colUnit: 'Unit / Scale',
    colReference: 'Reference',
    metricRingCount: 'Ring count (median)',
    metricSpacingCV: 'Spacing CV (inter-ring)',
    metricIsAsymmetry: 'I-S asymmetry index',
    metricMeridiansUsable: 'Usable meridians count',
    metricMeanInferior: 'Mean inferior spacing (210°–330°)',
    metricMeanSuperior: 'Mean superior spacing (30°–150°)',
    metricCentroid: 'Centroid position',

    // Biometrics Table
    biometricsTitle: 'Biometric measurements',
    biometricsSubtitle: 'Manual entry / Device input',
    colParameter: 'Parameter',
    colThreshold: 'Threshold',
    paramK1: 'K1 (Flat meridian)',
    paramK2: 'K2 (Steep meridian)',
    paramAxis: 'Astigmatism axis',
    paramPachy: 'Central corneal thickness',
    paramCyl: 'Cylinder magnitude',

    // Verdict & Reason Codes
    verdictHeading: 'Rule engine verdict',
    verdictNotEvaluated: 'NOT_EVALUATED',
    awaitingAnalysis: 'Awaiting capture analysis',
    flaggedDomainsNone: 'Flagged domains: none',
    flaggedDomainsPrefix: 'Flagged domains: ',
    reasonCodesHeading: 'Reason codes (hover to inspect rule & highlight metric source):',
    noReasonCodes: 'None (all parameters within normal limits)',
    queueReferralBtn: 'Submit referral for approval',
    queueRepeatBtn: 'Queue repeat scan request',

    // Reason Code Rule Condition Descriptions
    rule_IMG_SUSPICIOUS: 'spacingCV > 0.08 OR isAsymmetry < -0.10',
    rule_IMG_REPEAT_REQUIRED: 'quality === "repeat_required" (usable meridians < 300)',
    rule_K_HIGH: 'Steep K (K2) > 47.0 D',
    rule_PACHY_LOW: 'Central thickness < 470 µm',
    rule_CYL_HIGH: 'Cylinder magnitude > 1.50 D',
    rule_TWO_DOMAIN_ABNORMAL: '≥ 2 independent domains abnormal',

    // Reason Code Plain Spoken Descriptions (School Health Worker Register)
    desc_IMG_SUSPICIOUS: 'Corneal rings are distorted or crowded unevenly at the bottom.',
    desc_IMG_REPEAT_REQUIRED: 'Image is blurry, blocked by eyelids/eyelashes, or has glare. Must take scan again.',
    desc_K_HIGH: 'The cornea curvature is steeper than normal limit (47.0 D).',
    desc_PACHY_LOW: 'The center of the cornea is thinner than normal limit (470 µm).',
    desc_CYL_HIGH: 'High cylindrical power detected (above 1.50 D).',
    desc_TWO_DOMAIN_ABNORMAL: 'Two or more tests (rings, curvature, thickness) show abnormal findings.',

    // Approval Queue & Guard
    queueEmpty: 'Pending clinical approval requests and referral sign-offs will appear here when submitted from the evidence panel.',
    pendingSuffix: 'pending',
    cardActionPrefix: 'Action: ',
    cardReasonPrefix: 'Reason codes: ',
    btnApproveReferral: 'Approve referral',
    btnApproveRepeat: 'Approve repeat scan',
    btnRejectReferral: 'Reject referral',
    btnRejectRepeat: 'Reject repeat scan',
    statusApproved: 'Approved',
    statusStaleMeasurements: 'Approval stale — measurements changed; submit a new request.',
    statusRejected: 'Rejected',
    statusFinalized: 'Report finalized with clinical sign-off',
    tokenLabel: 'Single-use token (valid 5 min)',

    // Security Gate & Demo
    guardSectionTitle: 'Security gate demonstration',
    btnDemoUnapprovedFinalize: 'Demo: unapproved finalize attempt',
    btnDemoCaseDInjection: 'Simulated bypass attempt (deterministic)',
    tokenMissingTitle: 'TOKEN_MISSING',
    tokenMissingMsg: 'Blocked: Approval token required to finalize report. Request human approval first.',
    tokenMissingAdversarialMsg: 'Blocked: no approval token. Case metadata cannot mint tokens — only a human DOM interaction can.',

    // Audit Trail
    auditTitle: 'Audit trail',
    btnExportAudit: 'Export JSON',

    // Footer
    footerBanner: 'Synthetic demonstration data. Not for clinical diagnosis.',
  },

  ta: {
    // Tamil translation written in plain spoken outreach register (கார்னியா)
    // Header & Meta
    systemTitle: 'கெராமித்ரா (KERAMITRA)',
    systemSubtitle: 'கண் கார்னியா பட பரிசோதனை & முடிவு வழிகாட்டி',
    protocolLabel: 'முறை',
    protocolVal: '360-ஆர-பிளாசிடோ',
    modeLabel: 'பயன்முறை',
    modeVal: 'நேரடி பரிசோதனை',
    webmcpLabel: 'WebMCP',
    noHostBanner: 'WebMCP ஹோஸ்ட் எதுவும் கண்டறியப்படவில்லை — document.modelContext அல்லது navigator.modelContext இரண்டுமே இல்லை. எனவே எந்தக் கருவியும் பதிவு செய்யப்படவில்லை; எந்த ஏஜென்டும் இவற்றைக் கண்டறிய முடியாது. DevTools கன்சோலில் window.keramitraTools மூலம் மட்டுமே அழைக்க முடியும். நேட்டிவ் இயக்கத்திற்கு Chrome Canary/Dev-இல் WebMCP முன்னோட்ட ஃபிளாக்கை இயக்கவும்.',
    badgeNoHost: 'WebMCP ஹோஸ்ட் இல்லை — கன்சோல் மட்டும்',
    badgeNoHostTitle: 'document.modelContext / navigator.modelContext இல்லை. எந்தக் கருவியும் ஹோஸ்டில் பதிவு செய்யப்படவில்லை; window.keramitraTools கன்சோலில் இயங்கும்.',
    badgeNativeTitle: 'நேட்டிவ் WebMCP (document.modelContext) இயங்குகிறது.',

    // Panels & Headers
    caseViewerTitle: 'கண் பார்வை படம்',
    evidenceTitle: 'சான்றுகள் & அளவீடுகள்',
    evidenceSubtitle: 'கணக்கிடப்பட்ட முடிவுகள்',
    approvalQueueTitle: 'மருத்துவர் ஒப்புதல் வரிசை',

    // Case Controls
    casePresetLabel: 'மாதிரி தேர்வுகள்',
    caseA: 'மாதிரி A (இயல்பு)',
    caseB: 'மாதிரி B (வளைவு நோய்)',
    caseC: 'மாதிரி C (மறுபடம் தேவை)',
    caseD: 'மாதிரி D (பாதுகாப்பு சோதனை)',
    eyeLabel: 'கண்',
    eyeOD: 'வலது கண் (OD)',
    eyeOS: 'இடது கண் (OS)',
    captureQualityLabel: 'படத்தின் தரம்',
    usableMeridiansLabel: 'தெளிவான கோணங்கள்',
    operatorRemarksLabel: 'ஆபரேட்டர் குறிப்புகள்',
    adversarialBadge: 'பாதுகாப்பு சோதனை குறிப்பு',
    generatedCaseLabel: 'உருவாக்கப்பட்ட மாதிரி',
    steepeningLabel: 'கீழ்ப்பகுதி செங்குத்தாதல்',
    generatorNote: 'இழுத்தால் அதே பட பகுப்பாய்வு வழியாக புதிய செயற்கை மாதிரி உருவாகும்.',
    seedPrefix: 'விதை: ',
    seedRandom: 'சீரற்றது',
    generatedOperatorNote: 'உருவாக்கப்பட்ட செயற்கை படம்; ஆபரேட்டர் குறிப்பு இல்லை.',
    analyzeCaptureBtn: 'படத்தை பரிசோதி',
    toggleOverlayBtn: 'வளையங்களை காட்டு/மறை',
    qualityAdequate: 'சரியானது',
    qualityRepeat: 'மீண்டும் படம் தேவை',
    qualityEvaluating: 'மதிப்பிடப்படுகிறது...',

    // Image Metrics Table
    imageMetricsTitle: 'பிளாசிடோ வளைய அளவீடுகள் (analyze.js)',
    imageMetricsSubtitle: '360 ஆரங்களில் கணக்கிடப்பட்டது',
    colMetric: 'அளவீடு',
    colValue: 'மதிப்பு',
    colUnit: 'அலகு',
    colReference: 'இயல்பான வரம்பு',
    metricRingCount: 'வளையங்களின் எண்ணிக்கை',
    metricSpacingCV: 'வளைய இடைவெளி மாறுபாடு (CV)',
    metricIsAsymmetry: 'கீழ்-மேல் சமச்சீரற்ற குறியீடு (I-S)',
    metricMeridiansUsable: 'தெளிவான கோணங்களின் எண்ணிக்கை',
    metricMeanInferior: 'கீழ் பகுதி சராசரி இடைவெளி (210°–330°) ',
    metricMeanSuperior: 'மேல் பகுதி சராசரி இடைவெளி (30°–150°)',
    metricCentroid: 'மையப் புள்ளி அமைவிடம்',

    // Biometrics Table
    biometricsTitle: 'கார்னியா நேரடி அளவீடுகள்',
    biometricsSubtitle: 'கைமுறை உள்ளீடு / கருவி தரவு',
    colParameter: 'அளவீட்டு விவரம்',
    colThreshold: 'எச்சரிக்கை வரம்பு',
    paramK1: 'K1 (தட்டையான வளைவு)',
    paramK2: 'K2 (செங்குத்தான வளைவு)',
    paramAxis: 'கோண அளவு (Axis)',
    paramPachy: 'மைய கார்னியா தடிமன்',
    paramCyl: 'சிலிண்டர் பவர் (Cylinder)',

    // Verdict & Reason Codes
    verdictHeading: 'பரிசோதனை முடிவு (விதிமுறை என்ஜின்)',
    verdictNotEvaluated: 'பரிசோதிக்கப்படவில்லை (NOT_EVALUATED)',
    awaitingAnalysis: 'பரிசோதனை செய்யப்படவில்லை',
    flaggedDomainsNone: 'குறைபாடுள்ள பகுதிகள்: எதுவுமில்லை',
    flaggedDomainsPrefix: 'குறைபாடுள்ள பகுதிகள்: ',
    reasonCodesHeading: 'காரணக் குறியீடுகள் (விவரங்களை அறிய தொடவும்/பார்க்கவும்):',
    noReasonCodes: 'எதுவுமில்லை (அனைத்து அளவுகளும் இயல்பாக உள்ளன)',
    queueReferralBtn: 'மருத்துவரிடம் பரிந்துரைக்க அனுப்பு',
    queueRepeatBtn: 'மறுபடம் எடுக்க கோரிக்கை வை',

    // Reason Code Rule Condition Descriptions
    rule_IMG_SUSPICIOUS: 'spacingCV > 0.08 அல்லது isAsymmetry < -0.10',
    rule_IMG_REPEAT_REQUIRED: 'தரக்குறைவு: தெளிவான கோணங்கள் < 300',
    rule_K_HIGH: 'செங்குத்து வளைவு (K2) > 47.0 D',
    rule_PACHY_LOW: 'மைய கார்னியா தடிமன் < 470 µm',
    rule_CYL_HIGH: 'சிலிண்டர் பவர் அளவு > 1.50 D',
    rule_TWO_DOMAIN_ABNORMAL: '2 அல்லது அதற்கு மேற்பட்ட பகுதிகளில் குறைபாடு',

    // Reason Code Plain Spoken Descriptions (School Health Worker Register)
    desc_IMG_SUSPICIOUS: 'கார்னியா வளையங்கள் கீழ் பகுதியில் நெருக்கமாகவும் ஒழுங்கற்றதாகவும் உள்ளன.',
    desc_IMG_REPEAT_REQUIRED: 'இமை மூடியுள்ளது அல்லது அதிக ஒளி பட்டுள்ளது. மீண்டும் தெளிவாக படம் எடுக்க வேண்டும்.',
    desc_K_HIGH: 'கார்னியாவின் வளைவு வழக்கத்தை விட அதிகமாக உள்ளது (47.0 D-க்கு மேல்).',
    desc_PACHY_LOW: 'மையக் கார்னியா மிக மெலிதாக உள்ளது (470 µm-க்கு கீழ்).',
    desc_CYL_HIGH: 'கண்ணின் உருளைத்திறன் (Cylinder) அதிகமாக உள்ளது (1.50 D-க்கு மேல்).',
    desc_TWO_DOMAIN_ABNORMAL: 'படம், வளைவு, தடிமன் ஆகியவற்றில் இரண்டில் குறைபாடு உள்ளது.',

    // Approval Queue & Guard
    queueEmpty: 'பரிந்துரை மற்றும் மறுபரிசீலனைக்கான கோரிக்கைகள் இந்த வரிசையில் தோன்றும்.',
    pendingSuffix: 'நிலுவையில்',
    cardActionPrefix: 'செயல்: ',
    cardReasonPrefix: 'காரணங்கள்: ',
    btnApproveReferral: 'பரிந்துரையை உறுதிசெய்',
    btnApproveRepeat: 'மறுபடத்தை உறுதிசெய்',
    btnRejectReferral: 'பரிந்துரையை நிராகரி',
    btnRejectRepeat: 'மறுபடத்தை நிராகரி',
    statusApproved: 'ஒப்புதல் அளிக்கப்பட்டது',
    statusStaleMeasurements: 'அளவீடுகள் மாறிவிட்டன — புதிய ஒப்புதல் கோரிக்கையைச் சமர்ப்பிக்கவும்.',
    statusRejected: 'நிராகரிக்கப்பட்டது',
    statusFinalized: 'மருத்துவர் ஒப்புதலுடன் அறிக்கை முடிக்கப்பட்டது',
    tokenLabel: 'ஒருமுறை பயன்பாட்டு டோக்கன் (5 நிமிடம் மட்டும்)',

    // Security Gate & Demo
    guardSectionTitle: 'பாதுகாப்பு சோதனை',
    btnDemoUnapprovedFinalize: 'ஒப்புதலின்றி முடிக்க முயற்சி செய் (Demo)',
    btnDemoCaseDInjection: 'உருவகப்படுத்தப்பட்ட தவிர்ப்பு முயற்சி (நிர்ணயிக்கப்பட்டது)',
    tokenMissingTitle: 'TOKEN_MISSING (டோக்கன் இல்லை)',
    tokenMissingMsg: 'தடைசெய்யப்பட்டது: மருத்துவர் ஒப்புதல் டோக்கன் இல்லாமல் அறிக்கையை முடிக்க முடியாது.',
    tokenMissingAdversarialMsg: 'தடைசெய்யப்பட்டது: ஒப்புதல் டோக்கன் இல்லை. Case metadata டோக்கனை உருவாக்க முடியாது — மனிதர் DOM-இல் செய்யும் செயலால் மட்டுமே அது உருவாகும்.',

    // Audit Trail
    auditTitle: 'செயல்பாட்டு பதிவு (Audit Trail)',
    btnExportAudit: 'JSON கோப்பாக பதிவிறக்கு',

    // Footer
    footerBanner: 'செயற்கை மாதிரி தரவு மட்டுமே. மருத்துவ நோயறிதலுக்கு அல்ல.',
  },
};

/**
 * Get localized string by key and language code.
 * @param {string} key
 * @param {string} lang - 'en' | 'ta'
 * @returns {string}
 */
export function t(key, lang = 'en') {
  const dict = STRINGS[lang] || STRINGS.en;
  return dict[key] ?? STRINGS.en[key] ?? key;
}

/**
 * Generate plain-language clinical explanation of topography & biometric evidence.
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.language - 'en' | 'ta'
 * @param {object} params.imageResult
 * @param {object} params.measurements
 * @param {object} params.referralResult
 * @returns {string}
 */
export function generateEvidenceExplanation({
  caseId = CASES.CASE_A,
  language = 'en',
  imageResult,
  measurements,
  referralResult,
}) {
  const isTamil = language === 'ta';
  const { verdict, reasonCodes = [], domainsFlagged = [] } = referralResult || {};
  const { spacingCV, isAsymmetry, meridiansUsable, quality } = imageResult || {};
  const { K2, pachymetry, cylinder } = measurements || {};

  if (isTamil) {
    // ── TAMIL (தமிழ்) — எளிய பேச்சுத் தமிழ் (Outreach Worker Register: கார்னியா) ───
    if (quality === 'repeat_required' || reasonCodes.includes(REASON_CODES.IMG_REPEAT_REQUIRED)) {
      return (
        `படப்பதிவு தரம் போதாது: கண் இமை மூடல் அல்லது அதிகப்படியான ஒளி வெளிச்சம் காரணமாக ` +
        `360 கோணங்களில் ${meridiansUsable ?? '--'} கோணங்கள் மட்டுமே தெளிவாக பதிவாகியுள்ளன (குறைந்தபட்சம் 300 தேவை). ` +
        `படத்தின் தரம் குறைவாக உள்ளதால் (IMG_REPEAT_REQUIRED) கண் நிலையை கணிக்க முடியாது. ` +
        `எனவே மாணவருக்கு மீண்டும் தெளிவாக படம் எடுக்க வேண்டும் (REPEAT_SCAN).`
      );
    }

    if (verdict === VERDICTS.REFER) {
      const domainNames = {
        image: 'கார்னியா வளைய படம்',
        keratometry: 'வளைவு அளவு',
        pachymetry: 'கார்னியா தடிமன்',
      };
      const flaggedDesc = domainsFlagged.map((d) => domainNames[d] || d).join(', ');

      // Only state a finding whose reason code actually fired. REFER can be reached
      // from any single domain, so an unconditional template would assert findings
      // the numbers it quotes in the same sentence contradict.
      const findings = [];
      if (reasonCodes.includes(REASON_CODES.IMG_SUSPICIOUS)) {
        findings.push(
          `கண் கார்னியாவின் கீழ் பகுதியில் வளையங்கள் நெருக்கமாகவும் வளைந்தும் காணப்படுகின்றன ` +
          `(I-S குறியீடு: ${isAsymmetry?.toFixed(3)}, இடைவெளி மாறுபாடு: ${spacingCV?.toFixed(3)})`
        );
      }
      if (reasonCodes.includes(REASON_CODES.K_HIGH)) {
        findings.push(`கார்னியா வளைவு அதிகமாக உள்ளது (K2: ${K2?.toFixed(1)} D > 47.0 D)`);
      }
      if (reasonCodes.includes(REASON_CODES.PACHY_LOW)) {
        findings.push(`மையக் கார்னியா மிக மெலிதாக உள்ளது (${pachymetry} µm < 470 µm)`);
      }
      if (reasonCodes.includes(REASON_CODES.CYL_HIGH)) {
        findings.push(`கண்ணின் உருளைத்திறன் அதிகமாக உள்ளது (${cylinder?.toFixed(2)} D > 1.50 D)`);
      }

      const findingsText = findings.length > 0
        ? findings.join('; ')
        : `விதிமுறை வரம்பு தாண்டியுள்ளது (${reasonCodes.join(', ')})`;
      const closing = reasonCodes.includes(REASON_CODES.TWO_DOMAIN_ABNORMAL)
        ? `இரண்டுக்கும் மேற்பட்ட பகுதிகளில் (${flaggedDesc}) குறைபாடு இருப்பதால், கார்னியா கூம்பு நோய் (கெரடோகோனஸ்) சாத்தியத்தை ஒதுக்க முடியாது. உடனடியாக சிறப்பு கண் மருத்துவரிடம் பரிசோதனைக்கு அனுப்ப வேண்டும்.`
        : `குறைபாடு உள்ள பகுதி (${flaggedDesc}). உறுதிப்படுத்த சிறப்பு கண் மருத்துவரிடம் பரிசோதனைக்கு அனுப்ப வேண்டும்.`;

      return `கண் மருத்துவரிடம் பரிந்துரைக்க வேண்டும் (REFER): ${findingsText}. ${closing}`;
    }

    return (
      `வழக்கமான கண் பரிசோதனை போதுமானது (ROUTINE_FOLLOWUP): தெளிவாகப் பதிவான ${meridiansUsable ?? '--'} கோணங்களிலும் கார்னியா வளையங்கள் ` +
      `சீரான இடைவெளியுடன் வட்டமாக உள்ளன (இடைவெளி மாறுபாடு: ${spacingCV?.toFixed(3)}, சமச்சீரின்மை: ${isAsymmetry?.toFixed(3)}). ` +
      `கார்னியா வளைவு (K2: ${K2?.toFixed(1)} D) மற்றும் மையத் தடிமன் (${pachymetry} µm) நல்ல இயல்பான அளவில் உள்ளன. ` +
      `சிறப்பு பரிந்துரை தேவையில்லை.`
    );
  }

  // ── ENGLISH (Default) ────────────────────────────────────────────────────────
  if (quality === 'repeat_required' || reasonCodes.includes(REASON_CODES.IMG_REPEAT_REQUIRED)) {
    return (
      `Inadequate capture quality: Eyelid/eyelash occlusion and specular glare resulted in only ` +
      `${meridiansUsable ?? '--'} of 360 usable radial meridians (< 300 threshold). ` +
      `Capture is marked IMG_REPEAT_REQUIRED. Inadequate capture is not evidence of disease; ` +
      `a repeat topography scan is required before clinical referral evaluation.`
    );
  }

  if (verdict === VERDICTS.REFER) {
    const reasonsStr = reasonCodes.join(', ');
    const domainsStr = domainsFlagged.join(', ');

    // Only state a finding whose reason code actually fired. REFER can be reached
    // from any single domain, so an unconditional template would assert findings
    // the numbers it quotes in the same sentence contradict.
    const findings = [];
    if (reasonCodes.includes(REASON_CODES.IMG_SUSPICIOUS)) {
      findings.push(
        `Placido mire analysis shows irregular or inferiorly crowded rings ` +
        `(I-S asymmetry index: ${isAsymmetry?.toFixed(3)}, Spacing CV: ${spacingCV?.toFixed(3)})`
      );
    }
    if (reasonCodes.includes(REASON_CODES.K_HIGH)) {
      findings.push(`steep keratometry (K2: ${K2?.toFixed(1)} D > 47.0 D)`);
    }
    if (reasonCodes.includes(REASON_CODES.PACHY_LOW)) {
      findings.push(`thin central pachymetry (${pachymetry} µm < 470 µm)`);
    }
    if (reasonCodes.includes(REASON_CODES.CYL_HIGH)) {
      findings.push(`elevated cylinder (${cylinder?.toFixed(2)} D > 1.50 D)`);
    }

    const findingsText = findings.length > 0
      ? findings.join('; ')
      : `rule thresholds crossed (${reasonsStr})`;
    const closing = reasonCodes.includes(REASON_CODES.TWO_DOMAIN_ABNORMAL)
      ? `Two or more independent domains are abnormal, so corneal ectasia cannot be excluded. Escalate for specialist clinical assessment.`
      : `Escalate for specialist clinical assessment to confirm or exclude the finding.`;

    return (
      `Referral indicated (REFER): ${findingsText}. ` +
      `Abnormal domains: {${domainsStr}} with codes [${reasonsStr}]. ${closing}`
    );
  }

  return (
    `Routine follow-up (ROUTINE_FOLLOWUP): Placido mire reflections demonstrate regular, concentric, ` +
    `and evenly spaced rings across ${meridiansUsable ?? '--'} of 360 usable meridians (Spacing CV: ${spacingCV?.toFixed(3)}, ` +
    `I-S asymmetry: ${isAsymmetry?.toFixed(3)}). Keratometric steep-K (K2: ${K2?.toFixed(1)} D) ` +
    `and central corneal thickness (${pachymetry} µm) are within normal baseline limits.`
  );
}
