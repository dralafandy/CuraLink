const express = require('express');
const router = express.Router();
const inventoryService = require('../services/inventory-service');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Get inventory summary
router.get('/summary', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const summary = await inventoryService.getInventorySummary(req.user.id);
    res.json(summary);
}));

// Get low stock products
router.get('/low-stock', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const { threshold = 10 } = req.query;
    const products = await inventoryService.getLowStockProducts(req.user.id, parseInt(threshold));
    res.json({ products, threshold: parseInt(threshold) });
}));

// Get expiring products
router.get('/expiring', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;
    const products = await inventoryService.getExpiringProducts(req.user.id, parseInt(days));
    res.json({ products, days: parseInt(days) });
}));

// Adjust inventory
router.post('/adjust', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const { product_id, adjustment, reason } = req.body;
    
    if (!product_id || adjustment === undefined || !reason) {
        return res.status(400).json({
            error: 'جميع الحقول مطلوبة',
            code: 'MISSING_FIELDS'
        });
    }
    
    const result = await inventoryService.adjustInventory({
        productId: product_id,
        warehouseId: req.user.id,
        adjustment: parseInt(adjustment),
        reason,
        adjustedBy: req.user.id
    });
    
    res.json(result);
}));

// Get inventory logs
router.get('/logs', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const { product_id, type, start_date, end_date, page, limit } = req.query;
    
    const result = await inventoryService.getInventoryLogs(req.user.id, {
        productId: product_id ? parseInt(product_id) : null,
        type,
        startDate: start_date,
        endDate: end_date,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50
    });
    
    res.json(result);
}));

// Get stock movement summary
router.get('/movement-summary', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const { period = '30d' } = req.query;
    const summary = await inventoryService.getStockMovementSummary(req.user.id, period);
    res.json(summary);
}));

// Bulk inventory adjustment
router.post('/bulk-adjust', authenticateToken, requireRole('warehouse'), asyncHandler(async (req, res) => {
    const { adjustments } = req.body;
    
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return res.status(400).json({
            error: 'يجب توفير قائمة بالتعديلات',
            code: 'MISSING_ADJUSTMENTS'
        });
    }
    
    const results = [];
    const errors = [];
    
    for (const adj of adjustments) {
        try {
            const result = await inventoryService.adjustInventory({
                productId: adj.product_id,
                warehouseId: req.user.id,
                adjustment: parseInt(adj.adjustment),
                reason: adj.reason,
                adjustedBy: req.user.id
            });
            results.push({ success: true, product_id: adj.product_id, result });
        } catch (err) {
            errors.push({ success: false, product_id: adj.product_id, error: err.message });
        }
    }
    
    res.json({
        processed: adjustments.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors
    });
}));

module.exports = router;