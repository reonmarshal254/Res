import { pool, isDbPostgres, getFallbackStore, saveFallbackDb } from './db';
import { User, Wallet, Transaction, InvestmentPlan, UserInvestment, Loan, LoanSchedule, SystemSettings, AuditLog } from '../types';

export const dbRepo = {
  // USER OPERATIONS
  async findUserByEmail(email: string): Promise<User | null> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      return res.rows[0] || null;
    }
    const store = getFallbackStore();
    return store.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async findUserById(id: string): Promise<User | null> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return res.rows[0] || null;
    }
    const store = getFallbackStore();
    return store.users.find((u) => u.id === id) || null;
  },

  async createUser(user: User): Promise<User> {
    if (isDbPostgres() && pool) {
      const query = `
        INSERT INTO users (id, full_name, email, phone, password_hash, transaction_pin, tier, is_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const res = await pool.query(query, [
        user.id,
        user.full_name,
        user.email,
        user.phone,
        user.password_hash,
        user.transaction_pin,
        user.tier,
        user.is_verified,
        user.created_at,
        user.updated_at,
      ]);
      return res.rows[0];
    }
    const store = getFallbackStore();
    store.users.push(user);
    saveFallbackDb();
    return user;
  },

  async updateUserPin(userId: string, hashedPin: string): Promise<void> {
    if (isDbPostgres() && pool) {
      await pool.query('UPDATE users SET transaction_pin = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPin, userId]);
      return;
    }
    const store = getFallbackStore();
    const user = store.users.find((u) => u.id === userId);
    if (user) {
      user.transaction_pin = hashedPin;
      user.updated_at = new Date().toISOString();
      saveFallbackDb();
    }
  },

  // WALLET OPERATIONS
  async getWalletByUserId(userId: string): Promise<Wallet | null> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
      if (res.rows[0]) {
        return {
          ...res.rows[0],
          balance: parseFloat(res.rows[0].balance),
          ledger_balance: parseFloat(res.rows[0].ledger_balance),
        };
      }
      return null;
    }
    const store = getFallbackStore();
    return store.wallets.find((w) => w.user_id === userId) || null;
  },

  async createWallet(wallet: Wallet): Promise<Wallet> {
    if (isDbPostgres() && pool) {
      const query = `
        INSERT INTO wallets (id, user_id, account_number, bank_name, balance, ledger_balance, currency, is_frozen, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const res = await pool.query(query, [
        wallet.id,
        wallet.user_id,
        wallet.account_number,
        wallet.bank_name,
        wallet.balance,
        wallet.ledger_balance,
        wallet.currency,
        wallet.is_frozen,
        wallet.created_at,
        wallet.updated_at,
      ]);
      return {
        ...res.rows[0],
        balance: parseFloat(res.rows[0].balance),
        ledger_balance: parseFloat(res.rows[0].ledger_balance),
      };
    }
    const store = getFallbackStore();
    store.wallets.push(wallet);
    saveFallbackDb();
    return wallet;
  },

  async updateWalletBalance(walletId: string, amountDelta: number, ledgerDelta: number = 0): Promise<Wallet> {
    if (isDbPostgres() && pool) {
      const res = await pool.query(
        `UPDATE wallets 
         SET balance = balance + $1, 
             ledger_balance = ledger_balance + $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [amountDelta, ledgerDelta, walletId]
      );
      return {
        ...res.rows[0],
        balance: parseFloat(res.rows[0].balance),
        ledger_balance: parseFloat(res.rows[0].ledger_balance),
      };
    }
    const store = getFallbackStore();
    const wallet = store.wallets.find((w) => w.id === walletId);
    if (!wallet) throw new Error('Wallet not found');
    wallet.balance = Number((Number(wallet.balance) + Number(amountDelta)).toFixed(2));
    wallet.ledger_balance = Number((Number(wallet.ledger_balance) + Number(ledgerDelta)).toFixed(2));
    wallet.updated_at = new Date().toISOString();
    saveFallbackDb();
    return wallet;
  },

  // TRANSACTION OPERATIONS
  async createTransaction(tx: Transaction): Promise<Transaction> {
    if (isDbPostgres() && pool) {
      const query = `
        INSERT INTO transactions (id, user_id, wallet_id, type, amount, fee, status, reference, channel, description, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const res = await pool.query(query, [
        tx.id,
        tx.user_id,
        tx.wallet_id,
        tx.type,
        tx.amount,
        tx.fee,
        tx.status,
        tx.reference,
        tx.channel,
        tx.description,
        JSON.stringify(tx.metadata || {}),
        tx.created_at,
      ]);
      return {
        ...res.rows[0],
        amount: parseFloat(res.rows[0].amount),
        fee: parseFloat(res.rows[0].fee),
      };
    }
    const store = getFallbackStore();
    store.transactions.unshift(tx);
    saveFallbackDb();
    return tx;
  },

  async findTransactionByReference(reference: string): Promise<Transaction | null> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM transactions WHERE reference = $1', [reference]);
      if (res.rows[0]) {
        return {
          ...res.rows[0],
          amount: parseFloat(res.rows[0].amount),
          fee: parseFloat(res.rows[0].fee),
        };
      }
      return null;
    }
    const store = getFallbackStore();
    return store.transactions.find((t) => t.reference === reference) || null;
  },

  async updateTransactionStatus(
    reference: string,
    status: 'SUCCESS' | 'FAILED',
    metadata?: any,
    requirePending: boolean = true
  ): Promise<Transaction | null> {
    if (isDbPostgres() && pool) {
      const mergedMeta = metadata ? { ...metadata, updated_at: new Date().toISOString() } : { updated_at: new Date().toISOString() };
      const query = requirePending
        ? `UPDATE transactions
           SET status = $1, metadata = COALESCE($2, metadata), updated_at = CURRENT_TIMESTAMP
           WHERE reference = $3 AND status = 'PENDING'
           RETURNING *`
        : `UPDATE transactions
           SET status = $1, metadata = COALESCE($2, metadata), updated_at = CURRENT_TIMESTAMP
           WHERE reference = $3
           RETURNING *`;
      const res = await pool.query(query, [status, JSON.stringify(mergedMeta), reference]);
      if (res.rows[0]) {
        return {
          ...res.rows[0],
          amount: parseFloat(res.rows[0].amount),
          fee: parseFloat(res.rows[0].fee),
        };
      }
      return null;
    }
    const store = getFallbackStore();
    const tx = store.transactions.find((t) => t.reference === reference);
    if (!tx) return null;
    if (requirePending && tx.status !== 'PENDING') {
      // Reject duplicate settling: already settled
      return null;
    }
    tx.status = status;
    if (metadata) tx.metadata = { ...tx.metadata, ...metadata };
    saveFallbackDb();
    return tx;
  },

  async getTransactionsByUserId(userId: string, limit: number = 50): Promise<Transaction[]> {
    if (isDbPostgres() && pool) {
      const res = await pool.query(
        'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [userId, limit]
      );
      return res.rows.map((row) => ({
        ...row,
        amount: parseFloat(row.amount),
        fee: parseFloat(row.fee),
      }));
    }
    const store = getFallbackStore();
    return store.transactions
      .filter((t) => t.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  },

  // INVESTMENT PLANS & INVESTMENTS
  async getAllInvestmentPlans(): Promise<InvestmentPlan[]> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM investment_plans WHERE is_active = TRUE ORDER BY annual_percentage_yield DESC');
      return res.rows.map((row) => ({
        ...row,
        annual_percentage_yield: parseFloat(row.annual_percentage_yield),
        min_amount: parseFloat(row.min_amount),
        max_amount: parseFloat(row.max_amount),
      }));
    }
    const store = getFallbackStore();
    return store.investment_plans.filter((p) => p.is_active);
  },

  async getInvestmentPlanById(id: string): Promise<InvestmentPlan | null> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM investment_plans WHERE id = $1', [id]);
      if (res.rows[0]) {
        return {
          ...res.rows[0],
          annual_percentage_yield: parseFloat(res.rows[0].annual_percentage_yield),
          min_amount: parseFloat(res.rows[0].min_amount),
          max_amount: parseFloat(res.rows[0].max_amount),
        };
      }
      return null;
    }
    const store = getFallbackStore();
    return store.investment_plans.find((p) => p.id === id) || null;
  },

  async createInvestment(inv: UserInvestment): Promise<UserInvestment> {
    if (isDbPostgres() && pool) {
      const query = `
        INSERT INTO investments (id, user_id, plan_id, principal_amount, expected_return, actual_return, duration_days, start_date, maturity_date, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      const res = await pool.query(query, [
        inv.id,
        inv.user_id,
        inv.plan_id,
        inv.principal_amount,
        inv.expected_return,
        inv.actual_return,
        inv.duration_days,
        inv.start_date,
        inv.maturity_date,
        inv.status,
        inv.created_at,
      ]);
      return {
        ...res.rows[0],
        principal_amount: parseFloat(res.rows[0].principal_amount),
        expected_return: parseFloat(res.rows[0].expected_return),
        actual_return: parseFloat(res.rows[0].actual_return),
      };
    }
    const store = getFallbackStore();
    store.investments.unshift(inv);
    saveFallbackDb();
    return inv;
  },

  async getUserInvestments(userId: string): Promise<UserInvestment[]> {
    if (isDbPostgres() && pool) {
      const query = `
        SELECT i.*, p.name as plan_name, p.category, p.annual_percentage_yield, p.risk_level
        FROM investments i
        LEFT JOIN investment_plans p ON i.plan_id = p.id
        WHERE i.user_id = $1
        ORDER BY i.created_at DESC
      `;
      const res = await pool.query(query, [userId]);
      return res.rows.map((row) => ({
        ...row,
        principal_amount: parseFloat(row.principal_amount),
        expected_return: parseFloat(row.expected_return),
        actual_return: parseFloat(row.actual_return),
      }));
    }
    const store = getFallbackStore();
    return store.investments
      .filter((i) => i.user_id === userId)
      .map((i) => {
        const plan = store.investment_plans.find((p) => p.id === i.plan_id);
        return {
          ...i,
          plan_name: plan ? plan.name : 'Custom Plan',
          category: plan ? plan.category : 'General',
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getInvestmentById(id: string): Promise<UserInvestment | null> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM investments WHERE id = $1', [id]);
      if (res.rows[0]) {
        return {
          ...res.rows[0],
          principal_amount: parseFloat(res.rows[0].principal_amount),
          expected_return: parseFloat(res.rows[0].expected_return),
          actual_return: parseFloat(res.rows[0].actual_return),
        };
      }
      return null;
    }
    const store = getFallbackStore();
    return store.investments.find((i) => i.id === id) || null;
  },

  async updateInvestmentStatus(id: string, status: 'MATURED' | 'LIQUIDATED', actualReturn?: number): Promise<void> {
    if (isDbPostgres() && pool) {
      await pool.query(
        `UPDATE investments
         SET status = $1, actual_return = COALESCE($2, actual_return)
         WHERE id = $3`,
        [status, actualReturn, id]
      );
      return;
    }
    const store = getFallbackStore();
    const inv = store.investments.find((i) => i.id === id);
    if (inv) {
      inv.status = status;
      if (actualReturn !== undefined) inv.actual_return = actualReturn;
      saveFallbackDb();
    }
  },

  // LOAN OPERATIONS
  async createLoan(loan: Loan, schedules: LoanSchedule[]): Promise<Loan> {
    if (isDbPostgres() && pool) {
      const query = `
        INSERT INTO loans (id, user_id, amount, interest_rate, total_payable, amount_paid, tenure_months, monthly_installment, purpose, status, disbursed_at, due_date, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      const res = await pool.query(query, [
        loan.id,
        loan.user_id,
        loan.amount,
        loan.interest_rate,
        loan.total_payable,
        loan.amount_paid,
        loan.tenure_months,
        loan.monthly_installment,
        loan.purpose,
        loan.status,
        loan.disbursed_at,
        loan.due_date,
        loan.created_at,
      ]);

      for (const s of schedules) {
        await pool.query(
          `INSERT INTO loan_schedules (id, loan_id, installment_number, amount_due, amount_paid, due_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [s.id, s.loan_id, s.installment_number, s.amount_due, s.amount_paid, s.due_date, s.status]
        );
      }

      return {
        ...res.rows[0],
        amount: parseFloat(res.rows[0].amount),
        interest_rate: parseFloat(res.rows[0].interest_rate),
        total_payable: parseFloat(res.rows[0].total_payable),
        amount_paid: parseFloat(res.rows[0].amount_paid),
        monthly_installment: parseFloat(res.rows[0].monthly_installment),
        schedules,
      };
    }
    const store = getFallbackStore();
    store.loans.unshift(loan);
    store.loan_schedules.push(...schedules);
    saveFallbackDb();
    return { ...loan, schedules };
  },

  async getUserLoans(userId: string): Promise<Loan[]> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      const loans = res.rows.map((row) => ({
        ...row,
        amount: parseFloat(row.amount),
        interest_rate: parseFloat(row.interest_rate),
        total_payable: parseFloat(row.total_payable),
        amount_paid: parseFloat(row.amount_paid),
        monthly_installment: parseFloat(row.monthly_installment),
      }));

      for (const loan of loans) {
        const schedRes = await pool.query(
          'SELECT * FROM loan_schedules WHERE loan_id = $1 ORDER BY installment_number ASC',
          [loan.id]
        );
        loan.schedules = schedRes.rows.map((s) => ({
          ...s,
          amount_due: parseFloat(s.amount_due),
          amount_paid: parseFloat(s.amount_paid),
        }));
      }
      return loans;
    }
    const store = getFallbackStore();
    return store.loans
      .filter((l) => l.user_id === userId)
      .map((l) => ({
        ...l,
        schedules: store.loan_schedules
          .filter((s) => s.loan_id === l.id)
          .sort((a, b) => a.installment_number - b.installment_number),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getLoanById(id: string): Promise<Loan | null> {
    if (isDbPostgres() && pool) {
      const res = await pool.query('SELECT * FROM loans WHERE id = $1', [id]);
      if (!res.rows[0]) return null;
      const loan = {
        ...res.rows[0],
        amount: parseFloat(res.rows[0].amount),
        interest_rate: parseFloat(res.rows[0].interest_rate),
        total_payable: parseFloat(res.rows[0].total_payable),
        amount_paid: parseFloat(res.rows[0].amount_paid),
        monthly_installment: parseFloat(res.rows[0].monthly_installment),
      };
      const schedRes = await pool.query(
        'SELECT * FROM loan_schedules WHERE loan_id = $1 ORDER BY installment_number ASC',
        [loan.id]
      );
      loan.schedules = schedRes.rows.map((s) => ({
        ...s,
        amount_due: parseFloat(s.amount_due),
        amount_paid: parseFloat(s.amount_paid),
      }));
      return loan;
    }
    const store = getFallbackStore();
    const loan = store.loans.find((l) => l.id === id);
    if (!loan) return null;
    return {
      ...loan,
      schedules: store.loan_schedules
        .filter((s) => s.loan_id === loan.id)
        .sort((a, b) => a.installment_number - b.installment_number),
    };
  },

  async recordLoanRepayment(loanId: string, amount: number): Promise<Loan> {
    if (isDbPostgres() && pool) {
      // Find oldest pending schedule
      const schedRes = await pool.query(
        `SELECT * FROM loan_schedules 
         WHERE loan_id = $1 AND status != 'PAID' 
         ORDER BY installment_number ASC 
         LIMIT 1`,
        [loanId]
      );

      if (schedRes.rows[0]) {
        const schedule = schedRes.rows[0];
        const newSchedPaid = parseFloat(schedule.amount_paid) + amount;
        const schedStatus = newSchedPaid >= parseFloat(schedule.amount_due) ? 'PAID' : 'PENDING';
        await pool.query(
          `UPDATE loan_schedules 
           SET amount_paid = $1, status = $2, paid_at = CURRENT_TIMESTAMP 
           WHERE id = $3`,
          [newSchedPaid, schedStatus, schedule.id]
        );
      }

      // Update loan total paid
      const updateLoanRes = await pool.query(
        `UPDATE loans 
         SET amount_paid = amount_paid + $1,
             status = CASE WHEN (amount_paid + $1) >= total_payable THEN 'COMPLETED' ELSE status END
         WHERE id = $2
         RETURNING *`,
        [amount, loanId]
      );

      return {
        ...updateLoanRes.rows[0],
        amount: parseFloat(updateLoanRes.rows[0].amount),
        total_payable: parseFloat(updateLoanRes.rows[0].total_payable),
        amount_paid: parseFloat(updateLoanRes.rows[0].amount_paid),
      };
    }

    const store = getFallbackStore();
    const loan = store.loans.find((l) => l.id === loanId);
    if (!loan) throw new Error('Loan not found');

    const schedule = store.loan_schedules
      .filter((s) => s.loan_id === loanId && s.status !== 'PAID')
      .sort((a, b) => a.installment_number - b.installment_number)[0];

    if (schedule) {
      schedule.amount_paid = Number((Number(schedule.amount_paid) + Number(amount)).toFixed(2));
      if (schedule.amount_paid >= schedule.amount_due) {
        schedule.status = 'PAID';
        schedule.paid_at = new Date().toISOString();
      }
    }

    loan.amount_paid = Number((Number(loan.amount_paid) + Number(amount)).toFixed(2));
    if (loan.amount_paid >= loan.total_payable) {
      loan.status = 'COMPLETED';
    }
    saveFallbackDb();
    return loan;
  },

  // ================= ADMIN OPERATIONS =================
  async getAllUsers(): Promise<any[]> {
    if (isDbPostgres() && pool) {
      const res = await pool.query(`
        SELECT u.id, u.full_name, u.email, u.phone, u.tier, u.is_verified, COALESCE(u.is_suspended, FALSE) as is_suspended, u.created_at,
               w.id as wallet_id, w.account_number, w.bank_name, w.balance, w.ledger_balance, w.currency, COALESCE(w.is_frozen, FALSE) as is_frozen
        FROM users u
        LEFT JOIN wallets w ON u.id = w.user_id
        ORDER BY u.created_at DESC
      `);
      return res.rows.map((row) => ({
        ...row,
        balance: row.balance ? parseFloat(row.balance) : 0,
        ledger_balance: row.ledger_balance ? parseFloat(row.ledger_balance) : 0,
        is_suspended: Boolean(row.is_suspended),
        is_frozen: Boolean(row.is_frozen),
      }));
    }
    const store = getFallbackStore();
    return store.users.map((u) => {
      const wallet = store.wallets.find((w) => w.user_id === u.id);
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        tier: u.tier,
        is_verified: u.is_verified,
        is_suspended: u.is_suspended || false,
        created_at: u.created_at,
        wallet_id: wallet?.id || null,
        account_number: wallet?.account_number || 'N/A',
        bank_name: wallet?.bank_name || 'Resi M-Bank Kenya',
        balance: wallet?.balance || 0,
        ledger_balance: wallet?.ledger_balance || 0,
        currency: wallet?.currency || 'KES',
        is_frozen: wallet?.is_frozen || false,
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async updateUserVerification(userId: string, is_verified: boolean, tier?: number): Promise<any> {
    if (isDbPostgres() && pool) {
      const query = tier !== undefined
        ? 'UPDATE users SET is_verified = $1, tier = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *'
        : 'UPDATE users SET is_verified = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
      const params = tier !== undefined ? [is_verified, tier, userId] : [is_verified, userId];
      const res = await pool.query(query, params);
      return res.rows[0];
    }
    const store = getFallbackStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error('User not found');
    user.is_verified = is_verified;
    if (tier !== undefined) user.tier = tier;
    user.updated_at = new Date().toISOString();
    saveFallbackDb();
    return user;
  },

  async toggleSuspendUser(userId: string, is_suspended: boolean): Promise<any> {
    if (isDbPostgres() && pool) {
      const res = await pool.query(
        'UPDATE users SET is_suspended = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [is_suspended, userId]
      );
      return res.rows[0];
    }
    const store = getFallbackStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error('User not found');
    user.is_suspended = is_suspended;
    user.updated_at = new Date().toISOString();
    saveFallbackDb();
    return user;
  },

  async toggleFreezeWallet(userId: string, is_frozen: boolean): Promise<any> {
    if (isDbPostgres() && pool) {
      const res = await pool.query(
        'UPDATE wallets SET is_frozen = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING *',
        [is_frozen, userId]
      );
      return res.rows[0];
    }
    const store = getFallbackStore();
    const wallet = store.wallets.find((w) => w.user_id === userId);
    if (!wallet) throw new Error('Wallet not found for user');
    wallet.is_frozen = is_frozen;
    wallet.updated_at = new Date().toISOString();
    saveFallbackDb();
    return wallet;
  },

  async getAllTransactions(limit: number = 100, offset: number = 0, type?: string, search?: string): Promise<any[]> {
    if (isDbPostgres() && pool) {
      let query = `
        SELECT t.*, u.full_name as user_name, u.email as user_email
        FROM transactions t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (type) {
        params.push(type);
        query += ` AND t.type = $${params.length}`;
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        query += ` AND (LOWER(t.description) LIKE $${params.length} OR LOWER(t.reference) LIKE $${params.length} OR LOWER(u.full_name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`;
      }
      query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      const res = await pool.query(query, params);
      return res.rows.map((r) => ({
        ...r,
        amount: parseFloat(r.amount),
        fee: parseFloat(r.fee),
      }));
    }
    const store = getFallbackStore();
    let txs = store.transactions.map((t) => {
      const user = store.users.find((u) => u.id === t.user_id);
      return {
        ...t,
        user_name: user?.full_name || 'Member',
        user_email: user?.email || 'user@resi.com',
      };
    });

    if (type) {
      txs = txs.filter((t) => t.type === type);
    }
    if (search) {
      const q = search.toLowerCase();
      txs = txs.filter(
        (t) =>
          (t.description || '').toLowerCase().includes(q) ||
          (t.reference || '').toLowerCase().includes(q) ||
          (t.user_name || '').toLowerCase().includes(q) ||
          (t.user_email || '').toLowerCase().includes(q)
      );
    }
    return txs
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(offset, offset + limit);
  },

  async getAllLoans(status?: string): Promise<any[]> {
    if (isDbPostgres() && pool) {
      let query = `
        SELECT l.*, u.full_name as user_name, u.email as user_email, u.phone as user_phone
        FROM loans l
        LEFT JOIN users u ON l.user_id = u.id
      `;
      const params: any[] = [];
      if (status) {
        params.push(status);
        query += ' WHERE l.status = $1';
      }
      query += ' ORDER BY l.created_at DESC';
      const res = await pool.query(query, params);
      const loans = res.rows.map((row) => ({
        ...row,
        amount: parseFloat(row.amount),
        interest_rate: parseFloat(row.interest_rate),
        total_payable: parseFloat(row.total_payable),
        amount_paid: parseFloat(row.amount_paid),
        monthly_installment: parseFloat(row.monthly_installment),
      }));

      for (const loan of loans) {
        const schedRes = await pool.query(
          'SELECT * FROM loan_schedules WHERE loan_id = $1 ORDER BY installment_number ASC',
          [loan.id]
        );
        loan.schedules = schedRes.rows.map((s) => ({
          ...s,
          amount_due: parseFloat(s.amount_due),
          amount_paid: parseFloat(s.amount_paid),
        }));
      }
      return loans;
    }

    const store = getFallbackStore();
    let loans = store.loans.map((l) => {
      const user = store.users.find((u) => u.id === l.user_id);
      return {
        ...l,
        user_name: user?.full_name || 'Member',
        user_email: user?.email || 'user@resi.com',
        user_phone: user?.phone || '',
        schedules: store.loan_schedules
          .filter((s) => s.loan_id === l.id)
          .sort((a, b) => a.installment_number - b.installment_number),
      };
    });

    if (status) {
      loans = loans.filter((l) => l.status === status);
    }
    return loans.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async approveLoan(loanId: string): Promise<any> {
    const store = getFallbackStore();
    const loan = store.loans.find((l) => l.id === loanId);
    if (!loan) throw new Error('Loan not found');
    if (loan.status === 'ACTIVE' || loan.status === 'COMPLETED') {
      throw new Error(`Loan is already ${loan.status}`);
    }

    const wallet = store.wallets.find((w) => w.user_id === loan.user_id);
    if (!wallet) throw new Error('Applicant wallet not found');

    const now = new Date();
    loan.status = 'ACTIVE';
    loan.disbursed_at = now.toISOString();

    // Disburse funds to wallet
    wallet.balance = Number((Number(wallet.balance) + Number(loan.amount)).toFixed(2));
    wallet.ledger_balance = Number((Number(wallet.ledger_balance) + Number(loan.amount)).toFixed(2));
    wallet.updated_at = now.toISOString();

    // Record disbursement transaction
    const txId = `tx_admin_disb_${Date.now().toString().slice(-8)}`;
    store.transactions.unshift({
      id: txId,
      user_id: loan.user_id,
      wallet_id: wallet.id,
      type: 'LOAN_DISBURSEMENT',
      amount: loan.amount,
      fee: 0,
      status: 'SUCCESS',
      reference: `ADMIN_APPR_${Date.now()}`,
      channel: 'WALLET',
      description: `Loan Approved by Admin: ${loan.purpose}`,
      metadata: { loanId: loan.id, approved_by: 'Admin Web Terminal' },
      created_at: now.toISOString(),
    });

    saveFallbackDb();
    return { loan, wallet };
  },

  async rejectLoan(loanId: string, reason?: string): Promise<any> {
    const store = getFallbackStore();
    const loan = store.loans.find((l) => l.id === loanId);
    if (!loan) throw new Error('Loan not found');
    loan.status = 'REJECTED';
    loan.rejection_reason = reason || 'Does not meet current credit risk underwriting criteria';
    loan.updated_at = new Date().toISOString();
    saveFallbackDb();
    return loan;
  },

  async getSystemSettings(): Promise<SystemSettings> {
    if (isDbPostgres() && pool) {
      try {
        const res = await pool.query('SELECT * FROM system_settings WHERE id = $1', ['global']);
        if (res.rows[0]) {
          const row = res.rows[0];
          return {
            id: row.id,
            welcome_bonus: parseFloat(row.welcome_bonus),
            signup_bonus_enabled: row.signup_bonus_enabled !== false,
            referral_bonus: parseFloat(row.referral_bonus),
            min_deposit: parseFloat(row.min_deposit),
            min_withdrawal: parseFloat(row.min_withdrawal),
            currency: row.currency || 'KES',
            maintenance_mode: Boolean(row.maintenance_mode),
            updated_at: row.updated_at,
          };
        }
      } catch (err) {
        console.warn('PostgreSQL getSystemSettings fallback:', err);
      }
    }
    const store = getFallbackStore();
    if (!store.system_settings) {
      store.system_settings = {
        welcome_bonus: 25000,
        signup_bonus_enabled: true,
        referral_bonus: 500,
        min_deposit: 100,
        min_withdrawal: 100,
        currency: 'KES',
        maintenance_mode: false,
      };
      saveFallbackDb();
    }
    return {
      id: 'global',
      welcome_bonus: store.system_settings.welcome_bonus,
      signup_bonus_enabled: store.system_settings.signup_bonus_enabled !== false,
      referral_bonus: store.system_settings.referral_bonus,
      min_deposit: store.system_settings.min_deposit,
      min_withdrawal: store.system_settings.min_withdrawal,
      currency: store.system_settings.currency || 'KES',
      maintenance_mode: Boolean(store.system_settings.maintenance_mode),
    };
  },

  async updateSystemSettings(newSettings: Partial<{
    welcome_bonus: number;
    signup_bonus_enabled: boolean;
    referral_bonus: number;
    min_deposit: number;
    min_withdrawal: number;
    currency: string;
    maintenance_mode: boolean;
  }>): Promise<SystemSettings> {
    if (isDbPostgres() && pool) {
      try {
        const current = await this.getSystemSettings();
        const merged = { ...current, ...newSettings };
        const query = `
          UPDATE system_settings
          SET welcome_bonus = $1,
              signup_bonus_enabled = $2,
              referral_bonus = $3,
              min_deposit = $4,
              min_withdrawal = $5,
              currency = $6,
              maintenance_mode = $7,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 'global'
          RETURNING *
        `;
        const res = await pool.query(query, [
          merged.welcome_bonus,
          merged.signup_bonus_enabled !== false,
          merged.referral_bonus,
          merged.min_deposit,
          merged.min_withdrawal,
          merged.currency || 'KES',
          Boolean(merged.maintenance_mode),
        ]);
        if (res.rows[0]) {
          const row = res.rows[0];
          const parsed: SystemSettings = {
            id: row.id,
            welcome_bonus: parseFloat(row.welcome_bonus),
            signup_bonus_enabled: row.signup_bonus_enabled !== false,
            referral_bonus: parseFloat(row.referral_bonus),
            min_deposit: parseFloat(row.min_deposit),
            min_withdrawal: parseFloat(row.min_withdrawal),
            currency: row.currency || 'KES',
            maintenance_mode: Boolean(row.maintenance_mode),
            updated_at: row.updated_at,
          };
          const store = getFallbackStore();
          store.system_settings = { ...parsed };
          saveFallbackDb();
          return parsed;
        }
      } catch (err) {
        console.error('PostgreSQL updateSystemSettings error:', err);
      }
    }
    const store = getFallbackStore();
    const currentFallback = store.system_settings || {
      welcome_bonus: 25000,
      signup_bonus_enabled: true,
      referral_bonus: 500,
      min_deposit: 100,
      min_withdrawal: 100,
      currency: 'KES',
      maintenance_mode: false,
    };
    store.system_settings = {
      ...currentFallback,
      ...newSettings,
    } as any;
    saveFallbackDb();
    return {
      id: 'global',
      welcome_bonus: store.system_settings!.welcome_bonus,
      signup_bonus_enabled: store.system_settings!.signup_bonus_enabled !== false,
      referral_bonus: store.system_settings!.referral_bonus,
      min_deposit: store.system_settings!.min_deposit,
      min_withdrawal: store.system_settings!.min_withdrawal,
      currency: store.system_settings!.currency || 'KES',
      maintenance_mode: Boolean(store.system_settings!.maintenance_mode),
    };
  },

  async getSupportTickets(): Promise<any[]> {
    if (isDbPostgres() && pool) {
      try {
        const res = await pool.query('SELECT * FROM support_tickets ORDER BY updated_at DESC');
        return res.rows;
      } catch (e) {}
    }
    const store = getFallbackStore();
    if (!store.support_tickets) {
      store.support_tickets = [];
    }
    return store.support_tickets.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  },

  async getSupportTicketById(id: string): Promise<any> {
    if (isDbPostgres() && pool) {
      try {
        const res = await pool.query('SELECT * FROM support_tickets WHERE id = $1', [id]);
        if (res.rows[0]) return res.rows[0];
      } catch (e) {}
    }
    const store = getFallbackStore();
    return (store.support_tickets || []).find((t: any) => t.id === id) || null;
  },

  async addSupportReply(ticketId: string, sender: 'ADMIN' | 'USER', senderName: string, text: string): Promise<any> {
    const now = new Date().toISOString();
    const newMsg = {
      id: `msg_${Date.now()}`,
      sender,
      sender_name: senderName,
      text,
      timestamp: now,
    };

    if (isDbPostgres() && pool) {
      try {
        const existing = await this.getSupportTicketById(ticketId);
        if (existing) {
          const messages = Array.isArray(existing.messages) ? [...existing.messages, newMsg] : [newMsg];
          const newStatus = sender === 'USER' ? 'OPEN' : existing.status;
          const res = await pool.query(
            'UPDATE support_tickets SET messages = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [JSON.stringify(messages), newStatus, ticketId]
          );
          if (res.rows[0]) return res.rows[0];
        }
      } catch (e) {
        console.error('PostgreSQL addSupportReply error:', e);
      }
    }

    const store = getFallbackStore();
    const ticket = (store.support_tickets || []).find((t: any) => t.id === ticketId);
    if (!ticket) throw new Error('Ticket not found');

    if (!ticket.messages) ticket.messages = [];
    ticket.messages.push(newMsg);
    ticket.updated_at = now;
    if (sender === 'USER') {
      ticket.status = 'OPEN';
    }
    saveFallbackDb();
    return ticket;
  },

  async updateSupportTicketStatus(ticketId: string, status: 'OPEN' | 'RESOLVED'): Promise<any> {
    if (isDbPostgres() && pool) {
      try {
        const res = await pool.query(
          'UPDATE support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
          [status, ticketId]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (e) {}
    }
    const store = getFallbackStore();
    const ticket = (store.support_tickets || []).find((t: any) => t.id === ticketId);
    if (!ticket) throw new Error('Ticket not found');
    ticket.status = status;
    ticket.updated_at = new Date().toISOString();
    saveFallbackDb();
    return ticket;
  },

  async createSupportTicket(ticketData: { user_id: string; user_name: string; user_email: string; subject: string; message: string; priority?: string }): Promise<any> {
    const now = new Date().toISOString();
    const newMsg = {
      id: `msg_${Date.now()}`,
      sender: 'USER',
      sender_name: ticketData.user_name,
      text: ticketData.message,
      timestamp: now,
    };
    const ticketId = `ticket_${Date.now().toString().slice(-6)}`;
    const ticketObj = {
      id: ticketId,
      user_id: ticketData.user_id,
      user_name: ticketData.user_name,
      user_email: ticketData.user_email,
      subject: ticketData.subject,
      status: 'OPEN',
      priority: ticketData.priority || 'NORMAL',
      messages: [newMsg],
      created_at: now,
      updated_at: now,
    };

    if (isDbPostgres() && pool) {
      try {
        const res = await pool.query(
          `INSERT INTO support_tickets (id, user_id, user_name, user_email, subject, status, priority, messages, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            ticketObj.id,
            ticketObj.user_id,
            ticketObj.user_name,
            ticketObj.user_email,
            ticketObj.subject,
            ticketObj.status,
            ticketObj.priority,
            JSON.stringify(ticketObj.messages),
            ticketObj.created_at,
            ticketObj.updated_at,
          ]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        console.error('PostgreSQL createSupportTicket error:', e);
      }
    }

    const store = getFallbackStore();
    if (!store.support_tickets) store.support_tickets = [];
    store.support_tickets.unshift(ticketObj);
    saveFallbackDb();
    return ticketObj;
  },

  // AUDIT LOG OPERATIONS
  async createAuditLog(log: {
    id?: string;
    event_type: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<AuditLog> {
    const id = log.id || `audit_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();
    const newLog: AuditLog = {
      id,
      event_type: log.event_type,
      severity: log.severity,
      title: log.title,
      description: log.description,
      metadata: log.metadata || {},
      created_at: now,
    };

    if (isDbPostgres() && pool) {
      try {
        const res = await pool.query(
          `INSERT INTO audit_logs (id, event_type, severity, title, description, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            newLog.id,
            newLog.event_type,
            newLog.severity,
            newLog.title,
            newLog.description,
            JSON.stringify(newLog.metadata || {}),
            newLog.created_at,
          ]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        console.error('PostgreSQL createAuditLog error:', e);
      }
    }

    const store = getFallbackStore();
    if (!store.audit_logs) store.audit_logs = [];
    store.audit_logs.unshift(newLog);
    saveFallbackDb();
    return newLog;
  },

  async getAuditLogs(limit: number = 100, severity?: string, eventType?: string): Promise<AuditLog[]> {
    if (isDbPostgres() && pool) {
      try {
        let query = 'SELECT * FROM audit_logs';
        const params: any[] = [];
        const conditions: string[] = [];

        if (severity && severity !== 'ALL') {
          params.push(severity);
          conditions.push(`severity = $${params.length}`);
        }
        if (eventType && eventType !== 'ALL') {
          params.push(eventType);
          conditions.push(`event_type = $${params.length}`);
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        params.push(limit);
        query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

        const res = await pool.query(query, params);
        return res.rows;
      } catch (e) {
        console.error('PostgreSQL getAuditLogs error:', e);
      }
    }

    const store = getFallbackStore();
    let logs = store.audit_logs || [];
    if (severity && severity !== 'ALL') {
      logs = logs.filter((l: any) => l.severity === severity);
    }
    if (eventType && eventType !== 'ALL') {
      logs = logs.filter((l: any) => l.event_type === eventType);
    }
    return logs.slice(0, limit);
  },
};

