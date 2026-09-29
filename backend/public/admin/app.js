/**
 * RESI FINTECH — ADMIN WEB TERMINAL
 * Client Application Logic
 */

const API_BASE = '/api/admin';

// App Global State
const state = {
  currentTab: 'overview',
  overview: null,
  users: [],
  userFilter: 'ALL',
  userSearch: '',
  loans: [],
  loanFilter: 'ALL',
  activities: [],
  ledgerFilterType: 'ALL',
  ledgerSearch: '',
  activitiesSubTab: 'ledger',
  auditLogs: [],
  auditSeverityFilter: 'ALL',
  auditTypeFilter: 'ALL',
  treasuryAuditData: null,
  activeAuditLogId: null,
  tickets: [],
  ticketFilter: 'ALL',
  activeTicketId: null,
  activeTicketData: null,
  settings: null,
  pendingRejectLoanId: null,
};

// =========================================================
// INITIALIZATION
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initNavigation();
  initEventListeners();
  loadAllData();

  // Auto-refresh overview every 30 seconds
  setInterval(() => {
    if (state.currentTab === 'overview') {
      loadOverview(true);
    }
  }, 30000);
});

function initLiveClock() {
  const clockEl = document.getElementById('system-live-clock');
  function updateTime() {
    const now = new Date();
    clockEl.textContent = now.toTimeString().split(' ')[0] + ' UTC' + (now.getTimezoneOffset() > 0 ? '-' : '+') + Math.abs(now.getTimezoneOffset() / 60);
  }
  updateTime();
  setInterval(updateTime, 1000);
}

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;

  // Update Nav buttons
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update Panes
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });

  // Update Titles
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');

  switch (tabId) {
    case 'overview':
      titleEl.textContent = 'Platform Overview';
      subEl.textContent = 'Real-time fintech metrics, liquidity, and operational controls';
      loadOverview();
      break;
    case 'users':
      titleEl.textContent = 'Customer Accounts & KYC';
      subEl.textContent = 'Enforce KYC verification, upgrade member tiers, and suspend user wallets';
      loadUsers();
      break;
    case 'loans':
      titleEl.textContent = 'Credit & Loan Desk';
      subEl.textContent = 'Approve pending loan applications with instant wallet disbursement';
      loadLoans();
      break;
    case 'activities':
      titleEl.textContent = 'Global Audit Ledger';
      subEl.textContent = 'Live immutable stream of all financial activities across the platform';
      loadActivities();
      break;
    case 'support':
      titleEl.textContent = 'Live In-App Support Desk';
      subEl.textContent = 'Communicate directly with users, solve issues, and manage support tickets';
      loadSupportTickets();
      break;
    case 'settings':
      titleEl.textContent = 'Bonus & Platform Settings';
      subEl.textContent = 'Dynamically configure welcome test credit and referral bounties (KES)';
      loadSettings();
      break;
  }
}

function initEventListeners() {
  // Global Refresh Button
  document.getElementById('btn-refresh').addEventListener('click', () => {
    showToast('Refreshing live data...', 'info');
    loadAllData();
  });

  // User search input
  const userSearch = document.getElementById('user-search-input');
  if (userSearch) {
    userSearch.addEventListener('input', (e) => {
      state.userSearch = e.target.value.toLowerCase();
      renderUsersTable();
    });
  }

  // User filter chips
  document.querySelectorAll('[data-user-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-user-filter]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.userFilter = chip.getAttribute('data-user-filter');
      renderUsersTable();
    });
  });

  // Loan filter chips
  document.querySelectorAll('[data-loan-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-loan-filter]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.loanFilter = chip.getAttribute('data-loan-filter');
      renderLoansView();
    });
  });

  // Ledger Search & Type Filter
  const ledgerSearch = document.getElementById('ledger-search-input');
  if (ledgerSearch) {
    ledgerSearch.addEventListener('input', (e) => {
      state.ledgerSearch = e.target.value.toLowerCase();
      renderActivitiesTable();
    });
  }

  const ledgerSelect = document.getElementById('ledger-type-filter');
  if (ledgerSelect) {
    ledgerSelect.addEventListener('change', (e) => {
      state.ledgerFilterType = e.target.value;
      renderActivitiesTable();
    });
  }

  // Support Ticket Filters
  document.querySelectorAll('[data-ticket-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-ticket-filter]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.ticketFilter = chip.getAttribute('data-ticket-filter');
      renderTicketList();
    });
  });

  // Support chat composer Enter key
  const chatInput = document.getElementById('chat-reply-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendSupportReply();
      }
    });
  }

  // Audit Severity Filter Chips
  document.querySelectorAll('[data-audit-sev]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-audit-sev]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.auditSeverityFilter = chip.getAttribute('data-audit-sev');
      renderAuditLogsTable();
    });
  });

  // Audit Type Filter Select
  const auditTypeSelect = document.getElementById('audit-type-filter');
  if (auditTypeSelect) {
    auditTypeSelect.addEventListener('change', (e) => {
      state.auditTypeFilter = e.target.value;
      renderAuditLogsTable();
    });
  }
}

async function loadAllData() {
  await Promise.all([
    loadOverview(true),
    loadUsers(true),
    loadLoans(true),
    loadActivities(true),
    loadAuditLogs(true),
    loadSupportTickets(true),
    loadSettings(true),
  ]);
}

