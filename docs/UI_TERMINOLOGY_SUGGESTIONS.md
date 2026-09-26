# Plain-English UI Terminology Suggestions for Non-Programmers

This document reviews every technical term, developer abbreviation, and system label currently displayed in `e2e-orchestrator`'s Web GUI. It proposes plain-English, business-friendly alternatives designed for non-technical stakeholders (e.g. product managers, QA analysts, business testers, designers) while preserving precision.

---

## 1. Global Navigation & Branding (Header)

| Current UI Text | Proposed Non-Technical Text | Why Non-Programmers Find It Confusing |
|---|---|---|
| `e2e-orchestrator` | **End-to-End Test Studio** *(or keep brand with subtitle)* | "e2e" is developer shorthand for "End-to-End". "Orchestrator" sounds like infrastructure machinery rather than a testing application. |
| `HTTP • Playwright • Android ADB` | **Web Apps • Mobile Devices • Web APIs** | Mentions underlying library/tool names (*Playwright*, *ADB*) that mean nothing to non-engineers. Renaming highlights the actual platforms being tested. |
| `Runner` (Tab) | **Run Tests** | Single-word noun is ambiguous. "Run Tests" clearly states the user action. |
| `Scenarios & Flows` (Tab) | **Test Scenarios & Steps** | Non-technical users wonder: *"What is the difference between a scenario and a flow?"* Pairing "Scenarios & Steps" or "Test Cases & Workflows" makes the hierarchy obvious. |
| `Preflight & Services` (Tab) | **System Health & Readiness** | *"Preflight"* is aerospace / DevOps terminology. Users simply want to know if their system and servers are ready to run tests. |
| `Runs & Artifacts` (Tab) | **Test History & Reports** | *"Artifacts"* is developer jargon for generated build/run files. Non-programmers look for "Reports", "Results", or "History & Screenshots". |
| `API Ready` (Badge) | **Connected & Ready** | "API" refers to the backend runner daemon. Users only care that the connection is active. |
| `Backend Offline` (Badge) | **Server Disconnected** | Clearer and less jargon-heavy than "Backend". |

---

## 2. Test Runner Screen (`?tab=runner`)

### Execution Controls & Option Flags

| Current UI Text | Proposed Non-Technical Text | Why Non-Programmers Find It Confusing |
|---|---|---|
| `Headless` (Checkbox) | **Silent Browser (Hide Window)** | **Highest confusion rating.** Non-programmers think "headless" sounds like a bug, error, or broken screen. Explaining that the browser runs silently in the background clarifies the behavior immediately. |
| `Start Services` (Checkbox) | **Auto-Start Background Servers** | Clarifies that ticking this will spin up required local web/API servers automatically. |
| `Install Mobile` (Checkbox) | **Install Mobile App on Device** | Makes it clear an APK will be uploaded and installed on the connected test phone/emulator. |
| `Verbose` (Checkbox) | **Detailed Logs** | "Verbose" is technical jargon; "Detailed Logs" is universally understood. |
| `Run N Scenarios` (Button) | **Start N Test Scenarios** | "Start" feels more intuitive and positive as a primary action button. |
| `Auto-Scroll` (Button) | **Auto-Scroll Log** | Clarifies what is auto-scrolling (the live log console). |
| `Clear Logs` (Button) | **Clear Console** | Standard across user interfaces. |

### Status Indicators & Progress

| Current UI Text | Proposed Non-Technical Text | Notes |
|---|---|---|
| `Idle` (Badge) | **Ready** | "Idle" implies nothing is happening; "Ready" informs the user they can start a test. |
| `Running` (Badge) | **In Progress** *(or **Running**)* | "In Progress" or "Running" in Title Case. |
| `Passed` (Badge) | **Passed** | Clean Title Case. |
| `Failed` (Badge) | **Failed** | Clean Title Case. |
| `Execution Error` | **Test Execution Error** | Highlights that the test suite ran into a problem. |
| `No active execution` | **No Tests Running** | Simpler and less robotic. |
| `Output` / `N lines` | **Live Output Log** / **N lines** | Explains the live streaming terminal box. |

---

## 3. Scenario Builder & Flow Editor Screen (`?tab=scenarios`)

### Sidebar Explorer

| Current UI Text | Proposed Non-Technical Text | Why Non-Programmers Find It Confusing |
|---|---|---|
| `Scenarios` | **Test Scenarios** | Clarifies they are automated test cases. |
| `Mobile Flows` | **Mobile Workflows** | "Workflow" or "Mobile Steps" is standard business terminology for multi-step interactions. |
| `New Scenario` | **New Scenario** | Already intuitive. |
| `Flow` (Button) | **New Flow** | "Flow" by itself looks like an incomplete label. |
| `Target: api` / `Target: web` | **Platform: API** / **Platform: Web** | "Target" is an internal configuration key. Non-programmers think in terms of the "Platform" or "App" being tested. |

### Visual Step Card & Inspector

