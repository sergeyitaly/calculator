/* The page is a single file, so its script and style are inline. Instead of
   allowing 'unsafe-inline', the Content-Security-Policy lists the SHA-256 of
   exactly the script and the style that ship in index.html.

   node tools/csp.js          rewrite the policy with the current hashes
   node tools/csp.js --check  fail if the policy no longer matches the file
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'index.html');

function inner(html, tag) {
  const open = html.indexOf('<' + tag);
  if (open < 0) throw new Error('no <' + tag + '> in index.html');
  const start = html.indexOf('>', open) + 1;
  const end = html.indexOf('</' + tag + '>', start);
  if (end < 0) throw new Error('unterminated <' + tag + '>');
  return html.slice(start, end);
}

function sha(src) {
  return "'sha256-" + crypto.createHash('sha256').update(src, 'utf8').digest('base64') + "'";
}

function policy(html) {
  return [
    "default-src 'self'",
    'script-src ' + sha(inner(html, 'script')),
    'style-src ' + sha(inner(html, 'style')),
    "img-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

const TAG = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;

const html = fs.readFileSync(FILE, 'utf8');
const want = policy(html);
const found = TAG.exec(html);

if (process.argv.includes('--check')) {
  if (!found) {
    console.error('index.html has no Content-Security-Policy meta tag');
    process.exit(1);
  }
  if (found[1] !== want) {
    console.error('The CSP hashes are stale. Run: node tools/csp.js');
    console.error('  expected: ' + want);
    console.error('  found:    ' + found[1]);
    process.exit(1);
  }
  console.log('CSP matches the inline script and style.');
  process.exit(0);
}

if (!found) {
  console.error('index.html has no Content-Security-Policy meta tag to update');
  process.exit(1);
}
fs.writeFileSync(FILE, html.replace(TAG,
  '<meta http-equiv="Content-Security-Policy" content="' + want + '">'));
console.log('CSP updated:\n' + want);
