// ============================================
// Geographic Location Management System
// For Pharmacy and Warehouse Location Features
// ============================================

// Global variables for location management
let currentPosition = null;
let locationMap = null;
let locationMarkers = [];
let selectedGovernorate = null;
let selectedCity = null;
let selectedDistrict = null;

// ============================================
// Geographic Data Functions
// ============================================

// Load governorates for dropdown
async function loadGovernorates(selectElementId = 'governorate-select') {
    try {
        const select = document.getElementById(selectElementId);
        if (!select) return;

        // Show loading
        select.innerHTML = '<option value="">جاري التحميل...</option>';

        const data = await apiCall('/locations/geo/governorates');
        const governorates = data.governorates || [];

        select.innerHTML = '<option value="">اختر المحافظة</option>';
        governorates.forEach(g => {
            const option = document.createElement('option');
            option.value = g.id;
            option.textContent = g.name_ar;
            option.dataset.lat = g.latitude || '';
            option.dataset.lng = g.longitude || '';
            select.appendChild(option);
        });

        return governorates;
    } catch (err) {
        console.error('Load governorates error:', err);
        showToast('فشل تحميل قائمة المحافظات', 'error');
        return [];
    }
}

// Load cities by governorate
async function loadCities(governorateId, selectElementId = 'city-select') {
    try {
        const select = document.getElementById(selectElementId);
        if (!select) return;

        // Clear dependent dropdowns
        const districtSelect = document.getElementById('district-select');
        if (districtSelect) {
            districtSelect.innerHTML = '<option value="">اختر الحي/المركز</option>';
        }

        if (!governorateId) {
            select.innerHTML = '<option value="">اختر المدينة</option>';
            return [];
        }

        select.innerHTML = '<option value="">جاري التحميل...</option>';

        const data = await apiCall(`/locations/geo/governorates/${governorateId}/cities`);
        const cities = data.cities || [];

        select.innerHTML = '<option value="">اختر المدينة</option>';
        cities.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.name_ar;
            option.dataset.lat = c.latitude || '';
            option.dataset.lng = c.longitude || '';
            select.appendChild(option);
        });

        selectedGovernorate = governorateId;
        return cities;
    } catch (err) {
        console.error('Load cities error:', err);
        showToast('فشل تحميل قائمة المدن', 'error');
        return [];
    }
}

// Load districts by city
async function loadDistricts(cityId, selectElementId = 'district-select') {
    try {
        const select = document.getElementById(selectElementId);
        if (!select) return;

        if (!cityId) {
            select.innerHTML = '<option value="">اختر الحي/المركز</option>';
            return [];
        }

        select.innerHTML = '<option value="">جاري التحميل...</option>';

        const data = await apiCall(`/locations/geo/cities/${cityId}/districts`);
        const districts = data.districts || [];

        select.innerHTML = '<option value="">اختر الحي/المركز</option>';
        districts.forEach(d => {
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = d.name_ar;
            option.dataset.postal = d.postal_code || '';
            select.appendChild(option);
        });

        selectedCity = cityId;
        return districts;
    } catch (err) {
        console.error('Load districts error:', err);
        showToast('فشل تحميل قائمة الأحياء', 'error');
        return [];
    }
}

