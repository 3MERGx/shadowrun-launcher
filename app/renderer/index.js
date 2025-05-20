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

// DOM Elements
const playButton = document.getElementById("playButton");
const activateButton = document.getElementById("activateButton");
const discordButton = document.getElementById("discordButton");
const websiteButton = document.getElementById("websiteButton");
const settingsButton = document.getElementById("settingsButton");
const minimizeButton = document.getElementById("minimizeButton");
const closeButton = document.getElementById("closeButton");

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
minimizeButton.addEventListener("click", () => {
  window.api.minimizeWindow();
});

closeButton.addEventListener("click", async () => {
  window.api.closeWindow();
});

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
    gameFilesStatus.textContent = "0%";
    gfwlStatus.textContent = "0%";
    dxStatus.textContent = "0%";
    downloadMessage.textContent = "Starting downloads...";

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
  } else {
    skipIntroButton.textContent = "Install Mod";
    skipIntroButton.classList.remove("installed");
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

// Download progress event listeners
window.api.onGameFilesProgress((progress) => {
  gameFilesProgress.style.width = `${progress}%`;
  gameFilesStatus.textContent = `${progress}%`;
});

window.api.onGfwlProgress((progress) => {
  gfwlProgress.style.width = `${progress}%`;
  gfwlStatus.textContent = `${progress}%`;
});

window.api.onDxProgress((progress) => {
  dxProgress.style.width = `${progress}%`;
  dxStatus.textContent = `${progress}%`;
});

window.api.onDownloadMessage((message) => {
  downloadMessage.textContent = message;
});

window.api.onDownloadComplete(() => {
  // Close download screen and show instructions
  downloadProgressScreen.classList.remove("visible");
  instructionsScreen.classList.add("visible");

  // Update game installed state
  gameInstalled = true;
  updateUI();
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

// When updating the skip intro button state:
ipcRenderer.on("skip-intro-final-state", (event, state) => {
  const button = document.getElementById("skipIntroButton");
  if (state.installed) {
    // If we detect it was manually installed (has our marker file)
    if (
      fs.existsSync(
        path.join(
          GAME_INSTALL_DIR,
          "Resources",
          "BackupIntro",
          "installed_externally.txt"
        )
      )
    ) {
      button.textContent = "Detected (Manual Install)";
      button.disabled = true; // Optional: disable the button or add a different behavior
    } else {
      button.textContent = "Uninstall Mod";
    }
  } else {
    button.textContent = "Install Mod";
  }
});

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

// Add this near the top of your file to make functions globally available
console.log("Setting up PCID backup functions...");

// Clean up and simplify the PCID backup click handler
window.handlePcidBackupClick = async function () {
  console.log("[Renderer] handlePcidBackupClick was CALLED!");
  alert("PCID Backup Clicked!"); // Simple feedback
  // Temporarily comment out the rest of the function's logic
  /*
  console.log(
    "[Renderer] PCID Backup button clicked. Attempting to call window.api.backupPcid()."
  );

  // Get UI elements
  const backupPcidButton = document.getElementById("backupPcidButton");
  const pcidBackupFeedback = document.getElementById("pcidBackupFeedback");
  const pcidBackupStatus = document.getElementById("pcidBackupStatus");
  const currentPcidDisplay = document.getElementById("currentPcidDisplay");

  // Disable the button to prevent multiple clicks
  backupPcidButton.disabled = true;

  // Show loading status
  pcidBackupStatus.textContent = "Backing up PCID...";
  currentPcidDisplay.textContent = ""; // Clear previous backup display

  try {
    console.log("[Renderer] Calling window.api.backupPcid()...");
    const result = await window.api.backupPcid(); // This is the IPC call
    console.log(
      "[Renderer] window.api.backupPcid() returned:",
      JSON.stringify(result, null, 2)
    );

    if (result && result.success) {
      pcidBackupStatus.textContent = "PCID backed up successfully!";
      if (result.backupPcid) {
        currentPcidDisplay.textContent = `Backup Value: 0x${result.backupPcid}`;
      } else if (result.verifiedValue) {
        // From direct method
        currentPcidDisplay.textContent = `Backup Value (verified): ${result.verifiedValue}`;
      }
      // Dialogs for success are now handled in main.js by registryDirectService
    } else {
      pcidBackupStatus.textContent =
        "Backup failed. See details above or check logs.";
      if (result && result.error) {
        console.error("[Renderer] Backup failed with error:", result.error);
        // Dialogs for failure are now handled in main.js
      } else {
        console.error(
          "[Renderer] Backup failed with no specific error message from main process."
        );
      }
    }
  } catch (error) {
    console.error(
      "[Renderer] Exception during window.api.backupPcid() call:",
      error
    );
    pcidBackupStatus.textContent = "Error during backup. Check console.";
    // Show a generic error dialog from renderer if IPC itself fails badly
    alert(`An error occurred while trying to backup PCID: ${error.message}`);
  } finally {
    // Re-enable the button
    backupPcidButton.disabled = false;
    console.log("[Renderer] PCID Backup process finished.");
  }
  */
};

// Make sure the button has a click handler
document.addEventListener("DOMContentLoaded", function () {
  const backupPcidButton = document.getElementById("backupPcidButton");
  if (backupPcidButton) {
    // The onclick="handlePcidBackupClick()" in HTML makes this redundant for the click
    // but it's good for verifying the button exists.
    // backupPcidButton.addEventListener("click", window.handlePcidBackupClick);
    console.log("[Renderer] PCID Backup button found in DOM.");
  } else {
    console.error("[Renderer] BackupPcidButton not found in DOM!");
  }
});

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
