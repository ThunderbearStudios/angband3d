import { FONTS_BASE64 } from "./fonts-data.js";

const ORIGIN = "https://angband3d-cloud-564958309282.us-central1.run.app";

const CLEAN_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' blob: data: ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

const PERMISSIONS_POLICY =
  "attribution-reporting=(), browsing-topics=(), camera=(), geolocation=(), interest-cohort=(), join-ad-interest-group=(), microphone=(self), payment=(), private-aggregation=(), private-state-token-issuance=(), private-state-token-redemption=(), run-ad-auction=()";

const SELF_HOSTED_FONT_STYLE = `<link rel="preload" href="/assets/fonts/cinzel-latin.woff2" as="font" type="font/woff2" crossorigin>
    <style id="tb-self-hosted-fonts">
      @font-face { font-family: 'Cinzel'; font-style: normal; font-weight: 500 900; font-display: swap; src: url('/assets/fonts/cinzel-latin.woff2') format('woff2'); }
      @font-face { font-family: 'Fira Code'; font-style: normal; font-weight: 400 700; font-display: swap; src: url('/assets/fonts/fira-code-latin.woff2') format('woff2'); }
      @font-face { font-family: 'Outfit'; font-style: normal; font-weight: 400 700; font-display: swap; src: url('/assets/fonts/outfit-latin.woff2') format('woff2'); }
    </style>`;

function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === "www.yasd3d.com") {
      url.hostname = "yasd3d.com";
      return Response.redirect(url.toString(), 301);
    }
    if (url.hostname === "www.angband3d.com") {
      url.hostname = "angband3d.com";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/.well-known/gpc.json") {
      return new Response(JSON.stringify({ gpc: true, lastUpdate: "2026-11-07" }, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400, no-transform",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff",
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        },
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && FONTS_BASE64[url.pathname]) {
      const buf = request.method === "HEAD" ? null : decodeBase64(FONTS_BASE64[url.pathname]);
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": "font/woff2",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Cross-Origin-Resource-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        },
      });
    }

    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade === "websocket" || url.pathname === "/ws") {
      const wsUrl = new URL(url.pathname + url.search, ORIGIN);
      const wsReq = new Request(wsUrl.toString(), request);
      wsReq.headers.set("Host", "angband3d-cloud-564958309282.us-central1.run.app");
      wsReq.headers.set("X-Forwarded-Host", url.hostname);
      wsReq.headers.set("X-Forwarded-Proto", "https");
      return fetch(wsReq);
    }

    const targetUrl = new URL(url.pathname + url.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("X-Forwarded-Host", url.hostname);
    headers.set("X-Forwarded-Proto", "https");

    const upstreamResp = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });

    const outHeaders = new Headers(upstreamResp.headers);
    if (!url.pathname.startsWith("/api/")) {
      outHeaders.delete("Set-Cookie");
    }
    outHeaders.delete("Link");
    outHeaders.set("Content-Security-Policy", CLEAN_CSP);
    outHeaders.set("Permissions-Policy", PERMISSIONS_POLICY);
    outHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    outHeaders.set("X-Content-Type-Options", "nosniff");
    outHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
    outHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

    const ct = (outHeaders.get("Content-Type") || "").toLowerCase();
    if (ct.includes("text/html") && request.method === "GET") {
      outHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0, no-transform");
      outHeaders.delete("Content-Length");
      let html = await upstreamResp.text();
      if (html.includes("fonts.googleapis.com")) {
        html = html
          .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>\s*/gi, "")
          .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>\s*/gi, SELF_HOSTED_FONT_STYLE + "\n    ");
      }
      return new Response(html, {
        status: upstreamResp.status,
        headers: outHeaders,
      });
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: outHeaders,
    });
  },
};
