const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

// Database configuration
const DB_NAME = process.env.DB_NAME || 'curalink';

// Check if we're in a serverless environment
const isServerless = Boolean(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.FLY_APP_NAME ||
    process.env.NETLIFY
);

// Check if we should use external database
const useExternalDB = Boolean(process.env.DATABASE_URL);

let dbPath;
let db;

if (useExternalDB) {
    // External database configuration (for PostgreSQL/MySQL)
    // This would require additional setup with knex or sequelize
    console.log('Using external database configuration');
    // For now, we'll still use SQLite but warn the user
    dbPath = process.env.DB_PATH || path.join(__dirname, `${DB_NAME}.db`);
} else {
    // Local SQLite database
    if (isServerless) {
        // In serverless, use /tmp for writable storage
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
        // Local development - use bundled database
        dbPath = path.join(__dirname, `${DB_NAME}.db`);
    }
}

console.log('Database path:', dbPath);

// Initialize database connection
db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Handle database errors
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

        // Backward-compatible migrations for existing databases.
        db.run('ALTER TABLE products ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding discount_percent column:', err.message);
            }
        });
        db.run('ALTER TABLE products ADD COLUMN bonus_buy_quantity INTEGER NOT NULL DEFAULT 0', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding bonus_buy_quantity column:', err.message);
            }
        });
        db.run('ALTER TABLE products ADD COLUMN bonus_free_quantity INTEGER NOT NULL DEFAULT 0', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding bonus_free_quantity column:', err.message);
            }
        });
        db.run('ALTER TABLE products ADD COLUMN offer_note TEXT', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding offer_note column:', err.message);
            }
        });
        db.run('ALTER TABLE products ADD COLUMN active_ingredient TEXT', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding active_ingredient column:', err.message);
            }
        });

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
        db.run('ALTER TABLE orders ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding is_deleted column:', err.message);
            }
        });
        db.run('ALTER TABLE orders ADD COLUMN deleted_at DATETIME', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding deleted_at column:', err.message);
            }
        });
        db.run('ALTER TABLE orders ADD COLUMN cancellable_until DATETIME', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding cancellable_until column:', err.message);
            }
        });
        db.run('ALTER TABLE orders ADD COLUMN expected_delivery_date DATE', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding expected_delivery_date column:', err.message);
            }
        });
        db.run('ALTER TABLE orders ADD COLUMN pharmacy_note TEXT', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding pharmacy_note column:', err.message);
            }
        });
        db.run('ALTER TABLE orders ADD COLUMN warehouse_note TEXT', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding warehouse_note column:', err.message);
            }
        });

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
        db.run('ALTER TABLE invoices ADD COLUMN cancelled_at DATETIME', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding cancelled_at column:', err.message);
            }
        });

        // Invoice payments table (partial payments ledger)
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
        db.run('CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id, paid_at)');

        // Payment gateways config table
        db.run(`
            CREATE TABLE IF NOT EXISTS payment_gateway_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL UNIQUE,
                enabled INTEGER NOT NULL DEFAULT 0,
                config_json TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Order events table
        db.run(`
            CREATE TABLE IF NOT EXISTS order_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                event_type TEXT NOT NULL CHECK(event_type IN ('order_created', 'order_status_changed', 'order_cancelled', 'order_deleted', 'order_viewed')),
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
        db.run('CREATE INDEX IF NOT EXISTS idx_order_events_order_created ON order_events(order_id, created_at)');
        db.run('CREATE INDEX IF NOT EXISTS idx_order_events_type_created ON order_events(event_type, created_at)');

        // Returns table
        db.run(`
            CREATE TABLE IF NOT EXISTS returns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                pharmacy_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
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
        db.run('CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id, created_at)');

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
        db.run('ALTER TABLE notifications ADD COLUMN read_at DATETIME', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding read_at column to notifications:', err.message);
            }
        });
        db.run('ALTER TABLE notifications ADD COLUMN metadata_json TEXT', (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error adding metadata_json column to notifications:', err.message);
            }
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)');

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

        // Web push subscriptions
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
        db.run('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
        db.run(`
            INSERT INTO notification_preferences (user_id)
            SELECT users.id
            FROM users
            LEFT JOIN notification_preferences np ON np.user_id = users.id
            WHERE np.user_id IS NULL
        `, (err) => {
            if (err) {
                console.error('Error backfilling notification preferences:', err.message);
            }
        });

        // Ensure every new user gets default notification preferences.
        db.run(`
            CREATE TRIGGER IF NOT EXISTS trg_users_create_notification_preferences
            AFTER INSERT ON users
            FOR EACH ROW
            BEGIN
                INSERT OR IGNORE INTO notification_preferences (user_id, created_at, updated_at)
                VALUES (NEW.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            END
        `);

        // Respect per-user preferences before inserting notifications.
        db.run(`
            CREATE TRIGGER IF NOT EXISTS trg_notifications_apply_preferences
            BEFORE INSERT ON notifications
            FOR EACH ROW
            WHEN EXISTS (
                SELECT 1
                FROM notification_preferences np
                WHERE np.user_id = NEW.user_id
                AND (
                    (NEW.type IN ('new_order', 'order_update') AND np.order_updates = 0)
                    OR (NEW.type = 'low_stock' AND np.low_stock = 0)
                    OR (NEW.type = 'new_rating' AND np.ratings = 0)
                    OR (NEW.type = 'return_request' AND np.returns = 0)
                    OR (NEW.type IN ('info', 'system_alert') AND np.system_alerts = 0)
                    OR (NEW.type IN ('promotion', 'marketing') AND np.marketing = 0)
                    OR (NEW.type = 'email_queued' AND np.email_enabled = 0)
                    OR (NEW.type = 'sms_queued' AND np.sms_enabled = 0)
                    OR (NEW.type = 'push' AND np.push_enabled = 0)
                )
            )
            BEGIN
                SELECT RAISE(IGNORE);
            END
        `);

        // Wishlist table (for pharmacies)
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

        migrateInvoicesTable(() => {
            // Insert sample data
            insertSampleData();
        });
    });
}

function migrateInvoicesTable(done) {
    db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'invoices'", (err, row) => {
        if (err) {
            console.error('Error checking invoices schema:', err.message);
            done();
            return;
        }

        const tableSql = row?.sql || '';
        const hasCancelledStatusInConstraint =
            tableSql.includes("CHECK(status IN ('pending', 'paid', 'cancelled'))") ||
            tableSql.includes('CHECK(status IN ("pending", "paid", "cancelled"))');
        const hasCancelledAtColumn = tableSql.toLowerCase().includes('cancelled_at');

        if (hasCancelledStatusInConstraint && hasCancelledAtColumn) {
            done();
            return;
        }

        db.serialize(() => {
            db.run('DROP TABLE IF EXISTS invoices_new');
            db.run(`
                CREATE TABLE IF NOT EXISTS invoices_new (
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

            db.run(`
                INSERT INTO invoices_new (id, order_id, amount, commission, net_amount, status, paid_at, created_at)
                SELECT
                    id,
                    order_id,
                    amount,
                    commission,
                    net_amount,
                    CASE
                        WHEN status IN ('pending', 'paid', 'cancelled') THEN status
                        ELSE 'pending'
                    END,
                    paid_at,
                    created_at
                FROM invoices
            `, (insertErr) => {
                if (insertErr) {
                    console.error('Error copying invoices during migration:', insertErr.message);
                    db.run('DROP TABLE IF EXISTS invoices_new');
                    done();
                    return;
                }

                db.run('DROP TABLE invoices', (dropErr) => {
                    if (dropErr) {
                        console.error('Error dropping old invoices table:', dropErr.message);
                        db.run('DROP TABLE IF EXISTS invoices_new');
                        done();
                        return;
                    }

                    db.run('ALTER TABLE invoices_new RENAME TO invoices', (renameErr) => {
                        if (renameErr) {
                            console.error('Error renaming invoices table:', renameErr.message);
                        }
                        done();
                    });
                });
            });
        });
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
                {
                    name: 'Paracetamol 500mg Tablets',
                    description: 'Reliable antipyretic and analgesic for mild to moderate pain and fever control.',
                    category: 'Pain Relief',
                    price: 18,
                    quantity: 260,
                    discount_percent: 12,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Contract pricing for monthly pharmacy volume.',
                    expiry_months: 24,
                    image: '/uploads/products/paracetamol.svg'
                },
                {
                    name: 'Panadol Extra Caplets',
                    description: 'Dual-action pain relief formula for headache, toothache, and muscle pain.',
                    category: 'Pain Relief',
                    price: 32,
                    quantity: 180,
                    discount_percent: 8,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Seasonal price support for fast-moving SKUs.',
                    expiry_months: 20,
                    image: '/uploads/products/panadol.svg'
                },
                {
                    name: 'Ibuprofen 400mg Tablets',
                    description: 'Anti-inflammatory analgesic suitable for inflammatory pain and dysmenorrhea.',
                    category: 'Pain Relief',
                    price: 29,
                    quantity: 170,
                    discount_percent: 0,
                    bonus_buy_quantity: 10,
                    bonus_free_quantity: 1,
                    offer_note: 'Buy 10 packs and get 1 pack free.',
                    expiry_months: 22,
                    image: null
                },
                {
                    name: 'Cough Relief Syrup 120ml',
                    description: 'Soothing syrup for dry and productive cough with balanced expectorant profile.',
                    category: 'Cold and Flu',
                    price: 42,
                    quantity: 140,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Winter demand promotion.',
                    expiry_months: 16,
                    image: null
                },
                {
                    name: 'Azithromycin 500mg',
                    description: 'Macrolide antibiotic pack for physician-prescribed respiratory and ENT infections.',
                    category: 'Antibiotics',
                    price: 96,
                    quantity: 90,
                    discount_percent: 4,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Traceable batch and fast replenishment lane.',
                    expiry_months: 18,
                    image: null
                },
                {
                    name: 'Amoxicillin 1g',
                    description: 'Broad-spectrum penicillin antibiotic for common bacterial infections.',
                    category: 'Antibiotics',
                    price: 74,
                    quantity: 110,
                    discount_percent: 0,
                    bonus_buy_quantity: 5,
                    bonus_free_quantity: 1,
                    offer_note: 'Buy 5 packs and receive 1 free pack.',
                    expiry_months: 20,
                    image: null
                },
                {
                    name: 'Omeprazole 20mg Capsules',
                    description: 'Proton pump inhibitor to reduce gastric acid and support reflux management.',
                    category: 'Digestive Care',
                    price: 58,
                    quantity: 130,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Consistent margin support for chronic-care demand.',
                    expiry_months: 24,
                    image: null
                },
                {
                    name: 'Metformin 850mg',
                    description: 'First-line oral antidiabetic for glycemic control in type 2 diabetes.',
                    category: 'Diabetes Care',
                    price: 44,
                    quantity: 160,
                    discount_percent: 6,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Priority fill for repeat chronic orders.',
                    expiry_months: 26,
                    image: null
                },
                {
                    name: 'Atorvastatin 20mg',
                    description: 'Lipid-lowering therapy for cholesterol management and cardiovascular risk reduction.',
                    category: 'Cardio Care',
                    price: 82,
                    quantity: 120,
                    discount_percent: 0,
                    bonus_buy_quantity: 6,
                    bonus_free_quantity: 1,
                    offer_note: 'Buy 6 packs and get 1 pack free.',
                    expiry_months: 28,
                    image: null
                },
                {
                    name: 'Vitamin C 1000mg Effervescent',
                    description: 'High-strength vitamin C tablets to support immune function and recovery.',
                    category: 'Vitamins',
                    price: 55,
                    quantity: 210,
                    discount_percent: 15,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Top seller campaign discount.',
                    expiry_months: 18,
                    image: '/uploads/products/vitaminc.svg'
                },
                {
                    name: 'Omega 3 1000mg Softgels',
                    description: 'EPA and DHA supplement for cardiovascular and cognitive wellness support.',
                    category: 'Supplements',
                    price: 99,
                    quantity: 150,
                    discount_percent: 12,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Bundle deal for nutritional shelves.',
                    expiry_months: 24,
                    image: '/uploads/products/omega3.svg'
                },
                {
                    name: 'ContraCaps IBS Relief',
                    description: 'Targeted digestive support formula for bloating and abdominal discomfort.',
                    category: 'Digestive Care',
                    price: 37,
                    quantity: 100,
                    discount_percent: 0,
                    bonus_buy_quantity: 4,
                    bonus_free_quantity: 1,
                    offer_note: 'Buy 4 packs and get 1 free.',
                    expiry_months: 17,
                    image: '/uploads/products/contracaps.svg'
                },
                // Egyptian Market Medicines - Warehouse 1
                {
                    name: 'Novaldol 500mg Tablets',
                    description: 'مسكن للآلام وخافض للحرارة من الجيل الجديد',
                    category: 'Pain Relief',
                    price: 15,
                    quantity: 250,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'سعر خاص للصيدليات',
                    expiry_months: 24,
                    image: '/uploads/products/novaldol.svg'
                },
                {
                    name: 'Nurofen 400mg Capsules',
                    description: 'مسكن للآلام ومضاد للالتهاب غير ستيرويدي',
                    category: 'Pain Relief',
                    price: 48,
                    quantity: 180,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'موسم الشتاء',
                    expiry_months: 20,
                    image: '/uploads/products/nurofen.svg'
                },
                {
                    name: 'Lasix 40mg Tablets',
                    description: 'مدر للبول قوي treats fluid retention and hypertension',
                    category: 'Cardio Care',
                    price: 32,
                    quantity: 150,
                    discount_percent: 8,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/lasix.svg'
                },
                {
                    name: 'Glucophage 500mg Tablets',
                    description: 'علاج السكر من النوع الثاني',
                    category: 'Diabetes Care',
                    price: 38,
                    quantity: 200,
                    discount_percent: 12,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'علاج مزمن',
                    expiry_months: 26,
                    image: '/uploads/products/glucophage.svg'
                },
                {
                    name: 'Norvasc 5mg Tablets',
                    description: 'علاج ارتفاع ضغط الدم والذبحة الصدرية',
                    category: 'Cardio Care',
                    price: 65,
                    quantity: 120,
                    discount_percent: 0,
                    bonus_buy_quantity: 5,
                    bonus_free_quantity: 1,
                    offer_note: 'اشترى 5 احصل على 1 مجاناً',
                    expiry_months: 24,
                    image: '/uploads/products/norvasc.svg'
                },
                {
                    name: 'Tritace 5mg Tablets',
                    description: 'مثبط ACE进行治疗 ارتفاع ضغط الدم',
                    category: 'Cardio Care',
                    price: 72,
                    quantity: 100,
                    discount_percent: 6,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/tritace.svg'
                },
                {
                    name: 'Nexium 20mg Tablets',
                    description: 'مثبط مضخة البروتون для лечения язвы и рефлюкса',
                    category: 'Digestive Care',
                    price: 85,
                    quantity: 140,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'الجيل الجديد من العلاج',
                    expiry_months: 20,
                    image: '/uploads/products/nexium.svg'
                },
                {
                    name: 'Augmentin 1g Tablets',
                    description: 'مضاد حيوي واسع الطيف من مجموعة البنسيلين',
                    category: 'Antibiotics',
                    price: 120,
                    quantity: 90,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'يتطلب وصفة طبية',
                    expiry_months: 18,
                    image: '/uploads/products/augmentin.svg'
                },
                {
                    name: 'Zinnat 500mg Tablets',
                    description: 'مضاد حيوي من مجموعة السيفالوسبورينات',
                    category: 'Antibiotics',
                    price: 95,
                    quantity: 110,
                    discount_percent: 4,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 20,
                    image: '/uploads/products/zinnat.svg'
                },
                {
                    name: 'Flagyl 500mg Tablets',
                    description: 'مضاد للجراثيم والاوليات',
                    category: 'Antibiotics',
                    price: 28,
                    quantity: 160,
                    discount_percent: 7,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/flagyl.svg'
                },
                {
                    name: 'Ventolin Inhaler',
                    description: 'موسع للشعب الهوائية للربو والتهاب الشعب الهوائية',
                    category: 'Respiratory',
                    price: 95,
                    quantity: 80,
                    discount_percent: 0,
                    bonus_buy_quantity: 3,
                    bonus_free_quantity: 1,
                    offer_note: 'اشترى 3 احصل على 1 مجاناً',
                    expiry_months: 18,
                    image: '/uploads/products/ventolin.svg'
                },
                {
                    name: 'Rhinocort Nasal Spray',
                    description: 'كورتيزون الانف для лечения аллергического ринита',
                    category: 'Allergy',
                    price: 78,
                    quantity: 90,
                    discount_percent: 8,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'حمى القش',
                    expiry_months: 16,
                    image: '/uploads/products/rhinocort.svg'
                },
                {
                    name: 'Alaudy Syrup 120ml',
                    description: 'شراب للكحة للاطفال والبالغين',
                    category: 'Cold and Flu',
                    price: 35,
                    quantity: 200,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'الاطفال + الكبار',
                    expiry_months: 14,
                    image: '/uploads/products/alaudy.svg'
                },
                {
                    name: 'Brufen 600mg Tablets',
                    description: 'مسكن للآلام ومضاد للالتهاب',
                    category: 'Pain Relief',
                    price: 25,
                    quantity: 220,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/brufen.svg'
                },
                {
                    name: 'Ciprofloxacin 500mg',
                    description: 'مضاد حيوي للعدوى البكتيرية الشديدة',
                    category: 'Antibiotics',
                    price: 45,
                    quantity: 130,
                    discount_percent: 6,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 20,
                    image: '/uploads/products/cipro.svg'
                }
            ]
        },
        {
            username: 'warehouse2',
            email: 'warehouse2@test.com',
            phone: '01000000002',
            address: 'Alexandria',
            products: [
                {
                    name: 'Paracetamol Pediatric Suspension 120ml',
                    description: 'Child-friendly fever and pain syrup with accurate dosing profile.',
                    category: 'Pediatric Care',
                    price: 27,
                    quantity: 190,
                    discount_percent: 7,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Pediatric essentials campaign.',
                    expiry_months: 18,
                    image: null
                },
                {
                    name: 'Cetirizine 10mg Tablets',
                    description: 'Daily antihistamine for allergic rhinitis, urticaria, and seasonal allergy control.',
                    category: 'Allergy',
                    price: 34,
                    quantity: 200,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'High-turnover allergy support discount.',
                    expiry_months: 26,
                    image: null
                },
                {
                    name: 'Salbutamol Inhaler 100mcg',
                    description: 'Short-acting bronchodilator inhaler for rapid bronchospasm relief.',
                    category: 'Respiratory',
                    price: 88,
                    quantity: 95,
                    discount_percent: 0,
                    bonus_buy_quantity: 5,
                    bonus_free_quantity: 1,
                    offer_note: 'Buy 5 units and get 1 unit free.',
                    expiry_months: 20,
                    image: null
                },
                {
                    name: 'Montelukast 10mg',
                    description: 'Leukotriene receptor antagonist for asthma and allergic rhinitis maintenance.',
                    category: 'Respiratory',
                    price: 79,
                    quantity: 120,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Chronic-care protection pricing.',
                    expiry_months: 24,
                    image: null
                },
                {
                    name: 'Clotrimazole Cream 1% 20g',
                    description: 'Topical antifungal cream for dermatophyte and candida skin infections.',
                    category: 'Dermatology',
                    price: 46,
                    quantity: 140,
                    discount_percent: 0,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 21,
                    image: null
                },
                {
                    name: 'Mupirocin Ointment 2% 15g',
                    description: 'Topical antibacterial ointment for localized skin bacterial infection management.',
                    category: 'Dermatology',
                    price: 63,
                    quantity: 90,
                    discount_percent: 0,
                    bonus_buy_quantity: 3,
                    bonus_free_quantity: 1,
                    offer_note: 'Buy 3 tubes and get 1 tube free.',
                    expiry_months: 16,
                    image: null
                },
                {
                    name: 'Iron plus Folic Acid Capsules',
                    description: 'Hematologic support supplement for iron deficiency and maternal care needs.',
                    category: 'Womens Health',
                    price: 52,
                    quantity: 165,
                    discount_percent: 12,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Maternal care line promotion.',
                    expiry_months: 19,
                    image: null
                },
                {
                    name: 'Calcium plus Vitamin D3 Tablets',
                    description: 'Bone health formula for osteoporosis support and preventive supplementation.',
                    category: 'Supplements',
                    price: 68,
                    quantity: 150,
                    discount_percent: 0,
                    bonus_buy_quantity: 8,
                    bonus_free_quantity: 1,
                    offer_note: 'Buy 8 bottles and receive 1 free.',
                    expiry_months: 25,
                    image: null
                },
                {
                    name: 'Oral Rehydration Salts Sachets',
                    description: 'Electrolyte replacement sachets for dehydration management during GI loss.',
                    category: 'First Aid',
                    price: 21,
                    quantity: 300,
                    discount_percent: 6,
                    bonus_buy_quantity: 10,
                    bonus_free_quantity: 2,
                    offer_note: 'Bulk emergency care package.',
                    expiry_months: 30,
                    image: null
                },
                {
                    name: 'Zinc 50mg Tablets',
                    description: 'Mineral support formula for immune function and post-illness recovery.',
                    category: 'Vitamins',
                    price: 39,
                    quantity: 220,
                    discount_percent: 9,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Volume rebate for chain pharmacies.',
                    expiry_months: 23,
                    image: null
                },
                {
                    name: 'Antiseptic Wound Spray 100ml',
                    description: 'Broad-use antiseptic for first-aid wound cleansing and infection prevention.',
                    category: 'First Aid',
                    price: 57,
                    quantity: 130,
                    discount_percent: 6,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'First-aid shelf support campaign.',
                    expiry_months: 18,
                    image: null
                },
                {
                    name: 'Probiotic Capsules 10B CFU',
                    description: 'Gut microbiome support capsules for antibiotic-associated GI disturbance.',
                    category: 'Digestive Care',
                    price: 73,
                    quantity: 125,
                    discount_percent: 8,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'Digestive care seasonal promotion.',
                    expiry_months: 20,
                    image: null
                },
                // Egyptian Market Medicines - Warehouse 2
                {
                    name: 'Panadol Cold & Flu',
                    description: 'بانادول زكام وانفلونزا للاعراض الشائعة',
                    category: 'Cold and Flu',
                    price: 42,
                    quantity: 200,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'موسم الشتاء',
                    expiry_months: 18,
                    image: '/uploads/products/panadolflu.svg'
                },
                {
                    name: 'Strepsils Honey & Lemon',
                    description: 'حبوب استحلاب للتهاب الحلق',
                    category: 'Cold and Flu',
                    price: 38,
                    quantity: 250,
                    discount_percent: 12,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'العلامة التجارية الاكثر طلباً',
                    expiry_months: 20,
                    image: '/uploads/products/strepsils.svg'
                },
                {
                    name: 'Otrivin Nasal Spray',
                    description: 'مزيل لاحتقان الانف',
                    category: 'Cold and Flu',
                    price: 45,
                    quantity: 180,
                    discount_percent: 8,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 18,
                    image: '/uploads/products/otrivin.svg'
                },
                {
                    name: 'Rennie Tablets',
                    description: 'اقراض للمعدة للتخلص من الحموضة',
                    category: 'Digestive Care',
                    price: 32,
                    quantity: 220,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/rennie.svg'
                },
                {
                    name: 'Maalox Suspension',
                    description: 'معلق للمعدة للتخلص من الحموضة وعسر الهضم',
                    category: 'Digestive Care',
                    price: 28,
                    quantity: 190,
                    discount_percent: 7,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 16,
                    image: '/uploads/products/maalox.svg'
                },
                {
                    name: 'Motilium 10mg Tablets',
                    description: 'دواء للقيء والغثيان وعسر الهضم',
                    category: 'Digestive Care',
                    price: 52,
                    quantity: 150,
                    discount_percent: 6,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/motilium.svg'
                },
                {
                    name: 'Euthyrox 50mcg Tablets',
                    description: 'علاج نقص الغدة الدرقية',
                    category: 'Thyroid',
                    price: 48,
                    quantity: 180,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'علاج مزمن',
                    expiry_months: 24,
                    image: '/uploads/products/euthyrox.svg'
                },
                {
                    name: 'Aldactone 25mg Tablets',
                    description: 'مدر للبول موفر للبوتاسيوم',
                    category: 'Cardio Care',
                    price: 38,
                    quantity: 140,
                    discount_percent: 8,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/aldactone.svg'
                },
                {
                    name: 'Lisinopril 10mg Tablets',
                    description: 'مثبط ACE لارتفاع ضغط الدم',
                    category: 'Cardio Care',
                    price: 35,
                    quantity: 160,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 24,
                    image: '/uploads/products/lisinopril.svg'
                },
                {
                    name: 'Losartan 50mg Tablets',
                    description: 'حاصر لمستقبلات الانجيوتنسين لارتفاع ضغط الدم',
                    category: 'Cardio Care',
                    price: 42,
                    quantity: 150,
                    discount_percent: 7,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 22,
                    image: '/uploads/products/losartan.svg'
                },
                {
                    name: 'Atorva 20mg Tablets',
                    description: 'ستاتين لخفض الكوليسترول',
                    category: 'Cardio Care',
                    price: 55,
                    quantity: 130,
                    discount_percent: 10,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 24,
                    image: '/uploads/products/atorva.svg'
                },
                {
                    name: 'Crestor 10mg Tablets',
                    description: 'ستاتين قوي لخفض الكوليسترول',
                    category: 'Cardio Care',
                    price: 120,
                    quantity: 90,
                    discount_percent: 8,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 20,
                    image: '/uploads/products/crestor.svg'
                },
                {
                    name: 'Lyrica 75mg Capsules',
                    description: 'علاج للصرع والالم العصبي',
                    category: 'Neurology',
                    price: 180,
                    quantity: 60,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'يتطلب وصفة طبية',
                    expiry_months: 18,
                    image: '/uploads/products/lyrica.svg'
                },
                {
                    name: 'Sirdalud 4mg Tablets',
                    description: 'مرخ للعضلات للالتواءات والتشنجات',
                    category: 'Pain Relief',
                    price: 45,
                    quantity: 140,
                    discount_percent: 6,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: null,
                    expiry_months: 20,
                    image: '/uploads/products/sirdalud.svg'
                },
                {
                    name: 'Xarelto 20mg Tablets',
                    description: 'مميع الدم للوقاية من الجلطات',
                    category: 'Cardio Care',
                    price: 350,
                    quantity: 40,
                    discount_percent: 5,
                    bonus_buy_quantity: 0,
                    bonus_free_quantity: 0,
                    offer_note: 'يتطلب وصفة طبية',
                    expiry_months: 16,
                    image: '/uploads/products/xarelto.svg'
                }
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
        if (err) {
            console.error('Error checking admin:', err);
            return;
        }
        if (row) {
            return;
        }

        const hashedPassword = bcrypt.hashSync('admin123', 10);

        // Insert admin
        db.run(
            `INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
            ['admin', 'admin@curalink.com', hashedPassword, '0123456789', 'Cairo', 'admin'],
            function(insertAdminError) {
                if (insertAdminError) {
                    console.error('Error inserting admin:', insertAdminError);
                } else {
                    console.log('Admin user created');
                }
            }
        );

        // Insert sample warehouses and their products
        warehouses.forEach((warehouse) => {
            const hashedPw = bcrypt.hashSync('warehouse123', 10);

            db.run(
                `INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
                [warehouse.username, warehouse.email, hashedPw, warehouse.phone, warehouse.address, 'warehouse'],
                function(insertWarehouseError) {
                    if (insertWarehouseError) {
                        console.error('Error inserting warehouse:', insertWarehouseError);
                        return;
                    }

                    const warehouseId = this.lastID;

                    warehouse.products.forEach((product) => {
                        const expiryDate = new Date();
                        expiryDate.setMonth(expiryDate.getMonth() + (product.expiry_months || 18));

                        db.run(
                            `INSERT INTO products (
                                warehouse_id, name, description, category, price, quantity,
                                active_ingredient, discount_percent, bonus_buy_quantity, bonus_free_quantity, offer_note, expiry_date, image
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                warehouseId,
                                product.name,
                                product.description,
                                product.category,
                                product.price,
                                product.quantity,
                                product.active_ingredient || null,
                                product.discount_percent || 0,
                                product.bonus_buy_quantity || 0,
                                product.bonus_free_quantity || 0,
                                product.offer_note || null,
                                expiryDate.toISOString().split('T')[0],
                                product.image || null
                            ],
                            (insertProductError) => {
                                if (insertProductError) {
                                    console.error('Error inserting product:', insertProductError);
                                }
                            }
                        );
                    });
                }
            );
        });

        // Insert sample pharmacies
        pharmacies.forEach((pharmacy) => {
            const hashedPw = bcrypt.hashSync('pharmacy123', 10);

            db.run(
                `INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
                [pharmacy.username, pharmacy.email, hashedPw, pharmacy.phone, pharmacy.address, 'pharmacy'],
                function(insertPharmacyError) {
                    if (insertPharmacyError) {
                        console.error('Error inserting pharmacy:', insertPharmacyError);
                    }
                }
            );
        });

        console.log('Sample data inserted');
    });
}

module.exports = db;
