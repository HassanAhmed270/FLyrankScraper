import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(
    __dirname,
    "../cache/catalogue-page-1.html"
);

const CATALOGUE_URL = "https://books.toscrape.com/";

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

function extractBookLinks(html, pageUrl) {
    const $ = cheerio.load(html);
    const links = new Set();

    $("article.product_pod h3 a").each((_, element) => {
        const href = $(element).attr("href");

        if (href) {
            links.add(new URL(href, pageUrl).href);
        }
    });

    return [...links];
}
function getNextPageUrl(html, pageUrl) {
    const $ = cheerio.load(html);
    const href = $("li.next a").attr("href");

    return href ? new URL(href, pageUrl).href : null;
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function crawlCatalogue() {
    const cataloguePages = [];
    const bookLinks = new Map();

    let pageUrl = CATALOGUE_URL;

    for (let pageNumber = 1; pageNumber <= 3; pageNumber++) {
        let html;

        const cachedFile = path.join(
            __dirname,
            `../cache/catalogue-page-${pageNumber}.html`
        );

        try {
            html = await fs.readFile(cachedFile, "utf8");
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }

            if (pageNumber > 1) {
                await wait(500);
            }

            const response = await fetch(pageUrl, {
                headers: {
                    "User-Agent": "FlyRankInternshipA9/1.0 (https://github.com/HassanAhmed270/FLyrankScraper.git)"
                },
                signal: AbortSignal.timeout(5000)
            });

            if (response.status !== 200) {
                throw new Error(
                    `Catalogue page ${pageNumber} failed with status ${response.status}`
                );
            }

            html = await response.text();

            await fs.mkdir(path.dirname(cachedFile), { recursive: true });
            await fs.writeFile(cachedFile, html, "utf8");
        }

        cataloguePages.push(pageUrl);

        for (const link of extractBookLinks(html, pageUrl)) {
            if (!bookLinks.has(link)) {
                bookLinks.set(link, pageUrl);
            }
        }

        pageUrl = getNextPageUrl(html, pageUrl);

        if (!pageUrl) {
            break;
        }
    }

    return {
        cataloguePages,
        bookLinks: [...bookLinks.entries()].map(([url, sourcePage]) => ({
            url,
            sourcePage
        }))
    };
}

function getBookCacheFile(index) {
    return path.join(__dirname, `../cache/books/${index}.html`);
}
async function getBookHtml(bookUrl, index) {
    const cacheFile = getBookCacheFile(index);
    const metadataFile = path.join(__dirname, `../cache/books/${index}.json`);

    try {
        const html = await fs.readFile(cacheFile, "utf8");
        const metadata = JSON.parse(
            await fs.readFile(metadataFile, "utf8")
        );

        return {
            html,
            fetchedAt: metadata.fetched_at,
            fromCache: true
        };
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    await wait(500);

    const response = await fetch(bookUrl, {
        headers: {
            "User-Agent": "FlyRankInternshipA9/1.0 (https://github.com/HassanAhmed270/FLyrankScraper.git)"
        },
        signal: AbortSignal.timeout(5000)
    });

    if (response.status !== 200) {
        throw new Error(
            `Book page ${index} failed with status ${response.status}`
        );
    }

    const html = await response.text();
    const fetchedAt = new Date().toISOString();

    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, html, "utf8");

    await fs.writeFile(
        metadataFile,
        JSON.stringify({ fetched_at: fetchedAt }, null, 2),
        "utf8"
    );

    return {
        html,
        fetchedAt,
        fromCache: false
    };
}
function extractBookRecord(html, productUrl, sourcePage, fetchedAt) {
    const $ = cheerio.load(html);

    const product = $("article.product_page");

    const title = product.find("div.product_main h1").text().trim() || null;

    const priceText =
        product.find("div.product_main .price_color").first().text().trim() || null;

    const availabilityText =
        product.find("div.product_main .availability").text().trim() || null;

    const ratingText =
        product
            .find("div.product_main p.star-rating")
            .attr("class")
            ?.replace("star-rating", "")
            .trim() || null;

    const description =
        product.find("#product_description").next("p").text().trim() || null;

    return {
        title,
        product_url: productUrl,
        price_text: priceText,
        availability_text: availabilityText,
        rating_text: ratingText,
        description,
        source_page: sourcePage,
        fetched_at: fetchedAt
    };
}
async function extractAllBooks(bookLinks) {
  const records = [];

  for (let index = 0; index < bookLinks.length; index++) {
    const { url, sourcePage } = bookLinks[index];

    const { html, fetchedAt } = await getBookHtml(url, index + 1);

    const record = extractBookRecord(
      html,
      url,
      sourcePage,
      fetchedAt
    );

    records.push(record);
  }

  return records;
}
async function main() {
  const { cataloguePages, bookLinks } = await crawlCatalogue();

  console.log(`catalogue_pages=${cataloguePages.length}`);
  console.log(`book_links=${bookLinks.length}`);

  const records = await extractAllBooks(bookLinks);

  console.log(`detail_pages=${records.length}`);
  console.log(JSON.stringify(records[0], null, 2));
}

main().catch((error) => {
  console.error(`ERROR - ${error.message}`);
  process.exitCode = 1;
});