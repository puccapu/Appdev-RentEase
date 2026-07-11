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
    // ============================================================
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            username   VARCHAR(50)  UNIQUE NOT NULL,
            pin_hash   VARCHAR(255) NOT NULL,
            first_name VARCHAR(50)  DEFAULT '',
            last_name  VARCHAR(50)  DEFAULT '',
            email      VARCHAR(100) DEFAULT '',
            phone      VARCHAR(30)  DEFAULT '',
            role       VARCHAR(30)  DEFAULT 'Admin',
            created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✔ Table: users');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS units (
            id     INT AUTO_INCREMENT PRIMARY KEY,
            number VARCHAR(20)  NOT NULL,
            type   VARCHAR(50)  NOT NULL,
            rent   DECIMAL(10,2) NOT NULL DEFAULT 0,
            status VARCHAR(30)  NOT NULL DEFAULT 'Available'
        )
    `);
    console.log('✔ Table: units');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS tenants (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            name         VARCHAR(100) NOT NULL,
            email        VARCHAR(100) DEFAULT '',
            phone        VARCHAR(30)  DEFAULT '',
            unit_id      INT          DEFAULT NULL,
            lease_status VARCHAR(30)  DEFAULT 'Pending'
        )
    `);
    console.log('✔ Table: tenants');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS leases (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            tenant     VARCHAR(100)  NOT NULL,
            unit_id    INT           DEFAULT NULL,
            start_date DATE          NOT NULL,
            end_date   DATE          NOT NULL,
            rent       DECIMAL(10,2) NOT NULL DEFAULT 0
        )
    `);
    console.log('✔ Table: leases');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS payments (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            tenant       VARCHAR(100)  NOT NULL,
            unit         VARCHAR(20)   NOT NULL,
            payment_date DATE          NOT NULL,
            amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
            status       VARCHAR(30)   NOT NULL DEFAULT 'Pending'
        )
    `);
    console.log('✔ Table: payments');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS employees (
            id    INT AUTO_INCREMENT PRIMARY KEY,
            name  VARCHAR(100) NOT NULL,
            email VARCHAR(100) DEFAULT '',
            phone VARCHAR(30)  DEFAULT '',
            role  VARCHAR(30)  DEFAULT 'Staff'
        )
    `);
    console.log('✔ Table: employees');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS recent_activity (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            action_type VARCHAR(20)  NOT NULL,
            entity_type VARCHAR(30)  NOT NULL,
            entity_id   INT          DEFAULT NULL,
            description VARCHAR(255) NOT NULL,
            username    VARCHAR(50)  DEFAULT 'Admin',
            created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        )
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
    const unitCount = (await db.execute('SELECT COUNT(*) AS n FROM units'))[0][0].n;
    if (unitCount === 0) {
        const sampleUnits = [
            ['101', 'Studio',    7500,  'Occupied' ],  // Diana Reyes  — active lease
            ['102', 'Studio',    7500,  'Occupied' ],  // John Rivera  — active lease
            ['103', '1-Bedroom', 10200, 'Occupied' ],  // Rachel Cruz  — active lease (2nd unit)
            ['104', '1-Bedroom', 10200, 'Available'],  // no lease
            ['205', 'Studio',    8000,  'Occupied' ],  // Anna Cruz    — active lease
            ['206', '2-Bedroom', 14500, 'Occupied' ],  // Rachel Cruz  — active lease (1st unit)
            ['304', '1-Bedroom', 12500, 'Occupied' ],  // Maria Santos — active lease
            ['407', 'Penthouse', 22000, 'Available'],  // Carlos Lee's lease expired — unit freed up
        ];
        for (const [number, type, rent, status] of sampleUnits) {
            await db.execute(
                'INSERT INTO units (number, type, rent, status) VALUES (?, ?, ?, ?)',
                [number, type, rent, status]
            );
        }
        console.log('✔ Sample units seeded (8 units)');
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
    const tenantCount = (await db.execute('SELECT COUNT(*) AS n FROM tenants'))[0][0].n;
    if (tenantCount === 0) {
        const sampleTenants = [
            ['Maria Santos', 'maria@email.com',   '+63 912 3456', 'Active'  ], // active lease → 304
            ['John Rivera',  'john.r@email.com',  '+63 923 4567', 'Active'  ], // active lease → 102
            ['Anna Cruz',    'anna.c@email.com',  '+63 934 5678', 'Active'  ], // active lease → 205
            ['Carlos Lee',   'c.lee@email.com',   '+63 945 6789', 'Expired' ], // lease ended → 407
            ['Diana Reyes',  'dreyes@email.com',  '+63 956 7890', 'Active'  ], // active lease → 101
            ['Eduardo Tan',  'ed.tan@email.com',  '+63 967 8901', 'Pending' ], // no lease at all
            ['Rachel Cruz',  'rachel.c@email.com','+63 978 9012', 'Active'  ], // active leases → 206 & 103 (multi-unit)
        ];
        for (const [name, email, phone, leaseStatus] of sampleTenants) {
            await db.execute(
                'INSERT INTO tenants (name, email, phone, lease_status) VALUES (?, ?, ?, ?)',
                [name, email, phone, leaseStatus]
            );
        }
        console.log('✔ Sample tenants seeded (7 tenants)');
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
    const leaseCount = (await db.execute('SELECT COUNT(*) AS n FROM leases'))[0][0].n;
    if (leaseCount === 0) {
        async function unitIdFor(number) {
            const [rows] = await db.execute('SELECT id FROM units WHERE number = ? LIMIT 1', [number]);
            return rows[0] ? rows[0].id : null;
        }
        const today = new Date();
        const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const thisYear = today.getFullYear();

        const sampleLeases = [
            // tenant,         unit,   start                    end                       rent
            ['Maria Santos',  '304',  iso(thisYear - 1, 1, 1),  iso(thisYear + 1, 12, 31), 12500], // Active
            ['John Rivera',   '102',  iso(thisYear - 1, 9, 1),  iso(thisYear + 1, 8, 31),  7500 ], // Active
            ['Anna Cruz',     '205',  iso(thisYear, 3, 1),      iso(thisYear + 1, 2, 28),  8000 ], // Active
            ['Carlos Lee',    '407',  iso(thisYear - 1, 5, 1),  iso(thisYear, 4, 30),      22000], // Expired
            ['Diana Reyes',   '101',  iso(thisYear, 2, 10),     iso(thisYear + 1, 2, 9),   7500 ], // Active
            ['Rachel Cruz',   '206',  iso(thisYear, 4, 1),      iso(thisYear + 1, 3, 31),  14500], // Active (unit 1 of 2)
            ['Rachel Cruz',   '103',  iso(thisYear, 6, 1),      iso(thisYear + 1, 5, 31),  10200], // Active (unit 2 of 2)
            // Eduardo Tan intentionally has no lease → stays 'Pending'
        ];
        for (const [tenant, unitNumber, start, end, rent] of sampleLeases) {
            const unitId = await unitIdFor(unitNumber);
            await db.execute(
                'INSERT INTO leases (tenant, unit_id, start_date, end_date, rent) VALUES (?, ?, ?, ?, ?)',
                [tenant, unitId, start, end, rent]
            );
        }
        console.log('✔ Sample leases seeded (7 leases)');
    } else {
        console.log('⏭  Leases already exist — skipping sample data');
    }

    // ============================================================
    //  SEED: Sample employees
    // ============================================================
    const empCount = (await db.execute('SELECT COUNT(*) AS n FROM employees'))[0][0].n;
    if (empCount === 0) {
        const sampleEmployees = [
            ['Alice Johnson', 'alice@rentease.com', '+63 999 1111', 'Admin'  ],
            ['Bob Smith',     'bob@rentease.com',   '+63 999 2222', 'Manager'],
            ['Carol Tan',     'carol@rentease.com', '+63 999 3333', 'Staff'  ],
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