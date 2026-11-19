// Blind Year engine: pure, deterministic, no DOM. Needs data.js (SHILLER) loaded first.
// All returns are REAL (after inflation). Values are in today's-money dollars of the start month.
var BY = (function () {
  'use strict';
  var D = SHILLER;
  var N = D.price.length;
  var ROUNDS = 5, STEP = 24, HORIZON = ROUNDS * STEP; // 5 moves, each held 2 years: a 10-year game
  var START_VALUE = 10000;
  var FIRST = 120; // 1881-01: first month with a CAPE and a 12-month inflation reading
  var EPOCH = Date.UTC(2026, 10, 18); // puzzle #1 = 2026-11-18

  function yearOf(i) { return 1871 + Math.floor(i / 12); }
  function monthOf(i) { return i % 12; }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function label(i) { return MONTHS[monthOf(i)] + ' ' + yearOf(i); }

  // --- Monthly real gross returns, month i -> i+1 ---------------------------------------------
  // Bond: a fresh 10-year par bond bought at yield y0 (annual coupons), repriced a month later at y1.
  function bondPrice(c, y, n) {
    if (Math.abs(y) < 1e-9) return 1 + c * n;
    var v = Math.pow(1 + y, -n);
    return c * (1 - v) / y + v;
  }
  var stockR = [], bondR = [], cashR = [];
  for (var i = 0; i < N - 1; i++) {
    var infl = D.cpi[i] / D.cpi[i + 1];
    stockR.push((D.price[i + 1] + D.div[i + 1] / 12) / D.price[i] * infl);
    var y0 = D.rate[i] / 100, y1 = D.rate[i + 1] / 100;
    bondR.push((bondPrice(y0, y1, 10 - 1 / 12) + y0 / 12) * infl);
    cashR.push(infl); // the mattress: 0% nominal, so it only ever moves with prices
  }

  var LAST = N - 1 - HORIZON; // last start month with a full 10 years of data ahead
  var eligible = [];
  for (var s = FIRST; s <= LAST; s++) eligible.push(s);

  // --- Seeded randomness and the daily order ---------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var order = eligible.slice();
  (function () {
    var r = mulberry32(0xB11D7EA2);
    for (var k = order.length - 1; k > 0; k--) {
      var j = Math.floor(r() * (k + 1)), t = order[k]; order[k] = order[j]; order[j] = t;
    }
  })();

  function puzzleNumber(y, m, d) { // local calendar date -> puzzle number (1-based)
    return Math.round((Date.UTC(y, m, d) - EPOCH) / 86400000) + 1;
  }
  function dailyStart(n) {
    var k = ((n - 1) % order.length + order.length) % order.length;
    return order[k];
  }
  function practiceStart(u) { // u in [0,1)
    return eligible[Math.min(eligible.length - 1, Math.floor(u * eligible.length))];
  }

  // --- Clues: what the player sees at the start of each round ----------------------------------
  function clues(i) {
    return {
      cape: D.cape[i],
      divYield: D.div[i] / D.price[i] * 100,
      rate: D.rate[i],
      inflation: (D.cpi[i] / D.cpi[i - 12] - 1) * 100
    };
  }

  // --- Simulation -------------------------------------------------------------------------------
  function norm(a) { // {s,b,c} percents -> fractions summing to 1
    var t = (a.s || 0) + (a.b || 0) + (a.c || 0);
    if (t <= 0) return { s: 0, b: 0, c: 1 };
    return { s: (a.s || 0) / t, b: (a.b || 0) / t, c: (a.c || 0) / t };
  }
  function grow(arr, from, months) {
    var g = 1;
    for (var k = 0; k < months; k++) g *= arr[from + k];
    return g;
  }

  // Each round: split the pot by the allocation, let each sleeve ride for 24 months (no rebalancing).
  function simulate(start, allocs) {
    var value = START_VALUE, path = [value], rounds = [];
    for (var r = 0; r < allocs.length && r < ROUNDS; r++) {
      var a = norm(allocs[r]), t0 = start + r * STEP;
      var vs = value * a.s, vb = value * a.b, vc = value * a.c, before = value;
      for (var k = 0; k < STEP; k++) {
        vs *= stockR[t0 + k]; vb *= bondR[t0 + k]; vc *= cashR[t0 + k];
        path.push(vs + vb + vc);
      }
      value = vs + vb + vc;
      rounds.push({
        alloc: allocs[r],
        ret: value / before - 1,
        stock: grow(stockR, t0, STEP) - 1,
        bond: grow(bondR, t0, STEP) - 1,
        cash: grow(cashR, t0, STEP) - 1
      });
    }
    return { path: path, rounds: rounds, final: value };
  }

  var BENCH = { s: 60, b: 40, c: 0 };
  function repeat(a) { var o = []; for (var r = 0; r < ROUNDS; r++) o.push(a); return o; }

  function hindsight(start) { // all-in on the best asset every round
    var v = START_VALUE;
    for (var r = 0; r < ROUNDS; r++) {
      var t0 = start + r * STEP;
      v *= Math.max(grow(stockR, t0, STEP), grow(bondR, t0, STEP), grow(cashR, t0, STEP));
    }
    return v;
  }

  // Square per round: your 2-year return vs the 60/40 benchmark over the same 2 years.
  function squares(you, bench) {
    return you.rounds.map(function (r, k) {
      var d = r.ret - bench.rounds[k].ret;
      return d > 0.01 ? 'G' : d < -0.01 ? 'R' : 'Y';
    });
  }

  function result(start, allocs) {
    var you = simulate(start, allocs);
    var bench = simulate(start, repeat(BENCH));
    return {
      start: start,
      you: you,
      bench: bench,
      hold: simulate(start, repeat({ s: 100, b: 0, c: 0 })),
      bonds: simulate(start, repeat({ s: 0, b: 100, c: 0 })),
      mattress: simulate(start, repeat({ s: 0, b: 0, c: 100 })),
      best: hindsight(start),
      squares: squares(you, bench),
      era: eraFor(yearOf(start))
    };
  }

  function money(v) {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e4) return '$' + (v / 1e3).toFixed(1) + 'k';
    return '$' + Math.round(v).toLocaleString('en-US');
  }

  function shareText(res, puzzle) {
    var em = { G: '🟩', Y: '🟨', R: '🟥' };
    var you = res.you.final, b = res.bench.final;
    var head = puzzle ? 'Blind Year #' + puzzle : 'Blind Year (practice)';
    return head + ' ' + res.squares.map(function (q) { return em[q]; }).join('') + '\n' +
      '$10k → ' + money(you) + ' real (60/40: ' + money(b) + ')\n' +
      (you >= b ? 'Beat the benchmark' : 'Lost to the benchmark') + ' · era hidden';
  }

  // --- Eras: revealed at the end, collected in the album ----------------------------------------
  var ERAS = [
    { from: 1881, to: 1892, name: 'The Railroad Age', blurb: 'Gilded Age America laid track at a furious pace. Railroads dominated the market, prices were drifting down, and there was no central bank or income tax.' },
    { from: 1893, to: 1897, name: 'Panic of 1893', blurb: 'Overbuilt railroads failed and banks ran short of gold. A deep depression followed, with mass unemployment and a long fight over the gold standard.' },
    { from: 1898, to: 1906, name: 'The Trust Boom', blurb: 'Giant mergers formed US Steel and other trusts. Gold discoveries lifted prices, and stocks rode a powerful industrial expansion.' },
    { from: 1907, to: 1913, name: 'Panic of 1907', blurb: 'A failed copper corner set off runs on New York trust companies. J.P. Morgan organized the rescue, and the scare led to the Federal Reserve in 1913.' },
    { from: 1914, to: 1918, name: 'The Great War', blurb: 'The NYSE closed for months in 1914. War demand boomed, but wartime inflation quietly ate the real value of stocks and bonds alike.' },
    { from: 1919, to: 1921, name: 'Postwar Whiplash', blurb: 'Inflation spiked after the war, then the Fed tightened hard. The 1920–21 depression brought sharp deflation and some of the cheapest stocks of the century.' },
    { from: 1922, to: 1928, name: 'The Roaring Twenties', blurb: 'Radio, autos and electricity spread fast. Stocks climbed year after year, and buying on margin became a national pastime.' },
    { from: 1929, to: 1932, name: 'The Crash', blurb: 'October 1929 ended the boom. By mid-1932 stocks had lost most of their value, banks failed by the thousands and prices fell steadily.' },
    { from: 1933, to: 1937, name: 'The New Deal Rally', blurb: 'The US left the gold standard, banks were insured and stocks rebounded violently from their lows, though unemployment stayed high.' },
    { from: 1938, to: 1941, name: 'Recession and War Clouds', blurb: 'A sharp 1937–38 recession hit just as recovery seemed real. Then war spread across Europe and Asia, and markets drifted sideways.' },
    { from: 1942, to: 1945, name: 'World War II', blurb: 'The economy mobilized for total war. The Fed pinned interest rates low, rationing held down prices, and stocks quietly began a long climb.' },
    { from: 1946, to: 1949, name: 'Peace and Price Controls Off', blurb: 'Wartime price controls ended and inflation jumped. Stocks stalled at low valuations while bondholders lost ground to rising prices.' },
    { from: 1950, to: 1956, name: 'The Postwar Boom', blurb: 'Suburbs, highways and the baby boom. Earnings surged, dividends were generous and stocks delivered some of their best real returns ever.' },
    { from: 1957, to: 1961, name: 'The Eisenhower Recessions', blurb: 'Short recessions in 1957 and 1960 interrupted the boom. Stocks kept grinding higher as investors grew comfortable paying more for earnings.' },
    { from: 1962, to: 1966, name: 'The Go-Go Years', blurb: 'A flash crash in 1962, then a strong run with low inflation and growth stocks in fashion. Inflation began to stir by the mid-sixties.' },
    { from: 1967, to: 1972, name: 'The Nifty Fifty', blurb: 'Investors paid any price for famous growth companies. Vietnam spending pushed inflation up and the dollar left gold in 1971.' },
    { from: 1973, to: 1974, name: 'The Oil Shock', blurb: 'An oil embargo quadrupled prices, Watergate shook confidence and stocks fell hard while inflation hit double digits.' },
    { from: 1975, to: 1979, name: 'Stagflation', blurb: 'Stocks were cheap but went nowhere in real terms. Inflation kept climbing, punishing anyone holding bonds or cash.' },
    { from: 1980, to: 1982, name: 'The Volcker Squeeze', blurb: 'The Fed pushed rates toward 20% to break inflation. It worked, and set the stage for the longest bond rally in history.' },
    { from: 1983, to: 1987, name: 'Morning in America', blurb: 'Falling inflation and rates lifted everything. Stocks soared until Black Monday in October 1987, the biggest one-day crash on record.' },
    { from: 1988, to: 1994, name: 'Steady Nineties', blurb: 'A short recession, the Gulf War and the 1994 bond rout, but the long trend was lower inflation and rising profits.' },
    { from: 1995, to: 1999, name: 'Dot-Com Mania', blurb: 'The internet arrived and valuations went vertical. By 1999 stocks were priced higher relative to earnings than at any point in history.' },
    { from: 2000, to: 2002, name: 'The Dot-Com Bust', blurb: 'The bubble burst, then 9/11 and accounting scandals followed. Stocks fell for three straight years while bonds did well.' },
    { from: 2003, to: 2006, name: 'The Housing Boom', blurb: 'Low rates fueled a housing bubble and easy credit. Stocks recovered steadily while risks built quietly in mortgage markets.' },
    { from: 2007, to: 2009, name: 'The Global Financial Crisis', blurb: 'Subprime losses brought down Lehman Brothers and froze credit worldwide. Stocks halved before central banks flooded the system with money.' },
    { from: 2010, to: 2013, name: 'The QE Recovery', blurb: 'Near-zero rates and bond buying by the Fed. Inflation stayed low and stocks began one of the longest bull markets ever.' }
  ];
  function eraFor(y) {
    for (var k = 0; k < ERAS.length; k++) if (y >= ERAS[k].from && y <= ERAS[k].to) return ERAS[k];
    return ERAS[ERAS.length - 1];
  }

  return {
    ROUNDS: ROUNDS, STEP: STEP, HORIZON: HORIZON, START_VALUE: START_VALUE, BENCH: BENCH,
    eligible: eligible, order: order, ERAS: ERAS,
    yearOf: yearOf, label: label, clues: clues, simulate: simulate, result: result, hindsight: hindsight,
    puzzleNumber: puzzleNumber, dailyStart: dailyStart, practiceStart: practiceStart,
    shareText: shareText, money: money, eraFor: eraFor,
    _stockR: stockR, _bondR: bondR, _cashR: cashR
  };
})();