// Get user's current location
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('المتصفح لا يدعم تحديد الموقع'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                currentPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                resolve(currentPosition);
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// Get location by address (using geocoding)
async function geocodeAddress(address) {
    try {
        // Try using Nominatim (OpenStreetMap) for geocoding
        const encodedAddress = encodeURIComponent(address);
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&country=EG`,
            {
                headers: {
                    'User-Agent': 'CuraLink/1.0'
                }
            }
        );

        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                displayName: data[0].display_name
            };
        }

        return null;
    } catch (err) {
        console.error('Geocoding error:', err);
        return null;
    }
}

// Get address from coordinates (reverse geocoding)
async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            {
                headers: {
                    'User-Agent': 'CuraLink/1.0'
                }
            }
        );

        const data = await response.json();
        
        if (data) {
            return {
                address: data.display_name,
                city: data.address.city || data.address.town || data.address.village,
                district: data.address.suburb || data.address.neighbourhood,
                country: data.address.country
            };
        }

        return null;
    } catch (err) {
        console.error('Reverse geocoding error:', err);
        return null;
    }
}

// ============================================
// Location Management Functions
// ============================================

// Load user's saved locations
async function loadMyLocations() {
    try {
        const data = await apiCall('/locations');
        return data.locations || [];
    } catch (err) {
        console.error('Load locations error:', err);
        showToast('فشل تحميل المواقع المحفوظة', 'error');
        return [];
    }
}

// Add new location
async function addLocation(locationData) {
    try {
        const response = await apiCall('/locations', 'POST', locationData);

        showToast('تم إضافة الموقع بنجاح', 'success');
        return response.location_id;
    } catch (err) {
        console.error('Add location error:', err);
        showToast('فشل إضافة الموقع', 'error');
        return null;
    }
}

// Update location
async function updateLocation(locationId, locationData) {
    try {
        const response = await apiCall(`/locations/locations/${locationId}`, 'PUT', locationData);

        showToast('تم تحديث الموقع بنجاح', 'success');
        return true;
    } catch (err) {
        console.error('Update location error:', err);
        showToast('فشل تحديث الموقع', 'error');
        return false;
    }
}

// Delete location
async function deleteLocation(locationId) {
    try {
        const response = await apiCall(`/locations/locations/${locationId}`, 'DELETE');

        showToast('تم حذف الموقع بنجاح', 'success');
        return true;
    } catch (err) {
        console.error('Delete location error:', err);
        showToast('فشل حذف الموقع', 'error');
        return false;
    }
}

// ============================================
// Delivery Functions
// ============================================

// Check if delivery is available to a location
async function checkDeliveryCoverage(latitude, longitude, governorateId = null, cityId = null) {
    try {
        const response = await apiCall('/locations/delivery/check-coverage', 'POST', {
            latitude,
            longitude,
            governorate_id: governorateId,
            city_id: cityId
        });

        return response;
    } catch (err) {
        console.error('Check coverage error:', err);
        return { available: false, warehouses: [] };
    }
}

// Calculate delivery fee
async function calculateDeliveryFee(warehouseId, latitude, longitude) {
    try {
        const response = await apiCall('/locations/delivery/calculate-fee', 'POST', {
            warehouse_id: warehouseId,
            latitude,
            longitude
        });

        return response;
    } catch (err) {
        console.error('Calculate fee error:', err);
        return null;
    }
}

// Get warehouses that deliver to a location
async function getDeliveryWarehouses(latitude, longitude) {
    try {
        const response = await apiCall(
            `/api/locations/delivery/warehouses?latitude=${latitude}&longitude=${longitude}`
        );

        return response.warehouses || [];
    } catch (err) {
        console.error('Get warehouses error:', err);
        return [];
    }
}

// ============================================
// Map Functions (using Leaflet.js)
// ============================================

// Initialize map
function initMap(containerId, options = {}) {
    const defaults = {
        center: [30.0444, 31.2357], // Cairo
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: true
    };

    const config = { ...defaults, ...options };

    // Check if Leaflet is available
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return null;
    }

    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Map container not found');
        return null;
    }

    // Remove existing map if any
    if (locationMap) {
        locationMap.remove();
    }

    locationMap = L.map(containerId).setView(config.center, config.zoom);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(locationMap);

    return locationMap;
}

// Add marker to map
function addMapMarker(lat, lng, options = {}) {
    if (!locationMap) return null;

    const defaults = {
        draggable: false,
        title: 'الموقع'
    };

    const config = { ...defaults, ...options };

    const marker = L.marker([lat, lng], {
        draggable: config.draggable,
        title: config.title
    }).addTo(locationMap);

    if (config.popup) {
        marker.bindPopup(config.popup);
    }

    if (config.onDragEnd) {
        marker.on('dragend', config.onDragEnd);
    }

    return marker;
}

// Clear all markers
function clearMapMarkers() {
    if (!locationMap) return;

    locationMarkers.forEach(marker => {
        locationMap.removeLayer(marker);
    });
    locationMarkers = [];
}

// Center map on location
function centerMap(lat, lng, zoom = 15) {
    if (!locationMap) return;

    locationMap.setView([lat, lng], zoom);
}

// Get map center
function getMapCenter() {
    if (!locationMap) return null;
    const center = locationMap.getCenter();
    return { lat: center.lat, lng: center.lng };
}

// ============================================
// UI Helper Functions
// ============================================

// Show location modal for adding/editing
function showLocationModal(location = null) {
    const modal = document.getElementById('location-modal');
    if (!modal) {
        // Create modal if not exists
        createLocationModal();
    }

    const modalElement = document.getElementById('location-modal');
    const form = document.getElementById('location-form');
    
    if (location) {
        // Edit mode
        document.getElementById('location-modal-title').textContent = 'تعديل الموقع';
        document.getElementById('location-id').value = location.id;
        document.getElementById('location-name').value = location.name || '';
        document.getElementById('location-address').value = location.address || '';
        document.getElementById('location-phone').value = location.phone || '';
        document.getElementById('location-notes').value = location.notes || '';
        document.getElementById('location-lat').value = location.latitude || '';
        document.getElementById('location-lng').value = location.longitude || '';
        document.getElementById('location-building').value = location.building_number || '';
        document.getElementById('location-floor').value = location.floor_number || '';
        document.getElementById('location-apartment').value = location.apartment_number || '';
        document.getElementById('location-landmark').value = location.landmark || '';
        document.getElementById('location-postal').value = location.postal_code || '';
        document.getElementById('location-delivery-instructions').value = location.delivery_instructions || '';
        document.getElementById('location-primary').checked = location.is_primary === 1;
        
        // Set location type
        const typeSelect = document.getElementById('location-type');
        if (typeSelect) {
            typeSelect.value = location.location_type || 'pharmacy';
        }

        // Load geographic data
        if (location.governorate_id) {
            loadCities(location.governorate_id, 'location-governorate').then(() => {
                const citySelect = document.getElementById('location-city');
                if (citySelect && location.city_id) {
                    citySelect.value = location.city_id;
                    loadDistricts(location.city_id, 'location-district').then(() => {
                        const districtSelect = document.getElementById('location-district');
                        if (districtSelect && location.district_id) {
                            districtSelect.value = location.district_id;
                        }
                    });
                }
            });
            
            const governorateSelect = document.getElementById('location-governorate');
            if (governorateSelect) {
                governorateSelect.value = location.governorate_id;
            }
        }
    } else {
        // Add mode
        document.getElementById('location-modal-title').textContent = 'إضافة موقع جديد';
        form.reset();
        document.getElementById('location-id').value = '';
    }

    // Load governorates
    loadGovernorates('location-governorate');

    modalElement.style.display = 'block';
}

// Close location modal
function closeLocationModal() {
    const modal = document.getElementById('location-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Create location modal HTML
function createLocationModal() {
    const modalHTML = `
    <div id="location-modal" class="modal">
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h3 id="location-modal-title">إضافة موقع جديد</h3>
                <button class="close-btn" onclick="closeLocationModal()">&times;</button>
            </div>
            <form id="location-form" onsubmit="saveLocation(event)">
                <input type="hidden" id="location-id">
                
                <div class="form-section">
                    <h4>معلومات الموقع الأساسية</h4>
                    
                    <div class="form-group">
                        <label>اسم الموقع *</label>
                        <input type="text" id="location-name" required placeholder="مثال: صيدلية المدينة">
                    </div>
                    
                    <div class="form-group">
                        <label>نوع الموقع</label>
                        <select id="location-type">
                            <option value="pharmacy">صيدلية</option>
                            <option value="warehouse">مخزن</option>
                            <option value="delivery_point">نقطة توصيل</option>
                        </select>
                    </div>
                </div>

                <div class="form-section">
                    <h4>الموقع الجغرافي</h4>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>المحافظة *</label>
                            <select id="location-governorate" onchange="onGovernorateChange(this.value)" required>
                                <option value="">اختر المحافظة</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>المدينة</label>
                            <select id="location-city" onchange="onCityChange(this.value)">
                                <option value="">اختر المدينة</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>الحي/المركز</label>
                            <select id="location-district">
                                <option value="">اختر الحي</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>العنوان التفصيلي *</label>
                        <input type="text" id="location-address" required placeholder="الحي، street name، رقم المبنى">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>رقم المبنى</label>
                            <input type="text" id="location-building" placeholder="رقم المبنى">
                        </div>
                        
                        <div class="form-group">
                            <label>الطابق</label>
                            <input type="text" id="location-floor" placeholder="الطابق">
                        </div>
                        
                        <div class="form-group">
                            <label>الشقة/الوحدة</label>
                            <input type="text" id="location-apartment" placeholder="رقم الشقة">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>علامة مميزة قريبة</label>
                        <input type="text" id="location-landmark" placeholder="مثال: بجوار سوبرماركت">
                    </div>
                    
                    <div class="form-group">
                        <label>الرمز البريدي</label>
                        <input type="text" id="location-postal" placeholder="الرمز البريدي">
                    </div>
                </div>

                <div class="form-section">
                    <h4>إحداثيات GPS</h4>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>خط العرض</label>
                            <input type="number" step="any" id="location-lat" required placeholder="latitude">
                        </div>
                        
                        <div class="form-group">
                            <label>خط الطول</label>
                            <input type="number" step="any" id="location-lng" required placeholder="longitude">
                        </div>
                    </div>
                    
                    <button type="button" class="btn btn-secondary" onclick="useCurrentLocation()">
                        <i class="fas fa-map-marker-alt"></i>
                        تحديد موقعي الحالي
                    </button>
                    
                    <div id="location-map" style="height: 300px; margin-top: 15px; border-radius: 8px;"></div>
                </div>

                <div class="form-section">
                    <h4>معلومات إضافية</h4>
                    
                    <div class="form-group">
                        <label>رقم الهاتف</label>
                        <input type="tel" id="location-phone" placeholder="01xxxxxxxxx">
                    </div>
                    
                    <div class="form-group">
                        <label>ملاحظات</label>
                        <textarea id="location-notes" placeholder="أي ملاحظات إضافية"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>تعليمات التوصيل</label>
                        <textarea id="location-delivery-instructions" placeholder="تعليمات خاصة للتوصيل"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="location-primary">
                            جعل هذا الموقع الأساسي
                        </label>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeLocationModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ الموقع</button>
                </div>
            </form>
        </div>
    </div>
    `;

    // Add modal to body
    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div);

    // Add styles
    addLocationModalStyles();

    return document.getElementById('location-modal');
}

// Add modal styles
function addLocationModalStyles() {
    if (document.getElementById('location-modal-styles')) return;

    const styles = `
    .modal-large {
        max-width: 700px;
        max-height: 90vh;
        overflow-y: auto;
    }
    
    .form-section {
        margin-bottom: 25px;
        padding-bottom: 20px;
        border-bottom: 1px solid #eee;
    }
    
    .form-section h4 {
        margin-bottom: 15px;
        color: #333;
        font-size: 16px;
    }
    
    .form-row {
        display: flex;
        gap: 15px;
    }
    
    .form-row .form-group {
        flex: 1;
    }
    
    #location-map {
        width: 100%;
        background: #f5f5f5;
        border-radius: 8px;
    }
    
    .form-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
    }
    `;

    const styleElement = document.createElement('style');
    styleElement.id = 'location-modal-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
}

// Handle governorate change
function onGovernorateChange(governorateId) {
    loadCities(governorateId, 'location-city');
}

// Handle city change
function onCityChange(cityId) {
    loadDistricts(cityId, 'location-district');
}

// Use current location
async function useCurrentLocation() {
    try {
        showToast('جاري تحديد موقعك...', 'info');
        
        const position = await getCurrentLocation();
        
        document.getElementById('location-lat').value = position.lat.toFixed(6);
        document.getElementById('location-lng').value = position.lng.toFixed(6);

        // Try to get address from coordinates
        const addressInfo = await reverseGeocode(position.lat, position.lng);
        
        if (addressInfo && addressInfo.address) {
            document.getElementById('location-address').value = addressInfo.address;
            
            // Try to match governorate and city
            if (addressInfo.city) {
                // Find city in dropdown
                const citySelect = document.getElementById('location-city');
                for (let i = 0; i < citySelect.options.length; i++) {
                    if (citySelect.options[i].text.includes(addressInfo.city)) {
                        citySelect.selectedIndex = i;
                        onCityChange(citySelect.value);
                        break;
                    }
                }
            }
        }

        showToast('تم تحديد موقعك بنجاح', 'success');
    } catch (err) {
        console.error('Get location error:', err);
        showToast('تعذر تحديد الموقع: ' + err.message, 'error');
    }
}

// Save location from form
async function saveLocation(event) {
    event.preventDefault();

    const locationId = document.getElementById('location-id').value;
    const locationData = {
        name: document.getElementById('location-name').value,
        address: document.getElementById('location-address').value,
        latitude: parseFloat(document.getElementById('location-lat').value),
        longitude: parseFloat(document.getElementById('location-lng').value),
        phone: document.getElementById('location-phone').value,
        notes: document.getElementById('location-notes').value,
        location_type: document.getElementById('location-type').value,
        is_primary: document.getElementById('location-primary').checked,
        governorate_id: document.getElementById('location-governorate').value || null,
        city_id: document.getElementById('location-city').value || null,
        district_id: document.getElementById('location-district').value || null,
        building_number: document.getElementById('location-building').value || null,
        floor_number: document.getElementById('location-floor').value || null,
        apartment_number: document.getElementById('location-apartment').value || null,
        landmark: document.getElementById('location-landmark').value || null,
        postal_code: document.getElementById('location-postal').value || null,
        delivery_instructions: document.getElementById('location-delivery-instructions').value || null
    };

    let success = false;
    
    if (locationId) {
        success = await updateLocation(locationId, locationData);
    } else {
        const newId = await addLocation(locationData);
        success = newId !== null;
    }

    if (success) {
        closeLocationModal();
        
        // Reload locations list if exists
        if (typeof loadLocationsPage === 'function') {
            loadLocationsPage();
        }
    }
}

// ============================================
// Search Locations
// ============================================

// Search for governorates, cities, districts
async function searchLocations(query) {
    try {
        const response = await apiCall(`/locations/geo/search?q=${encodeURIComponent(query)}`);
        return response.results || { governorates: [], cities: [], districts: [] };
    } catch (err) {
        console.error('Search locations error:', err);
        return { governorates: [], cities: [], districts: [] };
    }
}

// Load geographic hierarchy for dropdowns
async function loadGeographicHierarchy() {
    try {
        const response = await apiCall('/locations/geo/hierarchy');
        return response || [];
    } catch (err) {
        console.error('Load hierarchy error:', err);
        return [];
    }
}

// ============================================
// Initialize on page load
// ============================================

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Check if location page is active
    if (document.getElementById('locations-page') || document.getElementById('location-modal')) {
        // Initialize location features
        console.log('Location features ready');
    }
});

// Export functions to global scope
window.loadGovernorates = loadGovernorates;
window.loadCities = loadCities;
window.loadDistricts = loadDistricts;
window.getCurrentLocation = getCurrentLocation;
window.geocodeAddress = geocodeAddress;
window.reverseGeocode = reverseGeocode;
window.loadMyLocations = loadMyLocations;
window.addLocation = addLocation;
window.updateLocation = updateLocation;
window.deleteLocation = deleteLocation;
window.checkDeliveryCoverage = checkDeliveryCoverage;
window.calculateDeliveryFee = calculateDeliveryFee;
window.getDeliveryWarehouses = getDeliveryWarehouses;
window.initMap = initMap;
window.addMapMarker = addMapMarker;
window.clearMapMarkers = clearMapMarkers;
window.centerMap = centerMap;
window.getMapCenter = getMapCenter;
window.showLocationModal = showLocationModal;
window.closeLocationModal = closeLocationModal;
window.createLocationModal = createLocationModal;
window.onGovernorateChange = onGovernorateChange;
window.onCityChange = onCityChange;
window.useCurrentLocation = useCurrentLocation;
window.saveLocation = saveLocation;
window.searchLocations = searchLocations;
window.loadGeographicHierarchy = loadGeographicHierarchy;
