# Profit Navigator

Profit Navigator is a Vite/React dashboard backed by a Flask API. MySQL is the required application database; SQLite is available only when explicitly selected for local development or tests.

## MySQL setup (Windows)

Install MySQL Server 8.0 and the MySQL command-line client. Start the service from an elevated PowerShell if it is stopped:

```powershell
Get-Service MySQL80
Start-Service MySQL80
```

Connect as a MySQL administrator:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p
```

Create an application database and a dedicated user. Replace the example password with a strong, unique value; do not put it in source control:

```sql
CREATE DATABASE profit_navigator CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'profit_navigator_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_UNIQUE_PASSWORD';
GRANT ALL PRIVILEGES ON profit_navigator.* TO 'profit_navigator_app'@'localhost';
```

At the repository root, copy `.env.example` to `.env` and set `DB_DRIVER=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER=profit_navigator_app`, `DB_PASSWORD` to the password you chose, and `DB_NAME=profit_navigator`. Alternatively, set one `DATABASE_URL` such as `mysql://profit_navigator_app:URL_ENCODED_PASSWORD@127.0.0.1:3306/profit_navigator`. URL-encode reserved characters in the password. If `DATABASE_URL` is set, it takes precedence over the individual `DB_*` settings.

The configured MySQL user needs `SELECT`, `INSERT`, `UPDATE`, and `DELETE` plus schema migration privileges (`CREATE`, `ALTER`, and `INDEX`) on `profit_navigator`. The database itself must already exist. Credentials are read from the environment; invalid MySQL config or an unavailable server stops startup with a sanitized error. The app never switches to SQLite after a MySQL failure.

Install backend dependencies and run migrations explicitly:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\python\requirements.txt
python backend\migrate.py
```

`migrate.py` validates the MySQL connection, creates missing tables from `backend/schema.sql`, and applies idempotent upgrades recorded in `schema_migrations`. The API also validates and migrates before serving requests. Startup fails if connection or migration fails.

## Seed demo data

Set `DEMO_OWNER_EMAIL` and `DEMO_OWNER_PASSWORD` in `.env`. Optional manager and analyst accounts are created when both their email and password variables are set. Then run:

```powershell
python backend\seed_data.py --demo --company-id demo-company
```

The command seeds one year of sample transactions, products, and the configured demo accounts. It replaces transactions and products only for the selected company. Add `--keep` to append instead. Seeding is never performed automatically when the server starts.

## Run the application

In one terminal:

```powershell
python backend\app.py
```

In another terminal:

```powershell
npm install
npm run dev -- --host 0.0.0.0 --port 8080
```

Open http://localhost:8080. The API health endpoint is http://localhost:5000/api/health.

## MySQL integration verification

Use a dedicated, disposable MySQL database (for example `profit_navigator_test`) and configure `.env` to point at it. The integration test refuses SQLite and uses a random company ID so it can clean up its own test rows:

```powershell
$env:DB_NAME='profit_navigator_test'
$env:RUN_MYSQL_INTEGRATION='1'
python -m unittest backend.test_mysql_integration -v
```

The test verifies migrations and MySQL-backed demo seeding, authentication, transaction and product CRUD, forecasting, anomaly detection, segmentation, price observations/recommendations, and analyst approval. Do not run it against production data.

## SQLite development/test option

SQLite is opt-in and is rejected in production. For local work without MySQL, set:

```powershell
$env:DB_DRIVER='sqlite'
$env:SQLITE_PATH='backend/dev.sqlite3'
```

For tests, point `SQLITE_PATH` at a temporary database. A MySQL connection failure is never treated as permission to use SQLite.
