const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

// Check for Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Database configuration
const DB_NAME = process.env.DB_NAME || 'curalink';

// Check environment
const isServerless = Boolean(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.FLY_APP_NAME ||
    process.env.NETLIFY
);

let db;

// If Supabase is configured, we need to set up a different approach
if (isSupabaseConfigured) {
    // For Supabase, we'll use SQLite as fallback but warn user
    console.log('Supabase is configured but using SQLite for now...');
}

// SQLite path resolution
let dbPath;

if (isServerless) {
    const tmpDir = os.tmpdir();
    dbPath = path.join(tmpDir, `${DB_NAME}.db`);
    
    // Try to copy bundled db to tmp if it exists
    const bundledDbPath = path.join(__dirname, `${DB_NAME}.db`);
    try {
        if (!fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
            fs.copyFileSync(bundledDbPath, dbPath);
            console.log('Database copied to tmp:', dbPath);
        }
    } catch (copyError) {
        console.error('Error copying DB to tmp:', copyError.message);
    }
} else {
    dbPath = path.join(__dirname, `${DB_NAME}.db`);
}

console.log('Database path:', dbPath);

// Initialize SQLite
db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Handle SQLite errors
db.on('error', (err) => {
    console.error('Database error:', err.message);
});

function initializeDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                phone TEXT,
                address TEXT,
                role TEXT NOT NULL CHECK(role IN ('admin', 'warehouse', 'pharmacy')),
                rating REAL DEFAULT 0,
                rating_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Products table
        db.run(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                warehouse_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT,
                active_ingredient TEXT,
                price REAL NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                discount_percent REAL NOT NULL DEFAULT 0,
                bonus_buy_quantity INTEGER NOT NULL DEFAULT 0,
                bonus_free_quantity INTEGER NOT NULL DEFAULT 0,
                offer_note TEXT,
                expiry_date DATE,
                image TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (warehouse_id) REFERENCES users(id)
            )
        `);

        // Orders table
        db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pharmacy_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                total_amount REAL NOT NULL,
                commission REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
                is_deleted INTEGER NOT NULL DEFAULT 0,
                deleted_at DATETIME,
                cancellable_until DATETIME,
                expected_delivery_date DATE,
                pharmacy_note TEXT,
                warehouse_note TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (pharmacy_id) REFERENCES users(id),
                FOREIGN KEY (warehouse_id) REFERENCES users(id)
            )
        `);

        // Order items table
        db.run(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);

        // Invoices table
        db.run(`
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                commission REAL NOT NULL,
                net_amount REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled')),
                paid_at DATETIME,
                cancelled_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        // Invoice payments table
        db.run(`
            CREATE TABLE IF NOT EXISTS invoice_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                payment_method TEXT,
                reference TEXT,
                note TEXT,
                paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id),
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        // Order events table
        db.run(`
            CREATE TABLE IF NOT EXISTS order_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                from_status TEXT,
                to_status TEXT,
                actor_user_id INTEGER,
                actor_role TEXT,
                message TEXT NOT NULL,
                meta_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (actor_user_id) REFERENCES users(id)
            )
        `);

        // Returns table
        db.run(`
            CREATE TABLE IF NOT EXISTS returns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                pharmacy_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (pharmacy_id) REFERENCES users(id),
                FOREIGN KEY (warehouse_id) REFERENCES users(id)
            )
        `);

        // Return items table
        db.run(`
            CREATE TABLE IF NOT EXISTS return_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                return_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                FOREIGN KEY (return_id) REFERENCES returns(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);

        // Ratings table
        db.run(`
            CREATE TABLE IF NOT EXISTS ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pharmacy_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (pharmacy_id) REFERENCES users(id),
                FOREIGN KEY (warehouse_id) REFERENCES users(id),
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        // Notifications table
        db.run(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                related_id INTEGER,
                read INTEGER DEFAULT 0,
                read_at DATETIME,
                metadata_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Notification preferences table
        db.run(`
            CREATE TABLE IF NOT EXISTS notification_preferences (
                user_id INTEGER PRIMARY KEY,
                order_updates INTEGER NOT NULL DEFAULT 1,
                low_stock INTEGER NOT NULL DEFAULT 1,
                ratings INTEGER NOT NULL DEFAULT 1,
                returns INTEGER NOT NULL DEFAULT 1,
                system_alerts INTEGER NOT NULL DEFAULT 1,
                marketing INTEGER NOT NULL DEFAULT 1,
                email_enabled INTEGER NOT NULL DEFAULT 1,
                sms_enabled INTEGER NOT NULL DEFAULT 1,
                push_enabled INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Push subscriptions table
        db.run(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Wishlist table
        db.run(`
            CREATE TABLE IF NOT EXISTS wishlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pharmacy_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(pharmacy_id, product_id),
                FOREIGN KEY (pharmacy_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);

        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_products_warehouse ON products(warehouse_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_orders_pharmacy ON orders(pharmacy_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)');

        // Insert sample data
        insertSampleData();
    });
}

function insertSampleData() {
    const bcrypt = require('bcryptjs');

    const warehouses = [
        {
            username: 'warehouse1',
            email: 'warehouse1@test.com',
            phone: '01000000001',
            address: 'Cairo',
            products: [
                { name: 'Paracetamol 500mg Tablets', description: 'Pain relief and fever reducer', category: 'Pain Relief', price: 18, quantity: 260, discount_percent: 12, image: '/uploads/products/paracetamol.svg' },
                { name: 'Panadol Extra Caplets', description: 'Dual-action pain relief', category: 'Pain Relief', price: 32, quantity: 180, discount_percent: 8, image: '/uploads/products/panadol.svg' },
                { name: 'Ibuprofen 400mg Tablets', description: 'Anti-inflammatory analgesic', category: 'Pain Relief', price: 29, quantity: 170, discount_percent: 0, bonus_buy_quantity: 10, bonus_free_quantity: 1 },
                { name: 'Novaldol 500mg Tablets', description: 'مسكن للآلام وخافض للحرارة', category: 'Pain Relief', price: 15, quantity: 250, discount_percent: 10, image: '/uploads/products/novaldol.svg' },
                { name: 'Glucophage 500mg Tablets', description: 'علاج السكر من النوع الثاني', category: 'Diabetes Care', price: 38, quantity: 200, discount_percent: 12, image: '/uploads/products/glucophage.svg' },
                { name: 'Nexium 20mg Tablets', description: 'مثبط مضخة البروتون', category: 'Digestive Care', price: 85, quantity: 140, discount_percent: 10, image: '/uploads/products/nexium.svg' },
                { name: 'Augmentin 1g Tablets', description: 'مضاد حيوي واسع الطيف', category: 'Antibiotics', price: 120, quantity: 90, discount_percent: 5, image: '/uploads/products/augmentin.svg' },
                { name: 'Vitamin C 1000mg', description: 'Vitamin C supplement', category: 'Vitamins', price: 55, quantity: 210, discount_percent: 15, image: '/uploads/products/vitaminc.svg' },
                { name: 'Omega 3 1000mg', description: 'Omega 3 supplement', category: 'Supplements', price: 99, quantity: 150, discount_percent: 12, image: '/uploads/products/omega3.svg' }
            ]
        },
        {
            username: 'warehouse2',
            email: 'warehouse2@test.com',
            phone: '01000000002',
            address: 'Alexandria',
            products: [
                { name: 'Cetirizine 10mg Tablets', description: 'Antihistamine for allergies', category: 'Allergy', price: 34, quantity: 200, discount_percent: 10 },
                { name: 'Montelukast 10mg', description: 'Asthma and allergy medication', category: 'Respiratory', price: 79, quantity: 120, discount_percent: 5 },
                { name: 'Panadol Cold & Flu', description: 'بانادول زكام وانفلونزا', category: 'Cold and Flu', price: 42, quantity: 200, discount_percent: 10, image: '/uploads/products/panadolflu.svg' },
                { name: 'Strepsils Honey & Lemon', description: 'حبوب استحلاب للتهاب الحلق', category: 'Cold and Flu', price: 38, quantity: 250, discount_percent: 12, image: '/uploads/products/strepsils.svg' },
                { name: 'Otrivin Nasal Spray', description: 'مزيل لاحتقان الانف', category: 'Cold and Flu', price: 45, quantity: 180, discount_percent: 8, image: '/uploads/products/otrivin.svg' },
                { name: 'Euthyrox 50mcg Tablets', description: 'علاج نقص الغدة الدرقية', category: 'Thyroid', price: 48, quantity: 180, discount_percent: 10, image: '/uploads/products/euthyrox.svg' },
                { name: 'Xarelto 20mg Tablets', description: 'مميع الدم للوقاية من الجلطات', category: 'Cardio Care', price: 350, quantity: 40, discount_percent: 5, image: '/uploads/products/xarelto.svg' }
            ]
        }
    ];

    const pharmacies = [
        { username: 'pharmacy1', email: 'pharmacy1@test.com', phone: '01100000001', address: 'New Cairo' },
        { username: 'pharmacy2', email: 'pharmacy2@test.com', phone: '01100000002', address: 'Zamalek' },
        { username: 'pharmacy3', email: 'pharmacy3@test.com', phone: '01100000003', address: 'Mohandessin' }
    ];

    // Check if admin exists
    db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1", (err, row) => {
        if (err) { console.error('Error checking admin:', err); return; }
        if (row) return;

        const hashedPassword = bcrypt.hashSync('admin123', 10);

        db.run(
            `INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
            ['admin', 'admin@curalink.com', hashedPassword, '0123456789', 'Cairo', 'admin'],
            function(err) {
                if (err) console.error('Error inserting admin:', err);
                else console.log('Admin user created');
            }
        );

        warehouses.forEach((warehouse) => {
            const hashedPw = bcrypt.hashSync('warehouse123', 10);
            db.run(
                `INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
                [warehouse.username, warehouse.email, hashedPw, warehouse.phone, warehouse.address, 'warehouse'],
                function(err) {
                    if (err) { console.error('Error inserting warehouse:', err); return; }
                    const warehouseId = this.lastID;
                    warehouse.products.forEach((product) => {
                        const expiryDate = new Date();
                        expiryDate.setMonth(expiryDate.getMonth() + 18);
                        db.run(
                            `INSERT INTO products (warehouse_id, name, description, category, price, quantity, discount_percent, bonus_buy_quantity, bonus_free_quantity, expiry_date, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [warehouseId, product.name, product.description, product.category, product.price, product.quantity, product.discount_percent || 0, product.bonus_buy_quantity || 0, product.bonus_free_quantity || 0, expiryDate.toISOString().split('T')[0], product.image || null],
                            (err) => { if (err) console.error('Error inserting product:', err); }
                        );
                    });
                }
            );
        });

        pharmacies.forEach((pharmacy) => {
            const hashedPw = bcrypt.hashSync('pharmacy123', 10);
            db.run(
                `INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
                [pharmacy.username, pharmacy.email, hashedPw, pharmacy.phone, pharmacy.address, 'pharmacy'],
                (err) => { if (err) console.error('Error inserting pharmacy:', err); }
            );
        });

        console.log('Sample data inserted');
    });
}

module.exports = db;
