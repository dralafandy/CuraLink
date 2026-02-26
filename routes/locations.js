const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'curalink_secret_key_2024';

// Authentication middleware
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

// ============================================
// Geographic Zones Routes (Governorates, Cities, Districts)
// ============================================

// Get all locations for current user (root route)
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const locations = await db.all(
            `SELECT l.*, 
                    g.name_ar as governorate_name, g.name_en as governorate_name_en,
                    c.name_ar as city_name, c.name_en as city_name_en,
                    d.name_ar as district_name, d.name_en as district_name_en
             FROM locations l
             LEFT JOIN governorates g ON g.id = l.governorate_id
             LEFT JOIN cities c ON c.id = l.city_id
             LEFT JOIN districts d ON d.id = l.district_id
             WHERE l.user_id = ? 
             ORDER BY l.is_primary DESC, l.created_at DESC`,
            [userId]
        );

        res.json({ locations });
    } catch (err) {
        console.error('Get locations error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get all governorates
router.get('/geo/governorates', async (req, res) => {
    try {
        const governorates = await db.all(
            'SELECT * FROM governorates WHERE is_active = 1 ORDER BY sort_order ASC'
        );
        res.json({ governorates });
    } catch (err) {
        console.error('Get governorates error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get cities by governorate
router.get('/geo/governorates/:id/cities', async (req, res) => {
    try {
        const governorateId = req.params.id;
        const cities = await db.all(
            'SELECT * FROM cities WHERE governorate_id = ? AND is_active = 1 ORDER BY sort_order ASC',
            [governorateId]
        );
        res.json({ cities });
    } catch (err) {
        console.error('Get cities error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get districts by city
router.get('/geo/cities/:id/districts', async (req, res) => {
    try {
        const cityId = req.params.id;
        const districts = await db.all(
            'SELECT * FROM districts WHERE city_id = ? AND is_active = 1 ORDER BY sort_order ASC',
            [cityId]
        );
        res.json({ districts });
    } catch (err) {
        console.error('Get districts error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Search for locations (governorates, cities, districts)
router.get('/geo/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({ error: 'يرجى إدخال نص للبحث (حرفان على الأقل)' });
        }

        const searchTerm = `%${q}%`;
        
        // Search in governorates
        const governorates = await db.all(
            `SELECT 'governorate' as type, id, name_ar, name_en, latitude, longitude 
             FROM governorates 
             WHERE is_active = 1 AND (name_ar LIKE ? OR name_en LIKE ?)
             LIMIT 5`,
            [searchTerm, searchTerm]
        );

        // Search in cities
        const cities = await db.all(
            `SELECT 'city' as type, id, governorate_id, name_ar, name_en, latitude, longitude 
             FROM cities 
             WHERE is_active = 1 AND (name_ar LIKE ? OR name_en LIKE ?)
             LIMIT 10`,
            [searchTerm, searchTerm]
        );

        // Search in districts
        const districts = await db.all(
            `SELECT 'district' as type, id, city_id, name_ar, name_en, postal_code, latitude, longitude 
             FROM districts 
             WHERE is_active = 1 AND (name_ar LIKE ? OR name_en LIKE ?)
             LIMIT 10`,
            [searchTerm, searchTerm]
        );

        res.json({
            results: {
                governorates,
                cities,
                districts
            }
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get full location hierarchy (for dropdowns)
router.get('/geo/hierarchy', async (req, res) => {
    try {
        const governorates = await db.all(
            'SELECT * FROM governorates WHERE is_active = 1 ORDER BY sort_order ASC'
        );

        const cities = await db.all(
            'SELECT * FROM cities WHERE is_active = 1 ORDER BY sort_order ASC'
        );

        const districts = await db.all(
            'SELECT * FROM districts WHERE is_active = 1 ORDER BY sort_order ASC'
        );

        // Group cities by governorate
        const citiesByGovernorate = {};
        cities.forEach(city => {
            if (!citiesByGovernorate[city.governorate_id]) {
                citiesByGovernorate[city.governorate_id] = [];
            }
            citiesByGovernorate[city.governorate_id].push(city);
        });

        // Group districts by city
        const districtsByCity = {};
        districts.forEach(district => {
            if (!districtsByCity[district.city_id]) {
                districtsByCity[district.city_id] = [];
            }
            districtsByCity[district.city_id].push(district);
        });

        res.json({
            governorates: governorates.map(g => ({
                ...g,
                cities: citiesByGovernorate[g.id] || []
            })).map(g => ({
                ...g,
                cities: g.cities.map(c => ({
                    ...c,
                    districts: districtsByCity[c.id] || []
                }))
            }))
        });
    } catch (err) {
        console.error('Get hierarchy error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ============================================
// GPS Locations Routes (Enhanced)
// ============================================

// Get all locations for a user
router.get('/locations', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const locations = await db.all(
            `SELECT l.*, 
                    g.name_ar as governorate_name, g.name_en as governorate_name_en,
                    c.name_ar as city_name, c.name_en as city_name_en,
                    d.name_ar as district_name, d.name_en as district_name_en
             FROM locations l
             LEFT JOIN governorates g ON g.id = l.governorate_id
             LEFT JOIN cities c ON c.id = l.city_id
             LEFT JOIN districts d ON d.id = l.district_id
             WHERE l.user_id = ? 
             ORDER BY l.is_primary DESC, l.created_at DESC`,
            [userId]
        );

        res.json({ locations });
    } catch (err) {
        console.error('Get locations error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Add new location (Enhanced with geographic zones)
router.post('/locations', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const { 
            name, 
            address, 
            latitude, 
            longitude, 
            is_primary, 
            location_type, 
            phone, 
            notes,
            governorate_id,
            city_id,
            district_id,
            building_number,
            floor_number,
            apartment_number,
            landmark,
            postal_code,
            delivery_instructions
        } = req.body;

        if (!name || !latitude || !longitude) {
            return res.status(400).json({ error: 'الاسم والإحداثيات مطلوبة' });
        }

        // If setting as primary, unset other primary locations
        if (is_primary) {
            await db.run(
                'UPDATE locations SET is_primary = 0 WHERE user_id = ?',
                [userId]
            );
        }

        const result = await db.run(
            `INSERT INTO locations (
                user_id, name, address, latitude, longitude, is_primary, location_type, 
                phone, notes, governorate_id, city_id, district_id, 
                building_number, floor_number, apartment_number, landmark, 
                postal_code, delivery_instructions
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, 
                name, 
                address || null, 
                latitude, 
                longitude, 
                is_primary ? 1 : 0, 
                location_type || null, 
                phone || null, 
                notes || null,
                governorate_id || null,
                city_id || null,
                district_id || null,
                building_number || null,
                floor_number || null,
                apartment_number || null,
                landmark || null,
                postal_code || null,
                delivery_instructions || null
            ]
        );

        // Update user's primary coordinates
        if (is_primary) {
            await db.run(
                'UPDATE users SET latitude = ?, longitude = ?, gps_address = ? WHERE id = ?',
                [latitude, longitude, address || null, userId]
            );
        }

        res.json({ 
            message: 'تم إضافة الموقع بنجاح',
            location_id: result.lastID
        });
    } catch (err) {
        console.error('Add location error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Update location (Enhanced)
router.put('/locations/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        const locationId = req.params.id;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const { 
            name, 
            address, 
            latitude, 
            longitude, 
            is_primary, 
            location_type, 
            phone, 
            notes,
            governorate_id,
            city_id,
            district_id,
            building_number,
            floor_number,
            apartment_number,
            landmark,
            postal_code,
            delivery_instructions
        } = req.body;

        // Check ownership
        const location = await db.get(
            'SELECT * FROM locations WHERE id = ? AND user_id = ?',
            [locationId, userId]
        );

        if (!location) {
            return res.status(404).json({ error: 'الموقع غير موجود' });
        }

        // If setting as primary, unset other primary locations
        if (is_primary) {
            await db.run(
                'UPDATE locations SET is_primary = 0 WHERE user_id = ? AND id != ?',
                [userId, locationId]
            );
        }

        await db.run(
            `UPDATE locations SET 
                name = ?, address = ?, latitude = ?, longitude = ?, 
                is_primary = ?, location_type = ?, phone = ?, notes = ?,
                governorate_id = ?, city_id = ?, district_id = ?,
                building_number = ?, floor_number = ?, apartment_number = ?,
                landmark = ?, postal_code = ?, delivery_instructions = ?
             WHERE id = ?`,
            [
                name || location.name,
                address || location.address,
                latitude || location.latitude,
                longitude || location.longitude,
                is_primary ? 1 : location.is_primary,
                location_type || location.location_type,
                phone || location.phone,
                notes || location.notes,
                governorate_id || location.governorate_id,
                city_id || location.city_id,
                district_id || location.district_id,
                building_number || location.building_number,
                floor_number || location.floor_number,
                apartment_number || location.apartment_number,
                landmark || location.landmark,
                postal_code || location.postal_code,
                delivery_instructions || location.delivery_instructions,
                locationId
            ]
        );

        // Update user's primary coordinates if this is primary
        if (is_primary || location.is_primary) {
            const newLat = latitude || location.latitude;
            const newLng = longitude || location.longitude;
            const newAddr = address || location.address;
            await db.run(
                'UPDATE users SET latitude = ?, longitude = ?, gps_address = ? WHERE id = ?',
                [newLat, newLng, newAddr, userId]
            );
        }

        res.json({ message: 'تم تحديث الموقع بنجاح' });
    } catch (err) {
        console.error('Update location error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Delete location
router.delete('/locations/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        const locationId = req.params.id;

        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const result = await db.run(
            'DELETE FROM locations WHERE id = ? AND user_id = ?',
            [locationId, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'الموقع غير موجود' });
        }

        res.json({ message: 'تم حذف الموقع بنجاح' });
    } catch (err) {
        console.error('Delete location error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Haversine formula to calculate distance between two points
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Get nearby warehouses (Enhanced with filters)
router.get('/warehouses/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 50, governorate_id, city_id, district_id } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ error: 'الإحداثيات مطلوبة' });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const searchRadius = parseFloat(radius);

        // First, get all warehouses with coordinates
        const warehouses = await db.all(
            "SELECT id, username, phone, address, zone, rating, rating_count, latitude, longitude FROM users WHERE role = 'warehouse' AND is_active = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL"
        );

        // If geographic filters provided, get warehouse IDs from delivery_zones
        let allowedWarehouseIds = null;
        if (governorate_id || city_id) {
            let zoneQuery = 'SELECT DISTINCT warehouse_id FROM delivery_zones WHERE is_active = 1';
            const zoneParams = [];
            
            if (governorate_id) {
                zoneQuery += ' AND (governorate_id = ? OR governorate_id IS NULL)';
                zoneParams.push(governorate_id);
            }
            if (city_id) {
                zoneQuery += ' AND (city_id = ? OR city_id IS NULL)';
                zoneParams.push(city_id);
            }

            const zones = await db.all(zoneQuery, zoneParams);
            
            if (zones && zones.length > 0) {
                allowedWarehouseIds = zones.map(z => z.warehouse_id);
            }
        }

        // Calculate distances and filter
        const nearbyWarehouses = warehouses
            .filter(warehouse => {
                // Apply geographic filter if provided
                if (allowedWarehouseIds && !allowedWarehouseIds.includes(warehouse.id)) {
                    return false;
                }
                return true;
            })
            .map(warehouse => {
                const distance = calculateDistance(
                    latitude, longitude,
                    warehouse.latitude, warehouse.longitude
                );
                return { ...warehouse, distance };
            })
            .filter(warehouse => warehouse.distance <= searchRadius)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 20);

        res.json({ warehouses: nearbyWarehouses });
    } catch (err) {
        console.error('Get nearby warehouses error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Calculate distance between two points
router.post('/distance', async (req, res) => {
    try {
        const { from_lat, from_lng, to_lat, to_lng } = req.body;

        if (!from_lat || !from_lng || !to_lat || !to_lng) {
            return res.status(400).json({ error: 'جميع الإحداثيات مطلوبة' });
        }

        // Haversine formula
        const R = 6371; // Earth's radius in km
        const dLat = (to_lat - from_lat) * Math.PI / 180;
        const dLng = (to_lng - from_lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(from_lat * Math.PI / 180) * Math.cos(to_lat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        res.json({ 
            distance_km: Math.round(distance * 100) / 100,
            distance_text: distance < 1 ? `${Math.round(distance * 1000)} متر` : `${Math.round(distance * 10) / 10} كم`
        });
    } catch (err) {
        console.error('Calculate distance error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ============================================
// Delivery Zones Routes
// ============================================

// Get delivery zones for a warehouse
router.get('/delivery-zones', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        // For warehouse: get their delivery zones
        // For pharmacy: get available delivery zones from all warehouses
        let query = `
            SELECT dz.*, 
                   g.name_ar as governorate_name, g.name_en as governorate_name_en,
                   c.name_ar as city_name, c.name_en as city_name_en,
                   d.name_ar as district_name, d.name_en as district_name_en,
                   u.username as warehouse_name, u.phone as warehouse_phone
            FROM delivery_zones dz
            LEFT JOIN governorates g ON g.id = dz.governorate_id
            LEFT JOIN cities c ON c.id = dz.city_id
            LEFT JOIN districts d ON d.id = dz.district_id
            LEFT JOIN users u ON u.id = dz.warehouse_id
            WHERE dz.is_active = 1
        `;

        const params = [];

        // If user is a warehouse, only show their zones
        if (req.user?.role === 'warehouse') {
            query += ` AND dz.warehouse_id = ?`;
            params.push(userId);
        }

        query += ` ORDER BY dz.base_fee ASC`;

        const zones = await db.all(query, params);
        res.json({ zones });
    } catch (err) {
        console.error('Get delivery zones error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Add delivery zone (warehouse only)
router.post('/delivery-zones', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId || req.user?.role !== 'warehouse') {
            return res.status(403).json({ error: 'غير مصرح لهذه العملية' });
        }

        const { 
            governorate_id, 
            city_id, 
            district_id,
            zone_type,
            radius_km,
            base_fee,
            per_km_fee,
            min_order_amount,
            free_delivery_threshold,
            estimated_delivery_hours
        } = req.body;

        if (!governorate_id && !city_id) {
            return res.status(400).json({ error: 'يجب تحديد المحافظة أو المدينة' });
        }

        const result = await db.run(
            `INSERT INTO delivery_zones (
                warehouse_id, governorate_id, city_id, district_id, zone_type,
                radius_km, base_fee, per_km_fee, min_order_amount,
                free_delivery_threshold, estimated_delivery_hours, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                userId,
                governorate_id || null,
                city_id || null,
                district_id || null,
                zone_type || 'administrative',
                radius_km || 50,
                base_fee || 15,
                per_km_fee || 0,
                min_order_amount || 500,
                free_delivery_threshold || 2000,
                estimated_delivery_hours || 24
            ]
        );

        res.json({ 
            message: 'تم إضافة نطاق التوصيل بنجاح',
            zone_id: result.lastID
        });
    } catch (err) {
        console.error('Add delivery zone error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Update delivery zone
router.put('/delivery-zones/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        const zoneId = req.params.id;

        if (!userId || req.user?.role !== 'warehouse') {
            return res.status(403).json({ error: 'غير مصرح لهذه العملية' });
        }

        // Check ownership
        const zone = await db.get(
            'SELECT * FROM delivery_zones WHERE id = ? AND warehouse_id = ?',
            [zoneId, userId]
        );

        if (!zone) {
            return res.status(404).json({ error: 'نطاق التوصيل غير موجود' });
        }

        const { 
            governorate_id, 
            city_id, 
            district_id,
            zone_type,
            radius_km,
            base_fee,
            per_km_fee,
            min_order_amount,
            free_delivery_threshold,
            estimated_delivery_hours,
            is_active
        } = req.body;

        await db.run(
            `UPDATE delivery_zones SET 
                governorate_id = ?, city_id = ?, district_id = ?,
                zone_type = ?, radius_km = ?, base_fee = ?, per_km_fee = ?,
                min_order_amount = ?, free_delivery_threshold = ?,
                estimated_delivery_hours = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                governorate_id ?? zone.governorate_id,
                city_id ?? zone.city_id,
                district_id ?? zone.district_id,
                zone_type ?? zone.zone_type,
                radius_km ?? zone.radius_km,
                base_fee ?? zone.base_fee,
                per_km_fee ?? zone.per_km_fee,
                min_order_amount ?? zone.min_order_amount,
                free_delivery_threshold ?? zone.free_delivery_threshold,
                estimated_delivery_hours ?? zone.estimated_delivery_hours,
                is_active ?? zone.is_active,
                zoneId
            ]
        );

        res.json({ message: 'تم تحديث نطاق التوصيل بنجاح' });
    } catch (err) {
        console.error('Update delivery zone error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Delete delivery zone
router.delete('/delivery-zones/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        const zoneId = req.params.id;

        if (!userId || req.user?.role !== 'warehouse') {
            return res.status(403).json({ error: 'غير مصرح لهذه العملية' });
        }

        const result = await db.run(
            'DELETE FROM delivery_zones WHERE id = ? AND warehouse_id = ?',
            [zoneId, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'نطاق التوصيل غير موجود' });
        }

        res.json({ message: 'تم حذف نطاق التوصيل بنجاح' });
    } catch (err) {
        console.error('Delete delivery zone error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ============================================
// Delivery Check and Calculation Routes
// ============================================

// Check delivery coverage for a location
router.post('/delivery/check-coverage', async (req, res) => {
    try {
        const { latitude, longitude, governorate_id, city_id, district_id } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'الإحداثيات مطلوبة' });
        }

        // Find warehouses that can deliver to this location
        let query = `
            SELECT DISTINCT u.id as warehouse_id, u.username as warehouse_name,
                   u.phone as warehouse_phone, u.rating, u.rating_count,
                   dz.base_fee, dz.per_km_fee, dz.min_order_amount, 
                   dz.free_delivery_threshold, dz.estimated_delivery_hours,
                   (6371 * acos(cos(radians(?)) * cos(radians(u.latitude)) * 
                    cos(radians(u.longitude) - radians(?)) + sin(radians(?)) * sin(radians(u.latitude)))) AS distance
            FROM delivery_zones dz
            JOIN users u ON u.id = dz.warehouse_id
            WHERE dz.is_active = 1
            AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
            AND (
                (dz.governorate_id IS NULL AND dz.city_id IS NULL)  -- Nationwide
                OR dz.governorate_id = ?
                OR dz.city_id = ?
            )
        `;

        const params = [latitude, longitude, latitude, governorate_id || 0, city_id || 0];

        const availableWarehouses = await db.all(query, params);

        if (availableWarehouses.length === 0) {
            return res.json({
                available: false,
                message: 'لا توجد مخازن توفر التوصيل لهذه المنطقة',
                warehouses: []
            });
        }

        res.json({
            available: true,
            message: `تم العثور على ${availableWarehouses.length} مخزن يوفر التوصيل`,
            warehouses: availableWarehouses
        });
    } catch (err) {
        console.error('Check coverage error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Calculate delivery fee
router.post('/delivery/calculate-fee', async (req, res) => {
    try {
        const { warehouse_id, latitude, longitude } = req.body;

        if (!warehouse_id || !latitude || !longitude) {
            return res.status(400).json({ error: 'معلومات غير مكتملة' });
        }

        // Get warehouse coordinates
        const warehouse = await db.get(
            "SELECT latitude, longitude FROM users WHERE id = ? AND role = 'warehouse'",
            [warehouse_id]
        );

        if (!warehouse || !warehouse.latitude || !warehouse.longitude) {
            return res.status(404).json({ error: 'المخزن غير موجود أو لا يحتوي على إحداثيات' });
        }

        // Get delivery zone for this warehouse
        const deliveryZone = await db.get(
            `SELECT * FROM delivery_zones 
             WHERE warehouse_id = ? AND is_active = 1
             ORDER BY base_fee ASC
             LIMIT 1`,
            [warehouse_id]
        );

        if (!deliveryZone) {
            return res.status(404).json({ error: 'لا توجد مناطق توصيل لهذا المخزن' });
        }

        // Calculate distance
        const R = 6371;
        const dLat = (latitude - warehouse.latitude) * Math.PI / 180;
        const dLng = (longitude - warehouse.longitude) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(warehouse.latitude * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        // Calculate fee
        let deliveryFee = deliveryZone.base_fee;
        if (deliveryZone.per_km_fee > 0 && distance > 10) {
            deliveryFee += (distance - 10) * deliveryZone.per_km_fee;
        }

        res.json({
            warehouse_id,
            distance_km: Math.round(distance * 100) / 100,
            delivery_fee: Math.round(deliveryFee * 100) / 100,
            currency: 'EGP',
            min_order_amount: deliveryZone.min_order_amount,
            free_delivery_threshold: deliveryZone.free_delivery_threshold,
            estimated_hours: deliveryZone.estimated_delivery_hours,
            is_free: distance <= 10 || deliveryFee <= 0
        });
    } catch (err) {
        console.error('Calculate fee error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// Get available warehouses for delivery
router.get('/delivery/warehouses', async (req, res) => {
    try {
        const { latitude, longitude, governorate_id, city_id } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'الإحداثيات مطلوبة' });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        // Find warehouses with delivery coverage
        const query = `
            SELECT DISTINCT u.id as warehouse_id, u.username as warehouse_name,
                   u.phone as warehouse_phone, u.address as warehouse_address,
                   u.rating, u.rating_count, u.latitude, u.longitude,
                   dz.base_fee, dz.free_delivery_threshold, dz.estimated_delivery_hours,
                   (6371 * acos(cos(radians(?)) * cos(radians(u.latitude)) * 
                    cos(radians(u.longitude) - radians(?)) + sin(radians(?)) * sin(radians(u.latitude)))) AS distance
            FROM delivery_zones dz
            JOIN users u ON u.id = dz.warehouse_id
            WHERE dz.is_active = 1
            AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
            AND u.is_active = 1
            ORDER BY distance ASC
            LIMIT 10
        `;

        const warehouses = await db.all(query, [lat, lng, lat]);

        res.json({ warehouses });
    } catch (err) {
        console.error('Get delivery warehouses error:', err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

module.exports = router;
