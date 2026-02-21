const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const {
    getPushConfig,
    saveSubscription,
    removeSubscription,
    sendPushToUser
} = require('../services/push');

const JWT_SECRET = 'curalink_secret_key_2024';

function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'غير مصرح' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'رمز غير صالح' });
    }
}

function normalizeBooleanInt(value, fallback = 1) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 'true' || value === '1' || value === 1) return 1;
    if (value === false || value === 'false' || value === '0' || value === 0) return 0;
    return fallback;
}

function parsePositiveInt(value, fallback, max) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    if (max && parsed > max) return max;
    return parsed;
}

function parseMetadataJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function buildRelatedSummary(notification, metadata = null) {
    const productTypes = new Set(['low_stock', 'wishlist_price_change', 'wishlist_offer_added']);
    const orderTypes = new Set(['new_order', 'order_update', 'sms_queued']);

    if (productTypes.has(notification.type) && notification.product_name) {
        return {
            entity: 'product',
            name: notification.product_name,
            quantity: notification.product_quantity,
            price: notification.product_price
        };
    }

    if (orderTypes.has(notification.type) && (notification.order_status || metadata?.order_status || metadata?.total_amount !== undefined)) {
        return {
            entity: 'order',
            status: notification.order_status || metadata?.order_status || null,
            total_amount: notification.order_total_amount ?? metadata?.total_amount ?? null,
            expected_delivery_date: notification.order_expected_delivery_date || metadata?.expected_delivery_date || null,
            items_count: metadata?.items_count ?? null,
            total_quantity: metadata?.total_quantity ?? null
        };
    }

    if (notification.type === 'return_request' && notification.return_status) {
        return {
            entity: 'return',
            status: notification.return_status,
            reason: notification.return_reason
        };
    }

    if (notification.type === 'email_queued' && notification.invoice_status) {
        return {
            entity: 'invoice',
            status: notification.invoice_status,
            amount: notification.invoice_amount
        };
    }

    if (notification.type === 'new_rating' && notification.rating_value !== null && notification.rating_value !== undefined) {
        return {
            entity: 'rating',
            value: notification.rating_value,
            comment: notification.rating_comment || null
        };
    }

    return null;
}

function normalizeNotificationRow(row) {
    const metadata = parseMetadataJson(row.metadata_json);
    const relatedSummary = buildRelatedSummary(row, metadata);
    const {
        metadata_json,
        product_name,
        product_quantity,
        product_price,
        order_status,
        order_total_amount,
        order_expected_delivery_date,
        return_status,
        return_reason,
        invoice_status,
        invoice_amount,
        rating_value,
        rating_comment,
        ...base
    } = row;

    return {
        ...base,
        metadata,
        related_summary: relatedSummary
    };
}

function ensurePreferencesRow(userId, done) {
    db.run(
        'INSERT OR IGNORE INTO notification_preferences (user_id, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId],
        (err) => done(err)
    );
}

router.get('/push/config', verifyToken, (req, res) => {
    res.json(getPushConfig());
});

router.post('/push/subscribe', verifyToken, async (req, res) => {
    const subscription = req.body?.subscription;
    try {
        const result = await saveSubscription(req.user.id, subscription);
        if (!result.saved && result.reason === 'push_disabled') {
            return res.status(503).json({ error: 'خدمة الإشعارات الفورية غير مفعلة حالياً' });
        }
        return res.json({ message: 'تم تفعيل إشعارات المتصفح بنجاح' });
    } catch (err) {
        if (err?.message === 'Invalid subscription payload') {
            return res.status(400).json({ error: 'بيانات الاشتراك غير صالحة' });
        }
        return res.status(500).json({ error: 'تعذر حفظ اشتراك الإشعارات' });
    }
});

router.delete('/push/unsubscribe', verifyToken, async (req, res) => {
    const endpoint = req.body?.endpoint;
    try {
        await removeSubscription(req.user.id, endpoint);
        return res.json({ message: 'تم إلغاء اشتراك الإشعارات' });
    } catch (err) {
        return res.status(500).json({ error: 'تعذر إلغاء اشتراك الإشعارات' });
    }
});

router.post('/push/test', verifyToken, async (req, res) => {
    try {
        const result = await sendPushToUser(req.user.id, {
            title: 'PharmaConnect',
            body: 'هذا إشعار تجريبي للتأكد من تفعيل Web Push بنجاح.',
            type: 'system_alert',
            relatedId: null
        });
        return res.json({ message: 'تم إرسال الإشعار التجريبي', result });
    } catch (err) {
        return res.status(500).json({ error: 'فشل إرسال إشعار تجريبي' });
    }
});

