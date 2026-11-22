const REPO = "hzzdz/3105-patch-generator";
const ROOT = `https://raw.githubusercontent.com/${REPO}/main/`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/patch") return Response.redirect(url.origin + "/patch/", 301);
    if (url.pathname !== "/patch/" && !url.pathname.startsWith("/patch/")) return new Response("Not found", { status: 404 });
    let path = url.pathname.slice("/patch/".length);
    if (!path || path.endsWith("/")) path += "index.html";
    if (path.split("/").some((part) => part === "..")) return new Response("Bad path", { status: 400 });
    const upstream = await fetch(ROOT + path, { headers: { "Accept": request.headers.get("Accept") || "*/*" }, cf: { cacheTtl: 0, cacheEverything: false } });
    if (!upstream.ok) return new Response("Not found", { status: upstream.status });
    const types = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", ico: "image/x-icon" };
    const ext = path.split(".").pop().toLowerCase();
    const headers = new Headers({ "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};

