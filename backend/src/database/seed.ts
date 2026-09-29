import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { initDatabase } from './db';
import { dbRepo } from './repository';

async function seed() {
  console.log('🌱 Starting database seed for Resi Fintech...');
  await initDatabase();

  const demoEmail = 'demo@resi.com';
  let demoUser = await dbRepo.findUserByEmail(demoEmail);

  if (!demoUser) {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const pinHash = await bcrypt.hash('1234', 10);
    const now = new Date().toISOString();

    const userId = `usr_demo_${uuidv4().slice(0, 8)}`;
    demoUser = await dbRepo.createUser({
      id: userId,
      full_name: 'Alex Morgan',
      email: demoEmail,
      phone: '+254712982345',
      password_hash: passwordHash,
      transaction_pin: pinHash,
      tier: 2,
      is_verified: true,
      created_at: now,
      updated_at: now,
    });

    const walletId = `wlt_demo_${uuidv4().slice(0, 8)}`;
    const wallet = await dbRepo.createWallet({
      id: walletId,
      user_id: userId,
      account_number: '0712982345',
      bank_name: 'Resi M-Bank Kenya',
      balance: 150000.00,
      ledger_balance: 150000.00,
      currency: 'KES',
      is_frozen: false,
      created_at: now,
      updated_at: now,
    });

    // Seed sample transactions
    await dbRepo.createTransaction({
      id: `tx_${uuidv4().slice(0, 8)}`,
      user_id: userId,
      wallet_id: walletId,
      type: 'DEPOSIT',
      amount: 150000.00,
      fee: 0,
      status: 'SUCCESS',
      reference: `INIT_DEP_${Date.now()}`,
      channel: 'PAYSTACK',
      description: 'Initial Wallet Funding via M-PESA / Card',
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    });

    // Seed sample investment
    const plans = await dbRepo.getAllInvestmentPlans();
    if (plans.length > 0) {
      const plan = plans[0];
      const invStartDate = new Date(Date.now() - 86400000 * 15);
      const invEndDate = new Date(Date.now() + 86400000 * 75);
      await dbRepo.createInvestment({
        id: `inv_seed_${uuidv4().slice(0, 8)}`,
        user_id: userId,
        plan_id: plan.id,
        plan_name: plan.name,
        principal_amount: 50000,
        expected_return: 51664.38,
        actual_return: 0,
        duration_days: plan.duration_days,
        start_date: invStartDate.toISOString(),
        maturity_date: invEndDate.toISOString(),
        status: 'ACTIVE',
        created_at: invStartDate.toISOString(),
      });
    }

    console.log('✅ Demo account seeded successfully:');
    console.log('   Email: demo@resi.com');
    console.log('   Password: Password123!');
    console.log('   Transaction PIN: 1234');
    console.log(`   Wallet Balance: KSh 150,000.00 (KES)`);
    console.log(`   Account / M-PESA: ${wallet.account_number} (${wallet.bank_name})`);
  } else {
    console.log('ℹ️ Demo account already exists.');
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
