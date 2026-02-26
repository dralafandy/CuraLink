const Joi = require('joi');

// Custom error messages in Arabic
const messages = {
    'string.base': 'يجب أن يكون النص صالحاً',
    'string.empty': 'هذا الحقل مطلوب',
    'string.min': 'يجب أن يكون على الأقل {#limit} أحرف',
    'string.max': 'يجب أن لا يتجاوز {#limit} حرف',
    'string.email': 'يرجى إدخال بريد إلكتروني صالح',
    'number.base': 'يجب أن يكون رقماً صالحاً',
    'number.min': 'يجب أن يكون على الأقل {#limit}',
    'number.max': 'يجب أن لا يتجاوز {#limit}',
    'any.required': 'هذا الحقل مطلوب',
    'array.base': 'يجب أن يكون مصفوفة',
    'array.min': 'يجب أن يحتوي على {#limit} عنصر على الأقل',
    'date.base': 'يجب أن يكون تاريخاً صالحاً'
};

// Auth schemas
const authSchemas = {
    register: Joi.object({
        username: Joi.string().min(3).max(50).required().messages(messages),
        email: Joi.string().email().required().messages(messages),
        password: Joi.string().min(6).max(100).required().messages(messages),
        phone: Joi.string().allow('').max(20).optional(),
        address: Joi.string().allow('').max(500).optional(),
        role: Joi.string().valid('warehouse', 'pharmacy').required().messages(messages)
    }),

    login: Joi.object({
        email: Joi.string().email().required().messages(messages),
        password: Joi.string().required().messages(messages)
    }),

    updateProfile: Joi.object({
        phone: Joi.string().allow('').max(20).optional(),
        address: Joi.string().allow('').max(500).optional()
    })
};

// Product schemas
const productSchemas = {
    create: Joi.object({
        name: Joi.string().min(1).max(200).required().messages(messages),
        description: Joi.string().allow('').max(1000).optional(),
        category: Joi.string().allow('').max(100).optional(),
        active_ingredient: Joi.string().allow('').max(200).optional(),
        price: Joi.number().min(0).max(1000000).required().messages(messages),
        quantity: Joi.number().integer().min(0).max(1000000).required().messages(messages),
        discount_percent: Joi.number().min(0).max(100).default(0),
        bonus_buy_quantity: Joi.number().integer().min(0).default(0),
        bonus_free_quantity: Joi.number().integer().min(0).default(0),
        offer_note: Joi.string().allow('').max(500).optional(),
        expiry_date: Joi.date().optional(),
        product_code: Joi.string().allow('').max(50).optional()
    }),

    update: Joi.object({
        name: Joi.string().min(1).max(200).optional(),
        description: Joi.string().allow('').max(1000).optional(),
        category: Joi.string().allow('').max(100).optional(),
        active_ingredient: Joi.string().allow('').max(200).optional(),
        price: Joi.number().min(0).max(1000000).optional(),
        quantity: Joi.number().integer().min(0).max(1000000).optional(),
        discount_percent: Joi.number().min(0).max(100).optional(),
        bonus_buy_quantity: Joi.number().integer().min(0).optional(),
        bonus_free_quantity: Joi.number().integer().min(0).optional(),
        offer_note: Joi.string().allow('').max(500).optional(),
        expiry_date: Joi.date().optional(),
        product_code: Joi.string().allow('').max(50).optional()
    }),

    bulkImport: Joi.object({
        products: Joi.array().items(Joi.object({
            name: Joi.string().required(),
            price: Joi.number().required(),
            quantity: Joi.number().integer().required()
        })).min(1).required()
    })
};

// Order schemas
const orderSchemas = {
    create: Joi.object({
        warehouse_id: Joi.number().integer().required().messages(messages),
        items: Joi.array().items(Joi.object({
            product_id: Joi.number().integer().required(),
            quantity: Joi.number().integer().min(1).required()
        })).min(1).required().messages(messages),
        notes: Joi.string().allow('').max(1000).optional(),
        delivery_date: Joi.date().optional()
    }),

    updateStatus: Joi.object({
        status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered', 'cancelled').required(),
        notes: Joi.string().allow('').max(1000).optional()
    }),

    cancel: Joi.object({
        reason: Joi.string().required().messages(messages)
    })
};

// Rating schemas
const ratingSchemas = {
    create: Joi.object({
        warehouse_id: Joi.number().integer().required().messages(messages),
        order_id: Joi.number().integer().required().messages(messages),
        rating: Joi.number().integer().min(1).max(5).required().messages(messages),
        comment: Joi.string().allow('').max(1000).optional()
    })
};

// Validation middleware factory
function validate(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return res.status(400).json({
                error: 'بيانات غير صالحة',
                details: errors
            });
        }

        // Replace req.body with validated value
        req.body = value;
        next();
    };
}

// Query validation middleware
function validateQuery(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return res.status(400).json({
                error: 'معاملات الاستعلام غير صالحة',
                details: errors
            });
        }

        req.query = value;
        next();
    };
}

module.exports = {
    validate,
    validateQuery,
    schemas: {
        auth: authSchemas,
        product: productSchemas,
        order: orderSchemas,
        rating: ratingSchemas
    }
};