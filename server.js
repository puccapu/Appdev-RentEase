require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcrypt');
const session  = require('express-session');
const path     = require('path');

const app = express();

/*
    SECTION: Middleware
    Purpose: Configures Express to parse JSON request bodies, serve the static
    frontend from /public, and manage login sessions via cookies.
*/
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret:            process.env.SESSION_SECRET,
    resave:            false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3_600_000 },
}));

/*
    SECTION: Database Pool
    Purpose: Creates the shared MySQL connection pool used by every route
    in this file to read and write application data.
*/
const db = mysql.createPool({
    host:            process.env.DB_HOST,
    user:            process.env.DB_USER,
    password:        process.env.DB_PASS,
    database:        process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings:     true,
});

/*
    Name: requireAuth
    Purpose: Express middleware that blocks a request with 401 Unauthorized
    unless the session has a logged-in user.
    Used by: server.js (every protected route in this file)
    Found in: Line 46-51 in server.js
*/
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

/*
    Name: logActivity
    Purpose: Records an entry in the recent_activity table for the dashboard's
    activity feed; failures here are swallowed so logging never breaks a request.
    Used by: server.js (every ADD/EDIT/DELETE route in this file)
    Found in: Line 60-69 in server.js
*/
async function logActivity(req, actionType, entityType, entityId, description) {
    try {
        await db.execute(
            'INSERT INTO recent_activity (user_id, action_type, entity_type, entity_id, description, username) VALUES (?, ?, ?, ?, ?, ?)',
            [req.session.userId ?? null, actionType, entityType, entityId ?? null, description, req.session.username || 'Admin']
        );
    } catch (err) {
        console.error('Activity log error:', err);
    }
}

