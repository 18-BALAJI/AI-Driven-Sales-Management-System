"""Explicit MySQL-first database configuration and startup migrations."""
import os
import sqlite3
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import pooling

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)

IS_PRODUCTION = os.environ.get("FLASK_ENV", "").lower() == "production" or os.environ.get("NODE_ENV", "").lower() == "production"
DEFAULT_COMPANY_ID = os.environ.get("DEFAULT_COMPANY_ID", "default-company")
DB_DRIVER = os.environ.get("DB_DRIVER", "mysql").strip().lower()
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
SQLITE_DB_PATH = os.environ.get("SQLITE_PATH", "").strip() or str(BACKEND_DIR / "dev.sqlite3")


class DatabaseStartupError(RuntimeError):
    """Raised when database configuration, connection, or migrations fail."""


def _mysql_config() -> dict:
    if DATABASE_URL:
        parsed = urlparse(DATABASE_URL)
        if parsed.scheme not in {"mysql", "mysql+mysqlconnector"}:
            raise DatabaseStartupError("DATABASE_URL must use mysql:// or mysql+mysqlconnector://.")
        if not parsed.hostname or not parsed.path.strip("/") or not parsed.username:
            raise DatabaseStartupError("DATABASE_URL must include a username, host, and database name.")
        query = parse_qs(parsed.query)
        try:
            port = parsed.port or 3306
        except ValueError as error:
            raise DatabaseStartupError("DATABASE_URL contains an invalid MySQL port.") from error
        password = unquote(parsed.password or "")
        if IS_PRODUCTION and not password:
            raise DatabaseStartupError("A non-empty MySQL password is required for production DATABASE_URL connections.")
        return {
            "host": parsed.hostname,
            "port": port,
            "user": unquote(parsed.username),
            "password": password,
            "database": unquote(parsed.path.strip("/")),
            "charset": query.get("charset", ["utf8mb4"])[0],
            "collation": "utf8mb4_unicode_ci",
        }

    user = os.environ.get("DB_USER", "").strip()
    if not user:
        raise DatabaseStartupError("MySQL is selected but DB_USER is missing. Set DATABASE_URL or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME.")
    if IS_PRODUCTION and not os.environ.get("DB_PASSWORD"):
        raise DatabaseStartupError("DB_PASSWORD is required for production MySQL connections.")
    try:
        port = int(os.environ.get("DB_PORT", "3306"))
    except ValueError as error:
        raise DatabaseStartupError("DB_PORT must be an integer between 1 and 65535.") from error
    if not 1 <= port <= 65535:
        raise DatabaseStartupError("DB_PORT must be an integer between 1 and 65535.")
    host = os.environ.get("DB_HOST", "127.0.0.1").strip()
    database = os.environ.get("DB_NAME", "profit_navigator").strip()
    if not host or not database:
        raise DatabaseStartupError("DB_HOST and DB_NAME must not be empty for MySQL connections.")
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": os.environ.get("DB_PASSWORD", ""),
        "database": database,
        "charset": "utf8mb4",
        "collation": "utf8mb4_unicode_ci",
    }


def _validate_driver() -> None:
    if DB_DRIVER not in {"mysql", "sqlite"}:
        raise DatabaseStartupError("DB_DRIVER must be either 'mysql' or 'sqlite'.")
    if IS_PRODUCTION and DB_DRIVER != "mysql":
        raise DatabaseStartupError("Production requires DB_DRIVER=mysql; SQLite is only supported for development and tests.")
    if DB_DRIVER == "sqlite" and DATABASE_URL:
        raise DatabaseStartupError("Do not set DATABASE_URL when DB_DRIVER=sqlite.")


_pool = None
_use_sqlite = DB_DRIVER == "sqlite"


def is_sqlite() -> bool:
    return _use_sqlite


def current_timestamp_sql() -> str:
    return "strftime('%Y-%m-%d %H:%M:%f', 'now')" if _use_sqlite else "UTC_TIMESTAMP(6)"


