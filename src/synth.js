/**
 * synth.js - Synthetic Placido Disc Mire Pattern Generator
 * Generates synthetic Placido keratoscopy images for corneal analysis.
 */

export const CASES = {
  CASE_A: 'CASE_A', // Normal regular cornea: concentric, evenly spaced rings
  CASE_B: 'CASE_B', // Keratoconus / Inferior steepening: compressed inferior rings
  CASE_C: 'CASE_C', // Artefacts: eyelid/eyelash occlusion + glare saturation
};

/**
 * Plausible synthetic keratometry + pachymetry measurements per case.
 *
 * Chosen so that, combined with the real image analysis numbers from analyzeRings():
 *   CASE_A → ROUTINE_FOLLOWUP  (all domains normal)
 *   CASE_B → REFER / TWO_DOMAIN_ABNORMAL (image suspicious + K_HIGH + PACHY_LOW)
 *   CASE_C → REPEAT_SCAN       (image quality repeat_required suppresses verdict)
 *
 * Units: K1/K2 in dioptres, axis in degrees, pachymetry in µm, cylinder in dioptres.
 *
 * These values are illustrative only. See README for clinical disclaimer.
 */
export const SYNTHETIC_MEASUREMENTS = {
  [CASES.CASE_A]: {
    K1:         43.2,   // flat meridian, normal range 40–46 D
    K2:         43.8,   // steep meridian, normal
    axis:        92,    // near-horizontal astigmatism
    pachymetry: 548,    // central thickness, normal (520–600 µm)
    cylinder:    0.6,   // low cylinder, sub-threshold
  },
  [CASES.CASE_B]: {
    K1:         44.5,   // flat meridian
    K2:         48.6,   // steep meridian > 47.0 D threshold → K_HIGH
    axis:        98,
    pachymetry: 452,    // thin cornea < 470 µm → PACHY_LOW
    cylinder:    2.1,   // elevated → CYL_HIGH (supporting signal)
  },
  [CASES.CASE_C]: {
    K1:         43.5,   // otherwise-normal keratometry
    K2:         44.1,
    axis:        88,
    pachymetry: 531,    // normal pachymetry
    cylinder:    0.75,  // sub-threshold cylinder
  },
};

/**
 * Generate synthetic Placido disc image data.
 * @param {string} caseId - 'CASE_A', 'CASE_B', or 'CASE_C'
 * @param {number} width - image width (default 512)
 * @param {number} height - image height (default 512)
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function generatePlacidoImageData(caseId = CASES.CASE_A, width = 512, height = 512) {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const numRings = 14;
  const baseSpacing = 14.0;
  const innerRadius = 16.0;
  const ringSigma = 2.4; // Ring line thickness

  // Precompute base ring radii
  const baseRadii = [];
  for (let k = 0; k < numRings; k++) {
    baseRadii.push(innerRadius + k * baseSpacing);
  }

  // Generate pixel data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      // Angle in degrees [0, 360), 0=East (right), 90=North (superior), 270=South (inferior)
      let angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
      if (angleDeg < 0) angleDeg += 360;

      // Central camera aperture / alignment dot
      if (r < 4.0) {
        data[idx] = 240;
        data[idx + 1] = 240;
        data[idx + 2] = 240;
        data[idx + 3] = 255;
        continue;
      }

      if (r < 10.0 || r > baseRadii[numRings - 1] + 18.0) {
        // Outside disc boundary or inner central camera deadzone
        data[idx] = 12;
        data[idx + 1] = 14;
        data[idx + 2] = 18;
        data[idx + 3] = 255;
        continue;
      }

      // Compute ring positions for this angle
      let ringIntensity = 0;

      if (caseId === CASES.CASE_B || caseId === 'B') {
        // CASE_B: Keratoconus / Inferior Ectasia
        // Inferior steepening causes mires to crowd together (compression) in inferior sector (210°–330°)
        const rad = (angleDeg * Math.PI) / 180;
        // Inferior weight centered at 270° (sin is -1)
        const inferiorFactor = Math.max(0, -Math.sin(rad));
        const inferiorWeight = Math.pow(inferiorFactor, 2.2);

        // Radial ring positions with inferior compression
        let currentR = innerRadius;
        for (let k = 0; k < numRings; k++) {
          if (k > 0) {
            // Steepening compresses spacing in inferior cornea (e.g. by ~42%)
            const radialSteepening = Math.sin((k / numRings) * Math.PI); // peak steepening mid-cornea
            const compression = 1.0 - 0.42 * inferiorWeight * radialSteepening;
            currentR += baseSpacing * compression;
          }
          const dist = r - currentR;
          const mire = Math.exp(-(dist * dist) / (2 * ringSigma * ringSigma));
          if (mire > ringIntensity) ringIntensity = mire;
        }
      } else {
        // CASE_A and baseline for CASE_C: regular concentric circular rings
        for (let k = 0; k < numRings; k++) {
          const targetR = baseRadii[k];
          const dist = r - targetR;
          const mire = Math.exp(-(dist * dist) / (2 * ringSigma * ringSigma));
          if (mire > ringIntensity) ringIntensity = mire;
        }
      }

      // Compute base grayscale value [15 .. 245]
      let val = 15 + ringIntensity * 230;

      // Add mild noise for realism
      const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      val += (noise - 0.5) * 6;

      // CASE_C: Artefacts (Eyelid / eyelash occlusion + specular glare)
      if (caseId === CASES.CASE_C || caseId === 'C') {
        // 1. Superior eyelid & eyelash occlusion (40° to 140°)
        if (angleDeg >= 40 && angleDeg <= 140) {
          // Superior eyelid boundary drooping down over superior cornea
          const lidCutoff = cy - 25 + Math.cos(((angleDeg - 90) / 50) * (Math.PI / 2)) * 35;
          if (y < lidCutoff) {
            // Complete eyelid tissue occlusion (flat dark tissue)
            val = 14 + (noise - 0.5) * 4;
          } else if (y < lidCutoff + 30) {
            // Eyelashes crossing the remaining narrow exposed sector
            val = 16 + (noise - 0.5) * 6;
          }
        }

        // 2. Glare artifact: Saturated reflection streak / spot (200° to 245°)
        if (angleDeg >= 200 && angleDeg <= 245 && r > 20 && r < 200) {
          val = 255;
        }
      }

      // Clamp to [0, 255]
      const finalVal = Math.max(0, Math.min(255, Math.round(val)));
      data[idx] = finalVal;
      data[idx + 1] = finalVal;
      data[idx + 2] = finalVal;
      data[idx + 3] = 255;
    }
  }

  return { width, height, data };
}

/**
 * Render synthetic case to an HTML Canvas element
 * @param {HTMLCanvasElement} canvas
 * @param {string} caseId
 */
export function renderPlacidoToCanvas(canvas, caseId = CASES.CASE_A) {
  const ctx = canvas.getContext('2d');
  const imgData = generatePlacidoImageData(caseId, canvas.width, canvas.height);
  const imageDataObj = ctx.createImageData(canvas.width, canvas.height);
  imageDataObj.data.set(imgData.data);
  ctx.putImageData(imageDataObj, 0, 0);
}
