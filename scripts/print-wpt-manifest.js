const manifest = require("../wpt-manifest.json");

for (const [group, tests] of Object.entries(manifest)) {
  if (!Array.isArray(tests)) continue;
  console.log(`${group}:`);
  for (const test of tests) console.log(`  ${test}`);
}
