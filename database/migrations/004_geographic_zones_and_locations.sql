-- Migration: Geographic Zones and Enhanced Locations
-- Created: 2026-02-25
-- Purpose: Add governorates, cities, districts, delivery zones, and enhance locations table

-- ============================================
-- 1. Governorates Table (المحافظات)
-- ============================================
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

-- ============================================
-- 2. Cities Table (المدن)
-- ============================================
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

-- ============================================
-- 3. Districts Table (الأحياء/المراكز)
-- ============================================
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

-- ============================================
-- 4. Create Locations Table (if not exists)
-- ============================================
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

-- Add new columns to existing locations table
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

-- ============================================
-- 5. Delivery Zones Table (نطاقات التوصيل)
-- ============================================
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

-- ============================================
-- 6. Create Indexes for Performance
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
-- 7. Insert Egyptian Governorates Data
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

-- ============================================
-- 8. Insert Major Cities for Each Governorate
-- ============================================
-- Cairo (1)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(1, 'القاهرة', 'Cairo', 30.0444, 31.2357, 1),
(1, 'حلوان', 'Helwan', 29.8600, 31.3100, 2),
(1, 'المرج', 'El Marg', 30.1500, 31.3500, 3),
(1, 'عين شمس', 'Ein Shams', 30.0800, 31.2800, 4)
ON CONFLICT DO NOTHING;

-- Giza (2)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(2, 'الجيزة', 'Giza', 30.0131, 31.2089, 1),
(2, 'الشيخ زايد', 'Sheikh Zayed', 30.0250, 30.8950, 2),
(2, '6 أكتوبر', '6th October', 29.9280, 30.9270, 3)
ON CONFLICT DO NOTHING;

-- Alexandria (3)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(3, 'الإسكندرية', 'Alexandria', 31.2001, 29.9187, 1),
(3, 'برج العرب', 'Borg El Arab', 30.9100, 29.6800, 2)
ON CONFLICT DO NOTHING;

-- Dakahlia (4)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(4, 'المنصورة', 'Mansoura', 31.0400, 31.3800, 1),
(4, 'دكرنس', 'Dekernes', 31.1600, 31.4500, 2),
(4, 'ميت غمر', 'Mit Ghamr', 30.9500, 31.3200, 3)
ON CONFLICT DO NOTHING;

-- Sharqia (5)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(5, 'الزقازيق', 'Zagazig', 30.8000, 31.5200, 1),
(5, 'العاشر من رمضان', '10th of Ramadan', 30.9400, 31.9300, 2),
(5, 'بلبيس', 'Belbeis', 30.4200, 31.5600, 3)
ON CONFLICT DO NOTHING;

-- Gharbia (6)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(6, 'طنطا', 'Tanta', 30.8200, 31.0300, 1),
(6, 'المحلة الكبرى', 'El Mahalla El Kubra', 30.9700, 31.1700, 2)
ON CONFLICT DO NOTHING;

-- Monufia (7)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(7, 'شبين الكوم', 'Shiben El Kom', 30.4600, 31.1700, 1),
(7, 'المنوفية', 'Menouf', 30.5200, 30.9300, 2)
ON CONFLICT DO NOTHING;

-- Qalyubia (8)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(8, 'بنها', 'Benha', 30.3200, 31.2400, 1),
(8, 'قليوب', 'Qalyub', 30.2500, 31.2100, 2),
(8, 'شبرا الخيمة', 'Shubra El Kheima', 30.1300, 31.2400, 3)
ON CONFLICT DO NOTHING;

-- Kafr El Sheikh (9)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(9, 'كفر الشيخ', 'Kafr El Sheikh', 31.3100, 30.9400, 1),
(9, 'دسوق', 'Desouk', 31.3300, 30.6500, 2)
ON CONFLICT DO NOTHING;

-- Beheira (10)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(10, 'دمنهور', 'Damanhour', 30.4700, 30.4700, 1),
(10, 'إدكو', 'Edko', 30.3000, 30.4900, 2),
(10, 'أبو المطامير', 'Abu El Matamir', 30.4000, 30.5600, 3)
ON CONFLICT DO NOTHING;

-- Ismailia (16)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(16, 'الإسماعيلية', 'Ismailia', 30.3700, 32.2700, 1),
(16, 'التل الكبير', 'Tel El Kabir', 30.5500, 32.0200, 2)
ON CONFLICT DO NOTHING;

-- Suez (17)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(17, 'السويس', 'Suez', 29.9700, 32.5300, 1),
(17, 'السخنة', 'Ain Sokhna', 29.6500, 32.4800, 2)
ON CONFLICT DO NOTHING;

-- Port Said (18)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(18, 'بورسعيد', 'Port Said', 31.2600, 32.3000, 1),
(18, 'بورفؤاد', 'Port Fouad', 31.2500, 32.3800, 2)
ON CONFLICT DO NOTHING;

-- Damietta (19)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(19, 'دمياط', 'Damietta', 31.4200, 31.8200, 1),
(19, 'فارسكور', 'Farskour', 31.3800, 31.7000, 2)
ON CONFLICT DO NOTHING;

-- New Valley (25)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(25, 'الخارجة', 'El Kharga', 25.5000, 30.5000, 1),
(25, 'الداخلة', 'El Dakhla', 25.7100, 29.2800, 2)
ON CONFLICT DO NOTHING;

