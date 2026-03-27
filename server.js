const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = __dirname;

loadEnvFile(".env");
const PORT = Number(process.env.PORT || 3000);
const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
const NEWS_COUNTRY = (process.env.NEWS_COUNTRY || "in").toLowerCase();
const NEWS_FALLBACK_COUNTRY = (process.env.NEWS_FALLBACK_COUNTRY || "us").toLowerCase();
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();
const allowedCategories = new Set([
  "business",
  "entertainment",
  "general",
  "health",
  "science",
  "sports",
  "technology",
]);

const trustedDomains = [
  "bbc.com",
  "bbc.co.uk",
  "reuters.com",
  "apnews.com",
  "thehindu.com",
  "indianexpress.com",
  "ndtv.com",
  "npr.org",
  "aljazeera.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "techcrunch.com",
];

const fallbackArticles = [
  {
    title: "City transport adds extra evening service after higher commuter traffic",
    summary:
      "Transit operators announced additional evening coverage after weekday ridership moved above internal planning estimates.",
    source: "PulseWire Local Desk",
    url: "https://example.com/local-transport-update",
    image: "",
    publishedAt: "2026-03-27T08:10:00+05:30",
    category: "general",
    categoryLabel: "General",
    verificationLabel: "Fallback feed",
    verificationTone: "fallback",
  },
  {
    title: "Health teams publish district readiness update ahead of weekly review",
    summary:
      "Administrators highlighted staffing support, vaccine stock visibility, and revised clinic reporting timelines.",
    source: "PulseWire Health Desk",
    url: "https://example.com/health-readiness-update",
    image: "",
    publishedAt: "2026-03-27T09:05:00+05:30",
    category: "health",
    categoryLabel: "Health",
    verificationLabel: "Fallback feed",
    verificationTone: "fallback",
  },
  {
    title: "Startup hiring remains active as product and data roles expand",
    summary:
      "Recruiters say teams are still prioritizing platform engineering, design systems, and operations support.",
    source: "PulseWire Tech Desk",
    url: "https://example.com/tech-hiring-update",
    image: "",
    publishedAt: "2026-03-27T10:20:00+05:30",
    category: "technology",
    categoryLabel: "Technology",
    verificationLabel: "Fallback feed",
    verificationTone: "fallback",
  },
  {
    title: "Markets open mixed while banking and energy names lead early movement",
    summary:
      "Analysts are watching yields and commodity prices after a cautious start across major sectors.",
    source: "PulseWire Business Desk",
    url: "https://example.com/market-open-brief",
    image: "",
    publishedAt: "2026-03-27T11:15:00+05:30",
    category: "business",
    categoryLabel: "Business",
    verificationLabel: "Fallback feed",
    verificationTone: "fallback",
  },
  {
    title: "Science teams review new public climate data released this morning",
    summary:
      "Researchers said the release may help local forecasting groups compare seasonal trends more quickly.",
    source: "PulseWire Science Desk",
    url: "https://example.com/science-climate-data",
    image: "",
    publishedAt: "2026-03-27T11:45:00+05:30",
    category: "science",
    categoryLabel: "Science",
    verificationLabel: "Fallback feed",
    verificationTone: "fallback",
  },
  {
    title: "League venues complete readiness checks before next round of fixtures",
    summary:
      "Officials reviewed seating flow, broadcast positions, and emergency access during final inspections.",
    source: "PulseWire Sports Desk",
    url: "https://example.com/stadium-readiness-report",
    image: "",
    publishedAt: "2026-03-27T12:00:00+05:30",
    category: "sports",
    categoryLabel: "Sports",
    verificationLabel: "Fallback feed",
    verificationTone: "fallback",
  },
];

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (requestUrl.pathname === "/api/news") {
      await handleNewsRequest(requestUrl, response);
      return;
    }

    await serveStaticFile(requestUrl.pathname, response);
  } catch (error) {
    respondJson(response, 500, {
      error: "Server error",
      detail: error.message,
    });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the existing server or change PORT in .env.`,
    );
    process.exit(1);
  }

  throw error;
});

server.listen(PORT, () => {
  console.log(`PulseWire running at http://localhost:${PORT}`);
});

async function handleNewsRequest(requestUrl, response) {
  const category = normalizeCategory(requestUrl.searchParams.get("category"));
  const query = (requestUrl.searchParams.get("q") || "").trim();
  const cacheKey = `${NEWS_COUNTRY}|${category || "all"}|${query.toLowerCase()}`;
  const cachedEntry = cache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
    respondJson(response, 200, cachedEntry.payload);
    return;
  }

  let payload;

  try {
    payload = NEWS_API_KEY
      ? await fetchLiveNews({ category, query })
      : buildFallbackPayload(category, query, "Live API key missing. Showing fallback feed.");
  } catch {
    payload = buildFallbackPayload(
      category,
      query,
      "Live provider unavailable. Showing fallback feed.",
    );
  }

  cache.set(cacheKey, {
    timestamp: Date.now(),
    payload,
  });

  respondJson(response, 200, payload);
}

