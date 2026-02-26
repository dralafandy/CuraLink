const express = require('express');
const router = express.Router();
const chatService = require('../services/chat-service');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Get user's conversations
router.get('/conversations', authenticateToken, asyncHandler(async (req, res) => {
    const conversations = await chatService.getConversations(req.user.id);
    res.json({ conversations });
}));

// Get conversation with specific user
router.get('/conversation/:userId', authenticateToken, asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { order_id, page, limit } = req.query;
    
    const messages = await chatService.getConversation(
        req.user.id, 
        parseInt(userId), 
        order_id ? parseInt(order_id) : null,
        { page: parseInt(page) || 1, limit: parseInt(limit) || 50 }
    );
    
    res.json({ messages });
}));

// Send message
router.post('/send', authenticateToken, asyncHandler(async (req, res) => {
    const { receiver_id, order_id, content, attachments } = req.body;
    
    if (!receiver_id || !content) {
        return res.status(400).json({
            error: 'المستلم والمحتوى مطلوبان',
            code: 'MISSING_FIELDS'
        });
    }
    
    const message = await chatService.sendMessage({
        senderId: req.user.id,
        receiverId: receiver_id,
        orderId: order_id,
        content,
        attachments: attachments || []
    });
    
    res.json({ message, success: true });
}));

// Get unread count
router.get('/unread-count', authenticateToken, asyncHandler(async (req, res) => {
    const count = await chatService.getUnreadCount(req.user.id);
    res.json({ count });
}));

// Mark messages as read
router.post('/mark-read/:userId', authenticateToken, asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    await db.run(`
        UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE receiver_id = ? AND sender_id = ? AND is_read = 0
    `, [req.user.id, userId]);
    
    res.json({ success: true });
}));

// Delete message
router.delete('/:messageId', authenticateToken, asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    await chatService.deleteMessage(parseInt(messageId), req.user.id);
    res.json({ success: true });
}));

module.exports = router;