-- Matrouh (26)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(26, 'مرسى مطروح', 'Marsa Matrouh', 31.3500, 27.2500, 1),
(26, 'العلمين', 'El Alamein', 30.8300, 28.9000, 2),
(26, 'سيوة', 'Siwa', 29.2000, 25.2700, 3)
ON CONFLICT DO NOTHING;

-- Luxor (23)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(23, 'الأقصر', 'Luxor', 25.6800, 32.6400, 1),
(23, 'إسنا', 'Esna', 25.3000, 32.5500, 2)
ON CONFLICT DO NOTHING;

-- Aswan (24)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(24, 'أسوان', 'Aswan', 24.0900, 32.9000, 1),
(24, 'كوم أمبو', 'Kom Ombo', 24.4700, 32.9500, 2)
ON CONFLICT DO NOTHING;

-- Qena (27)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(27, 'قنا', 'Qena', 26.1600, 32.7200, 1),
(27, 'نجع حمادي', 'Nag Hammadi', 26.0400, 32.4600, 2)
ON CONFLICT DO NOTHING;

-- Assiut (11)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(11, 'أسيوط', 'Assiut', 27.1800, 31.1600, 1),
(11, 'منفلوط', 'Manfalut', 27.3100, 31.3200, 2)
ON CONFLICT DO NOTHING;

-- Sohag (12)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(12, 'سوهاج', 'Sohag', 26.5600, 31.6900, 1),
(12, 'أخميم', 'Akhmim', 26.3100, 31.7400, 2),
(12, 'طهطا', 'Tahta', 26.4700, 31.4900, 3)
ON CONFLICT DO NOTHING;

-- Minya (13)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(13, 'المنيا', 'Minya', 28.0900, 30.7600, 1),
(13, 'العدوة', 'El Adwa', 28.2800, 30.9000, 2),
(13, 'مغاغة', 'Maghagha', 28.2500, 30.8200, 3)
ON CONFLICT DO NOTHING;

-- Beni Suef (14)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(14, 'بني سويف', 'Beni Suef', 29.0600, 31.1000, 1),
(14, 'الواسطى', 'El Wasta', 29.2200, 31.2300, 2)
ON CONFLICT DO NOTHING;

-- Fayoum (15)
INSERT INTO cities (governorate_id, name_ar, name_en, latitude, longitude, sort_order) VALUES
(15, 'الفيوم', 'Fayoum', 29.3100, 30.8500, 1),
(15, 'السنطة', 'El Santah', 29.4200, 30.7800, 2)
ON CONFLICT DO NOTHING;

-- ============================================
-- 9. Insert Sample Districts for Major Cities
-- ============================================
INSERT INTO districts (city_id, name_ar, name_en, postal_code, sort_order) VALUES
(1, 'وسط القاهرة', 'Downtown Cairo', '11111', 1),
(1, 'الزمالك', 'Zamalek', '11211', 2),
(1, 'المعادي', 'Maadi', '11431', 3),
(1, 'مدينةنصر', 'Nasr City', '11765', 4),
(1, 'مصر الجديدة', 'Heliopolis', '11711', 5)
ON CONFLICT DO NOTHING;

INSERT INTO districts (city_id, name_ar, name_en, postal_code, sort_order) VALUES
(2, 'الدقي', 'Dokki', '12311', 1),
(2, 'الشيخ زايد', 'Sheikh Zayed', '12588', 2),
(2, '6 أكتوبر', '6th October', '12566', 3)
ON CONFLICT DO NOTHING;

INSERT INTO districts (city_id, name_ar, name_en, postal_code, sort_order) VALUES
(3, 'وسط المدينة', 'Downtown', '21111', 1),
(3, 'سموحة', 'Smouha', '21617', 2),
(3, 'رأس التين', 'Ras El Tin', '21619', 3)
ON CONFLICT DO NOTHING;

-- ============================================
-- 10. Add Default Delivery Zones for Existing Warehouses
-- ============================================
INSERT INTO delivery_zones (warehouse_id, governorate_id, city_id, zone_type, radius_km, base_fee, per_km_fee, min_order_amount, free_delivery_threshold, estimated_delivery_hours, is_active) VALUES
(2, 1, NULL, 'administrative', 50, 15, 0, 500, 2000, 24, 1),
(2, 2, NULL, 'administrative', 40, 20, 0.5, 500, 2500, 48, 1),
(2, 8, NULL, 'administrative', 35, 15, 0.5, 500, 2000, 24, 1),
(3, 3, NULL, 'administrative', 50, 15, 0, 500, 2000, 24, 1),
(3, 10, NULL, 'administrative', 45, 20, 0.5, 500, 2500, 36, 1)
ON CONFLICT DO NOTHING;

-- ============================================
-- 11. Create Views for Easy Queries
-- ============================================
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

-- ============================================
-- 12. Add Geographic Helper Functions
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
-- 13. Comments for Documentation
-- ============================================
COMMENT ON TABLE governorates IS 'جدول المحافظات المصرية';
COMMENT ON TABLE cities IS 'جدول المدن والمحافظات';
COMMENT ON TABLE districts IS 'جدول الأحياء والمراكز';
COMMENT ON TABLE delivery_zones IS 'جدول نطاقات التوصيل للمخازن';
