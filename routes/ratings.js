const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { createNotification } = require('../services/notification-service');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';

// Middleware to verify token
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'ط؛ظٹط± ظ…طµط±ط­' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'ط±ظ…ط² ط؛ظٹط± طµط§ظ„ط­' });
    }
};

// Get warehouse ratings
router.get('/warehouse/:id', verifyToken, (req, res) => {
    db.all(`
        SELECT r.*, u.username as pharmacy_name
        FROM ratings r
        JOIN users u ON r.pharmacy_id = u.id
        WHERE r.warehouse_id = ?
        ORDER BY r.created_at DESC
    `, [req.params.id], (err, ratings) => {
        if (err) {
            return res.status(500).json({ error: 'ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…' });
        }
        res.json({ ratings });
    });
});

// Add rating (pharmacy only)
router.post('/', verifyToken, (req, res) => {
    if (req.user.role !== 'pharmacy') {
        return res.status(403).json({ error: 'ط؛ظٹط± ظ…طµط±ط­' });
    }

    const { warehouse_id, order_id, rating, comment } = req.body;

    if (!warehouse_id || !order_id || !rating) {
        return res.status(400).json({ error: 'ط§ظ„ظ…ط®ط²ظ† ظˆط§ظ„ط·ظ„ط¨ ظˆط§ظ„طھظ‚ظٹظٹظ… ظ…ط·ظ„ظˆط¨ط©' });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'ط§ظ„طھظ‚ظٹظٹظ… ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط¨ظٹظ† 1 ظˆ 5' });
    }

    // Check if order exists and belongs to this pharmacy
    db.get('SELECT * FROM orders WHERE id = ? AND pharmacy_id = ? AND warehouse_id = ?', 
        [order_id, req.user.id, warehouse_id], 
        (err, order) => {
            if (err) {
                return res.status(500).json({ error: 'ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…' });
            }
            if (!order) {
                return res.status(404).json({ error: 'ط§ظ„ط·ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯' });
            }

            // Check if already rated
            db.get('SELECT id FROM ratings WHERE order_id = ?', 
                [order_id], 
                (err, existing) => {
                    if (err) {
                        return res.status(500).json({ error: 'ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…' });
                    }
                    if (existing) {
                        return res.status(400).json({ error: 'ظ„ظ‚ط¯ ظ‚ظ…طھ ط¨طھظ‚ظٹظٹظ… ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨ ظ…ط³ط¨ظ‚ط§' });
                    }

                    // Insert rating
                    db.run(`
                        INSERT INTO ratings (pharmacy_id, warehouse_id, order_id, rating, comment)
                        VALUES (?, ?, ?, ?, ?)
                    `, [req.user.id, warehouse_id, order_id, rating, comment], function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'ط®ط·ط£ ظپظٹ ط¥ط¶ط§ظپط© ط§ظ„طھظ‚ظٹظٹظ…' });
                        }

                        // Update warehouse rating
                        db.get('SELECT rating, rating_count FROM users WHERE id = ?', 
                            [warehouse_id], 
                            (err, warehouse) => {
                                if (warehouse) {
                                    const newCount = warehouse.rating_count + 1;
                                    const newRating = ((warehouse.rating * warehouse.rating_count) + rating) / newCount;
                                    
                                    db.run('UPDATE users SET rating = ?, rating_count = ? WHERE id = ?', 
                                        [newRating, newCount, warehouse_id]);
                                }
                            });

                        // Create notification for warehouse
                        createNotification({
                            userId: warehouse_id,
                            type: 'new_rating',
                            message: 'لديك تقييم جديد من صيدلية',
                            relatedId: this.lastID
                        }).catch(() => {});

                        res.json({ message: 'طھظ… ط¥ط¶ط§ظپط© ط§ظ„طھظ‚ظٹظٹظ… ط¨ظ†ط¬ط§ط­' });
                    });
                }
            );
        }
    );
});

module.exports = router;



