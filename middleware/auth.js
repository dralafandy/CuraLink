const jwt = require('jsonwebtoken');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';

// Main authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            error: 'غير مصرح',
            code: 'NO_TOKEN'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'انتهت صلاحية الجلسة',
                code: 'TOKEN_EXPIRED'
            });
        }
        return res.status(401).json({
            error: 'رمز غير صالح',
            code: 'INVALID_TOKEN'
        });
    }
}

// Role-based authorization middleware
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'غير مصرح',
                code: 'NOT_AUTHENTICATED'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'غير مصرح لك بالوصول',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
}

// Ownership check middleware (for resources)
function requireOwnership(getResourceOwnerId) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'غير مصرح',
                code: 'NOT_AUTHENTICATED'
            });
        }

        // Admin can access everything
        if (req.user.role === 'admin') {
            return next();
        }

        try {
            const ownerId = await getResourceOwnerId(req);
            
            if (ownerId !== req.user.id) {
                return res.status(403).json({
                    error: 'غير مصرح لك بالوصول لهذا المورد',
                    code: 'NOT_OWNER'
                });
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

// Optional authentication (for public routes with user context)
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch {
            // Invalid token, continue without user
        }
    }

    next();
}

// Session validation middleware
function validateSession(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: 'غير مصرح',
            code: 'NO_SESSION'
        });
    }

    // Check if session is still valid (can add session store check here)
    next();
}

// Permission check helper
function hasPermission(user, permission) {
    const permissions = {
        admin: ['*'],
        warehouse: [
            'products.read', 'products.create', 'products.update', 'products.delete',
            'orders.read', 'orders.update',
            'invoices.read',
            'notifications.read',
            'ratings.read'
        ],
        pharmacy: [
            'products.read',
            'orders.read', 'orders.create',
            'invoices.read',
            'notifications.read',
            'ratings.create', 'ratings.read',
            'wishlist.read', 'wishlist.create', 'wishlist.delete'
        ]
    };

    const userPermissions = permissions[user.role] || [];
    return userPermissions.includes('*') || userPermissions.includes(permission);
}

// Export all middleware
module.exports = {
    authenticateToken,
    requireRole,
    requireOwnership,
    optionalAuth,
    validateSession,
    hasPermission,
    JWT_SECRET
};