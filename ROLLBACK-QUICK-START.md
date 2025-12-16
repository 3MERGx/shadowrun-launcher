# Rollback System - Quick Start

## TL;DR - What You Need to Know

### ✅ The Good News
- **You can forget to disable rollback** - The system is smart enough to handle it!
- **No need to manually update latest.yml** - Users won't break if you forget
- **Automation available** - Optional script can do everything for you

---

## How It Actually Works

### 🧠 Smart Version Checking

The rollback system **only triggers if the user is on a NEWER version than the target**:

```
User on v0.9.2 + Rollback to v0.9.1 = Shows rollback dialog ✓
User on v0.9.1 + Rollback to v0.9.1 = Skips rollback, checks for updates ✓
User on v0.9.0 + Rollback to v0.9.1 = Skips rollback, checks for updates ✓
```

**This means:**
- ✅ Safe to leave rollback enabled after users rollback
- ✅ Won't interfere with future updates
- ✅ Users already on safe versions won't see annoying dialogs

---

## Forget-Proof Workflows

### Scenario A: "I Forgot to Disable Rollback!"

```json
// rollback.json (OOPS - still enabled)
{ "enabled": true, "targetVersion": "0.9.1" }

// User already rolled back to 0.9.1
```

**What Happens:**
1. User clicks "Check for Updates"
2. System checks: Is 0.9.1 > 0.9.1? No.
3. Skips rollback dialog
4. Checks for normal updates
5. **Result:** Everything works fine! ✓

---

### Scenario B: "I Released 0.9.3 But Forgot to Disable Rollback!"

```json
// rollback.json (STILL enabled - OOPS!)
{ "enabled": true, "targetVersion": "0.9.1" }

// latest.yml points to 0.9.3 (new fixed version)
// User is on 0.9.1
```

**What Happens:**
1. User clicks "Check for Updates"
2. System checks: Is 0.9.1 > 0.9.1? No.
3. Skips rollback
4. Checks normal updates → Finds 0.9.3
5. User updates normally to 0.9.3
6. **Result:** Everything works fine! ✓

---

### Scenario C: "What If I Forget to Update latest.yml?"

```json
// rollback.json (disabled - good)
{ "enabled": false }

// latest.yml (OOPS - still points to broken v0.9.2!)
```

**What Happens:**
1. Users on 0.9.1 check for updates
2. See "update" to 0.9.2 (the broken version)
3. **Result:** Users might install broken version again ✗

**Lesson:** This is the ONLY scenario that causes issues. Always update `latest.yml` when disabling rollback!

---

## Three Ways to Manage Rollback

### 1️⃣ Fully Manual (5 min setup)

**Good for:** <20 users, simple projects

```bash
# Step 1: Enable rollback
# Edit rollback.json on your server:
{ "enabled": true, "targetVersion": "0.9.1", "reason": "Bug fix" }

# Step 2: Wait a few days

# Step 3: Check player stats manually
curl https://playertracker-production.up.railway.app/api/stats

# Step 4: When 90%+ rolled back, update files
# - Edit latest.yml to point to 0.9.1
# - Edit rollback.json: enabled=false

# Step 5: Release fixed version as usual
```

**Time:** ~10 minutes over 3-4 days

---

### 2️⃣ Automated Monitoring (10 min setup)

**Good for:** 20-100 users, want visibility

```bash
# Step 1: Enable rollback (same as above)

# Step 2: Run monitoring script on your computer
node rollback-automation.js --monitor-only

# This shows live progress:
# "📈 Rollback Progress: 87.3% (76/87 users safe)"

# Step 3: When threshold reached, manually update files
# Or let the script tell you when to act

# Step 4: Release fixed version
```

**Time:** ~5 minutes setup, script does the rest

---

### 3️⃣ Fully Automated (15 min setup)

**Good for:** 100+ users, want hands-off

```bash
# Step 1: Install script on your DigitalOcean server
scp rollback-automation.js root@157.245.214.234:/var/www/html/launcher/

# Step 2: Edit CONFIG paths in rollback-automation.js to match your server

# Step 3: Enable rollback in rollback.json

# Step 4: Run auto-update mode
node rollback-automation.js --auto-update

# Script will:
# - Monitor player stats every 5 minutes
# - When 95% on safe version, automatically:
#   ✓ Update latest.yml to target version
#   ✓ Disable rollback in rollback.json
#   ✓ Exit with success message

# Step 5: You get notified, release fixed version
```

**Time:** ~15 minutes setup, then zero maintenance

---

## Quick Decision Tree

```
Do you have rollback enabled?
├─ YES → Are 90%+ of users on the target version?
│   ├─ YES → Can you forget to update latest.yml?
│   │   ├─ YES → Use automation (method 2 or 3)
│   │   └─ NO → Manually disable rollback, update latest.yml
│   └─ NO → Wait longer, or use monitoring (method 2)
└─ NO → You're good! Release next version normally
```

---

## Files Reference

```
Your Server (http://157.245.214.234/launcher/):
├─ rollback.json          ← Controls rollback (edit this to enable/disable)
├─ latest.yml             ← Points to current version (update this after rollback)
├─ Shadowrun...Setup 0.9.0.exe  ← Keep all versions!
├─ Shadowrun...Setup 0.9.1.exe
└─ Shadowrun...Setup 0.9.2.exe

Your Launcher Project:
├─ rollback-template.json     ← Upload this to your server as rollback.json
├─ rollback-automation.js     ← Optional monitoring/automation script
├─ ROLLBACK-GUIDE.md          ← Full documentation
└─ ROLLBACK-QUICK-START.md    ← This file
```

---

## Emergency Rollback Checklist

If you need to rollback RIGHT NOW:

- [ ] Upload `rollback-template.json` to your server as `rollback.json`
- [ ] Edit it: `{"enabled": true, "targetVersion": "0.9.1", "reason": "Your message"}`
- [ ] Verify file is accessible: `curl http://157.245.214.234/launcher/rollback.json`
- [ ] Done! Users will see rollback on next update check

**That's it!** The smart system handles the rest. You can forget to disable it later and things will still work.

---

## What Gets Updated Automatically?

**By the Launcher (always):**
- ✅ Version comparison (only rollback if needed)
- ✅ Dialog display (only if user needs to rollback)
- ✅ Skip rollback if user already safe

**By You (manual):**
- Update `rollback.json` to enable/disable
- Update `latest.yml` when disabling rollback
- Release new fixed version

**By Automation Script (optional):**
- ✅ Monitor rollback progress
- ✅ Update `latest.yml` automatically
- ✅ Disable `rollback.json` automatically

---

## Best Practice Summary

1. **Enable rollback** → Edit `rollback.json` on server
2. **Wait** → Use monitoring script or check manually
3. **Update latest.yml** → Point to target version (important!)
4. **Disable rollback** → Set `enabled: false` (less important due to smart checks)
5. **Release fix** → Build and upload new version normally

**Remember:** Steps 3-4 can be automated! The ONLY critical thing is updating `latest.yml`.

---

## Questions?

- See `ROLLBACK-GUIDE.md` for full documentation
- Check `rollback-automation.js` comments for script configuration
- Test in dev mode first: `npm start` then click "Check for Updates"

