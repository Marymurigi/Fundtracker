'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
    settings: { businessName: 'Davma Surprises & Event Décor', businessType: 'Gift Shop & Event Planning', ownerName: 'Owner', currency: 'KES', phone: '+254111359933' },
    transactions: [],
    expenses: [],
    budgets: {},
    pin: null,
    lastBackup: null
};
let charts = { revenue: null, expense: null, pl: null, cat: null, cashflow: null, summaryExp: null };
let currentPage = 'dashboard', currentPeriod = 'week', currentReportTab = 'pl';
let pinBuffer = '', pinMode = 'verify'; // 'verify','set','confirm', newPinTemp

const USE_API = location.protocol === 'http:' || location.protocol === 'https:';

// ── Persistence ───────────────────────────────────────────────────────────────
function saveLocal() { try { localStorage.setItem('ft_state', JSON.stringify(state)); } catch (e) { } }
function loadLocal() { try { const r = localStorage.getItem('ft_state'); if (r) Object.assign(state, JSON.parse(r)); } catch (e) { } }

async function apiGet(u) { const r = await fetch(u); return r.json(); }
async function apiPost(u, b) { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.json(); }
async function apiPut(u, b) { const r = await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.json(); }
async function apiDel(u) { const r = await fetch(u, { method: 'DELETE' }); return r.json(); }

async function loadAllData() {
    if (USE_API) {
        try {
            const [s, t, e] = await Promise.all([apiGet('/api/settings'), apiGet('/api/transactions'), apiGet('/api/expenses')]);
            state.settings = s; state.transactions = t; state.expenses = e;
            return;
        } catch (err) { }
    }
    loadLocal();
}
async function persistTxn(data) {
    if (USE_API) { try { const r = await apiPost('/api/transactions', data); state.transactions.unshift(r.transaction); return; } catch (e) { } }
    state.transactions.unshift({ id: Date.now(), date: new Date().toISOString(), ...data });
    saveLocal();
}
async function persistExp(data) {
    if (USE_API) { try { const r = await apiPost('/api/expenses', data); state.expenses.unshift(r.expense); return; } catch (e) { } }
    state.expenses.unshift({ id: Date.now(), date: new Date().toISOString(), ...data });
    saveLocal();
}
async function removeTxn(id) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    if (USE_API) { try { await apiDel('/api/transactions/' + id); return; } catch (e) { } }
    saveLocal();
}
async function removeExp(id) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    if (USE_API) { try { await apiDel('/api/expenses/' + id); return; } catch (e) { } }
    saveLocal();
}
async function persistSettings(s) {
    state.settings = { ...state.settings, ...s };
    if (USE_API) { try { await apiPut('/api/settings', state.settings); return; } catch (e) { } }
    saveLocal();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllData();
    setHeaderDate();
    setTimeout(async () => {
        document.getElementById('splash').classList.add('hidden');
        if (state.pin) { showPinScreen('verify'); }
        else { showApp(); }
    }, 2000);
});

function showApp() {
    document.getElementById('pinScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    applySettings();
    bindEvents();
    refreshDashboard();
    checkBudgetAlerts();
}
function setHeaderDate() {
    const now = new Date();
    document.getElementById('headerDate').textContent = now.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function applySettings() {
    const s = state.settings;
    const el = id => document.getElementById(id);
    el('greetBusiness').textContent = s.businessName;
    el('headerBizName').textContent = s.businessName.split(' ')[0] + ' ' + (s.businessName.split(' ')[1] || '');
    if (el('settBusName')) el('settBusName').value = s.businessName;
    if (el('settBusType')) el('settBusType').value = s.businessType || '';
    if (el('settOwnerName')) el('settOwnerName').value = s.ownerName || '';
    if (el('settCurrency')) el('settCurrency').value = s.currency || 'KES';
    if (el('settPhone')) el('settPhone').value = s.phone || '';
    updatePinStatusUI();
}
function bindEvents() {
    document.getElementById('lockBtn').addEventListener('click', () => { if (state.pin) showPinScreen('verify'); else showToast('Set a PIN in More → Security', 'error'); });
    document.getElementById('notifBtn').addEventListener('click', checkBudgetAlerts);
    document.getElementById('calcSaleBtn').addEventListener('click', calcSale);
    document.getElementById('saveSaleBtn').addEventListener('click', saveSale);
    document.getElementById('addExpenseBtn').addEventListener('click', addExpense);
    document.querySelectorAll('.ptab').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.ptab').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); currentPeriod = b.dataset.period; drawRevenueChart();
    }));
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pg = document.getElementById('page-' + page);
    const nv = document.getElementById('nav-' + page);
    if (pg) { pg.classList.add('active'); pg.scrollTop = 0; }
    if (nv) nv.classList.add('active');
    currentPage = page;
    if (page === 'dashboard') refreshDashboard();
    if (page === 'reports') refreshReports();
    if (page === 'expenses') refreshExpenses();
    if (page === 'more') refreshMore();
}

