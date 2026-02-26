const winston = require('winston');

// Configure Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'curalink-api' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Custom error classes
class AppError extends Error {
    constructor(message, statusCode, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, details = []) {
        super(message, 400, 'VALIDATION_ERROR');
        this.details = details;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'غير مصرح') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'غير مصرح لك') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

class NotFoundError extends AppError {
    constructor(resource = 'المورد') {
        super(`${resource} غير موجود`, 404, 'NOT_FOUND');
    }
}

class ConflictError extends AppError {
    constructor(message = 'تعارض في البيانات') {
        super(message, 409, 'CONFLICT');
    }
}

class RateLimitError extends AppError {
    constructor(message = 'تم تجاوز الحد الأقصى للطلبات') {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
}

// Error response mapping
const errorResponses = {
    'VALIDATION_ERROR': { status: 400, message: 'بيانات غير صالحة' },
    'AUTHENTICATION_ERROR': { status: 401, message: 'غير مصرح' },
    'AUTHORIZATION_ERROR': { status: 403, message: 'غير مصرح لك' },
    'NOT_FOUND': { status: 404, message: 'غير موجود' },
    'CONFLICT': { status: 409, message: 'تعارض في البيانات' },
    'RATE_LIMIT_EXCEEDED': { status: 429, message: 'تم تجاوز الحد الأقصى للطلبات' },
    'DB_CONFIG_MISSING': { status: 500, message: 'إعدادات قاعدة البيانات غير مكتملة' },
    'DB_PERMISSION_DENIED': { status: 500, message: 'الخادم غير مصرح له بالوصول إلى البيانات' },
    'LOGIN_FAILED': { status: 500, message: 'فشل تسجيل الدخول' },
    'FETCH_ERROR': { status: 500, message: 'خطأ في جلب البيانات' },
    'INSERT_ERROR': { status: 500, message: 'خطأ في إضافة البيانات' },
    'DELETE_ERROR': { status: 500, message: 'خطأ في حذف البيانات' },
    'UPDATE_ERROR': { status: 500, message: 'خطأ في تحديث البيانات' },
};

// Main error handling middleware
function errorHandler(err, req, res, next) {
    // Log the error
    logger.error({
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode || 500,
        code: err.code,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id,
        body: req.body ? JSON.stringify(req.body).substring(0, 1000) : null
    });

    // Handle specific error types
    if (err instanceof AppError) {
        const response = {
            error: err.message,
            code: err.code
        };

        if (err.details) {
            response.details = err.details;
        }

        return res.status(err.statusCode).json(response);
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'رمز غير صالح',
            code: 'INVALID_TOKEN'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'انتهت صلاحية الرمز',
            code: 'TOKEN_EXPIRED'
        });
    }

    // Handle multer errors
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: 'حجم الملف كبير جداً',
                code: 'FILE_TOO_LARGE'
            });
        }
        return res.status(400).json({
            error: 'خطأ في رفع الملف',
            code: 'UPLOAD_ERROR'
        });
    }

    // Handle Supabase/Postgres errors
    if (err.code === '42501') {
        return res.status(500).json({
            error: 'الخادم غير مصرح له بالوصول إلى البيانات',
            code: 'DB_PERMISSION_DENIED'
        });
    }

    if (err.code === '23505') {
        return res.status(409).json({
            error: 'البيانات موجودة مسبقاً',
            code: 'DUPLICATE_ENTRY'
        });
    }

    if (err.code === '23503') {
        return res.status(400).json({
            error: 'المرجع غير موجود',
            code: 'FOREIGN_KEY_VIOLATION'
        });
    }

    // Handle entity too large
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'حجم البيانات كبير جداً',
            code: 'PAYLOAD_TOO_LARGE'
        });
    }

    // Default error response
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const response = {
        error: isDevelopment ? err.message : 'حدث خطأ في الخادم',
        code: 'INTERNAL_ERROR'
    };

    if (isDevelopment) {
        response.stack = err.stack;
    }

    res.status(500).json(response);
}

// 404 handler
function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'المسار غير موجود',
        code: 'ROUTE_NOT_FOUND',
        path: req.path
    });
}

// Async handler wrapper
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    logger,
    errorHandler,
    notFoundHandler,
    asyncHandler,
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError
};