require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Import routes
const authRoutes = require('../routes/auth');
const productRoutes = require('../routes/products');
const orderRoutes = require('../routes/orders');
const invoiceRoutes = require('../routes/invoices');
const ratingRoutes = require('../routes/ratings');
const notificationRoutes = require('../routes/notifications');
const wishlistRoutes = require('../routes/wishlist');

// Initialize database
const db = require('../database/db');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wishlist', wishlistRoutes);

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: '╪н╪м┘Е ╪з┘Д╪╡┘И╪▒╪й ┘Г╪и┘К╪▒ ╪м╪п╪з┘Л. ╪з┘Д╪н╪п ╪з┘Д╪г┘В╪╡┘Й 2MB' });
    }
    if (err && (err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError')) {
        return res.status(413).json({ error: '═╠у ╟сус▌ ▀╚э╤ ╠╧╟Ё. ╟с═╧ ╟с├▐╒ь 10MB' });
    }

    console.error('Server Error:', err.stack);
    res.status(500).json({ error: '╪н╪п╪л ╪о╪╖╪г ┘Б┘К ╪з┘Д╪о╪з╪п┘Е' });
});

// Export for Vercel serverless
module.exports = app;
