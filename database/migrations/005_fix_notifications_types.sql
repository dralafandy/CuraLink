-- Migration 005: Fix notifications type CHECK constraint
-- Add new notification types that are used in the application
-- Run this SQL in your Supabase SQL Editor

-- Drop existing CHECK constraint if it exists (PostgreSQL)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new CHECK constraint with all valid notification types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
    'info', 
    'success', 
    'warning', 
    'error', 
    'order', 
    'payment',
    'new_order',
    'return_request',
    'order_update',
    'sms_queued',
    'new_rating',
    'wishlist_price_change',
    'wishlist_offer_added',
    'low_stock',
    'system_alert',
    'email_queued'
));
