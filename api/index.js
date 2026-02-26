require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const morgan = require('morgan');

// Import security middleware
const { 
    apiLimiter, 
    authLimiter, 
    uploadLimiter, 
    sanitizeRequest 
} = require('../middleware/security');
const { errorHandler, notFoundHandler } = require('../middleware/errorHandler');

// Import routes
const authRoutes = require('../routes/auth');
const productRoutes = require('../routes/products');
const orderRoutes = require('../routes/orders');
const invoiceRoutes = require('../routes/invoices');
const ratingRoutes = require('../routes/ratings');
const notificationRoutes = require('../routes/notifications');
const wishlistRoutes = require('../routes/wishlist');

// Import new routes
const analyticsRoutes = require('../routes/analytics');
const messagesRoutes = require('../routes/messages');
const paymentsRoutes = require('../routes/payments');
const inventoryRoutes = require('../routes/inventory');

// Import advanced B2B routes
const locationsRoutes = require('../routes/locations');
const contractsRoutes = require('../routes/contracts');
const subscriptionsRoutes = require('../routes/subscriptions');
const tendersRoutes = require('../routes/tenders');
const loyaltyRoutes = require('../routes/loyalty');

// Initialize Supabase client (this loads database configuration)
require('../database/db');

const app = express();

// Security middleware
app.use(cors());
app.use(sanitizeRequest);

// Request logging (minimal for serverless)
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Body parsing middleware
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiting (optional for serverless, can be configured)
if (apiLimiter) {
    app.use('/api/', apiLimiter);
}
if (authLimiter) {
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wishlist', wishlistRoutes);

// New API Routes
app.use('/api/analytics', analyticsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/inventory', inventoryRoutes);

// Advanced B2B Routes
app.use('/api/locations', locationsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/tenders', tendersRoutes);
app.use('/api/loyalty', loyaltyRoutes);

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Seed endpoint for creating test users (development only)
app.post('/api/seed', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Seed not available in production' });
    }
    
    const bcrypt = require('bcryptjs');
    const db = require('../database/db');
    
    try {
        const testUsers = [
            { username: 'login', email: 'login@test.com', password: '345', role: 'pharmacy', phone: '01000000000', address: 'Test Address' },
            { username: 'admin', email: 'admin@curalink.com', password: 'admin123', role: 'admin', phone: '0123456789', address: 'Cairo' },
            { username: 'warehouse1', email: 'warehouse1@test.com', password: 'warehouse123', role: 'warehouse', phone: '01000000001', address: 'Cairo', zone: 'القاهرة الكبرى' },
            { username: 'pharmacy1', email: 'pharmacy1@test.com', password: 'pharmacy123', role: 'pharmacy', phone: '01100000001', address: 'New Cairo' }
        ];
        
        const results = [];
        
        for (const user of testUsers) {
            // Check if user exists
            const existing = await db.get('SELECT id FROM users WHERE email = ? OR username = ?', [user.email, user.username]);
            
            if (existing) {
                results.push({ username: user.username, status: 'already exists' });
                continue;
            }
            
            const hashedPassword = bcrypt.hashSync(user.password, 10);
            
            await db.run(
                'INSERT INTO users (username, email, password, phone, address, role, zone) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user.username, user.email, hashedPassword, user.phone, user.address, user.role, user.zone || null]
            );
            
            results.push({ username: user.username, status: 'created' });
        }
        
        res.json({ message: 'Seed completed', results });
    } catch (err) {
        console.error('Seed error:', err);
        res.status(500).json({ error: 'Seed failed: ' + err.message });
    }
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'CuraLink API',
        version: '2.0.0',
        description: 'Pharmaceutical Intermediary System API',
        endpoints: {
            auth: '/api/auth',
            products: '/api/products',
            orders: '/api/orders',
            invoices: '/api/invoices',
            ratings: '/api/ratings',
            notifications: '/api/notifications',
            wishlist: '/api/wishlist',
            analytics: '/api/analytics',
            messages: '/api/messages',
            payments: '/api/payments',
            inventory: '/api/inventory',
            locations: '/api/locations',
            contracts: '/api/contracts',
            subscriptions: '/api/subscriptions',
            tenders: '/api/tenders',
            loyalty: '/api/loyalty'
        }
    });
});

// 404 handler for API routes
app.use('/api/*', notFoundHandler);

// Global error handling middleware
app.use(errorHandler);

// Export for Vercel serverless
module.exports = app;