// ── PIN Security ───────────────────────────────────────────────────────────────
function showPinScreen(mode) {
    pinMode = mode; pinBuffer = '';
    document.getElementById('pinScreen').classList.remove('hidden');
    updatePinDots();
    if (mode === 'verify') {
        document.getElementById('pinTitle').textContent = '🔐 Enter PIN';
        document.getElementById('pinSub').textContent = state.settings.businessName + ' is locked';
    } else if (mode === 'set') {
        document.getElementById('pinTitle').textContent = 'Set New PIN';
        document.getElementById('pinSub').textContent = 'Choose a 4-digit PIN';
    } else if (mode === 'confirm') {
        document.getElementById('pinTitle').textContent = 'Confirm PIN';
        document.getElementById('pinSub').textContent = 'Enter the same PIN again';
    }
}
function pinKey(k) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += k;
    updatePinDots();
    if (pinBuffer.length === 4) setTimeout(() => processPIN(), 200);
}
function pinDel() { pinBuffer = pinBuffer.slice(0, -1); updatePinDots(); }
function updatePinDots() {
    for (let i = 0; i < 4; i++) {
        const d = document.getElementById('d' + i);
        if (d) d.classList.toggle('filled', i < pinBuffer.length);
    }
}
function processPIN() {
    if (pinMode === 'verify') {
        if (simpleHash(pinBuffer) === state.pin) { document.getElementById('pinScreen').classList.add('hidden'); showApp(); }
        else { showPinError('Incorrect PIN. Try again.'); pinBuffer = ''; updatePinDots(); }
    } else if (pinMode === 'set') {
        window._newPin = pinBuffer; pinBuffer = ''; showPinScreen('confirm');
    } else if (pinMode === 'confirm') {
        if (pinBuffer === window._newPin) {
            state.pin = simpleHash(pinBuffer); saveLocal();
            document.getElementById('pinScreen').classList.add('hidden');
            updatePinStatusUI();
            showToast('PIN enabled!'); refreshMore();
        } else { showPinError('PINs do not match. Try again.'); pinBuffer = ''; }
    }
}
function showPinError(msg) {
    const e = document.getElementById('pinError');
    e.textContent = msg; e.classList.remove('hidden');
    setTimeout(() => e.classList.add('hidden'), 3000);
}
function simpleHash(s) {
    let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h.toString(36);
}
function setupPIN() {
    const np = document.getElementById('newPinInput').value;
    const cp = document.getElementById('confirmPinInput').value;
    if (state.pin) { // changing
        if (np.length < 4 || !/^\d{4}$/.test(np)) { showToast('PIN must be 4 digits', 'error'); return; }
        if (np !== cp) { showToast('PINs do not match', 'error'); return; }
        state.pin = simpleHash(np); saveLocal(); updatePinStatusUI(); showToast('PIN updated!');
    } else {
        if (np.length < 4 || !/^\d{4}$/.test(np)) { showToast('PIN must be 4 digits', 'error'); return; }
        if (np !== cp) { showToast('PINs do not match', 'error'); return; }
        state.pin = simpleHash(np); saveLocal(); updatePinStatusUI(); showToast('PIN lock enabled! ✅');
    }
    document.getElementById('newPinInput').value = '';
    document.getElementById('confirmPinInput').value = '';
    refreshMore();
}
function removePIN() {
    if (!confirm('Remove PIN lock? Your data will not be protected.')) return;
    state.pin = null; saveLocal(); updatePinStatusUI(); showToast('PIN removed'); refreshMore();
}
function updatePinStatusUI() {
    const sb = document.getElementById('pinStatus');
    const rb = document.getElementById('removePinBtn');
    const pl = document.getElementById('pinSetupLabel');
    const pb = document.getElementById('pinBtnText');
    if (!sb) return;
    if (state.pin) {
        sb.className = 'pin-status-box on'; sb.innerHTML = '<i class="fa-solid fa-shield-halved"></i> PIN Lock is <strong>ENABLED</strong> – your data is protected';
        if (rb) rb.style.display = 'flex';
        if (pl) pl.textContent = 'Change PIN';
        if (pb) pb.textContent = 'Update PIN';
        if (document.getElementById('pinConfirmWrap')) document.getElementById('pinConfirmWrap').style.display = 'block';
    } else {
        sb.className = 'pin-status-box off'; sb.innerHTML = '<i class="fa-solid fa-lock-open"></i> PIN Lock is <strong>DISABLED</strong> – consider enabling it';
        if (rb) rb.style.display = 'none';
        if (pl) pl.textContent = 'Set 4-Digit PIN';
        if (pb) pb.textContent = 'Enable PIN Lock';
    }
}

