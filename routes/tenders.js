const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ============================================
// Tenders Routes (Bidding System)
// ============================================

// Get all tenders
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const { status, my_tenders } = req.query;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let tenders;
        let query = '';
        let params = [];

        if (userRole === 'pharmacy') {
            if (my_tenders === 'true') {
                query = `
                    SELECT t.*, 
                           (SELECT COUNT(*) FROM tender_items WHERE tender_id = t.id) as items_count,
                           (SELECT COUNT(*) FROM tender_bids WHERE tender_id = t.id) as bids_count
                    FROM tenders t
                    WHERE t.pharmacy_id = ?
                    ORDER BY t.created_at DESC`;
                params = [userId];
            } else {
                query = `
                    SELECT t.*, p.username as pharmacy_name,
                           (SELECT COUNT(*) FROM tender_items WHERE tender_id = t.id) as items_count,
                           (SELECT COUNT(*) FROM tender_bids WHERE tender_id = t.id AND warehouse_id = ?) as my_bids_count
                    FROM tenders t
                    JOIN users p ON t.pharmacy_id = p.id
                    WHERE t.status = 'open' AND t.visibility = 'public'
                    ORDER BY t.created_at DESC`;
                params = [userId];
            }
        } else if (userRole === 'warehouse') {
            if (my_tenders === 'true') {
                query = `
                    SELECT t.*, p.username as pharmacy_name,
                           tb.id as my_bid_id, tb.status as my_bid_status, tb.total_amount as my_bid_amount,
                           (SELECT COUNT(*) FROM tender_items WHERE tender_id = t.id) as items_count
                    FROM tenders t
                    JOIN users p ON t.pharmacy_id = p.id
                    JOIN tender_bids tb ON t.id = tb.tender_id
                    WHERE tb.warehouse_id = ?
                    ORDER BY t.created_at DESC`;
                params = [userId];
            } else {
                query = `
                    SELECT t.*, p.username as pharmacy_name,
                           (SELECT COUNT(*) FROM tender_items WHERE tender_id = t.id) as items_count,
                           (SELECT COUNT(*) FROM tender_bids WHERE tender_id = t.id AND warehouse_id = ?) as has_my_bid
                    FROM tenders t
                    JOIN users p ON t.pharmacy_id = p.id
                    WHERE t.status = 'open' 
                    AND (t.visibility = 'public' OR EXISTS (
                        SELECT 1 FROM tender_invites ti WHERE ti.tender_id = t.id AND ti.warehouse_id = ?
                    ))
                    ORDER BY t.created_at DESC`;
                params = [userId, userId];
            }
        }

        tenders = await db.all(query, params);
        res.json({ tenders });
    } catch (err) {
        console.error('Get tenders error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get single tender details
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const tenderId = req.params.id;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let tender;
        if (userRole === 'pharmacy') {
            tender = await db.get(
                `SELECT t.*, p.username as pharmacy_name, p.phone as pharmacy_phone
                 FROM tenders t
                 JOIN users p ON t.pharmacy_id = p.id
                 WHERE t.id = ? AND t.pharmacy_id = ?`,
                [tenderId, userId]
            );
        } else if (userRole === 'warehouse') {
            tender = await db.get(
                `SELECT t.*, p.username as pharmacy_name, p.phone as pharmacy_phone,
                        (SELECT COUNT(*) FROM tender_bids WHERE tender_id = t.id AND warehouse_id = ?) as has_bid
                 FROM tenders t
                 JOIN users p ON t.pharmacy_id = p.id
                 WHERE t.id = ? 
                 AND (t.visibility = 'public' OR EXISTS (
                     SELECT 1 FROM tender_invites ti WHERE ti.tender_id = t.id AND ti.warehouse_id = ?
                 ))`,
                [userId, tenderId, userId]
            );
        }

        if (!tender) {
            return res.status(404).json({ error: 'المناقصة غير موجودة' });
        }

        const items = await db.all(
            'SELECT * FROM tender_items WHERE tender_id = ?',
            [tenderId]
        );

        let bids;
        if (userRole === 'pharmacy') {
            bids = await db.all(
                `SELECT tb.*, w.username as warehouse_name, w.rating as warehouse_rating
                 FROM tender_bids tb
                 JOIN users w ON tb.warehouse_id = w.id
                 WHERE tb.tender_id = ?
                 ORDER BY tb.total_amount ASC`,
                [tenderId]
            );
        } else {
            bids = await db.all(
                `SELECT tb.*, w.username as warehouse_name
                 FROM tender_bids tb
                 JOIN users w ON tb.warehouse_id = w.id
                 WHERE tb.tender_id = ? AND tb.warehouse_id = ?`,
                [tenderId, userId]
            );
        }

        for (const bid of bids) {
            bid.items = await db.all(
                `SELECT tbi.*, ti.product_name, ti.quantity, ti.unit
                 FROM tender_bid_items tbi
                 JOIN tender_items ti ON tbi.tender_item_id = ti.id
                 WHERE tbi.bid_id = ?`,
                [bid.id]
            );
        }

        res.json({ tender, items, bids });
    } catch (err) {
        console.error('Get tender error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Create new tender (pharmacy only)
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (userRole !== 'pharmacy') {
            return res.status(403).json({ error: 'فقط الصيدليات يمكنها إنشاء مناقصات' });
        }

        const { title, description, required_by_date, delivery_location_id, terms, visibility, items, invited_warehouses } = req.body;

        if (!title || !items || items.length === 0) {
            return res.status(400).json({ error: 'العنوان والمنتجات مطلوبة' });
        }

        const result = await db.run(
            `INSERT INTO tenders (pharmacy_id, title, description, required_by_date, delivery_location_id, terms, visibility)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, description || null, required_by_date || null, delivery_location_id || null, terms || null, visibility || 'public']
        );

        const tenderId = result.lastID;

        for (const item of items) {
            await db.run(
                `INSERT INTO tender_items (tender_id, product_name, description, quantity, unit, specifications)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [tenderId, item.product_name, item.description || null, item.quantity || 1, item.unit || null, item.specifications || null]
            );
        }

        if (visibility === 'invited' && invited_warehouses && invited_warehouses.length > 0) {
            for (const warehouseId of invited_warehouses) {
                await db.run(
                    `INSERT INTO tender_invites (tender_id, warehouse_id)
                     VALUES (?, ?)
                     ON CONFLICT (tender_id, warehouse_id) DO NOTHING`,
                    [tenderId, warehouseId]
                );
            }
        }

        res.json({ 
            message: 'تم إنشاء المناقصة بنجاح',
            tender_id: tenderId
        });
    } catch (err) {
        console.error('Create tender error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Submit bid (warehouse only)
router.post('/:id/bid', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const tenderId = req.params.id;

        if (userRole !== 'warehouse') {
            return res.status(403).json({ error: 'فقط المخازن يمكنها تقديم عطاءات' });
        }

        const { total_amount, delivery_days, validity_days, notes, items } = req.body;

        if (!total_amount || !items || items.length === 0) {
            return res.status(400).json({ error: 'المبلغ الإجمالي والمنتجات مطلوبة' });
        }

        const tender = await db.get(
            `SELECT * FROM tenders 
             WHERE id = ? AND status = 'open'
             AND (visibility = 'public' OR EXISTS (
                 SELECT 1 FROM tender_invites ti WHERE ti.tender_id = tenders.id AND ti.warehouse_id = ?
             ))`,
            [tenderId, userId]
        );

        if (!tender) {
            return res.status(404).json({ error: 'المناقصة غير متاحة' });
        }

        const existingBid = await db.get(
            'SELECT id FROM tender_bids WHERE tender_id = ? AND warehouse_id = ?',
            [tenderId, userId]
        );

        if (existingBid) {
            return res.status(400).json({ error: 'لقد قدمت عطاءاً بالفعل' });
        }

        const result = await db.run(
            `INSERT INTO tender_bids (tender_id, warehouse_id, total_amount, delivery_days, validity_days, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tenderId, userId, total_amount, delivery_days || null, validity_days || 7, notes || null]
        );

        const bidId = result.lastID;

        for (const item of items) {
            await db.run(
                `INSERT INTO tender_bid_items (bid_id, tender_item_id, unit_price, quantity, notes)
                 VALUES (?, ?, ?, ?, ?)`,
                [bidId, item.tender_item_id, item.unit_price, item.quantity || 1, item.notes || null]
            );
        }

        await db.run(
            'UPDATE tender_invites SET viewed_at = CURRENT_TIMESTAMP WHERE tender_id = ? AND warehouse_id = ?',
            [tenderId, userId]
        );

        res.json({ 
            message: 'تم تقديم العطاء بنجاح',
            bid_id: bidId
        });
    } catch (err) {
        console.error('Submit bid error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Accept bid (pharmacy only)
router.post('/:tenderId/bids/:bidId/accept', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const { tenderId, bidId } = req.params;

        if (userRole !== 'pharmacy') {
            return res.status(403).json({ error: 'فقط الصيدليات يمكنها قبول العطاءات' });
        }

        const tender = await db.get(
            "SELECT * FROM tenders WHERE id = ? AND pharmacy_id = ? AND status = 'open'",
            [tenderId, userId]
        );

        if (!tender) {
            return res.status(404).json({ error: 'المناقصة غير موجودة' });
        }

        const bid = await db.get(
            "SELECT * FROM tender_bids WHERE id = ? AND tender_id = ? AND status = 'pending'",
            [bidId, tenderId]
        );

        if (!bid) {
            return res.status(404).json({ error: 'العطاء غير موجود' });
        }

        await db.run(
            "UPDATE tender_bids SET status = 'accepted' WHERE id = ?",
            [bidId]
        );

        await db.run(
            "UPDATE tender_bids SET status = 'rejected' WHERE tender_id = ? AND id != ?",
            [tenderId, bidId]
        );

        await db.run(
            "UPDATE tenders SET status = 'awarded' WHERE id = ?",
            [tenderId]
        );

        const orderResult = await db.run(
            `INSERT INTO orders (pharmacy_id, warehouse_id, total_amount, commission, status, pharmacy_note)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
            [userId, bid.warehouse_id, bid.total_amount, bid.total_amount * 0.05, `طلب من مناقصة: ${tender.title}`]
        );

        const orderId = orderResult.lastID;

        const bidItems = await db.all(
            `SELECT tbi.*, ti.product_name
             FROM tender_bid_items tbi
             JOIN tender_items ti ON tbi.tender_item_id = ti.id
             WHERE tbi.bid_id = ?`,
            [bidId]
        );

        for (const item of bidItems) {
            const product = await db.get(
                'SELECT id FROM products WHERE warehouse_id = ? AND name ILIKE ? LIMIT 1',
                [bid.warehouse_id, `%${item.product_name}%`]
            );

            await db.run(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, product?.id || null, item.quantity, item.unit_price]
            );
        }

        res.json({ 
            message: 'تم قبول العطاء وإنشاء الطلب بنجاح',
            order_id: orderId
        });
    } catch (err) {
        console.error('Accept bid error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Close tender (pharmacy only)
router.post('/:id/close', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const tenderId = req.params.id;

        if (userRole !== 'pharmacy') {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        const tender = await db.get(
            'SELECT * FROM tenders WHERE id = ? AND pharmacy_id = ?',
            [tenderId, userId]
        );

        if (!tender) {
            return res.status(404).json({ error: 'المناقصة غير موجودة' });
        }

        await db.run(
            "UPDATE tenders SET status = 'closed' WHERE id = ?",
            [tenderId]
        );

        await db.run(
            "UPDATE tender_bids SET status = 'rejected' WHERE tender_id = ? AND status = 'pending'",
            [tenderId]
        );

        res.json({ message: 'تم إغلاق المناقصة' });
    } catch (err) {
        console.error('Close tender error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

module.exports = router;