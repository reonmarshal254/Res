import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'super_secret_jwt_key_resi_fintech_2026_secure',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/resi_fintech',
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || 'sk_test_demo_fintech_secret_key',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_demo_fintech_public_key',
    currency: process.env.PAYSTACK_CURRENCY || 'KES',
    baseUrl: 'https://api.paystack.co',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8081',
};
