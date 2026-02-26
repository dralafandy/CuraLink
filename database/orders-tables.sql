-- ============================================
-- Orders Tables - Run in Supabase SQL Editor
-- ============================================

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

-- Order events table (audit trail)
CREATE TABLE IF NOT EXISTS order_events (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT,
    message TEXT,
    meta_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_pharmacy_id ON orders(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse_id ON orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_event_type ON order_events(event_type);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Enable RLS (Row Level Security)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Allow all access policies (adjust as needed for production)
DROP POLICY IF EXISTS "Allow all access to orders" ON orders;
CREATE POLICY "Allow all access to orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to order_items" ON order_items;
CREATE POLICY "Allow all access to order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to order_events" ON order_events;
CREATE POLICY "Allow all access to order_events" ON order_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to invoices" ON invoices;
CREATE POLICY "Allow all access to invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);