// ── Formatting ─────────────────────────────────────────────────────────────────
const fmt = n => `${state.settings.currency} ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = n => `${Number(n).toFixed(1)}%`;
const shortDate = iso => new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' });
function catIcon(cat) {
    const m = { 'Gift Sales': '🎁', 'Event Planning': '🎉', 'Event Décor': '🎊', 'Flower Arrangements': '💐', 'Cake Orders': '🎂', 'Balloons & Setups': '🎈', 'Photography': '📸', 'Other Income': '📦', 'Flower Supplies': '💐', 'Gift Stock': '🎁', 'Décor Materials': '🎨', 'Rent & Venue': '🏠', 'Staff Salaries': '👥', 'Delivery & Transport': '🚗', 'Marketing & Ads': '📣', 'M-Pesa Charges': '📱', 'Utilities': '💡', 'Packaging': '🖨️', 'Other': '📋' };
    return m[cat] || '📋';
}

// ── Sales Calculator ───────────────────────────────────────────────────────────
let currentSale = null;
function calcSale() {
    const price = parseFloat(document.getElementById('salePrice').value) || 0;
    const cost = parseFloat(document.getElementById('saleCost').value) || 0;
    const qty = parseInt(document.getElementById('saleQty').value) || 1;
    const taxPct = parseFloat(document.getElementById('saleTax').value) || 0;
    if (price <= 0) { showToast('Enter a valid selling price', 'error'); return; }
    const rev = price * qty, cst = cost * qty, tax = rev * (taxPct / 100), profit = rev - cst - tax, margin = rev > 0 ? (profit / rev) * 100 : 0;
    const $ = id => document.getElementById(id);
    $('rRevenue').textContent = fmt(rev); $('rCost').textContent = fmt(cst);
    $('rTax').textContent = fmt(tax); $('rProfit').textContent = fmt(profit);
    $('rMargin').textContent = pct(margin);
    $('rMarginBar').style.width = Math.max(0, Math.min(100, margin)) + '%';
    const v = getVerdict(margin); const vb = $('saleVerdict');
    vb.textContent = v.label; vb.style.background = v.bg; vb.style.color = v.color;
    $('saleResults').classList.remove('hidden');
    currentSale = { price, cost, qty, taxPct, rev, cst, tax, profit, margin };
}
async function saveSale() {
    if (!currentSale) { showToast('Calculate first!', 'error'); return; }
    const btn = document.getElementById('saveSaleBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    await persistTxn({
        name: document.getElementById('saleName').value.trim() || 'Unnamed Sale',
        category: document.getElementById('saleCategory').value,
        payment: document.getElementById('salePayment').value,
        ref: document.getElementById('saleRef').value.trim(),
        revenue: currentSale.rev, cost: currentSale.cst, tax: currentSale.tax,
        qty: currentSale.qty, profit: currentSale.profit, margin: currentSale.margin
    });
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Transaction';
    showToast('Sale saved! ✅');
    ['saleName', 'salePrice', 'saleCost', 'saleRef'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('saleQty').value = '1';
    document.getElementById('saleTax').value = '0';
    document.getElementById('saleResults').classList.add('hidden');
    currentSale = null;
}
function liveMargin() {
    const sp = parseFloat(document.getElementById('mSellingPrice').value) || 0;
    const cp = parseFloat(document.getElementById('mCostPrice').value) || 0;
    const res = document.getElementById('liveMarginResult');
    if (sp > 0 && cp > 0) {
        const gp = sp - cp, mg = (gp / sp) * 100, mk = (gp / cp) * 100;
        document.getElementById('lmGross').textContent = fmt(gp);
        document.getElementById('lmMargin').textContent = pct(mg);
        document.getElementById('lmMarkup').textContent = pct(mk);
        const v = getVerdict(mg);
        const lv = document.getElementById('lmVerdict');
        lv.textContent = v.label; lv.style.background = v.bg; lv.style.color = v.color;
        res.classList.remove('hidden');
    } else { res.classList.add('hidden'); }
}
function getVerdict(m) {
    if (m < 10) return { label: '🔴 Poor – raise your price!', bg: 'rgba(239,68,68,.15)', color: '#ef4444' };
    if (m < 20) return { label: '🟡 Fair – acceptable margin', bg: 'rgba(245,158,11,.15)', color: '#f59e0b' };
    if (m < 40) return { label: '🟢 Good – healthy margin!', bg: 'rgba(16,185,129,.15)', color: '#10b981' };
    return { label: '💎 Excellent – outstanding!', bg: 'rgba(168,85,247,.15)', color: '#a855f7' };
}

// ── Expense Tracker ────────────────────────────────────────────────────────────
async function addExpense() {
    const name = document.getElementById('expName').value.trim();
    const amount = parseFloat(document.getElementById('expAmount').value) || 0;
    const cat = document.getElementById('expCategory').value;
    const payment = document.getElementById('expPayment').value;
    const ref = document.getElementById('expRef').value.trim();
    if (!name || amount <= 0) { showToast('Enter description and amount', 'error'); return; }
    const btn = document.getElementById('addExpenseBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    await persistExp({ name, category: cat, amount, payment, ref });
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Expense';
    document.getElementById('expName').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('expRef').value = '';
    showToast('Expense added!');
    refreshExpenses(); checkBudgetAlerts();
}
function refreshExpenses() {
    const total = state.expenses.reduce((s, e) => s + e.amount, 0);
    document.getElementById('expTotal').textContent = fmt(total);
    const list = document.getElementById('expenseList');
    if (!state.expenses.length) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>No expenses yet.</p></div>'; return;
    }
    list.innerHTML = state.expenses.slice(0, 40).map(e => `
    <div class="txn-item">
      <div class="txn-left">
        <div class="txn-icon-wrap" style="background:rgba(245,158,11,.13);color:#f59e0b">${catIcon(e.category)}</div>
        <div><div class="txn-name">${e.name}</div><div class="txn-meta">${e.category} · ${shortDate(e.date)} · ${e.payment || ''}</div></div>
      </div>
      <div class="txn-right">
        <div class="txn-amount" style="color:#ef4444">-${fmt(e.amount)}</div>
        <button onclick="delExp(${e.id})" style="font-size:10px;color:var(--text-muted);background:none;border:none;cursor:pointer;font-family:var(--font)">delete</button>
      </div>
    </div>`).join('');
    drawExpenseChart();
    renderBudgetStatus('expBudgetList', 'expBudgetCard');
}
async function delExp(id) { await removeExp(id); refreshExpenses(); showToast('Deleted'); }

// ── Dashboard ─────────────────────────────────────────────────────────────────
function refreshDashboard() {
    const txns = state.transactions, exps = state.expenses;
    const revenue = txns.reduce((s, t) => s + t.revenue, 0);
    const profit = txns.reduce((s, t) => s + t.profit, 0);
    const totalExp = exps.reduce((s, e) => s + e.amount, 0);
    const netBalance = revenue - totalExp;
    const margin = txns.length ? txns.reduce((s, t) => s + t.margin, 0) / txns.length : 0;
    const $ = id => document.getElementById(id);
    $('dashRevenue').textContent = fmt(revenue);
    $('dashProfit').textContent = fmt(profit);
    $('dashMargin').textContent = pct(margin);
    $('dashTxns').textContent = txns.length;
    $('dashBalance').textContent = fmt(netBalance);
    $('dashBalance').style.color = netBalance >= 0 ? '#10b981' : '#ef4444';
    $('dashIncome').textContent = fmt(revenue);
    $('dashExpenses').textContent = fmt(totalExp);
    $('greetBusiness').textContent = state.settings.businessName;
    const list = $('recentList');
    const all = [
        ...txns.map(t => ({ ...t, _type: 'income' })),
        ...exps.map(e => ({ ...e, _type: 'expense' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    list.innerHTML = all.length ? all.map(r => r._type === 'income' ? txnHTML(r) : expHTML(r)).join('') :
        '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No activity yet. Log your first transaction!</p></div>';
    drawRevenueChart();
    renderBudgetPulse();
}
function txnHTML(t) {
    return `<div class="txn-item"><div class="txn-left">
    <div class="txn-icon-wrap" style="background:rgba(16,185,129,.13);color:var(--green)">${catIcon(t.category)}</div>
    <div><div class="txn-name">${t.name}</div><div class="txn-meta">${t.category} · ${shortDate(t.date)} · ${t.payment || ''}</div></div></div>
    <div class="txn-right"><div class="txn-amount" style="color:#10b981">+${fmt(t.revenue)}</div>
    <div class="txn-margin">${pct(t.margin)} margin</div></div></div>`;
}
function expHTML(e) {
    return `<div class="txn-item"><div class="txn-left">
    <div class="txn-icon-wrap" style="background:rgba(245,158,11,.13);color:var(--orange)">${catIcon(e.category)}</div>
    <div><div class="txn-name">${e.name}</div><div class="txn-meta">${e.category} · ${shortDate(e.date)}</div></div></div>
    <div class="txn-right"><div class="txn-amount" style="color:#ef4444">-${fmt(e.amount)}</div></div></div>`;
}

// ── Reports ────────────────────────────────────────────────────────────────────
function setReportTab(tab) {
    currentReportTab = tab;
    ['pl', 'cashflow', 'summary'].forEach(t => {
        document.getElementById('rtab-' + t).classList.toggle('active', t === tab);
        document.getElementById('rtab-content-' + t).classList.toggle('hidden', t !== tab);
    });
    if (tab === 'cashflow') drawCashFlowChart();
    if (tab === 'summary') drawSummaryCharts();
}
function refreshReports() {
    const txns = state.transactions, exps = state.expenses;
    const revenue = txns.reduce((s, t) => s + t.revenue, 0);
    const costOfGoods = txns.reduce((s, t) => s + t.cost, 0);
    const totalExp = exps.reduce((s, e) => s + e.amount, 0);
    const costs = costOfGoods + totalExp;
    const profit = txns.reduce((s, t) => s + t.profit, 0) - totalExp;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const $ = id => document.getElementById(id);
    $('rptRevenue').textContent = fmt(revenue);
    $('rptCosts').textContent = fmt(costs);
    $('rptProfit').textContent = fmt(profit);
    $('rptMargin').textContent = pct(margin);
    drawPLChart(revenue, costs, profit);
    drawCatChart();
    renderTopSellers();
    if (currentReportTab === 'cashflow') drawCashFlowChart();
    if (currentReportTab === 'summary') drawSummaryCharts();
}
function renderTopSellers() {
    if (!state.transactions.length) {
        document.getElementById('topSellers').innerHTML = '<div class="empty-state"><i class="fa-solid fa-trophy"></i><p>No data yet.</p></div>'; return;
    }
    const agg = {};
    state.transactions.forEach(t => {
        if (!agg[t.name]) agg[t.name] = { name: t.name, revenue: 0, count: 0 };
        agg[t.name].revenue += t.revenue; agg[t.name].count += t.qty;
    });
    const sorted = Object.values(agg).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const medals = ['gold', 'silver', 'bronze'];
    document.getElementById('topSellers').innerHTML = sorted.map((p, i) => `
    <div class="txn-item"><div class="txn-left">
      <div class="rank-badge ${medals[i] || ''}">${i + 1}</div>
      <div><div class="txn-name">${p.name}</div><div class="txn-meta">Sold ${p.count} unit(s)</div></div></div>
      <div class="txn-right"><div class="txn-amount" style="color:var(--green)">${fmt(p.revenue)}</div></div></div>`).join('');
}
function drawCashFlowChart() {
    const now = new Date(); const months = [], inData = [], outData = [];
    for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        months.push(d.toLocaleDateString('en-KE', { month: 'short' }));
        const mIn = state.transactions.filter(t => { const td = new Date(t.date); return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear(); }).reduce((s, t) => s + t.revenue, 0);
        const mOut = state.expenses.filter(e => { const ed = new Date(e.date); return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear(); }).reduce((s, e) => s + e.amount, 0);
        inData.push(mIn); outData.push(mOut);
    }
    const totalIn = inData.reduce((s, v) => s + v, 0), totalOut = outData.reduce((s, v) => s + v, 0), net = totalIn - totalOut;
    document.getElementById('cfIn').textContent = fmt(totalIn);
    document.getElementById('cfOut').textContent = fmt(totalOut);
    const cfNet = document.getElementById('cfNet'); cfNet.textContent = fmt(net); cfNet.style.color = net >= 0 ? '#10b981' : '#ef4444';
    const canvas = document.getElementById('cashflowChart'); if (!canvas) return;
    if (charts.cashflow) { charts.cashflow.destroy(); charts.cashflow = null; }
    charts.cashflow = new Chart(canvas, {
        type: 'bar', data: {
            labels: months, datasets: [
                { label: 'Income', data: inData, backgroundColor: 'rgba(16,185,129,.75)', borderRadius: 6, borderWidth: 0 },
                { label: 'Expenses', data: outData, backgroundColor: 'rgba(239,68,68,.75)', borderRadius: 6, borderWidth: 0 }]
        },
        options: { responsive: true, plugins: { legend: { display: true, labels: { color: '#7c849a', font: { size: 11 } } }, tooltip: TCFG }, scales: { x: SC, y: SC } }
    });
    const all = [
        ...state.transactions.map(t => ({ date: t.date, val: t.revenue, type: 'in', name: t.name })),
        ...state.expenses.map(e => ({ date: e.date, val: -e.amount, type: 'out', name: e.name }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    const rb = document.getElementById('runningBalance');
    if (!all.length) { rb.innerHTML = '<div class="empty-state"><i class="fa-solid fa-water"></i><p>No data.</p></div>'; return; }
    rb.innerHTML = all.slice(-15).reverse().map(r => {
        running += r.val;
        const col = r.val >= 0 ? '#10b981' : '#ef4444';
        return `<div class="txn-item"><div class="txn-left"><div class="txn-icon-wrap" style="background:${r.val >= 0 ? 'rgba(16,185,129,.13)' : 'rgba(239,68,68,.13)'};color:${col}">${r.val >= 0 ? '💰' : '💸'}</div><div><div class="txn-name">${r.name}</div><div class="txn-meta">${shortDate(r.date)}</div></div></div><div class="txn-right"><div class="txn-amount" style="color:${col}">${r.val >= 0 ? '+' : ''}${fmt(r.val)}</div><div class="txn-margin">Balance: ${fmt(running)}</div></div></div>`;
    }).join('');
}
function drawSummaryCharts() {
    const COLS = ['#ef4444', '#f59e0b', '#a855f7', '#3b82f6', '#10b981', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6'];
    const expCats = {};
    state.expenses.forEach(e => { expCats[e.category] = (expCats[e.category] || 0) + e.amount; });
    const totalExp = Object.values(expCats).reduce((s, v) => s + v, 0);
    const ec = document.getElementById('expCatSummary');
    ec.innerHTML = Object.entries(expCats).sort((a, b) => b[1] - a[1]).map(([cat, amt], i) => `
    <div class="cat-sum-item"><div class="cat-sum-icon">${catIcon(cat)}</div>
    <div class="cat-sum-info"><div class="cat-sum-name">${cat}</div>
    <div class="cat-sum-bar"><div class="cat-sum-fill" style="width:${totalExp ? (amt / totalExp * 100) : 0}%;background:${COLS[i % COLS.length]}"></div></div></div>
    <div class="cat-sum-right"><div class="cat-sum-amount" style="color:${COLS[i % COLS.length]}">${fmt(amt)}</div><div class="cat-sum-pct">${totalExp ? pct(amt / totalExp * 100) : '—'}</div></div></div>`).join('')
        || '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No expenses.</p></div>';
    const incCats = {};
    state.transactions.forEach(t => { incCats[t.category] = (incCats[t.category] || 0) + t.revenue; });
    const totalInc = Object.values(incCats).reduce((s, v) => s + v, 0);
    const ic = document.getElementById('incCatSummary');
    ic.innerHTML = Object.entries(incCats).sort((a, b) => b[1] - a[1]).map(([cat, amt], i) => `
    <div class="cat-sum-item"><div class="cat-sum-icon">${catIcon(cat)}</div>
    <div class="cat-sum-info"><div class="cat-sum-name">${cat}</div>
    <div class="cat-sum-bar"><div class="cat-sum-fill" style="width:${totalInc ? (amt / totalInc * 100) : 0}%;background:${COLS[i % COLS.length]}"></div></div></div>
    <div class="cat-sum-right"><div class="cat-sum-amount" style="color:${COLS[i % COLS.length]}">${fmt(amt)}</div><div class="cat-sum-pct">${totalInc ? pct(amt / totalInc * 100) : '—'}</div></div></div>`).join('')
        || '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No income.</p></div>';
    if (Object.keys(expCats).length) {
        const c = document.getElementById('summaryExpChart'); if (!c) return;
        if (charts.summaryExp) { charts.summaryExp.destroy(); charts.summaryExp = null; }
        charts.summaryExp = new Chart(c, { type: 'doughnut', data: { labels: Object.keys(expCats), datasets: [{ data: Object.values(expCats), backgroundColor: COLS, borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#7c849a', font: { size: 10 }, padding: 10, boxWidth: 10 } }, tooltip: TCFG } } });
    }
}

// ── Budget ─────────────────────────────────────────────────────────────────────
const EXP_CATS = ['Flower Supplies', 'Gift Stock', 'Décor Materials', 'Rent & Venue', 'Staff Salaries', 'Delivery & Transport', 'Marketing & Ads', 'M-Pesa Charges', 'Utilities', 'Packaging', 'Other'];
function refreshMore() {
    applySettings(); updatePinStatusUI();
    const fl = document.getElementById('budgetFormList');
    fl.innerHTML = EXP_CATS.map(c => `
    <div class="budget-input-row">
      <label>${catIcon(c)} ${c}</label>
      <input type="number" id="bgt_${c.replace(/[\s&\/]/g, '_')}" placeholder="0" value="${state.budgets[c] || ''}" min="0" />
    </div>`).join('');
    renderBudgetStatus('budgetProgressList');
    const bi = document.getElementById('lastBackupInfo');
    if (bi) bi.textContent = state.lastBackup ? 'Last backup: ' + new Date(state.lastBackup).toLocaleString('en-KE') : 'No backup created yet';
}
function saveBudgets() {
    EXP_CATS.forEach(c => {
        const inp = document.getElementById('bgt_' + c.replace(/[\s&\/]/g, '_'));
        if (inp) { const v = parseFloat(inp.value) || 0; if (v > 0) state.budgets[c] = v; else delete state.budgets[c]; }
    });
    saveLocal(); showToast('Budgets saved!'); checkBudgetAlerts(); renderBudgetStatus('budgetProgressList');
}
function renderBudgetStatus(listId, cardId) {
    const el = document.getElementById(listId); if (!el) return;
    if (cardId) { const c = document.getElementById(cardId); if (c) c.style.display = Object.keys(state.budgets).length ? 'block' : 'none'; }
    if (!Object.keys(state.budgets).length) { el.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:8px 0">No budgets set yet.</p>'; return; }
    const now = new Date();
    el.innerHTML = EXP_CATS.filter(c => state.budgets[c]).map(c => {
        const spent = state.expenses.filter(e => e.category === c && new Date(e.date).getMonth() === now.getMonth() && new Date(e.date).getFullYear() === now.getFullYear()).reduce((s, e) => s + e.amount, 0);
        const budget = state.budgets[c], pctUsed = budget ? (spent / budget * 100) : 0;
        const cls = pctUsed >= 100 ? 'danger' : pctUsed >= 80 ? 'warn' : '';
        return `<div class="budget-item"><div class="budget-item-label"><span>${catIcon(c)} ${c}</span><span>${fmt(spent)} / ${fmt(budget)}</span></div><div class="budget-bar-bg"><div class="budget-bar-fill ${cls}" style="width:${Math.min(100, pctUsed)}%"></div></div></div>`;
    }).join('');
}
function renderBudgetPulse() {
    const bp = document.getElementById('budgetPulse'); if (!bp) return;
    const now = new Date(); const items = [];
    EXP_CATS.filter(c => state.budgets[c]).forEach(c => {
        const spent = state.expenses.filter(e => e.category === c && new Date(e.date).getMonth() === now.getMonth()).reduce((s, e) => s + e.amount, 0);
        const pctUsed = state.budgets[c] ? (spent / state.budgets[c] * 100) : 0;
        if (pctUsed >= 70) items.push({ cat: c, spent, budget: state.budgets[c], pct: pctUsed });
    });
    bp.style.display = items.length ? 'block' : 'none';
    document.getElementById('budgetPulseList').innerHTML = items.map(i => `
    <div class="bp-item"><span class="bp-name">${catIcon(i.cat)} ${i.cat}</span><span class="bp-val" style="color:${i.pct >= 100 ? '#ef4444' : '#f59e0b'}">${Math.round(i.pct)}%</span></div>`).join('');
}
function checkBudgetAlerts() {
    const now = new Date(); const overBudget = [];
    EXP_CATS.filter(c => state.budgets[c]).forEach(c => {
        const spent = state.expenses.filter(e => e.category === c && new Date(e.date).getMonth() === now.getMonth()).reduce((s, e) => s + e.amount, 0);
        if (spent > state.budgets[c]) overBudget.push(c);
    });
    const banner = document.getElementById('alertBanner'), msg = document.getElementById('alertMsg'), nb = document.getElementById('notifBadge');
    if (overBudget.length) {
        banner.classList.remove('hidden'); msg.textContent = 'Over budget: ' + overBudget.join(', ');
        nb.style.display = 'flex'; nb.textContent = overBudget.length;
    } else { banner.classList.add('hidden'); nb.style.display = 'none'; }
}
function dismissAlert() { document.getElementById('alertBanner').classList.add('hidden'); }

// ── Settings ───────────────────────────────────────────────────────────────────
async function saveSettings() {
    await persistSettings({
        businessName: document.getElementById('settBusName').value.trim() || state.settings.businessName,
        businessType: document.getElementById('settBusType').value.trim(),
        ownerName: document.getElementById('settOwnerName').value.trim(),
        currency: document.getElementById('settCurrency').value,
        phone: document.getElementById('settPhone').value.trim()
    });
    applySettings(); showToast('Settings saved!');
}

// ── Charts ─────────────────────────────────────────────────────────────────────
const TCFG = { backgroundColor: '#1c2235', titleColor: '#e6e9f0', bodyColor: '#7c849a', borderColor: 'rgba(255,255,255,0.07)', borderWidth: 1 };
const SC = { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7c849a', font: { size: 10 } } };
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); charts[key] = null; } }
function aggregateByPeriod(period) {
    const now = new Date(), days = period === 'week' ? 7 : 30, labels = [], data = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        labels.push(period === 'week' ? d.toLocaleDateString('en-KE', { weekday: 'short' }) : String(d.getDate()));
        data.push(state.transactions.filter(t => new Date(t.date).toDateString() === d.toDateString()).reduce((s, t) => s + t.revenue, 0));
    }
    return { labels, data };
}
function drawRevenueChart() {
    const canvas = document.getElementById('revenueChart'); if (!canvas) return;
    destroyChart('revenue');
    const ctx = canvas.getContext('2d'), { labels, data } = aggregateByPeriod(currentPeriod);
    const g = ctx.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, 'rgba(16,185,129,.4)'); g.addColorStop(1, 'rgba(16,185,129,0)');
    charts.revenue = new Chart(canvas, { type: 'line', data: { labels, datasets: [{ data, borderColor: '#10b981', borderWidth: 2.5, backgroundColor: g, fill: true, tension: .4, pointBackgroundColor: '#10b981', pointRadius: 3, pointHoverRadius: 5 }] }, options: { responsive: true, animation: { duration: 400 }, plugins: { legend: { display: false }, tooltip: TCFG }, scales: { x: SC, y: SC } } });
}
function drawExpenseChart() {
    const canvas = document.getElementById('expenseChart'); if (!canvas) return;
    destroyChart('expense');
    const cats = {}; state.expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
    if (!Object.keys(cats).length) return;
    const COLS = ['#ef4444', '#f59e0b', '#a855f7', '#3b82f6', '#10b981', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6'];
    charts.expense = new Chart(canvas, { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: COLS, borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#7c849a', font: { size: 10 }, padding: 10, boxWidth: 10 } }, tooltip: TCFG } } });
}
function drawPLChart(revenue, costs, profit) {
    const canvas = document.getElementById('plChart'); if (!canvas) return;
    destroyChart('pl');
    charts.pl = new Chart(canvas, { type: 'bar', data: { labels: ['Revenue', 'Total Costs', 'Net Profit'], datasets: [{ data: [revenue, costs, profit], backgroundColor: ['rgba(16,185,129,.75)', 'rgba(239,68,68,.75)', profit >= 0 ? 'rgba(59,130,246,.75)' : 'rgba(239,68,68,.75)'], borderRadius: 8, borderWidth: 0 }] }, options: { responsive: true, plugins: { legend: { display: false }, tooltip: TCFG }, scales: { x: SC, y: SC } } });
}
function drawCatChart() {
    const canvas = document.getElementById('catChart'); if (!canvas) return;
    destroyChart('cat');
    const cats = {}; state.transactions.forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.revenue; });
    if (!Object.keys(cats).length) return;
    charts.cat = new Chart(canvas, { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#f97316'], borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#7c849a', font: { size: 10 }, padding: 10, boxWidth: 10 } }, tooltip: TCFG } } });
}

// ── Backup & Restore ───────────────────────────────────────────────────────────
function backupJSON() {
    state.lastBackup = new Date().toISOString(); saveLocal();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'FundTrucker_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(url); showToast('Backup downloaded!');
    const bi = document.getElementById('lastBackupInfo'); if (bi) bi.textContent = 'Last backup: ' + new Date().toLocaleString('en-KE');
}
function restoreBackup(evt) {
    const file = evt.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.transactions || !data.expenses) { showToast('Invalid backup file', 'error'); return; }
            Object.assign(state, data); saveLocal(); applySettings(); refreshDashboard(); checkBudgetAlerts();
            showToast('Backup restored!'); refreshMore();
        } catch (err) { showToast('Failed to restore backup', 'error'); }
    };
    reader.readAsText(file);
}
function exportCSV() {
    const cur = state.settings.currency;
    let csv = 'FundTrucker Report - ' + state.settings.businessName + '\nGenerated: ' + new Date().toLocaleString('en-KE') + '\n\n';
    csv += 'SALES\nDate,Name,Category,Payment,Ref,Qty,Revenue(' + cur + '),Cost(' + cur + '),Tax(' + cur + '),Profit(' + cur + '),Margin(%)\n';
    state.transactions.forEach(t => { csv += shortDate(t.date) + ',' + t.name + ',' + t.category + ',' + (t.payment || '') + ',' + (t.ref || '') + ',' + t.qty + ',' + t.revenue.toFixed(2) + ',' + t.cost.toFixed(2) + ',' + t.tax.toFixed(2) + ',' + t.profit.toFixed(2) + ',' + t.margin.toFixed(1) + '\n'; });
    csv += '\nEXPENSES\nDate,Name,Category,Payment,Ref,Amount(' + cur + ')\n';
    state.expenses.forEach(e => { csv += shortDate(e.date) + ',' + e.name + ',' + e.category + ',' + (e.payment || '') + ',' + (e.ref || '') + ',' + e.amount.toFixed(2) + '\n'; });
    const blob = new Blob([csv], { type: 'text/csv' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'FundTrucker_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(url); showToast('CSV exported!');
}

// ── Clear All ──────────────────────────────────────────────────────────────────
async function clearAllData() {
    if (!confirm('Clear ALL data? This cannot be undone.')) return;
    state.transactions = []; state.expenses = []; saveLocal();
    refreshDashboard(); refreshExpenses(); showToast('All data cleared');
}

// ── Davma Demo Data ────────────────────────────────────────────────────────────
function loadDemoData() {
    if (!confirm('Load Davma Surprises demo data? Sample transactions will be added.')) return;
    const now = new Date(), yr = now.getFullYear(), mo = now.getMonth();
    const d = (day) => new Date(yr, mo, day).toISOString();
    const mkTxn = (name, category, payment, ref, revenue, cost, qty, taxPct) => {
        const rev = revenue, cst = cost * qty, tx = rev * (taxPct / 100), profit = rev - cst - tx, margin = rev > 0 ? (profit / rev) * 100 : 0;
        return { id: Date.now() + Math.random() * 1000 | 0, date: d(Math.floor(Math.random() * 25) + 1), name, category, payment, ref, revenue: rev, cost: cst, tax: tx, qty, profit, margin };
    };
    const txns = [
        mkTxn('Wedding Balloon & Décor Setup', 'Event Décor', 'M-Pesa', 'QB43G9R2', 45000, 18000, 1, 0),
        mkTxn('Birthday Gift Hamper – Premium', 'Gift Sales', 'M-Pesa', 'XK21P8T4', 8500, 3200, 1, 0),
        mkTxn('Valentine Surprise Package', 'Gift Sales', 'Cash', '', 4500, 1800, 3, 0),
        mkTxn('Fresh Rose Bouquet', 'Flower Arrangements', 'M-Pesa', 'LM67Q2WS', 3500, 1400, 2, 0),
        mkTxn('Corporate Event – Nairobi', 'Event Décor', 'Bank Transfer', 'TXN-2024039', 85000, 32000, 1, 16),
        mkTxn('Anniversary Surprise Setup', 'Event Planning', 'M-Pesa', 'YN90B5KC', 15000, 5500, 1, 0),
        mkTxn('Baby Shower Balloon Arch', 'Balloons & Setups', 'M-Pesa', 'RP45T7VZ', 12000, 4500, 1, 0),
        mkTxn('Graduation Gift Box', 'Gift Sales', 'Cash', '', 6000, 2200, 2, 0),
        mkTxn('Wedding Flower Décor', 'Flower Arrangements', 'M-Pesa', 'MB23K9NP', 22000, 8500, 1, 0),
        mkTxn('Photo Backdrop Setup', 'Photography', 'M-Pesa', 'GH56F3DX', 9000, 3000, 1, 0),
        mkTxn('Christmas Gift Hampers', 'Gift Sales', 'M-Pesa', 'JT89W2QA', 12000, 4800, 4, 0),
        mkTxn('Office Monthly Décor', 'Event Décor', 'Bank Transfer', 'TXN-2024041', 18000, 7000, 1, 0)
    ];
    const exps = [
        { id: Date.now() + 3001, date: d(2), name: 'Fresh Flower Stock – Westlands', category: 'Flower Supplies', amount: 12000, payment: 'M-Pesa', ref: 'SU78N4QL' },
        { id: Date.now() + 3002, date: d(4), name: 'Gift Packaging & Ribbons', category: 'Gift Stock', amount: 4500, payment: 'Cash', ref: '' },
        { id: Date.now() + 3003, date: d(6), name: 'Balloon & Helium Cylinder', category: 'Décor Materials', amount: 6500, payment: 'M-Pesa', ref: 'WX34B9YP' },
        { id: Date.now() + 3004, date: d(1), name: 'Shop Rent – March 2026', category: 'Rent & Venue', amount: 18000, payment: 'Bank Transfer', ref: 'RENT-MAR-2026' },
        { id: Date.now() + 3005, date: d(1), name: 'Assistant Salary – March', category: 'Staff Salaries', amount: 15000, payment: 'M-Pesa', ref: 'SAL-MAR-26' },
        { id: Date.now() + 3006, date: d(8), name: 'Delivery Rider – Weekly', category: 'Delivery & Transport', amount: 3200, payment: 'Cash', ref: '' },
        { id: Date.now() + 3007, date: d(5), name: 'Facebook & Instagram Ads', category: 'Marketing & Ads', amount: 3000, payment: 'M-Pesa', ref: 'META-ADS-001' },
        { id: Date.now() + 3008, date: d(10), name: 'M-Pesa Transaction Charges', category: 'M-Pesa Charges', amount: 850, payment: 'M-Pesa', ref: 'AUTO' },
        { id: Date.now() + 3009, date: d(3), name: 'Electricity & Water Bill', category: 'Utilities', amount: 2800, payment: 'M-Pesa', ref: 'KPLC-2024' },
        { id: Date.now() + 3010, date: d(7), name: 'Printed Brochures & Cards', category: 'Packaging', amount: 2200, payment: 'Cash', ref: '' },
        { id: Date.now() + 3011, date: d(9), name: 'Fabric & Tulle for Arch', category: 'Décor Materials', amount: 5500, payment: 'Cash', ref: '' }
    ];
    state.transactions = [...txns, ...state.transactions];
    state.expenses = [...exps, ...state.expenses];
    state.budgets = { 'Flower Supplies': 15000, 'Gift Stock': 6000, 'Décor Materials': 10000, 'Rent & Venue': 18000, 'Staff Salaries': 18000, 'Delivery & Transport': 4000, 'Marketing & Ads': 5000, 'M-Pesa Charges': 1500, 'Utilities': 3000, 'Packaging': 3000 };
    saveLocal(); refreshDashboard(); checkBudgetAlerts();
    showToast('Davma demo data loaded!');
}

// ── Toast ──────────────────────────────────────────────────────────────────────
let _toastT = null;
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast'), m = document.getElementById('toastMsg'), ic = t.querySelector('i');
    m.textContent = msg;
    if (type === 'error') { t.style.borderColor = '#ef4444'; t.style.color = '#ef4444'; ic.className = 'fa-solid fa-circle-exclamation'; }
    else { t.style.borderColor = '#10b981'; t.style.color = '#10b981'; ic.className = 'fa-solid fa-circle-check'; }
    t.classList.remove('hidden');
    if (_toastT) clearTimeout(_toastT);
    _toastT = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ── Smart Entry (SMS, OCR, CSV) ────────────────────────────────────────────────
let activeSmartType = 'income';

function openSmartEntry(type) {
    activeSmartType = type;
    document.getElementById('smartModal').classList.remove('hidden');
    document.getElementById('smartModalTitle').textContent = (type === 'income' ? 'Smart Income Entry' : 'Smart Expense Entry');
    setSmartTab('sms');
}
function closeSmartEntry() { document.getElementById('smartModal').classList.add('hidden'); }

function setSmartTab(tab) {
    ['sms', 'scan', 'csv'].forEach(t => {
        const btn = document.getElementById('stab-' + t);
        const section = document.getElementById('smart-' + t + '-tab');
        if (btn) btn.classList.toggle('active', t === tab);
        if (section) section.classList.toggle('hidden', t !== tab);
    });
}

function parseSMS() {
    const text = document.getElementById('smsInput').value.trim();
    if (!text) { showToast('Please paste an SMS message', 'error'); return; }

    const mPesaPayOut = /Confirmed\. KES([0-9,.]+)\s+paid to\s+([^.]+) on/i;
    const mPesaPayIn = /Confirmed\.\s+You have received\s+KES([0-9,.]+)\s+from\s+([^.]+) on/i;
    const bankPattern = /Amt: (?:KES|USD)\s?([0-9,.]+)\s?at\s?([^,.]+)/i;

    let amount = 0, name = '', ref = '';
    const refMatch = text.match(/^([A-Z0-9]{8,12})/);
    if (refMatch) ref = refMatch[1];

    if (mPesaPayIn.test(text)) {
        const m = text.match(mPesaPayIn);
        amount = parseFloat(m[1].replace(/,/g, ''));
        name = m[2].trim();
    } else if (mPesaPayOut.test(text)) {
        const m = text.match(mPesaPayOut);
        amount = parseFloat(m[1].replace(/,/g, ''));
        name = m[2].trim();
    } else if (bankPattern.test(text)) {
        const m = text.match(bankPattern);
        amount = parseFloat(m[1].replace(/,/g, ''));
        name = m[2].trim();
    }

    if (amount > 0) {
        if (activeSmartType === 'income') {
            document.getElementById('saleName').value = name;
            document.getElementById('salePrice').value = amount;
            document.getElementById('saleRef').value = ref;
            goTo('income');
            showToast('Extracted Income details!');
        } else {
            document.getElementById('expName').value = name;
            document.getElementById('expAmount').value = amount;
            document.getElementById('expRef').value = ref;
            goTo('expenses');
            showToast('Extracted Expense details!');
        }
        closeSmartEntry();
    } else {
        showToast('Could not extract data. Check format.', 'error');
    }
}

async function runOCR(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    const preview = document.getElementById('scanPreview');
    const status = document.getElementById('scanStatus');
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
    status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading receipt...';

    try {
        const result = await Tesseract.recognize(file, 'eng');
        const lines = result.data.text.split('\n');
        const rawText = result.data.text;
        const amountMatch = rawText.match(/(?:KES|KSH|USD|TOTAL|AMOUNT|BAL|PAY)\s?:?\s?([0-9,.]+\.\d{2})/i);
        let amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
        let name = lines[0].trim().substring(0, 30);

        if (activeSmartType === 'income') {
            document.getElementById('saleName').value = name || 'Scanned Income';
            document.getElementById('salePrice').value = amount || '';
            goTo('income');
        } else {
            document.getElementById('expName').value = name || 'Scanned Expense';
            document.getElementById('expAmount').value = amount || '';
            goTo('expenses');
        }
        showToast('OCR Finished!'); closeSmartEntry();
    } catch (err) {
        showToast('OCR Failed', 'error'); status.textContent = 'Failed to read.';
    }
}

let pendingCSVData = [];
function importCSV(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const rows = e.target.result.split('\n').filter(r => r.trim()).map(r => r.split(','));
        const startIdx = isNaN(rows[0][rows[0].length - 1]) ? 1 : 0;
        pendingCSVData = rows.slice(startIdx).map(r => ({
            name: r[1] || 'CSV Import',
            amount: parseFloat(r[r.length - 1]) || 0
        }));
        document.getElementById('csvPreview').classList.remove('hidden');
        document.getElementById('csvCount').textContent = `Found ${pendingCSVData.length} items.`;
    };
    reader.readAsText(file);
}

async function confirmCSVImport() {
    if (!pendingCSVData.length) return;
    showToast(`Importing ${pendingCSVData.length} items...`);
    for (const item of pendingCSVData) {
        if (activeSmartType === 'income') {
            await persistTxn({ name: item.name, category: 'Gift Sales', revenue: item.amount, cost: 0, tax: 0, qty: 1, profit: item.amount, margin: 100, payment: 'CSV' });
        } else {
            await persistExp({ name: item.name, category: 'Other', amount: item.amount, payment: 'CSV' });
        }
    }
    pendingCSVData = []; document.getElementById('csvPreview').classList.add('hidden');
    showToast('Import successful!'); closeSmartEntry();
    if (activeSmartType === 'income') refreshDashboard(); else refreshExpenses();
}
