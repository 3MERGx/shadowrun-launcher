// HTTP/HTTPS file downloader with progress + cancellation.
//
// Why this lives in its own module:
//   - Used by the download-game pipeline (build.zip + GFWL + DX9 web installer)
//     and the NoIntroFix installer flow. Both need streaming I/O, byte-accurate
//     progress reporting, manual backpressure, and the same cancellation
//     semantics. Sharing a single implementation keeps those flows consistent.
//
// Cancellation contract:
//   - The caller holds the cancel flag (the "download-game" handler owns one;
//     the NoIntroFix flow currently doesn't but will when Phase 7 lands).
//   - We call `opts.isCancelled()` on every data chunk; when it returns true
//     we abort the request, destroy the write stream, unlink the partial file,
//     and resolve `{ success: false, error: { code: "CANCELLED" } }`.
//   - This mirrors the original main.js behavior verbatim (Phase 6 extraction)
//     where the cancel flag was a module-scoped `let cancelDownloadRequested`.
//
// Other behavior preserved verbatim:
//   - SSL validation is disabled ONLY for download.microsoft.com / *.microsoft.com
//     hosts (DX9 web installer). All other HTTPS keeps validation enabled.
//   - Backpressure: response.pause() / response.resume() based on file.write()'s
//     return value + the file's "drain" event.
//   - 30s connection timeout; 10s "no first chunk yet" warning.
//   - Errors are returned as `{ success: false, error: Error }` not thrown,
//     so the caller can present user-friendly messages per error.code
//     (ETIMEDOUT, ENOTFOUND, ECONNREFUSED, HTTP_<status>).

const { safeLog } = require("../logger");
const fs = require("fs");
const http = require("http");
const https = require("https");

