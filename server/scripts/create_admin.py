"""
One-time script to create your first admin account (or promote an
existing user to admin).

Run from your server's root directory (same place you run uvicorn from),
with your venv activated:

    python scripts/create_admin.py

It will prompt for an email, name, and password. If a user with that
email already exists, it promotes them to admin instead of creating a
duplicate.

You can also pass everything as arguments to skip the prompts:

    python scripts/create_admin.py --email you@company.com --name "Your Name" --password "yourpassword"
"""
import argparse
import asyncio
import getpass
import sys
from pathlib import Path

# Allow running this script directly via `python scripts/create_admin.py`
# from the project root, without needing to install the project as a package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import db  # noqa: E402
from app.auth.security import hash_password  # noqa: E402


async def main(email: str, name: str, password: str) -> None:
    await db.connect()
    try:
        existing = await db.user.find_unique(where={"email": email})

        if existing:
            if existing.role == "admin":
                print(f"'{email}' is already an admin. Nothing to do.")
                return

            await db.user.update(
                where={"email": email},
                data={"role": "admin", "isActive": True},
            )
            print(f"Promoted existing user '{email}' to admin.")
            return

        await db.user.create(
            data={
                "email": email,
                "name": name,
                "passwordHash": hash_password(password),
                "role": "admin",
            }
        )
        print(f"Created new admin user '{email}'.")
    finally:
        await db.disconnect()


def prompt_for_missing(args: argparse.Namespace) -> argparse.Namespace:
    if not args.email:
        args.email = input("Admin email: ").strip()
    if not args.name:
        args.name = input("Admin full name: ").strip()
    if not args.password:
        args.password = getpass.getpass("Admin password: ")
    return args


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create or promote a user to admin.")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--name", help="Admin full name")
    parser.add_argument("--password", help="Admin password")
    parsed_args = parser.parse_args()

    parsed_args = prompt_for_missing(parsed_args)

    if not parsed_args.email or not parsed_args.password:
        print("Email and password are required.")
        sys.exit(1)

    asyncio.run(main(parsed_args.email, parsed_args.name or "Admin", parsed_args.password))