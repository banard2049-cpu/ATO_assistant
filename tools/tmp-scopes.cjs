const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/ato-terms.js'), 'utf8'), box);
const terms = box.window.ATO_TERMS;
const byScope = new Map();
for (const p of terms) {
  const key = p.scope || '(global)';
  byScope.set(key, (byScope.get(key) || 0) + 1);
}
console.log('pairs', terms.length);
for (const [scope, count] of [...byScope.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(String(count).padStart(4), scope);
}
