/* =============================================================================
   School Carbon — App Controller
   Multi step form, resumable state, required vs optional clarity, wiring to the
   engine, report and PDF download. History and drafts use localStorage for now
   (STORAGE_SEAM below) so it can be hosted as a static site with no backend.
   No em dashes in user facing copy.
   ============================================================================= */
(function (root) {
  "use strict";
  var F = root.SCHOOLCARBON.factors;
  var IC = root.SCHOOLCARBON.report.IC;
  var doc = document;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  /* ---------------------- STORAGE_SEAM (swap for a DB) ------------------- */
  var STORE_KEY = "sc_state_v2", HIST_KEY = "sc_history_v2";
  function saveDraft(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
  function loadDraft() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; } }
  function clearDraft() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }
  function loadHistory(k) { try { return (JSON.parse(localStorage.getItem(HIST_KEY) || "{}"))[k] || []; } catch (e) { return []; } }
  function pushHistory(k, e) { try { var a = JSON.parse(localStorage.getItem(HIST_KEY) || "{}"); a[k] = (a[k] || []).concat([e]); localStorage.setItem(HIST_KEY, JSON.stringify(a)); } catch (x) {} }

  var state = loadDraft() || { step: 0, data: {} };
  /* named steps for the progress path */
  var STEPS = [
    { key: "welcome" },
    { key: "school", label: "School" },
    { key: "size", label: "Size" },
    { key: "energy", label: "Energy" },
    { key: "extras", label: "Extras" },
    { key: "review", label: "Review" }
  ];
  function num(v) { if (v == null || v === "") return undefined; var n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : undefined; }

  /* ------------------------- small builders ----------------------------- */
  function tag(req) { return req ? '<span class="tag tag-req">Required</span>' : '<span class="tag tag-opt">Optional</span>'; }
  function field(label, req, inner, hint) {
    return '<label class="field"><span class="field-top"><span class="field-label">' + label + '</span>' + tag(req) + '</span>' +
      inner + (hint ? '<span class="field-hint">' + hint + '</span>' : "") + '</label>';
  }
  function inp(name, type, ph, val, attrs) { return '<input name="' + name + '" type="' + (type || "text") + '" placeholder="' + (ph || "") + '" value="' + (val == null ? "" : val) + '" ' + (attrs || "") + '>'; }
  function sel(name, options) { return '<select name="' + name + '">' + options + '</select>'; }
  function opt(v, label, cur) { return '<option value="' + v + '"' + (cur === v ? " selected" : "") + '>' + label + '</option>'; }
  function groupHead(title, req) { return '<div class="group-head"><span class="gh-title">' + title + '</span>' + tag(req) + '</div>'; }

  function countryOptions(cur) {
    var codes = Object.keys(F.GRID).sort(function (a, b) { return F.GRID[a].name.localeCompare(F.GRID[b].name); });
    var o = '<option value="">Select your country</option>';
    codes.forEach(function (c) { o += opt(c, F.GRID[c].name, cur); });
    return o + opt("__OTHER__", "Other or not listed (world average)", cur);
  }

  /* ------------------------------ steps --------------------------------- */
  function tWelcome() {
    var hasDraft = loadDraft() && loadDraft().data && Object.keys(loadDraft().data).length;
    return '<div class="card welcome">' +
      '<span class="eyebrow">Carbon footprint for schools</span>' +
      '<h1>See your school\'s carbon footprint in about 15 minutes.</h1>' +
      '<p class="lead">Answer a few questions with numbers you already have, such as a utility bill, your headcount and a rough building size. ' +
      'We fill in the rest using published data for schools like yours, and hand back one clear number you can act on.</p>' +
      '<ul class="checks">' +
        '<li><span class="check-ic">' + IC.check + '</span><span><strong>You can stop and come back.</strong> Answers are saved on this device as you go.</span></li>' +
        '<li><span class="check-ic">' + IC.check + '</span><span><strong>Missing data is fine.</strong> Anything you do not know is estimated and labelled clearly.</span></li>' +
        '<li><span class="check-ic">' + IC.check + '</span><span><strong>Every number is sourced.</strong> You can open the primary data behind each figure.</span></li>' +
      '</ul>' +
      '<p class="fineprint">You get a decision grade estimate to plan and track by, not a certified audit. Nothing you enter leaves this device.</p>' +
      '<div class="nav" style="justify-content:flex-start;gap:10px">' +
        '<button class="btn btn-primary btn-lg" data-action="next">Start</button>' +
        (hasDraft ? '<button class="btn btn-ghost" data-action="reset">Start over</button>' : "") +
      '</div></div>';
  }

  function tSchool(d) {
    return '<div class="card">' + head("Step 1 of 5", "Your school",
      "Two things here shape accuracy the most: your country, which sets the electricity grid and climate, and whether pupils board.") +
      field("School name", false, inp("school_name", "text", "For example, Green Valley School", d.school_name), "Used only to title your report.") +
      field("Country", true, sel("country", countryOptions(d.country)), "Sets your electricity grid factor and climate, the single biggest driver of your footprint.") +
      '<div class="field-row">' +
        field("City or region", false, inp("region", "text", "For example, the state or county", d.region)) +
        field("Setting", true, sel("locality", opt("urban", "Urban", d.locality) + opt("suburban", "Suburban", d.locality || "suburban") + opt("rural", "Rural", d.locality)), "Affects how we estimate commuting.") +
      '</div>' +
      field("School type", true, sel("school_type", opt("day", "Day school", d.school_type || "day") + opt("boarding", "Boarding", d.school_type) + opt("mixed", "Mixed, day and boarding", d.school_type)), "Boarding changes food, water, energy and commuting.") +
      '<div class="field-row">' +
        field("Reporting period start", false, inp("period_start", "date", "", d.period_start), "Use your own school year, any 12 months.") +
        field("Reporting period end", false, inp("period_end", "date", "", d.period_end)) +
      '</div>' + nav();
  }

  function tSize(d) {
    var board = d.school_type === "boarding" || d.school_type === "mixed";
    return '<div class="card">' + head("Step 2 of 5", "Size of your school",
      "Headcount scales almost every estimate, so these two are required. Building size is optional; leave it blank and we estimate it from your headcount.") +
      '<div class="field-row">' +
        field("Students enrolled", true, inp("students", "number", "For example, 600", d.students, "min=0")) +
        field("Staff, full time equivalent", true, inp("staff", "number", "For example, 90", d.staff, "min=0")) +
      '</div>' +
      (board ? field("Of those, how many board?", false, inp("boarders", "number", "For example, 250", d.boarders, "min=0"), "Boarders live on site, which changes almost every category.") : "") +
      '<div class="field-row">' +
        field("Building floor area", false, inp("floor_area", "number", "For example, 8000", d.floor_area, "min=0"), "A rough figure is fine. Blank is fine too.") +
        field("Area units", false, sel("floor_area_unit", opt("m2", "Square metres (m2)", d.floor_area_unit || "m2") + opt("ft2", "Square feet (ft2)", d.floor_area_unit))) +
      '</div>' +
      '<div id="map-slot"></div>' +
      field("School days in the year", false, inp("school_days", "number", "Defaults to 190 if blank", d.school_days, "min=1 max=365")) +
      nav();
  }

  function tEnergy(d) {
    var fuelOpts = ""; Object.keys(F.FUELS).forEach(function (k) { fuelOpts += opt(k, F.FUELS[k].name, d.heating_fuel || "natural_gas"); });
    return '<div class="card">' + head("Step 3 of 5", "Energy: electricity and heating",
      "The most useful section. One electricity figure and how you heat the buildings gets you most of the way. Do not have the numbers? Leave them blank and we estimate from your building size and climate.") +
      '<div class="group">' + groupHead("Electricity", false) +
        field("Electricity used in the year, in kWh", false, inp("electricity_kwh", "number", "For example, 320000", d.electricity_kwh, "min=0"), "Best option. Usually on an annual bill or your meter portal.") +
        '<div class="or">or, if you only know the cost</div>' +
        '<div class="field-row">' +
          field("Electricity spend for the year", false, inp("electricity_spend", "number", "For example, 60000", d.electricity_spend, "min=0")) +
          field("Price per kWh you pay", false, inp("electricity_price", "number", "For example, 0.18", d.electricity_price, "min=0 step=0.001")) +
        '</div>' +
      '</div>' +
      '<div class="group">' + groupHead("Heating and on site fuel", false) +
        field("How do you mainly heat or cool?", false, sel("heating_fuel", fuelOpts)) +
        '<div class="field-row">' +
          field("Amount used in the year", false, inp("heating_amount", "number", "For example, 40000", d.heating_amount, "min=0")) +
          field("That amount is in", false, sel("heating_amount_type", opt("unit", "the fuel\'s usual unit", d.heating_amount_type || "unit") + opt("kwh", "kWh", d.heating_amount_type)), "Blank? We estimate from building size and climate.") +
        '</div>' +
      '</div>' +
      '<div class="group optional">' + groupHead("School owned vehicles", false) +
        '<div class="field-row">' +
          field("Fuel used in the year, in litres", false, inp("vehicle_fuel_litres", "number", "For example, 5000", d.vehicle_fuel_litres, "min=0")) +
          field("Fuel type", false, sel("vehicle_fuel_type", opt("diesel", "Diesel", d.vehicle_fuel_type || "diesel") + opt("petrol", "Petrol", d.vehicle_fuel_type))) +
        '</div>' +
      '</div>' + nav();
  }

  function tExtras(d) {
    return '<div class="card">' + head("Step 4 of 5", "Everything else",
      "All optional. Fill in what you know. Every blank is estimated from data for similar schools and labelled clearly in your report.") +
      '<div class="group optional">' + groupHead("Commuting", false) +
        field("Average one way distance people travel to school, in km", false, inp("commute_avg_km", "number", "For example, 8", d.commute_avg_km, "min=0"), "Blank? We use a typical distance for your setting.") +
      '</div>' +
      '<div class="group optional">' + groupHead("Food and catering", false) +
        '<div class="field-row">' +
          field("Meals served per day", false, inp("meals_per_day", "number", "For example, 700", d.meals_per_day, "min=0")) +
          field("Typical menu", false, sel("diet", opt("meat_heavy", "Meat at most meals", d.diet) + opt("average", "Mixed or average", d.diet || "average") + opt("vegetarian", "Mostly vegetarian", d.diet) + opt("vegan", "Mostly plant based", d.diet))) +
        '</div>' +
      '</div>' +
      '<div class="group optional">' + groupHead("Water and waste", false) +
        '<div class="field-row">' +
          field("Water used in the year, in m3", false, inp("water_m3", "number", "For example, 6000", d.water_m3, "min=0")) +
          field("Waste in the year, in tonnes", false, inp("waste_tonnes", "number", "For example, 40", d.waste_tonnes, "min=0")) +
        '</div>' +
        field("Recycling rate, as a percent", false, inp("recycling_pct", "number", "For example, 35", d.recycling_pct, "min=0 max=100")) +
      '</div>' +
      '<div class="group optional">' + groupHead("Air travel, school trips and staff", false) +
        '<div class="field-row">' +
          field("Total passenger km flown in the year", false, inp("flight_pkm", "number", "For example, 200000", d.flight_pkm, "min=0"), "Roughly passengers times distance. Blank means not counted.") +
          field("Mostly", false, sel("flight_type", opt("short", "Short haul", d.flight_type || "short") + opt("long", "Long haul", d.flight_type))) +
        '</div>' +
      '</div>' +
      '<div class="group optional">' + groupHead("Purchased goods and services", false) +
        field("Non salary spend in the year, in USD", false, inp("procurement_usd", "number", "For example, 1200000", d.procurement_usd, "min=0"), "Books, IT, supplies, services. Blank? Estimated from headcount.") +
      '</div>' + nav();
  }

  function tReview(d) {
    var rows = "";
    function row(k, v) { if (v !== undefined && v !== "" && v !== null) rows += '<div class="rev-row"><span class="rk">' + k + '</span><span class="rv">' + v + '</span></div>'; }
    row("School", d.school_name || "Not given");
    row("Country", d.country && F.GRID[d.country] ? F.GRID[d.country].name : (d.country === "__OTHER__" ? "Other (world average)" : "Not set"));
    row("Type", ({ day: "Day school", boarding: "Boarding", mixed: "Mixed" })[d.school_type] || d.school_type);
    row("Students and staff", (d.students || "?") + " and " + (d.staff || "?"));
    row("Electricity", d.electricity_kwh ? d.electricity_kwh + " kWh" : (d.electricity_spend ? "from spend" : "will be estimated"));
    row("Heating fuel", d.heating_fuel && F.FUELS[d.heating_fuel] ? F.FUELS[d.heating_fuel].name : "Natural gas");
    return '<div class="card">' + head("Step 5 of 5", "Ready to calculate",
      "Here is what you gave us. Anything left blank is estimated and labelled in your report.") +
      '<div class="review">' + rows + '</div>' +
      '<div class="nav"><button class="btn btn-secondary" data-action="back">Back</button>' +
      '<button class="btn btn-primary btn-lg" data-action="calculate">Calculate my footprint</button></div></div>';
  }

  function head(kicker, title, intro) {
    return '<div class="step-head"><div class="kicker">' + kicker + '</div><h2>' + title + '</h2></div>' +
      (intro ? '<div class="step-intro">' + intro + '</div>' : "");
  }
  function nav() {
    return '<div class="nav"><button class="btn btn-secondary" data-action="back">Back</button>' +
      '<button class="btn btn-primary" data-action="next">Continue</button></div>';
  }

  var TPL = { welcome: tWelcome, school: tSchool, size: tSize, energy: tEnergy, extras: tExtras, review: tReview };

  /* --------------------------- render / flow ---------------------------- */
  function renderStepper() {
    var host = $("#stepper");
    if (state.step === 0) { host.className = "stepper"; host.innerHTML = ""; return; }
    host.className = "stepper on";
    host.innerHTML = STEPS.slice(1).map(function (s, i) {
      var idx = i + 1, cls = idx < state.step ? "done" : (idx === state.step ? "active" : "");
      var mark = idx < state.step ? IC.check : idx;
      return '<span class="step-chip ' + cls + '"><span class="idx">' + mark + '</span><span class="lab">' + s.label + '</span></span>';
    }).join("");
  }
  function render() {
    var name = STEPS[state.step].key;
    $("#stage").innerHTML = TPL[name](state.data);
    renderStepper();
    if (name === "size") mountMapButton();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function collect() {
    $$("#stage input, #stage select").forEach(function (i) {
      if (i.type === "checkbox") return;
      state.data[i.name] = i.type === "number" ? num(i.value) : i.value;
    });
    saveDraft(state);
  }

  function toEngineInput(d) {
    var country = d.country === "__OTHER__" ? "__WORLD__" : d.country;
    return {
      school_name: d.school_name, country: country, region: d.region, locality: d.locality || "suburban",
      period_start: d.period_start, period_end: d.period_end,
      students: num(d.students) || 0, staff: num(d.staff) || 0, boarders: num(d.boarders) || 0,
      floor_area: num(d.floor_area), floor_area_unit: d.floor_area_unit || "m2", school_days: num(d.school_days),
      electricity_kwh: num(d.electricity_kwh), electricity_spend: num(d.electricity_spend), electricity_price: num(d.electricity_price),
      heating_fuel: d.heating_fuel || "natural_gas", heating_amount: num(d.heating_amount), heating_amount_type: d.heating_amount_type || "unit",
      vehicle_fuel_litres: num(d.vehicle_fuel_litres), vehicle_fuel_type: d.vehicle_fuel_type || "diesel",
      commute_avg_km: num(d.commute_avg_km), meals_per_day: num(d.meals_per_day), diet: d.diet || "average",
      water_m3: num(d.water_m3), waste_tonnes: num(d.waste_tonnes),
      recycling_rate: d.recycling_pct != null && d.recycling_pct !== "" ? num(d.recycling_pct) / 100 : undefined,
      flight_pkm: num(d.flight_pkm), flight_type: d.flight_type || "short", procurement_usd: num(d.procurement_usd)
    };
  }
  function schoolKey(d) { return String(d.school_name || "school").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + (d.country || "xx"); }

  function validate() {
    var d = state.data, miss = null;
    if (state.step === 1 && !d.country) miss = "Please choose your country to continue.";
    if (state.step === 2 && (!num(d.students) || !num(d.staff))) miss = "Please enter students and staff to continue.";
    if (miss) { flash(miss); return false; }
    return true;
  }
  function flash(msg) {
    var n = $("#flash"); n.textContent = msg; n.style.display = "block";
    clearTimeout(n._t); n._t = setTimeout(function () { n.style.display = "none"; }, 3200);
  }

  function calculate() {
    collect();
    var result = root.SCHOOLCARBON.engine.calculate(toEngineInput(state.data));
    var key = schoolKey(state.data);
    $("#stepper").className = "stepper"; $("#stepper").innerHTML = "";
    $("#stage").innerHTML = "";
    $("#stage").appendChild(root.SCHOOLCARBON.report.render(result, { history: loadHistory(key) }));
    window._last = { result: result, key: key };
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------ events -------------------------------- */
  doc.addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-cat-toggle]");
    if (toggle) { toggle.parentElement.classList.toggle("open"); return; }
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var a = btn.getAttribute("data-action");
    if (a === "next") { if (state.step > 0) collect(); if (!validate()) return; state.step = Math.min(STEPS.length - 1, state.step + 1); saveDraft(state); render(); }
    else if (a === "back") { collect(); state.step = Math.max(0, state.step - 1); saveDraft(state); render(); }
    else if (a === "reset") { clearDraft(); state = { step: 0, data: {} }; render(); }
    else if (a === "calculate") { calculate(); }
    else if (a === "edit") { state.step = 1; render(); }
    else if (a === "download") { if (window._last) root.SCHOOLCARBON.download.generate(window._last.result); }
    else if (a === "save-year") {
      if (window._last) { var r = window._last.result; pushHistory(window._last.key, { label: r.input.period_end || String(new Date().getFullYear()), total: r.total, at: Date.now() }); btn.textContent = "Saved"; btn.disabled = true; }
    }
    else if (a === "map-open") { openMap(); }
  });
  doc.addEventListener("change", function (e) {
    if (e.target.matches("#stage input, #stage select") && state.step > 0) {
      collect();
      if (["school_type", "country", "heating_fuel"].indexOf(e.target.name) >= 0) { $("#stage").innerHTML = TPL[STEPS[state.step].key](state.data); renderStepper(); if (STEPS[state.step].key === "size") mountMapButton(); }
    }
  });

  /* ------------------------- map (optional) ----------------------------- */
  // Implemented in map.js; here we just mount the entry button + slot.
  function mountMapButton() {
    var slot = $("#map-slot"); if (!slot) return;
    slot.innerHTML = '<div class="group optional"><div class="group-head"><span class="gh-title">Not sure of your floor area?</span><span class="tag tag-opt">Optional</span></div>' +
      '<p class="field-hint" style="margin-top:0">Trace your building roofs on a map and we will estimate the floor area for you. Trace the buildings only, not sports fields or car parks, and tell us how many storeys.</p>' +
      '<button class="btn btn-secondary" data-action="map-open" type="button">Draw buildings on a map</button>' +
      '<div id="map-host"></div></div>';
  }
  function openMap() { if (root.SCHOOLCARBON.map) root.SCHOOLCARBON.map.open(state.data, function (m2) { state.data.floor_area = Math.round(m2); state.data.floor_area_unit = "m2"; var fa = $("#stage [name=floor_area]"); if (fa) fa.value = Math.round(m2); var fu = $("#stage [name=floor_area_unit]"); if (fu) fu.value = "m2"; saveDraft(state); }); }

  render();
  root.SCHOOLCARBON.app = { calculate: calculate, getState: function () { return state; } };
})(typeof window !== "undefined" ? window : this);
