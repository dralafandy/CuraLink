const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { createNotification } = require('../services/notification-service');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads/products');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuration
const CONFIG = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    LOW_STOCK_THRESHOLD: 10,
    MAX_NAME_LENGTH: 200,
    MAX_ACTIVE_INGREDIENT_LENGTH: 200,
    MAX_DESCRIPTION_LENGTH: 1000,
    MAX_PRICE: 1000000,
    MAX_QUANTITY: 1000000
};

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        if (allowedTypes.includes(file.mimetype) || 
            file.originalname.endsWith('.xlsx') || 
            file.originalname.endsWith('.xls') ||
            file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مسموح به. يرجى رفع ملف Excel أو CSV'), false);
        }
    }
});

// Map Arabic/English column names to product fields
const COLUMN_MAPPING = {
    'name': 'name',
    'الاسم': 'name',
    'اسم المنتج': 'name',
    'الصنف': 'name',
    'description': 'description',
    'الوصف': 'description',
    'category': 'category',
    'الفئة': 'category',
    'التصنيف': 'category',
    'active_ingredient': 'active_ingredient',
    'المادة الفعالة': 'active_ingredient',
    'price': 'price',
    'السعر': 'price',
    'سعر ج': 'price',
    'سعرج': 'price',
    'quantity': 'quantity',
    'الكمية': 'quantity',
    'العدد': 'quantity',
    'discount_percent': 'discount_percent',
    'نسبة الخصم': 'discount_percent',
    'الخصم': 'discount_percent',
    'خصم': 'discount_percent',
    'bonus_buy_quantity': 'bonus_buy_quantity',
    'كمية الشراء للبونص': 'bonus_buy_quantity',
    'bonus_free_quantity': 'bonus_free_quantity',
    'كمية البونص المجانية': 'bonus_free_quantity',
    'offer_note': 'offer_note',
    'ملاحظة العرض': 'offer_note',
    'ملاحظة': 'offer_note',
    'expiry_date': 'expiry_date',
    'تاريخ الانتهاء': 'expiry_date',
    'تاريخ الانتهاء ': 'expiry_date',
    'الكود': 'product_code',
    'code': 'product_code',
    'prod_name': 'name',
    'price_1': 'price',
    'discount_a': 'discount_percent',
    'prod_id': 'product_code',
    'prod_code': 'product_code',
    'qty': 'quantity',
    'quantity_1': 'quantity'
};

function normalizeHeaderName(header) {
    return decodePotentialArabicMojibake(header)
        .replace(/\uFEFF/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function decodePotentialArabicMojibake(value) {
    const original = String(value || '').trim();
    if (!original) return original;

    // Keep already-correct Arabic text unchanged.
    if (/[\u0600-\u06FF]/.test(original)) {
        return original;
    }

    // Many legacy .xls Arabic files arrive as mojibake in Latin-1 range.
    if (!/[À-ÿ]/.test(original)) {
        return original;
    }

    try {
        const decoded = iconv.decode(Buffer.from(original, 'latin1'), 'windows-1256').trim();
        return /[\u0600-\u06FF]/.test(decoded) ? decoded : original;
    } catch {
        return original;
    }
}

function mapHeaderToField(header) {
    const decodedHeader = decodePotentialArabicMojibake(header);
    const normalizedHeader = normalizeHeaderName(decodedHeader);
    return COLUMN_MAPPING[header] || COLUMN_MAPPING[decodedHeader] || COLUMN_MAPPING[normalizedHeader] || decodedHeader;
}

function detectHeaderRowIndex(rows = []) {
    const maxRowsToScan = Math.min(rows.length, 25);
    let best = { index: 0, score: -1 };
    const expected = new Set(['name', 'price', 'quantity', 'discount_percent', 'product_code']);

    for (let i = 0; i < maxRowsToScan; i++) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        if (!row.length) continue;

        const mapped = row.map(mapHeaderToField);
        const score = mapped.reduce((acc, key) => acc + (expected.has(key) ? 1 : 0), 0);

        if (score > best.score) {
            best = { index: i, score };
        }
    }

    return best.score > 0 ? best.index : 0;
}

function buildFallbackRowFromLegacySheet(row = []) {
    // Common legacy .xls structure:
    // [.., price(5), code(6), .., quantity(8), name(9)]
    const name = decodePotentialArabicMojibake(row[9]);
    const price = Number.parseFloat(row[5]);
    const quantity = Number.parseFloat(row[8]);
    const productCode = row[6];

    if (!name || !Number.isFinite(price)) {
        return null;
    }

    const out = {
        name: String(name).trim(),
        price
    };

    if (Number.isFinite(quantity)) {
        out.quantity = quantity;
    }
    if (productCode !== undefined && productCode !== null && String(productCode).trim() !== '') {
        out.product_code = productCode;
    }

    return out;
}

// Function to normalize row data from Excel
function normalizeRowData(row) {
    const normalized = {};
    
    for (const [excelCol, value] of Object.entries(row)) {
        const normalizedHeader = normalizeHeaderName(excelCol);
        const fieldName =
            COLUMN_MAPPING[excelCol] ||
            COLUMN_MAPPING[excelCol.trim?.() || excelCol] ||
            COLUMN_MAPPING[normalizedHeader];
        if (fieldName && value !== undefined && value !== null && value !== '') {
            // Convert value based on field type
            if (['price', 'quantity', 'discount_percent', 'bonus_buy_quantity', 'bonus_free_quantity'].includes(fieldName)) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    normalized[fieldName] = numValue;
                }
            } else if (fieldName === 'expiry_date') {
                // Handle different date formats
                if (value instanceof Date) {
                    normalized[fieldName] = value.toISOString().split('T')[0];
                } else if (typeof value === 'number') {
                    const parsedDate = XLSX.SSF.parse_date_code(value);
                    if (parsedDate && parsedDate.y && parsedDate.m && parsedDate.d) {
                        normalized[fieldName] = `${parsedDate.y.toString().padStart(4, '0')}-${String(parsedDate.m).padStart(2, '0')}-${String(parsedDate.d).padStart(2, '0')}`;
                    }
                } else if (typeof value === 'string') {
                    // Try to parse date string
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        normalized[fieldName] = date.toISOString().split('T')[0];
                    }
                }
            } else {
                normalized[fieldName] = decodePotentialArabicMojibake(value);
            }
        }
    }
    
    return normalized;
}

