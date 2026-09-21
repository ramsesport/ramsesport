(function () {
  'use strict';

  var state = { portfolio: null, prices: {}, pricesUpdated: null };

  var ACCOUNT_TABS = {
    cdp_income: 'cdp1',
    dbsv_income: 'gbp',
    srs_income: 'cdp2',
    cpfis_income: 'srs',
    fsm_income: 'fsm',
    growth: 'growth'
  };

  var TAB_LABELS = {
    cdp1: 'CDP',
    gbp: 'DBSV',
    cdp2: 'SRS',
    srs: 'CPFIS',
    fsm: 'FSM',
    growth: 'Growth'
  };

  var SHORT_ACCOUNT = {
    cdp_income: 'CDP',
    dbsv_income: 'DBSV',
    srs_income: 'SRS',
    cpfis_income: 'CPFIS',
    fsm_income: 'FSM',
    growth: 'Growth'
  };

  var NAMES = {
    '9A4U':'ESR-REIT','C2PU':'Parkway Life REIT','C38U':'CapitaLand Integrated Commercial Trust',
    'C52':'ComfortDelGro','CJLU':'NetLink NBN Trust','D05':'DBS Group','DCRU':'Digital Core REIT',
    'J69U':'Frasers Centrepoint Trust','ME8U':'Mapletree Industrial Trust','MXNU':'Elite Commercial REIT',
    'NTDU':'NTT DC REIT','O39':'OCBC','OV8':'Sheng Siong','OXMU':'Prime US REIT','P8Z':'Bumitama Agri',
    'ADX':'Adams Diversified Equity Fund','IE000YTNTUN2':'PIMCO GIS Balanced Income and Growth',
    'JEPG':'JPM Global Equity Premium Income Active UCITS ETF','JEPQ':'JPM Nasdaq Equity Premium Income ETF',
    'PHP':'Primary Health Properties','WINC':'iShares World Equity High Income UCITS ETF',
    'CNDX':'iShares NASDAQ 100 UCITS ETF','GOOG':'Alphabet','MSFT':'Microsoft','NVDA':'NVIDIA',
    'SMH':'VanEck Semiconductor UCITS ETF','VWRP':'Vanguard FTSE All-World UCITS ETF',
    '0P0000Z1XG':'Nikko AM Japan Dividend Equity Fund','AJBU':'Keppel DC REIT','BUOU':'Frasers Logistics & Commercial Trust',
    'CFA':'NikkoAM-StraitsTrading Asia ex Japan REIT ETF','P40U':'Starhill Global REIT','P9D':'Civmec',
    'A7RU':'Keppel Infrastructure Trust','AGS':'The Hour Glass','DHLU':'Daiwa House Logistics Trust',
    'HMN':'CapitaLand Ascott Trust','QL3':'iShares Southeast Asia Trust','Y92':'Thai Beverage','Z74':'Singtel',
    'HFEL':'Henderson Far East Income','HSBA':'HSBC Holdings','ICG':'Intermediate Capital Group',
    'LGEN':'Legal & General','MNG':'M&G','TFIF':'TwentyFour Income Fund'
  };

  var LSE = new Set(['HFEL','HSBA','ICG','LGEN','MNG','TFIF','PHP','JEPG','JEPQ','WINC','VWRP','SMH','CNDX']);
  var US = new Set(['ADX','GOOG','MSFT','NVDA']);
  var USD_QUOTED = new Set(['DCRU','NTDU','OXMU','JEPG','JEPQ','SMH','CNDX','ADX','GOOG','MSFT','NVDA','IE000YTNTUN2']);
  var GBP_POUNDS = new Set(['WINC','VWRP']);

  var WATCHLIST = ['D05','O39','AJBU','J69U','C2PU','CJLU','ME8U','C38U','NVDA','MSFT','JEPQ','WINC','HSBA','LGEN'];

  function marketSymbol(symbol) {
    if (US.has(symbol) || symbol.indexOf('0P') === 0 || symbol.indexOf('IE') === 0) return symbol;
    if (LSE.has(symbol)) return symbol + '.L';
    return symbol + '.SI';
  }

  function quoteCurrency(symbol) {
    if (USD_QUOTED.has(symbol)) return 'USD';
    if (GBP_POUNDS.has(symbol)) return 'GBP';
    if (LSE.has(symbol)) return 'GBX';
    return 'SGD';
  }

  function money(value, currency) {
    var prefix = currency === 'GBP' ? '£' : currency === 'USD' ? 'US$' : 'S$';
    return prefix + Number(value).toLocaleString(currency === 'GBP' ? 'en-GB' : 'en-SG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function qty(value) {
    return Number(value).toLocaleString('en-SG', { maximumFractionDigits: 2 });
  }

  function priceText(symbol, rawPrice) {
    if (rawPrice == null) return 'n/a';
    var currency = quoteCurrency(symbol);
    if (currency === 'GBX') return '£' + (Number(rawPrice) / 100).toFixed(3);
    if (currency === 'GBP') return '£' + Number(rawPrice).toFixed(3);
    if (currency === 'USD') return 'US$' + Number(rawPrice).toFixed(2);
    return 'S$' + Number(rawPrice).toFixed(rawPrice < 1 ? 3 : 2);
  }

  function pctText(value) {
    if (value == null) return '—';
    return (value >= 0 ? '+' : '') + Number(value).toFixed(2) + '%';
  }

  function pctColor(value) {
    if (value == null) return 'var(--text-dim)';
    return value >= 0 ? 'var(--green)' : 'var(--red)';
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function maskLegacyPortfolio() {
    setText('hero-portfolio-val', '—');
    var sub = document.querySelector('.hero-sub');
    if (sub) sub.textContent = 'Loading verified portfolio snapshot…';

    Object.keys(ACCOUNT_TABS).forEach(function (id) {
      var tab = document.getElementById('tab-' + ACCOUNT_TABS[id]);
      if (tab) tab.innerHTML = '<div class="section"><div class="card"><div style="font-family:DM Mono,monospace;font-size:11px;color:var(--text-dim)">Loading verified account data…</div></div></div>';
    });

    var grid = document.querySelector('.hero-grid');
    if (grid) grid.innerHTML = '<div class="hero-pill"><span class="val">—</span><span class="lbl">Positions</span></div><div class="hero-pill"><span class="val">—</span><span class="lbl">Accounts</span></div><div class="hero-pill"><span class="val">—</span><span class="lbl">Prices updated</span></div>';

    var income = document.getElementById('tab-income');
    if (income) income.innerHTML = '<div class="section"><div class="card"><div style="font-family:DM Mono,monospace;font-size:11px;color:var(--text-dim)">Loading verified portfolio data…</div></div></div>';

    ['trends','buylines'].forEach(function (id) {
      var tab = document.getElementById('tab-' + id);
      if (tab) tab.innerHTML = '<div class="section"><div class="card"><div style="font-family:DM Mono,monospace;font-size:11px;color:var(--text-dim)">Loading verified dashboard data…</div></div></div>';
    });

    var share = document.querySelector('.share-section');
    if (share) share.innerHTML = '<div class="share-card"><div class="share-title">Verified Portfolio Snapshot</div><div style="font-family:DM Mono,monospace;font-size:11px;color:var(--text-dim)">Loading…</div></div>';
  }

  function updateTabLabels() {
    var tabs = document.querySelectorAll('#tabs .tab');
    tabs.forEach(function (el) {
      var oc = el.getAttribute('onclick') || '';
      Object.keys(TAB_LABELS).forEach(function (id) {
        if (oc.indexOf("'" + id + "'") >= 0) el.textContent = TAB_LABELS[id];
      });
    });
  }

  function accountsForSymbol(symbol) {
    if (!state.portfolio) return [];
    return state.portfolio.positions.filter(function (p) { return p.symbol === symbol; })
      .map(function (p) { return SHORT_ACCOUNT[p.account] || p.account; });
  }

  function uniqueSymbols() {
    var seen = {};
    var out = [];
    state.portfolio.positions.forEach(function (p) {
      if (!seen[p.symbol]) {
        seen[p.symbol] = true;
        out.push(p.symbol);
      }
    });
    return out;
  }

  function renderHero() {
    var p = state.portfolio;
    var sgd = p.accounts.filter(function (a) { return a.currency === 'SGD'; });
    var value = sgd.reduce(function (x, a) { return x + a.current_value; }, 0);
    var cost = sgd.reduce(function (x, a) { return x + a.cost_basis; }, 0);
    var dbsv = p.accounts.find(function (a) { return a.id === 'dbsv_income'; });

    var label = document.querySelector('.hero-label');
    if (label) label.textContent = 'Investment Portfolio — Verified SGD Sleeves';
    setText('hero-portfolio-val', Math.round(value).toLocaleString('en-SG'));

    var sub = document.querySelector('.hero-sub');
    if (sub) sub.textContent = 'Snapshot ' + p.as_of + ' · Cost SGD ' + Math.round(cost).toLocaleString('en-SG') + ' · DBSV ' + money(dbsv.current_value, 'GBP') + ' shown separately';

    var grid = document.querySelector('.hero-grid');
    if (grid) {
      var updated = state.pricesUpdated ? new Date(state.pricesUpdated).toLocaleTimeString('en-SG', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Singapore'}) : '—';
      grid.innerHTML =
        '<div class="hero-pill"><span class="val">' + p.positions.length + '</span><span class="lbl">Positions</span></div>' +
        '<div class="hero-pill"><span class="val">' + p.accounts.length + '</span><span class="lbl">Accounts</span></div>' +
        '<div class="hero-pill"><span class="val">' + updated + '</span><span class="lbl">Prices updated</span></div>';
    }
  }

  function renderIncome() {
    var p = state.portfolio;
    var sgd = p.accounts.filter(function (a) { return a.currency === 'SGD'; });
    var sgdValue = sgd.reduce(function (x, a) { return x + a.current_value; }, 0);
    var sgdCost = sgd.reduce(function (x, a) { return x + a.cost_basis; }, 0);
    var sgdGain = sgdValue - sgdCost;
    var dbsv = p.accounts.find(function (a) { return a.id === 'dbsv_income'; });
    var income = document.getElementById('tab-income');
    if (!income) return;

    var accountRows = p.accounts.map(function (a) {
      var count = p.positions.filter(function (x) { return x.account === a.id; }).length;
      return '<div class="income-source-row"><div><div class="source-name">' + a.name + '</div><div class="source-type">' + count + ' positions · verified snapshot</div></div><div class="source-income">' + money(a.current_value, a.currency) + '</div></div>';
    }).join('');

    var liveRows = uniqueSymbols().map(function (symbol) {
      var ms = marketSymbol(symbol);
      var d = state.prices[ms];
      var ptext = d && d.price != null ? priceText(symbol, d.price) : 'n/a';
      var change = d && d.pct != null ? pctText(d.pct) : '—';
      return '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 10px;background:var(--surface2);border-radius:8px;margin-bottom:4px">' +
        '<div><div style="font-family:DM Mono,monospace;font-size:12px;color:var(--text-bright)">' + symbol + ' <span style="font-family:DM Sans,sans-serif;font-size:10px;color:var(--text-dim)">' + (NAMES[symbol] || '') + '</span></div>' +
        '<div style="font-size:9px;color:var(--text-dim)">' + accountsForSymbol(symbol).join(' · ') + '</div></div>' +
        '<div style="text-align:right"><div style="font-family:DM Mono,monospace;font-size:12px;color:var(--text-bright)">' + ptext + '</div>' +
        '<div style="font-family:DM Mono,monospace;font-size:10px;color:' + pctColor(d ? d.pct : null) + '">' + change + '</div></div></div>';
    }).join('');

    income.innerHTML =
      '<div class="section"><div class="section-title">Verified Portfolio Snapshot</div><div class="card">' +
      '<div class="row-kv"><span class="k">Snapshot date</span><span class="v">' + p.as_of + '</span></div>' +
      '<div class="row-kv"><span class="k">SGD sleeves — current value</span><span class="v gold">' + money(sgdValue, 'SGD') + '</span></div>' +
      '<div class="row-kv"><span class="k">SGD sleeves — cost basis</span><span class="v">' + money(sgdCost, 'SGD') + '</span></div>' +
      '<div class="row-kv"><span class="k">SGD sleeves — capital gain</span><span class="v ' + (sgdGain >= 0 ? 'green' : 'red') + '">' + (sgdGain >= 0 ? '+' : '') + money(sgdGain, 'SGD') + '</span></div>' +
      '<div class="row-kv"><span class="k">DBSV Income — current value</span><span class="v gold">' + money(dbsv.current_value, 'GBP') + '</span></div>' +
      '<div class="row-kv"><span class="k">DBSV Income — cost basis</span><span class="v">' + money(dbsv.cost_basis, 'GBP') + '</span></div>' +
      '<div class="row-kv"><span class="k">Positions / accounts</span><span class="v">' + p.positions.length + ' / ' + p.accounts.length + '</span></div>' +
      '<div style="margin-top:7px;font-size:9px;color:var(--text-dim);line-height:1.6">Snapshot values are transcribed from the portfolio screenshots supplied on 21 Sep 2026. GBP is kept separate rather than converted using an assumed FX rate. No forward-income or IRR figure is inferred from these screenshots.</div>' +
      '</div></div>' +
      '<div class="section"><div class="section-title">Accounts</div>' + accountRows + '</div>' +
      '<div class="section"><div class="section-title">Live Prices — Verified Holdings</div><div>' + liveRows + '</div>' +
      '<div style="margin-top:8px;font-family:DM Mono,monospace;font-size:9px;color:var(--text-dim);text-align:right">prices.json · unavailable fund NAVs are shown as n/a</div></div>';
  }

  function renderAccounts() {
    var p = state.portfolio;
    p.accounts.forEach(function (account) {
      var tab = document.getElementById('tab-' + ACCOUNT_TABS[account.id]);
      if (!tab) return;
      var positions = p.positions.filter(function (x) { return x.account === account.id; });
      var rows = positions.map(function (pos) {
        var d = state.prices[marketSymbol(pos.symbol)];
        var pt = d && d.price != null ? priceText(pos.symbol, d.price) : 'n/a';
        var ch = d && d.pct != null ? pctText(d.pct) : '—';
        return '<div class="holding-row">' +
          '<div><div class="h-ticker">' + pos.symbol + '</div><div class="h-name">' + (NAMES[pos.symbol] || '') + '</div></div>' +
          '<div class="h-val">' + qty(pos.quantity) + '<span class="h-sub">shares / units</span></div>' +
          '<div class="h-yield">' + pt + '<span class="h-sub">native quote</span></div>' +
          '<div class="h-income" style="color:' + pctColor(d ? d.pct : null) + '">' + ch + '</div>' +
          '</div>';
      }).join('');

      var gain = account.current_value - account.cost_basis;
      var gainPct = account.cost_basis ? gain / account.cost_basis * 100 : 0;
      var situs = account.id === 'growth' ? usSitusHtml() : '';

      tab.innerHTML =
        '<div class="section"><div class="acct-header"><div><div class="acct-name">' + account.name + '</div><div class="acct-yield">Verified snapshot · ' + p.as_of + '</div></div>' +
        '<div class="acct-total">' + money(account.current_value, account.currency) + '</div></div>' +
        '<div class="holdings-header"><span>Holding</span><span>Qty</span><span>Last Price</span><span>Day</span></div>' +
        rows +
        '<div class="card" style="margin-top:8px">' +
        '<div class="row-kv"><span class="k">Snapshot cost basis</span><span class="v">' + money(account.cost_basis, account.currency) + '</span></div>' +
        '<div class="row-kv"><span class="k">Snapshot current value</span><span class="v">' + money(account.current_value, account.currency) + '</span></div>' +
        '<div class="row-kv"><span class="k">Snapshot capital gain</span><span class="v ' + (gain >= 0 ? 'green' : 'red') + '">' + (gain >= 0 ? '+' : '') + money(gain, account.currency) + ' (' + (gainPct >= 0 ? '+' : '') + gainPct.toFixed(2) + '%)</span></div>' +
        '<div class="row-kv"><span class="k">Dividends shown in snapshot</span><span class="v gold">' + money(account.dividends, account.currency) + '</span></div>' +
        '</div>' + situs + '</div>';
    });
  }

  function usSitusHtml() {
    var p = state.portfolio;
    var names = p.us_situs.positions;
    var complete = true;
    var total = 0;
    names.forEach(function (symbol) {
      var pos = p.positions.find(function (x) { return x.symbol === symbol; });
      var d = state.prices[marketSymbol(symbol)];
      if (!pos || !d || d.price == null) complete = false;
      else total += pos.quantity * d.price;
    });
    var ceiling = p.us_situs.monitoring_ceiling_usd;
    var valueText = complete ? 'USD ' + Math.round(total).toLocaleString('en-US') : 'price unavailable';
    var headroom = ceiling - total;
    var headText = complete ? (headroom >= 0 ? 'USD ' : 'OVER by USD ') + Math.abs(Math.round(headroom)).toLocaleString('en-US') : '—';
    var color = complete && headroom < 0 ? 'red' : 'green';
    return '<div class="card" style="background:rgba(248,113,113,.04);border-color:var(--red-dim)">' +
      '<div style="font-family:DM Mono,monospace;font-size:9px;color:var(--red);margin-bottom:5px">US ESTATE TAX MONITOR</div>' +
      '<div style="font-size:10px;color:var(--text-dim);line-height:1.6">Direct US-incorporated holdings monitored across the portfolio: ADX, GOOG, MSFT and NVDA. Quantities come from portfolio-data.json; market values use prices.json.</div>' +
      '<div style="margin-top:8px"><div class="row-kv"><span class="k">Current US situs (USD)</span><span class="v ' + color + '">' + valueText + '</span></div>' +
      '<div class="row-kv"><span class="k">Monitoring ceiling</span><span class="v">USD ' + ceiling.toLocaleString('en-US') + '</span></div>' +
      '<div class="row-kv"><span class="k">Headroom remaining</span><span class="v ' + color + '">' + headText + '</span></div></div>' +
      '<div style="margin-top:6px;font-size:9px;color:var(--text-dim)">Operational monitor only; tax treatment should be reconfirmed after instrument or domicile changes.</div></div>';
  }

  function renderShareCard() {
    var p = state.portfolio;
    var sgdValue = p.accounts.filter(function (a) { return a.currency === 'SGD'; }).reduce(function (x, a) { return x + a.current_value; }, 0);
    var dbsv = p.accounts.find(function (a) { return a.id === 'dbsv_income'; });
    var share = document.querySelector('.share-section');
    if (share) {
      share.innerHTML = '<div class="share-card"><div class="share-title">Verified Portfolio Snapshot</div><div class="share-metrics">' +
        '<div class="share-metric"><div class="val">S$' + Math.round(sgdValue).toLocaleString('en-SG') + '</div><div class="lbl">SGD Sleeves</div></div>' +
        '<div class="share-metric"><div class="val">£' + Math.round(dbsv.current_value).toLocaleString('en-GB') + '</div><div class="lbl">DBSV GBP</div></div>' +
        '<div class="share-metric"><div class="val">' + p.positions.length + '</div><div class="lbl">Positions</div></div>' +
        '<div class="share-metric"><div class="val">' + p.accounts.length + '</div><div class="lbl">Accounts</div></div></div>' +
        '<button class="share-btn" onclick="showSnapshot()">📤 View Snapshot Card</button></div>';
    }
    var overlay = document.getElementById('snapshot-overlay');
    if (overlay) {
      overlay.innerHTML = '<div id="snapshot-card" onclick="event.stopPropagation()"><div class="snap-logo">Ramsesport</div>' +
        '<div class="snap-date" id="snap-date">' + p.as_of + '</div><div class="snap-grid">' +
        '<div class="snap-box"><div class="sv">S$' + Math.round(sgdValue).toLocaleString('en-SG') + '</div><div class="sl">SGD Sleeves</div></div>' +
        '<div class="snap-box"><div class="sv">£' + Math.round(dbsv.current_value).toLocaleString('en-GB') + '</div><div class="sl">DBSV Income</div></div>' +
        '<div class="snap-box"><div class="sv">' + p.positions.length + '</div><div class="sl">Positions</div></div>' +
        '<div class="snap-box"><div class="sv">' + p.accounts.length + '</div><div class="sl">Accounts</div></div></div>' +
        '<div class="snap-footer">Verified from portfolio screenshots supplied 21 Sep 2026 · GBP kept separate from SGD</div>' +
        '<button class="snap-close" onclick="hideSnapshot()">Close</button></div>';
    }
  }

  function renderTrends() {
    var tab = document.getElementById('tab-trends');
    if (!tab) return;
    tab.innerHTML = '<div class="section"><div class="section-title">Verified Trends</div><div class="card">' +
      '<div style="font-family:DM Mono,monospace;font-size:11px;color:var(--gold);margin-bottom:6px">HISTORICAL SERIES PAUSED</div>' +
      '<div style="font-size:11px;color:var(--text-dim);line-height:1.7">The previous chart mixed estimated historical points with verified observations. It has been removed from display. Future snapshots can be appended to a verified history before a trend chart is restored.</div></div></div>';
    window._chartsBuilt = true;
  }

  function renderWatchlist() {
    var tab = document.getElementById('tab-buylines');
    if (!tab) return;
    var rows = WATCHLIST.map(function (symbol) {
      var d = state.prices[marketSymbol(symbol)];
      return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<div><div style="font-family:DM Mono,monospace;font-size:13px;color:var(--text-bright)">' + symbol + '</div><div style="font-size:10px;color:var(--text-dim)">' + (NAMES[symbol] || '') + '</div></div>' +
        '<div style="text-align:right"><div style="font-family:DM Mono,monospace;font-size:14px;color:var(--text-bright)">' + (d && d.price != null ? priceText(symbol, d.price) : 'n/a') + '</div>' +
        '<div style="font-family:DM Mono,monospace;font-size:10px;color:' + pctColor(d ? d.pct : null) + '">' + (d ? pctText(d.pct) : '—') + '</div></div></div>';
    }).join('');
    tab.innerHTML = '<div class="section"><div class="section-title">Deployment Watchlist</div><div class="card" style="background:rgba(201,168,76,.04);border-color:var(--gold-dim)">' +
      '<div style="font-family:DM Mono,monospace;font-size:9px;color:var(--gold);margin-bottom:4px">NO FIXED TARGETS RECORDED</div>' +
      '<div style="font-size:10px;color:var(--text-dim);line-height:1.6">This monitor shows current price and daily move for selected verified holdings. It does not generate moving −5%/−10%/−15% buy lines or a BUY/HOLD signal.</div></div>' + rows + '</div>';
    window._buyLinesBuilt = true;
  }

  function renderAll() {
    if (!state.portfolio) return;
    updateTabLabels();
    renderHero();
    renderIncome();
    renderAccounts();
    renderShareCard();
    renderTrends();
    renderWatchlist();
  }

  async function loadPortfolio() {
    var r = await fetch('/ramsesport/portfolio-data.json?t=' + Date.now(), { cache: 'no-cache' });
    if (!r.ok) throw new Error('portfolio-data.json unavailable');
    state.portfolio = await r.json();
  }

  async function loadPrices() {
    var r = await fetch('/ramsesport/prices.json?t=' + Date.now(), { cache: 'no-cache' });
    if (!r.ok) throw new Error('prices.json unavailable');
    var j = await r.json();
    state.prices = j.prices || {};
    state.pricesUpdated = j.updated || null;
  }

  window.showSnapshot = function () {
    var date = document.getElementById('snap-date');
    if (date && state.portfolio) date.textContent = state.portfolio.as_of;
    var overlay = document.getElementById('snapshot-overlay');
    if (overlay) overlay.classList.add('show');
  };

  window.hideSnapshot = function () {
    var overlay = document.getElementById('snapshot-overlay');
    if (overlay) overlay.classList.remove('show');
  };

  async function start() {
    maskLegacyPortfolio();
    try {
      await Promise.all([loadPortfolio(), loadPrices()]);
      renderAll();
    } catch (e) {
      console.error('Verified dashboard load failed:', e);
      var sub = document.querySelector('.hero-sub');
      if (sub) sub.textContent = 'Verified portfolio data could not be loaded.';
    }
  }

  async function refreshPrices() {
    try {
      await loadPrices();
      renderAll();
    } catch (e) {
      console.warn('Price refresh failed:', e);
    }
  }

  start();
  setInterval(refreshPrices, 5 * 60 * 1000);
})();