-- ============================================
-- CuraLink Complete Database Schema
-- For Supabase - Run in SQL Editor
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Core Tables
-- ============================================

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    role TEXT NOT NULL CHECK(role IN ('admin', 'warehouse', 'pharmacy')),
    rating REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    email_verified INTEGER DEFAULT 0,
    phone_verified INTEGER DEFAULT 0,
    avatar_url TEXT,
    preferences TEXT,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    verified_by INTEGER,
    verified_at TIMESTAMP WITH TIME ZONE,
    business_license TEXT,
    tax_number TEXT,
    zone TEXT,
    latitude REAL,
    longitude REAL,
    gps_address TEXT
);

-- Products table
CREATE TABLE products (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    category_id INTEGER,
    subcategory_id INTEGER,
    barcode TEXT,
    sku TEXT,
    unit TEXT DEFAULT 'piece',
    weight REAL,
    dimensions TEXT,
    manufacturer TEXT,
    country_of_origin TEXT,
    storage_conditions TEXT,
    side_effects TEXT,
    contraindications TEXT,
    warnings TEXT,
    is_prescription_required INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    rating_average REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    tags TEXT,
    meta_title TEXT,
    meta_description TEXT,
    is_active INTEGER DEFAULT 1
);

-- Orders table
CREATE TABLE orders (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    order_number TEXT UNIQUE,
    subtotal REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    shipping_cost REAL DEFAULT 0,
    notes TEXT,
    internal_notes TEXT,
    delivery_address TEXT,
    delivery_date DATE,
    delivery_time_slot TEXT,
    tracking_number TEXT,
    shipping_carrier TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    cancelled_by INTEGER,
    delivered_at TIMESTAMP WITH TIME ZONE,
    delivered_by INTEGER,
    payment_status TEXT DEFAULT 'pending',
    payment_method TEXT,
    priority TEXT DEFAULT 'normal'
);

-- Order items table
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL
);

