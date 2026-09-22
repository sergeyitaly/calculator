/* Engine tests: they drive the real node-tree -> tokenizer -> parser path
   used by the calculator itself, with a stub DOM so nothing renders. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');


function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
  const ctx = {
    document: { getElementById: () => null, addEventListener: () => {} },
    navigator: {}, setTimeout, console, Math, Number, String, Array, JSON
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { filename: 'fx82.js' });
  return ctx.FX;
}

const FX = load(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const { C, FRAC, MIX, SQRT, ROOT, SUP } = FX;

/* ---- build a node tree from a compact test notation -------------------
   \f{a}{b} fraction   \s{a} sqrt   \r{n}{a} n-th root   \p{e} power
   \m{i}{n}{d} mixed   \E{e} x10^e  ~ = the (-) key      * / - are mapped
   sin( cos( tan( log( ln( Abs( asin( acos( atan( sinh( pi Ans nPr nCr     */
function build(s) {
  let i = 0;
  function list(stop) {
    const out = [];
    while (i < s.length) {
      const ch = s[i];
      if (stop && ch === stop) break;
      if (ch === '\\') {
        const k = s[i + 1];
        i += 2;
        if (k === 'f') out.push(FRAC(brace(), brace()));
        else if (k === 'm') out.push(MIX(brace(), brace(), brace()));
        else if (k === 's') out.push(SQRT(brace()));
        else if (k === 'r') out.push(ROOT(brace(), brace()));
        else if (k === 'p') out.push(SUP(brace()));
        else if (k === 'E') out.push(SUP(brace(), 'x10'));
        else if (k === 'T') out.push(SUP(brace(), '10'));
        else if (k === 'X') out.push(SUP(brace(), 'e'));
        else throw new Error('bad escape ' + k);
        continue;
      }
      const words = ['sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'sinh(', 'cosh(', 'tanh(',
        'sin(', 'cos(', 'tan(', 'log(', 'ln(', 'Abs(', 'Pol(', 'Rec(', 'nPr', 'nCr', 'Ans', 'Ran#'];
      const w = words.find(w => s.startsWith(w, i));
      if (w) { out.push(C(w)); i += w.length; continue; }
      i++;
      if (ch === '*') out.push(C('×'));
      else if (ch === '/') out.push(C('÷'));
      else if (ch === '-') out.push(C('−'));
      else if (ch === '~') out.push(C('-'));
      else if (ch === 'P') out.push(C('π'));
      else if (ch === ' ') continue;
      else out.push(C(ch));
    }
    return out;
  }
  function brace() {
    if (s[i] !== '{') throw new Error('expected {');
    i++;
    const l = list('}');
    i++;
    return l;
  }
  const r = list(null);
  return r;
}

function txt(nodes) {
  return nodes.map(n => {
    if (n.k === 'c') return n.v;
    if (n.k === 'frac') return '(' + txt(n.n) + '/' + txt(n.d) + ')';
    if (n.k === 'mix') return '[' + txt(n.i) + ' ' + txt(n.n) + '/' + txt(n.d) + ']';
    if (n.k === 'sqrt') return '√(' + txt(n.a) + ')';
    if (n.k === 'root') return txt(n.n) + '√(' + txt(n.a) + ')';
    if (n.k === 'sup') return (n.pre || '') + '^(' + txt(n.e) + ')';
    return '?';
  }).join('');
}

/* what the second line of the display would read */
function answer(src) {
  const nodes = build(src);
  let v;
  try { v = FX.evaluate(nodes); }
  catch (e) { return (e && e.kind ? e.kind : 'Syntax') + ' ERROR'; }
  const dec = FX.hasDecimal(nodes);
  const ex = FX.exactNodes(v, !dec);
  if (FX.ST.ang === 'D' && FX.hasDMS(nodes)) return FX.dmsParts(v);
  if (ex && !dec) return txt(ex);
  return txt(FX.decimalNodes(FX.fmtParts(v)));
}
function decimal(src) {
  const nodes = build(src);
  let v;
  try { v = FX.evaluate(nodes); }
  catch (e) { return (e && e.kind ? e.kind : 'Syntax') + ' ERROR'; }
  return txt(FX.decimalNodes(FX.fmtParts(v)));
}

let pass = 0, fail = 0;
function eq(src, want, how) {
  const got = (how || answer)(src);
  if (String(got) === String(want)) { pass++; return; }
  fail++;
  console.log('FAIL  ' + src + '\n      want ' + want + '\n      got  ' + got);
}
function angle(a) { FX.ST.ang = a; }
function disp(d) { FX.ST.disp = d; }

/* ------------------------- priority table --------------------------- */
eq('2+3*4', '14');
eq('(2+3)*4', '20');
eq('6/2(1+2)', '9');                 // a bracket multiplies at the x/div level
eq('6/2P', '0.9549296586');          // ...but pi binds tighter: 6/(2pi)
eq('6/2\\s{9}', '1');                // and so does a function: 6/(2*3)
eq('1+2*3-4/2', '5');
eq('~2\\p{2}', '−4');           // (-)2 squared is -4
eq('(~2)\\p{2}', '4');
eq('2\\p{3\\p{2}}', '512');          // the second power nests inside the first
eq('5nPr2', '20');
eq('5nCr2', '10');
eq('2+3nCr2', '5');                  // nCr binds tighter than +

/* ------------------------- exact answers ---------------------------- */
eq('1/3', '(1/3)');
eq('2/4', '(1/2)');
eq('\\f{1}{2}+\\f{1}{3}', '(5/6)');
eq('\\s{8}', '2√(2)');
eq('\\f{1}{\\s{2}}', '(√(2)/2)');
eq('\\s{2}+\\s{8}', '3√(2)');
eq('P/4', '(π/4)');
eq('2P', '2π');
eq('1.5+1', '2.5');                  // a typed decimal keeps the answer decimal
eq('0.5+0.25', '0.75');
eq('\\m{2}{1}{2}+1', '(7/2)');       // mixed fraction input
eq('7/7', '1');
eq('1/7', '(1/7)');           // 10 significant digits, no tidy fraction

/* ------------------------- functions -------------------------------- */
angle('D');
eq('sin(30)', '(1/2)');
eq('cos(60)', '(1/2)');
eq('tan(45)', '1');
eq('sin(180)', '0');
eq('tan(90)', 'Math ERROR');
eq('sin⁻¹(1)', '90');
eq('log(100)', '2');
eq('ln(1)', '0');
eq('\\T{2}', '100');                 // 10^2
eq('\\X{0}', '1');                   // e^0
eq('5!', '120');
eq('70!', 'Math ERROR');
eq('Abs(~7)', '7');
eq('\\r{3}{~8}', '−2');          // odd roots of negatives are real
eq('\\s{~4}', 'Math ERROR');
eq('1/0', 'Math ERROR');
eq('100*15%', '15');
eq('12°30°0°', '12°30°0°');
eq('2°', '2');                   // a lone degree mark in Deg mode
angle('R');
eq('sin(P/2)', '1');
eq('2°', '(π/90)');       // 2 degrees expressed in radians
angle('D');

/* ------------------------- display modes ---------------------------- */
eq('\\E{5}2', 'Syntax ERROR');        // x10^ must follow a number
eq('2\\E{5}', '200000');
eq('2\\E{~3}', '2x10^(−3)', decimal);
eq('1/200', '5x10^(−3)', decimal); // Norm 1 leaves the fixed range below 10^-2
disp({ t: 'norm', n: 2 });
eq('1/200', '0.005', decimal);
disp({ t: 'fix', n: 2 });
eq('1/3', '0.33', decimal);
disp({ t: 'sci', n: 3 });
eq('123456', '1.23x10^(5)', decimal);
disp({ t: 'norm', n: 1 });
eq('12345678901', '1.23456789x10^(10)', decimal);
eq('9999999999', '9999999999', decimal);

/* ------------------------- errors ----------------------------------- */
eq('2+', 'Syntax ERROR');
eq('2+3)', 'Syntax ERROR');
eq('(2+3', '5');                     // a missing bracket is closed at =
eq('sin(30', '(1/2)');
eq('\\f{}{2}', 'Syntax ERROR');
eq('\\f{1}{0}', 'Math ERROR');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
