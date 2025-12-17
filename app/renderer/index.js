// AT THE VERY TOP OF THE FILE:
console.log("[Renderer] index.js script execution started.");

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

// Try to add an event listener directly when the script loads
setTimeout(() => {
  console.log("Trying to attach button handler directly");
  const btn = document.getElementById("openGameDirButton");
  if (btn) {
    console.log("Found button, attaching direct click handler");
    btn.onclick = function () {
      console.log("DIRECT CLICK HANDLER FIRED");
      try {
        window.api.openGameDirectory();
      } catch (err) {
        console.error("Error in direct handler:", err);
      }
    };
  } else {
    console.error("Button not found in setTimeout");
  }
}, 1000);

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
console.log("Open Game Dir Button found:", !!openGameDirButton);

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

  // Update settings screen state based on game installation
  if (gameInstalled) {
    // Enable skip intro button
    skipIntroButton.disabled = false;
  } else {
    // Disable skip intro button
    skipIntroButton.disabled = true;
    skipIntroButton.classList.remove("installed");
    skipIntroButton.textContent = "Install Mod";
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
  // If game is not installed, start download
  if (playButton.textContent === "Download") {
    // Show the download progress screen
    downloadProgressScreen.classList.add("visible");

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
  }
  // First check if button is disabled or if game is running
  if (playButton.disabled || gameRunning) {
    console.log("Button clicked while disabled or game running, ignoring...");
    return; // Exit early, don't process the click
  }

  if (gameInstalled) {
    console.log("Launching game...");
    window.api.launchGame(settings);
  } else {
    console.log("Downloading game...");
    // Reset progress bars
    gameFilesProgress.style.width = "0%";
    gfwlProgress.style.width = "0%";
    dxProgress.style.width = "0%";
    gameFilesStatus.textContent = "Waiting...";
    gfwlStatus.textContent = "Waiting...";
    dxStatus.textContent = "Waiting...";
    downloadMessage.textContent =
      "Preparing installation... This may take a few minutes.";

    // Start download
    window.api.downloadGame();
  }
});

activateButton.addEventListener("click", async () => {
  console.log("Activation requested...");

  // Show confirmation dialog
  const confirmActivation = confirm(
    "Are you sure you want to activate the game?\n\nNote: If you have any other GFWL games, this may cause them to require re-activation."
  );

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

  // Check mod status whenever settings are opened
  window.api.checkSkipIntroStatus().then((status) => {
    updateSkipIntroButtonState(status.installed);
  });
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
  openDiagnosticsButton.addEventListener("click", () => {
    diagnosticsScreen.classList.add("visible");

    // Auto-detect system info when diagnostics opens (silently, no toast)
    detectAndDisplaySystemInfo(false);
  });
}

if (closeDiagnosticsButton && diagnosticsScreen) {
  closeDiagnosticsButton.addEventListener("click", () => {
    diagnosticsScreen.classList.remove("visible");
  });
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

dxvkToggle.addEventListener("change", () => {
  settings.dxvk = dxvkToggle.checked;
  saveSettings();

  // Apply the cooldown after toggling
  applyCooldown(dxvkToggle);
});

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
  dxvkToggle.checked = settings.dxvk;

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
  // Add a close button to the download screen
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.className = "settings-action-button";
  closeBtn.style.marginTop = "20px";
  closeBtn.onclick = () => downloadProgressScreen.classList.remove("visible");
  document.querySelector(".download-message").appendChild(closeBtn);
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
    feedback.textContent = "FPS setting saved successfully!";
    feedback.classList.add("visible");

    // Hide after 3 seconds
    setTimeout(() => {
      feedback.classList.remove("visible");
    }, 3000);
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

// Update the element verification check
console.log("UI elements found:", {
  skipIntroButton: !!skipIntroButton,
  dxvkToggle: !!dxvkToggle,
});

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

// Keep this block (replaces your current DOMContentLoaded block)
document.addEventListener("DOMContentLoaded", function () {
  console.log("[Renderer] DOMContentLoaded fired.");
  const openGameDirButton = document.getElementById("openGameDirButton");

  if (openGameDirButton) {
    console.log("Found Open Game Dir button!");

    openGameDirButton.addEventListener("click", function () {
      console.log("Button clicked!");

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

  btn.addEventListener("click", async function handleCheckUpdatesClick() {
    console.log("");
    console.log("=================================================");
    console.log("🔍 CHECK FOR UPDATES BUTTON CLICKED!");
    console.log("=================================================");
    console.log("Time:", new Date().toLocaleTimeString());

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
  modal.className = "modal-screen visible";
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
    <div class="modal-content" style="max-width: 550px;">
      <div class="modal-header" style="background: rgba(15, 23, 42, 0.95);">
        <h2>🔍 Diagnostic Results</h2>
        <button class="close-button" onclick="this.closest('.modal-screen').remove()">×</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        
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
        "⚠️ This requires Administrator privileges and may take 10-15 minutes.\n\n" +
        "The scan will check for corrupted Windows system files and repair them.\n\n" +
        "Continue?"
    );

    if (!confirm) return;

    try {
      const result = await window.api.runSfcScan();
      console.log("[SFC] Result:", result);

      if (result.success) {
        showToast(
          "✅ System File Checker launched! Check the Command Prompt window.",
          "success",
          6000
        );
      } else if (result.needsAdmin) {
        alert(
          "⚠️ Administrator privileges required\n\nPlease run the launcher as Administrator to use System File Checker."
        );
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
if (openWindowsUpdateButton) {
  openWindowsUpdateButton.addEventListener("click", async () => {
    console.log("[Windows Update] Opening Windows Update settings...");

    try {
      const result = await window.api.openWindowsUpdate();
      if (result.success) {
        showToast(
          "✅ Opening Windows Update... Check for Optional Updates for GPU drivers.",
          "info",
          5000
        );
      } else {
        alert(`Error opening Windows Update: ${result.error}`);
      }
    } catch (error) {
      console.error("[Windows Update] Error:", error);
      alert(`Failed to open Windows Update: ${error.message}`);
    }
  });
}