// Middleware to verify token
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح', code: 'NO_TOKEN' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'رمز غير صالح', code: 'INVALID_TOKEN' });
    }
}

// Validation helper functions
function validateProductInput(data, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
            errors.push('اسم المنتج مطلوب');
        }
        if (data.name && data.name.length > CONFIG.MAX_NAME_LENGTH) {
            errors.push(`اسم المنتج طويل جداً (الحد الأقصى ${CONFIG.MAX_NAME_LENGTH} حرف)`);
        }
        if (typeof data.price !== 'number' || data.price <= 0) {
            errors.push('السعر يجب أن يكون رقماً موجباً');
        }
        if (data.price > CONFIG.MAX_PRICE) {
            errors.push(`السعر كبير جداً (الحد الأقصى ${CONFIG.MAX_PRICE}`);
        }
        if (typeof data.quantity !== 'number' || data.quantity < 0) {
            errors.push('الكمية يجب أن تكون رقماً صحيحاً');
        }
        if (data.quantity > CONFIG.MAX_QUANTITY) {
            errors.push(`الكمية كبيرة جداً (الحد الأقصى ${CONFIG.MAX_QUANTITY})`);
        }
    }
    
    if (data.name && data.name.length > CONFIG.MAX_NAME_LENGTH) {
        errors.push(`اسم المنتج طويل جداً (الحد الأقصى ${CONFIG.MAX_NAME_LENGTH} حرف)`);
    }
    if (data.description && data.description.length > CONFIG.MAX_DESCRIPTION_LENGTH) {
        errors.push(`الوصف طويل جداً (الحد الأقصى ${CONFIG.MAX_DESCRIPTION_LENGTH} حرف)`);
    }
    if (data.active_ingredient !== undefined && data.active_ingredient !== null && typeof data.active_ingredient !== 'string') {
        errors.push('المادة الفعالة يجب أن تكون نصاً');
    }
    if (typeof data.active_ingredient === 'string' && data.active_ingredient.length > CONFIG.MAX_ACTIVE_INGREDIENT_LENGTH) {
        errors.push(`المادة الفعالة طويلة جداً (الحد الأقصى ${CONFIG.MAX_ACTIVE_INGREDIENT_LENGTH} حرف)`);
    }
    if (data.price !== undefined && (typeof data.price !== 'number' || data.price <= 0 || data.price > CONFIG.MAX_PRICE)) {
        errors.push('السعر يجب أن يكون رقماً موجباً');
    }
    if (data.quantity !== undefined && (typeof data.quantity !== 'number' || data.quantity < 0 || data.quantity > CONFIG.MAX_QUANTITY)) {
        errors.push('الكمية يجب أن تكون رقماً صحيحاً غير سالب');
    }
    if (data.expiry_date && !isValidDate(data.expiry_date)) {
        errors.push('تاريخ انتهاء غير صالح');
    }
    errors.push(...validateOfferFields(data));
    
    return errors;
}

