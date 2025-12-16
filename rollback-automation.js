/**
 * Rollback Automation Script
 * 
 * This script monitors your player tracking API and can automatically:
 * 1. Track rollback progress (% of users on target version)
 * 2. Optionally update latest.yml when threshold is reached
 * 3. Optionally disable rollback.json when complete
 * 
 * REQUIREMENTS:
 * - Node.js installed on your server
 * - SSH access to update files on your server
 * - Environment variables configured (see below)
 * 
 * USAGE:
 *   node rollback-automation.js --monitor-only    # Just watch progress
 *   node rollback-automation.js --auto-update     # Auto-update files
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const CONFIG = {
  // Your player tracking API URL
  TRACKING_API: 'https://playertracker-production.up.railway.app/api/stats',
  
  // Your rollback config URL
  ROLLBACK_CONFIG_URL: 'http://157.245.214.234/launcher/rollback.json',
  
  // Threshold: disable rollback when this % of users are on safe version
  THRESHOLD_PERCENTAGE: 95,
  
  // Minimum number of active users required (avoid false positives with low sample size)
  MIN_ACTIVE_USERS: 5,
  
  // Check interval (in seconds)
  CHECK_INTERVAL: 300, // 5 minutes
  
  // Local paths (if running on same server as web files)
  LOCAL_FILES: {
    ROLLBACK_JSON: '/var/www/html/launcher/rollback.json',  // Update to your path
    LATEST_YML: '/var/www/html/launcher/latest.yml'         // Update to your path
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  return 0;
}

function updateRollbackConfig(enabled) {
  const configPath = CONFIG.LOCAL_FILES.ROLLBACK_JSON;
  
  try {
    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    current.enabled = enabled;
    fs.writeFileSync(configPath, JSON.stringify(current, null, 2), 'utf8');
    console.log(`✓ Updated rollback.json: enabled=${enabled}`);
    return true;
  } catch (error) {
    console.error('✗ Failed to update rollback.json:', error.message);
    return false;
  }
}

function updateLatestYml(targetVersion) {
  const ymlPath = CONFIG.LOCAL_FILES.LATEST_YML;
  
  try {
    let content = fs.readFileSync(ymlPath, 'utf8');
    
    // Replace version in YAML (simple string replacement)
    // Note: This assumes standard electron-updater YAML format
    content = content.replace(/version:\s*['"]?[\d.]+['"]?/g, `version: ${targetVersion}`);
    content = content.replace(/Setup%20([\d.]+)\.exe/g, `Setup%20${targetVersion}.exe`);
    content = content.replace(/Setup ([\d.]+)\.exe/g, `Setup ${targetVersion}.exe`);
    
    fs.writeFileSync(ymlPath, content, 'utf8');
    console.log(`✓ Updated latest.yml to version ${targetVersion}`);
    return true;
  } catch (error) {
    console.error('✗ Failed to update latest.yml:', error.message);
    return false;
  }
}

// ============================================================================
// Main Monitoring Logic
// ============================================================================

async function checkRollbackProgress(autoUpdate = false) {
  try {
    console.log('\n' + '='.repeat(70));
    console.log(`Rollback Progress Check - ${new Date().toLocaleString()}`);
    console.log('='.repeat(70));
    
    // Fetch current rollback config
    const rollbackConfig = await fetchJSON(CONFIG.ROLLBACK_CONFIG_URL);
    
    if (!rollbackConfig.enabled) {
      console.log('ℹ Rollback is currently DISABLED - monitoring inactive');
      return;
    }
    
    console.log(`\n📋 Rollback Target: v${rollbackConfig.targetVersion}`);
    console.log(`   Reason: ${rollbackConfig.reason || 'N/A'}`);
    
    // Fetch player stats
    const stats = await fetchJSON(CONFIG.TRACKING_API);
    
    const totalPlayers = stats.totalPlayers || 0;
    const versionStats = stats.versions || {};
    
    console.log(`\n👥 Active Players: ${totalPlayers}`);
    
    if (totalPlayers < CONFIG.MIN_ACTIVE_USERS) {
      console.log(`⚠ Warning: Sample size too small (< ${CONFIG.MIN_ACTIVE_USERS} users)`);
      console.log('   Waiting for more users to come online...');
      return;
    }
    
    // Calculate how many users are on safe versions (target or older)
    let safeUsers = 0;
    let affectedUsers = 0;
    
    console.log('\n📊 Version Distribution:');
    for (const [version, count] of Object.entries(versionStats)) {
      const percentage = ((count / totalPlayers) * 100).toFixed(1);
      const comparison = compareVersions(version, rollbackConfig.targetVersion);
      
      if (comparison <= 0) {
        safeUsers += count;
        console.log(`   ✓ v${version}: ${count} users (${percentage}%) - SAFE`);
      } else {
        affectedUsers += count;
        console.log(`   ⚠ v${version}: ${count} users (${percentage}%) - NEEDS ROLLBACK`);
      }
    }
    
    const safePercentage = ((safeUsers / totalPlayers) * 100).toFixed(1);
    
    console.log('\n' + '-'.repeat(70));
    console.log(`📈 Rollback Progress: ${safePercentage}% (${safeUsers}/${totalPlayers} users safe)`);
    console.log(`   Threshold: ${CONFIG.THRESHOLD_PERCENTAGE}%`);
    
    // Check if threshold reached
    if (parseFloat(safePercentage) >= CONFIG.THRESHOLD_PERCENTAGE) {
      console.log('\n🎉 THRESHOLD REACHED! Rollback is mostly complete.');
      
      if (autoUpdate) {
        console.log('\n🔄 Auto-update enabled - updating files...');
        
        // Update latest.yml to target version
        const ymlUpdated = updateLatestYml(rollbackConfig.targetVersion);
        
        // Disable rollback
        const rollbackDisabled = updateRollbackConfig(false);
        
        if (ymlUpdated && rollbackDisabled) {
          console.log('\n✅ Rollback automation complete!');
          console.log(`   - latest.yml now points to v${rollbackConfig.targetVersion}`);
          console.log('   - rollback.json disabled');
          console.log('\n💡 You can now release your fixed version when ready.');
          process.exit(0);
        } else {
          console.log('\n⚠ Some files failed to update - check errors above');
        }
      } else {
        console.log('\n💡 Recommended Actions:');
        console.log(`   1. Update latest.yml to point to v${rollbackConfig.targetVersion}`);
        console.log('   2. Set rollback.json enabled=false');
        console.log('   3. Release your fixed version');
        console.log('\n   Or run with --auto-update flag to do this automatically');
      }
    } else {
      console.log(`\n⏳ Still rolling back... ${affectedUsers} users still need to update`);
    }
    
    console.log('\n' + '='.repeat(70));
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

const args = process.argv.slice(2);
const autoUpdate = args.includes('--auto-update');
const monitorOnly = args.includes('--monitor-only');
const oneShot = args.includes('--once');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Rollback Automation Script
===========================

Usage:
  node rollback-automation.js [options]

Options:
  --monitor-only    Watch progress but don't update files (default)
  --auto-update     Automatically update files when threshold reached
  --once            Run once and exit (don't loop)
  --help, -h        Show this help

Configuration:
  Edit the CONFIG object at the top of this file to set:
  - TRACKING_API: Your player tracking API endpoint
  - THRESHOLD_PERCENTAGE: When to auto-disable (default: 95%)
  - CHECK_INTERVAL: How often to check (default: 5 minutes)
  - LOCAL_FILES: Paths to rollback.json and latest.yml on your server

Examples:
  # Monitor progress every 5 minutes
  node rollback-automation.js --monitor-only

  # Auto-update files when 95% of users are safe
  node rollback-automation.js --auto-update

  # Check once and exit
  node rollback-automation.js --once
  `);
  process.exit(0);
}

// ============================================================================
// Start Monitoring
// ============================================================================

console.log('🚀 Rollback Automation Script Starting...');
console.log(`   Mode: ${autoUpdate ? 'AUTO-UPDATE' : 'MONITOR ONLY'}`);
console.log(`   Interval: ${CONFIG.CHECK_INTERVAL}s`);
console.log(`   Threshold: ${CONFIG.THRESHOLD_PERCENTAGE}%`);

if (oneShot) {
  checkRollbackProgress(autoUpdate);
} else {
  // Run immediately, then on interval
  checkRollbackProgress(autoUpdate);
  setInterval(() => checkRollbackProgress(autoUpdate), CONFIG.CHECK_INTERVAL * 1000);
}

