/**
 * GPU detection for the Shadowrun FPS Launcher.
 *
 * Verbatim port of the GPU detection that previously lived in app/main.js.
 * Fallback chain on Windows (in order):
 *   1. PowerShell multi-GPU enumeration (Get-CimInstance). Some builds return
 *      empty from the multi-GPU script even when a primary GPU probe works.
 *   2. PowerShell single-GPU probe (same source as multi; fills the list when
 *      step 1 fails).
 *   3. WMIC on older Windows only (removed Win11 24H2+).
 *   4. Electron `app.getGPUInfo("complete")` / gl_renderer parsing.
 *
 * Two flavors are exposed:
 *   - `detectGPUVendor()` -> single primary GPU `{ vendor, name }`. Used by
 *     the launch path (DXVK env-var tuning) and the diagnostics report.
 *   - `detectAllGPUs()`   -> array of every detected GPU. Used by the launch
 *     path for multi-GPU selection.
 *
 * `detectVendorFromName()` is the shared name -> vendor classifier and is
 * exported so callers (UI, diagnostics) can reuse the exact same heuristics.
 *
 * Behavior is intentionally identical to the inline implementation - only
 * the file location changed.
 */

const util = require("util");
const { exec } = require("child_process");
const { app } = require("electron");
const { safeLog } = require("../logger");

const execPromise = util.promisify(exec);

// WMIC is deprecated and not installed on Windows 11 24H2+ by default. After
// the first "not found" result, skip further WMIC attempts for this process.
let wmicKnownUnavailable = false;
let wmicSkipLogged = false;

function isWmicNotFoundError(err) {
  const msg = `${err?.message || ""} ${err?.stderr || ""}`.toLowerCase();
  return (
    msg.includes("wmic") &&
    (msg.includes("not recognized as an internal or external command") ||
      msg.includes("is not recognized") ||
      /'wmic' is not recognized/.test(msg))
  );
}

function logWmicSkippedOnce() {
  if (wmicSkipLogged) return;
  wmicSkipLogged = true;
  safeLog.info(
    "[GPU Detection] WMIC is not available on this Windows build (expected on Win11 24H2+). Using PowerShell/Electron fallbacks only."
  );
}

// ----------------------------------------------------------------------------
// PowerShell helpers
// ----------------------------------------------------------------------------

function scoreGpuForPreference({ vendor, name }) {
  const n = (name || "").toLowerCase();

  // Filter / deprioritize non-real adapters hard.
  if (
    n.includes("microsoft basic") ||
    n.includes("remote") ||
    n.includes("vmware") ||
    n.includes("virtual") ||
    n.includes("parallels") ||
    n.includes("software renderer") ||
    n.includes("null renderer")
  ) {
    return -1000;
  }

  const looksLikeNvidia = vendor === "nvidia" || n.includes("nvidia") || n.includes("geforce");
  const looksLikeIntel = vendor === "intel" || n.includes("intel") || n.includes("iris") || n.includes("uhd") || n.includes("xe") || n.includes("arc");

  // AMD iGPU/APU: commonly reports as "AMD Radeon(TM) Graphics" without an RX model.
  const looksLikeAmdIntegrated =
    (vendor === "amd" || n.includes("amd") || n.includes("radeon")) &&
    n.includes("graphics") &&
    !n.includes("radeon rx") &&
    !/rx\s*\d+/i.test(name || "");

  const looksLikeAmdDiscrete =
    (vendor === "amd" || n.includes("amd") || n.includes("radeon")) &&
    (n.includes("radeon rx") || /rx\s*\d+/i.test(name || "") || (n.includes("radeon") && !n.includes("graphics")));

  // Prefer NVIDIA dGPU first, then AMD dGPU, then other real adapters, then integrated.
  if (looksLikeNvidia) return 300;
  if (looksLikeAmdDiscrete) return 250;
  if (looksLikeIntel) return 100;
  if (looksLikeAmdIntegrated) return 50;

  // Unknown but non-virtual adapter.
  return 150;
}

function pickPreferredGpu(gpus) {
  if (!Array.isArray(gpus) || gpus.length === 0) return null;
  const scored = gpus
    .map((g) => ({
      ...g,
      _score: scoreGpuForPreference(g),
    }))
    .sort((a, b) => b._score - a._score);
  return scored[0] ? { vendor: scored[0].vendor, name: scored[0].name } : null;
}

