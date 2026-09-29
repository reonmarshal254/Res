import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { dbRepo } from '../database/repository';
import { AuthenticatedRequest } from '../middleware/auth';

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const { full_name, email, phone, password, transaction_pin } = req.body;

      if (!full_name || !email || !phone || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide full name, email, phone, and password',
        });
      }

      // Check if user already exists
      const existingUser = await dbRepo.findUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists',
        });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const pin = transaction_pin || '1234';
      const pin_hash = await bcrypt.hash(pin, 10);

      const userId = `usr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = new Date().toISOString();

      const newUser = await dbRepo.createUser({
        id: userId,
        full_name,
        email: email.toLowerCase().trim(),
        phone,
        password_hash,
        transaction_pin: pin_hash,
        tier: 1,
        is_verified: true,
        created_at: now,
        updated_at: now,
      });

      // Fetch dynamic system configuration for welcome & referral bonuses
      const systemSettings = await dbRepo.getSystemSettings();
      const isSignupBonusEnabled = systemSettings?.signup_bonus_enabled !== false;
      const welcomeBonusAmount = isSignupBonusEnabled ? Number(systemSettings?.welcome_bonus ?? 25000.00) : 0;
      const referralBonusAmount = Number(systemSettings?.referral_bonus ?? 500.00);

      // Generate Virtual Account Number for Wallet (NUBAN format, 10 digits)
      const accountNumber = `81${Math.floor(10000000 + Math.random() * 90000000)}`;
      const walletId = `wlt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

      const wallet = await dbRepo.createWallet({
        id: walletId,
        user_id: userId,
        account_number: accountNumber,
        bank_name: 'Resi M-Bank Kenya',
        balance: welcomeBonusAmount,
        ledger_balance: welcomeBonusAmount,
        currency: config.paystack.currency || 'KES',
        is_frozen: false,
        created_at: now,
        updated_at: now,
      });

      // Create welcome bonus transaction record only if signup bonus is active
      if (isSignupBonusEnabled && welcomeBonusAmount > 0) {
        await dbRepo.createTransaction({
          id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          user_id: userId,
          wallet_id: wallet.id,
          type: 'DEPOSIT',
          amount: welcomeBonusAmount,
          fee: 0,
          status: 'SUCCESS',
          reference: `WELCOME_${Date.now()}`,
          channel: 'PROMOTIONAL',
          description: `Welcome Bonus (Configured: KES ${welcomeBonusAmount.toLocaleString()})`,
          created_at: now,
        });
      }

      // Handle referral bonus if referral code was provided
      const referralCode = req.body.referral_code;
      if (referralCode && referralBonusAmount > 0) {
        try {
          // Find first existing user/referrer or default demo user
          const allUsers = await dbRepo.getAllUsers();
          const referrer = allUsers.find(u => u.id !== userId) || allUsers[0];
          if (referrer && referrer.wallet_id) {
            await dbRepo.updateWalletBalance(referrer.wallet_id, referralBonusAmount, referralBonusAmount);
            await dbRepo.createTransaction({
              id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
              user_id: referrer.id,
              wallet_id: referrer.wallet_id,
              type: 'DEPOSIT',
              amount: referralBonusAmount,
              fee: 0,
              status: 'SUCCESS',
              reference: `REF_${Date.now()}`,
              channel: 'PROMOTIONAL',
              description: `Referral Reward: ${newUser.full_name} joined Resi`,
              created_at: now,
            });
          }
        } catch (refErr) {
          console.warn('Referral reward credit skipped:', refErr);
        }
      }

      const token = jwt.sign(
        { userId: newUser.id, email: newUser.email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );

      return res.status(201).json({
        success: true,
        message: 'Account successfully registered',
        data: {
          token,
          user: {
            id: newUser.id,
            full_name: newUser.full_name,
            email: newUser.email,
            phone: newUser.phone,
            tier: newUser.tier,
            is_verified: newUser.is_verified,
          },
          wallet: {
            id: wallet.id,
            account_number: wallet.account_number,
            bank_name: wallet.bank_name,
            balance: wallet.balance,
            currency: wallet.currency,
          },
        },
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      return res.status(500).json({
        success: false,
        message: 'Registration failed. ' + error.message,
      });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide email and password',
        });
      }

      const user = await dbRepo.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Check if user is suspended by admin
      if (user.is_suspended) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been suspended by administration. Please contact customer support.',
        });
      }

      let wallet = await dbRepo.getWalletByUserId(user.id);
      if (!wallet) {
        const accountNumber = `81${Math.floor(10000000 + Math.random() * 90000000)}`;
        wallet = await dbRepo.createWallet({
          id: `wlt_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          user_id: user.id,
          account_number: accountNumber,
          bank_name: 'Resi M-Bank Kenya',
          balance: 25000.00,
          ledger_balance: 25000.00,
          currency: config.paystack.currency || 'KES',
          is_frozen: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            tier: user.tier,
            is_verified: user.is_verified,
          },
          wallet: {
            id: wallet.id,
            account_number: wallet.account_number,
            bank_name: wallet.bank_name,
            balance: wallet.balance,
            currency: wallet.currency,
          },
        },
      });
    } catch (error: any) {
      console.error('Login error:', error);
      return res.status(500).json({
        success: false,
        message: 'Login failed. ' + error.message,
      });
    }
  },

  async getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const user = await dbRepo.findUserById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const wallet = await dbRepo.getWalletByUserId(userId);

      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            tier: user.tier,
            is_verified: user.is_verified,
            created_at: user.created_at,
          },
          wallet,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async updatePin(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { old_pin, new_pin } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!new_pin || new_pin.length !== 4) {
        return res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits' });
      }

      const user = await dbRepo.findUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // If user had a pin set, verify old pin
      if (old_pin && user.transaction_pin) {
        const isMatch = await bcrypt.compare(old_pin, user.transaction_pin);
        if (!isMatch) {
          return res.status(400).json({ success: false, message: 'Current PIN is incorrect' });
        }
      }

      const hashedNewPin = await bcrypt.hash(new_pin, 10);
      await dbRepo.updateUserPin(userId, hashedNewPin);

      return res.json({
        success: true,
        message: 'Transaction PIN updated successfully',
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async verifyPin(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { pin } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!pin || pin.length !== 4) {
        return res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits' });
      }

      const user = await dbRepo.findUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const isMatch = await bcrypt.compare(pin, user.transaction_pin);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Incorrect PIN' });
      }

      return res.json({ success: true, message: 'PIN verified successfully' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
