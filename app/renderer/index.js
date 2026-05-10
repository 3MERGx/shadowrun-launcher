// AT THE VERY TOP OF THE FILE:
console.log("[Renderer] index.js script execution started.");

// Custom Activation Confirmation Dialog
function showActivationConfirmDialog() {
  return new Promise((resolve) => {
    // Create dialog overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    `;

    // Create dialog container
    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      width: 420px;
      max-width: 90%;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      animation: slideIn 0.2s ease-out;
    `;

    dialog.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .confirm-dialog-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .confirm-title {
          font-size: 16px;
          font-weight: 500;
          color: #ffffff;
        }
        .confirm-content {
          padding: 24px 20px;
          color: rgba(255, 255, 255, 0.85);
          line-height: 1.5;
        }
        .confirm-message {
          font-size: 14px;
          margin-bottom: 16px;
        }
        .confirm-note {
          background: rgba(255, 255, 255, 0.05);
          border-left: 2px solid rgba(255, 255, 255, 0.2);
          padding: 10px 12px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }
        .confirm-footer {
          padding: 12px 20px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .confirm-button {
          padding: 8px 20px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }
        .confirm-button-cancel {
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .confirm-button-cancel:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
        }
        .confirm-button-ok {
          background: #3b82f6;
          color: #ffffff;
        }
        .confirm-button-ok:hover {
          background: #2563eb;
        }
        .confirm-button:active {
          transform: scale(0.98);
        }
      </style>
      <div class="confirm-dialog-header">
        <div class="confirm-title">Shadowrun FPS Launcher</div>
      </div>
      <div class="confirm-content">
        <div class="confirm-message">
          Are you sure you want to activate the game?
        </div>
        <div class="confirm-note">
          If you have any other GFWL games, this may cause them to require re-activation.
        </div>
      </div>
      <div class="confirm-footer">
        <button class="confirm-button confirm-button-cancel" id="cancelBtn">Cancel</button>
        <button class="confirm-button confirm-button-ok" id="okBtn">OK</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Handle button clicks
    const okBtn = dialog.querySelector("#okBtn");
    const cancelBtn = dialog.querySelector("#cancelBtn");

    const cleanup = () => {
      overlay.style.animation = "fadeIn 0.15s ease-out reverse";
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 150);
    };

    okBtn.addEventListener("click", () => {
      cleanup();
      resolve(true);
    });

    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(false);
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  });
}

/** Confirm switching server mode from the main-window LIVE / AHL badges */
function showServerSwitchConfirmDialog(targetMode) {
  const toAhl = targetMode === "ahl";
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      width: 440px;
      max-width: 90%;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      animation: slideIn 0.2s ease-out;
    `;

    const headerTitle = toAhl
      ? "Switch to AntHill LIVE?"
      : "Switch to classic GFWL?";
    const messageHtml = toAhl
      ? `<div class="confirm-message">Use AntHill LIVE (AHL) community servers. Restart Shadowrun after switching.</div>`
      : `<div class="confirm-message">Use Microsoft classic Xbox LIVE / GFWL endpoints. Restart Shadowrun after switching.</div>`;

    dialog.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .confirm-dialog-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .confirm-title {
          font-size: 16px;
          font-weight: 500;
          color: #ffffff;
        }
        .confirm-content {
          padding: 24px 20px;
          color: rgba(255, 255, 255, 0.85);
          line-height: 1.5;
        }
        .confirm-message {
          font-size: 14px;
          margin-bottom: 16px;
        }
        .confirm-note {
          background: rgba(255, 255, 255, 0.05);
          border-left: 2px solid rgba(255, 255, 255, 0.2);
          padding: 10px 12px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }
        .confirm-footer {
          padding: 12px 20px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .confirm-button {
          padding: 8px 20px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }
        .confirm-button-cancel {
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .confirm-button-cancel:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
        }
        .confirm-button-ok {
          background: #3b82f6;
          color: #ffffff;
        }
        .confirm-button-ok:hover {
          background: #2563eb;
        }
        .confirm-button:active {
          transform: scale(0.98);
        }
      </style>
      <div class="confirm-dialog-header">
        <div class="confirm-title">${headerTitle}</div>
      </div>
      <div class="confirm-content">
        ${messageHtml}
      </div>
      <div class="confirm-footer">
        <button type="button" class="confirm-button confirm-button-cancel" id="serverSwitchCancelBtn">Cancel</button>
        <button type="button" class="confirm-button confirm-button-ok" id="serverSwitchOkBtn">Switch</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const okBtn = dialog.querySelector("#serverSwitchOkBtn");
    const cancelBtn = dialog.querySelector("#serverSwitchCancelBtn");

    const cleanup = () => {
      overlay.style.animation = "fadeIn 0.15s ease-out reverse";
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 150);
    };

    okBtn.addEventListener("click", () => {
      cleanup();
      resolve(true);
    });

    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(false);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  });
}

