const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { getNewsFeed } = require("./lib/news-service.cjs");

const ROOT_DIR = __dirname;

loadEnvFile(".env");
const PORT = Number(process.env.PORT || 3000);

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (requestUrl.pathname === "/api/news") {
      const payload = await getNewsFeed({
        category: requestUrl.searchParams.get("category"),
        query: requestUrl.searchParams.get("q"),
      });
      respondJson(response, 200, payload);
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
