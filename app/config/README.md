# Activation Keys Configuration

This directory contains the configuration for multiple Product Keys with their associated PCIDs used for game activation.

## File: `activationKeys.json`

This JSON file stores activation keys where each product key can be paired with 1-15 PCIDs. The launcher randomly selects a PCID when activating and automatically copies the paired product key to the clipboard.

### Structure

```json
{
  "activationKeys": [
    {
      "id": 1,
      "productKey": "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
      "pcids": ["0123456789abcdef", "fedcba9876543210"]
    }
  ],
  "settings": {
    "clearClipboardAfterSeconds": 30
  }
}
```

**Minimal Example (only required fields):**

```json
{
  "id": 1,
  "productKey": "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
  "pcids": ["0123456789abcdef"]
}
```

**With Optional Fields:**

```json
{
  "id": 1,
  "name": "Display name for tracking",
  "productKey": "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
  "pcids": ["0123456789abcdef", "fedcba9876543210"],
  "description": "Optional notes about this key"
}
```

### Field Descriptions

- **id**: Unique numeric identifier for this key entry (must be unique) - **REQUIRED**
- **productKey**: Windows Live product key in standard format (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX) - **REQUIRED**
- **pcids**: Array of 1-15 PCID strings, each being a 16-character hexadecimal string - **REQUIRED**
  - Each PCID must be exactly 16 characters
  - Only hex characters (0-9, a-f, A-F)
  - Stored as QWORD (64-bit) in registry at `HKEY_CURRENT_USER\Software\Classes\SOFTWARE\Microsoft\XLive`
- **name**: Optional display name for logging/tracking purposes
- **description**: Optional text describing this key entry
- **settings.clearClipboardAfterSeconds**: Time in seconds before auto-clearing the product key from clipboard (0 to disable, default: 30)

## How Activation Works

1. **User clicks "Activate Game"** in the launcher
2. **Launcher randomly selects** one activation key entry from the config
3. **Launcher randomly selects** one PCID from that key's `pcids` array
4. **PCID is set** in the Windows Registry
5. **Product key is automatically copied** to the user's clipboard
6. **User is notified** which key was copied and can paste it (Ctrl+V) into GFWL
7. **Clipboard auto-clears** after the configured timeout (default: 30 seconds) for security

## CRITICAL: PCID + Product Key Pairing

⚠️ **WARNING**: All PCIDs in a key entry's `pcids` array MUST be valid for that product key!

Using the wrong product key with a PCID will result in activation failure. The pairing is determined by the game activation system and cannot be mixed.

### One Product Key, Multiple PCIDs

A single product key can support up to **15 different PCIDs**. All valid PCIDs for a key should be added to its `pcids` array.

### Example:

- ✅ CORRECT: Key `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` with PCIDs `["abcdef0123456789", "fedcba9876543210"]`
- ❌ WRONG: Mixing PCIDs from different keys in the same array

## How PCID is Stored in Registry

The PCID is stored as a **REG_QWORD** (64-bit) value with hexadecimal base in the Windows Registry:

**Registry Path:**

```
HKEY_CURRENT_USER\Software\Classes\SOFTWARE\Microsoft\XLive
```

**Value Name:** `PCID`

**Type:** `REG_QWORD`

**Data:** `0xabcdef0123456789` (example)

### PCID Format Examples

When you see a PCID in the registry editor:

- **Registry displays**: `abcdef0123456789` (as shown in value data field)
- **Config file uses**: `"abcdef0123456789"` (same format, 16 hex characters)
- **Registry stores as**: QWORD `0xabcdef0123456789`

## Adding New Activation Keys

### Adding a New Product Key with PCIDs

1. Open `activationKeys.json` in a text editor
2. Add a new object to the `activationKeys` array:

```json
{
  "id": 3,
  "productKey": "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
  "pcids": ["pcid1hex16chars1", "pcid2hex16chars2", "pcid3hex16chars3"]
}
```

**That's it! Only 3 required fields.**

3. Ensure:
   - The `id` is unique
   - Each PCID in `pcids` is exactly 16 hex characters
   - The `productKey` matches the standard format
   - **ALL PCIDs in the array are valid for this product key**
   - You have 1-15 PCIDs (no more than 15)
