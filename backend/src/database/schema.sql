-- Resi Fintech Database Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(32) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    transaction_pin VARCHAR(255) DEFAULT '1234',
    tier INT DEFAULT 1,
    is_verified BOOLEAN DEFAULT FALSE,
    is_suspended BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    account_number VARCHAR(16) UNIQUE NOT NULL,
    bank_name VARCHAR(64) DEFAULT 'Resi M-Bank Kenya',
    balance NUMERIC(15, 2) DEFAULT 0.00,
    ledger_balance NUMERIC(15, 2) DEFAULT 0.00,
    currency VARCHAR(8) DEFAULT 'KES',
    is_frozen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    wallet_id VARCHAR(64) REFERENCES wallets(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL, -- 'DEPOSIT', 'WITHDRAWAL', 'INVESTMENT', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'INVESTMENT_RETURN'
    amount NUMERIC(15, 2) NOT NULL,
    fee NUMERIC(15, 2) DEFAULT 0.00,
    status VARCHAR(32) DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'FAILED'
    reference VARCHAR(128) UNIQUE NOT NULL,
    channel VARCHAR(32) DEFAULT 'PAYSTACK',
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investment_plans (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    annual_percentage_yield NUMERIC(6, 2) NOT NULL,
    duration_days INT NOT NULL,
    min_amount NUMERIC(15, 2) NOT NULL,
    max_amount NUMERIC(15, 2) NOT NULL,
    risk_level VARCHAR(16) DEFAULT 'LOW', -- 'LOW', 'MODERATE', 'HIGH'
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investments (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(64) REFERENCES investment_plans(id),
    principal_amount NUMERIC(15, 2) NOT NULL,
    expected_return NUMERIC(15, 2) NOT NULL,
    actual_return NUMERIC(15, 2) DEFAULT 0.00,
    duration_days INT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    maturity_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) DEFAULT 'ACTIVE', -- 'ACTIVE', 'MATURED', 'LIQUIDATED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loans (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    interest_rate NUMERIC(6, 2) NOT NULL,
    total_payable NUMERIC(15, 2) NOT NULL,
    amount_paid NUMERIC(15, 2) DEFAULT 0.00,
    tenure_months INT NOT NULL,
    monthly_installment NUMERIC(15, 2) NOT NULL,
    purpose TEXT,
    status VARCHAR(32) DEFAULT 'ACTIVE', -- 'PENDING', 'APPROVED', 'ACTIVE', 'COMPLETED', 'DEFAULTED'
    disbursed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loan_schedules (
    id VARCHAR(64) PRIMARY KEY,
    loan_id VARCHAR(64) REFERENCES loans(id) ON DELETE CASCADE,
    installment_number INT NOT NULL,
    amount_due NUMERIC(15, 2) NOT NULL,
    amount_paid NUMERIC(15, 2) DEFAULT 0.00,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING', -- 'PENDING', 'PAID', 'OVERDUE'
    paid_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS beneficiaries (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    bank_name VARCHAR(128) NOT NULL,
    bank_code VARCHAR(32) NOT NULL,
    account_number VARCHAR(16) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    recipient_code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'global',
    welcome_bonus NUMERIC(15, 2) DEFAULT 25000.00,
    signup_bonus_enabled BOOLEAN DEFAULT TRUE,
    referral_bonus NUMERIC(15, 2) DEFAULT 500.00,
    min_deposit NUMERIC(15, 2) DEFAULT 100.00,
    min_withdrawal NUMERIC(15, 2) DEFAULT 100.00,
    currency VARCHAR(8) DEFAULT 'KES',
    maintenance_mode BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(32) DEFAULT 'OPEN',
    priority VARCHAR(32) DEFAULT 'NORMAL',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL, -- 'TREASURY_SYNC', 'TREASURY_ANOMALY', 'SECURITY_ALERT', 'USER_SUSPENDED', 'WALLET_FROZEN'
    severity VARCHAR(16) DEFAULT 'INFO', -- 'INFO', 'WARNING', 'CRITICAL'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
