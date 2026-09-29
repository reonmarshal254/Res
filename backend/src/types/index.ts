export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  password_hash: string;
  transaction_pin: string;
  tier: number;
  is_verified: boolean;
  is_suspended?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  id: string;
  welcome_bonus: number;
  signup_bonus_enabled: boolean;
  referral_bonus: number;
  min_deposit: number;
  min_withdrawal: number;
  currency: string;
  maintenance_mode: boolean;
  updated_at?: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  account_number: string;
  bank_name: string;
  balance: number;
  ledger_balance: number;
  currency: string;
  is_frozen: boolean;
  created_at: string;
  updated_at: string;
}

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'INVESTMENT'
  | 'LOAN_DISBURSEMENT'
  | 'LOAN_REPAYMENT'
  | 'INVESTMENT_RETURN';

export type TransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface Transaction {
  id: string;
  user_id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  fee: number;
  status: TransactionStatus;
  reference: string;
  channel: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface InvestmentPlan {
  id: string;
  name: string;
  category: string;
  annual_percentage_yield: number; // e.g. 15.5 for 15.5%
  duration_days: number;
  min_amount: number;
  max_amount: number;
  risk_level: 'LOW' | 'MODERATE' | 'HIGH';
  description: string;
  is_active: boolean;
}

export interface UserInvestment {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name?: string;
  principal_amount: number;
  expected_return: number;
  actual_return: number;
  duration_days: number;
  start_date: string;
  maturity_date: string;
  status: 'ACTIVE' | 'MATURED' | 'LIQUIDATED';
  created_at: string;
}

export interface Loan {
  id: string;
  user_id: string;
  amount: number;
  interest_rate: number;
  total_payable: number;
  amount_paid: number;
  tenure_months: number;
  monthly_installment: number;
  purpose: string;
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  disbursed_at?: string;
  due_date: string;
  created_at: string;
  schedules?: LoanSchedule[];
}

export interface LoanSchedule {
  id: string;
  loan_id: string;
  installment_number: number;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  paid_at?: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

