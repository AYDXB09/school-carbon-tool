/* =============================================================================
   School Carbon Tool — Emission Factor Library
   -----------------------------------------------------------------------------
   Every factor below carries: value, unit, source name, source year, and a
   primary-source URL so the report can show its work.

   PROVENANCE NOTE:
   These values are curated reference figures drawn from the named primary
   datasets (Ember, IEA, UK DEFRA/DESNZ, GHG Protocol, CIBSE) and are suitable
   for a decision-grade estimate. They should be synced from the live releases
   annually, with a factor-set version stamped onto every report. Do not
   silently re-pull "current" factors into past reports — lock the version per
   snapshot.

   FACTOR_SET_VERSION is the single source of truth stamped onto every report.
   ============================================================================= */
(function (root) {
  "use strict";

  var FACTOR_SET_VERSION = "2024.1";

  /* ---- Canonical source registry (single place; report links back here) ---- */
  var SOURCES = {
    ember: {
      name: "Ember, Yearly Electricity Data (2024)",
      short: "Ember 2024",
      url: "https://ember-energy.org/data/yearly-electricity-data/",
      note: "Location-based grid carbon intensity, gCO₂e/kWh, 215-country coverage, open licence."
    },
    iea: {
      name: "IEA, Emissions Factors 2024",
      short: "IEA 2024",
      url: "https://www.iea.org/data-and-statistics/data-product/emissions-factors-2024",
      note: "Cross-check for OECD grid factors."
    },
    defra: {
      name: "UK DESNZ and DEFRA, Greenhouse gas reporting conversion factors 2024",
      short: "DEFRA 2024",
      url: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2024",
      note: "Fuel combustion, transport, water and waste factors (kgCO₂e per unit)."
    },
    ghgp3: {
      name: "GHG Protocol, Scope 3 Calculation Guidance (Category 1, spend-based)",
      short: "GHG Protocol Scope 3",
      url: "https://ghgprotocol.org/scope-3-calculation-guidance-2",
      note: "Spend-based (EEIO) method for procurement emissions."
    },
    cibse: {
      name: "CIBSE TM46, Energy Benchmarks (Schools and seasonal public buildings)",
      short: "CIBSE TM46",
      url: "https://www.cibse.org/knowledge-research/knowledge-portal/tm46-energy-benchmarks-2008",
      note: "Typical school energy intensity: ~40 kWh/m²/yr electricity, ~150 kWh/m²/yr fossil-thermal."
    },
    poore2018: {
      name: "Poore and Nemecek (2018), Science, food life-cycle emissions",
      short: "Poore & Nemecek 2018",
      url: "https://www.science.org/doi/10.1126/science.aaq0216",
      note: "Per-meal dietary emission factors by diet type."
    }
  };

  /* -------------------------------------------------------------------------
     GRID ELECTRICITY — location-based intensity, kgCO2e per kWh.
     Source: Ember 2024 (cross-checked vs IEA for OECD). climate: default
     climate band used for thermal imputation when the school gives no fuel
     data (cold | temperate | warm | hot). region: for regional fallback.
     "u" = uncertainty as a fractional 1-sigma for Monte Carlo (grid factors
     are well-measured, so small).
     ------------------------------------------------------------------------- */
  var GRID = {
    // ---- Europe ----
    NO: { name: "Norway",          f: 0.026, climate: "cold",      region: "EU" },
    IS: { name: "Iceland",         f: 0.028, climate: "cold",      region: "EU" },
    SE: { name: "Sweden",          f: 0.039, climate: "cold",      region: "EU" },
    CH: { name: "Switzerland",     f: 0.041, climate: "temperate", region: "EU" },
    FR: { name: "France",          f: 0.058, climate: "temperate", region: "EU" },
    FI: { name: "Finland",         f: 0.068, climate: "cold",      region: "EU" },
    AT: { name: "Austria",         f: 0.089, climate: "temperate", region: "EU" },
    BE: { name: "Belgium",         f: 0.138, climate: "temperate", region: "EU" },
    DK: { name: "Denmark",         f: 0.151, climate: "cold",      region: "EU" },
    PT: { name: "Portugal",        f: 0.151, climate: "warm",      region: "EU" },
    ES: { name: "Spain",           f: 0.171, climate: "warm",      region: "EU" },
    HU: { name: "Hungary",         f: 0.196, climate: "temperate", region: "EU" },
    GB: { name: "United Kingdom",  f: 0.207, climate: "temperate", region: "EU" },
    RO: { name: "Romania",         f: 0.264, climate: "temperate", region: "EU" },
    NL: { name: "Netherlands",     f: 0.268, climate: "temperate", region: "EU" },
    IT: { name: "Italy",           f: 0.278, climate: "warm",      region: "EU" },
    IE: { name: "Ireland",         f: 0.286, climate: "temperate", region: "EU" },
    GR: { name: "Greece",          f: 0.335, climate: "warm",      region: "EU" },
    DE: { name: "Germany",         f: 0.364, climate: "temperate", region: "EU" },
    CZ: { name: "Czechia",         f: 0.408, climate: "temperate", region: "EU" },
    PL: { name: "Poland",          f: 0.635, climate: "cold",      region: "EU" },
    // ---- Americas ----
    CR: { name: "Costa Rica",      f: 0.033, climate: "hot",       region: "SA" },
    BR: { name: "Brazil",          f: 0.099, climate: "hot",       region: "SA" },
    CA: { name: "Canada",          f: 0.128, climate: "cold",      region: "NA" },
    CO: { name: "Colombia",        f: 0.164, climate: "hot",       region: "SA" },
    PE: { name: "Peru",            f: 0.216, climate: "warm",      region: "SA" },
    CL: { name: "Chile",           f: 0.291, climate: "temperate", region: "SA" },
    AR: { name: "Argentina",       f: 0.322, climate: "temperate", region: "SA" },
    US: { name: "United States",   f: 0.369, climate: "temperate", region: "NA" },
    MX: { name: "Mexico",          f: 0.423, climate: "warm",      region: "NA" },
    // ---- Asia-Pacific ----
    NZ: { name: "New Zealand",     f: 0.102, climate: "temperate", region: "OC" },
    SG: { name: "Singapore",       f: 0.408, climate: "hot",       region: "AS" },
    KR: { name: "South Korea",     f: 0.436, climate: "temperate", region: "AS" },
    VN: { name: "Vietnam",         f: 0.475, climate: "hot",       region: "AS" },
    JP: { name: "Japan",           f: 0.489, climate: "temperate", region: "AS" },
    TH: { name: "Thailand",        f: 0.507, climate: "hot",       region: "AS" },
    AU: { name: "Australia",       f: 0.532, climate: "warm",      region: "OC" },
    TW: { name: "Taiwan",          f: 0.565, climate: "warm",      region: "AS" },
    CN: { name: "China",           f: 0.582, climate: "temperate", region: "AS" },
    MY: { name: "Malaysia",        f: 0.585, climate: "hot",       region: "AS" },
    ID: { name: "Indonesia",       f: 0.618, climate: "hot",       region: "AS" },
    PH: { name: "Philippines",     f: 0.648, climate: "hot",       region: "AS" },
    HK: { name: "Hong Kong",       f: 0.710, climate: "warm",      region: "AS" },
    IN: { name: "India",           f: 0.713, climate: "hot",       region: "AS" },
    // ---- Middle East & Africa ----
    ET: { name: "Ethiopia",        f: 0.030, climate: "warm",      region: "AF" },
    KE: { name: "Kenya",           f: 0.102, climate: "warm",      region: "AF" },
    AE: { name: "United Arab Emirates", f: 0.402, climate: "hot",  region: "ME" },
    TR: { name: "Turkey",          f: 0.442, climate: "temperate", region: "ME" },
    EG: { name: "Egypt",           f: 0.450, climate: "hot",       region: "AF" },
    QA: { name: "Qatar",           f: 0.490, climate: "hot",       region: "ME" },
    IL: { name: "Israel",          f: 0.510, climate: "warm",      region: "ME" },
    SA: { name: "Saudi Arabia",    f: 0.548, climate: "hot",       region: "ME" },
    MA: { name: "Morocco",         f: 0.610, climate: "warm",      region: "AF" },
    ZA: { name: "South Africa",    f: 0.709, climate: "temperate", region: "AF" }
  };

  /* Regional + world fallback grid factors (used if a country isn't listed).
     Source: Ember 2024 regional aggregates. */
  var GRID_FALLBACK = {
    EU: { name: "Europe (regional average)",        f: 0.250, climate: "temperate" },
    NA: { name: "North America (regional average)", f: 0.350, climate: "temperate" },
    SA: { name: "South America (regional average)", f: 0.200, climate: "warm" },
    AS: { name: "Asia (regional average)",          f: 0.550, climate: "warm" },
    ME: { name: "Middle East (regional average)",   f: 0.500, climate: "hot" },
    AF: { name: "Africa (regional average)",        f: 0.450, climate: "warm" },
    OC: { name: "Oceania (regional average)",       f: 0.500, climate: "temperate" },
    WORLD: { name: "World average",                 f: 0.475, climate: "temperate" }
  };

  /* -------------------------------------------------------------------------
     FUELS — combustion factors. Canonical energy basis is kWh (gross CV) where
     possible; liquid fuels also carry a per-litre factor. Source: DEFRA 2024.
     biogenic:true flags biomass (reported but near-zero fossil CO2).
     ------------------------------------------------------------------------- */
  var FUELS = {
    natural_gas:   { name: "Natural gas",      perKWh: 0.18293, perUnit: 2.0398, unit: "m³", src: "defra" },
    heating_oil:   { name: "Heating oil (kerosene)", perKWh: 0.24677, perUnit: 2.5404, unit: "litre", src: "defra" },
    gas_oil:       { name: "Gas oil / red diesel", perKWh: 0.25650, perUnit: 2.7568, unit: "litre", src: "defra" },
    lpg:           { name: "LPG",              perKWh: 0.21449, perUnit: 1.5570, unit: "litre", src: "defra" },
    coal:          { name: "Coal (industrial)", perKWh: 0.34462, perUnit: 2.4030, unit: "kg", src: "defra" },
    biomass:       { name: "Wood pellets / biomass", perKWh: 0.03895, perUnit: 0.05,  unit: "kg", src: "defra", biogenic: true },
    district_heat: { name: "District heating", perKWh: 0.17000, perUnit: 0.17,  unit: "kWh", src: "defra" },
    none_electric: { name: "Electric heating / heat pump / none", perKWh: 0, perUnit: 0, unit: "kWh", src: "defra",
                     note: "No direct combustion. Heating energy shows up under electricity (Scope 2)." }
  };

  /* Transport fuels for on-site vehicles / school buses (per litre). DEFRA 2024. */
  var TRANSPORT_FUELS = {
    petrol: { name: "Petrol / gasoline", perLitre: 2.3117, src: "defra" },
    diesel: { name: "Diesel",            perLitre: 2.6577, src: "defra" }
  };

  /* -------------------------------------------------------------------------
     SCOPE 3 activity factors. Source: DEFRA 2024 unless noted.
     ------------------------------------------------------------------------- */
  var SCOPE3 = {
    // Passenger transport, kgCO2e per passenger-km
    commute: {
      car:   { name: "Car (average)",       perPkm: 0.1700, src: "defra" },
      bus:   { name: "Bus / coach",         perPkm: 0.1020, src: "defra" },
      train: { name: "Rail",                perPkm: 0.0350, src: "defra" },
      active:{ name: "Walk / cycle",        perPkm: 0.0,    src: "defra" }
    },
    // Air travel, kgCO2e per passenger-km incl. radiative forcing uplift. DEFRA 2024.
    flight: {
      short: { name: "Short-haul flight (<3,700 km)", perPkm: 0.158, src: "defra" },
      long:  { name: "Long-haul flight (>3,700 km)",  perPkm: 0.195, src: "defra" }
    },
    // Water supply + treatment, kgCO2e per m3. DEFRA 2024.
    water: { name: "Water supply + treatment", perM3: 0.4490, src: "defra" },
    // Waste, kgCO2e per tonne. DEFRA 2024 (mixed commercial waste to landfill vs recycling).
    waste: {
      landfill:  { name: "Mixed waste to landfill", perTonne: 446.2, src: "defra" },
      recycling: { name: "Mixed recycling",         perTonne: 21.3,  src: "defra" }
    },
    // Food, kgCO2e per meal by diet type. Derived from Poore & Nemecek 2018.
    food: {
      meat_heavy:  { name: "Meat-heavy meal",  perMeal: 3.30, src: "poore2018" },
      average:     { name: "Average mixed meal", perMeal: 1.90, src: "poore2018" },
      vegetarian:  { name: "Vegetarian meal",  perMeal: 1.20, src: "poore2018" },
      vegan:       { name: "Vegan / plant-based meal", perMeal: 0.90, src: "poore2018" }
    },
    // Procurement spend-based EEIO, kgCO2e per USD of spend (education-sector avg).
    procurement: { name: "General procurement (spend-based)", perUSD: 0.30, src: "ghgp3" }
  };

  /* -------------------------------------------------------------------------
     IMPUTATION BENCHMARKS — used when a school provides no data for a category.
     CIBSE TM46 school energy intensities + climate scaling for thermal.
     Per-capita Scope 3 defaults are conservative sector midpoints.
     ------------------------------------------------------------------------- */
  var BENCHMARKS = {
    // Electricity intensity by climate (kWh/m2/yr). Base CIBSE 40; hot climates
    // add cooling load, cold climates slightly less cooling.
    elec_kwh_m2: { cold: 38, temperate: 42, warm: 55, hot: 75, src: "cibse" },
    // Fossil-thermal intensity by climate (kWh/m2/yr). Base CIBSE 150, scaled by
    // heating demand: cold climates far higher, hot climates minimal.
    thermal_kwh_m2: { cold: 210, temperate: 150, warm: 70, hot: 25, src: "cibse" },
    // Floor area per person (m2) when the school doesn't know its area.
    area_per_person_m2: 10,
    // Commuting: average one-way distance (km) and mode split by locality.
    // school_days default and trips/day (2 = there & back).
    commute: {
      school_days: 190,
      urban:    { dist_km: 4,  split: { car: 0.35, bus: 0.30, train: 0.15, active: 0.20 } },
      suburban: { dist_km: 8,  split: { car: 0.65, bus: 0.20, train: 0.05, active: 0.10 } },
      rural:    { dist_km: 14, split: { car: 0.70, bus: 0.25, train: 0.00, active: 0.05 } }
    },
    // Per-capita annual defaults for imputation.
    water_m3_per_person:  { day: 4.0, boarding: 18.0 },   // day pupil vs boarder
    waste_kg_per_person:  { day: 45,  boarding: 110 },    // annual, before diversion
    default_recycling_rate: 0.35,
    meals_per_person_day: { day: 1, boarding: 3 },
    // Procurement spend per person per year (USD) when unknown (school opex proxy).
    procurement_usd_per_person: 1500
  };

  /* Monte Carlo uncertainty (fractional 1-sigma of a lognormal) by confidence
     tier. Measured data is tight; weak estimates are wide. */
  var UNCERTAINTY = {
    measured: 0.07,          // school gave direct activity data; only factor uncertainty
    estimated_strong: 0.25,  // imputed from a school-specific proxy (area/headcount)
    estimated_weak: 0.45     // imputed from country/global default
  };

  root.SCHOOLCARBON = root.SCHOOLCARBON || {};
  root.SCHOOLCARBON.factors = {
    FACTOR_SET_VERSION: FACTOR_SET_VERSION,
    SOURCES: SOURCES,
    GRID: GRID,
    GRID_FALLBACK: GRID_FALLBACK,
    FUELS: FUELS,
    TRANSPORT_FUELS: TRANSPORT_FUELS,
    SCOPE3: SCOPE3,
    BENCHMARKS: BENCHMARKS,
    UNCERTAINTY: UNCERTAINTY
  };
})(typeof window !== "undefined" ? window : this);
