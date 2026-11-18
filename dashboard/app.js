// Expected-Value Radar dashboard.
// Loads ../board.json (written by main.ts), renders the board, the farm-this-week
// strip, the detail view and the methodology. No network: the only fetch is a
// relative path to the board file beside this dashboard.
(function () {
  'use strict';

  var board = null;
  var selectedSlug = null;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function chg(v) {
    if (v === null || v === undefined) return 'n/a';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function verdictClass(v) {
    if (v === 'FARM NOW') return 'v-farm-now';
    if (v === 'FARM') return 'v-farm';
    if (v === 'WATCH') return 'v-watch';
    return 'v-pass';
  }

  function renderStats() {
    var rows = board.rows;
    var farmNow = rows.filter(function (r) { return r.verdict === 'FARM NOW'; }).length;
    var farm = rows.filter(function (r) { return r.verdict === 'FARM'; }).length;
    var cats = {};
    rows.forEach(function (r) { cats[r.category] = 1; });
    $('stats').innerHTML =
      stat(money(board.total_implied_value_usd), 'total implied value, all 342 rows') +
      stat('#' + rows.length, 'pre-token protocols ranked') +
      stat(String(board.watchlist_covered) + ' / ' + board.watchlist_count, 'watchlist protocols covered') +
      stat(String(farmNow + farm), 'worth farming now (' + farmNow + ' FARM NOW)') +
      stat(String(Object.keys(cats).length), 'categories on the board');
    $('metaLine').textContent =
      'Snapshot ' + board.as_of + '  ·  floor $' + board.floor_usd.toLocaleString('en-US') +
      '  ·  source: ' + board.source;
    $('rowCount').textContent = rows.length;
    function stat(b, s) {
      return '<div class="stat"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>';
    }
  }

  function renderWeek() {
    var top = board.rows.filter(function (r) { return r.verdict === 'FARM NOW'; }).slice(0, 5);
    $('weekCards').innerHTML = top.map(function (r) {
      return '<div class="week-card" data-slug="' + esc(r.slug) + '">' +
        '<div class="wk-rank">RANK #' + r.rank + ' &middot; ' + esc(r.verdict) + '</div>' +
        '<h3>' + esc(r.name) + '</h3><div class="wk-cat">' + esc(r.category) + ' &middot; ' + esc(r.chains[0] || '') + '</div>' +
        '<div class="wk-val">' + moneyFull(r.implied_value_usd) + '</div>' +
        '<div class="wk-prob">launch probability ' + pct(r.launch_prob) + ' &middot; ~' + r.weekly_minutes + ' min/week</div>' +
        '<div class="wk-step">' + esc(r.farm_steps[1]) + '</div></div>';
    }).join('');
  }

  function renderCategories() {
    var cats = {};
    board.rows.forEach(function (r) { cats[r.category] = 1; });
    var sel = $('cat');
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }

  function filteredRows() {
    var q = ($('q').value || '').toLowerCase();
    var cat = $('cat').value;
    var show = $('show').value;
    var rows = board.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (show === 'watchlist' && board.watchlist.indexOf(r.slug) < 0) return false;
      if (show === 'farm' && r.verdict !== 'FARM NOW' && r.verdict !== 'FARM') return false;
      if (show === 'pass' && r.verdict !== 'PASS') return false;
      return true;
    });
    var sort = $('sort').value;
    var key = { implied: 'implied_value_usd', prob: 'launch_prob', tvl: 'tvl_usd', growth: 'change_7d', age: 'age_days' }[sort];
    rows.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === null) av = -1e18; if (bv === null) bv = -1e18;
      if (sort === 'age') return av - bv; // newest first: smallest age first
      return bv - av;
    });
    return rows;
  }

  function renderTable() {
    var rows = filteredRows();
    $('rows').innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (r.slug === selectedSlug ? ' class="selected"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong><span class="slug">' + esc(r.slug) + '</span>' +
        '<span class="cat">' + esc(r.category) + ' &middot; ' + esc(r.chains.join(', ')) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + chg(r.change_7d) + '</td>' +
        '<td class="num">' + r.peer_multiple.toFixed(3) + '&times;</td>' +
        '<td class="num">' + pct(r.launch_prob) + '</td>' +
        '<td class="num">' + moneyFull(r.implied_value_usd) + '</td>' +
        '<td><span class="verdict ' + verdictClass(r.verdict) + '">' + esc(r.verdict) + '</span></td></tr>';
    }).join('');
    $('countLine').textContent = 'Showing ' + rows.length + ' of ' + board.rows.length +
      ' protocols · sorted by ' + $('sort').selectedOptions[0].textContent.toLowerCase();
  }

  function showDetail(slug) {
    var r = null;
    for (var i = 0; i < board.rows.length; i++) if (board.rows[i].slug === slug) { r = board.rows[i]; break; }
    if (!r) return;
    selectedSlug = slug;
    $('detail').hidden = false;
    $('detailTitle').textContent = '#' + r.rank + ' — ' + r.name;
    $('detailSub').textContent = r.category + ' · TVL ' + moneyFull(r.tvl_usd) +
      ' · tracked ' + r.age_days + ' days · ' + r.chains.join(', ');
    var probPct = Math.round(r.launch_prob * 100);
    $('detailModel').innerHTML =
      '<h3 style="margin-bottom:12px">Why it is worth ' + moneyFull(r.implied_value_usd) + '</h3>' +
      factor('TVL', moneyFull(r.tvl_usd), 'The size of the protocol today.', Math.min(100, (r.tvl_usd / 3e9) * 100)) +
      factor('Peer multiple', r.peer_multiple.toFixed(3) + '× (' + r.peer_count + ' peers)', r.peer_count >= 3 ? 'Median mcap/TVL of launched protocols in ' + r.category + '.' : 'Fewer than 3 launched peers in ' + r.category + ', so the global median is used.', Math.min(100, (r.peer_multiple / 2) * 100)) +
      factor('Momentum', '×' + r.momentum.toFixed(2), '7-day TVL change ' + chg(r.change_7d) + '.', Math.min(100, Math.max(0, ((r.momentum - 0.7) / 0.6) * 100))) +
      factor('Breadth', '×' + r.breadth.toFixed(2), r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ' counted.', Math.min(100, ((r.breadth - 1) / 0.2) * 100)) +
      factor('Launch probability', pct(r.launch_prob), 'Maturity ' + pct(r.maturity) + ' × staleness ' + r.staleness.toFixed(2) + ' × category prior ' + r.category_prior + '.', probPct) +
      '<p style="font-size:13px;color:var(--muted)">Implied value = TVL × peer multiple × momentum × breadth × launch probability. ' +
      'Verdict: <strong style="color:var(--ink)">' + esc(r.verdict) + '</strong>. ' +
      (r.verdict === 'PASS' ? 'This one records no token, but its category is already a product of a token that trades — farm it for yield, not for a launch.' : 'Farm it before the market prices the launch in.') + '</p>';
    $('detailSteps').innerHTML = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('detailCost').textContent = 'Budget: about $50–$100 to start · ~' + r.weekly_minutes +
      ' min/week · 4–8 weeks of steady activity';
    function factor(label, value, note, width) {
      return '<div class="factor"><div class="f-top"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>' +
        '<div class="bar"><i style="width:' + Math.round(width) + '%"></i></div>' +
        '<div class="f-note">' + esc(note) + '</div></div>';
    }
    renderTable();
  }

  function renderMethod() {
    var m = board.model;
    var medians = Object.keys(m.category_medians).sort().map(function (c) {
      return c + ' ' + m.category_medians[c].toFixed(3) + '×';
    }).join(' · ');
    $('methodGrid').innerHTML =
      card('Peer multiple', '<div class="big">' + m.global_median_mcap_tvl.toFixed(3) + '×</div>',
        'Global median mcap/TVL across launched protocols. Category medians: ' + medians + '.') +
      card('Launch probability', '<div class="big">maturity × staleness × prior</div>',
        'Maturity grows with age and saturates at ~6 months; staleness fades the odds after 900 days with no token; the category prior is 0.01 for exchanges, bridges and liquid-staking products.') +
      card('Momentum & breadth', '<div class="big">7-day growth · chain count</div>',
        'A protocol growing this week is worth more than one shrinking; a launch on more chains reaches more farmers. Both are small, honest adjustments — never the driver.');
    $('fineprint').textContent = m.verdicts + ' ' + m.note;
    function card(h, big, p) {
      return '<div class="method-card"><h3>' + esc(h) + '</h3>' + big + '<p>' + esc(p) + '</p></div>';
    }
  }

  function bind() {
    ['q', 'cat', 'show', 'sort'].forEach(function (id) {
      $(id).addEventListener('input', renderTable);
      $(id).addEventListener('change', renderTable);
    });
    $('rows').addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (tr) showDetail(tr.getAttribute('data-slug'));
    });
    $('weekCards').addEventListener('click', function (e) {
      var card = e.target.closest('.week-card');
      if (card) {
        showDetail(card.getAttribute('data-slug'));
        $('detail').scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  fetch('../board.json')
    .then(function (res) { if (!res.ok) throw new Error('board.json: ' + res.status); return res.json(); })
    .then(function (data) {
      board = data;
      renderStats();
      renderWeek();
      renderCategories();
      renderTable();
      renderMethod();
      bind();
      showDetail(board.rows[0].slug);
    })
    .catch(function (err) {
      document.body.insertAdjacentHTML('beforeend',
        '<p class="error">Could not load the board data (' + esc(err.message) +
        '). Serve the output folder over HTTP so the page can read board.json.</p>');
    });
})();
