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

// Register
router.post('/register', async (req, res) => {
    const { username, email, password, phone, address, role } = req.body;

    if (!username || !email || !password || !role) {
        return res.status(400).json({ error: 'جميع الحقول المطلوبة غير مكتملة' });
    }

    if (!['warehouse', 'pharmacy'].includes(role)) {
        return res.status(400).json({ error: 'الدور غير صالح' });
    }

    try {
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Check if user exists
        const existingUser = await db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
        
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني موجود مسبقًا' });
        }

        const result = await db.run(
            'INSERT INTO users (username, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, phone || null, address || null, role]
        );

        const token = jwt.sign({ id: result.lastID, role }, JWT_SECRET, { expiresIn: '24h' });

        return res.json({
            message: 'تم التسجيل بنجاح',
            token,
            user: {
                id: result.lastID,
                username,
                email,
                role,
                phone: phone || null,
                address: address || null
            }
        });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    try {
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        let isPasswordValid = false;
        const storedPassword = typeof user.password === 'string' ? user.password : '';

        // Support legacy plain-text passwords without crashing login,
        // then upgrade them to bcrypt on first successful login.
        if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
            try {
                isPasswordValid = bcrypt.compareSync(password, storedPassword);
            } catch (compareErr) {
                console.error('Login bcrypt compare error:', compareErr.message);
                isPasswordValid = false;
            }
        } else if (storedPassword) {
            isPasswordValid = password === storedPassword;
            if (isPasswordValid) {
                try {
                    const upgradedHash = bcrypt.hashSync(password, 10);
                    await db.run('UPDATE users SET password = ? WHERE id = ?', [upgradedHash, user.id]);
                } catch (upgradeErr) {
                    console.error('Password hash upgrade failed:', upgradeErr.message);
                }
            }
        }

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
    } catch (err) {
        console.error('Login error:', err);

        const message = String(err?.message || '');
        if (message.includes('Supabase configuration missing')) {
            return res.status(500).json({
                error: 'إعدادات قاعدة البيانات غير مكتملة على الخادم',
                code: 'DB_CONFIG_MISSING'
            });
        }

        // Common Postgres/Supabase permission errors
        if (err?.code === '42501') {
            return res.status(500).json({
                error: 'الخادم غير مصرح له بالوصول إلى بيانات المستخدمين',
                code: 'DB_PERMISSION_DENIED'
            });
        }

        return res.status(500).json({ error: 'خطأ في الخادم', code: 'LOGIN_FAILED' });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    const decoded = getUserFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'غير مصرح' });
    }

    try {
        const user = await db.get(
            'SELECT id, username, email, phone, address, role, rating, rating_count, created_at FROM users WHERE id = ?',
            [decoded.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        return res.json({ user });
    } catch (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Update current user profile
router.put('/me', async (req, res) => {
    const decoded = getUserFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'غير مصرح' });
    }

    const hasPhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone');
    const hasAddress = Object.prototype.hasOwnProperty.call(req.body || {}, 'address');
    
    if (!hasPhone && !hasAddress) {
        return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
    }

    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        const normalizedPhone = hasPhone ? String(req.body.phone || '').trim() : user.phone;
        const normalizedAddress = hasAddress ? String(req.body.address || '').trim() : user.address;

        await db.run(
            'UPDATE users SET phone = ?, address = ? WHERE id = ?',
            [normalizedPhone || null, normalizedAddress || null, decoded.id]
        );

        const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
        
        return res.json({ message: 'تم تحديث الملف الشخصي بنجاح', user: updatedUser });
    } catch (err) {
        console.error('Update profile error:', err);
        return res.status(500).json({ error: 'خطأ في تحديث البيانات' });
    }
});

// Get all warehouses (for pharmacy)
router.get('/warehouses', async (req, res) => {
    try {
        const users = await db.all('SELECT id, username, phone, address, rating, rating_count FROM users WHERE role = ?', ['warehouse']);
        return res.json({ warehouses: users });
    } catch (err) {
        console.error('Get warehouses error:', err);
        return res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

module.exports = router;
