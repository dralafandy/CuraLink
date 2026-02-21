const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';

function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'غير مصرح', code: 'NO_TOKEN' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'رمز غير صالح', code: 'INVALID_TOKEN' });
    }
}

function ensurePharmacy(req, res) {
    if (req.user.role !== 'pharmacy') {
        res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
        return false;
    }
    return true;
}

// Get full wishlist (with product details)
router.get('/', verifyToken, async (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    try {
        const { data: wishlistRows, error: wishlistError } = await db.supabase
            .from('wishlist')
            .select('product_id, created_at')
            .eq('pharmacy_id', req.user.id)
            .order('created_at', { ascending: false });

        if (wishlistError) {
            console.error('Error fetching wishlist:', wishlistError);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }

        const safeRows = wishlistRows || [];
        if (safeRows.length === 0) {
            return res.json({ items: [] });
        }

        const productIds = safeRows.map((row) => row.product_id);
        const { data: products, error: productsError } = await db.supabase
            .from('products')
            .select('*')
            .in('id', productIds);

        if (productsError) {
            console.error('Error fetching wishlist products:', productsError);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }

        const warehouseIds = [...new Set((products || []).map((p) => p.warehouse_id).filter(Boolean))];
        const { data: warehouses, error: warehousesError } = warehouseIds.length
            ? await db.supabase.from('users').select('id, username').in('id', warehouseIds)
            : { data: [], error: null };

        if (warehousesError) {
            console.error('Error fetching wishlist warehouses:', warehousesError);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }

        const productsMap = new Map((products || []).map((p) => [p.id, p]));
        const warehousesMap = new Map((warehouses || []).map((u) => [u.id, u.username]));

        const items = safeRows
            .map((row) => {
                const product = productsMap.get(row.product_id);
                if (!product) return null;

                return {
                    ...product,
                    warehouse_name: warehousesMap.get(product.warehouse_id) || null,
                    wishlisted_at: row.created_at
                };
            })
            .filter(Boolean);

        return res.json({ items });
    } catch (err) {
        console.error('Error fetching wishlist:', err);
        return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
    }
});

// Get wishlist product ids only (fast for UI)
router.get('/ids', verifyToken, async (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    const { data, error } = await db.supabase
        .from('wishlist')
        .select('product_id')
        .eq('pharmacy_id', req.user.id);

    if (error) {
        console.error('Error fetching wishlist ids:', error);
        return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
    }

    return res.json({ product_ids: (data || []).map((r) => r.product_id) });
});

// Add product to wishlist
router.post('/:productId', verifyToken, async (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    const { data: product, error: productErr } = await db.supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .limit(1)
        .maybeSingle();

    if (productErr) {
        console.error('Error checking product for wishlist:', productErr);
        return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
    }
    if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود', code: 'NOT_FOUND' });
    }

    const { error: insertErr } = await db.supabase
        .from('wishlist')
        .upsert({ pharmacy_id: req.user.id, product_id: productId }, { onConflict: 'pharmacy_id,product_id', ignoreDuplicates: true });

    if (insertErr) {
        console.error('Error adding wishlist item:', insertErr);
        return res.status(500).json({ error: 'خطأ في الخادم', code: 'INSERT_ERROR' });
    }

    return res.json({ message: 'تمت الإضافة إلى المفضلة' });
});

// Remove product from wishlist
router.delete('/:productId', verifyToken, async (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    const { error } = await db.supabase
        .from('wishlist')
        .delete()
        .eq('pharmacy_id', req.user.id)
        .eq('product_id', productId);

    if (error) {
        console.error('Error removing wishlist item:', error);
        return res.status(500).json({ error: 'خطأ في الخادم', code: 'DELETE_ERROR' });
    }

    return res.json({ message: 'تمت الإزالة من المفضلة' });
});

module.exports = router;
