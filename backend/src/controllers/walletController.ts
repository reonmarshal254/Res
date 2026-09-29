import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { dbRepo } from '../database/repository';
import { paystackService } from '../services/paystack';

export const walletController = {
  async getWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      let wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }

      // Compute total invested & active loan liabilities
      const investments = await dbRepo.getUserInvestments(userId);
      const totalInvested = investments
        .filter((i) => i.status === 'ACTIVE')
        .reduce((sum, item) => sum + item.principal_amount, 0);

      const loans = await dbRepo.getUserLoans(userId);
      const totalLoanDebt = loans
        .filter((l) => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + (l.total_payable - l.amount_paid), 0);

      return res.json({
        success: true,
        data: {
          wallet,
          summary: {
            available_balance: wallet.balance,
            ledger_balance: wallet.ledger_balance,
            total_invested: totalInvested,
            total_loan_debt: totalLoanDebt,
            net_worth: wallet.balance + totalInvested - totalLoanDebt,
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async chargeMpesaDeposit(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const userEmail = req.user?.email;
      const { amount, phone } = req.body;

      if (!userId || !userEmail) return res.status(401).json({ success: false, message: 'Unauthorized' });

      // 1. Dynamic System Settings validation for Minimum Deposit
      const systemSettings = await dbRepo.getSystemSettings();
      const minDeposit = Number(systemSettings?.min_deposit ?? 10);

      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || isNaN(numAmount) || numAmount < minDeposit || numAmount > 300000) {
        return res.status(400).json({
          success: false,
          message: `Deposit amount must be a valid number between KSh ${minDeposit} and KSh 300,000`,
        });
      }

      // Check if user is suspended
      const user = await dbRepo.findUserById(userId);
      if (user?.is_suspended) {
        return res.status(403).json({ success: false, message: 'Your account has been suspended by administration. Deposits disabled.' });
      }

      // 2. Strict Kenyan Safaricom Phone Validation
      // Accepts: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, +2541XXXXXXXX, 2547XXXXXXXX, 2541XXXXXXXX
      const kenyanPhoneRegex = /^(?:\+?254|0)?([71][0-9]{8})$/;
      if (!phone || typeof phone !== 'string' || !kenyanPhoneRegex.test(phone.trim().replace(/\s+/g, ''))) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Kenyan Safaricom M-PESA number (e.g. 0712345678 or +254712345678)',
        });
      }

      const wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });

      if (wallet.is_frozen) {
        return res.status(403).json({ success: false, message: 'Your wallet has been suspended. Please contact support.' });
      }

      // 3. Prevent STK Push flooding / spamming (Rate-limiting active requests per user)
      const recentTxs = await dbRepo.getTransactionsByUserId(userId, 10);
      const activePending = recentTxs.find(
        (t) =>
          t.type === 'DEPOSIT' &&
          t.status === 'PENDING' &&
          Date.now() - new Date(t.created_at).getTime() < 15000 // within last 15 seconds
      );
      if (activePending) {
        return res.status(429).json({
          success: false,
          message: 'An M-PESA prompt was recently dispatched. Please check your phone or wait 15 seconds before retrying.',
        });
      }

      // Format strictly to +254XXXXXXXXX for Paystack
      const cleanPhone = paystackService.normalizeKenyanPhone(phone.trim());
      const reference = `resi_mpesa_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

      // Save initial PENDING transaction in DB
      await dbRepo.createTransaction({
        id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        user_id: userId,
        wallet_id: wallet.id,
        type: 'DEPOSIT',
        amount: numAmount,
        fee: 0,
        status: 'PENDING',
        reference,
        channel: 'M-PESA',
        description: `M-PESA Express Top-up (${cleanPhone})`,
        metadata: {
          phone: cleanPhone,
          initiated_at: new Date().toISOString(),
          payment_method: 'MPESA_DIRECT',
        },
        created_at: new Date().toISOString(),
      });

      // Call Live Paystack Charge API
      const chargeResult = await paystackService.chargeMpesa(
        userEmail,
        numAmount,
        cleanPhone,
        reference,
        { userId, walletId: wallet.id, phone: cleanPhone }
      );

      return res.status(200).json({
        success: true,
        message: chargeResult.display_text || 'M-PESA prompt sent to your phone. Enter your PIN to complete.',
        data: {
          reference,
          amount: numAmount,
          phone: cleanPhone,
          charge_status: chargeResult.charge_status,
          display_text: chargeResult.display_text,
        },
      });
    } catch (error: any) {
      console.error('M-PESA charge error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Payment gateway connection error' });
    }
  },

  async initializeDeposit(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const userEmail = req.user?.email;
      const { amount } = req.body;

      if (!userId || !userEmail) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const depositAmount = parseFloat(amount);
      if (isNaN(depositAmount) || depositAmount < 10) {
        return res.status(400).json({
          success: false,
          message: 'Minimum deposit amount is KSh 10',
        });
      }

      const wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
      if (wallet.is_frozen) return res.status(403).json({ success: false, message: 'Wallet is suspended' });

      const reference = `resi_dep_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

      await dbRepo.createTransaction({
        id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        user_id: userId,
        wallet_id: wallet.id,
        type: 'DEPOSIT',
        amount: depositAmount,
        fee: 0,
        status: 'PENDING',
        reference,
        channel: 'PAYSTACK',
        description: `Wallet top-up via Paystack`,
        metadata: { initiated_at: new Date().toISOString() },
        created_at: new Date().toISOString(),
      });

      const paystackData = await paystackService.initializeDeposit(userEmail, depositAmount, reference, {
        userId,
        walletId: wallet.id,
      });

      return res.json({
        success: true,
        message: 'Deposit initialized. Complete authorization on Paystack.',
        data: {
          authorization_url: paystackData.authorization_url,
          access_code: paystackData.access_code,
          reference: paystackData.reference,
          amount: depositAmount,
        },
      });
    } catch (error: any) {
      console.error('Deposit error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async verifyDeposit(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { reference } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!reference || typeof reference !== 'string') {
        return res.status(400).json({ success: false, message: 'Valid transaction reference is required' });
      }

      // 1. Fetch transaction record from DB
      const transaction = await dbRepo.findTransactionByReference(reference);
      if (!transaction) {
        return res.status(404).json({ success: false, message: 'Transaction record not found' });
      }

      // 2. IDOR Prevention: Enforce that the requesting user OWNS this transaction!
      if (transaction.user_id !== userId) {
        console.warn(`[SECURITY ALERT] IDOR attempt blocked: User ${userId} tried to verify transaction ${reference} belonging to user ${transaction.user_id}`);
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to verify this transaction',
        });
      }

      // 3. Replay Protection: If already settled, do NOT credit again!
      if (transaction.status === 'SUCCESS') {
        const wallet = await dbRepo.getWalletByUserId(userId);
        return res.json({
          success: true,
          is_pending: false,
          message: 'Deposit already verified and credited to wallet',
          data: { transaction, wallet },
        });
      }

      // 4. Query live Paystack API for strict status verification
      const verifyRes = await paystackService.verifyTransaction(reference);

      // CASE A: User has entered PIN and Paystack officially reports "success"
      if (verifyRes.status === true) {
        // Anti-Tampering Check: Verify Amount Matches Exactly!
        if (Math.abs(verifyRes.amount - transaction.amount) > 0.01) {
          console.error(
            `[SECURITY TAMPERING DETECTED] Amount mismatch for ref ${reference}: Expected KSh ${transaction.amount}, Gateway returned KSh ${verifyRes.amount}`
          );
          await dbRepo.updateTransactionStatus(reference, 'FAILED', {
            security_alert: 'AMOUNT_MISMATCH_TAMPERING',
            gateway_amount: verifyRes.amount,
          }, false);
          return res.status(400).json({
            success: false,
            message: 'Transaction failed: Security amount validation mismatch',
          });
        }

        // Anti-Tampering Check: Verify Currency is KES
        if (verifyRes.currency !== 'KES') {
          console.error(`[SECURITY TAMPERING DETECTED] Currency mismatch for ref ${reference}: Expected KES, got ${verifyRes.currency}`);
          await dbRepo.updateTransactionStatus(reference, 'FAILED', { security_alert: 'CURRENCY_MISMATCH' }, false);
          return res.status(400).json({
            success: false,
            message: 'Transaction failed: Invalid currency',
          });
        }

        // Atomic State Transition: UPDATE only if status is STILL PENDING (Prevents Turbo Intruder double-spending race condition!)
        const updatedTx = await dbRepo.updateTransactionStatus(
          reference,
          'SUCCESS',
          {
            paid_at: verifyRes.paid_at,
            gateway_response: verifyRes.gateway_response,
            verified_via: 'LIVE_PAYSTACK_GATEWAY',
          },
          true // requirePending = true
        );

        if (!updatedTx) {
          // Another concurrent request already settled this transaction
          const wallet = await dbRepo.getWalletByUserId(userId);
          return res.json({
            success: true,
            is_pending: false,
            message: 'Transaction was settled by a concurrent confirmation',
            data: { transaction, wallet },
          });
        }

        // Credit wallet balance atomically
        const updatedWallet = await dbRepo.updateWalletBalance(
          transaction.wallet_id,
          transaction.amount,
          transaction.amount
        );

        console.log(`[DEPOSIT SETTLED] Successfully credited KSh ${transaction.amount} to user ${userId} for ref ${reference}`);

        return res.json({
          success: true,
          is_pending: false,
          message: `Successfully credited KSh ${transaction.amount.toLocaleString()} to your wallet!`,
          data: {
            transaction: updatedTx,
            wallet: updatedWallet,
          },
        });
      }

      // CASE B: Payment is STILL PENDING (user is still viewing the STK Push on their phone, hasn't entered PIN yet)
      if (verifyRes.is_pending === true) {
        return res.status(200).json({
          success: false,
          is_pending: true,
          message: verifyRes.gateway_response || 'Waiting for M-PESA PIN authorization on your phone...',
        });
      }

      // CASE C: Payment failed, expired, cancelled, or rejected by Safaricom/Paystack
      await dbRepo.updateTransactionStatus(
        reference,
        'FAILED',
        {
          gateway_response: verifyRes.gateway_response,
          raw_status: verifyRes.raw_status,
        },
        false
      );

      return res.status(400).json({
        success: false,
        is_pending: false,
        message: verifyRes.gateway_response || 'Payment was cancelled or failed on your phone',
      });
    } catch (error: any) {
      console.error('Verify deposit error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Error communicating with payment gateway' });
    }
  },

  async requestWithdrawal(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { amount, bank_code, bank_name, account_number, account_name, pin } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      if (!amount || !bank_code || !account_number || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Amount, bank code, account number, and transaction PIN are required',
        });
      }

      const settings = await dbRepo.getSystemSettings();
      const minWithdrawal = Number(settings?.min_withdrawal ?? 100);

      const withdrawAmount = parseFloat(amount);
      if (isNaN(withdrawAmount) || withdrawAmount < minWithdrawal) {
        return res.status(400).json({
          success: false,
          message: `Minimum withdrawal amount is KSh ${minWithdrawal}`,
        });
      }

      // Verify Transaction PIN
      const user = await dbRepo.findUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      if (user.is_suspended) {
        return res.status(403).json({ success: false, message: 'Account has been suspended by administration. Withdrawals disabled.' });
      }

      const isPinValid = await bcrypt.compare(pin, user.transaction_pin);
      if (!isPinValid) {
        return res.status(403).json({
          success: false,
          message: 'Invalid transaction PIN. Withdrawal rejected.',
        });
      }

      const wallet = await dbRepo.getWalletByUserId(userId);
      if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
      if (wallet.is_frozen) {
        return res.status(403).json({ success: false, message: 'Your wallet has been suspended. Withdrawals disabled.' });
      }

      const fee = withdrawAmount > 50000 ? 50 : 25; // Standard M-PESA / PesaLink tariff
      const totalDebit = withdrawAmount + fee;

      if (wallet.balance < totalDebit) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Available: KSh ${wallet.balance.toLocaleString()}, Required: KSh ${totalDebit.toLocaleString()} (including KSh ${fee} fee)`,
        });
      }

      const reference = `resi_wth_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

      // Debit wallet balance
      const updatedWallet = await dbRepo.updateWalletBalance(wallet.id, -totalDebit, -totalDebit);

      // Create transaction
      const tx = await dbRepo.createTransaction({
        id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        user_id: userId,
        wallet_id: wallet.id,
        type: 'WITHDRAWAL',
        amount: withdrawAmount,
        fee,
        status: 'SUCCESS',
        reference,
        channel: 'PAYSTACK_TRANSFER',
        description: `Transfer to ${account_name || 'Recipient'} (${bank_name || 'Bank/M-PESA'}) - Acct: ${account_number}`,
        metadata: {
          bank_code,
          bank_name,
          account_number,
          account_name,
        },
        created_at: new Date().toISOString(),
      });

      // Dispatch to Paystack Transfer
      await paystackService.initiateTransfer(
        withdrawAmount,
        account_number,
        bank_code,
        account_name || 'Valued Customer',
        `Resi Wallet Withdrawal ${reference}`
      );

      return res.json({
        success: true,
        message: `Successfully withdrawn KSh ${withdrawAmount.toLocaleString()} to ${bank_name}`,
        data: {
          transaction: tx,
          wallet: updatedWallet,
        },
      });
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async getBanks(req: AuthenticatedRequest, res: Response) {
    try {
      const banks = await paystackService.listBanks();
      return res.json({ success: true, data: banks });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async resolveAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const { account_number, bank_code } = req.query;
      if (!account_number || !bank_code) {
        return res.status(400).json({ success: false, message: 'Account number and bank code required' });
      }

      const result = await paystackService.resolveAccountNumber(
        account_number as string,
        bank_code as string
      );

      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async getTransactions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const transactions = await dbRepo.getTransactionsByUserId(userId, 50);
      return res.json({ success: true, data: transactions });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
