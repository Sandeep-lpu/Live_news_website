import newsService from "../lib/news-service.cjs";

export default async function handler(request, response) {
  try {
    const baseUrl = `http://${request.headers.host || "localhost"}`;
    const requestUrl = new URL(request.url, baseUrl);
    const payload = await newsService.getNewsFeed({
      category: requestUrl.searchParams.get("category"),
      query: requestUrl.searchParams.get("q"),
    });

    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.status(200).send(payload);
  } catch (error) {
    response.status(500).json({
      error: "Server error",
      detail: error.message,
    });
  }
}
