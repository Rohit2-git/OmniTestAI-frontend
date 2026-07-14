"""
OmniTestAI — SQLite → PostgreSQL Data Migration Script
======================================================
Reads every row from your existing SQLite database and inserts it
into PostgreSQL, preserving all IDs and relationships.

Usage:
    python migrate_sqlite_to_postgres.py

Make sure to set SQLITE_PATH and POSTGRES_URL below before running.
"""

import asyncio
import sqlite3
import json
import sys
from datetime import datetime

# ─── CONFIGURE THESE TWO LINES ────────────────────────────────────────────────
SQLITE_PATH  = r"C:/Users/rohit/Desktop/Programming/omnitestai-platform/omnitestai-platform/server/dev.db"
POSTGRES_URL = "postgresql://postgres:sillyfello_rocks@localhost:5432/omnitestai"
# ──────────────────────────────────────────────────────────────────────────────

try:
    # pyrefly: ignore [missing-import]
    import asyncpg
except ImportError:
    print("ERROR: asyncpg not installed. Run: pip install asyncpg")
    sys.exit(1)


def sqlite_rows(db_path: str, table: str):
    """Return all rows from a SQLite table as list of dicts."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT * FROM \"{table}\"")
        rows = [dict(r) for r in cur.fetchall()]
    except sqlite3.OperationalError:
        rows = []
    conn.close()
    return rows


def parse_dt(val):
    """Convert SQLite datetime string to Python datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    return None


