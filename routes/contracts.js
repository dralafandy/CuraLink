const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ============================================
// Contracts Routes
// ============================================

// Get all contracts for current user
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let contracts;
        if (userRole === 'pharmacy') {
            contracts = await db.all(
                `SELECT c.*, 
                        w.username as warehouse_name, w.phone as warehouse_phone, w.address as warehouse_address,
                        (SELECT COUNT(*) FROM contract_products WHERE contract_id = c.id) as products_count
                 FROM contracts c
                 JOIN users w ON c.warehouse_id = w.id
                 WHERE c.pharmacy_id = ?
                 ORDER BY c.created_at DESC`,
                [userId]
            );
        } else if (userRole === 'warehouse') {
            contracts = await db.all(
                `SELECT c.*, 
                        p.username as pharmacy_name, p.phone as pharmacy_phone, p.address as pharmacy_address,
                        (SELECT COUNT(*) FROM contract_products WHERE contract_id = c.id) as products_count
                 FROM contracts c
                 JOIN users p ON c.pharmacy_id = p.id
                 WHERE c.warehouse_id = ?
                 ORDER BY c.created_at DESC`,
                [userId]
            );
        } else {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        res.json({ contracts });
    } catch (err) {
        console.error('Get contracts error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get single contract details
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const contractId = req.params.id;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let contract;
        if (userRole === 'pharmacy') {
            contract = await db.get(
                `SELECT c.*, w.username as warehouse_name, w.phone as warehouse_phone, w.address as warehouse_address
                 FROM contracts c
                 JOIN users w ON c.warehouse_id = w.id
                 WHERE c.id = ? AND c.pharmacy_id = ?`,
                [contractId, userId]
            );
        } else if (userRole === 'warehouse') {
            contract = await db.get(
                `SELECT c.*, p.username as pharmacy_name, p.phone as pharmacy_phone, p.address as pharmacy_address
                 FROM contracts c
                 JOIN users p ON c.pharmacy_id = p.id
                 WHERE c.id = ? AND c.warehouse_id = ?`,
                [contractId, userId]
            );
        }

        if (!contract) {
            return res.status(404).json({ error: 'العقد غير موجود' });
        }

        // Get contract products
        const products = await db.all(
            `SELECT cp.*, p.name as product_name, p.image as product_image
             FROM contract_products cp
             LEFT JOIN products p ON cp.product_id = p.id
             WHERE cp.contract_id = ?`,
            [contractId]
        );

        // Get contract history
        const history = await db.all(
            `SELECT ch.*, u.username as performed_by_name
             FROM contract_history ch
             LEFT JOIN users u ON ch.performed_by = u.id
             WHERE ch.contract_id = ?
             ORDER BY ch.created_at DESC`,
            [contractId]
        );

        res.json({ contract, products, history });
    } catch (err) {
        console.error('Get contract error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Create new contract (warehouse initiates)
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (userRole !== 'warehouse') {
            return res.status(403).json({ error: 'فقط المخازن يمكنها إنشاء عقود' });
        }

        const { 
            pharmacy_id, title, description, start_date, end_date,
            discount_percent, credit_limit, payment_terms, auto_renew, terms, products 
        } = req.body;

        if (!pharmacy_id || !title || !start_date || !end_date) {
            return res.status(400).json({ error: 'البيانات المطلوبة غير مكتملة' });
        }

        // Generate contract number
        const contractNumber = `CNT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const result = await db.run(
            `INSERT INTO contracts 
             (pharmacy_id, warehouse_id, contract_number, title, description, start_date, end_date,
              discount_percent, credit_limit, payment_terms, auto_renew, terms, signed_by_warehouse)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pharmacy_id, userId, contractNumber, title, description, start_date, end_date,
             discount_percent || 0, credit_limit || 0, payment_terms || 30, auto_renew ? 1 : 0, terms || null, 1]
        );

        const contractId = result.lastID;

        // Add contract products
        if (products && products.length > 0) {
            for (const product of products) {
                await db.run(
                    `INSERT INTO contract_products (contract_id, product_id, product_name, agreed_price, min_quantity, max_quantity)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [contractId, product.product_id || null, product.product_name, product.agreed_price,
                     product.min_quantity || 1, product.max_quantity || null]
                );
            }
        }

        // Add to history
        await db.run(
            `INSERT INTO contract_history (contract_id, action, performed_by, details)
             VALUES (?, 'created', ?, 'تم إنشاء العقد')`,
            [contractId, userId]
        );

        res.json({ 
            message: 'تم إنشاء العقد بنجاح',
            contract_id: contractId,
            contract_number: contractNumber
        });
    } catch (err) {
        console.error('Create contract error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Sign contract (pharmacy)
router.post('/:id/sign', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const contractId = req.params.id;

        if (userRole !== 'pharmacy') {
            return res.status(403).json({ error: 'فقط الصيدليات يمكنها توقيع العقود' });
        }

        const contract = await db.get(
            'SELECT * FROM contracts WHERE id = ? AND pharmacy_id = ?',
            [contractId, userId]
        );

        if (!contract) {
            return res.status(404).json({ error: 'العقد غير موجود' });
        }

        if (contract.signed_by_pharmacy) {
            return res.status(400).json({ error: 'العقد موقع بالفعل' });
        }

        await db.run(
            `UPDATE contracts SET signed_by_pharmacy = 1, signed_at_pharmacy = CURRENT_TIMESTAMP, status = 'active'
             WHERE id = ?`,
            [contractId]
        );

        // Add to history
        await db.run(
            `INSERT INTO contract_history (contract_id, action, performed_by, details)
             VALUES (?, 'signed_by_pharmacy', ?, 'تم توقيع العقد من الصيدلية')`,
            [contractId, userId]
        );

        res.json({ message: 'تم توقيع العقد بنجاح' });
    } catch (err) {
        console.error('Sign contract error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Update contract
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const contractId = req.params.id;

        if (userRole !== 'warehouse') {
            return res.status(403).json({ error: 'فقط المخازن يمكنها تعديل العقود' });
        }

        const contract = await db.get(
            'SELECT * FROM contracts WHERE id = ? AND warehouse_id = ?',
            [contractId, userId]
        );

        if (!contract) {
            return res.status(404).json({ error: 'العقد غير موجود' });
        }

        const { title, description, end_date, discount_percent, credit_limit, payment_terms, status } = req.body;

        await db.run(
            `UPDATE contracts SET 
             title = COALESCE(?, title),
             description = COALESCE(?, description),
             end_date = COALESCE(?, end_date),
             discount_percent = COALESCE(?, discount_percent),
             credit_limit = COALESCE(?, credit_limit),
             payment_terms = COALESCE(?, payment_terms),
             status = COALESCE(?, status)
             WHERE id = ?`,
            [title, description, end_date, discount_percent, credit_limit, payment_terms, status, contractId]
        );

        // Add to history
        await db.run(
            `INSERT INTO contract_history (contract_id, action, performed_by, details)
             VALUES (?, 'updated', ?, 'تم تحديث العقد')`,
            [contractId, userId]
        );

        res.json({ message: 'تم تحديث العقد بنجاح' });
    } catch (err) {
        console.error('Update contract error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Terminate contract
router.post('/:id/terminate', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const contractId = req.params.id;
        const { reason } = req.body;

        const contract = await db.get(
            'SELECT * FROM contracts WHERE id = ? AND (pharmacy_id = ? OR warehouse_id = ?)',
            [contractId, userId, userId]
        );

        if (!contract) {
            return res.status(404).json({ error: 'العقد غير موجود' });
        }

        await db.run(
            "UPDATE contracts SET status = 'terminated' WHERE id = ?",
            [contractId]
        );

        // Add to history
        await db.run(
            `INSERT INTO contract_history (contract_id, action, performed_by, details)
             VALUES (?, 'terminated', ?, ?)`,
            [contractId, userId, reason || 'تم إنهاء العقد']
        );

        res.json({ message: 'تم إنهاء العقد بنجاح' });
    } catch (err) {
        console.error('Terminate contract error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get contract statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        let stats;
        if (userRole === 'pharmacy') {
            stats = await db.get(
                `SELECT 
                    COUNT(*) as total_contracts,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_contracts,
                    SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_contracts,
                    SUM(CASE WHEN signed_by_pharmacy = 0 THEN 1 ELSE 0 END) as pending_signatures,
                    AVG(discount_percent) as avg_discount
                 FROM contracts WHERE pharmacy_id = ?`,
                [userId]
            );
        } else if (userRole === 'warehouse') {
            stats = await db.get(
                `SELECT 
                    COUNT(*) as total_contracts,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_contracts,
                    SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_contracts,
                    SUM(CASE WHEN signed_by_pharmacy = 0 THEN 1 ELSE 0 END) as pending_signatures,
                    AVG(discount_percent) as avg_discount
                 FROM contracts WHERE warehouse_id = ?`,
                [userId]
            );
        }

        res.json({ stats });
    } catch (err) {
        console.error('Get contract stats error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

module.exports = router;