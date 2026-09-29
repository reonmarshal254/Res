import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initDatabase, isDbPostgres } from './database/db';
import authRoutes from './routes/authRoutes';
import walletRoutes from './routes/walletRoutes';
import investmentRoutes from './routes/investmentRoutes';
import loanRoutes from './routes/loanRoutes';
import webhookRoutes from './routes/webhookRoutes';
import adminRoutes from './routes/adminRoutes';
import supportRoutes from './routes/supportRoutes';
import { requestLogger } from './middleware/logger';
import path from 'path';

const app = express();

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Admin Web Terminal Static Assets
const adminPublicPath = path.resolve(__dirname, '../public/admin');
app.use('/admin', express.static(adminPublicPath));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(adminPublicPath, 'index.html'));
});

// Health Check & System Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Resi Fintech Backend API',
    version: '1.0.0',
    database_mode: isDbPostgres() ? 'PostgreSQL (Connected)' : 'Resi Local Engine (Active)',
    timestamp: new Date().toISOString(),
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);

// Fallback 404 handler
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/admin')) {
    return res.sendFile(path.join(adminPublicPath, 'index.html'));
  }
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Start Server
async function startServer() {
  await initDatabase();

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Resi Fintech Server running on port ${config.port}`);
    console.log(`🌐 Base URL: http://localhost:${config.port}`);
    console.log(`📱 Expo Go Network IP: http://<YOUR_LAN_IP>:${config.port}`);
    console.log(`💳 Paystack Gateway Mode: ${config.paystack.secretKey.startsWith('sk_test_demo') ? 'Sandbox/Test Simulator' : 'Live Paystack API'}`);
    console.log(`🗄️ Database: ${isDbPostgres() ? 'PostgreSQL' : 'Resi Local Engine (Set DATABASE_URL in .env to switch)'}`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
});
