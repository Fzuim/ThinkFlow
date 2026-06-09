#!/usr/bin/env bash
# -----------------------------------------------------------------------
# create_seed_db.sh — Generate a pre-initialized, empty SQLite seed database
#
# This script creates a fresh thinkflow.db with the full schema applied,
# then copies it into thinkflow/seed/ so it can be bundled as a Tauri
# resource. The build machine's dev database is never touched.
# -----------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_DIR="$PROJECT_ROOT/thinkflow/seed"
DB_PATH="$SEED_DIR/thinkflow.db"

# Ensure sqlite3 CLI is available
if ! command -v sqlite3 &>/dev/null; then
  echo "ERROR: sqlite3 not found. Install it (brew install sqlite / apt install sqlite3) and retry."
  exit 1
fi

mkdir -p "$SEED_DIR"

# Remove any stale seed DB so we start clean
rm -f "$DB_PATH"

echo "→ Creating seed database at $DB_PATH …"

sqlite3 "$DB_PATH" <<'SQL'
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

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
SQL

echo "✓ Seed database created successfully."
echo "  Schema tables:"
sqlite3 "$DB_PATH" ".tables"
echo "  File size: $(du -h "$DB_PATH" | cut -f1)"