/**
 * Run a small PowerShell script (encoded as base64 UTF-16LE) that returns
 * the name of the primary GPU. Discrete GPUs are preferred over integrated
 * Intel/Basic/Remote/VMware/Virtual/Microsoft renderers; falls back to the
 * first available adapter if no discrete is present.
 *
 * @returns {Promise<string|null>} GPU name or null if PowerShell failed.
 */
function runPowerShellForGPU() {
  return new Promise((resolve) => {
    const script =
      "try { $gpus = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue; if (-not $gpus) { $gpus = Get-WmiObject Win32_VideoController -ErrorAction SilentlyContinue }; if ($gpus) { $real = $gpus | Where-Object { $_.Name -and $_.Name -notmatch 'Basic|Remote|VMware|Virtual|Microsoft|Software Renderer|NULL' }; $nvidia = $real | Where-Object { $_.Name -match 'NVIDIA|GeForce|RTX|GTX|Quadro|TITAN|Tesla' } | Select-Object -First 1; if ($nvidia) { $nvidia.Name; return }; $amdDiscrete = $real | Where-Object { $_.Name -match 'Radeon\\s*RX|\\bRX\\s*\\d+' -or (($_.Name -match 'Radeon') -and ($_.Name -notmatch 'Graphics\\b')) } | Select-Object -First 1; if ($amdDiscrete) { $amdDiscrete.Name; return }; $intel = $real | Where-Object { $_.Name -match 'Intel|UHD|Iris|Arc|Xe' } | Select-Object -First 1; if ($intel) { $intel.Name; return }; ($real | Select-Object -First 1).Name } } catch {}";
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    exec(
      `powershell -NoProfile -EncodedCommand ${encoded}`,
      { timeout: 8000 },
      (psError, psStdout) => {
        if (psError || !psStdout || !psStdout.trim()) {
          resolve(null);
          return;
        }
        resolve(psStdout.trim());
      }
    );
  });
}

/**
 * Run PowerShell to get all GPU names, pipe-separated, discrete first.
 * Filters out Intel/Basic/Remote/VMware/Virtual/Microsoft renderers when at
 * least one discrete GPU is present.
 *
 * @returns {Promise<string[]|null>}
 */
function runPowerShellForAllGPUs() {
  return new Promise((resolve) => {
    const script =
      "try { $gpus = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue; if (-not $gpus) { $gpus = Get-WmiObject Win32_VideoController -ErrorAction SilentlyContinue }; if ($gpus) { $real = $gpus | Where-Object { $_.Name -and $_.Name -notmatch 'Basic|Remote|VMware|Virtual|Microsoft|Software Renderer|NULL' }; $nvidia = $real | Where-Object { $_.Name -match 'NVIDIA|GeForce|RTX|GTX|Quadro|TITAN|Tesla' }; $amdDiscrete = $real | Where-Object { $_.Name -match 'Radeon\\s*RX|\\bRX\\s*\\d+' -or (($_.Name -match 'Radeon') -and ($_.Name -notmatch 'Graphics\\b')) }; $intel = $real | Where-Object { $_.Name -match 'Intel|UHD|Iris|Arc|Xe' }; $amdIntegrated = $real | Where-Object { ($_.Name -match 'AMD|Radeon') -and ($_.Name -match 'Graphics\\b') -and ($_.Name -notmatch 'Radeon\\s*RX|\\bRX\\s*\\d+') }; $others = $real | Where-Object { ($nvidia.Name -notcontains $_.Name) -and ($amdDiscrete.Name -notcontains $_.Name) -and ($intel.Name -notcontains $_.Name) -and ($amdIntegrated.Name -notcontains $_.Name) }; $preferred = @(); $preferred += $nvidia; $preferred += $amdDiscrete; $preferred += $intel; $preferred += $others; if ($nvidia.Count -gt 0 -or $amdDiscrete.Count -gt 0) { $preferred | ForEach-Object { $_.Name } | Select-Object -Unique -First 16 -Join '|' } else { $preferred += $amdIntegrated; $preferred | ForEach-Object { $_.Name } | Select-Object -Unique -First 16 -Join '|' } } } catch {}";
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    exec(
      `powershell -NoProfile -EncodedCommand ${encoded}`,
      { timeout: 8000 },
      (psError, psStdout) => {
        if (psError || !psStdout || !psStdout.trim()) {
          resolve(null);
          return;
        }
        resolve(
          psStdout
            .trim()
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
        );
      }
    );
  });
}

