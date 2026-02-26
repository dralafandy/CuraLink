// ============================================
// Delivery Zone Management System
// For Warehouse Delivery Configuration
// ============================================

// Load delivery zones page
async function loadDeliveryZonesPage() {
    try {
        const data = await apiCall('/locations/delivery-zones');
        const zones = data.zones || [];
        
        const container = document.getElementById('delivery-zones-list');
        if (!container) return;

        if (zones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-truck"></i>
                    <p>لا توجد مناطق توصيل محددة</p>
                    <button class="btn btn-primary" onclick="showAddDeliveryZoneModal()">
                        إضافة منطقة توصيل
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = zones.map(zone => `
            <div class="zone-card" data-zone-id="${zone.id}">
                <div class="zone-header">
                    <div class="zone-title">
                        <h4>${zone.governorate_name || 'جميع المحافظ'}${zone.city_name ? ' - ' + zone.city_name : ''}</h4>
                        <span class="badge ${zone.is_active ? 'badge-success' : 'badge-inactive'}">
                            ${zone.is_active ? 'نشط' : 'غير نشط'}
                        </span>
                    </div>
                    <div class="zone-actions">
                        <button class="btn-icon" onclick="editDeliveryZone(${zone.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="toggleDeliveryZoneStatus(${zone.id}, ${zone.is_active ? 0 : 1})">
                            <i class="fas fa-toggle-${zone.is_active ? 'on' : 'off'}"></i>
                        </button>
                        <button class="btn-icon btn-danger" onclick="deleteDeliveryZone(${zone.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="zone-details">
                    <div class="zone-fee">
                        <span class="label">رسوم التوصيل:</span>
                        <span class="value">${zone.base_fee || 0} EGP</span>
                        ${zone.per_km_fee > 0 ? `<span class="per-km">+ ${zone.per_km_fee}/كم</span>` : ''}
                    </div>
                    <div class="zone-min">
                        <span class="label">الحد الأدنى:</span>
                        <span class="value">${zone.min_order_amount || 0} EGP</span>
                    </div>
                    <div class="zone-free">
                        <span class="label">التوصيل المجاني:</span>
                        <span class="value">${zone.free_delivery_threshold || 0} EGP</span>
                    </div>
                    <div class="zone-time">
                        <span class="label">وقت التوصيل:</span>
                        <span class="value">${zone.estimated_delivery_hours || 24} ساعة</span>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Load delivery zones error:', err);
        showToast('فشل تحميل مناطق التوصيل', 'error');
    }
}

// Show add delivery zone modal
function showAddDeliveryZoneModal() {
    createDeliveryZoneModal();
    document.getElementById('delivery-zone-modal-title').textContent = 'إضافة منطقة توصيل';
    document.getElementById('delivery-zone-form').reset();
    document.getElementById('delivery-zone-id').value = '';
    
    // Load governorates
    loadGovernorates('zone-governorate');
    
    const modal = document.getElementById('delivery-zone-modal');
    modal.style.display = 'block';
}

// Edit delivery zone
async function editDeliveryZone(zoneId) {
    try {
        // Get zone details from the list
        const zones = await apiCall('/locations/delivery-zones');
        const zone = zones.zones.find(z => z.id === zoneId);
        
        if (!zone) {
            showToast('المنطقة غير موجودة', 'error');
            return;
        }

        createDeliveryZoneModal();
        
        document.getElementById('delivery-zone-modal-title').textContent = 'تعديل منطقة التوصيل';
        document.getElementById('delivery-zone-id').value = zone.id;
        document.getElementById('zone-base-fee').value = zone.base_fee || 0;
        document.getElementById('zone-per-km').value = zone.per_km_fee || 0;
        document.getElementById('zone-min-order').value = zone.min_order_amount || 0;
        document.getElementById('zone-free-threshold').value = zone.free_delivery_threshold || 0;
        document.getElementById('zone-delivery-hours').value = zone.estimated_delivery_hours || 24;
        document.getElementById('zone-active').checked = zone.is_active === 1;

        // Load governorates and set selected
        loadGovernorates('zone-governorate').then(() => {
            if (zone.governorate_id) {
                document.getElementById('zone-governorate').value = zone.governorate_id;
                loadCities(zone.governorate_id, 'zone-city').then(() => {
                    if (zone.city_id) {
                        document.getElementById('zone-city').value = zone.city_id;
                    }
                });
            }
        });

        const modal = document.getElementById('delivery-zone-modal');
        modal.style.display = 'block';

    } catch (err) {
        console.error('Edit delivery zone error:', err);
        showToast('فشل تحميل بيانات المنطقة', 'error');
    }
}

// Toggle delivery zone status
async function toggleDeliveryZoneStatus(zoneId, newStatus) {
    try {
        await apiCall(`/locations/delivery-zones/${zoneId}`, 'PUT', { is_active: newStatus });

        showToast('تم تحديث حالة المنطقة', 'success');
        loadDeliveryZonesPage();
    } catch (err) {
        console.error('Toggle status error:', err);
        showToast('فشل تحديث الحالة', 'error');
    }
}

// Delete delivery zone
async function deleteDeliveryZone(zoneId) {
    if (!confirm('هل أنت متأكد من حذف هذه المنطقة؟')) {
        return;
    }

    try {
        await apiCall(`/locations/delivery-zones/${zoneId}`, 'DELETE');

        showToast('تم حذف المنطقة بنجاح', 'success');
        loadDeliveryZonesPage();
    } catch (err) {
        console.error('Delete delivery zone error:', err);
        showToast('فشل حذف المنطقة', 'error');
    }
}

// Save delivery zone
async function saveDeliveryZone(event) {
    event.preventDefault();

    const zoneId = document.getElementById('delivery-zone-id').value;
    const zoneData = {
        governorate_id: document.getElementById('zone-governorate').value || null,
        city_id: document.getElementById('zone-city').value || null,
        zone_type: 'administrative',
        base_fee: parseFloat(document.getElementById('zone-base-fee').value) || 15,
        per_km_fee: parseFloat(document.getElementById('zone-per-km').value) || 0,
        min_order_amount: parseFloat(document.getElementById('zone-min-order').value) || 500,
        free_delivery_threshold: parseFloat(document.getElementById('zone-free-threshold').value) || 2000,
        estimated_delivery_hours: parseInt(document.getElementById('zone-delivery-hours').value) || 24,
        is_active: document.getElementById('zone-active').checked ? 1 : 0
    };

    try {
        if (zoneId) {
            await apiCall(`/locations/delivery-zones/${zoneId}`, 'PUT', zoneData);
            showToast('تم تحديث منطقة التوصيل بنجاح', 'success');
        } else {
            await apiCall('/locations/delivery-zones', 'POST', zoneData);
            showToast('تم إضافة منطقة التوصيل بنجاح', 'success');
        }

        closeDeliveryZoneModal();
        loadDeliveryZonesPage();
    } catch (err) {
        console.error('Save delivery zone error:', err);
        showToast('فشل حفظ المنطقة', 'error');
    }
}

// Close delivery zone modal
function closeDeliveryZoneModal() {
    const modal = document.getElementById('delivery-zone-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Create delivery zone modal HTML
function createDeliveryZoneModal() {
    if (document.getElementById('delivery-zone-modal')) {
        return;
    }

    const modalHTML = `
    <div id="delivery-zone-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="delivery-zone-modal-title">إضافة منطقة توصيل</h3>
                <button class="close-btn" onclick="closeDeliveryZoneModal()">&times;</button>
            </div>
            <form id="delivery-zone-form" onsubmit="saveDeliveryZone(event)">
                <input type="hidden" id="delivery-zone-id">
                
                <div class="form-group">
                    <label>المحافظة</label>
                    <select id="zone-governorate" onchange="onZoneGovernorateChange(this.value)">
                        <option value="">كل المحافظ</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>المدينة</label>
                    <select id="zone-city">
                        <option value="">كل المدن</option>
                    </select>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>رسوم التوصيل الأساسية (EGP)</label>
                        <input type="number" id="zone-base-fee" value="15" min="0" step="0.01">
                    </div>
                    
                    <div class="form-group">
                        <label>رسوم لكل كم إضافية (EGP)</label>
                        <input type="number" id="zone-per-km" value="0" min="0" step="0.01">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>الحد الأدنى للطلب (EGP)</label>
                        <input type="number" id="zone-min-order" value="500" min="0">
                    </div>
                    
                    <div class="form-group">
                        <label>حد التوصيل المجاني (EGP)</label>
                        <input type="number" id="zone-free-threshold" value="2000" min="0">
                    </div>
                </div>
                
                <div class="form-group">
                    <label>وقت التوصيل المتوقع (ساعات)</label>
                    <input type="number" id="zone-delivery-hours" value="24" min="1">
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="zone-active" checked>
                        نشط
                    </label>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeDeliveryZoneModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ</button>
                </div>
            </form>
        </div>
    </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div);
}

// Handle zone governorate change
function onZoneGovernorateChange(governorateId) {
    loadCities(governorateId, 'zone-city');
}

// Export functions to global scope
window.loadDeliveryZonesPage = loadDeliveryZonesPage;
window.showAddDeliveryZoneModal = showAddDeliveryZoneModal;
window.editDeliveryZone = editDeliveryZone;
window.toggleDeliveryZoneStatus = toggleDeliveryZoneStatus;
window.deleteDeliveryZone = deleteDeliveryZone;
window.saveDeliveryZone = saveDeliveryZone;
window.closeDeliveryZoneModal = closeDeliveryZoneModal;
window.createDeliveryZoneModal = createDeliveryZoneModal;
window.onZoneGovernorateChange = onZoneGovernorateChange;