// =========================================================
// 1. OVERVIEW & KPI METRICS
// =========================================================

async function loadOverview(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/overview`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.overview = json.data;
    renderOverview();
  } catch (err) {
    console.error('Failed to load overview:', err);
    if (!silent) showToast(err.message || 'Error loading overview', 'error');
  }
}

function renderOverview() {
  const data = state.overview;
  if (!data) return;

  const { metrics, recent_transactions, pending_loans } = data;

  // KPI Numbers
  // 1. Company Master Wallet Pool (Paystack Live)
  const poolEl = document.getElementById('kpi-company-pool');
  if (poolEl) poolEl.textContent = formatKES(metrics.company_pool_balance);

  const healthBadge = document.getElementById('kpi-treasury-health-badge');
  if (healthBadge) {
    if (metrics.treasury_health === 'HEALTHY') {
      healthBadge.className = 'tag-pill mint';
      healthBadge.textContent = 'HEALTHY RESERVE';
    } else if (metrics.treasury_health === 'DEFICIT_ANOMALY') {
      healthBadge.className = 'tag-pill alert-danger';
      healthBadge.textContent = `DEFICIT ANOMALY (SHORTFALL: ${formatKES(Math.abs(metrics.treasury_discrepancy))})`;
    } else {
      healthBadge.className = 'tag-pill blue';
      healthBadge.textContent = `SURPLUS RESERVE (+${formatKES(metrics.treasury_discrepancy)})`;
    }
  }

  const poolSub = document.getElementById('kpi-company-pool-sub');
  if (poolSub) {
    poolSub.textContent = `Live Paystack KES Reserve • USD: $${Number(metrics.company_pool_usd || 0).toLocaleString()}`;
  }

  // 2. Member Liabilities & Other Metrics
  document.getElementById('kpi-total-liquidity').textContent = formatKES(metrics.total_liquidity);
  document.getElementById('kpi-total-users').textContent = metrics.total_users;
  document.getElementById('kpi-verified-users').textContent = `${metrics.verified_users} Verified`;
  document.getElementById('kpi-unverified-users').textContent = `${metrics.unverified_users} Pending KYC`;
  document.getElementById('kpi-pending-loans').textContent = metrics.pending_loans_count;
  document.getElementById('kpi-pending-amount').textContent = `${formatKES(metrics.pending_loans_amount)} pending`;
  document.getElementById('kpi-disbursed-volume').textContent = formatKES(metrics.total_disbursed_volume);
  document.getElementById('kpi-active-loans').textContent = `${metrics.active_loans_count} Active Loans`;

  // Sidebar counters
  document.getElementById('badge-users-count').textContent = metrics.total_users;
  document.getElementById('badge-pending-loans').textContent = metrics.pending_loans_count;
  document.getElementById('badge-open-tickets').textContent = metrics.open_tickets_count;
  document.getElementById('overview-pending-pill').textContent = metrics.pending_loans_count;
  document.getElementById('overview-tickets-pill').textContent = metrics.open_tickets_count;

  // Anomalies alerts indicators
  const anomalyBadge = document.getElementById('badge-anomalies-count');
  const anomalyPill = document.getElementById('overview-anomalies-pill');
  if (metrics.anomalies_count > 0) {
    if (anomalyBadge) {
      anomalyBadge.textContent = metrics.anomalies_count;
      anomalyBadge.classList.remove('hidden');
    }
    if (anomalyPill) {
      anomalyPill.textContent = `${metrics.anomalies_count} Anomalies`;
      anomalyPill.classList.remove('hidden');
    }
  } else {
    if (anomalyBadge) anomalyBadge.classList.add('hidden');
    if (anomalyPill) anomalyPill.classList.add('hidden');
  }

  // Sync Treasury Audit Banner Card
  updateTreasuryAuditCard({
    gateway_balance: metrics.company_pool_balance,
    company_pool_usd: metrics.company_pool_usd,
    total_user_liabilities: metrics.total_liquidity,
    delta_vs_liabilities: metrics.treasury_discrepancy,
    health_status: metrics.treasury_health,
  });

  // Overview Recent Activities Table
  const tbody = document.getElementById('overview-activities-body');
  if (recent_transactions && recent_transactions.length > 0) {
    tbody.innerHTML = recent_transactions.map((tx) => `
      <tr>
        <td class="font-mono" style="font-size:11.5px; color:var(--text-muted);">${formatDate(tx.created_at)}</td>
        <td>
          <div style="font-weight:600;">${escapeHtml(tx.user_name || 'Member')}</div>
        </td>
        <td><span class="badge-status ${getTypeBadgeClass(tx.type)}">${tx.type}</span></td>
        <td class="font-mono ${isCredit(tx.type) ? 'text-mint' : ''}">
          ${isCredit(tx.type) ? '+' : '-'}${formatKES(tx.amount)}
        </td>
        <td style="font-size:12px; color:var(--text-muted);">${tx.channel || 'WALLET'}</td>
        <td><span class="badge-status ${tx.status === 'SUCCESS' ? 'success' : 'pending'}">${tx.status}</span></td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No transaction activities recorded yet.</td></tr>`;
  }

  // Overview Pending Loans List
  const loansBox = document.getElementById('overview-loans-list');
  if (pending_loans && pending_loans.length > 0) {
    loansBox.innerHTML = pending_loans.map((l) => `
      <div class="pending-loan-card" style="margin-bottom:12px;">
        <div class="plc-header">
          <div class="plc-borrower">
            <h4>${escapeHtml(l.user_name || 'Applicant')}</h4>
            <span class="sub">${escapeHtml(l.user_phone || '')}</span>
          </div>
          <span class="badge-status pending">PENDING REVIEW</span>
        </div>
        <div class="plc-amount-box">
          <div class="plc-amount-label">REQUESTED AMOUNT</div>
          <div class="plc-amount-val">${formatKES(l.amount)}</div>
        </div>
        <div class="plc-purpose">“${escapeHtml(l.purpose || 'Personal Need')}”</div>
        <div class="plc-actions">
          <button class="btn btn-secondary btn-sm" onclick="openRejectModal('${l.id}')">Decline</button>
          <button class="btn btn-primary btn-sm" onclick="approveLoan('${l.id}')">Approve & Disburse</button>
        </div>
      </div>
    `).join('');
  } else {
    loansBox.innerHTML = `<div class="empty-state">All loan applications are up-to-date! No pending items.</div>`;
  }
}

// =========================================================
// 2. USERS & KYC MANAGEMENT
// =========================================================

async function loadUsers(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/users`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.users = json.data;
    renderUsersTable();
  } catch (err) {
    console.error('Failed to load users:', err);
    if (!silent) showToast(err.message || 'Error loading users', 'error');
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  const countEl = document.getElementById('users-count-display');

  let list = [...state.users];

  // Apply user filter
  if (state.userFilter === 'VERIFIED') {
    list = list.filter((u) => u.is_verified);
  } else if (state.userFilter === 'UNVERIFIED') {
    list = list.filter((u) => !u.is_verified);
  } else if (state.userFilter === 'SUSPENDED') {
    list = list.filter((u) => u.is_suspended);
  } else if (state.userFilter === 'FROZEN') {
    list = list.filter((u) => u.is_frozen);
  }

  // Apply search
  if (state.userSearch) {
    const q = state.userSearch;
    list = list.filter(
      (u) =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        (u.account_number || '').toLowerCase().includes(q)
    );
  }

  countEl.textContent = list.length;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No users matching search criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((u) => `
    <tr>
      <td>
        <div style="font-weight:600; font-size:13.5px;">${escapeHtml(u.full_name || 'Member')}</div>
        <div style="font-size:11.5px; color:var(--text-muted); font-family:var(--font-mono);">${u.id}</div>
      </td>
      <td>
        <div style="color:var(--text-main);">${escapeHtml(u.email)}</div>
        <div style="font-size:11.5px; color:var(--text-secondary);">${escapeHtml(u.phone || 'N/A')}</div>
      </td>
      <td>
        <div class="font-mono" style="font-weight:600; color:var(--blue);">${escapeHtml(u.account_number || 'N/A')}</div>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(u.bank_name || 'Resi M-Bank')}</div>
      </td>
      <td>
        <div class="font-mono" style="font-weight:700; color:#ffffff;">${formatKES(u.balance)}</div>
        <div style="font-size:11px; color:var(--text-muted);">Ledger: ${formatKES(u.ledger_balance)}</div>
      </td>
      <td>
        <div class="switch-wrapper">
          <label class="switch">
            <input type="checkbox" ${u.is_verified ? 'checked' : ''} onchange="toggleUserVerification('${u.id}', this.checked)">
            <span class="slider"></span>
          </label>
          <span style="font-size:11.5px; font-weight:600; color:${u.is_verified ? 'var(--mint)' : 'var(--amber)'};">
            ${u.is_verified ? 'Verified' : 'Unverified'}
          </span>
        </div>
      </td>
      <td>
        <select class="custom-select" style="padding:4px 8px; font-size:11.5px;" onchange="changeUserTier('${u.id}', this.value)">
          <option value="1" ${u.tier === 1 ? 'selected' : ''}>Tier 1</option>
          <option value="2" ${u.tier === 2 ? 'selected' : ''}>Tier 2 (Pro)</option>
          <option value="3" ${u.tier === 3 ? 'selected' : ''}>Tier 3 (VIP)</option>
        </select>
      </td>
      <td>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <span class="badge-status ${u.is_suspended ? 'frozen' : 'active'}" style="font-size:10px;">
            ${u.is_suspended ? 'SUSPENDED' : 'ACTIVE'}
          </span>
          <span class="badge-status ${u.is_frozen ? 'frozen' : 'active'}" style="font-size:10px;">
            ${u.is_frozen ? 'WALLET FROZEN' : 'WALLET OK'}
          </span>
        </div>
      </td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm ${u.is_suspended ? 'btn-outline' : 'btn-danger'}" onclick="toggleUserSuspend('${u.id}', ${!u.is_suspended})" title="Suspend or restore user login">
            ${u.is_suspended ? 'Unsuspend' : 'Suspend'}
          </button>
          <button class="btn btn-sm ${u.is_frozen ? 'btn-secondary' : 'btn-outline'}" onclick="toggleUserFreeze('${u.id}', ${!u.is_frozen})" title="Freeze or restore wallet funds movement">
            ${u.is_frozen ? 'Unfreeze' : 'Freeze'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function toggleUserVerification(userId, isVerified) {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/verify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_verified: isVerified }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`User KYC ${isVerified ? 'verified' : 'unverified'} successfully`, 'success');
    loadUsers();
    loadOverview(true);
  } catch (err) {
    showToast(err.message, 'error');
    loadUsers();
  }
}

async function changeUserTier(userId, newTier) {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/verify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_verified: true, tier: parseInt(newTier, 10) }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`User tier elevated to Tier ${newTier}`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserSuspend(userId, shouldSuspend) {
  const actionText = shouldSuspend ? 'suspend' : 're-activate';
  if (!confirm(`Are you sure you want to ${actionText} this user account? Suspended users are locked out from logging in.`)) return;

  try {
    const res = await fetch(`${API_BASE}/users/${userId}/suspend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_suspended: shouldSuspend }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`User account ${shouldSuspend ? 'suspended' : 're-activated'} successfully (Persisted in DB)`, 'success');
    loadUsers();
    loadOverview(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserFreeze(userId, shouldFreeze) {
  const actionText = shouldFreeze ? 'freeze / lock' : 'unfreeze / restore';
  if (!confirm(`Are you sure you want to ${actionText} this user wallet? Frozen wallets cannot deposit or withdraw funds.`)) return;

  try {
    const res = await fetch(`${API_BASE}/users/${userId}/freeze`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_frozen: shouldFreeze }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`User wallet ${shouldFreeze ? 'frozen' : 'restored'} successfully (Persisted in DB)`, 'success');
    loadUsers();
    loadOverview(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================
// 3. LOAN APPROVAL DESK
// =========================================================

async function loadLoans(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/loans`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.loans = json.data;
    renderLoansView();
  } catch (err) {
    console.error('Failed to load loans:', err);
    if (!silent) showToast(err.message || 'Error loading loans', 'error');
  }
}

function renderLoansView() {
  const pendingGrid = document.getElementById('loans-pending-grid');
  const tableBody = document.getElementById('loans-table-body');
  const countEl = document.getElementById('loans-count-display');

  let list = [...state.loans];

  // Render Pending Cards Queue
  const pendingLoans = list.filter((l) => l.status === 'PENDING');
  if (pendingLoans.length > 0) {
    pendingGrid.innerHTML = pendingLoans.map((l) => `
      <div class="pending-loan-card">
        <div>
          <div class="plc-header">
            <div class="plc-borrower">
              <h4>${escapeHtml(l.user_name || 'Borrower')}</h4>
              <span class="sub">${escapeHtml(l.user_email || '')} • ${escapeHtml(l.user_phone || '')}</span>
            </div>
            <span class="badge-status pending">PENDING</span>
          </div>

          <div class="plc-amount-box">
            <div class="plc-amount-label">PRINCIPAL LOAN AMOUNT</div>
            <div class="plc-amount-val">${formatKES(l.amount)}</div>
          </div>

          <div class="plc-details-grid">
            <div class="plc-detail-item">
              <div class="lbl">Tenure:</div>
              <div class="val">${l.tenure_months} Months</div>
            </div>
            <div class="plc-detail-item">
              <div class="lbl">Interest Rate:</div>
              <div class="val">${l.interest_rate}% p.a.</div>
            </div>
            <div class="plc-detail-item">
              <div class="lbl">Monthly Installment:</div>
              <div class="val font-mono">${formatKES(l.monthly_installment)}</div>
            </div>
            <div class="plc-detail-item">
              <div class="lbl">Total Repayable:</div>
              <div class="val font-mono">${formatKES(l.total_payable)}</div>
            </div>
          </div>

          <div class="plc-purpose">
            <strong>Purpose:</strong> ${escapeHtml(l.purpose || 'General working capital')}
          </div>
        </div>

        <div class="plc-actions">
          <button class="btn btn-secondary" onclick="openRejectModal('${l.id}')">Decline</button>
          <button class="btn btn-primary" onclick="approveLoan('${l.id}')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Approve & Disburse</span>
          </button>
        </div>
      </div>
    `).join('');
  } else {
    pendingGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">🎉 No pending loan applications! All borrower requests are approved or handled.</div>`;
  }

  // Filter Table List
  if (state.loanFilter !== 'ALL') {
    list = list.filter((l) => l.status === state.loanFilter);
  }

  countEl.textContent = list.length;

  if (list.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="10" class="empty-state">No loan records in this view.</td></tr>`;
    return;
  }

  tableBody.innerHTML = list.map((l) => `
    <tr>
      <td>
        <div style="font-weight:600;">${escapeHtml(l.user_name || 'Member')}</div>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(l.user_email || '')}</div>
      </td>
      <td class="font-mono" style="font-weight:700; color:#ffffff;">${formatKES(l.amount)}</td>
      <td>${l.tenure_months} Mos</td>
      <td>${l.interest_rate}%</td>
      <td class="font-mono">${formatKES(l.total_payable)}</td>
      <td class="font-mono">${formatKES(l.monthly_installment)}</td>
      <td style="max-width:200px; font-size:12px;">${escapeHtml(l.purpose || 'Working capital')}</td>
      <td><span class="badge-status ${getLoanStatusClass(l.status)}">${l.status}</span></td>
      <td style="font-size:11.5px; color:var(--text-muted);">${formatDate(l.created_at)}</td>
      <td>
        ${l.status === 'PENDING' ? `
          <button class="btn btn-primary btn-sm" onclick="approveLoan('${l.id}')">Approve</button>
        ` : `
          <span style="font-size:11px; color:var(--text-muted); font-style:italic;">Finalized</span>
        `}
      </td>
    </tr>
  `).join('');
}

async function approveLoan(loanId) {
  try {
    const res = await fetch(`${API_BASE}/loans/${loanId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`✅ Loan approved! Funds immediately credited to borrower wallet.`, 'success');
    loadLoans();
    loadOverview(true);
    loadActivities(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openRejectModal(loanId) {
  state.pendingRejectLoanId = loanId;
  document.getElementById('modal-reject').classList.remove('hidden');
}

function closeRejectModal() {
  state.pendingRejectLoanId = null;
  document.getElementById('modal-reject').classList.add('hidden');
}

async function confirmRejectLoan() {
  if (!state.pendingRejectLoanId) return;
  const reason = document.getElementById('input-reject-reason').value.trim();

  try {
    const res = await fetch(`${API_BASE}/loans/${state.pendingRejectLoanId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast('Loan application declined', 'info');
    closeRejectModal();
    loadLoans();
    loadOverview(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function seedDemoLoan() {
  try {
    const res = await fetch(`${API_BASE}/loans/seed-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 45000,
        tenure_months: 3,
        purpose: 'Inventory Purchase for Nairobi Electronics Stall (M-PESA merchant)',
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast('Simulated pending loan application created!', 'success');
    loadLoans();
    loadOverview(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================
// 4. GLOBAL ACTIVITIES LEDGER
// =========================================================

async function loadActivities(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/activities?limit=200`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.activities = json.data;
    renderActivitiesTable();
  } catch (err) {
    console.error('Failed to load activities:', err);
    if (!silent) showToast(err.message || 'Error loading activities', 'error');
  }
}

function renderActivitiesTable() {
  const tbody = document.getElementById('ledger-table-body');
  const countEl = document.getElementById('ledger-count-display');

  let list = [...state.activities];

  // Filter Type
  if (state.ledgerFilterType !== 'ALL') {
    list = list.filter((tx) => tx.type === state.ledgerFilterType);
  }

  // Filter Search
  if (state.ledgerSearch) {
    const q = state.ledgerSearch;
    list = list.filter(
      (tx) =>
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.reference || '').toLowerCase().includes(q) ||
        (tx.user_name || '').toLowerCase().includes(q) ||
        (tx.user_email || '').toLowerCase().includes(q)
    );
  }

  countEl.textContent = list.length;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No transaction records matching filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((tx) => `
    <tr>
      <td class="font-mono" style="font-size:12px; color:var(--text-muted);">${formatDate(tx.created_at)}</td>
      <td class="font-mono" style="font-size:11.5px; color:var(--blue);">${escapeHtml(tx.reference || 'N/A')}</td>
      <td>
        <div style="font-weight:600;">${escapeHtml(tx.user_name || 'Member')}</div>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(tx.user_email || '')}</div>
      </td>
      <td><span class="badge-status ${getTypeBadgeClass(tx.type)}">${tx.type}</span></td>
      <td style="font-size:12.5px; max-width:260px;">${escapeHtml(tx.description || '')}</td>
      <td class="font-mono ${isCredit(tx.type) ? 'text-mint' : ''}" style="font-weight:700;">
        ${isCredit(tx.type) ? '+' : '-'}${formatKES(tx.amount)}
      </td>
      <td style="font-size:12px; color:var(--text-secondary);">${tx.channel || 'WALLET'}</td>
      <td><span class="badge-status ${tx.status === 'SUCCESS' ? 'success' : 'failed'}">${tx.status}</span></td>
    </tr>
  `).join('');
}

// 4b. ACTIVITIES SUB-TAB SWITCHER
function switchActivitiesSubTab(tabName) {
  state.activitiesSubTab = tabName;
  const isLedger = tabName === 'ledger';

  const btnLedger = document.getElementById('btn-subtab-ledger');
  const btnAudit = document.getElementById('btn-subtab-auditlogs');
  if (btnLedger) btnLedger.classList.toggle('active', isLedger);
  if (btnAudit) btnAudit.classList.toggle('active', !isLedger);

  const viewLedger = document.getElementById('view-activities-ledger');
  const viewAudit = document.getElementById('view-activities-auditlogs');
  if (viewLedger) viewLedger.classList.toggle('hidden', !isLedger);
  if (viewAudit) viewAudit.classList.toggle('hidden', isLedger);

  if (isLedger) {
    loadActivities(true);
  } else {
    loadAuditLogs();
  }
}

// 4c. TREASURY RECONCILIATION AUDIT ACTIONS
function updateTreasuryAuditCard(data) {
  if (!data) return;
  const gwEl = document.getElementById('audit-gateway-balance');
  const gwUsd = document.getElementById('audit-gateway-usd');
  const liabEl = document.getElementById('audit-member-liabilities');
  const flowEl = document.getElementById('audit-settled-flow');
  const deltaEl = document.getElementById('audit-reserve-delta');
  const healthPill = document.getElementById('audit-health-pill');

  if (gwEl && data.gateway_balance !== undefined) {
    gwEl.textContent = formatKES(data.gateway_balance);
  }
  if (gwUsd) {
    const usd = data.company_pool_usd !== undefined ? data.company_pool_usd : 0;
    gwUsd.textContent = `USD: $${Number(usd).toLocaleString()}`;
  }
  if (liabEl && data.total_user_liabilities !== undefined) {
    liabEl.textContent = formatKES(data.total_user_liabilities);
  }
  if (flowEl && data.net_recorded_gateway_flow !== undefined) {
    flowEl.textContent = formatKES(data.net_recorded_gateway_flow);
  }

  if (deltaEl && data.delta_vs_liabilities !== undefined) {
    const delta = data.delta_vs_liabilities;
    deltaEl.textContent = (delta >= 0 ? '+' : '') + formatKES(delta);
    deltaEl.className = `tac-val ${delta < 0 ? 'text-rose' : 'text-mint'}`;
  }

  if (healthPill) {
    if (data.health_status === 'HEALTHY' || data.health_status === 'SURPLUS') {
      healthPill.className = 'tac-badge status mint';
      healthPill.textContent = 'HEALTHY COVERAGE';
    } else {
      healthPill.className = 'tac-badge status alert';
      healthPill.textContent = 'DEFICIT ANOMALY DETECTED';
    }
  }
}

async function runTreasuryAudit(silent = false) {
  const btn = document.getElementById('btn-trigger-reconciliation');
  const quickBtn = document.getElementById('btn-quick-audit');
  if (btn) btn.classList.add('loading');
  if (quickBtn) quickBtn.classList.add('loading');

  try {
    if (!silent) showToast('Querying Paystack live balance & executing 3-way reconciliation audit...', 'info');

    const res = await fetch(`${API_BASE}/treasury/audit`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const auditData = json.data;
    state.treasuryAuditData = auditData;
    updateTreasuryAuditCard(auditData);

    // Refresh overview & audit logs in background
    loadOverview(true);
    loadAuditLogs(true);

    if (auditData.anomalies && auditData.anomalies.length > 0) {
      showToast(`⚠️ Anomaly Logged: ${auditData.anomalies[0]}`, 'warning');
    } else {
      showToast(`✅ Paystack live pool (KSh ${Number(auditData.gateway_balance).toLocaleString()}) fully verified!`, 'success');
    }
  } catch (err) {
    console.error('runTreasuryAudit error:', err);
    showToast(err.message || 'Failed to complete treasury audit', 'error');
  } finally {
    if (btn) btn.classList.remove('loading');
    if (quickBtn) quickBtn.classList.remove('loading');
  }
}

// 4d. SYSTEM AUDIT & ANOMALY LOGS
async function loadAuditLogs(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/audit-logs?limit=200`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.auditLogs = json.data;
    renderAuditLogsTable();

    // Update counter
    const countEl = document.getElementById('audit-logs-count-display');
    const anomalyCount = state.auditLogs.filter((l) => l.severity === 'CRITICAL' || l.severity === 'WARNING').length;
    if (countEl) countEl.textContent = anomalyCount > 0 ? `${anomalyCount} Alerts` : `${state.auditLogs.length}`;
  } catch (err) {
    console.error('Failed to load audit logs:', err);
    if (!silent) showToast(err.message || 'Error loading audit logs', 'error');
  }
}

function renderAuditLogsTable() {
  const tbody = document.getElementById('audit-logs-table-body');
  if (!tbody) return;

  let list = [...state.auditLogs];

  if (state.auditSeverityFilter !== 'ALL') {
    list = list.filter((l) => l.severity === state.auditSeverityFilter);
  }

  if (state.auditTypeFilter !== 'ALL') {
    list = list.filter((l) => l.event_type === state.auditTypeFilter);
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No audit records matching selected filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((log) => `
    <tr>
      <td class="font-mono" style="font-size:12px; color:var(--text-muted);">${formatDate(log.created_at)}</td>
      <td>
        <span class="badge-status ${getAuditSeverityBadgeClass(log.severity)}">
          ${log.severity === 'CRITICAL' ? '<span class="pulse-dot-rose"></span> ' : ''}${log.severity}
        </span>
      </td>
      <td><span class="font-mono" style="font-size:11.5px; color:var(--blue); font-weight:600;">${escapeHtml(log.event_type)}</span></td>
      <td style="font-weight:600; color:#ffffff;">${escapeHtml(log.title || 'System Audit Event')}</td>
      <td style="font-size:12px; max-width:320px; color:var(--text-secondary);">${escapeHtml(log.description || '')}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openAuditModal('${log.id}')">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <span>Inspect</span>
        </button>
      </td>
    </tr>
  `).join('');
}

function getAuditSeverityBadgeClass(severity) {
  switch (severity) {
    case 'CRITICAL': return 'failed pulse-border';
    case 'WARNING': return 'pending';
    case 'INFO': return 'active';
    default: return 'neutral';
  }
}

// 4e. AUDIT INSPECTION MODAL
function openAuditModal(logId) {
  const log = state.auditLogs.find((l) => l.id === logId);
  if (!log) return;

  state.activeAuditLogId = logId;
  const modal = document.getElementById('modal-audit-detail');
  if (!modal) return;

  document.getElementById('modal-audit-title').textContent = log.title || 'Audit Diagnostic Record';
  const sevEl = document.getElementById('modal-audit-severity');
  if (sevEl) {
    sevEl.className = `badge-status ${getAuditSeverityBadgeClass(log.severity)}`;
    sevEl.textContent = log.severity;
  }
  document.getElementById('modal-audit-description').textContent = log.description || '-';
  document.getElementById('modal-audit-time').textContent = formatDate(log.created_at);
  document.getElementById('modal-audit-event').textContent = log.event_type;
  document.getElementById('modal-audit-id').textContent = log.id;

  const jsonBox = document.getElementById('modal-audit-json');
  if (jsonBox) {
    jsonBox.textContent = JSON.stringify(log.metadata || {}, null, 2);
  }

  modal.classList.remove('hidden');
}

function closeAuditModal() {
  state.activeAuditLogId = null;
  document.getElementById('modal-audit-detail')?.classList.add('hidden');
}

// =========================================================
// 5. IN-APP LIVE SUPPORT DESK
// =========================================================

async function loadSupportTickets(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/support`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.tickets = json.data;
    renderTicketList();

    // If an active ticket is open, refresh its data
    if (state.activeTicketId) {
      selectTicket(state.activeTicketId, false);
    }
  } catch (err) {
    console.error('Failed to load support tickets:', err);
    if (!silent) showToast(err.message || 'Error loading support tickets', 'error');
  }
}

function renderTicketList() {
  const container = document.getElementById('support-ticket-list');
  const openCountEl = document.getElementById('support-open-count');

  let list = [...state.tickets];
  const openCount = list.filter((t) => t.status === 'OPEN').length;
  openCountEl.textContent = `${openCount} Open`;

  if (state.ticketFilter !== 'ALL') {
    list = list.filter((t) => t.status === state.ticketFilter);
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">No tickets in this folder.</div>`;
    return;
  }

  container.innerHTML = list.map((t) => {
    const lastMsg = t.messages && t.messages.length > 0 ? t.messages[t.messages.length - 1] : null;
    const isActive = t.id === state.activeTicketId;

    return `
      <div class="ticket-item ${isActive ? 'active' : ''}" onclick="selectTicket('${t.id}')">
        <div class="ticket-top">
          <span class="ticket-sender">${escapeHtml(t.user_name || 'Member')}</span>
          <span class="ticket-time">${formatShortTime(t.updated_at)}</span>
        </div>
        <div class="ticket-subject">${escapeHtml(t.subject)}</div>
        <div class="ticket-meta">
          <span class="badge-status ${t.status === 'OPEN' ? 'open' : 'resolved'}" style="font-size:10px; padding:1px 6px;">
            ${t.status}
          </span>
          <span style="font-size:11px; color:var(--text-muted);">${(t.messages || []).length} msgs</span>
        </div>
      </div>
    `;
  }).join('');
}

async function selectTicket(ticketId, showAnimation = true) {
  state.activeTicketId = ticketId;
  renderTicketList(); // update active highlight

  try {
    const res = await fetch(`${API_BASE}/support/${ticketId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.activeTicketData = json.data;
    renderChatView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderChatView() {
  const emptyView = document.getElementById('chatbox-empty-view');
  const activeView = document.getElementById('chatbox-active-view');
  const t = state.activeTicketData;

  if (!t) {
    emptyView.classList.remove('hidden');
    activeView.classList.add('hidden');
    return;
  }

  emptyView.classList.add('hidden');
  activeView.classList.remove('hidden');

  // Header info
  document.getElementById('chat-ticket-subject').textContent = t.subject;
  document.getElementById('chat-ticket-user').textContent = t.user_name || 'Member';
  document.getElementById('chat-ticket-email').textContent = t.user_email || '';
  
  const badge = document.getElementById('chat-ticket-badge');
  badge.textContent = t.status;
  badge.className = `badge-status ${t.status === 'OPEN' ? 'open' : 'resolved'}`;

  const statusBtn = document.getElementById('btn-toggle-ticket-status');
  statusBtn.textContent = t.status === 'OPEN' ? 'Mark as Resolved' : 'Reopen Ticket';

  // Message Bubbles
  const msgContainer = document.getElementById('chat-messages-container');
  const messages = t.messages || [];

  msgContainer.innerHTML = messages.map((m) => {
    const isAdmin = m.sender === 'ADMIN';
    return `
      <div class="chat-bubble ${isAdmin ? 'admin' : 'user'}">
        <span class="bubble-sender">${escapeHtml(m.sender_name || (isAdmin ? 'Resi Support Specialist' : 'User'))}</span>
        <div class="bubble-content">${escapeHtml(m.text)}</div>
        <span class="bubble-time">${formatShortTime(m.timestamp)}</span>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

async function sendSupportReply() {
  if (!state.activeTicketId) return;
  const input = document.getElementById('chat-reply-input');
  const message = input.value.trim();
  if (!message) return;

  try {
    input.value = '';
    const res = await fetch(`${API_BASE}/support/${state.activeTicketId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sender_name: 'Resi Senior Operations Desk' }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.activeTicketData = json.data;
    renderChatView();
    loadSupportTickets(true);
    showToast('Reply dispatched to user app', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleCurrentTicketStatus() {
  if (!state.activeTicketId || !state.activeTicketData) return;
  const newStatus = state.activeTicketData.status === 'OPEN' ? 'RESOLVED' : 'OPEN';

  try {
    const res = await fetch(`${API_BASE}/support/${state.activeTicketId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`Ticket status updated to ${newStatus}`, 'success');
    state.activeTicketData = json.data;
    renderChatView();
    loadSupportTickets(true);
    loadOverview(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function seedDemoSupportTicket() {
  try {
    const res = await fetch(`${API_BASE}/support/seed-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast('Simulated incoming member support ticket!', 'success');
    await loadSupportTickets();
    if (json.data && json.data.id) {
      selectTicket(json.data.id);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================
// 6. SYSTEM SETTINGS & BONUSES
// =========================================================

async function loadSettings(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/settings`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.settings = json.data;
    renderSettings();
  } catch (err) {
    console.error('Failed to load settings:', err);
    if (!silent) showToast(err.message || 'Error loading settings', 'error');
  }
}

function handleSignupBonusToggle(isEnabled) {
  const pill = document.getElementById('signup-bonus-status-pill');
  if (pill) {
    pill.textContent = isEnabled ? 'ENABLED' : 'DISABLED';
    pill.className = `badge-status ${isEnabled ? 'active' : 'frozen'}`;
  }
  const input = document.getElementById('input-welcome-bonus');
  if (input) {
    input.style.opacity = isEnabled ? '1' : '0.5';
  }
}

function renderSettings() {
  const s = state.settings;
  if (!s) return;

  const welcomeToggle = document.getElementById('toggle-signup-bonus');
  const isSignupEnabled = s.signup_bonus_enabled !== false;
  if (welcomeToggle) {
    welcomeToggle.checked = isSignupEnabled;
    handleSignupBonusToggle(isSignupEnabled);
  }

  const welcomeInput = document.getElementById('input-welcome-bonus');
  const refInput = document.getElementById('input-referral-bonus');
  const minDepInput = document.getElementById('input-min-deposit');
  const minWithInput = document.getElementById('input-min-withdrawal');

  if (welcomeInput) welcomeInput.value = s.welcome_bonus ?? 25000;
  if (refInput) refInput.value = s.referral_bonus ?? 500;
  if (minDepInput) minDepInput.value = s.min_deposit ?? 100;
  if (minWithInput) minWithInput.value = s.min_withdrawal ?? 100;
}

async function saveSettings() {
  const signup_bonus_enabled = document.getElementById('toggle-signup-bonus')?.checked ?? true;
  const welcome_bonus = parseFloat(document.getElementById('input-welcome-bonus').value);
  const referral_bonus = parseFloat(document.getElementById('input-referral-bonus').value);
  const min_deposit = parseFloat(document.getElementById('input-min-deposit').value);
  const min_withdrawal = parseFloat(document.getElementById('input-min-withdrawal').value);

  if (isNaN(welcome_bonus) || welcome_bonus < 0) {
    showToast('Invalid welcome bonus amount', 'error');
    return;
  }
  if (isNaN(referral_bonus) || referral_bonus < 0) {
    showToast('Invalid referral bonus amount', 'error');
    return;
  }
  if (isNaN(min_deposit) || min_deposit < 0) {
    showToast('Invalid minimum deposit amount', 'error');
    return;
  }
  if (isNaN(min_withdrawal) || min_withdrawal < 0) {
    showToast('Invalid minimum withdrawal amount', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-settings');
  btn.disabled = true;
  btn.innerHTML = `<span>Saving configuration to Database...</span>`;

  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signup_bonus_enabled,
        welcome_bonus,
        referral_bonus,
        min_deposit,
        min_withdrawal,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    state.settings = json.data;
    showToast('✨ Platform settings & bonuses successfully saved to PostgreSQL database!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
      <span>Save System Settings</span>
    `;
  }
}

// =========================================================
// UTILITIES & HELPERS
// =========================================================

function formatKES(val) {
  const num = Number(val) || 0;
  return 'KSh ' + num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatShortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isCredit(type) {
  return type === 'DEPOSIT' || type === 'LOAN_DISBURSEMENT' || type === 'INTEREST_CREDIT' || type === 'REFERRAL_REWARD';
}

function getTypeBadgeClass(type) {
  switch (type) {
    case 'DEPOSIT':
    case 'LOAN_DISBURSEMENT':
      return 'success';
    case 'WITHDRAWAL':
      return 'failed';
    case 'TRANSFER':
    case 'INVESTMENT':
      return 'resolved';
    default:
      return 'pending';
  }
}

function getLoanStatusClass(status) {
  switch (status) {
    case 'ACTIVE': return 'approved';
    case 'COMPLETED': return 'completed';
    case 'PENDING': return 'pending';
    case 'REJECTED': return 'rejected';
    default: return 'pending';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
