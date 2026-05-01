/**
 * Validation utility for activationKeys.json
 * Run this script to validate your activation keys configuration
 * 
 * Usage: node app/config/validateConfig.js
 */

// NOTE: This is a standalone CLI utility (run via
// `node app/config/validateConfig.js`). It intentionally uses console.log
// directly instead of safeLog because:
//   1. It runs outside the Electron runtime, where electron-log can't
//      resolve app.getPath('userData') and would throw at require time.
//   2. The output is meant for the user's terminal (with ANSI colors),
//      not the launcher's main.log file.
const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  // eslint-disable-next-line no-console -- standalone CLI; see file header.
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateActivationKey(keyEntry, index) {
  const errors = [];
  const warnings = [];
  
  // Validate ID
  if (typeof keyEntry.id !== 'number') {
    errors.push(`Key ${index + 1}: 'id' must be a number`);
  }
  
  // Validate name (optional, but if present must be string)
  if (keyEntry.name !== undefined && typeof keyEntry.name !== 'string') {
    errors.push(`Key ${index + 1}: 'name' must be a string if provided`);
  }
  
  // Validate product key format (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)
  if (!keyEntry.productKey || typeof keyEntry.productKey !== 'string') {
    errors.push(`Key ${index + 1}: 'productKey' is required and must be a string`);
  } else if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/i.test(keyEntry.productKey)) {
    errors.push(`Key ${index + 1}: 'productKey' must follow format XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (got: '${keyEntry.productKey}')`);
  }
  
  // Validate PCIDs array
  if (!keyEntry.pcids || !Array.isArray(keyEntry.pcids)) {
    errors.push(`Key ${index + 1}: 'pcids' must be an array`);
  } else {
    if (keyEntry.pcids.length === 0) {
      errors.push(`Key ${index + 1}: 'pcids' array cannot be empty`);
    } else if (keyEntry.pcids.length > 15) {
      errors.push(`Key ${index + 1}: 'pcids' array cannot have more than 15 PCIDs (got ${keyEntry.pcids.length})`);
    }
    
    // Validate each PCID format
    keyEntry.pcids.forEach((pcid, pcidIndex) => {
      if (typeof pcid !== 'string') {
        errors.push(`Key ${index + 1}, PCID ${pcidIndex + 1}: must be a string`);
      } else if (!/^[0-9A-Fa-f]{16}$/.test(pcid)) {
        errors.push(`Key ${index + 1}, PCID ${pcidIndex + 1}: must be exactly 16 hexadecimal characters (got: '${pcid}')`);
      } else if (/^0{16}$/.test(pcid)) {
        warnings.push(`Key ${index + 1}, PCID ${pcidIndex + 1}: appears to be a placeholder (all zeros)`);
      }
    });
    
    // Check for duplicate PCIDs within this key entry
    const uniquePcids = [...new Set(keyEntry.pcids)];
    if (uniquePcids.length !== keyEntry.pcids.length) {
      errors.push(`Key ${index + 1}: contains duplicate PCIDs`);
    }
  }
  
  // Warn about placeholder values
  if (keyEntry.productKey && /^[XY]{5}-[XY]{5}-[XY]{5}-[XY]{5}-[XY]{5}$/i.test(keyEntry.productKey)) {
    warnings.push(`Key ${index + 1}: Product key appears to be a placeholder`);
  }
  
  return { errors, warnings };
}

