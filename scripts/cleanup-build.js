/**
 * Cleanup script for electron-builder output
 * Removes debug/testing files that aren't needed for distribution
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

console.log('🧹 Cleaning up build artifacts...\n');

// Files and folders to remove
const itemsToRemove = [
  'win-unpacked',
  'builder-debug.yml',
  'builder-effective-config.yaml'
];

let removedCount = 0;
let errorCount = 0;

itemsToRemove.forEach(item => {
  const itemPath = path.join(distDir, item);
  
  try {
    if (fs.existsSync(itemPath)) {
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        // Remove directory recursively
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`✅ Removed directory: ${item}/`);
        removedCount++;
      } else if (stats.isFile()) {
        // Remove file
        fs.unlinkSync(itemPath);
        console.log(`✅ Removed file: ${item}`);
        removedCount++;
      }
    } else {
      console.log(`⏭️  Skipped (not found): ${item}`);
    }
  } catch (error) {
    console.error(`❌ Error removing ${item}:`, error.message);
    errorCount++;
  }
});

console.log(`\n✨ Cleanup complete!`);
console.log(`   Removed: ${removedCount} item(s)`);
if (errorCount > 0) {
  console.log(`   Errors: ${errorCount}`);
}

// List remaining files
console.log(`\n📦 Remaining files in dist/:`);
try {
  const remainingFiles = fs.readdirSync(distDir);
  remainingFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    const size = stats.isDirectory() 
      ? '(directory)' 
      : `(${(stats.size / 1024 / 1024).toFixed(2)} MB)`;
    console.log(`   - ${file} ${size}`);
  });
} catch (error) {
  console.error('Error reading dist directory:', error.message);
}

