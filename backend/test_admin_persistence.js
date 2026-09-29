const http = require('http');

const BASE_URL = 'http://localhost:5000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 TESTING ADMIN PERSISTENCE, SUSPENSION & SIGNUP BONUS');
  console.log('====================================================\n');

  try {
    // 1. Get current settings
    console.log('[TEST 1] Fetching admin system settings...');
    const s1 = await request('GET', '/api/admin/settings');
    console.log('   ↳ Status:', s1.status, 'Settings:', s1.body.data);
    if (s1.status !== 200 || !s1.body.success) throw new Error('Failed to fetch settings');

    // 2. Toggle signup bonus OFF
    console.log('\n[TEST 2] Toggling Signup Bonus OFF in PostgreSQL...');
    const s2 = await request('PUT', '/api/admin/settings', {
      signup_bonus_enabled: false,
      welcome_bonus: 25000,
      min_deposit: 50,
      min_withdrawal: 150,
    });
    console.log('   ↳ Status:', s2.status, 'Updated data:', s2.body.data);
    if (s2.body.data.signup_bonus_enabled !== false) throw new Error('signup_bonus_enabled was not saved as false');

    // 3. Register user while signup bonus is OFF
    const testEmail1 = `bonus_off_${Date.now()}@test.com`;
    console.log(`\n[TEST 3] Registering new user (${testEmail1}) while bonus is OFF...`);
    const reg1 = await request('POST', '/api/auth/register', {
      full_name: 'No Bonus User',
      email: testEmail1,
      phone: `0799${Math.floor(100000 + Math.random() * 900000)}`,
      password: 'Password123!',
      transaction_pin: '1234',
    });
    console.log('   ↳ Status:', reg1.status, 'Wallet balance:', reg1.body.data?.wallet?.balance);
    if (Number(reg1.body.data?.wallet?.balance) !== 0) {
      throw new Error(`Expected balance 0 when signup bonus is OFF, got ${reg1.body.data?.wallet?.balance}`);
    }
    console.log('   ✅ User received KSh 0.00 initial balance (Signup bonus toggle verified OFF)');

    // 4. Toggle signup bonus back ON with custom amount
    console.log('\n[TEST 4] Toggling Signup Bonus ON with KSh 30,000 in PostgreSQL...');
    const s3 = await request('PUT', '/api/admin/settings', {
      signup_bonus_enabled: true,
      welcome_bonus: 30000,
    });
    console.log('   ↳ Status:', s3.status, 'Settings:', s3.body.data);
    if (s3.body.data.signup_bonus_enabled !== true || Number(s3.body.data.welcome_bonus) !== 30000) {
      throw new Error('Failed to update signup_bonus_enabled to true');
    }

    // 5. Register user while signup bonus is ON
    const testEmail2 = `bonus_on_${Date.now()}@test.com`;
    console.log(`\n[TEST 5] Registering new user (${testEmail2}) with KSh 30,000 bonus active...`);
    const reg2 = await request('POST', '/api/auth/register', {
      full_name: 'Bonus On User',
      email: testEmail2,
      phone: `0798${Math.floor(100000 + Math.random() * 900000)}`,
      password: 'Password123!',
      transaction_pin: '1234',
    });
    console.log('   ↳ Status:', reg2.status, 'Wallet balance:', reg2.body.data?.wallet?.balance);
    if (Number(reg2.body.data?.wallet?.balance) !== 30000) {
      throw new Error(`Expected balance 30000, got ${reg2.body.data?.wallet?.balance}`);
    }
    console.log('   ✅ User received configured KSh 30,000 bonus');

    const testUserId = reg2.body.data.user.id;
    const testUserToken = reg2.body.data.token;

    // 6. Test User Account Suspension
    console.log(`\n[TEST 6] Suspending user (${testUserId}) in PostgreSQL...`);
    const suspRes = await request('PUT', `/api/admin/users/${testUserId}/suspend`, {
      is_suspended: true,
    });
    console.log('   ↳ Status:', suspRes.status, 'Message:', suspRes.body.message);
    if (suspRes.status !== 200 || !suspRes.body.data.is_suspended) throw new Error('Failed to suspend user');

    // Attempt login as suspended user
    console.log('   ↳ Attempting login with suspended user...');
    const loginFail = await request('POST', '/api/auth/login', {
      email: testEmail2,
      password: 'Password123!',
    });
    console.log('   ↳ Status:', loginFail.status, 'Message:', loginFail.body.message);
    if (loginFail.status !== 403) throw new Error(`Expected 403 Forbidden for suspended user, got ${loginFail.status}`);
    console.log('   ✅ Suspended user login strictly blocked with 403');

    // Attempt deposit as suspended user
    console.log('   ↳ Attempting deposit with suspended user token...');
    const depFail = await request('POST', '/api/wallet/deposit/mpesa-charge', {
      amount: 500,
      phone: '0712345678',
    }, testUserToken);
    console.log('   ↳ Status:', depFail.status, 'Message:', depFail.body.message);
    if (depFail.status !== 403) throw new Error(`Expected 403 Forbidden for suspended deposit, got ${depFail.status}`);
    console.log('   ✅ Suspended user deposit strictly blocked with 403');

    // 7. Unsuspend User
    console.log(`\n[TEST 7] Re-activating user (${testUserId}) in PostgreSQL...`);
    const unsuspRes = await request('PUT', `/api/admin/users/${testUserId}/suspend`, {
      is_suspended: false,
    });
    console.log('   ↳ Status:', unsuspRes.status, 'Message:', unsuspRes.body.message);

    const loginSuccess = await request('POST', '/api/auth/login', {
      email: testEmail2,
      password: 'Password123!',
    });
    console.log('   ↳ Status:', loginSuccess.status, 'Login success:', loginSuccess.body.success);
    if (loginSuccess.status !== 200) throw new Error('Unsuspended user failed to log in');
    console.log('   ✅ Restored user can log in normally');

    // 8. Test Wallet Freezing
    console.log(`\n[TEST 8] Freezing user wallet (${testUserId}) in PostgreSQL...`);
    const freezeRes = await request('PUT', `/api/admin/users/${testUserId}/freeze`, {
      is_frozen: true,
    });
    console.log('   ↳ Status:', freezeRes.status, 'Message:', freezeRes.body.message);
    if (freezeRes.status !== 200 || !freezeRes.body.data.is_frozen) throw new Error('Failed to freeze wallet');

    console.log('   ↳ Attempting deposit with frozen wallet...');
    const freezeDepFail = await request('POST', '/api/wallet/deposit/mpesa-charge', {
      amount: 500,
      phone: '0712345678',
    }, testUserToken);
    console.log('   ↳ Status:', freezeDepFail.status, 'Message:', freezeDepFail.body.message);
    if (freezeDepFail.status !== 403) throw new Error(`Expected 403 Forbidden for frozen wallet, got ${freezeDepFail.status}`);
    console.log('   ✅ Frozen wallet deposit blocked with 403');

    // 9. Unfreeze Wallet
    console.log(`\n[TEST 9] Unfreezing wallet (${testUserId})...`);
    const unfreezeRes = await request('PUT', `/api/admin/users/${testUserId}/freeze`, {
      is_frozen: false,
    });
    console.log('   ↳ Status:', unfreezeRes.status, 'Message:', unfreezeRes.body.message);
    if (unfreezeRes.status !== 200 || unfreezeRes.body.data.is_frozen) throw new Error('Failed to unfreeze wallet');
    console.log('   ✅ Wallet unfrozen and restored');

    // 10. Check Admin Users directory lists both flags
    console.log('\n[TEST 10] Checking Admin Users list returns is_suspended and is_frozen from PostgreSQL...');
    const usersList = await request('GET', '/api/admin/users');
    const foundUser = usersList.body.data.find(u => u.id === testUserId);
    console.log('   ↳ User record:', {
      id: foundUser?.id,
      email: foundUser?.email,
      is_suspended: foundUser?.is_suspended,
      is_frozen: foundUser?.is_frozen,
    });
    if (foundUser?.is_suspended !== false || foundUser?.is_frozen !== false) {
      throw new Error('User flags missing or incorrect in admin users list');
    }
    console.log('   ✅ Both is_suspended and is_frozen are present and accurate');

    console.log('\n====================================================');
    console.log('🎉 ALL 10 TESTS PASSED WITH 100% SUCCESS!');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
  }
}

runTests();
