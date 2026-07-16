require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function seed() {
    const db = await mysql.createConnection({
        host:     process.env.DB_HOST,
        user:     process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });

    console.log('Connected to database...');

    // ============================================================
    //  TABLES
    //  Full annotated schema (with the ERD relationship notes) lives
    //  in database/schema.sql — this mirrors it, but uses
    //  CREATE TABLE IF NOT EXISTS so re-running the seeder is safe.
    //
    //  Every primary key is named <table_name>_id, and every foreign
    //  key column reuses that exact name, so the relationships below
    //  are unambiguous:
    //    users     1─<recent_activity   (user_id)
    //    units     1─<tenants           (unit_id)
    //    units     1─<leases            (unit_id)
    //    units     1─<payments          (unit_id)
    //    tenants   1─<leases            (tenant_id)
    //    tenants   1─<payments          (tenant_id)
    //    leases    1─<payments          (lease_id)
    // ============================================================
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
            phone       VARCHAR(30)  DEFAULT '',
            role        VARCHAR(30)  DEFAULT 'Staff'
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

    // ============================================================
    //  SEED: Admin user  (PIN: 2121)
    // ============================================================
    const pin_hash = await bcrypt.hash('2121', 10);
    await db.execute(`
        INSERT INTO users (username, pin_hash, first_name, role)
        VALUES (?, ?, 'Admin', 'Admin')
        ON DUPLICATE KEY UPDATE username = username
    `, ['admin', pin_hash]);
    console.log('✔ Admin user seeded  →  username: admin  |  PIN: 2121');

    // ============================================================
    //  SEED: Sample units
    // ============================================================
    // NOTE: 'status' here should agree with the leases seeded below —
    // a unit is 'Occupied' if a lease currently covers it, 'Available' otherwise.
    const unitIdByNumber = {};
    const unitCount = (await db.execute('SELECT COUNT(*) AS n FROM units'))[0][0].n;
    if (unitCount === 0) {
        const sampleUnits = [
            ['101', 'Studio',    7500,  'Occupied' ],  // Lance Vincent      — active lease
            ['102', 'Studio',    7500,  'Occupied' ],  // Christian Salang   — active lease
            ['103', '1-Bedroom', 10200, 'Available'],  // no lease
            ['104', '1-Bedroom', 10200, 'Available'],  // no lease
            ['105', '2-Bedroom', 14500, 'Available'],  // no lease
        ];
        for (const [number, type, rent, status] of sampleUnits) {
            const [result] = await db.execute(
                'INSERT INTO units (number, type, rent, status) VALUES (?, ?, ?, ?)',
                [number, type, rent, status]
            );
            unitIdByNumber[number] = result.insertId;
        }
        console.log('✔ Sample units seeded (5 units)');
    } else {
        console.log('⏭  Units already exist — skipping sample data');
    }

    // ============================================================
    //  SEED: Sample tenants
    // ============================================================
    // NOTE: lease_status here is just the initial/fallback value stored on the
    // tenant row. The dashboard now computes the *displayed* lease status (and
    // leased unit list) live from the leases table below, so these values are
    // chosen to match what that computation will actually produce.
    const tenantIdByName = {};
    const tenantCount = (await db.execute('SELECT COUNT(*) AS n FROM tenants'))[0][0].n;
    if (tenantCount === 0) {
        const sampleTenants = [
            ['Lance Vincent',    'lance@email.com',     '+63 912 3456', 'Active'  ], // active lease → 101
            ['Christian Salang', 'christian@email.com', '+63 923 4567', 'Active'  ], // active lease → 102
            ['Iesha Katriel',    'iesha@email.com',      '+63 934 5678', 'Pending' ], // no lease at all
            ['Min Martinez',     'min@email.com',        '+63 945 6789', 'Pending' ], // no lease at all
        ];
        for (const [name, email, phone, leaseStatus] of sampleTenants) {
            const [result] = await db.execute(
                'INSERT INTO tenants (name, email, phone, lease_status) VALUES (?, ?, ?, ?)',
                [name, email, phone, leaseStatus]
            );
            tenantIdByName[name] = result.insertId;
        }
        console.log('✔ Sample tenants seeded (4 tenants)');
    } else {
        console.log('⏭  Tenants already exist — skipping sample data');
    }

    // ============================================================
    //  SEED: Sample leases
    // ============================================================
    // Drives the live-computed "Unit" and "Lease Status" columns on the Tenants
    // tab. Dates are chosen relative to today so the demo shows all three
    // statuses: Active (today falls within the lease), Expired (lease ended),
    // and Pending (tenant has no lease row at all — see Eduardo Tan above).
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
            // tenant,              unit,   start                    end                       rent
            ['Lance Vincent',      '101',  iso(thisYear - 1, 6, 1),  iso(thisYear + 1, 5, 31),  7500 ], // Active
            ['Christian Salang',   '102',  iso(thisYear - 1, 8, 1),  iso(thisYear + 1, 7, 31),  7500 ], // Active
            // Iesha Katriel and Min Martinez intentionally have no lease → stay 'Pending'
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
        console.log('✔ Sample leases seeded (2 leases)');
    } else {
        console.log('⏭  Leases already exist — skipping sample data');
    }

    // ============================================================
    //  SEED: Sample payments
    // ============================================================
    // Each payment links back to the tenant, unit, and (when known) the
    // originating lease, instead of storing tenant/unit as loose text.
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
            // tenant,              unit,  date,                         amount, status
            ['Lance Vincent',      '101', iso(thisYear, thisMonth, 1), 7500, 'Paid'   ],
            ['Christian Salang',   '102', iso(thisYear, thisMonth, 3), 7500, 'Pending'],
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
        console.log('✔ Sample payments seeded (2 payments)');
    } else {
        console.log('⏭  Payments already exist — skipping sample data');
    }

    // ============================================================
    //  SEED: Sample employees
    // ============================================================
    const empCount = (await db.execute('SELECT COUNT(*) AS n FROM employees'))[0][0].n;
    if (empCount === 0) {
        const sampleEmployees = [
            ['Hatsune Miku', 'miku@rentease.com',  '+63 999 1111', 'Admin'  ],
            ['Kasane Teto',  'teto@rentease.com',  '+63 999 2222', 'Manager'],
            ['Dong Matteo',  'matteo@rentease.com','+63 999 3333', 'Staff'  ],
        ];
        for (const [name, email, phone, role] of sampleEmployees) {
            await db.execute(
                'INSERT INTO employees (name, email, phone, role) VALUES (?, ?, ?, ?)',
                [name, email, phone, role]
            );
        }
        console.log('✔ Sample employees seeded (3 employees)');
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