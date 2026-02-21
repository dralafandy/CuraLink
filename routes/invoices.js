const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { createNotification } = require('../services/notification-service');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ error: 'Ø±Ù…Ø² ØºÙŠØ± ØµØ§Ù„Ø­' });
    }
}

function canViewInvoice(user, invoice) {
    if (user.role === 'admin') return true;
    if (user.role === 'warehouse' && invoice.warehouse_id === user.id) return true;
    if (user.role === 'pharmacy' && invoice.pharmacy_id === user.id) return true;
    return false;
}

async function getInvoiceWithContext(invoiceId) {
    const { data: invoice, error: invoiceError } = await db.supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return null;

    const { data: order, error: orderError } = await db.supabase
        .from('orders')
        .select('id, pharmacy_id, warehouse_id, status')
        .eq('id', invoice.order_id)
        .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return null;

    const userIds = [order.pharmacy_id, order.warehouse_id].filter(Boolean);
    let usersMap = new Map();
    if (userIds.length) {
        const { data: users, error: usersError } = await db.supabase
            .from('users')
            .select('id, username, email, address')
            .in('id', userIds);
        if (usersError) throw usersError;
        usersMap = new Map((users || []).map((user) => [user.id, user]));
    }

    const pharmacy = usersMap.get(order.pharmacy_id) || {};
    const warehouse = usersMap.get(order.warehouse_id) || {};

    return {
        ...invoice,
        order_id: order.id,
        pharmacy_id: order.pharmacy_id,
        warehouse_id: order.warehouse_id,
        order_status: order.status,
        pharmacy_name: pharmacy.username || null,
        pharmacy_email: pharmacy.email || null,
        pharmacy_address: pharmacy.address || null,
        warehouse_name: warehouse.username || null,
        warehouse_email: warehouse.email || null,
        warehouse_address: warehouse.address || null
    };
}

async function getInvoicePaymentsSummary(invoiceId) {
    const summary = await dbGet(
        `
            SELECT
                COALESCE(SUM(amount), 0) AS total_paid,
                COUNT(*) AS payments_count,
                MAX(paid_at) AS last_payment_at
            FROM invoice_payments
            WHERE invoice_id = ?
        `,
        [invoiceId]
    );
    return summary || { total_paid: 0, payments_count: 0, last_payment_at: null };
}

function getInvoiceTargetAmount(invoice) {
    return Number(invoice?.amount || 0) + Number(invoice?.commission || 0);
}

async function syncInvoiceStatusFromPayments(invoice) {
    const paymentSummary = await getInvoicePaymentsSummary(invoice.id);
    const totalPaid = Number(paymentSummary.total_paid || 0);
    const target = getInvoiceTargetAmount(invoice);
    let status = invoice.status;

    if (invoice.status !== 'cancelled') {
        status = totalPaid >= target && target > 0 ? 'paid' : 'pending';
    }

    if (status !== invoice.status) {
        if (status === 'paid') {
            await dbRun(
                'UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP, cancelled_at = NULL WHERE id = ?',
                ['paid', invoice.id]
            );
        } else {
            await dbRun(
                'UPDATE invoices SET status = ?, paid_at = NULL WHERE id = ?',
                ['pending', invoice.id]
            );
        }
    }
}

