// Service probes for pre-launch diagnostics and the persistent-issues panel.
//
//   - licenseManager.js  - LicenseManager service probe (check-only)
//   - xboxNetworking.js  - XboxNetApiSvc probe (check-only)
//
// The UAC-elevated fix paths and SFC scan have been removed. Use services.msc
// to manually start "LicenseManager" or "XboxNetApiSvc" if they are stopped.

const {
  checkWindowsLicenseManagerService,
} = require("./licenseManager");
const {
  checkXboxLiveNetworkingService,
} = require("./xboxNetworking");

module.exports = {
  checkWindowsLicenseManagerService,
  checkXboxLiveNetworkingService,
};
