-- ============================================
-- Fix: Add missing columns to existing tables
-- Run this in Supabase SQL Editor
-- ============================================

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

-- Add is_active column to cities if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cities' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE cities ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add is_active column to districts if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'districts' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE districts ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add is_active column to delivery_zones if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'delivery_zones' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE delivery_zones ADD COLUMN is_active INTEGER DEFAULT 1;
    END IF;
END $$;

-- Add sort_order column to governorates if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'governorates' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE governorates ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add sort_order column to cities if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cities' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE cities ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add sort_order column to districts if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'districts' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE districts ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add updated_at column to delivery_zones if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'delivery_zones' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE delivery_zones ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

SELECT 'Columns added successfully!' as status;
