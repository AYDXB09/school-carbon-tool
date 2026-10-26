/* =============================================================================
   School Carbon — Report Renderer
   The number, then the fully sourced, shown work. Sources are a prominent
   section of their own, not buried. No emoji, no em dashes.
   ============================================================================= */
(function (root) {
  "use strict";
  var F = root.SCHOOLCARBON.factors;

  var IC = {
    check: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    caret: '<svg viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    link: '<svg viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5l3-3M7 4l.7-.7a2.5 2.5 0 013.5 3.5l-.7.7M9 12l-.7.7a2.5 2.5 0 01-3.5-3.5l.7-.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    doc: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 2h5l3 3v9H4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 2v3h3M6 8h4M6 10.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    download: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0L5 7m3 3l3-3M3 13h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 16 16" fill="none"><path d="M11 3l2 2-7 7-2.5.5.5-2.5 7-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function fmt(n, dp) { dp = dp == null ? 1 : dp; return Number(n).toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  var SCOPE_C = { 1: "var(--s1)", 2: "var(--s2)", 3: "var(--s3)" };
  var SCOPE_BLURB = {
    1: "Emissions your school makes directly, such as burning heating fuel or running its own vehicles.",
    2: "Emissions from the electricity your school buys from the grid.",
    3: "Everything indirect: commuting, food, water, waste, flights and purchased goods."
  };
  var TIPS = {
    electricity: "Moving to a renewable electricity contract or adding on site solar is usually the single biggest lever here.",
    heating: "Insulation, better heating controls and, where feasible, heat pumps cut this the most.",
    vehicles: "Route planning and switching to electric or hybrid vehicles reduces fleet emissions over time.",
    commute: "Encouraging buses, car sharing, walking and cycling, and staggered start times all help.",
    flights: "Replacing some trips with rail or local alternatives, and fewer long haul trips, has the biggest effect.",
    food: "Shifting menus toward more plant based meals and cutting food waste is highly effective.",
    water: "Fixing leaks, fitting low flow taps and harvesting rainwater lowers water related emissions.",
    waste: "Raising your recycling rate and cutting single use items directly lowers this number.",
    procurement: "Choosing lower carbon suppliers and buying fewer, longer lasting items reduces this."
  };

  function badge(tier) {
    var measured = tier === "measured";
    return '<span class="badge ' + (measured ? "b-measured" : "b-estimated") + '">' + (measured ? "From your data" : "Estimated") + '</span>';
  }
  function srcLink(s) { return s ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.short || s.name) + '</a>' : ""; }

  /* Donut with a small surface gap between segments (dataviz mark spec). */
  function donut(scopes, total) {
    if (total <= 0) return "";
    var r = 66, cx = 90, cy = 90, sw = 22, circ = 2 * Math.PI * r, gap = 6, off = 0, parts = "";
    [1, 2, 3].forEach(function (s) {
      var v = scopes[s]; if (v <= 0) return;
      var len = (v / total) * circ;
      var seg = Math.max(0, len - gap);
      parts += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + SCOPE_C[s] +
        '" stroke-width="' + sw + '" stroke-dasharray="' + seg + ' ' + (circ - seg) + '" stroke-dashoffset="' + (-off) +
        '" transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-linecap="round"/>';
      off += len;
    });
    return '<svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Share of footprint by scope">' + parts +
      '<text x="90" y="86" text-anchor="middle" class="donut-num tnum">' + fmt(total, 0) + '</text>' +
      '<text x="90" y="104" text-anchor="middle" class="donut-cap">TONNES CO2e</text></svg>';
  }

  function benchmark(result) {
    var people = (result.input.students || 0) + (result.input.staff || 0);
    if (people <= 0) return null;
    var perPerson = result.total / people;
    var cls, headline, note;
    if (perPerson < 1.5) { cls = "good"; headline = "Lower than a typical school, per person."; note = "below what is typical for a school of this size"; }
    else if (perPerson <= 3.2) { cls = "mid"; headline = "About typical for a school of this size, per person."; note = "around what is typical for a school of this size"; }
    else { cls = "high"; headline = "Higher than a typical school, per person."; note = "above what is typical for a school of this size"; }
    return { cls: cls, headline: headline, note: note, perPerson: perPerson };
  }

  function render(result, opts) {
    opts = opts || {};
    var wrap = el("div", "report");

    /* actions */
    var top = el("div", "report-top");
    top.innerHTML = '<button class="btn btn-ghost" data-action="edit">' + IC.edit + ' Edit answers</button>' +
      '<div class="rt-actions">' +
      '<button class="btn btn-secondary" data-action="save-year">Save this year</button>' +
      '<button class="btn btn-primary" data-action="download">' + IC.download + ' Download report</button></div>';
    wrap.appendChild(top);

    /* 1. HERO */
    var hero = el("section", "card hero");
    var scopes = result.scopes;
    var legend = [1, 2, 3].map(function (s) {
      var v = scopes[s], p = result.total > 0 ? (v / result.total) * 100 : 0;
      return '<div class="legend-row"><span class="sw" style="background:' + SCOPE_C[s] + '"></span>' +
        '<span>Scope ' + s + '</span><span><span class="lv tnum">' + fmt(v, 1) + ' t</span> <span class="lp">' + p.toFixed(0) + '%</span></span></div>';
    }).join("");
    hero.innerHTML =
      '<div class="hero-main">' +
        '<div class="eyebrow">Estimated annual footprint</div>' +
        '<div class="hero-number tnum">' + fmt(result.total, 0) + '<span class="hero-unit">tCO2e</span></div>' +
        '<div class="hero-range">Most likely between <strong>' + fmt(result.range.p10, 0) + '</strong> and <strong>' +
          fmt(result.range.p90, 0) + '</strong> tonnes, based on 4,000 simulations that account for the data you left to us.</div>' +
        '<div class="hero-meta">' +
          '<span>Grid region: ' + esc(result.grid.label) + '</span>' +
          '<span>Period: ' + esc(result.input.period_start || "not set") + ' to ' + esc(result.input.period_end || "not set") + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="hero-donut">' + donut(scopes, result.total) + '<div class="legend">' + legend + '</div></div>';
    wrap.appendChild(hero);

    /* 2. BENCHMARK */
    var b = benchmark(result);
    if (b) {
      var bc = el("section", "card");
      bc.innerHTML = '<div class="bench">' +
        '<div class="bench-badge ' + b.cls + '"><span class="tnum">' + fmt(b.perPerson, 1) + '</span></div>' +
        '<div class="bench-txt"><strong>' + b.headline + '</strong>' +
        '<span class="muted">That is about ' + fmt(b.perPerson, 1) + ' tonnes CO2e for each student and staff member, ' + b.note + '. ' +
        'Use it as a rough guide only, since schools vary widely.</span></div></div>';
      wrap.appendChild(bc);
    }

    /* 3. WHERE IT COMES FROM (scope blurbs) */
    var scopeCard = el("section", "card");
    scopeCard.innerHTML = '<h2>Where it comes from</h2>' +
      '<div class="sec-sub">Your footprint splits across three groups defined by the GHG Protocol, the global standard for carbon accounting.</div>' +
      [1, 2, 3].map(function (s) {
        var v = scopes[s], p = result.total > 0 ? (v / result.total) * 100 : 0;
        return '<div class="legend-row" style="padding:10px 0;border-top:1px solid var(--line)">' +
          '<span class="sw" style="background:' + SCOPE_C[s] + '"></span>' +
          '<span><strong>Scope ' + s + '</strong> <span class="faint">' + SCOPE_BLURB[s] + '</span></span>' +
          '<span><span class="lv tnum">' + fmt(v, 1) + ' t</span> <span class="lp">' + p.toFixed(0) + '%</span></span></div>';
      }).join("");
    wrap.appendChild(scopeCard);

    /* 4. STEP BY STEP DERIVATION */
    var deriv = el("section", "card");
    deriv.innerHTML = '<h2>How we reached the number</h2>' +
      '<div class="sec-sub">Every line is either taken from data you gave us or estimated from a published source. Select any row to see the exact factor, the formula, and a link to check it.</div>';
    var cats = el("div", "cats");
    var maxV = result.categories.length ? result.categories[0].tCO2e : 1;
    result.categories.forEach(function (c) {
      var p = result.total > 0 ? (c.tCO2e / result.total) * 100 : 0;
      var w = maxV > 0 ? (c.tCO2e / maxV) * 100 : 0;
      var d = el("div", "cat");
      d.innerHTML =
        '<div class="cat-line" data-cat-toggle>' +
          '<div class="cat-l"><span class="cat-caret">' + IC.caret + '</span><span class="cat-name">' + esc(c.label) + '</span>' + badge(c.tier) + '</div>' +
          '<div class="cat-r"><span class="cat-val tnum">' + fmt(c.tCO2e, 1) + ' t</span><span class="cat-pct tnum">' + p.toFixed(0) + '%</span></div>' +
          '<div class="cat-track"><span class="cat-fill" style="width:' + w.toFixed(1) + '%;background:' + SCOPE_C[c.scope] + '"></span></div>' +
        '</div>' +
        '<div class="cat-detail">' +
          '<p class="method">' + esc(c.method) + '</p>' +
          '<div class="calc"><span class="cl">Calculation</span><code>' + esc(c.formula) + '</code></div>' +
          '<dl class="kv">' +
            '<dt>Emission factor</dt><dd>' + esc(c.factor) + '</dd>' +
            '<dt>Source</dt><dd>' + srcLink(c.source) + '</dd>' +
            '<dt>Confidence</dt><dd>' + (c.tier === "measured" ? "Based on data you provided" : "Estimated from published averages for schools like yours") + '</dd>' +
          '</dl>' +
          (TIPS[c.key] ? '<div class="tip"><span class="tip-lab">How to reduce it: </span>' + TIPS[c.key] + '</div>' : "") +
        '</div>';
      cats.appendChild(d);
    });
    deriv.appendChild(cats);
    wrap.appendChild(deriv);

    /* 5. CONFIDENCE */
    var mp = Math.round(result.measuredPct);
    var conf = el("section", "card");
    conf.innerHTML = '<h2>How solid is this estimate?</h2>' +
      '<div class="conf-legend"><span><span class="sw" style="background:var(--good)"></span>From your data</span>' +
      '<span><span class="sw" style="background:var(--line-2)"></span>Estimated</span></div>' +
      '<div class="conf-track"><span class="conf-measured" style="width:' + mp + '%"></span><span class="conf-estimated" style="width:' + (100 - mp) + '%"></span></div>' +
      '<p><strong>' + mp + '%</strong> of this footprint comes from data you entered. The remaining <strong>' + (100 - mp) +
      '%</strong> is estimated using published averages for schools like yours.</p>' +
      '<p class="muted">This is a <strong>decision grade estimate</strong>: accurate enough to plan and act on, and to set a consistent baseline you can track year on year. ' +
      'Adding real data next time, especially utility bills, tightens the range. It is not a third party verified or certified footprint.</p>';
    wrap.appendChild(conf);

    /* 6. TREND (only with history) */
    if (opts.history && opts.history.length > 0) wrap.appendChild(renderTrend(result, opts.history));

    /* 7. SOURCES (prominent, its own section) */
    wrap.appendChild(renderSources(result));

    /* 8. NEXT STEPS */
    var next = el("section", "card");
    var t0 = result.categories[0];
    next.innerHTML = '<h2>What to do with this</h2><ol class="steps-list">' +
      (t0 ? '<li><span><strong>Start with ' + esc(t0.label.toLowerCase()) + '.</strong> It is your largest source at ' + fmt(t0.tCO2e, 0) + ' tonnes. ' + (TIPS[t0.key] || "") + '</span></li>' : "") +
      '<li><span><strong>Tighten the number next year</strong> by adding real utility bills and anything shown as estimated above.</span></li>' +
      '<li><span><strong>Re run this each year.</strong> The method stays consistent, so the direction of travel is reliable even where data is estimated.</span></li>' +
      '<li><span><strong>Ready to offset for real?</strong> Take this report to a qualified consultant or verifier. It gives them a strong, sourced starting point.</span></li>' +
      '</ol>';
    wrap.appendChild(next);

    /* 9. DISCLAIMER */
    var disc = el("section", "card disclaimer");
    disc.innerHTML = '<h3>About this estimate</h3>' +
      '<p>This is a decision grade screening estimate produced from the data you entered and the published emission factors listed above. ' +
      'It is designed to help a school understand and act on its footprint and to set a consistent year on year baseline. ' +
      '<strong>It is not a third party verified or certified carbon footprint, and it is not itself a carbon offset.</strong> ' +
      'It does not satisfy any mandatory government or accreditation reporting requirement. For verified offsetting, engage a qualified verifier.</p>' +
      '<p class="faint">Factor set ' + esc(result.factorSetVersion) + '. Calculation seed ' + esc(String(result.seed)) +
      '. Generated ' + esc(result.generatedAt.slice(0, 10)) + '.</p>';
    wrap.appendChild(disc);

    return wrap;
  }

  function renderSources(result) {
    var used = {};
    result.categories.forEach(function (c) { if (c.source) used[c.source.url] = c.source; });
    if (result.grid && result.grid.source) used[result.grid.source.url] = result.grid.source;
    var items = Object.keys(used).map(function (u) {
      var s = used[u];
      return '<div class="src-item"><span class="src-ic">' + IC.doc + '</span>' +
        '<div class="src-body"><div class="src-name"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a></div>' +
        '<div class="src-what">' + esc(s.note || "") + '</div></div></div>';
    }).join("");
    var sec = el("section", "card sources");
    sec.innerHTML = '<h2>Sources and methodology</h2>' +
      '<div class="sec-sub">Every factor used in this report comes from one of the datasets below. Each link opens the primary source so you can check any figure yourself.</div>' +
      items +
      '<div class="src-foot">Method: activity data multiplied by an emission factor, summed by GHG Protocol scope, following ISO 14064-1 principles. ' +
      'Missing data is estimated from the benchmarks noted per line and given an uncertainty range using a Monte Carlo simulation. ' +
      'Factor set ' + esc(result.factorSetVersion) + ', locked to this report so year on year comparisons stay consistent.</div>';
    return sec;
  }

  function renderTrend(result, history) {
    var sec = el("section", "card");
    var series = history.concat([{ label: result.input.period_end || "This year", total: result.total }]);
    var max = Math.max.apply(null, series.map(function (s) { return s.total; }));
    var bars = series.map(function (s, i) {
      var h = max > 0 ? (s.total / max) * 100 : 0;
      var now = i === series.length - 1;
      return '<div class="tb' + (now ? " now" : "") + '"><div class="tb-val tnum">' + fmt(s.total, 0) + '</div>' +
        '<div class="tb-col" style="height:' + h + '%"></div><div class="tb-lab">' + esc(s.label) + '</div></div>';
    }).join("");
    var prev = series[series.length - 2], cur = series[series.length - 1];
    var delta = prev ? cur.total - prev.total : 0;
    var dpct = prev && prev.total > 0 ? (delta / prev.total) * 100 : 0;
    var dir = delta < 0 ? "down" : "up";
    sec.innerHTML = '<h2>Your trend over time</h2>' +
      '<div class="trend-chart">' + bars + '</div>' +
      (prev ? '<p class="trend-delta ' + dir + '">' + (delta < 0 ? IC.down : IC.up) + (delta < 0 ? "Down " : "Up ") + fmt(Math.abs(delta), 0) +
        ' tonnes (' + Math.abs(dpct).toFixed(0) + '%) since last period.</p>' : "") +
      '<p class="muted">Read trends with care. If a category moved from estimated to measured between years, part of a change can reflect better data rather than a real change in emissions. Keep your method consistent for the cleanest signal.</p>';
    return sec;
  }

  root.SCHOOLCARBON.report = { render: render, IC: IC };
})(typeof window !== "undefined" ? window : this);
