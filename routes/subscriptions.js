const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ============================================
// Subscriptions Routes (Recurring Orders)
// ============================================

// Get all subscriptions for current user
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let subscriptions;
        if (userRole === 'pharmacy') {
            subscriptions = await db.all(
                `SELECT s.*, 
                        w.username as warehouse_name, w.phone as warehouse_phone,
                        (SELECT COUNT(*) FROM subscription_items WHERE subscription_id = s.id) as items_count,
                        (SELECT COUNT(*) FROM subscription_orders WHERE subscription_id = s.id) as orders_count
                 FROM subscriptions s
                 JOIN users w ON s.warehouse_id = w.id
                 WHERE s.pharmacy_id = ?
                 ORDER BY s.next_delivery_date ASC, s.created_at DESC`,
                [userId]
            );
        } else if (userRole === 'warehouse') {
            subscriptions = await db.all(
                `SELECT s.*, 
                        p.username as pharmacy_name, p.phone as pharmacy_phone,
                        (SELECT COUNT(*) FROM subscription_items WHERE subscription_id = s.id) as items_count,
                        (SELECT COUNT(*) FROM subscription_orders WHERE subscription_id = s.id) as orders_count
                 FROM subscriptions s
                 JOIN users p ON s.pharmacy_id = p.id
                 WHERE s.warehouse_id = ?
                 ORDER BY s.next_delivery_date ASC, s.created_at DESC`,
                [userId]
            );
        } else {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        res.json({ subscriptions });
    } catch (err) {
        console.error('Get subscriptions error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get single subscription details
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const subscriptionId = req.params.id;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let subscription;
        if (userRole === 'pharmacy') {
            subscription = await db.get(
                `SELECT s.*, w.username as warehouse_name, w.phone as warehouse_phone
                 FROM subscriptions s
                 JOIN users w ON s.warehouse_id = w.id
                 WHERE s.id = ? AND s.pharmacy_id = ?`,
                [subscriptionId, userId]
            );
        } else if (userRole === 'warehouse') {
            subscription = await db.get(
                `SELECT s.*, p.username as pharmacy_name, p.phone as pharmacy_phone
                 FROM subscriptions s
                 JOIN users p ON s.pharmacy_id = p.id
                 WHERE s.id = ? AND s.warehouse_id = ?`,
                [subscriptionId, userId]
            );
        }

        if (!subscription) {
            return res.status(404).json({ error: 'الاشتراك غير موجود' });
        }

        const items = await db.all(
            `SELECT si.*, p.name as product_name, p.image as product_image, p.price as current_price
             FROM subscription_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.subscription_id = ?`,
            [subscriptionId]
        );

        const orders = await db.all(
            `SELECT so.*, o.status, o.total_amount, o.created_at as order_date
             FROM subscription_orders so
             JOIN orders o ON so.order_id = o.id
             WHERE so.subscription_id = ?
             ORDER BY o.created_at DESC`,
            [subscriptionId]
        );

        res.json({ subscription, items, orders });
    } catch (err) {
        console.error('Get subscription error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Create new subscription
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (userRole !== 'pharmacy') {
            return res.status(403).json({ error: 'فقط الصيدليات يمكنها إنشاء اشتراكات' });
        }

        const { 
            warehouse_id, name, frequency, next_delivery_date,
            preferred_delivery_day, preferred_delivery_time, notes, items 
        } = req.body;

        if (!warehouse_id || !name || !frequency || !items || items.length === 0) {
            return res.status(400).json({ error: 'البيانات المطلوبة غير مكتملة' });
        }

        let nextDelivery = next_delivery_date;
        if (!nextDelivery) {
            const today = new Date();
            nextDelivery = new Date(today);
            nextDelivery.setDate(today.getDate() + 7);
            nextDelivery = nextDelivery.toISOString().split('T')[0];
        }

        const result = await db.run(
            `INSERT INTO subscriptions 
             (pharmacy_id, warehouse_id, name, frequency, next_delivery_date,
              preferred_delivery_day, preferred_delivery_time, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, warehouse_id, name, frequency, nextDelivery,
             preferred_delivery_day || null, preferred_delivery_time || null, notes || null]
        );

        const subscriptionId = result.lastID;

        for (const item of items) {
            await db.run(
                `INSERT INTO subscription_items (subscription_id, product_id, product_name, quantity, notes)
                 VALUES (?, ?, ?, ?, ?)`,
                [subscriptionId, item.product_id || null, item.product_name, item.quantity || 1, item.notes || null]
            );
        }

        res.json({ 
            message: 'تم إنشاء الاشتراك بنجاح',
            subscription_id: subscriptionId
        });
    } catch (err) {
        console.error('Create subscription error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Update subscription
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const subscriptionId = req.params.id;

        if (userRole !== 'pharmacy') {
            return res.status(403).json({ error: 'فقط الصيدليات يمكنها تعديل اشتراكاتها' });
        }

        const subscription = await db.get(
            'SELECT * FROM subscriptions WHERE id = ? AND pharmacy_id = ?',
            [subscriptionId, userId]
        );

        if (!subscription) {
            return res.status(404).json({ error: 'الاشتراك غير موجود' });
        }

        const { name, frequency, next_delivery_date, preferred_delivery_day, 
                preferred_delivery_time, notes, status, items } = req.body;

        await db.run(
            `UPDATE subscriptions SET 
             name = COALESCE(?, name),
             frequency = COALESCE(?, frequency),
             next_delivery_date = COALESCE(?, next_delivery_date),
             preferred_delivery_day = COALESCE(?, preferred_delivery_day),
             preferred_delivery_time = COALESCE(?, preferred_delivery_time),
             notes = COALESCE(?, notes),
             status = COALESCE(?, status)
             WHERE id = ?`,
            [name, frequency, next_delivery_date, preferred_delivery_day, 
             preferred_delivery_time, notes, status, subscriptionId]
        );

        if (items && items.length > 0) {
            await db.run('DELETE FROM subscription_items WHERE subscription_id = ?', [subscriptionId]);
            
            for (const item of items) {
                await db.run(
                    `INSERT INTO subscription_items (subscription_id, product_id, product_name, quantity, notes)
                     VALUES (?, ?, ?, ?, ?)`,
                    [subscriptionId, item.product_id || null, item.product_name, item.quantity || 1, item.notes || null]
                );
            }
        }

        res.json({ message: 'تم تحديث الاشتراك بنجاح' });
    } catch (err) {
        console.error('Update subscription error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Pause subscription
router.post('/:id/pause', async (req, res) => {
    try {
        const userId = req.user?.id;
        const subscriptionId = req.params.id;

        const subscription = await db.get(
            'SELECT * FROM subscriptions WHERE id = ? AND (pharmacy_id = ? OR warehouse_id = ?)',
            [subscriptionId, userId, userId]
        );

        if (!subscription) {
            return res.status(404).json({ error: 'الاشتراك غير موجود' });
        }

        await db.run(
            "UPDATE subscriptions SET status = 'paused' WHERE id = ?",
            [subscriptionId]
        );

        res.json({ message: 'تم إيقاف الاشتراك مؤقتاً' });
    } catch (err) {
        console.error('Pause subscription error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Resume subscription
router.post('/:id/resume', async (req, res) => {
    try {
        const userId = req.user?.id;
        const subscriptionId = req.params.id;

        const subscription = await db.get(
            'SELECT * FROM subscriptions WHERE id = ? AND (pharmacy_id = ? OR warehouse_id = ?)',
            [subscriptionId, userId, userId]
        );

        if (!subscription) {
            return res.status(404).json({ error: 'الاشتراك غير موجود' });
        }

        await db.run(
            "UPDATE subscriptions SET status = 'active' WHERE id = ?",
            [subscriptionId]
        );

        res.json({ message: 'تم استئناف الاشتراك' });
    } catch (err) {
        console.error('Resume subscription error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Cancel subscription
router.post('/:id/cancel', async (req, res) => {
    try {
        const userId = req.user?.id;
        const subscriptionId = req.params.id;
        const { reason } = req.body;

        const subscription = await db.get(
            'SELECT * FROM subscriptions WHERE id = ? AND (pharmacy_id = ? OR warehouse_id = ?)',
            [subscriptionId, userId, userId]
        );

        if (!subscription) {
            return res.status(404).json({ error: 'الاشتراك غير موجود' });
        }

        await db.run(
            "UPDATE subscriptions SET status = 'cancelled' WHERE id = ?",
            [subscriptionId]
        );

        res.json({ message: 'تم إلغاء الاشتراك', reason });
    } catch (err) {
        console.error('Cancel subscription error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Generate order from subscription
router.post('/:id/generate-order', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const subscriptionId = req.params.id;

        if (userRole !== 'pharmacy') {
            return res.status(403).json({ error: 'فقط الصيدليات يمكنها إنشاء طلبات من اشتراكاتها' });
        }

        const subscription = await db.get(
            `SELECT s.*, w.username as warehouse_name
             FROM subscriptions s
             JOIN users w ON s.warehouse_id = w.id
             WHERE s.id = ? AND s.pharmacy_id = ? AND s.status = 'active'`,
            [subscriptionId, userId]
        );

        if (!subscription) {
            return res.status(404).json({ error: 'الاشتراك غير موجود أو غير نشط' });
        }

        const items = await db.all(
            'SELECT * FROM subscription_items WHERE subscription_id = ?',
            [subscriptionId]
        );

        if (items.length === 0) {
            return res.status(400).json({ error: 'لا توجد منتجات في الاشتراك' });
        }

        let totalAmount = 0;
        const orderItems = [];

        for (const item of items) {
            if (item.product_id) {
                const product = await db.get(
                    'SELECT price, quantity as stock FROM products WHERE id = ?',
                    [item.product_id]
                );
                if (product && product.stock >= item.quantity) {
                    totalAmount += product.price * item.quantity;
                    orderItems.push({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        price: product.price
                    });
                }
            }
        }

        if (orderItems.length === 0) {
            return res.status(400).json({ error: 'لا توجد منتجات متاحة في المخزن' });
        }

        const commission = totalAmount * 0.05;
        const orderResult = await db.run(
            `INSERT INTO orders (pharmacy_id, warehouse_id, total_amount, commission, status, pharmacy_note)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
            [userId, subscription.warehouse_id, totalAmount, commission, `طلب من اشتراك: ${subscription.name}`]
        );

        const orderId = orderResult.lastID;

        for (const item of orderItems) {
            await db.run(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, item.product_id, item.quantity, item.price]
            );
        }

        await db.run(
            'INSERT INTO subscription_orders (subscription_id, order_id) VALUES (?, ?)',
            [subscriptionId, orderId]
        );

        await db.run(
            'UPDATE subscriptions SET total_orders = total_orders + 1 WHERE id = ?',
            [subscriptionId]
        );

        // Calculate next delivery date
        const nextDelivery = calculateNextDelivery(subscription.frequency, subscription.next_delivery_date);
        await db.run(
            'UPDATE subscriptions SET next_delivery_date = ? WHERE id = ?',
            [nextDelivery, subscriptionId]
        );

        res.json({ 
            message: 'تم إنشاء الطلب بنجاح',
            order_id: orderId
        });
    } catch (err) {
        console.error('Generate order error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

function calculateNextDelivery(frequency, currentDate) {
    const date = new Date(currentDate);
    switch (frequency) {
        case 'weekly':
            date.setDate(date.getDate() + 7);
            break;
        case 'biweekly':
            date.setDate(date.getDate() + 14);
            break;
        case 'monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'bimonthly':
            date.setMonth(date.getMonth() + 2);
            break;
        case 'quarterly':
            date.setMonth(date.getMonth() + 3);
            break;
    }
    return date.toISOString().split('T')[0];
}

module.exports = router;