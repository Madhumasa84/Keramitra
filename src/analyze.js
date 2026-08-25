/**
 * analyze.js - Genuine Placido Disc Mire Pattern Topography Analyzer
 * Analyzes corneal Placido ring reflections from raw pixel data.
 */

/**
 * Locate the disc centre by intensity-weighted centroid of the bright pixels.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @returns {{ cx: number, cy: number }}
 */
function locateDiscCenter(imageData) {
  const { width, height, data } = imageData;
  const numPixels = width * height;

  // First pass: compute mean grayscale intensity to establish an adaptive threshold
  let sumIntensity = 0;
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const intensity = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    sumIntensity += intensity;
  }
  const meanIntensity = sumIntensity / numPixels;
  const threshold = Math.max(30, meanIntensity * 0.85);

  // Second pass: compute weighted centroid of pixels brighter than threshold
  let sumWeight = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const intensity = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (intensity > threshold) {
        const weight = intensity - threshold;
        sumWeight += weight;
        sumX += x * weight;
        sumY += y * weight;
      }
    }
  }

  const cx = sumWeight > 0 ? sumX / sumWeight : width / 2;
  const cy = sumWeight > 0 ? sumY / sumWeight : height / 2;
  return { cx, cy };
}

/**
 * Sample grayscale intensity with bilinear interpolation.
 */
function sampleGrayscaleBilinear(data, width, height, x, y) {
  if (x < 0 || x >= width - 1 || y < 0 || y >= height - 1) {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
    const idx = (cy * width + cx) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;

  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  const i00 = 0.299 * data[idx00] + 0.587 * data[idx00 + 1] + 0.114 * data[idx00 + 2];
  const i10 = 0.299 * data[idx10] + 0.587 * data[idx10 + 1] + 0.114 * data[idx10 + 2];
  const i01 = 0.299 * data[idx01] + 0.587 * data[idx01 + 1] + 0.114 * data[idx01 + 2];
  const i11 = 0.299 * data[idx11] + 0.587 * data[idx11 + 1] + 0.114 * data[idx11 + 2];

  return (1 - fx) * (1 - fy) * i00 + fx * (1 - fy) * i10 + (1 - fx) * fy * i01 + fx * fy * i11;
}

/**
 * Check if a radial intensity profile is usable (not saturated by glare, not flat from occlusion).
 */
function evaluateMeridianUsability(profile) {
  const n = profile.length;
  if (n === 0) return { usable: false, reason: 'empty' };

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let saturatedCount = 0;
  let maxConsecutiveSaturated = 0;
  let currentConsecutiveSaturated = 0;

  for (let i = 0; i < n; i++) {
    const val = profile[i];
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;

    if (val >= 248) {
      saturatedCount++;
      currentConsecutiveSaturated++;
      if (currentConsecutiveSaturated > maxConsecutiveSaturated) {
        maxConsecutiveSaturated = currentConsecutiveSaturated;
      }
    } else {
      currentConsecutiveSaturated = 0;
    }
  }

  const mean = sum / n;
  let varianceSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = profile[i] - mean;
    varianceSum += diff * diff;
  }
  const std = Math.sqrt(varianceSum / n);
  const range = max - min;

  // Glare check: saturated portion of profile
  const saturatedFraction = saturatedCount / n;
  if (saturatedFraction > 0.16 || maxConsecutiveSaturated >= 20 || mean > 230) {
    return { usable: false, reason: 'saturated_glare', mean, std, range };
  }

  // Occlusion check: flat profile (eyelid, eyelashes, low contrast)
  if (std < 18 || range < 45 || mean < 25) {
    return { usable: false, reason: 'flat_occlusion', mean, std, range };
  }

  return { usable: true, reason: 'ok', mean, std, range };
}

/**
 * Detect ring crossings (peaks) along a 1D radial intensity profile.
 */