def _init_sqlite_schema() -> None:
    connection = sqlite3.connect(SQLITE_DB_PATH)
    try:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
                phone TEXT UNIQUE NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL,
                company_id TEXT NOT NULL DEFAULT 'default-company', avatar_url TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS login_otps (
                id TEXT PRIMARY KEY, identifier TEXT NOT NULL, user_id TEXT NULL,
                otp_hash TEXT NOT NULL, expires_at DATETIME NOT NULL, attempts INTEGER DEFAULT 0,
                used INTEGER DEFAULT 0, last_resend_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                token_hash TEXT PRIMARY KEY, revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL,
                category TEXT NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL,
                company_id TEXT NOT NULL DEFAULT 'default-company', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                price REAL NOT NULL, units_sold INTEGER DEFAULT 0, revenue REAL DEFAULT 0,
                trend TEXT DEFAULT 'stable', cluster TEXT DEFAULT 'question-mark',
                company_id TEXT NOT NULL DEFAULT 'default-company', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS forecasts (
                id TEXT PRIMARY KEY, period TEXT NOT NULL, predicted_revenue REAL NOT NULL,
                predicted_expenses REAL NOT NULL, confidence REAL DEFAULT 0,
                company_id TEXT NOT NULL DEFAULT 'default-company', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL,
                session_id TEXT DEFAULT 'default', company_id TEXT NOT NULL DEFAULT 'default-company',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tutorials (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NULL, youtube_id TEXT NOT NULL,
                target_role TEXT DEFAULT 'both', video_ids TEXT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS page_visibility (
                page_url TEXT NOT NULL, role TEXT NOT NULL, visible INTEGER DEFAULT 1,
                PRIMARY KEY (page_url, role)
            );
            CREATE TABLE IF NOT EXISTS pricing_recommendations (
                id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_name TEXT NOT NULL,
                current_price REAL NOT NULL, suggested_price REAL NOT NULL, reason TEXT NULL,
                confidence INTEGER DEFAULT 0, expected_impact TEXT NULL, model_used TEXT DEFAULT 'observed_log_log_elasticity',
                status TEXT DEFAULT 'pending', company_id TEXT NOT NULL DEFAULT 'default-company',
                price_elasticity REAL NULL, projected_units INTEGER NULL, projected_revenue REAL NULL,
                model_fit_r2 REAL NULL, sample_count INTEGER NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, reviewed_at DATETIME NULL
            );
            CREATE TABLE IF NOT EXISTS product_price_observations (
                id TEXT PRIMARY KEY, product_id TEXT NOT NULL, price REAL NOT NULL, units_sold INTEGER NOT NULL,
                period_start TEXT NOT NULL, period_end TEXT NOT NULL,
                company_id TEXT NOT NULL DEFAULT 'default-company', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        sqlite_columns = {
            "users": {"phone": "TEXT NULL", "avatar_url": "TEXT NULL", "company_id": "TEXT NOT NULL DEFAULT 'default-company'"},
            "transactions": {"company_id": "TEXT NOT NULL DEFAULT 'default-company'"},
            "products": {"company_id": "TEXT NOT NULL DEFAULT 'default-company'"},
            "forecasts": {"company_id": "TEXT NOT NULL DEFAULT 'default-company'"},
            "chat_messages": {"company_id": "TEXT NOT NULL DEFAULT 'default-company'"},
            "tutorials": {"video_ids": "TEXT NULL"},
            "pricing_recommendations": {
                "company_id": "TEXT NOT NULL DEFAULT 'default-company'",
                "price_elasticity": "REAL NULL",
                "projected_units": "INTEGER NULL",
                "projected_revenue": "REAL NULL",
                "model_fit_r2": "REAL NULL",
                "sample_count": "INTEGER NULL",
            },
        }
        for table_name, columns in sqlite_columns.items():
            current_columns = {
                row[1] for row in connection.execute(f"PRAGMA table_info(`{table_name}`)").fetchall()
            }
            for column_name, column_type in columns.items():
                if column_name not in current_columns:
                    connection.execute(f"ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {column_type}")
        connection.execute("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)", ("001_initial_schema",))
        connection.execute("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)", ("002_company_and_ml_columns",))
        connection.commit()
    finally:
        connection.close()


def _convert_sql(sql: str) -> str:
    return sql.replace("%s", "?") if _use_sqlite else sql


def get_connection():
    if _use_sqlite:
        connection = sqlite3.connect(SQLITE_DB_PATH)
        connection.row_factory = sqlite3.Row
        return connection
    if _pool is None:
        raise DatabaseStartupError("Database has not been initialized. Call initialize_database() before serving requests.")
    return _pool.get_connection()


def query(sql, params=None, dictionary=True):
    connection = get_connection()
    try:
        if _use_sqlite:
            cursor = connection.cursor()
            cursor.execute(_convert_sql(sql), params or ())
            return [dict(row) for row in cursor.fetchall()]
        cursor = connection.cursor(dictionary=dictionary)
        cursor.execute(sql, params or ())
        rows = cursor.fetchall()
        cursor.close()
        return rows
    finally:
        connection.close()


def execute(sql, params=None):
    connection = get_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(_convert_sql(sql), params or ())
        connection.commit()
        last_id = cursor.lastrowid
        cursor.close()
        return last_id
    finally:
        connection.close()


def execute_many(sql, data):
    connection = get_connection()
    try:
        cursor = connection.cursor()
        cursor.executemany(_convert_sql(sql), data)
        connection.commit()
        cursor.close()
    finally:
        connection.close()


def _column_exists(table_name: str, column_name: str) -> bool:
    rows = query(
        "SELECT COUNT(*) AS count FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
        (table_name, column_name),
    )
    return bool(rows and rows[0]["count"])


def _apply_mysql_migrations() -> None:
    migration_table = (
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "version VARCHAR(100) NOT NULL PRIMARY KEY, "
        "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    )
    execute(migration_table)

    schema_path = BACKEND_DIR / "schema.sql"
    schema_lines = schema_path.read_text(encoding="utf-8").splitlines()
    schema_sql = "\n".join(line for line in schema_lines if not line.lstrip().startswith("--"))
    for statement in schema_sql.split(";"):
        statement = statement.strip()
        if statement:
            execute(statement)
    execute("INSERT IGNORE INTO schema_migrations (version) VALUES (%s)", ("001_initial_schema",))

    required_columns = {
        "users": {
            "phone": "VARCHAR(30) NULL",
            "avatar_url": "MEDIUMTEXT NULL",
            "company_id": "VARCHAR(64) NOT NULL DEFAULT 'default-company'",
        },
        "transactions": {"company_id": "VARCHAR(64) NOT NULL DEFAULT 'default-company'"},
        "products": {"company_id": "VARCHAR(64) NOT NULL DEFAULT 'default-company'"},
        "forecasts": {"company_id": "VARCHAR(64) NOT NULL DEFAULT 'default-company'"},
        "chat_messages": {"company_id": "VARCHAR(64) NOT NULL DEFAULT 'default-company'"},
        "pricing_recommendations": {
            "company_id": "VARCHAR(64) NOT NULL DEFAULT 'default-company'",
            "price_elasticity": "DECIMAL(8,4) NULL",
            "projected_units": "INT NULL",
            "projected_revenue": "DECIMAL(12,2) NULL",
            "model_fit_r2": "DECIMAL(8,4) NULL",
            "sample_count": "INT NULL",
        },
        "tutorials": {"video_ids": "JSON NULL"},
    }
    for table_name, columns in required_columns.items():
        for column_name, column_type in columns.items():
            if not _column_exists(table_name, column_name):
                execute(f"ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {column_type}")

    execute("ALTER TABLE tutorials MODIFY COLUMN title TEXT NOT NULL")
    execute("ALTER TABLE tutorials MODIFY COLUMN description TEXT NULL")
    execute("ALTER TABLE chat_messages MODIFY COLUMN created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)")

    execute("INSERT IGNORE INTO schema_migrations (version) VALUES (%s)", ("002_company_and_ml_columns",))


def initialize_database() -> None:
    """Connect and migrate the explicitly selected backend; never change drivers on failure."""
    global _pool
    _validate_driver()
    if _use_sqlite:
        if IS_PRODUCTION:
            raise DatabaseStartupError("SQLite cannot be used in production.")
        _init_sqlite_schema()
        print(f">>> Database ready: explicit SQLite development/test database ({SQLITE_DB_PATH})")
        return

    config = _mysql_config()
    try:
        _pool = pooling.MySQLConnectionPool(
            pool_name="profit_navigator_pool",
            pool_size=10,
            pool_reset_session=True,
            **config,
        )
        connection = _pool.get_connection()
        connection.close()
        _apply_mysql_migrations()
    except Exception as error:
        _pool = None
        errno = getattr(error, "errno", None)
        server_message = str(getattr(error, "msg", "") or "").strip()
        if config["password"]:
            server_message = server_message.replace(config["password"], "[redacted]")
        detail = f"MySQL error {errno}: {server_message}" if errno and server_message else f"MySQL error {errno}" if errno else "MySQL connection or migration error"
        raise DatabaseStartupError(
            f"Database startup failed for MySQL at {config['host']}:{config['port']}/{config['database']} ({detail}). "
            "Check DATABASE_URL or DB_* settings, confirm the database exists, and grant the configured user schema privileges."
        ) from None
    print(f">>> Database ready: MySQL {config['host']}:{config['port']}/{config['database']} (schema migrated)")


initialize_database()

