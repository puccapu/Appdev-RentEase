require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcrypt');
const session  = require('express-session');
const path     = require('path');

const app = express();

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret:            process.env.SESSION_SECRET,
    resave:            false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3_600_000 }, // 1 hour
}));

// ============================================================
//  DATABASE POOL
// ============================================================
const db = mysql.createPool({
    host:            process.env.DB_HOST,
    user:            process.env.DB_USER,
    password:        process.env.DB_PASS,
    database:        process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
});

// ============================================================
//  AUTH MIDDLEWARE
// ============================================================
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ============================================================
//  AUTH ROUTES
// ============================================================

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { username, pin } = req.body;

    if (!username || !pin) {
        return res.json({ success: false, message: 'Missing credentials' });
    }

    try {
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE username = ? LIMIT 1',
            [username]
        );
        const user = rows[0];

        if (user && await bcrypt.compare(pin, user.pin_hash)) {
            req.session.userId   = user.id;
            req.session.username = user.username;
            return res.json({ success: true, user: user.first_name || user.username });
        }

        res.json({ success: false, message: 'Invalid username or PIN' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/profile
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT first_name, last_name, email, phone, role FROM users WHERE id = ?',
            [req.session.userId]
        );
        res.json(rows[0] || {});
    } catch (err) {
        console.error('Profile GET error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/profile
app.post('/api/profile', requireAuth, async (req, res) => {
    const { firstName, lastName, email, phone } = req.body;
    try {
        await db.execute(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?',
            [firstName, lastName, email, phone, req.session.userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Profile POST error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// ============================================================
//  UNITS  /api/units
// ============================================================
app.get('/api/units', requireAuth, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM units ORDER BY number ASC');
    res.json(rows);
});

app.post('/api/units', requireAuth, async (req, res) => {
    const { number, type, rent, status } = req.body;
    const [result] = await db.execute(
        'INSERT INTO units (number, type, rent, status) VALUES (?, ?, ?, ?)',
        [number, type, rent, status || 'Available']
    );
    const [rows] = await db.execute('SELECT * FROM units WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
});

app.put('/api/units/:id', requireAuth, async (req, res) => {
    const { number, type, rent, status } = req.body;
    await db.execute(
        'UPDATE units SET number = ?, type = ?, rent = ?, status = ? WHERE id = ?',
        [number, type, rent, status, req.params.id]
    );
    const [rows] = await db.execute('SELECT * FROM units WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
});

app.delete('/api/units/:id', requireAuth, async (req, res) => {
    await db.execute('DELETE FROM units WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============================================================
//  TENANTS  /api/tenants
// ============================================================
app.get('/api/tenants', requireAuth, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM tenants ORDER BY name ASC');
    res.json(rows);
});

app.post('/api/tenants', requireAuth, async (req, res) => {
    const { name, email, phone, unitId, leaseStatus } = req.body;
    const [result] = await db.execute(
        'INSERT INTO tenants (name, email, phone, unit_id, lease_status) VALUES (?, ?, ?, ?, ?)',
        [name, email, phone, unitId || null, leaseStatus || 'Pending']
    );
    const [rows] = await db.execute('SELECT * FROM tenants WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
});

app.put('/api/tenants/:id', requireAuth, async (req, res) => {
    const { name, email, phone, unitId, leaseStatus } = req.body;
    await db.execute(
        'UPDATE tenants SET name = ?, email = ?, phone = ?, unit_id = ?, lease_status = ? WHERE id = ?',
        [name, email, phone, unitId || null, leaseStatus, req.params.id]
    );
    const [rows] = await db.execute('SELECT * FROM tenants WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
});

app.delete('/api/tenants/:id', requireAuth, async (req, res) => {
    await db.execute('DELETE FROM tenants WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============================================================
//  LEASES  /api/leases
// ============================================================
app.get('/api/leases', requireAuth, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM leases ORDER BY start_date DESC');
    res.json(rows);
});

app.post('/api/leases', requireAuth, async (req, res) => {
    const { tenant, unitId, start, end, rent } = req.body;
    const [result] = await db.execute(
        'INSERT INTO leases (tenant, unit_id, start_date, end_date, rent) VALUES (?, ?, ?, ?, ?)',
        [tenant, unitId, start, end, rent]
    );
    const [rows] = await db.execute('SELECT * FROM leases WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
});

app.put('/api/leases/:id', requireAuth, async (req, res) => {
    const { tenant, unitId, start, end, rent } = req.body;
    await db.execute(
        'UPDATE leases SET tenant = ?, unit_id = ?, start_date = ?, end_date = ?, rent = ? WHERE id = ?',
        [tenant, unitId, start, end, rent, req.params.id]
    );
    const [rows] = await db.execute('SELECT * FROM leases WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
});

app.delete('/api/leases/:id', requireAuth, async (req, res) => {
    await db.execute('DELETE FROM leases WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============================================================
//  PAYMENTS  /api/payments
// ============================================================
app.get('/api/payments', requireAuth, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM payments ORDER BY payment_date DESC');
    res.json(rows);
});

app.post('/api/payments', requireAuth, async (req, res) => {
    const { tenant, unit, date, amount, status } = req.body;
    const [result] = await db.execute(
        'INSERT INTO payments (tenant, unit, payment_date, amount, status) VALUES (?, ?, ?, ?, ?)',
        [tenant, unit, date, amount, status || 'Pending']
    );
    const [rows] = await db.execute('SELECT * FROM payments WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
});

app.put('/api/payments/:id', requireAuth, async (req, res) => {
    const { tenant, unit, date, amount, status } = req.body;
    await db.execute(
        'UPDATE payments SET tenant = ?, unit = ?, payment_date = ?, amount = ?, status = ? WHERE id = ?',
        [tenant, unit, date, amount, status, req.params.id]
    );
    const [rows] = await db.execute('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
});

app.delete('/api/payments/:id', requireAuth, async (req, res) => {
    await db.execute('DELETE FROM payments WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============================================================
//  EMPLOYEES  /api/employees
// ============================================================
app.get('/api/employees', requireAuth, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM employees ORDER BY name ASC');
    res.json(rows);
});

app.post('/api/employees', requireAuth, async (req, res) => {
    const { name, email, phone, role } = req.body;
    const [result] = await db.execute(
        'INSERT INTO employees (name, email, phone, role) VALUES (?, ?, ?, ?)',
        [name, email, phone, role || 'Staff']
    );
    const [rows] = await db.execute('SELECT * FROM employees WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
});

app.put('/api/employees/:id', requireAuth, async (req, res) => {
    const { name, email, phone, role } = req.body;
    await db.execute(
        'UPDATE employees SET name = ?, email = ?, phone = ?, role = ? WHERE id = ?',
        [name, email, phone, role, req.params.id]
    );
    const [rows] = await db.execute('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
});

app.delete('/api/employees/:id', requireAuth, async (req, res) => {
    await db.execute('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============================================================
//  START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`RentEase running on http://localhost:${PORT}`);
    console.log(`DB: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
});