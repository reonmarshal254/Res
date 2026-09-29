import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { dbRepo } from '../database/repository';
import { Loan, LoanSchedule } from '../types';

export const loanController = {
  async getEligibility(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await dbRepo.findUserById(userId);
      const wallet = await dbRepo.getWalletByUserId(userId);
      const existingLoans = await dbRepo.getUserLoans(userId);

      const activeLoan = existingLoans.find((l) => l.status === 'ACTIVE');
      const hasActiveLoan = !!activeLoan;

      // Base credit limit determined by tier + activity
      let maxLoanAmount = 250000;
      if (user?.tier && user.tier >= 2) maxLoanAmount = 500000;
      if (wallet && wallet.balance > 50000) maxLoanAmount += 150000;

      return res.json({
        success: true,
        data: {
          eligible: !hasActiveLoan,
          max_amount: maxLoanAmount,
          min_amount: 5000,
          monthly_interest_rate: 3.5, // 3.5% monthly flat
          available_tenures_months: [1, 3, 6, 12],
          active_loan: activeLoan || null,
          credit_score: 720,
          credit_tier: 'Prime Tier 1',
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async applyForLoan(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { amount, tenure_months, purpose, pin } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!amount || !tenure_months || !purpose || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Loan amount, tenure, purpose, and transaction PIN are required',
        });
      }

      const loanAmount = parseFloat(amount);
      const tenure = parseInt(tenure_months, 10);

      if (isNaN(loanAmount) || loanAmount < 5000) {
        return res.status(400).json({ success: false, message: 'Minimum loan amount is KSh 5,000 / $40' });
      }

      // Check PIN
      const user = await dbRepo.findUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const isPinValid = await bcrypt.compare(pin, user.transaction_pin);
      if (!isPinValid) {
        return res.status(403).json({ success: false, message: 'Invalid transaction PIN' });
      }

      // Check if user already has an active loan
      const existingLoans = await dbRepo.getUserLoans(userId);
      const hasActiveLoan = existingLoans.some((l) => l.status === 'ACTIVE');
      if (hasActiveLoan) {
        return res.status(400).json({
          success: false,
          message: 'You currently have an active loan. Please settle it before applying for another.',
        });
      }

      const wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });

      // Calculate interest (3.5% monthly flat interest)
      const monthlyRate = 3.5;
      const totalInterestRate = Number((monthlyRate * tenure).toFixed(2));
      const interestAmount = (loanAmount * (totalInterestRate / 100));
      const totalPayable = Number((loanAmount + interestAmount).toFixed(2));
      const monthlyInstallment = Number((totalPayable / tenure).toFixed(2));

      const loanId = `loan_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = new Date();
      const finalDueDate = new Date();
      finalDueDate.setMonth(finalDueDate.getMonth() + tenure);

      // Create repayment schedules
      const schedules: LoanSchedule[] = [];
      for (let i = 1; i <= tenure; i++) {
        const scheduleDueDate = new Date();
        scheduleDueDate.setMonth(scheduleDueDate.getMonth() + i);

        schedules.push({
          id: `sched_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          loan_id: loanId,
          installment_number: i,
          amount_due: i === tenure ? Number((totalPayable - monthlyInstallment * (tenure - 1)).toFixed(2)) : monthlyInstallment,
          amount_paid: 0,
          due_date: scheduleDueDate.toISOString(),
          status: 'PENDING',
        });
      }

      const loanRecord: Loan = {
        id: loanId,
        user_id: userId,
        amount: loanAmount,
        interest_rate: totalInterestRate,
        total_payable: totalPayable,
        amount_paid: 0,
        tenure_months: tenure,
        monthly_installment: monthlyInstallment,
        purpose,
        status: 'ACTIVE',
        disbursed_at: now.toISOString(),
        due_date: finalDueDate.toISOString(),
        created_at: now.toISOString(),
      };

      // Disburse directly to user's wallet
      const updatedWallet = await dbRepo.updateWalletBalance(wallet.id, loanAmount, loanAmount);

      // Record disbursement transaction
      await dbRepo.createTransaction({
        id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        user_id: userId,
        wallet_id: wallet.id,
        type: 'LOAN_DISBURSEMENT',
        amount: loanAmount,
        fee: 0,
        status: 'SUCCESS',
        reference: `resi_loan_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        channel: 'WALLET',
        description: `Instant Loan Disbursed: ${purpose}`,
        metadata: { loanId, tenure_months: tenure, monthly_installment: monthlyInstallment },
        created_at: now.toISOString(),
      });

      const savedLoan = await dbRepo.createLoan(loanRecord, schedules);

      return res.status(201).json({
        success: true,
        message: `Congratulations! KSh ${loanAmount.toLocaleString()} loan approved and disbursed to your wallet.`,
        data: {
          loan: savedLoan,
          wallet: updatedWallet,
        },
      });
    } catch (error: any) {
      console.error('Loan application error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async getUserLoans(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const loans = await dbRepo.getUserLoans(userId);
      return res.json({ success: true, data: loans });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async repayLoan(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { loan_id, amount, pin } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!loan_id || !amount || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Loan ID, repayment amount, and transaction PIN are required',
        });
      }

      const repayAmount = parseFloat(amount);
      if (isNaN(repayAmount) || repayAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid repayment amount' });
      }

      // Check PIN
      const user = await dbRepo.findUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const isPinValid = await bcrypt.compare(pin, user.transaction_pin);
      if (!isPinValid) {
        return res.status(403).json({ success: false, message: 'Invalid transaction PIN' });
      }

      const loan = await dbRepo.getLoanById(loan_id);
      if (!loan || loan.user_id !== userId) {
        return res.status(404).json({ success: false, message: 'Loan not found' });
      }

      if (loan.status === 'COMPLETED') {
        return res.status(400).json({ success: false, message: 'This loan has already been fully repaid' });
      }

      const remainingDebt = Number((loan.total_payable - loan.amount_paid).toFixed(2));
      const actualDeduction = Math.min(repayAmount, remainingDebt);

      const wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet || wallet.balance < actualDeduction) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. You need KSh ${actualDeduction.toLocaleString()}`,
        });
      }

      // Debit wallet
      const updatedWallet = await dbRepo.updateWalletBalance(wallet.id, -actualDeduction, -actualDeduction);

      // Record transaction
      await dbRepo.createTransaction({
        id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        user_id: userId,
        wallet_id: wallet.id,
        type: 'LOAN_REPAYMENT',
        amount: actualDeduction,
        fee: 0,
        status: 'SUCCESS',
        reference: `resi_repay_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        channel: 'WALLET',
        description: `Loan Repayment for Loan #${loan.id.slice(-6)}`,
        metadata: { loanId: loan.id, amount_repaid: actualDeduction },
        created_at: new Date().toISOString(),
      });

      // Update loan and schedule
      const updatedLoan = await dbRepo.recordLoanRepayment(loan.id, actualDeduction);

      return res.json({
        success: true,
        message: `Successfully repaid KSh ${actualDeduction.toLocaleString()}! Remaining balance: KSh ${Math.max(0, updatedLoan.total_payable - updatedLoan.amount_paid).toLocaleString()}`,
        data: {
          loan: updatedLoan,
          wallet: updatedWallet,
        },
      });
    } catch (error: any) {
      console.error('Loan repayment error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