app.get('/api/recent-activity', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM recent_activity ORDER BY created_at DESC, activity_id DESC LIMIT 20'
        );
        res.json(rows);
    } catch (err) {
        console.error('Recent activity GET error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/*
    SECTION: Auth Routes
    Purpose: Handles admin login (PIN-based), profile read/update, and logout.
    These routes establish and tear down the session used by requireAuth.
*/
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
            req.session.userId   = user.user_id;
            req.session.username = user.username;
            return res.json({ success: true, user: user.first_name || user.username });
        }

        res.json({ success: false, message: 'Invalid username or PIN' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT first_name, last_name, email, phone, role FROM users WHERE user_id = ?',
            [req.session.userId]
        );
        res.json(rows[0] || {});
    } catch (err) {
        console.error('Profile GET error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/profile', requireAuth, async (req, res) => {
    const { firstName, lastName, email, phone } = req.body;
    try {
        await db.execute(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE user_id = ?',
            [firstName, lastName, email, phone, req.session.userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Profile POST error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

/*
    SECTION: Units (/api/units)
    Purpose: CRUD routes for apartment units. Every response is shaped by
    UNIT_SELECT so the API always returns the same unit fields to the client.
*/
const UNIT_SELECT = 'SELECT unit_id AS id, number, type, rent, status FROM units';

app.get('/api/units', requireAuth, async (req, res) => {
    const [rows] = await db.execute(`${UNIT_SELECT} ORDER BY number ASC`);
    res.json(rows);
});

app.post('/api/units', requireAuth, async (req, res) => {
    const { number, type, rent, status } = req.body;
    const [result] = await db.execute(
        'INSERT INTO units (number, type, rent, status) VALUES (?, ?, ?, ?)',
        [number, type, rent, status || 'Available']
    );
    const [rows] = await db.execute(`${UNIT_SELECT} WHERE unit_id = ?`, [result.insertId]);
    await logActivity(req, 'ADD', 'unit', result.insertId, `Added unit ${number}`);
    res.json(rows[0]);
});

app.put('/api/units/:id', requireAuth, async (req, res) => {
    const { number, type, rent, status } = req.body;
    await db.execute(
        'UPDATE units SET number = ?, type = ?, rent = ?, status = ? WHERE unit_id = ?',
        [number || null, type || null, rent || null, status || null, req.params.id]
    );
    const [rows] = await db.execute(`${UNIT_SELECT} WHERE unit_id = ?`, [req.params.id]);
    await logActivity(req, 'EDIT', 'unit', req.params.id, `Updated unit ${number || rows[0]?.number}`);
    res.json(rows[0]);
});

app.delete('/api/units/:id', requireAuth, async (req, res) => {
    const [existing] = await db.execute(`${UNIT_SELECT} WHERE unit_id = ?`, [req.params.id]);
    await db.execute('DELETE FROM units WHERE unit_id = ?', [req.params.id]);
    await logActivity(req, 'DELETE', 'unit', req.params.id, `Deleted unit ${existing[0]?.number || req.params.id}`);
    res.json({ success: true });
});

/*
    SECTION: Tenants (/api/tenants)
    Purpose: CRUD routes for tenants. Every response is shaped by
    TENANT_SELECT so the API always returns the same tenant fields to the client.
*/
const TENANT_SELECT = 'SELECT tenant_id AS id, name, email, phone, unit_id AS unitId, lease_status AS leaseStatus FROM tenants';

app.get('/api/tenants', requireAuth, async (req, res) => {
    const [rows] = await db.execute(`${TENANT_SELECT} ORDER BY name ASC`);
    res.json(rows);
});

app.post('/api/tenants', requireAuth, async (req, res) => {
    const { name, email, phone, unitId, leaseStatus } = req.body;
    const [result] = await db.execute(
        'INSERT INTO tenants (name, email, phone, unit_id, lease_status) VALUES (?, ?, ?, ?, ?)',
        [name, email, phone, unitId || null, leaseStatus || 'Pending']
    );
    const [rows] = await db.execute(`${TENANT_SELECT} WHERE tenant_id = ?`, [result.insertId]);
    await logActivity(req, 'ADD', 'tenant', result.insertId, `Registered tenant ${name}`);
    res.json(rows[0]);
});

app.put('/api/tenants/:id', requireAuth, async (req, res) => {
    const { name, email, phone, unitId, leaseStatus } = req.body;
    await db.execute(
        'UPDATE tenants SET name = ?, email = ?, phone = ?, unit_id = ?, lease_status = ? WHERE tenant_id = ?',
        [name || null, email || null, phone || null, unitId || null, leaseStatus || null, req.params.id]
    );
    const [rows] = await db.execute(`${TENANT_SELECT} WHERE tenant_id = ?`, [req.params.id]);
    await logActivity(req, 'EDIT', 'tenant', req.params.id, `Updated tenant ${name || rows[0]?.name}`);
    res.json(rows[0]);
});

app.delete('/api/tenants/:id', requireAuth, async (req, res) => {
    const [existing] = await db.execute('SELECT * FROM tenants WHERE tenant_id = ?', [req.params.id]);
    await db.execute('DELETE FROM tenants WHERE tenant_id = ?', [req.params.id]);
    await logActivity(req, 'DELETE', 'tenant', req.params.id, `Removed tenant ${existing[0]?.name || req.params.id}`);
    res.json({ success: true });
});

/*
    SECTION: Leases (/api/leases)
    Purpose: CRUD routes for lease contracts. LEASE_SELECT joins to tenants so
    the API returns the tenant's name under `tenant`, while the leases table
    itself stores a real tenant_id foreign key rather than a name string.
*/
const LEASE_SELECT = `
    SELECT leases.lease_id AS id, tenants.name AS tenant, leases.unit_id AS unitId,
           leases.start_date AS start, leases.end_date AS end, leases.rent AS rent
    FROM leases
    JOIN tenants ON leases.tenant_id = tenants.tenant_id
`;

app.get('/api/leases', requireAuth, async (req, res) => {
    const [rows] = await db.execute(`${LEASE_SELECT} ORDER BY leases.start_date DESC`);
    res.json(rows);
});

/*
    Name: syncTenantToUnit
    Purpose: Finds a tenant by name (creating one if it doesn't exist yet) and
    keeps that tenant's unit_id/lease_status in sync with the lease being saved.
    Used by: server.js (POST /api/leases and PUT /api/leases/:id)
    Found in: Line 255-264 in server.js
*/
async function syncTenantToUnit(conn, tenantName, unitId, leaseStatus) {
    const [existing] = await conn.execute('SELECT tenant_id FROM tenants WHERE name = ? LIMIT 1', [tenantName]);
    if (existing[0]) {
        await conn.execute('UPDATE tenants SET unit_id = ?, lease_status = ? WHERE tenant_id = ?', [unitId, leaseStatus, existing[0].tenant_id]);
        return existing[0].tenant_id;
    } else {
        const [result] = await conn.execute('INSERT INTO tenants (name, unit_id, lease_status) VALUES (?, ?, ?)', [tenantName, unitId, leaseStatus]);
        return result.insertId;
    }
}

app.post('/api/leases', requireAuth, async (req, res) => {
    const { tenant, unitId, start, end, rent } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [unitRows] = await conn.execute('SELECT * FROM units WHERE unit_id = ?', [unitId]);
        const unit = unitRows[0];
        if (!unit) {
            await conn.rollback();
            return res.status(404).json({ message: 'Unit not found.' });
        }

        const tenantId = await syncTenantToUnit(conn, tenant, unitId, 'Active');

        const [result] = await conn.execute(
            'INSERT INTO leases (tenant_id, unit_id, start_date, end_date, rent) VALUES (?, ?, ?, ?, ?)',
            [tenantId, unitId, start, end, rent]
        );

        await conn.execute('UPDATE units SET status = ? WHERE unit_id = ?', ['Occupied', unitId]);

        const today = new Date().toISOString().slice(0, 10);
        const paymentStatus = start < today ? 'Overdue' : 'Pending';
        await conn.execute(
            'INSERT INTO payments (tenant_id, unit_id, lease_id, payment_date, amount, status) VALUES (?, ?, ?, ?, ?, ?)',
            [tenantId, unitId, result.insertId, start, rent, paymentStatus]
        );

        await conn.commit();

        const [rows] = await db.execute(`${LEASE_SELECT} WHERE leases.lease_id = ?`, [result.insertId]);
        await logActivity(req, 'ADD', 'lease', result.insertId, `Created lease for ${tenant}`);
        res.json(rows[0]);
    } catch (err) {
        await conn.rollback();
        console.error('Lease creation error:', err);
        res.status(500).json({ message: 'Server error creating lease.' });
    } finally {
        conn.release();
    }
});

app.put('/api/leases/:id', requireAuth, async (req, res) => {
    const { tenant, unitId, start, end, rent } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [existingRows] = await conn.execute('SELECT * FROM leases WHERE lease_id = ?', [req.params.id]);
        const existing = existingRows[0];

        if (unitId) {
            const [unitRows] = await conn.execute('SELECT * FROM units WHERE unit_id = ?', [unitId]);
            if (!unitRows[0]) {
                await conn.rollback();
                return res.status(404).json({ message: 'Unit not found.' });
            }
        }

        let tenantId = existing ? existing.tenant_id : null;
        if (tenant) {
            const effectiveUnitId = unitId || (existing && existing.unit_id) || null;
            tenantId = await syncTenantToUnit(conn, tenant, effectiveUnitId, 'Active');
        }

        await conn.execute(
            'UPDATE leases SET tenant_id = ?, unit_id = ?, start_date = ?, end_date = ?, rent = ? WHERE lease_id = ?',
            [tenantId, unitId || null, start || null, end || null, rent || null, req.params.id]
        );

        if (existing && unitId && String(existing.unit_id) !== String(unitId)) {
            if (existing.unit_id) await conn.execute('UPDATE units SET status = ? WHERE unit_id = ?', ['Available', existing.unit_id]);
            await conn.execute('UPDATE units SET status = ? WHERE unit_id = ?', ['Occupied', unitId]);
        }

        await conn.commit();

        const [rows] = await db.execute(`${LEASE_SELECT} WHERE leases.lease_id = ?`, [req.params.id]);
        await logActivity(req, 'EDIT', 'lease', req.params.id, `Updated lease for ${tenant || rows[0]?.tenant}`);
        res.json(rows[0]);
    } catch (err) {
        await conn.rollback();
        console.error('Lease update error:', err);
        res.status(500).json({ message: 'Server error updating lease.' });
    } finally {
        conn.release();
    }
});

app.delete('/api/leases/:id', requireAuth, async (req, res) => {
    const [existing] = await db.execute(`${LEASE_SELECT} WHERE leases.lease_id = ?`, [req.params.id]);
    await db.execute('DELETE FROM leases WHERE lease_id = ?', [req.params.id]);
    if (existing[0]?.unitId) {
        await db.execute('UPDATE units SET status = ? WHERE unit_id = ?', ['Available', existing[0].unitId]);
    }
    await logActivity(req, 'DELETE', 'lease', req.params.id, `Deleted lease for ${existing[0]?.tenant || req.params.id}`);
    res.json({ success: true });
});

/*
    SECTION: Payments (/api/payments)
    Purpose: CRUD routes for rent payments. PAYMENT_SELECT joins back to
    tenants/units so the API returns tenant name and unit number, while
    payments itself stores real tenant_id / unit_id / lease_id foreign keys.
*/
const PAYMENT_SELECT = `
    SELECT payments.payment_id AS id, tenants.name AS tenant, units.number AS unit,
           payments.payment_date AS date, payments.amount AS amount, payments.status AS status
    FROM payments
    JOIN tenants ON payments.tenant_id = tenants.tenant_id
    JOIN units   ON payments.unit_id   = units.unit_id
`;

/*
    Name: resolveTenantId
    Purpose: Finds a tenant by name, creating a bare tenant record if none
    exists yet. Unlike syncTenantToUnit, this never touches unit_id/lease_status.
    Used by: server.js (POST /api/payments and PUT /api/payments/:id)
    Found in: Line 387-392 in server.js
*/
async function resolveTenantId(conn, tenantName) {
    const [existing] = await conn.execute('SELECT tenant_id FROM tenants WHERE name = ? LIMIT 1', [tenantName]);
    if (existing[0]) return existing[0].tenant_id;
    const [result] = await conn.execute('INSERT INTO tenants (name) VALUES (?)', [tenantName]);
    return result.insertId;
}

/*
    Name: findLeaseId
    Purpose: Best-effort match to the lease this payment is settling, so
    payments stay traceable to a specific contract when one exists.
    Used by: server.js (POST /api/payments and PUT /api/payments/:id)
    Found in: Line 401-407 in server.js
*/
async function findLeaseId(conn, tenantId, unitId) {
    const [rows] = await conn.execute(
        'SELECT lease_id FROM leases WHERE tenant_id = ? AND unit_id = ? ORDER BY start_date DESC LIMIT 1',
        [tenantId, unitId]
    );
    return rows[0] ? rows[0].lease_id : null;
}

app.get('/api/payments', requireAuth, async (req, res) => {
    await db.execute(
        "UPDATE payments SET status = 'Overdue' WHERE status = 'Pending' AND payment_date < CURDATE()"
    );
    const [rows] = await db.execute(`${PAYMENT_SELECT} ORDER BY payments.payment_date DESC`);
    res.json(rows);
});

app.post('/api/payments', requireAuth, async (req, res) => {
    const { tenant, unit, date, amount, status } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [unitRows] = await conn.execute('SELECT unit_id FROM units WHERE number = ? LIMIT 1', [unit]);
        if (!unitRows[0]) {
            await conn.rollback();
            return res.status(404).json({ message: 'Unit not found.' });
        }
        const unitId    = unitRows[0].unit_id;
        const tenantId  = await resolveTenantId(conn, tenant);
        const leaseId   = await findLeaseId(conn, tenantId, unitId);

        const [result] = await conn.execute(
            'INSERT INTO payments (tenant_id, unit_id, lease_id, payment_date, amount, status) VALUES (?, ?, ?, ?, ?, ?)',
            [tenantId, unitId, leaseId, date, amount, status || 'Pending']
        );

        await conn.commit();

        const [rows] = await db.execute(`${PAYMENT_SELECT} WHERE payments.payment_id = ?`, [result.insertId]);
        await logActivity(req, 'ADD', 'payment', result.insertId, `Recorded payment of ₱${Number(amount).toLocaleString()} for ${tenant}`);
        res.json(rows[0]);
    } catch (err) {
        await conn.rollback();
        console.error('Payment creation error:', err);
        res.status(500).json({ message: 'Server error creating payment.' });
    } finally {
        conn.release();
    }
});

app.put('/api/payments/:id', requireAuth, async (req, res) => {
    const { tenant, unit, date, amount, status } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [unitRows] = await conn.execute('SELECT unit_id FROM units WHERE number = ? LIMIT 1', [unit]);
        if (!unitRows[0]) {
            await conn.rollback();
            return res.status(404).json({ message: 'Unit not found.' });
        }
        const unitId   = unitRows[0].unit_id;
        const tenantId = await resolveTenantId(conn, tenant);
        const leaseId  = await findLeaseId(conn, tenantId, unitId);

        await conn.execute(
            'UPDATE payments SET tenant_id = ?, unit_id = ?, lease_id = ?, payment_date = ?, amount = ?, status = ? WHERE payment_id = ?',
            [tenantId, unitId, leaseId, date || null, amount || null, status || null, req.params.id]
        );

        await conn.commit();

        const [rows] = await db.execute(`${PAYMENT_SELECT} WHERE payments.payment_id = ?`, [req.params.id]);
        await logActivity(req, 'EDIT', 'payment', req.params.id, `Updated payment for ${tenant || rows[0]?.tenant}`);
        res.json(rows[0]);
    } catch (err) {
        await conn.rollback();
        console.error('Payment update error:', err);
        res.status(500).json({ message: 'Server error updating payment.' });
    } finally {
        conn.release();
    }
});

app.delete('/api/payments/:id', requireAuth, async (req, res) => {
    const [existing] = await db.execute(`${PAYMENT_SELECT} WHERE payments.payment_id = ?`, [req.params.id]);
    await db.execute('DELETE FROM payments WHERE payment_id = ?', [req.params.id]);
    await logActivity(req, 'DELETE', 'payment', req.params.id, `Deleted payment record for ${existing[0]?.tenant || req.params.id}`);
    res.json({ success: true });
});

/*
    SECTION: Employees (/api/employees)
    Purpose: CRUD routes for staff records. Every response is shaped by
    EMPLOYEE_SELECT so the API always returns the same employee fields.
*/
const EMPLOYEE_SELECT = 'SELECT employee_id AS id, name, email, phone, role FROM employees';

app.get('/api/employees', requireAuth, async (req, res) => {
    const [rows] = await db.execute(`${EMPLOYEE_SELECT} ORDER BY name ASC`);
    res.json(rows);
});

app.post('/api/employees', requireAuth, async (req, res) => {
    const { name, email, phone, role } = req.body;
    const [result] = await db.execute(
        'INSERT INTO employees (name, email, phone, role) VALUES (?, ?, ?, ?)',
        [name, email, phone, role || 'Staff']
    );
    const [rows] = await db.execute(`${EMPLOYEE_SELECT} WHERE employee_id = ?`, [result.insertId]);
    await logActivity(req, 'ADD', 'employee', result.insertId, `Added employee ${name}`);
    res.json(rows[0]);
});

app.put('/api/employees/:id', requireAuth, async (req, res) => {
    const { name, email, phone, role } = req.body;
    await db.execute(
        'UPDATE employees SET name = ?, email = ?, phone = ?, role = ? WHERE employee_id = ?',
        [name || null, email || null, phone || null, role || null, req.params.id]
    );
    const [rows] = await db.execute(`${EMPLOYEE_SELECT} WHERE employee_id = ?`, [req.params.id]);
    await logActivity(req, 'EDIT', 'employee', req.params.id, `Updated employee ${name || rows[0]?.name}`);
    res.json(rows[0]);
});

app.delete('/api/employees/:id', requireAuth, async (req, res) => {
    const [existing] = await db.execute(`${EMPLOYEE_SELECT} WHERE employee_id = ?`, [req.params.id]);
    await db.execute('DELETE FROM employees WHERE employee_id = ?', [req.params.id]);
    await logActivity(req, 'DELETE', 'employee', req.params.id, `Removed employee ${existing[0]?.name || req.params.id}`);
    res.json({ success: true });
});

/*
    SECTION: Start
    Purpose: Boots the HTTP server on the configured port.
*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`RentEase running on http://localhost:${PORT}`);
    console.log(`DB: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
});