router.get('/', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    try {
        const { data: invoices, error: invoicesError } = await db.supabase
            .from('invoices')
            .select('*')
            .order('created_at', { ascending: false });
        if (invoicesError) throw invoicesError;

        const safeInvoices = invoices || [];
        if (safeInvoices.length === 0) {
            return res.json({ invoices: [] });
        }

        const orderIds = [...new Set(safeInvoices.map((i) => i.order_id).filter(Boolean))];
        const { data: orders, error: ordersError } = await db.supabase
            .from('orders')
            .select('id, pharmacy_id, warehouse_id')
            .in('id', orderIds);
        if (ordersError) throw ordersError;

        const safeOrders = orders || [];
        const userIds = [...new Set(
            safeOrders
                .flatMap((o) => [o.pharmacy_id, o.warehouse_id])
                .filter(Boolean)
        )];
        const { data: users, error: usersError } = await db.supabase
            .from('users')
            .select('id, username')
            .in('id', userIds);
        if (usersError) throw usersError;

        const ordersMap = new Map(safeOrders.map((o) => [o.id, o]));
        const usersMap = new Map((users || []).map((u) => [u.id, u.username]));

        const hydratedInvoices = safeInvoices.map((invoice) => {
            const order = ordersMap.get(invoice.order_id);
            return {
                ...invoice,
                order_id: invoice.order_id,
                pharmacy_name: order ? (usersMap.get(order.pharmacy_id) || null) : null,
                warehouse_name: order ? (usersMap.get(order.warehouse_id) || null) : null
            };
        });

        return res.json({ invoices: hydratedInvoices });
    } catch (err) {
        console.error('GET /invoices error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/my-invoices', verifyToken, async (req, res) => {
    try {
        let ordersQuery = db.supabase
            .from('orders')
            .select('id, pharmacy_id, warehouse_id');

        if (req.user.role === 'warehouse') {
            ordersQuery = ordersQuery.eq('warehouse_id', req.user.id);
        } else if (req.user.role === 'pharmacy') {
            ordersQuery = ordersQuery.eq('pharmacy_id', req.user.id);
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
        }

        const { data: orders, error: ordersError } = await ordersQuery;
        if (ordersError) throw ordersError;

        const safeOrders = orders || [];
        if (safeOrders.length === 0) {
            return res.json({ invoices: [] });
        }

        const orderIds = safeOrders.map((o) => o.id);
        const { data: invoices, error: invoicesError } = await db.supabase
            .from('invoices')
            .select('*')
            .in('order_id', orderIds)
            .order('created_at', { ascending: false });
        if (invoicesError) throw invoicesError;

        const pharmacyIds = [...new Set(safeOrders.map((o) => o.pharmacy_id).filter(Boolean))];
        const warehouseIds = [...new Set(safeOrders.map((o) => o.warehouse_id).filter(Boolean))];
        const userIds = [...new Set([...pharmacyIds, ...warehouseIds])];

        const { data: users, error: usersError } = await db.supabase
            .from('users')
            .select('id, username')
            .in('id', userIds);
        if (usersError) throw usersError;

        const ordersMap = new Map(safeOrders.map((o) => [o.id, o]));
        const usersMap = new Map((users || []).map((u) => [u.id, u.username]));

        const hydratedInvoices = (invoices || []).map((invoice) => {
            const order = ordersMap.get(invoice.order_id);
            return {
                ...invoice,
                order_id: invoice.order_id,
                pharmacy_name: order ? (usersMap.get(order.pharmacy_id) || null) : null,
                warehouse_name: order ? (usersMap.get(order.warehouse_id) || null) : null
            };
        });

        return res.json({ invoices: hydratedInvoices });
    } catch (err) {
        console.error('GET /invoices/my-invoices error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/stats', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    try {
        const stats = await dbGet(
            `
                SELECT
                    COUNT(*) as total_invoices,
                    SUM(amount) as total_amount,
                    SUM(commission) as total_commission,
                    SUM(amount + commission) as total_net
                FROM invoices i
                JOIN orders o ON i.order_id = o.id
                WHERE o.status NOT IN ('cancelled', 'rejected')
            `
        );
        return res.json({ stats });
    } catch (err) {
        console.error('GET /invoices/stats error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/my-stats', verifyToken, async (req, res) => {
    if (req.user.role !== 'warehouse') return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    try {
        const stats = await dbGet(
            `
                SELECT
                    COUNT(*) as total_orders,
                    SUM(o.total_amount) as total_sales,
                    SUM(o.commission) as total_commission,
                    SUM(o.total_amount + o.commission) as net_earnings
                FROM orders o
                WHERE o.warehouse_id = ? AND o.status = 'delivered'
            `,
            [req.user.id]
        );
        return res.json({ stats });
    } catch (err) {
        console.error('GET /invoices/my-stats error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/reports/financial', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    const year = Number.parseInt(req.query.year, 10);
    const month = Number.parseInt(req.query.month, 10);

    try {
        let filter = '';
        const params = [];
        if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
            filter = "WHERE strftime('%Y', i.created_at) = ? AND strftime('%m', i.created_at) = ?";
            params.push(String(year), String(month).padStart(2, '0'));
        } else if (Number.isInteger(year)) {
            filter = "WHERE strftime('%Y', i.created_at) = ?";
            params.push(String(year));
        }

        const summary = await dbGet(
            `
                SELECT
                    COUNT(*) AS invoices_count,
                    COALESCE(SUM(i.amount), 0) AS gross_amount,
                    COALESCE(SUM(i.commission), 0) AS total_commission,
                    COALESCE(SUM(i.amount + i.commission), 0) AS net_amount,
                    COALESCE(SUM(
                        CASE
                            WHEN COALESCE(p.total_paid, 0) > (i.amount + i.commission) THEN (i.amount + i.commission)
                            ELSE COALESCE(p.total_paid, 0)
                        END
                    ), 0) AS net_paid_amount
                FROM invoices i
                LEFT JOIN (
                    SELECT invoice_id, SUM(amount) AS total_paid
                    FROM invoice_payments
                    GROUP BY invoice_id
                ) p ON p.invoice_id = i.id
                ${filter}
            `,
            params
        );

        const byMonth = await dbAll(
            `
                SELECT
                    strftime('%Y-%m', i.created_at) AS period,
                    COUNT(*) AS invoices_count,
                    COALESCE(SUM(i.amount + i.commission), 0) AS net_amount,
                    COALESCE(SUM(
                        CASE
                            WHEN COALESCE(p.total_paid, 0) > (i.amount + i.commission) THEN (i.amount + i.commission)
                            ELSE COALESCE(p.total_paid, 0)
                        END
                    ), 0) AS paid_net_amount
                FROM invoices i
                LEFT JOIN (
                    SELECT invoice_id, SUM(amount) AS total_paid
                    FROM invoice_payments
                    GROUP BY invoice_id
                ) p ON p.invoice_id = i.id
                ${filter}
                GROUP BY strftime('%Y-%m', i.created_at)
                ORDER BY period DESC
            `,
            params
        );

        return res.json({ summary, by_month: byMonth });
    } catch (err) {
        console.error('GET /invoices/reports/financial error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/reports/financial/print', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    const year = Number.parseInt(req.query.year, 10);
    const month = Number.parseInt(req.query.month, 10);

    try {
        let filter = '';
        const params = [];
        let reportTitle = '\u062a\u0642\u0631\u064a\u0631 \u0645\u0627\u0644\u064a \u0634\u0627\u0645\u0644';

        if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
            filter = "WHERE strftime('%Y', i.created_at) = ? AND strftime('%m', i.created_at) = ?";
            params.push(String(year), String(month).padStart(2, '0'));
            reportTitle = `\u062a\u0642\u0631\u064a\u0631 \u0645\u0627\u0644\u064a - ${year}/${String(month).padStart(2, '0')}`;
        } else if (Number.isInteger(year)) {
            filter = "WHERE strftime('%Y', i.created_at) = ?";
            params.push(String(year));
            reportTitle = `\u062a\u0642\u0631\u064a\u0631 \u0645\u0627\u0644\u064a \u0633\u0646\u0648\u064a - ${year}`;
        }

        const summary = await dbGet(
            `
                SELECT
                    COUNT(*) AS invoices_count,
                    COALESCE(SUM(i.amount), 0) AS gross_amount,
                    COALESCE(SUM(i.commission), 0) AS total_commission,
                    COALESCE(SUM(i.amount + i.commission), 0) AS net_amount,
                    COALESCE(SUM(
                        CASE
                            WHEN COALESCE(p.total_paid, 0) > (i.amount + i.commission) THEN (i.amount + i.commission)
                            ELSE COALESCE(p.total_paid, 0)
                        END
                    ), 0) AS net_paid_amount
                FROM invoices i
                LEFT JOIN (
                    SELECT invoice_id, SUM(amount) AS total_paid
                    FROM invoice_payments
                    GROUP BY invoice_id
                ) p ON p.invoice_id = i.id
                ${filter}
            `,
            params
        );

        const byMonth = await dbAll(
            `
                SELECT
                    strftime('%Y-%m', i.created_at) AS period,
                    COUNT(*) AS invoices_count,
                    COALESCE(SUM(i.amount + i.commission), 0) AS net_amount,
                    COALESCE(SUM(
                        CASE
                            WHEN COALESCE(p.total_paid, 0) > (i.amount + i.commission) THEN (i.amount + i.commission)
                            ELSE COALESCE(p.total_paid, 0)
                        END
                    ), 0) AS paid_net_amount
                FROM invoices i
                LEFT JOIN (
                    SELECT invoice_id, SUM(amount) AS total_paid
                    FROM invoice_payments
                    GROUP BY invoice_id
                ) p ON p.invoice_id = i.id
                ${filter}
                GROUP BY strftime('%Y-%m', i.created_at)
                ORDER BY period DESC
            `,
            params
        );

        const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${reportTitle}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    @page { size: A4; margin: 14mm; }
    body { font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; color: #111; }
    h1 { margin: 0 0 8px 0; font-size: 22px; }
    .meta { color: #666; margin-bottom: 14px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #bbb; padding: 8px; text-align: right; font-size: 13px; }
    th { background: #f4f4f4; }
    .section { margin-top: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .card { border: 1px solid #bbb; padding: 8px; }
    .muted { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${reportTitle}</h1>
  <div class="meta">\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u0648\u0644\u064a\u062f: ${new Date().toLocaleString('ar-EG')}</div>

  <div class="section">
    <h3>\u0627\u0644\u0645\u0644\u062e\u0635</h3>
    <div class="grid">
      <div class="card"><strong>\u0639\u062f\u062f \u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631:</strong> ${Number(summary?.invoices_count || 0)}</div>
      <div class="card"><strong>\u0625\u062c\u0645\u0627\u0644\u064a \u0642\u0628\u0644 \u0627\u0644\u0639\u0645\u0648\u0644\u0629:</strong> ${Number(summary?.gross_amount || 0).toFixed(2)} \u062c.\u0645</div>
      <div class="card"><strong>\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0639\u0645\u0648\u0644\u0627\u062a:</strong> ${Number(summary?.total_commission || 0).toFixed(2)} \u062c.\u0645</div>
      <div class="card"><strong>\u0635\u0627\u0641\u064a \u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631:</strong> ${Number(summary?.net_amount || 0).toFixed(2)} \u062c.\u0645</div>
      <div class="card"><strong>\u0627\u0644\u0635\u0627\u0641\u064a \u0627\u0644\u0645\u062f\u0641\u0648\u0639:</strong> ${Number(summary?.net_paid_amount || 0).toFixed(2)} \u062c.\u0645</div>
      <div class="card"><strong>\u0627\u0644\u0645\u062a\u0628\u0642\u064a:</strong> ${(Number(summary?.net_amount || 0) - Number(summary?.net_paid_amount || 0)).toFixed(2)} \u062c.\u0645</div>
    </div>
  </div>

  <div class="section">
    <h3>\u062a\u0641\u0635\u064a\u0644 \u0627\u0644\u0641\u062a\u0631\u0627\u062a</h3>
    <table>
      <thead>
        <tr>
          <th>\u0627\u0644\u0641\u062a\u0631\u0629</th>
          <th>\u0639\u062f\u062f \u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631</th>
          <th>\u0635\u0627\u0641\u064a \u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631</th>
          <th>\u0627\u0644\u0635\u0627\u0641\u064a \u0627\u0644\u0645\u062f\u0641\u0648\u0639</th>
          <th>\u0627\u0644\u0645\u062a\u0628\u0642\u064a</th>
        </tr>
      </thead>
      <tbody>
        ${byMonth.map((r) => `
          <tr>
            <td>${r.period || '-'}</td>
            <td>${Number(r.invoices_count || 0)}</td>
            <td>${Number(r.net_amount || 0).toFixed(2)} \u062c.\u0645</td>
            <td>${Number(r.paid_net_amount || 0).toFixed(2)} \u062c.\u0645</td>
            <td>${(Number(r.net_amount || 0) - Number(r.paid_net_amount || 0)).toFixed(2)} \u062c.\u0645</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="muted">\u0647\u0630\u0627 \u0627\u0644\u062a\u0642\u0631\u064a\u0631 \u0645\u062e\u0635\u0635 \u0644\u0644\u0637\u0628\u0627\u0639\u0629 \u0643\u062c\u062f\u0627\u0648\u0644 \u0645\u062d\u0627\u0633\u0628\u064a\u0629.</div>
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('GET /invoices/reports/financial/print error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/payment-gateways', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    try {
        const gateways = await dbAll(
            'SELECT id, provider, enabled, updated_at FROM payment_gateway_configs ORDER BY provider ASC'
        );
        return res.json({ gateways });
    } catch (err) {
        console.error('GET /invoices/payment-gateways error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.put('/payment-gateways/:provider', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    const provider = String(req.params.provider || '').trim().toLowerCase();
    const enabled = req.body?.enabled ? 1 : 0;
    const config = req.body?.config || {};
    if (!provider) return res.status(400).json({ error: 'Ù…Ø²ÙˆØ¯ Ø§Ù„Ø¯ÙØ¹ Ù…Ø·Ù„ÙˆØ¨' });

    try {
        const existing = await dbGet('SELECT id FROM payment_gateway_configs WHERE provider = ?', [provider]);
        if (existing) {
            await dbRun(
                'UPDATE payment_gateway_configs SET enabled = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE provider = ?',
                [enabled, JSON.stringify(config), provider]
            );
        } else {
            await dbRun(
                'INSERT INTO payment_gateway_configs (provider, enabled, config_json) VALUES (?, ?, ?)',
                [provider, enabled, JSON.stringify(config)]
            );
        }
        return res.json({ message: 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ø¯ÙØ¹' });
    } catch (err) {
        console.error('PUT /invoices/payment-gateways/:provider error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/:id/payments', verifyToken, async (req, res) => {
    const invoiceId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(invoiceId)) return res.status(400).json({ error: 'Ù…Ø¹Ø±Ù Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± ØµØ§Ù„Ø­' });
    try {
        const invoice = await getInvoiceWithContext(invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });
        if (!canViewInvoice(req.user, invoice)) return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });

        const payments = await dbAll(
            `
                SELECT ip.*, u.username AS created_by_username
                FROM invoice_payments ip
                LEFT JOIN users u ON u.id = ip.created_by
                WHERE ip.invoice_id = ?
                ORDER BY ip.paid_at DESC, ip.id DESC
            `,
            [invoiceId]
        );
        const summary = await getInvoicePaymentsSummary(invoiceId);
        return res.json({ payments, summary });
    } catch (err) {
        console.error('GET /invoices/:id/payments error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.post('/:id/payments', verifyToken, async (req, res) => {
    const invoiceId = Number.parseInt(req.params.id, 10);
    const amount = Number(req.body?.amount);
    const paymentMethod = req.body?.payment_method || null;
    const reference = req.body?.reference || null;
    const note = req.body?.note || null;
    const paidAt = req.body?.paid_at || null;

    if (!Number.isInteger(invoiceId)) return res.status(400).json({ error: 'Ù…Ø¹Ø±Ù Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± ØµØ§Ù„Ø­' });
    if (!(amount > 0)) return res.status(400).json({ error: 'Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¯ÙØ¹Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±' });

    try {
        const invoice = await getInvoiceWithContext(invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });
        if (!(req.user.role === 'admin' || (req.user.role === 'warehouse' && invoice.warehouse_id === req.user.id))) {
            return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
        }
        if (invoice.status === 'cancelled') {
            return res.status(400).json({ error: 'Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ³Ø¬ÙŠÙ„ Ø¯ÙØ¹Ø© Ø¹Ù„Ù‰ ÙØ§ØªÙˆØ±Ø© Ù…Ù„ØºØ§Ø©' });
        }

        await dbRun(
            `
                INSERT INTO invoice_payments (invoice_id, amount, payment_method, reference, note, paid_at, created_by)
                VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
            `,
            [invoiceId, amount, paymentMethod, reference, note, paidAt, req.user.id]
        );

        await syncInvoiceStatusFromPayments(invoice);
        return res.json({ message: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø© Ø¨Ù†Ø¬Ø§Ø­' });
    } catch (err) {
        console.error('POST /invoices/:id/payments error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.get('/:id/pdf', verifyToken, async (req, res) => {
    const invoiceId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(invoiceId)) return res.status(400).json({ error: 'Ù…Ø¹Ø±Ù Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± ØµØ§Ù„Ø­' });
    try {
        const invoice = await getInvoiceWithContext(invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });
        if (!canViewInvoice(req.user, invoice)) return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });

        const { data: orderItemsData, error: orderItemsError } = await db.supabase
            .from('order_items')
            .select('id, order_id, product_id, quantity, price')
            .eq('order_id', invoice.order_id);
        if (orderItemsError) throw orderItemsError;

        const safeOrderItems = orderItemsData || [];
        const productIds = [...new Set(safeOrderItems.map((item) => item.product_id).filter(Boolean))];
        let productsMap = new Map();
        if (productIds.length) {
            const { data: products, error: productsError } = await db.supabase
                .from('products')
                .select('id, name')
                .in('id', productIds);
            if (productsError) throw productsError;
            productsMap = new Map((products || []).map((product) => [product.id, product.name]));
        }

        const orderItems = safeOrderItems.map((item) => ({
            ...item,
            product_name: productsMap.get(item.product_id) || null
        }));
        const paymentSummary = await getInvoicePaymentsSummary(invoiceId);
        const invoiceTotal = getInvoiceTargetAmount(invoice);
        const effectivePaid = Number(paymentSummary.total_paid || 0);
        const remaining = Math.max(0, invoiceTotal - effectivePaid);

        const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>\u0641\u0627\u062a\u0648\u0631\u0629 #${invoice.id}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
body{font-family:'Cairo','Tajawal','Segoe UI',Tahoma,Arial,sans-serif;margin:24px}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border:1px solid #ccc;padding:8px;text-align:right}
.muted{color:#666}
</style></head><body>
<h2>\u0641\u0627\u062a\u0648\u0631\u0629 #${invoice.id}</h2>
<div class="muted">\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0646\u0634\u0627\u0621: ${invoice.created_at}</div>
<p><strong>\u0627\u0644\u0637\u0644\u0628:</strong> #${invoice.order_id}</p>
<p><strong>\u0627\u0644\u0645\u062e\u0632\u0646:</strong> ${invoice.warehouse_name}</p>
<p><strong>\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629:</strong> ${invoice.pharmacy_name}</p>
<table><thead><tr><th>\u0627\u0644\u0645\u0646\u062a\u062c</th><th>\u0627\u0644\u0643\u0645\u064a\u0629</th><th>\u0627\u0644\u0633\u0639\u0631</th></tr></thead><tbody>
${orderItems.map((i) => `<tr><td>${i.product_name || `\u0645\u0646\u062a\u062c #${i.product_id}`}</td><td>${i.quantity}</td><td>${Number(i.price).toFixed(2)}</td></tr>`).join('')}
</tbody></table>
<p><strong>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0642\u0628\u0644 \u0627\u0644\u0639\u0645\u0648\u0644\u0629:</strong> ${Number(invoice.amount).toFixed(2)} \u062c.\u0645</p>
<p><strong>\u0627\u0644\u0639\u0645\u0648\u0644\u0629:</strong> ${Number(invoice.commission).toFixed(2)} \u062c.\u0645</p>
<p><strong>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0628\u0639\u062f \u0627\u0644\u0639\u0645\u0648\u0644\u0629:</strong> ${invoiceTotal.toFixed(2)} \u062c.\u0645</p>
<p><strong>\u0627\u0644\u0645\u062f\u0641\u0648\u0639:</strong> ${effectivePaid.toFixed(2)} \u062c.\u0645</p>
<p><strong>\u0627\u0644\u0645\u062a\u0628\u0642\u064a:</strong> ${remaining.toFixed(2)} \u062c.\u0645</p>
<script>window.onload=()=>window.print();</script>
</body></html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('GET /invoices/:id/pdf error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.post('/:id/email', verifyToken, async (req, res) => {
    const invoiceId = Number.parseInt(req.params.id, 10);
    const toEmail = String(req.body?.to || '').trim();
    if (!Number.isInteger(invoiceId)) return res.status(400).json({ error: 'Ù…Ø¹Ø±Ù Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± ØµØ§Ù„Ø­' });
    if (!toEmail) return res.status(400).json({ error: 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ Ù…Ø·Ù„ÙˆØ¨' });

    try {
        const invoice = await getInvoiceWithContext(invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });
        if (!(req.user.role === 'admin' || (req.user.role === 'warehouse' && invoice.warehouse_id === req.user.id))) {
            return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
        }

        // Email queue placeholder until SMTP provider integration.
        await createNotification({
            userId: req.user.id,
            type: 'email_queued',
            message: `تمت إضافة الفاتورة #${invoiceId} إلى قائمة الإرسال بالبريد إلى ${toEmail}`,
            relatedId: invoiceId
        });

        return res.json({ message: 'ØªÙ…Øª Ø¬Ø¯ÙˆÙ„Ø© Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ø§Ù„Ø¨Ø±ÙŠØ¯' });
    } catch (err) {
        console.error('POST /invoices/:id/email error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

router.put('/:id', verifyToken, async (req, res) => {
    const invoiceId = req.params.id;
    const { status, amount, commission, net_amount } = req.body;

    try {
        const invoice = await dbGet(
            `
                SELECT i.*, o.warehouse_id
                FROM invoices i
                JOIN orders o ON i.order_id = o.id
                WHERE i.id = ?
            `,
            [invoiceId]
        );

        if (!invoice) return res.status(404).json({ error: 'Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });
        if (req.user.role !== 'admin' && invoice.warehouse_id !== req.user.id) {
            return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­ Ø¨ØªØ¹Ø¯ÙŠÙ„ Ù‡Ø°Ù‡ Ø§Ù„ÙØ§ØªÙˆØ±Ø©' });
        }

        const updates = [];
        const values = [];

        if (status !== undefined) {
            if (!['pending', 'paid', 'cancelled'].includes(status)) {
                return res.status(400).json({ error: 'Ø­Ø§Ù„Ø© Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± ØµØ­ÙŠØ­Ø©' });
            }
            updates.push('status = ?');
            values.push(status);
            if (status === 'paid') {
                updates.push('paid_at = CURRENT_TIMESTAMP');
                updates.push('cancelled_at = NULL');
            } else if (status === 'cancelled') {
                updates.push('cancelled_at = CURRENT_TIMESTAMP');
                updates.push('paid_at = NULL');
            } else {
                updates.push('paid_at = NULL');
                updates.push('cancelled_at = NULL');
            }
        }

        if (amount !== undefined) {
            updates.push('amount = ?');
            values.push(amount);
        }
        if (commission !== undefined) {
            updates.push('commission = ?');
            values.push(commission);
        }
        if (amount !== undefined || commission !== undefined || net_amount !== undefined) {
            const nextAmount = amount !== undefined ? Number(amount) : Number(invoice.amount || 0);
            const nextCommission = commission !== undefined ? Number(commission) : Number(invoice.commission || 0);
            updates.push('net_amount = ?');
            values.push(nextAmount + nextCommission);
        }

        if (updates.length === 0) return res.status(400).json({ error: 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ù„ØªØ­Ø¯ÙŠØ«' });

        values.push(invoiceId);
        await dbRun(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`, values);
        return res.json({ message: 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ù†Ø¬Ø§Ø­' });
    } catch (err) {
        console.error('PUT /invoices/:id error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ ØªØ­Ø¯ÙŠØ« Ø§Ù„ÙØ§ØªÙˆØ±Ø©' });
    }
});

router.delete('/:id', verifyToken, async (req, res) => {
    const invoiceId = req.params.id;

    try {
        const invoice = await dbGet(
            `
                SELECT i.*, o.warehouse_id
                FROM invoices i
                JOIN orders o ON i.order_id = o.id
                WHERE i.id = ?
            `,
            [invoiceId]
        );

        if (!invoice) return res.status(404).json({ error: 'Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });
        if (req.user.role !== 'admin' && invoice.warehouse_id !== req.user.id) {
            return res.status(403).json({ error: 'ØºÙŠØ± Ù…ØµØ±Ø­ Ø¨Ø­Ø°Ù Ù‡Ø°Ù‡ Ø§Ù„ÙØ§ØªÙˆØ±Ø©' });
        }

        await dbRun('DELETE FROM invoice_payments WHERE invoice_id = ?', [invoiceId]);
        await dbRun('DELETE FROM invoices WHERE id = ?', [invoiceId]);
        return res.json({ message: 'ØªÙ… Ø­Ø°Ù Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ù†Ø¬Ø§Ø­' });
    } catch (err) {
        console.error('DELETE /invoices/:id error:', err.message);
        return res.status(500).json({ error: 'Ø®Ø·Ø£ ÙÙŠ Ø­Ø°Ù Ø§Ù„ÙØ§ØªÙˆØ±Ø©' });
    }
});

module.exports = router;