async function fetchLiveNews({ category, query }) {
  const primaryResult = await requestTopHeadlines({
    country: NEWS_COUNTRY,
    category,
    query,
  });

  if (!primaryResult.ok) {
    return buildFallbackPayload(
      category,
      query,
      primaryResult.message || "Live provider unavailable. Showing fallback feed.",
    );
  }

  let liveCountry = NEWS_COUNTRY;
  let articles = primaryResult.articles;

  if (!articles.length && NEWS_FALLBACK_COUNTRY && NEWS_FALLBACK_COUNTRY !== NEWS_COUNTRY) {
    const fallbackCountryResult = await requestTopHeadlines({
      country: NEWS_FALLBACK_COUNTRY,
      category,
      query,
    });

    if (fallbackCountryResult.ok && fallbackCountryResult.articles.length) {
      articles = fallbackCountryResult.articles;
      liveCountry = NEWS_FALLBACK_COUNTRY;
    }
  }

  if (!articles.length) {
    return buildFallbackPayload(category, query, "Live provider returned no stories for this view. Showing fallback feed.");
  }

  return {
    meta: {
      provider: "NewsAPI",
      country: liveCountry,
      category: category || "all",
      query,
      fetchedAt: new Date().toISOString(),
      liveMode: "LIVE",
      message:
        liveCountry === NEWS_COUNTRY
          ? `Live provider connected. ${articles.length} stories loaded from NewsAPI.`
          : `Primary country returned no stories, so live headlines are being served from ${liveCountry.toUpperCase()}.`,
    },
    articles,
  };
}

async function requestTopHeadlines({ country, category, query }) {
  const url = new URL("https://newsapi.org/v2/top-headlines");
  url.searchParams.set("country", country);
  url.searchParams.set("pageSize", "12");

  if (category) {
    url.searchParams.set("category", category);
  }

  if (query) {
    url.searchParams.set("q", query);
  }

  const apiResponse = await fetch(url, {
    headers: {
      "X-Api-Key": NEWS_API_KEY,
    },
  });

  const rawPayload = await apiResponse.json();

  if (!apiResponse.ok || rawPayload.status !== "ok") {
    return {
      ok: false,
      message: rawPayload.message || "Live provider unavailable.",
      articles: [],
    };
  }

  return {
    ok: true,
    message: "",
    articles: (rawPayload.articles || [])
      .map((article) => normalizeArticle(article, category))
      .filter(Boolean),
  };
}

function buildFallbackPayload(category, query, message) {
  const filteredArticles = fallbackArticles.filter((article) => {
    const matchesCategory = !category || article.category === category;
    const matchesQuery =
      !query ||
      article.title.toLowerCase().includes(query.toLowerCase()) ||
      article.summary.toLowerCase().includes(query.toLowerCase());

    return matchesCategory && matchesQuery;
  });

  return {
    meta: {
      provider: "PulseWire demo desk",
      country: NEWS_COUNTRY,
      category: category || "all",
      query,
      fetchedAt: new Date().toISOString(),
      liveMode: "FALLBACK",
      message,
    },
    articles: filteredArticles,
  };
}

function normalizeArticle(article, requestedCategory) {
  if (!article || !article.title || !article.url || !article.source?.name) {
    return null;
  }

  const hostname = getHostname(article.url);
  const isTrusted = trustedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

  return {
    title: article.title,
    summary:
      article.description ||
      "Open the source article for the latest details on this developing story.",
    source: article.source.name,
    url: article.url,
    image: article.urlToImage || "",
    publishedAt: article.publishedAt || new Date().toISOString(),
    category: requestedCategory || "general",
    categoryLabel: toTitleCase(requestedCategory || "general"),
    verificationLabel: isTrusted ? "Trusted source" : "Source linked",
    verificationTone: isTrusted ? "trusted" : "linked",
  };
}

function normalizeCategory(value) {
  if (!value) {
    return "";
  }

  const normalized = value.toLowerCase();
  return allowedCategories.has(normalized) ? normalized : "";
}

async function serveStaticFile(requestPath, response) {
  const safePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const normalizedPath = path.normalize(safePath);
  const filePath = path.join(ROOT_DIR, normalizedPath);

  if (
    normalizedPath.startsWith("..") ||
    path.isAbsolute(normalizedPath) ||
    !filePath.startsWith(ROOT_DIR)
  ) {
    respondText(response, 403, "Forbidden");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  }[extension] || "application/octet-stream";

  try {
    const fileContent = await fs.promises.readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType });
    response.end(fileContent);
  } catch {
    respondText(response, 404, "Not found");
  }
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function respondText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(payload);
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function toTitleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function loadEnvFile(fileName) {
  const envPath = path.join(ROOT_DIR, fileName);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
