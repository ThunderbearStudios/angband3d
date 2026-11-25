'use strict';

/**
 * server/src/vault-sqlite.js
 * Rebuildable SQLite WAL metadata index for savefiles and RYOD blueprints.
 * Native binary saves on disk remain 100% authoritative.
 */

const fs = require('fs');
const path = require('path');

let DatabaseSync = null;
try {
    ({ DatabaseSync } = require('node:sqlite'));
} catch (_) {}

function noopIndex() {
    return {
        enabled: false,
        getSaveMeta: () => null,
        upsertSaveMeta: () => {},
        deleteSaveMeta: () => {},
        getBlueprint: () => null,
        upsertBlueprint: () => {},
        close: () => {}
    };
}

function initSchema(db) {
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS saves_meta (
            full_path TEXT PRIMARY KEY,
            realm TEXT NOT NULL,
            filename TEXT NOT NULL,
            mtime_ms REAL NOT NULL,
            size_bytes INTEGER NOT NULL,
            meta_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_saves_meta_realm ON saves_meta (realm);
        CREATE TABLE IF NOT EXISTS ryod_blueprints (
            slot_key TEXT PRIMARY KEY,
            ryod_hash TEXT,
            blueprint_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);
}

function openWithRebuild(dbPath) {
    const resolved = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    let db = null;
    try {
        db = new DatabaseSync(resolved);
        initSchema(db);
        return db;
    } catch (_) {
        if (db) {
            try { db.close(); } catch (__) {}
            db = null;
        }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(resolved + suffix); } catch (__) {}
        }
        db = new DatabaseSync(resolved);
        initSchema(db);
        return db;
    }
}

/**
 * Creates a rebuildable SQLite WAL index at `dbPath`, or a safe no-op stub when disabled.
 */
function createVaultIndex(dbPath) {
    if (!dbPath || !DatabaseSync) return noopIndex();
    let db;
    try {
        db = openWithRebuild(dbPath);
    } catch (_) {
        return noopIndex();
    }

    let closed = false;
    const stmtGetSave = db.prepare('SELECT mtime_ms, size_bytes, meta_json FROM saves_meta WHERE full_path = ?');
    const stmtUpsertSave = db.prepare(`
        INSERT INTO saves_meta (full_path, realm, filename, mtime_ms, size_bytes, meta_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(full_path) DO UPDATE SET
            realm = excluded.realm,
            filename = excluded.filename,
            mtime_ms = excluded.mtime_ms,
            size_bytes = excluded.size_bytes,
            meta_json = excluded.meta_json,
            updated_at = excluded.updated_at
    `);
    const stmtDeleteSave = db.prepare('DELETE FROM saves_meta WHERE full_path = ?');
    const stmtGetBp = db.prepare('SELECT blueprint_json FROM ryod_blueprints WHERE slot_key = ?');
    const stmtUpsertBp = db.prepare(`
        INSERT INTO ryod_blueprints (slot_key, ryod_hash, blueprint_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(slot_key) DO UPDATE SET
            ryod_hash = excluded.ryod_hash,
            blueprint_json = excluded.blueprint_json,
            updated_at = excluded.updated_at
    `);

    return {
        enabled: true,
        getSaveMeta(fullPath, mtimeMs, sizeBytes) {
            if (closed || !fullPath) return null;
            try {
                const row = stmtGetSave.get(path.resolve(fullPath));
                if (!row) return null;
                if (Math.abs(row.mtime_ms - Number(mtimeMs)) > 0.5 || row.size_bytes !== Number(sizeBytes)) {
                    return null;
                }
                return JSON.parse(row.meta_json);
            } catch (_) {
                return null;
            }
        },
        upsertSaveMeta(fullPath, realm, filename, mtimeMs, sizeBytes, meta) {
            if (closed || !fullPath || !meta) return;
            try {
                stmtUpsertSave.run(
                    path.resolve(fullPath),
                    String(realm || 'angband'),
                    String(filename || path.basename(fullPath)),
                    Number(mtimeMs) || 0,
                    Number(sizeBytes) || 0,
                    JSON.stringify(meta),
                    Date.now()
                );
            } catch (_) {}
        },
        deleteSaveMeta(fullPath) {
            if (closed || !fullPath) return;
            try {
                stmtDeleteSave.run(path.resolve(fullPath));
            } catch (_) {}
        },
        getBlueprint(slotKey) {
            if (closed || !slotKey) return null;
            try {
                const row = stmtGetBp.get(String(slotKey));
                return row ? JSON.parse(row.blueprint_json) : null;
            } catch (_) {
                return null;
            }
        },
        upsertBlueprint(slotKey, ryodHash, bp) {
            if (closed || !slotKey || !bp) return;
            try {
                stmtUpsertBp.run(String(slotKey), ryodHash ? String(ryodHash) : '', JSON.stringify(bp), Date.now());
            } catch (_) {}
        },
        close() {
            if (closed) return;
            closed = true;
            try { db.close(); } catch (_) {}
        }
    };
}

module.exports = { createVaultIndex };
