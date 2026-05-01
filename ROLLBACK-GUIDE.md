# Rollback System Guide

## Overview

The rollback system allows you to force users to downgrade to a previous stable version if a critical bug is discovered in a recent release.

## How It Works

1. **User launches launcher** → Checks for updates
2. **Launcher reads `rollback.json`** → If `enabled: true`, checks if rollback needed
3. **Smart Version Check** → Only shows rollback if user is on NEWER version than target
4. **User confirms** → Downloads and installs previous version
5. **User clicks "Later"** → Update link persists next to version number

### 🛡️ Smart Rollback Protection

The system includes **automatic safety checks**:

- ✅ Only triggers rollback if user's version > target version
- ✅ Skips rollback if user already on target version or older
- ✅ Falls through to normal update check if no rollback needed
- ✅ Won't interfere with newer releases (see "What If I Forget?" below)

---

## Setup Instructions

### Step 1: Keep Multiple Versions on Your Server

Store all versions in your launcher directory:

```
https://downloads.shadowrunfps.com/launcher/
├── latest.yml (points to current version)
├── Shadowrun FPS Launcher Setup 0.9.0.exe
├── Shadowrun FPS Launcher Setup 0.9.1.exe
├── Shadowrun FPS Launcher Setup 0.9.2.exe
└── rollback.json (controls rollback)
```

### Step 2: Create `rollback.json`

Create a file at: `https://downloads.shadowrunfps.com/launcher/rollback.json`

**Normal State (No Rollback):**

```json
{
  "enabled": false,
  "targetVersion": "0.9.0",
  "reason": "",
  "forced": false
}
```

**Rollback Active:**

```json
{
  "enabled": true,
  "targetVersion": "0.9.0",
  "reason": "Critical bug found in 0.9.1 - rolling back to stable version",
  "forced": false
}
```

---

## Configuration Options

| Field           | Type    | Description                                      |
| --------------- | ------- | ------------------------------------------------ |
| `enabled`       | boolean | Set to `true` to activate rollback mode          |
| `targetVersion` | string  | The version to rollback to (must match filename) |
| `reason`        | string  | User-friendly explanation shown in dialog        |
| `forced`        | boolean | (Future) If true, auto-downloads without prompt  |

---

## ⚠️ What If I Forget to Disable Rollback?

**Short Answer:** It's safe! The smart version check prevents issues.

### Scenario Breakdown:

#### ✅ Scenario 1: Forgot to Disable, User Already Rolled Back

```json
// rollback.json (still enabled)
{ "enabled": true, "targetVersion": "0.9.1" }

// User is on v0.9.1
```

**What Happens:**

- User clicks "Check for Updates"
- System sees rollback enabled
- **Smart check:** Current (0.9.1) = Target (0.9.1) → Skip rollback
- Falls through to normal update check
- **Result:** No rollback dialog shown ✓

#### ✅ Scenario 2: Forgot to Disable, Released New Version

```json
// rollback.json (still enabled - FORGOT TO DISABLE!)
{ "enabled": true, "targetVersion": "0.9.1" }

// latest.yml points to v0.9.3 (new fixed version)
// User is on v0.9.1
```

**What Happens:**

- User clicks "Check for Updates"
- System sees rollback enabled
- **Smart check:** Current (0.9.1) = Target (0.9.1) → Skip rollback
- Falls through to normal update check
- Sees update to 0.9.3 available
- **Result:** Normal update flow works! ✓

#### ⚠️ Scenario 3: Forgot to Update latest.yml

```json
// rollback.json (disabled)
{ "enabled": false }

// latest.yml STILL points to v0.9.2 (broken version!)
// User is on v0.9.1 (safe)
```

**What Happens:**

- User clicks "Check for Updates"
- Rollback disabled, goes to normal update check
- Sees "update" to 0.9.2 (the broken version!)
- **Result:** User might re-install broken version ✗

**Solution:** Always update `latest.yml` when disabling rollback!

---

## 🤖 Automation Options

You have two ways to manage rollback completion:

### Option 1: Manual (Simple, Recommended for Small User Base)

