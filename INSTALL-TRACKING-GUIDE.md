# Unique Install Tracking System

## Overview

The launcher now tracks **unique installs** using persistent UUID-based identification. This allows you to see how many unique users have installed the launcher, with reinstalls by the same user only counting once.

---

## How It Works

### 1. **First Launch (New Install)**

```
User installs launcher
  ↓
Launcher starts for the first time
  ↓
Generates unique UUID (e.g., "a1b2c3d4-...")
  ↓
Saves to: %APPDATA%\shadowrun-fps-launcher\player-id.json
  ↓
Sends install report to Railway API
  ↓
Marks as reported (won't report again)
```

### 2. **Subsequent Launches**

```
Launcher starts
  ↓
Reads existing UUID from player-id.json
  ↓
Checks if install already reported
  ↓
Skips install report (only heartbeats sent)
```

### 3. **Reinstall by Same User**

```
User uninstalls launcher
  ↓
Reinstalls launcher
  ↓
IF player-id.json still exists:
  ✓ Uses same UUID (already reported)
  ✓ Does NOT count as new install
ELSE (if user deleted app data):
  ✗ Generates new UUID
  ✗ Counts as new install (unavoidable)
```

---

## Data Stored

### Launcher Side (`player-id.json`)

```json
{
  "playerId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "installReported": true,
  "firstInstall": "2024-12-16T12:34:56.789Z"
}
```

**Location:**

- Windows: `C:\Users\{username}\AppData\Roaming\shadowrun-fps-launcher\player-id.json`
- Persists even if launcher is uninstalled (unless user deletes app data)

### Railway API Side (In-Memory)

```javascript
uniqueInstalls = Set([
  "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "b2c3d4e5-6789-01bc-def0-234567890abc",
  ...
])
```

**Note:** Currently in-memory. For production, you should use a database (MongoDB, Redis, etc.)

---

## API Endpoints

### POST `/api/install`

**Purpose:** Report a new installation

**Request:**

```json
{
  "playerId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "version": "0.9.2",
  "timestamp": "2024-12-16T12:34:56.789Z"
}
```

**Response:**

```json
{
  "success": true,
  "message": "New install recorded",
  "totalInstalls": 142,
  "isNew": true
}
```

### GET `/api/installs`

**Purpose:** Get total unique install count

**Response:**

```json
{
  "totalUniqueInstalls": 142,
  "timestamp": 1702729234567
}
```

### GET `/api/stats` (Updated)

**Purpose:** Get all statistics (includes installs now)

**Response:**

```json
{
  "totalOnline": 5,
  "totalInstalls": 142,
  "inMenu": 3,
  "inGame": 2,
  "players": [...]
}
```

---

## Using in Your Website Admin Panel

### Example: Fetch Install Count

```typescript
// In your website admin panel

async function getInstallStats() {
  const response = await fetch(
    "https://playertracker-production.up.railway.app/api/installs"
  );
  const data = await response.json();

  console.log(`Total Unique Installs: ${data.totalUniqueInstalls}`);

  // Display in admin panel
  document.getElementById("install-count").textContent =
    data.totalUniqueInstalls;
}

// Or use the combined stats endpoint
async function getAllStats() {
  const response = await fetch(
    "https://playertracker-production.up.railway.app/api/stats"
  );
  const data = await response.json();

  return {
    totalInstalls: data.totalInstalls,
    onlinePlayers: data.totalOnline,
    inGame: data.inGame,
    inMenu: data.inMenu,
  };
}
```

### Example: Admin Dashboard Display

```html
<div class="admin-stats">
  <div class="stat-card">
    <h3>Total Installs</h3>
    <p class="stat-value" id="total-installs">Loading...</p>
    <span class="stat-label">Unique users</span>
  </div>

  <div class="stat-card">
    <h3>Online Now</h3>
    <p class="stat-value" id="online-now">Loading...</p>
    <span class="stat-label">Active players</span>
  </div>

  <div class="stat-card">
    <h3>In Game</h3>
    <p class="stat-value" id="in-game">Loading...</p>
    <span class="stat-label">Playing now</span>
  </div>
</div>

<script>
  async function updateAdminStats() {
    try {
      const response = await fetch(
        "https://playertracker-production.up.railway.app/api/stats"
      );
      const stats = await response.json();

      document.getElementById("total-installs").textContent =
        stats.totalInstalls;
      document.getElementById("online-now").textContent = stats.totalOnline;
      document.getElementById("in-game").textContent = stats.inGame;
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }

  // Update every 30 seconds
  updateAdminStats();
  setInterval(updateAdminStats, 30000);
</script>
```

