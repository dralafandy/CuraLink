const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ============================================
// Loyalty Routes
// ============================================

// Get user's loyalty points and stats
router.get('/points', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let points = await db.get(
            'SELECT * FROM loyalty_points WHERE user_id = ?',
            [userId]
        );

        if (!points) {
            // Initialize if not exists
            await db.run(
                'INSERT INTO loyalty_points (user_id, points, tier) VALUES (?, 0, ?)',
                [userId, 'bronze']
            );
            points = { user_id: userId, points: 0, points_used: 0, tier: 'bronze' };
        }

        // Get recent transactions
        const transactions = await db.all(
            `SELECT * FROM loyalty_transactions 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [userId]
        );

        // Calculate points expiring soon
        const expiringPoints = await db.get(
            `SELECT SUM(points) as total FROM loyalty_transactions 
             WHERE user_id = ? AND transaction_type = 'earned' 
             AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
             AND points > 0`,
            [userId]
        );

        // Get tier progress
        const tierThresholds = {
            bronze: 0,
            silver: 500,
            gold: 1500,
            platinum: 5000
        };

        const currentPoints = points.points;
        const currentTier = points.tier;
        const nextTier = currentTier === 'bronze' ? 'silver' : 
                        currentTier === 'silver' ? 'gold' : 
                        currentTier === 'gold' ? 'platinum' : null;
        
        const nextTierPoints = nextTier ? tierThresholds[nextTier] : null;
        const progress = nextTier ? Math.min(100, (currentPoints / nextTierPoints) * 100) : 100;

        res.json({
            points,
            transactions,
            expiring_soon: expiringPoints?.total || 0,
            tier_progress: {
                current: currentTier,
                next: nextTier,
                current_points: currentPoints,
                next_threshold: nextTierPoints,
                progress_percent: progress
            }
        });
    } catch (err) {
        console.error('Get loyalty points error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get available rewards
router.get('/rewards', async (req, res) => {
    try {
        const rewards = await db.all(
            `SELECT * FROM loyalty_rewards 
             WHERE active = 1 
             ORDER BY points_required ASC`
        );

        res.json({ rewards });
    } catch (err) {
        console.error('Get rewards error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Redeem reward
router.post('/redeem', async (req, res) => {
    try {
        const userId = req.user?.id;
        const { reward_id } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        if (!reward_id) {
            return res.status(400).json({ error: 'الجائزة مطلوبة' });
        }

        // Get reward details
        const reward = await db.get(
            'SELECT * FROM loyalty_rewards WHERE id = ? AND active = 1',
            [reward_id]
        );

        if (!reward) {
            return res.status(404).json({ error: 'الجائزة غير موجودة' });
        }

        // Check stock
        if (reward.stock !== null && reward.stock <= 0) {
            return res.status(400).json({ error: 'الجائزة غير متوفرة حالياً' });
        }

        // Get user points
        const userPoints = await db.get(
            'SELECT * FROM loyalty_points WHERE user_id = ?',
            [userId]
        );

        if (!userPoints || userPoints.points < reward.points_required) {
            return res.status(400).json({ error: 'نقاط غير كافية' });
        }

        // Start transaction
        // Deduct points
        await db.run(
            'UPDATE loyalty_points SET points = points - ?, points_used = points_used + ? WHERE user_id = ?',
            [reward.points_required, reward.points_required, userId]
        );

        // Add transaction record
        await db.run(
            `INSERT INTO loyalty_transactions (user_id, points, transaction_type, reference_type, reference_id, description)
             VALUES (?, ?, 'redeemed', 'reward', ?, ?)`,
            [userId, -reward.points_required, reward_id, `استبدال: ${reward.name}`]
        );

        // Create redemption record
        const result = await db.run(
            `INSERT INTO loyalty_redemptions (user_id, reward_id, points_used, status)
             VALUES (?, ?, ?, 'pending')`,
            [userId, reward_id, reward.points_required]
        );

        // Decrease stock if applicable
        if (reward.stock !== null) {
            await db.run(
                'UPDATE loyalty_rewards SET stock = stock - 1 WHERE id = ?',
                [reward_id]
            );
        }

        res.json({
            message: 'تم استبدال الجائزة بنجاح',
            redemption_id: result.lastID,
            reward: reward
        });
    } catch (err) {
        console.error('Redeem reward error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get user's redemptions
router.get('/redemptions', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const redemptions = await db.all(
            `SELECT lr.*, r.name as reward_name, r.description as reward_description, 
                    r.reward_type, r.reward_value
             FROM loyalty_redemptions lr
             JOIN loyalty_rewards r ON lr.reward_id = r.id
             WHERE lr.user_id = ?
             ORDER BY lr.created_at DESC`,
            [userId]
        );

        res.json({ redemptions });
    } catch (err) {
        console.error('Get redemptions error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Admin: Add points to user (for orders, promotions, etc.)
router.post('/add-points', async (req, res) => {
    try {
        const { user_id, points, reason, expires_in_days } = req.body;

        if (!user_id || !points || points <= 0) {
            return res.status(400).json({ error: 'بيانات غير صحيحة' });
        }

        // Calculate expiry date
        let expiresAt = null;
        if (expires_in_days) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + parseInt(expires_in_days));
            expiresAt = expiryDate.toISOString();
        }

        // Add points
        await db.run(
            `INSERT INTO loyalty_transactions (user_id, points, transaction_type, description, expires_at)
             VALUES (?, ?, 'earned', ?, ?)`,
            [user_id, points, reason || 'إضافة نقاط', expiresAt]
        );

        // Update total points
        await db.run(
            `INSERT INTO loyalty_points (user_id, points, tier) 
             VALUES (?, ?, 'bronze')
             ON CONFLICT (user_id) 
             DO UPDATE SET points = loyalty_points.points + ?`,
            [user_id, points, points]
        );

        // Check and update tier
        const userPoints = await db.get(
            'SELECT points FROM loyalty_points WHERE user_id = ?',
            [user_id]
        );

        let newTier = 'bronze';
        if (userPoints.points >= 5000) newTier = 'platinum';
        else if (userPoints.points >= 1500) newTier = 'gold';
        else if (userPoints.points >= 500) newTier = 'silver';

        if (newTier !== 'bronze') {
            await db.run(
                `UPDATE loyalty_points SET tier = ?, tier_updated_at = CURRENT_TIMESTAMP 
                 WHERE user_id = ? AND tier != ?`,
                [newTier, user_id, newTier]
            );
        }

        res.json({ 
            message: 'تم إضافة النقاط بنجاح',
            points_added: points,
            new_tier: newTier
        });
    } catch (err) {
        console.error('Add points error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get loyalty statistics (admin)
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.get(
            `SELECT 
                COUNT(*) as total_members,
                SUM(points) as total_points_issued,
                SUM(points_used) as total_points_redeemed,
                COUNT(CASE WHEN tier = 'bronze' THEN 1 END) as bronze_members,
                COUNT(CASE WHEN tier = 'silver' THEN 1 END) as silver_members,
                COUNT(CASE WHEN tier = 'gold' THEN 1 END) as gold_members,
                COUNT(CASE WHEN tier = 'platinum' THEN 1 END) as platinum_members
             FROM loyalty_points`
        );

        const recentTransactions = await db.all(
            `SELECT lt.*, u.username 
             FROM loyalty_transactions lt
             JOIN users u ON lt.user_id = u.id
             ORDER BY lt.created_at DESC
             LIMIT 10`
        );

        res.json({ stats, recent_transactions: recentTransactions });
    } catch (err) {
        console.error('Get loyalty stats error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

module.exports = router;