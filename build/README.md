# Build Assets for Shadowrun FPS Launcher Installer

This directory contains custom assets for the NSIS installer.

## Required Files

### 1. installer.nsh

✅ **Created** - Custom NSIS script for dependency checks and installation

### 2. Installer Images (Need to Create)

Create these images for professional installer branding:

#### installerHeader.bmp

- **Size**: 150 x 57 pixels
- **Format**: 24-bit BMP
- **Purpose**: Shows at the top of installer wizard
- **Content**: Shadowrun logo or game artwork (horizontal)

#### installerSidebar.bmp

- **Size**: 164 x 314 pixels
- **Format**: 24-bit BMP
- **Purpose**: Shows on the left side of installer wizard
- **Content**: Shadowrun character art or game scene (vertical)

#### uninstallerIcon.ico

- **Size**: 256 x 256 pixels (can contain multiple sizes: 16, 32, 48, 256)
- **Format**: ICO
- **Purpose**: Shows in Windows Control Panel → Programs
- **Content**: Shadowrun icon or launcher icon

## How to Create These Images

### Using Photoshop/GIMP (Free)

1. **Find Shadowrun artwork** (from game or official sources)
2. **Resize to exact dimensions** (see above)
3. **Export as BMP** (24-bit color, no alpha channel)
4. **For ICO files**: Use online converter or Photoshop plugin

### Using ImageMagick (Command Line)

```bash
# Convert your source images
convert shadowrun-logo.png -resize 150x57! installerHeader.bmp
convert shadowrun-sidebar.png -resize 164x314! installerSidebar.bmp
convert shadowrun-icon.png -define icon:auto-resize=256,48,32,16 uninstallerIcon.ico
```

### Using Online Tools

- **For BMP**: Use any image editor, save as BMP
- **For ICO**: https://convertio.co/png-ico/ or https://www.icoconverter.com/

## Image Tips

### For Header (150x57)

- Horizontal logo or title
- Keep important elements in center
- Use high contrast colors
- Avoid small text (hard to read)

### For Sidebar (164x314)

- Vertical game artwork
- Character or scene from Shadowrun
- Should look good with white/gray backgrounds
- Can be darker at bottom (where buttons are)

### For Icon (256x256)

- Simple, recognizable icon
- Works at small sizes (16x16)
- Use existing launcher icon (`app/assets/icon2.ico`)

## Quick Start (If You Don't Have Custom Images Yet)

The installer will work without these images, but won't be branded. To build without images:

1. **Option A**: Create simple placeholder images

   ```bash
   # Create blank colored placeholders
   convert -size 150x57 xc:#1a1a1a installerHeader.bmp
   convert -size 164x314 xc:#1a1a1a installerSidebar.bmp
   cp ../app/assets/icon2.ico uninstallerIcon.ico
   ```

2. **Option B**: Comment out image lines in `package.json`:
   ```json
   {
     "nsis": {
       // "installerHeader": "build/installerHeader.bmp",
       // "installerSidebar": "build/installerSidebar.bmp",
       // "uninstallerIcon": "build/uninstallerIcon.ico"
     }
   }
   ```

## Testing Your Images

After creating images:

1. Place them in this `build/` directory
2. Run: `npm run build:win`
3. Install the setup: `dist/Shadowrun FPS Launcher Setup X.X.X.exe`
4. Check if images appear correctly
5. Adjust if needed and rebuild

## File Checklist

- [ ] `installer.nsh` - ✅ Created
- [ ] `installerHeader.bmp` - ❌ Need to create
- [ ] `installerSidebar.bmp` - ❌ Need to create
- [ ] `uninstallerIcon.ico` - ❌ Need to create (can copy from `app/assets/icon2.ico`)

## Current Status

- ✅ `installer.nsh` is ready
- ❌ Image assets need to be created
- ✅ `LICENSE.txt` created in root directory
- ✅ `package.json` configured for custom installer

**You can build the installer now**, but it won't have custom branding images until you create them.

For now, you can copy the launcher icon as a temporary uninstaller icon:

```bash
cp app/assets/icon2.ico build/uninstallerIcon.ico
```
