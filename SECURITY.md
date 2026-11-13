# Security Policy & Vulnerability Disclosure

## Supported Versions

Thunderbear Studios actively maintains security updates and patches for the following versions of **YASD 3D / Angband 3D**:

| Version | Supported | Notes |
|---|---|---|
| **Web v12.0.x / Desktop 12.0.x** | :white_check_mark: | Current Active Release (`yasd3d.com` & `angband3d.com`) |
| **Web v11.9.x** | :white_check_mark: | Security Patches Only |
| **< 11.9.0** | :x: | Deprecated / End of Life |

---

## Security Model & Threat Boundary

YASD 3D (`yasd3d.com` / `angband3d.com`) is designed with defence-in-depth across multiple runtime environments:

1. **Web Client & Isolated Browser Engine Worker (`engine-worker.js`)**:
   - Both the Emscripten WebAssembly Angband 4.2.6 C engine and the 5 Yendor 3D JS Cartridges (`ryod`, `nethack`, `dcss`, `brogue`, `rogue`) execute inside an isolated `Web Worker` (`0ms` main-thread block).
   - Persistence is confined to origin-isolated IndexedDB (`IDBFS` and `yasd3d_crypt_v1`).
2. **Cloud Run & Edge Security (`Zero-Trust`)**:
   - Serverless Google Cloud Run containers run as non-root with `TRUST_CLOUDFLARE=1` HMAC edge verification (`X-Edge-Auth`), `hmac.compare_digest` timing-safe owner auth (`fail-closed`), strict path-traversal jails (`CWE-22`), and `0` third-party trackers.
   - Gemini API keys (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.8-flash-tts`, `nano-banana-2.1`) remain strictly server-side with per-IP rate limiting and idle session hibernation (`15m`).
3. **Standalone Desktop (Windows WebView2) & Android APK**:
   - Windows WebView2 runs without local file-access bypass flags (`--allow-file-access-from-files` prohibited); Android APK targets SDK 34+ with `fullUser` orientation and scoped voice permission (`RECORD_AUDIO` only when user activates Chronicle mic).

---

## Reporting a Vulnerability

We take the security of our players, contributors, and infrastructure seriously. If you discover a security vulnerability or potential exploit, please do **NOT** open a public GitHub issue.

Instead, please report security vulnerabilities privately:
- **Email**: `thunderbearstudios@gmail.com`
- **Subject**: `[SECURITY VULNERABILITY] <Component/Summary>`

### What to Include in Your Report
To help us triage and resolve the issue quickly, please provide:
1. A clear description of the vulnerability and its potential impact.
2. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. The affected environment(s) (Web Browser, Standalone Windows, Android APK, Cloud Backend).
4. Any potential mitigations or suggested remediation steps.

---

## Disclosure Response Timeline & SLA

- **Initial Acknowledgment**: Within **48 hours** of report receipt.
- **Triage & Severity Assessment**: Within **5 business days**.
- **Fix & Patch Deployment**: Targeted within **14 business days** for high/critical vulnerabilities.
- **Public Disclosure**: Coordinated disclosure after patches have been deployed to production and distributed to users.

Thank you for practicing responsible disclosure and helping us keep Angband 3D safe and open for everyone.
