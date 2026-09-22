# Security

## What this app is

A static page served from GitHub Pages. There is no server, no database, no login, no
analytics, no cookies and no third-party code. It never sends anything anywhere: the only
network request it ever makes is the browser fetching its own six files, and after the
first visit even that stops, because the service worker serves them from the local cache.

Nothing you type is stored or transmitted. Memories (A–F, X, Y, M and Ans) live in a
JavaScript variable and disappear when the app is closed. One thing is kept on the device:
a single `localStorage` entry, `calculator.prefs`, holding two settings - whether the key
click is on, and which of the five case colours you picked, as in `on grey`. It never
leaves the browser, and a test asserts that this is the only value the page reads or
writes.

## What is enforced, and where

| Risk | What prevents it | Checked by |
|---|---|---|
| Injected code running in the page | A `Content-Security-Policy` meta tag that pins the inline script and the inline style by SHA-256 hash. No `unsafe-inline`, no `unsafe-eval`. | `test/security.test.js`, `tools/csp.js --check` |
| Dynamic code execution | No `eval`, no `new Function`, no `document.write`, no string timers. | `test/security.test.js` |
| HTML injection through a DOM sink | Everything the user types is rendered with `textContent`. `innerHTML` is only ever assigned fixed key labels and the help/install panels, and the test asserts the exact list of sources. | `test/security.test.js` |
| Third-party or remote code | No `<script src>`, no external stylesheets, no fonts or CDNs, no `fetch`/`XHR` in the page. | `test/security.test.js` |
| Inline event handlers | None in the markup; all listeners are attached in code (an `onclick` attribute would need `unsafe-inline`). | `test/security.test.js` |
| A service worker caching things it should not | It ignores anything that is not a same-origin `GET`, has an explicit asset list, and pulls in no remote code. | `test/security.test.js` |
| Clickjacking | `frame-ancestors 'none'` in the policy. GitHub Pages cannot send response headers, so this is the meta-tag form. | `test/security.test.js` |
| Anything being stored about you | The only write to storage is the key-click setting and the case colour, under a fixed key name. The test matches every `localStorage` call in the file and fails if there is a third one or if the key is not the constant. | `test/security.test.js` |
| A stored value being trusted on the way back in | The case colour read from storage is matched against a fixed list of five names before it reaches the DOM, so a tampered entry cannot put anything of its own into the page. | `test/security.test.js` |
| Dependency supply chain | There are no dependencies. `package.json` has an empty dependency tree and the tests run on plain Node. | n/a |
| Unknown code-level issues | GitHub CodeQL with the `security-extended` query pack, on every push and weekly. | `.github/workflows/codeql.yml` |

Every one of these runs in CI on each push and pull request
(`.github/workflows/ci.yml`), so a change that weakens one of them fails the build.

## Known limitations

* `frame-ancestors`, `X-Frame-Options` and `Strict-Transport-Security` can only be fully
  enforced with response headers, which GitHub Pages does not let you set. The meta-tag
  CSP covers what a meta tag can cover. (Pages does serve the site over HTTPS and sends
  HSTS for `*.github.io`.)
* The random functions use `Math.random()`. That is correct for `Ran#` and `RanInt` on a
  calculator and is not used for anything security-relevant.

## Reporting something

If you find a problem, please open an issue on
<https://github.com/sergeyitaly/calculator/issues>, or use GitHub's private
vulnerability reporting on the repository's Security tab.
