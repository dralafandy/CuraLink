const db = require('../database/db');

class AnalyticsService {
    // Dashboard statistics
    async getDashboardStats(userId, role, period = '30d') {
        const days = parseInt(period) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        let stats = {
            period,
            startDate: startDateStr,
            summary: {},
            charts: {},
            recent: {}
        };

        if (role === 'admin') {
            stats.summary = await this.getAdminSummary(startDateStr);
            stats.charts = await this.getAdminCharts(startDateStr, days);
            stats.recent = await this.getAdminRecentActivity();
        } else if (role === 'warehouse') {
            stats.summary = await this.getWarehouseSummary(userId, startDateStr);
            stats.charts = await this.getWarehouseCharts(userId, startDateStr, days);
            stats.recent = await this.getWarehouseRecentActivity(userId);
        } else if (role === 'pharmacy') {
            stats.summary = await this.getPharmacySummary(userId, startDateStr);
            stats.charts = await this.getPharmacyCharts(userId, startDateStr, days);
            stats.recent = await this.getPharmacyRecentActivity(userId);
        }

        return stats;
    }

    // Admin summary
    async getAdminSummary(startDate) {
        const queries = {
            totalUsers: `SELECT COUNT(*) as count FROM users WHERE role IN ('warehouse', 'pharmacy')`,
            totalProducts: `SELECT COUNT(*) as count FROM products`,
            totalOrders: `SELECT COUNT(*) as count FROM orders WHERE created_at >= ?`,
            totalRevenue: `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'delivered' AND created_at >= ?`,
            totalCommission: `SELECT COALESCE(SUM(commission), 0) as total FROM orders WHERE status = 'delivered' AND created_at >= ?`,
            pendingOrders: `SELECT COUNT(*) as count FROM orders WHERE status = 'pending'`,
            processingOrders: `SELECT COUNT(*) as count FROM orders WHERE status = 'processing'`,
            newUsers: `SELECT COUNT(*) as count FROM users WHERE created_at >= ?`,
            lowStockProducts: `SELECT COUNT(*) as count FROM products WHERE quantity <= 10`,
            expiringProducts: `SELECT COUNT(*) as count FROM products WHERE expiry_date <= date('now', '+30 days')`
        };

        const results = {};
        for (const [key, sql] of Object.entries(queries)) {
            const result = await db.get(sql, [startDate, startDate, startDate, startDate].slice(0, (sql.match(/\?/g) || []).length));
            results[key] = result?.count || result?.total || 0;
        }

        return results;
    }

    // Warehouse summary
    async getWarehouseSummary(warehouseId, startDate) {
        const queries = {
            totalProducts: `SELECT COUNT(*) as count FROM products WHERE warehouse_id = ?`,
            totalOrders: `SELECT COUNT(*) as count FROM orders WHERE warehouse_id = ? AND created_at >= ?`,
            totalRevenue: `SELECT COALESCE(SUM(total_amount - commission), 0) as total FROM orders WHERE warehouse_id = ? AND status = 'delivered' AND created_at >= ?`,
            pendingOrders: `SELECT COUNT(*) as count FROM orders WHERE warehouse_id = ? AND status = 'pending'`,
            processingOrders: `SELECT COUNT(*) as count FROM orders WHERE warehouse_id = ? AND status = 'processing'`,
            lowStockProducts: `SELECT COUNT(*) as count FROM products WHERE warehouse_id = ? AND quantity <= 10`,
            outOfStockProducts: `SELECT COUNT(*) as count FROM products WHERE warehouse_id = ? AND quantity = 0`,
            averageRating: `SELECT COALESCE(AVG(rating), 0) as avg FROM ratings WHERE warehouse_id = ?`,
            totalViews: `SELECT COALESCE(SUM(view_count), 0) as total FROM products WHERE warehouse_id = ?`
        };

        const results = {};
        for (const [key, sql] of Object.entries(queries)) {
            const paramCount = (sql.match(/\?/g) || []).length;
            const params = paramCount === 1 ? [warehouseId] : [warehouseId, startDate];
            const result = await db.get(sql, params);
            results[key] = result?.count || result?.total || result?.avg || 0;
        }

        return results;
    }

