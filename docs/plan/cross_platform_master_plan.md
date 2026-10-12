# Master Implementation Plan: Cross-Platform Parity, Branding, Bloat Elimination & Contextual Voices

**Branch**: `fix/award-pass`  
**Target Clients**: Web (`server/public`), Android (`android`), Desktop (`desktop`), Godot C# (`client`)  
**Status**: Ready for Execution  

---

## Executive Summary
This plan delivers full parity, branding, efficiency, and vocal immersion across all Angband3D clients:
1. **Cross-Platform Realm & Save Parity**: All 4 realms (Vanilla Angband, Sil-Q, FrogComposBand, Hengband) fully available with seamless save load/save/delete/upload/download across Godot, Desktop, Android, and Web.
2. **Godot Gameplay Parity**: Godot client gains multi-magic save support (`SaveVNLA`, `SaveSILQ`, `SaveFROX`, `SaveHENG`), realm-specific key bindings (`RealmKeys.cs`), contextual action ribbon (`Overlay.cs` Action Chooser), and cloud save synchronization.
3. **Android Branding**: Default Capacitor launcher icons and splash screens replaced with high-resolution Thunderbear Studios skull-bear-paw & crossbones logo (`client/assets/thunderbear_logo.png`).
4. **Client Bloat Elimination**: Strip 107.7 MB of web video walkthrough frames (`assets/video/frames/` and `demo.html`) from mobile and standalone client packages, optimizing build sizes by 25-50%.
5. **Contextual High-Quality Gemini Lorekeeper Voices**: Replace hardcoded `Enceladus` with realm-appropriate Gemini native voice models (`Zephyr` for Angband, `Charon` for Sil-Q, `Fenrir` for FCB, `Gacrux` for Hengband), coupled with buffering indicator animations and prewarm audio caching.

---

## Workstream 11: Cross-Platform Realm & Save Parity (Godot & Desktop)

### 11.1 Godot Multi-Magic Save Parser & Local Save Discovery
- **Target File**: `client/scripts/Main.cs`
- **Issue**: `ReadSaveDescription` in `Main.cs:332` only recognizes `SaveVNLA`. Sil-Q (`SaveSILQ`), FCB (`SaveFROX`), and Hengband (`SaveHENG`) saves fail to parse, hiding character names and descriptions.
- **Fix**:
  - Accept all 4 official engine magics: `SaveVNLA`, `SaveSILQ`, `SaveFROX`, `SaveHENG`, plus `.realm.json` sidecar metadata.
  - Fix `SaveDir(realm)` to properly locate `variants/{realm}/lib/save` or fallback directories across platforms.
- **Verification**: Local saves for Angband, Sil-Q, FCB, and Hengband display correct character names and timestamps in Godot Load menu.

### 11.2 Godot Cloud Save Listing, Upload, Download & Deletion
- **Target File**: `client/scripts/Main.cs`
- **Issue**:
  - In Cloud Mode, `OpenLoadMenu` only reads local disk `GetSaveFiles()`, which is empty, making Cloud saves inaccessible in the Godot UI.
  - HTTP requests to `/api/saves`, `/api/saves/upload`, and `/api/saves/{name}` do not append `?realm={_realm}`, defaulting to Angband on the server.
- **Fix**:
  - In `OpenLoadMenu`: When `_cloudMode == true`, asynchronously query `GET /api/saves?realm={_realm}` and render cloud saves with character name, description, and timestamp.
  - Append `?realm={_realm}` to all save REST requests (`/api/saves/upload`, `/api/saves/{name}`, `/api/saves/{name}` DELETE).
  - Add "Continue ({CharacterName})" button to Godot main menu that automatically queries latest save for active realm.
- **Verification**: Switching realms in Godot queries the respective cloud saves and allows seamless loading.

### 11.3 Godot RealmKeys & Input Protocol Parity
- **Target File**: `client/scripts/RealmKeys.cs` (New) & `client/scripts/Main.cs`
- **Issue**: Godot client uses hardcoded keys that don't respect realm variations (e.g. Sil-Q uses `u` for use, `r` for rest, `x` for examine, `,` for stay).
- **Fix**:
  - Create `client/scripts/RealmKeys.cs` mirroring `server/public/js/realm-keys.js`.
  - Update movement, rest, and action dispatch in `Main.cs` to resolve keys through `RealmKeys`.
  - Adhere strictly to Lesson L2: never send raw digits for movement or hold.
- **Verification**: Sil-Q, FCB, and Hengband commands trigger correct engine behaviors in Godot.

### 11.4 Godot In-Game Contextual Action Ribbon
- **Target Files**: `client/scripts/Overlay.cs` & `client/scripts/Main.cs`
- **Feature**: Port the web client's `#term-contextual-actions` bar into Godot's 2D canvas overlay.
- **Design**:
  - Render an interactive, clickable contextual ribbon at the bottom of the viewport in 3D World / Terminal view:
    - `[i] Inventory` | `[e] Equipment` | `[m] Spells` | `[f] Fire` | `[r/u] Rest` | `[o] Open` | `[d] Drop` | `[^S] Save` | `[Esc] Menu`
  - Mouse click or touch tap triggers corresponding key command.
- **Verification**: Godot displays responsive action buttons; clicking triggers engine actions.

