# Keramitra (கெராமித்ரா)

> A transparent Placido mire topography screener and WebMCP-governed decision support console with structurally enforced human clinical approval and bilingual (English/Tamil) reasoning.

![Keramitra Full Flow Demo](./demo.gif)

---

## Synthetic Demonstration Data Notice

> **IMPORTANT**: All corneal topography images, Placido mire ring patterns, and clinical measurements in this repository are **procedurally generated synthetically in code (`src/synth.js`)**.
> 
> - **No patient data of any kind** was collected, used, uploaded, or de-identified for this project.
> - **All thresholds and decision rules** in `src/rules.js` are illustrative engineering demonstration thresholds and are **not clinically validated**.
> - This application is designed solely to demonstrate deterministic evidence traceability, WebMCP model context governance, and single-use in-memory human-in-the-loop approval gates.

---

## Quick Verification (2 Seconds in DevTools)

To verify whether your browser is executing **Native WebMCP** or the **Compatibility Shim**, paste this one-liner into the Chrome DevTools Console (`F12`):

```javascript
console.log(typeof document.modelContext?.registerTool === 'function' ? 'Native WebMCP active' : 'Running on compatibility shim');
```

---

## Setup and Native WebMCP Execution

Keramitra is built primarily for **Native WebMCP** in Chrome 146+.

### 1. Enabling Native WebMCP in Chrome
1. Use **Google Chrome 146+** (Chrome Canary or Dev channel).
2. Open `chrome://flags` in your address bar.
3. In the search box, search for: **`WebMCP for testing`** (or **`Model Context`** / `#model-context-api`).
4. Set the flag to **Enabled** and click **Relaunch**.
5. When running with native support, the console header displays `NATIVE WebMCP [8 TOOLS ACTIVE]`.

### 2. Compatibility Shim Notice (Graceful Degradation)
If you evaluate Keramitra on a browser where experimental flags are unavailable:
- The UI **loudly announces itself** with a prominent top banner: *"Running on compatibility shim — native WebMCP (document.modelContext) not detected."*
- The header badge switches to `COMPATIBILITY SHIM [8 TOOLS]`.
- All eight tools and approval guards execute via the local shim so judges can still evaluate the complete screening pipeline and approval gate without special browser flags.

### 3. Local Reproduction
```bash
# Clone repository
git clone https://github.com/Madhumasa84/Keramitra.git
cd Keramitra

# Install dependencies
npm install

# Run automated test suites
npm test               # Core image analysis & rule engine tests
npm run test:rules     # Load-bearing proof (real image vs. stub image)
npm run test:tools     # WebMCP tools & approval gate security checks

# Start local server
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## Fallback Video Demonstration

For evaluators who cannot configure browser flags or run locally:
- **90-Second Walkthrough Video**: [Watch Keramitra Demonstration on YouTube](https://youtu.be/8hR_3q8LgZo)
- **Self-Contained Walkthrough**: You can also view the animated walkthrough directly in this repository: [`demo.gif`](./demo.gif).

---

## The Eight WebMCP Tools

All eight tools are exposed to WebMCP with full JSON schemas and call the exact same underlying logic functions driven by the UI buttons:

| Tool Name | Input Schema (`args`) | Dependency Order & Preconditions | Output Description |
|---|---|---|---|
| `list_cases` | `{}` *(None)* | **1 (Initial)** — No prior tool call required. | Returns available case IDs (`CASE_A`, `CASE_B`, `CASE_C`), eye labels (`OD`/`OS`), and neutral clinical descriptors. |
| `load_case` | `{"caseId": "CASE_A" \| "CASE_B" \| "CASE_C"}` | **2** — Call after `list_cases`. | Renders Placido mires to canvas, caches pixel buffer, returns eye label and capture metadata. |
| `analyze_rings` | `{"caseId": "CASE_A" \| "CASE_B" \| "CASE_C"}` | **3** — Call after `load_case`. | Executes 360-meridian pixel analysis on canvas. Returns `ringCount`, `spacingCV`, `isAsymmetry`, `meridiansUsable`, `quality`. |
| `get_measurements` | `{"caseId": "CASE_A" \| "CASE_B" \| "CASE_C"}` | **4** — Call after `load_case`. | Returns keratometry (`K1`, `K2`, `axis`), central pachymetry (`µm`), and cylinder magnitude (`D`). |
| `evaluate_referral` | `{"caseId": "CASE_A" \| "CASE_B" \| "CASE_C"}` | **5** — Call after `analyze_rings` and `get_measurements`. | Runs deterministic 3-domain rule engine. Emits named reason codes (`IMG_SUSPICIOUS`, `K_HIGH`, etc.) and verdict (`REFER`, `REPEAT_SCAN`, `ROUTINE_FOLLOWUP`). |
| `explain_evidence` | `{"caseId": string, "language": "en" \| "ta"}` | **6** — Call after `evaluate_referral`. | Generates transparent plain-language clinical reasoning in English or Tamil for a school health worker. |
| `request_approval` | `{"caseId": string, "proposedAction": string}` | **7** — Call after `evaluate_referral`. | Pushes evidence card to the visible UI Approval Queue. Returns `{ status: "pending", requestId }` and **no token**. |
| `finalize_report` | `{"caseId": string, "approvalToken": string}` | **8 (Terminal)** — Requires valid single-use token from clinician clicking "Approve". | Validates token authenticity, expiration, case binding, and single-use status. Returns finalized report or explicit error. |

---

## The Approval Gate (Human-in-the-Loop Security Enforcement)

Human approval in Keramitra is **structurally enforced, not advisory**. An automated agent or script **cannot** finalize or export a clinical screening report without a single-use, case-bound approval token held in memory only, minted exclusively when a human clinician clicks **"Approve referral"** in the browser UI.

```
Agent Request                     Clinician in UI                 Finalize Gate
[request_approval] ──► Render Queue Card ──► [Approve Click] ──► Mint tok_... (5 min)
                                                                       │