// Function to show download confirmation dialog with option to find existing game
function showDownloadConfirmDialog(autoScanDisabled = false) {
  return new Promise((resolve) => {
    // Create dialog overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    `;

    // Create dialog container
    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      width: 420px;
      max-width: 90%;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      animation: slideIn 0.2s ease-out;
    `;

    dialog.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .confirm-dialog-header {
          padding: 18px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .confirm-title {
          font-size: 17px;
          font-weight: 600;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .confirm-icon {
          font-size: 20px;
        }
        .confirm-close-button {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
        }
        .confirm-close-button:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }
        .confirm-content {
          padding: 24px;
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.6;
        }
        .confirm-message {
          font-size: 15px;
          margin-bottom: 20px;
          color: #ffffff;
          font-weight: 500;
        }
        .confirm-note {
          background: rgba(59, 130, 246, 0.1);
          border-left: 3px solid #60a5fa;
          border-radius: 4px;
          padding: 14px 16px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.85);
          line-height: 1.5;
        }
        .confirm-note strong {
          color: #93c5fd;
          font-weight: 600;
        }
        .confirm-footer {
          padding: 16px 24px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        .confirm-button {
          padding: 10px 24px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .confirm-button-cancel {
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .confirm-button-cancel:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.9);
          border-color: rgba(255, 255, 255, 0.25);
        }
        .confirm-button-secondary {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .confirm-button-secondary:hover {
          background: rgba(59, 130, 246, 0.25);
          color: #93c5fd;
          border-color: rgba(59, 130, 246, 0.4);
        }
        .confirm-button-primary {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }
        .confirm-button-primary:hover {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
          transform: translateY(-1px);
        }
        .confirm-button:active {
          transform: scale(0.97);
        }
        .confirm-button-primary:active {
          transform: scale(0.97) translateY(0);
        }
      </style>
      <div class="confirm-dialog-header">
        <div class="confirm-title">
          <span class="confirm-icon">${autoScanDisabled ? "🎮" : "🔍"}</span>
          ${autoScanDisabled ? "Game Installation" : "Game Not Found"}
        </div>
        <button class="confirm-close-button" id="closeBtn" aria-label="Close">×</button>
      </div>
      <div class="confirm-content">
        <div class="confirm-message">
          ${
            autoScanDisabled
              ? "Do you have an existing Shadowrun installation?"
              : "Shadowrun game files were not detected on your system."
          }
        </div>
        <div class="confirm-note">
          <strong>${
            autoScanDisabled ? "Have the game?" : "Already have the game?"
          }</strong> ${
            autoScanDisabled
              ? "Browse to your existing installation to avoid downloading again."
              : "Browse for your existing installation to avoid downloading again."
          }
        </div>
      </div>
      <div class="confirm-footer">
        <button class="confirm-button confirm-button-secondary" id="findBtn">
          <span>📂</span>
          <span>Find Existing Game</span>
        </button>
        <button class="confirm-button confirm-button-primary" id="downloadBtn">
          <span>⬇️</span>
          <span>Download Game</span>
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Handle button clicks
    const downloadBtn = dialog.querySelector("#downloadBtn");
    const findBtn = dialog.querySelector("#findBtn");
    const closeBtn = dialog.querySelector("#closeBtn");

    const cleanup = () => {
      overlay.style.animation = "fadeIn 0.15s ease-out reverse";
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 150);
    };

    downloadBtn.addEventListener("click", () => {
      cleanup();
      resolve("download");
    });

    findBtn.addEventListener("click", () => {
      cleanup();
      resolve("find");
    });

    closeBtn.addEventListener("click", () => {
      cleanup();
      resolve("cancel");
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve("cancel");
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve("cancel");
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  });
}

window.handlePcidBackupClick = async function () {
  // Add async back
  console.log("[Renderer] handlePcidBackupClick CALLED VIA ONCLICK!");
  // alert('Backup PCID button was definitely clicked!'); // You can remove the alert now

  // Start uncommenting:
  console.log(
    "[Renderer] PCID Backup button clicked. Attempting to call window.api.backupPcid().",
  );

  const backupPcidButton = document.getElementById("backupPcidButton");
  // const pcidBackupFeedback = document.getElementById("pcidBackupFeedback"); // Check if this element exists
  const pcidBackupStatus = document.getElementById("pcidBackupStatus"); // Check if this element exists
  const currentPcidDisplay = document.getElementById("currentPcidDisplay"); // Check if this element exists

  if (!backupPcidButton || !pcidBackupStatus || !currentPcidDisplay) {
    console.error(
      "[Renderer] One or more UI elements for PCID backup are missing!",
    );
    // alert("UI element missing for PCID backup!"); // Optional feedback
    return; // Stop if elements are missing
  }

  backupPcidButton.disabled = true;
  pcidBackupStatus.textContent = "Backing up PCID...";
  currentPcidDisplay.textContent = "";

  try {
    console.log("[Renderer] Calling window.api.backupPcid()...");
    // Ensure window.api and window.api.backupPcid exist before calling
    if (window.api && typeof window.api.backupPcid === "function") {
      const result = await window.api.backupPcid();
      console.log(
        "[Renderer] window.api.backupPcid() returned:",
        JSON.stringify(result, null, 2),
      );

      if (result && result.success) {
        pcidBackupStatus.textContent = "PCID backed up successfully!";
        if (result.backupPcid) {
          currentPcidDisplay.textContent = `Backup Value: 0x${result.backupPcid}`;
        } else if (result.verifiedValue) {
          currentPcidDisplay.textContent = `Backup Value (verified): ${result.verifiedValue}`;
        }
      } else {
        pcidBackupStatus.textContent =
          "Backup failed. See details or check logs.";
        if (result && result.error) {
          console.error("[Renderer] Backup failed with error:", result.error);
        } else {
          console.error(
            "[Renderer] Backup failed with no specific error message from main process.",
          );
        }
      }
    } else {
      console.error(
        "[Renderer] window.api.backupPcid is not available or not a function!",
      );
      pcidBackupStatus.textContent = "Error: Backup API not available.";
      // alert("Backup API not available!"); // Optional feedback
    }
  } catch (error) {
    console.error(
      "[Renderer] Exception during window.api.backupPcid() call:",
      error,
    );
    pcidBackupStatus.textContent = "Error during backup. Check console.";
    // alert(`An error occurred while trying to backup PCID: ${error.message}`);
  } finally {
    if (backupPcidButton) {
      // Check again in case it became null
      backupPcidButton.disabled = false;
    }
    console.log("[Renderer] PCID Backup process finished.");
  }
};
console.log(
  "[Renderer] handlePcidBackupClick has been globally defined (full version).",
);

// Add this at the very beginning of your index.js, outside any functions or event listeners
console.log("Script loading...");

// Audio elements
const backgroundAudio = document.getElementById("backgroundAudio");
const buttonHoverAudio = document.getElementById("buttonHoverAudio");
const buttonClickAudio = document.getElementById("buttonClickAudio");

// Audio state
let isMuted = false;

// Stored / element volume is linear gain capped at 0.5 (50% of browser max).
// Diagnostics slider is 0–100% of that cap: 50% UI = 0.25 gain, 100% UI = 0.5 gain.
const LAUNCHER_AUDIO_GAIN_CAP = 0.5;
const LAUNCHER_AUDIO_DEFAULT_GAIN = 0.25;
// Hover/click use at least this gain when ambience > 0 so low slider (quiet loop) does not bury UI SFX.
const LAUNCHER_UI_SFX_MIN_GAIN = 0.2;

function clampLauncherAudioActualGain(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return LAUNCHER_AUDIO_DEFAULT_GAIN;
  return Math.min(LAUNCHER_AUDIO_GAIN_CAP, Math.max(0, n));
}

function sliderPercentFromActualGain(actualGain) {
  const g = clampLauncherAudioActualGain(actualGain);
  if (LAUNCHER_AUDIO_GAIN_CAP <= 0) return 0;
  return Math.min(100, Math.round((g / LAUNCHER_AUDIO_GAIN_CAP) * 100));
}

function actualGainFromSliderPercent(sliderPercent) {
  const p = Number(sliderPercent);
  if (Number.isNaN(p)) return LAUNCHER_AUDIO_DEFAULT_GAIN;
  return clampLauncherAudioActualGain((p / 100) * LAUNCHER_AUDIO_GAIN_CAP);
}

function gainForLauncherUiSfx(ambienceGain) {
  const v = clampLauncherAudioActualGain(ambienceGain);
  if (v <= 0) return 0;
  return Math.min(1, Math.max(v, LAUNCHER_UI_SFX_MIN_GAIN));
}

function syncLauncherAudioElementVolumes(actualGain) {
  const v = clampLauncherAudioActualGain(actualGain);
  const sfx = gainForLauncherUiSfx(actualGain);
  if (backgroundAudio) backgroundAudio.volume = v;
  if (buttonHoverAudio) buttonHoverAudio.volume = sfx;
  if (buttonClickAudio) buttonClickAudio.volume = sfx;
  return v;
}

function syncBackgroundAudioVolumeSliderUI(actualGain) {
  const slider = document.getElementById("backgroundAudioVolumeSlider");
  const valueLabel = document.getElementById("backgroundAudioVolumeValue");
  if (!slider || !valueLabel) return;
  const pct = sliderPercentFromActualGain(actualGain);
  slider.value = String(pct);
  valueLabel.textContent = `${pct}%`;
}

/**
 * Apply persisted launcher audio (mute + volume) from a settings payload.
 * Keeps the top-right mute control and Diagnostics slider in sync.
 */
function applyLauncherAudioFromSettingsPayload(savedSettings) {
  if (!backgroundAudio) return;

  const s = savedSettings || {};

  if (typeof s.audioMuted === "boolean") {
    isMuted = s.audioMuted;
    backgroundAudio.muted = isMuted;
    updateMuteButtonAppearance(isMuted);
  }

  let gain = LAUNCHER_AUDIO_DEFAULT_GAIN;
  if (
    typeof s.backgroundAudioVolume === "number" &&
    !Number.isNaN(s.backgroundAudioVolume)
  ) {
    gain = clampLauncherAudioActualGain(s.backgroundAudioVolume);
  }
  syncLauncherAudioElementVolumes(gain);
  if (settings) {
    settings.backgroundAudioVolume = gain;
  }
  syncBackgroundAudioVolumeSliderUI(gain);
  updateDiagnosticsLauncherAudioRowMutedClass(
    backgroundAudio ? backgroundAudio.muted : isMuted,
  );
}

async function persistBackgroundAudioVolume(actualGain) {
  const v = clampLauncherAudioActualGain(actualGain);
  try {
    const current = await window.api.loadSettings();
    const patch = { ...current, backgroundAudioVolume: v };
    // Do not overwrite saved mute preference while game is running (forced launcher mute).
    if (!gameRunning) {
      patch.audioMuted = isMuted;
    }
    await window.api.saveSettings(patch);
    if (settings) {
      settings.backgroundAudioVolume = v;
      if (!gameRunning) {
        settings.audioMuted = isMuted;
      }
    }
  } catch (err) {
    console.log("Could not save background audio volume:", err);
  }
}

function updateDiagnosticsLauncherAudioRowMutedClass(muted) {
  const row = document.getElementById("backgroundAudioVolumeRow");
  if (!row) return;
  row.classList.toggle("is-muted", Boolean(muted));
}

function syncDiagnosticsAudioVolumeSlider() {
  if (backgroundAudio) {
    syncBackgroundAudioVolumeSliderUI(backgroundAudio.volume);
  }
  updateDiagnosticsLauncherAudioRowMutedClass(
    backgroundAudio ? backgroundAudio.muted : isMuted,
  );
}

// Initialize background audio
async function initBackgroundAudio(preloadedSettings) {
  if (backgroundAudio) {
    try {
      const savedSettings =
        preloadedSettings !== undefined && preloadedSettings !== null
          ? preloadedSettings
          : await window.api.loadSettings();
      applyLauncherAudioFromSettingsPayload(savedSettings);
    } catch (error) {
      console.log("Could not load audio settings:", error);
      syncLauncherAudioElementVolumes(LAUNCHER_AUDIO_DEFAULT_GAIN);
      syncBackgroundAudioVolumeSliderUI(LAUNCHER_AUDIO_DEFAULT_GAIN);
    }

    // Only play if not muted
    if (!isMuted) {
      backgroundAudio.play().catch((error) => {
        console.log("Background audio autoplay prevented:", error);
        // Audio will play when user interacts with the page
      });
    }

    // Start audio on first user interaction if autoplay was blocked
    const startAudioOnInteraction = () => {
      if (backgroundAudio.paused) {
        backgroundAudio.play().catch(() => {});
      }
      // Remove listeners after first interaction
      document.removeEventListener("click", startAudioOnInteraction);
      document.removeEventListener("keydown", startAudioOnInteraction);
    };

    document.addEventListener("click", startAudioOnInteraction, { once: true });
    document.addEventListener("keydown", startAudioOnInteraction, {
      once: true,
    });
  }
}

// Update mute button icon to reflect current muted state (used by toggle and game-state)
function updateMuteButtonAppearance(showAsMuted) {
  const speakerIcon = document.getElementById("speakerIcon");
  const mutedIcon = document.getElementById("mutedIcon");
  if (showAsMuted) {
    if (speakerIcon) speakerIcon.style.display = "none";
    if (mutedIcon) mutedIcon.style.display = "block";
  } else {
    if (speakerIcon) speakerIcon.style.display = "block";
    if (mutedIcon) mutedIcon.style.display = "none";
  }
  updateDiagnosticsLauncherAudioRowMutedClass(showAsMuted);
}

// Mute/Unmute functionality
function toggleMute() {
  if (!backgroundAudio) return;

  isMuted = !isMuted;
  backgroundAudio.muted = isMuted;
  updateMuteButtonAppearance(isMuted);

  // Save mute state to settings
  window.api
    .loadSettings()
    .then((currentSettings) => {
      window.api.saveSettings({
        ...currentSettings,
        audioMuted: isMuted,
        backgroundAudioVolume: clampLauncherAudioActualGain(
          backgroundAudio.volume,
        ),
      });
    })
    .catch((error) => {
      console.log("Could not save audio mute state:", error);
    });
}

// Play button hover sound
function playHoverSound() {
  if (isMuted || !buttonHoverAudio) return;
  buttonHoverAudio.currentTime = 0;
  buttonHoverAudio.play().catch((error) => {
    // Ignore autoplay errors
    console.log("Hover sound play error:", error);
  });
}

// Play button click sound
function playClickSound() {
  if (isMuted || !buttonClickAudio) return;
  buttonClickAudio.currentTime = 0;
  buttonClickAudio.play().catch((error) => {
    // Ignore autoplay errors
    console.log("Click sound play error:", error);
  });
}

// DOM Elements
const playButton = document.getElementById("playButton");
const activateButton = document.getElementById("activateButton");
const discordButton = document.getElementById("discordButton");
const websiteButton = document.getElementById("websiteButton");

// Error alert bar elements
const errorAlertBar = document.getElementById("errorAlertBar");
const errorAlertMessage = document.getElementById("errorAlertMessage");
const errorAlertDismiss = document.getElementById("errorAlertDismiss");
const errorAlertCount = document.getElementById("errorAlertCount");
const errorAlertFix = document.getElementById("errorAlertFix");
const ahlHintAlertBar = document.getElementById("ahlHintAlertBar");
const ahlHintAlertMessage = document.getElementById("ahlHintAlertMessage");
const ahlHintAlertFix = document.getElementById("ahlHintAlertFix");
const ahlHintAlertDismiss = document.getElementById("ahlHintAlertDismiss");
const errorListPopup = document.getElementById("errorListPopup");
const errorListContent = document.getElementById("errorListContent");
const errorListClose = document.getElementById("errorListClose");

// Store current issues for the popup
let currentIssues = [];
const settingsButton = document.getElementById("settingsButton");
const minimizeButton = document.getElementById("minimizeButton");
const closeButton = document.getElementById("closeButton");
const muteButton = document.getElementById("muteButton");

// Settings screen elements
const settingsScreen = document.getElementById("settingsScreen");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const skipIntroButton = document.getElementById("skipIntroButton");
const dxvkToggle = document.getElementById("dxvk");

// Changelog elements
const viewChangelogLink = document.getElementById("viewChangelogLink");
const changelogScreen = document.getElementById("changelogScreen");
const closeChangelogButton = document.getElementById("closeChangelogButton");
const changelogContent = document.getElementById("changelogContent");

// Game state (this would normally be managed by the main process)
let gameInstalled = false;
/** True when Shadowrun.exe is resolved at the configured path — even if GFWL/DX/VC deps are still missing */
let gameFilesLocated = false;

function applyInstallationCheckResult(result) {
  if (!result) return;
  gameInstalled = !!result.installed;
  const gf = result.dependencies?.gameFiles;
  if (typeof gf === "boolean") {
    gameFilesLocated = gf || gameInstalled;
  } else {
    gameFilesLocated = gameInstalled;
  }
}

let settings = {
  skipIntro: false,
  dxvk: false,
};

// DOM Elements - add these new elements
const discordIconButton = document.getElementById("discordIconButton");
const instructionsScreen = document.getElementById("instructionsScreen");
const closeInstructionsButton = document.getElementById(
  "closeInstructionsButton",
);
const downloadProgressScreen = document.getElementById(
  "downloadProgressScreen",
);
const gameFilesProgress = document.getElementById("gameFilesProgress");
const gfwlProgress = document.getElementById("gfwlProgress");
const vcProgress = document.getElementById("vcProgress");
const dxProgress = document.getElementById("dxProgress");
const gameFilesStatus = document.getElementById("gameFilesStatus");
const gfwlStatus = document.getElementById("gfwlStatus");
const vcStatus = document.getElementById("vcStatus");
const dxStatus = document.getElementById("dxStatus");
const downloadMessage = document.getElementById("downloadMessage");
const versionInfo = document.querySelector(".version-info");
const playerCountInfo = document.getElementById("playerCountInfo");
const PLAYER_COUNT_REFRESH_INTERVAL_MS = 30_000;
let playerCountRefreshInterval = null;
let playerCountRefreshInFlight = false;

function setPlayerCountDisplay(data) {
  if (!playerCountInfo) return;
  if (data && typeof data.inGame === "number") {
    const ahl = data.inGameAhl;
    const gfwl = data.inGameGfwl;
    const hasSplit =
      typeof ahl === "number" &&
      typeof gfwl === "number" &&
      typeof data.inGameUnknown === "number";
    if (hasSplit) {
      playerCountInfo.classList.add("player-count-info--stacked");
      playerCountInfo.textContent = [
        `Total: ${data.inGame}`,
        `AHL: ${ahl}`,
        `GFWL: ${gfwl}`,
      ].join("\n");
      playerCountInfo.title =
        "Community tracker (updates ~30s). Total = every in-game launcher (includes older clients or unclassified modes). AHL / GFWL = configured server from game folder; if Total > AHL + GFWL, the remainder is unreported mode.";
    } else {
      playerCountInfo.classList.remove("player-count-info--stacked");
      playerCountInfo.textContent = `In Game: ${data.inGame}`;
      playerCountInfo.title =
        "Launchers reporting in-game (community tracker; updates about every 30s)";
    }
  }
}

async function refreshPlayerCountDisplay() {
  if (!playerCountInfo || !window.api?.getPlayerCount) return;
  if (playerCountRefreshInFlight) return;

  playerCountRefreshInFlight = true;
  try {
    const result = await window.api.getPlayerCount();
    if (result?.success && typeof result.inGame === "number") {
      setPlayerCountDisplay({
        inGame: result.inGame,
        inGameAhl: result.inGameAhl,
        inGameGfwl: result.inGameGfwl,
        inGameUnknown: result.inGameUnknown,
      });
    }
  } catch (_err) {
    /* leave placeholder */
  } finally {
    playerCountRefreshInFlight = false;
  }
}

async function initPlayerCountDisplay() {
  if (!playerCountInfo || !window.api?.getPlayerCount) return;

  await refreshPlayerCountDisplay();

  if (!playerCountRefreshInterval) {
    playerCountRefreshInterval = setInterval(
      refreshPlayerCountDisplay,
      PLAYER_COUNT_REFRESH_INTERVAL_MS,
    );
  }

  if (window.api.onPlayerCountUpdate) {
    window.api.onPlayerCountUpdate((data) => setPlayerCountDisplay(data));
  }
}

// Add this event listener for the Instructions button
const openInstructionsButton = document.getElementById(
  "openInstructionsButton",
);

// Add event listener for cancel button
const cancelDownloadButton = document.getElementById("cancelDownloadButton");

// Add this with the other button declarations at the top
const instructionsButton = document.getElementById("instructionsButton");

// Add these with other DOM elements at the top
const maxFrameRateInput = document.getElementById("maxFrameRate");
const saveFrameRateButton = document.getElementById("saveFrameRateButton");

// Add this variable to track if game is running
let gameRunning = false;

// Track if a launch is in progress to prevent multiple launches
let launchInProgress = false;

// Track last launch time to prevent rapid clicking
let lastLaunchTime = 0;
const LAUNCH_COOLDOWN_MS = 2000; // 2 second cooldown after game closes

// Add this listener near the top with other listeners
window.api.onGameStateUpdate((state) => {
  const wasRunning = gameRunning;
  gameRunning = state.running;

  // If game just started running, clear launch in progress flag and auto-mute launcher audio
  if (!wasRunning && state.running) {
    console.log(
      "[Game State] Game started running, clearing launch in progress flag",
    );
    launchInProgress = false;
    // Auto-mute launcher background audio so it doesn't play over the game
    if (backgroundAudio) {
      backgroundAudio.muted = true;
      updateMuteButtonAppearance(true);
    }
    updateUI();
  }
  // If game just stopped running, add a cooldown before re-enabling button and restore audio state
  else if (wasRunning && !state.running) {
    // Restore launcher audio to user's mute preference
    if (backgroundAudio) {
      backgroundAudio.muted = isMuted;
      updateMuteButtonAppearance(isMuted);
    }
    console.log(
      "[Game State] Game closed, applying cooldown before re-enabling button",
    );
    launchInProgress = false;

    // Disable button immediately
    if (playButton) {
      playButton.disabled = true;
      playButton.textContent = "Please wait...";
    }

    // Re-enable after cooldown period
    setTimeout(() => {
      if (!gameRunning && playButton && !launchInProgress) {
        console.log("[Game State] Cooldown expired, re-enabling play button");
        playButton.disabled = false;
        updateUI();
      }
    }, LAUNCH_COOLDOWN_MS);
  } else {
    updateUI();
  }
});

// Add this early in the script to check installation on load
window.api.checkGameInstalled().then((result) => {
  applyInstallationCheckResult(result);
  updateUI();
});

// Add event listener for installation status updates
window.api.onGameInstallationStatus((status) => {
  console.log("Received game installation status:", status);
  applyInstallationCheckResult({
    installed: status.installed,
    dependencies: status.dependencies,
  });
  updateUI();

  if (gameInstalled || gameFilesLocated) {
    console.log("Game found at:", status.path);
  }
});

// Listen for settings updates (e.g., after browsing for game or moving game)
window.api.onSettingsUpdated(async (updatedSettings) => {
  console.log("Settings updated, refreshing mod statuses");
  // Refresh mod statuses to reflect the new game location
  window.api.checkSkipIntroStatus().then((status) => {
    updateSkipIntroButtonState(status.installed);
  });

  // Refresh DXVK status
  window.api.checkDxvkStatus().then((status) => {
    const dxvkToggle = document.getElementById("dxvk");
    if (dxvkToggle) {
      dxvkToggle.checked = status.enabled;
    }
  });

  // Refresh FPS setting from dxvk.conf
  try {
    const fps = await window.api.getCurrentFpsFromDxvkConf();
    if (fps && maxFrameRateInput) {
      maxFrameRateInput.value = fps;
      // Update settings object
      if (settings) {
        settings.maxFrameRate = fps;
      }
    }
  } catch (error) {
    console.error("Error reading FPS from dxvk.conf:", error);
  }
});

// Replace the existing activation status handler with this stripped-down version
window.api.onActivationStatus((status) => {
  // Only log the status, don't change UI
  console.log(
    "Game activation status:",
    status.activated ? "Activated" : "Not activated",
  );

  // Don't change the button text or add classes
  // We always want it to stay as "Activate Game"
});

// Add these references at the top with other DOM elements
const skipIntroProgress = document.getElementById("skipIntroProgress");
const skipIntroStatus = document.getElementById("skipIntroStatus");
const skipIntroProgressBar = document.getElementById("skipIntroProgressBar");

// Add this with other DOM elements at the top
const openGameDirButton = document.getElementById("openGameDirButton");

// Add these DOM element references near the top with other element references
const backupPcidButton = document.getElementById("backupPcidButton");
const pcidBackupFeedback = document.getElementById("pcidBackupFeedback");
const pcidBackupStatus = document.getElementById("pcidBackupStatus");
const currentPcidDisplay = document.getElementById("currentPcidDisplay");

function syncLauncherServerBadgeInteractable() {
  const enabled = !!gameInstalled;
  const live = document.getElementById("launcherGfwlLiveBadge");
  const ahl = document.getElementById("launcherAhlBadge");
  for (const el of [live, ahl]) {
    if (!el) continue;
    el.disabled = !enabled;
    el.style.opacity = enabled ? "1" : "0.5";
    el.style.cursor = enabled ? "pointer" : "not-allowed";
  }
}

// Update UI based on game state
function updateUI() {
  console.log(
    "Updating UI. Game installed:",
    gameInstalled,
    "Game running:",
    gameRunning,
  );

  if (gameInstalled) {
    if (gameRunning) {
      console.log("Setting button to 'Running' state");
      playButton.textContent = "RUNNING";
      playButton.classList.add("running");
      playButton.disabled = true;
    } else {
      console.log("Setting button to 'Play' state");
      playButton.textContent = "Play";
      playButton.classList.add("play");
      playButton.classList.remove("running");
      playButton.disabled = false;
    }
  } else {
    console.log("Setting button to 'Download' state");
    playButton.textContent = "Download";
    playButton.classList.remove("play", "running");
    playButton.disabled = false;
  }

  // Update "Open Game Folder" button in Settings based on game installation status
  const openGameDirButton = document.getElementById("openGameDirButton");
  const gameFolderLabel = document.getElementById("gameFolderLabel");
  const gameFolderDescription = document.getElementById(
    "gameFolderDescription",
  );

  if (openGameDirButton) {
    if (gameFilesLocated) {
      openGameDirButton.textContent = "Open Game Folder";
      if (gameFolderLabel)
        gameFolderLabel.textContent = "Game Installation Folder";
      if (gameFolderDescription)
        gameFolderDescription.textContent =
          "Open the folder where Shadowrun is installed";
    } else {
      openGameDirButton.textContent = "Find Existing Game";
      if (gameFolderLabel)
        gameFolderLabel.textContent = "Find Existing Installation";
      if (gameFolderDescription)
        gameFolderDescription.textContent =
          "Browse for your existing Shadowrun game folder";
    }
  }

  // Update settings screen state based on game installation
  if (gameInstalled) {
    // Enable skip intro button
    if (skipIntroButton) {
      skipIntroButton.disabled = false;
      skipIntroButton.style.opacity = "1";
      skipIntroButton.style.cursor = "pointer";
    }
    // Enable FPS input and apply button
    if (maxFrameRateInput) {
      maxFrameRateInput.disabled = false;
      maxFrameRateInput.style.opacity = "1";
      maxFrameRateInput.style.cursor = "text";
      // Also restore the FPS setting container
      const fpsSetting = maxFrameRateInput.closest(".fps-setting");
      if (fpsSetting) {
        fpsSetting.style.opacity = "1";
      }
    }
    if (saveFrameRateButton) {
      saveFrameRateButton.disabled = false;
      saveFrameRateButton.style.opacity = "1";
      saveFrameRateButton.style.cursor = "pointer";
    }
    // Enable DXVK toggle
    if (dxvkToggle) {
      dxvkToggle.disabled = false;
      const toggleContainer = dxvkToggle.closest(".setting-item");
      if (toggleContainer) {
        toggleContainer.style.opacity = "1";
        toggleContainer.style.pointerEvents = "auto";
      }
    }
    // Enable Change Game Location button
    const changeGameLocationButton = document.getElementById(
      "changeGameLocationButton",
    );
    if (changeGameLocationButton) {
      changeGameLocationButton.disabled = false;
      changeGameLocationButton.style.opacity = "1";
      changeGameLocationButton.style.cursor = "pointer";
    }

    // Enable Server Configuration toggle (AHL/GFWL)
    const gfwlServerToggleEl = document.getElementById("gfwlServerToggle");
    if (gfwlServerToggleEl) {
      gfwlServerToggleEl.disabled = false;
      const toggleContainer = gfwlServerToggleEl.closest(".setting-item");
      if (toggleContainer) {
        toggleContainer.style.opacity = "1";
        toggleContainer.style.pointerEvents = "auto";
      }
    }
  } else {
    // Disable skip intro only when we truly have no game folder. If Shadowrun.exe is
    // located but a dependency (GFWL/DX/VC++) is missing, gameInstalled is false while
    // gameFilesLocated is true — do not reset the button to “Install Mod” (it wipes
    // the real mod state until Settings is reopened).
    if (skipIntroButton) {
      if (!gameFilesLocated) {
        skipIntroButton.disabled = true;
        skipIntroButton.classList.remove("installed");
        skipIntroButton.textContent = "Install Mod";
        skipIntroButton.style.opacity = "0.5";
        skipIntroButton.style.cursor = "not-allowed";
      } else {
        skipIntroButton.disabled = false;
        skipIntroButton.style.opacity = "1";
        skipIntroButton.style.cursor = "pointer";
      }
    }
    // Disable FPS input and apply button
    if (maxFrameRateInput) {
      maxFrameRateInput.disabled = true;
      maxFrameRateInput.style.opacity = "0.5";
      maxFrameRateInput.style.cursor = "not-allowed";
      // Also style the FPS setting container
      const fpsSetting = maxFrameRateInput.closest(".fps-setting");
      if (fpsSetting) {
        fpsSetting.style.opacity = "0.5";
      }
    }
    if (saveFrameRateButton) {
      saveFrameRateButton.disabled = true;
      saveFrameRateButton.style.opacity = "0.5";
      saveFrameRateButton.style.cursor = "not-allowed";
    }
    // Disable DXVK toggle
    if (dxvkToggle) {
      dxvkToggle.disabled = true;
      dxvkToggle.checked = false;
      const toggleContainer = dxvkToggle.closest(".setting-item");
      if (toggleContainer) {
        toggleContainer.style.opacity = "0.5";
        toggleContainer.style.pointerEvents = "none";
      }
    }
    // Disable Change Game Location button
    const changeGameLocationButton = document.getElementById(
      "changeGameLocationButton",
    );
    if (changeGameLocationButton) {
      changeGameLocationButton.disabled = true;
      changeGameLocationButton.style.opacity = "0.5";
      changeGameLocationButton.style.cursor = "not-allowed";
    }

    // Disable Server Configuration toggle (AHL/GFWL) when game isn't installed/located
    const gfwlServerToggleEl = document.getElementById("gfwlServerToggle");
    if (gfwlServerToggleEl) {
      gfwlServerToggleEl.disabled = true;
      gfwlServerToggleEl.checked = false;
      const toggleContainer = gfwlServerToggleEl.closest(".setting-item");
      if (toggleContainer) {
        toggleContainer.style.opacity = "0.5";
        toggleContainer.style.pointerEvents = "none";
      }
    }
    updateGfwlServerDiagnosticsLabel("unavailable");

    // Game files exist but runtime deps (e.g. VC++) missing — still allow changing location
    if (gameFilesLocated) {
      const changeGameLocationButtonPartial = document.getElementById(
        "changeGameLocationButton",
      );
      if (changeGameLocationButtonPartial) {
        changeGameLocationButtonPartial.disabled = false;
        changeGameLocationButtonPartial.style.opacity = "1";
        changeGameLocationButtonPartial.style.cursor = "pointer";
      }
    }
  }

  syncLauncherServerBadgeInteractable();
}

// Window control handlers
muteButton.addEventListener("click", () => {
  // Play click sound before toggling mute (so it plays if currently unmuted)
  if (!isMuted) {
    playClickSound();
  }
  toggleMute();
});

const backgroundAudioVolumeSlider = document.getElementById(
  "backgroundAudioVolumeSlider",
);
if (backgroundAudioVolumeSlider) {
  backgroundAudioVolumeSlider.addEventListener("input", () => {
    // Typical UX: adjusting level while muted unmutes (game-running forced mute excluded).
    if (isMuted && !gameRunning && backgroundAudio) {
      isMuted = false;
      backgroundAudio.muted = false;
      updateMuteButtonAppearance(false);
    }
    const pct = Number(backgroundAudioVolumeSlider.value);
    const gain = actualGainFromSliderPercent(pct);
    syncLauncherAudioElementVolumes(gain);
    const valueLabel = document.getElementById("backgroundAudioVolumeValue");
    if (valueLabel) {
      valueLabel.textContent = `${Math.round(pct)}%`;
    }
  });
  backgroundAudioVolumeSlider.addEventListener("change", () => {
    const pct = Number(backgroundAudioVolumeSlider.value);
    persistBackgroundAudioVolume(actualGainFromSliderPercent(pct));
  });
}

minimizeButton.addEventListener("click", () => {
  playClickSound();
  window.api.minimizeWindow();
});

closeButton.addEventListener("click", async () => {
  playClickSound();
  const result = await window.api.closeWindow();

  // If close was denied because game is running, the notification is already shown
  // from the main process, so we don't need to do anything else here
  if (result && !result.success && result.reason === "game-running") {
    console.log("Cannot close launcher: game is currently running");
  }
});

// Add hover and click sound effects to all buttons
function addButtonSoundEffects() {
  // Get all buttons
  const allButtons = document.querySelectorAll("button");

  allButtons.forEach((button) => {
    // Skip mute button for hover (it's a control button)
    if (button.id !== "muteButton") {
      button.addEventListener("mouseenter", playHoverSound);
    }
    button.addEventListener("click", () => {
      // Don't play click sound for mute button (it's handled separately)
      if (button.id !== "muteButton") {
        playClickSound();
      }
    });
  });
}

// Button event handlers
playButton.addEventListener("click", async () => {
  // First check if button is disabled, game is running, or launch is in progress
  if (playButton.disabled || gameRunning || launchInProgress) {
    console.log(
      "Button clicked while disabled, game running, or launch in progress, ignoring...",
    );
    return; // Exit early, don't process the click
  }

  // Check cooldown period (prevent rapid clicking after game closes)
  const timeSinceLastLaunch = Date.now() - lastLaunchTime;
  if (timeSinceLastLaunch < LAUNCH_COOLDOWN_MS) {
    const remainingTime = Math.ceil(
      (LAUNCH_COOLDOWN_MS - timeSinceLastLaunch) / 1000,
    );
    console.log(
      `Button clicked too soon after last launch. Please wait ${remainingTime} second(s).`,
    );
    showToast(
      `Please wait ${remainingTime} second(s) before launching again`,
      "warning",
      2000,
    );
    return;
  }

  // Mark launch as in progress and disable button immediately
  launchInProgress = true;
  lastLaunchTime = Date.now();
  playButton.disabled = true;
  playButton.textContent = "Launching...";

  console.log("Play button clicked, launch in progress");

  // If game is installed, verify it still exists before launching
  if (gameInstalled) {
    console.log("Verifying game still exists before launch...");
    // Re-check game installation status to catch renamed/moved folders
    const checkResult = await window.api.checkGameInstalled();
    if (!checkResult.dependencies?.gameFiles) {
      console.warn("Game files no longer found at cached location");
      showToast(
        "Game files not found. Please browse for your game folder in Settings.",
        "error",
        5000,
      );
      gameInstalled = false;
      gameFilesLocated = false;
      updateUI();
      return;
    }
    applyInstallationCheckResult(checkResult);
    console.log("Launching game...");
    try {
      const launchResult = await window.api.launchGame(settings);
      if (!launchResult.success) {
        // Launch failed - re-enable button
        launchInProgress = false;
        playButton.disabled = false;
        updateUI();

        // Show specific error message (already improved in main process)
        let errorMsg =
          launchResult.error ||
          "Launch failed. Open Settings → Diagnostics for details and fixes.";
        if (launchResult.suggestMoveOrAdmin) {
          errorMsg +=
            " If the game is in Program Files, move it via Settings → Game location or run the launcher as Administrator.";
        }
        showToast(errorMsg, "error", 6000);
        // If game executable not found, update UI
        if (launchResult.error && launchResult.error.includes("not found")) {
          gameInstalled = false;
          gameFilesLocated = false;
          updateUI();
        }
      } else {
        // Launch succeeded - button will be disabled by game-state-update event
        // Keep launchInProgress true until we get confirmation game is running
        console.log("Launch initiated, waiting for game state update...");
      }
    } catch (error) {
      // Error during launch - re-enable button
      console.error("Error launching game:", error);
      launchInProgress = false;
      playButton.disabled = false;
      updateUI();
      showToast(
        `Failed to launch game: ${
          error.message || "Something went wrong"
        }. Open Settings → Diagnostics for troubleshooting.`,
        "error",
        6000,
      );
    }
    return;
  }

  // If game is not installed, show confirmation dialog
  // Pass auto-scan disabled flag to show appropriate message
  const autoScanDisabled = settings && !settings.autoScanEnabled;
  const downloadChoice = await showDownloadConfirmDialog(autoScanDisabled);

  // If user cancelled, re-enable button
  if (!downloadChoice || downloadChoice === "cancel") {
    launchInProgress = false;
    playButton.disabled = false;
    updateUI();
    return;
  }

  if (downloadChoice === "find") {
    // User wants to find existing game
    try {
      const result = await window.api.browseForExistingGame();
      if (result.success) {
        showToast(
          "✓ Game found! Shadowrun.exe detected in selected folder.",
          "success",
          3000,
        );
        tryShowAhlMissingHintAfterExistingBrowse();
        // The game-installation-status event will be triggered automatically
        // which will update the UI
      } else if (!result.canceled) {
        showToast(
          result.error ||
            "Shadowrun.exe not found in selected folder. Please select the folder containing Shadowrun.exe",
          "error",
          5000,
        );
      }
      // Re-enable button after browse operation
      launchInProgress = false;
      playButton.disabled = false;
      updateUI();
    } catch (error) {
      console.error("[Find Game] Error:", error);
      showToast(
        `Failed to browse for game: ${
          error.message || "Something went wrong"
        }. Please try selecting the folder that contains Shadowrun.exe.`,
        "error",
        5000,
      );
      // Re-enable button on error
      launchInProgress = false;
      playButton.disabled = false;
      updateUI();
    }
    return;
  }

  // User chose to download - check which system components need installing
  // so we can show a single pre-elevation consent modal before any UAC prompts appear.
  console.log("Downloading game...");

  const componentCheck = await window.api.checkGameInstalled();
  const deps = componentCheck.dependencies || {};
  const needsInstall = [];

  if (!deps.gfwl) {
    needsInstall.push({
      name: "Games for Windows Live",
      reason: "required for online multiplayer and login",
    });
  }
  if (!deps.dx9) {
    needsInstall.push({
      name: "DirectX 9 components",
      reason: "required for the game's graphics to initialize",
    });
  }
  if (!deps.vcRedistX86) {
    needsInstall.push({
      name: "Microsoft Visual C++ v14 Redistributable (x86)",
      reason: "required so the game's server hooks and DLLs load correctly",
    });
  }

  // If any of these need installing, show a pre-elevation consent dialog.
  // Windows UAC cannot show custom text, so this is the only way to explain
  // why one or more permission prompts are about to appear.
  if (needsInstall.length > 0) {
    const userConsented = await showPreInstallConsentModal(needsInstall);
    if (!userConsented) {
      launchInProgress = false;
      playButton.disabled = false;
      updateUI();
      return;
    }
  }

  // Re-enable button since download is handled separately
  // The download screen will manage its own UI state
  launchInProgress = false;
  playButton.disabled = false;
  updateUI();

  // Show the download progress screen
  downloadProgressScreen.classList.add("visible");

  // Reset progress bars
  gameFilesProgress.style.width = "0%";
  gfwlProgress.style.width = "0%";
  dxProgress.style.width = "0%";
  if (vcProgress) vcProgress.style.width = "0%";
  gameFilesStatus.textContent = "Waiting...";
  gfwlStatus.textContent = "Waiting...";
  dxStatus.textContent = "Waiting...";
  if (vcStatus) vcStatus.textContent = "Waiting...";
  downloadMessage.textContent =
    "Preparing installation... This may take a few minutes.";

  try {
    const result = await window.api.downloadGame();

    if (!result.success) {
      // Check if admin privileges are required
      if (result.requiresAdmin) {
        // Show admin requirement message
        downloadMessage.textContent =
          "Administrator privileges required for installation";

        // Create admin restart button
        const adminButton = document.createElement("button");
        adminButton.textContent = "Restart as Administrator";
        adminButton.className = "admin-button";
        adminButton.onclick = () => window.api.restartAsAdmin();

        // Add button to download actions
        document.querySelector(".download-actions").prepend(adminButton);

        return;
      } else {
        downloadMessage.textContent = `Error: ${result.error}`;
      }
    }
  } catch (error) {
    downloadMessage.textContent = `Error: ${error.message}`;
  }
});

activateButton.addEventListener("click", async () => {
  console.log("Activation requested...");

  // Check if PCID exists before allowing activation
  console.log("Checking for PCID before activation...");
  const pcidCheck = await window.api.getCurrentPcid();

  if (!pcidCheck.success && pcidCheck.error === "No PCID found") {
    console.log("No PCID found - user must launch game first to generate PCID");
    showToast(
      "No PCID found. Launch the game first to generate a PCID, then you can activate the game.",
      "warning",
      6000,
    );
    return;
  }

  // Show custom confirmation dialog
  const confirmActivation = await showActivationConfirmDialog();

  if (!confirmActivation) {
    console.log("Activation cancelled by user");
    return;
  }

  console.log("Activating game...");

  activateButton.disabled = true;
  activateButton.textContent = "Activating...";

  const ACTIVATE_BUTTON_RESET_MS = 3000;

  try {
    const result = await window.api.activateGame();

    if (result.success) {
      try {
        const serverStatus = await window.api.checkGfwlServer();
        if (serverStatus.mode !== "ahl") {
          showToast(
            "Game activated successfully for classic GFWL. Launch Shadowrun and sign in when prompted.",
            "success",
            5500,
          );
        }
      } catch (_) {
        showToast(
          "Game activated successfully.",
          "success",
          5500,
        );
      }
    }
  } catch (error) {
    console.error("Activation error:", error);
  } finally {
    setTimeout(() => {
      if (activateButton) {
        activateButton.textContent = "Activate Game";
        activateButton.disabled = false;
      }
      void refreshGfwlServerStatus();
    }, ACTIVATE_BUTTON_RESET_MS);
  }
});

discordIconButton.addEventListener("click", () => {
  console.log("Opening Discord...");
  window.api.openDiscord();
});

websiteButton.addEventListener("click", () => {
  console.log("Opening website...");
  window.api.openWebsite();
});

// Settings screen handlers
settingsButton.addEventListener("click", () => {
  settingsScreen.classList.add("visible");

  // If we have no game path, disable all mod controls. If game files exist but a
  // system dependency is missing, still probe skip intro / DXVK from disk.
  if (!gameInstalled && !gameFilesLocated) {
    // Disable skip intro button
    if (skipIntroButton) {
      skipIntroButton.disabled = true;
      skipIntroButton.classList.remove("installed");
      skipIntroButton.textContent = "Install Mod";
      skipIntroButton.style.opacity = "0.5";
      skipIntroButton.style.cursor = "not-allowed";
    }
    // Disable FPS input and apply button
    if (maxFrameRateInput) {
      maxFrameRateInput.disabled = true;
      maxFrameRateInput.style.opacity = "0.5";
      maxFrameRateInput.style.cursor = "not-allowed";
      // Also style the FPS setting container
      const fpsSetting = maxFrameRateInput.closest(".fps-setting");
      if (fpsSetting) {
        fpsSetting.style.opacity = "0.5";
      }
    }
    if (saveFrameRateButton) {
      saveFrameRateButton.disabled = true;
      saveFrameRateButton.style.opacity = "0.5";
      saveFrameRateButton.style.cursor = "not-allowed";
    }
    // Disable DXVK toggle
    if (dxvkToggle) {
      dxvkToggle.disabled = true;
      dxvkToggle.checked = false;
      const toggleContainer = dxvkToggle.closest(".setting-item");
      if (toggleContainer) {
        toggleContainer.style.opacity = "0.5";
        toggleContainer.style.pointerEvents = "none";
      }
    }
    // Disable Change Game Location button
    const changeGameLocationButton = document.getElementById(
      "changeGameLocationButton",
    );
    if (changeGameLocationButton) {
      changeGameLocationButton.disabled = true;
      changeGameLocationButton.style.opacity = "0.5";
      changeGameLocationButton.style.cursor = "not-allowed";
    }
  } else {
    // Game files available — refresh mod/feature state from disk when opening settings
    window.api.checkSkipIntroStatus().then((status) => {
      updateSkipIntroButtonState(status.installed);
    });

    // Check DXVK status whenever settings are opened
    window.api.checkDxvkStatus().then((status) => {
      if (dxvkToggle) {
        dxvkToggle.checked = status.enabled;
      }
    });

    // Refresh FPS value from dxvk.conf whenever settings are opened
    window.api
      .getCurrentFpsFromDxvkConf()
      .then((fps) => {
        if (fps !== null && fps !== undefined && maxFrameRateInput) {
          maxFrameRateInput.value = fps;
          // Update settings object to keep it in sync
          if (settings) {
            settings.maxFrameRate = fps;
          }
        }
      })
      .catch((error) => {
        console.error(
          "Error reading FPS from dxvk.conf when opening settings:",
          error,
        );
      });
  }
});

closeSettingsButton.addEventListener("click", () => {
  settingsScreen.classList.remove("visible");
  // Don't do anything with the mod state when closing settings
});

// Diagnostics screen handlers
const diagnosticsScreen = document.getElementById("diagnosticsScreen");
const openDiagnosticsButton = document.getElementById("openDiagnosticsButton");
const closeDiagnosticsButton = document.getElementById(
  "closeDiagnosticsButton",
);

if (openDiagnosticsButton && diagnosticsScreen) {
  openDiagnosticsButton.addEventListener("click", async () => {
    diagnosticsScreen.classList.add("visible");

    // Reset scroll position to top when opening
    const settingsContent =
      diagnosticsScreen.querySelector(".settings-content");
    if (settingsContent) {
      settingsContent.scrollTop = 0;
    }

    // Load and display current game path
    await loadCurrentGamePath();

    // Auto-detect system info when diagnostics opens (silently, no toast)
    detectAndDisplaySystemInfo(false);

    // Refresh GFWL/AHL server toggle state
    refreshGfwlServerStatus();

    syncDiagnosticsAudioVolumeSlider();
  });
}

if (closeDiagnosticsButton && diagnosticsScreen) {
  closeDiagnosticsButton.addEventListener("click", () => {
    diagnosticsScreen.classList.remove("visible");
  });
}

// Function to load and display current game path
async function loadCurrentGamePath() {
  const currentGamePathElement = document.getElementById("currentGamePath");
  const currentGamePathDisplay = document.getElementById(
    "currentGamePathDisplay",
  );

  if (!currentGamePathElement) return;

  try {
    const gamePath = await window.api.getGameInstallationPath();

    if (gamePath) {
      currentGamePathElement.textContent = gamePath;
      currentGamePathDisplay.style.display = "block";
    } else {
      currentGamePathElement.textContent =
        "Not set (use Find Existing Game / Download first)";
      currentGamePathDisplay.style.display = "block";
    }
  } catch (error) {
    console.error("[Load Game Path] Error:", error);
    currentGamePathElement.textContent = "Unable to determine location";
    currentGamePathDisplay.style.display = "block";
  }
}

// Change Game Location button handler
const changeGameLocationButton = document.getElementById(
  "changeGameLocationButton",
);
if (changeGameLocationButton) {
  changeGameLocationButton.addEventListener("click", async () => {
    try {
      // Disable button during operation
      changeGameLocationButton.disabled = true;
      changeGameLocationButton.textContent = "Please wait...";

      // Request folder selection and validation
      const result = await window.api.changeGameLocation();

      // Re-enable button
      changeGameLocationButton.disabled = false;
      changeGameLocationButton.textContent = "📁 Change Location";

      if (!result.success) {
        if (result.canceled) {
          // User cancelled, do nothing
          return;
        }

        // Show error with context
        const errorMsg =
          result.error ||
          "Could not change game location. Check that the folder exists and you have permission.";
        showToast(`Cannot change game location: ${errorMsg}`, "error", 6000);
        return;
      }

      // Show confirmation dialog (includes elevation warning if needed)
      showGameMoveConfirmation(result);
    } catch (error) {
      console.error("[Change Location] Error:", error);
      showToast(
        `Failed to change game location: ${
          error.message || "Something went wrong"
        }. Please try again.`,
        "error",
        6000,
      );
      changeGameLocationButton.disabled = false;
      changeGameLocationButton.textContent = "📁 Change Location";
    }
  });
}

// Show a pre-elevation consent modal before running system installers.
//
// needsInstall: Array<{ name: string, reason: string }>
//   Each entry describes one component that will be installed.
//
// Returns a Promise<boolean>:
//   true  = user clicked "Continue" (proceed with download + installers)
//   false = user clicked "Cancel" (abort, do not start download)
//
// Design: one modal listing all components so users understand upfront why
// Windows may show one or more UAC prompts during the install sequence.
function showPreInstallConsentModal(needsInstall) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "visible modal-screen";
    modal.style.zIndex = "3000";

    const isSingle = needsInstall.length === 1;
    const componentList = needsInstall
      .map(
        (c) =>
          `<li style="margin-bottom:8px;">
            <strong>${c.name}</strong>
            <span style="color:#9ca3af;"> — ${c.reason}</span>
          </li>`,
      )
      .join("");

    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header" style="background:rgba(15,23,42,0.95);">
          <h2>🔧 System Components Required</h2>
        </div>
        <div class="modal-body" style="padding:20px;">
          <p style="color:#e5e7eb;margin-bottom:14px;">
            The following ${isSingle ? "component needs" : "components need"} to be installed before the game can run:
          </p>
          <ul style="color:#e5e7eb;padding-left:18px;margin-bottom:16px;list-style:disc;">
            ${componentList}
          </ul>
          <div style="background:rgba(59,130,246,0.1);border-left:3px solid rgba(59,130,246,0.6);padding:12px;border-radius:4px;margin-bottom:20px;">
            <div style="font-size:11px;color:#60a5fa;line-height:1.6;">
              🔒 <strong>Windows permission prompt${needsInstall.length > 1 ? "s" : ""}:</strong>
              Windows may show ${needsInstall.length > 1 ? "one or more permission prompts" : "a permission prompt"} so
              Microsoft's installer${needsInstall.length > 1 ? "s" : ""} can register these system libraries.
              This is expected — click <strong>Yes</strong> to proceed when prompted.
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" id="preInstallCancel" class="settings-action-button accent-muted" style="min-width:96px;">Cancel</button>
            <button type="button" id="preInstallContinue" class="settings-action-button accent-primary" style="min-width:120px;">Continue</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#preInstallContinue").addEventListener("click", () => {
      modal.remove();
      resolve(true);
    });

    modal.querySelector("#preInstallCancel").addEventListener("click", () => {
      modal.remove();
      resolve(false);
    });
  });
}

// Persistent-issue "fix" for missing VC++ x86: consent modal + download/install via main process.
async function installVcRedistFromAlert() {
  const agreed = await showPreInstallConsentModal([
    {
      name: "Microsoft Visual C++ v14 Redistributable (x86)",
      reason:
        "Microsoft runtime required so game hooks and DLLs load; the installer may show a Windows permission prompt",
    },
  ]);
  if (!agreed) return;

  showToast(
    "Downloading Microsoft Visual C++ v14 Redistributable (x86) from Microsoft...",
    "info",
    5000,
  );
  try {
    const result = await window.api.installVcRedistX86();
    if (result.skipped) {
      showToast(
        "Microsoft Visual C++ v14 Redistributable (x86) is already installed.",
        "success",
        5000,
      );
    } else if (result.success && result.installed) {
      showToast(
        "Microsoft Visual C++ v14 Redistributable (x86) installed successfully.",
        "success",
        6000,
      );
    } else {
      showToast(
        result.error ||
          "Could not complete Microsoft Visual C++ v14 Redistributable (x86) installation. Open Diagnostics or install manually from aka.ms/vc14/vc_redist.x86.exe",
        "error",
        10000,
      );
    }
  } catch (e) {
    console.error("[installVcRedistFromAlert]", e);
    showToast(e.message || "Installation failed", "error", 8000);
  }
  await checkPersistentIssues();
}

// Function to show game move confirmation dialog
function showGameMoveConfirmation(moveData) {
  console.log("[Move Confirmation] Data received:", {
    requiresElevation: moveData.requiresElevation,
    sourceRequiresAdmin: moveData.sourceRequiresAdmin,
    destRequiresAdmin: moveData.destRequiresAdmin,
    currentPath: moveData.currentPath,
    newPath: moveData.newPath,
  });

  const modal = document.createElement("div");
  modal.className = "visible modal-screen";
  modal.style.zIndex = "3000";

  // Add elevation warning if needed
  const elevationWarning = moveData.requiresElevation
    ? `
    <div style="background: rgba(59, 130, 246, 0.1); border-left: 3px solid rgba(59, 130, 246, 0.6); padding: 12px; border-radius: 4px; margin-bottom: 16px;">
      <div style="font-size: 11px; color: #60a5fa; line-height: 1.5;">
        🔒 <strong>Administrator permission required:</strong> ${
          moveData.sourceRequiresAdmin && moveData.destRequiresAdmin
            ? 'Both folders are protected (like Program Files). A UAC prompt will appear when you click "Move Files". Click "Yes" to proceed.'
            : moveData.sourceRequiresAdmin
              ? 'The source folder is protected (like Program Files), so admin permission is needed to delete the old files. A UAC prompt will appear when you click "Move Files". Click "Yes" to proceed.'
              : 'The destination folder is protected (like Program Files), so admin permission is needed to write files there. A UAC prompt will appear when you click "Move Files". Click "Yes" to proceed.'
        }
      </div>
    </div>
  `
    : "";

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header" style="background: rgba(15, 23, 42, 0.95);">
        <h2>📁 Move Game Files?</h2>
        <button class="close-button" id="cancelMoveButton">×</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <div style="margin-bottom: 20px;">
          <p style="color: #e5e7eb; margin-bottom: 16px;">
            Are you sure you want to move the game files to a new location?
          </p>
        </div>

        <div style="background: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">FROM:</div>
            <div style="font-size: 12px; color: #e5e7eb; word-break: break-all;">${moveData.currentPath}</div>
          </div>
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">TO:</div>
            <div style="font-size: 12px; color: #60a5fa; word-break: break-all;">${moveData.newPath}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">SIZE:</div>
            <div style="font-size: 12px; color: #e5e7eb;">${moveData.sizeFormatted}</div>
          </div>
        </div>

        ${elevationWarning}

        <div style="background: rgba(234, 179, 8, 0.1); border-left: 3px solid rgba(234, 179, 8, 0.6); padding: 12px; border-radius: 4px; margin-bottom: 16px;">
          <div style="font-size: 11px; color: #fbbf24; line-height: 1.5;">
            ⚠️ This operation may take several minutes. The game must be closed during this process.
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="cancelMoveButtonFooter" class="settings-action-button" style="background: rgba(100, 100, 100, 0.3); border: 1px solid rgba(255, 255, 255, 0.2);">
            Cancel
          </button>
          <button id="confirmMoveButton" class="settings-action-button" style="background: #3b82f6; border: 1px solid #60a5fa;">
            Move Files
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  const cancelButtons = [
    modal.querySelector("#cancelMoveButton"),
    modal.querySelector("#cancelMoveButtonFooter"),
  ];
  cancelButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modal.remove();
    });
  });

  // Confirm handler
  const confirmButton = modal.querySelector("#confirmMoveButton");
  confirmButton.addEventListener("click", async () => {
    // Disable buttons
    confirmButton.disabled = true;
    confirmButton.textContent = "Moving...";
    cancelButtons.forEach((btn) => (btn.disabled = true));

    // Show progress modal
    modal.remove();
    showGameMoveProgress(moveData.newPath);
  });
}

// Function to show move progress
function showGameMoveProgress(newPath) {
  const progressModal = document.createElement("div");
  progressModal.className = "visible modal-screen";
  progressModal.style.zIndex = "3000";
  progressModal.id = "gameMoveProgressModal";

  progressModal.innerHTML = `
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header" style="background: rgba(15, 23, 42, 0.95);">
        <h2>📦 Moving Game Files...</h2>
      </div>
      <div class="modal-body" style="padding: 30px;">
        <div style="margin-bottom: 20px;">
          <div style="background: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #e5e7eb;">Progress</span>
              <span id="moveProgressPercent" style="font-size: 13px; color: #60a5fa; font-weight: 600;">0%</span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(0, 0, 0, 0.5); border-radius: 4px; overflow: hidden;">
              <div id="moveProgressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #60a5fa); transition: width 0.3s ease;"></div>
            </div>
            <div id="moveProgressStatus" style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
              Preparing to move files...
            </div>
          </div>
        </div>

        <div style="background: rgba(59, 130, 246, 0.1); border-left: 3px solid rgba(59, 130, 246, 0.6); padding: 12px; border-radius: 4px;">
          <div style="font-size: 11px; color: #60a5fa; line-height: 1.5;">
            ℹ️ Please do not close the launcher or shut down your computer during this process.
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(progressModal);

  // Listen for progress updates
  window.api.onGameMoveProgress((data) => {
    const progressBar = document.getElementById("moveProgressBar");
    const progressPercent = document.getElementById("moveProgressPercent");
    const progressStatus = document.getElementById("moveProgressStatus");

    if (progressBar && progressPercent && progressStatus) {
      progressBar.style.width = `${data.progress}%`;
      progressPercent.textContent = `${data.progress}%`;
      progressStatus.textContent = `Moving files... (${data.movedFiles} of ${data.totalFiles})`;
    }
  });

  // Execute the move
  executeGameMove(newPath, progressModal);
}

// Function to execute the move
async function executeGameMove(newPath, progressModal) {
  try {
    const result = await window.api.executeGameMove(newPath);

    // Remove progress modal
    if (progressModal && progressModal.parentNode) {
      progressModal.remove();
    }

    if (result.success) {
      // Show success message
      showToast(
        `✓ Game files moved successfully to:\n${result.newPath}`,
        "success",
        6000,
      );

      // Refresh installation status
      const installStatus = await window.api.checkGameInstalled();
      applyInstallationCheckResult(installStatus);
      updateUI();

      // Reload settings from main process (includes updated mod statuses)
      const updatedSettings = await window.api.loadSettings();
      settings = updatedSettings;

      // Update the displayed game path
      await loadCurrentGamePath();

      // Update all UI elements with new settings (await so updateUI runs after skip intro state)
      await loadSettings();
    } else {
      // Show error with context
      const errorMsg = result.error || "The move operation failed";
      showToast(
        `Failed to move game files: ${errorMsg}. Your game files are still in the original location.`,
        "error",
        8000,
      );
    }
  } catch (error) {
    console.error("[Execute Move] Error:", error);

    // Remove progress modal
    if (progressModal && progressModal.parentNode) {
      progressModal.remove();
    }

    showToast(
      `Failed to move game files: ${
        error.message || "Something went wrong"
      }. Your game files are still in the original location.`,
      "error",
      8000,
    );
  }
}

// Add a cooldown mechanism for toggle switches
function applyCooldown(toggleElement, duration = 1500) {
  // Disable the toggle
  toggleElement.disabled = true;

  // Add a visual indicator that it's in cooldown
  toggleElement.parentElement.classList.add("cooldown");

  // Enable after the specified duration
  setTimeout(() => {
    toggleElement.disabled = false;
    toggleElement.parentElement.classList.remove("cooldown");
  }, duration);
}

// Skip intro button state is set by loadSettings() (load-settings probes disk).

// Add this helper function
function updateSkipIntroButtonState(installed) {
  if (installed) {
    skipIntroButton.textContent = "Uninstall Mod";
    skipIntroButton.classList.add("installed");
    skipIntroButton.disabled = false; // Ensure button is enabled
  } else {
    skipIntroButton.textContent = "Install Mod";
    skipIntroButton.classList.remove("installed");
    skipIntroButton.disabled = false; // Ensure button is enabled if game is installed
  }
}

// Update the skipIntroButton click handler to not use the processing class
skipIntroButton.addEventListener("click", async () => {
  // If already disabled, don't do anything
  if (skipIntroButton.disabled) {
    return;
  }

  const isInstalled = skipIntroButton.classList.contains("installed");
  const newState = !isInstalled;

  // Disable button but don't add processing class
  skipIntroButton.disabled = true;

  try {
    skipIntroProgress.classList.add("visible");
    skipIntroStatus.textContent = isInstalled
      ? "Preparing to remove mod..."
      : "Preparing to install mod...";
    skipIntroProgressBar.style.width = "0%";

    const result = await window.api.toggleSkipIntro(newState);

    if (result.success) {
      // Update button state
      updateSkipIntroButtonState(newState);
    } else {
      // Show error
      console.error("Failed to toggle intro skip:", result.message);
    }
  } catch (error) {
    console.error("Error toggling intro skip:", error);
  }
});

if (dxvkToggle) {
  dxvkToggle.addEventListener("change", async () => {
    const newState = dxvkToggle.checked;

    // Disable toggle during operation
    dxvkToggle.disabled = true;
    const settingItem = dxvkToggle.closest(".setting-item");
    const label = settingItem.querySelector("label");
    const originalLabelText = label.textContent;

    try {
      // Show loading state
      label.textContent = "DXVK Support ⟳";

      const result = await window.api.toggleDxvk(newState);

      if (result.success) {
        // Update settings
        settings.dxvk = newState;
        saveSettings();

        // Show success toast
        showToast(result.message, "success");
      } else {
        // Revert toggle state on failure
        dxvkToggle.checked = !newState;

        // Show error toast with context
        const errorMsg =
          result.message ||
          "Could not change DXVK setting. Try running the launcher as Administrator.";
        showToast(`DXVK toggle failed: ${errorMsg}`, "error", 6000);
      }
    } catch (error) {
      console.error("Error toggling DXVK:", error);

      // Revert toggle state on error
      dxvkToggle.checked = !newState;

      showToast(
        `Failed to toggle DXVK support: ${
          error.message || "Unknown error"
        }. Please try again.`,
        "error",
        6000,
      );
    } finally {
      // Restore label and re-enable toggle
      label.textContent = originalLabelText;
      dxvkToggle.disabled = false;

      // Apply cooldown
      applyCooldown(dxvkToggle);
    }
  });
}

// Save settings to main process
function saveSettings() {
  window.api.saveSettings(settings);
}

// Load settings from main process
async function loadSettings() {
  settings = await window.api.loadSettings();
  // Drive Skip Intro from saved settings — do NOT toggle `.installed` from prior DOM state
  // (toggling inverted the button after game move: settings-updated fixed it, then this undid it).
  if (skipIntroButton) {
    updateSkipIntroButtonState(Boolean(settings.skipIntro));
  }

  // Check DXVK status and update toggle
  try {
    const dxvkStatus = await window.api.checkDxvkStatus();
    dxvkToggle.checked = dxvkStatus.enabled;
    settings.dxvk = dxvkStatus.enabled;
  } catch (error) {
    console.error("Error checking DXVK status:", error);
    dxvkToggle.checked = settings.dxvk;
  }

  // Load frame rate setting - prioritize reading from dxvk.conf file
  try {
    const fpsFromConf = await window.api.getCurrentFpsFromDxvkConf();
    if (fpsFromConf !== null && fpsFromConf !== undefined) {
      // Use the value from dxvk.conf (most accurate)
      maxFrameRateInput.value = fpsFromConf;
      settings.maxFrameRate = fpsFromConf;
    } else if (settings.maxFrameRate) {
      // Fall back to stored settings if dxvk.conf doesn't have a value
      maxFrameRateInput.value = settings.maxFrameRate;
    } else {
      // Default to 85 if neither source has a value
      maxFrameRateInput.value = 85;
    }
  } catch (error) {
    console.error("Error reading FPS from dxvk.conf:", error);
    // Fall back to stored settings or default
    if (settings.maxFrameRate) {
      maxFrameRateInput.value = settings.maxFrameRate;
    } else {
      maxFrameRateInput.value = 85;
    }
  }

  applyLauncherAudioFromSettingsPayload(settings);

  // Re-apply install-dependent control enable/disable (skip intro, DXVK, etc.)
  updateUI();
}

// Load version number on startup
async function loadVersion() {
  const result = await window.api.getVersion();
  if (result.success) {
    versionInfo.textContent = `Version ${result.version}`;
  }
}

// Initialize UI: load settings once, then audio (avoids duplicate load-settings /
// checkSkipIntroStatus probes that spammed identical log lines).
(async function startupLauncherUi() {
  updateUI();
  await loadSettings();
  loadVersion();
  initPlayerCountDisplay();
  await initBackgroundAudio(settings);
  addButtonSoundEffects();
})();

// Update the drag event handler
document.addEventListener("mousedown", (e) => {
  // Don't start drag on buttons or settings screen
  if (
    e.target.closest("button") ||
    e.target.closest("#settingsScreen") ||
    e.target.closest("input")
  ) {
    return;
  }

  // Start dragging
  window.api.startDrag();

  // Custom dragging behavior implemented in preload
  const startX = e.clientX;
  const startY = e.clientY;

  const mouseMoveHandler = (moveEvent) => {
    // Move the window by sending the movement to the main process
    window.api.moveWindow(
      moveEvent.clientX - startX,
      moveEvent.clientY - startY,
    );
  };

  const mouseUpHandler = () => {
    document.removeEventListener("mousemove", mouseMoveHandler);
    document.removeEventListener("mouseup", mouseUpHandler);
  };

  document.addEventListener("mousemove", mouseMoveHandler);
  document.addEventListener("mouseup", mouseUpHandler);
});

// Instructions popup handlers
closeInstructionsButton.addEventListener("click", () => {
  instructionsScreen.classList.remove("visible");
});

const gotItButton = document.getElementById("gotItButton");
if (gotItButton) {
  gotItButton.addEventListener("click", () => {
    playClickSound();
    instructionsScreen.classList.remove("visible");
  });
}

// FAQ Modal handlers
const faqScreen = document.getElementById("faqScreen");
const openFaqButton = document.getElementById("openFaqButton");
const closeFaqButton = document.getElementById("closeFaqButton");

if (openFaqButton) {
  openFaqButton.addEventListener("click", () => {
    playClickSound();
    showFaqModal();
  });
}

if (closeFaqButton) {
  closeFaqButton.addEventListener("click", () => {
    playClickSound();
    faqScreen.classList.remove("visible");
  });
}

// Function to show FAQ modal with accordion-style FAQs
function showFaqModal() {
  const faqContent = document.getElementById("faqContent");
  if (!faqContent) return;

  // FAQ data (hardcoded - can be easily updated)
  const faqs = [
    {
      question: "Compatibility Warning on Launch",
      answer: `
        <p><strong>Problem:</strong> When launching the game, you may see a warning: "Shadowrun has one or more compatibility issues on this computer"</p>
        <p><strong>Solution:</strong> This is completely normal and expected!</p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Check the box "Don't show this message again"</li>
          <li>Click "Run" to launch the game</li>
          <li>The game will work fine despite this warning</li>
          <li>This message appears because the game was designed for Windows Vista, but runs perfectly on modern Windows</li>
        </ul>
      `,
    },
    {
      question: "Direct3D Device Error / Unable to Create Direct3D Device",
      answer: `
        <p><strong>Problem:</strong> "Shadowrun was unable to create the Direct3D Device. Press Retry to try again, or Cancel to exit."</p>
        <p><strong>Solutions (try in this order):</strong></p>
        
        <p><strong>1. Verify DirectX Installation:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Open the Diagnostics screen in the launcher</li>
          <li>Check if DirectX 9 is installed</li>
          <li>If missing, reinstall DirectX 9 from the launcher or Microsoft's website</li>
        </ul>

        <p style="margin-top: 12px;"><strong>2. Update GPU Drivers:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Go to Windows Update → Optional Updates</li>
          <li>Or download latest drivers from your GPU manufacturer (NVIDIA/AMD/Intel)</li>
          <li>Restart your computer after updating</li>
        </ul>

        <p style="margin-top: 12px;"><strong>3. Disable DXVK Support (if above doesn't work):</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Open Settings in the launcher</li>
          <li>Find "DXVK Support" toggle and turn it OFF</li>
          <li>This disables the d3d9.dll compatibility layer</li>
          <li>Try launching the game again</li>
        </ul>

        <p style="margin-top: 12px;"><strong>⚠️ Pink Screen Issue (Older GPUs):</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>If you see pink fog/screen in-match after disabling DXVK, you need the Pink Screen Fix</li>
          <li>Download the fix and install it to your game directory</li>
          <li>Right-click Shadowrun.exe → Properties → Compatibility → Check "Run as administrator"</li>
        </ul>

        <p style="margin-top: 12px; padding: 12px; background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; border-radius: 4px;">
          <strong>💬 Need Help?</strong><br>
          If none of these solutions work, reach out for support on the Shadowrun Community Discord. Our community can help troubleshoot your specific issue!
        </p>
      `,
    },
    {
      question: "Activation Issues - Key Entry Screen Not Appearing",
      answer: `
        <p><strong>Problem:</strong> First-time activation may take up to 20 minutes to load the key entry page after logging in.</p>
        <p><strong>Solutions:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Click 'Retry' if you receive a "This key has been used too many times" message</li>
          <li>Wait 5-10 minutes for the key entry window to appear</li>
          <li>If the application appears frozen:
            <ul style="margin-left: 20px; margin-top: 4px;">
              <li>Use Win-Key + Tab to switch desktops</li>
              <li>Drag Shadowrun to a second desktop</li>
              <li>Open Task Manager to end the process if necessary</li>
            </ul>
          </li>
        </ul>
      `,
    },
    {
      question: "Performance Issues - FPS Not Limited",
      answer: `
        <p><strong>Problem:</strong> Game malfunctions when FPS is not limited, affecting gun firing rates and in-game physics.</p>
        <p><strong>Solution:</strong> Set FPS limit between 50-98 fps.</p>
        <p><strong>Configure dxvk.conf with:</strong></p>
        <pre style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; margin: 8px 0; overflow-x: auto;"><code>dxgi.maxFrameRate = 85
d3d9.maxFrameRate = 85</code></pre>
        <p><strong>NVIDIA Settings:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Background Max Frame Rate: Same as Max Frame Rate</li>
          <li>Max Frame Rate: Up to 98</li>
          <li>Vertical Sync: Off</li>
          <li>Anisotropic Filtering: 16x</li>
          <li>Antialiasing Mode: Enhance application setting</li>
          <li>Antialiasing Setting: 8x</li>
          <li>Antialiasing Transparency: 8x supersample</li>
        </ul>
      `,
    },
    {
      question: "Controller Not Working",
      answer: `
        <p><strong>Xbox Controllers:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Natively supported; enable in main menu settings</li>
        </ul>
        <p><strong>PlayStation Controllers:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Add Shadowrun as a Non-Steam Game</li>
          <li>Enable PlayStation Controller Support in Steam</li>
          <li>Connect controller via USB or Bluetooth</li>
        </ul>
        <p><strong>⚠️ Important:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Controller settings can only be changed from the main menu</li>
          <li>Cannot switch input methods during a match</li>
        </ul>
      `,
    },
    {
      question: "Connection Issues - Can't Join Online Matches",
      answer: `
        <p><strong>Problem:</strong> Difficulty connecting to online matches.</p>
        <p><strong>Solutions:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Enable open NAT or UPnP in router settings</li>
          <li>Verify open NAT status in Xbox Console Companion App</li>
          <li>Check for PCID registry conflicts</li>
          <li>Contact ISP about Carrier Grade NAT (CGNAT)</li>
        </ul>
        <p><strong>Registry Fix:</strong></p>
        <ol style="margin-left: 20px; margin-top: 8px;">
          <li>Uninstall GFWL components</li>
          <li>Open regedit as administrator</li>
          <li>Navigate to <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">C:\\Users\\USERNAME\\AppData\\Local\\Microsoft\\Xlive</code></li>
          <li>Delete the entire folder</li>
          <li>Reinstall GFWL</li>
        </ol>
      `,
    },
    {
      question: "Critical System Requirements Not Met Error",
      answer: `
        <p><strong>Problem:</strong> Launcher shows "Critical system requirements not met" but game can launch manually.</p>
        <p><strong>Solutions:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>This error appears when diagnostic checks fail, but the game may still work</li>
          <li>Network connectivity check may fail due to firewall/VPN - this is OK for offline play</li>
          <li>If you can manually launch the game, the Play button should work</li>
          <li>Check the Diagnostics screen for specific issues</li>
          <li>Run launcher as Administrator if issues persist</li>
        </ul>
      `,
    },
    {
      question: "Old Files Missing Error",
      answer: `
        <p><strong>Problem:</strong> Toast error about "old files missing" appears.</p>
        <p><strong>Explanation:</strong> This error only appears during game directory move operations. If you didn't change the game directory, it may be from a previous incomplete move.</p>
        <p><strong>Solutions:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>If you didn't move the game directory, this is usually harmless</li>
          <li>Check both old and new game folder locations if you did move files</li>
          <li>Game files may be in both locations - verify which location has the complete files</li>
          <li>You can safely ignore this error if the game launches and plays normally</li>
        </ul>
      `,
    },
    {
      question: "Game Won't Launch from Launcher",
      answer: `
        <p><strong>Solutions:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Verify game files exist at the location shown in Settings</li>
          <li>Run launcher as Administrator</li>
          <li>Check that DirectX 9 and GFWL are installed (use Diagnostics screen)</li>
          <li>If game launches manually but not from launcher, check Diagnostics for specific errors</li>
          <li>Try browsing for game folder again in Settings if path changed</li>
        </ul>
      `,
    },
    {
      question:
        "Nothing Happens When I Press Play (Black Screen or No Response)",
      answer: `
        <p><strong>Problem:</strong> You press Play but nothing happens, or you get a black screen with no game window.</p>
        <p><strong>Solution:</strong> Try disabling DXVK Support and launch again.</p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Open <strong>Settings</strong> in the launcher</li>
          <li>Find the <strong>DXVK Support</strong> toggle and turn it <strong>OFF</strong></li>
          <li>Try launching the game again</li>
        </ul>
        <p style="margin-top: 12px;">DXVK can cause compatibility issues on some systems. Disabling it uses the game's native DirectX path instead.</p>
      `,
    },
    {
      question: "GFWL Sign-In Issues",
      answer: `
        <p><strong>Solutions:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Create a new Xbox Live account if you don't have one</li>
          <li>Use the same account you use for Xbox/Microsoft services</li>
          <li>If sign-in fails, restart the game and try again</li>
          <li>Check that Windows License Manager Service is running (open services.msc and start "LicenseManager" if stopped)</li>
          <li>If Xbox Live Networking Service is stopped, start it via services.msc ("XboxNetApiSvc")</li>
        </ul>
      `,
    },
  ];

  // Generate FAQ HTML with accordion functionality
  faqContent.innerHTML = faqs
    .map(
      (faq, index) => `
    <div class="faq-item" style="margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden;">
      <button class="faq-question" data-index="${index}" style="width: 100%; text-align: left; padding: 14px 16px; background: rgba(0,0,0,0.2); border: none; color: white; cursor: pointer; font-size: 14px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;">
        <span>${faq.question}</span>
        <span class="faq-icon" style="font-size: 18px; transition: transform 0.3s;">+</span>
      </button>
      <div class="faq-answer" data-index="${index}" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; background: rgba(0,0,0,0.1);">
        <div style="padding: 16px; font-size: 13px; line-height: 1.6; color: rgba(255,255,255,0.9);">
          ${faq.answer}
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  // Add click handlers for accordion
  const faqQuestions = faqContent.querySelectorAll(".faq-question");
  faqQuestions.forEach((question) => {
    question.addEventListener("click", () => {
      const index = question.dataset.index;
      const answer = faqContent.querySelector(
        `.faq-answer[data-index="${index}"]`,
      );
      const icon = question.querySelector(".faq-icon");

      if (answer.style.maxHeight && answer.style.maxHeight !== "0px") {
        // Close
        answer.style.maxHeight = "0px";
        icon.textContent = "+";
        icon.style.transform = "rotate(0deg)";
        question.style.background = "rgba(0,0,0,0.2)";
      } else {
        // Open
        answer.style.maxHeight = answer.scrollHeight + "px";
        icon.textContent = "−";
        icon.style.transform = "rotate(0deg)";
        question.style.background = "rgba(0,0,0,0.4)";
      }
    });
  });

  // Search functionality
  const searchInput = document.getElementById("faqSearchInput");
  const noResults = document.getElementById("faqNoResults");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const faqItems = faqContent.querySelectorAll(".faq-item");
      let visibleCount = 0;

      faqItems.forEach((item) => {
        const question = item.querySelector(".faq-question");
        const answer = item.querySelector(".faq-answer");
        const questionText = question.textContent.toLowerCase();
        const answerText = answer.textContent.toLowerCase();

        if (
          questionText.includes(searchTerm) ||
          answerText.includes(searchTerm)
        ) {
          item.style.display = "block";
          visibleCount++;
        } else {
          item.style.display = "none";
        }
      });

      // Show/hide no results message
      if (noResults) {
        noResults.style.display = visibleCount === 0 ? "block" : "none";
      }
    });

    // Focus search input when modal opens
    setTimeout(() => searchInput.focus(), 100);
  }

  // Quick action buttons
  const quickActions = document.querySelectorAll(".faq-quick-action");
  quickActions.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const faqItems = faqContent.querySelectorAll(".faq-item");

      faqItems.forEach((item) => {
        const question = item.querySelector(".faq-question");
        const answer = item.querySelector(".faq-answer");
        const icon = question.querySelector(".faq-icon");

        if (action === "expand-all") {
          answer.style.maxHeight = answer.scrollHeight + "px";
          icon.textContent = "−";
          question.style.background = "rgba(0,0,0,0.4)";
        } else if (action === "collapse-all") {
          answer.style.maxHeight = "0px";
          icon.textContent = "+";
          question.style.background = "rgba(0,0,0,0.2)";
        }
      });
    });
  });

  // Show modal
  faqScreen.classList.add("visible");
}

// Download progress event listeners
window.api.onGameFilesProgress((progress) => {
  gameFilesProgress.style.width = `${progress}%`;
  if (progress === 100) {
    gameFilesStatus.textContent = "Complete";
  } else if (progress > 0) {
    gameFilesStatus.textContent = `${progress}%`;
  } else {
    gameFilesStatus.textContent = "Waiting...";
  }
});

// Listen for extraction status
window.api.onGameFilesExtracting(() => {
  gameFilesStatus.textContent = "Extracting...";
});

window.api.onGfwlProgress((progress) => {
  gfwlProgress.style.width = `${progress}%`;
  if (progress === 100) {
    gfwlStatus.textContent = "Complete";
  } else if (progress > 0) {
    gfwlStatus.textContent = `${progress}%`;
  } else {
    gfwlStatus.textContent = "Waiting...";
  }
});

window.api.onDxProgress((progress) => {
  dxProgress.style.width = `${progress}%`;
  if (progress === 100) {
    dxStatus.textContent = "Complete";
  } else if (progress > 0) {
    dxStatus.textContent = `${progress}%`;
  } else {
    dxStatus.textContent = "Waiting...";
  }
});

// Handle DirectX 9 installation progress with timer
window.api.onDxInstallProgress((message) => {
  dxStatus.textContent = message;
});

// Handle GFWL installation progress with timer
window.api.onGfwlInstallProgress((message) => {
  gfwlStatus.textContent = message;
});

window.api.onVcProgress((progress) => {
  if (!vcProgress) return;
  vcProgress.style.width = `${progress}%`;
  if (vcStatus) {
    if (progress === 100) {
      vcStatus.textContent = "Complete";
    } else if (progress > 0) {
      vcStatus.textContent = `${progress}%`;
    } else {
      vcStatus.textContent = "Waiting...";
    }
  }
});

window.api.onVcInstallProgress((message) => {
  if (vcStatus) vcStatus.textContent = message;
});

window.api.onDownloadMessage((message) => {
  downloadMessage.textContent = message;
});

window.api.onDownloadComplete(() => {
  // Close download screen and return to main window
  downloadProgressScreen.classList.remove("visible");

  // The game-installation-status event will be sent by main process
  // which will update gameInstalled and call updateUI()
  // But we can also set it optimistically since download completed successfully
  gameInstalled = true;
  gameFilesLocated = true;
  updateUI();

  console.log("Download complete - game is now installed");
});

window.api.onDownloadError((error) => {
  const msg = error && typeof error === "string" ? error : "Download failed";
  const hint =
    msg.includes("Check your") || msg.includes("Try running")
      ? ""
      : " Check your internet connection or try again later.";
  downloadMessage.textContent = `Error: ${msg}${hint}`;

  // Replace "Cancel Installation" button with "Close" button
  const downloadActions = document.querySelector(".download-actions");
  if (downloadActions) {
    // Remove existing buttons
    downloadActions.innerHTML = "";

    // Add a single "Close" button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.className = "settings-action-button";
    closeBtn.onclick = () => downloadProgressScreen.classList.remove("visible");
    downloadActions.appendChild(closeBtn);
  }
});

// Add this event listener for the Instructions button
instructionsButton.addEventListener("click", () => {
  console.log("Opening instructions...");
  instructionsScreen.classList.add("visible");
});

// Add event listener for cancel button
cancelDownloadButton.addEventListener("click", () => {
  window.api.cancelDownload();
  downloadProgressScreen.classList.remove("visible");
  downloadMessage.textContent = "Installation cancelled";
});

// Add this to handle component skipped messages
window.api.onComponentSkipped((component, message) => {
  // Mark the component as skipped in the UI
  const progressItem = document.querySelector(
    `.progress-item[data-component="${component}"]`,
  );
  if (progressItem) {
    progressItem.classList.add("skipped");
    progressItem.querySelector(".progress-container").style.opacity = "0.5";
    progressItem.querySelector(".progress-status").textContent = "Skipped";

    // Clone and move the skipped item to the top of the list
    const container = progressItem.parentElement;
    container.insertBefore(progressItem, container.firstChild);
  }
});

// Add this after the other event listeners
saveFrameRateButton.addEventListener("click", async () => {
  const fps = maxFrameRateInput.value;
  const result = await window.api.setMaxFrameRate(fps);

  if (result.success) {
    // Show success feedback
    const feedback = document.getElementById("fpsFeedback");

    if (result.requiresRestart) {
      // Game is running - show restart warning
      feedback.textContent = "FPS saved! Restart game to apply changes.";
      feedback.style.backgroundColor = "rgba(251, 191, 36, 0.9)"; // Orange/yellow warning color
    } else {
      // Game not running - normal success
      feedback.textContent = "FPS setting saved successfully!";
      feedback.style.backgroundColor = "rgba(16, 185, 129, 0.9)"; // Green success color
    }

    feedback.classList.add("visible");

    // Hide after 5 seconds (longer for restart message)
    setTimeout(
      () => {
        feedback.classList.remove("visible");
        // Reset to default green color for next time
        feedback.style.backgroundColor = "rgba(16, 185, 129, 0.9)";
      },
      result.requiresRestart ? 5000 : 3000,
    );
  } else {
    // Show error feedback
    const feedback = document.getElementById("fpsFeedback");
    feedback.textContent = "Error saving FPS setting";
    feedback.style.backgroundColor = "rgba(220, 38, 38, 0.9)";
    feedback.classList.add("visible");

    // Hide after 3 seconds
    setTimeout(() => {
      feedback.classList.remove("visible");
      feedback.style.backgroundColor = "rgba(17, 94, 89, 0.9)";
    }, 3000);
  }
});

// Add this notification handler
window.api.onShowNotification((data) => {
  const { message, type } = data;
  const notification = document.createElement("div");
  notification.className = `notification ${type || ""}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
});

// Launch error handler - shows detailed error information
window.api.onLaunchError((data) => {
  if (data.critical && data.issues && data.issues.length > 0) {
    // Build clearer, more specific error message
    let errorMessage;

    if (data.issues.length === 1) {
      // Single issue - show specific message
      const issue = data.issues[0];
      if (issue.type === "directx") {
        errorMessage =
          "DirectX 9 is not installed. Install it from the launcher's setup options to fix 'Unable to create Direct3D Device' errors.";
      } else {
        // Fallback for any other critical issues
        errorMessage = `${issue.message}${
          issue.fix ? `\n\nFix: ${issue.fix}` : ""
        }`;
      }
    } else {
      // Multiple issues - list them clearly
      const issueMessages = data.issues
        .map((issue) => {
          if (issue.type === "directx") {
            return "• DirectX 9 is not installed (causes Direct3D errors)";
          }
          return `• ${issue.message}`;
        })
        .join("\n");
      errorMessage = `Critical issues detected:\n\n${issueMessages}\n\nPlease fix these issues before launching the game.`;
    }

    // Show error toast with details
    showToast(errorMessage, "error", 10000); // Increased to 10 seconds for readability

    console.error("[Launch Error] Critical issues:", data.issues);
  }
});

/** True when the child process never started or Node reported a spawn failure. */
function isSpawnFailurePayload(data) {
  const err = data.error || "";
  if (!err) return false;
  if (
    /^spawn\s/i.test(err) ||
    /\bENOENT\b|\bEACCES\b|\bEPERM\b|\bENOTDIR\b/i.test(err)
  ) {
    return true;
  }
  if (data.exitCode === -1 && err.length > 0) return true;
  return false;
}

function describeSpawnFailure(errorMessage) {
  const m = errorMessage || "";
  if (/\bENOENT\b/i.test(m)) {
    return {
      title: "Could not start the game — file or folder not found",
      detail:
        "Windows could not find Shadowrun.exe or part of the path. In Settings → Game location, choose the folder that directly contains Shadowrun.exe.",
    };
  }
  if (/\bEACCES\b/i.test(m) || /\bEPERM\b/i.test(m)) {
    return {
      title: "Could not start the game — permission denied",
      detail:
        "Another program or Windows blocked running the game (antivirus, folder permissions, or a protected install path).",
    };
  }
  if (/\bENOTDIR\b/i.test(m)) {
    return {
      title: "Could not start the game — invalid path",
      detail:
        "The game path is not valid. Open Settings → Game location and select the folder that contains Shadowrun.exe.",
    };
  }
  return {
    title: "Could not start the game",
    detail:
      m ||
      "The launcher failed to start the game process. See Settings → Diagnostics and game-crash.log if available.",
  };
}

/**
 * Maps Windows NTSTATUS-style process exit codes (32-bit, signed or unsigned) to copy.
 * Reference: common game crash codes on Windows x64.
 */
function describeWindowsGameExit(exitCode) {
  if (exitCode === undefined || exitCode === null) {
    return {
      title: "Game closed unexpectedly",
      detail:
        "No exit code was reported (the process may have been terminated unusually).",
      tip: "Check Settings → Diagnostics. Details may be in game-crash.log.",
    };
  }

  const u = exitCode >>> 0;
  const hex = `0x${u.toString(16).toUpperCase()}`;

  const table = {
    0xc0000005: {
      title: "Access violation — invalid memory (STATUS_ACCESS_VIOLATION)",
      detail:
        "Windows stopped the game because it used memory incorrectly. Common causes: GPU drivers, DXVK/Vulkan, mods, or damaged or mismatched game files.",
      tip: "Try: update GPU drivers, verify game files, turn off DXVK or mods in Settings. In a VM, enable 3D acceleration.",
    },
    0xc0000135: {
      title: "Missing DLL — dependency not found (STATUS_DLL_NOT_FOUND)",
      detail:
        "A DLL the game needs was not loaded (removed file, wrong folder, or missing Visual C++ / DirectX runtimes).",
      tip: "Verify game files, reinstall into the folder from Settings, and install DirectX 9 / VC++ runtimes from the launcher setup if prompted.",
    },
    0xc000007b: {
      title: "Bad executable image (STATUS_INVALID_IMAGE_FORMAT)",
      detail:
        "Windows rejected the program image—often a 32-bit/64-bit mismatch, corrupted Shadowrun.exe, or incompatible DLLs next to the game.",
      tip: "Re-download or verify files; remove conflicting DLLs from the game folder; try disabling DXVK.",
    },
    0xc0000142: {
      title: "DLL failed to initialize (STATUS_DLL_INIT_FAILED)",
      detail:
        "A DLL loaded but failed during startup (graphics hook, mod, or system DLL conflict).",
      tip: "Disable mods and DXVK temporarily; update GPU drivers; try a clean game folder.",
    },
    0xc0000409: {
      title:
        "Security check failed — stack buffer overrun (STATUS_STACK_BUFFER_OVERRUN)",
      detail:
        "Windows terminated the process due to a stack protection violation—can indicate a bug, mod, or exploit mitigation.",
      tip: "Remove mods; update the game files; update Windows and drivers.",
    },
    0xc00000fd: {
      title: "Stack overflow (STATUS_STACK_OVERFLOW)",
      detail:
        "The game exhausted the stack—sometimes mods or infinite recursion in injected code.",
      tip: "Disable mods and DXVK; verify vanilla install.",
    },
    0xc0000094: {
      title: "Integer divide by zero (STATUS_INTEGER_DIVIDE_BY_ZERO)",
      detail: "The game hit a divide-by-zero fault inside the process.",
      tip: "Try without mods; verify game files.",
    },
    0xc000001d: {
      title: "Illegal instruction (STATUS_ILLEGAL_INSTRUCTION)",
      detail:
        "The CPU executed an instruction it could not run—CPU/driver mismatch or corrupted code.",
      tip: "Update CPU chipset/GPU drivers; verify game files; avoid incompatible mods.",
    },
    0x80000003: {
      title: "Breakpoint hit (STATUS_BREAKPOINT)",
      detail:
        "The process hit a debug breakpoint—sometimes a debugger, hook, or anti-tamper tool.",
      tip: "Close debugging/overlays/tools that attach to games and try again.",
    },
  };

  const row = table[u];
  if (row) {
    return row;
  }

  // Typical small app-defined codes (1, 2, …)
  if (exitCode >= 1 && exitCode <= 255 && exitCode === u) {
    return {
      title: `Game exited with code ${exitCode}`,
      detail:
        "The game process ended and returned a non-zero exit code (often a generic failure).",
      tip: "Check Settings → Diagnostics. More detail may be in game-crash.log.",
    };
  }

  return {
    title: `Game exited abnormally (${hex})`,
    detail: `Windows reported status ${hex} (numeric code ${exitCode}).`,
    tip: "Check Settings → Diagnostics and game-crash.log for captured output.",
  };
}

function buildGameCrashToast(data) {
  // 1) Process never started
  if (isSpawnFailurePayload(data)) {
    const { title, detail } = describeSpawnFailure(data.error);
    let msg = `${title}\n\n${detail}`;
    if (data.suggestMoveOrAdmin) {
      msg +=
        "\n\nIf the install is under Program Files, move it in Settings → Game location or run the launcher as Administrator.";
    }
    return msg;
  }

  // 2) Vulkan / DXVK loader issue (stderr matched in main)
  if (data.isVulkanError && data.dxvkEnabled) {
    return (
      "Vulkan could not load — DXVK needs working Vulkan drivers\n\n" +
      "The game uses DXVK (Direct3D 9 → Vulkan). Your system did not expose the Vulkan entry points DXVK needs (missing loader, bad GPU driver, or no Vulkan support).\n\n" +
      "Try: Settings → Performance → disable DXVK, then Play. Install/update GPU drivers from the chip vendor (NVIDIA / AMD / Intel)."
    );
  }

  if (data.isVulkanError && !data.dxvkEnabled) {
    return (
      "Vulkan loader issue detected\n\n" +
      "Output mentioned Vulkan failures even though DXVK is off—update GPU drivers and check Settings → Diagnostics."
    );
  }

  // 3) Signal (unusual on Windows; common on Unix-like environments)
  if (data.signal) {
    let msg = `Game ended by signal (${data.signal})\n\nThe process received signal ${data.signal} instead of exiting normally.`;
    if (data.suggestMoveOrAdmin) {
      msg +=
        "\n\nIf the install is under Program Files, move it in Settings → Game location or run the launcher as Administrator.";
    }
    return msg;
  }

  // 4) NT status / exit code
  const info = describeWindowsGameExit(data.exitCode);
  let msg = `${info.title}\n\n${info.detail}`;
  if (info.tip) {
    msg += `\n\n${info.tip}`;
  }
  if (data.suggestMoveOrAdmin) {
    msg +=
      "\n\nInstall folder may be protected (e.g. Program Files). Move the game via Settings → Game location, or run the launcher as Administrator.";
  }
  return msg;
}

// Game crash handler - shows crash information and log location
window.api.onGameCrash((data) => {
  console.error("[Game Crash] Crash detected:", data);

  const crashMessage = buildGameCrashToast(data);
  showToast(crashMessage, "error", 12000);
});

// Update the setGameRunning function to properly disable the button
function setGameRunning(running) {
  gameRunning = running;

  if (running) {
    // Set button to running state and disable it
    playButton.textContent = "RUNNING";
    playButton.classList.add("running");
    playButton.disabled = true; // Actually disable the button element

    console.log("Game is now running, button disabled");
  } else {
    // Reset button to normal state and enable it
    playButton.textContent = gameInstalled ? "PLAY" : "DOWNLOAD";
    playButton.classList.remove("running");
    playButton.disabled = false; // Re-enable the button

    console.log("Game is no longer running, button enabled");
  }
}

// DXVK progress handler
window.api.onDxvkProgress((data) => {
  const settingItem = dxvkToggle.closest(".setting-item");
  const label = settingItem.querySelector("label");

  // Update label with progress (don't show toasts here - handled by main toggle handler)
  if (data.step === "download" || data.step === "extract") {
    label.textContent = `DXVK Support ⟳ ${data.status}`;
  } else if (data.step === "complete") {
    label.textContent = "DXVK Support";
  } else if (data.step === "error") {
    label.textContent = "DXVK Support";
  } else {
    label.textContent = `DXVK Support ⟳`;
  }
});

// ─── AHL / GFWL Server Toggle ────────────────────────────────────────────────
const gfwlServerToggle = document.getElementById("gfwlServerToggle");

function syncLauncherServerBadgeFromMode(mode) {
  const liveBtn = document.getElementById("launcherGfwlLiveBadge");
  const ahlBtn = document.getElementById("launcherAhlBadge");
  if (!liveBtn || !ahlBtn) return;
  const isAhl = mode === "ahl";
  liveBtn.hidden = isAhl;
  ahlBtn.hidden = !isAhl;
}

function syncGfwlServerToggleAria() {
  const toggle = document.getElementById("gfwlServerToggle");
  if (!toggle) return;
  toggle.setAttribute("aria-checked", toggle.checked ? "true" : "false");
}

function updateGfwlServerDiagnosticsLabel(mode) {
  const valueEl = document.getElementById("gfwlServerStateValue");
  if (!valueEl) return;
  if (mode === "ahl") {
    valueEl.textContent = "AntHill LIVE (AHL)";
  } else if (mode === "gfwl") {
    valueEl.textContent = "Classic GFWL";
  } else if (mode === "unavailable") {
    valueEl.textContent = "— (set game folder)";
  } else {
    valueEl.textContent = "Not configured yet";
  }
  syncGfwlServerToggleAria();
}

function syncActivationUiFromServerMode(mode) {
  if (!activateButton) return;

  const isAhl = mode === "ahl";

  activateButton.disabled = isAhl;
  activateButton.style.opacity = isAhl ? "0.5" : "1";
  activateButton.style.cursor = isAhl ? "not-allowed" : "pointer";
  activateButton.title = isAhl
    ? "Activation is disabled while AntHill LIVE (AHL) server mode is enabled."
    : "";
}

async function refreshGfwlServerStatus() {
  try {
    const status = await window.api.checkGfwlServer();
    if (gfwlServerToggle) {
      gfwlServerToggle.checked = status.mode === "ahl";
    }
    syncLauncherServerBadgeFromMode(status.mode);
    updateGfwlServerDiagnosticsLabel(status.mode);
    syncActivationUiFromServerMode(status.mode);
    if (
      !isAhlPatchSetIncomplete(status) &&
      ahlHintAlertBar &&
      ahlHintAlertBar.style.display === "block"
    ) {
      hideAhlHintAlertBar();
      persistAhlExistingInstallHintDismissed();
      syncAhlHintAlertStackPosition();
    }
  } catch (error) {
    console.error("Error checking GFWL server status:", error);
    syncLauncherServerBadgeFromMode("gfwl");
    updateGfwlServerDiagnosticsLabel("none");
    syncActivationUiFromServerMode("none");
  }
  syncLauncherServerBadgeInteractable();
}

/** Prevents stacked success toasts when flipping AHL/GFWL rapidly (badges + toggle). */
const GFWL_SERVER_SWITCH_COOLDOWN_MS = 3500;

let gfwlServerSwitchInProgress = false;
let gfwlServerSwitchCooldownUntil = 0;
let gfwlServerSwitchCooldownTimer = null;

function isGfwlServerSwitchCoolingDown() {
  return Date.now() < gfwlServerSwitchCooldownUntil;
}

/** Whole seconds remaining until server-switch cooldown ends (at least 1 while cooling). */
function getGfwlServerSwitchCooldownRemainingSeconds() {
  const ms = gfwlServerSwitchCooldownUntil - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 1000));
}