    // Pharmacy summary
    async getPharmacySummary(pharmacyId, startDate) {
        const queries = {
            totalOrders: `SELECT COUNT(*) as count FROM orders WHERE pharmacy_id = ? AND created_at >= ?`,
            totalSpent: `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE pharmacy_id = ? AND status = 'delivered' AND created_at >= ?`,
            pendingOrders: `SELECT COUNT(*) as count FROM orders WHERE pharmacy_id = ? AND status IN ('pending', 'processing')`,
            deliveredOrders: `SELECT COUNT(*) as count FROM orders WHERE pharmacy_id = ? AND status = 'delivered'`,
            wishlistCount: `SELECT COUNT(*) as count FROM wishlist WHERE pharmacy_id = ?`,
            favoriteWarehouses: `SELECT COUNT(DISTINCT warehouse_id) as count FROM orders WHERE pharmacy_id = ?`
        };

        const results = {};
        for (const [key, sql] of Object.entries(queries)) {
            const paramCount = (sql.match(/\?/g) || []).length;
            const params = paramCount === 1 ? [pharmacyId] : [pharmacyId, startDate];
            const result = await db.get(sql, params);
            results[key] = result?.count || result?.total || 0;
        }

        return results;
    }

    // Admin charts
    async getAdminCharts(startDate, days) {
        const ordersByDay = await db.all(`
            SELECT 
                date(created_at) as date,
                COUNT(*) as count,
                SUM(total_amount) as revenue
            FROM orders
            WHERE created_at >= ?
            GROUP BY date(created_at)
            ORDER BY date
        `, [startDate]);

        const ordersByStatus = await db.all(`
            SELECT 
                status,
                COUNT(*) as count
            FROM orders
            WHERE created_at >= ?
            GROUP BY status
        `, [startDate]);

        const topWarehouses = await db.all(`
            SELECT 
                u.username,
                COUNT(o.id) as order_count,
                SUM(o.total_amount) as total_revenue
            FROM orders o
            JOIN users u ON o.warehouse_id = u.id
            WHERE o.created_at >= ? AND o.status = 'delivered'
            GROUP BY o.warehouse_id
            ORDER BY total_revenue DESC
            LIMIT 10
        `, [startDate]);

        const topProducts = await db.all(`
            SELECT 
                p.name,
                SUM(oi.quantity) as total_sold,
                SUM(oi.quantity * oi.price) as total_revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.created_at >= ? AND o.status = 'delivered'
            GROUP BY oi.product_id
            ORDER BY total_sold DESC
            LIMIT 10
        `, [startDate]);

        return {
            ordersByDay,
            ordersByStatus,
            topWarehouses,
            topProducts
        };
    }

    // Warehouse charts
    async getWarehouseCharts(warehouseId, startDate, days) {
        const ordersByDay = await db.all(`
            SELECT 
                date(created_at) as date,
                COUNT(*) as count,
                SUM(total_amount - commission) as revenue
            FROM orders
            WHERE warehouse_id = ? AND created_at >= ?
            GROUP BY date(created_at)
            ORDER BY date
        `, [warehouseId, startDate]);

        const ordersByStatus = await db.all(`
            SELECT 
                status,
                COUNT(*) as count
            FROM orders
            WHERE warehouse_id = ? AND created_at >= ?
            GROUP BY status
        `, [warehouseId, startDate]);

        const topProducts = await db.all(`
            SELECT 
                p.name,
                SUM(oi.quantity) as total_sold,
                SUM(oi.quantity * oi.price) as total_revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            JOIN orders o ON oi.order_id = o.id
            WHERE p.warehouse_id = ? AND o.created_at >= ? AND o.status = 'delivered'
            GROUP BY oi.product_id
            ORDER BY total_sold DESC
            LIMIT 10
        `, [warehouseId, startDate]);

        const stockLevels = await db.all(`
            SELECT 
                name,
                quantity,
                CASE 
                    WHEN quantity = 0 THEN 'out_of_stock'
                    WHEN quantity <= 10 THEN 'low_stock'
                    ELSE 'in_stock'
                END as status
            FROM products
            WHERE warehouse_id = ?
            ORDER BY quantity ASC
            LIMIT 20
        `, [warehouseId]);

        return {
            ordersByDay,
            ordersByStatus,
            topProducts,
            stockLevels
        };
    }

    // Pharmacy charts
    async getPharmacyCharts(pharmacyId, startDate, days) {
        const ordersByDay = await db.all(`
            SELECT 
                date(created_at) as date,
                COUNT(*) as count,
                SUM(total_amount) as spent
            FROM orders
            WHERE pharmacy_id = ? AND created_at >= ?
            GROUP BY date(created_at)
            ORDER BY date
        `, [pharmacyId, startDate]);

        const ordersByWarehouse = await db.all(`
            SELECT 
                u.username as warehouse_name,
                COUNT(*) as order_count,
                SUM(o.total_amount) as total_spent
            FROM orders o
            JOIN users u ON o.warehouse_id = u.id
            WHERE o.pharmacy_id = ? AND o.created_at >= ?
            GROUP BY o.warehouse_id
            ORDER BY total_spent DESC
        `, [pharmacyId, startDate]);

        const topProducts = await db.all(`
            SELECT 
                p.name,
                SUM(oi.quantity) as total_bought,
                SUM(oi.quantity * oi.price) as total_spent
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.pharmacy_id = ? AND o.created_at >= ?
            GROUP BY oi.product_id
            ORDER BY total_bought DESC
            LIMIT 10
        `, [pharmacyId, startDate]);

        return {
            ordersByDay,
            ordersByWarehouse,
            topProducts
        };
    }