---

## Accuracy & Limitations

### ✅ Accurate Tracking

- **Same user, multiple launches:** ✓ Counted once
- **Same user, reinstall (app data preserved):** ✓ Counted once
- **Different computers, same user:** ✗ Counted multiple times (expected - each machine is unique)

### ⚠️ Edge Cases

1. **User deletes app data before reinstall:**

   - Generates new UUID
   - Counts as new install
   - **Impact:** Minimal (most users don't manually delete app data)

2. **User installs on multiple computers:**

   - Each computer gets unique UUID
   - Each counts as separate install
   - **Impact:** Expected behavior (each machine is a unique install)

3. **API restart (in-memory storage):**
   - Currently loses all data
   - **Solution:** Use persistent database (see below)

---

## Production Recommendations

### 1. Use Persistent Database

**Current:** In-memory storage (lost on restart)

**Recommended:** MongoDB, PostgreSQL, or Redis

**Example with MongoDB:**

```javascript
// In railway-api/server.js
const { MongoClient } = require("mongodb");
const client = new MongoClient(process.env.MONGODB_URI);

// Store install
await db.collection("installs").updateOne(
  { playerId },
  {
    $setOnInsert: {
      playerId,
      version,
      firstSeen: new Date(),
    },
  },
  { upsert: true }
);

// Get count
const count = await db.collection("installs").countDocuments();
```

### 2. Add Timestamps

Track when each install occurred for analytics:

```javascript
uniqueInstalls.set(playerId, {
  playerId,
  firstSeen: Date.now(),
  version: "0.9.2",
  lastSeen: Date.now(),
});
```

### 3. Track Additional Metrics

- Install date/time
- Launcher version at install
- OS version (if needed)
- Geographic data (via IP, if needed)

---

## Testing

### Test Locally

1. **First install:**

```bash
# Delete player ID to simulate first install
rm %APPDATA%\shadowrun-fps-launcher\player-id.json

# Start launcher
npm start

# Check logs for:
# "[PlayerTracker] Created new player ID: ..."
# "[PlayerTracker] Reporting unique installation..."
# "[PlayerTracker] Install reported successfully. Total installs: 1"
```

2. **Subsequent launches:**

```bash
# Start launcher again (player ID exists)
npm start

# Check logs - should NOT see:
# "Reporting unique installation..."
```

3. **Check API:**

```bash
# Get install count
curl https://playertracker-production.up.railway.app/api/installs

# Response: {"totalUniqueInstalls":1,"timestamp":...}
```

---

## Deployment Checklist

- [x] ✅ Launcher tracks unique installs
- [x] ✅ API receives install reports
- [x] ✅ API exposes `/api/installs` endpoint
- [x] ✅ API includes installs in `/api/stats`
- [ ] ⏳ Add persistent database (MongoDB/Redis)
- [ ] ⏳ Update website admin panel to display installs
- [ ] ⏳ Add install timestamps for analytics

---

## Summary

**What you have now:**

- ✅ Unique install tracking (UUID-based)
- ✅ Persistent across reinstalls (if app data preserved)
- ✅ API endpoint to fetch count: `/api/installs`
- ✅ Included in stats endpoint: `/api/stats`
- ✅ Ready to integrate into website admin panel

**What to do next:**

1. **Deploy updated launcher** (new installs will be tracked)
2. **Deploy updated Railway API** (receives install reports)
3. **Update website admin panel** (fetch and display install count)
4. **Add database** (for persistence across API restarts)

---

## Need Help?

**API Endpoints:**

- Stats: `https://playertracker-production.up.railway.app/api/stats`
- Installs: `https://playertracker-production.up.railway.app/api/installs`
- Status: `https://playertracker-production.up.railway.app/api/status`

**Files Modified:**

- `app/utils/playerTracking.js` - Launcher tracking logic
- `railway-api/server.js` - API install tracking