function isValidDate(dateString) {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

function isExpired(dateString) {
    const expiryDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiryDate < today;
}

function normalizeOfferFields(data = {}) {
    return {
        discount_percent: data.discount_percent !== undefined ? Number(data.discount_percent) : undefined,
        bonus_buy_quantity: data.bonus_buy_quantity !== undefined ? Number(data.bonus_buy_quantity) : undefined,
        bonus_free_quantity: data.bonus_free_quantity !== undefined ? Number(data.bonus_free_quantity) : undefined
    };
}

function validateOfferFields(data) {
    const errors = [];
    const discount = data.discount_percent;
    const bonusBuy = data.bonus_buy_quantity;
    const bonusFree = data.bonus_free_quantity;

    if (discount !== undefined && (!Number.isFinite(discount) || discount < 0 || discount > 100)) {
        errors.push('الخصم يجب أن يكون بين 0 و 100');
    }

    if (bonusBuy !== undefined && (!Number.isInteger(bonusBuy) || bonusBuy < 0)) {
        errors.push('كمية الشراء للبونص يجب أن تكون رقماً صحيحاً غير سالب');
    }

    if (bonusFree !== undefined && (!Number.isInteger(bonusFree) || bonusFree < 0)) {
        errors.push('كمية البونص يجب أن تكون رقماً صحيحاً غير سالب');
    }

    const hasBonusBuy = Number.isInteger(bonusBuy) && bonusBuy > 0;
    const hasBonusFree = Number.isInteger(bonusFree) && bonusFree > 0;
    if (hasBonusBuy !== hasBonusFree) {
        errors.push('يجب إدخال كميتي البونص معاً');
    }

    return errors;
}

function calculateOfferMetrics(product) {
    const basePrice = Number(product.price) || 0;
    const discountPercent = Math.max(0, Math.min(100, Number(product.discount_percent) || 0));
    const discountedUnitPrice = basePrice * (1 - discountPercent / 100);
    const bonusBuy = Math.max(0, Number(product.bonus_buy_quantity) || 0);
    const bonusFree = Math.max(0, Number(product.bonus_free_quantity) || 0);
    const hasBonus = bonusBuy > 0 && bonusFree > 0;

    let effectiveUnitPrice = discountedUnitPrice;
    let totalSavingsPercent = discountPercent;

    if (hasBonus) {
        const bonusGroup = bonusBuy + bonusFree;
        effectiveUnitPrice = (discountedUnitPrice * bonusBuy) / bonusGroup;
        totalSavingsPercent = (1 - (effectiveUnitPrice / Math.max(basePrice, 0.000001))) * 100;
    }

    return {
        ...product,
        discount_percent: discountPercent,
        bonus_buy_quantity: bonusBuy,
        bonus_free_quantity: bonusFree,
        discounted_unit_price: Number(discountedUnitPrice.toFixed(4)),
        effective_unit_price: Number(effectiveUnitPrice.toFixed(4)),
        offer_savings_percent: Number(Math.max(0, totalSavingsPercent).toFixed(2)),
        has_offer: discountPercent > 0 || hasBonus
    };
}

function hasActiveOffer(product) {
    const discountPercent = Number(product.discount_percent) || 0;
    const bonusBuy = Number(product.bonus_buy_quantity) || 0;
    const bonusFree = Number(product.bonus_free_quantity) || 0;
    return discountPercent > 0 || (bonusBuy > 0 && bonusFree > 0);
}

function notifyWishlistUsersAboutProductUpdate({
    productId,
    productName,
    oldPrice,
    newPrice,
    offerAdded
}) {
    const priceChanged = Number(oldPrice) !== Number(newPrice);
    if (!priceChanged && !offerAdded) return;

    db.all(
        `
            SELECT DISTINCT w.pharmacy_id AS user_id
            FROM wishlist w
            JOIN users u ON u.id = w.pharmacy_id
            WHERE w.product_id = ? AND u.role = 'pharmacy'
        `,
        [productId],
        (wishlistErr, rows) => {
            if (wishlistErr || !rows?.length) return;

            rows.forEach((row) => {
                if (priceChanged) {
                    createNotification({
                        userId: row.user_id,
                        type: 'wishlist_price_change',
                        message: `تم تغيير سعر المنتج المفضل ${productName} من ${oldPrice} إلى ${newPrice}`,
                        relatedId: productId,
                        metadata: {
                            product_id: productId,
                            old_price: oldPrice,
                            new_price: newPrice
                        }
                    }).catch(() => {});
                }

                if (offerAdded) {
                    createNotification({
                        userId: row.user_id,
                        type: 'wishlist_offer_added',
                        message: `تمت إضافة عرض جديد على المنتج المفضل ${productName}`,
                        relatedId: productId,
                        metadata: {
                            product_id: productId,
                            has_offer: true
                        }
                    }).catch(() => {});
                }
            });
        }
    );
}

// Image upload helper function
function saveProductImage(base64Data, productId) {
    try {
        // Check if it's a valid base64 image
        const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
            return null;
        }

        const imageType = matches[1]; // jpeg, png, gif, webp
        const imageData = matches[2];
        
        // Validate image size (max 2MB)
        if (imageData.length > 2 * 1024 * 1024) {
            return null;
        }

        const filename = `product_${productId}_${Date.now()}.${imageType}`;
        const filepath = path.join(uploadsDir, filename);
        
        fs.writeFileSync(filepath, imageData, 'base64');
        
        return `/uploads/products/${filename}`;
    } catch (error) {
        console.error('Error saving image:', error);
        return null;
    }
}

// Delete product image
function deleteProductImage(imagePath) {
    try {
        if (imagePath && imagePath.startsWith('/uploads/products/')) {
            const filepath = path.join(__dirname, '../public', imagePath);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        }
    } catch (error) {
        console.error('Error deleting image:', error);
    }
}

