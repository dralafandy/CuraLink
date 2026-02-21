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
    db.supabase
        .from('notification_preferences')
        .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
        .then(({ error }) => done(error || null))
        .catch((err) => done(err));
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

router.get('/settings', verifyToken, async (req, res) => {
    ensurePreferencesRow(req.user.id, async (insertErr) => {
        if (insertErr) {
            return res.status(500).json({ error: 'خطأ في إعداد التفضيلات' });
        }

        const { data, error } = await db.supabase
            .from('notification_preferences')
            .select('order_updates, low_stock, ratings, returns, system_alerts, marketing, email_enabled, sms_enabled, push_enabled, updated_at')
            .eq('user_id', req.user.id)
            .limit(1)
            .maybeSingle();

        if (error) {
            return res.status(500).json({ error: 'خطأ في جلب تفضيلات الإشعارات' });
        }

        return res.json({
            settings: data || {
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
    });
});

router.put('/settings', verifyToken, async (req, res) => {
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

    ensurePreferencesRow(req.user.id, async (insertErr) => {
        if (insertErr) {
            return res.status(500).json({ error: 'خطأ في تحديث التفضيلات' });
        }

        const { error } = await db.supabase
            .from('notification_preferences')
            .update({
                ...settings,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', req.user.id);

        if (error) {
            return res.status(500).json({ error: 'خطأ في تحديث تفضيلات الإشعارات' });
        }

        return res.json({ message: 'تم تحديث التفضيلات بنجاح', settings });
    });
});

router.get('/', verifyToken, async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;
    const grouped = normalizeBooleanInt(req.query.grouped, 0) === 1;

    try {
        let countQuery = db.supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);

        let listQuery = db.supabase
            .from('notifications')
            .select('id, user_id, type, message, related_id, read, created_at, metadata_json, read_at')
            .eq('user_id', req.user.id);

        if (req.query.read === '0' || req.query.read === '1') {
            const readValue = parseInt(req.query.read, 10);
            countQuery = countQuery.eq('read', readValue);
            listQuery = listQuery.eq('read', readValue);
        }

        if (typeof req.query.type === 'string' && req.query.type.trim()) {
            const typeValue = req.query.type.trim();
            countQuery = countQuery.eq('type', typeValue);
            listQuery = listQuery.eq('type', typeValue);
        }

        const { count, error: countError } = await countQuery;
        if (countError) {
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }

        const { data: rows, error: listError } = await listQuery
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (listError) {
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }

        let notifications = (rows || []).map((row) => ({
            ...row,
            grouped_count: 1
        }));

        if (grouped) {
            const groupedMap = new Map();
            for (const n of notifications) {
                const key = `${n.type}::${n.message}::${n.related_id ?? 'null'}::${n.read}`;
                if (!groupedMap.has(key)) {
                    groupedMap.set(key, { ...n, grouped_count: 1 });
                } else {
                    groupedMap.get(key).grouped_count += 1;
                }
            }
            notifications = [...groupedMap.values()];
        }

        const normalizedNotifications = notifications.map(normalizeNotificationRow);
        const total = count || 0;
        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

        return res.json({
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
    } catch {
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

router.get('/unread-count', verifyToken, (req, res) => {
    db.supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .eq('read', 0)
        .then(({ count, error }) => {
            if (error) {
                console.error('GET /notifications/unread-count error:', error);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            return res.json({ count: count || 0 });
        })
        .catch((err) => {
            console.error('GET /notifications/unread-count unhandled error:', err);
            return res.status(500).json({ error: 'خطأ في الخادم' });
        });
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

    let query = db.supabase
        .from('notifications')
        .update({ read: 1, read_at: new Date().toISOString() })
        .eq('user_id', req.user.id)
        .eq('type', type)
        .eq('message', message)
        .select('id');

    query = relatedId === null ? query.is('related_id', null) : query.eq('related_id', relatedId);

    query
        .then(({ data, error }) => {
            if (error) {
                return res.status(500).json({ error: 'خطأ في تحديث مجموعة الإشعارات' });
            }
            res.json({ message: 'تم تحديث مجموعة الإشعارات بنجاح', updated_count: (data || []).length });
        })
        .catch(() => res.status(500).json({ error: 'خطأ في تحديث مجموعة الإشعارات' }));
});

router.put('/:id/read', verifyToken, (req, res) => {
    db.supabase
        .from('notifications')
        .update({ read: 1, read_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id')
        .then(({ data, error }) => {
            if (error) {
                return res.status(500).json({ error: 'خطأ في تحديث الإشعار' });
            }
            if (!data || data.length === 0) {
                return res.status(404).json({ error: 'الإشعار غير موجود' });
            }
            return res.json({ message: 'تم تحديث الإشعار بنجاح' });
        })
        .catch(() => res.status(500).json({ error: 'خطأ في تحديث الإشعار' }));
});

router.put('/read-all', verifyToken, (req, res) => {
    db.supabase
        .from('notifications')
        .update({ read: 1, read_at: new Date().toISOString() })
        .eq('user_id', req.user.id)
        .then(({ error }) => {
            if (error) {
                return res.status(500).json({ error: 'خطأ في تحديث الإشعارات' });
            }
            return res.json({ message: 'تم تحديث جميع الإشعارات بنجاح' });
        })
        .catch(() => res.status(500).json({ error: 'خطأ في تحديث الإشعارات' }));
});

router.delete('/read', verifyToken, (req, res) => {
    db.supabase
        .from('notifications')
        .delete()
        .eq('user_id', req.user.id)
        .eq('read', 1)
        .select('id')
        .then(({ data, error }) => {
            if (error) {
                return res.status(500).json({ error: 'خطأ في حذف الإشعارات المقروءة' });
            }
            return res.json({
                message: 'تم حذف الإشعارات المقروءة بنجاح',
                deleted_count: (data || []).length
            });
        })
        .catch(() => res.status(500).json({ error: 'خطأ في حذف الإشعارات المقروءة' }));
});

router.delete('/:id', verifyToken, (req, res) => {
    db.supabase
        .from('notifications')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id')
        .then(({ data, error }) => {
            if (error) {
                return res.status(500).json({ error: 'خطأ في حذف الإشعار' });
            }
            if (!data || data.length === 0) {
                return res.status(404).json({ error: 'الإشعار غير موجود' });
            }
            return res.json({ message: 'تم حذف الإشعار بنجاح' });
        })
        .catch(() => res.status(500).json({ error: 'خطأ في حذف الإشعار' }));
});

module.exports = router;
