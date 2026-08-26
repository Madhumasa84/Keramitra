/**
 * rules.js - Transparent rule engine for corneal topography referral decisions.
 *
 * Three independent evidence domains: Image, Keratometry, Pachymetry.
 * Plus cylinder as a supporting signal.
 *
 * No model, no score — explicit thresholds producing named reason codes.
 */

// Demonstration thresholds. Values are illustrative and are NOT
// clinically validated. Real deployment requires thresholds agreed
// with the supervising clinical team, and specification of whether
// K refers to steep-K or mean-K, and whether pachymetry is central
// or thinnest-point. See README.
export const THRESHOLDS = {
  // Image domain (from analyzeRings output)
  IMG_SPACING_CV:       0.08,   // spacingCV above this → suspicious (irregular mire spacing)
  IMG_IS_ASYMMETRY:    -0.10,   // isAsymmetry below this (more negative) → suspicious (inferior compression)

  // Keratometry domain
  K_STEEP_MAX:         47.0,    // K2 (steep meridian) in dioptres; above this → K_HIGH

  // Pachymetry domain
  PACHY_CENTRAL_MIN:  470.0,    // central corneal thickness in µm; below this → PACHY_LOW

  // Supporting signal
  CYL_MAG_MAX:          1.5,    // cylinder magnitude in dioptres; above this → CYL_HIGH

  // Multi-domain flag: how many independent domains must be abnormal for TWO_DOMAIN_ABNORMAL
  TWO_DOMAIN_MIN_COUNT: 2,

  // Minimum usable meridians required for image quality (already defined in analyze.js
  // as 300, mirrored here for documentation completeness; analyze.js is authoritative)
  IMG_MERIDIANS_USABLE: 300,
};

/**
 * Reason code definitions (exhaustive list).
 * Each code maps to the specific condition that triggers it.
 */
export const REASON_CODES = {
  IMG_SUSPICIOUS:       'IMG_SUSPICIOUS',       // spacingCV or isAsymmetry threshold crossed
  IMG_REPEAT_REQUIRED:  'IMG_REPEAT_REQUIRED',  // quality === "repeat_required"
  K_HIGH:               'K_HIGH',               // steep-K (K2) > threshold
  PACHY_LOW:            'PACHY_LOW',            // central thickness < threshold
  CYL_HIGH:             'CYL_HIGH',             // cylinder magnitude > threshold
  TWO_DOMAIN_ABNORMAL:  'TWO_DOMAIN_ABNORMAL',  // ≥2 of image/keratometry/pachymetry flagged
};

/** Final verdict tokens */
export const VERDICTS = {
  REFER:             'REFER',
  REPEAT_SCAN:       'REPEAT_SCAN',
  ROUTINE_FOLLOWUP:  'ROUTINE_FOLLOWUP',
};

/**
 * Evaluate referral decision from image analysis results and clinical measurements.
 *
 * @param {object} params
 * @param {object} params.imageResult  - Return value of analyzeRings()
 *   { spacingCV, isAsymmetry, quality, meridiansUsable, ... }
 * @param {object} params.measurements - Clinical keratometry + pachymetry
 *   { K1: number, K2: number, axis: number, pachymetry: number, cylinder: number }
 *
 * @returns {{ verdict: string, reasonCodes: string[], domainsFlagged: string[] }}
 */
export function evaluateReferral({ imageResult, measurements }) {
  const codes = new Set();
  const domainsFlagged = new Set(); // 'image' | 'keratometry' | 'pachymetry'

  // ── IMAGE DOMAIN ─────────────────────────────────────────────────────────────

  // A repeat-required capture is not evidence of disease; it forces REPEAT_SCAN
  // and must suppress (not contribute to) the referral pathway.
  const imageCaptureUsable = imageResult.quality !== 'repeat_required';

  if (!imageCaptureUsable) {
    codes.add(REASON_CODES.IMG_REPEAT_REQUIRED);
    // Do NOT flag imageResult domain for TWO_DOMAIN_ABNORMAL:
    // a bad capture tells us nothing about the cornea.
  } else {
    // Only evaluate image metrics when capture quality is adequate.
    const imgSuspicious =
      imageResult.spacingCV > THRESHOLDS.IMG_SPACING_CV ||
      imageResult.isAsymmetry < THRESHOLDS.IMG_IS_ASYMMETRY;

    if (imgSuspicious) {
      codes.add(REASON_CODES.IMG_SUSPICIOUS);
      domainsFlagged.add('image');
    }
  }

  // ── KERATOMETRY DOMAIN ───────────────────────────────────────────────────────

  const { K1, K2, pachymetry, cylinder } = measurements;
  const steepK = Math.max(K1 ?? 0, K2 ?? 0); // defensive: K2 should be the steep meridian

  if (steepK > THRESHOLDS.K_STEEP_MAX) {
    codes.add(REASON_CODES.K_HIGH);
    domainsFlagged.add('keratometry');
  }

  // ── PACHYMETRY DOMAIN ────────────────────────────────────────────────────────

  if (pachymetry < THRESHOLDS.PACHY_CENTRAL_MIN) {
    codes.add(REASON_CODES.PACHY_LOW);
    domainsFlagged.add('pachymetry');
  }

  // ── SUPPORTING SIGNAL (cylinder) ─────────────────────────────────────────────
  // Cylinder is not an independent domain for TWO_DOMAIN_ABNORMAL but is
  // reported as a reason code when elevated — it can strengthen a referral.

  if (Math.abs(cylinder ?? 0) > THRESHOLDS.CYL_MAG_MAX) {
    codes.add(REASON_CODES.CYL_HIGH);
  }

  // ── TWO-DOMAIN FLAG ───────────────────────────────────────────────────────────

  if (domainsFlagged.size >= THRESHOLDS.TWO_DOMAIN_MIN_COUNT) {
    codes.add(REASON_CODES.TWO_DOMAIN_ABNORMAL);
  }

  // ── VERDICT LOGIC ─────────────────────────────────────────────────────────────
  //
  // Priority order:
  //   1. IMG_REPEAT_REQUIRED → REPEAT_SCAN (suppresses referral; bad capture ≠ disease)
  //   2. TWO_DOMAIN_ABNORMAL or K_HIGH or PACHY_LOW or IMG_SUSPICIOUS → REFER
  //   3. Otherwise → ROUTINE_FOLLOWUP

  let verdict;

  if (codes.has(REASON_CODES.IMG_REPEAT_REQUIRED)) {
    verdict = VERDICTS.REPEAT_SCAN;
  } else if (
    codes.has(REASON_CODES.TWO_DOMAIN_ABNORMAL) ||
    codes.has(REASON_CODES.K_HIGH) ||
    codes.has(REASON_CODES.PACHY_LOW) ||
    codes.has(REASON_CODES.IMG_SUSPICIOUS)
  ) {
    verdict = VERDICTS.REFER;
  } else {
    verdict = VERDICTS.ROUTINE_FOLLOWUP;
  }

  return {
    verdict,
    reasonCodes: [...codes],
    domainsFlagged: [...domainsFlagged],
  };
}
