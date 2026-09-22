/* A DOM small enough to boot the calculator inside Node.
   It is not a browser: it only supports what index.html actually calls, so
   the key handling, the display renderer and the games can be exercised
   without a headless browser in CI. */

function mkEl(tag) {
  const e = {
    tagName: tag,
    children: [],
    style: {},
    dataset: {},
    className: '',
    _text: null,
    classList: {
      set: new Set(),
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      contains(c) { return this.set.has(c); },
      toggle(c, v) {
        const on = v === undefined ? !this.set.has(c) : !!v;
        if (on) this.set.add(c); else this.set.delete(c);
      }
    },
    appendChild(c) {
      e._text = null;
      if (c && c._fragment) c.children.forEach(x => e.children.push(x));
      else e.children.push(c);
      return c;
    },
    setAttribute(k, v) { e[k] = v; },
    getAttribute(k) { return e[k]; },
    addEventListener() {},
    getContext() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    clientWidth: 300,
    scrollWidth: 100,
    offsetLeft: 0
  };
  Object.defineProperty(e, 'textContent', {
    get() {
      if (e._text != null) return e._text;
      return e.children.map(c => (c && c.textContent) || '').join('');
    },
    set(v) { e._text = v == null ? '' : String(v); e.children = []; }
  });
  Object.defineProperty(e, 'innerHTML', {
    get() { return e._html || ''; },
    /* the tests never read text back out of an innerHTML assignment, so the
       markup is kept as-is rather than half-parsed */
    set(v) { e._html = String(v); e._text = null; e.children = []; }
  });
  return e;
}

/* text of the top line, with the structure that matters made visible */
function nodeText(e) {
  if (!e) return '';
  if (e._text != null) return e._text;
  let out = '';
  for (const c of e.children) {
    const cls = (c && c.className) || '';
    if (cls === 'frac') out += '(' + nodeText(c.children[0]) + '/' + nodeText(c.children[1]) + ')';
    else if (cls === 'cur') out += '|';
    else if (cls === 'slot') out += '_';
    else if (c && c.tagName === 'sup') out += '^(' + nodeText(c) + ')';
    else if (c && c.tagName === 'sub') out += '[' + nodeText(c) + ']';
    else if (c && c.tagName === 'svg') out += '√';
    else out += nodeText(c);
  }
  return out;
}

function makeDom() {
  const byId = {};
  const ids = ['stage', 'lcd', 'ind', 'l1', 'l1i', 'l2', 'l2i', 'aleft', 'aright',
    'pad', 'installBtn', 'installTxt', 'helpBtn', 'scrim', 'sheet', 'gcanvas'];
  ids.forEach(id => { byId[id] = mkEl('div'); byId[id].id = id; });
  byId.gcanvas = null;                       /* created on demand by the game */

  const document = {
    body: mkEl('body'),
    createElement(tag) { return mkEl(tag); },
    createElementNS(ns, tag) { return mkEl(tag); },
    createDocumentFragment() { const f = mkEl('#fragment'); f._fragment = true; return f; },
    getElementById(id) { return byId[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    readyState: 'complete'
  };
  const window = {
    innerWidth: 400, innerHeight: 800,
    addEventListener() {},
    matchMedia() { return { matches: false, addEventListener() {} }; },
    document
  };
  return { window, document, byId, nodeText };
}

module.exports = { makeDom, nodeText, mkEl };
