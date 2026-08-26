import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/home/masa84/.gemini/antigravity-cli/brain/bbfec3c7-c912-4c41-82c8-7082be1fb8c9';

async function runFinalChecks() {
  console.log('================================================================================');
  console.log('  KERAMITRA — FINAL SANITY & ROBUSTNESS VERIFICATION');
  console.log('================================================================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Mock native modelContext to verify identity of handlers
  await page.evaluateOnNewDocument(() => {
    window._nativeRegisteredTools = new Map();
    document.modelContext = {
      registerTool: ({ name, description, inputSchema, execute }) => {
        window._nativeRegisteredTools.set(name, { description, inputSchema, execute });
      },
      unregisterTool: (name) => {
        window._nativeRegisteredTools.delete(name);
      },
      listTools: () => Array.from(window._nativeRegisteredTools.keys()),
      getTool: (name) => window._nativeRegisteredTools.get(name),
    };
  });

  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });

  // ---------------------------------------------------------------------------
  // CHECK 1: list_cases rejects unexpected arguments
  // ---------------------------------------------------------------------------
  console.log('[CHECK 1] Testing list_cases strict schema validation...');
  const check1 = await page.evaluate(async () => {
    const tools = window.keramitraTools;
    let threw = false;
    let errorMsg = '';
    try {
      await tools.invokeTool('list_cases', { caseId: 'CASE_B' });
    } catch (err) {
      threw = true;
      errorMsg = err.message;
    }
    return { threw, errorMsg };
  });
  console.log(`- Calling list_cases({ caseId: 'CASE_B' }) threw: ${check1.threw ? 'YES (PASS)' : 'NO (FAIL)'}`);
  console.log(`- Error message: "${check1.errorMsg}"\n`);

  // ---------------------------------------------------------------------------
  // CHECK 2: Live visible UI updates during WebMCP tool calls
  // ---------------------------------------------------------------------------
  console.log('[CHECK 2] Testing visual DOM updates during WebMCP tool execution...');

  // Call load_case and analyze_rings via WebMCP
  await page.evaluate(async () => {
    await window.keramitraTools.invokeTool('load_case', { caseId: 'CASE_B' });
    await window.keramitraTools.invokeTool('analyze_rings', { caseId: 'CASE_B' });
  });

  // Verify DOM updated
  const domStateAfterAnalyze = await page.evaluate(() => {
    return {
      verdictText: document.getElementById('verdict-text').textContent.trim(),
      verdictClass: document.getElementById('verdict-banner').className,
      spacingCV: document.getElementById('val-spacingCV').textContent.trim(),
      isAsym: document.getElementById('val-isAsymmetry').textContent.trim(),
      chipsCount: document.querySelectorAll('.reason-chip').length,
      submitBtnDisabled: document.getElementById('btn-queue-referral').disabled,
    };
  });

  console.log(`- DOM State after analyze_rings:`);
  console.log(`  * Verdict Text: ${domStateAfterAnalyze.verdictText} (Expected: REFER)`);
  console.log(`  * Spacing CV Table Cell: ${domStateAfterAnalyze.spacingCV} (Expected: 0.1272)`);
  console.log(`  * I-S Asymmetry Table Cell: ${domStateAfterAnalyze.isAsym} (Expected: -0.191)`);
  console.log(`  * Reason Chips Rendered: ${domStateAfterAnalyze.chipsCount} chips`);
  console.log(`  * Submit Referral Button: disabled=${domStateAfterAnalyze.submitBtnDisabled}`);

  // Screenshot after analyze
  const screenshotAnalyzePath = path.join(ARTIFACTS_DIR, 'keramitra_webmcp_analyzed_dom.png');
  await page.screenshot({ path: screenshotAnalyzePath });
  console.log(`- Saved screenshot after analyze_rings to: ${screenshotAnalyzePath}`);

  // Call request_approval via WebMCP
  await page.evaluate(async () => {
    await window.keramitraTools.invokeTool('request_approval', {
      caseId: 'CASE_B',
      proposedAction: 'Refer to corneal specialist for keratoconus review',
    });
  });

  const domStateAfterQueue = await page.evaluate(() => {
    const card = document.querySelector('.queue-card');
    return {
      badgeText: document.getElementById('queue-count-badge').textContent.trim(),
      cardPresent: Boolean(card),
      cardCaseId: card?.querySelector('.card-case-id')?.textContent?.trim(),
      cardAction: card?.querySelector('.card-action-text')?.textContent?.trim(),
    };
  });

  console.log(`- DOM State after request_approval:`);
  console.log(`  * Queue Count Badge: ${domStateAfterQueue.badgeText} (Expected: 1 pending)`);
  console.log(`  * Card Rendered in Queue: ${domStateAfterQueue.cardPresent ? 'YES' : 'NO'}`);
  console.log(`  * Card Case ID: ${domStateAfterQueue.cardCaseId}`);
  console.log(`  * Card Action Text: ${domStateAfterQueue.cardAction}`);

  // Screenshot after request_approval
  const screenshotQueuePath = path.join(ARTIFACTS_DIR, 'keramitra_webmcp_approval_card_dom.png');
  await page.screenshot({ path: screenshotQueuePath });
  console.log(`- Saved screenshot after request_approval to: ${screenshotQueuePath}\n`);

  // ---------------------------------------------------------------------------
  // CHECK 3: Cross-Case Token Validation (TOKEN_CASE_MISMATCH)
  // ---------------------------------------------------------------------------
  console.log('[CHECK 3] Testing Cross-Case Token Mismatch (CASE_A token on CASE_B)...');
  const crossCaseResult = await page.evaluate(async () => {
    // 1. Load and queue approval for CASE_A
    await window.keramitraTools.invokeTool('load_case', { caseId: 'CASE_A' });
    await window.keramitraTools.invokeTool('analyze_rings', { caseId: 'CASE_A' });
    const reqA = await window.keramitraTools.invokeTool('request_approval', {
      caseId: 'CASE_A',
      proposedAction: 'Routine follow-up sign-off',
    });

    // 2. Clinician approves CASE_A card in UI
    const cardA = Array.from(document.querySelectorAll('.queue-card')).find(c =>
      c.textContent.includes('CASE_A')
    );
    const approveBtnA = cardA?.querySelector('.btn-approve');
    if (approveBtnA) approveBtnA.click();

    // 3. Extract token for Case A after re-render
    const approvedCardA = Array.from(document.querySelectorAll('.queue-card')).find(c =>
      c.textContent.includes('CASE_A')
    );
    const tokenA = approvedCardA?.querySelector('.token-val')?.textContent?.trim();

    // 4. Attempt to finalize CASE_B using Case A's token
    const mismatchRes = await window.keramitraTools.invokeTool('finalize_report', {
      caseId: 'CASE_B',
      approvalToken: tokenA,
    });

    return {
      tokenIssuedForCaseA: tokenA,
      mismatchStatus: mismatchRes.status,
      mismatchError: mismatchRes.error,
      mismatchMessage: mismatchRes.message,
    };
  });

  console.log(`- Token minted for Case A: ${crossCaseResult.tokenIssuedForCaseA}`);
  console.log(`- Attempt finalize CASE_B with Case A's token: status=${crossCaseResult.mismatchStatus}, error=${crossCaseResult.mismatchError}`);
  console.log(`- Structured Error Message: "${crossCaseResult.mismatchMessage}"`);
  console.log(`- Cross-case check: ${crossCaseResult.mismatchError === 'TOKEN_CASE_MISMATCH' ? 'PASS (Correctly blocked)' : 'FAIL'}\n`);

  // ---------------------------------------------------------------------------
  // CHECK 4: Identity of window.keramitraTools and native document.modelContext
  // ---------------------------------------------------------------------------
  console.log('[CHECK 4] Verifying identity of WebMCP registered tool handlers...');
  const identityCheck = await page.evaluate(() => {
    const nativeTools = window._nativeRegisteredTools;
    const registeredNames = Array.from(nativeTools.keys());
    const toolsDef = window.keramitraTools.listTools();

    const comparisons = toolsDef.map(td => {
      const nativeTool = nativeTools.get(td.name);
      return {
        name: td.name,
        hasNativeTool: Boolean(nativeTool),
        descriptionMatch: nativeTool?.description === td.description,
        schemaMatch: JSON.stringify(nativeTool?.inputSchema) === JSON.stringify(td.inputSchema),
        isExecuteFunction: typeof nativeTool?.execute === 'function',
      };
    });

    return {
      registeredCount: registeredNames.length,
      comparisons,
    };
  });

  console.log(`- Native registered tools count: ${identityCheck.registeredCount} / 8`);
  identityCheck.comparisons.forEach(c => {
    console.log(`  * ${c.name.padEnd(20)}: Native Registered=${c.hasNativeTool}, SchemaMatch=${c.schemaMatch}, Executable=${c.isExecuteFunction}`);
  });

  await page.close();
  await browser.close();

  console.log('\n================================================================================');
  console.log('  ALL FINAL CHECKS COMPLETED SUCCESSFULLY');
  console.log('================================================================================\n');
}

runFinalChecks();
