/**
 * i18n.js - Multi-language clinical evidence explanation generator.
 * Supports English ('en') and Tamil ('ta').
 */

import { CASES } from './synth.js';
import { VERDICTS, REASON_CODES } from './rules.js';

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
    // ── TAMIL (தமிழ்) ──────────────────────────────────────────────────────────
    if (quality === 'repeat_required' || reasonCodes.includes(REASON_CODES.IMG_REPEAT_REQUIRED)) {
      return (
        `படப்பதிவு தரம் போதாது: இமை மூடல் அல்லது அதிகப்படியான ஒளி பிரதிபலிப்பு காரணமாக 360 ஆரங்களில் ` +
        `${meridiansUsable ?? '--'} கோணங்கள் மட்டுமே பயன்படுத்தக்கூடியதாக உள்ளன (குறைந்தபட்ச வரம்பு 300). ` +
        `படத்தின் தரம் குறைவாக உள்ளதால் (IMG_REPEAT_REQUIRED) நோய் முடிவு எடுக்க முடியாது. ` +
        `மீண்டும் ஸ்கேன் செய்ய பரிந்துரைக்கப்படுகிறது (REPEAT_SCAN).`
      );
    }

    if (verdict === VERDICTS.REFER) {
      const flaggedDesc = domainsFlagged.length > 0 ? domainsFlagged.join(', ') : 'பல காரணிகள்';
      return (
        `பரிந்துரை தேவை (REFER): கீழ் கருவிழி பகுதியில் பிளாசிடோ வளையங்கள் நெருக்கமாகவும் மாறுபட்டும் உள்ளன ` +
        `(I-S சமச்சீரற்ற குறியீடு: ${isAsymmetry?.toFixed(3)}, இடைவெளி மாறுபாடு CV: ${spacingCV?.toFixed(3)}). ` +
        `செங்குத்தான கருவிழி வளைவு (K2: ${K2?.toFixed(1)} D) மற்றும் மெல்லிய கருவிழி தடிமன் ` +
        `(${pachymetry} µm) ஆகியவை பல குறைபாடுகளைக் காட்டுகின்றன (${flaggedDesc}). ` +
        `கருவிழி விரிசல் (கெரடோகோனஸ்) பரிசோதனைக்காக சிறப்பு மருத்துவரிடம் பரிந்துரைக்கப்படுகிறது.`
      );
    }

    return (
      `வழக்கமான பரிசோதனை (ROUTINE_FOLLOWUP): பிளாசிடோ வளையங்கள் 360 பாகைகளிலும் சீரான இடைவெளியுடன் ` +
      `சமச்சீராக உள்ளன (CV: ${spacingCV?.toFixed(3)}, I-S: ${isAsymmetry?.toFixed(3)}). ` +
      `கருவிழி வளைவு (K2: ${K2?.toFixed(1)} D) மற்றும் தடிமன் (${pachymetry} µm) இயல்பான வரம்பிற்குள் உள்ளன. ` +
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
    return (
      `Referral indicated (REFER): Placido mire analysis shows significant inferior ring crowding ` +
      `(I-S asymmetry index: ${isAsymmetry?.toFixed(3)}, Spacing CV: ${spacingCV?.toFixed(3)}). ` +
      `Corroborated by steep keratometry (K2: ${K2?.toFixed(1)} D > 47.0 D) and thin central pachymetry ` +
      `(${pachymetry} µm < 470 µm), triggering abnormal domains: {${domainsStr}} with codes [${reasonsStr}]. ` +
      `Escalate for specialist clinical assessment of corneal ectasia.`
    );
  }

  return (
    `Routine follow-up (ROUTINE_FOLLOWUP): Placido mire reflections demonstrate regular, concentric, ` +
    `and evenly spaced rings across all 360 meridians (Spacing CV: ${spacingCV?.toFixed(3)}, ` +
    `I-S asymmetry: ${isAsymmetry?.toFixed(3)}). Keratometric steep-K (K2: ${K2?.toFixed(1)} D) ` +
    `and central corneal thickness (${pachymetry} µm) are within normal baseline limits.`
  );
}
