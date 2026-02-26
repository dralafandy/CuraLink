const db = require('../database/db');
const { createNotification } = require('./notification-service');

class PaymentService {
    // Get payment methods for user
    async getPaymentMethods(userId) {
        const methods = await db.all(`
            SELECT * FROM payment_methods 
            WHERE user_id = ? AND is_active = 1
            ORDER BY is_default DESC, created_at DESC
        `, [userId]);
        
        // Mask sensitive data
        return methods.map(method => ({
            ...method,
            // Don't expose full card details
            last_four: method.last_four || '****'
        }));
    }

    // Add payment method
    async addPaymentMethod(userId, methodData) {
        const { type, provider, last_four, expiry_month, expiry_year, is_default, metadata } = methodData;
        
        // If setting as default, unset other defaults
        if (is_default) {
            await db.run(`
                UPDATE payment_methods SET is_default = 0 WHERE user_id = ?
            `, [userId]);
        }
        
        const result = await db.run(`
            INSERT INTO payment_methods 
            (user_id, type, provider, last_four, expiry_month, expiry_year, is_default, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [userId, type, provider, last_four, expiry_month, expiry_year, is_default ? 1 : 0, JSON.stringify(metadata)]);
        
        return {
            id: result.lastID,
            type,
            provider,
            last_four,
            is_default: is_default ? 1 : 0
        };
    }

    // Update payment method
    async updatePaymentMethod(userId, methodId, updates) {
        const { is_default, is_active } = updates;
        
        // Verify ownership
        const method = await db.get(`
            SELECT * FROM payment_methods WHERE id = ? AND user_id = ?
        `, [methodId, userId]);
        
        if (!method) {
            throw new Error('طريقة الدفع غير موجودة');
        }
        
        // If setting as default, unset other defaults
        if (is_default) {
            await db.run(`
                UPDATE payment_methods SET is_default = 0 WHERE user_id = ?
            `, [userId]);
        }
        
        await db.run(`
            UPDATE payment_methods 
            SET is_default = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `, [is_default ? 1 : 0, is_active !== undefined ? (is_active ? 1 : 0) : method.is_active, methodId, userId]);
        
        return { success: true };
    }

    // Delete payment method
    async deletePaymentMethod(userId, methodId) {
        const result = await db.run(`
            DELETE FROM payment_methods WHERE id = ? AND user_id = ?
        `, [methodId, userId]);
        
        if (result.changes === 0) {
            throw new Error('طريقة الدفع غير موجودة');
        }
        
        return { success: true };
    }

    // Process payment
    async processPayment({ userId, invoiceId, amount, paymentMethodId, metadata = {} }) {
        // Get invoice details
        const invoice = await db.get(`
            SELECT i.*, o.pharmacy_id, o.warehouse_id
            FROM invoices i
            JOIN orders o ON i.order_id = o.id
            WHERE i.id = ?
        `, [invoiceId]);
        
        if (!invoice) {
            throw new Error('الفاتورة غير موجودة');
        }
        
        // Verify user can pay this invoice
        if (invoice.pharmacy_id !== userId && invoice.warehouse_id !== userId) {
            throw new Error('غير مصرح لك بدفع هذه الفاتورة');
        }
        
        // Create transaction record
        const transaction = await db.run(`
            INSERT INTO transactions 
            (user_id, invoice_id, type, amount, status, payment_method_id, description, metadata, created_at)
            VALUES (?, ?, 'payment', ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [userId, invoiceId, amount, paymentMethodId, `دفع فاتورة #${invoiceId}`, JSON.stringify(metadata)]);
        
        // Here you would integrate with actual payment gateway
        // For now, simulate successful payment
        await this.confirmPayment(transaction.lastID);
        
        return {
            transactionId: transaction.lastID,
            status: 'completed',
            amount
        };
    }

    // Confirm payment (called by payment gateway webhook)
    async confirmPayment(transactionId) {
        const transaction = await db.get(`
            SELECT * FROM transactions WHERE id = ?
        `, [transactionId]);
        
        if (!transaction) {
            throw new Error('المعاملة غير موجودة');
        }
        
        // Update transaction status
        await db.run(`
            UPDATE transactions 
            SET status = 'completed', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [transactionId]);
        
        // Update invoice status
        if (transaction.invoice_id) {
            await db.run(`
                UPDATE invoices 
                SET status = 'paid', paid_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [transaction.invoice_id]);
            
            // Get invoice details for notification
            const invoice = await db.get(`
                SELECT i.*, o.pharmacy_id, o.warehouse_id
                FROM invoices i
                JOIN orders o ON i.order_id = o.id
                WHERE i.id = ?
            `, [transaction.invoice_id]);
            
            if (invoice) {
                // Notify both parties
                await createNotification({
                    userId: invoice.pharmacy_id,
                    type: 'payment_completed',
                    message: `تم دفع الفاتورة #${transaction.invoice_id} بنجاح`,
                    relatedId: transaction.invoice_id
                });
                
                await createNotification({
                    userId: invoice.warehouse_id,
                    type: 'payment_received',
                    message: `تم استلام الدفع للفاتورة #${transaction.invoice_id}`,
                    relatedId: transaction.invoice_id
                });
            }
        }
        
        return { success: true };
    }

    // Process refund
    async processRefund({ transactionId, amount, reason, processedBy }) {
        const originalTransaction = await db.get(`
            SELECT * FROM transactions WHERE id = ?
        `, [transactionId]);
        
        if (!originalTransaction) {
            throw new Error('المعاملة الأصلية غير موجودة');
        }
        
        if (originalTransaction.status !== 'completed') {
            throw new Error('لا يمكن استرداد معاملة غير مكتملة');
        }
        
        // Create refund transaction
        const refund = await db.run(`
            INSERT INTO transactions 
            (user_id, invoice_id, order_id, type, amount, status, description, metadata, created_at)
            VALUES (?, ?, ?, 'refund', ?, 'completed', ?, ?, CURRENT_TIMESTAMP)
        `, [
            originalTransaction.user_id,
            originalTransaction.invoice_id,
            originalTransaction.order_id,
            -Math.abs(amount),
            `استرداد: ${reason}`,
            JSON.stringify({ original_transaction_id: transactionId, reason, processed_by: processedBy })
        ]);
        
        // Update original transaction
        await db.run(`
            UPDATE transactions 
            SET metadata = json_set(COALESCE(metadata, '{}'), '$.refunded', true, '$.refund_id', ?)
            WHERE id = ?
        `, [refund.lastID, transactionId]);
        
        return {
            refundId: refund.lastID,
            amount: -Math.abs(amount),
            status: 'completed'
        };
    }

    // Get transaction history
    async getTransactionHistory(userId, options = {}) {
        const { page = 1, limit = 20, type, status } = options;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE user_id = ?';
        const params = [userId];

        if (type) {
            whereClause += ' AND type = ?';
            params.push(type);
        }

        if (status) {
            whereClause += ' AND status = ?';
            params.push(status);
        }

        const transactions = await db.all(`
            SELECT t.*, i.order_id
            FROM transactions t
            LEFT JOIN invoices i ON t.invoice_id = i.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const total = await db.get(`
            SELECT COUNT(*) as count FROM transactions ${whereClause}
        `, params);

        return {
            transactions,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }
}

module.exports = new PaymentService();