[finalize_report]  ◄───────────────────────────────────────────────────┘
```

### Security Failure Modes and Error Hierarchy

Calling `finalize_report` performs exhaustive pre-flight verification against the in-memory registry:

| Failure Mode | Trigger Condition | Structured Error Response | UI and Audit Trail State |
|---|---|---|---|
| **First-Thing Call / Missing Token** | Calling `finalize_report` before any approval request or with `approvalToken: null` / `""`. | `{"status": "blocked", "error": "TOKEN_MISSING"}` | Security violation logged to Audit Trail; red alert box shown in UI. |
| **Unknown Token** | Providing a token string not present in the active in-memory session registry. | `{"status": "blocked", "error": "TOKEN_NOT_FOUND"}` | Logged as `GUARD_VIOLATION`. |
| **Clinician Rejection** | Clinician clicked "Reject referral" on the request card. | `{"status": "blocked", "error": "APPROVAL_REJECTED"}` | Request permanently closed; no token can ever be minted. |
| **Case Mismatch** | Token minted for `CASE_B` supplied to finalize `CASE_A`. | `{"status": "blocked", "error": "TOKEN_CASE_MISMATCH"}` | Prevented cross-case token re-attribution. |
| **Token Re-use** | Attempting to call `finalize_report` a second time with the same token. | `{"status": "blocked", "error": "TOKEN_ALREADY_USED"}` | Single-use consumption enforced. |
| **Token Expiry** | Token presented > 300 seconds (5 minutes) after minting. | `{"status": "blocked", "error": "TOKEN_EXPIRED"}` | Expired credentials rejected. |

---

## How the Image Analysis Works (Honest Architecture)

1. **Synthetic Image Generation (`src/synth.js`)**:
   - The canvas renders procedural Placido mire ring patterns using mathematical intensity profiles, elliptic elongation, inferior crowding functions, Gaussian blur, and simulated occlusion/glare sectors.
2. **Pure Pixel Computation (`src/analyze.js`)**:
   - `analyzeRings(imageData)` receives raw `Uint8ClampedArray` pixel data.
   - **Zero hardcoding**: The function has no knowledge of `caseId` or case parameters.
   - Locates the disc center via intensity-weighted centroid calculations.
   - Samples 360 radial meridians (1° intervals) using bilinear sub-pixel interpolation.
   - Detects ring crossing peaks using local curvature and adaptive intensity thresholds.
   - Computes inter-ring spacing Coefficient of Variation (`spacingCV`) and Inferior-Superior asymmetry index (`isAsymmetry = (inferior - superior) / mean`).
   - Flags unusable meridians based on saturation (glare) and low-variance flat occlusion (eyelids).
3. **Deterministic Multi-Domain Rules (`src/rules.js`)**:
   - Evaluates three independent domains: Image (`spacingCV`, `isAsymmetry`), Keratometry (`K1`, `K2`), and Pachymetry (`central thickness`).
   - Flags abnormal domains and computes explicit named reason codes (`IMG_SUSPICIOUS`, `K_HIGH`, `PACHY_LOW`, `CYL_HIGH`, `TWO_DOMAIN_ABNORMAL`).
   - If image capture quality is inadequate (`IMG_REPEAT_REQUIRED`), forces `REPEAT_SCAN` and suppresses referral verdicts (poor capture is not evidence of disease).

---

## Bilingual Clinical Reasoning (English & Tamil)

Keramitra features complete bilingual clinical reasoning in English (`en`) and Tamil (`ta`). All Tamil strings and explanations in `src/i18n.js` are fully translated in a plain-spoken register tailored for community/school health workers (கிராமப்புற/பள்ளி சுகாதார பணியாளர் எளிதில் புரிந்துகொள்ளும் எளிய தமிழ்), paired with Noto Sans Tamil typography for clean glyph and conjunct rendering.

---

## WebMCP Specification Note (Navigator to Document Migration)

In the **May 2026 WebMCP draft specification**, the getter moved from `navigator.modelContext` to `document.modelContext`. `navigator.modelContext` remains a deprecated alias (deprecated in Chromium 150+).

Keramitra implements standard dual-resolution:
```javascript
// Spec moved the getter Navigator → Document (May 2026 draft).
// navigator.modelContext remains a deprecated alias; support both.
const modelContext = document.modelContext ?? navigator.modelContext;
```
If neither is native in the host browser, Keramitra's compatibility fallback shim activates and loudly identifies itself in the UI.

---

## What This Is Not

- **Not a diagnostic medical device**: Keramitra is a demonstration software prototype.
- **Not clinically validated**: Thresholds in `src/rules.js` and synthetic models in `src/synth.js` are for engineering validation and interface design only.
- **Not a substitute for professional ophthalmic assessment**: Clinical decisions regarding corneal ectasia, keratoconus, or refractive surgery must always be made by licensed eye care professionals using certified corneal topographers (e.g., Pentacam, Galilei, Sirius, Atlas).

---

## Repository Metadata

- **Suggested Topics**: `webmcp`, `model-context-protocol`, `human-in-the-loop`, `medical-imaging`, `synthetic-data`
- **License**: MIT License. Copyright (c) 2026 Keramitra Contributors.