router.get('/settings', verifyToken, (req, res) => {
    ensurePreferencesRow(req.user.id, (insertErr) => {
        if (insertErr) {
            return res.status(500).json({ error: 'خطأ في إعداد التفضيلات' });
        }

        db.get(
            `
            SELECT
                order_updates,
                low_stock,
                ratings,
                returns,
                system_alerts,
                marketing,
                email_enabled,
                sms_enabled,
                push_enabled,
                updated_at
            FROM notification_preferences
            WHERE user_id = ?
        `,
            [req.user.id],
            (err, row) => {
                if (err) {
                    return res.status(500).json({ error: 'خطأ في جلب تفضيلات الإشعارات' });
                }
                res.json({
                    settings: row || {
                        order_updates: 1,
                        low_stock: 1,
                        ratings: 1,
                        returns: 1,
                        system_alerts: 1,
                        marketing: 1,
                        email_enabled: 1,
                        sms_enabled: 1,
                        push_enabled: 1
                    }
                });
            }
        );
    });
});

router.put('/settings', verifyToken, (req, res) => {
    const payload = req.body || {};
    const settings = {
        order_updates: normalizeBooleanInt(payload.order_updates),
        low_stock: normalizeBooleanInt(payload.low_stock),
        ratings: normalizeBooleanInt(payload.ratings),
        returns: normalizeBooleanInt(payload.returns),
        system_alerts: normalizeBooleanInt(payload.system_alerts),
        marketing: normalizeBooleanInt(payload.marketing),
        email_enabled: normalizeBooleanInt(payload.email_enabled),
        sms_enabled: normalizeBooleanInt(payload.sms_enabled),
        push_enabled: normalizeBooleanInt(payload.push_enabled)
    };

    ensurePreferencesRow(req.user.id, (insertErr) => {
        if (insertErr) {
            return res.status(500).json({ error: 'خطأ في تحديث التفضيلات' });
        }

        db.run(
            `
            UPDATE notification_preferences
            SET
                order_updates = ?,
                low_stock = ?,
                ratings = ?,
                returns = ?,
                system_alerts = ?,
                marketing = ?,
                email_enabled = ?,
                sms_enabled = ?,
                push_enabled = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `,
            [
                settings.order_updates,
                settings.low_stock,
                settings.ratings,
                settings.returns,
                settings.system_alerts,
                settings.marketing,
                settings.email_enabled,
                settings.sms_enabled,
                settings.push_enabled,
                req.user.id
            ],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'خطأ في تحديث تفضيلات الإشعارات' });
                }

                res.json({ message: 'تم تحديث التفضيلات بنجاح', settings });
            }
        );
    });
});

router.get('/', verifyToken, (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;
    const grouped = normalizeBooleanInt(req.query.grouped, 0) === 1;

    const whereParts = ['user_id = ?'];
    const params = [req.user.id];

    if (req.query.read === '0' || req.query.read === '1') {
        whereParts.push('read = ?');
        params.push(parseInt(req.query.read, 10));
    }

    if (typeof req.query.type === 'string' && req.query.type.trim()) {
        whereParts.push('type = ?');
        params.push(req.query.type.trim());
    }

    const whereSql = whereParts.join(' AND ');
    const extraSelectSql = `
        n.metadata_json,
        n.read_at,
        p.name AS product_name,
        p.quantity AS product_quantity,
        p.price AS product_price,
        o.status AS order_status,
        o.total_amount AS order_total_amount,
        o.expected_delivery_date AS order_expected_delivery_date,
        r.status AS return_status,
        r.reason AS return_reason,
        i.status AS invoice_status,
        i.amount AS invoice_amount,
        rt.rating AS rating_value,
        rt.comment AS rating_comment
    `;
    const joinsSql = `
        LEFT JOIN products p ON p.id = n.related_id AND n.type IN ('low_stock', 'wishlist_price_change', 'wishlist_offer_added')
        LEFT JOIN orders o ON o.id = n.related_id AND n.type IN ('new_order', 'order_update', 'sms_queued')
        LEFT JOIN returns r ON r.id = n.related_id AND n.type = 'return_request'
        LEFT JOIN invoices i ON i.id = n.related_id AND n.type = 'email_queued'
        LEFT JOIN ratings rt ON rt.id = n.related_id AND n.type = 'new_rating'
    `;

    let listSql;
    let countSql;
    let listParams;
    let countParams;

    if (grouped) {
        listSql = `
            SELECT
                g.id,
                g.user_id,
                g.type,
                g.message,
                g.related_id,
                g.read,
                g.created_at,
                g.grouped_count,
                ${extraSelectSql}
            FROM (
                SELECT
                    MAX(id) AS id,
                    user_id,
                    type,
                    message,
                    related_id,
                    read,
                    MAX(created_at) AS created_at,
                    COUNT(*) AS grouped_count
                FROM notifications
                WHERE ${whereSql}
                GROUP BY type, message, COALESCE(related_id, -1), read
            ) g
            JOIN notifications n ON n.id = g.id
            ${joinsSql}
            ORDER BY datetime(g.created_at) DESC
            LIMIT ? OFFSET ?
        `;

        countSql = `
            SELECT COUNT(*) AS total
            FROM (
                SELECT 1
                FROM notifications
                WHERE ${whereSql}
                GROUP BY type, message, COALESCE(related_id, -1), read
            ) grouped
        `;

        listParams = [...params, limit, offset];
        countParams = [...params];
    } else {
        listSql = `
            SELECT
                n.id,
                n.user_id,
                n.type,
                n.message,
                n.related_id,
                n.read,
                n.created_at,
                1 AS grouped_count,
                ${extraSelectSql}
            FROM notifications n
            ${joinsSql}
            WHERE ${whereSql}
            ORDER BY datetime(n.created_at) DESC, n.id DESC
            LIMIT ? OFFSET ?
        `;

        countSql = `SELECT COUNT(*) AS total FROM notifications WHERE ${whereSql}`;
        listParams = [...params, limit, offset];
        countParams = [...params];
    }

    db.get(countSql, countParams, (countErr, countRow) => {
        if (countErr) {
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }

        db.all(listSql, listParams, (listErr, notifications) => {
            if (listErr) {
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }

            const normalizedNotifications = notifications.map(normalizeNotificationRow);
            const total = countRow?.total || 0;
            const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

            res.json({
                notifications: normalizedNotifications,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1
                },
                filters: {
                    read: req.query.read === '0' || req.query.read === '1' ? parseInt(req.query.read, 10) : null,
                    type: typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null,
                    grouped
                }
            });
        });
    });
});

