-- Migration: Advanced B2B Features - GPS, Contracts, Subscriptions, Tenders, Loyalty
-- Created: 2025-02-24

-- ============================================
-- 1. GPS Locations Table
-- ============================================
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    is_primary INTEGER DEFAULT 0,
    location_type TEXT CHECK(location_type IN ('warehouse', 'pharmacy', 'delivery_point')),
    phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add GPS coordinates to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_address TEXT;

-- Create indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_users_coords ON users(latitude, longitude);

-- ============================================
-- 2. Contracts Table (Long-term agreements)
-- ============================================
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
    discount_percent DECIMAL(5,2) DEFAULT 0,
    credit_limit DECIMAL(12,2) DEFAULT 0,
    payment_terms INTEGER DEFAULT 30, -- Days
    auto_renew INTEGER DEFAULT 0,
    terms TEXT,
    signed_by_pharmacy INTEGER DEFAULT 0,
    signed_by_warehouse INTEGER DEFAULT 0,
    signed_at_pharmacy TIMESTAMP WITH TIME ZONE,
    signed_at_warehouse TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contract products (specific products in contract)
CREATE TABLE IF NOT EXISTS contract_products (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    agreed_price DECIMAL(10,2) NOT NULL,
    min_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contract history
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

-- ============================================
-- 3. Subscriptions Table (Recurring orders)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    pharmacy_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'cancelled', 'completed')),
    next_delivery_date DATE,
    preferred_delivery_day INTEGER CHECK(preferred_delivery_day BETWEEN 0 AND 6), -- 0=Sunday
    preferred_delivery_time TEXT,
    notes TEXT,
    total_orders INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscription items
CREATE TABLE IF NOT EXISTS subscription_items (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscription orders (linking to actual orders)
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

-- ============================================
-- 4. Tenders Table (Bidding system)
-- ============================================
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

-- Tender items
CREATE TABLE IF NOT EXISTS tender_items (
    id SERIAL PRIMARY KEY,
    tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit TEXT,
    specifications TEXT
);

-- Tender bids from warehouses
CREATE TABLE IF NOT EXISTS tender_bids (
    id SERIAL PRIMARY KEY,
    tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_amount DECIMAL(12,2) NOT NULL,
    delivery_days INTEGER,
    validity_days INTEGER DEFAULT 7,
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tender bid items
CREATE TABLE IF NOT EXISTS tender_bid_items (
    id SERIAL PRIMARY KEY,
    bid_id INTEGER NOT NULL REFERENCES tender_bids(id) ON DELETE CASCADE,
    tender_item_id INTEGER NOT NULL REFERENCES tender_items(id) ON DELETE CASCADE,
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT
);

-- Invited warehouses to private tenders
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

-- ============================================
-- 5. Loyalty Points System
-- ============================================
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

-- Loyalty transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL, -- Positive for earned, negative for redeemed
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('earned', 'redeemed', 'expired', 'bonus', 'adjustment')),
    reference_type TEXT, -- 'order', 'referral', 'promotion', etc.
    reference_id INTEGER,
    description TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Loyalty rewards catalog
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL,
    reward_type TEXT NOT NULL CHECK(reward_type IN ('discount', 'free_shipping', 'product', 'cashback')),
    reward_value DECIMAL(10,2),
    image TEXT,
    active INTEGER DEFAULT 1,
    stock INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Redeemed rewards
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

-- ============================================
-- 6. Advanced Analytics Tables
-- ============================================
CREATE TABLE IF NOT EXISTS daily_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_role TEXT,
    stat_date DATE NOT NULL,
    orders_count INTEGER DEFAULT 0,
    orders_amount DECIMAL(12,2) DEFAULT 0,
    products_sold INTEGER DEFAULT 0,
    new_customers INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, stat_date)
);

-- Price history for market analysis
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);

-- ============================================
-- 7. Enable RLS for new tables
-- ============================================
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
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

-- RLS Policies
CREATE POLICY "Allow all access to locations" ON locations FOR ALL USING (true);
CREATE POLICY "Allow all access to contracts" ON contracts FOR ALL USING (true);
CREATE POLICY "Allow all access to contract_products" ON contract_products FOR ALL USING (true);
CREATE POLICY "Allow all access to contract_history" ON contract_history FOR ALL USING (true);
CREATE POLICY "Allow all access to subscriptions" ON subscriptions FOR ALL USING (true);
CREATE POLICY "Allow all access to subscription_items" ON subscription_items FOR ALL USING (true);
CREATE POLICY "Allow all access to subscription_orders" ON subscription_orders FOR ALL USING (true);
CREATE POLICY "Allow all access to tenders" ON tenders FOR ALL USING (true);
CREATE POLICY "Allow all access to tender_items" ON tender_items FOR ALL USING (true);
CREATE POLICY "Allow all access to tender_bids" ON tender_bids FOR ALL USING (true);
CREATE POLICY "Allow all access to tender_bid_items" ON tender_bid_items FOR ALL USING (true);
CREATE POLICY "Allow all access to tender_invites" ON tender_invites FOR ALL USING (true);
CREATE POLICY "Allow all access to loyalty_points" ON loyalty_points FOR ALL USING (true);
CREATE POLICY "Allow all access to loyalty_transactions" ON loyalty_transactions FOR ALL USING (true);
CREATE POLICY "Allow all access to loyalty_rewards" ON loyalty_rewards FOR ALL USING (true);
CREATE POLICY "Allow all access to loyalty_redemptions" ON loyalty_redemptions FOR ALL USING (true);
CREATE POLICY "Allow all access to daily_stats" ON daily_stats FOR ALL USING (true);
CREATE POLICY "Allow all access to price_history" ON price_history FOR ALL USING (true);

-- ============================================
-- 8. Create triggers for updated_at
-- ============================================
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

-- ============================================
-- 9. Insert sample data
-- ============================================
-- Sample loyalty rewards
INSERT INTO loyalty_rewards (name, description, points_required, reward_type, reward_value, active) VALUES
('خصم 5%', 'خصم 5% على الطلب التالي', 100, 'discount', 5, 1),
('خصم 10%', 'خصم 10% على الطلب التالي', 200, 'discount', 10, 1),
('شحن مجاني', 'شحن مجاني على الطلب التالي', 150, 'free_shipping', 0, 1),
('كاش باك 50 ج.م', 'كاش باك 50 جنيه', 500, 'cashback', 50, 1),
('كاش باك 100 ج.م', 'كاش باك 100 جنيه', 900, 'cashback', 100, 1);

-- Initialize loyalty points for existing users
INSERT INTO loyalty_points (user_id, points, tier)
SELECT id, 0, 'bronze' FROM users WHERE role IN ('pharmacy', 'warehouse')
ON CONFLICT (user_id) DO NOTHING;
