import { FONTS_BASE64 } from "./fonts-data.js";

const DEFAULT_FALLBACK_ORIGIN = "https://angband3d-cloud-564958309282.us-central1.run.app";

const MIME_MAP = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ktx2": "image/ktx2",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".js": "application/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function resolveOrigins(env) {
  const fallbackOrigin = (env && env.FALLBACK_ORIGIN) || DEFAULT_FALLBACK_ORIGIN;
  const primaryOrigin = (env && env.PRIMARY_ORIGIN) || fallbackOrigin;
  const originMode = String((env && env.ORIGIN_MODE) || "cloudrun").toLowerCase().trim();
  const activeOrigin = originMode === "ovh" ? primaryOrigin : fallbackOrigin;
  const canFailover = originMode === "ovh" && primaryOrigin !== fallbackOrigin;
  return { originMode, primaryOrigin, fallbackOrigin, activeOrigin, canFailover };
}

function isOriginFailoverStatus(status) {
  return status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 526);
}

function guessContentType(pathname) {
  const lower = pathname.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 && MIME_MAP[lower.slice(dot)] ? MIME_MAP[lower.slice(dot)] : "application/octet-stream";
}

function parseByteRange(rangeHeader, size) {
  const m = rangeHeader && size > 0 ? String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/i) : null;
  if (!m) return null;
  let start = m[1] ? parseInt(m[1], 10) : NaN;
  let end = m[2] ? parseInt(m[2], 10) : NaN;
  if (Number.isNaN(start) && !Number.isNaN(end)) { start = Math.max(0, size - end); end = size - 1; }
  else if (!Number.isNaN(start) && Number.isNaN(end)) { end = size - 1; }
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end, length: end - start + 1 };
}

