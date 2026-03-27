const categoryOptions = [
  { label: "All", value: "all" },
  { label: "Business", value: "business" },
  { label: "Health", value: "health" },
  { label: "Science", value: "science" },
  { label: "Sports", value: "sports" },
  { label: "Technology", value: "technology" },
];

const state = {
  articles: [],
  activeCategory: "all",
  activeQuery: "",
  provider: "NewsAPI",
  liveMode: "LIVE",
  lastRefresh: null,
  country: "IN",
};

const newsGrid = document.querySelector("#live-feed");
const featuredStory = document.querySelector("#featured-story");
const filtersRoot = document.querySelector("#category-filters");
const template = document.querySelector("#news-card-template");
const emptyState = document.querySelector("#empty-state");
const feedHeading = document.querySelector("#feed-heading");
const providerNote = document.querySelector("#provider-note");
const feedStatus = document.querySelector("#feed-status");
const refreshButton = document.querySelector("#refresh-button");
const clearSearchButton = document.querySelector("#clear-search");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");

const storyCount = document.querySelector("#story-count");
const trustedCount = document.querySelector("#trusted-count");
const liveMode = document.querySelector("#live-mode");
const activeCountry = document.querySelector("#active-country");
const lastRefresh = document.querySelector("#last-refresh");

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatRelativeTime(timestamp) {
  const diffMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 60000),
  );

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day ago`;
}

function setStatus(mode, text) {
  feedStatus.className = `status-pill ${mode}`;
  feedStatus.innerHTML = `
    <span class="status-dot"></span>
    <span>${text}</span>
  `;
}

function setLoadingState() {
  providerNote.textContent = "Provider status: loading fresh stories.";
  featuredStory.className = "breaking-card";
  featuredStory.style.backgroundImage = "";
  featuredStory.innerHTML = `
    <p class="section-kicker">Breaking now</p>
    <h3>Refreshing the headline desk...</h3>
    <p class="story-summary">Pulling fresh stories from the configured feed.</p>
  `;
  newsGrid.innerHTML = "";
  emptyState.hidden = true;
}

function updateMetrics() {
  storyCount.textContent = String(state.articles.length);
  trustedCount.textContent = String(
    state.articles.filter((article) => article.verificationTone === "trusted").length,
  );
  liveMode.textContent = state.liveMode;
  activeCountry.textContent = state.country.toUpperCase();
  lastRefresh.textContent = state.lastRefresh
    ? formatDateTime(state.lastRefresh)
    : "Waiting for first sync";
}

function renderFilters() {
  filtersRoot.innerHTML = "";

  categoryOptions.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${option.value === state.activeCategory ? " active" : ""}`;
    button.textContent = option.label;
    button.addEventListener("click", () => {
      if (state.activeCategory === option.value) {
        return;
      }

      state.activeCategory = option.value;
      renderFilters();
      fetchNews();
    });
    filtersRoot.appendChild(button);
  });
}

function renderFeaturedStory(article) {
  if (!article) {
    featuredStory.className = "breaking-card";
    featuredStory.style.backgroundImage = "";
    featuredStory.innerHTML = `
      <p class="section-kicker">Breaking now</p>
      <h3>No headline available</h3>
      <p class="story-summary">Try refreshing the feed or clearing your search.</p>
    `;
    return;
  }

  featuredStory.className = article.image ? "breaking-card has-image" : "breaking-card";
  featuredStory.style.backgroundImage = article.image ? `url("${article.image}")` : "";
  featuredStory.innerHTML = `
    <p class="section-kicker">Breaking now</p>
    <h3>${article.title}</h3>
    <p class="story-summary">${article.summary}</p>
    <div class="news-meta">
      <span>${article.source}</span>
      <span>${formatRelativeTime(article.publishedAt)}</span>
    </div>
  `;
}

function renderCards() {
  newsGrid.innerHTML = "";

  if (!state.articles.length) {
    emptyState.hidden = false;
    renderFeaturedStory(null);
    return;
  }

  emptyState.hidden = true;

  state.articles.forEach((article) => {
    const clone = template.content.cloneNode(true);
    const visual = clone.querySelector(".news-visual");
    const verificationTag = clone.querySelector(".verification-tag");
    const link = clone.querySelector(".read-link");

    if (article.image) {
      visual.style.backgroundImage = `url("${article.image}")`;
    }

    clone.querySelector(".category-tag").textContent = article.categoryLabel;
    verificationTag.textContent = article.verificationLabel;
    verificationTag.classList.add(article.verificationTone);
    clone.querySelector(".news-title").textContent = article.title;
    clone.querySelector(".news-summary").textContent = article.summary;
    clone.querySelector(".news-source").textContent = article.source;
    clone.querySelector(".news-time").textContent = formatRelativeTime(article.publishedAt);
    link.href = article.url;

    newsGrid.appendChild(clone);
  });

  renderFeaturedStory(state.articles[0]);
}

function updateFeedHeading() {
  if (state.activeQuery) {
    feedHeading.textContent = `Results for "${state.activeQuery}"`;
    clearSearchButton.hidden = false;
    return;
  }

  const activeFilter = categoryOptions.find((option) => option.value === state.activeCategory);
  feedHeading.textContent =
    state.activeCategory === "all"
      ? "Today's top headlines"
      : `${activeFilter.label} headlines`;
  clearSearchButton.hidden = true;
}

async function fetchNews() {
  setLoadingState();
  updateFeedHeading();

  const params = new URLSearchParams();

  if (state.activeCategory !== "all") {
    params.set("category", state.activeCategory);
  }

  if (state.activeQuery) {
    params.set("q", state.activeQuery);
  }

  try {
    const response = await fetch(`/api/news?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load the news feed.");
    }

    state.articles = payload.articles;
    state.provider = payload.meta.provider;
    state.liveMode = payload.meta.liveMode;
    state.lastRefresh = payload.meta.fetchedAt;
    state.country = payload.meta.country;

    updateMetrics();
    renderCards();
    providerNote.textContent = payload.meta.message;

    if (payload.meta.liveMode === "LIVE") {
      setStatus("live", `Live provider: ${payload.meta.provider}`);
    } else {
      setStatus("fallback", payload.meta.message);
    }
  } catch (error) {
    state.articles = [];
    updateMetrics();
    renderCards();
    providerNote.textContent = error.message;
    setStatus("error", "Feed unavailable");
  }
}

function wireEvents() {
  refreshButton.addEventListener("click", () => {
    fetchNews();
  });

  clearSearchButton.addEventListener("click", () => {
    state.activeQuery = "";
    searchInput.value = "";
    updateFeedHeading();
    fetchNews();
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.activeQuery = searchInput.value.trim();
    updateFeedHeading();
    fetchNews();
  });
}

function init() {
  renderFilters();
  wireEvents();
  fetchNews();
  window.setInterval(fetchNews, 300000);
}

init();
