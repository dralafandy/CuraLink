-- ============================================
-- CuraLink Complete Database Setup
-- Run this SQL in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Base Tables (from supabase-schema.sql)
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    role TEXT NOT NULL CHECK(role IN ('admin', 'warehouse', 'pharmacy')),
    rating REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    pharmacy_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_amount REAL NOT NULL,
    commission REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at TIMESTAMP WITH TIME ZONE,
    cancellable_until TIMESTAMP WITH TIME ZONE,
    expected_delivery_date DATE,
    pharmacy_note TEXT,
    warehouse_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    commission REAL NOT NULL,
    net_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled')),
    paid_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Invoice payments table
CREATE TABLE IF NOT EXISTS invoice_payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    payment_method TEXT,
    reference TEXT,
    note TEXT,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment gateway configs table
CREATE TABLE IF NOT EXISTS payment_gateway_configs (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ratings table
CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Wishlist table
CREATE TABLE IF NOT EXISTS wishlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error', 'order', 'payment')),
    is_read INTEGER DEFAULT 0,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Migration 001: Initial Upgrade
-- ============================================

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_en TEXT,
    description TEXT,
    parent_id INTEGER,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- Insert default categories
INSERT INTO categories (name, name_en, description, sort_order) VALUES
('أدوية القلب', 'Cardiac Medicines', 'أدوية进行治疗心脏和血管疾病的药物', 1),
('أدوية السكر', 'Diabetes Medicines', '治疗糖尿病的药物', 2),
('المضادات الحيوية', 'Antibiotics', '抗生素和抗菌药物', 3),
('المسكنات', 'Pain Relievers', '止痛和消炎药', 4),
('فيتامينات ومكملات', 'Vitamins & Supplements', '维生素和膳食补充剂', 5),
('مستحضرات تجميل', 'Cosmetics', '化妆品和护肤产品', 6),
('مستلزمات طبية', 'Medical Supplies', '医疗用品和工具', 7)
ON CONFLICT (name) DO NOTHING;

-- Product Images
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);

-- Inventory Logs
CREATE TABLE IF NOT EXISTS inventory_logs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    reference_type TEXT,
    reference_id INTEGER,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_warehouse_id ON inventory_logs(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);

-- Order Events
CREATE TABLE IF NOT EXISTS order_events (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    actor_user_id INTEGER,
    actor_role TEXT,
    message TEXT,
    meta_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_event_type ON order_events(event_type);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    order_id INTEGER,
    content TEXT NOT NULL,
    attachments TEXT,
    is_read INTEGER DEFAULT 0,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Payment Methods
CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    provider TEXT,
    last_four TEXT,
    expiry_month TEXT,
    expiry_year TEXT,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON payment_methods(type);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    invoice_id INTEGER,
    order_id INTEGER,
    type TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EGP',
    status TEXT DEFAULT 'pending',
    payment_method_id INTEGER,
    gateway_reference TEXT,
    gateway_response TEXT,
    description TEXT,
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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

-- User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    device_info TEXT,
    is_active INTEGER DEFAULT 1,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    updated_by INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

INSERT INTO system_settings (key, value, description, is_public) VALUES
('commission_rate', '10', '默认佣金率 (%)', 1),
('cancellation_window_minutes', '120', '允许取消订单的时间（分钟）', 1),
('low_stock_threshold', '10', '库存不足警报阈值', 1),
('expiry_alert_days', '30', '到期前提醒天数', 1),
('max_upload_size_mb', '10', '最大上传文件大小（MB）', 1),
('maintenance_mode', 'false', '维护模式', 0),
('allow_registration', 'true', '允许注册', 1)
ON CONFLICT (key) DO NOTHING;

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

-- Add columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_license TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS zone TEXT;

-- Add columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'piece';
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight REAL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS country_of_origin TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS storage_conditions TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS side_effects TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS contraindications TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warnings TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_prescription_required INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_average REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT;

-- Add columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time_slot TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_by INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);
CREATE INDEX IF NOT EXISTS idx_users_zone ON users(zone);

-- ============================================
-- 3. Migration 003: Advanced B2B Features
-- ============================================

