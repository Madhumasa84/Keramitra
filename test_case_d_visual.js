import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACTS_DIR = '/home/masa84/.gemini/antigravity-cli/brain/bbfec3c7-c912-4c41-82c8-7082be1fb8c9';

async function testCaseDVisual() {
  console.log('Testing Case D Visual UI & Prompt-Injection Defense...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });

  // 1. Click Case D
  await page.click('#btn-case-d');
  await new Promise(r => setTimeout(r, 200));

  const noteText = await page.$eval('#operator-note-text', el => el.textContent.trim());
  const badgeVisible = await page.$eval('#adversarial-badge', el => window.getComputedStyle(el).display !== 'none');
  console.log(`- Case D Loaded: Badge Visible=${badgeVisible}`);
  console.log(`- Operator Remarks: "${noteText}"`);

  // Screenshot Case D Loaded
  const screenshotCaseDPath = path.join(ARTIFACTS_DIR, 'keramitra_case_d_loaded.png');
  await page.screenshot({ path: screenshotCaseDPath });
  console.log(`- Saved screenshot of Case D to: ${screenshotCaseDPath}`);

  // 2. Click "Demo: prompt-injection bypass attempt"
  await page.click('#btn-demo-case-d-injection');
  await new Promise(r => setTimeout(r, 300));

  const alertCode = await page.$eval('#guard-alert-code', el => el.textContent.trim());
  const alertMsg = await page.$eval('#guard-alert-msg', el => el.textContent.trim());
  const latestAudit = await page.$eval('.audit-entry', el => el.textContent.trim());

  console.log(`- Prompt-Injection Demo Triggered: Code=${alertCode}`);
  console.log(`- Alert Message: "${alertMsg}"`);
  console.log(`- Audit Log Entry: "${latestAudit}"`);

  // Screenshot Case D Blocked State
  const screenshotCaseDBlockedPath = path.join(ARTIFACTS_DIR, 'keramitra_case_d_injection_blocked.png');
  await page.screenshot({ path: screenshotCaseDBlockedPath });
  console.log(`- Saved screenshot of blocked injection attempt to: ${screenshotCaseDBlockedPath}`);

  // 3. Test Tamil switch on Case D
  await page.click('#btn-lang-ta');
  await new Promise(r => setTimeout(r, 200));
  const screenshotCaseDTamilPath = path.join(ARTIFACTS_DIR, 'keramitra_case_d_tamil.png');
  await page.screenshot({ path: screenshotCaseDTamilPath });
  console.log(`- Saved screenshot of Case D Tamil to: ${screenshotCaseDTamilPath}`);

  await page.close();
  await browser.close();
  console.log('Case D Visual UI tests completed successfully.');
}

testCaseDVisual();
