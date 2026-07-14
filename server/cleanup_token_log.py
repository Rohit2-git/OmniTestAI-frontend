"""
One-time cleanup: remove token-usage entries belonging to app_ids that no
longer exist, so historical spend from deleted/recreated apps stops being
counted in "All Apps" totals.

Run this from your `server/` directory (same place you run uvicorn from),
with your venv active, AFTER confirming the app_ids to keep below.

Usage:
    python cleanup_token_log.py --dry-run     # preview only, changes nothing
    python cleanup_token_log.py               # actually rewrites the file
"""
import json
import os
import sys
import shutil
from datetime import datetime

LOG_PATH = os.path.join(os.path.dirname(__file__), "token_usage_log.json")

# Fill this in with the app_id(s) that currently exist / should be kept.
# Get the real, current SwagLabs id from Prisma Studio (Application table)
# or the /api/applications response — don't guess from memory.
KEEP_APP_IDS = {
    "app-1783866045851",  # SwagLabs (WEB) - confirm this is still correct
}

def main():
    dry_run = "--dry-run" in sys.argv

    if not os.path.exists(LOG_PATH):
        print(f"No log file found at {LOG_PATH}")
        return

    with open(LOG_PATH, "r") as f:
        entries = json.load(f)

    kept = [e for e in entries if e.get("app_id") in KEEP_APP_IDS]
    dropped = [e for e in entries if e.get("app_id") not in KEEP_APP_IDS]

    dropped_tokens = sum(e.get("total_tokens", 0) for e in dropped)
    kept_tokens = sum(e.get("total_tokens", 0) for e in kept)

    print(f"Total entries in file:  {len(entries)}")
    print(f"Entries to KEEP:        {len(kept)}  ({kept_tokens:,} tokens)")
    print(f"Entries to DROP:        {len(dropped)}  ({dropped_tokens:,} tokens)")
    print()

    from collections import Counter
    dropped_ids = Counter(e.get("app_id") for e in dropped)
    print("Dropped app_ids breakdown:")
    for aid, count in dropped_ids.most_common():
        print(f"  {aid!r}: {count} entries")

    if dry_run:
        print("\n--dry-run set: no changes made. Re-run without --dry-run to apply.")
        return

    backup_path = LOG_PATH + f".backup-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    shutil.copy2(LOG_PATH, backup_path)
    print(f"\nBackup written to: {backup_path}")

    with open(LOG_PATH, "w") as f:
        json.dump(kept, f)

    print(f"Cleaned log written to: {LOG_PATH}")
    print(f"Kept {len(kept)} entries, removed {len(dropped)}.")

if __name__ == "__main__":
    main()