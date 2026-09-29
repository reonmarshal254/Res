import { Router } from 'express';
import { loanController } from '../controllers/loanController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/eligibility', loanController.getEligibility);
router.post('/apply', loanController.applyForLoan);
router.get('/my-loans', loanController.getUserLoans);
router.post('/repay', loanController.repayLoan);

export default router;
