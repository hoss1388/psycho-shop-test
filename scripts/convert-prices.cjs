const fs = require("fs");
const { execFileSync } = require("child_process");

const outputFile = process.env.PRICES_OUTPUT_FILE || "./api/prices.json";
const fragmentPricesFile = process.env.FRAGMENT_PRICES_FILE;
const tonPrice = Number(process.env.TON_PRICE || 0);
const fragmentApiKey = process.env.FRAGMENT_API_KEY;
const now = new Date().toISOString();

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

if (!Number.isFinite(tonPrice) || tonPrice <= 0) {
  throw new Error("TON_PRICE is missing or invalid");
}

if (!fragmentApiKey) {
  throw new Error("FRAGMENT_API_KEY is missing");
}

if (!fragmentPricesFile) {
  throw new Error("FRAGMENT_PRICES_FILE is missing");
}

// ------------------------------------------------------
// Fragment price list
// ------------------------------------------------------

const fragmentData = JSON.parse(fs.readFileSync(fragmentPricesFile, "utf8"));

if (!Array.isArray(fragmentData)) {
  throw new Error("Fragment price-list response must be an array");
}

const output = {
  updatedAt: now,
  sources: {
    premium: "https://api.fragment-api.io/api/prices",
    premiumPriceList: "https://api.fragment-api.io/api/prices/list",
    tonToToman: "https://api.bitpin.org/api/v1/mkt/tickers/ (GRAM_IRT)"
  },
  health: {
    status: "ok",
    lastSuccessfulUpdate: now,
    fragment: {
      status: "ok",
      paymentMethod: "ton",
      premiumQuoteFields: {}
    },
    tonToToman: {
      status: "ok",
      provider: "Bitpin",
      market: "GRAM_IRT",
      fetchedAt: now
    }
  },
  tonToToman: tonPrice,

  // =========================
  // STARS
  // =========================

  stars: {
    tonPerStar: 0
  },

  // =========================
  // PREMIUM
  // =========================

  premium: {
    single: {},
    four: {}
  }
};


// ======================================================
// STARS
// ======================================================

// قیمت 50 Stars از لیست Fragment گرفته می‌شود.

const stars50 = fragmentData.find(
  x =>
    x.product_type === "stars" &&
    String(x.item_name).includes("50") &&
    x.currency === "TON"
);

if (stars50) {
  const starsTotalTon = positiveNumber(stars50.total) || positiveNumber(stars50.price);
  output.stars.tonPerStar = starsTotalTon ? starsTotalTon / 50 : 0;
}

if (!Number.isFinite(output.stars.tonPerStar) || output.stars.tonPerStar <= 0) {
  throw new Error("A valid 50-Star TON price was not found in Fragment price list");
}


// ======================================================
// PREMIUM
// ======================================================

// Premium را مستقیماً از Live API فرگمنت می‌گیریم.
//
// 3 ماه
// 6 ماه
// 12 ماه

function getPremiumPrice(months) {

  console.log(`Requesting Premium: ${months} months`);

  const url =
    `https://api.fragment-api.io/api/prices` +
    `?product_type=premium` +
    `&quantity=${months}` +
    `&recipient=durov` +
    `&payment_method=ton`;

  try {

    const result = execFileSync(
      "curl",
      [
        "-fsS",
        url,
        "-H",
        `X-API-Key: ${fragmentApiKey}`
      ],
      {
        encoding: "utf8"
      }
    );

    const data = JSON.parse(result);
    const quote = data && typeof data.data === "object" ? data.data : data;

    console.log(
      `Fragment Premium ${months}m:`,
      quote
    );

    if (!quote || typeof quote !== "object") {
      throw new Error(`No quote object returned for ${months} months`);
    }
    if (quote.product_type && quote.product_type !== "premium") {
      throw new Error(`Unexpected product type for ${months} months`);
    }
    if (quote.payment_method && quote.payment_method !== "ton") {
      throw new Error(`Unexpected payment method for ${months} months`);
    }
    if (quote.currency && String(quote.currency).toUpperCase() !== "TON") {
      throw new Error(`Non-TON quote returned for ${months} months`);
    }

    const candidates = [
      { field: "total", value: quote.total },
      { field: "price", value: quote.price }
    ];

    for (const candidate of candidates) {
      const price = positiveNumber(candidate.value);
      if (Number.isFinite(price) && price > 0) {
        return { ton: price, quoteField: candidate.field };
      }
    }

    throw new Error(
      `No price found in Fragment response for ${months} months`
    );

  } catch (error) {

    console.error(
      `Failed to get Premium price for ${months} months`
    );

    console.error(error.message);

    process.exit(1);
  }
}


// ======================================================
// GET LIVE PREMIUM PRICES
// ======================================================

const premium3 = getPremiumPrice(3);
const premium6 = getPremiumPrice(6);
const premium12 = getPremiumPrice(12);


// ======================================================
// SAVE PREMIUM RAW TON PRICES
// ======================================================

// Single Premium

output.premium.single["3m"] = premium3.ton;
output.premium.single["6m"] = premium6.ton;
output.premium.single["12m"] = premium12.ton;


// ======================================================
// FOUR PREMIUM
// ======================================================

// قیمت پایه برای 4 بوست/چهار Premium
// همان قیمت پایه Fragment است.
//
// سود مربوط به 4 عدد در pricing.js
// جداگانه اضافه خواهد شد.

output.premium.four["3m"] = premium3.ton;
output.premium.four["6m"] = premium6.ton;
output.premium.four["12m"] = premium12.ton;
output.health.fragment.premiumQuoteFields = {
  "3m": premium3.quoteField,
  "6m": premium6.quoteField,
  "12m": premium12.quoteField
};


// ======================================================
// DEBUG
// ======================================================

console.log("");
console.log("===== FINAL PREMIUM PRICES =====");

console.log(
  "3m:",
  output.premium.single["3m"],
  "TON"
);

console.log(
  "6m:",
  output.premium.single["6m"],
  "TON"
);

console.log(
  "12m:",
  output.premium.single["12m"],
  "TON"
);

console.log("===============================");
console.log("");


// ======================================================
// DEBUG STARS
// ======================================================

console.log("===== FINAL STARS PRICE =====");

console.log(
  "TON per Star:",
  output.stars.tonPerStar
);

console.log("============================");
console.log("");


// ======================================================
// SAVE
// ======================================================

fs.writeFileSync(
  outputFile,
  JSON.stringify(output, null, 2) + "\n",
  "utf8"
);

console.log("Prices converted successfully");
