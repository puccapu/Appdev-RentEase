require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcrypt');
const session  = require('express-session');
const path     = require('path');

const app = express();

/*
    Name: isValidPhone
    Purpose: Validates a phone number string. Empty/undefined is allowed since
    phone is optional everywhere it's collected; if a value is given, it must
    contain exactly 11 digits once formatting characters are stripped.
    Used by: server.js (POST/PUT /api/profile, /api/tenants, /api/employees)
    Found in: Line 8-12 in server.js
*/
function isValidPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length === 0 || digits.length === 11;
}

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
    Name: ensureColumn
    Purpose: Adds a column to a table if it doesn't already exist, so
    databases created before the Archive Mode feature was added get
    migrated automatically instead of requiring a manual ALTER TABLE.
    Used by: server.js (runMigrations, at startup)
    Found in: Line 53-63 in server.js
*/
async function ensureColumn(table, column, definition) {
    const [rows] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    if (rows[0].cnt === 0) {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`✔ Migrated: added ${table}.${column}`);
    }
}

/*
    Name: ensureColumnDropped
    Purpose: Drops a column from a table if it still exists, so databases
    created before a field was removed from the app get migrated
    automatically instead of requiring a manual ALTER TABLE.
    Used by: server.js (runMigrations, at startup)
*/
async function ensureColumnDropped(table, column) {
    const [rows] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    if (rows[0].cnt > 0) {
        await db.execute(`ALTER TABLE ${table} DROP COLUMN ${column}`);
        console.log(`✔ Migrated: dropped ${table}.${column}`);
    }
}

