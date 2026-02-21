const webpush = require('web-push');
const db = require('../database/db');

const PUBLIC_KEY = process.env.PUSH_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.PUSH_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || '';
const CONTACT_EMAIL = process.env.PUSH_CONTACT_EMAIL || 'mailto:support@curalink.com';

const PUSH_ENABLED = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (PUSH_ENABLED) {
    webpush.setVapidDetails(CONTACT_EMAIL, PUBLIC_KEY, PRIVATE_KEY);
} else {
    console.warn('[push] Web Push is disabled. Set PUSH_PUBLIC_KEY and PUSH_PRIVATE_KEY to enable it.');
}

function getPushConfig() {
    return {
        enabled: PUSH_ENABLED,
        publicKey: PUSH_ENABLED ? PUBLIC_KEY : null
    };
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

async function saveSubscription(userId, subscription) {
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        throw new Error('Invalid subscription payload');
    }

    if (!PUSH_ENABLED) {
        return { saved: false, reason: 'push_disabled' };
    }

    await dbRun(
        `
            INSERT INTO push_subscriptions (
                user_id, endpoint, p256dh, auth, created_at, updated_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(endpoint) DO UPDATE SET
                user_id = excluded.user_id,
                p256dh = excluded.p256dh,
                auth = excluded.auth,
                updated_at = CURRENT_TIMESTAMP
        `,
        [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );

    return { saved: true };
}

async function removeSubscription(userId, endpoint) {
    if (!endpoint) return { removed: false };

    await dbRun(
        'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
        [userId, endpoint]
    );

    return { removed: true };
}

async function sendPushToUser(userId, payload) {
    if (!PUSH_ENABLED) {
        return { sent: 0, skipped: true, reason: 'push_disabled' };
    }

    const rows = await dbAll(
        `
            SELECT ps.endpoint, ps.p256dh, ps.auth
            FROM push_subscriptions ps
            LEFT JOIN notification_preferences np ON np.user_id = ps.user_id
            WHERE ps.user_id = ?
            AND COALESCE(np.push_enabled, 1) = 1
        `,
        [userId]
    );

    if (!rows.length) {
        return { sent: 0, skipped: true, reason: 'no_subscriptions' };
    }

    let sent = 0;
    for (const row of rows) {
        const subscription = {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth }
        };

        try {
            await webpush.sendNotification(subscription, JSON.stringify(payload));
            sent += 1;
        } catch (error) {
            const statusCode = Number(error?.statusCode || 0);
            if (statusCode === 404 || statusCode === 410) {
                await dbRun('DELETE FROM push_subscriptions WHERE endpoint = ?', [row.endpoint]);
            }
        }
    }

    return { sent, skipped: false };
}

module.exports = {
    getPushConfig,
    saveSubscription,
    removeSubscription,
    sendPushToUser
};
