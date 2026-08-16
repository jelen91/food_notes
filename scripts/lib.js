// Zpřístupní TypeScriptové moduly z lib/ pro CLI skripty.
//
// V projektu není ts-node ani tsx, takže lib přeložíme lokálním tsc do .cli-build/
// a překlad opakujeme jen když se zdrojáky změnily.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.cli-build');

function newestSource(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestSource(full));
    else if (entry.name.endsWith('.ts')) newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

function build() {
  const marker = path.join(OUT, 'lib', 'store.js');
  const sourceTime = newestSource(path.join(ROOT, 'lib'));
  if (fs.existsSync(marker) && fs.statSync(marker).mtimeMs > sourceTime) return;

  process.stdout.write('Překládám lib/… ');
  execFileSync(
    path.join(ROOT, 'node_modules', '.bin', 'tsc'),
    [
      '--outDir', OUT,
      '--rootDir', ROOT,
      '--module', 'commonjs',
      '--target', 'es2019',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--skipLibCheck',
      '--resolveJsonModule',
      '--noEmitOnError', 'false',
      'lib/db.ts',
      'lib/store.ts',
      'lib/crypto.ts',
      'lib/password.ts',
      'lib/schema.ts',
      'lib/tenant/registry.ts',
      'lib/billing.ts',
      'lib/accounts.ts',
      'lib/onboarding.ts',
    ],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }
  );
  console.log('hotovo.');
}

build();

module.exports = (name) => require(path.join(OUT, 'lib', name));
