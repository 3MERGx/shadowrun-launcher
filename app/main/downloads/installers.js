// Silent installer runner used by the download-game pipeline for GFWL +
// DirectX 9 web installer.
//
// Behavior preserved verbatim from app/main.js (Phase 6 extraction):
//
//   - dxwebsetup.exe / "directx9" / "directx_Jun2010" markers in the path
//     trigger the `/Q` (quiet) flag, which is what dxwebsetup.exe accepts.
//   - gfwlivesetup.exe runs with `/quiet /norestart` - the bootstrapper
//     unfortunately may flash a tiny progress window even with /quiet (no
//     fully-hidden mode is supported by gfwlivesetup.exe).
//   - Anything else falls back to the generic /silent /quiet /qn /norestart
//     trio, which covers MSI + InstallShield + InnoSetup variants.
//   - We never reject - installer non-zero exit codes are common and almost
//     always non-fatal (e.g. component already installed). The download-game
//     handler relies on this and re-checks isDX9Installed / isGFWLInstalled
//     after the call.
//   - 5-minute hard timeout: if the installer hasn't returned by then we
//     `process.kill(child.pid)` and resolve so the launcher doesn't hang.

const { safeLog } = require("../logger");
const { exec } = require("child_process");

// Add this function for silent installations
function runSilentInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    let installCommand;

    if (
      installerPath.includes("directx9") ||
      installerPath.includes("directx_Jun2010") ||
      installerPath.includes("dxwebsetup")
    ) {
      // Silent DirectX Web Installer installation
      // dxwebsetup.exe uses /Q flag for quiet mode
      safeLog.info("[Silent Installer] Detected DirectX Web Installer");
      installCommand = `"${installerPath}" /Q`;
    } else if (installerPath.includes("gfwlivesetup")) {
      // Silent GFWL installation - run the bootstrapper setup.exe
      safeLog.info("[Silent Installer] Detected GFWL installer");
      safeLog.info(
        "[Silent Installer] Running gfwlivesetup.exe bootstrapper to install all GFWL components"
      );
      // Note: GFWL installer may briefly show a progress window - this is unavoidable
      // The gfwlivesetup.exe installer doesn't support fully hidden installation
      installCommand = `"${installerPath}" /quiet /norestart`;
    } else {
      safeLog.info("[Silent Installer] Using default silent flags");
      installCommand = `"${installerPath}" /silent /quiet /qn /norestart`;
    }

    safeLog.info(`[Silent Installer] Command: ${installCommand}`);
    safeLog.info(`[Silent Installer] Starting installation...`);

    const child = exec(installCommand, (error, stdout, stderr) => {
      if (stdout) safeLog.info(`[Silent Installer] STDOUT: ${stdout}`);
      if (stderr) safeLog.error(`[Silent Installer] STDERR: ${stderr}`);

      if (error) {
        safeLog.error(`[Silent Installer] Error code: ${error.code}`);
        safeLog.error(`[Silent Installer] Error message: ${error.message}`);
        // Don't reject - installer errors are often non-fatal
        resolve();
      } else {
        safeLog.info("[Silent Installer] Installation completed successfully");
        resolve();
      }
    });

    // 15-minute timeout — GFWL's bootstrapper downloads additional components
    // at runtime and can take well over 5 minutes on slow VMs or poor connections.
    const timeout = setTimeout(() => {
      safeLog.warn(
        "[Silent Installer] Installation timeout (15 min) - continuing anyway"
      );
      try {
        process.kill(child.pid);
        safeLog.info(
          "[Silent Installer] Killed installer process after timeout"
        );
      } catch (e) {
        safeLog.warn(
          `[Silent Installer] Could not kill installer process: ${e.message}`
        );
      }
      resolve(); // Continue anyway
    }, 15 * 60 * 1000); // 15 minutes max

    child.on("exit", (code) => {
      safeLog.info(`[Silent Installer] Process exited with code: ${code}`);
      clearTimeout(timeout);
    });
  });
}

module.exports = { runSilentInstaller };