// ----------------------------------------------------------------------------
// WMIC parser
// ----------------------------------------------------------------------------

/**
 * Parse `wmic path win32_VideoController get name` stdout into a single GPU
 * name. Discrete adapters (NVIDIA / AMD / discrete-AMD-RX) win over
 * integrated (Intel UHD/Iris/Arc/Xe). Filters virtual / remote / software
 * renderers entirely.
 *
 * @param {string} stdout
 * @returns {string|null}
 */
function parseWMICGpuOutput(stdout) {
  const lines = stdout.split("\n").filter((line) => {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    return (
      trimmed &&
      !trimmed.includes("Name") &&
      !lower.includes("microsoft basic") &&
      !lower.includes("remote desktop") &&
      !lower.includes("vmware") &&
      !lower.includes("virtualbox") &&
      !lower.includes("parallels") &&
      !lower.includes("software renderer") &&
      !lower.includes("null renderer")
    );
  });
  let discreteGpu = null;
  let integratedGpu = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const isDiscrete =
      lower.includes("nvidia") ||
      lower.includes("amd") ||
      lower.includes("radeon") ||
      lower.includes("geforce") ||
      lower.includes("rtx") ||
      lower.includes("gtx") ||
      lower.includes("quadro") ||
      /rx\s*\d+/i.test(trimmed);
    const isIntegrated =
      lower.includes("intel") ||
      lower.includes("uhd") ||
      lower.includes("iris") ||
      lower.includes("arc") ||
      lower.includes("xe");
    if (isDiscrete && !discreteGpu) discreteGpu = trimmed;
    else if (isIntegrated && !integratedGpu) integratedGpu = trimmed;
  }
  if (discreteGpu) return discreteGpu;
  if (integratedGpu) return integratedGpu;
  return lines.length > 0 ? lines[0].trim() : null;
}

// ----------------------------------------------------------------------------
// Vendor classification
// ----------------------------------------------------------------------------

/**
 * Classify a raw GPU name into one of: amd, nvidia, intel, qualcomm, matrox,
 * virtual, unknown. Used by detection (PowerShell, WMIC, Electron) and by
 * any UI that wants to render a vendor-specific badge.
 *
 * @param {string} gpuName
 * @returns {"amd"|"nvidia"|"intel"|"qualcomm"|"matrox"|"virtual"|"unknown"}
 */
function detectVendorFromName(gpuName) {
  if (!gpuName || gpuName === "Unknown GPU") return "unknown";

  const gpuLower = gpuName.toLowerCase();

  // AMD detection - expanded patterns
  if (
    gpuLower.includes("amd") ||
    gpuLower.includes("radeon") ||
    gpuLower.includes("advanced micro devices") ||
    gpuLower.includes("rx ") || // RX 580, RX 6900 XT, etc.
    gpuLower.includes("radeon rx") ||
    gpuLower.includes("radeon pro") ||
    gpuLower.includes("firepro") ||
    gpuLower.includes("firepro w") ||
    /rx\s*\d+/i.test(gpuName)
  ) {
    return "amd";
  }
  // NVIDIA detection - expanded patterns
  if (
    gpuLower.includes("nvidia") ||
    gpuLower.includes("geforce") ||
    gpuLower.includes("quadro") ||
    gpuLower.includes("rtx") ||
    gpuLower.includes("gtx") ||
    gpuLower.includes("titan") ||
    gpuLower.includes("tesla") ||
    gpuLower.includes("grid") ||
    gpuLower.includes("nvs") ||
    /rtx\s*\d+|gtx\s*\d+|geforce\s*rtx\s*\d+|geforce\s*gtx\s*\d+/i.test(gpuName)
  ) {
    return "nvidia";
  }
  // Intel detection - expanded patterns
  if (
    gpuLower.includes("intel") ||
    gpuLower.includes("uhd") ||
    gpuLower.includes("iris") ||
    gpuLower.includes("arc") ||
    gpuLower.includes("xe") || // Intel Xe graphics
    gpuLower.includes("hd graphics") ||
    gpuLower.includes("integrated graphics") ||
    /intel\s*(uhd|iris|arc|xe)/i.test(gpuName)
  ) {
    return "intel";
  }
  // Qualcomm/Adreno (ARM devices, e.g. Snapdragon, Surface Pro X)
  if (
    gpuLower.includes("qualcomm") ||
    gpuLower.includes("adreno") ||
    gpuLower.includes("snapdragon")
  ) {
    return "qualcomm";
  }
  // Matrox (rare but possible)
  if (gpuLower.includes("matrox")) {
    return "matrox";
  }
  // VMware/Virtual GPU
  if (gpuLower.includes("vmware") || gpuLower.includes("virtual")) {
    return "virtual";
  }

  return "unknown";
}

