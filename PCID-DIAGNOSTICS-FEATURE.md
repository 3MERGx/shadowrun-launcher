# PCID Display in Diagnostics - Feature Added

## Overview
Added PCID (Player Computer ID) display to the System Diagnostics screen, making it easy for users to view their current PCID. The PCID is displayed with a blur effect that reveals on hover for privacy.

## Features

### 1. PCID Check in Diagnostics
When users run diagnostics, the system now:
- Checks if a PCID exists in the registry
- Retrieves the current PCID value (if it exists)
- Displays the PCID in the diagnostic results

### 2. Privacy-Focused Display
The PCID is displayed with privacy features:
- **Blur Effect**: PCID is blurred by default (6px blur)
- **Hover to Reveal**: Hovering over the PCID removes the blur
- **Visual Hint**: Small eye icon (👁️) pulses to indicate it's hoverable
- **Tooltip**: Shows "Hover to reveal PCID" when hovering

### 3. States Handled
The PCID display handles three states:

| State | Display | Color |
|-------|---------|-------|
| PCID exists | Blurred 16-char hex value | Green (#10b981) |
| PCID not generated | "Not Generated" | Gray (#94a3b8) |
| Error checking PCID | "Not Generated" | Gray (#94a3b8) |

## Implementation Details

### Backend (`app/main.js`)
Updated the `run-diagnostics` IPC handler to include PCID check:

```javascript
ipcMain.handle("run-diagnostics", async () => {
  try {
    const diagnostics = await runPreLaunchDiagnostics();
    
    // Add PCID check
    const pcidExists = await registryUtils.checkPcidInRegistry();
    if (pcidExists) {
      const pcidValue = await registryUtils.getPcidFromRegistry();
      diagnostics.pcid = {
        exists: true,
        value: pcidValue ? pcidValue.toUpperCase() : null,
      };
    } else {
      diagnostics.pcid = {
        exists: false,
        value: null,
      };
    }
    
    return { success: true, diagnostics };
  } catch (error) {
    // ... error handling
  }
});
```

### Frontend (`app/renderer/index.js`)
Added PCID display to the diagnostic results modal in the "System Components" section:

```javascript
<!-- PCID Display -->
<div style="...border-left: 3px solid ${diag.pcid.exists ? '#10b981' : '#94a3b8'};">
  <span>Current PCID</span>
  <span class="pcid-value" style="...">
    ${diag.pcid.exists && diag.pcid.value 
      ? `<span>${diag.pcid.value}</span>` 
      : "Not Generated"
    }
  </span>
</div>
```

### Styling (`app/styles/global.css`)
Added CSS for blur effect and hover reveal:

```css
/* PCID blur effect with hover reveal */
.pcid-value {
  position: relative;
  user-select: none;
}

.pcid-value span {
  filter: blur(6px);
  transition: filter 0.3s ease;
}

.pcid-value:hover span {
  filter: blur(0px) !important;
}

/* Eye icon hint */
.pcid-value::after {
  content: '👁️';
  position: absolute;
  right: -24px;
  opacity: 0.5;
  animation: pcidHint 2s ease-in-out infinite;
}

.pcid-value:hover::after {
  opacity: 0;
}
```

## User Experience

### Before Hover
```
Current PCID          [blurred text] 👁️
```

### On Hover
```
Current PCID          B6377A64A9F736A3
```

### If No PCID
```
Current PCID          Not Generated
```
(Gray color, no blur, tooltip says "Launch game to generate PCID")

## Benefits

1. **Easy Access**: Users can quickly check their PCID without digging through registry
2. **Privacy**: Blur effect prevents accidental screenshots or streams from revealing PCID
3. **User-Friendly**: Visual hint (eye icon) clearly indicates the PCID is hidden and hoverable
4. **Helpful for Support**: Users can easily share their PCID with support when needed
5. **Activation Helper**: Users can verify which PCID they have before activating

## Usage

1. Click **Settings** (⚙️) button
2. Click **System Diagnostics** section
3. Click **Run Diagnostics** button
4. View PCID in the "System Components" section
5. Hover over the blurred PCID to reveal it

## Technical Notes

- PCID is read from registry at `HKEY_CURRENT_USER\Software\Classes\SOFTWARE\Microsoft\XLive`
- PCID is displayed in uppercase hexadecimal format (16 characters)
- Registry read errors are handled gracefully (displays "Not Generated")
- The blur effect is CSS-based, no JavaScript required for hover
- User-select is disabled to prevent accidental copying while blurred

## Testing

To test:
1. Run diagnostics with a game that has generated a PCID
2. Verify PCID shows as blurred green text
3. Hover over PCID to verify blur removes
4. Test with no PCID (fresh install) - should show "Not Generated" in gray
5. Verify eye icon pulses and disappears on hover
6. Check tooltip shows "Hover to reveal PCID"