function detectRingCrossings(profile, radii) {
  const n = profile.length;
  // Apply 5-point smoothing filter
  const smoothed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p0 = profile[Math.max(0, i - 2)];
    const p1 = profile[Math.max(0, i - 1)];
    const p2 = profile[i];
    const p3 = profile[Math.min(n - 1, i + 1)];
    const p4 = profile[Math.min(n - 1, i + 2)];
    smoothed[i] = 0.1 * p0 + 0.25 * p1 + 0.3 * p2 + 0.25 * p3 + 0.1 * p4;
  }

  const peaks = [];
  const minPeakDistance = 6.0; // minimum radial distance in pixels
  const minProminence = 18.0;

  for (let i = 2; i < n - 2; i++) {
    const val = smoothed[i];
    if (val > smoothed[i - 1] && val >= smoothed[i + 1] && val > 40) {
      // Check prominence in local window
      const win = 14;
      let minLeft = val;
      for (let j = Math.max(0, i - win); j < i; j++) {
        if (smoothed[j] < minLeft) minLeft = smoothed[j];
      }
      let minRight = val;
      for (let j = i + 1; j <= Math.min(n - 1, i + win); j++) {
        if (smoothed[j] < minRight) minRight = smoothed[j];
      }
      const prominence = val - Math.max(minLeft, minRight);

      if (prominence >= minProminence) {
        // Subpixel refinement via parabolic fit
        const y0 = smoothed[i - 1];
        const y1 = smoothed[i];
        const y2 = smoothed[i + 1];
        const denom = 2 * (2 * y1 - y0 - y2);
        let offset = 0;
        if (Math.abs(denom) > 1e-4) {
          offset = (y0 - y2) / denom;
          offset = Math.max(-0.5, Math.min(0.5, offset));
        }

        const stepR = (radii[radii.length - 1] - radii[0]) / (n - 1);
        const peakR = radii[i] + offset * stepR;

        // Ensure minimum distance from previous peak
        if (peaks.length === 0 || peakR - peaks[peaks.length - 1] >= minPeakDistance) {
          peaks.push(peakR);
        }
      }
    }
  }

  return peaks;
}

/**
 * Analyze Placido disc rings from raw image data.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @returns {{ ringCount: number, spacingCV: number, isAsymmetry: number, meridiansUsable: number, quality: string, metrics: object }}
 */