function validateConfig() {
  const configPath = path.join(__dirname, 'activationKeys.json');
  
  log('\n🔍 Validating Activation Keys Configuration...', 'cyan');
  log(`📄 File: ${configPath}\n`, 'blue');
  
  // Check if file exists
  if (!fs.existsSync(configPath)) {
    log('❌ ERROR: activationKeys.json not found!', 'red');
    log(`   Expected location: ${configPath}\n`, 'yellow');
    return false;
  }
  
  // Read and parse file
  let config;
  try {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(fileContent);
    log('✅ JSON syntax is valid', 'green');
  } catch (parseError) {
    log('❌ ERROR: Invalid JSON syntax!', 'red');
    log(`   ${parseError.message}\n`, 'yellow');
    return false;
  }
  
  // Validate structure
  if (!config.activationKeys || !Array.isArray(config.activationKeys)) {
    log('❌ ERROR: "activationKeys" must be an array!', 'red');
    return false;
  }
  
  if (config.activationKeys.length === 0) {
    log('❌ ERROR: No activation keys defined!', 'red');
    return false;
  }
  
  const totalPcids = config.activationKeys.reduce((sum, key) => sum + (key.pcids?.length || 0), 0);
  log(`✅ Found ${config.activationKeys.length} activation key(s) with ${totalPcids} total PCID(s)`, 'green');
  
  // Check for duplicate IDs
  const ids = config.activationKeys.map(p => p.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    log(`❌ ERROR: Duplicate IDs found: ${duplicateIds.join(', ')}`, 'red');
    return false;
  }
  log('✅ All IDs are unique', 'green');
  
  // Check for duplicate PCIDs across all keys
  const allPcids = config.activationKeys.flatMap(key => key.pcids || []);
  const duplicatePcids = allPcids.filter((pcid, index) => allPcids.indexOf(pcid) !== index);
  if (duplicatePcids.length > 0) {
    log(`⚠️  WARNING: Duplicate PCIDs found across keys: ${[...new Set(duplicatePcids)].join(', ')}`, 'yellow');
    log('   Note: Same PCID used with different keys may cause conflicts', 'yellow');
  }
  
  // Check settings
  if (config.settings) {
    const clearSeconds = config.settings.clearClipboardAfterSeconds;
    if (clearSeconds !== undefined) {
      if (typeof clearSeconds === 'number' && clearSeconds >= 0) {
        log(`✅ Clipboard auto-clear: ${clearSeconds} seconds`, 'green');
      } else {
        log(`⚠️  WARNING: clearClipboardAfterSeconds should be a non-negative number`, 'yellow');
      }
    }
  }
  
  // Validate each key entry
  let hasErrors = false;
  let hasWarnings = false;
  
  log('\n📋 Validating individual activation keys:\n', 'cyan');
  
  config.activationKeys.forEach((keyEntry, index) => {
    const { errors, warnings } = validateActivationKey(keyEntry, index);
    
    const displayName = keyEntry.name ? `${keyEntry.name} (ID: ${keyEntry.id})` : `Key ID: ${keyEntry.id}`;
    log(`Key ${index + 1}: ${displayName}`, 'blue');
    log(`  Product Key: ${keyEntry.productKey || '(missing)'}`);
    log(`  PCIDs: ${keyEntry.pcids?.length || 0} PCID(s)`);
    if (keyEntry.pcids && keyEntry.pcids.length > 0) {
      keyEntry.pcids.forEach((pcid, idx) => {
        log(`    ${idx + 1}. ${pcid}`);
      });
    }
    
    if (errors.length > 0) {
      hasErrors = true;
      errors.forEach(error => log(`  ❌ ${error}`, 'red'));
    }
    
    if (warnings.length > 0) {
      hasWarnings = true;
      warnings.forEach(warning => log(`  ⚠️  ${warning}`, 'yellow'));
    }
    
    if (errors.length === 0 && warnings.length === 0) {
      log('  ✅ Valid', 'green');
    }
    
    log(''); // Empty line
  });
  
  // Final summary
  log('═'.repeat(50), 'cyan');
  if (hasErrors) {
    log('❌ VALIDATION FAILED - Please fix the errors above', 'red');
    return false;
  } else if (hasWarnings) {
    log('⚠️  VALIDATION PASSED WITH WARNINGS', 'yellow');
    log('   The configuration is valid but you may want to address the warnings', 'yellow');
    return true;
  } else {
    log('✅ VALIDATION PASSED - Configuration is valid!', 'green');
    return true;
  }
}

// Run validation
const isValid = validateConfig();
process.exit(isValid ? 0 : 1);