    // Recent activity
    async getAdminRecentActivity() {
        const recentOrders = await db.all(`
            SELECT o.*, u.username as pharmacy_name, w.username as warehouse_name
            FROM orders o
            JOIN users u ON o.pharmacy_id = u.id
            JOIN users w ON o.warehouse_id = w.id
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        const recentUsers = await db.all(`
            SELECT id, username, email, role, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 10
        `);

        return { recentOrders, recentUsers };
    }

    async getWarehouseRecentActivity(warehouseId) {
        const recentOrders = await db.all(`
            SELECT o.*, u.username as pharmacy_name
            FROM orders o
            JOIN users u ON o.pharmacy_id = u.id
            WHERE o.warehouse_id = ?
            ORDER BY o.created_at DESC
            LIMIT 10
        `, [warehouseId]);

        const recentProducts = await db.all(`
            SELECT id, name, quantity, created_at, updated_at
            FROM products
            WHERE warehouse_id = ?
            ORDER BY updated_at DESC
            LIMIT 10
        `, [warehouseId]);

        return { recentOrders, recentProducts };
    }

    async getPharmacyRecentActivity(pharmacyId) {
        const recentOrders = await db.all(`
            SELECT o.*, u.username as warehouse_name
            FROM orders o
            JOIN users u ON o.warehouse_id = u.id
            WHERE o.pharmacy_id = ?
            ORDER BY o.created_at DESC
            LIMIT 10
        `, [pharmacyId]);

        const recentWishlist = await db.all(`
            SELECT w.*, p.name as product_name, p.price
            FROM wishlist w
            JOIN products p ON w.product_id = p.id
            WHERE w.pharmacy_id = ?
            ORDER BY w.created_at DESC
            LIMIT 10
        `, [pharmacyId]);

        return { recentOrders, recentWishlist };
    }

    // Sales report
    async getSalesReport(filters = {}) {
        const { startDate, endDate, warehouseId, pharmacyId, status } = filters;
        
        let whereClause = 'WHERE 1=1';
        const params = [];

        if (startDate) {
            whereClause += ' AND o.created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            whereClause += ' AND o.created_at <= ?';
            params.push(endDate);
        }
        if (warehouseId) {
            whereClause += ' AND o.warehouse_id = ?';
            params.push(warehouseId);
        }
        if (pharmacyId) {
            whereClause += ' AND o.pharmacy_id = ?';
            params.push(pharmacyId);
        }
        if (status) {
            whereClause += ' AND o.status = ?';
            params.push(status);
        }

        const summary = await db.get(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(o.total_amount) as total_revenue,
                SUM(o.commission) as total_commission,
                AVG(o.total_amount) as average_order_value
            FROM orders o
            ${whereClause}
        `, params);

        const dailyBreakdown = await db.all(`
            SELECT 
                date(o.created_at) as date,
                COUNT(*) as orders,
                SUM(o.total_amount) as revenue,
                SUM(o.commission) as commission
            FROM orders o
            ${whereClause}
            GROUP BY date(o.created_at)
            ORDER BY date
        `, params);

        return { summary, dailyBreakdown };
    }

    // Inventory report
    async getInventoryReport(warehouseId) {
        const summary = await db.get(`
            SELECT 
                COUNT(*) as total_products,
                SUM(quantity) as total_quantity,
                SUM(quantity * price) as inventory_value,
                COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock,
                COUNT(CASE WHEN quantity <= 10 AND quantity > 0 THEN 1 END) as low_stock
            FROM products
            WHERE warehouse_id = ?
        `, [warehouseId]);

        const byCategory = await db.all(`
            SELECT 
                COALESCE(category, 'غير مصنف') as category,
                COUNT(*) as product_count,
                SUM(quantity) as total_quantity,
                SUM(quantity * price) as value
            FROM products
            WHERE warehouse_id = ?
            GROUP BY category
        `, [warehouseId]);

        const expiringSoon = await db.all(`
            SELECT 
                id, name, quantity, expiry_date,
                julianday(expiry_date) - julianday('now') as days_until_expiry
            FROM products
            WHERE warehouse_id = ? 
            AND expiry_date IS NOT NULL 
            AND expiry_date <= date('now', '+30 days')
            ORDER BY expiry_date
        `, [warehouseId]);

        return { summary, byCategory, expiringSoon };
    }
}

module.exports = new AnalyticsService();