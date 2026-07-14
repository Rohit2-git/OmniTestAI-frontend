# ── Backend: FastAPI + Prisma ──────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps needed by some Python packages (bcrypt, Prisma's binary
# engine downloader, Playwright if the backend ever launches a browser
# directly) — kept minimal on purpose.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    openssl \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first so this layer is cached unless requirements.txt
# actually changes — avoids re-installing everything on every code change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# `pip install playwright` only installs the Python package — it does NOT
# download the actual browser binary the code launches at runtime. Without
# this step, p.chromium.launch(...) fails with "Executable doesn't exist at
# .../chrome-headless-shell" the first time a test is executed, since
# nothing ever put a browser on disk. --with-deps also installs the OS-level
# shared libraries Chromium needs (fonts, libnss3, libgbm, etc.) that a
# minimal python:3.11-slim image doesn't have by default. Only installing
# chromium (not firefox/webkit too) since that's the only engine this app
# actually launches — keeps the image smaller.
RUN playwright install --with-deps chromium

# NOTE: adjust this path if your schema.prisma lives somewhere else
# (e.g. ./prisma/schema.prisma vs ./schema.prisma at the server root).
COPY . .

# Generates the Prisma Python client from schema.prisma. This must happen
# AFTER the schema file is copied in, and is safe to do at build time —
# it doesn't need a live DB connection, just the schema file.
RUN prisma generate

# entrypoint.sh waits for Postgres to be reachable, then runs
# `prisma db push` (or `prisma migrate deploy` if you're using migrations)
# before starting the actual server — see entrypoint.sh for details.
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]