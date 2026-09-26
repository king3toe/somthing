const { execSync } = require('child_process');

try {
  // We need to squash everything since our first branch commit.
  // We are currently on jules-14864799708709938437-9222933b which branch off from main.

  // Get the hash of the original main commit
  const mergeBase = execSync('git merge-base main HEAD').toString().trim();

  execSync(`git reset --soft ${mergeBase}`);
  execSync('git add -A');
  execSync('git commit -m "feat: everyroute core phase 1 & 2"');

  console.log("Squashed successfully");
} catch (e) {
  console.log(e.message);
}