function scheduleGfwlServerSwitchCooldownUnlock() {
  if (gfwlServerSwitchCooldownTimer) {
    clearTimeout(gfwlServerSwitchCooldownTimer);
  }
  gfwlServerSwitchCooldownTimer = setTimeout(() => {
    gfwlServerSwitchCooldownTimer = null;
    gfwlServerSwitchCooldownUntil = 0;
    if (gfwlServerToggle) {
      gfwlServerToggle.disabled = false;
      gfwlServerToggle.parentElement?.classList.remove("cooldown");
    }
    syncLauncherServerBadgeInteractable();
    void refreshGfwlServerStatus();
  }, GFWL_SERVER_SWITCH_COOLDOWN_MS);
}

async function runGfwlServerToggleFlow(newMode) {
  if (gfwlServerSwitchInProgress) {
    showToast("A server switch is already running.", "warning", 2800);
    await refreshGfwlServerStatus();
    return;
  }
  if (isGfwlServerSwitchCoolingDown()) {
    const secs = getGfwlServerSwitchCooldownRemainingSeconds();
    const remainingMs = Math.max(0, gfwlServerSwitchCooldownUntil - Date.now());
    const waitWord = secs === 1 ? "second" : "seconds";
    showToast(
      `Please wait ${secs} more ${waitWord} before switching server mode again.`,
      "warning",
      Math.min(5500, Math.max(2200, remainingMs + 700)),
    );
    await refreshGfwlServerStatus();
    return;
  }

  gfwlServerSwitchInProgress = true;

  syncLauncherServerBadgeFromMode(newMode);
  updateGfwlServerDiagnosticsLabel(newMode);
  syncActivationUiFromServerMode(newMode);
  if (gfwlServerToggle) {
    gfwlServerToggle.checked = newMode === "ahl";
  }

  if (gfwlServerToggle) gfwlServerToggle.disabled = true;
  const liveBadge = document.getElementById("launcherGfwlLiveBadge");
  const ahlBadge = document.getElementById("launcherAhlBadge");
  for (const el of [liveBadge, ahlBadge]) {
    if (el) {
      el.disabled = true;
      el.style.opacity = "0.7";
      el.style.cursor = "wait";
    }
  }

  const feedback = document.getElementById("gfwlServerFeedback");
  const statusEl = document.getElementById("gfwlServerStatus");
  if (feedback) feedback.style.display = "block";
  if (statusEl) {
    statusEl.textContent =
      newMode === "ahl"
        ? "Switching to AntHill LIVE…"
        : "Switching to classic GFWL…";
  }

  try {
    const result = await window.api.toggleGfwlServer(newMode);

    if (result.success) {
      showToast(result.message, "success", 5500);
    } else {
      const revertMode = newMode === "ahl" ? "gfwl" : "ahl";
      syncLauncherServerBadgeFromMode(revertMode);
      updateGfwlServerDiagnosticsLabel(revertMode);
      syncActivationUiFromServerMode(revertMode);
      if (gfwlServerToggle) {
        gfwlServerToggle.checked = revertMode === "ahl";
      }
      showToast(
        result.message || "Failed to switch server configuration.",
        "error",
        6000,
      );
    }
  } catch (error) {
    console.error("Error toggling GFWL server:", error);
    const revertMode = newMode === "ahl" ? "gfwl" : "ahl";
    syncLauncherServerBadgeFromMode(revertMode);
    updateGfwlServerDiagnosticsLabel(revertMode);
    syncActivationUiFromServerMode(revertMode);
    if (gfwlServerToggle) {
      gfwlServerToggle.checked = revertMode === "ahl";
    }
    showToast(
      `Server toggle failed: ${error.message || "Unknown error"}. Please try again.`,
      "error",
      6000,
    );
  } finally {
    gfwlServerSwitchInProgress = false;
    if (feedback) feedback.style.display = "none";

    gfwlServerSwitchCooldownUntil = Date.now() + GFWL_SERVER_SWITCH_COOLDOWN_MS;

    if (gfwlServerToggle) {
      gfwlServerToggle.disabled = true;
      gfwlServerToggle.parentElement?.classList.add("cooldown");
    }
    for (const el of [liveBadge, ahlBadge]) {
      if (el) {
        el.disabled = true;
        el.style.opacity = "0.5";
        el.style.cursor = "not-allowed";
      }
    }

    scheduleGfwlServerSwitchCooldownUnlock();
    void refreshGfwlServerStatus();
  }
}

