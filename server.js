/**
 * FundTrucker – Backend API Server
 * Node.js + Express + JSON file storage (no database install needed)
 * Run: node server.js
 * Then open http://localhost:3000 in your browser
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve the frontend files (index.html, styles.css, app.js)
app.use(express.static(__dirname, {
    index: 'index.html',
    extensions: ['html']
}));

// ── Database Helpers ─────────────────────────────────────────────────────────
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) return initDB();
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('DB read error:', e.message);
        return initDB();
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('DB write error:', e.message);
        return false;
    }
}

function initDB() {
    const empty = {
        settings: { businessName: 'My Business', currency: 'KES' },
        transactions: [],
        expenses: []
    };
    writeDB(empty);
    return empty;
}

// ── Settings Routes ──────────────────────────────────────────────────────────
// GET  /api/settings
app.get('/api/settings', (req, res) => {
    const db = readDB();
    res.json(db.settings);
});

// PUT  /api/settings
app.put('/api/settings', (req, res) => {
    const db = readDB();
    db.settings = { ...db.settings, ...req.body };
    writeDB(db);
    res.json({ success: true, settings: db.settings });
});

// ── Transactions Routes ───────────────────────────────────────────────────────
// GET  /api/transactions
app.get('/api/transactions', (req, res) => {
    const db = readDB();
    res.json(db.transactions);
});

// POST /api/transactions
app.post('/api/transactions', (req, res) => {
    const db = readDB();
    const txn = {
        id: Date.now(),
        date: new Date().toISOString(),
        ...req.body
    };
    db.transactions.unshift(txn);
    writeDB(db);
    res.status(201).json({ success: true, transaction: txn });
});

// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', (req, res) => {
    const db = readDB();
    const id = parseInt(req.params.id);
    const before = db.transactions.length;
    db.transactions = db.transactions.filter(t => t.id !== id);
    writeDB(db);
    if (db.transactions.length < before) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Transaction not found' });
    }
});

// ── Expenses Routes ───────────────────────────────────────────────────────────
// GET  /api/expenses
app.get('/api/expenses', (req, res) => {
    const db = readDB();
    res.json(db.expenses);
});

// POST /api/expenses
app.post('/api/expenses', (req, res) => {
    const db = readDB();
    const exp = {
        id: Date.now(),
        date: new Date().toISOString(),
        ...req.body
    };
    db.expenses.unshift(exp);
    writeDB(db);
    res.status(201).json({ success: true, expense: exp });
});

// DELETE /api/expenses/:id
app.delete('/api/expenses/:id', (req, res) => {
    const db = readDB();
    const id = parseInt(req.params.id);
    const before = db.expenses.length;
    db.expenses = db.expenses.filter(e => e.id !== id);
    writeDB(db);
    if (db.expenses.length < before) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Expense not found' });
    }
});

// ── Summary / Reports Route ───────────────────────────────────────────────────
// GET /api/summary
app.get('/api/summary', (req, res) => {
    const db = readDB();
    const txns = db.transactions;
    const expenses = db.expenses;

    const totalRevenue = txns.reduce((s, t) => s + (t.revenue || 0), 0);
    const totalCost = txns.reduce((s, t) => s + (t.cost || 0), 0);
    const totalProfit = txns.reduce((s, t) => s + (t.profit || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit = totalProfit - totalExpenses;
    const avgMargin = txns.length > 0
        ? txns.reduce((s, t) => s + (t.margin || 0), 0) / txns.length
        : 0;

    res.json({
        totalRevenue,
        totalCost,
        totalProfit,
        totalExpenses,
        netProfit,
        avgMargin,
        transactionCount: txns.length,
        expenseCount: expenses.length
    });
});

// ── Clear All Data Route ──────────────────────────────────────────────────────
// DELETE /api/all
app.delete('/api/all', (req, res) => {
    const db = readDB();
    db.transactions = [];
    db.expenses = [];
    writeDB(db);
    res.json({ success: true, message: 'All data cleared' });
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'YOUR-IP';
    for (const iface of Object.values(networkInterfaces)) {
        for (const config of iface) {
            if (config.family === 'IPv4' && !config.internal) {
                localIP = config.address;
                break;
            }
        }
    }

    console.log('\n ╔══════════════════════════════════════╗');
    console.log(' ║   FundTrucker Server is RUNNING! 🚀   ║');
    console.log(' ╚══════════════════════════════════════╝');
    console.log(`\n  Local Access:   http://localhost:${PORT}`);
    console.log(`  Phone Access:   http://${localIP}:${PORT}`);
    console.log('\n  Data saved to: db.json');
    console.log('  Connect phone/tablet to the same Wi-Fi.');
    console.log('  Press Ctrl+C to stop.\n');
});
