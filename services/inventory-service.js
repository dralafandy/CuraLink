const db = require('../database/db');
const { createNotification } = require('./notification-service');

class InventoryService {
    // Get inventory summary for warehouse
    async getInventorySummary(warehouseId) {
        const summary = await db.get(`
            SELECT 
                COUNT(*) as total_products,
                SUM(quantity) as total_units,
                SUM(quantity * price) as inventory_value,
                COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock,
                COUNT(CASE WHEN quantity <= 10 AND quantity > 0 THEN 1 END) as low_stock,
                COUNT(CASE WHEN expiry_date <= date('now', '+30 days') AND expiry_date > date('now') THEN 1 END) as expiring_soon,
                COUNT(CASE WHEN expiry_date <= date('now') THEN 1 END) as expired
            FROM products
            WHERE warehouse_id = ?
        `, [warehouseId]);

        return summary;
    }

    // Get low stock products
    async getLowStockProducts(warehouseId, threshold = 10) {
        const products = await db.all(`
            SELECT 
                p.*,
                COALESCE(SUM(oi.quantity), 0) as total_sold_30d,
                CASE 
                    WHEN quantity = 0 THEN 'out_of_stock'
                    WHEN quantity <= ? THEN 'low_stock'
                    ELSE 'in_stock'
                END as stock_status
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id AND o.created_at >= date('now', '-30 days')
            WHERE p.warehouse_id = ? AND p.quantity <= ?
            GROUP BY p.id
            ORDER BY p.quantity ASC
        `, [threshold, warehouseId, threshold]);

        return products;
    }

    // Get expiring products
    async getExpiringProducts(warehouseId, days = 30) {
        const products = await db.all(`
            SELECT 
                p.*,
                julianday(expiry_date) - julianday('now') as days_until_expiry
            FROM products p
            WHERE p.warehouse_id = ? 
            AND p.expiry_date IS NOT NULL
            AND p.expiry_date <= date('now', '+${days} days')
            AND p.quantity > 0
            ORDER BY p.expiry_date ASC
        `, [warehouseId]);

        return products;
    }

    // Adjust inventory
    async adjustInventory({ productId, warehouseId, adjustment, reason, adjustedBy }) {
        // Get current quantity
        const product = await db.get(`
            SELECT * FROM products WHERE id = ? AND warehouse_id = ?
        `, [productId, warehouseId]);

        if (!product) {
            throw new Error('المنتج غير موجود');
        }

        const newQuantity = product.quantity + adjustment;
        
        if (newQuantity < 0) {
            throw new Error('الكمية الجديدة لا يمكن أن تكون سالبة');
        }

        // Update product quantity
        await db.run(`
            UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [newQuantity, productId]);

        // Log inventory change
        await db.run(`
            INSERT INTO inventory_logs 
            (product_id, warehouse_id, type, quantity, previous_quantity, new_quantity, reason, reference_type, created_by, created_at)
            VALUES (?, ?, 'adjustment', ?, ?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)
        `, [productId, warehouseId, adjustment, product.quantity, newQuantity, reason, adjustedBy]);

        // Check for low stock and notify
        if (newQuantity <= 10 && product.quantity > 10) {
            await createNotification({
                userId: warehouseId,
                type: 'low_stock',
                message: `المنتج "${product.name}" وصل للحد الأدنى (${newQuantity} وحدة)`,
                relatedId: productId
            });
        }

        return {
            productId,
            previousQuantity: product.quantity,
            newQuantity,
            adjustment
        };
    }

    // Get inventory logs
    async getInventoryLogs(warehouseId, options = {}) {
        const { productId, type, startDate, endDate, page = 1, limit = 50 } = options;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE l.warehouse_id = ?';
        const params = [warehouseId];

        if (productId) {
            whereClause += ' AND l.product_id = ?';
            params.push(productId);
        }

        if (type) {
            whereClause += ' AND l.type = ?';
            params.push(type);
        }

        if (startDate) {
            whereClause += ' AND l.created_at >= ?';
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ' AND l.created_at <= ?';
            params.push(endDate);
        }

        const logs = await db.all(`
            SELECT 
                l.*,
                p.name as product_name,
                u.username as created_by_name
            FROM inventory_logs l
            JOIN products p ON l.product_id = p.id
            LEFT JOIN users u ON l.created_by = u.id
            ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const total = await db.get(`
            SELECT COUNT(*) as count FROM inventory_logs l ${whereClause}
        `, params);

        return {
            logs,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get stock movement summary
    async getStockMovementSummary(warehouseId, period = '30d') {
        const days = parseInt(period) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        const summary = await db.get(`
            SELECT 
                COUNT(DISTINCT product_id) as products_affected,
                SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END) as total_in,
                SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END) as total_out,
                SUM(CASE WHEN type = 'adjustment' THEN ABS(quantity) ELSE 0 END) as total_adjustments,
                SUM(CASE WHEN type = 'return' THEN quantity ELSE 0 END) as total_returns
            FROM inventory_logs
            WHERE warehouse_id = ? AND created_at >= ?
        `, [warehouseId, startDateStr]);

        return summary;
    }
}

module.exports = new InventoryService();