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
    const unitCount = (await db.execute('SELECT COUNT(*) AS n FROM units'))[0][0].n;
    if (unitCount === 0) {
        const sampleUnits = [
            ['101', 'Studio',    7500,  'Occupied' ],
            ['102', 'Studio',    7500,  'Occupied' ],
            ['103', '1-Bedroom', 10200, 'Available'],
            ['104', '1-Bedroom', 10200, 'Occupied' ],
            ['205', 'Studio',    8000,  'Occupied' ],
            ['206', '2-Bedroom', 14500, 'Available'],
            ['304', '1-Bedroom', 12500, 'Occupied' ],
            ['407', 'Penthouse', 22000, 'Occupied' ],
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
    const tenantCount = (await db.execute('SELECT COUNT(*) AS n FROM tenants'))[0][0].n;
    if (tenantCount === 0) {
        const sampleTenants = [
            ['Maria Santos', 'maria@email.com',   '+63 912 3456', 'Active'  ],
            ['John Rivera',  'john.r@email.com',  '+63 923 4567', 'Active'  ],
            ['Anna Cruz',    'anna.c@email.com',  '+63 934 5678', 'Active'  ],
            ['Carlos Lee',   'c.lee@email.com',   '+63 945 6789', 'Expired' ],
            ['Diana Reyes',  'dreyes@email.com',  '+63 956 7890', 'Active'  ],
            ['Eduardo Tan',  'ed.tan@email.com',  '+63 967 8901', 'Pending' ],
        ];
        for (const [name, email, phone, leaseStatus] of sampleTenants) {
            await db.execute(
                'INSERT INTO tenants (name, email, phone, lease_status) VALUES (?, ?, ?, ?)',
                [name, email, phone, leaseStatus]
            );
        }
        console.log('✔ Sample tenants seeded (6 tenants)');
    } else {
        console.log('⏭  Tenants already exist — skipping sample data');
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