4. Optionally add `name` and/or `description` fields if you want to track notes
5. Save the file
6. Run validation: `node app/config/validateConfig.js`
7. Restart the launcher

### Adding More PCIDs to an Existing Key

If you have additional PCIDs that work with an existing product key:

1. Find the key entry in `activationKeys.json`
2. Add the new PCID(s) to the `pcids` array
3. Ensure no duplicates
4. Save and validate

## Finding Your PCID

To find your current PCID:

1. Open Registry Editor (`regedit`)
2. Navigate to: `Computer\HKEY_CURRENT_USER\Software\Classes\SOFTWARE\Microsoft\XLive`
3. Look for the `PCID` value (Type: REG_QWORD)
4. Double-click it to view the value
5. Copy the hex value (without the `0x` prefix)

Example: If registry shows `0xabcdef0123456789`, use `abcdef0123456789` in the config.

## Validation

The launcher validates:

- ✅ Config file is valid JSON
- ✅ All required fields are present
- ✅ PCID is exactly 16 hexadecimal characters
- ✅ Product key follows the expected format

If validation fails, an error dialog will be shown when attempting activation.

### Testing Your Configuration

Before launching the game, you can validate your configuration file using the included validation script:

```bash
node app/config/validateConfig.js
```

This script will:

- ✅ Check JSON syntax
- ✅ Validate all required fields
- ✅ Check PCID format (must be 16 hex characters)
- ✅ Check product key format
- ✅ Detect duplicate IDs
- ⚠️ Warn about placeholder values
- ⚠️ Warn about duplicate PCIDs

**Exit codes:**

- `0` = Validation passed
- `1` = Validation failed

## Clipboard Security

### Automatic Clipboard Protection

The launcher automatically implements several security measures to prevent product key sharing:

1. **Auto-Clear Timer**: Product keys are automatically removed from the clipboard after `clearClipboardAfterSeconds` (default: 30 seconds)
2. **Verification**: Only clears if the clipboard still contains the product key (won't clear if user copied something else)
3. **Notification**: User is notified when the key is auto-cleared

### Configuration

Adjust the auto-clear timeout in `activationKeys.json`:

```json
"settings": {
  "clearClipboardAfterSeconds": 30
}
```

- Set to `0` to disable auto-clear
- Recommended: 15-60 seconds
- Longer times give users more time to paste, but increase sharing risk

### Limitations of Clipboard Protection

⚠️ **Important**: Once a key is in the Windows clipboard, it's technically possible for users to:

- Paste it into any application (notepad, social media, etc.)
- Take screenshots of the key display
- Use third-party clipboard managers that log clipboard history
- Copy the key again before it auto-clears

### Additional Protection Options (Not Implemented)

Other possible protections that could be added:

- **Window focus monitoring**: Clear clipboard if user switches away from GFWL
- **Screenshot detection**: Detect when screenshot tools are running (Windows Security API)
- **Clipboard monitoring**: Actively monitor and clear clipboard when specific apps (Discord, Twitter, etc.) gain focus
- **Key obfuscation**: Show partial key with reveal button (e.g., "R9GJT-**\***-**\***-**\***-6VBWW")
- **Time-limited keys**: Generate time-expiring product keys (requires server infrastructure)
- **Watermarking**: Embed user-specific identifiers in displayed keys for tracking

However, these have limitations:

- Can be bypassed by determined users
- May harm legitimate use cases
- Could violate user privacy
- Add significant complexity

### Best Practice

The current auto-clear approach balances **usability** and **security**:

- ✅ Allows legitimate activation
- ✅ Reduces casual key sharing
- ✅ Non-intrusive to users
- ❌ Won't stop determined sharing attempts

## Security Note

⚠️ This file contains product keys. Do not share this file publicly or commit it to public repositories if it contains valid keys.

## Troubleshooting

### "Failed to Load Activation Keys"

- Ensure `activationKeys.json` exists in `app/config/`
- Check that the JSON syntax is valid (use a JSON validator)

### "Activation Failed"

- Verify the PCID and product key are correctly paired
- Ensure the PCID format is exactly 16 hex characters
- Check that the product key format is correct (5 groups of 5 characters)

### "PCID Not Found"

- Launch the game at least once to generate a PCID
- The game must have run to completion of the activation prompt screen