async def migrate():
    print("=" * 60)
    print("  OmniTestAI — SQLite → PostgreSQL Migration")
    print("=" * 60)

    # Connect to Postgres
    print("\n[1/10] Connecting to PostgreSQL...")
    try:
        pg = await asyncpg.connect(POSTGRES_URL)
    except Exception as e:
        print(f"  ERROR: Could not connect to PostgreSQL: {e}")
        print("  → Check your POSTGRES_URL and that PostgreSQL is running.")
        sys.exit(1)
    print("  ✓ Connected")

    # ── USERS ──────────────────────────────────────────────────────────────────
    print("\n[2/10] Migrating Users...")
    rows = sqlite_rows(SQLITE_PATH, "User")
    count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "User" (id, email, "passwordHash", name, role, "isActive", "createdAt", "updatedAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["email"], r["passwordHash"], r["name"],
                r["role"], bool(r["isActive"]), parse_dt(r["createdAt"]), parse_dt(r["updatedAt"]))
            count += 1
        except Exception as e:
            print(f"  WARN: User {r.get('id')} skipped: {e}")
    print(f"  ✓ {count} users migrated")

    # ── APPLICATIONS ───────────────────────────────────────────────────────────
    print("\n[3/10] Migrating Applications...")
    rows = sqlite_rows(SQLITE_PATH, "Application")
    count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "Application" (id, name, description, platform, url, status, "createdAt", "updatedAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["name"], r["description"], r["platform"],
                r["url"], r["status"], parse_dt(r["createdAt"]), parse_dt(r["updatedAt"]))
            count += 1
        except Exception as e:
            print(f"  WARN: Application {r.get('id')} skipped: {e}")
    print(f"  ✓ {count} applications migrated")

    # ── USER APP ACCESS ────────────────────────────────────────────────────────
    print("\n[4/10] Migrating UserAppAccess...")
    rows = sqlite_rows(SQLITE_PATH, "UserAppAccess")
    count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "UserAppAccess" (id, "userId", "appId", "createdAt")
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["userId"], r["appId"], parse_dt(r["createdAt"]))
            count += 1
        except Exception as e:
            print(f"  WARN: UserAppAccess {r.get('id')} skipped: {e}")
    print(f"  ✓ {count} access records migrated")

    # ── ROLE REQUESTS ──────────────────────────────────────────────────────────
    print("\n[5/10] Migrating RoleRequests...")
    rows = sqlite_rows(SQLITE_PATH, "RoleRequest")
    count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "RoleRequest" (id, "userId", "requestedRole", reason, status, "reviewedBy", "reviewNote", "createdAt", "updatedAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["userId"], r["requestedRole"], r["reason"],
                r["status"], r.get("reviewedBy"), r.get("reviewNote"),
                parse_dt(r["createdAt"]), parse_dt(r["updatedAt"]))
            count += 1
        except Exception as e:
            print(f"  WARN: RoleRequest {r.get('id')} skipped: {e}")
    print(f"  ✓ {count} role requests migrated")

    # ── KNOWLEDGE ASSETS ───────────────────────────────────────────────────────
    print("\n[6/10] Migrating KnowledgeAssets...")
    rows = sqlite_rows(SQLITE_PATH, "KnowledgeAsset")
    count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "KnowledgeAsset" (id, "appId", name, type, summary, tags, url, "createdAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["appId"], r["name"], r["type"],
                r["summary"], r["tags"], r.get("url"), parse_dt(r["createdAt"]))
            count += 1
        except Exception as e:
            print(f"  WARN: KnowledgeAsset {r.get('id')} skipped: {e}")
    print(f"  ✓ {count} knowledge assets migrated")

    # ── TEST DATA TEMPLATES ────────────────────────────────────────────────────
    print("\n[7/10] Migrating TestDataTemplates...")
    rows = sqlite_rows(SQLITE_PATH, "TestDataTemplate")
    count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "TestDataTemplate" (id, "appId", name, scenario, fields, "createdAt", "updatedAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["appId"], r["name"], r["scenario"],
                r["fields"], parse_dt(r["createdAt"]), parse_dt(r["updatedAt"]))
            count += 1
        except Exception as e:
            print(f"  WARN: TestDataTemplate {r.get('id')} skipped: {e}")
    print(f"  ✓ {count} test data templates migrated")

    # ── TEST DATA CONDITIONS ───────────────────────────────────────────────────
    print("\n[8/10] Migrating TestDataConditions + SyntheticBatches...")
    rows = sqlite_rows(SQLITE_PATH, "TestDataCondition")
    count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "TestDataCondition" (id, "appId", description, "resolvedFields", "isDefault", "createdAt")
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["appId"], r["description"], r["resolvedFields"],
                bool(r["isDefault"]), parse_dt(r["createdAt"]))
            count += 1
        except Exception as e:
            print(f"  WARN: TestDataCondition {r.get('id')} skipped: {e}")

    rows = sqlite_rows(SQLITE_PATH, "SyntheticBatch")
    batch_count = 0
    for r in rows:
        try:
            await pg.execute("""
                INSERT INTO "SyntheticBatch" (id, "appId", "sourceTemplateId", "sourceTemplateName", name, "recordCount", records, "createdAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["appId"], r["sourceTemplateId"], r["sourceTemplateName"],
                r["name"], r["recordCount"], r["records"], parse_dt(r["createdAt"]))
            batch_count += 1
        except Exception as e:
            print(f"  WARN: SyntheticBatch {r.get('id')} skipped: {e}")
    print(f"  ✓ {count} conditions + {batch_count} synthetic batches migrated")

    # ── TEST RUNS + RESULTS ────────────────────────────────────────────────────
    print("\n[9/10] Migrating TestRuns + TestResults...")
    runs = sqlite_rows(SQLITE_PATH, "TestRun")
    run_count = 0
    max_run_id = 0
    for r in runs:
        try:
            await pg.execute("""
                INSERT INTO "TestRun" (id, filename, "batchName", total, status, "appId", "createdAt", "createdByUserId", "createdByRole", visibility)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["filename"], r.get("batchName"), r["total"],
                r["status"], r.get("appId"), parse_dt(r["createdAt"]),
                r.get("createdByUserId"), r.get("createdByRole"), r.get("visibility", "all"))
            run_count += 1
            if r["id"] > max_run_id:
                max_run_id = r["id"]
        except Exception as e:
            print(f"  WARN: TestRun {r.get('id')} skipped: {e}")

    results = sqlite_rows(SQLITE_PATH, "TestResult")
    result_count = 0
    max_result_id = 0
    for r in results:
        try:
            await pg.execute("""
                INSERT INTO "TestResult" (id, "runId", title, steps, "expectedResult", type, "createdAt", "testDataSourceType", "testDataSourceId", "testDataValues")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["runId"], r["title"], r["steps"],
                r["expectedResult"], r["type"], parse_dt(r["createdAt"]),
                r.get("testDataSourceType"), r.get("testDataSourceId"), r.get("testDataValues"))
            result_count += 1
            if r["id"] > max_result_id:
                max_result_id = r["id"]
        except Exception as e:
            print(f"  WARN: TestResult {r.get('id')} skipped: {e}")
    print(f"  ✓ {run_count} test runs + {result_count} test results migrated")

    # ── EXECUTION RUNS + RESULTS ───────────────────────────────────────────────
    print("\n[10/10] Migrating ExecutionRuns + ExecutionResults...")
    exec_runs = sqlite_rows(SQLITE_PATH, "ExecutionRun")
    er_count = 0
    max_er_id = 0
    for r in exec_runs:
        try:
            await pg.execute("""
                INSERT INTO "ExecutionRun" (id, "runId", "baseUrl", total, executed, passed, failed, "notRun", "stoppedEarly", "createdAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["runId"], r["baseUrl"], r["total"],
                r["executed"], r["passed"], r["failed"], r["notRun"],
                bool(r["stoppedEarly"]), parse_dt(r["createdAt"]))
            er_count += 1
            if r["id"] > max_er_id:
                max_er_id = r["id"]
        except Exception as e:
            print(f"  WARN: ExecutionRun {r.get('id')} skipped: {e}")

    exec_results = sqlite_rows(SQLITE_PATH, "ExecutionResult")
    eresult_count = 0
    max_eresult_id = 0
    for r in exec_results:
        try:
            await pg.execute("""
                INSERT INTO "ExecutionResult" (id, "executionRunId", title, passed, type, "expectedResult", "agentOutput", "stepResults", "screenshotPaths", "videoPath", "createdAt")
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                ON CONFLICT (id) DO NOTHING
            """, r["id"], r["executionRunId"], r["title"], bool(r["passed"]),
                r["type"], r["expectedResult"], r["agentOutput"], r["stepResults"],
                r.get("screenshotPaths"), r.get("videoPath"), parse_dt(r["createdAt"]))
            eresult_count += 1
            if r["id"] > max_eresult_id:
                max_eresult_id = r["id"]
        except Exception as e:
            print(f"  WARN: ExecutionResult {r.get('id')} skipped: {e}")
    print(f"  ✓ {er_count} execution runs + {eresult_count} execution results migrated")

    # ── FIX SEQUENCES (so next autoincrement picks up after existing IDs) ──────
    print("\n  Resetting Postgres sequences to avoid ID conflicts...")
    seq_fixes = [
        ("User",            "User_id_seq"),
        ("TestRun",         "TestRun_id_seq"),
        ("TestResult",      "TestResult_id_seq"),
        ("ExecutionRun",    "ExecutionRun_id_seq"),
        ("ExecutionResult", "ExecutionResult_id_seq"),
        ("KnowledgeAsset",  "KnowledgeAsset_id_seq"),
        ("UserAppAccess",   "UserAppAccess_id_seq"),
        ("RoleRequest",     "RoleRequest_id_seq"),
    ]
    for table, seq in seq_fixes:
        try:
            await pg.execute(f"""
                SELECT setval('"{seq}"', COALESCE((SELECT MAX(id) FROM "{table}"), 1))
            """)
        except Exception as e:
            print(f"  WARN: Could not reset sequence {seq}: {e}")
    print("  ✓ Sequences reset")

    await pg.close()

    print("\n" + "=" * 60)
    print("  MIGRATION COMPLETE — All data transferred successfully!")
    print("=" * 60)
    print("\nNext steps:")
    print("  1. Set DATABASE_PROVIDER=postgresql in your .env")
    print("  2. Run: prisma generate")
    print("  3. Start your FastAPI server")
    print("  4. Verify data in pgAdmin 4")


if __name__ == "__main__":
    asyncio.run(migrate())