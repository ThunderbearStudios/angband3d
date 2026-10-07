---
name: thunderbear-agentic-mastery
description: Operating guidelines, token economics, architectural decoupling, and high-agency engineering protocols for autonomous agents in Antigravity IDE.
---

# Thunderbear Agentic Mastery: Operational Agent Directive

This skill activates the **Thunderbear Studios High-Agency Operating Protocol**. It transforms the agent's behavior from passive assistance into proactive, high-leverage systems architecture.

## When to Activate
Activate this skill whenever:
- Embarking on a new project or major milestone with a high-agency director.
- Resuming work after context compaction or a disconnect.
- Architecting mission-critical, complex, multi-language, or legacy-bridged codebases.
- Designing user experiences intended for public release, enterprise production, or award submissions.

---

## 1. Zero-Turn Orientation Protocol
When booting or resuming:
1. Run `git status -s` to inspect unstaged changes and the active branch.
2. Read the active milestone in `docs/NEXT_STEPS.md` (lines 1–50).
3. Read the operational guidelines in `AGENTS.md`.
4. Run the project smoke test to verify workspace health.
5. **NEVER** run recursive directory scans (`**/*`) or dump entire source files into context.

---

## 2. Token & Attention Economics
- **Bounded Reads**: Read only 20–80 lines around target symbols.
- **Surgical String Replacements**: Always use `replace_file_content` / `multi_replace_file_content` with 3 lines of unique context. Do not rewrite whole files.
- **No Command Polling**: Never execute `sleep` loops or while-wait commands. When a long task runs asynchronously, yield your turn and await reactive wakeup.

---

## 3. The Decoupling & Extension Doctrine
- **The Golden Rule**: Extend authoritative domain logic; never rewrite it.
- **Zero-Allocation Bridge**: Build headless wrappers emitting structured JSON or binary frames over stdio/IPC.
- **Presentation Disposability**: Keep client UI, 3D renderers, and shaders completely decoupled from authoritative state.

---

## 4. Architectural Invariants
- Establish system invariants mathematically and structurally upfront.
- **Audio Mutual Exclusion**: $\text{delay}_i + \text{duration}_i + \text{buffer} \le \text{delay}_{i+1}$.
- **Semantic State**: Never rely on DOM mutations surviving layout loops. Bind UI elements to explicit state booleans.
- **Golden State Vaulting**: Maintain pristine backups of persistent game/data state and restore before automated test runs.
- **Media Streaming & Edge Proxy Invariant (RFC 7233 / 9110)**: Any endpoint serving video/audio requiring timeline seeking/scrubbing MUST use `HTTP 206 Partial Content` with `Accept-Ranges: bytes` and `Content-Range: bytes START-END/TOTAL`.
  - **Dynamic Cache Headers**: It must NEVER be served with `public` caching headers to CDN edge proxies (Cloudflare, Fastly); always emit `Cache-Control: no-cache, no-store, must-revalidate` so proxies mark requests as dynamic, avoiding monolithic 200 chunked responses that destroy browser seekability.
  - **Serverless Buffer Limits (Cloud Run / GFE 32MB Rule)**: Serverless reverse proxies (such as Google Frontend) enforce strict response payload limits (e.g. 32 MB). Origin servers must NEVER satisfy open-ended ranges (`bytes=0-`, `bytes=X-`) by streaming the full remainder of large media files. Always clamp chunk responses to safe slices (e.g. 4 MB: `Math.min(end, start + 4*1024*1024 - 1, total - 1)`).
  - **Service Worker Range Bypass**: Service workers (`sw.js`) intercepting `fetch` events must explicitly bypass requests matching media assets (`/assets/video/`, `.mp4`, `.webm`) or containing a `Range` header, returning early without calling `event.respondWith()` to allow native browser AV decoding pipelines to manage byte range buffering.
  - **Cache Busting / Versioned Asset Aliases**: When fixing media streaming issues behind aggressive edge networks, bump asset URLs in markup (e.g. `_v884.mp4`) and alias them dynamically to canonical files on disk to prevent stale edge cache collisions.
