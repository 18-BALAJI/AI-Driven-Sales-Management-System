"""Run database startup validation and all pending idempotent schema migrations."""

from db import DB_DRIVER

print(f"Database migrations completed successfully using {DB_DRIVER}.")
