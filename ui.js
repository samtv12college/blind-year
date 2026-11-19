// Blind Year UI. All game math lives in engine.js (BY); this file only renders and stores progress.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'blindyear.v1';

  // --- Storage (per-viewer convenience; the game works without it) ---------------------------
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return s; } catch (e) {}
    return { daily: {}, streak: 0, lastDone: 0, album: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  var store = load();
  store.daily = store.daily || {}; store.album = store.album || {};

  var now = new Date();
  var today = BY.puzzleNumber(now.getFullYear(), now.getMonth(), now.getDate());
  var params = new URLSearchParams(location.search);
  var forced = parseInt(params.get('n'), 10);
  if (forced > 0) today = forced; // ?n=12 replays an earlier puzzle (handy for testing)

  var game = null; // { mode, puzzle, start, allocs, cur }
  var SCREENS = ['intro', 'round', 'interlude', 'reveal'];
  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  // --- Clue reading aids: where each number sits in the full 1881-2013 record ------------------
  var DIST = (function () {
    var keys = ['cape', 'divYield', 'rate', 'inflation'], d = {};
    keys.forEach(function (k) { d[k] = BY.eligible.map(function (s) { return BY.clues(s)[k]; }).sort(function (a, b) { return a - b; }); });
    return d;
  })();
  function pctile(k, v) {
    var a = DIST[k], lo = 0, hi = a.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
    return lo / a.length;
  }
  function tag(p) { return p < 0.1 ? 'very low' : p < 0.3 ? 'low' : p <= 0.7 ? 'typical' : p <= 0.9 ? 'high' : 'very high'; }
  var CLUES = [
    { k: 'cape', name: 'CAPE ratio', fmt: function (v) { return v.toFixed(1); }, hint: 'Price vs the past decade’s average earnings. Higher = pricier stocks.' },
    { k: 'divYield', name: 'Dividend yield', fmt: function (v) { return v.toFixed(1) + '%'; }, hint: 'Yearly payout as a share of price. Higher usually = cheaper stocks.' },
    { k: 'rate', name: '10-yr bond yield', fmt: function (v) { return v.toFixed(2) + '%'; }, hint: 'What new bonds pay. If it rises later, older bonds lose value.' },
    { k: 'inflation', name: 'Inflation (12 mo)', fmt: function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }, hint: 'Mattress cash loses this much buying power a year.' }
  ];

  // --- Formatting ------------------------------------------------------------------------------
  function money(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  function pct(x, digits) {
    var s = (x * 100).toFixed(digits == null ? 1 : digits);
    if (/^-?0(\.0+)?$/.test(s)) return '0' + s.replace(/^-?0/, '') + '%';
    return (x > 0 ? '+' : '') + s + '%';
  }
  function cls(x) { return x > 0.0005 ? 'pos' : x < -0.0005 ? 'neg' : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // --- Header ----------------------------------------------------------------------------------
  function renderHeader() {
    $('puzzle-tag').textContent = game && game.mode === 'practice' ? 'Practice' : '#' + today;
    var n = Object.keys(store.album).length;
    $('album-count').textContent = '(' + n + '/' + BY.ERAS.length + ')';
  }
  function setDateline(open, start) {
    var el = $('dateline');
    if (open) {
      var parts = BY.label(start).split(' ');
      el.innerHTML = '<i>' + parts[0] + '</i> <i>' + parts[1] + '</i>';
      el.classList.add('open');
    } else {
      el.innerHTML = '<i>████████</i> <i>████</i>';
      el.classList.remove('open');
    }
  }

  // --- Intro -----------------------------------------------------------------------------------
  function renderIntro() {
    game = null; renderHeader(); setDateline(false);
    var d = store.daily[today];
    $('start-btn').textContent = d && d.done ? 'See today’s result' : d && d.allocs && d.allocs.length ? 'Resume today’s year' : 'Play today’s year';
    var st = currentStreak();
    $('streak-line').textContent = st ? 'Streak: ' + st + ' day' + (st === 1 ? '' : 's') + '. A new year unlocks at midnight.' : 'A new year unlocks at midnight, the same one for everyone.';
    show('intro');
  }
  function currentStreak() {
    if (store.lastDone === today || store.lastDone === today - 1) return store.streak || 0;
    return 0;
  }

  function startDaily() {
    var d = store.daily[today] || (store.daily[today] = { allocs: [] });
    game = { mode: 'daily', puzzle: today, start: BY.dailyStart(today), allocs: d.allocs.slice(), cur: { s: 60, b: 40, c: 0 } };
    renderHeader();
    if (d.done || game.allocs.length >= BY.ROUNDS) return renderReveal();
    renderRound();
  }
  function startPractice() {
    game = { mode: 'practice', puzzle: 0, start: BY.practiceStart(Math.random()), allocs: [], cur: { s: 60, b: 40, c: 0 } };
    renderHeader(); setDateline(false); renderRound();
  }

  // --- A move ----------------------------------------------------------------------------------
  function renderRound() {
    var r = game.allocs.length, t = game.start + r * BY.STEP;
    var sim = BY.simulate(game.start, game.allocs);
    $('round-kicker').textContent = 'Move ' + (r + 1) + ' of ' + BY.ROUNDS + ' · year ' + (r * 2) + ' of 10';
    $('round-value').textContent = money(sim.final);
    var chg = sim.final / BY.START_VALUE - 1;
    $('round-sub').innerHTML = r ? '<span class="' + cls(chg) + '">' + pct(chg) + '</span> real since you started' : 'Starting pot, in today’s dollars of the hidden month';
    drawSpark($('round-spark'), sim.path);

    var now = BY.clues(t), prev = [];
    for (var k = 0; k < r; k++) prev.push(BY.clues(game.start + k * BY.STEP));
    $('clues').innerHTML = CLUES.map(function (c) {
      var v = now[c.k], p = pctile(c.k, v);
      var trail = prev.length ? 'Before: ' + prev.map(function (x) { return c.fmt(x[c.k]); }).join(' → ') : '';
      return '<div class="clue"><div class="name">' + c.name + '</div>' +
        '<div class="num">' + c.fmt(v) + '<span class="tag" title="Compared with every month from 1881 to 2013">' + tag(p) + '</span></div>' +
        '<div class="trail">' + trail + '</div><div class="hint">' + c.hint + '</div></div>';
    }).join('');

    if (r > 0) game.cur = Object.assign({}, game.allocs[r - 1]);
    renderSplit();
    $('lock-btn').textContent = r === BY.ROUNDS - 1 ? 'Lock in the final 2 years' : 'Lock in for 2 years';
    show('round');
  }

  function drawSpark(svg, path) {
    var lo = Math.min.apply(null, path.concat([BY.START_VALUE])), hi = Math.max.apply(null, path.concat([BY.START_VALUE]));
    if (hi - lo < 1) { hi += 500; lo -= 500; }
    var X = function (i) { return i / BY.HORIZON * 120; }, Y = function (v) { return 38 - (v - lo) / (hi - lo) * 36; };
    var d = path.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
    svg.innerHTML = '<line x1="0" x2="120" y1="' + Y(BY.START_VALUE) + '" y2="' + Y(BY.START_VALUE) + '"/>' + (path.length > 1 ? '<path d="' + d + '"/>' : '');
  }

  // --- The split bar: two handles, 5% steps -------------------------------------------------------
  var PRESETS = [
    { label: 'All stocks', a: { s: 100, b: 0, c: 0 } },
    { label: '80 / 20', a: { s: 80, b: 20, c: 0 } },
    { label: '60 / 40', a: { s: 60, b: 40, c: 0 } },
    { label: 'All bonds', a: { s: 0, b: 100, c: 0 } },
    { label: 'Half mattress', a: { s: 50, b: 0, c: 50 } },
    { label: 'All mattress', a: { s: 0, b: 0, c: 100 } }
  ];
  $('presets').innerHTML = PRESETS.map(function (p, i) { return '<button type="button" data-i="' + i + '">' + p.label + '</button>'; }).join('');
  $('presets').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !game) return;
    game.cur = Object.assign({}, PRESETS[+b.dataset.i].a); renderSplit();
  });

  function renderSplit() {
    var a = game.cur, h1 = a.s, h2 = a.s + a.b;
    [['seg-s', a.s], ['seg-b', a.b], ['seg-c', a.c]].forEach(function (x) {
      var el = $(x[0]); el.style.flex = '0 0 ' + x[1] + '%';
      el.firstChild.textContent = x[1] >= 12 ? x[1] + '%' : '';
    });
    $('h1').style.left = h1 + '%'; $('h2').style.left = h2 + '%';
    $('h1').setAttribute('aria-valuenow', h1); $('h1').setAttribute('aria-valuetext', 'Stocks ' + a.s + '%');
    $('h2').setAttribute('aria-valuenow', h2); $('h2').setAttribute('aria-valuetext', 'Mattress ' + a.c + '%');
    $('pct-s').textContent = a.s + '%'; $('pct-b').textContent = a.b + '%'; $('pct-c').textContent = a.c + '%';
    Array.prototype.forEach.call($('presets').children, function (b, i) {
      var p = PRESETS[i].a; b.setAttribute('aria-pressed', p.s === a.s && p.b === a.b && p.c === a.c ? 'true' : 'false');
    });
  }
  function setHandles(h1, h2) {
    h1 = Math.max(0, Math.min(100, h1)); h2 = Math.max(h1, Math.min(100, h2));
    game.cur = { s: h1, b: h2 - h1, c: 100 - h2 }; renderSplit();
  }
  (function wireSplit() {
    var bar = $('split'), active = null, startX = 0;
    function at(e) { var r = bar.getBoundingClientRect(); return Math.round((e.clientX - r.left) / r.width * 20) * 5; }
    function h() { return [game.cur.s, game.cur.s + game.cur.b]; }
    bar.addEventListener('pointerdown', function (e) {
      if (!game) return;
      var v = at(e), hs = h();
      if (e.target.id === 'h1' || e.target.id === 'h2') active = hs[0] === hs[1] ? 'tie' : e.target.id;
      else active = Math.abs(v - hs[0]) < Math.abs(v - hs[1]) ? 'h1' : Math.abs(v - hs[0]) > Math.abs(v - hs[1]) ? 'h2' : (hs[0] === hs[1] ? 'tie' : 'h1');
      startX = v; bar.setPointerCapture(e.pointerId);
      if (active !== 'tie') move(v);
      e.preventDefault();
    });
    function move(v) {
      var hs = h();
      if (active === 'tie') { if (v === startX) return; active = v < startX ? 'h1' : 'h2'; }
      if (active === 'h1') setHandles(Math.min(v, hs[1]), hs[1]);
      else setHandles(hs[0], Math.max(v, hs[0]));
    }
    bar.addEventListener('pointermove', function (e) { if (active) move(at(e)); });
    ['pointerup', 'pointercancel'].forEach(function (t) { bar.addEventListener(t, function () { active = null; }); });
    ['h1', 'h2'].forEach(function (id) {
      $(id).addEventListener('keydown', function (e) {
        var d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -25, PageUp: 25 }[e.key];
        if (d == null || !game) return;
        var hs = h();
        if (id === 'h1') setHandles(Math.min(hs[0] + d, hs[1]), hs[1]); else setHandles(hs[0], Math.max(hs[1] + d, hs[0]));
        e.preventDefault();
      });
    });
  })();

  // --- Locking a move ----------------------------------------------------------------------------
  $('lock-btn').addEventListener('click', function () {
    game.allocs.push(Object.assign({}, game.cur));
    if (game.mode === 'daily') { store.daily[game.puzzle].allocs = game.allocs.slice(); save(); }
    renderInterlude();
  });

  function renderInterlude() {
    var r = game.allocs.length - 1;
    var you = BY.simulate(game.start, game.allocs);
    var bench = BY.simulate(game.start, game.allocs.map(function () { return BY.BENCH; }));
    var rd = you.rounds[r], br = bench.rounds[r];
    $('int-kicker').textContent = 'Years ' + (r * 2) + '–' + (r * 2 + 2) + ' are in';
    $('int-value').textContent = money(you.final);
    drawChart($('int-chart'), [
      { values: bench.path, cls: 'bench' },
      { values: you.path, cls: 'you', animate: true }
    ], { fromMonth: r * BY.STEP, height: 240 });
    var rows = [
      ['Your mix (' + rd.alloc.s + '/' + rd.alloc.b + '/' + rd.alloc.c + ')', rd.ret, 'me'],
      ['60/40 benchmark', br.ret, ''],
      ['Stocks', rd.stock, ''], ['10-yr bonds', rd.bond, ''], ['Mattress', rd.cash, '']
    ];
    $('int-table').innerHTML = rows.map(function (x) {
      return '<tr class="' + x[2] + '"><td>' + x[0] + '</td><td class="' + cls(x[1]) + '">' + pct(x[1]) + '</td></tr>';
    }).join('');
    var d = rd.ret - br.ret;
    $('int-verdict').textContent = d > 0.01 ? 'You beat the benchmark by ' + (d * 100).toFixed(1) + ' points.' :
      d < -0.01 ? 'The benchmark beat you by ' + (-d * 100).toFixed(1) + ' points.' : 'Dead even with the benchmark.';
    $('next-btn').textContent = r === BY.ROUNDS - 1 ? 'Reveal the year' : 'Next move';
    show('interlude');
  }
  $('next-btn').addEventListener('click', function () {
    if (game.allocs.length >= BY.ROUNDS) renderReveal(); else renderRound();
  });

  // --- Charts --------------------------------------------------------------------------------------
  function drawChart(svg, series, opt) {
    var W = 640, H = opt.height, L = 56, R = 26, T = 12, B = 28;
    var all = [BY.START_VALUE];
    series.forEach(function (s) { all = all.concat(s.values); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var pad = (hi - lo) * 0.08 || 500; lo -= pad; hi += pad;
    var X = function (i) { return L + i / BY.HORIZON * (W - L - R); };
    var Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var out = [];
    if (opt.fromMonth != null) out.push('<rect class="shade" x="' + X(opt.fromMonth) + '" y="' + T + '" width="' + (X(opt.fromMonth + BY.STEP) - X(opt.fromMonth)) + '" height="' + (H - T - B) + '"/>');
    niceTicks(lo, hi, 4).forEach(function (v) {
      out.push('<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>');
      out.push('<text x="' + (L - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + BY.money(v) + '</text>');
    });
    out.push('<line class="base" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(BY.START_VALUE) + '" y2="' + Y(BY.START_VALUE) + '"/>');
    for (var y = 0; y <= 10; y += 2) {
      var lbl = opt.realYears ? String(BY.yearOf(game.start) + y) : 'yr ' + y;
      out.push('<text x="' + X(y * 12) + '" y="' + (H - 8) + '" text-anchor="middle">' + lbl + '</text>');
    }
    series.forEach(function (s) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
      out.push('<path class="line ' + s.cls + (s.animate ? ' draw' : '') + '" d="' + d + '"/>');
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = out.join('');
    Array.prototype.forEach.call(svg.querySelectorAll('.draw'), function (p) {
      p.style.setProperty('--len', Math.ceil(p.getTotalLength()));
    });
  }
  function niceTicks(lo, hi, n) {
    var step = Math.pow(10, Math.floor(Math.log10((hi - lo) / n)));
    var err = (hi - lo) / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var t = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) t.push(v);
    return t;
  }

  // --- Reveal --------------------------------------------------------------------------------------
  function renderReveal() {
    var res = BY.result(game.start, game.allocs);
    game.res = res;
    if (game.mode === 'daily') {
      var d = store.daily[game.puzzle];
      if (!d.done) {
        d.done = true; d.squares = res.squares.join(''); d.final = Math.round(res.you.final);
        if (game.puzzle === today) {
          store.streak = store.lastDone === today - 1 ? (store.streak || 0) + 1 : store.lastDone === today ? store.streak : 1;
          store.lastDone = today;
        }
      }
    }
    if (!store.album[res.era.name]) store.album[res.era.name] = game.mode === 'daily' ? '#' + game.puzzle : 'practice';
    save(); renderHeader();

    setDateline(true, game.start);
    $('rev-date').textContent = BY.label(game.start);
    $('rev-era').textContent = res.era.name;
    $('rev-blurb').textContent = res.era.blurb;
    $('rev-squares').innerHTML = res.squares.map(function (q, i) { return '<div class="sq ' + q + '" title="Move ' + (i + 1) + '">' + (i + 1) + '</div>'; }).join('');
    drawChart($('rev-chart'), [
      { values: res.mattress.path, cls: 'cash' },
      { values: res.hold.path, cls: 'hold' },
      { values: res.bench.path, cls: 'bench' },
      { values: res.you.path, cls: 'you', animate: true }
    ], { height: 260, realYears: true });
    $('rev-key').innerHTML = '<span><i class="dot you"></i>You</span><span><i class="dot bench"></i>60/40</span><span><i class="dot s"></i>All stocks</span><span><i class="dot c"></i>Mattress</span>';
    var rows = [
      ['You', res.you.final, 'me'], ['60/40 benchmark', res.bench.final, ''], ['All stocks, held', res.hold.final, ''],
      ['All bonds', res.bonds.final, ''], ['Mattress', res.mattress.final, ''], ['Perfect hindsight', res.best, '']
    ];
    $('rev-table').innerHTML = rows.map(function (x) {
      var g = x[1] / BY.START_VALUE - 1;
      return '<tr class="' + x[2] + '"><td>' + x[0] + '</td><td>' + money(x[1]) + ' <span class="' + cls(g) + '">(' + pct(g, 0) + ')</span></td></tr>';
    }).join('');
    var won = res.you.final >= res.bench.final;
    $('rev-note').textContent = (won ? 'You beat a plain 60/40 mix. ' : 'A plain 60/40 mix beat you. ') +
      'All figures are real: ' + money(BY.START_VALUE) + ' means the same buying power you started with in ' + BY.yearOf(game.start) + '.';
    $('share-status').textContent = '';
    show('reveal');
  }

  $('share-btn').addEventListener('click', function () {
    var text = BY.shareText(game.res, game.mode === 'daily' ? game.puzzle : 0);
    function done() { $('share-status').textContent = 'Copied. No spoilers in it.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
    } else { fallback(text); done(); }
  });
  function fallback(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // --- Album -------------------------------------------------------------------------------------
  $('album-btn').addEventListener('click', function () {
    $('album-grid').innerHTML = BY.ERAS.map(function (e) {
      var got = store.album[e.name];
      return '<div class="stamp' + (got ? ' got' : '') + '"><div class="yrs">' + (got ? e.from + '–' + e.to + ' · ' + esc(got) : '????') + '</div><div class="nm">' + e.name + '</div></div>';
    }).join('');
    $('album').showModal();
  });
  $('album-close').addEventListener('click', function () { $('album').close(); });

  $('start-btn').addEventListener('click', startDaily);
  $('practice-btn').addEventListener('click', startPractice);
  $('again-btn').addEventListener('click', startPractice);
  document.querySelector('.brand').addEventListener('click', renderIntro);

  renderIntro();
})();
