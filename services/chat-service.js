const db = require('../database/db');
const { createNotification } = require('./notification-service');

class ChatService {
    // Send a message
    async sendMessage({ senderId, receiverId, orderId = null, content, attachments = [] }) {
        // Validate users can communicate (have an order together or are in same network)
        if (orderId) {
            const canCommunicate = await this.canCommunicateViaOrder(senderId, receiverId, orderId);
            if (!canCommunicate) {
                throw new Error('لا يمكن التواصل: لا يوجد طلب مشترك');
            }
        }

        const message = await db.run(
            `INSERT INTO messages (sender_id, receiver_id, order_id, content, attachments, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [senderId, receiverId, orderId, content, JSON.stringify(attachments)]
        );

        // Create notification for receiver
        await createNotification({
            userId: receiverId,
            type: 'new_message',
            message: `رسالة جديدة من مستخدم`,
            relatedId: message.lastID
        });

        return {
            id: message.lastID,
            sender_id: senderId,
            receiver_id: receiverId,
            order_id: orderId,
            content,
            attachments,
            is_read: 0,
            created_at: new Date().toISOString()
        };
    }

    // Check if users can communicate via an order
    async canCommunicateViaOrder(userId1, userId2, orderId) {
        const order = await db.get(
            `SELECT * FROM orders WHERE id = ? AND 
             ((pharmacy_id = ? AND warehouse_id = ?) OR (pharmacy_id = ? AND warehouse_id = ?))`,
            [orderId, userId1, userId2, userId2, userId1]
        );
        return !!order;
    }

    // Get conversation between two users
    async getConversation(userId1, userId2, orderId = null, options = {}) {
        const { page = 1, limit = 50 } = options;
        const offset = (page - 1) * limit;

        let whereClause = '((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))';
        const params = [userId1, userId2, userId2, userId1];

        if (orderId) {
            whereClause += ' AND m.order_id = ?';
            params.push(orderId);
        }

        const messages = await db.all(`
            SELECT m.*, 
                   s.username as sender_name, s.avatar_url as sender_avatar,
                   r.username as receiver_name, r.avatar_url as receiver_avatar
            FROM messages m
            JOIN users s ON m.sender_id = s.id
            JOIN users r ON m.receiver_id = r.id
            WHERE ${whereClause}
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        // Mark messages as read
        await db.run(`
            UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE receiver_id = ? AND sender_id = ? AND is_read = 0
        `, [userId1, userId2]);

        return messages.reverse(); // Return in chronological order
    }

    // Get user's conversations list
    async getConversations(userId) {
        const conversations = await db.all(`
            SELECT 
                u.id as user_id,
                u.username,
                u.avatar_url,
                u.role,
                m.content as last_message,
                m.created_at as last_message_at,
                m.sender_id as last_message_sender,
                (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND sender_id = u.id AND is_read = 0) as unread_count
            FROM users u
            INNER JOIN (
                SELECT 
                    CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_user_id,
                    MAX(id) as last_message_id
                FROM messages
                WHERE sender_id = ? OR receiver_id = ?
                GROUP BY other_user_id
            ) latest ON u.id = latest.other_user_id
            LEFT JOIN messages m ON m.id = latest.last_message_id
            ORDER BY m.created_at DESC
        `, [userId, userId, userId, userId]);

        return conversations;
    }

    // Get unread message count
    async getUnreadCount(userId) {
        const result = await db.get(`
            SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0
        `, [userId]);
        return result?.count || 0;
    }

    // Delete message
    async deleteMessage(messageId, userId) {
        const message = await db.get(`
            SELECT * FROM messages WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
        `, [messageId, userId, userId]);

        if (!message) {
            throw new Error('الرسالة غير موجودة أو غير مصرح لك بحذفها');
        }

        await db.run('DELETE FROM messages WHERE id = ?', [messageId]);
        return { success: true };
    }
}

module.exports = new ChatService();