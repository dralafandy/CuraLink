const db = require('../database/db');
const { sendPushToUser } = require('./push');

function createNotification({ userId, type, message, relatedId = null, metadata = null }) {
    return new Promise((resolve, reject) => {
        const metadataJson = metadata ? JSON.stringify(metadata) : null;
        db.run(
            `
                INSERT INTO notifications (user_id, type, message, related_id, metadata_json)
                VALUES (?, ?, ?, ?, ?)
            `,
            [userId, type, message, relatedId, metadataJson],
            async function onInsert(err) {
                if (err) return reject(err);

                // A trigger may ignore the insert based on user preferences.
                if (!this.changes) {
                    return resolve({ inserted: false, id: null, push: { sent: 0, skipped: true, reason: 'filtered' } });
                }

                const notificationId = this.lastID;
                let pushResult = { sent: 0, skipped: true, reason: 'not_attempted' };
                try {
                    pushResult = await sendPushToUser(userId, {
                        title: 'PharmaConnect',
                        body: message,
                        notificationId,
                        type,
                        relatedId
                    });
                } catch (pushError) {
                    // Push failures must not break main flow.
                }

                resolve({ inserted: true, id: notificationId, push: pushResult });
            }
        );
    });
}

module.exports = {
    createNotification
};