// Get all products (for pharmacy - shows all warehouse products)
router.get('/', verifyToken, (req, res) => {
    const { 
        search, 
        category, 
        warehouse_id, 
        page = 1, 
        limit = CONFIG.DEFAULT_PAGE_SIZE,
        sort_by = 'created_at',
        sort_order = 'DESC',
        min_price,
        max_price,
        in_stock,
        has_offers
    } = req.query;
    
    // Sanitize and validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(CONFIG.MAX_PAGE_SIZE, Math.max(1, parseInt(limit) || CONFIG.DEFAULT_PAGE_SIZE));
    const offset = (pageNum - 1) * pageSize;
    
    // Sanitize sort parameters
    const allowedSortFields = ['name', 'price', 'quantity', 'created_at', 'category', 'active_ingredient', 'discount_percent'];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    let query = `
        SELECT p.*, u.username as warehouse_name, u.address as warehouse_address, u.rating as warehouse_rating
        FROM products p 
        JOIN users u ON p.warehouse_id = u.id 
        WHERE p.quantity > 0
    `;
    const params = [];

    // Filter by warehouse
    if (warehouse_id) {
        const warehouseId = parseInt(warehouse_id);
        if (!isNaN(warehouseId)) {
            query += ' AND p.warehouse_id = ?';
            params.push(warehouseId);
        }
    }

    // Search filter
    if (search && typeof search === 'string') {
        const searchTerm = search.trim().substring(0, 100); // Limit search term length
        query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.active_ingredient LIKE ? OR u.username LIKE ?)';
        params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }

    // Category filter
    if (category && typeof category === 'string') {
        query += ' AND p.category = ?';
        params.push(category.trim());
    }

    // Price range filter
    if (min_price) {
        const minPrice = parseFloat(min_price);
        if (!isNaN(minPrice) && minPrice >= 0) {
            query += ' AND p.price >= ?';
            params.push(minPrice);
        }
    }

    if (max_price) {
        const maxPrice = parseFloat(max_price);
        if (!isNaN(maxPrice) && maxPrice >= 0) {
            query += ' AND p.price <= ?';
            params.push(maxPrice);
        }
    }

    // Offers only filter
    if (has_offers === 'true') {
        query += ' AND (IFNULL(p.discount_percent, 0) > 0 OR (IFNULL(p.bonus_buy_quantity, 0) > 0 AND IFNULL(p.bonus_free_quantity, 0) > 0))';
    }

    // Exclude expired products (optional filter)
    if (in_stock === 'true') {
        query += ' AND (p.expiry_date IS NULL OR p.expiry_date > date("now"))';
    }

    // Get total count for pagination
    // Use a multiline-safe replacement to keep all applied filters in the count query.
    const countQuery = query.replace(/SELECT[\s\S]*?FROM products p/, 'SELECT COUNT(*) as total FROM products p');
    
    // Add sorting and pagination
    query += ` ORDER BY p.${sortField} ${sortDirection} LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);

    // Execute count query
    db.get(countQuery, params.slice(0, -2), (err, countResult) => {
        if (err) {
            console.error('Error counting products:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'COUNT_ERROR' });
        }

        const totalItems = countResult?.total || 0;
        const totalPages = Math.ceil(totalItems / pageSize);

        // Execute main query
        db.all(query, params, (err, products) => {
            if (err) {
                console.error('Error fetching products:', err);
                return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
            }

            // Filter out expired products from results (as an extra safety measure)
            const validProducts = products
                .filter(p => !p.expiry_date || !isExpired(p.expiry_date))
                .map(calculateOfferMetrics);

            res.json({ 
                products: validProducts,
                pagination: {
                    current_page: pageNum,
                    total_pages: totalPages,
                    total_items: totalItems,
                    items_per_page: pageSize,
                    has_next: pageNum < totalPages,
                    has_prev: pageNum > 1
                }
            });
        });
    });
});

// Get categories
router.get('/categories', verifyToken, (req, res) => {
    db.all(`
        SELECT DISTINCT category, COUNT(*) as count 
        FROM products 
        WHERE category IS NOT NULL AND quantity > 0
        GROUP BY category 
        ORDER BY count DESC
    `, [], (err, categories) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'CATEGORIES_ERROR' });
        }
        res.json({ categories });
    });
});

// Get warehouse's products (for warehouse dashboard)
router.get('/my-products', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    const { page = 1, limit = CONFIG.DEFAULT_PAGE_SIZE, sort_by = 'created_at', sort_order = 'DESC' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(CONFIG.MAX_PAGE_SIZE, Math.max(1, parseInt(limit) || CONFIG.DEFAULT_PAGE_SIZE));
    const offset = (pageNum - 1) * pageSize;

    const allowedSortFields = ['name', 'price', 'quantity', 'created_at', 'category', 'expiry_date', 'active_ingredient'];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countQuery = 'SELECT COUNT(*) as total FROM products WHERE warehouse_id = ?';
    const query = `SELECT * FROM products WHERE warehouse_id = ? ORDER BY ${sortField} ${sortDirection} LIMIT ? OFFSET ?`;

    db.get(countQuery, [req.user.id], (err, countResult) => {
        if (err) {
            console.error('Error counting products:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'COUNT_ERROR' });
        }

        const totalItems = countResult?.total || 0;
        const totalPages = Math.ceil(totalItems / pageSize);

        db.all(query, [req.user.id, pageSize, offset], (err, products) => {
            if (err) {
                console.error('Error fetching warehouse products:', err);
                return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
            }

            // Add stock status to each product
            const productsWithStatus = products.map(p => ({
                ...p,
                stock_status: p.quantity === 0 ? 'out_of_stock' : 
                              p.quantity < CONFIG.LOW_STOCK_THRESHOLD ? 'low_stock' : 'in_stock',
                is_expired: p.expiry_date ? isExpired(p.expiry_date) : false
            })).map(calculateOfferMetrics);

            res.json({ 
                products: productsWithStatus,
                pagination: {
                    current_page: pageNum,
                    total_pages: totalPages,
                    total_items: totalItems,
                    items_per_page: pageSize,
                    has_next: pageNum < totalPages,
                    has_prev: pageNum > 1
                }
            });
        });
    });
});

// Get low stock products for warehouse
router.get('/low-stock', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    db.all(`
        SELECT * FROM products 
        WHERE warehouse_id = ? AND quantity < ? AND quantity > 0
        ORDER BY quantity ASC
    `, [req.user.id, CONFIG.LOW_STOCK_THRESHOLD], (err, products) => {
        if (err) {
            console.error('Error fetching low stock products:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }
        res.json({ products });
    });
});

// Get expired products for warehouse
router.get('/expired', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    db.all(`
        SELECT * FROM products 
        WHERE warehouse_id = ? AND expiry_date < date('now') AND expiry_date IS NOT NULL
        ORDER BY expiry_date ASC
    `, [req.user.id], (err, products) => {
        if (err) {
            console.error('Error fetching expired products:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }
        res.json({ products });
    });
});

// Get single product
router.get('/:id', verifyToken, (req, res) => {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    db.get(`
        SELECT p.*, u.username as warehouse_name, u.address as warehouse_address, u.phone as warehouse_phone, u.rating as warehouse_rating
        FROM products p 
        JOIN users u ON p.warehouse_id = u.id 
        WHERE p.id = ?
    `, [productId], (err, product) => {
        if (err) {
            console.error('Error fetching product:', err);
            return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
        }
        if (!product) {
            return res.status(404).json({ error: 'المنتج غير موجود', code: 'NOT_FOUND' });
        }
        
        // Add additional info
        product.is_expired = product.expiry_date ? isExpired(product.expiry_date) : false;
        product.stock_status = product.quantity === 0 ? 'out_of_stock' : 
                              product.quantity < CONFIG.LOW_STOCK_THRESHOLD ? 'low_stock' : 'in_stock';
        Object.assign(product, calculateOfferMetrics(product));
        
        res.json({ product });
    });
});

// Add product (warehouse only)
router.post('/', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    const { name, description, category, active_ingredient, price, quantity, expiry_date, image, offer_note } = req.body;
    const offerFields = normalizeOfferFields(req.body);
    const discountPercent = offerFields.discount_percent ?? 0;
    const bonusBuyQuantity = offerFields.bonus_buy_quantity ?? 0;
    const bonusFreeQuantity = offerFields.bonus_free_quantity ?? 0;
    const normalizedActiveIngredient = typeof active_ingredient === 'string' ? (active_ingredient.trim() || null) : null;

    // Validate input
    const validationErrors = validateProductInput({
        name,
        description,
        active_ingredient,
        price,
        quantity,
        expiry_date,
        discount_percent: discountPercent,
        bonus_buy_quantity: bonusBuyQuantity,
        bonus_free_quantity: bonusFreeQuantity
    });
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: validationErrors[0], details: validationErrors, code: 'VALIDATION_ERROR' });
    }

    // Check for expired date on creation
    if (expiry_date && isExpired(expiry_date)) {
        return res.status(400).json({ error: 'لا يمكن إضافة منتج بتاريخ انتهاء منتهي', code: 'EXPIRED_PRODUCT' });
    }

    // Handle image - if it's a base64 string, save it
    if (image && typeof image === 'string' && image.startsWith('data:image')) {
        // First insert without image to get ID
        db.run(
            `INSERT INTO products (
                warehouse_id, name, description, category, active_ingredient, price, quantity,
                discount_percent, bonus_buy_quantity, bonus_free_quantity, offer_note, expiry_date, image
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            [
                req.user.id, 
                name.trim(), 
                description?.trim() || null, 
                category?.trim() || null, 
                normalizedActiveIngredient,
                price, 
                quantity, 
                discountPercent,
                bonusBuyQuantity,
                bonusFreeQuantity,
                offer_note?.trim() || null,
                expiry_date || null
            ],
            function(err) {
                if (err) {
                    console.error('Error adding product:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة المنتج', code: 'INSERT_ERROR' });
                }

                const productId = this.lastID;
                
                // Save image with product ID
                const savedImagePath = saveProductImage(image, productId);
                
                // Update product with image path if saved successfully
                if (savedImagePath) {
                    db.run('UPDATE products SET image = ? WHERE id = ?', [savedImagePath, productId]);
                }

                // Create notification for low stock
                if (quantity < CONFIG.LOW_STOCK_THRESHOLD) {
                    createNotification({
                            userId: req.user.id,
                            type: 'low_stock',
                            message: `تنبيه: المخزون منخفض للمنتج ${name}`,
                            relatedId: productId
                        }).catch(() => {});
                }

                console.log(`Product added: ${name} (ID: ${productId}) by warehouse ${req.user.id}`);

                res.status(201).json({
                    message: 'تم إضافة المنتج بنجاح',
                    product: {
                        id: productId,
                        name,
                        active_ingredient: normalizedActiveIngredient,
                        price,
                        quantity,
                        image: savedImagePath,
                        discount_percent: discountPercent,
                        bonus_buy_quantity: bonusBuyQuantity,
                        bonus_free_quantity: bonusFreeQuantity,
                        offer_note: offer_note?.trim() || null
                    }
                });
            }
        );
    } else {
        // No image or URL provided
        db.run(
            `INSERT INTO products (
                warehouse_id, name, description, category, active_ingredient, price, quantity,
                discount_percent, bonus_buy_quantity, bonus_free_quantity, offer_note, expiry_date, image
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, 
                name.trim(), 
                description?.trim() || null, 
                category?.trim() || null, 
                normalizedActiveIngredient,
                price, 
                quantity, 
                discountPercent,
                bonusBuyQuantity,
                bonusFreeQuantity,
                offer_note?.trim() || null,
                expiry_date || null, 
                image?.trim() || null
            ],
            function(err) {
                if (err) {
                    console.error('Error adding product:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة المنتج', code: 'INSERT_ERROR' });
                }

                const productId = this.lastID;

                // Create notification for low stock
                if (quantity < CONFIG.LOW_STOCK_THRESHOLD) {
                    createNotification({
                            userId: req.user.id,
                            type: 'low_stock',
                            message: `تنبيه: المخزون منخفض للمنتج ${name}`,
                            relatedId: productId
                        }).catch(() => {});
                }

                console.log(`Product added: ${name} (ID: ${productId}) by warehouse ${req.user.id}`);

                res.status(201).json({
                    message: 'تم إضافة المنتج بنجاح',
                    product: {
                        id: productId,
                        name,
                        active_ingredient: normalizedActiveIngredient,
                        price,
                        quantity,
                        discount_percent: discountPercent,
                        bonus_buy_quantity: bonusBuyQuantity,
                        bonus_free_quantity: bonusFreeQuantity,
                        offer_note: offer_note?.trim() || null
                    }
                });
            }
        );
    }
});

// Update product (warehouse only)
router.put('/:id', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    const { name, description, category, active_ingredient, price, quantity, expiry_date, image, delete_image, offer_note } = req.body;
    const offerFields = normalizeOfferFields(req.body);

    // Validate input
    const validationErrors = validateProductInput({
        name,
        description,
        active_ingredient,
        price,
        quantity,
        expiry_date,
        discount_percent: offerFields.discount_percent,
        bonus_buy_quantity: offerFields.bonus_buy_quantity,
        bonus_free_quantity: offerFields.bonus_free_quantity
    }, true);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: validationErrors[0], details: validationErrors, code: 'VALIDATION_ERROR' });
    }

    // Check ownership and get current product
    db.get('SELECT * FROM products WHERE id = ? AND warehouse_id = ?', 
        [productId, req.user.id], 
        (err, product) => {
            if (err) {
                console.error('Error fetching product for update:', err);
                return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
            }
            if (!product) {
                return res.status(404).json({ error: 'المنتج غير موجود', code: 'NOT_FOUND' });
            }

            // Prepare updated values
            const updatedName = name?.trim() || product.name;
            const updatedDescription = description?.trim() ?? product.description;
            const updatedCategory = category?.trim() ?? product.category;
            const updatedActiveIngredient = active_ingredient !== undefined
                ? (typeof active_ingredient === 'string' ? (active_ingredient.trim() || null) : null)
                : (product.active_ingredient || null);
            const updatedPrice = price ?? product.price;
            const updatedQuantity = quantity ?? product.quantity;
            const updatedExpiryDate = expiry_date ?? product.expiry_date;
            const updatedDiscountPercent = offerFields.discount_percent ?? product.discount_percent ?? 0;
            const updatedBonusBuyQuantity = offerFields.bonus_buy_quantity ?? product.bonus_buy_quantity ?? 0;
            const updatedBonusFreeQuantity = offerFields.bonus_free_quantity ?? product.bonus_free_quantity ?? 0;
            const updatedOfferNote = offer_note !== undefined ? (offer_note?.trim() || null) : (product.offer_note || null);
            const oldPrice = Number(product.price);
            const newPrice = Number(updatedPrice);
            const offerAdded = !hasActiveOffer(product) && hasActiveOffer({
                discount_percent: updatedDiscountPercent,
                bonus_buy_quantity: updatedBonusBuyQuantity,
                bonus_free_quantity: updatedBonusFreeQuantity
            });
            
            // Handle image update
            let updatedImage = product.image;
            if (delete_image === true || delete_image === 'true') {
                // Delete existing image
                deleteProductImage(product.image);
                updatedImage = null;
            } else if (image && typeof image === 'string' && image.startsWith('data:image')) {
                // Delete old image first
                deleteProductImage(product.image);
                // Save new image
                updatedImage = saveProductImage(image, productId);
            } else if (image && typeof image === 'string') {
                // It's a URL string
                updatedImage = image.trim();
            }

            // Validate expiry date if provided
            if (expiry_date && isExpired(expiry_date)) {
                return res.status(400).json({ error: 'لا يمكن تحديد تاريخ انتهاء منتهي', code: 'EXPIRED_PRODUCT' });
            }

            db.run(
                `UPDATE products SET 
                    name = ?, 
                    description = ?, 
                    category = ?, 
                    active_ingredient = ?, 
                    price = ?, 
                    quantity = ?, 
                    discount_percent = ?,
                    bonus_buy_quantity = ?,
                    bonus_free_quantity = ?,
                    offer_note = ?,
                    expiry_date = ?, 
                    image = ?
                WHERE id = ? AND warehouse_id = ?`,
                [
                    updatedName,
                    updatedDescription,
                    updatedCategory,
                    updatedActiveIngredient,
                    updatedPrice,
                    updatedQuantity,
                    updatedDiscountPercent,
                    updatedBonusBuyQuantity,
                    updatedBonusFreeQuantity,
                    updatedOfferNote,
                    updatedExpiryDate,
                    updatedImage,
                    productId,
                    req.user.id
                ],
                function(err) {
                    if (err) {
                        console.error('Error updating product:', err);
                        return res.status(500).json({ error: 'خطأ في تحديث المنتج', code: 'UPDATE_ERROR' });
                    }

                    // Check for low stock notification
                    if (updatedQuantity < CONFIG.LOW_STOCK_THRESHOLD && product.quantity >= CONFIG.LOW_STOCK_THRESHOLD) {
                        createNotification({
                            userId: req.user.id,
                            type: 'low_stock',
                            message: `تنبيه: المخزون منخفض للمنتج ${updatedName}`,
                            relatedId: productId
                        }).catch(() => {});
                    }
                    notifyWishlistUsersAboutProductUpdate({
                        productId,
                        productName: updatedName,
                        oldPrice,
                        newPrice,
                        offerAdded
                    });

                    console.log(`Product updated: ${updatedName} (ID: ${productId}) by warehouse ${req.user.id}`);

                    res.json({ 
                        message: 'تم تحديث المنتج بنجاح',
                        product: {
                            id: productId,
                            name: updatedName,
                            active_ingredient: updatedActiveIngredient,
                            price: updatedPrice,
                            quantity: updatedQuantity,
                            image: updatedImage,
                            discount_percent: updatedDiscountPercent,
                            bonus_buy_quantity: updatedBonusBuyQuantity,
                            bonus_free_quantity: updatedBonusFreeQuantity,
                            offer_note: updatedOfferNote
                        }
                    });
                }
            );
        }
    );
});

// Delete product (warehouse only)
router.delete('/:id', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    // First get product info for logging
    db.get('SELECT name, image FROM products WHERE id = ? AND warehouse_id = ?', 
        [productId, req.user.id], 
        (err, product) => {
            if (err) {
                console.error('Error fetching product for delete:', err);
                return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
            }
            if (!product) {
                return res.status(404).json({ error: 'المنتج غير موجود', code: 'NOT_FOUND' });
            }

            // Delete associated image
            deleteProductImage(product.image);

            db.run('DELETE FROM products WHERE id = ? AND warehouse_id = ?', 
                [productId, req.user.id], 
                function(err) {
                    if (err) {
                        console.error('Error deleting product:', err);
                        return res.status(500).json({ error: 'خطأ في حذف المنتج', code: 'DELETE_ERROR' });
                    }
                    
                    console.log(`Product deleted: ${product.name} (ID: ${productId}) by warehouse ${req.user.id}`);
                    
                    res.json({ message: 'تم حذف المنتج بنجاح' });
                }
            );
        }
    );
});

// Import products from Excel/CSV file (warehouse only)
router.post('/import', verifyToken, upload.single('file'), (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'يرجى رفع ملف Excel أو CSV', code: 'NO_FILE' });
    }

    try {
        // Parse the Excel/CSV file
        let workbook;
        const buffer = req.file.buffer;
        
        if (req.file.originalname.endsWith('.csv')) {
            // For CSV files
            workbook = XLSX.read(buffer.toString('utf8'), { type: 'string' });
        } else {
            // For Excel files
            workbook = XLSX.read(buffer, { type: 'buffer' });
        }

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON array
        const products = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (products.length < 2) {
            return res.status(400).json({ error: 'الملف فارغ أو لا يحتوي على بيانات', code: 'EMPTY_FILE' });
        }

        // Detect header row (some sheets include title rows before actual headers)
        const headerRowIndex = detectHeaderRowIndex(products);
        const headers = (products[headerRowIndex] || []).map(h => String(h).trim());
        const normalizedHeaders = headers.map(mapHeaderToField);
        
        // Process data rows
        const processedProducts = [];
        const errors = [];
        
        for (let i = headerRowIndex + 1; i < products.length; i++) {
            const row = products[i];
            if (!row || row.length === 0 || row.every(cell => !cell)) {
                continue; // Skip empty rows
            }

            // Create row object with normalized headers
            const rowObj = {};
            normalizedHeaders.forEach((header, index) => {
                if (header && row[index] !== undefined && row[index] !== '') {
                    rowObj[header] = row[index];
                }
            });

            // Normalize the row data
            const normalizedRow = normalizeRowData(rowObj);
            const fallbackRow = buildFallbackRowFromLegacySheet(row);
            if ((!normalizedRow.name || !Number.isFinite(normalizedRow.price)) && fallbackRow) {
                Object.assign(normalizedRow, fallbackRow);
            }
            
            // Validate required fields
            if (!normalizedRow.name || !Number.isFinite(normalizedRow.price)) {
                errors.push({ row: i + 1, errors: ['الاسم والسعر مطلوبان'] });
                continue;
            }

            // Add default values for optional fields
            normalizedRow.description = normalizedRow.description || null;
            normalizedRow.category = normalizedRow.category || null;
            normalizedRow.active_ingredient = normalizedRow.active_ingredient || null;
            normalizedRow.quantity = normalizedRow.quantity ?? 0;
            normalizedRow.discount_percent = normalizedRow.discount_percent || 0;
            normalizedRow.bonus_buy_quantity = normalizedRow.bonus_buy_quantity || 0;
            normalizedRow.bonus_free_quantity = normalizedRow.bonus_free_quantity || 0;
            normalizedRow.offer_note = normalizedRow.offer_note || null;
            normalizedRow.expiry_date = normalizedRow.expiry_date || null;
            if (normalizedRow.product_code) {
                const codeText = `الكود: ${String(normalizedRow.product_code).trim()}`;
                normalizedRow.offer_note = normalizedRow.offer_note
                    ? `${normalizedRow.offer_note} | ${codeText}`
                    : codeText;
            }

            processedProducts.push(normalizedRow);
        }

        if (processedProducts.length === 0) {
            return res.status(400).json({ 
                error: 'لم يتم العثور على منتجات صالحة في الملف',
                errors: errors,
                code: 'NO_VALID_PRODUCTS'
            });
        }

        // Limit to 100 products
        const productsToInsert = processedProducts.slice(0, 100);
        const skippedProducts = processedProducts.length - productsToInsert.length;

        const insertedProducts = [];
        const insertErrors = [];

        db.serialize(() => {
            productsToInsert.forEach((product, index) => {
                const validationErrors = validateProductInput(product);
                if (validationErrors.length > 0) {
                    insertErrors.push({ row: index + 2, product: product.name, errors: validationErrors });
                    return;
                }

                if (product.expiry_date && isExpired(product.expiry_date)) {
                    insertErrors.push({ row: index + 2, product: product.name, errors: ['تاريخ انتهاء منتهي'] });
                    return;
                }

                const stmt = db.prepare(`
                    INSERT INTO products (
                        warehouse_id, name, description, category, active_ingredient, price, quantity,
                        discount_percent, bonus_buy_quantity, bonus_free_quantity, offer_note, expiry_date, image
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                stmt.run([
                    req.user.id,
                    product.name,
                    product.description,
                    product.category,
                    product.active_ingredient,
                    product.price,
                    product.quantity,
                    product.discount_percent,
                    product.bonus_buy_quantity,
                    product.bonus_free_quantity,
                    product.offer_note,
                    product.expiry_date,
                    null
                ], function(err) {
                    if (err) {
                        insertErrors.push({ row: index + 2, product: product.name, errors: [err.message] });
                    } else {
                        insertedProducts.push({
                            id: this.lastID,
                            name: product.name,
                            price: product.price,
                            quantity: product.quantity
                        });

                        // Check low stock
                        if (product.quantity < CONFIG.LOW_STOCK_THRESHOLD) {
                            createNotification({
                            userId: req.user.id,
                            type: 'low_stock',
                            message: `تنبيه: المخزون منخفض للمنتج ${product.name}`,
                            relatedId: this.lastID
                        }).catch(() => {});
                        }
                    }
                });

                stmt.finalize();
            });

            db.get('SELECT CHANGES() as changes', (err) => {
                console.log(`Excel import completed: ${insertedProducts.length} products added by warehouse ${req.user.id}`);
                
                const response = {
                    message: `تم استيراد ${insertedProducts.length} منتج بنجاح من الملف`,
                    inserted: insertedProducts,
                    errors: insertErrors,
                    summary: {
                        total_in_file: processedProducts.length,
                        total_requested: productsToInsert.length,
                        skipped_limit: skippedProducts,
                        successful: insertedProducts.length,
                        failed: insertErrors.length
                    }
                };

                if (insertErrors.length > 0 && insertedProducts.length === 0) {
                    return res.status(400).json({ ...response, error: 'لم يتم استيراد أي منتج', code: 'IMPORT_FAILED' });
                }

                res.json(response);
            });
        });
    } catch (error) {
        console.error('Error parsing Excel file:', error);
        return res.status(400).json({ error: 'فشل في قراءة الملف: ' + error.message, code: 'PARSE_ERROR' });
    }
});

