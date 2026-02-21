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
router.get('/', verifyToken, (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    db.all(`
        SELECT p.*, u.username as warehouse_name, w.created_at as wishlisted_at
        FROM wishlist w
        JOIN products p ON p.id = w.product_id
        JOIN users u ON u.id = p.warehouse_id
        WHERE w.pharmacy_id = ?
        ORDER BY w.created_at DESC
    `, [req.user.id], (err, items) => {
        if (err) {
            console.error('Error fetching wishlist:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }
        res.json({ items });
    });
});

// Get wishlist product ids only (fast for UI)
router.get('/ids', verifyToken, (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    db.all('SELECT product_id FROM wishlist WHERE pharmacy_id = ?', [req.user.id], (err, rows) => {
        if (err) {
            console.error('Error fetching wishlist ids:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }
        res.json({ product_ids: rows.map(r => r.product_id) });
    });
});

// Add product to wishlist
router.post('/:productId', verifyToken, (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    db.get('SELECT id FROM products WHERE id = ?', [productId], (productErr, product) => {
        if (productErr) {
            console.error('Error checking product for wishlist:', productErr);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }
        if (!product) {
            return res.status(404).json({ error: 'المنتج غير موجود', code: 'NOT_FOUND' });
        }

        db.run(`
            INSERT OR IGNORE INTO wishlist (pharmacy_id, product_id)
            VALUES (?, ?)
        `, [req.user.id, productId], function(err) {
            if (err) {
                console.error('Error adding wishlist item:', err);
                return res.status(500).json({ error: 'خطأ في الخادم', code: 'INSERT_ERROR' });
            }
            res.json({ message: 'تمت الإضافة إلى المفضلة' });
        });
    });
});

// Remove product from wishlist
router.delete('/:productId', verifyToken, (req, res) => {
    if (!ensurePharmacy(req, res)) return;

    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    db.run('DELETE FROM wishlist WHERE pharmacy_id = ? AND product_id = ?', [req.user.id, productId], function(err) {
        if (err) {
            console.error('Error removing wishlist item:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'DELETE_ERROR' });
        }
        res.json({ message: 'تمت الإزالة من المفضلة' });
    });
});

module.exports = router;