---

## Workstream 12: Android APK Branding & Client Bloat Elimination

### 12.1 Thunderbear Studios Android Icon & Splash Generation
- **Source Asset**: `client/assets/thunderbear_logo.png`
- **Target Files**:
  - `android/app/src/main/res/mipmap-mdpi/` (`ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`)
  - `android/app/src/main/res/mipmap-hdpi/`
  - `android/app/src/main/res/mipmap-xhdpi/`
  - `android/app/src/main/res/mipmap-xxhdpi/`
  - `android/app/src/main/res/mipmap-xxxhdpi/`
  - `android/app/src/main/res/drawable*/splash.png`
  - `android/app/src/main/res/values/colors.xml` (Ensure background is deep obsidian `#030407`)
- **Implementation**:
  - Use high-quality bicubic scaling via `System.Drawing` in PowerShell to generate all mipmap density targets and centered splash graphics.
- **Verification**: Android manifest, mipmaps, and drawables reflect Thunderbear logo.

### 12.2 Android Asset Bloat Stripping & Sync Guard Optimization
- **Target Directories**: `android/app/src/main/assets/public/`
- **Bloat Analysis**:
  - `assets/video/frames/`: 67 keyframe PNG images (107.7 MB) used exclusively by web-only `demo.html`.
  - `demo.html`: 10 KB web showcase page.
- **Fix**:
  - Remove `assets/video/` and `demo.html` from `android/app/src/main/assets/public/`.
  - Update `tools/check_android_sync.js` to exclude `assets/video` and `demo.html` from drift verification via `EXCLUDED_ANDROID_PATHS`.
  - Update `tools/bump_version.js` or sync scripts to prune excluded paths during synchronization.
- **Verification**:
  - `node tools/run_tests.js --tier fast` passes `check_android_sync.js`.
  - Android assets directory size decreases by ~108 MB.

---

## Workstream 13: Realm-Contextual Gemini Lorekeeper Voices & Buffering UX

### 13.1 Server-Side Dual-Engine Voice Resolution
- **Target File**: `server/src/server.js`
- **Issue**: Line 1301 hardcoded `reqVoice = isNarrator ? 'Enceladus' : ...`, overriding any client-requested or realm-specific voice.
- **Fix**:
  - Respect requested Gemini voice from client query parameter `voice`.
  - If voice is unspecified or default, resolve realm-appropriate high quality Gemini voice:
    - **Vanilla Angband**: `Zephyr` (Noble, wise, scholarly Tolkien chronicler)
    - **Sil-Q**: `Charon` (Solemn, grave, deep First-Age mythic bard)
    - **FrogComposBand**: `Fenrir` (Bold, sharp, cynical Amber fencing wit)
    - **Hengband**: `Gacrux` (Disciplined, weathered Eastern Bushido master)
- **Verification**: `/api/tts?role=narrator&realm=silq` returns Charon audio; `/api/tts?voice=Fenrir` returns Fenrir audio.

### 13.2 Client Chronicle Vocal Grounding & Dynamic Voice Assignment
- **Target Files**:
  - `server/public/js/chronicle/chronicle-grounder.js`
  - `server/public/js/chronicle/chronicle-audio.js`
  - `server/public/js/chronicle/chronicle-manager.js`
- **Fix**:
  - In `ChronicleGrounder`: Add `getLorekeeperVoice(realmKey, gender = 'male')` mapping each realm to its contextually grounded Gemini voice.
  - In `ChronicleAudioRouter`: Remove hardcoded `Enceladus` defaults; bind `narratorVoice` to `ChronicleGrounder.getLorekeeperVoice(this.activeRealm)`.
  - In `ChronicleManager`: When realm changes or story initializes, update audio router's active realm and narrator voice.
  - In Tome UI: Ensure buffering indicator animations (`voice-loading-spinner`, `voice-loading-pulse`, `vocalPillEl`) actively inform the player while Gemini synthesizes and decodes PCM WAV streams.
- **Verification**: Real Chrome CDP tests and manual inspection verify dynamic voice per realm and active buffering feedback.

---

## Execution Checklist & Gates

| Task | Description | Gate |
|---|---|---|
| **WS13.1** | Server TTS Realm-Voice Resolution | `node tools/run_tests.js --tier fast` |
| **WS13.2** | Client Lorekeeper Realm-Voice Wiring & Buffering UX | `node tools/run_tests.js --tier fast` + version bump |
| **WS12.1** | Android Thunderbear Logo Generation | Image inspection + asset check |
| **WS12.2** | Android APK Bloat Stripping & Sync Update | `node tools/check_android_sync.js` PASS |
| **WS11.1** | Godot Multi-Magic Save Parser | `dotnet build client/angband3d.csproj` PASS |
| **WS11.2** | Godot Cloud Save Listing & Sync | `dotnet build client/angband3d.csproj` PASS |
| **WS11.3** | Godot RealmKeys Cross-Realm Input | `dotnet build client/angband3d.csproj` PASS |
| **WS11.4** | Godot In-Game Contextual Action Ribbon | `dotnet build client/angband3d.csproj` PASS |
| **WS-Final** | Full Verification Across All Platforms | `python tools/smoke_test.py` + fast + e2e + cdp |