if (gfwlServerToggle) {
  gfwlServerToggle.addEventListener("change", async () => {
    const newMode = gfwlServerToggle.checked ? "ahl" : "gfwl";
    await runGfwlServerToggleFlow(newMode);
  });
}

const launcherGfwlLiveBadge = document.getElementById("launcherGfwlLiveBadge");
const launcherAhlBadge = document.getElementById("launcherAhlBadge");

if (launcherGfwlLiveBadge) {
  launcherGfwlLiveBadge.addEventListener("click", async () => {
    if (launcherGfwlLiveBadge.disabled) return;
    const ok = await showServerSwitchConfirmDialog("ahl");
    if (!ok) return;
    await runGfwlServerToggleFlow("ahl");
  });
}

if (launcherAhlBadge) {
  launcherAhlBadge.addEventListener("click", async () => {
    if (launcherAhlBadge.disabled) return;
    const ok = await showServerSwitchConfirmDialog("gfwl");
    if (!ok) return;
    await runGfwlServerToggleFlow("gfwl");
  });
}

// AHL progress push events (download / extract progress from main process)
window.api.onAhlProgress((data) => {
  const statusEl = document.getElementById("gfwlServerStatus");
  const feedback = document.getElementById("gfwlServerFeedback");
  if (!statusEl) return;

  if (data.step === "download" || data.step === "extract") {
    if (feedback) feedback.style.display = "block";
    statusEl.textContent = data.status;
  } else if (data.step === "complete") {
    if (feedback) feedback.style.display = "none";
  } else if (data.step === "error") {
    statusEl.textContent = `Error: ${data.status}`;
  }
});

