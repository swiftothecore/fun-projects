/* Syntax-only checks: no application code, API calls, or credentials execute. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let checked = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (!/\.(?:js|cjs|html)$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/\.(?:js|cjs)$/.test(file)) {
      new vm.Script(source, { filename: file });
      checked++;
    } else if (file.endsWith('.html')) {
      let index = 0;
      for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=|application\/ld\+json/i.test(match[1]) || !match[2].trim()) continue;
        new vm.Script(match[2], { filename: `${file}:script-${++index}` });
        checked++;
      }
    }
  }
}
visit(root);
console.log(`${checked} scripts parsed`);
