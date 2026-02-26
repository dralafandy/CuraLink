-- Migration: Add geographic zone to users table for warehouses
-- Created: 2025-02-24

-- Add zone column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS zone TEXT;

-- Create index for faster zone-based queries
CREATE INDEX IF NOT EXISTS idx_users_zone ON users(zone);

-- Create index for combined role and zone queries (commonly used for filtering warehouses by zone)
CREATE INDEX IF NOT EXISTS idx_users_role_zone ON users(role, zone);

-- Add comment to document the column purpose
COMMENT ON COLUMN users.zone IS 'النطاق الجغرافي للمخزن (مثل: القاهرة، الإسكندرية، الدلتا، الصعيد)';

-- Update existing warehouse users with default zones based on their address
UPDATE users SET zone = 'القاهرة الكبرى' 
WHERE role = 'warehouse' AND zone IS NULL AND (address ILIKE '%cairo%' OR address ILIKE '%القاهرة%' OR address ILIKE '%giza%' OR address ILIKE '%الجيزة%');

UPDATE users SET zone = 'الإسكندرية' 
WHERE role = 'warehouse' AND zone IS NULL AND (address ILIKE '%alexandria%' OR address ILIKE '%الإسكندرية%');

UPDATE users SET zone = 'الدلتا' 
WHERE role = 'warehouse' AND zone IS NULL AND (address ILIKE '%mansoura%' OR address ILIKE '%المنصورة%' OR address ILIKE '%tanta%' OR address ILIKE '%طنطا%' OR address ILIKE '%damanhour%' OR address ILIKE '%دمنهور%');

UPDATE users SET zone = 'الصعيد' 
WHERE role = 'warehouse' AND zone IS NULL AND (address ILIKE '%aswan%' OR address ILIKE '%أسوان%' OR address ILIKE '%luxor%' OR address ILIKE '%الأقصر%' OR address ILIKE '%assiut%' OR address ILIKE '%أسيوط%');

-- Set default zone for remaining warehouses
UPDATE users SET zone = 'أخرى' 
WHERE role = 'warehouse' AND zone IS NULL;
