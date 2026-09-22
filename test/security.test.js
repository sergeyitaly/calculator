/* Security tests.

   The app is a static page with no backend, no accounts and no user data, so
   the realistic risks are: code injection through an HTML sink, loading code
   from somewhere else, and a service worker that caches more than it should.
   Each of those is asserted here so a future edit cannot quietly undo it. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const sw = read('sw.js');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  console.log('FAIL  ' + name + (detail ? '\n      ' + detail : ''));
}

/* ---------- no dynamic code execution ---------- */
const DANGEROUS = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /\bdocument\.write\s*\(/,
  /setTimeout\s*\(\s*['"`]/,
  /setInterval\s*\(\s*['"`]/,
  /\.outerHTML\s*=/,
  /insertAdjacentHTML/
];
DANGEROUS.forEach(re => {
  ok('index.html avoids ' + re, !re.test(html));
  ok('sw.js avoids ' + re, !re.test(sw));
});

/* ---------- every innerHTML sink takes a literal we control ---------- */
const SAFE_SINKS = ['k.w', 'k.s', 'k.a', 'k.l', 'html'];
const sinks = [...html.matchAll(/\.innerHTML\s*=\s*([A-Za-z0-9_.]+)\s*;/g)].map(m => m[1]);
ok('innerHTML is only ever set from known-safe sources',
  sinks.length > 0 && sinks.every(s => SAFE_SINKS.includes(s)),
  'found: ' + JSON.stringify(sinks));
ok('nothing typed by the user reaches innerHTML',
  !/innerHTML\s*=\s*[^;]*\b(entry|val|result|buf|v\b)/.test(html));

/* ---------- no inline event handlers (they would need unsafe-inline) ---- */
ok('no inline on* handlers in the markup',
  !/<[^>]+\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));
ok('no javascript: urls', !/javascript:/i.test(html));

/* ---------- nothing is loaded from another origin ---------- */
const urls = [...html.matchAll(/https?:\/\/[^\s"')]+/g)].map(m => m[0]);
const ALLOWED = ['http://www.w3.org/2000/svg'];       /* the SVG namespace, not a fetch */
ok('no third-party resources', urls.every(u => ALLOWED.includes(u)),
  'found: ' + JSON.stringify(urls.filter(u => !ALLOWED.includes(u))));
ok('no external script tags', !/<script[^>]+src=/i.test(html));
ok('no external stylesheets', !/<link[^>]+rel=["']?stylesheet/i.test(html));
ok('the page never calls fetch or XHR', !/\bfetch\s*\(|XMLHttpRequest/.test(html));
ok('no cookies or storage of anything personal',
  !/document\.cookie|localStorage|sessionStorage|indexedDB/.test(html));

/* ---------- the policy that enforces all of the above ---------- */
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
ok('a Content-Security-Policy is present', !!csp);
if (csp) {
  const p = csp[1];
  ["default-src 'self'", "object-src 'none'", "base-uri 'none'",
    "form-action 'none'", "frame-ancestors 'none'"].forEach(d =>
      ok('CSP contains ' + d, p.includes(d)));
  ok('CSP does not allow unsafe-inline scripts', !/script-src[^;]*unsafe-inline/.test(p));
  ok('CSP does not allow unsafe-eval', !p.includes('unsafe-eval'));
  ok('CSP pins the inline script by hash', /script-src 'sha256-[A-Za-z0-9+/=]+'/.test(p));
  ok('CSP pins the inline style by hash', /style-src 'sha256-[A-Za-z0-9+/=]+'/.test(p));
}
try {
  execFileSync(process.execPath, [path.join(root, 'tools', 'csp.js'), '--check'], { stdio: 'pipe' });
  pass++;
} catch (e) {
  fail++;
  console.log('FAIL  the CSP hashes match index.html\n      ' +
    String(e.stdout || '') + String(e.stderr || ''));
}

/* ---------- service worker ---------- */
ok('the worker only handles same-origin requests',
  /origin !== self\.location\.origin/.test(sw));
ok('the worker only caches GET', /req\.method !== 'GET'/.test(sw));
ok('the worker pulls in no remote code', !/importScripts/.test(sw));
ok('the worker caches an explicit list', /const ASSETS = \[/.test(sw));

/* ---------- manifest ---------- */
let manifest = null;
try { manifest = JSON.parse(read('manifest.webmanifest')); } catch (e) { /* reported below */ }
ok('the manifest is valid JSON', !!manifest);
if (manifest) {
  ok('the manifest stays inside its own folder',
    manifest.start_url.startsWith('./') && manifest.scope.startsWith('./'));
  ok('the manifest icons are local',
    manifest.icons.length > 0 && manifest.icons.every(i => i.src.startsWith('./')));
}

/* ---------- house style: no emoji outside markdown ---------- */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
['index.html', 'sw.js', 'manifest.webmanifest', 'tools/csp.js'].forEach(f => {
  ok('no emoji in ' + f, !EMOJI.test(read(f)));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
