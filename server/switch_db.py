#!/usr/bin/env python3
"""
switch_db.py — One-command database switcher for OmniTestAI.

Usage (run from the server/ directory):
    python switch_db.py sqlite
    python switch_db.py postgres

What it does:
  1. Updates DATABASE_PROVIDER and DATABASE_URL in .env
  2. Checks if a migrations folder already exists for this provider
  3. If yes  → runs `prisma migrate deploy` (apply existing migrations)
  4. If no   → runs `prisma migrate dev --name init` (create fresh migrations)
  5. Runs `prisma generate` to refresh the client
  6. Prints a clear summary of what happened

Requirements:
  - Run from the server/ directory (where .env and prisma/ live)
  - Prisma CLI must be installed (npx prisma or global prisma)
  - Your .env must have both DATABASE_URL lines commented/uncommented
    per the pattern below:

    # SQLite
    # DATABASE_PROVIDER="sqlite"
    # DATABASE_URL="file:./dev.db"

    # PostgreSQL
    # DATABASE_PROVIDER="postgresql"
    # DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/omnitestai"
"""

import os
import re
import sys
import shutil
import subprocess
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

ENV_FILE       = Path(".env")
SCHEMA_FILE    = Path("prisma/schema.prisma")
MIGRATIONS_DIR = Path("prisma/migrations")