// ----------------------------------------------------------------------------
// Top-level detection - single primary GPU
// ----------------------------------------------------------------------------

/**
 * Detect the primary GPU. Tries PowerShell -> WMIC -> Electron's
 * `app.getGPUInfo("complete")` in that order. Always resolves; on total
 * failure returns `{ vendor: "unknown", name: "Unknown GPU" }`.
 *
 * @returns {Promise<{ vendor: string, name: string }>}
 */
async function detectGPUVendor() {
  safeLog.info("[GPU Detection] Detecting GPU vendor...");

  // Prefer using the multi-GPU detector + our own scoring, so hybrid systems
  // (AMD iGPU + NVIDIA dGPU) don't accidentally pick the integrated adapter.
  try {
    const all = await detectAllGPUs();
    const preferred = pickPreferredGpu(all);
    if (preferred) {
      safeLog.info("[GPU Detection] Preferred GPU selected:", preferred.name);
      safeLog.info(
        `[GPU Detection] OK Detected: ${preferred.vendor.toUpperCase()} - ${preferred.name}`
      );
      return preferred;
    }
  } catch (e) {
    safeLog.info(
      "[GPU Detection] Preferred GPU selection failed, continuing fallbacks:",
      e.message
    );
  }

  // 1. PowerShell primary (WMIC removed on Win11 24H2+).
  if (process.platform === "win32") {
    const psName = await runPowerShellForGPU();
    if (psName) {
      safeLog.info("[GPU Detection] PowerShell detected:", psName);
      const vendor = detectVendorFromName(psName);
      safeLog.info(
        `[GPU Detection] OK Detected: ${vendor.toUpperCase()} - ${psName}`
      );
      return { vendor, name: psName };
    }

    // 2. WMIC fallback (older Windows only — absent on Win11 24H2+).
    if (!wmicKnownUnavailable) {
      try {
        const { stdout } = await execPromise(
          "wmic path win32_VideoController get name",
          { timeout: 5000 }
        );
        const gpuName = parseWMICGpuOutput(stdout);
        if (gpuName) {
          safeLog.info("[GPU Detection] WMIC detected:", gpuName);
          const vendor = detectVendorFromName(gpuName);
          safeLog.info(
            `[GPU Detection] OK Detected: ${vendor.toUpperCase()} - ${gpuName}`
          );
          return { vendor, name: gpuName };
        }
      } catch (wmicError) {
        if (isWmicNotFoundError(wmicError)) {
          wmicKnownUnavailable = true;
          logWmicSkippedOnce();
        } else {
          safeLog.info("[GPU Detection] WMIC not available:", wmicError.message);
        }
      }
    }

    // 3. Electron/Chromium GPU info fallback.
    try {
      const gpuInfo = await app.getGPUInfo("complete");
      const glRenderer =
        gpuInfo?.gl_renderer ||
        gpuInfo?.gpu?.gl_renderer ||
        gpuInfo?.auxAttributes?.glRenderer;
      if (glRenderer && typeof glRenderer === "string") {
        // gl_renderer is often "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080
        // Direct3D11...)". Pull the parenthesized GPU name out.
        const match = glRenderer.match(/\([^,]+,?\s*([^)]+)\)/);
        const name = match ? match[1].trim() : glRenderer;
        if (name.length > 0 && !name.startsWith("Google Inc.")) {
          const vendor = detectVendorFromName(name);
          if (vendor !== "unknown") {
            safeLog.info("[GPU Detection] Electron GPU info:", name);
            return { vendor, name };
          }
        }
      }
    } catch (e) {
      safeLog.info(
        "[GPU Detection] Electron getGPUInfo fallback failed:",
        e.message
      );
    }
  }

  safeLog.info("[GPU Detection] All methods failed, returning Unknown GPU");
  return { vendor: "unknown", name: "Unknown GPU" };
}

// ----------------------------------------------------------------------------
// Top-level detection - all GPUs (multi-GPU support)
// ----------------------------------------------------------------------------