async function tryServeFromR2(request, url, env) {
  if (!env || !env.ASSETS_R2) return null;
  const prefix = String(env.R2_ASSET_PREFIX || "").replace(/^\/+|\/+$/g, "");
  const cleanPath = url.pathname.replace(/^\/+/, "");
  const r2Key = prefix ? `${prefix}/${cleanPath}` : cleanPath;
  const headObj = await env.ASSETS_R2.head(r2Key);
  if (!headObj) return null;
  const etag = headObj.httpEtag || (headObj.etag ? `"${headObj.etag}"` : undefined);
  const headers = new Headers();
  headers.set("Content-Type", (headObj.httpMetadata && headObj.httpMetadata.contentType) || guessContentType(url.pathname));
  if (etag) headers.set("ETag", etag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  headers.set("X-YASD-Asset-Source", "r2");
  if (url.pathname.startsWith("/wasm/") || /\.(wasm|js|data|pck)$/i.test(url.pathname)) {
    headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
  }
  headers.set("Cache-Control", /\.(mp3|wav|ogg)$/i.test(url.pathname) ? "public, max-age=604800, no-transform" : "public, max-age=31536000, immutable");
  if (etag && request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") { headers.set("Content-Length", String(headObj.size)); return new Response(null, { status: 200, headers }); }
  const rangeHdr = request.headers.get("Range");
  if (rangeHdr) {
    const parsed = parseByteRange(rangeHdr, headObj.size);
    if (!parsed) { headers.set("Content-Range", `bytes */${headObj.size}`); return new Response(null, { status: 416, headers }); }
    const obj = await env.ASSETS_R2.get(r2Key, { range: { offset: parsed.start, length: parsed.length } });
    if (!obj) return null;
    headers.set("Content-Range", `bytes ${parsed.start}-${parsed.end}/${headObj.size}`);
    headers.set("Content-Length", String(parsed.length));
    return new Response(obj.body, { status: 206, headers });
  }
  const obj = await env.ASSETS_R2.get(r2Key);
  if (!obj) return null;
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

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
    if ((request.method === "GET" || request.method === "HEAD") && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/wasm/"))) {
      const r2Resp = await tryServeFromR2(request, url, env);
      if (r2Resp) return r2Resp;
    }

    const originInfo = resolveOrigins(env);
    const buildOriginReq = (originBase, initOpts) => {
      const targetUrl = new URL(url.pathname + url.search, originBase);
      const h = new Headers(request.headers);
      h.set("Host", targetUrl.host);
      h.set("X-Forwarded-Host", url.hostname);
      h.set("X-Forwarded-Proto", "https");
      if (edgeSecret) h.set("X-Edge-Proxy-Secret", edgeSecret);
      return { targetUrl, h, opts: initOpts(h) };
    };

    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade === "websocket" || url.pathname === "/ws") {
      try {
        const pReq = buildOriginReq(originInfo.activeOrigin, (h) => h);
        const wsResp = await fetch(new Request(pReq.targetUrl.toString(), request), { headers: pReq.h });
        if (originInfo.canFailover && isOriginFailoverStatus(wsResp.status)) {
          const fReq = buildOriginReq(originInfo.fallbackOrigin, (h) => h);
          return fetch(new Request(fReq.targetUrl.toString(), request), { headers: fReq.h });
        }
        return wsResp;
      } catch (err) {
        if (originInfo.canFailover) {
          const fReq = buildOriginReq(originInfo.fallbackOrigin, (h) => h);
          return fetch(new Request(fReq.targetUrl.toString(), request), { headers: fReq.h });
        }
        throw err;
      }
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
    const isCacheableHelpReq = (request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/help";
    const hasCustomAiKey = Boolean(request.headers.get("X-Goog-Api-Key") || request.headers.get("X-Api-Key"));
    const isCacheableTtsReq = (request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/tts" && !hasCustomAiKey;

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
          "X-Edge-Cache": "HIT-ISOLATE",
          "X-YASD-Origin": originInfo.originMode === "ovh" ? "primary-ovh" : "cloudrun",
          "Content-Security-Policy": CLEAN_CSP,
          "Permissions-Policy": PERMISSIONS_POLICY,
          "Cross-Origin-Opener-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        },
      });
    }

    const isWasmOrAssets = url.pathname.startsWith("/wasm/") || url.pathname.startsWith("/assets/");
    const isCacheableStatic =
      (request.method === "GET" || request.method === "HEAD") &&
      (isWasmOrAssets ||
        url.pathname === "/manifest.json" ||
        url.pathname === "/robots.txt" ||
        url.pathname === "/favicon.ico" ||
        url.pathname.startsWith("/js/vendor/") ||
        ((url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/") || url.pathname.startsWith("/dist/")) && url.search.includes("v=")));

    const canReadRetry = request.method === "GET" || request.method === "HEAD";
    const makeFetchOpts = (headers) => {
      const fetchOpts = {
        method: request.method,
        headers,
        body: !canReadRetry ? request.body : undefined,
        redirect: "manual",
      };
      if (isCacheableStatic) {
        const ttl = url.searchParams.has("v") ? 31536000 : (isWasmOrAssets ? 604800 : 86400);
        fetchOpts.cf = { cacheEverything: true, cacheTtlByStatus: { "200-299": ttl, "404": 30, "500-599": 0 } };
      } else if (isCacheableRealmsReq) {
        fetchOpts.method = "GET";
        fetchOpts.cf = { cacheEverything: true, cacheTtlByStatus: { "200-299": 300, "404": 30, "500-599": 0 } };
      } else if (isCacheableHelpReq) {
        fetchOpts.cf = { cacheEverything: true, cacheTtlByStatus: { "200-299": 3600, "404": 30, "500-599": 0 } };
      } else if (isCacheableTtsReq) {
        fetchOpts.cf = { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "404": 0, "500-599": 0 } };
      } else if (isAnonymousRootReq) {
        fetchOpts.method = "GET";
        fetchOpts.cf = { cacheEverything: true, cacheTtlByStatus: { "200-299": 30, "404": 10, "500-599": 0 } };
      }
      return fetchOpts;
    };

    let upstreamResp;
    let originTag = originInfo.originMode === "ovh" ? "primary-ovh" : "cloudrun";
    const primaryAttempt = buildOriginReq(originInfo.activeOrigin, makeFetchOpts);
    try {
      upstreamResp = await fetch(primaryAttempt.targetUrl.toString(), primaryAttempt.opts);
      if (canReadRetry && originInfo.canFailover && isOriginFailoverStatus(upstreamResp.status)) {
        const fbAttempt = buildOriginReq(originInfo.fallbackOrigin, makeFetchOpts);
        upstreamResp = await fetch(fbAttempt.targetUrl.toString(), fbAttempt.opts);
        originTag = "fallback-cloudrun";
      }
    } catch (err) {
      if (canReadRetry && originInfo.canFailover) {
        const fbAttempt = buildOriginReq(originInfo.fallbackOrigin, makeFetchOpts);
        upstreamResp = await fetch(fbAttempt.targetUrl.toString(), fbAttempt.opts);
        originTag = "fallback-cloudrun";
      } else {
        throw err;
      }
    }

    const outHeaders = new Headers(upstreamResp.headers);
    const hasSetCookie = preserveAffinitySetCookies(upstreamResp.headers, outHeaders, url.pathname);
    outHeaders.delete("Link");
    outHeaders.set("X-YASD-Origin", originTag);
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
        outHeaders.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
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
