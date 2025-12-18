# XLIVEActivateHelper (BlackAnt's KeyWriter)

**Author:** BlackAnt  
**Rewritten:** December 2024

A 32-bit x86 helper executable that activates Shadowrun (2007) by directly writing encrypted product keys to the GFWL Token.bin file using Windows Data Protection API (DPAPI).

---

## 🎯 **Why This Approach?**

### **Previous Approach** (xlive.dll injection)
- ❌ Required loading 32-bit `xlive.dll` via P/Invoke
- ❌ Relied on ordinal exports (#5026 = `XLiveSetSponsorToken`)
- ❌ Fragile with Unicode marshaling and StdCall conventions
- ❌ Dependent on GFWL installation integrity

### **New Approach** (Direct Token.bin writing)
- ✅ **No xlive.dll dependency** - writes Token.bin directly
- ✅ **Uses Windows DPAPI** - `CryptProtectData` for encryption
- ✅ **More reliable** - no DLL loading issues
- ✅ **Cleaner** - self-contained crypto implementation
- ✅ **Faster** - direct file I/O instead of DLL calls

---

## 📦 **What It Does**

1. **Validates** the product key format (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)
2. **Encrypts** the key using Windows DPAPI (`CryptProtectData`)
3. **Deletes** old `Token.bin` and `config.bin` (if they exist)
4. **Writes** the encrypted Token.bin to:
   ```
   %LOCALAPPDATA%\Microsoft\XLive\Titles\4d5307d6\Token.bin
   ```
5. **Creates** the folder structure if it doesn't exist

---

## 🔧 **Building**

### **Requirements**
- Visual Studio 2022 or later
- .NET 6.0 SDK
- **Must target x86 (32-bit)** for DPAPI compatibility

### **Build Commands**

#### **Using Visual Studio**
1. Open `XLIVEActivateHelper.sln`
2. Set build configuration to **Release**
3. Set platform to **x86**
4. Right-click project → Publish → Create new publish profile
5. Target: Folder
6. Target Runtime: `win-x86`
7. Deployment Mode: `Self-contained`
8. Produce single file: `Yes`
9. Publish

#### **Using Command Line (Recommended)**
```bash
cd resources/XLiveActivateHelper/XLIVEActivateHelper
dotnet publish -c Release -r win-x86 --self-contained true /p:PublishSingleFile=true
```

### **Output Location**
```
resources/XLiveActivateHelper/XLIVEActivateHelper/bin/Release/net6.0/win-x86/publish/XLIVEActivateHelper.exe
```

**After building, copy to project root:**
```bash
# Windows (PowerShell)
Copy-Item "resources\XLiveActivateHelper\XLIVEActivateHelper\bin\Release\net6.0\win-x86\publish\XLIVEActivateHelper.exe" "XLiveActivateHelper.exe" -Force

# Or with absolute path
Copy-Item "C:\<path-to-project>\resources\XLiveActivateHelper\XLIVEActivateHelper\bin\Release\net6.0\win-x86\publish\XLIVEActivateHelper.exe" "C:\<path-to-project>\XLiveActivateHelper.exe" -Force
```

**Note**: We use **self-contained single-file** publishing to avoid the `.dll` dependency issue. This creates a single `.exe` file with everything bundled.

---

## 📋 **Usage**

### **Command Line**
```bash
XLIVEActivateHelper.exe <PRODUCT_KEY>
```

### **Example**
```bash
XLIVEActivateHelper.exe R9GJT-87T6K-6KV49-XTX8G-6VBWW
```

---

## 🔢 **Exit Codes**

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | EXIT_SUCCESS | ✅ Token.bin written successfully |
| 3 | EXIT_ERROR_INVALID_KEY_OR_ARGS | ❌ Invalid product key format or missing arguments |
| 4 | EXIT_ERROR_CANNOT_DELETE_XMACS_DATA | ❌ Failed to delete old Token.bin or config.bin |
| 5 | EXIT_ERROR_INITIALIZE_OR_CODE_EXECUTION_FAILED_GENERIC | ❌ Generic execution error |
| 6 | EXIT_ERROR_CANNOT_WRITE_XMACS_DATA | ❌ Failed to write Token.bin |
| 7 | EXIT_ERROR_CANNOT_CREATE_XMACS_FOLDER | ❌ Failed to create XMACS folder |

---

## 🔐 **Technical Details**

### **Encryption Process**
1. Product key is converted to bytes (29 bytes)
2. Encrypted using `CryptProtectData` from `crypt32.dll`
3. Encrypted data is prepended with:
   - `0000` (header)
   - Length of encrypted data (2 bytes, little-endian)
4. Result is written as Token.bin

### **DPAPI (Data Protection API)**
- Uses Windows built-in encryption tied to user account
- Data is encrypted per-user and per-machine
- No external dependencies or keys needed

### **File Structure**
```
%LOCALAPPDATA%\Microsoft\XLive\Titles\4d5307d6\
  └── Token.bin (encrypted product key)
```

---

## 🚀 **Integration with Electron Launcher**

### **From main.js:**
```javascript
const { spawn } = require("child_process");
const path = require("path");

const helperPath = path.join(__dirname, "XLiveActivateHelper.exe");
const productKey = "R9GJT-87T6K-6KV49-XTX8G-6VBWW";

const child = spawn(helperPath, [productKey], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let stdout = "";
let stderr = "";

child.stdout.on("data", (data) => {
  stdout += data.toString();
  console.log("[KeyWriter]", data.toString().trim());
});

child.stderr.on("data", (data) => {
  stderr += data.toString();
  console.error("[KeyWriter]", data.toString().trim());
});

child.on("close", (code) => {
  console.log(`KeyWriter exited with code: ${code}`);

  if (code === 0) {
    console.log("✅ Token.bin written successfully!");
  } else if (code === 3) {
    console.error("❌ Invalid product key");
  } else if (code === 4) {
    console.error("❌ Failed to delete old XMACS data");
  } else if (code === 6) {
    console.error("❌ Failed to write Token.bin");
  }
});
```

---

## 🛡️ **Security & Permissions**

- ✅ **NO ADMIN REQUIRED** - Writes to user's AppData (manifest uses `asInvoker`)
- ✅ **User-scoped encryption** - DPAPI ties encryption to current user
- ✅ **No network access** - Completely offline operation
- ✅ **No registry writes** - Only file I/O in user space

---

## ⚙️ **Requirements**

### **Runtime**
- **Windows 7 or later**
- **.NET 6.0 Desktop Runtime (x86)** - [Download here](https://dotnet.microsoft.com/download/dotnet/6.0)

The launcher's installer (`build/installer.nsh`) automatically detects and installs .NET 6.0 x86 if missing.

---

## 🐛 **Troubleshooting**

### **"BlackAnt's KeyWriter: Config.bin failed to delete"**
- **Cause:** File is locked by another process (GFWL service?)
- **Fix:** Close all GFWL-related processes and try again

### **"BlackAnt's KeyWriter: Token.bin failed to delete"**
- **Cause:** File is locked or no write permissions
- **Fix:** Ensure game is not running and user has write access to AppData

### **"BlackAnt's KeyWriter: Error: Invalid product key format"**
- **Cause:** Product key is not 29 characters or missing dashes
- **Fix:** Use format: `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`

### **Exit Code 5 (Generic Error)**
- **Cause:** Unhandled exception during execution
- **Fix:** Check Windows Event Viewer for .NET runtime errors

### **".NET Desktop Runtime 6.0.x-x86 is required"**
- **Cause:** .NET 6.0 x86 runtime is not installed
- **Fix:** Launcher installer should prompt to install it, or manually download from Microsoft

---

## 📝 **Code Structure**

### **Program.cs**
- Main entry point and activation logic
- Key validation and file I/O operations
- Exit code handling

### **Crypt32.cs**
- Windows DPAPI wrapper
- P/Invoke declarations for `CryptProtectData`
- DATA_BLOB structure marshaling

### **XLIVEActivateHelper.csproj**
- Project configuration
- Targets .NET 6.0 with x86 platform
- References app.manifest for UAC settings

### **app.manifest**
- UAC execution level: `asInvoker` (no admin)
- Windows 7 compatibility flag
- DPI awareness settings (commented out)

---

## 🔄 **Differences from Original**

| Feature | Original (xlive.dll) | New (BlackAnt's KeyWriter) |
|---------|---------------------|----------------------------|
| **Method** | P/Invoke to xlive.dll | Direct Token.bin writing |
| **Encryption** | xlive.dll internal | Windows DPAPI |
| **Dependencies** | xlive.dll required | Only crypt32.dll (built-in) |
| **Reliability** | Moderate (DLL issues) | High (direct file I/O) |
| **GFWL Dependency** | Yes | No |
| **Admin Rights** | No | No |
| **.NET Version** | .NET 6.0 | .NET 6.0 |

---

## 🙏 **Credits**

- **BlackAnt** - Complete rewrite with DPAPI implementation
- **Original Launcher Team** - Initial xlive.dll approach

---

## 📜 **License**

This helper is part of the Shadowrun FPS Launcher project.

---

## 🔗 **Related Documentation**

- [Activation Keys Configuration](../../app/config/README.md)
- [.NET 6.0 Installation Guide](../../DOTNET6_VALIDATION.md)
- [Main Launcher Documentation](../../README.md)

