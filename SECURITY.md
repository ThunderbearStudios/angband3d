# Security Policy & Vulnerability Disclosure

## Supported Versions

Thunderbear Studios actively maintains security updates and patches for the following versions of **Angband 3D**:

| Version | Supported | Notes |
|---|---|---|
| **2.16.x / Web 8.8.x** | :white_check_mark: | Current Active Release (Production) |
| **2.15.x / Web 8.7.x** | :white_check_mark: | Security Patches Only |
| **< 2.15.0** | :x: | Deprecated / End of Life |

---

## Security Model & Threat Boundary

Angband 3D is designed with defence-in-depth across multiple runtime environments:

1. **Web Client & WebAssembly Sandbox**:
   - The Angband C engine runs compiled to WebAssembly inside an isolated `Web Worker`.
   - The WebAssembly environment operates inside browser process isolation and does not possess access to host filesystem APIs, local sockets, or arbitrary system calls.
   - Persistence is confined to origin-isolated IndexedDB (`IDBFS`).
2. **Cloud Run / Web Services**:
   - Web application containers run on serverless Google Cloud Run instances with non-root user execution, read-only root filesystems where applicable, and ephemeral in-memory lifecycles.
   - External LLM / TTS proxy endpoints require rate-limiting validation and strictly proxy authenticated API keys in server memory—never leaking tokens or sensitive environment variables to browser clients.
3. **Standalone Desktop & Android Binaries**:
   - Standalone builds (Windows Godot C# / WebView2 and Android APK) follow strict least-privilege principles, requesting zero non-essential permissions.

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
