const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Rate limiting configurations
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة لاحقاً'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    skipSuccessfulRequests: true,
    message: {
        error: 'تم تجاوز عدد محاولات تسجيل الدخول. يرجى المحاولة لاحقاً'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 uploads per hour
    message: {
        error: 'تم تجاوز الحد الأقصى لرفع الملفات. يرجى المحاولة لاحقاً'
    },
});

// Helmet security headers
const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "https://*.tile.openstreetmap.org", "https://openstreetmap.org"],
            connectSrc: ["'self'", "https://*.supabase.co", "https://unpkg.com", "https://nominatim.openstreetmap.org"],
        },
    },
    crossOriginEmbedderPolicy: false,
});

// CORS configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
    // Sanitize query parameters
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].trim();
            }
        });
    }

    // Sanitize body
    if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        });
    }

    next();
};

// Audit logging middleware
const auditLog = (action) => {
    return (req, res, next) => {
        const originalSend = res.send;
        
        res.send = function(data) {
            // Log after response is sent
            const logEntry = {
                timestamp: new Date().toISOString(),
                action,
                userId: req.user?.id,
                role: req.user?.role,
                ip: req.ip,
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                userAgent: req.get('user-agent')
            };
            
            // Save to audit log (async, don't wait)
            const db = require('../database/db');
            db.run(
                `INSERT INTO audit_logs (user_id, action, details, ip_address, created_at) 
                 VALUES (?, ?, ?, ?, ?)`,
                [logEntry.userId, logEntry.action, JSON.stringify(logEntry), logEntry.ip, logEntry.timestamp]
            ).catch(err => console.error('Audit log error:', err));
            
            originalSend.call(this, data);
        };
        
        next();
    };
};

module.exports = {
    apiLimiter,
    authLimiter,
    uploadLimiter,
    helmetConfig,
    corsOptions,
    sanitizeRequest,
    auditLog
};