| Current UI Text | Proposed Non-Technical Text | Why Non-Programmers Find It Confusing |
|---|---|---|
| `Visual Builder` / `JSON Code` | **Visual Editor** / **Raw Code (JSON)** | "Builder" vs "Editor" — "Editor" is more natural. Labelling "Raw Code" signals to non-programmers that this view is for developers. |
| `+ HTTP` | **+ Web API Request** | Non-programmers may know "API" or "Web Service", but raw "HTTP" feels intimidating. |
| `+ Web` | **+ Web Browser Step** | Clearly indicates browser interaction. |
| `+ Mobile` | **+ Mobile App Step** | Clearly indicates phone/tablet action. |
| `+ Shell` | **+ Command Line / Script** | "Shell" is Unix jargon. "Command Line" or "System Command" is widely understood. |
| `Action Details (HTTP)` | **Web Service Request (HTTP)** | Explains what kind of action is being configured. |
| `Endpoint URL` | **URL Address / Path (e.g. /v1/users)** | Provides clear hint of what to enter. |
| `Request Body (JSON)` | **Data to Send (JSON Format)** | Clarifies the purpose of the payload. |
| `Expect HTTP Status: 200` | **Expected Status: 200 (Success)** | Non-programmers don't memorize HTTP status codes; adding a hint like "(200 = Success)" prevents anxiety. |
| `Command Line: sh command line` | **Terminal Command (e.g. echo 'hello')** | Replaces "sh command line" with accessible phrasing. |
| `Working Directory (Optional)` | **Run in Folder (Optional)** | "Working directory" is CLI terminology. |
| `Expect Exit Code: 0` | **Expected Exit Code: 0 (Success)** | Clarifies that 0 means no error occurred. |
| `App Launch Mode` | **App Start Mode** | "Launch mode" is mobile developer terminology. |
| `Don't Launch` | **Keep App As-Is (Don't Restart)** | Explicitly describes the resulting behavior. |
| `Fresh (Clear App Data & Launch)` | **Reset App (Clear Storage & Open)** | Clearer explanation of what "Fresh" does to user data. |
| `Restart (Force-Stop & Launch)` | **Restart App (Close & Reopen)** | "Force-stop" is an Android OS setting term; "Close & Reopen" is human language. |
| `Module Function: Exported function in web target modules` | **Browser Script Function Name** | Explains that this refers to an automated browser function. |
| `Assertions & Context` | **Verification & Checks** | *"Assertion"* is a specialized testing term. Business users think in terms of "Verification", "Checks", or "Expected Results". |
| `Output Contains` | **Response Must Contain Text** | States the validation condition clearly. |
| `Retry Times` | **Retry Attempts if Failed** | Clarifies when and why retries happen. |
| `Timeout` | **Maximum Wait Time (ms)** | Clarifies that the test will fail if it exceeds this threshold. |

---

## 4. System Health Screen (`?tab=preflight`)

| Current UI Text | Proposed Non-Technical Text | Why Non-Programmers Find It Confusing |
|---|---|---|
| `Environment & Preflight Status` | **System Health & Readiness Check** | Replaces aeronautic/developer jargon with plain business English. |
| `HTTP Services & APIs` | **Connected Web Services & APIs** | Explains what services are being verified. |
| `Healthy (HTTP 200)` (Badge) | **Online (HTTP 200)** | "Online" is universally recognized. |
| `Unreachable` (Badge) | **Offline / Unavailable** | Clear, standard downtime indicator. |
| `Start Service` (Button) | **Start Server** | Clarifies the action will launch the background service. |
| `Android Emulator & Devices` | **Mobile Devices & Simulators** | Non-technical users often say "Simulator" or "Device" rather than "ADB / Android Emulator". |
| `Device Online` (Badge) | **Device Connected** | Positive confirmation of physical/virtual connection. |
| `No Device Detected` (Badge) | **No Device Connected** | Clear action trigger. |
| `Required APK Packages` | **Required Mobile Apps Installed** | "APK Packages" is Android developer terminology. "Mobile Apps" is universal. |
| `Target Drivers Map` | **Connected Platforms & Engines** | "Drivers Map" sounds like device hardware drivers. It is actually the list of test environments. |

---

## 5. Test History & Reports Screen (`?tab=artifacts`)

| Current UI Text | Proposed Non-Technical Text | Why Non-Programmers Find It Confusing |
|---|---|---|
| `Run History` | **Past Test Runs** | Familiar language found in analytics and testing tools. |
| `N scenario artifact(s)` | **N Scenario Results Recorded** | "Artifact" implies archaeological relics or opaque compiler output. |
| `Recorded: <Date>` | **Date Tested: <Date>** | Clear attribution. |
| `Screenshots & Media` (Tab) | **Screenshots & Screen Captures** | Clarifies that these are images captured during test steps. |
| `run.log` (Tab) | **Detailed Log (run.log)** | Keeping the file name in parentheses while providing the human description. |
| `Captured Screenshots (N)` | **Saved Step Screenshots (N)** | Explains where the pictures came from. |
| `No screenshots generated. Screenshots taken on step failure or via mobile/web screenshot flows are preserved here.` | **No screenshots taken yet. When a test takes a picture or fails, screen snapshots will be saved here automatically.** | Conversational, reassuring explanation for first-time users. |

---

## 6. Capitalization Rules (Summary)

To avoid shouty ALL-CAPS while maintaining professional consistency across screens:
1. **Title Case**: Capitalize the first letter of each word (e.g. `Passed`, `Failed`, `Running`, `Idle`, `All Services Ready`).
2. **Platform Badges**: Display clean Title Case: `Web`, `Mobile`, `Http`, `Shell` (instead of `WEB`, `MOBILE`, `HTTP`, `SHELL`).
3. **Acronyms**: Standard recognized acronyms remain capitalized (e.g. `API`, `URL`, `JSON`, `HTTP 200`, `APK`).
4. **Form Labels & Select Options**: Capitalize the first letter of each word in button titles, dropdown options, and form labels (e.g. `Working Directory (Optional)`, `Auto-Scroll Log`, `Clear Console`).