DB_CONFIGS = {
    "sqlite": {
        "provider": "sqlite",
        "url_pattern": r"file:\.\/dev\.db",      # matches file:./dev.db
        "url_key": "DATABASE_URL_SQLITE",         # used to find the right line
        "display": "SQLite (dev.db)",
    },
    "postgres": {
        "provider": "postgresql",
        "url_pattern": r"postgresql://",
        "url_key": "DATABASE_URL_POSTGRES",
        "display": "PostgreSQL",
    },
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def print_header(text: str):
    print(f"\n{'─' * 55}")
    print(f"  {text}")
    print(f"{'─' * 55}")

def print_step(n: int, text: str):
    print(f"\n[{n}] {text}")

def print_ok(text: str):
    print(f"    ✓ {text}")

def print_err(text: str):
    print(f"    ✗ {text}")

def run(cmd: str, capture: bool = False):
    """Run a shell command, streaming output unless capture=True."""
    result = subprocess.run(
        cmd, shell=True, text=True,
        capture_output=capture
    )
    return result


def read_env() -> str:
    if not ENV_FILE.exists():
        print_err(f"{ENV_FILE} not found. Are you running from server/?")
        sys.exit(1)
    return ENV_FILE.read_text(encoding="utf-8")


def write_env(content: str):
    ENV_FILE.write_text(content, encoding="utf-8")


def parse_current_provider(env_content: str) -> str | None:
    """Find the currently active (uncommented) DATABASE_PROVIDER value."""
    for line in env_content.splitlines():
        line = line.strip()
        if line.startswith("#"):
            continue
        m = re.match(r'DATABASE_PROVIDER\s*=\s*["\']?(\w+)["\']?', line)
        if m:
            return m.group(1)
    return None


def switch_env(env_content: str, target: str) -> str:
    """
    Toggle .env so only the target database lines are active.
    Works by:
      - Commenting out ALL DATABASE_PROVIDER and DATABASE_URL lines
      - Then uncommenting the ones that match the target provider/URL pattern
    """
    cfg = DB_CONFIGS[target]
    lines = env_content.splitlines()
    new_lines = []

    for line in lines:
        stripped = line.strip()

        # Is this a DATABASE_PROVIDER line (active or commented)?
        is_provider = bool(re.search(r'DATABASE_PROVIDER\s*=', stripped.lstrip("#").strip()))
        # Is this a DATABASE_URL line?
        is_url = bool(re.search(r'DATABASE_URL\s*=', stripped.lstrip("#").strip()))

        if not is_provider and not is_url:
            new_lines.append(line)
            continue

        # Strip any leading comment markers and whitespace for clean comparison
        clean = stripped.lstrip("#").strip()

        if is_provider:
            # Activate if it matches our target provider
            m = re.match(r'DATABASE_PROVIDER\s*=\s*["\']?(\w+)["\']?', clean)
            if m and m.group(1) == cfg["provider"]:
                new_lines.append(clean)   # uncomment
            else:
                new_lines.append(f"# {clean}")  # comment out
        elif is_url:
            # Activate if the URL matches our target pattern
            if re.search(cfg["url_pattern"], clean):
                new_lines.append(clean)   # uncomment
            else:
                new_lines.append(f"# {clean}")  # comment out

    return "\n".join(new_lines) + "\n"


def get_migrations_for_provider(provider: str) -> list[Path]:
    """Return migration folders that belong to this provider by inspecting migration.sql."""
    if not MIGRATIONS_DIR.exists():
        return []
    found = []
    for d in sorted(MIGRATIONS_DIR.iterdir()):
        sql_file = d / "migration.sql"
        if not sql_file.exists():
            continue
        sql = sql_file.read_text(encoding="utf-8", errors="ignore").lower()
        # SQLite migrations don't use SERIAL/BIGSERIAL; Postgres ones do
        if provider == "sqlite" and "autoincrement" in sql:
            found.append(d)
        elif provider == "postgresql" and ("serial" in sql or "bigserial" in sql or "uuid" in sql):
            found.append(d)
        # fallback: include all if we can't tell
    return found


def has_migrations_lock_for(provider: str) -> bool:
    lock = MIGRATIONS_DIR / "migration_lock.toml"
    if not lock.exists():
        return False
    content = lock.read_text(encoding="utf-8")
    return f'provider = "{provider}"' in content


def archive_migrations(provider_name: str):
    """Move current migrations to a backup folder named after the old provider."""
    if not MIGRATIONS_DIR.exists():
        return
    archive = Path(f"prisma/migrations_backup_{provider_name}")
    if archive.exists():
        shutil.rmtree(archive)
    shutil.copytree(str(MIGRATIONS_DIR), str(archive))
    shutil.rmtree(str(MIGRATIONS_DIR))
    print_ok(f"Archived old migrations to {archive}/")


def restore_migrations(provider: str):
    """Restore a previously archived migrations folder for this provider."""
    archive = Path(f"prisma/migrations_backup_{provider}")
    if archive.exists():
        if MIGRATIONS_DIR.exists():
            shutil.rmtree(str(MIGRATIONS_DIR))
        shutil.copytree(str(archive), str(MIGRATIONS_DIR))
        print_ok(f"Restored migrations from {archive}/")
        return True
    return False


def find_prisma_cmd() -> str:
    """Find the right prisma command (global or npx)."""
    r = subprocess.run("prisma --version", shell=True, capture_output=True)
    if r.returncode == 0:
        return "prisma"
    r = subprocess.run("npx prisma --version", shell=True, capture_output=True)
    if r.returncode == 0:
        return "npx prisma"
    print_err("Prisma CLI not found. Install it with: npm install -g prisma")
    sys.exit(1)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2 or sys.argv[1].lower() not in ("sqlite", "postgres", "postgresql"):
        print("Usage: python switch_db.py sqlite")
        print("       python switch_db.py postgres")
        sys.exit(1)

    target = sys.argv[1].lower()
    if target == "postgresql":
        target = "postgres"

    cfg = DB_CONFIGS[target]
    prisma = find_prisma_cmd()

    print_header(f"OmniTestAI — Switching to {cfg['display']}")

    # ── Step 1: Read current state ─────────────────────────────────────────
    print_step(1, "Reading current .env state...")
    env_content = read_env()
    current_provider = parse_current_provider(env_content)
    print_ok(f"Current provider: {current_provider or 'unknown'}")
    print_ok(f"Target provider : {cfg['provider']}")

    if current_provider == cfg["provider"]:
        print(f"\n  Already on {cfg['display']}. Nothing to switch.")
        print("  Running prisma generate to ensure client is up to date...\n")
        run(f"{prisma} generate")
        print("\n✓ Done.")
        sys.exit(0)

    # ── Step 2: Update .env ────────────────────────────────────────────────
    print_step(2, f"Updating .env to use {cfg['display']}...")
    new_env = switch_env(env_content, target)
    write_env(new_env)
    print_ok(".env updated")

    # ── Step 2b: Patch schema.prisma provider directly ─────────────────────
    # Prisma 5.x does NOT allow env() in the provider field — must be a
    # hardcoded string. So the script rewrites it directly on each switch.
    print_step(3, f"Updating prisma/schema.prisma provider to '{cfg['provider']}'...")
    if not SCHEMA_FILE.exists():
        print_err(f"{SCHEMA_FILE} not found. Are you running from server/?")
        sys.exit(1)
    schema_content = SCHEMA_FILE.read_text(encoding="utf-8")
    schema_content = re.sub(
        r"""provider\s*=\s*["'](?:sqlite|postgresql|mysql)["']""",
        f'provider = "{cfg["provider"]}"',
        schema_content,
        count=1,
    )
    SCHEMA_FILE.write_text(schema_content, encoding="utf-8")
    print_ok(f"schema.prisma provider set to '{cfg['provider']}'")

    # ── Step 3: Handle migrations ──────────────────────────────────────────
    print_step(4, "Checking migrations...")

    # Archive the current provider's migrations
    if current_provider:
        archive_migrations(current_provider)

    # Try to restore a previous migrations folder for the target provider
    restored = restore_migrations(cfg["provider"])

    if restored and has_migrations_lock_for(cfg["provider"]):
        # We have existing migrations for this provider — just deploy them
        print_ok(f"Found existing migrations for {cfg['display']} — deploying...")
        print_step(5, "Running prisma migrate deploy...")
        result = run(f"{prisma} migrate deploy")
        if result.returncode != 0:
            print_err("migrate deploy failed — trying migrate dev instead...")
            run(f"{prisma} migrate dev --name init")
    else:
        # No migrations for this provider — create fresh ones
        print_ok(f"No existing migrations for {cfg['display']} — creating fresh schema...")
        print_step(5, "Running prisma migrate dev --name init...")
        result = run(f"{prisma} migrate dev --name init")
        if result.returncode != 0:
            print_err("Migration failed. Check your DATABASE_URL in .env and try again.")
            sys.exit(1)

    # ── Step 4: Regenerate Prisma client ──────────────────────────────────
    print_step(6, "Regenerating Prisma client...")
    run(f"{prisma} generate")
    print_ok("Prisma client updated")

    # ── Done ───────────────────────────────────────────────────────────────
    print_header(f"✓ Switched to {cfg['display']} successfully!")
    print(f"\n  Restart uvicorn to apply the change:")
    print(f"  uvicorn app.main:app --reload\n")


if __name__ == "__main__":
    main()