/**
 * Detect every GPU on the system. Used by the Settings UI to render a
 * multi-GPU list. Returns `[]` on total failure.
 *
 * @returns {Promise<Array<{ vendor: string, name: string }>>}
 */
async function detectAllGPUs() {
  safeLog.info("[GPU Detection] Detecting all GPUs...");

  if (process.platform === "win32") {
    const names = await runPowerShellForAllGPUs();
    if (names && names.length > 0) {
      const gpus = names.map((name) => ({
        vendor: detectVendorFromName(name),
        name,
      }));
      safeLog.info(
        `[GPU Detection] OK PowerShell detected ${gpus.length} GPU(s):`,
        gpus
      );
      return gpus;
    }

    // Multi-GPU PowerShell script occasionally returns nothing on some Windows
    // builds while the primary GPU probe still succeeds — reuse it for the list.
    const singlePsName = await runPowerShellForGPU();
    if (singlePsName) {
      const gpus = [
        {
          vendor: detectVendorFromName(singlePsName),
          name: singlePsName,
        },
      ];
      safeLog.info(
        "[GPU Detection] OK Using primary GPU probe (multi-GPU enumeration returned no adapters):",
        gpus
      );
      return gpus;
    }

    if (!wmicKnownUnavailable) {
      try {
      const { stdout } = await execPromise(
        "wmic path win32_VideoController get name",
        { timeout: 5000 }
      );
      const lines = stdout.split("\n").filter((line) => {
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase();
        return (
          trimmed &&
          !trimmed.includes("Name") &&
          !lower.includes("microsoft basic") &&
          !lower.includes("remote desktop") &&
          !lower.includes("vmware") &&
          !lower.includes("virtualbox") &&
          !lower.includes("parallels") &&
          !lower.includes("software renderer") &&
          !lower.includes("null renderer")
        );
      });
      const discreteGpus = [];
      const integratedGpus = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();
        // AMD integrated APUs ("AMD ... Graphics") get bucketed as integrated
        // unless they have an RX series number, which keeps real Radeon RX
        // cards out of the integrated bucket.
        const isIntegrated =
          lower.includes("intel") ||
          lower.includes("uhd") ||
          lower.includes("iris") ||
          lower.includes("arc") ||
          lower.includes("xe") ||
          (lower.includes("amd") &&
            lower.includes("graphics") &&
            !lower.includes("radeon rx") &&
            !/rx\s*\d+/i.test(trimmed));
        const isDiscrete =
          !isIntegrated &&
          (lower.includes("nvidia") ||
            lower.includes("geforce") ||
            lower.includes("rtx") ||
            lower.includes("gtx") ||
            lower.includes("quadro") ||
            lower.includes("titan") ||
            lower.includes("tesla") ||
            (lower.includes("amd") &&
              (lower.includes("radeon rx") || /rx\s*\d+/i.test(trimmed))) ||
            (lower.includes("radeon") && !lower.includes("graphics")));
        if (isDiscrete) {
          discreteGpus.push({
            vendor: detectVendorFromName(trimmed),
            name: trimmed,
          });
        } else if (isIntegrated) {
          integratedGpus.push({
            vendor: detectVendorFromName(trimmed),
            name: trimmed,
          });
        }
      }
      const allGpus =
        discreteGpus.length > 0 ? discreteGpus : integratedGpus;
      if (allGpus.length > 0) {
        safeLog.info(
          `[GPU Detection] OK WMIC detected ${allGpus.length} GPU(s):`,
          allGpus
        );
        return allGpus;
      }
      } catch (e) {
        if (isWmicNotFoundError(e)) {
          wmicKnownUnavailable = true;
          logWmicSkippedOnce();
        } else {
          safeLog.info("[GPU Detection] WMIC failed:", e.message);
        }
      }
    }
  }

  safeLog.info("[GPU Detection] No GPUs detected");
  return [];
}

module.exports = {
  detectGPUVendor,
  detectAllGPUs,
  detectVendorFromName,
  // Lower-level helpers exported for tests / advanced callers. Main.js does
  // not use these directly today; they're internals of detectGPUVendor /
  // detectAllGPUs but exposed here so future code can reuse them without
  // duplicating the encoded-PowerShell trick.
  runPowerShellForGPU,
  runPowerShellForAllGPUs,
  parseWMICGpuOutput,
};
