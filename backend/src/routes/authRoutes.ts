import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', authenticate, authController.getProfile);
router.put('/verification', authenticate, authController.completeVerification);
router.put('/security-settings', authenticate, authController.updateSecuritySettings);
router.post('/authenticator/setup', authenticate, authController.setupAuthenticator);
router.post('/authenticator/confirm', authenticate, authController.confirmAuthenticator);
router.put('/password', authenticate, authController.updatePassword);
router.put('/pin', authenticate, authController.updatePin);
router.post('/verify-pin', authenticate, authController.verifyPin);

export default router;
