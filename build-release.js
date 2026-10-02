const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("Building everyRoute release...");

// We will package the src, dist, package.json, and install.sh
try {
   execSync('npm run build', { stdio: 'inherit' });
   execSync('zip -r everyRoute-release.zip src dist package.json package-lock.json install.sh README.md tailwind.config.js tsconfig.json', { stdio: 'inherit' });
   console.log("Created everyRoute-release.zip successfully!");
} catch (e) {
   console.error("Failed to build release:", e.message);
}
