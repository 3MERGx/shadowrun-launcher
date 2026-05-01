# What Happens When You Press "Activate Game"

Exact flow from button click to completion, so you can see where an error might occur.

---

## 1. Renderer (UI) – `app/renderer/index.js`

1. **Click** – User clicks the "Activate Game" button (`#activateButton`).
2. **PCID check** – `window.api.getCurrentPcid()` is called.
   - If **no PCID**: toast "No PCID found. Launch the game first...", **stop** (activation never runs).
3. **Confirm** – `showActivationConfirmDialog()` runs (user must confirm).
   - If user **cancels**: **stop**.
4. **Button state** – Button text set to "Activating...", button disabled.
5. **IPC** – `window.api.activateGame()` is called (sends to main process).
6. **Result** – After main returns:
   - If `result.success`: button reset to "Activate Game" after 3 seconds.
   - If failure or error: same reset; user also sees any dialog the main process showed.

---

## 2. Main process – `app/main.js` (`ipcMain.handle("activate-game", ...)`)

### 2.1 Load and validate config

- **Config path**: `app.getAppPath()` + `"app/config/activationKeys.json"`.
- **Read** – `fs.readFileSync(configPath)` then `JSON.parse`.
  - **Fail**: Dialog "Failed to Load Activation Keys", return `{ success: false }`.
- **Validate** – `activationKeys` must exist and be a non-empty array; each entry validated by `validateActivationKey()` (productKey format, pcids array 1–15 items, each PCID 16 hex chars).
  - **Fail**: Dialog "Invalid Activation Key Data" with error list, return `{ success: false }`.

### 2.2 Pick key and PCID

- **Random key** – One random entry from `activationKeys` (e.g. key index 5).
- **Random PCID** – One random PCID from that key’s `pcids` array.
- **Set** – `ACTIVATION_PCID_HEX_STRING` = that PCID, `PRODUCT_KEY` = that key’s `productKey`.
- **Game dir** – Uses `GAME_INSTALL_DIR` (set at app load / settings; default `%HOME%\Games\Shadowrun` or custom path).

### 2.3 Step 1/6 – Registry access

- **Action** – `registryUtils.checkPathAccess()` (queries `HKEY_CURRENT_USER\Software\Classes\SOFTWARE\Microsoft\XLive`).
- **Fail**: Dialog "Registry Access Denied", return `{ success: false }`.

### 2.4 Step 2/6 – PCID must exist

- **Action** – `registryUtils.checkPcidInRegistry()` (reg query for `PCID` under same path).
- **Fail**: Dialog "PCID Not Found" / "Launch the game at least once...", return `{ success: false }`.

### 2.5 Step 3/6 – Read current PCID

- **Action** – `registryUtils.getPcidFromRegistry()` (read current PCID value).
- **Fail**: Dialog "Failed to Read PCID", return `{ success: false }`.

### 2.6 Step 4/6 – PCID backup

- **Action** – `registryUtils.checkSrPcidBackupExists()` (check for `SRPCIDBACKUP`).
- If **no backup**: `registryUtils.backupPcidToRegistryViaRegFile(currentPcid)` (write backup to registry).
  - **Fail**: Dialog "PCID Backup Failed", return `{ success: false }`.

### 2.7 Step 5/6 – Registry-based activation (critical)

All of this is in a `try`; any failure throws and is caught at 2.10.

1. **Set activation PCID**
   - **Action** – `registryUtils.reversePcidByteOrder(ACTIVATION_PCID_HEX_STRING)` then `registryUtils.setPcidInRegistry(reversedPcid)`.
   - Reverses byte pairs in the PCID (e.g. `b6377a64a9f736a3` → `a336f7a9647a37b6`), then writes a .reg file and runs `regedit.exe /s` to set `PCID` at `HKEY_CURRENT_USER\...\XLive` to the reversed PCID (QWORD, little-endian from 16-char hex).
   - **Fail**: Throws "Failed to set activation PCID" → caught → dialog "Activation Error", return `{ success: false }`.

2. **Activate game in registry**
   - **Action** – `registryUtils.activateGameInRegistry(GAME_INSTALL_DIR, PRODUCT_KEY)`.
   - Builds .reg content and `registryUtils.importRegFile(regContent)` (writes temp .reg, runs `reg import`). It writes:
     - `HKEY_CURRENT_USER\Software\Classes\Software\Microsoft\XLive\Games\4d5307d6`: `TitleId`, `Activation`.
     - `HKEY_CURRENT_USER\Software\Classes\Microsoft\Games\Shadowrun`: `InstallationDirectory` = `GAME_INSTALL_DIR`, `OnlineProductKey` = `PRODUCT_KEY`.
   - **Fail**: Throws (e.g. "Failed to apply game activation settings") → caught → dialog "Activation Error", return `{ success: false }`.

