const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "perf-clinic");
const PORT = Number(process.env.PORT) || 5174;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function resolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const file = path.join(ROOT, decoded.endsWith("/") ? `${decoded}index.html` : decoded);
  return file.startsWith(ROOT + path.sep) || file === ROOT ? file : null;
}

http
  .createServer((req, res) => {
    let file;
    try {
      file = resolve(req.url);
    } catch {
      file = null;
    }
    if (!file) {
      res.writeHead(400).end("bad request");
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": stat.size,
      });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, () => console.log(`perf clinic on http://localhost:${PORT}`));
