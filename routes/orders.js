const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { createNotification } = require('../services/notification-service');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';
const COMMISSION_RATE = 0.10;
const parsedCancellationWindow = Number.parseInt(process.env.CANCELLATION_WINDOW_MINUTES || '120', 10);
const CANCELLATION_WINDOW_MINUTES = Number.isFinite(parsedCancellationWindow) && parsedCancellationWindow > 0
    ? parsedCancellationWindow
    : 120;

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
        const { status } = req.query || {};
        let ordersQuery = db.supabase
            .from('orders')
            .select('*')
            .eq('is_deleted', 0)
            .order('created_at', { ascending: false });

        if (req.user.role === 'warehouse') {
            ordersQuery = ordersQuery.eq('warehouse_id', req.user.id);
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        if (typeof status === 'string' && status.trim()) {
            ordersQuery = ordersQuery.eq('status', status.trim());
        }

        const { data: orders, error: ordersError } = await ordersQuery;
        if (ordersError) throw ordersError;

        const safeOrders = orders || [];
        if (safeOrders.length === 0) {
            return res.json({ orders: [] });
        }

        const pharmacyIds = [...new Set(safeOrders.map((o) => o.pharmacy_id).filter(Boolean))];
        const warehouseIds = [...new Set(safeOrders.map((o) => o.warehouse_id).filter(Boolean))];
        const userIds = [...new Set([...pharmacyIds, ...warehouseIds])];

        const { data: users, error: usersError } = await db.supabase
            .from('users')
            .select('id, username')
            .in('id', userIds);
        if (usersError) throw usersError;

        const usersMap = new Map((users || []).map((u) => [u.id, u.username]));

        const orderIds = safeOrders.map((o) => o.id);
        const { data: items, error: itemsError } = await db.supabase
            .from('order_items')
            .select('*')
            .in('order_id', orderIds);
        if (itemsError) throw itemsError;

        const itemsByOrderId = new Map();
        for (const item of items || []) {
            const list = itemsByOrderId.get(item.order_id) || [];
            list.push(item);
            itemsByOrderId.set(item.order_id, list);
        }

        const hydratedOrders = safeOrders.map((order) => ({
            ...order,
            pharmacy_name: usersMap.get(order.pharmacy_id) || null,
            warehouse_name: usersMap.get(order.warehouse_id) || null,
            items: itemsByOrderId.get(order.id) || []
        }));

        return res.json({ orders: hydratedOrders });
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
        const { status } = req.query || {};
        let ordersQuery = db.supabase
            .from('orders')
            .select('*')
            .eq('pharmacy_id', req.user.id)
            .eq('is_deleted', 0)
            .order('created_at', { ascending: false });

        if (typeof status === 'string' && status.trim()) {
            ordersQuery = ordersQuery.eq('status', status.trim());
        }

        const { data: orders, error: ordersError } = await ordersQuery;
        if (ordersError) throw ordersError;

        const safeOrders = orders || [];
        if (safeOrders.length === 0) {
            return res.json({ orders: [] });
        }

        const warehouseIds = [...new Set(safeOrders.map((o) => o.warehouse_id).filter(Boolean))];
        const { data: warehouses, error: warehousesError } = await db.supabase
            .from('users')
            .select('id, username')
            .in('id', warehouseIds);
        if (warehousesError) throw warehousesError;

        const warehouseMap = new Map((warehouses || []).map((w) => [w.id, w.username]));

        const orderIds = safeOrders.map((o) => o.id);
        const { data: items, error: itemsError } = await db.supabase
            .from('order_items')
            .select('*')
            .in('order_id', orderIds);
        if (itemsError) throw itemsError;

        const itemsByOrderId = new Map();
        for (const item of items || []) {
            const list = itemsByOrderId.get(item.order_id) || [];
            list.push(item);
            itemsByOrderId.set(item.order_id, list);
        }

        const hydratedOrders = safeOrders.map((order) => ({
            ...order,
            warehouse_name: warehouseMap.get(order.warehouse_id) || null,
            items: itemsByOrderId.get(order.id) || []
        }));
        return res.json({ orders: hydratedOrders });
    } catch (err) {
        console.error('GET /orders/my-orders error:', err.message);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.get('/returns/my', verifyToken, async (req, res) => {
    try {
        let returnsQuery = db.supabase
            .from('returns')
            .select('*')
            .order('created_at', { ascending: false });

        if (req.user.role === 'pharmacy') {
            returnsQuery = returnsQuery.eq('pharmacy_id', req.user.id);
        } else if (req.user.role === 'warehouse') {
            returnsQuery = returnsQuery.eq('warehouse_id', req.user.id);
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        const { data: returnsRows, error: returnsError } = await returnsQuery;
        if (returnsError) throw returnsError;

        const safeReturns = returnsRows || [];
        if (safeReturns.length === 0) {
            return res.json({ returns: [] });
        }

        const userIds = [...new Set(
            safeReturns
                .flatMap((r) => [r.pharmacy_id, r.warehouse_id])
                .filter(Boolean)
        )];
        const { data: users, error: usersError } = await db.supabase
            .from('users')
            .select('id, username')
            .in('id', userIds);
        if (usersError) throw usersError;

        const usersMap = new Map((users || []).map((u) => [u.id, u.username]));

        const hydratedReturns = safeReturns.map((row) => ({
            ...row,
            pharmacy_name: usersMap.get(row.pharmacy_id) || null,
            warehouse_name: usersMap.get(row.warehouse_id) || null
        }));

        return res.json({ returns: hydratedReturns });
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
        const { data: orderRows, error: orderError } = await db.supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .limit(1);
        if (orderError) throw orderError;

        const order = (orderRows || [])[0];

        if (!order) {
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        if (req.user.role === 'pharmacy' && order.pharmacy_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });
        if (req.user.role === 'warehouse' && order.warehouse_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });

        const profileIds = [order.pharmacy_id, order.warehouse_id].filter(Boolean);
        if (profileIds.length > 0) {
            const { data: profiles, error: profilesError } = await db.supabase
                .from('users')
                .select('id, username, address')
                .in('id', profileIds);
            if (profilesError) throw profilesError;

            const profilesMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
            order.pharmacy_name = profilesMap.get(order.pharmacy_id)?.username || null;
            order.pharmacy_address = profilesMap.get(order.pharmacy_id)?.address || null;
            order.warehouse_name = profilesMap.get(order.warehouse_id)?.username || null;
            order.warehouse_address = profilesMap.get(order.warehouse_id)?.address || null;
        }

        const { data: itemsData, error: itemsError } = await db.supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);
        if (itemsError) throw itemsError;

        const items = itemsData || [];
        if (items.length > 0) {
            const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
            const { data: products, error: productsError } = await db.supabase
                .from('products')
                .select('*')
                .in('id', productIds);
            if (productsError) throw productsError;

            const productsMap = new Map((products || []).map((product) => [product.id, product]));
            items.forEach((item) => { item.product = productsMap.get(item.product_id) || null; });
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

        const buildTimeline = async () => {
            const { data: events, error: eventsError } = await db.supabase
                .from('order_events')
                .select('*')
                .eq('order_id', orderId)
                .order('created_at', { ascending: true })
                .order('id', { ascending: true });
            if (eventsError) throw eventsError;

            const safeEvents = events || [];
            const actorIds = [...new Set(safeEvents.map((event) => event.actor_user_id).filter(Boolean))];
            const actorMap = new Map();

            if (actorIds.length > 0) {
                const { data: actors, error: actorsError } = await db.supabase
                    .from('users')
                    .select('id, username')
                    .in('id', actorIds);
                if (actorsError) throw actorsError;

                (actors || []).forEach((actor) => actorMap.set(actor.id, actor.username));
            }

            return safeEvents.map((event) => ({
                ...event,
                actor_username: event.actor_user_id ? actorMap.get(event.actor_user_id) || null : null
            }));
        };

        order.timeline = await buildTimeline();

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

            order.timeline = await buildTimeline();
        }

        const { data: returnsRows, error: returnsError } = await db.supabase
            .from('returns')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });
        if (returnsError) throw returnsError;

        const safeReturns = returnsRows || [];
        if (safeReturns.length > 0) {
            const returnIds = safeReturns.map((row) => row.id);
            const { data: returnItems, error: returnItemsError } = await db.supabase
                .from('return_items')
                .select('id, return_id')
                .in('return_id', returnIds);
            if (returnItemsError) throw returnItemsError;

            const itemsCountByReturn = new Map();
            for (const row of returnItems || []) {
                itemsCountByReturn.set(row.return_id, (itemsCountByReturn.get(row.return_id) || 0) + 1);
            }
            order.returns = safeReturns.map((row) => ({
                ...row,
                items_count: itemsCountByReturn.get(row.id) || 0
            }));
        } else {
            order.returns = [];
        }

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
            const createdAt = order.created_at ? new Date(order.created_at) : null;
            let deadline = new Date(order.cancellable_until);

            // Legacy safety: some bad rows were written with invalid/immediate cancellable_until.
            if (
                createdAt &&
                !Number.isNaN(createdAt.getTime()) &&
                !Number.isNaN(deadline.getTime()) &&
                deadline <= createdAt
            ) {
                deadline = addMinutes(createdAt, CANCELLATION_WINDOW_MINUTES);
            }

            if (Number.isNaN(deadline.getTime()) || new Date() > deadline) {
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





