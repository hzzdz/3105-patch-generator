// Server tĩnh tối giản để chạy thử: node serve.js  →  http://localhost:5173
const http = require("http"), fs = require("fs"), path = require("path");
const root = __dirname, port = process.env.PORT || 5173;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
        res.end(data);
    });
}).listen(port, () => console.log(`3105 Patch Generator: http://localhost:${port}`));