-- GPS Locations Table
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    is_primary INTEGER DEFAULT 0,
    location_type TEXT CHECK(location_type IN ('warehouse', 'pharmacy', 'delivery_point')),
    phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add GPS coordinates to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude REAL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_address TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_users_coords ON users(latitude, longitude);

-- Contracts Table
CREATE TABLE IF NOT EXISTS contracts (
    id SERIAL PRIMARY KEY,
    pharmacy_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contract_number TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('draft', 'active', 'expired', 'terminated', 'suspended')),
    discount_percent REAL DEFAULT 0,
    credit_limit REAL DEFAULT 0,
    payment_terms INTEGER DEFAULT 30,
    auto_renew INTEGER DEFAULT 0,
    terms TEXT,
    signed_by_pharmacy INTEGER DEFAULT 0,
    signed_by_warehouse INTEGER DEFAULT 0,
    signed_at_pharmacy TIMESTAMP WITH TIME ZONE,
    signed_at_warehouse TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contract_products (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    agreed_price REAL NOT NULL,
    min_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contract_history (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by INTEGER REFERENCES users(id),
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contracts_pharmacy ON contracts(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_contracts_warehouse ON contracts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    pharmacy_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'cancelled', 'completed')),
    next_delivery_date DATE,
    preferred_delivery_day INTEGER CHECK(preferred_delivery_day BETWEEN 0 AND 6),
    preferred_delivery_time TEXT,
    notes TEXT,
    total_orders INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_items (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_orders (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_pharmacy ON subscriptions(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_warehouse ON subscriptions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_delivery ON subscriptions(next_delivery_date);

-- Tenders Table
CREATE TABLE IF NOT EXISTS tenders (
    id SERIAL PRIMARY KEY,
    pharmacy_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('draft', 'open', 'closed', 'awarded', 'cancelled')),
    required_by_date DATE,
    delivery_location_id INTEGER REFERENCES locations(id),
    terms TEXT,
    visibility TEXT DEFAULT 'public' CHECK(visibility IN ('public', 'invited')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tender_items (
    id SERIAL PRIMARY KEY,
    tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit TEXT,
    specifications TEXT
);

CREATE TABLE IF NOT EXISTS tender_bids (
    id SERIAL PRIMARY KEY,
    tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_amount REAL NOT NULL,
    delivery_days INTEGER,
    validity_days INTEGER DEFAULT 7,
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tender_bid_items (
    id SERIAL PRIMARY KEY,
    bid_id INTEGER NOT NULL REFERENCES tender_bids(id) ON DELETE CASCADE,
    tender_item_id INTEGER NOT NULL REFERENCES tender_items(id) ON DELETE CASCADE,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS tender_invites (
    id SERIAL PRIMARY KEY,
    tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    viewed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tender_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_tenders_pharmacy ON tenders(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status);
CREATE INDEX IF NOT EXISTS idx_tender_bids_tender ON tender_bids(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_bids_warehouse ON tender_bids(warehouse_id);

-- Loyalty Points System
CREATE TABLE IF NOT EXISTS loyalty_points (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    points_used INTEGER NOT NULL DEFAULT 0,
    points_expired INTEGER NOT NULL DEFAULT 0,
    tier TEXT DEFAULT 'bronze' CHECK(tier IN ('bronze', 'silver', 'gold', 'platinum')),
    tier_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('earned', 'redeemed', 'expired', 'bonus', 'adjustment')),
    reference_type TEXT,
    reference_id INTEGER,
    description TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL,
    reward_type TEXT NOT NULL CHECK(reward_type IN ('discount', 'free_shipping', 'product', 'cashback')),
    reward_value REAL,
    image TEXT,
    active INTEGER DEFAULT 1,
    stock INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id INTEGER NOT NULL REFERENCES loyalty_rewards(id),
    points_used INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'fulfilled', 'cancelled')),
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_user ON loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_expires ON loyalty_transactions(expires_at);

-- Advanced Analytics Tables
CREATE TABLE IF NOT EXISTS daily_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_role TEXT,
    stat_date DATE NOT NULL,
    orders_count INTEGER DEFAULT 0,
    orders_amount REAL DEFAULT 0,
    products_sold INTEGER DEFAULT 0,
    new_customers INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, stat_date)
);

CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);

-- Insert sample loyalty rewards
INSERT INTO loyalty_rewards (name, description, points_required, reward_type, reward_value, active) VALUES
('5% Discount', '5% discount on next order', 100, 'discount', 5, 1),
('10% Discount', '10% discount on next order', 200, 'discount', 10, 1),
('Free Shipping', 'Free shipping on next order', 150, 'free_shipping', 0, 1),
('50 EGP Cashback', '50 EGP cashback', 500, 'cashback', 50, 1),
('100 EGP Cashback', '100 EGP cashback', 900, 'cashback', 100, 1)
ON CONFLICT DO NOTHING;

-- Initialize loyalty points for existing users
INSERT INTO loyalty_points (user_id, points, tier)
SELECT id, 0, 'bronze' FROM users WHERE role IN ('pharmacy', 'warehouse')
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 4. Migration 004: Geographic Zones and Locations
-- ============================================

-- Governorates Table (المحافظات)
CREATE TABLE IF NOT EXISTS governorates (
    id SERIAL PRIMARY KEY,
    name_ar TEXT NOT NULL UNIQUE,
    name_en TEXT,
    latitude REAL,
    longitude REAL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cities Table (المدن)
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    governorate_id INTEGER NOT NULL REFERENCES governorates(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    latitude REAL,
    longitude REAL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Districts Table (الأحياء/المراكز)
CREATE TABLE IF NOT EXISTS districts (
    id SERIAL PRIMARY KEY,
    city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    postal_code TEXT,
    latitude REAL,
    longitude REAL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to locations table
ALTER TABLE locations ADD COLUMN IF NOT EXISTS governorate_id INTEGER;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS city_id INTEGER;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS district_id INTEGER;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS building_number TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS floor_number TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS apartment_number TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_verified INTEGER DEFAULT 0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;

-- Delivery Zones Table (نطاقات التوصيل)
CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    governorate_id INTEGER REFERENCES governorates(id) ON DELETE SET NULL,
    city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
    district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
    zone_type TEXT DEFAULT 'radius' CHECK(zone_type IN ('radius', 'polygon', 'administrative')),
    radius_km REAL DEFAULT 50,
    base_fee REAL DEFAULT 0,
    per_km_fee REAL DEFAULT 0,
    min_order_amount REAL DEFAULT 0,
    free_delivery_threshold REAL DEFAULT 0,
    estimated_delivery_hours INTEGER DEFAULT 24,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_cities_governorate ON cities(governorate_id);
CREATE INDEX IF NOT EXISTS idx_districts_city ON districts(city_id);
CREATE INDEX IF NOT EXISTS idx_locations_governorate ON locations(governorate_id);
CREATE INDEX IF NOT EXISTS idx_locations_city ON locations(city_id);
CREATE INDEX IF NOT EXISTS idx_locations_district ON locations(district_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_primary ON locations(user_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_warehouse ON delivery_zones(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_governorate ON delivery_zones(governorate_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_city ON delivery_zones(city_id);

-- Insert Egyptian Governorates
INSERT INTO governorates (id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(1, 'القاهرة', 'Cairo', 30.0444, 31.2357, 1),
(2, 'الجيزة', 'Giza', 30.0131, 31.2089, 2),
(3, 'الإسكندرية', 'Alexandria', 31.2001, 29.9187, 3),
(4, 'الدقهلية', 'Dakahlia', 31.0400, 31.3800, 4),
(5, 'الشرقية', 'Sharqia', 30.8000, 31.5200, 5),
(6, 'الغربية', 'Gharbia', 30.8200, 31.0300, 6),
(7, 'المنوفية', 'Monufia', 30.4600, 31.1700, 7),
(8, 'القليوبية', 'Qalyubia', 30.3200, 31.2400, 8),
(9, 'كفر الشيخ', 'Kafr El Sheikh', 31.3100, 30.9400, 9),
(10, 'البحيرة', 'Beheira', 30.8200, 30.5400, 10),
(11, 'أسيوط', 'Assiut', 27.1800, 31.1600, 11),
(12, 'سوهاج', 'Sohag', 26.5600, 31.6900, 12),
(13, 'المنيا', 'Minya', 28.0900, 30.7600, 13),
(14, 'بني سويف', 'Beni Suef', 29.0600, 31.1000, 14),
(15, 'الفيوم', 'Fayoum', 29.3100, 30.8500, 15),
(16, 'الإسماعيلية', 'Ismailia', 30.3700, 32.2700, 16),
(17, 'السويس', 'Suez', 29.9700, 32.5300, 17),
(18, 'بورسعيد', 'Port Said', 31.2600, 32.3000, 18),
(19, 'دمياط', 'Damietta', 31.4200, 31.8200, 19),
(20, 'شمالسيناء', 'North Sinai', 30.5300, 33.7800, 20),
(21, 'جنوبسيناء', 'South Sinai', 27.8500, 33.8500, 21),
(22, 'البحر الأحمر', 'Red Sea', 27.2000, 33.6400, 22),
(23, 'الأقصر', 'Luxor', 25.6800, 32.6400, 23),
(24, 'أسوان', 'Aswan', 24.0900, 32.9000, 24),
(25, 'الوادي الجديد', 'New Valley', 25.5000, 30.5000, 25),
(26, 'مطروح', 'Matrouh', 31.3500, 27.2500, 26),
(27, 'قنا', 'Qena', 26.1600, 32.7200, 27)
ON CONFLICT (id) DO NOTHING;

-- Insert Major Cities
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(1, 'القاهرة', 'Cairo', 30.0444, 31.2357, 1),
(1, 'حلوان', 'Helwan', 29.8600, 31.3100, 2),
(1, 'المرج', 'El Marg', 30.1500, 31.3500, 3),
(1, 'عين شمس', 'Ein Shams', 30.0800, 31.2800, 4),
(2, 'الجيزة', 'Giza', 30.0131, 31.2089, 1),
(2, 'الشيخ زايد', 'Sheikh Zayed', 30.0250, 30.8950, 2),
(2, '6 أكتوبر', '6th October', 29.9280, 30.9270, 3),
(3, 'الإسكندرية', 'Alexandria', 31.2001, 29.9187, 1),
(3, 'برج العرب', 'Borg El Arab', 30.9100, 29.6800, 2),
(4, 'المنصورة', 'Mansoura', 31.0400, 31.3800, 1),
(4, 'دكرنس', 'Dekernes', 31.1600, 31.4500, 2),
(4, 'ميت غمر', 'Mit Ghamr', 30.9500, 31.3200, 3),
(5, 'الزقازيق', 'Zagazig', 30.8000, 31.5200, 1),
(5, 'العاشر من رمضان', '10th of Ramadan', 30.9400, 31.9300, 2),
(6, 'طنطا', 'Tanta', 30.8200, 31.0300, 1),
(6, 'المحلة الكبرى', 'El Mahalla El Kubra', 30.9700, 31.1700, 2),
(7, 'شبين الكوم', 'Shiben El Kom', 30.4600, 31.1700, 1),
(8, 'بنها', 'Benha', 30.3200, 31.2400, 1),
(8, 'قليوب', 'Qalyub', 30.2500, 31.2100, 2),
(9, 'كفر الشيخ', 'Kafr El Sheikh', 31.3100, 30.9400, 1),
(10, 'دمنهور', 'Damanhour', 30.4700, 30.4700, 1),
(11, 'أسيوط', 'Assiut', 27.1800, 31.1600, 1),
(12, 'سوهاج', 'Sohag', 26.5600, 31.6900, 1),
(13, 'المنيا', 'Minya', 28.0900, 30.7600, 1),
(14, 'بني سويف', 'Beni Suef', 29.0600, 31.1000, 1),
(15, 'الفيوم', 'Fayoum', 29.3100, 30.8500, 1),
(16, 'الإسماعيلية', 'Ismailia', 30.3700, 32.2700, 1),
(17, 'السويس', 'Suez', 29.9700, 32.5300, 1),
(18, 'بورسعيد', 'Port Said', 31.2600, 32.3000, 1),
(19, 'دمياط', 'Damietta', 31.4200, 31.8200, 1),
(23, 'الأقصر', 'Luxor', 25.6800, 32.6400, 1),
(24, 'أسوان', 'Aswan', 24.0900, 32.9000, 1),
(25, 'الخارجة', 'El Kharga', 25.5000, 30.5000, 1),
(26, 'مرسى مطروح', 'Marsa Matrouh', 31.3500, 27.2500, 1),
(27, 'قنا', 'Qena', 26.1600, 32.7200, 1)
ON CONFLICT DO NOTHING;

-- Insert Sample Districts
INSERT INTO districts (city_id, name_ar, name_en, postal_code, sort_order) VALUES
(1, 'وسط القاهرة', 'Downtown Cairo', '11111', 1),
(1, 'الزمالك', 'Zamalek', '11211', 2),
(1, 'المعادي', 'Maadi', '11431', 3),
(1, 'مدينةنصر', 'Nasr City', '11765', 4),
(1, 'مصر الجديدة', 'Heliopolis', '11711', 5),
(5, 'الدقي', 'Dokki', '12311', 1),
(5, 'الشيخ زايد', 'Sheikh Zayed', '12588', 2),
(5, '6 أكتوبر', '6th October', '12566', 3),
(9, 'وسط المدينة', 'Downtown', '21111', 1),
(9, 'سموحة', 'Smouha', '21617', 2)
ON CONFLICT DO NOTHING;

-- Create Views
CREATE OR REPLACE VIEW v_governorates_cities AS
SELECT g.id as governorate_id, g.name_ar as governorate_name_ar, g.name_en as governorate_name_en,
       c.id as city_id, c.name_ar as city_name_ar, c.name_en as city_name_en
FROM governorates g
LEFT JOIN cities c ON c.governorate_id = g.id
WHERE g.is_active = 1 AND (c.is_active = 1 OR c.id IS NULL);

CREATE OR REPLACE VIEW v_cities_districts AS
SELECT c.id as city_id, c.name_ar as city_name_ar, c.name_en as city_name_en,
       d.id as district_id, d.name_ar as district_name_ar, d.name_en as district_name_en, d.postal_code
FROM cities c
LEFT JOIN districts d ON d.city_id = c.id
WHERE c.is_active = 1 AND (d.is_active = 1 OR d.id IS NULL);

CREATE OR REPLACE VIEW v_delivery_zones_with_details AS
SELECT dz.id, dz.warehouse_id, u.username as warehouse_name,
       g.name_ar as governorate_name, c.name_ar as city_name,
       dz.base_fee, dz.per_km_fee, dz.min_order_amount, dz.free_delivery_threshold,
       dz.estimated_delivery_hours, dz.is_active
FROM delivery_zones dz
LEFT JOIN users u ON u.id = dz.warehouse_id
LEFT JOIN governorates g ON g.id = dz.governorate_id
LEFT JOIN cities c ON c.id = dz.city_id;

-- Geographic Helper Function
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 REAL, lng1 REAL, lat2 REAL, lng2 REAL
)
RETURNS REAL AS $$
DECLARE
    R REAL := 6371;
    dLat REAL;
    dLng REAL;
    a REAL;
    c REAL;
BEGIN
    dLat := (lat2 - lat1) * 3.14159 / 180;
    dLng := (lng2 - lng1) * 3.14159 / 180;
    a := sin(dLat/2) * sin(dLat/2) +
         cos(lat1 * 3.14159 / 180) * cos(lat2 * 3.14159 / 180) *
         sin(dLng/2) * sin(dLng/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    RETURN R * c;
END;
$$ LANGUAGE plpgsql;

-- Comments for Documentation
COMMENT ON TABLE governorates IS 'Egyptian Governorates Table';
COMMENT ON TABLE cities IS 'Cities Table';
COMMENT ON TABLE districts IS 'Districts/Neighborhoods Table';
COMMENT ON TABLE delivery_zones IS 'Delivery Zones Table';

-- ============================================
-- 5. Enable Row Level Security
-- ============================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governorates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all access for development)
CREATE POLICY "Allow all access to locations" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to contracts" ON contracts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to subscriptions" ON subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tenders" ON tenders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tender_bids" ON tender_bids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_points" ON loyalty_points FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_transactions" ON loyalty_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to governorates" ON governorates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to cities" ON cities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to districts" ON districts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to delivery_zones" ON delivery_zones FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 6. Create updated_at trigger function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenders_updated_at BEFORE UPDATE ON tenders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tender_bids_updated_at BEFORE UPDATE ON tender_bids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loyalty_points_updated_at BEFORE UPDATE ON loyalty_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_zones_updated_at BEFORE UPDATE ON delivery_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Database Setup Complete!
-- ============================================

SELECT 'Database setup completed successfully!' as status;
