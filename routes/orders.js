const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { createNotification } = require('../services/notification-service');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';
const COMMISSION_RATE = 0.10;
const CANCELLATION_WINDOW_MINUTES = Number.parseInt(process.env.CANCELLATION_WINDOW_MINUTES || '120', 10);

const STATUS_TRANSITIONS = {
    pending: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
};

const RETURN_STATUS_TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['completed'],
    rejected: [],
    completed: []
};

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح' });
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ error: 'رمز غير صالح' });
    }
}

function calculateLinePricing(product, requestedQuantity) {
    const unitPrice = Number(product.price) || 0;
    const discountPercent = Math.max(0, Math.min(100, Number(product.discount_percent) || 0));
    const discountedUnitPrice = unitPrice * (1 - discountPercent / 100);
    const bonusBuy = Math.max(0, Number(product.bonus_buy_quantity) || 0);
    const bonusFree = Math.max(0, Number(product.bonus_free_quantity) || 0);

    let chargeableQuantity = requestedQuantity;
    if (bonusBuy > 0 && bonusFree > 0) {
        const groupSize = bonusBuy + bonusFree;
        const freeUnits = Math.floor(requestedQuantity / groupSize) * bonusFree;
        chargeableQuantity = Math.max(0, requestedQuantity - freeUnits);
    }

    const lineTotal = discountedUnitPrice * chargeableQuantity;
    const effectiveUnitPrice = requestedQuantity > 0 ? lineTotal / requestedQuantity : 0;
    return { lineTotal, effectiveUnitPrice };
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

async function restoreOrderQuantities(orderId) {
    const items = await dbAll('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
    for (const item of items) {
        await dbRun('UPDATE products SET quantity = quantity + ? WHERE id = ?', [item.quantity, item.product_id]);
    }
}

async function updateInvoiceForOrder(orderId, status) {
    if (status === 'paid') {
        await dbRun(
            'UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP, cancelled_at = NULL WHERE order_id = ?',
            ['paid', orderId]
        );
        return;
    }

    if (status === 'cancelled') {
        await dbRun(
            'UPDATE invoices SET status = ?, cancelled_at = CURRENT_TIMESTAMP, paid_at = NULL WHERE order_id = ?',
            ['cancelled', orderId]
        );
    }
}

async function logOrderEvent({
    orderId,
    eventType,
    fromStatus = null,
    toStatus = null,
    actorUserId = null,
    actorRole = null,
    message,
    meta = null
}) {
    await dbRun(
        `
            INSERT INTO order_events (
                order_id, event_type, from_status, to_status,
                actor_user_id, actor_role, message, meta_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            orderId,
            eventType,
            fromStatus,
            toStatus,
            actorUserId,
            actorRole,
            message,
            meta ? JSON.stringify(meta) : null
        ]
    );
}

async function queueSmsNotification(userId, message, relatedId, metadata = null) {
    const user = await dbGet('SELECT phone FROM users WHERE id = ?', [userId]);
    if (!user?.phone) return;

    await createNotification({
        userId,
        type: 'sms_queued',
        message: `[SMS Queue] ${message}`,
        relatedId,
        metadata
    });
}

async function attachOrderItems(orders) {
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) return orders;

    const placeholders = orderIds.map(() => '?').join(',');
    const items = await dbAll(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
    const itemsMap = {};

    for (const item of items) {
        if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
        itemsMap[item.order_id].push(item);
    }

    orders.forEach((order) => {
        order.items = itemsMap[order.id] || [];
    });
    return orders;
}

router.get('/', verifyToken, async (req, res) => {
    try {
        const { status } = req.query;
        let query;
        let params;

        if (req.user.role === 'admin') {
            query = `
                SELECT o.*, u1.username as pharmacy_name, u2.username as warehouse_name
                FROM orders o
                JOIN users u1 ON o.pharmacy_id = u1.id
                JOIN users u2 ON o.warehouse_id = u2.id
                WHERE o.is_deleted = 0
            `;
            params = [];
        } else if (req.user.role === 'warehouse') {
            query = `
                SELECT o.*, u1.username as pharmacy_name, u2.username as warehouse_name
                FROM orders o
                JOIN users u1 ON o.pharmacy_id = u1.id
                JOIN users u2 ON o.warehouse_id = u2.id
                WHERE o.warehouse_id = ? AND o.is_deleted = 0
            `;
            params = [req.user.id];
        } else {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        if (status) {
            query += ' AND o.status = ?';
            params.push(status);
        }
        query += ' ORDER BY o.created_at DESC';

        const orders = await dbAll(query, params);
        await attachOrderItems(orders);
        return res.json({ orders });
    } catch (err) {
        console.error('GET /orders error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.get('/my-orders', verifyToken, async (req, res) => {
    if (req.user.role !== 'pharmacy') {
        return res.status(403).json({ error: 'غير مصرح' });
    }

    try {
        const { status } = req.query;
        let query = `
            SELECT o.*, u.username as warehouse_name
            FROM orders o
            JOIN users u ON o.warehouse_id = u.id
            WHERE o.pharmacy_id = ? AND o.is_deleted = 0
        `;
        const params = [req.user.id];

        if (status) {
            query += ' AND o.status = ?';
            params.push(status);
        }
        query += ' ORDER BY o.created_at DESC';

        const orders = await dbAll(query, params);
        await attachOrderItems(orders);
        return res.json({ orders });
    } catch (err) {
        console.error('GET /orders/my-orders error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.get('/returns/my', verifyToken, async (req, res) => {
    try {
        let query = `
            SELECT r.*, p.username AS pharmacy_name, w.username AS warehouse_name
            FROM returns r
            JOIN users p ON r.pharmacy_id = p.id
            JOIN users w ON r.warehouse_id = w.id
        `;
        const params = [];

        if (req.user.role === 'pharmacy') {
            query += ' WHERE r.pharmacy_id = ?';
            params.push(req.user.id);
        } else if (req.user.role === 'warehouse') {
            query += ' WHERE r.warehouse_id = ?';
            params.push(req.user.id);
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        query += ' ORDER BY r.created_at DESC';
        const returnsRows = await dbAll(query, params);
        return res.json({ returns: returnsRows });
    } catch (err) {
        console.error('GET /orders/returns/my error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.put('/returns/:returnId/status', verifyToken, async (req, res) => {
    const returnId = Number.parseInt(req.params.returnId, 10);
    const { status } = req.body;

    if (!Number.isInteger(returnId)) {
        return res.status(400).json({ error: 'معرف المرتجع غير صالح' });
    }

    try {
        const returnRow = await dbGet('SELECT * FROM returns WHERE id = ?', [returnId]);
        if (!returnRow) {
            return res.status(404).json({ error: 'طلب المرتجع غير موجود' });
        }
        if (req.user.role === 'warehouse' && returnRow.warehouse_id !== req.user.id) {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        if (!['warehouse', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        const allowed = RETURN_STATUS_TRANSITIONS[returnRow.status] || [];
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: 'انتقال حالة المرتجع غير مسموح' });
        }

        await dbRun(
            'UPDATE returns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, returnId]
        );

        if (status === 'completed') {
            const items = await dbAll('SELECT product_id, quantity FROM return_items WHERE return_id = ?', [returnId]);
            for (const item of items) {
                await dbRun('UPDATE products SET quantity = quantity + ? WHERE id = ?', [item.quantity, item.product_id]);
            }
        }

        await logOrderEvent({
            orderId: returnRow.order_id,
            eventType: 'order_status_changed',
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: `تم تحديث حالة المرتجع إلى ${status}`,
            meta: { return_id: returnId, return_status: status }
        });

        return res.json({ message: 'تم تحديث حالة المرتجع بنجاح' });
    } catch (err) {
        console.error('PUT /orders/returns/:id/status error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.get('/:id/purchase-order', verifyToken, async (req, res) => {
    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'معرف الطلب غير صالح' });
    }

    try {
        const order = await dbGet(
            `
                SELECT o.*, p.username AS pharmacy_name, p.address AS pharmacy_address,
                       w.username AS warehouse_name, w.address AS warehouse_address
                FROM orders o
                JOIN users p ON p.id = o.pharmacy_id
                JOIN users w ON w.id = o.warehouse_id
                WHERE o.id = ?
            `,
            [orderId]
        );

        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        if (req.user.role === 'pharmacy' && order.pharmacy_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });
        if (req.user.role === 'warehouse' && order.warehouse_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });

        const items = await dbAll(
            `
                SELECT oi.*, p.name AS product_name
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = ?
            `,
            [orderId]
        );

        const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>أمر توريد #${order.id}</title>
<style>
body { font-family: Arial, sans-serif; margin: 24px; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
th, td { border: 1px solid #ccc; padding: 8px; text-align: right; }
.muted { color: #666; }
</style>
</head>
<body>
<h2>أمر توريد #${order.id}</h2>
<div class="muted">أنشئ في: ${order.created_at}</div>
<p><strong>المخزن:</strong> ${order.warehouse_name}</p>
<p><strong>الصيدلية:</strong> ${order.pharmacy_name}</p>
<table>
<thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th></tr></thead>
<tbody>
${items.map((it) => `<tr><td>${it.product_name || `منتج #${it.product_id}`}</td><td>${it.quantity}</td><td>${Number(it.price).toFixed(2)}</td></tr>`).join('')}
</tbody>
</table>
<p><strong>الإجمالي:</strong> ${Number(order.total_amount).toFixed(2)} ج.م</p>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('GET /orders/:id/purchase-order error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.get('/:id', verifyToken, async (req, res) => {
    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'معرف الطلب غير صالح' });
    }

    try {
        const order = await dbGet(
            `
                SELECT o.*, u1.username as pharmacy_name, u1.address as pharmacy_address,
                       u2.username as warehouse_name, u2.address as warehouse_address
                FROM orders o
                JOIN users u1 ON o.pharmacy_id = u1.id
                JOIN users u2 ON o.warehouse_id = u2.id
                WHERE o.id = ?
            `,
            [orderId]
        );

        if (!order) {
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        if (req.user.role === 'pharmacy' && order.pharmacy_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });
        if (req.user.role === 'warehouse' && order.warehouse_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });

        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        if (items.length > 0) {
            const productIds = items.map((i) => i.product_id);
            const placeholders = productIds.map(() => '?').join(',');
            const products = await dbAll(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds);
            const productsMap = {};
            products.forEach((p) => { productsMap[p.id] = p; });
            items.forEach((item) => { item.product = productsMap[item.product_id]; });
        }
        order.items = items;

        await logOrderEvent({
            orderId,
            eventType: 'order_viewed',
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: 'تم فتح تفاصيل الطلب',
            meta: { source: 'order_details_api' }
        });

        order.timeline = await dbAll(
            `
                SELECT e.*, u.username as actor_username
                FROM order_events e
                LEFT JOIN users u ON u.id = e.actor_user_id
                WHERE e.order_id = ?
                ORDER BY e.created_at ASC, e.id ASC
            `,
            [orderId]
        );

        if (order.timeline.length === 0) {
            await dbRun(
                `
                    INSERT INTO order_events (
                        order_id, event_type, from_status, to_status,
                        actor_user_id, actor_role, message, meta_json, created_at
                    ) VALUES (?, 'order_created', NULL, ?, NULL, 'system', ?, ?, ?)
                `,
                [
                    orderId,
                    order.status || 'pending',
                    'تم إنشاء سجل تتبع لهذا الطلب',
                    JSON.stringify({ bootstrap: true, reason: 'legacy_order_no_events' }),
                    order.created_at || null
                ]
            );

            order.timeline = await dbAll(
                `
                    SELECT e.*, u.username as actor_username
                    FROM order_events e
                    LEFT JOIN users u ON u.id = e.actor_user_id
                    WHERE e.order_id = ?
                    ORDER BY e.created_at ASC, e.id ASC
                `,
                [orderId]
            );
        }

        const returnsRows = await dbAll(
            `
                SELECT r.*, COUNT(ri.id) AS items_count
                FROM returns r
                LEFT JOIN return_items ri ON ri.return_id = r.id
                WHERE r.order_id = ?
                GROUP BY r.id
                ORDER BY r.created_at DESC
            `,
            [orderId]
        );
        order.returns = returnsRows;

        return res.json({ order });
    } catch (err) {
        console.error('GET /orders/:id error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.post('/', verifyToken, async (req, res) => {
    if (req.user.role !== 'pharmacy') {
        return res.status(403).json({ error: 'غير مصرح' });
    }

    const { warehouse_id, items, note, expected_delivery_date } = req.body;
    const warehouseId = Number.parseInt(warehouse_id, 10);
    if (!warehouseId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'المخزن والمنتجات مطلوبة' });
    }

    try {
        const warehouse = await dbGet("SELECT id FROM users WHERE id = ? AND role = 'warehouse'", [warehouseId]);
        if (!warehouse) return res.status(400).json({ error: 'المخزن غير موجود' });

        let totalAmount = 0;
        const orderItems = [];

        for (const rawItem of items) {
            const productId = Number.parseInt(rawItem.product_id ?? rawItem.id, 10);
            const quantity = Number.parseInt(rawItem.quantity, 10);
            if (!productId || !quantity || quantity <= 0) {
                return res.status(400).json({ error: 'بيانات المنتج أو الكمية غير صالحة' });
            }

            const product = await dbGet('SELECT * FROM products WHERE id = ? AND warehouse_id = ?', [productId, warehouseId]);
            if (!product) return res.status(400).json({ error: `المنتج غير موجود في هذا المخزن (#${productId})` });
            if (product.quantity < quantity) return res.status(400).json({ error: `الكمية غير متوفرة للمنتج ${product.name}` });

            const pricing = calculateLinePricing(product, quantity);
            totalAmount += pricing.lineTotal;
            orderItems.push({ product_id: product.id, quantity, price: pricing.effectiveUnitPrice });
        }

        const commission = totalAmount * COMMISSION_RATE;
        const cancellableUntil = addMinutes(new Date(), CANCELLATION_WINDOW_MINUTES).toISOString();
        const createdOrder = await dbRun(
            `
                INSERT INTO orders (
                    pharmacy_id, warehouse_id, total_amount, commission, status,
                    cancellable_until, expected_delivery_date, pharmacy_note
                )
                VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
            `,
            [req.user.id, warehouseId, totalAmount, commission, cancellableUntil, expected_delivery_date || null, note || null]
        );
        const orderId = createdOrder.lastID;

        for (const item of orderItems) {
            await dbRun(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, item.product_id, item.quantity, item.price]
            );
            await dbRun('UPDATE products SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.product_id]);
        }

        await dbRun(
            'INSERT INTO invoices (order_id, amount, commission, net_amount, status) VALUES (?, ?, ?, ?, ?)',
            [orderId, totalAmount, commission, totalAmount + commission, 'pending']
        );

        await createNotification({
            userId: warehouseId,
            type: 'new_order',
            message: 'لديك طلب جديد من صيدلية',
            relatedId: orderId,
            metadata: {
                order_id: orderId,
                order_status: 'pending',
                total_amount: Number(totalAmount.toFixed(2)),
                items_count: orderItems.length,
                total_quantity: orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
                expected_delivery_date: expected_delivery_date || null
            }
        });

        await logOrderEvent({
            orderId,
            eventType: 'order_created',
            toStatus: 'pending',
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: 'تم إنشاء الطلب',
            meta: { cancellable_until: cancellableUntil, expected_delivery_date: expected_delivery_date || null }
        });

        return res.json({
            message: 'تم إنشاء الطلب بنجاح',
            order: { id: orderId, total_amount: totalAmount, commission, status: 'pending', cancellable_until: cancellableUntil }
        });
    } catch (err) {
        console.error('POST /orders error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.put('/:id/notes', verifyToken, async (req, res) => {
    const orderId = Number.parseInt(req.params.id, 10);
    const note = String(req.body?.note || '').trim();

    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'معرف الطلب غير صالح' });
    if (!note) return res.status(400).json({ error: 'الملاحظة مطلوبة' });

    try {
        const order = await dbGet('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

        let field;
        if (req.user.role === 'pharmacy' && order.pharmacy_id === req.user.id) {
            field = 'pharmacy_note';
        } else if (req.user.role === 'warehouse' && order.warehouse_id === req.user.id) {
            field = 'warehouse_note';
        } else {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        await dbRun(`UPDATE orders SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [note, orderId]);
        await logOrderEvent({
            orderId,
            eventType: 'order_status_changed',
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: 'تمت إضافة/تحديث ملاحظة على الطلب',
            meta: { note_field: field }
        });

        return res.json({ message: 'تم حفظ الملاحظة بنجاح' });
    } catch (err) {
        console.error('PUT /orders/:id/notes error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.put('/:id/expected-delivery', verifyToken, async (req, res) => {
    const orderId = Number.parseInt(req.params.id, 10);
    const expectedDate = req.body?.expected_delivery_date || null;
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'معرف الطلب غير صالح' });

    try {
        const order = await dbGet('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        if (req.user.role !== 'warehouse' || order.warehouse_id !== req.user.id) {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        await dbRun(
            'UPDATE orders SET expected_delivery_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [expectedDate, orderId]
        );
        await logOrderEvent({
            orderId,
            eventType: 'order_status_changed',
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: 'تم تحديث تاريخ التسليم المتوقع',
            meta: { expected_delivery_date: expectedDate }
        });

        return res.json({ message: 'تم تحديث تاريخ التسليم المتوقع' });
    } catch (err) {
        console.error('PUT /orders/:id/expected-delivery error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.post('/:id/returns', verifyToken, async (req, res) => {
    const orderId = Number.parseInt(req.params.id, 10);
    const { reason, note, items } = req.body;
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'معرف الطلب غير صالح' });
    if (req.user.role !== 'pharmacy') return res.status(403).json({ error: 'غير مصرح' });
    if (!reason || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'سبب المرتجع والعناصر مطلوبة' });
    }

    try {
        const order = await dbGet('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        if (order.pharmacy_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });
        if (order.status !== 'delivered') return res.status(400).json({ error: 'المرتجع متاح فقط بعد التسليم' });

        const createdReturn = await dbRun(
            `
                INSERT INTO returns (order_id, pharmacy_id, warehouse_id, reason, note, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
            `,
            [orderId, order.pharmacy_id, order.warehouse_id, reason, note || null]
        );
        const returnId = createdReturn.lastID;

        for (const item of items) {
            const productId = Number.parseInt(item.product_id, 10);
            const quantity = Number.parseInt(item.quantity, 10);
            if (!productId || !quantity || quantity <= 0) {
                return res.status(400).json({ error: 'عنصر مرتجع غير صالح' });
            }
            await dbRun(
                'INSERT INTO return_items (return_id, product_id, quantity) VALUES (?, ?, ?)',
                [returnId, productId, quantity]
            );
        }

        await createNotification({
            userId: order.warehouse_id,
            type: 'return_request',
            message: 'تم إرسال طلب مرتجع جديد',
            relatedId: returnId
        });

        await logOrderEvent({
            orderId,
            eventType: 'order_status_changed',
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: 'تم إنشاء طلب مرتجع',
            meta: { return_id: returnId }
        });

        return res.json({ message: 'تم إنشاء طلب المرتجع بنجاح', return_id: returnId });
    } catch (err) {
        console.error('POST /orders/:id/returns error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.put('/:id/status', verifyToken, async (req, res) => {
    if (req.user.role !== 'warehouse') return res.status(403).json({ error: 'غير مصرح' });

    const orderId = Number.parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'معرف الطلب غير صالح' });
    if (!Object.prototype.hasOwnProperty.call(STATUS_TRANSITIONS, status)) {
        return res.status(400).json({ error: 'حالة غير صالحة' });
    }

    try {
        const order = await dbGet('SELECT * FROM orders WHERE id = ? AND warehouse_id = ?', [orderId, req.user.id]);
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        if (order.is_deleted) return res.status(400).json({ error: 'لا يمكن تعديل طلب محذوف منطقيًا' });

        const allowed = STATUS_TRANSITIONS[order.status] || [];
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: `انتقال الحالة غير مسموح (${order.status} -> ${status})` });
        }

        await dbRun('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, orderId]);

        if (status === 'cancelled') {
            await restoreOrderQuantities(orderId);
            await updateInvoiceForOrder(orderId, 'cancelled');
            await logOrderEvent({
                orderId,
                eventType: 'order_cancelled',
                fromStatus: order.status,
                toStatus: 'cancelled',
                actorUserId: req.user.id,
                actorRole: req.user.role,
                message: 'تم إلغاء الطلب'
            });
        } else if (status === 'delivered') {
            await updateInvoiceForOrder(orderId, 'paid');
        }

        await logOrderEvent({
            orderId,
            eventType: 'order_status_changed',
            fromStatus: order.status,
            toStatus: status,
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: `تم تغيير حالة الطلب من ${order.status} إلى ${status}`
        });

        const statusMessages = {
            processing: 'جاري تنفيذ طلبك',
            shipped: 'تم شحن طلبك',
            delivered: 'تم تسليم طلبك',
            cancelled: 'تم إلغاء طلبك'
        };

        const notifyMessage = statusMessages[status] || 'تم تحديث حالة طلبك';
        await createNotification({
            userId: order.pharmacy_id,
            type: 'order_update',
            message: notifyMessage,
            relatedId: orderId,
            metadata: {
                order_id: orderId,
                order_status: status,
                previous_status: order.status,
                total_amount: Number(order.total_amount || 0),
                expected_delivery_date: order.expected_delivery_date || null
            }
        });
        await queueSmsNotification(order.pharmacy_id, notifyMessage, orderId, {
            order_id: orderId,
            order_status: status,
            total_amount: Number(order.total_amount || 0),
            expected_delivery_date: order.expected_delivery_date || null
        });

        return res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
    } catch (err) {
        console.error('PUT /orders/:id/status error:', err.message);
        return res.status(500).json({ error: 'خطأ في تحديث الحالة' });
    }
});

router.delete('/:id', verifyToken, async (req, res) => {
    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'معرف الطلب غير صالح', code: 'INVALID_ID' });
    }

    try {
        const order = await dbGet('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود', code: 'NOT_FOUND' });

        const isPharmacy = req.user.role === 'pharmacy' && order.pharmacy_id === req.user.id;
        const isWarehouse = req.user.role === 'warehouse' && order.warehouse_id === req.user.id;
        const isAdmin = req.user.role === 'admin';
        if (!isPharmacy && !isWarehouse && !isAdmin) {
            return res.status(403).json({ error: 'غير مصرح لك بحذف هذا الطلب', code: 'FORBIDDEN' });
        }
        if (order.status !== 'pending') {
            return res.status(400).json({ error: 'يمكن حذف الطلبات المعلقة فقط', code: 'INVALID_STATUS' });
        }
        if (order.is_deleted) {
            return res.status(400).json({ error: 'الطلب محذوف بالفعل', code: 'ALREADY_DELETED' });
        }

        if (isPharmacy && order.cancellable_until) {
            const deadline = new Date(order.cancellable_until);
            if (new Date() > deadline) {
                return res.status(400).json({
                    error: 'انتهت نافذة الإلغاء لهذا الطلب',
                    code: 'CANCELLATION_WINDOW_EXPIRED'
                });
            }
        }

        await restoreOrderQuantities(orderId);
        await updateInvoiceForOrder(orderId, 'cancelled');
        await dbRun(
            `
                UPDATE orders
                SET status = 'cancelled', is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `,
            [orderId]
        );

        await logOrderEvent({
            orderId,
            eventType: 'order_deleted',
            fromStatus: 'pending',
            toStatus: 'cancelled',
            actorUserId: req.user.id,
            actorRole: req.user.role,
            message: 'تم حذف الطلب من الواجهة (إلغاء منطقي)',
            meta: { source: 'delete_endpoint', soft_delete: true }
        });

        return res.json({ message: 'تم حذف الطلب بنجاح' });
    } catch (err) {
        console.error('DELETE /orders/:id error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم', code: 'DELETE_ERROR' });
    }
});

module.exports = router;





