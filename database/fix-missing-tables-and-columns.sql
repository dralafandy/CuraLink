-- ============================================
-- Complete Fix: Create missing tables and add columns
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Create governorates table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS governorates (
    id SERIAL PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    latitude REAL,
    longitude REAL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Create cities table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    governorate_id INTEGER NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    latitude REAL,
    longitude REAL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. Create districts table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS districts (
    id SERIAL PRIMARY KEY,
    city_id INTEGER NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    postal_code TEXT,
    latitude REAL,
    longitude REAL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. Create locations table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    is_primary INTEGER DEFAULT 0,
    location_type TEXT,
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

-- ============================================
-- 5. Create delivery_zones table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL,
    governorate_id INTEGER,
    city_id INTEGER,
    district_id INTEGER,
    zone_type TEXT DEFAULT 'radius',
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
-- 6. Add missing columns to existing tables
-- ============================================

-- Add is_active to users if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add latitude/longitude to users if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'latitude'
    ) THEN
        ALTER TABLE users ADD COLUMN latitude REAL;
        ALTER TABLE users ADD COLUMN longitude REAL;
        ALTER TABLE users ADD COLUMN gps_address TEXT;
    END IF;
END $$;

-- Add is_active column to governorates if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'governorates' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE governorates ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add sort_order to governorates if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'governorates' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE governorates ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add is_active to cities if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cities' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE cities ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add sort_order to cities if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cities' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE cities ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add is_active to districts if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'districts' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE districts ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add sort_order to districts if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'districts' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE districts ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add postal_code to districts if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'districts' AND column_name = 'postal_code'
    ) THEN
        ALTER TABLE districts ADD COLUMN postal_code TEXT;
    END IF;
END $$;

-- Add columns to locations if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'locations' AND column_name = 'governorate_id'
    ) THEN
        ALTER TABLE locations ADD COLUMN governorate_id INTEGER;
        ALTER TABLE locations ADD COLUMN city_id INTEGER;
        ALTER TABLE locations ADD COLUMN district_id INTEGER;
        ALTER TABLE locations ADD COLUMN building_number TEXT;
        ALTER TABLE locations ADD COLUMN floor_number TEXT;
        ALTER TABLE locations ADD COLUMN apartment_number TEXT;
        ALTER TABLE locations ADD COLUMN landmark TEXT;
        ALTER TABLE locations ADD COLUMN postal_code TEXT;
        ALTER TABLE locations ADD COLUMN is_verified INTEGER DEFAULT 0;
        ALTER TABLE locations ADD COLUMN delivery_instructions TEXT;
    END IF;
END $$;

-- Add columns to delivery_zones if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'delivery_zones' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE delivery_zones ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'delivery_zones' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE delivery_zones ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- ============================================
-- 7. Create indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_cities_governorate ON cities(governorate_id);
CREATE INDEX IF NOT EXISTS idx_districts_city ON districts(city_id);
CREATE INDEX IF NOT EXISTS idx_locations_governorate ON locations(governorate_id);
CREATE INDEX IF NOT EXISTS idx_locations_city ON locations(city_id);
CREATE INDEX IF NOT EXISTS idx_locations_district ON locations(district_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_primary ON locations(user_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_warehouse ON delivery_zones(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_governorate ON delivery_zones(governorate_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_city ON delivery_zones(city_id);

-- ============================================
-- 8. Insert Egyptian Governorates (if not exists)
-- ============================================
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
(5, 'الزقازيق', 'Zagazig', 30.8000, 31.5200, 1),
(6, 'طنطا', 'Tanta', 30.8200, 31.0300, 1),
(7, 'شبين الكوم', 'Shiben El Kom', 30.4600, 31.1700, 1),
(8, 'بنها', 'Benha', 30.3200, 31.2400, 1),
(10, 'دمنهور', 'Damanhour', 30.4700, 30.4700, 1),
(11, 'أسيوط', 'Assiut', 27.1800, 31.1600, 1),
(13, 'المنيا', 'Minya', 28.0900, 30.7600, 1),
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
(9, 'وسط المدينة', 'Downtown', '21111', 1)
ON CONFLICT DO NOTHING;

-- ============================================
-- 9. Enable RLS and create policies
-- ============================================
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE governorates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to locations" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to governorates" ON governorates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to cities" ON cities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to districts" ON districts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to delivery_zones" ON delivery_zones FOR ALL USING (true) WITH CHECK (true);

SELECT 'Database fix completed successfully!' as status;