-- Invoices table
CREATE TABLE invoices (
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
CREATE TABLE invoice_payments (
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
CREATE TABLE payment_gateway_configs (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order events table
CREATE TABLE order_events (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    actor_user_id INTEGER REFERENCES users(id),
    actor_role TEXT,
    message TEXT,
    meta_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Returns table
CREATE TABLE returns (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    pharmacy_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Return items table
CREATE TABLE return_items (
    id SERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL
);

-- Ratings table
CREATE TABLE ratings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Notifications table
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error', 'order', 'payment')),
    is_read INTEGER DEFAULT 0,
    read_at TIMESTAMP WITH TIME ZONE,
    related_id INTEGER,
    metadata_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences table
CREATE TABLE notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    order_updates INTEGER NOT NULL DEFAULT 1,
    low_stock INTEGER NOT NULL DEFAULT 1,
    ratings INTEGER NOT NULL DEFAULT 1,
    returns INTEGER NOT NULL DEFAULT 1,
    system_alerts INTEGER NOT NULL DEFAULT 1,
    marketing INTEGER NOT NULL DEFAULT 1,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    sms_enabled INTEGER NOT NULL DEFAULT 1,
    push_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Push subscriptions table
CREATE TABLE push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wishlist table
CREATE TABLE wishlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Extended Tables (from migrations)
-- ============================================

-- Audit Logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_en TEXT,
    description TEXT,
    parent_id INTEGER,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product Images
CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Logs
CREATE TABLE inventory_logs (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    order_id INTEGER,
    content TEXT NOT NULL,
    attachments TEXT,
    is_read INTEGER DEFAULT 0,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment Methods
CREATE TABLE payment_methods (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    invoice_id INTEGER,
    order_id INTEGER,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'EGP',
    status TEXT DEFAULT 'pending',
    payment_method_id INTEGER,
    gateway_reference TEXT,
    gateway_response TEXT,
    description TEXT,
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User Sessions
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    device_info TEXT,
    is_active INTEGER DEFAULT 1,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System Settings
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    updated_by INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Activity Log
CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. Geographic Tables
-- ============================================

-- Governorates (المحافظات)
CREATE TABLE governorates (
    id SERIAL PRIMARY KEY,
    name_ar TEXT NOT NULL UNIQUE,
    name_en TEXT,
    latitude REAL,
    longitude REAL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cities (المدن)
CREATE TABLE cities (
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

-- Districts (الأحياء/المراكز)
CREATE TABLE districts (
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

-- Locations
CREATE TABLE locations (
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
    governorate_id INTEGER,
    city_id INTEGER,
    district_id INTEGER,
    building_number TEXT,
    floor_number TEXT,
    apartment_number TEXT,
    landmark TEXT,
    postal_code TEXT,
    is_verified INTEGER DEFAULT 0,
    delivery_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Delivery Zones
CREATE TABLE delivery_zones (
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

-- ============================================
-- 4. B2B Features Tables
-- ============================================

-- Contracts
CREATE TABLE contracts (
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

-- Contract Products
CREATE TABLE contract_products (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    agreed_price REAL NOT NULL,
    min_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contract History
CREATE TABLE contract_history (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by INTEGER REFERENCES users(id),
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions
CREATE TABLE subscriptions (
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

-- Subscription Items
CREATE TABLE subscription_items (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscription Orders
CREATE TABLE subscription_orders (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tenders
CREATE TABLE tenders (
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

-- Tender Items
CREATE TABLE tender_items (
    id SERIAL PRIMARY KEY,
    tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit TEXT,
    specifications TEXT
);

-- Tender Bids
CREATE TABLE tender_bids (
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

-- Tender Bid Items
CREATE TABLE tender_bid_items (
    id SERIAL PRIMARY KEY,
    bid_id INTEGER NOT NULL REFERENCES tender_bids(id) ON DELETE CASCADE,
    tender_item_id INTEGER NOT NULL REFERENCES tender_items(id) ON DELETE CASCADE,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT
);

-- Tender Invites
CREATE TABLE tender_invites (
    id SERIAL PRIMARY KEY,
    tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    viewed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tender_id, warehouse_id)
);

-- Loyalty Points
CREATE TABLE loyalty_points (
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

-- Loyalty Transactions
CREATE TABLE loyalty_transactions (
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

-- Loyalty Rewards
CREATE TABLE loyalty_rewards (
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

-- Loyalty Redemptions
CREATE TABLE loyalty_redemptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id INTEGER NOT NULL REFERENCES loyalty_rewards(id),
    points_used INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'fulfilled', 'cancelled')),
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Daily Stats
CREATE TABLE daily_stats (
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

-- Price History
CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_warehouse ON products(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

CREATE INDEX IF NOT EXISTS idx_orders_pharmacy ON orders(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_warehouse_id ON inventory_logs(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(type);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_users_zone ON users(zone);
CREATE INDEX IF NOT EXISTS idx_users_coords ON users(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_cities_governorate ON cities(governorate_id);
CREATE INDEX IF NOT EXISTS idx_districts_city ON districts(city_id);
CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_locations_governorate ON locations(governorate_id);
CREATE INDEX IF NOT EXISTS idx_locations_city ON locations(city_id);
CREATE INDEX IF NOT EXISTS idx_locations_district ON locations(district_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_primary ON locations(user_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_warehouse ON delivery_zones(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_governorate ON delivery_zones(governorate_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_city ON delivery_zones(city_id);

CREATE INDEX IF NOT EXISTS idx_contracts_pharmacy ON contracts(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_contracts_warehouse ON contracts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_pharmacy ON subscriptions(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_warehouse ON subscriptions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_delivery ON subscriptions(next_delivery_date);
CREATE INDEX IF NOT EXISTS idx_tenders_pharmacy ON tenders(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status);
CREATE INDEX IF NOT EXISTS idx_tender_bids_tender ON tender_bids(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_bids_warehouse ON tender_bids(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user ON loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_expires ON loyalty_transactions(expires_at);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);

-- ============================================
-- 6. Enable Row Level Security
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE governorates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_bid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. RLS Policies (allow all for development)
-- ============================================

CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to invoice_payments" ON invoice_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to order_events" ON order_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to returns" ON returns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to return_items" ON return_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ratings" ON ratings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to notification_preferences" ON notification_preferences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to push_subscriptions" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to wishlist" ON wishlist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to refresh_tokens" ON refresh_tokens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to product_images" ON product_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to inventory_logs" ON inventory_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to messages" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to payment_methods" ON payment_methods FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to user_sessions" ON user_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to governorates" ON governorates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to cities" ON cities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to districts" ON districts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to locations" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to delivery_zones" ON delivery_zones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to contracts" ON contracts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to contract_products" ON contract_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to contract_history" ON contract_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to subscriptions" ON subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to subscription_items" ON subscription_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to subscription_orders" ON subscription_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tenders" ON tenders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tender_items" ON tender_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tender_bids" ON tender_bids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tender_bid_items" ON tender_bid_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tender_invites" ON tender_invites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_points" ON loyalty_points FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_transactions" ON loyalty_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_rewards" ON loyalty_rewards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to loyalty_redemptions" ON loyalty_redemptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to daily_stats" ON daily_stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to price_history" ON price_history FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 8. Trigger Functions
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON returns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
-- 9. Insert Default Data
-- ============================================

-- Insert sample users (password: admin123, warehouse123, pharmacy123 - bcrypt hashed)
INSERT INTO users (username, email, password, phone, address, role) VALUES 
('admin', 'admin@curalink.com', '$2a$10$8K1p/a0dL1LXMIgoEDK0zu', '0123456789', 'Cairo', 'admin'),
('warehouse1', 'warehouse1@test.com', '$2a$10$8K1p/a0dL1LXMIgoEDK0zu', '01000000001', 'Cairo', 'warehouse'),
('warehouse2', 'warehouse2@test.com', '$2a$10$8K1p/a0dL1LXMIgoEDK0zu', '01000000002', 'Alexandria', 'warehouse'),
('pharmacy1', 'pharmacy1@test.com', '$2a$10$8K1p/a0dL1LXMIgoEDK0zu', '01100000001', 'New Cairo', 'pharmacy'),
('pharmacy2', 'pharmacy2@test.com', '$2a$10$8K1p/a0dL1LXMIgoEDK0zu', '01100000002', 'Zamalek', 'pharmacy'),
('pharmacy3', 'pharmacy3@test.com', '$2a$10$8K1p/a0dL1LXMIgoEDK0zu', '01100000003', 'Mohandessin', 'pharmacy')
ON CONFLICT (username) DO NOTHING;

-- Insert sample products
INSERT INTO products (warehouse_id, name, description, category, price, quantity, discount_percent, expiry_date, image) VALUES 
(2, 'Paracetamol 500mg Tablets', 'Pain relief and fever reducer', 'Pain Relief', 18, 260, 12, CURRENT_DATE + INTERVAL '24 months', '/uploads/products/paracetamol.svg'),
(2, 'Panadol Extra Caplets', 'Dual-action pain relief', 'Pain Relief', 32, 180, 8, CURRENT_DATE + INTERVAL '20 months', '/uploads/products/panadol.svg'),
(2, 'Glucophage 500mg Tablets', 'Diabetes treatment type 2', 'Diabetes Care', 38, 200, 12, CURRENT_DATE + INTERVAL '26 months', '/uploads/products/glucophage.svg'),
(2, 'Nexium 20mg Tablets', 'Proton pump inhibitor', 'Digestive Care', 85, 140, 10, CURRENT_DATE + INTERVAL '20 months', '/uploads/products/nexium.svg'),
(2, 'Augmentin 1g Tablets', 'Broad spectrum antibiotic', 'Antibiotics', 120, 90, 5, CURRENT_DATE + INTERVAL '18 months', '/uploads/products/augmentin.svg'),
(2, 'Vitamin C 1000mg', 'Vitamin C supplement', 'Vitamins', 55, 210, 15, CURRENT_DATE + INTERVAL '18 months', '/uploads/products/vitaminc.svg'),
(2, 'Omega 3 1000mg', 'Omega 3 supplement', 'Supplements', 99, 150, 12, CURRENT_DATE + INTERVAL '24 months', '/uploads/products/omega3.svg'),
(3, 'Cetirizine 10mg Tablets', 'Antihistamine for allergies', 'Allergy', 34, 200, 10, CURRENT_DATE + INTERVAL '26 months', NULL),
(3, 'Montelukast 10mg', 'Asthma and allergy medication', 'Respiratory', 79, 120, 5, CURRENT_DATE + INTERVAL '24 months', NULL),
(3, 'Panadol Cold & Flu', 'Cold and flu relief', 'Cold and Flu', 42, 200, 10, CURRENT_DATE + INTERVAL '18 months', '/uploads/products/panadolflu.svg')
ON CONFLICT DO NOTHING;

-- Insert default categories
INSERT INTO categories (name, name_en, description, sort_order) VALUES
('أدوية القلب', 'Cardiac Medicines', 'Heart and vascular disease medications', 1),
('أدوية السكر', 'Diabetes Medicines', 'Diabetes treatment medications', 2),
('المضادات الحيوية', 'Antibiotics', 'Antibiotics and antibacterial medications', 3),
('المسكنات', 'Pain Relievers', 'Pain relief and anti-inflammatory', 4),
('فيتامينات ومكملات', 'Vitamins & Supplements', 'Vitamins and dietary supplements', 5),
('مستحضرات تجميل', 'Cosmetics', 'Cosmetics and skincare products', 6),
('مستلزمات طبية', 'Medical Supplies', 'Medical supplies and tools', 7)
ON CONFLICT (name) DO NOTHING;

-- Insert system settings
INSERT INTO system_settings (key, value, description, is_public) VALUES
('commission_rate', '10', 'Default commission rate (%)', 1),
('cancellation_window_minutes', '120', 'Order cancellation window (minutes)', 1),
('low_stock_threshold', '10', 'Low stock alert threshold', 1),
('expiry_alert_days', '30', 'Days before expiry to alert', 1),
('max_upload_size_mb', '10', 'Max upload file size (MB)', 1),
('maintenance_mode', 'false', 'Maintenance mode', 0),
('allow_registration', 'true', 'Allow user registration', 1)
ON CONFLICT (key) DO NOTHING;

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

-- Insert loyalty rewards
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
-- 10. Helper Function
-- ============================================

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

-- ============================================
-- Database Setup Complete!
-- ============================================

SELECT 'CuraLink database setup completed successfully!' as status;
