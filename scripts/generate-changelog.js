const fs = require("fs");
const path = require("path");

// Paths
const CHANGELOG_MD = path.join(__dirname, "..", "CHANGELOG.md");
const CHANGELOG_JSON = path.join(__dirname, "..", "changelog.json");

console.log("[Changelog] Generating changelog.json from CHANGELOG.md...");

try {
  // Check if CHANGELOG.md exists
  if (!fs.existsSync(CHANGELOG_MD)) {
    console.log("[Changelog] CHANGELOG.md not found - skipping changelog generation");
    // Create empty changelog.json
    fs.writeFileSync(CHANGELOG_JSON, JSON.stringify({}, null, 2));
    process.exit(0);
  }

  // Read CHANGELOG.md
  const markdown = fs.readFileSync(CHANGELOG_MD, "utf8");

  // Parse changelog
  const changelog = {};
  const versionRegex = /## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})/g;
  
  let match;
  const versions = [];

  // Find all version headers
  while ((match = versionRegex.exec(markdown)) !== null) {
    versions.push({
      version: match[1],
      date: match[2],
      index: match.index,
    });
  }

  // Extract notes for each version
  for (let i = 0; i < versions.length; i++) {
    const current = versions[i];
    const next = versions[i + 1];

    // Get content between current and next version (or end of file)
    const startIndex = current.index;
    const endIndex = next ? next.index : markdown.length;
    const content = markdown.substring(startIndex, endIndex);

    // Extract lines after the version header
    const lines = content.split("\n").slice(1); // Skip version header line
    const notes = [];

    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and horizontal rules
      if (!trimmed || trimmed === "---") continue;

      // Check for section headers (### Added, ### Fixed, etc.)
      if (trimmed.startsWith("### ")) {
        currentSection = trimmed.substring(4); // Remove "### "
        continue;
      }

      // Check for bullet points
      if (trimmed.startsWith("- ")) {
        const note = trimmed.substring(2); // Remove "- "
        
        // Add section prefix if we have one
        if (currentSection) {
          notes.push(`**${currentSection}:** ${note}`);
        } else {
          notes.push(note);
        }
      }
    }

    // Add to changelog object
    if (notes.length > 0) {
      changelog[current.version] = {
        version: current.version,
        date: current.date,
        notes: notes,
      };
    }
  }

  // Write changelog.json
  fs.writeFileSync(CHANGELOG_JSON, JSON.stringify(changelog, null, 2));

  const versionCount = Object.keys(changelog).length;
  console.log(`[Changelog] ✅ Generated changelog.json with ${versionCount} version(s)`);
  
  // Log versions found
  Object.keys(changelog).forEach((version) => {
    console.log(`[Changelog]   - v${version} (${changelog[version].notes.length} notes)`);
  });

} catch (error) {
  console.error("[Changelog] ❌ Error generating changelog:", error);
  // Create empty changelog.json on error
  fs.writeFileSync(CHANGELOG_JSON, JSON.stringify({}, null, 2));
  process.exit(0); // Don't fail the build
}