// ============================================================
// ============================================================
// CHANGELOG VIEWER
// ============================================================

// Function to fetch and display changelog
async function loadChangelog() {
  try {
    changelogContent.innerHTML = `
      <div style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.5);">
        Loading changelog...
      </div>
    `;

    // Try IPC first (reads from local file or bundled resource)
    let changelog = null;
    let changelogSource = "unknown";

    try {
      const result = await window.api.getChangelog();
      if (result.success) {
        changelog = result.data;
        changelogSource = result.source;
        console.log(`[Changelog] Loaded from ${changelogSource}`);
      }
    } catch (ipcError) {
      console.log("[Changelog] IPC failed, trying server...");
    }

    // If IPC fails, try server as fallback
    if (!changelog) {
      try {
        const serverResponse = await fetch(
          "https://downloads.shadowrunfps.com/launcher/changelog.json",
        );
        if (serverResponse.ok) {
          changelog = await serverResponse.json();
          changelogSource = "server";
          console.log("[Changelog] Loaded from server");
        }
      } catch (serverError) {
        console.log("[Changelog] Server not available");
      }
    }

    // If no changelog found
    if (!changelog || Object.keys(changelog).length === 0) {
      changelogContent.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255, 255, 255, 0.5);">
          <p style="font-size: 48px; margin-bottom: 16px;">📝</p>
          <p style="font-size: 16px; margin-bottom: 8px;">No changelog available</p>
          <p style="font-size: 12px; color: rgba(255, 255, 255, 0.3);">
            Check back after the next update!
          </p>
        </div>
      `;
      return;
    }

    // Sort versions by semantic version (newest first)
    // Handles variable-length versions like 0.9.9 vs 0.9.91
    const versions = Object.keys(changelog).sort((a, b) => {
      const aParts = a.split(".").map(Number);
      const bParts = b.split(".").map(Number);

      // Compare up to the maximum length of either version
      const maxLength = Math.max(aParts.length, bParts.length);

      for (let i = 0; i < maxLength; i++) {
        const aPart = aParts[i] || 0; // Default to 0 if part doesn't exist
        const bPart = bParts[i] || 0;

        if (aPart !== bPart) {
          return bPart - aPart; // Descending order (newest first)
        }
      }
      return 0;
    });

    // Limit to last 5 versions
    const recentVersions = versions.slice(0, 5);

    // Build HTML
    let html = "";

    recentVersions.forEach((version, index) => {
      const entry = changelog[version];
      const isLatest = index === 0;

      html += `
        <div style="margin-bottom: 24px; padding-bottom: 24px; ${
          index < recentVersions.length - 1
            ? "border-bottom: 1px solid rgba(255, 255, 255, 0.1);"
            : ""
        }">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <h3 style="font-size: 18px; font-weight: 600; color: #60a5fa; margin: 0;">
              v${entry.version}
            </h3>
            ${
              isLatest
                ? '<span style="background: #10b981; color: white; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500;">LATEST</span>'
                : ""
            }
            <span style="color: rgba(255, 255, 255, 0.4); font-size: 12px; margin-left: auto;">
              ${entry.date}
            </span>
          </div>
          <div style="font-size: 13px; line-height: 1.8;">
      `;

      const formatChangelogInline = (text) =>
        text.replace(
          /\*\*([^*]+)\*\*/g,
          '<strong style="color: #60a5fa;">$1</strong>',
        );

      const escapeChangelogPlain = (s) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      /** Group `**Category:** body` notes so each category shows once with multiple line items. */
      const categoryNoteRegex = /^\*\*([^*]+)\*\*:\s*(.+)$/;
      const groups = [];
      for (const note of entry.notes) {
        const m = note.match(categoryNoteRegex);
        if (m) {
          const category = m[1];
          const itemBody = m[2].trim();
          const prev = groups[groups.length - 1];
          if (prev && prev.category === category) {
            prev.items.push(itemBody);
          } else {
            groups.push({ category, items: [itemBody] });
          }
        } else {
          groups.push({ category: null, items: [note] });
        }
      }

      for (const group of groups) {
        if (group.category) {
          html += `
            <div style="margin-bottom: 14px;">
              <div style="font-size: 13px; font-weight: 600; color: #60a5fa; margin-bottom: 6px;">
                ${escapeChangelogPlain(group.category)}
              </div>
              <ul style="list-style: none; padding: 0; margin: 0;">
          `;
          for (const item of group.items) {
            html += `
                <li style="margin-bottom: 6px; color: rgba(255, 255, 255, 0.85); padding-left: 18px; position: relative;">
                  <span style="position: absolute; left: 0; color: #60a5fa;">•</span>
                  ${formatChangelogInline(item)}
                </li>
            `;
          }
          html += `
              </ul>
            </div>
          `;
        } else {
          for (const raw of group.items) {
            const dashIndex = raw.indexOf(" - ");
            if (dashIndex > 0) {
              const title = raw.substring(0, dashIndex).trim();
              const description = raw.substring(dashIndex + 3).trim();
              html += `
            <div style="margin-bottom: 10px; color: rgba(255, 255, 255, 0.8); padding-left: 18px; position: relative;">
              <span style="position: absolute; left: 0; color: #60a5fa;">•</span>
              <div style="margin-bottom: 2px;">${formatChangelogInline(title)}</div>
              <div style="padding-left: 16px; color: rgba(255, 255, 255, 0.6); font-size: 12px; line-height: 1.5;">
                ${formatChangelogInline(description)}
              </div>
            </div>
              `;
            } else {
              html += `
            <div style="margin-bottom: 8px; color: rgba(255, 255, 255, 0.8); padding-left: 18px; position: relative;">
              <span style="position: absolute; left: 0; color: #60a5fa;">•</span>
              ${formatChangelogInline(raw)}
            </div>
              `;
            }
          }
        }
      }

      html += `
          </div>
        </div>
      `;
    });

    // Add footer note if there are more versions
    if (versions.length > 5) {
      html += `
        <div style="text-align: center; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.4); font-size: 12px;">
          Showing ${recentVersions.length} of ${versions.length} versions
        </div>
      `;
    }

    changelogContent.innerHTML = html;
  } catch (error) {
    console.error("Error loading changelog:", error);
    changelogContent.innerHTML = `
      <div style="text-align: center; padding: 40px; color: rgba(220, 38, 38, 0.8);">
        <p style="font-size: 48px; margin-bottom: 16px;">⚠️</p>
        <p style="font-size: 16px; margin-bottom: 8px;">Failed to load changelog</p>
        <p style="font-size: 12px; color: rgba(255, 255, 255, 0.3);">
          ${error.message}
        </p>
      </div>
    `;
  }
}

// Event listeners
if (viewChangelogLink && changelogScreen && closeChangelogButton) {
  viewChangelogLink.addEventListener("click", (e) => {
    e.preventDefault();
    changelogScreen.classList.add("visible");
    loadChangelog();
  });

  closeChangelogButton.addEventListener("click", () => {
    changelogScreen.classList.remove("visible");
  });

  // Close on background click
  changelogScreen.addEventListener("click", (e) => {
    if (e.target === changelogScreen) {
      changelogScreen.classList.remove("visible");
    }
  });
}

// Update the skip intro progress handler to auto-close without a button
window.api.onSkipIntroProgress((data) => {
  if (!skipIntroProgress.classList.contains("visible")) {
    skipIntroProgress.classList.add("visible");
  }

  skipIntroStatus.textContent = data.status;
  skipIntroProgressBar.style.width = `${data.progress}%`;

  // Show error if needed
  if (data.error) {
    // Create or update error message
    let errorElement = skipIntroProgress.querySelector(".error-message");
    if (!errorElement) {
      errorElement = document.createElement("div");
      errorElement.className = "error-message";
      skipIntroProgress.appendChild(errorElement);
    }
    errorElement.textContent = data.error;
    skipIntroProgressBar.style.backgroundColor = "rgba(220, 38, 38, 0.7)";
  }

  // Remove files modified list display
  const existingList = skipIntroProgress.querySelector(".modified-files-list");
  if (existingList) {
    existingList.remove();
  }

  // If process completed or errored, automatically hide progress after delay
  if (data.step === "complete" || data.step === "error") {
    setTimeout(() => {
      skipIntroButton.disabled = false;
      // Don't remove processing class since we're not adding it anymore

      // Auto-hide the progress after completion (no close button)
      if (!data.error) {
        // Only auto-close if there was no error
        skipIntroProgress.classList.remove("visible");
        skipIntroProgressBar.style.backgroundColor = "rgba(59, 130, 246, 0.8)";
      }
    }, 1500); // Give a bit more time to see the completion
  }
});

// Add this to listen for the final state
window.api.onSkipIntroFinalState((state) => {
  updateSkipIntroButtonState(state.installed);
});

// REMOVED - This was using ipcRenderer directly which caused errors
// The skip intro functionality works fine without this listener
// (Line 919 error fixed)

/* OLD CODE REMOVED - CAUSED ipcRenderer ERROR:
ipcRenderer.on("skip-intro-final-state", (event, state) => {
  ...code removed...
});
*/

// Re-check game installation when window regains focus (catches renamed/moved folders)
window.addEventListener("focus", async () => {
  if (gameInstalled || gameFilesLocated) {
    console.log("[Window Focus] Re-checking game installation status...");
    const checkResult = await window.api.checkGameInstalled();
    if (!checkResult.dependencies?.gameFiles) {
      console.warn("[Window Focus] Game files no longer found, updating UI");
      gameInstalled = false;
      gameFilesLocated = false;
      updateUI();
      showToast(
        "Game files not found. Please browse for your game folder in Settings.",
        "error",
        5000,
      );
    } else {
      applyInstallationCheckResult(checkResult);
      updateUI();
    }
  }

  checkPersistentIssues();
});

// Function to check for persistent issues and display alert
async function checkPersistentIssues() {
  try {
    const result = await window.api.checkPersistentIssues();

    if (result.hasIssues && result.issues.length > 0) {
      // Store issues globally for popup
      currentIssues = result.issues;

      // Determine severity (error > warning)
      const hasError = result.issues.some(
        (issue) => issue.severity === "error",
      );
      const severity = hasError ? "error" : "warning";

      // Build message - more compact format for multiple issues
      let message;

      if (result.issues.length === 1) {
        // Single issue: show full message, hide count badge
        message = result.issues[0].message;
        if (errorAlertCount) {
          errorAlertCount.style.display = "none";
        }
      } else {
        // Multiple issues: show first issue + count badge
        message = result.issues[0].message;
        if (errorAlertCount) {
          errorAlertCount.textContent = result.issues.length;
          errorAlertCount.style.display = "block";
        }
      }

      // Show alert bar (only if stacked alerts aren't visible)
      if (errorAlertBar && errorAlertMessage && !window.stackedAlerts?.length) {
        errorAlertMessage.textContent = message;
        errorAlertBar.className = `error-alert-bar ${severity}`;
        errorAlertBar.style.display = "block";
      }

      syncAhlHintAlertStackPosition();

      if (errorAlertFix) {
        errorAlertFix.title =
          result.issues[0]?.type === "vcredist"
            ? "Download and install Microsoft Visual C++ v14 Redistributable (x86)"
            : "Open Diagnostics";
      }
    } else {
      // Hide alert bar if no issues
      currentIssues = [];
      hideStackedErrorAlerts();
      if (errorAlertBar) {
        errorAlertBar.style.display = "none";
      }
      syncAhlHintAlertStackPosition();
    }
  } catch (error) {
    console.error("[Persistent Issues] Error checking issues:", error);
  }
}

// Show stacked error alerts (instead of popup)
function showStackedErrorAlerts() {
  if (!currentIssues || currentIssues.length <= 1) return;

  // Hide the main alert temporarily
  if (errorAlertBar) {
    errorAlertBar.style.display = "none";
  }

  // Calculate the width needed for the longest message
  const maxWidth = Math.max(
    ...currentIssues.map((issue) => {
      // Rough estimate: 7px per character + padding
      return Math.min(issue.message.length * 7 + 100, 600);
    }),
    350, // Minimum width
  );

  // Create stacked alerts for each issue
  const alerts = [];
  currentIssues.forEach((issue, index) => {
    const hasError = currentIssues.some((i) => i.severity === "error");
    const severity = hasError ? "error" : "warning";

    const alert = document.createElement("div");
    alert.className = `error-alert-bar ${severity} stacked-alert`;
    alert.style.bottom = `${8 + index * 50}px`; // Stack them vertically
    alert.style.zIndex = 999 + index;
    alert.style.minWidth = `${maxWidth}px`; // Set consistent width
    alert.style.maxWidth = "600px";

    alert.innerHTML = `
      <div class="error-alert-content">
        <span class="error-alert-icon">⚠️</span>
        <span class="error-alert-message">${issue.message}</span>
        <button class="error-alert-fix" title="${
          issue.type === "vcredist"
            ? "Download & install Microsoft Visual C++ v14 (x86)"
            : "Open Diagnostics"
        }">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
          </svg>
        </button>
        <button class="error-alert-dismiss stacked-dismiss" title="Dismiss">×</button>
      </div>
    `;

    // Add fix button handler
    const fixBtn = alert.querySelector(".error-alert-fix");
    if (fixBtn) {
      fixBtn.addEventListener("click", async () => {
        hideStackedErrorAlerts();
        if (issue.type === "vcredist") {
          await installVcRedistFromAlert();
          return;
        }
        openDiagnosticsAndScrollToIssue();

        const diagnosticsScreen = document.getElementById("diagnosticsScreen");
        if (diagnosticsScreen) {
          await loadCurrentGamePath();
          detectAndDisplaySystemInfo(false);
        }
      });
    }

    // Add dismiss handler
    const dismissBtn = alert.querySelector(".stacked-dismiss");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        hideStackedErrorAlerts();
      });
    }

    document.body.appendChild(alert);
    alerts.push(alert);
  });

  // Store alerts for cleanup
  window.stackedAlerts = alerts;
  syncAhlHintAlertStackPosition();
}

// Hide stacked error alerts
function hideStackedErrorAlerts() {
  if (window.stackedAlerts) {
    window.stackedAlerts.forEach((alert) => {
      if (alert.parentNode) {
        alert.parentNode.removeChild(alert);
      }
    });
    window.stackedAlerts = [];
  }

  // Show main alert again
  if (errorAlertBar && currentIssues && currentIssues.length > 0) {
    errorAlertBar.style.display = "block";
  }
  syncAhlHintAlertStackPosition();
}

function openDiagnosticsAndScrollToIssue() {
  const diagnosticsScreen = document.getElementById("diagnosticsScreen");
  if (!diagnosticsScreen) return;

  diagnosticsScreen.classList.add("visible");
  syncDiagnosticsAudioVolumeSlider();

  const settingsContent = diagnosticsScreen.querySelector(".settings-content");
  if (!settingsContent) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      settingsContent.scrollTop = 0;
    });
  });
}

function runFixForIssueType() {
  openDiagnosticsAndScrollToIssue();
}

// Count badge click handler - show stacked alerts
if (errorAlertCount) {
  errorAlertCount.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentIssues && currentIssues.length > 1) {
      showStackedErrorAlerts();
    }
  });
}

// Fix button click handler — VC++ missing runs install flow; otherwise opens diagnostics
if (errorAlertFix) {
  errorAlertFix.addEventListener("click", async () => {
    hideStackedErrorAlerts();
    const primary = currentIssues && currentIssues[0];
    if (primary && primary.type === "vcredist") {
      await installVcRedistFromAlert();
      return;
    }

    openDiagnosticsAndScrollToIssue();

    const diagnosticsScreen = document.getElementById("diagnosticsScreen");
    if (diagnosticsScreen) {
      await loadCurrentGamePath();
      detectAndDisplaySystemInfo(false);
    }
  });
}

// Dismiss button handler
if (errorAlertDismiss) {
  errorAlertDismiss.addEventListener("click", () => {
    if (errorAlertBar) {
      errorAlertBar.style.display = "none";
    }
    syncAhlHintAlertStackPosition();
  });
}

function syncAhlHintAlertStackPosition() {
  if (!ahlHintAlertBar || ahlHintAlertBar.style.display === "none") {
    return;
  }
  const primaryVisible =
    errorAlertBar && errorAlertBar.style.display === "block";
  ahlHintAlertBar.style.bottom = primaryVisible ? "52px" : "8px";
}

function hideAhlHintAlertBar() {
  if (ahlHintAlertBar) {
    ahlHintAlertBar.style.display = "none";
    ahlHintAlertBar.style.bottom = "8px";
  }
}

if (ahlHintAlertFix) {
  ahlHintAlertFix.addEventListener("click", async () => {
    hideAhlHintAlertBar();
    persistAhlExistingInstallHintDismissed();
    openDiagnosticsAndScrollToIssue();
    const diagnosticsScreen = document.getElementById("diagnosticsScreen");
    if (diagnosticsScreen) {
      await loadCurrentGamePath();
      detectAndDisplaySystemInfo(false);
    }
    syncAhlHintAlertStackPosition();
  });
}

if (ahlHintAlertDismiss) {
  ahlHintAlertDismiss.addEventListener("click", () => {
    hideAhlHintAlertBar();
    persistAhlExistingInstallHintDismissed();
    syncAhlHintAlertStackPosition();
  });
}

// Keep this block (replaces your current DOMContentLoaded block)
document.addEventListener("DOMContentLoaded", function () {
  console.log("[Renderer] DOMContentLoaded fired.");

  refreshGfwlServerStatus();

  // Check for persistent issues on load
  checkPersistentIssues();

  // Check for persistent issues periodically (every 30 seconds)
  setInterval(() => {
    checkPersistentIssues();
  }, 30000);
  const openGameDirButton = document.getElementById("openGameDirButton");

  if (openGameDirButton) {
    console.log("Found Open Game Dir button!");

    openGameDirButton.addEventListener("click", async function () {
      console.log("Button clicked!");

      // If no game files at configured path, browse for existing game instead
      if (!gameFilesLocated) {
        try {
          openGameDirButton.disabled = true;
          openGameDirButton.textContent = "Searching...";

          const result = await window.api.browseForExistingGame();

          if (result.success) {
            showToast(
              "✓ Game found! Shadowrun.exe detected in selected folder.",
              "success",
              3000,
            );
            tryShowAhlMissingHintAfterExistingBrowse();
            // The game-installation-status event will be triggered automatically
            // which will update the UI
          } else if (!result.canceled) {
            showToast(
              result.error ||
                "Shadowrun.exe not found in selected folder. Please select the folder containing Shadowrun.exe",
              "error",
              5000,
            );
          }

          openGameDirButton.disabled = false;
          // Button text will be updated by updateUI() when game-installation-status event fires
        } catch (error) {
          console.error("[Browse Game] Error:", error);
          showToast(
            `Failed to browse for game folder: ${
              error.message || "Unknown error"
            }. Please try selecting the folder manually.`,
            "error",
            5000,
          );
          openGameDirButton.disabled = false;
          openGameDirButton.textContent = "Find Existing Game";
        }
        return;
      }

      // If game is installed, open the game directory
      // Simplified approach - just call the API directly
      if (window.api && window.api.openGameDirectory) {
        console.log("Calling openGameDirectory API");
        window.api
          .openGameDirectory()
          .then((result) => {
            console.log("API call result:", result);
            if (!result.success) {
              console.error("Error:", result.error);
            }
          })
          .catch((err) => {
            console.error("API call error:", err);
          });
      } else {
        console.error("API method not available");
      }
    });
  } else {
    console.error("Button not found!");
  }

  const backupPcidButton = document.getElementById("backupPcidButton");
  if (backupPcidButton) {
    console.log("[Renderer] PCID Backup button element found in DOM.");
    // We are relying on the inline onclick, so no need to add another listener here for this test.
  } else {
    console.error("[Renderer] BackupPcidButton element NOT found in DOM!");
  }
});

// If needed, use this as a global fallback
window.openFolder = function () {
  console.log("Global open folder called");
  alert("Opening folder via global method");
  if (window.api && window.api.openGameDirectory) {
    window.api.openGameDirectory();
  }
};

// PCID Backup button is handled by the function defined at the top of this file

// Add this testing function at the end of your file
console.log("Adding testing functions to window...");

// Simple test function accessible from console
window.testIpcDirectly = async function () {
  try {
    console.log("Testing IPC directly from console...");
    const result = await window.api.pingMain();
    console.log("Ping result:", result);
    return result;
  } catch (error) {
    console.error("Error testing IPC:", error);
    return { success: false, error: error.message };
  }
};

// Also make all API functions directly accessible for testing
window.apiTest = {
  getCurrentPcid: async function () {
    try {
      return await window.api.getCurrentPcid();
    } catch (e) {
      console.error("Error calling getCurrentPcid:", e);
      return { success: false, error: e.message };
    }
  },
  backupPcid: async function () {
    try {
      return await window.api.backupPcid();
    } catch (e) {
      console.error("Error calling backupPcid:", e);
      return { success: false, error: e.message };
    }
  },
};

console.log(
  "Test functions added - you can run window.testIpcDirectly() in the console",
);

// ========================================
// LAUNCHER UPDATE UI HANDLERS
// ========================================

// Get launcher update UI elements (OLD CODE - WILL BE REPLACED)
const launcherUpdateProgressScreen = document.getElementById(
  "launcherUpdateProgressScreen",
);
const launcherUpdateProgress = document.getElementById(
  "launcherUpdateProgress",
);
const launcherUpdateStatus = document.getElementById("launcherUpdateStatus");
const launcherUpdateDetails = document.getElementById("launcherUpdateDetails");
const launcherUpdateMessage = document.getElementById("launcherUpdateMessage");

// Listen for update download started
window.api.onUpdateDownloadStarted(() => {
  console.log("[Renderer] Update download started");
  if (launcherUpdateProgressScreen) {
    launcherUpdateProgressScreen.style.display = "flex";
    launcherUpdateProgress.style.width = "0%";
    launcherUpdateStatus.textContent = "Starting download...";
    launcherUpdateDetails.textContent = "";
    launcherUpdateMessage.textContent =
      "Downloading launcher update. Launcher will restart in a moment to complete the update.";
  }
});

// Listen for update download progress
window.api.onUpdateDownloadProgress((progress) => {
  const percent = Math.max(0, Math.min(100, Number(progress?.percent ?? 0)));
  console.log(`[Renderer] Update download progress: ${percent}%`);

  // Update modal progress bar (if modal exists and isn't explicitly hidden).
  // Some CSS may control layout; don't rely on style.display === "flex".
  if (
    launcherUpdateProgressScreen &&
    launcherUpdateProgressScreen.style.display !== "none"
  ) {
    if (launcherUpdateProgress) {
      launcherUpdateProgress.style.width = `${percent}%`;
    }
    if (launcherUpdateStatus) {
      launcherUpdateStatus.textContent = `Downloading... ${Math.round(percent)}%`;
    }
    if (launcherUpdateDetails) {
      const transferredMB = (
        (progress?.transferred || 0) /
        1024 /
        1024
      ).toFixed(2);
      const totalMB = ((progress?.total || 0) / 1024 / 1024).toFixed(2);
      if (progress?.total && progress.total > 0) {
        launcherUpdateDetails.textContent = `${transferredMB} MB / ${totalMB} MB`;
      } else {
        launcherUpdateDetails.textContent = `${transferredMB} MB`;
      }
    }
  }

  // Show or update a progress toast
  if (!updateToastId) {
    updateToastId = showUpdateToast(
      `Downloading update... ${Math.round(percent)}%`,
      "info",
      0,
      true,
    );
  } else {
    const messageEl = updateToastId.querySelector(".toast-message");
    const progressFill = updateToastId.querySelector(".toast-progress-fill");
    if (messageEl) {
      messageEl.textContent = `Downloading update... ${Math.round(percent)}%`;
    }
    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }
  }
});

// Listen for update download complete
window.api.onUpdateDownloadComplete(() => {
  console.log("[Renderer] Update download complete");
  if (launcherUpdateProgress) {
    launcherUpdateProgress.style.width = "100%";
  }
  if (launcherUpdateStatus) {
    launcherUpdateStatus.textContent = "Download complete!";
  }
  if (launcherUpdateMessage) {
    launcherUpdateMessage.textContent =
      "Update downloaded successfully. You'll be prompted to restart.";
  }

  // Remove the progress toast
  if (updateToastId) {
    updateToastId.classList.remove("show");
    setTimeout(() => {
      if (updateToastId && updateToastId.parentNode) {
        updateToastId.remove();
      }
      updateToastId = null;
    }, 300);
  }

  // Hide the progress screen after 2 seconds (dialog will show instead)
  setTimeout(() => {
    if (launcherUpdateProgressScreen) {
      launcherUpdateProgressScreen.style.display = "none";
    }
  }, 2000);
});

// ========================================
// SILENT UPDATE HANDLERS (Background Updates)
// ========================================

// Get update dialog elements
const updateDialog = document.getElementById("updateDialog");
const updateCurrentVersion = document.getElementById("updateCurrentVersion");
const updateNewVersion = document.getElementById("updateNewVersion");
const updateDescription = document.getElementById("updateDescription");
const updateReleaseNotes = document.getElementById("updateReleaseNotes");
const updateLaterButton = document.getElementById("updateLaterButton");
const updateDownloadButton = document.getElementById("updateDownloadButton");
const updateAvailableIndicator = document.getElementById(
  "updateAvailableIndicator",
);

// Store pending update data
let pendingUpdateData = null;
let updateToastId = null; // Track the update progress toast

// Populated on startup from main via getLauncherRuntimeInfo()
let isPortableBuild = false;
let portableDownloadUrl = null;

// Silent update handler removed - all updates now require user confirmation
// (This handler is no longer used as automatic downloading is disabled)

// Listen for update available (both manual and automatic checks)
window.api.onShowUpdateDialog((data) => {
  console.log("");
  console.log("=================================================");
  console.log("🎮 UPDATE AVAILABLE!");
  console.log("=================================================");
  console.log("[Renderer] Update found and dialog opening");
  console.log("[Renderer] Current version:", data.currentVersion);
  console.log("[Renderer] New version:", data.version);
  console.log("[Renderer] Time:", new Date().toLocaleTimeString());

  // Store update data for later use
  pendingUpdateData = data;

  // Update dialog content
  if (updateCurrentVersion) {
    updateCurrentVersion.textContent = data.currentVersion;
  }
  if (updateNewVersion) {
    updateNewVersion.textContent = data.version;
  }

  // Update release notes if available
  if (updateReleaseNotes && data.releaseNotes) {
    updateReleaseNotes.textContent = data.releaseNotes;
    updateReleaseNotes.style.display = "block";
  } else if (updateReleaseNotes) {
    updateReleaseNotes.style.display = "none";
  }

  // Show the update badge immediately (in case user closes dialog)
  if (updateAvailableIndicator) {
    updateAvailableIndicator.style.display = "block";
    console.log("[Renderer] Update badge shown");
  }

  // Show the dialog
  if (updateDialog) {
    updateDialog.classList.add("visible");
  }
});

// Portable build: server found a newer version — show informational notice only.
// No NSIS installer download will be started regardless of what the user clicks.
window.api.onPortableUpdateAvailable((data) => {
  pendingUpdateData = data;

  // Always show the header badge so users can find the notice later
  if (updateAvailableIndicator) {
    updateAvailableIndicator.style.display = "block";
  }

  if (data.isManual) {
    // Manual check — show the informational dialog right away
    showPortableUpdateDialog(data);
  } else {
    // Automatic startup check — just a non-blocking toast
    showToast(
      `v${data.version} is available! Click "Update Available" to download the new portable launcher.`,
      "info",
      8000,
    );
  }
});

// Informational-only update dialog for portable builds.
// Replaces the NSIS install flow with a direct browser download link.
function showPortableUpdateDialog(data) {
  if (!updateDialog) return;

  const dialogHeader = updateDialog.querySelector(
    ".update-dialog-header h2, h2",
  );
  const descEl = updateDialog.querySelector(".update-description");
  const actionsEl = updateDialog.querySelector(".update-dialog-actions");

  if (dialogHeader) dialogHeader.textContent = "Update Available";
  if (updateCurrentVersion)
    updateCurrentVersion.textContent = data.currentVersion;
  if (updateNewVersion) updateNewVersion.textContent = data.version;

  if (descEl) {
    descEl.innerHTML = `
      <p style="margin-bottom:12px;">
        <strong>v${data.version}</strong> is available for download.
      </p>
      <p style="font-size:13px; color:#9ca3af; margin-bottom:8px;">
        You're running the <strong>portable</strong> launcher. To update, download
        the new <code>.exe</code> and replace your current file.
      </p>
      <p style="font-size:12px; color:#6b7280; margin-bottom:8px; line-height:1.45;">
        Want updates installed automatically inside the app next time? Grab the
        <strong>Setup</strong> installer from
        <a href="#" id="portableUpdateWebsiteLink" style="color:#93c5fd;">shadowrunfps.com</a>
        instead of the portable download.
      </p>
      ${
        data.releaseNotes
          ? `<p style="font-size:13px; color:#9ca3af;">${data.releaseNotes}</p>`
          : ""
      }
    `;
    const portableSiteLink = descEl.querySelector("#portableUpdateWebsiteLink");
    if (portableSiteLink) {
      portableSiteLink.addEventListener("click", (e) => {
        e.preventDefault();
        window.api.openExternal("https://www.shadowrunfps.com/download");
      });
    }
  }

  if (actionsEl) {
    actionsEl.innerHTML = "";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "update-button primary";
    downloadBtn.textContent = "Download Latest Portable .exe";
    downloadBtn.onclick = () => {
      const url = data.manualDownloadUrl || portableDownloadUrl;
      if (url) window.api.openExternal(url);
      showToast("Opening download in your browser...", "info", 3000);
      updateDialog.classList.remove("visible");
    };

    const laterBtn = document.createElement("button");
    laterBtn.className = "update-button secondary";
    laterBtn.textContent = "Later";
    laterBtn.onclick = () => updateDialog.classList.remove("visible");

    actionsEl.appendChild(laterBtn);
    actionsEl.appendChild(downloadBtn);
    actionsEl.style.display = "flex";
  }

  updateDialog.classList.add("visible");
}

// Listen for no update available
window.api.onUpdateNotAvailable((data) => {
  console.log("");
  console.log("=================================================");
  console.log("✅ NO UPDATE AVAILABLE");
  console.log("=================================================");
  console.log("[Renderer] You're already on the latest version");
  console.log("[Renderer] Current version:", data.version || "Unknown");
  console.log("[Renderer] Time:", new Date().toLocaleTimeString());

  // Show success toast
  showToast("You're on the latest version!", "success", 4000);

  console.log("");
  console.log("=================================================");
  console.log("");
});

// Rollback Dialog Handlers
const rollbackDialog = document.getElementById("rollbackDialog");
const rollbackCurrentVersion = document.getElementById(
  "rollbackCurrentVersion",
);
const rollbackTargetVersion = document.getElementById("rollbackTargetVersion");
const rollbackReason = document.getElementById("rollbackReason");
const rollbackDownloadButton = document.getElementById(
  "rollbackDownloadButton",
);
const rollbackLaterButton = document.getElementById("rollbackLaterButton");
const rollbackProgress = document.getElementById("rollbackProgress");
const rollbackProgressFill = document.getElementById("rollbackProgressFill");
const rollbackProgressText = document.getElementById("rollbackProgressText");

let pendingRollbackData = null;

window.api.onShowRollbackDialog((data) => {
  // Store rollback data
  pendingRollbackData = data;
  console.log("[Renderer] Rollback dialog data received:", data);

  // Update dialog content
  if (rollbackCurrentVersion) {
    rollbackCurrentVersion.textContent = data.currentVersion;
  }
  if (rollbackTargetVersion) {
    rollbackTargetVersion.textContent = data.targetVersion;
  }
  if (rollbackReason) {
    rollbackReason.textContent =
      data.reason ||
      "A critical issue was found. Please rollback to a stable version.";
  }

  // Show the dialog
  if (rollbackDialog) {
    rollbackDialog.classList.add("visible");
  }

  // (OLD CODE REMOVED - Button will be recreated)

  // Show update available link
  if (updateAvailableLink) {
    updateAvailableLink.style.display = "inline-block";
    updateAvailableLink.onclick = (e) => {
      e.preventDefault();
      rollbackDialog.classList.add("visible");
    };
  }
});

// Rollback download confirmation
if (rollbackDownloadButton) {
  rollbackDownloadButton.addEventListener("click", async () => {
    if (!pendingRollbackData) {
      console.error("[Renderer] No rollback data available");
      return;
    }

    console.log("[Renderer] User confirmed rollback download");

    // Disable button and show progress
    rollbackDownloadButton.disabled = true;
    if (rollbackProgress) {
      rollbackProgress.style.display = "block";
    }

    try {
      await window.api.confirmRollbackDownload(pendingRollbackData.downloadUrl);
      // App will quit after download completes
    } catch (error) {
      console.error("[Renderer] Rollback download error:", error);
      rollbackDownloadButton.disabled = false;
      if (rollbackProgressText) {
        rollbackProgressText.textContent = "Download failed. Please try again.";
        rollbackProgressText.style.color = "#ef4444";
      }
    }
  });
}

// Rollback later button
if (rollbackLaterButton) {
  rollbackLaterButton.addEventListener("click", () => {
    console.log("[Renderer] User chose to rollback later");
    if (rollbackDialog) {
      rollbackDialog.classList.remove("visible");
    }
    // Keep the update available link visible
  });
}

// Listen for rollback download progress
window.api.onRollbackDownloadProgress((progress) => {
  console.log("[Renderer] Rollback download progress:", progress);
  if (rollbackProgressFill) {
    rollbackProgressFill.style.width = `${progress}%`;
  }
  if (rollbackProgressText) {
    rollbackProgressText.textContent = `Downloading: ${Math.round(progress)}%`;
  }
});

// Fallback: dev mode live version fetch failed (network issue, etc.)
window.api.onUpdateCheckDevMode(() => {
  console.log("[Renderer] Dev mode update check could not reach the server");
  showToast(
    "Could not reach update server. Check your internet connection.",
    "error",
    5000,
  );
});

// ========================================
// UPDATE DOWNLOAD PROGRESS HANDLERS
// ========================================

// Listen for download complete (after user-initiated download)
window.api.onUpdateDownloadedSilent((data) => {
  console.log("");
  console.log("=================================================");
  console.log("✅ UPDATE DOWNLOADED - READY TO INSTALL");
  console.log("=================================================");
  console.log("[Renderer] Update will install on launcher restart");

  // Remove the progress toast
  if (updateToastId) {
    updateToastId.classList.remove("show");
    setTimeout(() => {
      if (updateToastId && updateToastId.parentNode) {
        updateToastId.remove();
      }
      updateToastId = null;
    }, 300);
  }

  // Show a completion toast
  showToast(
    `Update v${data.version} downloaded! Launcher will restart in 5 seconds...`,
    "success",
    5000,
  );
});

// Listen for update ready to install (one-click auto-install)
window.api.onUpdateReadyToInstall((data) => {
  console.log("[Renderer] Update ready to install:", data);

  // Update dialog content to show "Installing..." message
  if (updateDialog && updateDialog.classList.contains("visible")) {
    const dialogHeader = updateDialog.querySelector(".update-dialog-header h2");
    const dialogContent = updateDialog.querySelector(".update-description");
    const dialogActions = updateDialog.querySelector(".update-dialog-actions");

    if (dialogHeader) {
      dialogHeader.textContent = "🚀 Installing Update...";
    }
    if (dialogContent) {
      dialogContent.innerHTML = `
        <p style="text-align: center; font-size: 16px; margin: 20px 0;">
          The launcher will restart in a moment to complete the update to <strong>v${data.version}</strong>.
        </p>
        <div style="text-align: center; margin-top: 20px;">
          <div class="progress-spinner" style="margin: 0 auto;"></div>
        </div>
      `;
    }
    if (dialogActions) {
      dialogActions.style.display = "none"; // Hide buttons
    }
  }
  // (OLD CODE REMOVED - Button will be recreated)
});

// Handle "Later" button
if (updateLaterButton) {
  updateLaterButton.addEventListener("click", () => {
    console.log("[Renderer] User declined update");
    if (updateDialog) {
      updateDialog.classList.remove("visible");
    }

    // Show persistent update indicator
    if (updateAvailableIndicator && pendingUpdateData) {
      updateAvailableIndicator.style.display = "block";
      console.log("[Renderer] Showing persistent update indicator");
    }
  });
}

// Handle clicking the persistent update indicator
if (updateAvailableIndicator) {
  updateAvailableIndicator.addEventListener("click", () => {
    console.log("[Renderer] Update indicator clicked");

    if (!pendingUpdateData) return;

    if (isPortableBuild) {
      // Portable: show informational dialog with direct download link
      showPortableUpdateDialog(pendingUpdateData);
      return;
    }

    // Installed build: re-show the NSIS update dialog
    if (updateDialog) {
      if (updateCurrentVersion) {
        updateCurrentVersion.textContent = pendingUpdateData.currentVersion;
      }
      if (updateNewVersion) {
        updateNewVersion.textContent = pendingUpdateData.version;
      }
      if (updateReleaseNotes && pendingUpdateData.releaseNotes) {
        updateReleaseNotes.textContent = pendingUpdateData.releaseNotes;
        updateReleaseNotes.style.display = "block";
      } else if (updateReleaseNotes) {
        updateReleaseNotes.style.display = "none";
      }
      updateDialog.classList.add("visible");
    }
  });
}

// Handle "Download & Install" button
if (updateDownloadButton) {
  updateDownloadButton.addEventListener("click", async () => {
    console.log("[Renderer] User confirmed update download");

    // Hide dialog
    if (updateDialog) {
      updateDialog.classList.remove("visible");
    }

    // Hide the persistent indicator since update is being downloaded
    if (updateAvailableIndicator) {
      updateAvailableIndicator.style.display = "none";
    }

    // Clear pending update data
    pendingUpdateData = null;

    // Confirm download with main process
    try {
      await window.api.confirmUpdateDownload();
      console.log("[Renderer] Update download started");
    } catch (error) {
      console.error("[Renderer] Error starting update download:", error);
    }
  });
}

// ========================================
// UPDATE ERROR HANDLERS
// ========================================

// Listen for update download errors
window.api.onUpdateError((data) => {
  console.error("[Renderer] Update error received:", data);

  // Remove any existing progress toasts
  if (updateToastId && updateToastId.parentNode) {
    updateToastId.remove();
    updateToastId = null;
  }

  // Show error dialog with retry option
  if (updateDialog) {
    const dialogHeader = updateDialog.querySelector("h2");
    const dialogContent = updateDialog.querySelector(".update-description");
    const dialogActions = updateDialog.querySelector(".update-dialog-actions");

    if (dialogHeader) {
      dialogHeader.textContent = "⚠️ Update Failed";
    }

    if (dialogContent) {
      dialogContent.innerHTML = `
        <p style="color: #ef4444; font-size: 16px; margin-bottom: 15px;">
          ${data.message}
        </p>
        <p style="font-size: 14px; color: #9ca3af;">
          ${
            data.type === "network"
              ? "Please check your internet connection and try again."
              : data.type === "timeout"
                ? "The download is taking too long. Your connection may be unstable."
                : "If this problem persists, you can download the update manually."
          }
        </p>
      `;
    }

    if (dialogActions) {
      dialogActions.innerHTML = "";

      // Add manual download button
      const manualBtn = document.createElement("button");
      manualBtn.className = "update-button secondary";
      manualBtn.textContent = "Download Manually";
      manualBtn.onclick = async () => {
        try {
          const result = await window.api.getManualDownloadUrl();
          if (result.success) {
            // Open URL in default browser
            window.api.openExternal(result.url);
            showToast("Opening download in browser...", "info", 3000);
            updateDialog.classList.remove("visible");
          }
        } catch (error) {
          console.error("[Renderer] Error getting manual download URL:", error);
        }
      };

      // Add retry button
      const retryBtn = document.createElement("button");
      retryBtn.className = "update-button primary";
      retryBtn.textContent = "Retry Download";
      retryBtn.onclick = async () => {
        try {
          updateDialog.classList.remove("visible");
          const result = await window.api.retryUpdateDownload();
          if (result.success) {
            console.log("[Renderer] Retrying update download");
          }
        } catch (error) {
          console.error("[Renderer] Error retrying update:", error);
        }
      };

      // Add close button
      const closeBtn = document.createElement("button");
      closeBtn.className = "update-button secondary";
      closeBtn.textContent = "Close";
      closeBtn.onclick = () => {
        updateDialog.classList.remove("visible");
        // Show update indicator again
        if (updateAvailableIndicator && data.updateInfo) {
          updateAvailableIndicator.style.display = "block";
          pendingUpdateData = data.updateInfo;
        }
      };

      dialogActions.appendChild(closeBtn);
      dialogActions.appendChild(manualBtn);
      dialogActions.appendChild(retryBtn);
      dialogActions.style.display = "flex";
    }

    // Show dialog
    updateDialog.classList.add("visible");
  } else {
    // Fallback: show error toast
    showToast(data.message, "error", 8000);
  }
});

// Listen for installation failure (on app restart)
window.api.onUpdateInstallationFailed((data) => {
  console.error("[Renderer] Update installation failed:", data);

  setTimeout(() => {
    if (updateDialog) {
      const dialogHeader = updateDialog.querySelector("h2");
      const dialogContent = updateDialog.querySelector(".update-description");
      const dialogActions = updateDialog.querySelector(
        ".update-dialog-actions",
      );

      if (dialogHeader) {
        dialogHeader.textContent = "❌ Update Installation Failed";
      }

      if (dialogContent) {
        dialogContent.innerHTML = `
          <p style="color: #ef4444; font-size: 16px; margin-bottom: 15px;">
            ${data.message}
          </p>
          <p style="font-size: 14px; color: #9ca3af; margin-bottom: 10px;">
            This can happen due to:
          </p>
          <ul style="font-size: 14px; color: #9ca3af; margin-left: 20px; margin-bottom: 15px;">
            <li>Insufficient permissions (try running as Administrator)</li>
            <li>Antivirus blocking the installer</li>
            <li>Corrupted download</li>
          </ul>
          <p style="font-size: 14px; color: #9ca3af;">
            You can try checking for updates again or download manually.
          </p>
        `;
      }

      if (dialogActions) {
        dialogActions.innerHTML = "";

        // Add manual download button
        const manualBtn = document.createElement("button");
        manualBtn.className = "update-button secondary";
        manualBtn.textContent = "Download Manually";
        manualBtn.onclick = async () => {
          try {
            const result = await window.api.getManualDownloadUrl();
            if (result.success) {
              // Open URL in default browser
              window.api.openExternal(result.url);
              showToast("Opening download in browser...", "info", 3000);
              updateDialog.classList.remove("visible");
            }
          } catch (error) {
            console.error(
              "[Renderer] Error getting manual download URL:",
              error,
            );
          }
        };

        // Add check updates button
        const checkBtn = document.createElement("button");
        checkBtn.className = "update-button primary";
        checkBtn.textContent = "Check for Updates";
        checkBtn.onclick = async () => {
          updateDialog.classList.remove("visible");
          try {
            await window.api.checkForUpdates();
          } catch (error) {
            console.error("[Renderer] Error checking for updates:", error);
          }
        };

        // Add close button
        const closeBtn = document.createElement("button");
        closeBtn.className = "update-button secondary";
        closeBtn.textContent = "Close";
        closeBtn.onclick = () => {
          updateDialog.classList.remove("visible");
        };

        dialogActions.appendChild(closeBtn);
        dialogActions.appendChild(manualBtn);
        dialogActions.appendChild(checkBtn);
        dialogActions.style.display = "flex";
      }

      // Show dialog
      updateDialog.classList.add("visible");
    } else {
      // Fallback: show error toast
      showToast(data.message, "error", 10000);
    }
  }, 3500); // Show after launcher fully loads
});

// Listen for successful installation (on app restart)
window.api.onUpdateInstallationSuccess((data) => {
  console.log("[Renderer] Update installed successfully:", data);

  setTimeout(() => {
    showToast(`✅ Successfully updated to v${data.version}!`, "success", 5000);
  }, 2500);
});

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================

const AHL_EXISTING_INSTALL_HINT_STORAGE_KEY =
  "shadowrunLauncher_ahlExistingInstallHintDismissed";

function persistAhlExistingInstallHintDismissed() {
  try {
    localStorage.setItem(AHL_EXISTING_INSTALL_HINT_STORAGE_KEY, "1");
  } catch (_err) {
    /* ignore quota / private mode */
  }
}

/** Any required AHL file missing on disk (e.g. renamed to *.old counts as missing). */
function isAhlPatchSetIncomplete(status) {
  if (!status) {
    return false;
  }
  if (status.allFilesPresent === false) {
    return true;
  }
  if (Array.isArray(status.missingFiles) && status.missingFiles.length > 0) {
    return true;
  }
  return false;
}

function showAhlMissingFilesHintAlert() {
  if (!ahlHintAlertBar || !ahlHintAlertMessage) {
    return;
  }
  const message =
    "AntHill LIVE patch files are not in this folder yet. Click the LIVE badge in the title bar to download them into your game folder, or enable AntHill LIVE under Settings → Diagnostics.";
  ahlHintAlertMessage.textContent = message;
  ahlHintAlertBar.className = "error-alert-bar error ahl-hint-alert";
  ahlHintAlertBar.style.display = "block";
  syncAhlHintAlertStackPosition();
}

/**
 * One-time hint after the user successfully points the launcher at an existing
 * game folder: if AHL patch files are missing, suggest the LIVE badge (and Diagnostics).
 */
function tryShowAhlMissingHintAfterExistingBrowse() {
  try {
    if (localStorage.getItem(AHL_EXISTING_INSTALL_HINT_STORAGE_KEY) === "1") {
      return;
    }
  } catch (_err) {
    return;
  }

  void (async () => {
    const waitMs = [0, 200];
    for (const ms of waitMs) {
      if (ms > 0) {
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      try {
        if (localStorage.getItem(AHL_EXISTING_INSTALL_HINT_STORAGE_KEY) === "1") {
          return;
        }
      } catch (_err) {
        return;
      }
      try {
        const status = await window.api.checkGfwlServer();
        if (!status || !isAhlPatchSetIncomplete(status)) {
          continue;
        }
        showAhlMissingFilesHintAlert();
        return;
      } catch (_err) {
        /* retry */
      }
    }
  })();
}

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toastContainer");
  if (!container) {
    console.error("Toast container not found");
    return;
  }

  // Create toast element
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  // Icon based on type
  const icons = {
    success: "✓",
    info: "ℹ",
    warning: "⚠",
    error: "✕",
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add("show"), 10);

  // Auto-remove after duration (if duration > 0)
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  console.log(`[Toast] ${type.toUpperCase()}: ${message}`);
  return toast; // Return toast element for updates
}

// Enhanced toast with progress bar for updates
function showUpdateToast(
  message,
  type = "info",
  duration = 0,
  showProgress = false,
) {
  const container = document.getElementById("toastContainer");
  if (!container) {
    console.error("Toast container not found");
    return null;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type} update-toast`;
  toast.dataset.updateToast = "true"; // Mark as update toast

  const icons = {
    success: "✓",
    info: "🔄",
    warning: "⚠",
    error: "✕",
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
      ${
        showProgress
          ? '<div class="toast-progress-bar"><div class="toast-progress-fill" style="width: 0%"></div></div>'
          : ""
      }
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  console.log(`[Update Toast] ${type.toUpperCase()}: ${message}`);
  return toast;
}

