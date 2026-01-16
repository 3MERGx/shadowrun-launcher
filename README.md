# Shadowrun FPS Launcher

A modern, feature-rich game launcher for the classic Shadowrun FPS (2007) with automatic updates, Discord integration, and player tracking.

![Version](https://img.shields.io/badge/version-0.9.6-orange)
![Platform](https://img.shields.io/badge/platform-Windows-blue)

<!-- ![License](https://img.shields.io/badge/license-MIT-green) -->

---

## ✨ Features

### 🎮 Game Management

- **One-Click Download & Install** - Automatic game file download and installation
- **Quick Launch** - Launch Shadowrun FPS directly from the launcher
- **Skip Intro Mod** - Install/uninstall skip intro videos with one click
- **PCID Backup** - Backup your player ID before reinstalling Windows

### 🔄 Auto-Update System

- **Automatic Updates** - Self-updating launcher with one-click installation
- **Version Rollback** - Server-controlled rollback to stable versions if needed
- **Update Notifications** - Clean, modern update dialogs with release notes
- **Smart Version Checking** - Only prompts users who need updates

### 🎨 User Interface

- **Custom Window Frame** - Frameless design with custom title bar
- **Dark Theme** - Modern dark UI matching Shadowrun's aesthetic
- **Toast Notifications** - Non-intrusive feedback for actions
- **Loading States** - Clear feedback for all operations
- **Settings Panel** - Easy access to all launcher options

### ⚙️ Advanced Features

- **FPS Limiter** - Adjustable frame rate cap (default 85 FPS)
- **Registry Management** - Safe Windows registry modifications
- **GFWL Support** - Games for Windows Live integration
- **Audio Controls** - Background audio with mute toggle
- **Dev Mode** - Enhanced debugging tools and DevTools access

---

## 🚀 Quick Start

### System Requirements

- **Windows 10 or later** (Windows 7/8/8.1 are not supported)
- **64-bit architecture** (x64)
- **Administrator privileges** (for game activation and registry modifications)

> **Note:** The launcher uses Electron 25, which requires Windows 10+. If you encounter a `KERNEL32.dll` error mentioning `DiscardVirtualMemory`, this indicates you're running Windows 7/8, which is not supported.

### For Users

1. **Download** the latest `Shadowrun FPS Launcher Setup.exe`
2. **Run** the installer and follow the prompts
3. **Launch** the game - the launcher will handle everything!

### For Developers

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/shadowrun-launcher.git
cd shadowrun-launcher

# Install dependencies
npm install

# Run in development mode
npm run start:dev

# Build for Windows
npm run build:win
```

---

## 📦 Project Structure

```
shadowrun-launcher/
├── app/
│   ├── main.js              # Main Electron process
│   ├── preload.js           # IPC bridge
│   ├── renderer/            # UI components
│   │   ├── index.html       # Main window
│   │   ├── index.js         # UI logic
│   │   └── settings.html    # Settings window
│   ├── styles/              # Tailwind CSS
│   ├── assets/              # Images, audio, icons
│   └── utils/               # Helper modules
│       ├── playerTracking.js # Player statistics
│       ├── registry.js       # Registry utilities
│       └── token.js          # Authentication
├── railway-api/             # Backend API (Railway)
│   ├── server.js            # Express API
│   └── package.json         # API dependencies
├── build/                   # Installer resources
│   ├── installer.nsh        # NSIS installer script
│   ├── installerSidebar.bmp # Installer graphics
│   └── installerHeader.bmp
├── scripts/                 # Build scripts
├── package.json             # Electron app config
└── README.md               # This file
```

---

## 🛠️ Tech Stack

### Frontend

- **Electron** - Desktop app framework
- **Tailwind CSS** - Utility-first CSS
- **HTML/CSS/JavaScript** - Core web technologies

### Backend

- **Node.js** - Runtime environment
- **Express** - API server
- **MongoDB** - Database for install tracking
- **Railway** - Hosting platform

### Build Tools

- **electron-builder** - Package and distribute
- **NSIS** - Windows installer
- **Tailwind CLI** - CSS compilation

---

## 🔧 Configuration

### Environment Variables (Railway API)

```bash
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
PORT=8080  # Railway sets this automatically
```

### Update Server

Update URL is configured in `package.json`:

```json
{
  "publishConfig": {
    "provider": "generic",
    "url": "http://157.245.214.234/launcher"
  }
}
```

---

## 📡 API Endpoints

### Player Statistics

```
GET /api/stats
Returns: { totalOnline, inMenu, inGame, players[] }
```

### Install Tracking

```
POST /api/install
Body: { playerId, version, timestamp }
Returns: { success, totalInstalls, isNew }

GET /api/installs
Returns: { totalUniqueInstalls, timestamp }
```

### Health Check

```
GET /api/status
Returns: { status, uptime, timestamp }
```

### Data Transparency

```
GET /api/transparency
Returns: Complete documentation of all data collected from launcher instances
```

This endpoint provides full transparency about what data is collected, when it's sent, and why. Perfect for open source visibility and user confidence. Shows:
- Exact data fields sent from launcher
- Example payloads
- Privacy information
- What data is NOT collected
- Data retention policies
- Rate limiting information

**Example Usage:**
```bash
curl https://playertracker-production.up.railway.app/api/transparency
```

---

## 🔄 Auto-Update System

The launcher uses `electron-updater` with a custom update server:

1. **Check for Updates** - Automatically on launch or manually via settings
2. **Download** - Updates download in the background
3. **Install** - One-click installation with automatic restart
4. **Rollback** - Server-controlled rollback for emergency fixes

See [ROLLBACK-GUIDE.md](ROLLBACK-GUIDE.md) for rollback system documentation.

---

## 📊 Player Tracking

Unique installs are tracked using anonymous UUIDs:

- **Privacy-First** - No personal data collected
- **Persistent** - UUID survives reinstalls
- **MongoDB Backed** - Reliable, persistent storage
- **API Available** - Fetch stats for website/Discord bot

See [INSTALL-TRACKING-GUIDE.md](INSTALL-TRACKING-GUIDE.md) for implementation details.

---

## 🎯 Build & Release

### Build Installer

```bash
# Update version in package.json
npm version 0.9.3

# Build for Windows
npm run build:win

# Output: dist/Shadowrun FPS Launcher Setup 0.9.3.exe
```

### Upload to Update Server

```bash
# Upload these files to your server:
# - Shadowrun FPS Launcher Setup X.X.X.exe
# - latest.yml
# - latest-x64.yml (if exists)
```

### Release Checklist

- [ ] Update version in `package.json`
- [ ] Build with `npm run build:win`
- [ ] Test installer on clean Windows VM
- [ ] Upload files to update server
- [ ] Update `latest.yml` on server
- [ ] Test auto-update from previous version
- [ ] Monitor player tracking API for installs

---

## 🐛 Development

### Run in Dev Mode

```bash
npm run start:dev
# Opens DevTools automatically
# Auto-updater disabled in dev mode
```

### Debug Tools

- **F12 or Ctrl+Shift+I** - Toggle DevTools (dev mode only)
- **Console Logs** - Detailed logging in both terminal and DevTools
- **Player Tracking** - Test with local Railway API

### Common Issues

**DevTools won't open?**

- Make sure you're using `npm run start:dev` (not just `npm start`)

**Auto-updater not working?**

- Check `latest.yml` format on server
- Verify update URL in `package.json`
- Check logs for "Skip checkForUpdates" (dev mode)

**Install tracking not working?**

- Verify `MONGODB_URI` in Railway environment
- Check Railway logs for "Connected to MongoDB"
- Test with `/api/installs` endpoint

**KERNEL32.dll error: "DiscardVirtualMemory could not be located"?**

- This error occurs on Windows 7/8/8.1 systems
- The launcher requires **Windows 10 or later**
- Windows 7 reached end-of-life in January 2020 and is no longer supported
- **Solution:** Upgrade to Windows 10 or later (free upgrade may still be available)

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE.txt](LICENSE.txt) for details.

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📞 Support

- **Issues** - Report bugs via [GitHub Issues](https://github.com/YOUR_USERNAME/shadowrun-launcher/issues)
- **Discord** - Join our community server
- **Website** - Visit [your-website.com](https://your-website.com)

---

## 🎮 About Shadowrun FPS

Shadowrun (2007) was a multiplayer first-person shooter developed by FASA Studio for Xbox 360 and Windows. This launcher aims to revive the community by making it easier to install and play the game.

---

## 🙏 Credits

- **Developer** - Sinful Hollowz
- **Community** - Shadowrun FPS Discord community
- **Tools** - Electron, Tailwind CSS, MongoDB, Railway

---

## 📝 Changelog

### v0.9.2 (Current)

- ✨ Added unique install tracking with MongoDB
- ✨ Added rollback system for emergency updates
- ✨ Added toast notifications for user feedback
- 🎨 Improved update dialog design
- 🐛 Fixed DevTools access in development mode
- 🐛 Fixed "Check for Updates" button functionality
- 📊 Separated player stats and install tracking APIs
- 🔧 Enhanced logging and debugging

### v0.9.1

- 🎨 Redesigned update dialog
- ✨ Added one-click update installation
- 🐛 Various bug fixes

### v0.9.0

- 🎉 Initial public release
- ✨ Auto-update system
- ✨ Discord integration
- ✨ Skip intro mod support

---

**Made with ❤️ for the Shadowrun FPS community**
