import { Router } from 'express';
import { walletController } from '../controllers/walletController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', walletController.getWallet);
router.post('/deposit/mpesa-charge', walletController.chargeMpesaDeposit);
router.post('/deposit/initialize', walletController.initializeDeposit);
router.post('/deposit/verify', walletController.verifyDeposit);
router.post('/withdraw', walletController.requestWithdrawal);
router.get('/banks', walletController.getBanks);
router.get('/resolve-account', walletController.resolveAccount);
router.get('/transactions', walletController.getTransactions);

export default router;
