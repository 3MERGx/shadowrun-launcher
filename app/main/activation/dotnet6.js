/**
 * .NET 6.0 Desktop Runtime (x86) detection + silent installer.
 *
 * The activation pipeline shells out to XLiveActivateHelper.exe, which is a
 * 32-bit .NET 6.0 desktop binary. This module owns:
 *   - Detecting whether the right runtime + architecture is installed by
 *     reading HKLM\\...\\dotnet\\Setup\\InstalledVersions\\x86\\sharedhost.
 *   - Downloading the official MS x86 installer and running it silently
 *     (with redirect-following, progress logging, and 1641/3010 reboot
 *     exit codes treated as success).
 *
 * Pure data + I/O: no IPC, no settings. The renderer only sees the
 * "show-notification" toasts emitted via the injected getMainWindow().
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const { exec } = require("child_process");
const { safeLog } = require("../logger");

/**
 * Check whether .NET 6.0 Desktop Runtime (x86) is installed.
 *
 * @returns {Promise<{ installed: boolean, version: string }>} Resolves with
 *   `{ installed: true, version }` when the registry reports an x86 sharedhost
 *   version, otherwise `{ installed: false, version: "Not Installed" }`.
 *   Never rejects.
 */
async function checkDotNet6x86Runtime() {
  return new Promise((resolve) => {
    // On 64-bit Windows the 32-bit registry view lives under WOW6432Node.
    // On 32-bit Windows it lives directly under SOFTWARE.
    exec(
      'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v PROCESSOR_ARCHITECTURE',
      (error, stdout) => {
        const is64bit = stdout && stdout.includes("AMD64");
        const registryPath = is64bit
          ? "HKLM\\SOFTWARE\\WOW6432Node\\dotnet\\Setup\\InstalledVersions\\x86\\sharedhost"
          : "HKLM\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x86\\sharedhost";

        exec(`reg query "${registryPath}" /v Version`, (error, stdout) => {
          if (error || !stdout) {
            resolve({ installed: false, version: "Not Installed" });
            return;
          }

          const versionMatch = stdout.match(/Version\s+REG_SZ\s+([\d.]+)/);
          if (versionMatch && versionMatch[1]) {
            resolve({ installed: true, version: versionMatch[1] });
          } else {
            resolve({ installed: false, version: "Not Installed" });
          }
        });
      }
    );
  });
}

/**
 * Download and silently install .NET 6.0 Desktop Runtime x86.
 *
 * Pulls the official Microsoft CDN URL (direct .exe, not the redirect-based
 * download page), runs it with `/install /quiet /norestart`, and treats exit
 * codes 1641 / 3010 (reboot required / reboot pending) as success.
 *
 * @param {object} [deps]
 * @param {() => import("electron").BrowserWindow | null} [deps.getMainWindow]
 *   Returns the main window, used for show-notification toasts. If omitted
 *   or returns null, the install proceeds silently with log output only.
 * @returns {Promise<{ success: boolean, error?: string, rebootRecommended?: boolean }>}
 */
