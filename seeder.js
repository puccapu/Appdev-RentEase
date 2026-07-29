require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcrypt');

/*
    Name: seed
    Purpose: Creates all database tables if missing and populates them with
    demo data (admin user, units, tenants, leases, payments, employees) so a
    fresh install of RentEase has something to look at immediately.
    Found in: Line 12-316 in seeder.js
*/
async function seed() {
    const db = await mysql.createConnection({
        host:     process.env.DB_HOST,
        user:     process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });

    console.log('Connected to database...');

    /*
        SECTION: Tables
        Purpose: Creates all application tables if they don't already exist, so
        re-running the seeder is always safe. Mirrors the annotated schema in
        database/schema.sql, including the foreign-key relationships between
        users, units, tenants, leases, and payments.
    */
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            user_id    INT AUTO_INCREMENT PRIMARY KEY,
            username   VARCHAR(50)  UNIQUE NOT NULL,
            pin_hash   VARCHAR(255) NOT NULL,
            first_name VARCHAR(50)  DEFAULT '',
            last_name  VARCHAR(50)  DEFAULT '',
            email      VARCHAR(100) DEFAULT '',
            phone      VARCHAR(30)  DEFAULT '',
            role       VARCHAR(30)  DEFAULT 'Admin',
            created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
    `);
    console.log('✔ Table: users');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS units (
            unit_id INT AUTO_INCREMENT PRIMARY KEY,
            number  VARCHAR(20)   NOT NULL UNIQUE,
            type    VARCHAR(50)   NOT NULL,
            rent    DECIMAL(10,2) NOT NULL DEFAULT 0,
            status  VARCHAR(30)   NOT NULL DEFAULT 'Available'
        ) ENGINE=InnoDB
    `);
    console.log('✔ Table: units');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS employees (
            employee_id INT AUTO_INCREMENT PRIMARY KEY,
            name        VARCHAR(100) NOT NULL,
            email       VARCHAR(100) DEFAULT '',
            phone       VARCHAR(30)  DEFAULT ''
        ) ENGINE=InnoDB
    `);
    console.log('✔ Table: employees');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS tenants (
            tenant_id    INT AUTO_INCREMENT PRIMARY KEY,
            name         VARCHAR(100) NOT NULL,
            email        VARCHAR(100) DEFAULT '',
            phone        VARCHAR(30)  DEFAULT '',
            unit_id      INT          DEFAULT NULL,
            lease_status VARCHAR(30)  DEFAULT 'Pending',
            archived     TINYINT(1)   NOT NULL DEFAULT 0,
            CONSTRAINT fk_tenants_unit
                FOREIGN KEY (unit_id) REFERENCES units (unit_id)
                ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB
    `);
    console.log('✔ Table: tenants');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS leases (
            lease_id   INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id  INT           NOT NULL,
            unit_id    INT           DEFAULT NULL,
            start_date DATE          NOT NULL,
            end_date   DATE          NOT NULL,
            rent       DECIMAL(10,2) NOT NULL DEFAULT 0,
            archived   TINYINT(1)    NOT NULL DEFAULT 0,
            CONSTRAINT fk_leases_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT fk_leases_unit
                FOREIGN KEY (unit_id) REFERENCES units (unit_id)
                ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB
    `);
    console.log('✔ Table: leases');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS payments (
            payment_id   INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id    INT           NOT NULL,
            unit_id      INT           NOT NULL,
            lease_id     INT           DEFAULT NULL,
            payment_date DATE          NOT NULL,
            amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
            status       VARCHAR(30)   NOT NULL DEFAULT 'Pending',
            archived     TINYINT(1)    NOT NULL DEFAULT 0,
            CONSTRAINT fk_payments_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT fk_payments_unit
                FOREIGN KEY (unit_id) REFERENCES units (unit_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT fk_payments_lease
                FOREIGN KEY (lease_id) REFERENCES leases (lease_id)
                ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB
    `);
    console.log('✔ Table: payments');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS recent_activity (
            activity_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT          DEFAULT NULL,
            action_type VARCHAR(20)  NOT NULL,
            entity_type VARCHAR(30)  NOT NULL,
            entity_id   INT          DEFAULT NULL,
            description VARCHAR(255) NOT NULL,
            username    VARCHAR(50)  DEFAULT 'Admin',
            created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_activity_user
                FOREIGN KEY (user_id) REFERENCES users (user_id)
                ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB
    `);
    console.log('✔ Table: recent_activity');

    /*
        SECTION: Seed - Admin User
        Purpose: Ensures a default admin login (username: admin, PIN: 2121)
        always exists, without duplicating it on repeat runs.
    */
    const pin_hash = await bcrypt.hash('2121', 10);
    await db.execute(`
        INSERT INTO users (username, pin_hash, first_name, role)
        VALUES (?, ?, 'Admin', 'Admin')
        ON DUPLICATE KEY UPDATE username = username
    `, ['admin', pin_hash]);
    console.log('✔ Admin user seeded  →  username: admin  |  PIN: 2121');

    /*
        SECTION: Seed - Manager User
        Purpose: Ensures a default limited-access login (username: manager,
        PIN: 6767) always exists. This account's dashboard is restricted on
        the frontend to editing only Payments and Employees; every other
        section is view-only (see dashboard.js applyRolePermissions()).
    */
    const manager_pin_hash = await bcrypt.hash('6767', 10);
    await db.execute(`
        INSERT INTO users (username, pin_hash, first_name, role)
        VALUES (?, ?, 'Manager', 'Manager')
        ON DUPLICATE KEY UPDATE username = username
    `, ['manager', manager_pin_hash]);
    console.log('✔ Manager user seeded  →  username: manager  |  PIN: 6767');

    /*
        SECTION: Seed - Sample Units
        Purpose: Inserts demo units only if the table is empty. `status` here
        must agree with the leases seeded below — a unit is 'Occupied' only
        if a lease currently covers it, 'Available' otherwise.
    */
    const unitIdByNumber = {};
    const unitCount = (await db.execute('SELECT COUNT(*) AS n FROM units'))[0][0].n;
    if (unitCount === 0) {
        const sampleUnits = [
            ['101', 'Studio',    7500,  'Occupied' ],
            ['102', 'Studio',    7500,  'Occupied' ],
            ['103', '1-Bedroom', 10200, 'Available'],
            ['104', '1-Bedroom', 10200, 'Available'],
            ['105', '2-Bedroom', 14500, 'Available'],
            ['106', 'Studio',    7800,  'Occupied' ],
            ['107', '1-Bedroom', 10500, 'Occupied' ],
            ['108', '1-Bedroom', 10800, 'Available'],
            ['109', '2-Bedroom', 14800, 'Available'],
            ['110', '2-Bedroom', 15200, 'Available'],
        ];
        for (const [number, type, rent, status] of sampleUnits) {
            const [result] = await db.execute(
                'INSERT INTO units (number, type, rent, status) VALUES (?, ?, ?, ?)',
                [number, type, rent, status]
            );
            unitIdByNumber[number] = result.insertId;
        }
        console.log('✔ Sample units seeded (10 units)');
    } else {
        console.log('⏭  Units already exist — skipping sample data');
    }

    /*
        SECTION: Seed - Sample Tenants
        Purpose: Inserts demo tenants only if the table is empty. lease_status
        here is just the initial/fallback value; the dashboard computes the
        displayed lease status live from the leases table seeded next, so
        these values are chosen to match what that computation will produce.
    */
    const tenantIdByName = {};
    const tenantCount = (await db.execute('SELECT COUNT(*) AS n FROM tenants'))[0][0].n;
    if (tenantCount === 0) {
        const sampleTenants = [
            ['Lance Vincent',    'lance@email.com',     '0917 123 4561', 'Active'  ],
            ['Christian Salang', 'christian@email.com', '0917 123 4562', 'Active'  ],
            ['Iesha Katriel',    'iesha@email.com',      '0917 123 4563', 'Pending' ],
            ['Minh Martinez',     'minh@email.com',        '0917 123 4564', 'Pending' ],
            ['Diego Fernandez',  'diego@email.com',      '0917 123 4565', 'Active'  ],
            ['Sakura Tanaka',    'sakura@email.com',     '0917 123 4566', 'Active'  ],
            ['Owen Bracket',     'owen@email.com',       '0917 123 4567', 'Pending' ],
            ['Priya Nandakumar', 'priya@email.com',      '0917 123 4568', 'Pending' ],
        ];
        for (const [name, email, phone, leaseStatus] of sampleTenants) {
            const [result] = await db.execute(
                'INSERT INTO tenants (name, email, phone, lease_status) VALUES (?, ?, ?, ?)',
                [name, email, phone, leaseStatus]
            );
            tenantIdByName[name] = result.insertId;
        }
        console.log('✔ Sample tenants seeded (8 tenants)');
    } else {
        console.log('⏭  Tenants already exist — skipping sample data');
    }

    /*
        SECTION: Seed - Sample Leases
        Purpose: Inserts demo leases only if the table is empty. Drives the
        live-computed "Unit" and "Lease Status" columns on the Tenants tab.
        Dates are chosen relative to today so the demo shows all three
        statuses: Active, Expired, and Pending (a tenant with no lease row).
    */
    const leaseIdByTenantUnit = {};
    const leaseCount = (await db.execute('SELECT COUNT(*) AS n FROM leases'))[0][0].n;
    if (leaseCount === 0) {
        async function unitIdFor(number) {
            if (unitIdByNumber[number]) return unitIdByNumber[number];
            const [rows] = await db.execute('SELECT unit_id FROM units WHERE number = ? LIMIT 1', [number]);
            return rows[0] ? rows[0].unit_id : null;
        }
        async function tenantIdFor(name) {
            if (tenantIdByName[name]) return tenantIdByName[name];
            const [rows] = await db.execute('SELECT tenant_id FROM tenants WHERE name = ? LIMIT 1', [name]);
            return rows[0] ? rows[0].tenant_id : null;
        }

        const today = new Date();
        const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const thisYear = today.getFullYear();

        const sampleLeases = [
            ['Lance Vincent',      '101',  iso(thisYear - 1, 6, 1),  iso(thisYear + 1, 5, 31),  7500 ],
            ['Christian Salang',   '102',  iso(thisYear - 1, 8, 1),  iso(thisYear + 1, 7, 31),  7500 ],
            ['Diego Fernandez',    '106',  iso(thisYear - 1, 3, 1),  iso(thisYear + 1, 2, 28),  7800 ],
            ['Sakura Tanaka',      '107',  iso(thisYear - 1, 11, 1), iso(thisYear + 1, 10, 31), 10500],
        ];
        for (const [tenant, unitNumber, start, end, rent] of sampleLeases) {
            const tenantId = await tenantIdFor(tenant);
            const unitId   = await unitIdFor(unitNumber);
            const [result] = await db.execute(
                'INSERT INTO leases (tenant_id, unit_id, start_date, end_date, rent) VALUES (?, ?, ?, ?, ?)',
                [tenantId, unitId, start, end, rent]
            );
            leaseIdByTenantUnit[`${tenant}:${unitNumber}`] = result.insertId;
        }
        console.log('✔ Sample leases seeded (4 leases)');
    } else {
        console.log('⏭  Leases already exist — skipping sample data');
    }

    /*
        SECTION: Seed - Sample Payments
        Purpose: Inserts demo payments only if the table is empty. Each
        payment links back to the tenant, unit, and (when known) the
        originating lease, instead of storing tenant/unit as loose text.
    */
    const paymentCount = (await db.execute('SELECT COUNT(*) AS n FROM payments'))[0][0].n;
    if (paymentCount === 0) {
        async function unitIdFor(number) {
            if (unitIdByNumber[number]) return unitIdByNumber[number];
            const [rows] = await db.execute('SELECT unit_id FROM units WHERE number = ? LIMIT 1', [number]);
            return rows[0] ? rows[0].unit_id : null;
        }
        async function tenantIdFor(name) {
            if (tenantIdByName[name]) return tenantIdByName[name];
            const [rows] = await db.execute('SELECT tenant_id FROM tenants WHERE name = ? LIMIT 1', [name]);
            return rows[0] ? rows[0].tenant_id : null;
        }

        const today = new Date();
        const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const thisYear = today.getFullYear();
        const thisMonth = today.getMonth() + 1;

        const samplePayments = [
            ['Lance Vincent',      '101', iso(thisYear, thisMonth, 1), 7500, 'Paid'   ],
            ['Christian Salang',   '102', iso(thisYear, thisMonth, 3), 7500, 'Pending'],
            ['Diego Fernandez',    '106', iso(thisYear, thisMonth, 5), 7800, 'Paid'   ],
            ['Sakura Tanaka',      '107', iso(thisYear, thisMonth, 7), 10500, 'Pending'],
        ];
        for (const [tenant, unitNumber, date, amount, status] of samplePayments) {
            const tenantId = await tenantIdFor(tenant);
            const unitId   = await unitIdFor(unitNumber);
            const leaseId  = leaseIdByTenantUnit[`${tenant}:${unitNumber}`] || null;
            await db.execute(
                'INSERT INTO payments (tenant_id, unit_id, lease_id, payment_date, amount, status) VALUES (?, ?, ?, ?, ?, ?)',
                [tenantId, unitId, leaseId, date, amount, status]
            );
        }
        console.log('✔ Sample payments seeded (4 payments)');
    } else {
        console.log('⏭  Payments already exist — skipping sample data');
    }

    /*
        SECTION: Seed - Sample Employees
        Purpose: Inserts demo employee records only if the table is empty.
    */
    const empCount = (await db.execute('SELECT COUNT(*) AS n FROM employees'))[0][0].n;
    if (empCount === 0) {
        const sampleEmployees = [
            ['Hatsune Miku', 'miku@rentease.com',  '0999 111 1111'],
            ['Kasane Teto',  'teto@rentease.com',  '0999 222 2222'],
            ['Dong Matteo',  'matteo@rentease.com','0999 333 3333'],
            ['Luna Ishikawa','luna@rentease.com',  '0999 444 4444'],
            ['Kai Alvarez',  'kai@rentease.com',   '0999 555 5555'],
            ['Zara Bautista','zara@rentease.com',  '0999 666 6666'],
        ];
        for (const [name, email, phone] of sampleEmployees) {
            await db.execute(
                'INSERT INTO employees (name, email, phone) VALUES (?, ?, ?)',
                [name, email, phone]
            );
        }
        console.log('✔ Sample employees seeded (6 employees)');
    } else {
        console.log('⏭  Employees already exist — skipping sample data');
    }

    await db.end();
    console.log('\nRentEase database ready!');
}

seed().catch(err => {
    console.error('\nSeeder failed:', err.message);
    process.exit(1);
});