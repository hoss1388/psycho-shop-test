"use strict";

const fs = require("fs");

const file = process.argv[2] || "./api/prices.json";
const maxAgeSeconds = Number(process.env.MAX_PRICE_AGE_SECONDS || 900);
const nowOverride = process.env.PRICE_VALIDATION_NOW;
const now = nowOverride ? Date.parse(nowOverride) : Date.now();
const plans = ["3m", "6m", "12m"];
const checks = [];

function check(name, value, detail) {
  checks.push({ name, ok: Boolean(value), detail });
  return Boolean(value);
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.log(JSON.stringify({ valid: false, file, error: error.message }, null, 2));
  process.exit(1);
}

const updatedAtMs = Date.parse(data.updatedAt);
const ageSeconds = Number.isFinite(updatedAtMs) ? Math.max(0, Math.floor((now - updatedAtMs) / 1000)) : null;

check("validator.clock", Number.isFinite(now), "validation clock must be valid");
check("updatedAt", Number.isFinite(updatedAtMs), "last successful update timestamp");
check("timestampNotFuture", Number.isFinite(updatedAtMs) && updatedAtMs <= now + 60000, "timestamp must not be more than 60 seconds ahead");
check("freshness", ageSeconds !== null && ageSeconds <= maxAgeSeconds, `ageSeconds=${ageSeconds}; maxAgeSeconds=${maxAgeSeconds}`);
check("health.status", data.health && data.health.status === "ok", "health status must be ok");
check("health.lastSuccessfulUpdate", data.health && data.health.lastSuccessfulUpdate === data.updatedAt, "must match updatedAt");
check("fragment.status", data.health && data.health.fragment && data.health.fragment.status === "ok", "Fragment quote status");
check("ton.status", data.health && data.health.tonToToman && data.health.tonToToman.status === "ok", "Bitpin ticker status");
check("source.premium", data.sources && data.sources.premium === "https://api.fragment-api.io/api/prices", "official Fragment Premium quote endpoint");
check("source.ton", data.sources && data.sources.tonToToman === "https://api.bitpin.org/api/v1/mkt/tickers/ (GRAM_IRT)", "Bitpin GRAM_IRT endpoint");
check("tonToToman", positiveNumber(data.tonToToman) !== null, "positive TON/toman rate");

["single", "four"].forEach((tier) => {
  plans.forEach((plan) => {
    check(`premium.${tier}.${plan}`, positiveNumber(data.premium && data.premium[tier] && data.premium[tier][plan]) !== null, "positive TON quote");
  });
});

plans.forEach((plan) => {
  check(
    `premium.baseMatch.${plan}`,
    data.premium && data.premium.single && data.premium.four && data.premium.single[plan] === data.premium.four[plan],
    "single and four must share the same Fragment base quote"
  );
});

const valid = checks.every((item) => item.ok);
console.log(JSON.stringify({
  valid,
  file,
  updatedAt: data.updatedAt || null,
  ageSeconds,
  tonToToman: data.tonToToman || null,
  health: data.health || null,
  checks
}, null, 2));

process.exit(valid ? 0 : 1);