// Replace the current downloadFile function with this one that handles both HTTP and HTTPS
async function downloadFile(url, destination, progressCallback, opts = {}) {
  const isCancelled = typeof opts.isCancelled === "function"
    ? opts.isCancelled
    : () => false;

  return new Promise((resolve) => {
    safeLog.info(`Downloading file from ${url} to ${destination}`);

    // Report "connecting" immediately
    if (progressCallback) {
      progressCallback(0, "Connecting to server...");
    }

    const file = fs.createWriteStream(destination);
    let isCancelledInternal = false;
    let isFinished = false;
    let isResolved = false;
    let firstChunkReceived = false;
    let downloadError = null;

    // Helper to safely resolve
    const safeResolve = (success, error = null) => {
      if (isResolved) return;
      isResolved = true;
      downloadError = error;
      resolve({ success, error });
    };

    // Choose the correct protocol module based on the URL
    const httpModule = url.startsWith("https:") ? https : http;

    // Only disable SSL certificate validation for trusted Microsoft domains
    // This prevents MITM attacks on other downloads while allowing Microsoft downloads
    const trustedMicrosoftDomains = [
      "download.microsoft.com",
      "www.microsoft.com",
      "microsoft.com",
    ];
    const urlObj = new URL(url);
    const isTrustedMicrosoftDomain = trustedMicrosoftDomains.some(
      (domain) =>
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );

    // For HTTPS requests to Microsoft, disable SSL certificate validation to avoid certificate errors
    // For all other HTTPS requests, keep SSL validation enabled for security
    const requestOptions =
      url.startsWith("https:") && isTrustedMicrosoftDomain
        ? { rejectUnauthorized: false }
        : {};

    const request = httpModule.get(url, requestOptions, (response) => {
      safeLog.info(`Download response status: ${response.statusCode}`);

      // Report that connection established
      if (progressCallback && response.statusCode === 200) {
        progressCallback(0, "Download starting...");
      }

      // Set up a timeout warning if first chunk takes too long
      const firstChunkTimeout = setTimeout(() => {
        if (!firstChunkReceived && !isCancelledInternal && !isFinished) {
          safeLog.warn(
            `[Download] Warning: No data received after 10 seconds. Server may be slow or preparing large file.`
          );
          if (progressCallback) {
            progressCallback(
              0,
              "Waiting for server response... (this may take a minute for large files)"
            );
          }
        }
      }, 10000); // 10 second warning

      // Helper to cleanup streams (defined inside callback to access response)
      const cleanup = () => {
        clearTimeout(firstChunkTimeout);
        if (!isFinished) {
          try {
            response.destroy();
          } catch (e) {}
          try {
            file.destroy();
          } catch (e) {}
          try {
            fs.unlink(destination, () => {});
          } catch (e) {}
        }
      };

      if (response.statusCode !== 200) {
        safeLog.error(`Failed to download file: ${response.statusCode}`);
        cleanup();
        const error = new Error(`HTTP ${response.statusCode}`);
        error.code = `HTTP_${response.statusCode}`;
        safeResolve(false, error);
        return;
      }

      // Get file size for progress calculation
      const totalSize = parseInt(response.headers["content-length"], 10);
      let downloadedSize = 0;
      let isPaused = false;

      // Handle backpressure: pause response when file buffer is full, resume on drain
      file.on("drain", () => {
        if (!isCancelledInternal && !isFinished && isPaused) {
          isPaused = false;
          response.resume();
        }
      });

      // Manually handle data chunks for better cancellation control
      response.on("data", (chunk) => {
        // Log first chunk arrival
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          clearTimeout(firstChunkTimeout);
          safeLog.info(
            `[Download] First data chunk received (${chunk.length} bytes)`
          );
          safeLog.info(
            `[Download] Total file size: ${totalSize} bytes (${(
              totalSize /
              1024 /
              1024
            ).toFixed(2)} MB)`
          );
        }

        // Check if download was cancelled
        if (isCancelled() && !isCancelledInternal) {
          isCancelledInternal = true;
          safeLog.info("Download cancelled by user");
          request.abort();
          cleanup();
          const error = new Error("Download cancelled by user");
          error.code = "CANCELLED";
          safeResolve(false, error);
          return;
        }

        if (isCancelledInternal || isFinished) {
          return;
        }

        // Write chunk to file
        try {
          const canContinue = file.write(chunk);
          if (!canContinue && !isPaused) {
            // Buffer is full, pause the response stream
            isPaused = true;
            response.pause();
          }

          downloadedSize += chunk.length;
          // Calculate and report progress if callback provided
          if (progressCallback && totalSize) {
            const percent = Math.floor((downloadedSize / totalSize) * 100);
            const mbDownloaded = (downloadedSize / 1024 / 1024).toFixed(2);
            const mbTotal = (totalSize / 1024 / 1024).toFixed(2);
            progressCallback(
              percent,
              `Downloading: ${mbDownloaded} MB / ${mbTotal} MB`
            );
          }
        } catch (err) {
          if (!isCancelledInternal) {
            safeLog.error("Error writing chunk:", err.message);
            cleanup();
            safeResolve(false, err);
          }
        }
      });

      response.on("end", () => {
        if (!isCancelledInternal && !isFinished) {
          safeLog.info("[Download] Response stream ended, finalizing file...");
          // Don't set isFinished here - let the file 'finish' event handle it
          file.end();
        }
      });

      file.on("finish", () => {
        if (!isCancelledInternal) {
          isFinished = true;
          safeLog.info("Download completed successfully");
          file.close();
          safeResolve(true, null);
        }
      });

      file.on("error", (err) => {
        if (!isCancelledInternal) {
          safeLog.error("File write error:", err.message);
          cleanup();
          safeResolve(false, err);
        }
      });

      response.on("error", (err) => {
        if (!isCancelledInternal && !isFinished) {
          safeLog.error("Response error:", err.message);
          cleanup();
          safeResolve(false, err);
        }
      });
    });

    request.on("error", (err) => {
      // Don't log error if it was due to cancellation
      if (!isCancelled() && !isCancelledInternal) {
        safeLog.error(`Download error: ${err.message} Code: ${err.code}`);
      }
      if (!isFinished && !isResolved) {
        try {
          file.destroy();
        } catch (e) {}
        try {
          fs.unlink(destination, () => {});
        } catch (e) {}
        safeResolve(false, err);
      }
    });

    // Set request timeout for connection issues
    request.setTimeout(30000, () => {
      if (!isFinished && !isResolved) {
        safeLog.error("Download timeout after 30 seconds");
        request.abort();
        try {
          file.destroy();
        } catch (e) {}
        try {
          fs.unlink(destination, () => {});
        } catch (e) {}
        const error = new Error("Connection timeout after 30 seconds");
        error.code = "ETIMEDOUT";
        safeResolve(false, error);
      }
    });
  });
}

module.exports = { downloadFile };
