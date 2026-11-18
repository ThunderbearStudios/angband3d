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

function preserveAffinitySetCookies(upstreamHeaders, outHeaders, pathname) {
  if ((pathname.startsWith("/api/") && pathname !== "/api/realms") || pathname === "/ws") {
    const rawList =
      typeof upstreamHeaders.getSetCookie === "function"
        ? upstreamHeaders.getSetCookie()
        : [upstreamHeaders.get("Set-Cookie")].filter(Boolean);
    if (rawList.some((c) => typeof c === "string" && /\bGAESA=/i.test(c))) {
      return true;
    }
    return Boolean(outHeaders.get("Set-Cookie"));
  }
  outHeaders.delete("Set-Cookie");
  return false;
}

let _anonLandingHtmlCache = { host: "", html: "", status: 200, expiresAt: 0 };
let _realmsJsonCache = { host: "", json: "", status: 200, expiresAt: 0 };

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.hostname === "www.yasd3d.com") {
      url.hostname = "yasd3d.com";
      return Response.redirect(url.toString(), 301);
    }
    if (url.hostname === "www.angband3d.com") {
      url.hostname = "angband3d.com";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/demo" || url.pathname === "/demo/" || url.pathname === "/demo.html" || url.pathname === "/watch" || url.pathname === "/showcase") {
      const dest = new URL("/?demo=1", url.origin);
      return Response.redirect(dest.toString(), 302);
    }

    if (url.pathname === "/.well-known/gpc.json") {
      return new Response(JSON.stringify({ gpc: true, lastUpdate: "2026-11-10" }, null, 2), {
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

    const edgeSecret = env && env.EDGE_PROXY_SECRET ? String(env.EDGE_PROXY_SECRET) : "";
    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade === "websocket" || url.pathname === "/ws") {
      const wsUrl = new URL(url.pathname + url.search, ORIGIN);
      const wsReq = new Request(wsUrl.toString(), request);
      wsReq.headers.set("Host", "angband3d-cloud-564958309282.us-central1.run.app");
      wsReq.headers.set("X-Forwarded-Host", url.hostname);
      wsReq.headers.set("X-Forwarded-Proto", "https");
      if (edgeSecret) wsReq.headers.set("X-Edge-Proxy-Secret", edgeSecret);
      return fetch(wsReq);
    }

    const reqCookie = request.headers.get("Cookie") || "";
    const hasAuthHeaders = Boolean(
      request.headers.get("Authorization") ||
        request.headers.get("X-Owner-Token") ||
        request.headers.get("X-Save-Owner-Token") ||
        request.headers.get("X-Vault-Id")
    );
    const isRootHtmlPath = url.pathname === "/" || url.pathname === "/index.html";
    const isAnonymousRootReq = (request.method === "GET" || request.method === "HEAD") && isRootHtmlPath && !hasAuthHeaders;
    const isCacheableRealmsReq =
      (request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/realms" && !request.headers.get("Origin");

    if (
      isAnonymousRootReq &&
      _anonLandingHtmlCache.html &&
      _anonLandingHtmlCache.host === url.hostname &&
      Date.now() < _anonLandingHtmlCache.expiresAt
    ) {
      return new Response(request.method === "HEAD" ? null : _anonLandingHtmlCache.html, {
        status: _anonLandingHtmlCache.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60, no-transform",
          "X-Edge-Cache": "HIT-ISOLATE",
          "Content-Security-Policy": CLEAN_CSP,
          "Permissions-Policy": PERMISSIONS_POLICY,
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "credentialless",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        },
      });
    }

    if (
      isCacheableRealmsReq &&
      _realmsJsonCache.json &&
      _realmsJsonCache.host === url.hostname &&
      Date.now() < _realmsJsonCache.expiresAt
    ) {
      return new Response(request.method === "HEAD" ? null : _realmsJsonCache.json, {
        status: _realmsJsonCache.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
          "Vary": "Origin",
          "Content-Security-Policy": CLEAN_CSP,
          "Permissions-Policy": PERMISSIONS_POLICY,
          "Cross-Origin-Opener-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        },
      });
    }

    const targetUrl = new URL(url.pathname + url.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("X-Forwarded-Host", url.hostname);
    headers.set("X-Forwarded-Proto", "https");
    if (edgeSecret) headers.set("X-Edge-Proxy-Secret", edgeSecret);

    const isWasmOrAssets = url.pathname.startsWith("/wasm/") || url.pathname.startsWith("/assets/");
    const isCacheableStatic =
      (request.method === "GET" || request.method === "HEAD") &&
      (isWasmOrAssets ||
        url.pathname === "/manifest.json" ||
        url.pathname === "/robots.txt" ||
        url.pathname === "/favicon.ico" ||
        url.pathname.startsWith("/js/vendor/") ||
        ((url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/")) && url.search.includes("v=")));

    const fetchOpts = {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    };
    if (isCacheableStatic) {
      const ttl = url.searchParams.has("v") ? 31536000 : 86400;
      fetchOpts.cf = {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": ttl, "404": 30, "500-599": 0 },
      };
    } else if (isCacheableRealmsReq) {
      fetchOpts.method = "GET";
      fetchOpts.cf = {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 300, "404": 30, "500-599": 0 },
      };
    } else if (isAnonymousRootReq) {
      fetchOpts.method = "GET";
      fetchOpts.cf = {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 30, "404": 10, "500-599": 0 },
      };
    }

    const upstreamResp = await fetch(targetUrl.toString(), fetchOpts);

    const outHeaders = new Headers(upstreamResp.headers);
    const hasSetCookie = preserveAffinitySetCookies(upstreamResp.headers, outHeaders, url.pathname);
    outHeaders.delete("Link");
    outHeaders.set("Content-Security-Policy", CLEAN_CSP);
    outHeaders.set("Permissions-Policy", PERMISSIONS_POLICY);
    outHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/wasm/") || /\.(js|wasm|pck|data)$/i.test(url.pathname)) {
      outHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
    }
    if (isCacheableStatic && upstreamResp.status >= 200 && upstreamResp.status < 300) {
      if (/\.(mp3|wav|ogg)$/i.test(url.pathname)) {
        outHeaders.set("Cache-Control", "public, max-age=604800, no-transform");
      } else if (url.searchParams.has("v")) {
        outHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
      } else if (isWasmOrAssets) {
        outHeaders.set("Cache-Control", "public, max-age=86400");
      } else {
        outHeaders.set("Cache-Control", "public, max-age=3600");
      }
    }
    outHeaders.set("X-Content-Type-Options", "nosniff");
    outHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
    outHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

    if (isCacheableRealmsReq && upstreamResp.status === 200) {
      const realmsJson = await upstreamResp.text();
      _realmsJsonCache = {
        host: url.hostname,
        json: realmsJson,
        status: 200,
        expiresAt: Date.now() + 300_000,
      };
      outHeaders.set("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
      outHeaders.set("Vary", "Origin");
      outHeaders.delete("Content-Length");
      return new Response(request.method === "HEAD" ? null : realmsJson, {
        status: 200,
        headers: outHeaders,
      });
    }

    const ct = (outHeaders.get("Content-Type") || "").toLowerCase();
    if (ct.includes("text/html") && (request.method === "GET" || request.method === "HEAD")) {
      if (isAnonymousRootReq && !hasSetCookie) {
        outHeaders.set("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60, no-transform");
      } else {
        outHeaders.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0, no-transform");
      }
      outHeaders.delete("Content-Length");
      let html = await upstreamResp.text();
      if (html.includes("fonts.googleapis.com")) {
        html = html
          .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>\s*/gi, "")
          .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>\s*/gi, SELF_HOSTED_FONT_STYLE + "\n    ");
      }
      if (isAnonymousRootReq && upstreamResp.status === 200) {
        _anonLandingHtmlCache = {
          host: url.hostname,
          html,
          status: 200,
          expiresAt: Date.now() + 30_000,
        };
      }
      return new Response(request.method === "HEAD" ? null : html, {
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
