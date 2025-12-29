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

// Function to show download confirmation dialog with option to find existing game
function showDownloadConfirmDialog() {
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
          <span class="confirm-icon">🔍</span>
          Game Not Found
        </div>
        <button class="confirm-close-button" id="closeBtn" aria-label="Close">×</button>
      </div>
      <div class="confirm-content">
        <div class="confirm-message">
          Shadowrun game files were not detected on your system.
        </div>
        <div class="confirm-note">
          <strong>Already have the game?</strong> Browse for your existing installation to avoid downloading again.
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
    "[Renderer] PCID Backup button clicked. Attempting to call window.api.backupPcid()."
  );

  const backupPcidButton = document.getElementById("backupPcidButton");
  // const pcidBackupFeedback = document.getElementById("pcidBackupFeedback"); // Check if this element exists
  const pcidBackupStatus = document.getElementById("pcidBackupStatus"); // Check if this element exists
  const currentPcidDisplay = document.getElementById("currentPcidDisplay"); // Check if this element exists

  if (!backupPcidButton || !pcidBackupStatus || !currentPcidDisplay) {
    console.error(
      "[Renderer] One or more UI elements for PCID backup are missing!"
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
        JSON.stringify(result, null, 2)
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
            "[Renderer] Backup failed with no specific error message from main process."
          );
        }
      }
    } else {
      console.error(
        "[Renderer] window.api.backupPcid is not available or not a function!"
      );
      pcidBackupStatus.textContent = "Error: Backup API not available.";
      // alert("Backup API not available!"); // Optional feedback
    }
  } catch (error) {
    console.error(
      "[Renderer] Exception during window.api.backupPcid() call:",
      error
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
  "[Renderer] handlePcidBackupClick has been globally defined (full version)."
);

// Add this at the very beginning of your index.js, outside any functions or event listeners
console.log("Script loading...");

// Audio elements
const backgroundAudio = document.getElementById("backgroundAudio");
const buttonHoverAudio = document.getElementById("buttonHoverAudio");
const buttonClickAudio = document.getElementById("buttonClickAudio");

// Audio state
let isMuted = false;

// Initialize background audio
async function initBackgroundAudio() {
  if (backgroundAudio) {
    // Load mute state from settings
    try {
      const savedSettings = await window.api.loadSettings();
      if (savedSettings && savedSettings.audioMuted !== undefined) {
        isMuted = savedSettings.audioMuted;
        backgroundAudio.muted = isMuted;

        // Update button icon to reflect saved state
        const speakerIcon = document.getElementById("speakerIcon");
        const mutedIcon = document.getElementById("mutedIcon");
        if (isMuted) {
          if (speakerIcon) speakerIcon.style.display = "none";
          if (mutedIcon) mutedIcon.style.display = "block";
        }
      }
    } catch (error) {
      console.log("Could not load audio mute state:", error);
    }

    backgroundAudio.volume = 0.5; // Set volume to 50%

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

// Mute/Unmute functionality
function toggleMute() {
  if (!backgroundAudio) return;

  isMuted = !isMuted;
  backgroundAudio.muted = isMuted;

  // Update button icon
  const speakerIcon = document.getElementById("speakerIcon");
  const mutedIcon = document.getElementById("mutedIcon");

  if (isMuted) {
    if (speakerIcon) speakerIcon.style.display = "none";
    if (mutedIcon) mutedIcon.style.display = "block";
  } else {
    if (speakerIcon) speakerIcon.style.display = "block";
    if (mutedIcon) mutedIcon.style.display = "none";
  }

  // Save mute state to settings
  window.api
    .loadSettings()
    .then((currentSettings) => {
      window.api.saveSettings({
        ...currentSettings,
        audioMuted: isMuted,
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
const settingsButton = document.getElementById("settingsButton");
const minimizeButton = document.getElementById("minimizeButton");
const closeButton = document.getElementById("closeButton");
const muteButton = document.getElementById("muteButton");

// Settings screen elements
const settingsScreen = document.getElementById("settingsScreen");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const skipIntroButton = document.getElementById("skipIntroButton");
const dxvkToggle = document.getElementById("dxvk");

// srs_shadowrun.dll version buttons
const srsDllNewerButton = document.getElementById("srsDllNewerButton");
const srsDllOlderButton = document.getElementById("srsDllOlderButton");

// Changelog elements
const viewChangelogLink = document.getElementById("viewChangelogLink");
const changelogScreen = document.getElementById("changelogScreen");
const closeChangelogButton = document.getElementById("closeChangelogButton");
const changelogContent = document.getElementById("changelogContent");

// Game state (this would normally be managed by the main process)
let gameInstalled = false;
let settings = {
  skipIntro: false,
  dxvk: false,
};

// DOM Elements - add these new elements
const discordIconButton = document.getElementById("discordIconButton");
const instructionsScreen = document.getElementById("instructionsScreen");
const closeInstructionsButton = document.getElementById(
  "closeInstructionsButton"
);
const downloadProgressScreen = document.getElementById(
  "downloadProgressScreen"
);
const gameFilesProgress = document.getElementById("gameFilesProgress");
const gfwlProgress = document.getElementById("gfwlProgress");
const dxProgress = document.getElementById("dxProgress");
const gameFilesStatus = document.getElementById("gameFilesStatus");
const gfwlStatus = document.getElementById("gfwlStatus");
const dxStatus = document.getElementById("dxStatus");
const downloadMessage = document.getElementById("downloadMessage");
const versionInfo = document.querySelector(".version-info");

// Add this event listener for the Instructions button
const openInstructionsButton = document.getElementById(
  "openInstructionsButton"
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

// Add this listener near the top with other listeners
window.api.onGameStateUpdate((state) => {
  gameRunning = state.running;
  updateUI();
});

// Add this early in the script to check installation on load
window.api.checkGameInstalled().then((result) => {
  gameInstalled = result.installed;
  updateUI();
});

// Add event listener for installation status updates
window.api.onGameInstallationStatus((status) => {
  console.log("Received game installation status:", status);
  gameInstalled = status.installed;
  updateUI();

  if (gameInstalled) {
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

  // Refresh srs_shadowrun.dll version
  window.api
    .checkSrsDllVersion()
    .then((status) => {
      if (status.exists && status.version) {
        updateSrsDllButtonStates(status.version);
      }
    })
    .catch((error) => {
      console.error("Error checking srs_shadowrun.dll version:", error);
    });
});

// Replace the existing activation status handler with this stripped-down version
window.api.onActivationStatus((status) => {
  // Only log the status, don't change UI
  console.log(
    "Game activation status:",
    status.activated ? "Activated" : "Not activated"
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

// Update UI based on game state
function updateUI() {
  console.log(
    "Updating UI. Game installed:",
    gameInstalled,
    "Game running:",
    gameRunning
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
    "gameFolderDescription"
  );

  if (openGameDirButton) {
    if (gameInstalled) {
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
    // Enable srs_shadowrun.dll version buttons
    if (srsDllNewerButton) {
      srsDllNewerButton.disabled = false;
      srsDllNewerButton.style.opacity = "1";
      srsDllNewerButton.style.cursor = "pointer";
    }
    if (srsDllOlderButton) {
      srsDllOlderButton.disabled = false;
      srsDllOlderButton.style.opacity = "1";
      srsDllOlderButton.style.cursor = "pointer";
    }
    // Enable Change Game Location button
    const changeGameLocationButton = document.getElementById(
      "changeGameLocationButton"
    );
    if (changeGameLocationButton) {
      changeGameLocationButton.disabled = false;
      changeGameLocationButton.style.opacity = "1";
      changeGameLocationButton.style.cursor = "pointer";
    }
  } else {
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
    // Disable srs_shadowrun.dll version buttons
    if (srsDllNewerButton) {
      srsDllNewerButton.disabled = true;
      srsDllNewerButton.classList.remove("active");
      srsDllNewerButton.style.opacity = "0.5";
      srsDllNewerButton.style.cursor = "not-allowed";
    }
    if (srsDllOlderButton) {
      srsDllOlderButton.disabled = true;
      srsDllOlderButton.classList.remove("active");
      srsDllOlderButton.style.opacity = "0.5";
      srsDllOlderButton.style.cursor = "not-allowed";
    }
    // Disable Change Game Location button
    const changeGameLocationButton = document.getElementById(
      "changeGameLocationButton"
    );
    if (changeGameLocationButton) {
      changeGameLocationButton.disabled = true;
      changeGameLocationButton.style.opacity = "0.5";
      changeGameLocationButton.style.cursor = "not-allowed";
    }
  }
}

// Window control handlers
muteButton.addEventListener("click", () => {
  // Play click sound before toggling mute (so it plays if currently unmuted)
  if (!isMuted) {
    playClickSound();
  }
  toggleMute();
});

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
  // First check if button is disabled or if game is running
  if (playButton.disabled || gameRunning) {
    console.log("Button clicked while disabled or game running, ignoring...");
    return; // Exit early, don't process the click
  }

  // If game is installed, verify it still exists before launching
  if (gameInstalled) {
    console.log("Verifying game still exists before launch...");
    // Re-check game installation status to catch renamed/moved folders
    const checkResult = await window.api.checkGameInstalled();
    if (!checkResult.installed || !checkResult.dependencies?.gameFiles) {
      console.warn("Game files no longer found at cached location");
      showToast(
        "Game files not found. Please browse for your game folder in Settings.",
        "error",
        5000
      );
      // Update UI to show Download button
      gameInstalled = false;
      updateUI();
      return;
    }
    console.log("Launching game...");
    const launchResult = await window.api.launchGame(settings);
    if (!launchResult.success) {
      showToast(launchResult.error || "Failed to launch game", "error", 5000);
      // If game executable not found, update UI
      if (launchResult.error && launchResult.error.includes("not found")) {
        gameInstalled = false;
        updateUI();
      }
    }
    return;
  }

  // If game is not installed, show confirmation dialog
  const downloadChoice = await showDownloadConfirmDialog();

  if (downloadChoice === "find") {
    // User wants to find existing game
    try {
      const result = await window.api.browseForExistingGame();
      if (result.success) {
        showToast("✓ Game found!", "success", 3000);
        // The game-installation-status event will be triggered automatically
        // which will update the UI
      } else if (!result.canceled) {
        showToast(
          result.error || "Game files not found in selected folder",
          "error",
          4000
        );
      }
    } catch (error) {
      console.error("[Find Game] Error:", error);
      showToast(`Error: ${error.message}`, "error", 4000);
    }
    return;
  } else if (downloadChoice === "cancel") {
    // User canceled
    return;
  }

  // User chose to download - proceed with download
  console.log("Downloading game...");

  // Show the download progress screen
  downloadProgressScreen.classList.add("visible");

  // Reset progress bars
  gameFilesProgress.style.width = "0%";
  gfwlProgress.style.width = "0%";
  dxProgress.style.width = "0%";
  gameFilesStatus.textContent = "Waiting...";
  gfwlStatus.textContent = "Waiting...";
  dxStatus.textContent = "Waiting...";
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
      6000
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

  // Disable button during activation
  activateButton.disabled = true;
  activateButton.textContent = "Activating...";

  try {
    const result = await window.api.activateGame();

    if (result.success) {
      // Show success UI or notification
      setTimeout(() => {
        activateButton.textContent = "Activate Game";
        activateButton.disabled = false;
      }, 3000);
    } else {
      // Show failure UI or use the notification that main process already sent
      setTimeout(() => {
        activateButton.textContent = "Activate Game";
        activateButton.disabled = false;
      }, 3000);
    }
  } catch (error) {
    console.error("Activation error:", error);
    setTimeout(() => {
      activateButton.textContent = "Activate Game";
      activateButton.disabled = false;
    }, 3000);
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

  // If game is not installed, disable all mod controls
  if (!gameInstalled) {
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
    // Disable srs_shadowrun.dll version buttons
    if (srsDllNewerButton) {
      srsDllNewerButton.disabled = true;
      srsDllNewerButton.classList.remove("active");
      srsDllNewerButton.style.opacity = "0.5";
      srsDllNewerButton.style.cursor = "not-allowed";
    }
    if (srsDllOlderButton) {
      srsDllOlderButton.disabled = true;
      srsDllOlderButton.classList.remove("active");
      srsDllOlderButton.style.opacity = "0.5";
      srsDllOlderButton.style.cursor = "not-allowed";
    }
    // Disable Change Game Location button
    const changeGameLocationButton = document.getElementById(
      "changeGameLocationButton"
    );
    if (changeGameLocationButton) {
      changeGameLocationButton.disabled = true;
      changeGameLocationButton.style.opacity = "0.5";
      changeGameLocationButton.style.cursor = "not-allowed";
    }
  } else {
    // Game is installed, check mod status whenever settings are opened
    window.api.checkSkipIntroStatus().then((status) => {
      updateSkipIntroButtonState(status.installed);
    });

    // Check DXVK status whenever settings are opened
    window.api.checkDxvkStatus().then((status) => {
      if (dxvkToggle) {
        dxvkToggle.checked = status.enabled;
      }
    });
  }

  // Update driver update button text based on detected GPU
  if (typeof updateDriverUpdateButton === "function") {
    updateDriverUpdateButton();
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
  "closeDiagnosticsButton"
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
    "currentGamePathDisplay"
  );

  if (!currentGamePathElement) return;

  try {
    const gamePath = await window.api.getGameInstallationPath();

    if (gamePath) {
      currentGamePathElement.textContent = gamePath;
      currentGamePathDisplay.style.display = "block";
    } else {
      currentGamePathElement.textContent = "Game not installed";
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
  "changeGameLocationButton"
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

        // Show error
        showToast(result.error, "error", 5000);
        return;
      }

      // Show confirmation dialog (includes elevation warning if needed)
      showGameMoveConfirmation(result);
    } catch (error) {
      console.error("[Change Location] Error:", error);
      showToast(`Error: ${error.message}`, "error", 5000);
      changeGameLocationButton.disabled = false;
      changeGameLocationButton.textContent = "📁 Change Location";
    }
  });
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
        `Game files moved successfully to ${result.newPath}`,
        "success",
        5000
      );

      // Refresh installation status
      const installStatus = await window.api.checkGameInstalled();
      gameInstalled = installStatus.installed;
      updateUI();

      // Reload settings from main process (includes updated mod statuses)
      const updatedSettings = await window.api.loadSettings();
      settings = updatedSettings;

      // Update the displayed game path
      await loadCurrentGamePath();

      // Update all UI elements with new settings
      loadSettings();
    } else {
      // Show error
      showToast(`Move failed: ${result.error}`, "error", 7000);
    }
  } catch (error) {
    console.error("[Execute Move] Error:", error);

    // Remove progress modal
    if (progressModal && progressModal.parentNode) {
      progressModal.remove();
    }

    showToast(`Move failed: ${error.message}`, "error", 7000);
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

// Add near the beginning of your file with other initialization
window.api.checkSkipIntroStatus().then((status) => {
  console.log("Skip intro status:", status);
  updateSkipIntroButtonState(status.installed);
});

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

        // Show error toast
        showToast(result.message, "error", 5000);
      }
    } catch (error) {
      console.error("Error toggling DXVK:", error);

      // Revert toggle state on error
      dxvkToggle.checked = !newState;

      showToast("An unexpected error occurred", "error");
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
  skipIntroButton.classList.contains("installed")
    ? skipIntroButton.classList.remove("installed")
    : skipIntroButton.classList.add("installed");

  // Check DXVK status and update toggle
  try {
    const dxvkStatus = await window.api.checkDxvkStatus();
    dxvkToggle.checked = dxvkStatus.enabled;
    settings.dxvk = dxvkStatus.enabled;
  } catch (error) {
    console.error("Error checking DXVK status:", error);
    dxvkToggle.checked = settings.dxvk;
  }

  // Load frame rate setting if available, otherwise default to 85
  if (settings.maxFrameRate) {
    maxFrameRateInput.value = settings.maxFrameRate;
  } else {
    maxFrameRateInput.value = 85;
  }
}

// Load version number on startup
async function loadVersion() {
  const result = await window.api.getVersion();
  if (result.success) {
    versionInfo.textContent = `Version ${result.version}`;
  }
}

// Initialize UI and load settings
updateUI();
loadSettings();
loadVersion();

// Initialize audio
initBackgroundAudio();
addButtonSoundEffects();

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
      moveEvent.clientY - startY
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
      question: "GFWL Sign-In Issues",
      answer: `
        <p><strong>Solutions:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Create a new Xbox Live account if you don't have one</li>
          <li>Use the same account you use for Xbox/Microsoft services</li>
          <li>If sign-in fails, restart the game and try again</li>
          <li>Check that Windows License Manager Service is running (use Diagnostics screen)</li>
          <li>Restart Xbox Live Networking Service if connection issues occur</li>
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
  `
    )
    .join("");

  // Add click handlers for accordion
  const faqQuestions = faqContent.querySelectorAll(".faq-question");
  faqQuestions.forEach((question) => {
    question.addEventListener("click", () => {
      const index = question.dataset.index;
      const answer = faqContent.querySelector(
        `.faq-answer[data-index="${index}"]`
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
  updateUI();

  console.log("Download complete - game is now installed");
});

window.api.onDownloadError((error) => {
  downloadMessage.textContent = `Error: ${error}`;

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
    `.progress-item[data-component="${component}"]`
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
      result.requiresRestart ? 5000 : 3000
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
    // Build detailed error message
    const issueMessages = data.issues
      .map((issue) => `• ${issue.message}`)
      .join("\n");
    const errorMessage = `Critical system requirements not met:\n\n${issueMessages}`;

    // Show error toast with details
    showToast(errorMessage, "error", 8000);

    console.error("[Launch Error] Critical issues:", data.issues);
  }
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

// ============================================================
// SRS_SHADOWRUN.DLL VERSION SWITCHING
// ============================================================

// Function to update button states
function updateSrsDllButtonStates(activeVersion) {
  if (activeVersion === "newer") {
    srsDllNewerButton.classList.add("active");
    srsDllOlderButton.classList.remove("active");
  } else if (activeVersion === "older") {
    srsDllNewerButton.classList.remove("active");
    srsDllOlderButton.classList.add("active");
  }
}

// Function to handle version switching
async function switchSrsDllVersion(targetVersion) {
  // Disable both buttons during operation
  srsDllNewerButton.disabled = true;
  srsDllOlderButton.disabled = true;

  // Add loading state to target button
  const targetButton =
    targetVersion === "newer" ? srsDllNewerButton : srsDllOlderButton;
  targetButton.classList.add("loading");

  try {
    const result = await window.api.switchSrsDllVersion(targetVersion);

    if (result.success) {
      // Update button states
      updateSrsDllButtonStates(targetVersion);

      // Show success toast
      showToast(result.message, "success");
    } else {
      // Show error toast
      showToast(result.message, "error", 5000);
    }
  } catch (error) {
    console.error("Error switching srs_shadowrun.dll version:", error);
    showToast("An unexpected error occurred", "error");
  } finally {
    // Re-enable buttons and remove loading state
    srsDllNewerButton.disabled = false;
    srsDllOlderButton.disabled = false;
    targetButton.classList.remove("loading");
  }
}

// Event listeners for segmented buttons
if (srsDllNewerButton) {
  srsDllNewerButton.addEventListener("click", () => {
    if (!srsDllNewerButton.classList.contains("active")) {
      switchSrsDllVersion("newer");
    }
  });
}

if (srsDllOlderButton) {
  srsDllOlderButton.addEventListener("click", () => {
    if (!srsDllOlderButton.classList.contains("active")) {
      switchSrsDllVersion("older");
    }
  });
}

// Progress handler for srs_shadowrun.dll switching
window.api.onSrsDllProgress((data) => {
  // Optional: Could add a progress indicator here if needed
  // For now, the loading state on the button is sufficient
  // Progress updates are silent - loading spinner on button shows activity
});

// Check current version on load
window.api
  .checkSrsDllVersion()
  .then((status) => {
    if (status.exists && status.version) {
      updateSrsDllButtonStates(status.version);
    }
  })
  .catch((error) => {
    console.error("Error checking srs_shadowrun.dll version:", error);
  });

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
          "http://157.245.214.234/launcher/changelog.json"
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
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; line-height: 1.8;">
      `;

      entry.notes.forEach((note) => {
        // Check if note has a dash separator (title - description format)
        const dashIndex = note.indexOf(" - ");

        if (dashIndex > 0) {
          // Split into title and description
          const title = note.substring(0, dashIndex).trim();
          const description = note.substring(dashIndex + 3).trim();

          // Parse markdown-style bold text for title
          const formattedTitle = title.replace(
            /\*\*([^*]+)\*\*/g,
            '<strong style="color: #60a5fa;">$1</strong>'
          );

          // Parse markdown-style bold text for description (if any)
          const formattedDescription = description.replace(
            /\*\*([^*]+)\*\*/g,
            '<strong style="color: #60a5fa;">$1</strong>'
          );

          html += `
            <li style="margin-bottom: 8px; color: rgba(255, 255, 255, 0.8); padding-left: 20px; position: relative;">
              <span style="position: absolute; left: 0; color: #60a5fa;">•</span>
              <div style="margin-bottom: 2px;">
                ${formattedTitle}
              </div>
              <div style="padding-left: 20px; color: rgba(255, 255, 255, 0.6); font-size: 12px; line-height: 1.5;">
                ${formattedDescription}
              </div>
            </li>
          `;
        } else {
          // No dash separator - render as single line (backwards compatibility)
          const formattedNote = note.replace(
            /\*\*([^*]+)\*\*/g,
            '<strong style="color: #60a5fa;">$1</strong>'
          );

          html += `
          <li style="margin-bottom: 4px; color: rgba(255, 255, 255, 0.8); padding-left: 20px; position: relative;">
            <span style="position: absolute; left: 0; color: #60a5fa;">•</span>
            ${formattedNote}
          </li>
        `;
        }
      });

      html += `
          </ul>
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
  // Only check if we think the game is installed (to avoid unnecessary checks)
  if (gameInstalled) {
    console.log("[Window Focus] Re-checking game installation status...");
    const checkResult = await window.api.checkGameInstalled();
    // Check if game files exist (not all dependencies - user might have game files but missing GFWL/DirectX)
    if (!checkResult.dependencies?.gameFiles) {
      console.warn("[Window Focus] Game files no longer found, updating UI");
      gameInstalled = false;
      updateUI();
      showToast(
        "Game files not found. Please browse for your game folder in Settings.",
        "error",
        5000
      );
    } else if (checkResult.path) {
      // Game files found - update gameInstalled flag to true if it was false
      // This handles the case where user selected a custom path and window regains focus
      if (!gameInstalled) {
        console.log("[Window Focus] Game files found, updating UI");
        gameInstalled = true;
        updateUI();
      }
    }
  }
});

// Keep this block (replaces your current DOMContentLoaded block)
document.addEventListener("DOMContentLoaded", function () {
  console.log("[Renderer] DOMContentLoaded fired.");
  const openGameDirButton = document.getElementById("openGameDirButton");

  if (openGameDirButton) {
    console.log("Found Open Game Dir button!");

    openGameDirButton.addEventListener("click", async function () {
      console.log("Button clicked!");

      // If game is not installed, browse for existing game instead
      if (!gameInstalled) {
        try {
          openGameDirButton.disabled = true;
          openGameDirButton.textContent = "Searching...";

          const result = await window.api.browseForExistingGame();

          if (result.success) {
            showToast("✓ Game found!", "success", 3000);
            // The game-installation-status event will be triggered automatically
            // which will update the UI
          } else if (!result.canceled) {
            showToast(
              result.error || "Game files not found in selected folder",
              "error",
              4000
            );
          }

          openGameDirButton.disabled = false;
          // Button text will be updated by updateUI() when game-installation-status event fires
        } catch (error) {
          console.error("[Browse Game] Error:", error);
          showToast(`Error: ${error.message}`, "error", 4000);
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
  "Test functions added - you can run window.testIpcDirectly() in the console"
);

// ========================================
// LAUNCHER UPDATE UI HANDLERS
// ========================================

// Get launcher update UI elements (OLD CODE - WILL BE REPLACED)
const launcherUpdateProgressScreen = document.getElementById(
  "launcherUpdateProgressScreen"
);
const launcherUpdateProgress = document.getElementById(
  "launcherUpdateProgress"
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
      "Downloading launcher update. You can continue using the launcher.";
  }
});

// Listen for update download progress
window.api.onUpdateDownloadProgress((progress) => {
  console.log(`[Renderer] Update download progress: ${progress.percent}%`);
  if (launcherUpdateProgress) {
    launcherUpdateProgress.style.width = `${progress.percent}%`;
  }
  if (launcherUpdateStatus) {
    launcherUpdateStatus.textContent = `Downloading... ${progress.percent}%`;
  }
  if (launcherUpdateDetails) {
    // Format bytes to MB
    const transferredMB = (progress.transferred / 1024 / 1024).toFixed(2);
    const totalMB = (progress.total / 1024 / 1024).toFixed(2);
    launcherUpdateDetails.textContent = `${transferredMB} MB / ${totalMB} MB`;
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
  "updateAvailableIndicator"
);

// Store pending update data
let pendingUpdateData = null;
let updateToastId = null; // Track the update progress toast

// Listen for SILENT update available (automatic background download)
window.api.onUpdateAvailableSilent((data) => {
  console.log("");
  console.log("=================================================");
  console.log("🔄 UPDATE AVAILABLE - DOWNLOADING IN BACKGROUND");
  console.log("=================================================");
  console.log("[Renderer] Current version:", data.currentVersion);
  console.log("[Renderer] New version:", data.version);
  console.log("[Renderer] Starting automatic download...");

  // Store update data
  pendingUpdateData = data;

  // Show a persistent toast with progress
  updateToastId = showUpdateToast(
    `Downloading update v${data.version}... 0%`,
    "info",
    0, // 0 = persistent toast
    true // show progress bar
  );
});

// Listen for update available from manual check (show dialog for manual checks)
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

  // Show the dialog
  if (updateDialog) {
    updateDialog.classList.add("visible");
  }

  // (OLD CODE REMOVED - Button will be recreated)
});

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
  showToast("You're on the latest version! ✓", "success", 4000);

  console.log("");
  console.log("=================================================");
  console.log("");
});

// Rollback Dialog Handlers
const rollbackDialog = document.getElementById("rollbackDialog");
const rollbackCurrentVersion = document.getElementById(
  "rollbackCurrentVersion"
);
const rollbackTargetVersion = document.getElementById("rollbackTargetVersion");
const rollbackReason = document.getElementById("rollbackReason");
const rollbackDownloadButton = document.getElementById(
  "rollbackDownloadButton"
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

// Listen for dev mode (update checker disabled in development)
window.api.onUpdateCheckDevMode(() => {
  console.log("");
  console.log("=================================================");
  console.log("🔧 DEV MODE RESPONSE RECEIVED");
  console.log("=================================================");
  console.log("[Renderer] Auto-updater is disabled in development mode");
  console.log("[Renderer] Time:", new Date().toLocaleTimeString());

  // Show toast notification
  showToast("Auto-updater is disabled in development mode", "info", 5000);

  console.log("=================================================");
});

// ========================================
// SILENT UPDATE PROGRESS HANDLERS
// ========================================

// Listen for download progress and update the toast
window.api.onUpdateDownloadProgress((progress) => {
  console.log(`[Renderer] Update download progress: ${progress.percent}%`);

  if (updateToastId) {
    const messageEl = updateToastId.querySelector(".toast-message");
    const progressFill = updateToastId.querySelector(".toast-progress-fill");

    if (messageEl && pendingUpdateData) {
      messageEl.textContent = `Downloading update v${pendingUpdateData.version}... ${progress.percent}%`;
    }
    if (progressFill) {
      progressFill.style.width = `${progress.percent}%`;
    }
  }
});

// Listen for download complete
window.api.onUpdateDownloadedSilent((data) => {
  console.log("");
  console.log("=================================================");
  console.log("✅ UPDATE DOWNLOADED - INSTALLING SILENTLY");
  console.log("=================================================");
  console.log("[Renderer] Update will install automatically in 3 seconds");

  // Remove the progress toast
  if (updateToastId) {
    updateToastId.classList.remove("show");
    setTimeout(() => updateToastId.remove(), 300);
    updateToastId = null;
  }

  // Show a completion toast
  showToast(
    `Update v${data.version} downloaded! Launcher will restart in 3 seconds...`,
    "success",
    3000
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

    // Re-show the update dialog with stored data
    if (pendingUpdateData && updateDialog) {
      // Update dialog content
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

      // Show the dialog
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

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================

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
  showProgress = false
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
      showToast("Failed to check for updates. Please try again.", "error");

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
        showToast(
          `❌ Error running diagnostics: ${result.error}`,
          "error",
          5000
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
        `❌ Failed to run diagnostics: ${error.message}`,
        "error",
        5000
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
              diag.directX
            )};">
              <span style="font-size: 13px;">DirectX 9+</span>
              <span style="color: ${statusColor(
                diag.directX
              )}; font-weight: 600;">${statusIcon(diag.directX)} ${statusText(
    diag.directX
  )}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor(
              diag.licenseManager
            )};">
              <span style="font-size: 13px;">License Manager Service</span>
              <span style="color: ${statusColor(
                diag.licenseManager
              )}; font-weight: 600;">${statusIcon(diag.licenseManager)} ${
    diag.licenseManager ? "Running" : "Not Running"
  }</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor(
              diag.xboxNetworking
            )};">
              <span style="font-size: 13px;">Xbox Live Networking Service</span>
              <span style="color: ${statusColor(
                diag.xboxNetworking
              )}; font-weight: 600;">${statusIcon(diag.xboxNetworking)} ${
    diag.xboxNetworking ? "Running" : "Not Running"
  }</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor(
              diag.gpuDrivers
            )};">
              <span style="font-size: 13px;">GPU Drivers</span>
              <span style="color: ${statusColor(
                diag.gpuDrivers
              )}; font-weight: 600;">${statusIcon(
    diag.gpuDrivers
  )} ${statusText(diag.gpuDrivers)}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor(
              diag.dotNet.installed
            )};">
              <span style="font-size: 13px;">.NET Framework 3.5</span>
              <span style="color: ${statusColor(
                diag.dotNet.installed
              )}; font-weight: 600;">${statusIcon(diag.dotNet.installed)} ${
    diag.dotNet.installed ? diag.dotNet.version : "Not Installed"
  }</span>
            </div>
          </div>
        </div>
        
        <!-- Network & Connectivity -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; color: #10b981; margin-bottom: 12px; font-weight: 600;">🌐 Network & Connectivity</h3>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; text-align: center;">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Internet</div>
              <div style="color: ${statusColor(
                diag.network.online
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
                diag.natType.type
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
                  `<div style="font-size: 12px; margin-bottom: 4px;">• ${fix}</div>`
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
            `
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
async function detectAndDisplaySystemInfo(shouldShowToast = true) {
  if (detectSystemButton) detectSystemButton.disabled = true;
  if (gpuInfo) gpuInfo.textContent = "Detecting...";
  if (cpuInfo) cpuInfo.textContent = "Detecting...";
  if (osInfo) osInfo.textContent = "Detecting...";
  if (natInfo) natInfo.textContent = "Detecting...";

  try {
    const result = await window.api.getSystemInfo();
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
        let vendorNote = "";
        if (system.gpu.vendor === "amd") {
          vendorNote =
            "\n\nℹ️ AMD GPU detected: Enhanced FPS limiting is enabled for better compatibility.";
        } else if (system.gpu.vendor === "nvidia") {
          vendorNote =
            "\n\nℹ️ NVIDIA GPU detected: Standard DXVK FPS limiting is being used.";
        }

        if (vendorNote) {
          showToast(`System detected!${vendorNote}`, "info", 5000);
        } else {
          showToast("System information detected!", "success", 3000);
        }
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

// Detect System button handler (shows toast on manual click)
if (detectSystemButton) {
  detectSystemButton.addEventListener("click", () =>
    detectAndDisplaySystemInfo(true)
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
              systemText
          );
        }
        document.body.removeChild(textArea);
      });
  });
}

// Fix License Manager
const fixLicenseManagerButton = document.getElementById(
  "fixLicenseManagerButton"
);
if (fixLicenseManagerButton) {
  fixLicenseManagerButton.addEventListener("click", async () => {
    console.log("[License Manager] Attempting fix...");
    const originalText = fixLicenseManagerButton.textContent;
    fixLicenseManagerButton.disabled = true;
    fixLicenseManagerButton.textContent = "Fixing...";

    try {
      const result = await window.api.fixLicenseManager();
      console.log("[License Manager] Result:", result);

      if (result.success) {
        if (result.alreadyRunning) {
          showToast(
            "✅ License Manager service is already running!",
            "success",
            4000
          );
        } else {
          showToast(
            "✅ Successfully started Windows License Manager service!",
            "success",
            4000
          );
        }
      } else {
        if (result.needsAdmin) {
          alert(
            `⚠️ Administrator privileges required\n\n${result.message}\n\nPlease run the launcher as Administrator or manually start the service through services.msc`
          );
        } else {
          alert(`❌ Error: ${result.message || result.error}`);
        }
      }
    } catch (error) {
      console.error("[License Manager] Error:", error);
      alert(`Failed to fix License Manager: ${error.message}`);
    } finally {
      fixLicenseManagerButton.disabled = false;
      fixLicenseManagerButton.textContent = originalText;
    }
  });
}

// Restart Xbox Live Networking Service
const restartXboxNetworkingButton = document.getElementById(
  "restartXboxNetworkingButton"
);
if (restartXboxNetworkingButton) {
  restartXboxNetworkingButton.addEventListener("click", async () => {
    console.log("[Xbox Networking] Attempting restart...");
    const originalText = restartXboxNetworkingButton.textContent;
    restartXboxNetworkingButton.disabled = true;
    restartXboxNetworkingButton.textContent = "Requesting UAC...";

    try {
      const result = await window.api.restartXboxNetworking();
      console.log("[Xbox Networking] Result:", result);

      if (result.success) {
        // Show detailed success message with status transition
        const message =
          result.message ||
          "Successfully restarted Xbox Live Networking service!";
        showToast(`✅ ${message}`, "success", 5000);
      } else if (result.cancelled) {
        // User cancelled UAC prompt
        showToast("⚠️ UAC prompt was cancelled", "warning", 3000);
      } else if (result.isDisabled) {
        // Service is disabled
        alert(
          `⚠️ Service is Disabled\n\n${result.message}\n\nHow to enable:\n1. Press Win + R and type: services.msc\n2. Find "Xbox Live Networking Service"\n3. Right-click → Properties\n4. Set "Startup type" to "Manual" or "Automatic"\n5. Click "Apply", then "Start"\n6. Click "OK"`
        );
      } else {
        // Other error
        alert(`❌ Error\n\n${result.message || result.error}`);
      }
    } catch (error) {
      console.error("[Xbox Networking] Error:", error);
      alert(`Failed to restart Xbox Live Networking service: ${error.message}`);
    } finally {
      restartXboxNetworkingButton.disabled = false;
      restartXboxNetworkingButton.textContent = originalText;
    }
  });
}

// Run SFC Scan
const runSfcScanButton = document.getElementById("runSfcScanButton");
if (runSfcScanButton) {
  runSfcScanButton.addEventListener("click", async () => {
    console.log("[SFC] Running System File Checker...");

    const confirm = window.confirm(
      "This will open a Command Prompt window and run the System File Checker.\n\n" +
        "🔒 A UAC prompt will appear - click 'Yes' to grant Administrator privileges.\n\n" +
        "⚠️ This may take 10-15 minutes to complete.\n\n" +
        "The scan will check for corrupted Windows system files and repair them.\n\n" +
        "Continue?"
    );

    if (!confirm) return;

    try {
      const result = await window.api.runSfcScan();
      console.log("[SFC] Result:", result);

      if (result.success) {
        // No toast needed - the command prompt window opening is sufficient feedback
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("[SFC] Error:", error);
      alert(`Failed to run SFC scan: ${error.message}`);
    }
  });
}

// Open Windows Update
const openWindowsUpdateButton = document.getElementById(
  "openWindowsUpdateButton"
);
const driverUpdateDescription = document.getElementById(
  "driverUpdateDescription"
);

// Update button text and description based on detected GPU
async function updateDriverUpdateButton() {
  if (!openWindowsUpdateButton || !driverUpdateDescription) return;

  try {
    const gpuResult = await window.api.getGpuInfo();
    if (gpuResult.success && gpuResult.gpu) {
      const vendor = gpuResult.gpu.vendor.toLowerCase();
      const gpuName = gpuResult.gpu.name;

      if (vendor === "nvidia") {
        openWindowsUpdateButton.textContent = "Open NVIDIA App";
        driverUpdateDescription.textContent = `Opens NVIDIA App to update drivers for ${gpuName}`;
      } else if (vendor === "amd") {
        openWindowsUpdateButton.textContent = "Open AMD Software";
        driverUpdateDescription.textContent = `Opens AMD Software: Adrenalin Edition to update drivers for ${gpuName}`;
      } else {
        openWindowsUpdateButton.textContent = "Open Windows Update";
        driverUpdateDescription.textContent = `Opens Windows Update to install optional driver updates for ${gpuName}`;
      }
    }
  } catch (error) {
    console.error("[Driver Updates] Error detecting GPU:", error);
    // Keep default text if detection fails
  }
}

// Update button text when settings screen opens
if (openWindowsUpdateButton) {
  // Update on initial load
  updateDriverUpdateButton();

  openWindowsUpdateButton.addEventListener("click", async () => {
    console.log("[Driver Updates] Opening driver update software...");

    try {
      const result = await window.api.openWindowsUpdate();
      if (result.success) {
        // No toast needed - the application opening is sufficient feedback
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("[Driver Updates] Error:", error);
      alert(`Failed to open driver update software: ${error.message}`);
    }
  });
}