router.get('/unread-count', verifyToken, (req, res) => {
    db.get(
        `
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE user_id = ? AND read = 0
    `,
        [req.user.id],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            res.json({ count: result.count });
        }
    );
});

router.put('/read-group', verifyToken, (req, res) => {
    const type = typeof req.body?.type === 'string' ? req.body.type.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const relatedId =
        req.body?.related_id === null || req.body?.related_id === undefined || req.body?.related_id === ''
            ? null
            : Number(req.body.related_id);

    if (!type || !message) {
        return res.status(400).json({ error: 'النوع والرسالة مطلوبان' });
    }

    const sql = relatedId === null
        ? `
            UPDATE notifications
            SET read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE user_id = ? AND type = ? AND message = ? AND related_id IS NULL
        `
        : `
            UPDATE notifications
            SET read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE user_id = ? AND type = ? AND message = ? AND related_id = ?
        `;
    const params = relatedId === null
        ? [req.user.id, type, message]
        : [req.user.id, type, message, relatedId];

    db.run(sql, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'خطأ في تحديث مجموعة الإشعارات' });
        }
        res.json({ message: 'تم تحديث مجموعة الإشعارات بنجاح', updated_count: this.changes || 0 });
    });
});

router.put('/:id/read', verifyToken, (req, res) => {
    db.run(
        `
        UPDATE notifications
        SET read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND user_id = ?
    `,
        [req.params.id, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'خطأ في تحديث الإشعار' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'الإشعار غير موجود' });
            }
            res.json({ message: 'تم تحديث الإشعار بنجاح' });
        }
    );
});

router.put('/read-all', verifyToken, (req, res) => {
    db.run(
        `
        UPDATE notifications
        SET read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE user_id = ?
    `,
        [req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'خطأ في تحديث الإشعارات' });
            }
            res.json({ message: 'تم تحديث جميع الإشعارات بنجاح' });
        }
    );
});

router.delete('/read', verifyToken, (req, res) => {
    db.run(
        `
        DELETE FROM notifications
        WHERE user_id = ? AND read = 1
    `,
        [req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'خطأ في حذف الإشعارات المقروءة' });
            }
            res.json({
                message: 'تم حذف الإشعارات المقروءة بنجاح',
                deleted_count: this.changes || 0
            });
        }
    );
});

router.delete('/:id', verifyToken, (req, res) => {
    db.run(
        `
        DELETE FROM notifications
        WHERE id = ? AND user_id = ?
    `,
        [req.params.id, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'خطأ في حذف الإشعار' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'الإشعار غير موجود' });
            }
            res.json({ message: 'تم حذف الإشعار بنجاح' });
        }
    );
});

module.exports = router;
