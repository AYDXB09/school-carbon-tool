/* =============================================================================
   School Carbon Tool — Calculation Engine
   -----------------------------------------------------------------------------
   Pure computation. Takes a normalized `input` object from the form, returns a
   `result` object with: per-category numbers, confidence tier, a full
   derivation trace, Scope 1/2/3 subtotals, and a Monte-Carlo
   uncertainty range on the total.

   The engine is DETERMINISTIC given a seed, so a report is reproducible.
   ============================================================================= */
(function (root) {
  "use strict";

  var F = root.SCHOOLCARBON.factors;

  /* ---------------------------- Seeded RNG -------------------------------- */
  // Mulberry32 — small, fast, deterministic. Report stores the seed.
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Standard normal via Box–Muller.
  function randNorm(rng) {
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Lognormal draw with given median and fractional sigma (keeps values > 0).
  function sampleLognormal(rng, median, fracSigma) {
    if (median <= 0) return 0;
    var sigma = Math.log(1 + fracSigma);
    return median * Math.exp(sigma * randNorm(rng));
  }

  /* --------------------------- Unit conversion ---------------------------- */
  var CONV = {
    area: { m2: 1, ft2: 0.092903 },
    volume: { m3: 1, litre: 0.001, us_gallon: 0.00378541, uk_gallon: 0.00454609 },
    distance: { km: 1, mile: 1.60934 }
  };
  function toM2(v, unit) { return v * (CONV.area[unit] || 1); }
  function toM3(v, unit) { return v * (CONV.volume[unit] || 1); }

  /* ---- helpers to resolve the grid factor + climate for a country ------- */
  function resolveGrid(countryCode) {
    var g = F.GRID[countryCode];
    if (g) {
      return { f: g.f, climate: g.climate, label: g.name, source: F.SOURCES.ember, exact: true };
    }
    // fall back to region if we can infer, else world
    var fb = F.GRID_FALLBACK.WORLD;
    return { f: fb.f, climate: fb.climate, label: fb.name, source: F.SOURCES.ember, exact: false };
  }

  var num = function (x) { return (typeof x === "number" && isFinite(x)) ? x : 0; };
  var present = function (x) { return typeof x === "number" && isFinite(x) && x > 0; };

  /* =======================================================================
     CATEGORY BUILDERS
     Each returns a category object:
       { key, label, scope, tCO2e, tier, source, formula, method, factor }
     `tier` ∈ 'measured' | 'estimated_strong' | 'estimated_weak'
     ======================================================================= */

  function fmt(n, dp) { dp = dp == null ? 2 : dp; return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp }); }

  // ---------- SCOPE 2: Electricity ----------
  function calcElectricity(input, grid) {
    var kwh, tier, method;
    if (present(input.electricity_kwh)) {
      kwh = input.electricity_kwh; tier = "measured";
      method = "You told us your annual electricity use.";
    } else if (present(input.electricity_spend) && present(input.electricity_price)) {
      kwh = input.electricity_spend / input.electricity_price; tier = "estimated_strong";
      method = "Estimated from your electricity bill (" + fmt(input.electricity_spend, 0) + " ÷ price " + fmt(input.electricity_price, 3) + " per kWh).";
    } else {
      // impute from floor area × climate intensity (+ cooling handled in intensity)
      var area = getFloorArea(input);
      var intensity = F.BENCHMARKS.elec_kwh_m2[grid.climate] || F.BENCHMARKS.elec_kwh_m2.temperate;
      kwh = area.m2 * intensity; tier = area.measured ? "estimated_strong" : "estimated_weak";
      method = "Estimated from floor area (" + fmt(area.m2, 0) + " m²) × typical school use of " + intensity + " kWh/m²/yr for a " + grid.climate + " climate.";
    }
    var t = (kwh * grid.f) / 1000;
    return {
      key: "electricity", label: "Purchased electricity", scope: 2, tCO2e: t, tier: tier,
      source: grid.source, factor: grid.f + " kgCO₂e/kWh (" + grid.label + ")",
      method: method,
      formula: fmt(kwh, 0) + " kWh × " + grid.f + " kgCO₂e/kWh = " + fmt(t, 2) + " tCO₂e",
      activity: kwh, activityUnit: "kWh"
    };
  }

  // ---------- SCOPE 1: Heating fuel ----------
  function calcHeating(input, grid) {
    var fuelKey = input.heating_fuel || "natural_gas";
    var fuel = F.FUELS[fuelKey] || F.FUELS.natural_gas;
    if (fuelKey === "none_electric") {
      return null; // electric heating already inside the electricity number
    }
    var kwh, tier, method, activityDesc;
    if (present(input.heating_amount) && input.heating_amount_type) {
      // user gave a physical quantity of fuel
      if (input.heating_amount_type === "kwh") {
        kwh = input.heating_amount;
        activityDesc = fmt(kwh, 0) + " kWh of " + fuel.name.toLowerCase();
      } else {
        // amount in fuel's native unit -> convert to kWh via perUnit/perKWh ratio
        var perUnit = fuel.perUnit, perKWh = fuel.perKWh;
        kwh = perKWh > 0 ? (input.heating_amount * perUnit) / perKWh : 0;
        activityDesc = fmt(input.heating_amount, 0) + " " + fuel.unit + " of " + fuel.name.toLowerCase();
      }
      tier = "measured";
      method = "You told us your heating fuel use (" + activityDesc + ").";
    } else {
      var area = getFloorArea(input);
      var intensity = F.BENCHMARKS.thermal_kwh_m2[grid.climate] || F.BENCHMARKS.thermal_kwh_m2.temperate;
      kwh = area.m2 * intensity; tier = area.measured ? "estimated_strong" : "estimated_weak";
      activityDesc = fmt(kwh, 0) + " kWh of " + fuel.name.toLowerCase();
      method = "Estimated from floor area (" + fmt(area.m2, 0) + " m²) × typical heating demand of " + intensity + " kWh/m²/yr for a " + grid.climate + " climate.";
    }
    var t = (kwh * fuel.perKWh) / 1000;
    return {
      key: "heating", label: "Heating & on-site fuel", scope: 1, tCO2e: t, tier: tier,
      source: F.SOURCES[fuel.src], factor: fuel.perKWh + " kgCO₂e/kWh (" + fuel.name + ")",
      method: method + (fuel.biogenic ? " (Biomass is largely biogenic, reported for completeness.)" : ""),
      formula: fmt(kwh, 0) + " kWh × " + fuel.perKWh + " kgCO₂e/kWh = " + fmt(t, 2) + " tCO₂e",
      activity: kwh, activityUnit: "kWh"
    };
  }

  // ---------- SCOPE 1: Owned vehicles ----------
  function calcVehicles(input) {
    if (!present(input.vehicle_fuel_litres)) return null;
    var fuel = F.TRANSPORT_FUELS[input.vehicle_fuel_type || "diesel"] || F.TRANSPORT_FUELS.diesel;
    var t = (input.vehicle_fuel_litres * fuel.perLitre) / 1000;
    return {
      key: "vehicles", label: "School-owned vehicles", scope: 1, tCO2e: t, tier: "measured",
      source: F.SOURCES.defra, factor: fuel.perLitre + " kgCO₂e/litre (" + fuel.name + ")",
      method: "You told us your fleet fuel use.",
      formula: fmt(input.vehicle_fuel_litres, 0) + " L × " + fuel.perLitre + " kgCO₂e/L = " + fmt(t, 2) + " tCO₂e",
      activity: input.vehicle_fuel_litres, activityUnit: "L"
    };
  }

  // ---------- SCOPE 3: Commuting ----------
  function calcCommute(input) {
    var people = num(input.students) + num(input.staff);
    var dayPeople = people - num(input.boarders); // boarders don't commute daily
    if (dayPeople <= 0) return null;
    var b = F.BENCHMARKS.commute;
    var loc = b[input.locality] || b.suburban;
    var days = present(input.school_days) ? input.school_days : b.school_days;

    var dist, split, tier, method;
    if (present(input.commute_avg_km)) {
      dist = input.commute_avg_km; tier = "estimated_strong";
      split = loc.split;
      method = "Based on your average one-way distance (" + fmt(dist, 1) + " km) and typical " + (input.locality || "suburban") + " travel modes.";
    } else {
      dist = loc.dist_km; split = loc.split; tier = "estimated_weak";
      method = "Estimated from a typical " + (input.locality || "suburban") + " commute (" + dist + " km each way) and mode mix, since you didn't provide travel data.";
    }
    // annual passenger-km per person = dist * 2 trips * school_days
    var pkmPerPerson = dist * 2 * days;
    var totalPkm = pkmPerPerson * dayPeople;
    var c = F.SCOPE3.commute;
    var wf = split.car * c.car.perPkm + split.bus * c.bus.perPkm + split.train * c.train.perPkm + split.active * c.active.perPkm;
    var t = (totalPkm * wf) / 1000;
    return {
      key: "commute", label: "Staff & student commuting", scope: 3, tCO2e: t, tier: tier,
      source: F.SOURCES.defra, factor: "blended " + wf.toFixed(3) + " kgCO₂e/passenger-km",
      method: method,
      formula: fmt(dayPeople, 0) + " people × " + fmt(pkmPerPerson, 0) + " km/yr × " + wf.toFixed(3) + " kgCO₂e/km = " + fmt(t, 2) + " tCO₂e",
      activity: totalPkm, activityUnit: "passenger-km"
    };
  }

  // ---------- SCOPE 3: Air travel (school trips / staff) ----------
  function calcFlights(input) {
    if (!present(input.flight_pkm)) return null;
    var isLong = input.flight_type === "long";
    var ff = isLong ? F.SCOPE3.flight.long : F.SCOPE3.flight.short;
    var t = (input.flight_pkm * ff.perPkm) / 1000;
    return {
      key: "flights", label: "Air travel (trips & staff)", scope: 3, tCO2e: t, tier: "measured",
      source: F.SOURCES.defra, factor: ff.perPkm + " kgCO₂e/passenger-km (incl. radiative forcing)",
      method: "Based on the flight distance you provided.",
      formula: fmt(input.flight_pkm, 0) + " passenger-km × " + ff.perPkm + " = " + fmt(t, 2) + " tCO₂e",
      activity: input.flight_pkm, activityUnit: "passenger-km"
    };
  }

  // ---------- SCOPE 3: Food ----------
  function calcFood(input) {
    var people = num(input.students) + num(input.staff);
    if (people <= 0) return null;
    var dietKey = input.diet || "average";
    var diet = F.SCOPE3.food[dietKey] || F.SCOPE3.food.average;
    var days = present(input.school_days) ? input.school_days : F.BENCHMARKS.commute.school_days;
    var meals, tier, method;
    if (present(input.meals_per_day)) {
      meals = input.meals_per_day; tier = "estimated_strong";
      method = "Based on the meals served per day you provided (" + fmt(meals, 0) + "), served over " + days + " school days.";
    } else {
      var boarders = num(input.boarders);
      var dayPeople = people - boarders;
      var perDay = F.BENCHMARKS.meals_per_person_day;
      meals = dayPeople * perDay.day + boarders * perDay.boarding * (365 / days); // boarders eat year-round; normalise to school days
      tier = "estimated_weak";
      method = "Estimated from headcount (" + fmt(dayPeople, 0) + " day + " + fmt(boarders, 0) + " boarding) and typical meals served, using a " + dietKey + " diet.";
    }
    var annualMeals = meals * days;
    var t = (annualMeals * diet.perMeal) / 1000;
    return {
      key: "food", label: "Food & catering", scope: 3, tCO2e: t, tier: tier,
      source: F.SOURCES.poore2018, factor: diet.perMeal + " kgCO₂e/meal (" + diet.name + ")",
      method: method,
      formula: fmt(annualMeals, 0) + " meals/yr × " + diet.perMeal + " kgCO₂e/meal = " + fmt(t, 2) + " tCO₂e",
      activity: annualMeals, activityUnit: "meals"
    };
  }

  // ---------- SCOPE 3: Water ----------
  function calcWater(input) {
    var people = num(input.students) + num(input.staff);
    if (people <= 0 && !present(input.water_m3)) return null;
    var m3, tier, method;
    if (present(input.water_m3)) {
      m3 = input.water_m3; tier = "measured";
      method = "You told us your annual water use.";
    } else {
      var boarders = num(input.boarders);
      var dayPeople = people - boarders;
      var pc = F.BENCHMARKS.water_m3_per_person;
      m3 = dayPeople * pc.day + boarders * pc.boarding; tier = "estimated_weak";
      method = "Estimated from headcount and typical per-person school water use.";
    }
    var t = (m3 * F.SCOPE3.water.perM3) / 1000;
    return {
      key: "water", label: "Water supply & treatment", scope: 3, tCO2e: t, tier: tier,
      source: F.SOURCES.defra, factor: F.SCOPE3.water.perM3 + " kgCO₂e/m³",
      method: method,
      formula: fmt(m3, 0) + " m³ × " + F.SCOPE3.water.perM3 + " kgCO₂e/m³ = " + fmt(t, 2) + " tCO₂e",
      activity: m3, activityUnit: "m³"
    };
  }

  // ---------- SCOPE 3: Waste ----------
  function calcWaste(input) {
    var people = num(input.students) + num(input.staff);
    if (people <= 0 && !present(input.waste_tonnes)) return null;
    var tonnes, tier, method;
    if (present(input.waste_tonnes)) {
      tonnes = input.waste_tonnes; tier = "measured";
      method = "You told us your annual waste tonnage.";
    } else {
      var boarders = num(input.boarders);
      var dayPeople = people - boarders;
      var pc = F.BENCHMARKS.waste_kg_per_person;
      tonnes = (dayPeople * pc.day + boarders * pc.boarding) / 1000; tier = "estimated_weak";
      method = "Estimated from headcount and typical per-person school waste.";
    }
    var recRate = present(input.recycling_rate) ? input.recycling_rate : F.BENCHMARKS.default_recycling_rate;
    var landfillT = tonnes * (1 - recRate);
    var recycleT = tonnes * recRate;
    var kg = landfillT * F.SCOPE3.waste.landfill.perTonne + recycleT * F.SCOPE3.waste.recycling.perTonne;
    var t = kg / 1000;
    return {
      key: "waste", label: "Waste disposal", scope: 3, tCO2e: t, tier: tier,
      source: F.SOURCES.defra, factor: F.SCOPE3.waste.landfill.perTonne + " (landfill) / " + F.SCOPE3.waste.recycling.perTonne + " (recycling) kgCO₂e/tonne",
      method: method + " Assumed " + Math.round(recRate * 100) + "% recycled.",
      formula: fmt(landfillT, 1) + " t landfill + " + fmt(recycleT, 1) + " t recycling = " + fmt(t, 2) + " tCO₂e",
      activity: tonnes, activityUnit: "tonnes"
    };
  }

  // ---------- SCOPE 3: Procurement (spend-based) ----------
  function calcProcurement(input) {
    var usd, tier, method;
    if (present(input.procurement_usd)) {
      usd = input.procurement_usd; tier = "estimated_strong";
      method = "Spend-based estimate from the procurement budget you provided.";
    } else {
      var people = num(input.students) + num(input.staff);
      if (people <= 0) return null;
      usd = people * F.BENCHMARKS.procurement_usd_per_person; tier = "estimated_weak";
      method = "Estimated from headcount and typical school procurement spend, since no budget was given.";
    }
    var t = (usd * F.SCOPE3.procurement.perUSD) / 1000;
    return {
      key: "procurement", label: "Goods & services (procurement)", scope: 3, tCO2e: t, tier: tier,
      source: F.SOURCES.ghgp3, factor: F.SCOPE3.procurement.perUSD + " kgCO₂e per USD spent",
      method: method,
      formula: "$" + fmt(usd, 0) + " × " + F.SCOPE3.procurement.perUSD + " kgCO₂e/USD = " + fmt(t, 2) + " tCO₂e",
      activity: usd, activityUnit: "USD"
    };
  }

  /* ---- floor area resolver (measured or imputed from headcount) --------- */
  function getFloorArea(input) {
    if (present(input.floor_area)) {
      return { m2: toM2(input.floor_area, input.floor_area_unit || "m2"), measured: true };
    }
    var people = num(input.students) + num(input.staff);
    return { m2: Math.max(people, 1) * F.BENCHMARKS.area_per_person_m2, measured: false };
  }

  /* =======================================================================
     MAIN
     ======================================================================= */
  function calculate(rawInput) {
    var input = rawInput;
    var grid = resolveGrid(input.country);

    var cats = [];
    function push(c) { if (c && c.tCO2e >= 0) cats.push(c); }

    push(calcElectricity(input, grid));
    push(calcHeating(input, grid));
    push(calcVehicles(input));
    push(calcCommute(input));
    push(calcFlights(input));
    push(calcFood(input));
    push(calcWater(input));
    push(calcWaste(input));
    push(calcProcurement(input));

    // Scope subtotals
    var scopes = { 1: 0, 2: 0, 3: 0 };
    cats.forEach(function (c) { scopes[c.scope] += c.tCO2e; });
    var total = scopes[1] + scopes[2] + scopes[3];

    // Confidence: share of total that is 'measured'
    var measuredT = 0;
    cats.forEach(function (c) { if (c.tier === "measured") measuredT += c.tCO2e; });
    var measuredPct = total > 0 ? (measuredT / total) * 100 : 0;

    // ---- Monte Carlo uncertainty band on the total ----
    var seed = input.seed || 20240722;
    var rng = makeRng(seed);
    var N = 4000;
    var totals = new Array(N);
    for (var i = 0; i < N; i++) {
      var s = 0;
      for (var j = 0; j < cats.length; j++) {
        var frac = F.UNCERTAINTY[cats[j].tier] || 0.3;
        s += sampleLognormal(rng, cats[j].tCO2e, frac);
      }
      totals[i] = s;
    }
    totals.sort(function (a, b) { return a - b; });
    var pct = function (p) { return totals[Math.min(N - 1, Math.floor(p * N))]; };
    var range = { p10: pct(0.10), p50: pct(0.50), p90: pct(0.90) };

    cats.sort(function (a, b) { return b.tCO2e - a.tCO2e; });

    return {
      factorSetVersion: F.FACTOR_SET_VERSION,
      seed: seed,
      grid: grid,
      categories: cats,
      scopes: scopes,
      total: total,
      range: range,
      measuredPct: measuredPct,
      generatedAt: new Date().toISOString(),
      input: input
    };
  }

  root.SCHOOLCARBON.engine = { calculate: calculate };
})(typeof window !== "undefined" ? window : this);
