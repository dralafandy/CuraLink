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
    helmetConfig, 
    corsOptions,
    sanitizeRequest 
} = require('./middleware/security');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const invoiceRoutes = require('./routes/invoices');
const ratingRoutes = require('./routes/ratings');
const notificationRoutes = require('./routes/notifications');
const wishlistRoutes = require('./routes/wishlist');

// Import new routes
const analyticsRoutes = require('./routes/analytics');
const messagesRoutes = require('./routes/messages');
const paymentsRoutes = require('./routes/payments');
const inventoryRoutes = require('./routes/inventory');

// Import advanced B2B routes
const locationsRoutes = require('./routes/locations');
const contractsRoutes = require('./routes/contracts');
const subscriptionsRoutes = require('./routes/subscriptions');
const tendersRoutes = require('./routes/tenders');
const loyaltyRoutes = require('./routes/loyalty');

// Initialize Supabase client
require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmetConfig);
app.use(cors(corsOptions));
app.use(sanitizeRequest);

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/products/import', uploadLimiter);

// Serve login.html for /login route (must be BEFORE static files)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve static files (Express sets correct MIME types automatically)
app.use(express.static(path.join(__dirname, 'public')));

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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
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
            inventory: '/api/inventory'
        }
    });
});

// 404 handler for API routes
app.use('/api/*', notFoundHandler);

// Serve main HTML file for all other routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log(`====================================`);
    console.log(`   CuraLink Server v2.0 Running`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`====================================`);
    console.log(``);
    console.log(`New Features in v2.0:`);
    console.log(`  ✓ Enhanced Security (Rate limiting, Helmet)`);
    console.log(`  ✓ Analytics & Reporting`);
    console.log(`  ✓ In-app Messaging`);
    console.log(`  ✓ Payment Management`);
    console.log(`  ✓ Inventory Tracking`);
    console.log(`  ✓ Audit Logging`);
    console.log(``);
    console.log(`Default Accounts:`);
    console.log(`  Admin: admin@curalink.com / admin123`);
    console.log(`  Warehouse: warehouse1@test.com / warehouse123`);
    console.log(`  Pharmacy: pharmacy1@test.com / pharmacy123`);
});

module.exports = app;