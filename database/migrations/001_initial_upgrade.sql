-- CuraLink Database Migration - Phase 1 Upgrade
-- Adds new tables for enhanced features

-- ========================================
-- Audit Logs
-- ========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ========================================
-- Categories
-- ========================================
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    name_en TEXT,
    description TEXT,
    parent_id INTEGER,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- Insert default categories
INSERT OR IGNORE INTO categories (name, name_en, description, sort_order) VALUES
('أدوية القلب', 'Cardiac Medicines', 'أدوية لعلاج أمراض القلب والأوعية الدموية', 1),
('أدوية السكر', 'Diabetes Medicines', 'أدوية لعلاج مرض السكري', 2),
('المضادات الحيوية', 'Antibiotics', 'المضادات الحيوية والأدوية المضادة للبكتيريا', 3),
('المسكنات', 'Pain Relievers', 'أدوية تسكين الألم والالتهابات', 4),
('فيتامينات ومكملات', 'Vitamins & Supplements', 'الفيتامينات والمكملات الغذائية', 5),
('مستحضرات تجميل', 'Cosmetics', 'المستحضرات التجميلية والعناية بالبشرة', 6),
('مستلزمات طبية', 'Medical Supplies', 'المستلزمات والأدوات الطبية', 7);

-- ========================================
-- Product Images
-- ========================================
CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);

-- ========================================
-- Inventory Logs
-- ========================================
CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'in', 'out', 'adjustment', 'return'
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    reference_type TEXT, -- 'order', 'adjustment', 'return'
    reference_id INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_warehouse_id ON inventory_logs(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);

-- ========================================
-- Order Events (Audit trail for orders)
-- ========================================
CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    event_type TEXT NOT NULL, -- 'status_change', 'created', 'cancelled', 'note_added'
    from_status TEXT,
    to_status TEXT,
    actor_user_id INTEGER,
    actor_role TEXT,
    message TEXT,
    meta_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_event_type ON order_events(event_type);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);

-- ========================================
-- Messages (Chat system)
-- ========================================
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    order_id INTEGER,
    content TEXT NOT NULL,
    attachments TEXT, -- JSON array of file URLs
    is_read INTEGER DEFAULT 0,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- ========================================
-- Payment Methods
-- ========================================
CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'credit_card', 'bank_transfer', 'cash', 'wallet'
    provider TEXT, -- 'visa', 'mastercard', 'meeza', etc.
    last_four TEXT,
    expiry_month TEXT,
    expiry_year TEXT,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    metadata TEXT, -- JSON for additional data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON payment_methods(type);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

-- ========================================
-- Transactions
-- ========================================
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    invoice_id INTEGER,
    order_id INTEGER,
    type TEXT NOT NULL, -- 'payment', 'refund', 'commission', 'adjustment'
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EGP',
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
    payment_method_id INTEGER,
    gateway_reference TEXT, -- Payment gateway transaction ID
    gateway_response TEXT, -- JSON response from gateway
    description TEXT,
    metadata TEXT, -- JSON for additional data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- ========================================
-- User Sessions
-- ========================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    device_info TEXT,
    is_active INTEGER DEFAULT 1,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- ========================================
-- System Settings
-- ========================================
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- Insert default settings
INSERT OR IGNORE INTO system_settings (key, value, description, is_public) VALUES
('commission_rate', '10', 'نسبة العمولة الافتراضية (%)', 1),
('cancellation_window_minutes', '120', 'الفترة المسموحة لإلغاء الطلب (دقيقة)', 1),
('low_stock_threshold', '10', 'حد التنبيه لنقص المخزون', 1),
('expiry_alert_days', '30', 'عدد الأيام للتنبيه قبل انتهاء الصلاحية', 1),
('max_upload_size_mb', '10', 'الحد الأقصى لحجم الملفات المرفوعة (ميجابايت)', 1),
('maintenance_mode', 'false', 'وضع الصيانة', 0),
('allow_registration', 'true', 'السماح بالتسجيل', 1);

