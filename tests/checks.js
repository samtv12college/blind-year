// Engine checks. Run with ./test.sh (macOS JavaScriptCore, no Node needed).
load('data.js'); load('engine.js');
var fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; print('FAIL: ' + msg); } }
function idx(y, m) { return (y - 1871) * 12 + (m - 1); }
function annual(arr, a, b) { var g = 1; for (var i = a; i < b; i++) g *= arr[i]; return Math.pow(g, 12 / (b - a)) - 1; }
function total(arr, a, b) { var g = 1; for (var i = a; i < b; i++) g *= arr[i]; return g - 1; }
function pct(x) { return (x * 100).toFixed(1) + '%'; }

// 1. Data sanity: every eligible start has 10 full years of finite returns ahead.
BY.eligible.forEach(function (s) {
  for (var k = 0; k < BY.HORIZON; k++) {
    var t = s + k;
    if (!(BY._stockR[t] > 0.5 && BY._stockR[t] < 1.6 && BY._bondR[t] > 0.8 && BY._bondR[t] < 1.25 && BY._cashR[t] > 0.9 && BY._cashR[t] < 1.1)) {
      ok(false, 'odd monthly return at ' + BY.label(t)); return;
    }
  }
  var c = BY.clues(s);
  ok(c.cape > 0 && isFinite(c.divYield) && c.rate > 0 && isFinite(c.inflation), 'clues at ' + BY.label(s));
});
ok(BY.label(BY.eligible[0]) === 'January 1881', 'first start is Jan 1881, got ' + BY.label(BY.eligible[0]));
ok(BY.label(BY.eligible[BY.eligible.length - 1]) === 'June 2013', 'last start is Jun 2013, got ' + BY.label(BY.eligible[BY.eligible.length - 1]));

// 2. Real returns match well-known history (Shiller monthly averages, so wide-ish bands).
var crash = total(BY._stockR, idx(1929, 9), idx(1932, 6));
print('Stocks Sep 1929 -> Jun 1932 real total: ' + pct(crash));
ok(crash < -0.6 && crash > -0.85, 'Great Crash real loss');
var bull = annual(BY._stockR, idx(1982, 8), idx(1999, 12));
print('Stocks Aug 1982 -> Dec 1999 real annual: ' + pct(bull));
ok(bull > 0.11 && bull < 0.17, '80s-90s bull market');
var lost = annual(BY._stockR, idx(2000, 1), idx(2010, 1));
print('Stocks 2000s real annual: ' + pct(lost));
ok(lost < -0.01 && lost > -0.06, 'lost decade');
var bondBull = annual(BY._bondR, idx(1981, 9), idx(1991, 9));
print('Bonds Sep 1981 -> Sep 1991 real annual: ' + pct(bondBull));
ok(bondBull > 0.06 && bondBull < 0.14, 'Volcker bond rally');
var bondBear = annual(BY._bondR, idx(1946, 1), idx(1981, 9));
print('Bonds 1946 -> 1981 real annual: ' + pct(bondBear));
ok(bondBear < 0 && bondBear > -0.035, 'great bond bear market');
var mat = total(BY._cashR, idx(1973, 1), idx(1983, 1));
print('Mattress 1973 -> 1983 real total: ' + pct(mat));
ok(mat < -0.5 && mat > -0.65, 'mattress loses to 70s inflation');

// 3. Simulation math.
var s0 = idx(1950, 1);
var hold = BY.simulate(s0, [{ s: 100 }, { s: 100 }, { s: 100 }, { s: 100 }, { s: 100 }]);
ok(Math.abs(hold.final / 10000 - 1 - total(BY._stockR, s0, s0 + 120)) < 1e-9, 'all-stock sim equals compounded stock return');
ok(hold.path.length === 121, 'path has 121 points');
var half = BY.simulate(s0, [{ s: 50, b: 50 }]);
var r0 = half.rounds[0];
ok(Math.abs(r0.ret - (0.5 * r0.stock + 0.5 * r0.bond)) < 1e-9, 'no-rebalance round return is the weighted sleeve return');
ok(BY.simulate(s0, [{ s: 0, b: 0, c: 0 }]).rounds[0].ret === BY.simulate(s0, [{ c: 100 }]).rounds[0].ret, 'empty allocation falls back to mattress');
var res = BY.result(s0, [{ s: 100 }, { b: 100 }, { c: 100 }, { s: 60, b: 40 }, { s: 100 }]);
ok(res.squares.length === 5 && res.squares[3] === 'Y', '60/40 round scores yellow');
ok(res.best >= res.you.final && res.best >= res.hold.final && res.best >= res.bench.final, 'hindsight is an upper bound');

// 4. Daily puzzles: deterministic, a permutation, no repeats for years.
ok(BY.puzzleNumber(2026, 10, 18) === 1 && BY.puzzleNumber(2026, 10, 19) === 2 && BY.puzzleNumber(2027, 0, 1) === 45, 'puzzle numbering');
var seen = {}, dup = false;
BY.order.forEach(function (s) { if (seen[s]) dup = true; seen[s] = 1; });
ok(!dup && BY.order.length === BY.eligible.length, 'daily order is a permutation');
ok(BY.dailyStart(1) === BY.order[0] && BY.dailyStart(BY.order.length + 1) === BY.order[0], 'daily order wraps');
var near = 0;
for (var n = 2; n <= 365; n++) if (Math.abs(BY.dailyStart(n) - BY.dailyStart(n - 1)) < 24) near++;
ok(near < 10, 'back-to-back days rarely land within 2 years of each other (' + near + ')');

// 5. Share text never leaks the date.
var txt = BY.shareText(res, 7);
ok(!/1[89]\d\d|20[01]\d/.test(txt.replace('#7', '')), 'share text is spoiler-free');
ok(txt.indexOf('Blind Year #7') === 0, 'share text header');
BY.eligible.forEach(function (s) { ok(!!BY.eraFor(BY.yearOf(s)).name, 'era for ' + BY.yearOf(s)); });

print(passes + ' passed, ' + fails + ' failed');
if (fails) throw new Error(fails + ' checks failed');
