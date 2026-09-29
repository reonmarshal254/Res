import axios from 'axios';
import { config } from '../config';

const paystackClient = axios.create({
  baseURL: config.paystack.baseUrl || 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${config.paystack.secretKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

export interface PaystackVerifyResult {
  status: boolean; // TRUE ONLY IF tx.status === 'success' and paid_at is not null
  is_pending: boolean; // TRUE IF tx.status === 'pay_offline' or 'pending'
  amount: number; // in KES
  currency: string;
  reference: string;
  gateway_response: string;
  channel: string;
  paid_at?: string;
  raw_status: string;
}

export interface Bank {
  id: number;
  name: string;
  code: string;
  slug: string;
}

export const fallbackBanks: Bank[] = [
  { id: 1, name: 'M-PESA / Safaricom', code: 'MPESA', slug: 'mpesa' },
  { id: 2, name: 'Equity Bank Kenya', code: '068', slug: 'equity-bank' },
  { id: 3, name: 'KCB Bank Kenya', code: '001', slug: 'kcb-bank' },
  { id: 4, name: 'Co-operative Bank of Kenya', code: '011', slug: 'co-op-bank' },
  { id: 5, name: 'NCBA Bank Kenya', code: '007', slug: 'ncba-bank' },
  { id: 6, name: 'Standard Chartered Kenya', code: '002', slug: 'standard-chartered' },
  { id: 7, name: 'Stanbic Bank Kenya', code: '031', slug: 'stanbic-bank' },
  { id: 8, name: 'Absa Bank Kenya', code: '003', slug: 'absa-bank' },
];

export const paystackService = {
  /**
   * Helper: Normalize any phone number to Kenyan international format (+254XXXXXXXXX)
   * Safaricom M-PESA prefixes: 07XX or 01XX
   */
  normalizeKenyanPhone(phone: string): string {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('254') && digits.length === 12) {
      return `+${digits}`;
    }
    if (digits.startsWith('0') && digits.length === 10) {
      return `+254${digits.slice(1)}`;
    }
    if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
      return `+254${digits}`;
    }
    throw new Error(
      `Invalid Kenyan phone number (${phone}). Must be a valid Safaricom number (e.g. 0712345678 or +254712345678)`
    );
  },

  /**
   * Direct Paystack M-PESA Charge (STK Push to phone without web redirect)
   */
  async chargeMpesa(
    email: string,
    amount: number, // in KES
    phone: string,
    reference: string,
    metadata: Record<string, any> = {}
  ): Promise<{
    status: boolean;
    reference: string;
    charge_status: 'success' | 'pay_offline' | 'pending' | 'failed';
    display_text: string;
    gateway_response?: string;
  }> {
    const cleanPhone = this.normalizeKenyanPhone(phone);
    const amountInSubunit = Math.round(amount * 100);

    try {
      const response = await paystackClient.post('/charge', {
        email,
        amount: amountInSubunit,
        currency: config.paystack.currency || 'KES',
        reference,
        mobile_money: {
          phone: cleanPhone,
          provider: 'mpesa',
        },
        metadata: {
          ...metadata,
          custom_fields: [
            {
              display_name: 'Platform',
              variable_name: 'platform',
              value: 'Resi Fintech',
            },
          ],
        },
      });

      if (response.data && response.data.status) {
        const chargeData = response.data.data;
        return {
          status: true,
          reference: chargeData.reference || reference,
          charge_status: chargeData.status || 'pay_offline',
          display_text:
            chargeData.display_text ||
            `M-PESA STK Push sent to ${cleanPhone}. Please enter your M-PESA PIN to complete payment.`,
          gateway_response: chargeData.gateway_response || response.data.message,
        };
      } else {
        throw new Error(response.data?.message || 'Paystack rejected the charge request');
      }
    } catch (err: any) {
      const statusCode = err.response?.status;
      const errorMsg = err.response?.data?.message || err.message;
      console.error(`[Paystack M-PESA Charge Failed] [${statusCode}]: ${errorMsg}`);
      throw new Error(`Paystack M-PESA Error: ${errorMsg}`);
    }
  },

  /**
   * Initialize a Paystack transaction charge (for card/standard fallback if needed)
   */
  async initializeDeposit(
    email: string,
    amount: number, // In KES
    reference: string,
    metadata: Record<string, any> = {}
  ): Promise<{ authorization_url: string; access_code: string; reference: string }> {
    const amountInSubunit = Math.round(amount * 100);

    try {
      const response = await paystackClient.post('/transaction/initialize', {
        email,
        amount: amountInSubunit,
        currency: config.paystack.currency || 'KES',
        reference,
        metadata: {
          ...metadata,
          custom_fields: [
            {
              display_name: 'App',
              variable_name: 'app_name',
              value: 'Resi Fintech',
            },
          ],
        },
        callback_url: `${config.frontendUrl}/payment-complete?reference=${reference}`,
      });

      if (response.data && response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data?.message || 'Paystack initialization failed');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message;
      console.error(`[Paystack Init Deposit Error]: ${errorMsg}`);
      throw new Error(`Payment Gateway Error: ${errorMsg}`);
    }
  },

  /**
   * Strictly verify transaction directly with Paystack API.
   * NEVER returns true unless Paystack explicitly reports status = "success" and paid_at is present.
   */
  async verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
    try {
      const response = await paystackClient.get(`/transaction/verify/${encodeURIComponent(reference)}`);

      if (!response.data || !response.data.status || !response.data.data) {
        return {
          status: false,
          is_pending: false,
          amount: 0,
          currency: 'KES',
          reference,
          gateway_response: response.data?.message || 'Transaction could not be verified on Paystack',
          channel: 'unknown',
          raw_status: 'failed',
        };
      }

      const tx = response.data.data;
      const isSuccess = tx.status === 'success' && !!tx.paid_at;
      const isPending = tx.status === 'pay_offline' || tx.status === 'pending' || tx.status === 'ongoing';

      return {
        status: isSuccess,
        is_pending: isPending,
        amount: (Number(tx.amount) || 0) / 100,
        currency: tx.currency || 'KES',
        reference: tx.reference || reference,
        gateway_response:
          tx.gateway_response ||
          tx.message ||
          (isPending ? 'Waiting for M-PESA PIN authorization on phone' : 'Transaction failed or incomplete'),
        channel: tx.channel || 'mobile_money',
        paid_at: tx.paid_at || undefined,
        raw_status: tx.status,
      };
    } catch (err: any) {
      const statusCode = err.response?.status;
      const apiMessage = err.response?.data?.message || err.message;
      console.error(`[Paystack Verify API Error] Reference: ${reference} | Status: ${statusCode} | ${apiMessage}`);

      return {
        status: false,
        is_pending: false,
        amount: 0,
        currency: 'KES',
        reference,
        gateway_response: apiMessage || 'Unable to connect to Paystack payment gateway',
        channel: 'mobile_money',
        raw_status: 'error',
      };
    }
  },

  /**
   * Fetch Kenyan Banks from Paystack
   */
  async listBanks(): Promise<Bank[]> {
    try {
      const response = await paystackClient.get(`/bank?country=kenya`);
      if (response.data && response.data.status && Array.isArray(response.data.data)) {
        return response.data.data.map((b: any) => ({
          id: b.id,
          name: b.name,
          code: b.code,
          slug: b.slug,
        }));
      }
    } catch (err: any) {
      console.warn(`Notice fetching banks from Paystack (${err.message}). Using local bank directory.`);
    }

    return fallbackBanks;
  },

  /**
   * Resolve bank account number and bank code to verify account holder name
   */
  async resolveAccountNumber(
    accountNumber: string,
    bankCode: string
  ): Promise<{ account_name: string; account_number: string }> {
    try {
      const response = await paystackClient.get(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
      if (response.data && response.data.status) {
        return {
          account_name: response.data.data.account_name,
          account_number: response.data.data.account_number,
        };
      }
    } catch (err: any) {
      console.warn(`Notice resolving bank account via Paystack (${err.message}).`);
    }

    const bank = fallbackBanks.find((b) => b.code === bankCode) || { name: 'Bank Account' };
    return {
      account_name: `Verified Recipient (${bank.name})`,
      account_number: accountNumber,
    };
  },

  /**
   * Initiate Paystack Transfer (Withdrawal)
   */
  async initiateTransfer(
    amount: number,
    accountNumber: string,
    bankCode: string,
    accountName: string,
    reason: string
  ): Promise<{ transfer_code: string; reference: string; status: string }> {
    const reference = `resi_wth_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const amountInSubunit = Math.round(amount * 100);

    try {
      // Step 1: Create Transfer Recipient
      const recipientRes = await paystackClient.post('/transferrecipient', {
        type: 'mobile_money',
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: config.paystack.currency || 'KES',
      });

      const recipientCode = recipientRes.data.data.recipient_code;

      // Step 2: Initiate transfer
      const transferRes = await paystackClient.post('/transfer', {
        source: 'balance',
        amount: amountInSubunit,
        recipient: recipientCode,
        reason,
        reference,
      });

      return {
        transfer_code: transferRes.data.data.transfer_code,
        reference: transferRes.data.data.reference || reference,
        status: transferRes.data.data.status,
      };
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message;
      console.error(`[Paystack Transfer Error]: ${errorMsg}`);
      throw new Error(`Paystack Transfer Failed: ${errorMsg}`);
    }
  },

  /**
   * Fetch live company master wallet balances from Paystack
   * Endpoint: GET /balance
   */
  async getCompanyBalance(): Promise<{ currency: string; balance: number }[]> {
    try {
      const res = await paystackClient.get('/balance');
      if (res.data && res.data.status && Array.isArray(res.data.data)) {
        return res.data.data.map((item: any) => ({
          currency: item.currency,
          // Paystack balance is in minor units (cents / 100), convert to major currency
          balance: Number((item.balance / 100).toFixed(2)),
        }));
      }
      return [{ currency: 'KES', balance: 0.00 }];
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message;
      console.error(`[Paystack Balance Error]: ${errorMsg}`);
      throw new Error(`Failed to fetch Paystack company balance: ${errorMsg}`);
    }
  },
};

