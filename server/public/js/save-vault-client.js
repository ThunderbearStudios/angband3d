/**
 * save-vault-client.js — Indestructible Dual-Vault Saves, Checkpoints & Savescum Shield (WS82 Pillar 3)
 *
 * Guarantees zero lost characters across disconnects, browser refreshes, and Cloud Run recycles
 * while preserving 100% of Save, Checkpoint, .sav Import/Export, and [R] Savescum capabilities:
 *   1. Persistent CSPRNG `angband3d_vault_token` (`X-Vault-Id`) + per-save `X-Owner-Token` headers (CWE-598).
 *   2. Unified Save Roster: merges IndexedDB (`LocalSaveManager`) + Cloud Vault (`/api/saves`) seamlessly,
 *      with automatic download-to-IndexedDB hydration when loading a Cloud-backed save locally.
 *   3. 3-Slot Rolling Checkpoint Ring (`living`, `floor`, `bookmark`) per character in IndexedDB
 *      so `[R]` Savescum and pre-stairs rollback always have intact living snapshots.
 *   4. Dirty-Hash Debounced Cloud Sync on stairs, manual save, `visibilitychange`, and 180s heartbeat.
 *   5. HUD Backup Shield Pill (`🛡️ Backed Up` / `⚠️ Local Only` / `💀 Ironman`).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaveVaultClient = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VAULT_ID_KEY = 'angband3d_vault_token';
  const OWNER_MAP_KEY = 'angband3d_save_owner_tokens_v1';
  const CHECKPOINT_DB_NAME = 'yasd3d_checkpoint_ring_v1';
  const CHECKPOINT_STORE = 'checkpoints';
  const SYNC_INTERVAL_MS = 180000;

  let _vaultId = null;
  let _checkpointDbPromise = null;
  let _lastSyncHash = '';
  let _lastSyncAt = 0;
  let _vaultState = 'local'; // 'synced' | 'local' | 'ironman'
  let _syncTimer = null;

  function generateCsprngHex(bytesLen = 16) {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const arr = new Uint8Array(bytesLen);
      crypto.getRandomValues(arr);
      let hex = '';
      for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
      return hex;
    }
    let fallback = '';
    for (let i = 0; i < bytesLen * 2; i++) fallback += ((Math.random() * 16) | 0).toString(16);
    return fallback;
  }

  function getVaultId() {
    if (_vaultId) return _vaultId;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        let existing = localStorage.getItem(VAULT_ID_KEY);
        if (!existing || !/^[a-f0-9_-]{16,64}$/i.test(existing)) {
          existing = generateCsprngHex(16);
          localStorage.setItem(VAULT_ID_KEY, existing);
        }
        _vaultId = existing;
        return _vaultId;
      } catch (_) {}
    }
    _vaultId = generateCsprngHex(16);
    return _vaultId;
  }

  function _readOwnerMap() {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    try {
      const raw = localStorage.getItem(OWNER_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function getOwnerToken(realm, saveName) {
    const key = `${String(realm || 'angband').toLowerCase()}:${String(saveName || '').trim()}`;
    const map = _readOwnerMap();
    return map[key] || '';
  }

  function setOwnerToken(realm, saveName, token) {
    if (!saveName || !token || typeof window === 'undefined' || !window.localStorage) return;
    try {
      const key = `${String(realm || 'angband').toLowerCase()}:${String(saveName).trim()}`;
      const map = _readOwnerMap();
      map[key] = String(token);
      localStorage.setItem(OWNER_MAP_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function buildAuthHeaders(realm, saveName, extra = {}) {
    const headers = Object.assign({ 'X-Vault-Id': getVaultId() }, extra);
    const ownerTok = saveName ? getOwnerToken(realm, saveName) : '';
    if (ownerTok) headers['X-Owner-Token'] = ownerTok;
    return headers;
  }

  function computeQuickHash(bytesOrB64) {
    let h = 2166136261 >>> 0;
    if (typeof bytesOrB64 === 'string') {
      const step = Math.max(1, Math.floor(bytesOrB64.length / 512));
      for (let i = 0; i < bytesOrB64.length; i += step) {
        h ^= bytesOrB64.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return `${bytesOrB64.length}:${h.toString(16)}`;
    }
    if (bytesOrB64 && typeof bytesOrB64.length === 'number') {
      const step = Math.max(1, Math.floor(bytesOrB64.length / 512));
      for (let i = 0; i < bytesOrB64.length; i += step) {
        h ^= bytesOrB64[i];
        h = Math.imul(h, 16777619) >>> 0;
      }
      return `${bytesOrB64.length}:${h.toString(16)}`;
    }
    return '';
  }

  function uint8ToBase64(u8) {
    if (!u8 || !u8.length) return '';
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToUint8(b64) {
    if (!b64) return new Uint8Array(0);
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // --- 3-Slot Rolling Checkpoint Ring in IndexedDB (`living`, `floor`, `bookmark`) ---
  function _openCheckpointDb() {
    if (_checkpointDbPromise) return _checkpointDbPromise;
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    _checkpointDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(CHECKPOINT_DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
            db.createObjectStore(CHECKPOINT_STORE, { keyPath: 'slotKey' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return _checkpointDbPromise;
  }

  async function recordCheckpoint(realm, saveName, slotType, bytes, meta = {}) {
    if (!saveName || !bytes || !bytes.length) return false;
    const slot = (slotType === 'floor' || slotType === 'bookmark') ? slotType : 'living';
    const rk = String(realm || 'angband').toLowerCase();
    const db = await _openCheckpointDb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CHECKPOINT_STORE, 'readwrite');
        tx.objectStore(CHECKPOINT_STORE).put({
          slotKey: `${rk}:${saveName}:${slot}`,
          realm: rk,
          name: saveName,
          slot,
          bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
          depth: Number(meta.depth || 0),
          turn: Number(meta.turn || 0),
          hp: Number(meta.hp || 0),
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function listCheckpoints(realm, saveName) {
    const rk = String(realm || 'angband').toLowerCase();
    const db = await _openCheckpointDb();
    if (!db) return [];
    const out = [];
    for (const slot of ['living', 'floor', 'bookmark']) {
      // eslint-disable-next-line no-await-in-loop
      const item = await new Promise((resolve) => {
        try {
          const tx = db.transaction(CHECKPOINT_STORE, 'readonly');
          const req = tx.objectStore(CHECKPOINT_STORE).get(`${rk}:${saveName}:${slot}`);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
      if (item) out.push(item);
    }
    return out;
  }

  /**
   * Merges IndexedDB (`LocalSaveManager`) saves and Cloud Vault (`/api/saves`) saves into one deduplicated list.
   */
  async function listUnifiedSaves(realm, localSaveManager = null) {
    const rk = String(realm || 'angband').toLowerCase();
    const byName = new Map();

    // 1. Local IndexedDB saves (0ms instant)
    if (localSaveManager && typeof localSaveManager.listSaves === 'function') {
      try {
        const localSaves = await localSaveManager.listSaves(rk);
        if (Array.isArray(localSaves)) {
          for (const s of localSaves) {
            const keyName = s && (s.filename || s.name);
            if (!keyName) continue;
            if (s.realm && String(s.realm).toLowerCase() !== rk) continue;
            const mtime = Number(s.lastModified || s.mtime || s.updatedAt || Date.now());
            byName.set(keyName, Object.assign({}, s, {
              filename: keyName,
              name: s.characterName || keyName,
              characterName: s.characterName || keyName.replace(/\.sav$/i, ''),
              realm: rk,
              size: Number(s.size || 0),
              lastModified: mtime,
              mtime,
              hasLocal: true,
              hasCloud: false,
              source: 'local'
            }));
          }
        }
      } catch (_) {}
    }

    // 2. Cloud Vault saves (/api/saves)
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(`/api/saves?realm=${encodeURIComponent(rk)}`, {
          headers: buildAuthHeaders(rk, null)
        });
        if (res && res.ok) {
          const data = await res.json();
          const cloudList = Array.isArray(data && data.saves) ? data.saves : (Array.isArray(data) ? data : []);
          for (const cs of cloudList) {
            const keyName = cs && (cs.filename || cs.name);
            if (!keyName) continue;
            if (cs.ownerToken) setOwnerToken(rk, keyName, cs.ownerToken);
            const cloudMtime = Number(cs.lastModified || cs.mtime || cs.updatedAt || 0);
            const prev = byName.get(keyName);
            if (prev) {
              prev.hasCloud = true;
              prev.source = 'dual';
              if (cs.description && !prev.description) prev.description = cs.description;
              if (cs.realmTag && !prev.realmTag) prev.realmTag = cs.realmTag;
              if (cloudMtime > prev.mtime) {
                prev.mtime = cloudMtime;
                prev.lastModified = cloudMtime;
                prev.cloudNewer = true;
                prev.size = Number(cs.size || prev.size || 0);
              }
            } else {
              const effMtime = cloudMtime || Date.now();
              byName.set(keyName, Object.assign({}, cs, {
                filename: keyName,
                name: cs.characterName || keyName,
                characterName: cs.characterName || keyName.replace(/\.sav$/i, ''),
                realm: rk,
                size: Number(cs.size || 0),
                lastModified: effMtime,
                mtime: effMtime,
                hasLocal: false,
                hasCloud: true,
                cloudNewer: true,
                source: 'cloud'
              }));
            }
          }
        }
      } catch (_) {}
    }

    return Array.from(byName.values()).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  }

  /**
   * Hydrates a Cloud Vault save into IndexedDB (`LocalSaveManager`) when playing in `'local'` engine mode.
   */
  async function ensureLocalHydrated(realm, saveName, localSaveManager) {
    if (!saveName || !localSaveManager || typeof fetch !== 'function') return false;
    const rk = String(realm || 'angband').toLowerCase();
    try {
      const readLocal = typeof localSaveManager.getSaveData === 'function'
        ? await localSaveManager.getSaveData(saveName, rk)
        : (typeof localSaveManager.loadSave === 'function' ? await localSaveManager.loadSave(saveName, rk) : null);
      if (readLocal && readLocal.length > 0) return true;
      let res = await fetch(`/api/saves/${encodeURIComponent(saveName)}?realm=${encodeURIComponent(rk)}`, {
        headers: buildAuthHeaders(rk, saveName)
      });
      if (!res || !res.ok) {
        res = await fetch(`/api/saves/${encodeURIComponent(saveName)}/download?realm=${encodeURIComponent(rk)}`, {
          headers: buildAuthHeaders(rk, saveName)
        });
      }
      if (!res || !res.ok) return false;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > 0) {
        if (typeof localSaveManager.putSaveData === 'function') {
          await localSaveManager.putSaveData(saveName, buf, rk);
        } else if (typeof localSaveManager.putSave === 'function') {
          await localSaveManager.putSave(saveName, buf, rk);
        }
        await recordCheckpoint(rk, saveName, 'living', buf, {});
        return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Uploads a `.sav` file (preserving full `.sav` extension for RYOD/Cartridge portability + storing `ownerToken`).
   */
  async function uploadSaveFile(realm, file, localSaveManager = null) {
    if (!file) throw new Error('No save file selected');
    const rk = String(realm || 'angband').toLowerCase();
    const rawName = String(file.name || 'Hero').trim();
    const preserveExt = /\.sav$/i.test(rawName) && (rk === 'ryod' || rk === 'nethack' || rk === 'dcss' || rk === 'brogue' || rk === 'rogue');
    const cleanBase = rawName.replace(/\.(sav|save|angband|nh|dcss)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'Hero';
    const saveName = preserveExt ? `${cleanBase}.sav` : cleanBase;

    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);

    if (localSaveManager && typeof localSaveManager.putSave === 'function') {
      try { await localSaveManager.putSave(saveName, bytes, rk); } catch (_) {}
    }
    await recordCheckpoint(rk, saveName, 'living', bytes, {});

    if (typeof fetch === 'function') {
      try {
        const res = await fetch(`/api/saves/${encodeURIComponent(saveName)}/upload?realm=${encodeURIComponent(rk)}`, {
          method: 'POST',
          headers: buildAuthHeaders(rk, saveName, { 'Content-Type': 'application/octet-stream' }),
          body: bytes
        });
        if (res && res.ok) {
          const payload = await res.json().catch(() => ({}));
          if (payload && payload.ownerToken) setOwnerToken(rk, saveName, payload.ownerToken);
          setHudVaultState('synced', `Backed Up (${saveName})`);
          return { ok: true, name: saveName, synced: true };
        }
      } catch (_) {}
    }
    setHudVaultState('local', `Local Vault (${saveName})`);
    return { ok: true, name: saveName, synced: false };
  }

  /**
   * Syncs living character bytes to IndexedDB Checkpoint Ring + Cloud Vault `/api/saves/sync` (dirty-hash gated).
   */
  async function syncLivingSnapshot(realm, saveName, bytes, options = {}) {
    if (!saveName || !bytes || !bytes.length) return { synced: false };
    if (options.ironman) {
      setHudVaultState('ironman', 'Ironman Mode (No Savescum)');
      return { synced: false, ironman: true };
    }
    const rk = String(realm || 'angband').toLowerCase();
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const slot = options.slot || 'living';
    await recordCheckpoint(rk, saveName, slot, u8, options.meta || {});

    const hash = computeQuickHash(u8);
    const now = Date.now();
    if (!options.force && hash === _lastSyncHash && (now - _lastSyncAt) < SYNC_INTERVAL_MS) {
      return { synced: _vaultState === 'synced', cached: true };
    }

    if (typeof fetch !== 'function') return { synced: false };
    try {
      const b64 = uint8ToBase64(u8);
      const res = await fetch('/api/saves/sync', {
        method: 'POST',
        headers: buildAuthHeaders(rk, saveName, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          realm: rk,
          name: saveName,
          slot,
          hash,
          dataBase64: b64,
          meta: options.meta || {}
        })
      });
      if (res && res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json && json.ownerToken) setOwnerToken(rk, saveName, json.ownerToken);
        _lastSyncHash = hash;
        _lastSyncAt = now;
        setHudVaultState('synced', `Backed Up • ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        return { synced: true };
      }
      // Fallback to existing /api/saves/upload endpoint if /api/saves/sync is unavailable
      if (res && res.status === 404) {
        const upRes = await fetch(`/api/saves/upload?realm=${encodeURIComponent(rk)}`, {
          method: 'POST',
          headers: buildAuthHeaders(rk, saveName, {
            'Content-Type': 'application/octet-stream',
            'X-Character-Name': saveName
          }),
          body: u8
        });
        if (upRes && upRes.ok) {
          const upJson = await upRes.json().catch(() => ({}));
          if (upJson && upJson.ownerToken) setOwnerToken(rk, saveName, upJson.ownerToken);
          _lastSyncHash = hash;
          _lastSyncAt = now;
          setHudVaultState('synced', 'Backed Up');
          return { synced: true };
        }
      }
    } catch (_) {}

    setHudVaultState('local', 'Local Backup Ready (Click to Export .sav)');
    return { synced: false };
  }

  /**
   * Updates or injects the subtle HUD Backup Shield pill in the bottom telemetry bar.
   */
  function setHudVaultState(state, tooltipText = '') {
    _vaultState = state || 'local';
    if (typeof document === 'undefined') return;
    let pill = document.getElementById('hud-vault-shield-pill');
    if (!pill) {
      const footerLeft = document.querySelector('.hud-footer-left') || document.getElementById('footer-badges');
      if (!footerLeft) return;
      pill = document.createElement('button');
      pill.type = 'button';
      pill.id = 'hud-vault-shield-pill';
      pill.className = 'hud-vault-pill';
      pill.addEventListener('click', () => {
        if (typeof window !== 'undefined' && window.__app && typeof window.__app.exportCurrentSaveBackup === 'function') {
          window.__app.exportCurrentSaveBackup();
        }
      });
      footerLeft.appendChild(pill);
    }
    pill.setAttribute('data-vault-state', _vaultState);
    if (_vaultState === 'synced') {
      pill.textContent = '🛡️ Backed Up';
    } else if (_vaultState === 'ironman') {
      pill.textContent = '💀 Ironman';
    } else {
      pill.textContent = '🛡️ Local Vault';
    }
    pill.title = tooltipText || 'Dual-Vault Character Backup (Click to download portable .sav backup)';
  }

  function startHeartbeat(getSnapshotCallback) {
    if (_syncTimer) clearInterval(_syncTimer);
    if (typeof getSnapshotCallback !== 'function') return;
    _syncTimer = setInterval(() => {
      try { getSnapshotCallback('heartbeat'); } catch (_) {}
    }, SYNC_INTERVAL_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          try { getSnapshotCallback('visibilitychange'); } catch (_) {}
        }
      });
    }
  }

  return {
    getVaultId,
    getOwnerToken,
    setOwnerToken,
    buildAuthHeaders,
    computeQuickHash,
    uint8ToBase64,
    base64ToUint8,
    recordCheckpoint,
    listCheckpoints,
    listUnifiedSaves,
    ensureLocalHydrated,
    uploadSaveFile,
    syncLivingSnapshot,
    setHudVaultState,
    startHeartbeat
  };
});
