const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = 'curalink_secret_key_2024';

function getUserFromToken(req) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;

    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

function getUserProfileById(userId, callback) {
    db.get(
        'SELECT id, username, email, phone, address, role, rating, rating_count, created_at FROM users WHERE id = ?',
        [userId],
        callback
    );
}

// Register
router.post('/register', (req, res) => {
    const { username, email, password, phone, address, role } = req.body;

    if (!username || !email || !password || !role) {
        return res.status(400).json({ error: 'جميع الحقول المطلوبة غير مكتملة' });
    }

    if (!['warehouse', 'pharmacy'].includes(role)) {
        return res.status(400).json({ error: 'الدور غير صالح' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(
        'INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)',
        [username, email, hashedPassword, phone, address, role],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني موجود مسبقًا' });
                }
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }

            const token = jwt.sign({ id: this.lastID, role }, JWT_SECRET, { expiresIn: '24h' });

            return res.json({
                message: 'تم التسجيل بنجاح',
                token,
                user: {
                    id: this.lastID,
                    username,
                    email,
                    role,
                    phone: phone || null,
                    address: address || null
                }
            });
        }
    );
});

// Login
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }

        if (!user) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        const isPasswordValid = bcrypt.compareSync(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        return res.json({
            message: 'تم الدخول بنجاح',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                phone: user.phone,
                address: user.address,
                rating: user.rating
            }
        });
    });
});

// Get current user
router.get('/me', (req, res) => {
    const decoded = getUserFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'غير مصرح' });
    }

    return getUserProfileById(decoded.id, (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        return res.json({ user });
    });
});

// Update current user profile
router.put('/me', (req, res) => {
    const decoded = getUserFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'غير مصرح' });
    }

    const hasPhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone');
    const hasAddress = Object.prototype.hasOwnProperty.call(req.body || {}, 'address');
    if (!hasPhone && !hasAddress) {
        return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
    }

    return getUserProfileById(decoded.id, (err, user) => {
        if (err) return res.status(500).json({ error: 'خطأ في الخادم' });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        const normalizedPhone = hasPhone ? String(req.body.phone || '').trim() : user.phone;
        const normalizedAddress = hasAddress ? String(req.body.address || '').trim() : user.address;

        return db.run(
            'UPDATE users SET phone = ?, address = ? WHERE id = ?',
            [normalizedPhone || null, normalizedAddress || null, decoded.id],
            function(updateErr) {
                if (updateErr) {
                    return res.status(500).json({ error: 'خطأ في تحديث البيانات' });
                }

                return getUserProfileById(decoded.id, (profileErr, updatedUser) => {
                    if (profileErr) return res.status(500).json({ error: 'خطأ في الخادم' });
                    return res.json({ message: 'تم تحديث الملف الشخصي بنجاح', user: updatedUser });
                });
            }
        );
    });
});

// Get all warehouses (for pharmacy)
router.get('/warehouses', (req, res) => {
    db.all('SELECT id, username, phone, address, rating, rating_count FROM users WHERE role = ?',
        ['warehouse'],
        (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            return res.json({ warehouses: users });
        }
    );
});

module.exports = router;