async function downloadAndInstallDotNet6({ getMainWindow } = {}) {
  return new Promise(async (resolve) => {
    const notify = (message, type) => {
      try {
        const win = typeof getMainWindow === "function" ? getMainWindow() : null;
        if (win && !win.isDestroyed()) {
          win.webContents.send("show-notification", { message, type });
        }
      } catch (_) {
        // Notification is best-effort; never block the installer on a UI error.
      }
    };

    try {
      safeLog.info("[.NET 6.0 Installer] Starting download and installation...");

      // Direct CDN link is more reliable than the redirect-based aka.ms URL,
      // which is intermittently rate-limited.
      const DOTNET6_URL =
        "https://builds.dotnet.microsoft.com/dotnet/WindowsDesktop/6.0.36/windowsdesktop-runtime-6.0.36-win-x86.exe";
      const installerPath = path.join(os.tmpdir(), "dotnet6-installer.exe");

      notify("⬇️ Downloading .NET 6.0 Runtime...", "info");

      safeLog.info("[.NET 6.0 Installer] Downloading from Microsoft...");
      safeLog.info(`[.NET 6.0 Installer] Destination: ${installerPath}`);

      const downloadWithRedirects = (url, maxRedirects = 5) => {
        return new Promise((downloadResolve) => {
          if (maxRedirects === 0) {
            safeLog.error("[.NET 6.0 Installer] Too many redirects");
            downloadResolve(false);
            return;
          }

          const file = fs.createWriteStream(installerPath);
          const urlObj = new URL(url);
          const isHttps = urlObj.protocol === "https:";
          const httpModule = isHttps ? https : http;

          const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          };

          const request = httpModule.get(options, (response) => {
            if (
              response.statusCode >= 300 &&
              response.statusCode < 400 &&
              response.headers.location
            ) {
              safeLog.info(
                `[.NET 6.0 Installer] Following redirect to: ${response.headers.location}`
              );
              file.close();
              fs.unlink(installerPath, () => {});
              const redirectUrl = response.headers.location.startsWith("http")
                ? response.headers.location
                : `${urlObj.protocol}//${urlObj.hostname}${response.headers.location}`;
              downloadResolve(
                downloadWithRedirects(redirectUrl, maxRedirects - 1)
              );
              return;
            }

            if (response.statusCode !== 200) {
              safeLog.error(
                `[.NET 6.0 Installer] Download failed: HTTP ${response.statusCode}`
              );
              file.close();
              fs.unlink(installerPath, () => {});
              downloadResolve(false);
              return;
            }

            const totalSize = parseInt(response.headers["content-length"], 10);
            let downloadedSize = 0;

            response.on("data", (chunk) => {
              downloadedSize += chunk.length;
              if (totalSize > 0) {
                const progress = Math.round((downloadedSize / totalSize) * 100);
                if (progress % 10 === 0) {
                  safeLog.info(
                    `[.NET 6.0 Installer] Download progress: ${progress}%`
                  );
                }
              }
            });

            response.pipe(file);

            file.on("finish", () => {
              file.close(() => {
                safeLog.info("[.NET 6.0 Installer] ✅ Download complete");
                downloadResolve(true);
              });
            });
          });

          request.on("error", (error) => {
            safeLog.error(
              `[.NET 6.0 Installer] Download error: ${error.message}`
            );
            file.close();
            fs.unlink(installerPath, () => {});
            downloadResolve(false);
          });

          file.on("error", (error) => {
            safeLog.error(
              `[.NET 6.0 Installer] File write error: ${error.message}`
            );
            request.destroy();
            fs.unlink(installerPath, () => {});
            downloadResolve(false);
          });
        });
      };

      const downloadSuccess = await downloadWithRedirects(DOTNET6_URL);

      if (!downloadSuccess) {
        resolve({
          success: false,
          error: "Failed to download .NET 6.0 installer",
        });
        return;
      }

      notify("⚙️ Installing .NET 6.0 Runtime (1-2 min)...", "info");

      safeLog.info("[.NET 6.0 Installer] Starting silent installation...");
      safeLog.info(
        "[.NET 6.0 Installer] Running installer with /install /quiet /norestart flags..."
      );

      exec(
        `"${installerPath}" /install /quiet /norestart`,
        { timeout: 300000 },
        (error, stdout, stderr) => {
          try {
            fs.unlinkSync(installerPath);
            safeLog.info("[.NET 6.0 Installer] Cleaned up installer file");
          } catch (cleanupError) {
            // Best-effort cleanup; tmp files are GCed by the OS regardless.
          }

          if (error) {
            safeLog.error(
              `[.NET 6.0 Installer] Installation error: ${error.message}`
            );
            safeLog.error(`[.NET 6.0 Installer] Exit code: ${error.code}`);

            // 1641 = reboot initiated; 3010 = reboot required. Both indicate
            // a successful install.
            if (error.code === 1641 || error.code === 3010) {
              safeLog.info(
                "[.NET 6.0 Installer] ✅ Installation succeeded (reboot recommended but not required)"
              );
              notify("✅ .NET 6.0 installed successfully!", "success");
              resolve({ success: true, rebootRecommended: true });
            } else {
              notify("❌ .NET 6.0 installation failed", "error");
              resolve({
                success: false,
                error: `Installation failed with exit code ${error.code}`,
              });
            }
            return;
          }

          safeLog.info(
            "[.NET 6.0 Installer] ✅ Installation completed successfully"
          );
          notify("✅ .NET 6.0 installed successfully!", "success");
          resolve({ success: true });
        }
      );
    } catch (error) {
      safeLog.error(`[.NET 6.0 Installer] Unexpected error: ${error.message}`);
      resolve({
        success: false,
        error: error.message,
      });
    }
  });
}

module.exports = {
  checkDotNet6x86Runtime,
  downloadAndInstallDotNet6,
};
