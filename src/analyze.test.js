/**
 * analyze.test.js - Test Placido disc analysis on synthetic cases.
 * Run with: node src/analyze.test.js
 */

import { generatePlacidoImageData, CASES } from './synth.js';
import { analyzeRings } from './analyze.js';

console.log('='.repeat(88));
console.log('  KERAMITRA — PLACIDO RING ANALYSIS VALIDATION TEST');
console.log('='.repeat(88));

const testCases = [
  { id: CASES.CASE_A, label: 'Case A: Normal / Regular Cornea' },
  { id: CASES.CASE_B, label: 'Case B: Keratoconus / Inferior Steepening' },
  { id: CASES.CASE_C, label: 'Case C: Occlusion / Glare Artefacts' },
];

const results = [];

for (const tc of testCases) {
  const t0 = performance.now();
  const imgData = generatePlacidoImageData(tc.id, 512, 512);
  const result = analyzeRings(imgData);
  const dt = (performance.now() - t0).toFixed(2);

  results.push({
    caseId: tc.id,
    label: tc.label,
    runtimeMs: dt,
    ...result,
  });
}

// Print formatted summary table
console.log('\n--- SUMMARY METRICS TABLE ---\n');
console.table(
  results.map((r) => ({
    'Case': r.caseId,
    'Description': r.label.split(':')[1]?.trim() || r.label,
    'Rings': r.ringCount,
    'Spacing CV': r.spacingCV,
    'I-S Asymmetry': r.isAsymmetry,
    'Usable Meridians': `${r.meridiansUsable}/360`,
    'Quality': r.quality,
    'Mean Inf Spacing': r.metrics.meanInferiorSpacing,
    'Mean Sup Spacing': r.metrics.meanSuperiorSpacing,
    'Time (ms)': r.runtimeMs,
  }))
);

console.log('\n--- DETAILED RAW METRICS ---\n');
for (const r of results) {
  console.log(`[${r.caseId}] ${r.label}`);
  console.log(JSON.stringify(r.metrics, null, 2));
  console.log('-'.repeat(88));
}

// Acceptance criteria checks
console.log('\n--- ACCEPTANCE VERIFICATION ---');

const caseA = results.find((r) => r.caseId === CASES.CASE_A);
const caseB = results.find((r) => r.caseId === CASES.CASE_B);
const caseC = results.find((r) => r.caseId === CASES.CASE_C);

let passed = true;

// Check A: low spacingCV and near-zero isAsymmetry
const aCVOk = caseA.spacingCV < 0.05;
const aAsymOk = Math.abs(caseA.isAsymmetry) < 0.05;
const aQualityOk = caseA.quality === 'adequate';
console.log(`${aCVOk ? '✓' : '✗'} Case A low spacingCV (< 0.05): ${caseA.spacingCV} → ${aCVOk ? 'PASS' : 'FAIL'}`);
console.log(`${aAsymOk ? '✓' : '✗'} Case A near-zero isAsymmetry (|asym| < 0.05): ${caseA.isAsymmetry} → ${aAsymOk ? 'PASS' : 'FAIL'}`);
console.log(`${aQualityOk ? '✓' : '✗'} Case A quality == adequate: ${caseA.quality} → ${aQualityOk ? 'PASS' : 'FAIL'}`);

if (!aCVOk || !aAsymOk || !aQualityOk) passed = false;

// Check B: clearly negative isAsymmetry
const bAsymOk = caseB.isAsymmetry < -0.15;
const bQualityOk = caseB.quality === 'adequate';
console.log(`${bAsymOk ? '✓' : '✗'} Case B clearly negative isAsymmetry (< -0.15): ${caseB.isAsymmetry} → ${bAsymOk ? 'PASS' : 'FAIL'}`);
console.log(`${bQualityOk ? '✓' : '✗'} Case B quality == adequate: ${caseB.quality} → ${bQualityOk ? 'PASS' : 'FAIL'}`);

if (!bAsymOk || !bQualityOk) passed = false;

// Check C: meridiansUsable below threshold (< 300) and repeat_required
const cMeridiansOk = caseC.meridiansUsable < 300;
const cQualityOk = caseC.quality === 'repeat_required';
console.log(`${cMeridiansOk ? '✓' : '✗'} Case C meridiansUsable < 300: ${caseC.meridiansUsable}/360 → ${cMeridiansOk ? 'PASS' : 'FAIL'}`);
console.log(`${cQualityOk ? '✓' : '✗'} Case C quality == repeat_required: ${caseC.quality} → ${cQualityOk ? 'PASS' : 'FAIL'}`);

if (!cMeridiansOk || !cQualityOk) passed = false;

console.log('\n' + '='.repeat(88));
if (passed) {
  console.log('  ALL ACCEPTANCE CRITERIA PASSED: Cases clearly separated by genuine pixel analysis.');
} else {
  console.error('  VALIDATION FAILED: Case separation criteria not fully met.');
  process.exit(1);
}
console.log('='.repeat(88));
