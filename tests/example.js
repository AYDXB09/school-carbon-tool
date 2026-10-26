// Runs the real engine on the worked example from the README and checks the published numbers.
//   node tests/example.js
const vm = require("vm"), fs = require("fs"), path = require("path");
const sandbox = {}; sandbox.window = sandbox; sandbox.self = sandbox; vm.createContext(sandbox);
for (const file of ["factors.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "assets", file), "utf8"), sandbox, { filename: file });
}

const result = sandbox.SCHOOLCARBON.engine.calculate({
  school_name: "Example School", country: "CH", locality: "suburban",
  period_start: "2024-09-01", period_end: "2025-08-31",
  students: 600, staff: 90, boarders: 100,
  floor_area: 12000, floor_area_unit: "m2", school_days: 190,
  electricity_kwh: 900000,
  heating_fuel: "natural_gas", heating_amount_type: "unit",
  vehicle_fuel_type: "diesel", diet: "average", flight_type: "short",
  seed: 12345,
});

const byKey = Object.fromEntries(result.categories.map((c) => [c.key, c.tCO2e]));
const close = (a, b, tol) => Math.abs(a - b) <= tol;
const checks = [
  ["electricity = 900,000 kWh x 0.041 kg/kWh = 36.9 t", close(byKey.electricity, 36.9, 0.01)],
  ["heating (estimated from floor area) is about 329 t", close(byKey.heating, 329.3, 0.1)],
  ["category figures add up to the total", close(Object.values(byKey).reduce((a, b) => a + b, 0), result.total, 1e-6)],
  ["scopes add up to the total", close(Object.values(result.scopes).reduce((a, b) => a + b, 0), result.total, 1e-6)],
  ["the same seed gives the same uncertainty range", close(result.range.p50, 1399.8, 0.1)],
  ["p10 < p50 < p90", result.range.p10 < result.range.p50 && result.range.p50 < result.range.p90],
];
for (const [name, ok] of checks) console.log((ok ? "PASS" : "FAIL") + "  " + name);
console.log("\ntotal " + result.total.toFixed(1) + " tCO2e  (P10-P90: " + result.range.p10.toFixed(0) + "-" + result.range.p90.toFixed(0) + ")");
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
