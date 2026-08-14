const fs = require("fs");

const inputFile = process.argv[2];

if (!inputFile) {
  console.error("Ticker input file is required");
  process.exit(1);
}

const tickers = JSON.parse(fs.readFileSync(inputFile, "utf8"));

if (!Array.isArray(tickers)) {
  console.error("Bitpin ticker response must be an array");
  process.exit(1);
}

const gramIrt = tickers.find((ticker) => ticker.symbol === "GRAM_IRT");
const price = gramIrt ? Number(gramIrt.price) : NaN;
const timestamp = gramIrt ? Number(gramIrt.timestamp) : NaN;
const nowSeconds = Date.now() / 1000;

if (!Number.isFinite(price) || price <= 0) {
  console.error("A valid GRAM_IRT price was not found in Bitpin tickers");
  process.exit(1);
}

if (!Number.isFinite(timestamp) || timestamp <= 0 || nowSeconds - timestamp > 900) {
  console.error("GRAM_IRT ticker is missing or older than 15 minutes");
  process.exit(1);
}

process.stdout.write(String(price));
