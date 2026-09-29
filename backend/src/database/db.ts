import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isPostgresAvailable = false;

// In-memory fallback database for local testing when PostgreSQL isn't running yet
interface FallbackStore {
  users: any[];
  wallets: any[];
  transactions: any[];
  investment_plans: any[];
  investments: any[];
  loans: any[];
  loan_schedules: any[];
  beneficiaries: any[];
  system_settings?: {
    welcome_bonus: number;
    signup_bonus_enabled?: boolean;
    referral_bonus: number;
    min_deposit: number;
    min_withdrawal: number;
    currency: string;
    maintenance_mode: boolean;
  };
  support_tickets?: any[];
  audit_logs?: any[];
}

const fallbackDbFile = path.resolve(__dirname, '../../local_storage_db.json');

const defaultPlans = [
  {
    id: 'plan_treasury_01',
    name: 'CBK Infrastructure Bond Note',
    category: 'Fixed Income (KES)',
    annual_percentage_yield: 14.5,
    duration_days: 90,
    min_amount: 5000,
    max_amount: 5000000,
    risk_level: 'LOW',
    description: 'Backed by Central Bank of Kenya sovereign instruments. Guaranteed capital preservation with stable quarterly coupons.',
    is_active: true,
  },
  {
    id: 'plan_agri_02',
    name: 'Rift Valley AgriTech & Tea Export',
    category: 'Agriculture (KES)',
    annual_percentage_yield: 18.0,
    duration_days: 180,
    min_amount: 10000,
    max_amount: 3000000,
    risk_level: 'MODERATE',
    description: 'Finance high-yield mechanized tea, coffee and horticulture farming with guaranteed international off-taker contracts.',
    is_active: true,
  },
  {
    id: 'plan_reit_03',
    name: 'Nairobi Prime Commercial REIT',
    category: 'Real Estate (KES)',
    annual_percentage_yield: 16.0,
    duration_days: 365,
    min_amount: 25000,
    max_amount: 15000000,
    risk_level: 'MODERATE',
    description: 'Fractional ownership in prime Upper Hill and Westlands commercial logistics, data centers and tech offices.',
    is_active: true,
  },
  {
    id: 'plan_tech_04',
    name: 'Silicon Savannah & Global Tech Fund',
    category: 'Global Tech (USD / KES)',
    annual_percentage_yield: 22.5,
    duration_days: 180,
    min_amount: 50000,
    max_amount: 10000000,
    risk_level: 'HIGH',
    description: 'Exposure to high-growth East African mobile fintech, Silicon Valley SaaS and green tech ventures with USD compounding.',
    is_active: true,
  }
];

const defaultSettings = {
  welcome_bonus: 25000,
  signup_bonus_enabled: true,
  referral_bonus: 500,
  min_deposit: 100,
  min_withdrawal: 100,
  currency: 'KES',
  maintenance_mode: false,
};

const defaultSupportTickets = [
  {
    id: 'ticket_001',
    user_id: 'usr_demo_f799ace2',
    user_name: 'Alex Morgan',
    user_email: 'demo@resi.com',
    subject: 'Credit Limit Upgrade to KES 500,000',
    status: 'OPEN',
    priority: 'HIGH',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    messages: [
      {
        id: 'msg_01',
        sender: 'USER',
        sender_name: 'Alex Morgan',
        text: 'Hello admin team, I have been using Resi Vault with good savings volume. Can you review and approve my Tier 2 credit limit upgrade?',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
    ],
  },
  {
    id: 'ticket_002',
    user_id: 'usr_demo_f799ace2',
    user_name: 'Alex Morgan',
    user_email: 'demo@resi.com',
    subject: 'M-PESA Express Deposit Inquiry',
    status: 'RESOLVED',
    priority: 'NORMAL',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000 + 1800000).toISOString(),
    messages: [
      {
        id: 'msg_02',
        sender: 'USER',
        sender_name: 'Alex Morgan',
        text: 'Just wanted to confirm the average STK push reflection time for KES 50,000.',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'msg_03',
        sender: 'ADMIN',
        sender_name: 'Resi Desk Officer',
        text: 'Hi Alex, M-PESA deposits reflect instantly in under 3 seconds! Let us know if you need anything else.',
        timestamp: new Date(Date.now() - 86400000 + 1800000).toISOString(),
      },
    ],
  },
];

let fallbackStore: FallbackStore = {
  users: [],
  wallets: [],
  transactions: [],
  investment_plans: [...defaultPlans],
  investments: [],
  loans: [],
  loan_schedules: [],
  beneficiaries: [],
  system_settings: { ...defaultSettings },
  support_tickets: [...defaultSupportTickets],
  audit_logs: [],
};