// ============================================================================
// CHECK FOR UPDATES BUTTON (RECREATED FRESH - CLEAN CODE)
// ============================================================================

(function initCheckForUpdates() {
  console.log("");
  console.log("=== Initializing Check for Updates Button ===");

  const btn = document.getElementById("btnCheckUpdates");

  if (!btn) {
    console.error("❌ ERROR: btnCheckUpdates not found in DOM!");
    return;
  }

  console.log("✅ Button found:", btn);

  let isChecking = false; // Prevent multiple simultaneous checks

  btn.addEventListener("click", async function handleCheckUpdatesClick() {
    // Prevent multiple simultaneous checks
    if (isChecking) {
      console.log("⏭️  Update check already in progress, skipping...");
      return;
    }

    console.log("");
    console.log("=================================================");
    console.log("🔍 CHECK FOR UPDATES BUTTON CLICKED!");
    console.log("=================================================");
    console.log("Time:", new Date().toLocaleTimeString());

    isChecking = true;

    // Visual feedback - button changes
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Checking...";
    btn.style.opacity = "0.6";

    console.log("✓ Button disabled and changed to 'Checking...'");

    try {
      console.log("📡 Calling window.api.checkForUpdates()...");
      const result = await window.api.checkForUpdates();

      console.log("✅ API Response:", result);

      // Reset button immediately (feedback will come via toast)
      btn.disabled = false;
      btn.textContent = originalText;
      btn.style.opacity = "1";
      console.log("✓ Button reset to normal state");
    } catch (error) {
      console.error("❌ Error checking for updates:", error);

      // Show error toast
      showToast(
        "Failed to check for updates. Check your internet connection and try again.",
        "error",
        6000,
      );

      // Reset button on error
      btn.disabled = false;
      btn.textContent = originalText;
      btn.style.opacity = "1";
    } finally {
      isChecking = false;
    }

    console.log("=================================================");
    console.log("");
  });

  console.log("✅ Event listener attached successfully");
  console.log("==============================================");
  console.log("");
})();

