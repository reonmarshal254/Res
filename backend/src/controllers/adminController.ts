import { Request, Response } from 'express';
import { dbRepo } from '../database/repository';
import { getFallbackStore, saveFallbackDb } from '../database/db';

export const adminController = {
  // 1. OVERVIEW & METRICS
  async getOverview(req: Request, res: Response) {
    try {
      const users = await dbRepo.getAllUsers();
      const loans = await dbRepo.getAllLoans();
      const transactions = await dbRepo.getAllTransactions(500);
      const tickets = await dbRepo.getSupportTickets();
      const settings = await dbRepo.getSystemSettings();

      const totalUsers = users.length;
      const verifiedUsers = users.filter((u) => u.is_verified).length;
      const unverifiedUsers = totalUsers - verifiedUsers;
      const suspendedUsers = users.filter((u) => u.is_suspended).length;
      const frozenWallets = users.filter((u) => u.is_frozen).length;

      const totalLiquidity = users.reduce((acc, u) => acc + (Number(u.balance) || 0), 0);
      
      const pendingLoans = loans.filter((l) => l.status === 'PENDING');
      const activeLoans = loans.filter((l) => l.status === 'ACTIVE');
      const completedLoans = loans.filter((l) => l.status === 'COMPLETED');
      const rejectedLoans = loans.filter((l) => l.status === 'REJECTED');

      const pendingLoansAmount = pendingLoans.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
      const activeLoansAmount = activeLoans.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
      const totalDisbursedVolume = loans
        .filter((l) => l.status === 'ACTIVE' || l.status === 'COMPLETED')
        .reduce((acc, l) => acc + (Number(l.amount) || 0), 0);

      const openTickets = tickets.filter((t) => t.status === 'OPEN').length;

      return res.json({
        success: true,
        data: {
          metrics: {
            total_users: totalUsers,
            verified_users: verifiedUsers,
            unverified_users: unverifiedUsers,
            suspended_users: suspendedUsers,
            frozen_wallets: frozenWallets,
            total_liquidity: totalLiquidity,
            pending_loans_count: pendingLoans.length,
            pending_loans_amount: pendingLoansAmount,
            active_loans_count: activeLoans.length,
            active_loans_amount: activeLoansAmount,
            completed_loans_count: completedLoans.length,
            rejected_loans_count: rejectedLoans.length,
            total_disbursed_volume: totalDisbursedVolume,
            open_tickets_count: openTickets,
            total_tickets_count: tickets.length,
            total_transactions_count: transactions.length,
          },
          system_settings: settings,
          recent_transactions: transactions.slice(0, 10),
          pending_loans: pendingLoans.slice(0, 5),
          recent_tickets: tickets.slice(0, 5),
        },
      });
    } catch (error: any) {
      console.error('admin getOverview error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch overview metrics' });
    }
  },

  // 2. USERS & KYC MANAGEMENT
  async getUsers(req: Request, res: Response) {
    try {
      const { q } = req.query;
      let users = await dbRepo.getAllUsers();

      if (q && typeof q === 'string') {
        const query = q.toLowerCase().trim();
        users = users.filter(
          (u) =>
            u.full_name?.toLowerCase().includes(query) ||
            u.email?.toLowerCase().includes(query) ||
            u.phone?.toLowerCase().includes(query) ||
            u.account_number?.toLowerCase().includes(query)
        );
      }

      return res.json({
        success: true,
        count: users.length,
        data: users,
      });
    } catch (error: any) {
      console.error('admin getUsers error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch users' });
    }
  },

  async verifyUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { is_verified, tier } = req.body;

      if (typeof is_verified !== 'boolean') {
        return res.status(400).json({ success: false, message: 'is_verified must be a boolean' });
      }

      const updated = await dbRepo.updateUserVerification(id, is_verified, tier);
      return res.json({
        success: true,
        message: `User ${is_verified ? 'verified' : 'unverified'} successfully`,
        data: updated,
      });
    } catch (error: any) {
      console.error('admin verifyUser error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to update user verification' });
    }
  },

  async suspendUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { is_suspended } = req.body;

      if (typeof is_suspended !== 'boolean') {
        return res.status(400).json({ success: false, message: 'is_suspended must be a boolean' });
      }

      const updatedUser = await dbRepo.toggleSuspendUser(id, is_suspended);
      return res.json({
        success: true,
        message: `User account ${is_suspended ? 'suspended' : 're-activated'} successfully`,
        data: updatedUser,
      });
    } catch (error: any) {
      console.error('admin suspendUser error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to toggle user suspension' });
    }
  },

  async freezeUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { is_frozen } = req.body;

      if (typeof is_frozen !== 'boolean') {
        return res.status(400).json({ success: false, message: 'is_frozen must be a boolean' });
      }

      const updatedWallet = await dbRepo.toggleFreezeWallet(id, is_frozen);
      return res.json({
        success: true,
        message: `User wallet ${is_frozen ? 'suspended / frozen' : 'unfrozen / restored'} successfully`,
        data: updatedWallet,
      });
    } catch (error: any) {
      console.error('admin freezeUser error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to toggle wallet suspension' });
    }
  },

  // 3. LOAN APPROVAL & MANAGEMENT
  async getLoans(req: Request, res: Response) {
    try {
      const { status } = req.query;
      const filterStatus = status && status !== 'ALL' ? (status as string) : undefined;
      const loans = await dbRepo.getAllLoans(filterStatus);
      return res.json({
        success: true,
        count: loans.length,
        data: loans,
      });
    } catch (error: any) {
      console.error('admin getLoans error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch loans' });
    }
  },

  async approveLoan(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await dbRepo.approveLoan(id);
      return res.json({
        success: true,
        message: `Loan ${id} approved successfully! Funds disbursed to borrower's wallet.`,
        data: result,
      });
    } catch (error: any) {
      console.error('admin approveLoan error:', error);
      return res.status(400).json({ success: false, message: error.message || 'Failed to approve loan' });
    }
  },

  async rejectLoan(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const rejected = await dbRepo.rejectLoan(id, reason);
      return res.json({
        success: true,
        message: `Loan ${id} rejected.`,
        data: rejected,
      });
    } catch (error: any) {
      console.error('admin rejectLoan error:', error);
      return res.status(400).json({ success: false, message: error.message || 'Failed to reject loan' });
    }
  },

  async seedDemoLoan(req: Request, res: Response) {
    try {
      const users = await dbRepo.getAllUsers();
      if (!users || users.length === 0) {
        return res.status(400).json({ success: false, message: 'No users available to assign loan' });
      }

      const user = users[0];
      const store = getFallbackStore();
      const loanId = `loan_app_${Date.now().toString().slice(-6)}`;
      const amount = Number(req.body.amount || 45000);
      const tenure_months = Number(req.body.tenure_months || 3);
      const interest_rate = 9.5;
      const total_interest = (amount * (interest_rate / 100) * tenure_months) / 12;
      const total_payable = Number((amount + total_interest).toFixed(2));
      const monthly_installment = Number((total_payable / tenure_months).toFixed(2));
      const now = new Date();

      const newLoan = {
        id: loanId,
        user_id: user.id,
        amount,
        interest_rate,
        total_payable,
        amount_paid: 0,
        tenure_months,
        monthly_installment,
        purpose: req.body.purpose || 'Business Inventory Expansion (M-PESA merchant)',
        status: 'PENDING',
        created_at: now.toISOString(),
      };

      store.loans.unshift(newLoan);

      // Create loan schedules
      for (let i = 1; i <= tenure_months; i++) {
        const dueDate = new Date(now);
        dueDate.setMonth(dueDate.getMonth() + i);
        store.loan_schedules.push({
          id: `sched_${Date.now().toString().slice(-6)}_${i}`,
          loan_id: loanId,
          installment_number: i,
          amount_due: monthly_installment,
          amount_paid: 0,
          due_date: dueDate.toISOString(),
          status: 'PENDING',
        });
      }

      saveFallbackDb();
      return res.status(201).json({
        success: true,
        message: 'Demo loan application created with PENDING status for immediate approval testing!',
        data: newLoan,
      });
    } catch (error: any) {
      console.error('admin seedDemoLoan error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to seed demo loan' });
    }
  },

  // 4. ACTIVITIES & AUDIT LEDGER
  async getActivities(req: Request, res: Response) {
    try {
      const { type, search, limit = '100', offset = '0' } = req.query;
      const lim = Math.min(parseInt(limit as string, 10) || 100, 500);
      const off = parseInt(offset as string, 10) || 0;
      const filterType = type && type !== 'ALL' ? (type as string) : undefined;
      const filterSearch = search ? (search as string) : undefined;

      const transactions = await dbRepo.getAllTransactions(lim, off, filterType, filterSearch);
      return res.json({
        success: true,
        count: transactions.length,
        data: transactions,
      });
    } catch (error: any) {
      console.error('admin getActivities error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch activities' });
    }
  },

  // 5. SYSTEM SETTINGS (WELCOME BONUS, SIGNUP BONUS TOGGLE, REFERRAL BONUS, LIMITS)
  async getSettings(req: Request, res: Response) {
    try {
      const settings = await dbRepo.getSystemSettings();
      return res.json({
        success: true,
        data: settings,
      });
    } catch (error: any) {
      console.error('admin getSettings error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch settings' });
    }
  },

  async updateSettings(req: Request, res: Response) {
    try {
      const { welcome_bonus, signup_bonus_enabled, referral_bonus, min_deposit, min_withdrawal, maintenance_mode } = req.body;
      const updates: any = {};

      if (signup_bonus_enabled !== undefined) {
        updates.signup_bonus_enabled = Boolean(signup_bonus_enabled);
      }

      if (welcome_bonus !== undefined) {
        const val = Number(welcome_bonus);
        if (isNaN(val) || val < 0) return res.status(400).json({ success: false, message: 'Invalid welcome_bonus amount' });
        updates.welcome_bonus = val;
      }

      if (referral_bonus !== undefined) {
        const val = Number(referral_bonus);
        if (isNaN(val) || val < 0) return res.status(400).json({ success: false, message: 'Invalid referral_bonus amount' });
        updates.referral_bonus = val;
      }

      if (min_deposit !== undefined) {
        const val = Number(min_deposit);
        if (!isNaN(val) && val >= 0) updates.min_deposit = val;
      }

      if (min_withdrawal !== undefined) {
        const val = Number(min_withdrawal);
        if (!isNaN(val) && val >= 0) updates.min_withdrawal = val;
      }

      if (maintenance_mode !== undefined) {
        updates.maintenance_mode = Boolean(maintenance_mode);
      }

      const updated = await dbRepo.updateSystemSettings(updates);
      return res.json({
        success: true,
        message: 'System settings updated and persisted successfully to database',
        data: updated,
      });
    } catch (error: any) {
      console.error('admin updateSettings error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to update settings' });
    }
  },

  // 6. IN-APP LIVE SUPPORT DESK
  async getSupportTickets(req: Request, res: Response) {
    try {
      const { status } = req.query;
      let tickets = await dbRepo.getSupportTickets();
      if (status && status !== 'ALL') {
        tickets = tickets.filter((t) => t.status === status);
      }
      return res.json({
        success: true,
        count: tickets.length,
        data: tickets,
      });
    } catch (error: any) {
      console.error('admin getSupportTickets error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch tickets' });
    }
  },

  async getSupportTicketById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const ticket = await dbRepo.getSupportTicketById(id);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      return res.json({
        success: true,
        data: ticket,
      });
    } catch (error: any) {
      console.error('admin getSupportTicketById error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch ticket' });
    }
  },

  async replySupportTicket(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { message, sender_name = 'Resi Support Specialist' } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Reply message cannot be empty' });
      }

      const updated = await dbRepo.addSupportReply(id, 'ADMIN', sender_name.trim(), message.trim());
      return res.json({
        success: true,
        message: 'Reply sent successfully',
        data: updated,
      });
    } catch (error: any) {
      console.error('admin replySupportTicket error:', error);
      return res.status(400).json({ success: false, message: error.message || 'Failed to send reply' });
    }
  },

  async updateSupportTicketStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (status !== 'OPEN' && status !== 'RESOLVED') {
        return res.status(400).json({ success: false, message: 'Status must be either OPEN or RESOLVED' });
      }

      const updated = await dbRepo.updateSupportTicketStatus(id, status);
      return res.json({
        success: true,
        message: `Ticket marked as ${status}`,
        data: updated,
      });
    } catch (error: any) {
      console.error('admin updateSupportTicketStatus error:', error);
      return res.status(400).json({ success: false, message: error.message || 'Failed to update ticket status' });
    }
  },

  async seedDemoSupportTicket(req: Request, res: Response) {
    try {
      const users = await dbRepo.getAllUsers();
      const user = (users as any)[0] || { id: 'usr_demo', full_name: 'Alex Morgan', email: 'demo@resi.com' };
      const subjects = [
        'M-PESA Payment Query: Delay in STK push confirmation',
        'Requesting Tier 3 Account Verification for higher limits',
        'Assistance with Investment Portfolio compounding options',
        'Virtual Card online activation for international SaaS payment',
      ];
      const randomSubject = subjects[Math.floor(Math.random() * subjects.length)];

      const ticket = await dbRepo.createSupportTicket({
        user_id: user.id || 'usr_demo_f799ace2',
        user_name: user.full_name || 'Alex Morgan',
        user_email: user.email || 'demo@resi.com',
        subject: req.body.subject || randomSubject,
        message: req.body.message || 'Hi Resi Support team, could you please look into my inquiry regarding transaction limits and account status?',
        priority: req.body.priority || 'NORMAL',
      });

      return res.status(201).json({
        success: true,
        message: 'New support ticket simulated successfully!',
        data: ticket,
      });
    } catch (error: any) {
      console.error('admin seedDemoSupportTicket error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to seed support ticket' });
    }
  },
};
