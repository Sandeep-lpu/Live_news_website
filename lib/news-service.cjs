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

const allowedCategories = new Set([
  "business",
  "entertainment",
  "general",
  "health",
  "science",
  "sports",
  "technology",
]);

const cache = new Map();

function getConfig(env = process.env) {
  return {
    newsApiKey: env.NEWS_API_KEY || "",
    newsCountry: (env.NEWS_COUNTRY || "in").toLowerCase(),
    newsFallbackCountry: (env.NEWS_FALLBACK_COUNTRY || "us").toLowerCase(),
    cacheTtlMs: Number(env.CACHE_TTL_MS || 5 * 60 * 1000),
  };
}

async function getNewsFeed({ category = "", query = "" } = {}, env = process.env) {
  const config = getConfig(env);
  const normalizedCategory = normalizeCategory(category);
  const normalizedQuery = String(query || "").trim();
  const cacheKey = [
    config.newsCountry,
    config.newsFallbackCountry,
    normalizedCategory || "all",
    normalizedQuery.toLowerCase(),
  ].join("|");
  const cachedEntry = cache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.timestamp < config.cacheTtlMs) {
    return cachedEntry.payload;
  }

  let payload;

  try {
    payload = config.newsApiKey
      ? await fetchLiveNews({
          category: normalizedCategory,
          query: normalizedQuery,
          config,
        })
      : buildFallbackPayload(
          normalizedCategory,
          normalizedQuery,
          "Live API key missing. Showing fallback feed.",
          config.newsCountry,
        );
  } catch {
    payload = buildFallbackPayload(
      normalizedCategory,
      normalizedQuery,
      "Live provider unavailable. Showing fallback feed.",
      config.newsCountry,
    );
  }

  cache.set(cacheKey, {
    timestamp: Date.now(),
    payload,
  });

  return payload;
}

async function fetchLiveNews({ category, query, config }) {
  const primaryResult = await requestTopHeadlines({
    country: config.newsCountry,
    category,
    query,
    apiKey: config.newsApiKey,
  });

  if (!primaryResult.ok) {
    return buildFallbackPayload(
      category,
      query,
      primaryResult.message || "Live provider unavailable. Showing fallback feed.",
      config.newsCountry,
    );
  }

  let liveCountry = config.newsCountry;
  let articles = primaryResult.articles;

  if (
    !articles.length &&
    config.newsFallbackCountry &&
    config.newsFallbackCountry !== config.newsCountry
  ) {
    const fallbackCountryResult = await requestTopHeadlines({
      country: config.newsFallbackCountry,
      category,
      query,
      apiKey: config.newsApiKey,
    });

    if (fallbackCountryResult.ok && fallbackCountryResult.articles.length) {
      articles = fallbackCountryResult.articles;
      liveCountry = config.newsFallbackCountry;
    }
  }

  if (!articles.length) {
    return buildFallbackPayload(
      category,
      query,
      "Live provider returned no stories for this view. Showing fallback feed.",
      config.newsCountry,
    );
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
        liveCountry === config.newsCountry
          ? `Live provider connected. ${articles.length} stories loaded from NewsAPI.`
          : `Primary country returned no stories, so live headlines are being served from ${liveCountry.toUpperCase()}.`,
    },
    articles,
  };
}

async function requestTopHeadlines({ country, category, query, apiKey }) {
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
      "X-Api-Key": apiKey,
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

function buildFallbackPayload(category, query, message, country) {
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
      country,
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

module.exports = {
  getNewsFeed,
};
