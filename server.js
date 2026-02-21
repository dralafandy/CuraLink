require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const invoiceRoutes = require('./routes/invoices');
const ratingRoutes = require('./routes/ratings');
const notificationRoutes = require('./routes/notifications');
const wishlistRoutes = require('./routes/wishlist');

// Initialize Supabase client
require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

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

// Serve main HTML file for all other routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Ø­Ø¬Ù… Ø§Ù„ØµÙˆØ±Ø© ÙƒØ¨ÙŠØ± Ø¬Ø¯Ø§Ù‹. Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰ 2MB' });
    }
    if (err && (err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError')) {
        return res.status(413).json({ error: 'ÍÌã ÇáãáÝ ßÈíÑ ÌÏÇð. ÇáÍÏ ÇáÃÞÕì 10MB' });
    }

    console.error(err.stack);
    res.status(500).json({ error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
});

// Start server
app.listen(PORT, () => {
    console.log(`====================================`);
    console.log(`   CuraLink Server Running`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`====================================`);
    console.log(``);
    console.log(`Default Accounts:`);
    console.log(`  Admin: admin@curalink.com / admin123`);
    console.log(`  Warehouse: warehouse1@test.com / warehouse123`);
    console.log(`  Pharmacy: pharmacy1@test.com / pharmacy123`);
});

module.exports = app;

