import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { dbRepo } from '../database/repository';
import multer from 'multer';
import path from 'path';

const upload = multer({ dest: path.resolve(__dirname, '../../public/uploads/support'), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

// Get authenticated user's support tickets
router.get('/my-tickets', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const allTickets = await dbRepo.getSupportTickets();
    const tickets = allTickets.filter((t: any) => t.user_id === userId);
    return res.json({ success: true, data: tickets });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new support ticket from mobile app
router.post('/tickets', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { subject, message, priority = 'NORMAL' } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }

    const ticket = await dbRepo.createSupportTicket({
      user_id: user.id,
      user_name: user.full_name || 'Resi Member',
      user_email: user.email,
      subject,
      message,
      priority,
    });

    return res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully. Our team will reply shortly.',
      data: ticket,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// User replies to an ongoing support ticket
router.post('/tickets/:id/reply', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Reply message cannot be empty' });
    }

    const ticket = await dbRepo.getSupportTicketById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticket.user_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to this ticket' });
    }

    const updated = await dbRepo.addSupportReply(id, 'USER', user.full_name || 'Member', message.trim());
    return res.json({ success: true, message: 'Reply sent', data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/tickets/:id/attachment', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user; const ticket = await dbRepo.getSupportTicketById(req.params.id);
    if (!ticket || ticket.user_id !== user.id) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a file to upload' });
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const text = `📎 Attachment: ${safeName} (${Math.ceil(req.file.size / 1024)} KB) — /uploads/support/${req.file.filename}`;
    const updated = await dbRepo.addSupportReply(req.params.id, 'USER', user.full_name || 'Member', text);
    return res.json({ success: true, data: updated });
  } catch (error: any) { return res.status(500).json({ success: false, message: error.message }); }
});

export default router;
