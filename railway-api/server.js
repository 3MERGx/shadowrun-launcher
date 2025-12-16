// Shadowrun FPS Player Tracking API
// Deploy this to Railway

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const app = express();

app.use(cors());
app.use(express.json());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const client = new MongoClient(MONGODB_URI);
let db;
let installsCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    // Use database from connection string (not hardcoded)
    db = client.db();
    installsCollection = db.collection("Installs"); // Capitalized collection name

    // Create index on playerId for faster lookups
    await installsCollection.createIndex({ playerId: 1 }, { unique: true });

    console.log("✅ Connected to MongoDB");
    console.log(`📁 Using collection: Installs`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    console.log("⚠️  Falling back to in-memory storage");
  }
}

// Start MongoDB connection
connectDB();

// In-memory storage for active players (temporary data)
const activePlayers = new Map();
const HEARTBEAT_TIMEOUT = 60000; // 60 seconds

// In-memory fallback for installs if MongoDB fails
const uniqueInstalls = new Set();

// Clean up stale players every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [playerId, data] of activePlayers.entries()) {
    if (now - data.lastSeen > HEARTBEAT_TIMEOUT) {
      console.log(`Removing stale player: ${playerId}`);
      activePlayers.delete(playerId);
    }
  }
}, 30000);

// Heartbeat endpoint - launcher calls this every 30 seconds
app.post("/api/heartbeat", (req, res) => {
  const { playerId, status, version } = req.body;

  if (!playerId || !status) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  activePlayers.set(playerId, {
    status, // 'menu' or 'in-game'
    version,
    lastSeen: Date.now(),
  });

  res.json({
    success: true,
    message: "Heartbeat received",
    totalPlayers: activePlayers.size,
  });
});

// Report unique install - launcher calls this once on first launch
app.post("/api/install", async (req, res) => {
  const { playerId, version, timestamp } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: "Missing playerId" });
  }

  try {
    if (installsCollection) {
      // Use MongoDB
      const result = await installsCollection.updateOne(
        { playerId },
        {
          $setOnInsert: {
            playerId,
            version,
            firstInstall: timestamp || new Date().toISOString(),
            createdAt: new Date(),
          },
          $set: {
            lastSeen: new Date(),
          },
        },
        { upsert: true }
      );

      const isNew = result.upsertedCount > 0;
      const totalInstalls = await installsCollection.countDocuments();

      console.log(
        `Install reported: ${playerId.substring(0, 8)}... (${
          isNew ? "NEW" : "EXISTING"
        })`
      );
      console.log(`Total unique installs: ${totalInstalls}`);

      res.json({
        success: true,
        message: isNew ? "New install recorded" : "Install already recorded",
        totalInstalls,
        isNew,
      });
    } else {
      // Fallback to in-memory
      const wasNew = !uniqueInstalls.has(playerId);
      uniqueInstalls.add(playerId);

      console.log(
        `Install reported (in-memory): ${playerId.substring(0, 8)}... (${
          wasNew ? "NEW" : "DUPLICATE"
        })`
      );
      console.log(`Total unique installs: ${uniqueInstalls.size}`);

      res.json({
        success: true,
        message: wasNew ? "New install recorded" : "Install already recorded",
        totalInstalls: uniqueInstalls.size,
        isNew: wasNew,
      });
    }
  } catch (error) {
    console.error("Error recording install:", error);
    res.status(500).json({ error: "Failed to record install" });
  }
});

// Get install statistics - ONLY installs (for website admin panel)
app.get("/api/installs", async (req, res) => {
  try {
    if (installsCollection) {
      // Use MongoDB
      const totalInstalls = await installsCollection.countDocuments();
      res.json({
        totalUniqueInstalls: totalInstalls,
        timestamp: Date.now(),
      });
    } else {
      // Fallback to in-memory
      res.json({
        totalUniqueInstalls: uniqueInstalls.size,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Error fetching install count:", error);
    res.status(500).json({ error: "Failed to fetch install count" });
  }
});

// Get player stats - ONLY online players (for Discord bot)
app.get("/api/stats", (req, res) => {
  const stats = {
    totalOnline: activePlayers.size,
    inMenu: 0,
    inGame: 0,
    players: [],
  };

  for (const [playerId, data] of activePlayers.entries()) {
    if (data.status === "in-game") {
      stats.inGame++;
    } else {
      stats.inMenu++;
    }

    // Optional: include anonymous player data
    stats.players.push({
      status: data.status,
      version: data.version,
      lastSeen: data.lastSeen,
    });
  }

  res.json(stats);
});

// Simple status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Health check for Railway
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Shadowrun FPS Player Tracking API running on port ${PORT}`);
});
