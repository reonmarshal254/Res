import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { dbRepo } from '../database/repository';

const router = Router();

router.post('/paystack', async (req: Request, res: Response) => {
  try {
    const paystackSignature = req.headers['x-paystack-signature'] as string;
    if (!paystackSignature) {
      console.warn('[SECURITY] Rejecting webhook without x-paystack-signature header');
      return res.status(401).json({ success: false, message: 'Missing webhook signature' });
    }

    // Cryptographic HMAC-SHA512 verification
    const hash = crypto
      .createHmac('sha512', config.paystack.secretKey)
      .update(JSON.stringify(req.body))
      .digest('hex');

    const hashBuf = Buffer.from(hash, 'utf8');
    const sigBuf = Buffer.from(paystackSignature, 'utf8');

    // Constant-time comparison to prevent timing attacks
    if (hashBuf.length !== sigBuf.length || !crypto.timingSafeEqual(hashBuf, sigBuf)) {
      console.warn('[SECURITY] Rejecting webhook with INVALID HMAC signature');
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body;
    console.log(`[Paystack Webhook] Verified event: ${event.event}`);

    if (event.event === 'charge.success' && event.data?.status === 'success') {
      const { reference, amount, currency } = event.data;

      // Anti-Tampering: Currency must be KES
      if (currency !== 'KES') {
        console.warn(`[SECURITY] Rejecting webhook with invalid currency: ${currency}`);
        return res.status(400).json({ error: 'Currency mismatch' });
      }

      const tx = await dbRepo.findTransactionByReference(reference);
      if (!tx) {
        console.warn(`[Webhook] Transaction ${reference} not found in database`);
        return res.status(200).json({ status: 'ignored' });
      }

      const depositAmount = (Number(amount) || 0) / 100;

      // Anti-Tampering: Amount must match recorded transaction
      if (Math.abs(depositAmount - tx.amount) > 0.01) {
        console.error(
          `[SECURITY TAMPERING] Webhook amount mismatch for ${reference}: Expected ${tx.amount}, got ${depositAmount}`
        );
        return res.status(400).json({ error: 'Amount mismatch' });
      }

      // Atomic State Transition: update only if still PENDING (prevents race condition double-credit)
      const updatedTx = await dbRepo.updateTransactionStatus(
        reference,
        'SUCCESS',
        {
          webhook_received_at: new Date().toISOString(),
          paystack_id: event.data.id,
          gateway_response: event.data.gateway_response || 'Approved via Webhook',
        },
        true // requirePending = true
      );

      if (updatedTx) {
        await dbRepo.updateWalletBalance(tx.wallet_id, depositAmount, depositAmount);
        console.log(`[Paystack Webhook] Successfully credited KES ${depositAmount} for reference: ${reference}`);
      }
    }

    // Always acknowledge 200 to Paystack
    return res.status(200).json({ status: 'success' });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
