/**
 * Activation success dialog.
 *
 * Renders a custom modal BrowserWindow over the main launcher window when an
 * activation key has been validated, copied to the clipboard, and is on a
 * countdown to be cleared. The dialog is fully self-contained: HTML, CSS, and
 * the small "copy again" client-side script are inlined and loaded via a
 * data: URL, so this module has no external renderer files to ship.
 *
 * Pure view code: no IPC, no settings, no activation logic. The caller is
 * responsible for deciding when to show the dialog and for the clipboard
 * lifecycle that the timer text in the dialog reflects.
 */

const { BrowserWindow } = require("electron");
const path = require("path");

/**
 * Show the activation-success modal.
 *
 * @param {string} productKey Plain-text product key to render. Already copied
 *   to the clipboard by the caller; this dialog only displays it and offers a
 *   manual "copy again" affordance.
 * @param {number} clearAfterSeconds Seconds remaining until the caller wipes
 *   the clipboard. Rendered verbatim into the timer line.
 * @param {object} deps
 * @param {string} deps.appDir Absolute path to the app/ directory. Used to
 *   resolve the launcher icon and the preload script.
 * @param {() => BrowserWindow | null} deps.getMainWindow Returns the current
 *   main window, used as the modal parent. May return null if called during
 *   shutdown; we still render but the modal will be top-level.
 * @returns {BrowserWindow} The dialog window (caller may attach further
 *   listeners if needed; the dialog auto-closes via its OK / × / Escape
 *   buttons).
 */
function showActivationSuccessDialog(productKey, clearAfterSeconds, { appDir, getMainWindow }) {
  const iconPath = path.join(appDir, "assets", "icon2.ico");
  const preloadPath = path.join(appDir, "preload.js");
  const parent = typeof getMainWindow === "function" ? getMainWindow() : null;

  const activationDialog = new BrowserWindow({
    width: 700,
    height: 340,
    frame: false,
    transparent: false,
    parent: parent || undefined,
    modal: true,
    resizable: false,
    backgroundColor: "#1e293b",
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  const dialogHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #ffffff;
      overflow: hidden;
      user-select: none;
    }
    .dialog-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .dialog-header {
      background: rgba(15, 23, 42, 0.9);
      padding: 20px;
      border-bottom: 1px solid rgba(59, 130, 246, 0.3);
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
    }
    .success-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
      50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.8); }
    }
    .dialog-title {
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      flex: 1;
    }
    .close-button {
      position: absolute;
      top: 20px;
      right: 20px;
      width: 24px;
      height: 24px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .close-button:hover {
      color: #ffffff;
      transform: scale(1.1);
    }
    .dialog-content {
      flex: 1;
      padding: 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .key-container {
      width: 100%;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      position: relative;
    }
    .key-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .key-value-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .key-value {
      font-size: 24px;
      font-weight: 700;
      color: #3b82f6;
      font-family: "Courier New", monospace;
      letter-spacing: 2px;
      text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
      white-space: nowrap;
    }
    .copy-button {
      width: 36px;
      height: 36px;
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 6px;
      color: #3b82f6;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .copy-button:hover {
      background: rgba(59, 130, 246, 0.3);
      border-color: rgba(59, 130, 246, 0.6);
      transform: scale(1.05);
    }
    .copy-button:active {
      transform: scale(0.95);
    }
    .copy-button svg {
      width: 18px;
      height: 18px;
    }
    .info-text {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
      text-align: center;
      line-height: 1.6;
    }
    .timer-text {
      font-size: 12px;
      color: rgba(251, 191, 36, 0.9);
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
    }
    .dialog-footer {
      padding: 20px;
      background: rgba(15, 23, 42, 0.8);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: center;
    }
    .ok-button {
      background: #3b82f6;
      color: #ffffff;
      border: none;
      padding: 12px 40px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    }
    .ok-button:hover {
      background: #2563eb;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
      transform: translateY(-1px);
    }
    .ok-button:active {
      transform: translateY(0);
    }
    .copied-feedback {
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(16, 185, 129, 0.9);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .copied-feedback.show {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="dialog-container">
    <div class="dialog-header">
      <div class="success-icon">✓</div>
      <div class="dialog-title">Activation Successful</div>
      <button class="close-button" onclick="window.close()">×</button>
    </div>
    <div class="dialog-content">
      <div class="key-container">
        <div class="copied-feedback" id="copiedFeedback">Copied!</div>
        <div class="key-label">Product Key (Copied to Clipboard)</div>
        <div class="key-value-row">
          <div class="key-value">${productKey}</div>
          <button class="copy-button" onclick="copyKey()" title="Copy key again">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="info-text">
        The key is in your clipboard. Paste it (Ctrl+V) into the game if needed.
      </div>
      <div class="timer-text">
        <span>🔒</span>
        <span>Key will auto-clear from clipboard in ${clearAfterSeconds} seconds</span>
      </div>
    </div>
    <div class="dialog-footer">
      <button class="ok-button" onclick="window.close()">OK</button>
    </div>
  </div>
  <script>
    function copyKey() {
      navigator.clipboard.writeText('${productKey}').then(() => {
        const feedback = document.getElementById('copiedFeedback');
        feedback.classList.add('show');
        setTimeout(() => {
          feedback.classList.remove('show');
        }, 2000);
      });
    }
  </script>
</body>
</html>`;

  activationDialog.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(dialogHTML)
  );

  activationDialog.once("ready-to-show", () => {
    activationDialog.show();
  });

  return activationDialog;
}

module.exports = { showActivationSuccessDialog };
