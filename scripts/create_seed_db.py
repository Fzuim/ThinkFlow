#!/usr/bin/env python3
"""Generate a pre-initialized, empty SQLite seed database (cross-platform)."""
import sqlite3
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SEED_DIR = PROJECT_ROOT / "thinkflow" / "seed"
DB_PATH = SEED_DIR / "thinkflow.db"

SEED_DIR.mkdir(parents=True, exist_ok=True)

# Remove stale seed DB
if DB_PATH.exists():
    DB_PATH.unlink()

print(f"→ Creating seed database at {DB_PATH} …")

conn = sqlite3.connect(str(DB_PATH))
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA foreign_keys=ON")

conn.executescript("""
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority INTEGER DEFAULT 5,
    urgency TEXT DEFAULT 'normal',
    importance TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'todo',
    deadline TEXT,
    estimated_duration INTEGER,
    energy_level TEXT,
    category TEXT,
    tags TEXT DEFAULT '[]',
    stakeholder TEXT,
    dependencies TEXT DEFAULT '[]',
    source_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    provider TEXT NOT NULL,
    api_key TEXT DEFAULT '',
    model TEXT NOT NULL,
    base_url TEXT NOT NULL,
    extra_params TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    importance REAL DEFAULT 0.5,
    created_at TEXT NOT NULL,
    last_accessed TEXT NOT NULL,
    access_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
""")

conn.close()

# Verify
conn2 = sqlite3.connect(str(DB_PATH))
tables = conn2.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
conn2.close()

print(f"  ✓ Seed database created with {len(tables)} tables: {', '.join(t[0] for t in tables)}")
print(f"  ✓ Size: {DB_PATH.stat().st_size:,} bytes")
