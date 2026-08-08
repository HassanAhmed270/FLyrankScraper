import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import { bookSchema } from "./schema.js";
import { normalizeBook } from "./normalizer.js";

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
async function fetchBookPage(bookUrl, index) {
    let attempt = 0;

    while (attempt < 2) {
        try {
            const response = await fetch(bookUrl, {
                headers: {
                    "User-Agent": "FlyRankInternshipA9/1.0 (+YOUR-REPO-URL)"
                },
                signal: AbortSignal.timeout(5000)
            });

            if (response.status === 200) {
                return await response.text();
            }

            if (response.status === 403 || response.status === 404) {
                throw new Error(
                    `Book page ${index} failed with status ${response.status}`
                );
            }

            if (response.status >= 500 && response.status <= 599 && attempt === 0) {
                attempt++;
                await wait(1000);
                continue;
            }

            throw new Error(
                `Book page ${index} failed with status ${response.status}`
            );
        } catch (error) {
            if (
                error.name === "TimeoutError" &&
                attempt === 0
            ) {
                attempt++;
                await wait(1000);
                continue;
            }

            throw error;
        }
    }
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

    const html = await fetchBookPage(bookUrl, index);
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
function validateBooks(records, stats) {
    const validRecords = [];
    const errors = [];

    for (const record of records) {
        const normalized = normalizeBook(record);
        const result = bookSchema.safeParse(normalized);

        if (result.success) {
            validRecords.push(result.data);
            stats.valid_records++;
        } else {
            stats.invalid_records++;

            errors.push({
                product_url: record.product_url,
                reason: result.error.issues.map((issue) => issue.message)
            });
        }
    }

    return {
        validRecords,
        errors
    };
}
async function saveOutput(validRecords, errors) {
    const outputDir = path.join(__dirname, "../output");

    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
        path.join(outputDir, "books.json"),
        JSON.stringify(validRecords, null, 2),
        "utf8"
    );

    await fs.writeFile(
        path.join(outputDir, "errors.json"),
        JSON.stringify(errors, null, 2),
        "utf8"
    );
}
async function saveRunReport(stats) {
    const duration = Date.now() - new Date(stats.start_time).getTime();

    const report = {
        start_time: stats.start_time,
        duration_ms: duration,
        pages_fetched: stats.pages_fetched,
        cache_hits: stats.cache_hits,
        valid_records: stats.valid_records,
        invalid_records: stats.invalid_records,
        failed_pages: stats.failed_pages
    };

    const outputDir = path.join(__dirname, "../output");

    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
        path.join(outputDir, "run-report.json"),
        JSON.stringify(report, null, 2),
        "utf8"
    );
}
async function extractAllBooks(bookLinks, stats) {
    const records = [];

    for (let index = 0; index < bookLinks.length; index++) {
        const { url, sourcePage } = bookLinks[index];

        try {
            const { html, fetchedAt, fromCache } = await getBookHtml(
                url,
                index + 1
            );

            if (fromCache) {
                stats.cache_hits++;
            } else {
                stats.pages_fetched++;
            }

            const record = extractBookRecord(
                html,
                url,
                sourcePage,
                fetchedAt
            );

            records.push(record);
        } catch (error) {
            stats.failed_pages++;

            console.error(
                `FAILED ${url} - ${error.message}`
            );
        }
    }

    return records;
}
function createRunStats() {
    return {
        start_time: new Date().toISOString(),
        pages_fetched: 0,
        cache_hits: 0,
        valid_records: 0,
        invalid_records: 0,
        failed_pages: 0
    };
}
async function main() {
    const stats = createRunStats();
    const { cataloguePages, bookLinks } = await crawlCatalogue();
    bookLinks.push({
        url: "https://books.toscrape.com/this-book-does-not-exist/",
        sourcePage: cataloguePages[0]
    });

    console.log(`catalogue_pages=${cataloguePages.length}`);
    console.log(`book_links=${bookLinks.length}`);

    const records = await extractAllBooks(bookLinks, stats);

    console.log(`detail_pages=${records.length}`);

    const { validRecords, errors } = validateBooks(records, stats);

    await saveOutput(validRecords, errors);
    await saveRunReport(stats);

    console.log(`valid_records=${validRecords.length}`);
    console.log(`errors=${errors.length}`);
}

main().catch((error) => {
    console.error(`ERROR - ${error.message}`);
    process.exitCode = 1;
});