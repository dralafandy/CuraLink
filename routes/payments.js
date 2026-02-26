const express = require('express');
const router = express.Router();
const paymentService = require('../services/payment-service');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Get payment methods
router.get('/methods', authenticateToken, asyncHandler(async (req, res) => {
    const methods = await paymentService.getPaymentMethods(req.user.id);
    res.json({ methods });
}));

// Add payment method
router.post('/methods', authenticateToken, asyncHandler(async (req, res) => {
    const { type, provider, last_four, expiry_month, expiry_year, is_default, metadata } = req.body;
    
    if (!type) {
        return res.status(400).json({
            error: 'نوع طريقة الدفع مطلوب',
            code: 'MISSING_PAYMENT_TYPE'
        });
    }
    
    const method = await paymentService.addPaymentMethod(req.user.id, {
        type,
        provider,
        last_four,
        expiry_month,
        expiry_year,
        is_default,
        metadata
    });
    
    res.json({ method, success: true });
}));

// Update payment method
router.put('/methods/:methodId', authenticateToken, asyncHandler(async (req, res) => {
    const { methodId } = req.params;
    const { is_default, is_active } = req.body;
    
    await paymentService.updatePaymentMethod(req.user.id, parseInt(methodId), {
        is_default,
        is_active
    });
    
    res.json({ success: true });
}));

// Delete payment method
router.delete('/methods/:methodId', authenticateToken, asyncHandler(async (req, res) => {
    const { methodId } = req.params;
    await paymentService.deletePaymentMethod(req.user.id, parseInt(methodId));
    res.json({ success: true });
}));

// Process payment
router.post('/process', authenticateToken, asyncHandler(async (req, res) => {
    const { invoice_id, amount, payment_method_id, metadata } = req.body;
    
    if (!invoice_id || !amount) {
        return res.status(400).json({
            error: 'رقم الفاتورة والمبلغ مطلوبان',
            code: 'MISSING_PAYMENT_DETAILS'
        });
    }
    
    const result = await paymentService.processPayment({
        userId: req.user.id,
        invoiceId: invoice_id,
        amount,
        paymentMethodId: payment_method_id,
        metadata
    });
    
    res.json(result);
}));

// Get transaction history
router.get('/transactions', authenticateToken, asyncHandler(async (req, res) => {
    const { page, limit, type, status } = req.query;
    
    const result = await paymentService.getTransactionHistory(req.user.id, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        type,
        status
    });
    
    res.json(result);
}));

// Process refund (admin only)
router.post('/refund', authenticateToken, asyncHandler(async (req, res) => {
    // Check if user is admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'غير مصرح لك بإجراء الاسترداد',
            code: 'UNAUTHORIZED'
        });
    }
    
    const { transaction_id, amount, reason } = req.body;
    
    if (!transaction_id || !amount || !reason) {
        return res.status(400).json({
            error: 'جميع الحقول مطلوبة',
            code: 'MISSING_REFUND_DETAILS'
        });
    }
    
    const result = await paymentService.processRefund({
        transactionId: transaction_id,
        amount,
        reason,
        processedBy: req.user.id
    });
    
    res.json(result);
}));

module.exports = router;