### 2.8 Pre–Step 6/6 – Delete config.bin only

- **Action** – `registryUtils.deleteTokenFiles()`.
- Deletes (if present) **only**:
  - `%USERPROFILE%\AppData\Local\Microsoft\XLive\Titles\4d5307d6\config.bin`
- **Does not delete** `Token.bin` (required for activation).
- **Fail**: Only logged as warning; activation continues (no return).

### 2.9 Step 6/6 – Token injection (XLiveActivateHelper.exe)

- **Check .NET 6.0 x86** – `checkDotNet6x86Runtime()`.
  - If **not installed**: Dialog "Missing .NET 6.0 Runtime" with option "Install .NET 6.0" or "Cancel".
    - Cancel → dialog "Activation Cancelled", return `{ success: false }`.
    - Install → download/install; if install fails or still not detected → dialog and return `{ success: false }`.
- **Find helper** – Look for `XLiveActivateHelper.exe` in (in order):
  1. `process.resourcesPath` or `app.getAppPath()` + `XLiveActivateHelper.exe`
  2. `app.getAppPath()` + `XLiveActivateHelper.exe`
  3. `app.getAppPath()` + `resources\XLIVEActivateHelper\...\bin\Release\net6.0\win-x86\XLIVEActivateHelper.exe`
  4. `__dirname\..\XLiveActivateHelper.exe`
- If **not found**: Log warning "XLiveActivateHelper.exe not found"; activation still returns success (registry activation is considered done).
- If **found**:
  - **Spawn** – `spawn(helperPath, [PRODUCT_KEY], { cwd: GAME_INSTALL_DIR, ... })`.
  - Helper runs with **one argument**: the product key (e.g. `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`). Working directory = game install dir (so it can load `xlive.dll`).
  - **Exit codes** (from helper):
    - **0**: Token injection success.
    - **1**: Invalid args / malformed key (logged).
    - **2**: xlive.dll not found (logged).
    - **3**: XLiveSetSponsorToken failed (logged).
    - **-1**: Process failed to start (logged).
  - Non‑zero does **not** change the main process return value: activation still returns `success: true`.

### 2.10 If token injection did not succeed

- Product key is **copied to clipboard**.
- Optional clipboard auto-clear after `activationConfig.settings?.clearClipboardAfterSeconds` (e.g. 30).
- **Dialog** – `showActivationSuccessDialog(PRODUCT_KEY, clearAfterSeconds)` (shows key, copy again, etc.).

### 2.11 Success path

- Log "ACTIVATION PROCESS COMPLETED" and summary (registry: SUCCESS, PCID backup: SUCCESS, activation PCID set: SUCCESS, config.bin cleanup, token injection SUCCESS or FAILED).
- **Return** – `{ success: true, message: "Game activated successfully." }`.

### 2.12 Catch block (Step 5/6 or Step 6/6 throw)

- Dialog "Activation Error" with `error.message`.
- **Return** – `{ success: false, error: "Activation process failed: ..." }`.

### 2.13 Outer catch (validation or other)

- Dialog "Activation System Error".
- **Return** – `{ success: false, error: error.message }`.

---

## 3. Where things can go wrong (quick reference)

| Step | What fails | What you see / result |
|------|------------|------------------------|
| Renderer | No PCID | Toast: launch game first; no main activation. |
| Renderer | User cancels confirm | Nothing else runs. |
| 2.1 | Missing/invalid `activationKeys.json` | "Failed to Load Activation Keys" or "Invalid Activation Key Data". |
| 2.3 | No registry access | "Registry Access Denied". |
| 2.4 | No PCID in registry | "PCID Not Found" (launch game first). |
| 2.5 | Can’t read PCID | "Failed to Read PCID". |
| 2.6 | Backup creation fails | "PCID Backup Failed". |
| 2.7.1 | Set PCID fails | "Activation Error" / "Failed to set activation PCID". |
| 2.7.2 | activateGameInRegistry fails | "Activation Error" / "Failed to apply game activation settings". |
| 2.8 | config.bin delete fails | Warning in logs only; flow continues. |
| 2.9 | .NET 6.0 x86 missing / user cancels / install fails | Dialog and return `success: false` (or install path). |
| 2.9 | Helper not found | Warning in logs; still returns `success: true`. |
| 2.9 | Helper exits non‑zero (e.g. 1, 2, 3) | Logged only; still returns `success: true`. |

So: **"Says success but not activated"** usually means Step 5/6 (registry + PCID) succeeded and the process returned success, but either:

- **XLiveActivateHelper.exe** was not found, or  
- **.NET 6.0 x86** was missing so the helper never ran, or  
- The **helper ran but exited with code 1, 2, or 3** (check devtools/console or logs for "[Step 6/6] Helper exited with code: X").

Checking the console/logs for **"[Step 6/6]"** and the helper exit code will show exactly where the error is.
