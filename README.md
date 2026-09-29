# 💎 Resi Fintech App

A full-stack modern Fintech application designed for mobile devices (**React Native + TypeScript via Expo Go**) and powered by a robust, secure backend (**Node.js + Express + TypeScript + PostgreSQL**) with complete **Paystack** payment processing, high-yield **Investments**, and instant **Loans**.

---

## 📱 Features at a Glance

### 1. 🔐 Authentication & Security
- **Signup & Login**: Secure password hashing with `bcryptjs` and stateless JWT session management.
- **Transaction PIN Protection**: 4-digit security PIN required for high-risk operations (Withdrawals, Investments, Loan Disbursements, Loan Repayments).
- **KYC Status**: Tier 2 verified user status and dedicated virtual NUBAN account.
- **1-Tap Demo Login**: Pre-seeded account for zero-friction testing in Expo Go (`demo@resi.com` / `Password123!`).

### 2. 💳 Wallet & Paystack Integration
- **Real-Time Balances**: Available Balance, Ledger Balance, and Net Worth calculation with privacy eye toggle.
- **Dedicated Virtual Account**: Generates 10-digit NUBAN virtual bank account number (Resi Microfinance Bank) with 1-tap clipboard copying.
- **Paystack Deposit Charge**:
  - Direct integration with `https://api.paystack.co/transaction/initialize`.
  - In-app interactive Paystack checkout interface supporting Card (`**** 4081`), Bank Transfer, and USSD.
  - Automatic transaction verification (`verifyDeposit`) and instant wallet balance crediting.
  - HMAC-SHA512 verified webhook handler (`/api/webhook/paystack`).
- **Paystack Withdrawals (Transfers)**:
  - Supports live bank list fetching from Paystack.
  - Automatic bank account name lookup and verification.
  - PIN authorization before money movement.
  - Debits wallet and initiates Paystack Transfer (`/transfer`).

### 3. 📈 High-Yield Investments
- **Curated Asset Vaults**:
  - Federal Treasury Yield Note (13.5% APY • 90 Days)
  - Commercial Real Estate REIT (16.5% APY • 365 Days)
  - AgriTech Growth Fund (18.0% APY • 180 Days)
  - Pan-African Tech Alpha (24.0% APY • 180 Days)
- **Interactive ROI Calculator**: Real-time projected gain and maturity payout calculation.
- **Portfolio Tracker**: Real-time yield accrual counter, maturity progress bar, and 1-tap liquidation / claim payout directly into wallet.

### 4. ⚡ Instant Revolving Credit & Loans
- **Credit Eligibility Gauge**: Pre-approved credit limit up to KES 500,000 with credit score evaluation.
- **Interactive Loan Calculator**: Choose tenure (1, 3, 6, 12 months), select loan amount, see exact monthly installments and flat 3.5% monthly interest.
- **Instant Disbursement**: Approved loans are credited directly into the user's wallet in real-time.
- **Repayment Schedules**: Amortized payment schedules with tracking for paid and pending installments.
- **In-App Repayments**: Settle monthly installments or clear entire loans with 1 tap from wallet balance.

### 5. 📜 Full Transaction Ledger
- Searchable transaction history with filtering by Deposits, Withdrawals, Investments, and Loans.
- Digital receipts with reference codes, channel, status badges, timestamps, and fees.

---

## 🛠️ Tech Stack

- **Mobile**: React Native, TypeScript, Expo SDK 57 (100% Expo Go compatible), `@expo/vector-icons`, `expo-linear-gradient`, `expo-clipboard`, `@react-native-async-storage/async-storage`.
- **Backend**: Node.js, Express, TypeScript, `pg` (PostgreSQL Client Pool), `bcryptjs`, `jsonwebtoken`, `axios`, `uuid`.
- **Database**: PostgreSQL (with automated schema migrations in `schema.sql`) + built-in fallback resilience engine for zero-friction local testing.
- **Payment Gateway**: Paystack API (Charges, Verification, Transfers, Webhooks).

---

## 🚀 Quick Start Guide

### Step 1: Start the Backend Server
In your terminal, navigate to the `backend` folder:
```bash
cd backend
npm install
npm run seed     # Seeds demo account, investment plans & sample data
npm run dev      # Starts Express API at http://localhost:5000
```

> **Database Configuration**:
> Edit `backend/.env` to configure your PostgreSQL database:
> ```env
> DATABASE_URL=postgresql://postgres:password@localhost:5432/resi_fintech
> ```
> *Note: If PostgreSQL is not currently running locally, Resi's built-in fallback engine will automatically activate so you can test all features immediately without any database setup!*

### Step 2: Start the Mobile App for Expo Go
In a separate terminal, navigate to the `mobile` folder:
```bash
cd mobile
npx expo start
```

### Step 3: Test on Your Phone with Expo Go
1. Install **Expo Go** from Google Play Store or Apple App Store.
2. Ensure your phone is connected to the same Wi-Fi network as your computer.
3. Scan the QR code shown in your terminal with your phone camera (iOS) or the Expo Go app (Android).
4. The mobile app automatically points to your PC's Wi-Fi IP (`http://192.168.0.102:5000/api`).
5. Tap **"1-Tap Fill Demo Credentials"** on the Login screen and enjoy testing!

---

## 🔑 Demo Account Credentials

| Field | Demo Value |
|-------|------------|
| **Email** | `demo@resi.com` |
| **Password** | `Password123!` |
| **Transaction PIN** | `1234` |
| **Initial Wallet Balance** | `KSh 150,000.00 (KES)` |
| **Virtual Account** | `0712982345 (Resi M-Bank Kenya)` |

---

## 📂 Project Structure

```
c:\Users\oyooo\Resi\
├── backend/
│   ├── src/
│   │   ├── config/          # Environment configuration
│   │   ├── controllers/     # Auth, Wallet, Investments, Loans
│   │   ├── database/        # pg Pool, schema.sql, repository, seed.ts
│   │   ├── middleware/      # JWT Authentication middleware
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Paystack API integration
│   │   └── types/           # Shared TypeScript models
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── mobile/
│   ├── src/
│   │   ├── api/             # API client & endpoint services
│   │   ├── components/      # WalletCard, PaystackModal, PinKeypad, etc.
│   │   ├── constants/       # Luxury dark fintech color palette
│   │   ├── context/         # AuthContext & state management
│   │   └── screens/
│   │       ├── Auth/        # LoginScreen, SignupScreen
│   │       └── Main/        # HomeScreen, InvestmentsScreen, LoansScreen, etc.
│   ├── App.tsx              # Root Expo component & tab navigation
│   ├── app.json             # Expo Go project configuration
│   └── package.json
│
└── README.md
```