// ============================================================================
// PORTABLE BUILD UI INIT
// ============================================================================

// Fetch launcher type once on startup and adapt any portable-specific UI.
(async function initPortableAwareUI() {
  try {
    const info = await window.api.getLauncherRuntimeInfo();
    isPortableBuild = info.isPortable;
    portableDownloadUrl = info.portableDownloadUrl;

    if (!isPortableBuild) return;

    // Update the "Check for Updates" description in Settings to reflect
    // that portable builds update by replacing the .exe manually.
    const descSpan = document.getElementById("checkUpdatesDescription");
    if (descSpan) {
      const changelogLink = descSpan.querySelector("#viewChangelogLink");
      descSpan.innerHTML = "";
      descSpan.appendChild(
        Object.assign(document.createTextNode(""), {
          textContent:
            "Check if a new version of the portable launcher is available. Updates are applied by downloading and replacing the .exe.\u00a0",
        }),
      );
      if (changelogLink) {
        descSpan.appendChild(changelogLink);
      }
    }
  } catch (err) {
    console.error("[Renderer] Failed to fetch launcher runtime info:", err);
  }
})();

// ============================================================================
// DIAGNOSTICS AND ERROR FIXING BUTTONS
// ============================================================================

// Run System Diagnostics
const runDiagnosticsButton = document.getElementById("runDiagnosticsButton");
if (runDiagnosticsButton) {
  runDiagnosticsButton.addEventListener("click", async () => {
    console.log("[Diagnostics] Running system diagnostics...");
    const originalText = runDiagnosticsButton.textContent;
    runDiagnosticsButton.disabled = true;
    runDiagnosticsButton.textContent = "Running...";

    // Show loading toast
    const loadingToast = showToast("🔍 Running diagnostics...", "info", 0);

    try {
      const result = await window.api.runDiagnostics();
      console.log("[Diagnostics] Results:", result);

      // Remove loading toast
      if (loadingToast) {
        loadingToast.classList.remove("show");
        setTimeout(() => loadingToast.remove(), 300);
      }

      if (result.success) {
        const diag = result.diagnostics;

        // Create custom diagnostics result modal
        showDiagnosticsResults(diag);
      } else {
        const errorMsg = result.error || "Something went wrong";
        showToast(
          `Failed to run diagnostics: ${errorMsg}. Please try again, or run the launcher as Administrator.`,
          "error",
          6000,
        );
      }
    } catch (error) {
      console.error("[Diagnostics] Error:", error);

      // Remove loading toast
      if (loadingToast) {
        loadingToast.classList.remove("show");
        setTimeout(() => loadingToast.remove(), 300);
      }

      showToast(
        `Failed to run diagnostics: ${
          error.message || "Something went wrong"
        }. Please try again, or run the launcher as Administrator.`,
        "error",
        6000,
      );
    } finally {
      runDiagnosticsButton.disabled = false;
      runDiagnosticsButton.textContent = originalText;
    }
  });
}

