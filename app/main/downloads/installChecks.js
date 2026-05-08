// Runtime checks for "is component X installed on this machine".
//
// These are ALSO used by the diagnostics composer (app/main/diagnostics) and
// the persistent-issues panel - exporting them here lets us share a single
// implementation between the download flow and the diagnostics flow without
// any DI gymnastics. main.js still imports `isDX9Installed` separately to
// feed it into the diagnostics DI bag, since the diagnostics module itself
// stays storage-agnostic.
//
// DX9 + VC checks preserved from app/main.js (Phase 6 extraction); GFWL roots extended for custom installer targets:
//   - isDX9Installed: looks for d3dx9_43.dll (preferred) or d3dx9_42.dll
//     (older installs) under %SystemRoot%\System32 OR %SystemRoot%\SysWOW64.
//     Either DLL on either path counts as "installed" - we don't require both.
//   - isGFWLInstalled: requires Client\gfwlclient.exe or Client\GFWLClient.exe
//     under one of several candidate roots: default Program Files (x86) tree,
//     parallel under Documents, under %HOME%\Games\Shadowrun (when users aim the
//     visible installer at the launcher’s default game folder), optional
//     ...\Microsoft Games for Windows - LIVE under saved customGamePath from
//     settings.json, plus customGamePath itself (installer rooted Client\ there).
//   - isVcRedistX86Installed: matches Control Panel — enumerates Uninstall registry
//     keys for "Microsoft Visual C++ … (x86)" entries in the VS2015–2022 / v14
//     family (DisplayName contains v14, 2015-2022, standalone 2015/17/19/22,
//     or DisplayVersion is a v14 build such as 14.50.35719).
//     We do NOT rely on VisualStudio\14.0\VC\Runtimes\x86 "Installed" alone; it
//     can stay set after an uninstall. We do NOT use vcruntime140.dll (often left
//     on disk after uninstall).

const { safeLog } = require("../logger");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { app } = require("electron");

// Helper function to check if DirectX 9 is installed
// Checks for d3dx9_43.dll which indicates DirectX 9 runtime components are installed
function isDX9Installed() {
  return new Promise((resolve) => {
    safeLog.debug(
      "[DirectX Check] Checking for DirectX 9 runtime components...",
    );

    const systemRoot = process.env.SystemRoot || "C:\\Windows";

    const paths = [
      path.join(systemRoot, "System32"),
      path.join(systemRoot, "SysWOW64"),
    ];

    // Check for DirectX 9 Extensions DLLs (43 is latest; 42 as fallback for older installs)
    const dllsToCheck = ["d3dx9_43.dll", "d3dx9_42.dll"];

    for (const dir of paths) {
      if (!fs.existsSync(dir)) continue;

      for (const dll of dllsToCheck) {
        const dllPath = path.join(dir, dll);
        if (fs.existsSync(dllPath)) {
          safeLog.debug(
            `[DirectX Check] ✅ Found DirectX 9 component: ${path.basename(dir)}\\${dll}`,
          );
          resolve(true);
          return;
        }
      }
    }

    safeLog.debug(
      "[DirectX Check] ❌ DirectX 9 runtime components not found (d3dx9_43/42.dll missing)",
    );
    resolve(false);
  });
}

const GFWL_CLIENT_EXES = ["gfwlclient.exe", "GFWLClient.exe"];

/** Returns true if Client\gfwlclient.exe or Client\GFWLClient.exe exists under basePath. */
function gfwlClientPresentUnderBase(basePath) {
  if (!basePath) return false;
  for (const name of GFWL_CLIENT_EXES) {
    const exePath = path.join(basePath, "Client", name);
    if (fs.existsSync(exePath)) {
      safeLog.debug(`[GFWL Check] ✅ Found ${exePath}`);
      return true;
    }
  }
  return false;
}

/**
 * Builds ordered candidate folders that might contain the GFWL Client subtree.
 * Users sometimes choose a custom install directory when the silent bootstrapper
 * falls through to the interactive GFWL installer (Documents, Shadowrun folder, etc.).
 */