- **True Fullscreen Video, Floating HUD & DOM Target Hierarchy Invariant**:
  - **DOM Target Hierarchy Separation**: Never conflate a modal wrapper (`#demo-modal`) with the component stage (`.demo-theater-container`). When sharing a single component controller across both a modal overlay (`index.html`) and a standalone page (`demo.html`), falling back to `this.modalEl = document.querySelector('.demo-theater-container')` creates the **Self-Querying `Element.querySelector()` Trap**: `this.modalEl.querySelector('.demo-theater-container')` returns `null` because `querySelector()` exclusively inspects descendant nodes (never the element itself). Always maintain separate references (`this.modalEl`, `this.theaterContainerEl`, `this.videoWrapperEl`) and use a resilient multi-tier `getContainer()` resolver.
  - **Viewport Expansion & Floating HUD**: In `:fullscreen` / `:-webkit-full-screen` / `.is-fullscreen`, containers and video elements must expand to `100vw !important` and `100vh !important` (`object-fit: contain; width: 100%; height: 100%`) without desktop container width caps (e.g. 1040px). Controls must float as bottom HUD overlays with dark glassmorphism and ambient blur. Implement 2.5s idle auto-hide (`.hud-hidden`) with cursor suppression while playing, single-click (240ms debounced) play/pause, double-click fullscreen toggle, `Escape` to exit fullscreen first before closing dialogs, iOS WebKit fallback (`video.webkitEnterFullscreen()`), and synchronized browser `fullscreenchange` lifecycle.
  - **Dual-Engine Fullscreen Fallback**: If the browser's native `requestFullscreen()` is rejected (missing user gesture, iframe permission policies, or WebView restrictions), immediately activate CSS fullscreen (`.is-fullscreen` with fixed 100vw/100vh positioning and `z-index: 999999`) to guarantee 100% fullscreen parity on all platforms.
- **Standalone Client External Link Decoupling & Distribution Hygiene Invariant**:
  - **Media Isolation**: High-bandwidth media showcases (1080p narrated video walkthroughs, trailers) belong **strictly on the public website** (`https://.../demo`). Never bundle heavy video files in standalone offline packages (saving 260MB–700MB of distribution bloat). Non-web clients (Windows WebView2, Godot C#, Android APK) must never attempt native video playback.
  - **Triple-Layer Redirection Protocol**:
    1. *Host Container Interception*: In native desktop wrappers (WebView2, Electron, CEF), wire `NewWindowRequested` (`e.Handled = true; Process.Start(...)`), `NavigationStarting` (cancel non-local host navigations to prevent container page hijacking and launch system browser), and WebMessage IPC (`{ type: 'openExternal', url }`).
    2. *Front-End Dispatcher*: Auto-detect standalone execution (`isStandaloneApp()`, local hostname, Capacitor) and route external links through a unified dispatcher (`openExternalUrl()`) before touching UI modals. Adapt button labels with external hints (e.g. `🎬 Demo (Web ↗)`) and descriptive tooltips.
    3. *Player Engine Defensive Guards*: Suppress media preloading in standalone clients, deflect runtime `open()` calls to the external web URL, and guard standalone HTML pages with head redirection scripts.
  - **Zero-Bloat Packaging Hygiene**: Build pipelines (`package.ps1`) must explicitly exclude heavy media (`assets/video/`) and web-only pages (`demo.html`) from staged release bundles, purge transient saves/logs, and run post-stage binary verification checks.

---

## 5. Grounded Truth Standard
- **Never claim a fix without verification**: Execute test scripts, inspect exit codes, check HTTP status codes, or verify rendered keyframes before reporting completion.
- Provide dense, action-oriented, factual responses.

---

## 6. Award-Winning Aesthetics Baseline
- Reject plain, default, or unstyled UI frameworks.
- Standard Palette: Dark obsidian surfaces, radial amber/gold glows, emerald/cyan accents, and glassmorphism.
- Typography: Curated fonts (`Cinzel`, `Outfit`, `Fira Code`) over default browser fonts.
- Polish: Responsive mobile touch controls, fluid micro-animations, and high-impact visual first impressions.

---

## 7. Knowledge Codification
- Whenever an elusive bug, race condition, or OS gotcha is conquered, immediately append a structured entry to `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`:
  - Failure Mode
  - Root Cause
  - Architectural Invariant
  - Verification Proof