1. Enable rollback in `rollback.json`
2. Wait a few days for users to rollback
3. Manually check your player tracking API: `https://playertracker-production.up.railway.app/api/stats`
4. When most users are on safe version:
   - Update `latest.yml` to target version
   - Disable rollback: `enabled: false`
5. Release your fixed version

**Time Investment:** ~5 minutes every few days

---

### Option 2: Automated Monitoring (For Larger User Bases)

Use the included `rollback-automation.js` script to:

- ✅ Monitor rollback progress in real-time
- ✅ Show version distribution across users
- ✅ Auto-update files when threshold reached (optional)

#### Setup:

1. **Install script on your server** (where you host launcher files):

```bash
# Copy rollback-automation.js to your server
scp rollback-automation.js user@your-server.example:/path/to/launcher/

# Or if running locally, update CONFIG.LOCAL_FILES paths
```

2. **Edit configuration** in `rollback-automation.js`:

```javascript
const CONFIG = {
  TRACKING_API: "https://playertracker-production.up.railway.app/api/stats",
  ROLLBACK_CONFIG_URL: "https://downloads.shadowrunfps.com/launcher/rollback.json",
  THRESHOLD_PERCENTAGE: 95, // Auto-disable when 95% on safe version
  CHECK_INTERVAL: 300, // Check every 5 minutes
  LOCAL_FILES: {
    ROLLBACK_JSON: "/var/www/html/launcher/rollback.json",
    LATEST_YML: "/var/www/html/launcher/latest.yml",
  },
};
```

3. **Run in monitor-only mode** (just watch progress):

```bash
node rollback-automation.js --monitor-only
```

**Output:**

```
======================================================================
Rollback Progress Check - 12/16/2024, 3:30:00 PM
======================================================================

📋 Rollback Target: v0.9.1
   Reason: Critical bug fixed - please rollback to stable version

👥 Active Players: 87

📊 Version Distribution:
   ✓ v0.9.0: 3 users (3.4%) - SAFE
   ✓ v0.9.1: 78 users (89.7%) - SAFE
   ⚠ v0.9.2: 6 users (6.9%) - NEEDS ROLLBACK

----------------------------------------------------------------------
📈 Rollback Progress: 93.1% (81/87 users safe)
   Threshold: 95%

⏳ Still rolling back... 6 users still need to update
======================================================================
```

4. **Optional: Enable auto-update** (updates files automatically):

```bash
node rollback-automation.js --auto-update
```

When threshold is reached:

- ✅ Automatically updates `latest.yml` to target version
- ✅ Automatically disables rollback in `rollback.json`
- ✅ Exits with success message

**Time Investment:** Zero! Set it and forget it.

---

## Usage Scenarios

### Scenario 1: Critical Bug in Latest Release

**Problem:** Version 0.9.2 has a game-breaking bug

**Solution:**

1. Update `rollback.json`:

```json
{
  "enabled": true,
  "targetVersion": "0.9.1",
  "reason": "Critical crash bug fixed - rolling back to stable 0.9.1",
  "forced": false
}
```

2. Users will see rollback dialog on next launch or when clicking "Check for Updates"

3. **Monitor rollback progress** (choose one):

   - **Manual:** Check `https://playertracker-production.up.railway.app/api/stats` daily
   - **Automated:** Run `node rollback-automation.js --monitor-only`

4. **When most users have rolled back** (90%+ recommended):

   **Option A - Manual:**

   ```bash
   # Update latest.yml to point to 0.9.1
   # (Update version, sha512, etc. to match 0.9.1 installer)

   # Disable rollback in rollback.json:
   { "enabled": false, "targetVersion": "0.9.1" }
   ```

   **Option B - Automated:**

   ```bash
   # Script automatically updates both files when threshold reached
   node rollback-automation.js --auto-update
   ```

5. **Release your fixed version** (e.g., 0.9.3):
   - Build new version with bug fix
   - Upload to server
   - Run `npm run build:win` to generate new `latest.yml`
   - Upload new `latest.yml`
   - Users on 0.9.1 will update normally to 0.9.3

### Scenario 2: Temporary Rollback During Fix

**Problem:** Version 0.9.2 has issues, but you're working on 0.9.3 fix

**Solution:**

