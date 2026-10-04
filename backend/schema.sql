-- Profit Navigator MySQL schema.
-- Create/select DB_NAME before running this schema; credentials come from DATABASE_URL or DB_*.

-- ── Users (authentication: owner / shop manager / financial analyst) ─────────
CREATE TABLE IF NOT EXISTS users (
    id            CHAR(36)       NOT NULL DEFAULT (UUID()),
    name          VARCHAR(120)   NOT NULL,
    email         VARCHAR(190)   NOT NULL,
    phone         VARCHAR(30)    NULL,
    password_hash VARCHAR(255)   NOT NULL,
    role          ENUM('owner','manager','analyst') NOT NULL,
    company_id    VARCHAR(64)    NOT NULL DEFAULT 'default-company',
    avatar_url    MEDIUMTEXT     NULL,
    created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── OTP Login Attempts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_otps (
    id            CHAR(36)       NOT NULL DEFAULT (UUID()),
    identifier    VARCHAR(190)   NOT NULL,
    user_id       CHAR(36)       NULL,
    otp_hash      VARCHAR(255)   NOT NULL,
    expires_at    TIMESTAMP      NOT NULL,
    attempts      INT            NOT NULL DEFAULT 0,
    used          TINYINT(1)     NOT NULL DEFAULT 0,
    last_resend_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_otps_identifier (identifier),
    INDEX idx_otps_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Revoked Tokens (Logout Blacklist) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revoked_tokens (
    token_hash    VARCHAR(255)   NOT NULL,
    revoked_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id          CHAR(36)       NOT NULL DEFAULT (UUID()),
    date        DATE           NOT NULL,
    description VARCHAR(255)   NOT NULL,
    category    VARCHAR(100)   NOT NULL,
    amount      DECIMAL(12,2)  NOT NULL,
    type        ENUM('income','expense') NOT NULL,
    company_id VARCHAR(64) NOT NULL DEFAULT 'default-company',
    created_at  TIMESTAMP(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_transactions_date (date),
    INDEX idx_transactions_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id          CHAR(36)       NOT NULL DEFAULT (UUID()),
    name        VARCHAR(255)   NOT NULL,
    category    VARCHAR(100)   NOT NULL,
    price       DECIMAL(10,2)  NOT NULL,
    units_sold  INT            NOT NULL DEFAULT 0,
    revenue     DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
    trend       VARCHAR(20)    NOT NULL DEFAULT 'stable',
    cluster     VARCHAR(30)    NOT NULL DEFAULT 'question-mark',
    company_id VARCHAR(64) NOT NULL DEFAULT 'default-company',
    created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_products_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Forecasts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forecasts (
    id                  CHAR(36)       NOT NULL DEFAULT (UUID()),
    period              VARCHAR(20)    NOT NULL,
    predicted_revenue   DECIMAL(12,2)  NOT NULL,
    predicted_expenses  DECIMAL(12,2)  NOT NULL,
    confidence          DECIMAL(5,4)   NOT NULL DEFAULT 0.0000,
    company_id          VARCHAR(64)    NOT NULL DEFAULT 'default-company',
    created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Chat Messages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id          CHAR(36)       NOT NULL DEFAULT (UUID()),
    role        VARCHAR(20)    NOT NULL,
    content     TEXT           NOT NULL,
    session_id  VARCHAR(100)   NOT NULL DEFAULT 'default',
    company_id VARCHAR(64) NOT NULL DEFAULT 'default-company',
    created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_chat_session (session_id),
    INDEX idx_chat_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Tutorials (managed by Financial Analyst) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tutorials (
    id           CHAR(36)      NOT NULL DEFAULT (UUID()),
    title        VARCHAR(255)  NOT NULL,
    description  TEXT          NULL,
    youtube_id   VARCHAR(20)   NOT NULL,
    target_role  ENUM('owner','manager','both') NOT NULL DEFAULT 'both',
    -- Optional per-language YouTube IDs, e.g. {"hi":"abc","te":"xyz"}.
    -- youtube_id remains the default (English) video / fallback.
    video_ids    JSON          NULL,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tutorials_role (target_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Page Visibility (Analyst controls which pages owner/manager can see) ──────
CREATE TABLE IF NOT EXISTS page_visibility (
    page_url   VARCHAR(100)             NOT NULL,
    role       ENUM('owner','manager')  NOT NULL,
    visible    TINYINT(1)               NOT NULL DEFAULT 1,
    PRIMARY KEY (page_url, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── AI Pricing Recommendations (with Analyst approval workflow) ──────────────
CREATE TABLE IF NOT EXISTS pricing_recommendations (
    id              CHAR(36)       NOT NULL DEFAULT (UUID()),
    product_id      CHAR(36)       NOT NULL,
    product_name    VARCHAR(255)   NOT NULL,
    current_price   DECIMAL(10,2)  NOT NULL,
    suggested_price DECIMAL(10,2)  NOT NULL,
    reason          TEXT           NULL,
    confidence      INT            NOT NULL DEFAULT 0,
    expected_impact VARCHAR(255)   NULL,
    model_used      VARCHAR(30)    NOT NULL DEFAULT 'rule_based',
    status          ENUM('pending','approved','rejected','applied') NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at     TIMESTAMP      NULL DEFAULT NULL,
    company_id      VARCHAR(64)    NOT NULL DEFAULT 'default-company',
    price_elasticity DECIMAL(8,4)  NULL,
    projected_units INT            NULL,
    projected_revenue DECIMAL(12,2) NULL,
    model_fit_r2 DECIMAL(8,4)      NULL,
    sample_count INT               NULL,
    PRIMARY KEY (id),
    INDEX idx_pricing_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Database version history is maintained by backend/db.py migrations.

-- Price/quantity periods entered after comparable pricing tests.
CREATE TABLE IF NOT EXISTS product_price_observations (
    id            CHAR(36)      NOT NULL,
    product_id    CHAR(36)      NOT NULL,
    price         DECIMAL(12,4) NOT NULL,
    units_sold    INT            NOT NULL,
    period_start  DATE           NOT NULL,
    period_end    DATE           NOT NULL,
    company_id    VARCHAR(64)    NOT NULL DEFAULT 'default-company',
    created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_price_observations_product_period (product_id, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
