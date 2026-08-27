import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ARTIFACTS_DIR = '/home/masa84/.gemini/antigravity-cli/brain/bbfec3c7-c912-4c41-82c8-7082be1fb8c9';

async function runComprehensiveVerification() {
  console.log('================================================================================');
  console.log('  KERAMITRA — COMPREHENSIVE AUTOMATED VERIFICATION SUITE');
  console.log('================================================================================\n');

  const results = {
    step1_deployment_sanity: false,
    step2_webmcp_detection: false,
    step3_manual_ui_walkthrough: false,
    step4_agent_walkthrough: false,
    step5_bilingual_and_responsive: false,
    step6_reproducibility_scratch: false,
  };

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Deployment Sanity on Live Vercel
    // -------------------------------------------------------------------------
    console.log('[STEP 1] Testing live deployment at https://keramitra.vercel.app/ ...');
    const livePage = await browser.newPage();
    const liveErrors = [];
    livePage.on('pageerror', err => liveErrors.push(err.message));
    livePage.on('console', msg => {
      if (msg.type() === 'error') liveErrors.push(msg.text());
    });

    const response = await livePage.goto('https://keramitra.vercel.app/', { waitUntil: 'networkidle0' });
    console.log(`- HTTP Status: ${response.status()}`);
    console.log(`- Console errors on load: ${liveErrors.length === 0 ? '0 (CLEAN)' : JSON.stringify(liveErrors)}`);

    const staticHtml = await response.text();
    const hasInitialNotEvaluated = staticHtml.includes('verdict-NOT_EVALUATED') && staticHtml.includes('NOT_EVALUATED');
    const hasNoPreRenderedTokenMissing = !staticHtml.includes('>TOKEN_MISSING<');

    console.log(`- Static HTML initial verdict is NOT_EVALUATED: ${hasInitialNotEvaluated ? 'PASS' : 'FAIL'}`);
    console.log(`- Static HTML has zero pre-rendered TOKEN_MISSING: ${hasNoPreRenderedTokenMissing ? 'PASS' : 'FAIL'}`);

    if (response.status() === 200 && liveErrors.length === 0 && hasInitialNotEvaluated && hasNoPreRenderedTokenMissing) {
      results.step1_deployment_sanity = true;
      console.log('>>> STEP 1 PASSED!\n');
    } else {
      console.error('>>> STEP 1 FAILED!\n');
    }
    await livePage.close();

    // -------------------------------------------------------------------------
    // STEP 2: WebMCP Detection & Shim Behavior
    // -------------------------------------------------------------------------
    console.log('[STEP 2] Testing Native WebMCP vs. Shim Behavior...');
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Test with Shim (standard browser)
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
    const shimBadgeText = await page.$eval('#webmcp-badge', el => el.textContent);
    const shimBarVisible = await page.$eval('#shim-announcement-bar', el => window.getComputedStyle(el).display !== 'none');
    console.log(`- Without native flag: Badge reads '${shimBadgeText}'`);
    console.log(`- Loud shim announcement bar visible: ${shimBarVisible ? 'YES (LOUD & HONEST)' : 'NO'}`);

    // Test with Native ModelContext injected into window/document
    const nativePage = await browser.newPage();
    await nativePage.evaluateOnNewDocument(() => {
      const registeredTools = new Map();
      document.modelContext = {
        registerTool: ({ name, description, inputSchema, execute }) => {
          registeredTools.set(name, { description, inputSchema, execute });
        },
        unregisterTool: (name) => {
          registeredTools.delete(name);
        },
        listTools: () => Array.from(registeredTools.keys()),
      };
    });
    await nativePage.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
    const nativeBadgeText = await nativePage.$eval('#webmcp-badge', el => el.textContent);
    const nativeBarVisible = await nativePage.$eval('#shim-announcement-bar', el => window.getComputedStyle(el).display !== 'none');
    console.log(`- With native ModelContext: Badge reads '${nativeBadgeText}'`);
    console.log(`- Shim announcement bar hidden: ${!nativeBarVisible ? 'YES (CLEAN)' : 'NO'}`);

    const registeredCount = await nativePage.evaluate(() => document.modelContext.listTools().length);
    console.log(`- Tools successfully registered on document.modelContext: ${registeredCount} / 9 before an approval request`);

    if (shimBadgeText.includes('SHIM') && shimBarVisible && nativeBadgeText.includes('NATIVE') && !nativeBarVisible && registeredCount === 9) {
      results.step2_webmcp_detection = true;
      console.log('>>> STEP 2 PASSED!\n');
    } else {
      console.error('>>> STEP 2 FAILED!\n');
    }
    await nativePage.close();

    // -------------------------------------------------------------------------
    // STEP 3: Manual UI Walkthrough (Case A, B, C, Highlights, Approvals, Rejections)
    // -------------------------------------------------------------------------
    console.log('[STEP 3] Running Full Manual UI Walkthrough...');

    // Case A
    await page.click('#btn-case-a');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#btn-analyze');
    await new Promise(r => setTimeout(r, 200));
    const caseAVerdict = await page.$eval('#verdict-text', el => el.textContent.trim());
    const caseARingCount = await page.$eval('#val-ringCount', el => el.textContent.trim());
    const caseASpacingCV = await page.$eval('#val-spacingCV', el => el.textContent.trim());
    console.log(`- Case A Analysis: Verdict=${caseAVerdict}, RingCount=${caseARingCount}, SpacingCV=${caseASpacingCV}`);

    // Case B
    await page.click('#btn-case-b');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#btn-analyze');
    await new Promise(r => setTimeout(r, 200));
    const caseBVerdict = await page.$eval('#verdict-text', el => el.textContent.trim());
    const caseBSpacingCV = await page.$eval('#val-spacingCV', el => el.textContent.trim());
    const caseBAsym = await page.$eval('#val-isAsymmetry', el => el.textContent.trim());
    console.log(`- Case B Analysis: Verdict=${caseBVerdict}, SpacingCV=${caseBSpacingCV}, Asym=${caseBAsym}`);

    // Traceability row highlight check on Case B
    const firstChip = await page.$('.reason-chip');
    await firstChip.hover();
    await new Promise(r => setTimeout(r, 100));
    const isHighlighted = await page.$eval('#metric-row-spacingCV', el => el.classList.contains('source-highlight'));
    console.log(`- Traceability row highlight on hover: ${isHighlighted ? 'PASS (Active highlight)' : 'FAIL'}`);

    // Submit Case B to Approval Queue
    const submitBtnDisabledBefore = await page.$eval('#btn-queue-referral', el => el.disabled);
    console.log(`- Submit referral button enabled after analysis: ${!submitBtnDisabledBefore ? 'YES' : 'NO'}`);
    await page.click('#btn-queue-referral');
    await new Promise(r => setTimeout(r, 200));

    // Approve Case B request
    await page.click('.btn-approve');
    await new Promise(r => setTimeout(r, 200));
    const mintedToken = await page.$eval('.token-val', el => el.textContent.trim());
    console.log(`- Approval card approved. Minted single-use token: '${mintedToken}'`);

    // Queue another request and Reject it
    await page.click('#btn-queue-referral');
    await new Promise(r => setTimeout(r, 200));
    const rejectBtns = await page.$$('.btn-reject');
    if (rejectBtns.length > 0) {
      await rejectBtns[0].click();
      await new Promise(r => setTimeout(r, 200));
    }
    const rejectedStatus = await page.$eval('.queue-card.status-rejected', el => el ? 'REJECTED' : 'NONE');
    console.log(`- Second request rejected. Card status: ${rejectedStatus}`);

    // Demo: Attempt unapproved finalize
    await page.click('#btn-demo-unapproved-finalize');
    await new Promise(r => setTimeout(r, 200));
    const alertCode = await page.$eval('#guard-alert-code', el => el.textContent.trim());
    const alertVisible = await page.$eval('#guard-alert-box', el => window.getComputedStyle(el).display !== 'none');
    console.log(`- Demo unapproved finalize triggered: AlertVisible=${alertVisible}, Code=${alertCode}`);

    // Case C
    await page.click('#btn-case-c');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#btn-analyze');
    await new Promise(r => setTimeout(r, 200));
    const caseCVerdict = await page.$eval('#verdict-text', el => el.textContent.trim());
    const caseCQuality = await page.$eval('#quality-chip', el => el.textContent.trim());
    console.log(`- Case C Analysis: Verdict=${caseCVerdict}, Quality=${caseCQuality}`);

    // Export JSON Audit Log
    const auditEntriesCount = await page.$$eval('.audit-entry', els => els.length);
    console.log(`- Visible Audit Trail contains ${auditEntriesCount} timestamped log records`);

    if (caseAVerdict === 'ROUTINE_FOLLOWUP' && caseBVerdict === 'REFER' && caseCVerdict === 'REPEAT_SCAN' &&
        isHighlighted && mintedToken.startsWith('tok_') && alertCode === 'TOKEN_MISSING' && auditEntriesCount >= 4) {
      results.step3_manual_ui_walkthrough = true;
      console.log('>>> STEP 3 PASSED!\n');
    } else {
      console.error('>>> STEP 3 FAILED!\n');
    }

    // -------------------------------------------------------------------------
    // STEP 4: Agent-Driven WebMCP Tools Walkthrough & Failure Modes
    // -------------------------------------------------------------------------
    console.log('[STEP 4] Testing Agent-Driven WebMCP Tools Execution & Security Gates...');
    const agentTestResult = await page.evaluate(async () => {
      const tools = window.keramitraTools;
      const logs = [];

      // 1. List cases
      const casesRes = await tools.invokeTool('list_cases');
      logs.push(`Discovered ${casesRes.cases.length} cases`);

      // 2. Load and analyze Case B
      await tools.invokeTool('load_case', { caseId: 'CASE_B' });
      const imgRes = await tools.invokeTool('analyze_rings', { caseId: 'CASE_B' });
      const bioRes = await tools.invokeTool('get_measurements', { caseId: 'CASE_B' });
      const evalRes = await tools.invokeTool('evaluate_referral', { caseId: 'CASE_B' });
      logs.push(`Case B evaluated: ${evalRes.verdict}, reasonCodes=${evalRes.reasonCodes.join(',')}`);

      // 3. Unapproved finalize attempt on fresh case (TOKEN_MISSING)
      const unapprovedRes = await tools.invokeTool('finalize_report', { caseId: 'CASE_B', approvalToken: null });
      const tokenMissingPass = unapprovedRes.status === 'blocked' && unapprovedRes.error === 'TOKEN_MISSING';
      logs.push(`Unapproved finalize check: error=${unapprovedRes.error} (passed=${tokenMissingPass})`);

      // 4. Fabricated / Guessed token attempt (TOKEN_NOT_FOUND)
      const fakeTokenRes = await tools.invokeTool('finalize_report', { caseId: 'CASE_B', approvalToken: 'tok_fabricated_12345' });
      const tokenNotFoundPass = fakeTokenRes.status === 'blocked' && fakeTokenRes.error === 'TOKEN_NOT_FOUND';
      logs.push(`Fabricated token check: error=${fakeTokenRes.error} (passed=${tokenNotFoundPass})`);

      // 5. Request approval
      const reqRes = await tools.invokeTool('request_approval', { caseId: 'CASE_B', proposedAction: 'Refer to cornea clinic' });
      logs.push(`Approval requested: requestId=${reqRes.requestId}`);

      return {
        casesCount: casesRes.cases.length,
        verdict: evalRes.verdict,
        tokenMissingPass,
        tokenNotFoundPass,
        requestId: reqRes.requestId,
        logs,
      };
    });

    console.log(`- Agent tool execution logs:`);
    agentTestResult.logs.forEach(l => console.log(`  * ${l}`));

    if (agentTestResult.casesCount === 3 && agentTestResult.verdict === 'REFER' &&
        agentTestResult.tokenMissingPass && agentTestResult.tokenNotFoundPass) {
      results.step4_agent_walkthrough = true;
      console.log('>>> STEP 4 PASSED!\n');
    } else {
      console.error('>>> STEP 4 FAILED!\n');
    }

    // -------------------------------------------------------------------------
    // STEP 5: Bilingual Pass (Tamil - தமிழ்) & Responsive Layout
    // -------------------------------------------------------------------------
    console.log('[STEP 5] Testing Tamil Localization (தமிழ்), Terminology & Responsive Viewports...');
    await page.click('#btn-lang-ta');
    await new Promise(r => setTimeout(r, 200));

    // Verify terminology: Ensure zero occurrences of "கருவிழி" in rendered page text
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasIrisTerm = pageText.includes('கருவிழி');
    const hasCorneaTerm = pageText.includes('கார்னியா');
    console.log(`- Zero iris terminology ("கருவிழி") in DOM: ${!hasIrisTerm ? 'PASS (0 occurrences)' : 'FAIL (Found)'}`);
    console.log(`- Correct cornea outreach terminology ("கார்னியா") present: ${hasCorneaTerm ? 'PASS' : 'FAIL'}`);

    // Responsive Viewports: Tablet (768x1024) and Mobile (375x812)
    console.log('- Testing Tablet Viewport (768px)...');
    await page.setViewport({ width: 768, height: 1024 });
    await new Promise(r => setTimeout(r, 200));
    const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`  * Tablet horizontal overflow: ${!tabletOverflow ? 'NONE (Clean)' : 'OVERFLOW DETECTED'}`);

    console.log('- Testing Mobile Viewport (375px)...');
    await page.setViewport({ width: 375, height: 812 });
    await new Promise(r => setTimeout(r, 200));
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`  * Mobile horizontal overflow: ${!mobileOverflow ? 'NONE (Clean)' : 'OVERFLOW DETECTED'}`);

    if (!hasIrisTerm && hasCorneaTerm && !tabletOverflow && !mobileOverflow) {
      results.step5_bilingual_and_responsive = true;
      console.log('>>> STEP 5 PASSED!\n');
    } else {
      console.error('>>> STEP 5 FAILED!\n');
    }

    await page.close();
    await browser.close();

    // -------------------------------------------------------------------------
    // STEP 6: Clean Reproduction from Scratch
    // -------------------------------------------------------------------------
    console.log('[STEP 6] Testing Reproducibility from Scratch...');
    const testDir = '/tmp/keramitra_scratch_test';
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    console.log(`- Copying project into clean sandbox: ${testDir} ...`);
    execSync(`cp -r package.json package-lock.json index.html src public ${testDir}/`);

    console.log('- Running clean npm install...');
    execSync('npm install', { cwd: testDir, stdio: 'pipe' });

    console.log('- Executing npm test (Core Analyze & Rules)...');
    const outTest = execSync('npm test', { cwd: testDir, encoding: 'utf8' });
    console.log(outTest.split('\n').filter(l => l.includes('PASS') || l.includes('CRITERIA')).join('\n'));

    console.log('- Executing npm run test:rules (Load-Bearing Proof)...');
    const outRules = execSync('npm run test:rules', { cwd: testDir, encoding: 'utf8' });
    console.log(outRules.split('\n').filter(l => l.includes('PASS') || l.includes('CRITERIA')).join('\n'));

    console.log('- Executing npm run test:tools (WebMCP & Approval Gate Checks)...');
    const outTools = execSync('npm run test:tools', { cwd: testDir, encoding: 'utf8' });
    console.log(outTools.split('\n').filter(l => l.includes('PASS') || l.includes('CRITERIA')).join('\n'));

    fs.rmSync(testDir, { recursive: true, force: true });
    results.step6_reproducibility_scratch = true;
    console.log('>>> STEP 6 PASSED!\n');

  } catch (err) {
    console.error('Verification error:', err);
  }

  console.log('================================================================================');
  console.log('  FINAL VERIFICATION SCORECARD');
  console.log('================================================================================');
  for (const [step, passed] of Object.entries(results)) {
    console.log(`  ${step.padEnd(35)} : ${passed ? '✓ PASSED' : '✗ FAILED'}`);
  }
  console.log('================================================================================\n');
}

runComprehensiveVerification();
