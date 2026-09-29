import { Router } from 'express';
import { investmentController } from '../controllers/investmentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/plans', investmentController.getPlans);
router.get('/plans/:id', investmentController.getPlanDetails);
router.post('/invest', investmentController.investInPlan);
router.get('/my-investments', investmentController.getUserInvestments);
router.post('/liquidate/:id', investmentController.liquidateInvestment);

export default router;