// Function to show diagnostics results in a nice modal
function showDiagnosticsResults(diag) {
  const modal = document.createElement("div");
  modal.className = "visible modal-screen";
  modal.style.zIndex = "2000";

  const statusIcon = (status) => (status ? "✅" : "❌");
  const statusText = (status) => (status ? "OK" : "Issue Detected");
  const statusColor = (status) => (status ? "#10b981" : "#ef4444");

  // NAT Type color coding
  const getNatColor = (natType) => {
    if (natType.includes("Open")) return "#10b981"; // Green
    if (natType.includes("Moderate")) return "#f59e0b"; // Orange
    if (natType.includes("Strict")) return "#ef4444"; // Red
    return "#94a3b8"; // Gray
  };

  const gpuName = diag.gpuInfo.name;
  const gpuDisplay =
    gpuName.toUpperCase().includes(diag.gpuInfo.vendor.toUpperCase()) ||
    gpuName.toUpperCase().includes("NVIDIA") ||
    gpuName.toUpperCase().includes("RADEON")
      ? gpuName
      : `${diag.gpuInfo.vendor.toUpperCase()} - ${gpuName}`;

  const safePcidForHtml =
    diag.pcid && diag.pcid.value
      ? String(diag.pcid.value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
      : "";

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 550px; max-height: 85vh; display: flex; flex-direction: column;">
      <div class="modal-header" style="background: rgba(15, 23, 42, 0.95); flex-shrink: 0;">
        <h2>🔍 Diagnostic Results</h2>
        <button class="close-button" onclick="this.closest('.modal-screen').remove()">×</button>
      </div>
      <div class="modal-body" style="padding: 20px; overflow-y: auto; flex: 1; min-height: 0;">
        
        <!-- System Components -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; color: #60a5fa; margin-bottom: 12px; font-weight: 600;">System Components</h3>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor(
              diag.directX,
            )};">
              <span style="font-size: 13px;">DirectX 9+</span>
              <span style="color: ${statusColor(
                diag.directX,
              )}; font-weight: 600;">${statusIcon(diag.directX)} ${statusText(
                diag.directX,
              )}</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor(
              diag.vcRedistX86,
            )};">
              <span style="font-size: 13px;">Microsoft Visual C++ v14 Redistributable (x86)</span>
              <span style="color: ${statusColor(
                diag.vcRedistX86,
              )}; font-weight: 600;">${statusIcon(diag.vcRedistX86)} ${statusText(
                diag.vcRedistX86,
              )}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor(
              diag.dotNet.installed,
            )};">
              <span style="font-size: 13px;">.NET Framework 3.5</span>
              <span style="color: ${statusColor(
                diag.dotNet.installed,
              )}; font-weight: 600;">${statusIcon(diag.dotNet.installed)} ${
                diag.dotNet.installed ? diag.dotNet.version : "Not Installed"
              }</span>
            </div>
            
            <!-- PCID Display -->
            ${
              diag.pcid
                ? `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${
              diag.pcid.exists ? "#10b981" : "#94a3b8"
            };">
              <span style="font-size: 13px; flex-shrink: 0;">Current PCID</span>
              ${
                diag.pcid.exists && diag.pcid.value
                  ? `<div class="diagnostics-pcid-row">
                <button type="button" class="diagnostics-pcid-copy-btn" title="Copy PCID" aria-label="Copy PCID to clipboard"><svg class="diagnostics-pcid-copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><rect x="3" y="3" width="13" height="13" rx="2" ry="2"></rect></svg></button>
                <span class="diagnostics-pcid-value">
                  <span class="diagnostics-pcid-reveal">${safePcidForHtml}</span>
                </span>
              </div>`
                  : `<span style="color: #94a3b8; font-size: 12px; text-align: right;">Not generated — launch the game first.</span>`
              }
            </div>
            `
                : ""
            }
          </div>
        </div>
        
        <!-- Network & Connectivity -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; color: #10b981; margin-bottom: 12px; font-weight: 600;">🌐 Network & Connectivity</h3>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; text-align: center;">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Internet</div>
              <div style="color: ${statusColor(
                diag.network.online,
              )}; font-weight: 600; font-size: 13px;">${
                diag.network.status
              }</div>
            </div>
            
            <div style="padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; text-align: center;">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Firewall</div>
              <div style="color: ${
                diag.firewall.enabled ? "#f59e0b" : "#10b981"
              }; font-weight: 600; font-size: 13px;">${
                diag.firewall.status
              }</div>
            </div>
            
            <div style="padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; text-align: center; grid-column: span 2;">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">NAT Type (P2P)</div>
              <div style="color: ${getNatColor(
                diag.natType.type,
              )}; font-weight: 600; font-size: 13px;">${diag.natType.type}</div>
            </div>
          </div>
        </div>
        
        ${
          diag.autoFixed.length > 0
            ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; color: #10b981; margin-bottom: 8px; font-weight: 600;">✅ Auto-Fixed</h3>
          <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3);">
            ${diag.autoFixed
              .map(
                (fix) =>
                  `<div style="font-size: 12px; margin-bottom: 4px;">• ${fix}</div>`,
              )
              .join("")}
          </div>
        </div>
        `
            : ""
        }
        
        ${
          diag.issues.length > 0
            ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; color: #f59e0b; margin-bottom: 8px; font-weight: 600;">⚠️ Issues Detected</h3>
          <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.3);">
            ${diag.issues
              .map(
                (issue) => `
              <div style="margin-bottom: 12px;">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #fbbf24;">${
                  issue.message
                }</div>
                ${
                  issue.fix !== "auto-fixable"
                    ? `<div style="font-size: 11px; color: #94a3b8;">Fix: ${issue.fix}</div>`
                    : ""
                }
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
        `
            : ""
        }
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const copyPcidBtn = modal.querySelector(".diagnostics-pcid-copy-btn");
  if (copyPcidBtn && diag.pcid && diag.pcid.exists && diag.pcid.value) {
    const pcidToCopy = diag.pcid.value;
    copyPcidBtn.addEventListener("click", () => {
      const notifyCopied = () =>
        showToast("✅ PCID copied to clipboard!", "success", 3000);
      navigator.clipboard
        .writeText(pcidToCopy)
        .then(notifyCopied)
        .catch((err) => {
          console.error("[Diagnostics PCID copy]", err);
          try {
            const textArea = document.createElement("textarea");
            textArea.value = pcidToCopy;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            notifyCopied();
          } catch (e2) {
            showToast(
              "Could not copy PCID. Select the text and copy manually.",
              "error",
              4000,
            );
          }
        });
    });
  }
}

// Detect System Info (GPU + CPU + OS + NAT)
const detectSystemButton = document.getElementById("detectSystemButton");
const copySystemInfoButton = document.getElementById("copySystemInfoButton");
const gpuInfo = document.getElementById("gpuInfo");
const cpuInfo = document.getElementById("cpuInfo");
const osInfo = document.getElementById("osInfo");
const natInfo = document.getElementById("natInfo");

let cachedSystemInfo = null;

// Function to detect and display system info
async function detectAndDisplaySystemInfo(
  shouldShowToast = true,
  forceRefresh = false,
) {
  if (detectSystemButton) detectSystemButton.disabled = true;
  if (gpuInfo) gpuInfo.textContent = "Detecting...";
  if (cpuInfo) cpuInfo.textContent = "Detecting...";
  if (osInfo) osInfo.textContent = "Detecting...";
  if (natInfo) natInfo.textContent = "Detecting...";

  try {
    const result = await window.api.getSystemInfo(forceRefresh);
    console.log("[System Detection]", result);

    if (result.success) {
      const system = result.system;
      cachedSystemInfo = system;

      if (gpuInfo) {
        // Don't prepend vendor if GPU name already contains it
        const gpuName = system.gpu.name;
        const vendorUpper = system.gpu.vendor.toUpperCase();

        if (
          gpuName.toUpperCase().includes(vendorUpper) ||
          gpuName.toUpperCase().includes("NVIDIA") ||
          gpuName.toUpperCase().includes("RADEON") ||
          gpuName.toUpperCase().includes("GEFORCE")
        ) {
          gpuInfo.textContent = gpuName;
        } else {
          gpuInfo.textContent = `${vendorUpper} - ${gpuName}`;
        }
      }
      if (cpuInfo) {
        cpuInfo.textContent = system.cpu.name;
      }
      if (osInfo) {
        osInfo.textContent = system.os;
      }
      if (natInfo) {
        natInfo.textContent = system.nat.type;

        // Color code NAT type
        if (system.nat.type.includes("Open")) {
          natInfo.style.color = "#10b981"; // Green for Open
        } else if (system.nat.type.includes("Moderate")) {
          natInfo.style.color = "#f59e0b"; // Orange for Moderate
        } else if (system.nat.type.includes("Strict")) {
          natInfo.style.color = "#ef4444"; // Red for Strict
        } else {
          natInfo.style.color = "#94a3b8"; // Gray for Unknown
        }
      }

      // Only show toast if explicitly requested (manual button click)
      if (shouldShowToast) {
        showToast(
          `✓ System information ${result.cached ? "loaded" : "detected"}!`,
          "success",
          3000,
        );
      }
    } else {
      if (gpuInfo) gpuInfo.textContent = "Detection failed";
      if (cpuInfo) cpuInfo.textContent = "Detection failed";
      if (osInfo) osInfo.textContent = "Detection failed";
      if (natInfo) natInfo.textContent = "Detection failed";
      if (shouldShowToast) {
        alert(`Error detecting system: ${result.error}`);
      }
    }
  } catch (error) {
    console.error("[System Detection] Error:", error);
    if (gpuInfo) gpuInfo.textContent = "Detection failed";
    if (cpuInfo) cpuInfo.textContent = "Detection failed";
    if (osInfo) osInfo.textContent = "Detection failed";
    if (natInfo) natInfo.textContent = "Detection failed";
    if (shouldShowToast) {
      alert(`Failed to detect system: ${error.message}`);
    }
  } finally {
    if (detectSystemButton) {
      detectSystemButton.disabled = false;
    }
  }
}

// Detect System button handler (show toast + force re-detect, skip cache)
if (detectSystemButton) {
  detectSystemButton.addEventListener("click", () =>
    detectAndDisplaySystemInfo(true, true),
  );
}

// Copy System Info button handler
if (copySystemInfoButton) {
  copySystemInfoButton.addEventListener("click", () => {
    if (!cachedSystemInfo) {
      alert("Please detect system information first!");
      return;
    }

    // Format GPU name (don't duplicate vendor)
    const gpuName = cachedSystemInfo.gpu.name;
    const vendorUpper = cachedSystemInfo.gpu.vendor.toUpperCase();
    let gpuDisplay = gpuName;

    if (
      !gpuName.toUpperCase().includes(vendorUpper) &&
      !gpuName.toUpperCase().includes("NVIDIA") &&
      !gpuName.toUpperCase().includes("RADEON") &&
      !gpuName.toUpperCase().includes("GEFORCE")
    ) {
      gpuDisplay = `${vendorUpper} - ${gpuName}`;
    }

    const systemText = `GPU: ${gpuDisplay}\nCPU: ${cachedSystemInfo.cpu.name}\nOS: ${cachedSystemInfo.os}\nNAT Type: ${cachedSystemInfo.nat.type}`;

    // Copy to clipboard
    navigator.clipboard
      .writeText(systemText)
      .then(() => {
        showToast("✅ System info copied to clipboard!", "success", 3000);
      })
      .catch((error) => {
        console.error("[Copy] Error:", error);

        // Fallback method
        const textArea = document.createElement("textarea");
        textArea.value = systemText;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          showToast("✅ System info copied to clipboard!", "success", 3000);
        } catch (err) {
          alert(
            "Failed to copy to clipboard. Please copy manually:\n\n" +
              systemText,
          );
        }
        document.body.removeChild(textArea);
      });
  });
}
