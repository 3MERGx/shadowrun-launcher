// Xbox Live Networking Service (XboxNetApiSvc) - probe only.
//
// Detects whether the XboxNetApiSvc service is running on Windows 10/11.
// Called from pre-launch diagnostics and the persistent-issues panel.
// The UAC-elevated restart path has been removed; users can restart the
// service manually via services.msc if it is stopped.

const { exec } = require("child_process");

async function checkXboxLiveNetworkingService() {
  return new Promise((resolve) => {
    exec("sc query XboxNetApiSvc", { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve({ running: false, exists: false });
        return;
      }

      const isRunning = stdout && stdout.includes("RUNNING");
      const isStopped = stdout && stdout.includes("STOPPED");

      if (isRunning) {
        resolve({ running: true, exists: true });
      } else if (isStopped) {
        resolve({ running: false, exists: true });
      } else {
        resolve({ running: false, exists: true });
      }
    });
  });
}

module.exports = {
  checkXboxLiveNetworkingService,
};
