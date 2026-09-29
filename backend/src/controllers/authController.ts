import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { dbRepo } from '../database/repository';
import { AuthenticatedRequest } from '../middleware/auth';

export const authController = {
  async setupAuthenticator(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const user = await dbRepo.findUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      const secret = speakeasy.generateSecret({ name: `Resi (${user.email})`, issuer: 'Resi' });
      await dbRepo.setTwoFactorSecret(userId, secret.base32, false);
      return res.json({ success: true, data: { secret: secret.base32, qr_code: await QRCode.toDataURL(secret.otpauth_url || '') } });
    } catch (error: any) { return res.status(500).json({ success: false, message: error.message }); }
  },

  async confirmAuthenticator(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const code = String(req.body?.code || '').replace(/\s/g, '');
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const user = await dbRepo.findUserById(userId);
      if (!user?.two_factor_secret || !speakeasy.totp.verify({ secret: user.two_factor_secret, encoding: 'base32', token: code, window: 1 })) return res.status(400).json({ success: false, message: 'Invalid authenticator code' });
      await dbRepo.setTwoFactorSecret(userId, user.two_factor_secret, true);
      return res.json({ success: true, message: 'Google Authenticator enabled' });
    } catch (error: any) { return res.status(500).json({ success: false, message: error.message }); }
  },
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
      const referralCode = `RESI-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      const suppliedReferralCode = String(req.body.referral_code || '').trim();
      const referrer = suppliedReferralCode ? await dbRepo.findUserByReferralCode(suppliedReferralCode) : null;
      if (suppliedReferralCode && !referrer) {
        return res.status(400).json({ success: false, message: 'That referral code is invalid' });
      }

      const newUser = await dbRepo.createUser({
        id: userId,
        full_name,
        email: email.toLowerCase().trim(),
        phone,
        password_hash,
        transaction_pin: pin_hash,
        tier: 1,
        is_verified: false,
        referral_code: referralCode,
        referred_by: referrer?.id,
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

      if (referrer && referralBonusAmount > 0) {
        const referrerWallet = await dbRepo.getWalletByUserId(referrer.id);
        const newMemberBonus = Number((referralBonusAmount / 2).toFixed(2));
        if (referrerWallet) {
          await dbRepo.updateWalletBalance(referrerWallet.id, referralBonusAmount, referralBonusAmount);
          await dbRepo.createTransaction({ id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, user_id: referrer.id, wallet_id: referrerWallet.id, type: 'DEPOSIT', amount: referralBonusAmount, fee: 0, status: 'SUCCESS', reference: `REF_REWARD_${Date.now()}`, channel: 'PROMOTIONAL', description: `Referral reward for ${newUser.full_name}`, created_at: now });
        }
        await dbRepo.updateWalletBalance(wallet.id, newMemberBonus, newMemberBonus);
        await dbRepo.createTransaction({ id: `tx_${uuidv4().replace(/-/g, '').slice(0, 12)}`, user_id: userId, wallet_id: wallet.id, type: 'DEPOSIT', amount: newMemberBonus, fee: 0, status: 'SUCCESS', reference: `REF_WELCOME_${Date.now()}`, channel: 'PROMOTIONAL', description: 'Referral welcome bonus', created_at: now });
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
      const { email, password, totp_code } = req.body;
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

      if (user.two_factor_enabled && (!user.two_factor_secret || !speakeasy.totp.verify({ secret: user.two_factor_secret, encoding: 'base32', token: String(totp_code || '').replace(/\s/g, ''), window: 1 }))) {
        return res.status(401).json({ success: false, message: 'Enter the current 6-digit Google Authenticator code' });
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
            auto_lock_minutes: user.auto_lock_minutes || 1,
            two_factor_enabled: !!user.two_factor_enabled,
            referral_code: user.referral_code,
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

  async updateSecuritySettings(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const autoLockMinutes = Number(req.body?.auto_lock_minutes);
      const twoFactorEnabled = Boolean(req.body?.two_factor_enabled);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!Number.isInteger(autoLockMinutes) || ![1, 5, 10, 15, 30].includes(autoLockMinutes)) {
        return res.status(400).json({ success: false, message: 'Choose a valid auto-lock duration' });
      }
      await dbRepo.updateUserSecuritySettings(userId, autoLockMinutes, twoFactorEnabled);
      return res.json({ success: true, message: 'Security settings saved' });
    } catch (error: any) { return res.status(500).json({ success: false, message: error.message }); }
  },

  async updatePassword(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { current_password, new_password } = req.body;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!new_password || new_password.length < 8) return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
      const user = await dbRepo.findUserById(userId);
      if (!user || !(await bcrypt.compare(current_password || '', user.password_hash))) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      await dbRepo.updateUserPassword(userId, await bcrypt.hash(new_password, 10));
      return res.json({ success: true, message: 'Password updated successfully' });
    } catch (error: any) { return res.status(500).json({ success: false, message: error.message }); }
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
            auto_lock_minutes: user.auto_lock_minutes || 1,
            two_factor_enabled: !!user.two_factor_enabled,
            created_at: user.created_at,
            referral_code: user.referral_code,
          },
          wallet,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  async completeVerification(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const nationalId = String(req.body?.national_id || '').trim();
      const dateOfBirth = String(req.body?.date_of_birth || '').trim();
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!/^\d{7,8}$/.test(nationalId)) {
        return res.status(400).json({ success: false, message: 'Enter a valid 7 or 8 digit National ID number' });
      }
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth)) {
        return res.status(400).json({ success: false, message: 'Enter date of birth as DD/MM/YYYY' });
      }

      const user = await dbRepo.completeUserVerification(userId, nationalId, dateOfBirth);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({ success: true, message: 'Identity verification completed successfully' });
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'That National ID is already registered' });
      }
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
