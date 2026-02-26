const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics-service');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Get dashboard statistics
router.get('/dashboard', authenticateToken, asyncHandler(async (req, res) => {
    const { period = '30d' } = req.query;
    const stats = await analyticsService.getDashboardStats(req.user.id, req.user.role, period);
    res.json(stats);
}));

// Get sales report (admin and warehouse)
router.get('/sales-report', authenticateToken, requireRole('admin', 'warehouse'), asyncHandler(async (req, res) => {
    const { startDate, endDate, warehouseId, pharmacyId, status } = req.query;
    
    // Warehouse can only see their own data
    const filters = {
        startDate,
        endDate,
        status,
        pharmacyId: req.user.role === 'pharmacy' ? req.user.id : pharmacyId
    };
    
    if (req.user.role === 'warehouse') {
        filters.warehouseId = req.user.id;
    } else {
        filters.warehouseId = warehouseId;
    }
    
    const report = await analyticsService.getSalesReport(filters);
    res.json(report);
}));

// Get inventory report (warehouse only)
router.get('/inventory-report', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const report = await analyticsService.getInventoryReport(req.user.id);
    res.json(report);
}));

// Get order statistics
router.get('/order-stats', authenticateToken, asyncHandler(async (req, res) => {
    const { period = '30d' } = req.query;
    const days = parseInt(period) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    let whereClause = 'WHERE created_at >= ?';
    const params = [startDateStr];

    if (req.user.role === 'warehouse') {
        whereClause += ' AND warehouse_id = ?';
        params.push(req.user.id);
    } else if (req.user.role === 'pharmacy') {
        whereClause += ' AND pharmacy_id = ?';
        params.push(req.user.id);
    }

    const stats = await db.get(`
        SELECT 
            COUNT(*) as total_orders,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
            COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
            COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped,
            COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
            COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
            AVG(total_amount) as avg_order_value,
            SUM(total_amount) as total_revenue
        FROM orders
        ${whereClause}
    `, params);

    res.json(stats);
}));

// Get product performance
router.get('/product-performance', authenticateToken, asyncHandler(async (req, res) => {
    const { period = '30d', limit = 10 } = req.query;
    const days = parseInt(period) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    let whereClause = 'WHERE o.created_at >= ? AND o.status = "delivered"';
    const params = [startDateStr];

    if (req.user.role === 'warehouse') {
        whereClause += ' AND p.warehouse_id = ?';
        params.push(req.user.id);
    }

    params.push(parseInt(limit) || 10);

    const products = await db.all(`
        SELECT 
            p.id,
            p.name,
            p.category,
            SUM(oi.quantity) as total_sold,
            SUM(oi.quantity * oi.price) as total_revenue,
            AVG(oi.price) as avg_price,
            COUNT(DISTINCT o.pharmacy_id) as unique_buyers
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        ${whereClause}
        GROUP BY p.id
        ORDER BY total_sold DESC
        LIMIT ?
    `, params);

    res.json({ products, period, startDate: startDateStr });
}));

// Get customer insights (warehouse only)
router.get('/customer-insights', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const { period = '30d' } = req.query;
    const days = parseInt(period) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const customers = await db.all(`
        SELECT 
            u.id,
            u.username,
            u.email,
            u.phone,
            COUNT(o.id) as total_orders,
            SUM(o.total_amount) as total_spent,
            AVG(o.total_amount) as avg_order_value,
            MAX(o.created_at) as last_order_date,
            MIN(o.created_at) as first_order_date
        FROM orders o
        JOIN users u ON o.pharmacy_id = u.id
        WHERE o.warehouse_id = ? AND o.created_at >= ? AND o.status = 'delivered'
        GROUP BY o.pharmacy_id
        ORDER BY total_spent DESC
    `, [req.user.id, startDateStr]);

    res.json({ customers, period, startDate: startDateStr });
}));

// Export data
router.get('/export', authenticateToken, requireRole('admin'), asyncHandler(async (req, res) => {
    const { type, format = 'json', startDate, endDate } = req.query;
    
    let data;
    let filename;
    
    switch (type) {
        case 'orders':
            data = await db.all(`
                SELECT o.*, u.username as pharmacy_name, w.username as warehouse_name
                FROM orders o
                JOIN users u ON o.pharmacy_id = u.id
                JOIN users w ON o.warehouse_id = w.id
                WHERE o.created_at BETWEEN ? AND ?
                ORDER BY o.created_at DESC
            `, [startDate || '1970-01-01', endDate || '2099-12-31']);
            filename = `orders_${startDate}_${endDate}`;
            break;
            
        case 'products':
            data = await db.all(`
                SELECT p.*, u.username as warehouse_name
                FROM products p
                JOIN users u ON p.warehouse_id = u.id
                ORDER BY p.created_at DESC
            `);
            filename = `products_${new Date().toISOString().split('T')[0]}`;
            break;
            
        case 'users':
            data = await db.all(`
                SELECT id, username, email, phone, address, role, rating, created_at
                FROM users
                ORDER BY created_at DESC
            `);
            filename = `users_${new Date().toISOString().split('T')[0]}`;
            break;
            
        default:
            return res.status(400).json({
                error: 'نوع التصدير غير صالح',
                code: 'INVALID_EXPORT_TYPE'
            });
    }
    
    if (format === 'csv') {
        // Convert to CSV
        const headers = Object.keys(data[0] || {}).join(',');
        const rows = data.map(row => 
            Object.values(row).map(val => 
                typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
            ).join(',')
        );
        const csv = [headers, ...rows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send(csv);
    }
    
    res.json({ data, type, count: data.length });
}));

module.exports = router;