1. Enable rollback to 0.9.1 (stable)
2. Users rollback while you develop 0.9.3
3. Once 0.9.3 is ready:
   - Upload new version
   - Update `latest.yml` to 0.9.3
   - Disable rollback in `rollback.json`
4. Users will update normally from 0.9.1 → 0.9.3

---

## File Naming Convention

The rollback system expects installers to be named:

```
Shadowrun FPS Launcher Setup {VERSION}.exe
```

Examples:

- `Shadowrun FPS Launcher Setup 0.9.0.exe`
- `Shadowrun FPS Launcher Setup 0.9.1.exe`
- `Shadowrun FPS Launcher Setup 1.0.0.exe`

The `{VERSION}` must match the `targetVersion` in `rollback.json`.

---

## User Experience

### Rollback Dialog

When rollback is enabled, users see:

```
⚠️ Version Rollback Required

Current: 0.9.2  ←  Rollback To: 0.9.1

[Your custom reason message here]

[Later]  [Download & Rollback]
```

### Persistent Update Link

If user clicks "Later", a link appears next to version number:

```
Version 0.9.2 (Update Available!)
                 ↑ clicks this to reopen dialog
```

---

## Best Practices

1. **Always keep previous versions** - Don't delete old installers from your server
2. **Test rollback.json locally** - Use a test URL to verify JSON is valid
3. **Write clear reasons** - Users need to understand why they're rolling back
4. **Monitor user versions** - Use your player tracking API to see how many users have rolled back
5. **Disable rollback after completion** - Set `enabled: false` once all users are safe

---

## Troubleshooting

### Users aren't seeing rollback dialog

**Cause:** `rollback.json` not accessible or malformed

**Fix:**

- Visit `https://downloads.shadowrunfps.com/launcher/rollback.json` in browser to verify
- Check JSON syntax (use JSONLint.com)
- Verify server CORS settings allow launcher to fetch it

### Rollback download fails

**Cause:** Target version installer doesn't exist or URL is wrong

**Fix:**

- Verify filename: `Shadowrun FPS Launcher Setup {VERSION}.exe`
- Check version number matches exactly (no extra spaces)
- Ensure file is publicly accessible at your server URL

### Rollback happens on every launch

**Cause:** `rollback.json` still has `enabled: true`

**Fix:**

- Update `rollback.json` to `enabled: false`
- This stops the rollback prompt for users who already rolled back

---

## Technical Details

### How Version Comparison Works

- **Normal Updates**: electron-updater compares versions semantically (0.9.1 > 0.9.0)
- **Rollback**: Bypasses version comparison and forces download of target version
- **Priority**: Rollback check happens BEFORE normal update check

### Download Process

1. User confirms rollback
2. Launcher downloads installer to temp directory
3. Progress bar updates during download
4. Once complete, installer launches automatically
5. Launcher quits to allow installation
6. Installer replaces current version

### Files Modified

- `app/main.js` - Rollback check logic and download handler
- `app/preload.js` - IPC channels for rollback
- `app/renderer/index.js` - Rollback dialog UI logic
- `app/renderer/index.html` - Rollback dialog HTML
- `app/styles/global.css` - Rollback dialog styles

---

## Quick Reference

**Enable Rollback:**

```bash
# Update rollback.json on your server
{
  "enabled": true,
  "targetVersion": "0.9.0",
  "reason": "Your message here",
  "forced": false
}
```

**Disable Rollback:**

```bash
# Update rollback.json on your server
{
  "enabled": false,
  "targetVersion": "0.9.0",
  "reason": "",
  "forced": false
}
```

**Check Current Status:**

```bash
curl https://downloads.shadowrunfps.com/launcher/rollback.json
```

---

## Support

If you encounter issues with the rollback system, check:

1. Server logs for file access errors
2. Browser console in launcher (F12) for fetch errors
3. Player tracking API to see current user versions
4. `latest.yml` to ensure it points to correct version

---

## Future Enhancements

Planned features:

- **Forced rollback**: Auto-download without user prompt (`forced: true`)
- **Rollback history**: Track which users have rolled back
- **Version blacklist**: Prevent certain versions from running
- **Scheduled rollback**: Activate rollback at specific time
