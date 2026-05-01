/**
 * Copies NSIS wizard bitmaps into build/ using the filenames electron-builder
 * resolves by default (installerHeader.bmp / installerSidebar.bmp).
 *
 * Source assets live under app/assets/ so the game/app can reuse them; the
 * installer step expects stable names under build/. Run from prebuild.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC_HEADER = path.join(ROOT, "app", "assets", "title_logo.bmp");
const SRC_SIDEBAR = path.join(ROOT, "app", "assets", "launcher.bmp");
const DEST_HEADER = path.join(ROOT, "build", "installerHeader.bmp");
const DEST_SIDEBAR = path.join(ROOT, "build", "installerSidebar.bmp");

function copyIfPresent(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[installer-bitmaps] Skip ${label}: missing ${src}`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[installer-bitmaps] ${label}: ${path.relative(ROOT, dest)}`);
  return true;
}

copyIfPresent(SRC_HEADER, DEST_HEADER, "Header");
copyIfPresent(SRC_SIDEBAR, DEST_SIDEBAR, "Sidebar");