function collectGfwlCandidateRoots() {
  const seen = new Set();
  const roots = [];

  function add(candidate) {
    if (!candidate || typeof candidate !== "string") return;
    const normalized = path.normalize(candidate);
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    roots.push(normalized);
  }

  add("C:\\Program Files (x86)\\Microsoft Games for Windows - LIVE");

  try {
    add(
      path.join(app.getPath("documents"), "Microsoft Games for Windows - LIVE"),
    );
    add(
      path.join(
        app.getPath("home"),
        "Games",
        "Shadowrun",
        "Microsoft Games for Windows - LIVE",
      ),
    );
    // Installer aimed at the launcher default game directory (Client\ may live here directly)
    add(path.join(app.getPath("home"), "Games", "Shadowrun"));
  } catch (error) {
    safeLog.warn(
      "[GFWL Check] Could not resolve Documents/Home paths:",
      error.message,
    );
  }

  try {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    if (fs.existsSync(settingsPath)) {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      const custom = parsed && parsed.customGamePath;
      if (typeof custom === "string" && custom.trim()) {
        const gp = custom.trim();
        add(path.join(gp, "Microsoft Games for Windows - LIVE"));
        add(gp);
      }
    }
  } catch (error) {
    safeLog.warn(
      "[GFWL Check] Could not read customGamePath from settings:",
      error.message,
    );
  }

  return roots;
}

// Helper function to check if GFWL is installed
function isGFWLInstalled() {
  return new Promise((resolve) => {
    const roots = collectGfwlCandidateRoots();

    for (const base of roots) {
      if (gfwlClientPresentUnderBase(base)) {
        resolve(true);
        return;
      }
    }

    safeLog.debug(
      "[GFWL Check] ❌ GFWL client executables not found under known candidate roots",
    );
    resolve(false);
  });
}

// Check if Microsoft Visual C++ v14 Redistributable (x86) is installed.
//
// Uses the same source as Control Panel (Uninstall registry DisplayName), not
// VisualStudio\...\Runtimes\x86 — that key can lag or remain non-zero after uninstall.
function isVcRedistX86Installed() {
  return new Promise((resolve) => {
    safeLog.debug(
      "[VC++ Check] Scanning Uninstall keys for Microsoft Visual C++ v14 (x86) redistributable...",
    );

    const psScript = `
$ok = $false
$roots = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  $keys = Get-ChildItem $root -ErrorAction SilentlyContinue
  foreach ($key in $keys) {
    $entry = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
    $dn = $entry.DisplayName
    $dv = $entry.DisplayVersion
    if ([string]::IsNullOrEmpty($dn)) { continue }
    if ($dn -notlike '*Visual C++*') { continue }
    if ($dn -notlike '*(x86)*') { continue }
    if ($dn -like '*v14*') { $ok = $true; break }
    if ($dn -like '*14.50.35719*') { $ok = $true; break }
    if ($dv -like '14.*') { $ok = $true; break }
    if ($dv -eq '14.50.35719') { $ok = $true; break }
    if ($dn -like '*2015-2022*') { $ok = $true; break }
    if ($dn -like '*Visual C++ 2015*') { $ok = $true; break }
    if ($dn -like '*Visual C++ 2017*') { $ok = $true; break }
    if ($dn -like '*Visual C++ 2019*') { $ok = $true; break }
    if ($dn -like '*Visual C++ 2022*') { $ok = $true; break }
  }
  if ($ok) { break }
}
if ($ok) { exit 0 } else { exit 1 }
`.trim();

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      { windowsHide: true, timeout: 30000 },
      (error) => {
        const installed = !error;
        if (installed) {
          safeLog.debug(
            "[VC++ Check] ✅ Found matching Uninstall entry (Microsoft Visual C++ v14 x86)",
          );
        } else {
          if (error && error.code !== 1) {
            safeLog.warn(
              "[VC++ Check] PowerShell probe failed:",
              error.message,
            );
          }
          safeLog.debug(
            "[VC++ Check] ❌ No Microsoft Visual C++ v14 Redistributable (x86) entry in Uninstall registry",
          );
        }
        resolve(installed);
      },
    );
  });
}

module.exports = { isDX9Installed, isGFWLInstalled, isVcRedistX86Installed };