// Load saved local fallback DB if present
try {
  if (fs.existsSync(fallbackDbFile)) {
    const data = fs.readFileSync(fallbackDbFile, 'utf8');
    fallbackStore = { ...fallbackStore, ...JSON.parse(data) };
    if (!fallbackStore.investment_plans || fallbackStore.investment_plans.length === 0) {
      fallbackStore.investment_plans = [...defaultPlans];
    }
    if (!fallbackStore.system_settings) {
      fallbackStore.system_settings = { ...defaultSettings };
    }
    if (!fallbackStore.support_tickets || fallbackStore.support_tickets.length === 0) {
      fallbackStore.support_tickets = [...defaultSupportTickets];
    }
  }
} catch (e) {
  // Use in-memory default
}

export function saveFallbackDb() {
  try {
    fs.writeFileSync(fallbackDbFile, JSON.stringify(fallbackStore, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save fallback database to disk:', err);
  }
}

export async function initDatabase() {
  try {
    let cleanConnString = config.databaseUrl || '';
    const isRemote = !cleanConnString.includes('localhost') && !cleanConnString.includes('127.0.0.1');
    const requiresSsl = cleanConnString.includes('sslmode=') || isRemote;

    // Strip sslmode from URI query params so pg-connection-string does not force strict CA verification
    cleanConnString = cleanConnString
      .replace(/[\?&]sslmode=[^&]+/i, '')
      .replace(/\?$/, '');

    const maskedUrl = cleanConnString.replace(/:[^:]*@/, ':****@');
    console.log(`[Database] Connecting to PostgreSQL at: ${maskedUrl}`);

    pool = new Pool({
      connectionString: cleanConnString,
      connectionTimeoutMillis: 15000,
      ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    });

    // Test connection
    const client = await pool.connect();
    const dbInfo = await client.query('SELECT current_database(), current_user');
    console.log(`✅ [Database] Successfully connected to PostgreSQL! (DB: ${dbInfo.rows[0].current_database}, User: ${dbInfo.rows[0].current_user})`);
    isPostgresAvailable = true;

    // Run schema migration
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);

      // Auto-migrate columns on existing tables & seed global settings
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;
        ALTER TABLE wallets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS signup_bonus_enabled BOOLEAN DEFAULT TRUE;

        INSERT INTO system_settings (id, welcome_bonus, signup_bonus_enabled, referral_bonus, min_deposit, min_withdrawal, currency, maintenance_mode)
        VALUES ('global', 25000.00, TRUE, 500.00, 100.00, 100.00, 'KES', FALSE)
        ON CONFLICT (id) DO NOTHING;

        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          event_type VARCHAR(64) NOT NULL,
          severity VARCHAR(16) DEFAULT 'INFO',
          title VARCHAR(255) NOT NULL,
          description TEXT,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ [Database] PostgreSQL schema migration verified successfully.');
    }

    // Seed default plans if table is empty
    const checkPlans = await client.query('SELECT COUNT(*) FROM investment_plans');
    if (parseInt(checkPlans.rows[0].count, 10) === 0) {
      for (const p of defaultPlans) {
        await client.query(
          `INSERT INTO investment_plans (id, name, category, annual_percentage_yield, duration_days, min_amount, max_amount, risk_level, description, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.name, p.category, p.annual_percentage_yield, p.duration_days, p.min_amount, p.max_amount, p.risk_level, p.description, p.is_active]
        );
      }
      console.log('✅ [Database] Seeded default investment plans into PostgreSQL.');
    }

    client.release();
  } catch (error: any) {
    console.warn(`⚠️ [Database] PostgreSQL is currently offline or unreachable: ${error.message}`);
    console.warn(`⚡ [Database] Activating Resi Fallback Database Engine. All CRUD, Wallets, Paystack, Loans, and Investments are 100% active and testable!`);
    console.warn(`💡 Tip: To switch to live PostgreSQL, set DATABASE_URL in backend/.env with your Postgres or Neon/Supabase connection string.`);
    isPostgresAvailable = false;
  }
}

export async function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  if (isPostgresAvailable && pool) {
    return pool.query<T>(text, params);
  }
  // When PostgreSQL is not reachable, fallback handler is used via our DB service functions
  throw new Error('PostgreSQL not connected');
}

export function getFallbackStore() {
  return fallbackStore;
}

export function isDbPostgres() {
  return isPostgresAvailable;
}

export { pool };