// Bulk add products (warehouse only)
router.post('/bulk', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'قائمة المنتجات فارغة أو غير صالحة', code: 'VALIDATION_ERROR' });
    }

    if (products.length > 100) {
        return res.status(400).json({ error: 'الحد الأقصى لإضافة المنتجات دفعة واحدة هو 100 منتج', code: 'VALIDATION_ERROR' });
    }

    const insertedProducts = [];
    const errors = [];

    db.serialize(() => {
        products.forEach((product, index) => {
            const validationErrors = validateProductInput(product);
            if (validationErrors.length > 0) {
                errors.push({ index, errors: validationErrors });
                return;
            }

            if (product.expiry_date && isExpired(product.expiry_date)) {
                errors.push({ index, errors: ['تاريخ انتهاء منتهي'] });
                return;
            }

            const stmt = db.prepare(`
                INSERT INTO products (
                    warehouse_id, name, description, category, active_ingredient, price, quantity,
                    discount_percent, bonus_buy_quantity, bonus_free_quantity, offer_note, expiry_date, image
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const bulkOfferFields = normalizeOfferFields(product);
            const bulkDiscountPercent = bulkOfferFields.discount_percent ?? 0;
            const bulkBonusBuyQuantity = bulkOfferFields.bonus_buy_quantity ?? 0;
            const bulkBonusFreeQuantity = bulkOfferFields.bonus_free_quantity ?? 0;

            stmt.run([
                req.user.id,
                product.name.trim(),
                product.description?.trim() || null,
                product.category?.trim() || null,
                (typeof product.active_ingredient === 'string' ? (product.active_ingredient.trim() || null) : null),
                product.price,
                product.quantity,
                bulkDiscountPercent,
                bulkBonusBuyQuantity,
                bulkBonusFreeQuantity,
                product.offer_note?.trim() || null,
                product.expiry_date || null,
                product.image?.trim() || null
            ], function(err) {
                if (err) {
                    errors.push({ index, errors: [err.message] });
                } else {
                    insertedProducts.push({
                        id: this.lastID,
                        name: product.name,
                        price: product.price,
                        quantity: product.quantity
                    });

                    // Check low stock
                    if (product.quantity < CONFIG.LOW_STOCK_THRESHOLD) {
                        createNotification({
                            userId: req.user.id,
                            type: 'low_stock',
                            message: `تنبيه: المخزون منخفض للمنتج ${product.name}`,
                            relatedId: this.lastID
                        }).catch(() => {});
                    }
                }
            });

            stmt.finalize();
        });

        db.get('SELECT CHANGES() as changes', (err, result) => {
            console.log(`Bulk insert completed: ${insertedProducts.length} products added by warehouse ${req.user.id}`);
            
            res.json({
                message: `تم إضافة ${insertedProducts.length} منتج بنجاح`,
                inserted: insertedProducts,
                errors: errors,
                summary: {
                    total_requested: products.length,
                    successful: insertedProducts.length,
                    failed: errors.length
                }
            });
        });
    });
});

// Update stock only (quick update for warehouse)
router.patch('/:id/stock', verifyToken, (req, res) => {
    if (req.user.role !== 'warehouse') {
        return res.status(403).json({ error: 'غير مصرح لك', code: 'FORBIDDEN' });
    }

    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
        return res.status(400).json({ error: 'معرف المنتج غير صالح', code: 'INVALID_ID' });
    }

    const { quantity } = req.body;

    if (typeof quantity !== 'number' || quantity < 0 || quantity > CONFIG.MAX_QUANTITY) {
        return res.status(400).json({ error: 'الكمية يجب أن تكون رقماً صحيحاً غير سالب', code: 'VALIDATION_ERROR' });
    }

    // Check ownership
    db.get('SELECT * FROM products WHERE id = ? AND warehouse_id = ?', 
        [productId, req.user.id], 
        (err, product) => {
            if (err) {
                console.error('Error fetching product for stock update:', err);
                return res.status(500).json({ error: 'خطأ في الخادم', code: 'FETCH_ERROR' });
            }
            if (!product) {
                return res.status(404).json({ error: 'المنتج غير موجود', code: 'NOT_FOUND' });
            }

            db.run(
                'UPDATE products SET quantity = ? WHERE id = ? AND warehouse_id = ?',
                [quantity, productId, req.user.id],
                function(err) {
                    if (err) {
                        console.error('Error updating stock:', err);
                        return res.status(500).json({ error: 'خطأ في تحديث المخزون', code: 'UPDATE_ERROR' });
                    }

                    // Check for low stock notification
                    if (quantity < CONFIG.LOW_STOCK_THRESHOLD && product.quantity >= CONFIG.LOW_STOCK_THRESHOLD) {
                        createNotification({
                            userId: req.user.id,
                            type: 'low_stock',
                            message: `تنبيه: المخزون منخفض للمنتج ${product.name}`,
                            relatedId: productId
                        }).catch(() => {});
                    }

                    res.json({ 
                        message: 'تم تحديث المخزون بنجاح',
                        product: { id: productId, quantity }
                    });
                }
            );
        }
    );
});

module.exports = router;