/*
    Name: runMigrations
    Purpose: Ensures the `archived` flag used by Archive Mode exists on
    tenants, leases, and payments before the server starts accepting requests.
    Also drops fields that have since been removed from the app (e.g. the
    employees.role column, deemed unnecessary).
    Used by: server.js (startup, before app.listen)
    Found in: Line 65-71 in server.js
*/
async function runMigrations() {
    await ensureColumn('tenants',  'archived', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('leases',   'archived', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('payments', 'archived', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumnDropped('employees', 'role');
}

/*
    Name: getPagination
    Purpose: Reads ?page=&limit= from the request and returns clamped,
    validated integers, or null if the caller didn't ask for a paginated
    response (so existing full-list callers are unaffected). Used to build
    a `LIMIT x OFFSET y` clause; the values are validated integers so they
    can be safely inlined into the SQL string (mysql2 does not reliably
    support placeholders in LIMIT/OFFSET position).
    Used by: server.js (GET /api/units, /api/tenants, /api/leases, /api/payments, /api/employees)
*/
function getPagination(req) {
    if (!req.query.page) return null;
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

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
    Name: GET /api/stats
    Purpose: Returns the handful of aggregate numbers the Dashboard and
    Reports pages need (unit occupancy, active/pending tenant counts, rent
    roll, revenue, overdue totals, leases ending soon), computed directly in
    SQL. This lets those pages avoid loading the full units/tenants/leases/
    payments/employees lists just to derive a few numbers from them.
*/
app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const [[row]] = await db.execute(`
            SELECT
                (SELECT COUNT(*) FROM units) AS totalUnits,
                (SELECT COUNT(*) FROM units WHERE status = 'Available') AS availableUnits,
                (SELECT COUNT(*) FROM units WHERE status = 'Occupied') AS occupiedUnits,
                (SELECT COUNT(*) FROM tenants
                    WHERE archived = 0 AND EXISTS (
                        SELECT 1 FROM leases WHERE leases.tenant_id = tenants.tenant_id AND leases.archived = 0
                            AND CURDATE() BETWEEN leases.start_date AND leases.end_date
                    )) AS activeTenants,
                (SELECT COUNT(*) FROM tenants
                    WHERE archived = 0 AND NOT EXISTS (
                        SELECT 1 FROM leases WHERE leases.tenant_id = tenants.tenant_id AND leases.archived = 0
                    )) AS pendingTenants,
                (SELECT COUNT(*) FROM employees) AS totalEmployees,
                (SELECT COALESCE(SUM(rent), 0) FROM leases WHERE archived = 0) AS totalRent,
                (SELECT COUNT(*) FROM payments WHERE archived = 0 AND status = 'Overdue') AS overdueCount,
                (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE archived = 0) AS totalRevenue,
                (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE archived = 0 AND status = 'Overdue') AS overdueTotal,
                (SELECT COUNT(*) FROM leases
                    WHERE archived = 0 AND DATEDIFF(end_date, CURDATE()) BETWEEN 1 AND 30) AS expiringLeases
        `);
        res.json(row);
    } catch (err) {
        console.error('Stats GET error:', err);
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
    if (!isValidPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Phone number must be exactly 11 digits.' });
    }
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
    tenantName is resolved server-side (the name of whoever currently has an
    active, non-archived lease on the unit) so the client's Units table
    doesn't need the full leases list just to show who's renting each unit.
*/
const UNIT_SELECT = `
    SELECT units.unit_id AS id, units.number, units.type, units.rent, units.status,
        (SELECT tenants.name FROM leases
         JOIN tenants ON leases.tenant_id = tenants.tenant_id
         WHERE leases.unit_id = units.unit_id AND leases.archived = 0
           AND CURDATE() BETWEEN leases.start_date AND leases.end_date
         ORDER BY leases.start_date DESC LIMIT 1) AS tenantName
    FROM units
`;

app.get('/api/units', requireAuth, async (req, res) => {
    const pg = getPagination(req);
    if (!pg) {
        const [rows] = await db.execute(`${UNIT_SELECT} ORDER BY number ASC`);
        return res.json(rows);
    }
    // Fetch one extra row beyond the page size to know whether a next page exists.
    const [rows] = await db.execute(
        `${UNIT_SELECT} ORDER BY number ASC LIMIT ${pg.limit + 1} OFFSET ${pg.offset}`
    );
    const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM units');
    res.json({ rows: rows.slice(0, pg.limit), hasMore: rows.length > pg.limit, page: pg.page, total });
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
    TENANT_SELECT so the API always returns the same tenant fields to the
    client. leaseStatus and unitNumbers are computed live from the leases
    table (Active/Expired/Pending, and any currently-active unit numbers)
    rather than trusting the stored lease_status/unit_id columns, which can
    go stale as leases are created, renewed, or expire. This mirrors what
    the dashboard used to compute client-side from the full leases list.
*/
const TENANT_SELECT = `
    SELECT tenants.tenant_id AS id, tenants.name, tenants.email, tenants.phone,
        tenants.unit_id AS unitId, tenants.archived,
        (SELECT GROUP_CONCAT(units.number ORDER BY units.number SEPARATOR ', ')
         FROM leases JOIN units ON leases.unit_id = units.unit_id
         WHERE leases.tenant_id = tenants.tenant_id AND leases.archived = 0
           AND CURDATE() BETWEEN leases.start_date AND leases.end_date) AS unitNumbers,
        (CASE
            WHEN EXISTS (
                SELECT 1 FROM leases WHERE leases.tenant_id = tenants.tenant_id AND leases.archived = 0
                    AND CURDATE() BETWEEN leases.start_date AND leases.end_date
            ) THEN 'Active'
            WHEN EXISTS (
                SELECT 1 FROM leases WHERE leases.tenant_id = tenants.tenant_id AND leases.archived = 0
            ) THEN 'Expired'
            ELSE 'Pending'
         END) AS leaseStatus
    FROM tenants
`;

/*
    Name: GET /api/tenants
    Purpose: Lists tenants. By default only non-archived tenants are
    returned; pass ?archived=true (Archive Mode) to list every tenant,
    including ones that have been archived via the delete button.
*/
app.get('/api/tenants', requireAuth, async (req, res) => {
    const includeArchived = req.query.archived === 'true';
    const where = includeArchived ? '' : 'WHERE archived = 0';
    const pg = getPagination(req);
    if (!pg) {
        const [rows] = await db.execute(`${TENANT_SELECT} ${where} ORDER BY name ASC`);
        return res.json(rows);
    }
    const [rows] = await db.execute(
        `${TENANT_SELECT} ${where} ORDER BY name ASC LIMIT ${pg.limit + 1} OFFSET ${pg.offset}`
    );
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM tenants ${where}`);
    let archivedCount = null;
    if (includeArchived) {
        const [[row]] = await db.execute('SELECT COUNT(*) AS n FROM tenants WHERE archived = 1');
        archivedCount = row.n;
    }
    res.json({ rows: rows.slice(0, pg.limit), hasMore: rows.length > pg.limit, page: pg.page, total, archivedCount });
});

/*
    Name: GET /api/tenants/search
    Purpose: Lightweight name-prefix/substring search used to power the
    tenant-name autocomplete in the Lease and Payment forms, so the client
    doesn't need to keep the full tenant list in memory just for typeahead.
    Non-archived tenants only; capped at 8 results.
*/
app.get('/api/tenants/search', requireAuth, async (req, res) => {
    const q = `%${(req.query.q || '').trim()}%`;
    const [rows] = await db.execute(
        `${TENANT_SELECT} WHERE archived = 0 AND name LIKE ? ORDER BY name ASC LIMIT 8`,
        [q]
    );
    res.json(rows);
});

app.post('/api/tenants', requireAuth, async (req, res) => {
    const { name, email, phone, unitId, leaseStatus } = req.body;
    if (!isValidPhone(phone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 11 digits.' });
    }
    const [result] = await db.execute(
        'INSERT INTO tenants (name, email, phone, unit_id, lease_status) VALUES (?, ?, ?, ?, ?)',
        [name, email, phone, unitId || null, leaseStatus || 'Pending']
    );
    const [rows] = await db.execute(`${TENANT_SELECT} WHERE tenant_id = ?`, [result.insertId]);
    await logActivity(req, 'ADD', 'tenant', result.insertId, `Registered tenant ${name}`);
    res.json(rows[0]);
});

app.put('/api/tenants/:id', requireAuth, async (req, res) => {
    const { name, email, phone } = req.body;
    if (!isValidPhone(phone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 11 digits.' });
    }
    // Assigned Unit and Lease Status can only be set during registration; they're
    // managed automatically afterward through the Leases tab, so edits always keep
    // the tenant's existing values regardless of what the request body sends.
    const [existing] = await db.execute('SELECT unit_id, lease_status FROM tenants WHERE tenant_id = ?', [req.params.id]);
    const unitId      = existing[0]?.unit_id ?? null;
    const leaseStatus = existing[0]?.lease_status ?? null;
    await db.execute(
        'UPDATE tenants SET name = ?, email = ?, phone = ?, unit_id = ?, lease_status = ? WHERE tenant_id = ?',
        [name || null, email || null, phone || null, unitId, leaseStatus, req.params.id]
    );
    const [rows] = await db.execute(`${TENANT_SELECT} WHERE tenant_id = ?`, [req.params.id]);
    await logActivity(req, 'EDIT', 'tenant', req.params.id, `Updated tenant ${name || rows[0]?.name}`);
    res.json(rows[0]);
});

app.delete('/api/tenants/:id', requireAuth, async (req, res) => {
    const [existing] = await db.execute('SELECT * FROM tenants WHERE tenant_id = ?', [req.params.id]);
    await db.execute('UPDATE tenants SET archived = 1 WHERE tenant_id = ?', [req.params.id]);
    await logActivity(req, 'DELETE', 'tenant', req.params.id, `Archived tenant ${existing[0]?.name || req.params.id}`);
    res.json({ success: true });
});

app.put('/api/tenants/:id/restore', requireAuth, async (req, res) => {
    await db.execute('UPDATE tenants SET archived = 0 WHERE tenant_id = ?', [req.params.id]);
    const [rows] = await db.execute(`${TENANT_SELECT} WHERE tenant_id = ?`, [req.params.id]);
    await logActivity(req, 'EDIT', 'tenant', req.params.id, `Restored tenant ${rows[0]?.name || req.params.id}`);
    res.json(rows[0]);
});

/*
    SECTION: Leases (/api/leases)
    Purpose: CRUD routes for lease contracts. LEASE_SELECT joins to tenants so
    the API returns the tenant's name under `tenant`, while the leases table
    itself stores a real tenant_id foreign key rather than a name string. It
    also left-joins units so the unit's display number travels with each
    lease row, instead of requiring the client to look it up in a separate
    full units list.
*/
const LEASE_SELECT = `
    SELECT leases.lease_id AS id, tenants.name AS tenant, leases.unit_id AS unitId,
           units.number AS unitNumber,
           leases.start_date AS start, leases.end_date AS end, leases.rent AS rent,
           leases.archived AS archived
    FROM leases
    JOIN tenants ON leases.tenant_id = tenants.tenant_id
    LEFT JOIN units ON leases.unit_id = units.unit_id
`;

/*
    Name: GET /api/leases
    Purpose: Lists leases. By default only non-archived leases are
    returned; pass ?archived=true (Archive Mode) to list every lease,
    including ones that have been archived via the delete button.
    Optional filters (used for lightweight on-demand checks rather than the
    main Leases table): ?unitId= or ?tenantId= narrow to that unit/tenant,
    and ?activeOnly=true additionally restricts to leases covering today —
    e.g. GET /api/leases?unitId=5&activeOnly=true&limit=1 is how the client
    checks "does this unit have an active lease?" before allowing a delete,
    without needing the full leases list in memory.
*/
app.get('/api/leases', requireAuth, async (req, res) => {
    const conditions = [req.query.archived === 'true' ? null : 'leases.archived = 0'];
    if (req.query.unitId)   conditions.push(`leases.unit_id = ${parseInt(req.query.unitId, 10) || 0}`);
    if (req.query.tenantId) conditions.push(`leases.tenant_id = ${parseInt(req.query.tenantId, 10) || 0}`);
    if (req.query.activeOnly === 'true') conditions.push('CURDATE() BETWEEN leases.start_date AND leases.end_date');
    const where = conditions.filter(Boolean).length ? `WHERE ${conditions.filter(Boolean).join(' AND ')}` : '';

    const pg = getPagination(req);
    if (!pg) {
        const [rows] = await db.execute(`${LEASE_SELECT} ${where} ORDER BY leases.start_date DESC`);
        return res.json(rows);
    }
    const [rows] = await db.execute(
        `${LEASE_SELECT} ${where} ORDER BY leases.start_date DESC LIMIT ${pg.limit + 1} OFFSET ${pg.offset}`
    );
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM leases ${where}`);
    const activeWhere = where ? `${where} AND leases.end_date >= CURDATE()` : 'WHERE leases.end_date >= CURDATE()';
    const [[{ activeCount }]] = await db.execute(`SELECT COUNT(*) AS activeCount FROM leases ${activeWhere}`);
    res.json({ rows: rows.slice(0, pg.limit), hasMore: rows.length > pg.limit, page: pg.page, total, activeCount });
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
        // Reassigning an existing tenant to a lease means they're active again,
        // so un-archive them even if they'd previously been archived.
        await conn.execute('UPDATE tenants SET unit_id = ?, lease_status = ?, archived = 0 WHERE tenant_id = ?', [unitId, leaseStatus, existing[0].tenant_id]);
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
    await db.execute('UPDATE leases SET archived = 1 WHERE lease_id = ?', [req.params.id]);
    if (existing[0]?.unitId) {
        await db.execute('UPDATE units SET status = ? WHERE unit_id = ?', ['Available', existing[0].unitId]);
    }
    await logActivity(req, 'DELETE', 'lease', req.params.id, `Archived lease for ${existing[0]?.tenant || req.params.id}`);
    res.json({ success: true });
});

app.put('/api/leases/:id/restore', requireAuth, async (req, res) => {
    await db.execute('UPDATE leases SET archived = 0 WHERE lease_id = ?', [req.params.id]);
    const [rows] = await db.execute(`${LEASE_SELECT} WHERE leases.lease_id = ?`, [req.params.id]);
    await logActivity(req, 'EDIT', 'lease', req.params.id, `Restored lease for ${rows[0]?.tenant || req.params.id}`);
    res.json(rows[0]);
});

/*
    SECTION: Payments (/api/payments)
    Purpose: CRUD routes for rent payments. PAYMENT_SELECT joins back to
    tenants/units so the API returns tenant name and unit number, while
    payments itself stores real tenant_id / unit_id / lease_id foreign keys.
*/
const PAYMENT_SELECT = `
    SELECT payments.payment_id AS id, tenants.name AS tenant, units.number AS unit,
           payments.payment_date AS date, payments.amount AS amount, payments.status AS status,
           payments.archived AS archived
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
    if (existing[0]) {
        // A new payment for this name means the tenant is active again,
        // so un-archive them even if they'd previously been archived.
        await conn.execute('UPDATE tenants SET archived = 0 WHERE tenant_id = ?', [existing[0].tenant_id]);
        return existing[0].tenant_id;
    }
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
    const where = req.query.archived === 'true' ? '' : 'WHERE payments.archived = 0';
    const pg = getPagination(req);
    if (!pg) {
        const [rows] = await db.execute(`${PAYMENT_SELECT} ${where} ORDER BY payments.payment_date DESC`);
        return res.json(rows);
    }
    const [rows] = await db.execute(
        `${PAYMENT_SELECT} ${where} ORDER BY payments.payment_date DESC LIMIT ${pg.limit + 1} OFFSET ${pg.offset}`
    );
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM payments ${where}`);
    res.json({ rows: rows.slice(0, pg.limit), hasMore: rows.length > pg.limit, page: pg.page, total });
});

/*
    Name: GET /api/payments/upcoming
    Purpose: Returns just the Pending payments due within the next 3 days —
    the small set the dashboard's Inbox bell needs — computed directly in
    SQL instead of requiring the full payments list in memory.
*/
app.get('/api/payments/upcoming', requireAuth, async (req, res) => {
    const [rows] = await db.execute(
        `${PAYMENT_SELECT} WHERE payments.archived = 0 AND payments.status = 'Pending'
           AND payments.payment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
         ORDER BY payments.payment_date ASC`
    );
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
    await db.execute('UPDATE payments SET archived = 1 WHERE payment_id = ?', [req.params.id]);
    await logActivity(req, 'DELETE', 'payment', req.params.id, `Archived payment record for ${existing[0]?.tenant || req.params.id}`);
    res.json({ success: true });
});

app.put('/api/payments/:id/restore', requireAuth, async (req, res) => {
    await db.execute('UPDATE payments SET archived = 0 WHERE payment_id = ?', [req.params.id]);
    const [rows] = await db.execute(`${PAYMENT_SELECT} WHERE payments.payment_id = ?`, [req.params.id]);
    await logActivity(req, 'EDIT', 'payment', req.params.id, `Restored payment record for ${rows[0]?.tenant || req.params.id}`);
    res.json(rows[0]);
});

/*
    SECTION: Employees (/api/employees)
    Purpose: CRUD routes for staff records. Every response is shaped by
    EMPLOYEE_SELECT so the API always returns the same employee fields.
*/
const EMPLOYEE_SELECT = 'SELECT employee_id AS id, name, email, phone FROM employees';

app.get('/api/employees', requireAuth, async (req, res) => {
    const pg = getPagination(req);
    if (!pg) {
        const [rows] = await db.execute(`${EMPLOYEE_SELECT} ORDER BY name ASC`);
        return res.json(rows);
    }
    const [rows] = await db.execute(
        `${EMPLOYEE_SELECT} ORDER BY name ASC LIMIT ${pg.limit + 1} OFFSET ${pg.offset}`
    );
    const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM employees');
    res.json({ rows: rows.slice(0, pg.limit), hasMore: rows.length > pg.limit, page: pg.page, total });
});

app.post('/api/employees', requireAuth, async (req, res) => {
    const { name, email, phone } = req.body;
    if (!isValidPhone(phone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 11 digits.' });
    }
    const [result] = await db.execute(
        'INSERT INTO employees (name, email, phone) VALUES (?, ?, ?)',
        [name, email, phone]
    );
    const [rows] = await db.execute(`${EMPLOYEE_SELECT} WHERE employee_id = ?`, [result.insertId]);
    await logActivity(req, 'ADD', 'employee', result.insertId, `Added employee ${name}`);
    res.json(rows[0]);
});

app.put('/api/employees/:id', requireAuth, async (req, res) => {
    const { name, email, phone } = req.body;
    if (!isValidPhone(phone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 11 digits.' });
    }
    await db.execute(
        'UPDATE employees SET name = ?, email = ?, phone = ? WHERE employee_id = ?',
        [name || null, email || null, phone || null, req.params.id]
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
runMigrations()
    .catch(err => console.error('Migration error:', err))
    .finally(() => {
        app.listen(PORT, () => {
            console.log(`RentEase running on http://localhost:${PORT}`);
            console.log(`DB: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
        });
    });