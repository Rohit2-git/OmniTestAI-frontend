"""
One-time migration script: renames existing users' roles from the old
3-role system to the new 4-role system.

    viewer  -> qa_reviewer
    tester  -> qa_engineer
    admin   -> admin            (unchanged, no action needed)

Run this AFTER you've already run `prisma generate` / `prisma migrate`
for the updated schema.prisma, and BEFORE you rely on the new role
names anywhere in the app. It only touches existing rows — it does not
change the schema itself.

Run from your server's root directory (same place you run uvicorn from),
with your venv activated:

    python scripts/migrate_roles.py

It's safe to run more than once — rows already on the new role names
are simply skipped (count = 0 the second time).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import db  # noqa: E402

ROLE_RENAME_MAP = {
    "viewer": "qa_reviewer",
    "tester": "qa_engineer",
}


async def main() -> None:
    await db.connect()
    try:
        total_updated = 0

        for old_role, new_role in ROLE_RENAME_MAP.items():
            matching_users = await db.user.find_many(where={"role": old_role})

            if not matching_users:
                print(f"No users found with role '{old_role}'. Skipping.")
                continue

            print(f"Found {len(matching_users)} user(s) with role '{old_role}':")
            for u in matching_users:
                print(f"  - {u.email} (id={u.id})")

            result = await db.user.update_many(
                where={"role": old_role},
                data={"role": new_role},
            )
            print(f"Updated {result} user(s): '{old_role}' -> '{new_role}'\n")
            total_updated += result

        # Also migrate any RoleRequest rows that still reference the old
        # role names in requestedRole (e.g. old pending/historical requests
        # for "tester" should now read "qa_engineer").
        for old_role, new_role in ROLE_RENAME_MAP.items():
            matching_requests = await db.rolerequest.find_many(where={"requestedRole": old_role})
            if not matching_requests:
                continue
            result = await db.rolerequest.update_many(
                where={"requestedRole": old_role},
                data={"requestedRole": new_role},
            )
            print(f"Updated {result} role request(s): requestedRole '{old_role}' -> '{new_role}'")
            total_updated += result

        # Sanity check: report any role still outside the new 4-role set
        all_users = await db.user.find_many()
        valid_roles = {"admin", "qa_engineer", "qa_reviewer", "developer"}
        unexpected = [u for u in all_users if u.role not in valid_roles]

        if unexpected:
            print("⚠️  Warning — these users have a role outside the expected set:")
            for u in unexpected:
                print(f"  - {u.email}: role='{u.role}'")
        else:
            print(f"All {len(all_users)} user(s) now have a valid role.")

        print(f"\nDone. {total_updated} row(s) updated total.")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())