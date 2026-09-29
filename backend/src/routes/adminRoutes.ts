import { Router } from 'express';
import { adminController } from '../controllers/adminController';

const router = Router();

// 1. Overview & Statistics
router.get('/overview', adminController.getOverview);

// 2. Users & KYC Management
router.get('/users', adminController.getUsers);
router.put('/users/:id/verify', adminController.verifyUser);
router.put('/users/:id/suspend', adminController.suspendUser);
router.put('/users/:id/freeze', adminController.freezeUser);

// 3. Loans Management & Approvals
router.get('/loans', adminController.getLoans);
router.post('/loans/:id/approve', adminController.approveLoan);
router.post('/loans/:id/reject', adminController.rejectLoan);
router.post('/loans/seed-demo', adminController.seedDemoLoan);

// 4. Global Activity & Audit Ledger
router.get('/activities', adminController.getActivities);

// 5. System Settings (Welcome Bonus, Referral Bonus, Limits)
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// 6. Live Support Desk
router.get('/support', adminController.getSupportTickets);
router.get('/support/:id', adminController.getSupportTicketById);
router.post('/support/:id/reply', adminController.replySupportTicket);
router.put('/support/:id/status', adminController.updateSupportTicketStatus);
router.post('/support/seed-demo', adminController.seedDemoSupportTicket);

export default router;
