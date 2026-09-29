import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { dbRepo } from '../database/repository';
import { UserInvestment } from '../types';

export const investmentController = {
  async getPlans(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ success: true, data: [{
        id: 'resi_savings_16', name: 'Resi Growth Savings', category: 'Flexible Savings', annual_percentage_yield: 16,
        duration_days: 365, min_amount: 100, max_amount: 5000000, risk_level: 'LOW',
        description: 'A secure savings account earning 16% per annum, calculated daily and paid at maturity.',
      }] });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async getPlanDetails(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const plan = await dbRepo.getInvestmentPlanById(id);
      if (!plan) return res.status(404).json({ success: false, message: 'Investment plan not found' });

      // Example projection for min_amount
      const exampleAmount = plan.min_amount;
      const projectedGain = (exampleAmount * (plan.annual_percentage_yield / 100) * (plan.duration_days / 365));

      return res.json({
        success: true,
        data: {
          plan,
          sample_projection: {
            principal: exampleAmount,
            projected_gain: Number(projectedGain.toFixed(2)),
            total_payout: Number((exampleAmount + projectedGain).toFixed(2)),
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async investInPlan(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { plan_id, amount, pin } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!plan_id || !amount || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Plan ID, investment amount, and transaction PIN are required',
        });
      }

      const investAmount = parseFloat(amount);
      if (isNaN(investAmount) || investAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid investment amount' });
      }

      // Check PIN
      const user = await dbRepo.findUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const isPinValid = await bcrypt.compare(pin, user.transaction_pin);
      if (!isPinValid) {
        return res.status(403).json({ success: false, message: 'Invalid transaction PIN' });
      }

      // Check Plan bounds
      const plan = plan_id === 'resi_savings_16'
        ? { id: 'resi_savings_16', name: 'Resi Growth Savings', annual_percentage_yield: 16, duration_days: 365, min_amount: 100, max_amount: 5000000 }
        : await dbRepo.getInvestmentPlanById(plan_id);
      if (!plan) return res.status(404).json({ success: false, message: 'Investment plan not found' });

      if (investAmount < plan.min_amount) {
        return res.status(400).json({
          success: false,
          message: `Minimum investment for this plan is KSh ${plan.min_amount.toLocaleString()}`,
        });
      }

      if (investAmount > plan.max_amount) {
        return res.status(400).json({
          success: false,
          message: `Maximum investment for this plan is KSh ${plan.max_amount.toLocaleString()}`,
        });
      }

      // Check Wallet
      const wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet || wallet.balance < investAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. You have KSh ${wallet ? wallet.balance.toLocaleString() : 0}`,
        });
      }

      // Calculate Expected Returns
      const expectedProfit = (investAmount * (plan.annual_percentage_yield / 100) * (plan.duration_days / 365));
      const expectedTotalReturn = Number((investAmount + expectedProfit).toFixed(2));

      const startDate = new Date();
      const maturityDate = new Date();
      maturityDate.setDate(startDate.getDate() + plan.duration_days);

      const investmentId = `inv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

      // Debit wallet
      const updatedWallet = await dbRepo.updateWalletBalance(wallet.id, -investAmount, -investAmount);

      // Create transaction
      await dbRepo.createTransaction({
        id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        user_id: userId,
        wallet_id: wallet.id,
        type: 'INVESTMENT',
        amount: investAmount,
        fee: 0,
        status: 'SUCCESS',
        reference: `resi_inv_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        channel: 'WALLET',
        description: `Invested in ${plan.name} (${plan.annual_percentage_yield}% APY)`,
        metadata: { plan_id, investmentId, apy: plan.annual_percentage_yield },
        created_at: new Date().toISOString(),
      });

      // Record Investment
      const investment: UserInvestment = {
        id: investmentId,
        user_id: userId,
        plan_id: plan.id,
        plan_name: plan.name,
        principal_amount: investAmount,
        expected_return: expectedTotalReturn,
        actual_return: 0,
        duration_days: plan.duration_days,
        start_date: startDate.toISOString(),
        maturity_date: maturityDate.toISOString(),
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      };

      const savedInvestment = await dbRepo.createInvestment(investment);

      return res.status(201).json({
        success: true,
        message: `Successfully locked KSh ${investAmount.toLocaleString()} into ${plan.name}!`,
        data: {
          investment: savedInvestment,
          wallet: updatedWallet,
        },
      });
    } catch (error: any) {
      console.error('Investment error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async getUserInvestments(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const investments = await dbRepo.getUserInvestments(userId);

      // Calculate accrued earnings in real-time
      const enriched = investments.map((inv) => {
        const start = new Date(inv.start_date).getTime();
        const end = new Date(inv.maturity_date).getTime();
        const now = Date.now();
        const totalDuration = Math.max(1, end - start);
        const elapsed = Math.min(totalDuration, Math.max(0, now - start));
        const progress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

        const totalProfit = inv.expected_return - inv.principal_amount;
        const accruedProfit = Number(((elapsed / totalDuration) * totalProfit).toFixed(2));
        const isMatured = now >= end || inv.status === 'MATURED';

        return {
          ...inv,
          progress_percent: progress,
          accrued_profit: accruedProfit,
          current_value: Number((inv.principal_amount + accruedProfit).toFixed(2)),
          is_ready_to_claim: isMatured && inv.status === 'ACTIVE',
        };
      });

      const totalPortfolioValue = enriched.reduce((sum, item) => sum + item.current_value, 0);
      const totalAccruedReturns = enriched.reduce((sum, item) => sum + item.accrued_profit, 0);

      return res.json({
        success: true,
        data: {
          investments: enriched,
          portfolio_summary: {
            total_portfolio_value: Number(totalPortfolioValue.toFixed(2)),
            total_accrued_returns: Number(totalAccruedReturns.toFixed(2)),
            active_count: enriched.filter((i) => i.status === 'ACTIVE').length,
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async liquidateInvestment(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const inv = await dbRepo.getInvestmentById(id);
      if (!inv || inv.user_id !== userId) {
        return res.status(404).json({ success: false, message: 'Investment not found' });
      }

      if (inv.status !== 'ACTIVE') {
        return res.status(400).json({ success: false, message: 'Investment is already closed' });
      }

      const wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });

      const now = Date.now();
      const end = new Date(inv.maturity_date).getTime();
      const isMatured = now >= end;

      // If matured, payout expected return; if early exit, 5% fee on principal
      let payout = inv.expected_return;
      let note = 'Matured Yield Payout';

      if (!isMatured) {
        const penalty = inv.principal_amount * 0.05;
        payout = Number((inv.principal_amount - penalty).toFixed(2));
        note = 'Early Liquidation (5% penalty applied)';
      }

      await dbRepo.updateInvestmentStatus(id, isMatured ? 'MATURED' : 'LIQUIDATED', payout);
      const updatedWallet = await dbRepo.updateWalletBalance(wallet.id, payout, payout);

      // Record transaction
      await dbRepo.createTransaction({
        id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        user_id: userId,
        wallet_id: wallet.id,
        type: 'INVESTMENT_RETURN',
        amount: payout,
        fee: 0,
        status: 'SUCCESS',
        reference: `resi_ret_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        channel: 'WALLET',
        description: `Investment Return: ${inv.plan_name || 'Portfolio'} - ${note}`,
        metadata: { investment_id: id, isMatured },
        created_at: new Date().toISOString(),
      });

      return res.json({
        success: true,
        message: `Successfully liquidated! KSh ${payout.toLocaleString()} has been credited to your wallet.`,
        data: { wallet: updatedWallet },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