export function analyzeRings(imageData) {
  if (!imageData || !imageData.data || imageData.width <= 0 || imageData.height <= 0) {
    throw new Error('Invalid ImageData supplied to analyzeRings');
  }

  const { width, height, data } = imageData;

  // 1. Locate disc centre by intensity-weighted centroid of bright pixels
  const { cx, cy } = locateDiscCenter(imageData);

  // 2. Define radial sampling parameters
  const maxRadius = Math.min(cx, cy, width - cx, height - cy) - 14;
  const minRadius = 14.0; // Start just outside central camera LED aperture
  const radialStep = 0.5; // Half-pixel step for radial sampling
  const numSamples = Math.floor((maxRadius - minRadius) / radialStep) + 1;

  const radii = new Float32Array(numSamples);
  for (let s = 0; s < numSamples; s++) {
    radii[s] = minRadius + s * radialStep;
  }

  // 3. Sample 360 radial meridians, 1° apart
  const meridians = [];
  const usableMeridians = [];
  const allSpacings = [];
  const inferiorSpacings = []; // 210°–330°
  const superiorSpacings = []; // 30°–150°
  const crossingCounts = [];

  for (let deg = 0; deg < 360; deg++) {
    // 0° = East (horizontal right), 90° = North (superior / top), 270° = South (inferior / bottom)
    const rad = (deg * Math.PI) / 180;
    const cosAngle = Math.cos(rad);
    const sinAngle = -Math.sin(rad); // Screen y is inverted

    const profile = new Float32Array(numSamples);
    for (let s = 0; s < numSamples; s++) {
      const r = radii[s];
      const px = cx + r * cosAngle;
      const py = cy + r * sinAngle;
      profile[s] = sampleGrayscaleBilinear(data, width, height, px, py);
    }

    // Evaluate meridian usability
    const usability = evaluateMeridianUsability(profile);
    const meridianRecord = {
      deg,
      usable: usability.usable,
      reason: usability.reason,
      peaks: [],
      spacings: [],
    };

    if (usability.usable) {
      // 4. Detect ring crossings by peak-finding on intensity profile
      const peaks = detectRingCrossings(profile, radii);
      meridianRecord.peaks = peaks;
      crossingCounts.push(peaks.length);

      // Compute inter-ring spacings
      const spacings = [];
      for (let k = 0; k < peaks.length - 1; k++) {
        const spacing = peaks[k + 1] - peaks[k];
        spacings.push(spacing);
        allSpacings.push(spacing);

        // Inferior sector (210°–330°)
        if (deg >= 210 && deg <= 330) {
          inferiorSpacings.push(spacing);
        }

        // Superior sector (30°–150°)
        if (deg >= 30 && deg <= 150) {
          superiorSpacings.push(spacing);
        }
      }
      meridianRecord.spacings = spacings;
      usableMeridians.push(meridianRecord);
    }

    meridians.push(meridianRecord);
  }

  // 5. Compute metrics
  const meridiansUsable = usableMeridians.length;
  const quality = meridiansUsable >= 300 ? 'adequate' : 'repeat_required';

  // ringCount = median crossings across usable meridians
  let ringCount = 0;
  if (crossingCounts.length > 0) {
    const sortedCrossings = [...crossingCounts].sort((a, b) => a - b);
    const mid = Math.floor(sortedCrossings.length / 2);
    ringCount = sortedCrossings.length % 2 !== 0
      ? sortedCrossings[mid]
      : Math.round((sortedCrossings[mid - 1] + sortedCrossings[mid]) / 2);
  }

  // spacingCV = coefficient of variation of inter-ring spacing, pooled across meridians
  let spacingMean = 0;
  let spacingStd = 0;
  let spacingCV = 0;

  if (allSpacings.length > 0) {
    const sum = allSpacings.reduce((acc, v) => acc + v, 0);
    spacingMean = sum / allSpacings.length;

    const varSum = allSpacings.reduce((acc, v) => acc + (v - spacingMean) * (v - spacingMean), 0);
    spacingStd = Math.sqrt(varSum / allSpacings.length);
    spacingCV = spacingMean > 0 ? spacingStd / spacingMean : 0;
  }

  // isAsymmetry = mean inferior ring spacing (210°–330°) minus mean superior (30°–150°), normalised by overall mean spacing
  let meanInferiorSpacing = 0;
  if (inferiorSpacings.length > 0) {
    meanInferiorSpacing = inferiorSpacings.reduce((acc, v) => acc + v, 0) / inferiorSpacings.length;
  }

  let meanSuperiorSpacing = 0;
  if (superiorSpacings.length > 0) {
    meanSuperiorSpacing = superiorSpacings.reduce((acc, v) => acc + v, 0) / superiorSpacings.length;
  }

  let isAsymmetry = 0;
  if (spacingMean > 0 && inferiorSpacings.length > 0 && superiorSpacings.length > 0) {
    isAsymmetry = (meanInferiorSpacing - meanSuperiorSpacing) / spacingMean;
  }

  // Intermediate raw metrics for UI display and inspection
  const metrics = {
    centroid: { x: cx, y: cy },
    totalMeridians: 360,
    meridiansUsable,
    meridiansUnusable: 360 - meridiansUsable,
    ringCount,
    totalSpacingsSampled: allSpacings.length,
    spacingMean: Number(spacingMean.toFixed(4)),
    spacingStd: Number(spacingStd.toFixed(4)),
    spacingCV: Number(spacingCV.toFixed(4)),
    inferiorSpacingsCount: inferiorSpacings.length,
    superiorSpacingsCount: superiorSpacings.length,
    meanInferiorSpacing: Number(meanInferiorSpacing.toFixed(4)),
    meanSuperiorSpacing: Number(meanSuperiorSpacing.toFixed(4)),
    isAsymmetry: Number(isAsymmetry.toFixed(4)),
    quality,
  };

  return {
    ringCount,
    spacingCV: Number(spacingCV.toFixed(4)),
    isAsymmetry: Number(isAsymmetry.toFixed(4)),
    meridiansUsable,
    quality,
    metrics,
  };
}