-- ========================================
-- Activity Log
-- ========================================
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT, -- 'product', 'order', 'user', etc.
    entity_id INTEGER,
    old_values TEXT, -- JSON
    new_values TEXT, -- JSON
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

-- ========================================
-- Add columns to existing tables
-- ========================================

-- Add columns to users table
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN preferences TEXT; -- JSON
ALTER TABLE users ADD COLUMN last_login_at DATETIME;
ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN verified_by INTEGER;
ALTER TABLE users ADD COLUMN verified_at DATETIME;
ALTER TABLE users ADD COLUMN business_license TEXT;
ALTER TABLE users ADD COLUMN tax_number TEXT;

-- Add columns to products table
ALTER TABLE products ADD COLUMN category_id INTEGER;
ALTER TABLE products ADD COLUMN subcategory_id INTEGER;
ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'piece'; -- piece, box, strip, etc.
ALTER TABLE products ADD COLUMN weight REAL;
ALTER TABLE products ADD COLUMN dimensions TEXT; -- JSON: {length, width, height}
ALTER TABLE products ADD COLUMN manufacturer TEXT;
ALTER TABLE products ADD COLUMN country_of_origin TEXT;
ALTER TABLE products ADD COLUMN storage_conditions TEXT;
ALTER TABLE products ADD COLUMN side_effects TEXT;
ALTER TABLE products ADD COLUMN contraindications TEXT;
ALTER TABLE products ADD COLUMN warnings TEXT;
ALTER TABLE products ADD COLUMN is_prescription_required INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN sales_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN rating_average REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN rating_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN tags TEXT; -- JSON array
ALTER TABLE products ADD COLUMN meta_title TEXT;
ALTER TABLE products ADD COLUMN meta_description TEXT;

-- Add columns to orders table
ALTER TABLE orders ADD COLUMN order_number TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN subtotal REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN notes TEXT;
ALTER TABLE orders ADD COLUMN internal_notes TEXT;
ALTER TABLE orders ADD COLUMN delivery_address TEXT;
ALTER TABLE orders ADD COLUMN delivery_date DATE;
ALTER TABLE orders ADD COLUMN delivery_time_slot TEXT;
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN shipping_carrier TEXT;
ALTER TABLE orders ADD COLUMN cancelled_at DATETIME;
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN cancelled_by INTEGER;
ALTER TABLE orders ADD COLUMN delivered_at DATETIME;
ALTER TABLE orders ADD COLUMN delivered_by INTEGER;
ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN payment_method TEXT;
ALTER TABLE orders ADD COLUMN priority TEXT DEFAULT 'normal';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);

-- Update existing orders with order numbers
UPDATE orders SET order_number = 'ORD-' || printf('%06d', id) WHERE order_number IS NULL;

-- ========================================
-- Triggers for automatic updates
-- ========================================

-- Trigger to update product rating average
CREATE TRIGGER IF NOT EXISTS update_product_rating_after_insert
AFTER INSERT ON ratings
BEGIN
    UPDATE products 
    SET rating_average = (
        SELECT AVG(rating) FROM ratings WHERE product_id = NEW.product_id
    ),
    rating_count = (
        SELECT COUNT(*) FROM ratings WHERE product_id = NEW.product_id
    )
    WHERE id = NEW.product_id;
END;

-- Trigger to update order updated_at
CREATE TRIGGER IF NOT EXISTS update_order_timestamp
AFTER UPDATE ON orders
BEGIN
    UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to log inventory changes
CREATE TRIGGER IF NOT EXISTS log_inventory_change
AFTER UPDATE OF quantity ON products
WHEN OLD.quantity != NEW.quantity
BEGIN
    INSERT INTO inventory_logs (
        product_id, warehouse_id, type, quantity,
        previous_quantity, new_quantity, reason, created_at
    ) VALUES (
        NEW.id, NEW.warehouse_id,
        CASE WHEN NEW.quantity > OLD.quantity THEN 'in' ELSE 'out' END,
        ABS(NEW.quantity - OLD.quantity),
        OLD.quantity, NEW.quantity,
        'Automatic inventory tracking',
        CURRENT_TIMESTAMP
    );
END;