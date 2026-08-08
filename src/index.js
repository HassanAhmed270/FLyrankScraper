import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(
  __dirname,
  "../cache/catalogue-page-1.html"
);

const URL = "https://books.toscrape.com/";

async function getCachedHtml() {
  try {
    return await fs.readFile(CACHE_FILE, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function fetchHtml() {
  const response = await fetch(URL, {
    headers: {
      "User-Agent": "FlyRankInternshipA9/1.0 (https://github.com/HassanAhmed270/FLyrankScraper.git)"
    },
    signal: AbortSignal.timeout(5000)
  });

  if (response.status !== 200) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  return response.text();
}

async function saveCache(html) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, html, "utf8");
}

async function main() {
  const cachedHtml = await getCachedHtml();

  if (cachedHtml !== null) {
    console.log(`CACHE HIT - ${Buffer.byteLength(cachedHtml, "utf8")} bytes`);
    return;
  }

  const html = await fetchHtml();

  await saveCache(html);

  console.log(`FETCH - ${Buffer.byteLength(html, "utf8")} bytes`);
}

main().catch((error) => {
  console.error(`ERROR - ${error.message}`);
  process.exitCode = 1;
});