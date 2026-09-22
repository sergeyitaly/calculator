/* UI tests: real key presses through the real dispatcher, with the stub DOM.
   These cover the wiring between a key and the engine - the part the engine
   tests cannot see. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { makeDom, nodeText } = require('./dom');

const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(file, 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));

const dom = makeDom();
const ctx = {
  document: dom.document,
  navigator: { userAgent: 'node' },
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, Math, Number, String, Array, JSON, Date, RegExp, Object
};
ctx.window = Object.assign(ctx, dom.window);
vm.createContext(ctx);
vm.runInContext(js, ctx, { filename: 'fx82-ui.js' });
const FX = ctx.FX;

if (!FX || !FX.press) throw new Error('the calculator did not boot in the stub DOM');

/* serialise the answer line the way the display would lay it out */
function txt(nodes) {
  return nodes.map(n => {
    if (n.k === 'c') return n.v;
    if (n.k === 'frac') return '(' + txt(n.n) + '/' + txt(n.d) + ')';
    if (n.k === 'mix') return '[' + txt(n.i) + ' ' + txt(n.n) + '/' + txt(n.d) + ']';
    if (n.k === 'sqrt') return '√(' + txt(n.a) + ')';
    if (n.k === 'root') return txt(n.n) + '√(' + txt(n.a) + ')';
    if (n.k === 'logb') return 'log[' + txt(n.n) + '](' + txt(n.a) + ')';
    if (n.k === 'sup') return (n.pre || '') + '^(' + txt(n.e) + ')';
    return '?';
  }).join('');
}

let pass = 0, fail = 0;
function check(name, got, want) {
  if (String(got) === String(want)) { pass++; return; }
  fail++;
  console.log('FAIL  ' + name + '\n      want ' + want + '\n      got  ' + got);
}
function keys(seq) { seq.forEach(k => FX.press(k)); }
function fresh(seq) { FX.press('ac'); keys(seq); }
function answer(seq) {
  fresh(seq);
  if (FX.UI.error) return FX.UI.error + ' ERROR';
  return txt(FX.resultNodes());
}
function line1() { return nodeText(dom.byId.l1i); }

/* ---- arithmetic straight off the keypad ---- */
check('2+3=', answer(['2', 'add', '3', 'eq']), '5');
check('brackets', answer(['lp', '2', 'add', '3', 'rp', 'mul', '4', 'eq']), '20');
check('6/2(1+2)', answer(['6', 'div', '2', 'lp', '1', 'add', '2', 'rp', 'eq']), '9');

/* ---- multi-character tokens must go in as ONE node ---- */
FX.press('ac');
FX.press('sin');
check('sin( is one token', FX.UI.entry.length, 1);
check('sin(30)', answer(['sin', '3', '0', 'rp', 'eq']), '(1/2)');
check('Abs(', answer(['abs', '1', '2', 'sub', '5', 'rp', 'eq']), '7');
check('log base', answer(['logb', '2', 'repr', '1', '2', '8', 'repr', 'eq']), '7');
check('10^x', answer(['shift', 'log', '3', 'eq']), '1000');
check('x! on SHIFT x-1', answer(['5', 'shift', 'inv', 'eq']), '120');
check('cube key', answer(['3', 'cube', 'eq']), '27');

/* ---- natural display editing ---- */
check('fraction', answer(['frac', '1', 'repd', '2', 'repr', 'add', 'frac', '1', 'repd', '3', 'eq']), '(5/6)');
FX.press('ac');
keys(['1', '2', '3', 'repl', 'del']);
check('cursor and DEL', line1(), '1|3');
FX.press('ac');
keys(['sqrt', '8']);
check('root renders', line1().indexOf('√') >= 0, true);

/* ---- answer memory ---- */
check('Ans continues', answer(['2', 'add', '3', 'eq', 'mul', '4', 'eq']), '20');
fresh(['5', 'eq', 'shift', 'rcl', 'negk']);          /* STO A */
check('STO/RCL A', answer(['alpha', 'negk', 'eq']), '5');
fresh(['3', 'mplus']);                                /* M+ */
check('M+ adds to M', FX.ST.vars.M, 3);
fresh(['3', 'shift', 'mplus']);                       /* M- takes it back out */
check('M- subtracts', FX.ST.vars.M, 0);

/* ---- S<=>D and errors ---- */
fresh(['1', 'div', '3', 'eq']);
check('exact first', txt(FX.resultNodes()), '(1/3)');
FX.press('sd');
check('S<=>D to decimal', txt(FX.resultNodes()), '0.3333333333');
check('syntax error', answer(['2', 'add', 'eq']), 'Syntax ERROR');
check('math error', answer(['1', 'div', '0', 'eq']), 'Math ERROR');
FX.press('ac');
check('AC clears the error', FX.UI.error, null);

/* ---- menus ---- */
FX.press('ac');
FX.press('mode');
check('MODE opens a menu', FX.UI.screen, 'menu');
FX.press('3');
check('TABLE selected', FX.UI.mode, 'TABLE');
FX.press('mode'); FX.press('1');
check('back to COMP', FX.UI.mode, 'COMP');
FX.press('shift'); FX.press('mode');
check('SETUP opens', FX.UI.screen, 'menu');
FX.press('4');
check('Rad selected', FX.ST.ang, 'R');
FX.press('shift'); FX.press('mode'); FX.press('3');
check('Deg again', FX.ST.ang, 'D');

/* ---- help is reachable without the footer, which the app hides ---- */
FX.press('ac');
FX.press('shift');
FX.press('7');
check('SHIFT 7 opens help', dom.byId.scrim.classList.contains('show'), true);
check('help panel has content', dom.byId.sheet.innerHTML.length > 200, true);
dom.byId.scrim.classList.remove('show');

/* ---- the hidden games ---- */
FX.press('ac');
keys(['repu', 'repu', 'repd', 'repd', 'repl', 'repr', 'repl', 'repr']);
check('secret code opens the menu', FX.UI.menu && FX.UI.menu.title, 'GAME');
FX.press('1');
check('snake starts', FX.UI.screen, 'game');
check('snake has a body', FX.UI.game.body.length, 3);
FX.press('repd');
check('snake turns', FX.UI.game.turn.join(','), '0,1');
FX.press('ac');
check('AC leaves the game', FX.UI.screen, 'comp');
check('game timer stopped', FX.UI.game, null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
