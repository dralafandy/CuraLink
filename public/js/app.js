// PharmaConnect - Frontend JavaScript

// ========================================
// Configuration & State
// ========================================

const API_BASE = '/api';
let currentUser = null;
let cart = [];
let products = [];
let wishlistProductIds = new Set();
let orders = [];
let notifications = [];
const notificationFilters = { read: '', type: '', grouped: false };
let notificationPage = 1;
let notificationPagination = null;
let notificationSettingsCache = null;
let pushState = { supported: false, enabled: false, publicKey: null, swRegistration: null };
let productSearchDebounceTimer = null;
let warehouseProductSearchDebounceTimer = null;
let pharmacyProductsPage = 1;
let pharmacyProductsPagination = null;
const IMPORT_ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

function getMobileNavItemsForRole(role) {
    if (role === 'warehouse') {
        return [
            { label: 'الرئيسية', icon: 'fa-house', page: 'dashboard' },
            { label: 'المنتجات', icon: 'fa-boxes', page: 'products' },
            { label: 'الطلبات', icon: 'fa-shopping-cart', page: 'orders' },
            { label: 'الإشعارات', icon: 'fa-bell', page: 'notifications' },
            { label: 'القائمة', icon: 'fa-bars', action: 'menu' },
            { label: 'خروج', icon: 'fa-sign-out-alt', action: 'logout' }
        ];
    }

    if (role === 'pharmacy') {
        return [
            { label: 'الرئيسية', icon: 'fa-house', page: 'dashboard' },
            { label: 'تصفح', icon: 'fa-search', page: 'browse-products' },
            { label: 'السلة', icon: 'fa-shopping-basket', page: 'cart' },
            { label: 'الإشعارات', icon: 'fa-bell', page: 'notifications' },
            { label: 'القائمة', icon: 'fa-bars', action: 'menu' },
            { label: 'خروج', icon: 'fa-sign-out-alt', action: 'logout' }
        ];
    }

    return [
        { label: 'الرئيسية', icon: 'fa-house', page: 'dashboard' },
        { label: 'الطلبات', icon: 'fa-shopping-cart', page: 'orders' },
        { label: 'الفواتير', icon: 'fa-file-invoice-dollar', page: 'invoices' },
        { label: 'الإشعارات', icon: 'fa-bell', page: 'notifications' },
        { label: 'القائمة', icon: 'fa-bars', action: 'menu' },
        { label: 'خروج', icon: 'fa-sign-out-alt', action: 'logout' }
    ];
}

function syncMobileBottomNav(page) {
    document.querySelectorAll('.mobile-nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.page === page);
    });
}

function ensureMobileBottomNav() {
    const appRoot = document.getElementById('app');
    if (!appRoot || !currentUser) return;

    let nav = document.getElementById('mobile-bottom-nav');
    if (!nav) {
        nav = document.createElement('nav');
        nav.id = 'mobile-bottom-nav';
        nav.className = 'mobile-bottom-nav';
        nav.setAttribute('aria-label', 'التنقل السريع على الموبايل');
        appRoot.appendChild(nav);
    }

    const navItems = getMobileNavItemsForRole(currentUser.role);
    nav.style.setProperty('--mobile-nav-columns', String(navItems.length));
    nav.innerHTML = navItems.map((item) => `
        <button type="button" class="mobile-nav-item${item.action === 'logout' ? ' mobile-nav-item--logout' : ''}" ${item.page ? `data-page="${item.page}"` : ''} aria-label="${item.label}">
            <i class="fas ${item.icon}"></i>
            <span>${item.label}</span>
        </button>
    `).join('');

    nav.querySelectorAll('.mobile-nav-item').forEach((button, index) => {
        button.addEventListener('click', () => {
            const item = navItems[index];
            if (!item) return;
            if (item.page) {
                navigateTo(item.page);
                return;
            }
            if (item.action === 'menu') {
                toggleSidebar();
                return;
            }
            if (item.action === 'logout') {
                logout();
            }
        });
    });
}

// ========================================
// API Helper
// ========================================

async function apiCall(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    
    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        let data = null;
        let textBody = '';

        try {
            textBody = await response.text();
            data = textBody ? JSON.parse(textBody) : null;
        } catch (_) {
            data = null;
        }

        if (!response.ok) {
            if (data && data.error) {
                throw new Error(data.error);
            }

            const oneLine = (textBody || '').replace(/\s+/g, ' ').trim();
            const lower = oneLine.toLowerCase();

            if (lower.includes('authentication required') || lower.includes('vercel authentication')) {
                throw new Error('النشر محمي على Vercel. عطّل Deployment Protection أو استخدم رابطًا عامًا.');
            }

            if (lower.includes('server error')) {
                throw new Error('حدث خطأ داخلي في الخادم. حاول مرة أخرى');
            }

            throw new Error(`فشل الطلب (${response.status})`);
        }

        if (!data) {
            const looksLikeHtml = textBody && textBody.trim().startsWith('<!DOCTYPE');
            if (looksLikeHtml) {
                throw new Error('Endpoint API غير متاح حالياً (تم استلام HTML بدلاً من JSON)');
            }
            throw new Error('استجابة غير متوقعة من الخادم');
        }

        return data;
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// ========================================
// Auth Functions
// ========================================

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    cart = [];
    
    // Redirect to login page
    window.location.href = '/login';
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        currentUser = JSON.parse(user);
        showApp();
    } else {
        // Not authenticated, redirect to login page
        window.location.href = '/login';
    }
}

// ========================================
// App Navigation
// ========================================

function showApp() {
    document.getElementById('app').classList.add('active');
    
    // Update user info
    document.getElementById('user-name').textContent = currentUser.username;
    document.getElementById('user-role').textContent = getRoleName(currentUser.role);
    
    // Show appropriate menu
    const warehouseMenu = document.querySelector('.warehouse-menu');
    const pharmacyMenu = document.querySelector('.pharmacy-menu');
    
    if (currentUser.role === 'warehouse') {
        warehouseMenu.style.display = 'block';
        pharmacyMenu.style.display = 'none';
    } else if (currentUser.role === 'pharmacy') {
        warehouseMenu.style.display = 'none';
        pharmacyMenu.style.display = 'block';
    }

    ensureMobileBottomNav();
    
    // Navigate to dashboard
    navigateTo('dashboard');
    
    // Load notifications count
    loadNotificationsCount();
    initializeWebPush().catch(() => {});
}

function navigateTo(page) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });
    
    // Update pages
    document.querySelectorAll('.content-page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${page}-page`).classList.add('active');
    
    // Update title
    const titles = {
        'dashboard': 'لوحة التحكم',
        'products': 'إدارة المنتجات',
        'browse-products': 'تصفح المنتجات',
        'wishlist': 'المفضلة',
        'orders': 'الطلبات',
        'my-orders': 'طلباتي',
        'cart': 'السلة',
        'invoices': 'الفواتير',
        'notifications': 'الإشعارات',
        'ratings': 'التقييمات',
        'profile': 'الملف الشخصي'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    syncMobileBottomNav(page);
    
    // Load data for page
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'products':
            loadWarehouseProducts();
            break;
        case 'browse-products':
            loadPharmacyProducts();
            break;
        case 'wishlist':
            loadWishlistPage();
            break;
        case 'orders':
            loadWarehouseOrders();
            break;
        case 'my-orders':
            loadPharmacyOrders();
            break;
        case 'cart':
            renderCart();
            break;
        case 'invoices':
            loadInvoices();
            break;
        case 'notifications':
            loadNotifications();
            break;
        case 'ratings':
            loadRatings();
            break;
        case 'profile':
            loadProfile();
            break;
    }
    
    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
        document.querySelector('.sidebar').classList.remove('open');
    }
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
}

// ========================================
// Profile
// ========================================

async function loadProfile() {
    try {
        const data = await apiCall('/auth/me');
        if (!data?.user) return;

        currentUser = { ...currentUser, ...data.user };
        localStorage.setItem('user', JSON.stringify(currentUser));

        document.getElementById('profile-username').value = data.user.username || '';
        document.getElementById('profile-email').value = data.user.email || '';
        document.getElementById('profile-phone').value = data.user.phone || '';
        document.getElementById('profile-address').value = data.user.address || '';
    } catch (error) {
        // apiCall already shows toast
    }
}

async function updateProfile(event) {
    event.preventDefault();

    const phone = document.getElementById('profile-phone').value.trim();
    const address = document.getElementById('profile-address').value.trim();

    try {
        const data = await apiCall('/auth/me', 'PUT', { phone, address });
        if (!data?.user) return;

        currentUser = { ...currentUser, ...data.user };
        localStorage.setItem('user', JSON.stringify(currentUser));

        document.getElementById('user-name').textContent = currentUser.username;
        showToast('تم تحديث الملف الشخصي بنجاح', 'success');
    } catch (error) {
        // apiCall already shows toast
    }
}

// ========================================
// Dashboard
// ========================================

function getDashboardQuickActions(role) {
    if (role === 'warehouse') {
        return [
            { icon: 'fa-boxes', label: 'إدارة المنتجات', action: () => navigateTo('products') },
            { icon: 'fa-shopping-cart', label: 'الطلبات', action: () => navigateTo('orders') },
            { icon: 'fa-plus', label: 'إضافة منتج', action: () => showAddProductModal() },
            { icon: 'fa-bell', label: 'الإشعارات', action: () => navigateTo('notifications') }
        ];
    }
    if (role === 'pharmacy') {
        return [
            { icon: 'fa-search', label: 'تصفح المنتجات', action: () => navigateTo('browse-products') },
            { icon: 'fa-shopping-basket', label: 'السلة', action: () => navigateTo('cart') },
            { icon: 'fa-truck', label: 'طلباتي', action: () => navigateTo('my-orders') },
            { icon: 'fa-heart', label: 'المفضلة', action: () => navigateTo('wishlist') }
        ];
    }
    return [
        { icon: 'fa-shopping-cart', label: 'الطلبات', action: () => navigateTo('orders') },
        { icon: 'fa-file-invoice-dollar', label: 'الفواتير', action: () => navigateTo('invoices') },
        { icon: 'fa-bell', label: 'الإشعارات', action: () => navigateTo('notifications') },
        { icon: 'fa-star', label: 'التقييمات', action: () => navigateTo('ratings') }
    ];
}

function renderDashboardQuickActions(role) {
    const container = document.getElementById('dashboard-quick-actions');
    if (!container) return;

    const actions = getDashboardQuickActions(role);
    container.innerHTML = actions.map((action, index) => `
        <button type="button" class="quick-action-btn" data-dashboard-action-index="${index}">
            <i class="fas ${action.icon}"></i>
            <span>${action.label}</span>
        </button>
    `).join('');

    container.querySelectorAll('[data-dashboard-action-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const index = Number(btn.getAttribute('data-dashboard-action-index'));
            actions[index]?.action();
        });
    });
}

function formatCurrency(value) {
    const amount = Number(value || 0);
    return `${amount.toFixed(2)} ج.م`;
}

function isTodayDate(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

function renderDashboardStatusDistribution(orders = []) {
    const container = document.getElementById('dashboard-status-distribution');
    if (!container) return;

    const statusConfig = [
        { key: 'pending', label: 'قيد الانتظار' },
        { key: 'processing', label: 'قيد التنفيذ' },
        { key: 'shipped', label: 'تم الشحن' },
        { key: 'delivered', label: 'تم التسليم' },
        { key: 'cancelled', label: 'ملغي' }
    ];

    const total = orders.length || 1;
    container.innerHTML = statusConfig.map((status) => {
        const count = orders.filter((order) => order.status === status.key).length;
        const percent = Math.round((count / total) * 100);
        return `
            <div class="status-bar-item">
                <div class="status-bar-head">
                    <span>${status.label}</span>
                    <strong>${count}</strong>
                </div>
                <div class="status-bar-track">
                    <div class="status-bar-fill" style="width: ${percent}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderDashboardTodayKpis(role, { orders = [], invoices = [], products = [] } = {}) {
    const container = document.getElementById('dashboard-today-kpis');
    if (!container) return;

    const todayOrders = orders.filter((order) => isTodayDate(order.created_at));
    const todayRevenue = orders
        .filter((order) => order.status === 'delivered' && isTodayDate(order.created_at))
        .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const todayPending = orders.filter((order) => ['pending', 'processing'].includes(order.status)).length;
    const paidInvoicesToday = invoices.filter((invoice) => invoice.status === 'paid' && isTodayDate(invoice.created_at)).length;

    const cards = role === 'warehouse'
        ? [
            { label: 'طلبات اليوم', value: todayOrders.length },
            { label: 'مبيعات اليوم', value: formatCurrency(todayRevenue) },
            { label: 'منتجاتي', value: products.length },
            { label: 'تحتاج متابعة', value: todayPending }
        ]
        : role === 'pharmacy'
            ? [
                { label: 'طلبات اليوم', value: todayOrders.length },
                { label: 'تم التسليم', value: orders.filter((o) => o.status === 'delivered').length },
                { label: 'بانتظار التنفيذ', value: todayPending },
                { label: 'إجمالي الصرف', value: formatCurrency(orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)) }
            ]
            : [
                { label: 'طلبات اليوم', value: todayOrders.length },
                { label: 'إجمالي المبيعات', value: formatCurrency(todayRevenue) },
                { label: 'فواتير مدفوعة اليوم', value: paidInvoicesToday },
                { label: 'الطلبات المعلقة', value: todayPending }
            ];

    container.innerHTML = cards.map((item) => `
        <div class="today-kpi">
            <span class="label">${item.label}</span>
            <strong>${item.value}</strong>
        </div>
    `).join('');
}

function renderDashboardInsights(role, data = {}) {
    const container = document.getElementById('dashboard-insights');
    if (!container) return;

    const orders = data.orders || [];
    const products = data.products || [];
    const lowStockCount = products.filter((product) => Number(product.quantity || 0) < 10).length;
    const deliveredCount = orders.filter((order) => order.status === 'delivered').length;
    const completionRate = orders.length ? Math.round((deliveredCount / orders.length) * 100) : 0;
    const cancelledCount = orders.filter((order) => order.status === 'cancelled').length;

    const insights = role === 'warehouse'
        ? [
            `معدل إتمام الطلبات الحالي ${completionRate}%`,
            lowStockCount > 0 ? `هناك ${lowStockCount} منتج بمخزون منخفض` : 'المخزون مستقر ولا توجد منتجات منخفضة',
            cancelledCount > 0 ? `تم إلغاء ${cancelledCount} طلب حتى الآن` : 'لا توجد طلبات ملغاة حالياً'
        ]
        : role === 'pharmacy'
            ? [
                `لديك ${orders.length} طلب إجمالي`,
                deliveredCount > 0 ? `تم تسليم ${deliveredCount} طلب بنجاح` : 'لا توجد طلبات مسلمة حتى الآن',
                data.avgOrderValue > 0 ? `متوسط قيمة الطلب ${formatCurrency(data.avgOrderValue)}` : 'ابدأ أول طلب لعرض متوسط الصرف'
            ]
            : [
                `إجمالي الطلبات في النظام ${orders.length}`,
                `نسبة الإكمال الكلية ${completionRate}%`,
                data.totalProducts > 0 ? `عدد المنتجات النشطة ${data.totalProducts}` : 'لا توجد منتجات نشطة حالياً'
            ];

    container.innerHTML = insights.map((text) => `
        <div class="insight-item">
            <i class="fas fa-circle-check"></i>
            <span>${text}</span>
        </div>
    `).join('');
}

function updateDashboardHero(role) {
    const greetingEl = document.getElementById('dashboard-greeting');
    const subtitleEl = document.getElementById('dashboard-subtitle');
    const todayDateEl = document.getElementById('dashboard-today-date');
    const lastUpdateEl = document.getElementById('dashboard-last-update');

    const roleName = getRoleName(role);
    if (greetingEl) greetingEl.textContent = `مرحباً ${currentUser?.username || ''} - ${roleName}`;
    if (subtitleEl) subtitleEl.textContent = 'هذه نظرة فورية على الأداء، الطلبات، والعمليات المهمة.';
    if (todayDateEl) todayDateEl.textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

async function loadDashboard() {
    updateDashboardHero(currentUser.role);
    renderDashboardQuickActions(currentUser.role);

    if (currentUser.role === 'admin') {
        document.getElementById('admin-dashboard').style.display = 'block';
        document.getElementById('warehouse-dashboard').style.display = 'none';
        document.getElementById('pharmacy-dashboard').style.display = 'none';
        await loadAdminStats();
    } else if (currentUser.role === 'warehouse') {
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('warehouse-dashboard').style.display = 'block';
        document.getElementById('pharmacy-dashboard').style.display = 'none';
        
        await loadWarehouseStats();
    } else if (currentUser.role === 'pharmacy') {
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('warehouse-dashboard').style.display = 'none';
        document.getElementById('pharmacy-dashboard').style.display = 'block';
        
        await loadPharmacyStats();
    }
}

async function loadAdminStats() {
    try {
        const [ordersData, invoicesData, productsData, warehousesData] = await Promise.all([
            apiCall('/orders'),
            apiCall('/invoices'),
            apiCall('/products?page=1&limit=1'),
            apiCall('/auth/warehouses')
        ]);

        const allOrders = ordersData.orders || [];
        const invoices = invoicesData.invoices || [];
        const totalProducts = productsData?.pagination?.total_items || 0;

        const uniqueWarehouses = new Set([
            ...(warehousesData.warehouses || []).map((warehouse) => warehouse.id),
            ...allOrders.map((order) => order.warehouse_id)
        ]);
        const uniquePharmacies = new Set(allOrders.map((order) => order.pharmacy_id));
        const estimatedUsers = uniqueWarehouses.size + uniquePharmacies.size;

        const activeOrders = allOrders.filter((order) => order.status !== 'cancelled');
        const totalSales = allOrders
            .filter((order) => order.status === 'delivered')
            .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

        document.getElementById('stat-users').textContent = estimatedUsers;
        document.getElementById('stat-products').textContent = totalProducts;
        document.getElementById('stat-orders').textContent = activeOrders.length;
        document.getElementById('stat-sales').textContent = formatCurrency(totalSales);

        renderDashboardStatusDistribution(allOrders);
        renderDashboardTodayKpis('admin', { orders: allOrders, invoices });
        renderDashboardInsights('admin', { orders: allOrders, totalProducts });
    } catch (error) {
        console.error(error);
    }
}

async function loadWarehouseStats() {
    try {
        const pageSize = 100;
        let page = 1;
        let hasNext = true;
        const allProducts = [];

        while (hasNext) {
            const productsData = await apiCall(`/products/my-products?page=${page}&limit=${pageSize}`);
            allProducts.push(...(productsData.products || []));
            hasNext = Boolean(productsData.pagination?.has_next);
            page += 1;
        }

        document.getElementById('warehouse-products').textContent = allProducts.length;
        
        // Get low stock products
        const lowStockProducts = allProducts.filter(p => p.quantity < 10);
        const alertsContainer = document.getElementById('warehouse-alerts');
        
        if (lowStockProducts.length > 0) {
            alertsContainer.innerHTML = lowStockProducts.map(p => `
                <div class="alert-item ${p.quantity < 5 ? 'danger' : 'warning'}">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>المخزون منخفض: ${p.name} (${p.quantity} باقي)</span>
                </div>
            `).join('');
        } else {
            alertsContainer.innerHTML = `
                <div class="alert-item success">
                    <i class="fas fa-check-circle"></i>
                    <span>لا توجد تنبيهات</span>
                </div>
            `;
        }
        
        // Get orders
        const ordersData = await apiCall('/orders');
        const warehouseOrders = ordersData.orders;
        
        // Filter out cancelled orders for stats
        const activeOrders = warehouseOrders.filter(o => o.status !== 'cancelled' && o.status !== 'rejected');
        
        document.getElementById('warehouse-orders').textContent = activeOrders.length;
        
        const delivered = warehouseOrders.filter(o => o.status === 'delivered').length;
        document.getElementById('warehouse-delivered').textContent = delivered;
        
        // Only count delivered orders in total sales
        const totalSales = warehouseOrders
            .filter(o => o.status === 'delivered')
            .reduce((sum, o) => sum + o.total_amount, 0);
        document.getElementById('warehouse-sales').textContent = totalSales.toFixed(2) + ' ج.م';
        
        // Render recent orders
        const recentOrders = warehouseOrders.slice(0, 5);
        const tbody = document.getElementById('warehouse-recent-orders');
        
        if (recentOrders.length > 0) {
            tbody.innerHTML = recentOrders.map(order => `
                <tr>
                    <td>#${order.id}</td>
                    <td>${order.pharmacy_name}</td>
                    <td>${order.total_amount.toFixed(2)} ج.م</td>
                    <td><span class="status-badge ${order.status}">${getStatusName(order.status)}</span></td>
                    <td>${formatDate(order.created_at)}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا توجد طلبات</td></tr>';
        }

        renderDashboardStatusDistribution(warehouseOrders);
        renderDashboardTodayKpis('warehouse', { orders: warehouseOrders, products: allProducts });
        renderDashboardInsights('warehouse', { orders: warehouseOrders, products: allProducts });
        
    } catch (error) {
        console.error(error);
    }
}

async function loadPharmacyStats() {
    try {
        const ordersData = await apiCall('/orders/my-orders');
        const pharmacyOrders = ordersData.orders;
        const invoicesData = await apiCall('/invoices/my-invoices');
        const invoices = invoicesData.invoices || [];
        
        // Filter out cancelled orders for stats
        const activeOrders = pharmacyOrders.filter(o => o.status !== 'cancelled' && o.status !== 'rejected');
        
        document.getElementById('pharmacy-orders').textContent = activeOrders.length;
        
        const delivered = pharmacyOrders.filter(o => o.status === 'delivered').length;
        document.getElementById('pharmacy-delivered').textContent = delivered;
        
        const pending = pharmacyOrders.filter(o => o.status === 'pending' || o.status === 'processing').length;
        document.getElementById('pharmacy-pending').textContent = pending;
        
        document.getElementById('pharmacy-rating').textContent = currentUser.rating ? currentUser.rating.toFixed(1) : '0';
        
        // Render recent orders
        const recentOrders = pharmacyOrders.slice(0, 5);
        const tbody = document.getElementById('pharmacy-recent-orders');
        
        if (recentOrders.length > 0) {
            tbody.innerHTML = recentOrders.map(order => `
                <tr>
                    <td>#${order.id}</td>
                    <td>${order.warehouse_name}</td>
                    <td>${order.total_amount.toFixed(2)} ج.م</td>
                    <td><span class="status-badge ${order.status}">${getStatusName(order.status)}</span></td>
                    <td>${formatDate(order.created_at)}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا توجد طلبات</td></tr>';
        }

        const totalAmount = pharmacyOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
        const avgOrderValue = pharmacyOrders.length ? (totalAmount / pharmacyOrders.length) : 0;
        renderDashboardStatusDistribution(pharmacyOrders);
        renderDashboardTodayKpis('pharmacy', { orders: pharmacyOrders, invoices });
        renderDashboardInsights('pharmacy', { orders: pharmacyOrders, avgOrderValue });
        
    } catch (error) {
        console.error(error);
    }
}

// ========================================
// Products
// ========================================

async function loadWarehouseProducts() {
    try {
        initWarehouseProductsViewPreference();
        const searchTerm = (document.getElementById('warehouse-product-search')?.value || '').trim();

        const pageSize = 100;
        let page = 1;
        let allProducts = [];
        let hasNext = true;

        while (hasNext) {
            let endpoint = `/products/my-products?page=${page}&limit=${pageSize}`;
            if (searchTerm) endpoint += `&search=${encodeURIComponent(searchTerm)}`;
            const data = await apiCall(endpoint);
            const pageItems = data.products || [];
            allProducts = allProducts.concat(pageItems);

            const pagination = data.pagination || {};
            hasNext = Boolean(pagination.has_next);
            page += 1;
        }

        renderWarehouseProducts(allProducts);
    } catch (error) {
        console.error(error);
    }
}

function scheduleWarehouseProductSearch() {
    if (warehouseProductSearchDebounceTimer) {
        clearTimeout(warehouseProductSearchDebounceTimer);
    }
    warehouseProductSearchDebounceTimer = setTimeout(() => {
        loadWarehouseProducts();
    }, 300);
}

function renderWarehouseProducts(products) {
    const grid = document.getElementById('warehouse-products-grid');
    
    if (products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <p>لا توجد منتجات</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = products.map(product => {
        let offerBadge = '';
        if (product.discount_percent > 0) {
            offerBadge += `<span class="offer-badge discount">${product.discount_percent}% خصم</span>`;
        }
        if (product.bonus_buy_quantity > 0 && product.bonus_free_quantity > 0) {
            offerBadge += `<span class="offer-badge bonus">${product.bonus_buy_quantity}+${product.bonus_free_quantity} بونص</span>`;
        }

        return `
        <div class="product-card">
            <div class="product-image">
                ${product.image ? `<img src="${product.image}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i class="fas fa-pills"></i>`}
                ${offerBadge ? `<div class="product-offers">${offerBadge}</div>` : ''}
            </div>
            <div class="product-info">
                <h4>${product.name}</h4>
                <p class="product-category">${product.category || 'غير محدد'}</p>
                ${product.active_ingredient ? `<p class="product-active-ingredient"><i class="fas fa-flask"></i> ${product.active_ingredient}</p>` : ''}
                <div class="product-meta">
                    ${product.discount_percent > 0 ? `
                        <span class="product-price" style="text-decoration: line-through; color: var(--text-secondary); font-size: 0.85rem;">${product.price.toFixed(2)} ج.م</span>
                        <span class="product-price" style="color: var(--success);">${(product.price * (1 - product.discount_percent / 100)).toFixed(2)} ج.م</span>
                    ` : `
                        <span class="product-price">${product.price.toFixed(2)} ج.م</span>
                    `}
                    <span class="product-quantity">${product.quantity} متوفر</span>
                </div>
                ${product.offer_note ? `<p style="font-size: 0.75rem; color: var(--primary); margin: 4px 0;"><i class="fas fa-tag"></i> ${product.offer_note}</p>` : ''}
                <p style="font-size: 0.8rem; color: var(--text-secondary);">
                    ${product.expiry_date ? 'ينتهي: ' + formatDate(product.expiry_date) : ''}
                </p>
            </div>
            <div class="product-actions">
                <button class="btn-secondary btn-sm" onclick="editProduct(${product.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-danger btn-sm" onclick="deleteProduct(${product.id})">
                    <i class="fas fa-trash-can"></i>
                </button>
            </div>
        </div>
    `}).join('');
}

function showAddProductModal() {
    document.getElementById('product-modal-title').textContent = 'إضافة منتج';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-image').value = '';
    document.getElementById('product-image-file').value = '';
    document.getElementById('product-image-preview').style.display = 'none';
    document.getElementById('image-actions').style.display = 'none';
    document.getElementById('preview-img').src = '';
    document.getElementById('product-modal').classList.add('active');
}

function handleProductImageUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        if (!file.type.match('image.*')) {
            showToast('يرجى اختيار ملف صورة صالح', 'warning');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast('حجم الصورة يجب أن يكون أقل من 2 ميجابايت', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            document.getElementById('product-image').value = evt.target.result;
            document.getElementById('preview-img').src = evt.target.result;
            document.getElementById('product-image-preview').style.display = 'flex';
            document.getElementById('image-actions').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
}

function removeProductImage() {
    document.getElementById('product-image').value = '';
    document.getElementById('product-image-file').value = '';
    document.getElementById('product-image-preview').style.display = 'none';
    document.getElementById('image-actions').style.display = 'none';
    document.getElementById('preview-img').src = '';
}

async function editProduct(id) {
    try {
        const data = await apiCall(`/products/${id}`);
        const product = data.product;
        
        document.getElementById('product-modal-title').textContent = 'تعديل منتج';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-description').value = product.description || '';
        document.getElementById('product-category').value = product.category || '';
        document.getElementById('product-active-ingredient').value = product.active_ingredient || '';
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-quantity').value = product.quantity;
        document.getElementById('product-expiry').value = product.expiry_date || '';

        document.getElementById('product-discount').value = product.discount_percent || 0;
        document.getElementById('product-bonus-buy').value = product.bonus_buy_quantity || 0;
        document.getElementById('product-bonus-free').value = product.bonus_free_quantity || 0;
        document.getElementById('product-offer-note').value = product.offer_note || '';

        if (product.image) {
            document.getElementById('product-image').value = product.image;
            document.getElementById('preview-img').src = product.image;
            document.getElementById('product-image-preview').style.display = 'flex';
            document.getElementById('image-actions').style.display = 'flex';
        } else {
            removeProductImage();
        }

        document.getElementById('product-modal').classList.add('active');
    } catch (error) {
        console.error(error);
    }
}

async function saveProduct(e) {
    e.preventDefault();
    
    const id = document.getElementById('product-id').value;
    const productData = {
        name: document.getElementById('product-name').value,
        description: document.getElementById('product-description').value,
        category: document.getElementById('product-category').value,
        active_ingredient: document.getElementById('product-active-ingredient').value || null,
        price: parseFloat(document.getElementById('product-price').value),
        quantity: parseInt(document.getElementById('product-quantity').value),
        expiry_date: document.getElementById('product-expiry').value || null,
        discount_percent: parseInt(document.getElementById('product-discount').value) || 0,
        bonus_buy_quantity: parseInt(document.getElementById('product-bonus-buy').value) || 0,
        bonus_free_quantity: parseInt(document.getElementById('product-bonus-free').value) || 0,
        offer_note: document.getElementById('product-offer-note').value || null,
        image: document.getElementById('product-image').value || null
    };
    
    try {
        if (id) {
            await apiCall(`/products/${id}`, 'PUT', productData);
            showToast('تم تحديث المنتج بنجاح', 'success');
        } else {
            await apiCall('/products', 'POST', productData);
            showToast('تم إضافة المنتج بنجاح', 'success');
        }
        
        closeModal('product-modal');
        loadWarehouseProducts();
    } catch (error) {
        console.error(error);
    }
}

async function deleteProduct(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    
    try {
        await apiCall(`/products/${id}`, 'DELETE');
        showToast('تم حذف المنتج بنجاح', 'success');
        loadWarehouseProducts();
    } catch (error) {
        console.error(error);
    }
}

// ========================================
// Import Products from Excel
// ========================================

function showImportModal() {
    // Backward-compatible alias
    openImportFileWindow();
}

function openImportFileWindow() {
    if (currentUser?.role !== 'warehouse') {
        showToast('الاستيراد متاح للمخزن فقط', 'warning');
        return;
    }

    const fileInput = document.getElementById('import-file-window');
    if (!fileInput) {
        showToast('لم يتم العثور على عنصر اختيار الملفات', 'error');
        return;
    }

    fileInput.value = '';
    fileInput.click();
}

async function handleImportFileSelection(event) {
    const fileInput = event.target;
    const file = fileInput?.files?.[0];
    if (!file) {
        return;
    }

    await importProductsFile(file, fileInput);
}

function isAllowedImportFile(fileName = '') {
    const lowerName = fileName.toLowerCase();
    return IMPORT_ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

async function importProductsFile(file, fileInput = null) {
    if (!isAllowedImportFile(file.name)) {
        showToast('صيغة الملف غير مدعومة. استخدم Excel أو CSV', 'error');
        if (fileInput) fileInput.value = '';
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        showToast('يرجى تسجيل الدخول أولاً', 'error');
        if (fileInput) fileInput.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const importBtn = document.getElementById('import-products-btn');
    const originalBtnHtml = importBtn ? importBtn.innerHTML : '';
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاستيراد...';
    }

    try {
        const response = await fetch(`${API_BASE}/products/import`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await response.json() : null;
        const textBody = isJson ? '' : await response.text();

        if (!response.ok) {
            if (data && data.error) {
                throw new Error(data.error);
            }
            throw new Error(`فشل الاستيراد (${response.status})`);
        }

        if (!isJson) {
            const looksLikeHtml = textBody && textBody.trim().startsWith('<!DOCTYPE');
            if (looksLikeHtml) {
                throw new Error('Endpoint API غير متاح حالياً (تم استلام HTML بدلاً من JSON)');
            }
            throw new Error('استجابة غير متوقعة من الخادم');
        }

        const successful = data.summary?.successful ?? data.inserted?.length ?? 0;
        const failed = data.summary?.failed ?? data.errors?.length ?? 0;

        if (failed > 0) {
            showToast(`تم استيراد ${successful} صنف ورفض ${failed}`, 'warning');
            console.log('Import errors:', data.errors || []);
        } else {
            showToast(data.message || `تم استيراد ${successful} صنف بنجاح`, 'success');
        }

        await loadWarehouseProducts();
    } catch (error) {
        console.error('Import error:', error);
        showToast(error.message || 'حدث خطأ أثناء الاستيراد', 'error');
    } finally {
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = originalBtnHtml;
        }
        if (fileInput) {
            fileInput.value = '';
        }
    }
}

async function importProducts(e) {
    // Backward-compatible handler if old form exists
    e.preventDefault();
    const legacyFileInput = document.getElementById('import-file');
    const file = legacyFileInput?.files?.[0];
    if (!file) {
        showToast('يرجى اختيار ملف', 'error');
        return;
    }
    await importProductsFile(file, legacyFileInput);
}

// ========================================
// Pharmacy Products
// ========================================

async function loadPharmacyProducts() {
    try {
        // Initialize view preference
        initViewPreference();
        updateBrowseFiltersState();
        renderProductsLoadingState('pharmacy-products-grid');

        // Load categories
        const categoriesData = await apiCall('/products/categories');
        const categorySelect = document.getElementById('category-filter');
        categorySelect.innerHTML = '<option value="">كل الفئات</option>' + 
            categoriesData.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        
        // Load warehouses
        const warehousesData = await apiCall('/auth/warehouses');
        const warehouseSelect = document.getElementById('warehouse-filter');
        warehouseSelect.innerHTML = '<option value="">كل المخازن</option>' + 
            warehousesData.warehouses.map(w => `<option value="${w.id}">${w.username}</option>`).join('');

        await loadWishlistIds();
        
        // Load products
        pharmacyProductsPage = 1;
        searchProducts(1);
    } catch (error) {
        console.error(error);
    }
}

function scheduleProductSearch() {
    if (productSearchDebounceTimer) {
        clearTimeout(productSearchDebounceTimer);
    }
    productSearchDebounceTimer = setTimeout(() => {
        searchProducts(1);
    }, 250);
}

function renderProductsLoadingState(targetGridId = 'pharmacy-products-grid') {
    const grid = document.getElementById(targetGridId);
    if (!grid) return;
    grid.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>جاري تحميل المنتجات...</p>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightQuery(text, query) {
    const safeText = escapeHtml(text);
    const term = String(query || '').trim();
    if (!term) return safeText;

    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'ig');
    return safeText.replace(regex, '<mark style="background:#FFF3BF;padding:0 2px;border-radius:3px;">$1</mark>');
}

function getActiveBrowseFiltersCount() {
    const category = document.getElementById('category-filter')?.value || '';
    const warehouse = document.getElementById('warehouse-filter')?.value || '';
    const sort = document.getElementById('sort-filter')?.value || '';
    const minPrice = document.getElementById('min-price-filter')?.value || '';
    const maxPrice = document.getElementById('max-price-filter')?.value || '';
    const offersOnly = document.getElementById('offers-filter')?.value || '';
    const search = (document.getElementById('product-search')?.value || '').trim();

    return [search, category, warehouse, sort, minPrice, maxPrice, offersOnly]
        .filter(value => String(value).trim() !== '').length;
}

function getCurrentQuickFilterKey() {
    const sort = document.getElementById('sort-filter')?.value || '';
    const minPrice = document.getElementById('min-price-filter')?.value || '';
    const maxPrice = document.getElementById('max-price-filter')?.value || '';
    const offers = document.getElementById('offers-filter')?.value || '';
    const category = document.getElementById('category-filter')?.value || '';
    const warehouse = document.getElementById('warehouse-filter')?.value || '';
    const search = (document.getElementById('product-search')?.value || '').trim();

    if (!search && !category && !warehouse && !sort && !minPrice && !maxPrice && !offers) return 'default';
    if (!search && !category && !warehouse && !sort && !minPrice && maxPrice === '100' && !offers) return 'under100';
    if (!search && !category && !warehouse && !sort && !minPrice && maxPrice === '250' && !offers) return 'under250';
    if (!search && !category && !warehouse && sort === 'price_asc' && !minPrice && !maxPrice && !offers) return 'priceAsc';
    if (!search && !category && !warehouse && sort === 'discount_desc' && !minPrice && !maxPrice && !offers) return 'discountDesc';
    if (!search && !category && !warehouse && !sort && !minPrice && !maxPrice && offers === 'true') return 'offers';
    return '';
}

function updateQuickFiltersState() {
    const activeKey = getCurrentQuickFilterKey();
    document.querySelectorAll('[data-quick-filter]').forEach((chip) => {
        chip.classList.toggle('active', chip.getAttribute('data-quick-filter') === activeKey);
    });
}

function applyQuickFilter(filterKey) {
    const sortFilter = document.getElementById('sort-filter');
    const minPriceFilter = document.getElementById('min-price-filter');
    const maxPriceFilter = document.getElementById('max-price-filter');
    const offersFilter = document.getElementById('offers-filter');
    const categoryFilter = document.getElementById('category-filter');
    const warehouseFilter = document.getElementById('warehouse-filter');
    const searchInput = document.getElementById('product-search');

    if (!sortFilter || !minPriceFilter || !maxPriceFilter || !offersFilter) return;

    // Quick filters are global presets, so reset all fields first.
    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = '';
    if (warehouseFilter) warehouseFilter.value = '';
    sortFilter.value = '';
    minPriceFilter.value = '';
    maxPriceFilter.value = '';
    offersFilter.value = '';

    switch (filterKey) {
        case 'offers':
            offersFilter.value = 'true';
            break;
        case 'under100':
            maxPriceFilter.value = '100';
            break;
        case 'under250':
            maxPriceFilter.value = '250';
            break;
        case 'priceAsc':
            sortFilter.value = 'price_asc';
            break;
        case 'discountDesc':
            sortFilter.value = 'discount_desc';
            break;
        default:
            break;
    }

    pharmacyProductsPage = 1;
    updateBrowseFiltersState();
    updateQuickFiltersState();
    searchProducts(1);
}

function updateBrowseFiltersState() {
    const activeFiltersHint = document.getElementById('active-filters-hint');
    const clearBtn = document.querySelector('#browse-filters-section .clear-filters-btn');
    const activeCount = getActiveBrowseFiltersCount();

    if (activeFiltersHint) {
        activeFiltersHint.textContent = activeCount > 0
            ? `${activeCount} فلتر نشط`
            : 'بدون فلاتر نشطة';
    }

    if (clearBtn) {
        clearBtn.classList.toggle('has-active-filters', activeCount > 0);
    }

    updateQuickFiltersState();
}

function setFiltersPanelExpanded(expanded) {
    const section = document.getElementById('browse-filters-section');
    const toggleBtn = document.getElementById('filters-toggle-btn');
    if (!section || !toggleBtn) return;

    section.classList.toggle('active', expanded);
    toggleBtn.classList.toggle('active', expanded);
    
    // Handle overlay
    if (expanded) {
        const overlay = document.createElement('div');
        overlay.className = 'filters-overlay';
        overlay.onclick = () => setFiltersPanelExpanded(false);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    } else {
        const overlay = document.querySelector('.filters-overlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
    }
}

function toggleFiltersPanel() {
    const section = document.getElementById('browse-filters-section');
    if (!section) return;
    const isExpanded = section.classList.contains('active');
    setFiltersPanelExpanded(!isExpanded);
}

async function searchProducts(page = pharmacyProductsPage || 1) {
    const search = document.getElementById('product-search').value;
    const category = document.getElementById('category-filter').value;
    const warehouse_id = document.getElementById('warehouse-filter').value;
    const sort = document.getElementById('sort-filter')?.value || '';
    const minPrice = document.getElementById('min-price-filter')?.value || '';
    const maxPrice = document.getElementById('max-price-filter')?.value || '';
    const offersOnly = document.getElementById('offers-filter')?.value === 'true';
    const targetPage = Math.max(1, parseInt(page, 10) || 1);
    updateBrowseFiltersState();

    if (minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice)) {
        showToast('أدخل نطاق سعر صحيح', 'warning');
        return;
    }
    
    try {
        let endpoint = '/products?';
        if (search) endpoint += `search=${encodeURIComponent(search)}&`;
        if (category) endpoint += `category=${encodeURIComponent(category)}&`;
        if (warehouse_id) endpoint += `warehouse_id=${warehouse_id}&`;
        if (minPrice !== '') endpoint += `min_price=${encodeURIComponent(minPrice)}&`;
        if (maxPrice !== '') endpoint += `max_price=${encodeURIComponent(maxPrice)}&`;
        if (offersOnly) endpoint += 'has_offers=true&';
        if (sort) {
            const [sortBy, sortOrder] = sort.split('_');
            if (sortBy && sortOrder) {
                const fieldMap = {
                    price: 'price',
                    name: 'name',
                    discount: 'discount_percent'
                };
                const apiSortBy = fieldMap[sortBy];
                const apiSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
                if (apiSortBy) {
                    endpoint += `sort_by=${apiSortBy}&sort_order=${apiSortOrder}&`;
                }
            }
        }
        endpoint += `page=${targetPage}&limit=12`;
        
        renderProductsLoadingState('pharmacy-products-grid');
        const data = await apiCall(endpoint);
        products = (data.products || []).slice();
        pharmacyProductsPage = targetPage;
        pharmacyProductsPagination = data.pagination || null;

        products.sort((a, b) => {
            const stockA = Number(a.quantity) > 0 ? 1 : 0;
            const stockB = Number(b.quantity) > 0 ? 1 : 0;
            if (stockA !== stockB) return stockB - stockA;
            return (Number(b.discount_percent) || 0) - (Number(a.discount_percent) || 0);
        });

        const resultsCount = document.getElementById('results-count');
        if (resultsCount) {
            const inStockCount = products.filter(p => Number(p.quantity) > 0).length;
            const totalItems = Number(pharmacyProductsPagination?.total_items || products.length);
            resultsCount.textContent = `${totalItems} منتج • ${inStockCount} متاح في الصفحة الحالية`;
        }
        renderPharmacyProducts(products);
        renderProductsPagination();
    } catch (error) {
        console.error(error);
    }
}

function renderProductsPagination() {
    const paginationBar = document.getElementById('products-pagination');
    const prevBtn = document.getElementById('products-prev-btn');
    const nextBtn = document.getElementById('products-next-btn');
    const info = document.getElementById('products-pagination-info');
    if (!paginationBar || !prevBtn || !nextBtn || !info) return;

    const totalPages = Math.max(1, Number(pharmacyProductsPagination?.total_pages || 1));
    const currentPage = Math.max(1, Number(pharmacyProductsPagination?.current_page || pharmacyProductsPage || 1));
    const totalItems = Number(pharmacyProductsPagination?.total_items || products.length);

    const shouldShow = totalPages > 1;
    paginationBar.style.display = shouldShow ? 'flex' : 'none';
    info.textContent = `صفحة ${currentPage} من ${totalPages} • ${totalItems} منتج`;
    prevBtn.disabled = !pharmacyProductsPagination?.has_prev;
    nextBtn.disabled = !pharmacyProductsPagination?.has_next;
}

function changeProductsPage(direction) {
    const currentPage = Number(pharmacyProductsPagination?.current_page || pharmacyProductsPage || 1);
    const nextPage = currentPage + Number(direction || 0);
    if (nextPage < 1) return;
    if (pharmacyProductsPagination?.total_pages && nextPage > pharmacyProductsPagination.total_pages) return;
    searchProducts(nextPage);
}

function renderPharmacyProducts(products, targetGridId = 'pharmacy-products-grid') {
    const grid = document.getElementById(targetGridId);
    
    if (!grid) return;
    
    if (products.length === 0) {
        const emptyText = targetGridId === 'wishlist-products-grid' ? 'لا توجد منتجات في المفضلة' : 'لا توجد منتجات';
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>${emptyText}</p>
            </div>
        `;
        return;
    }
    
    const searchTerm = (document.getElementById('product-search')?.value || '').trim();

    grid.innerHTML = products.map(product => {
        const isWishlisted = wishlistProductIds.has(product.id);
        let offerBadge = '';
        if (product.discount_percent > 0) {
            offerBadge += `<span class="offer-badge discount"><i class="fas fa-percentage"></i> ${product.discount_percent}% خصم</span>`;
        }
        if (product.bonus_buy_quantity > 0 && product.bonus_free_quantity > 0) {
            offerBadge += `<span class="offer-badge bonus"><i class="fas fa-gift"></i> ${product.bonus_buy_quantity}+${product.bonus_free_quantity} بونص</span>`;
        }
        if (product.has_alternatives) {
            offerBadge += `<span class="offer-badge alternative" title="يوجد ${product.alternatives_count} بديل بنفس المادة الفعالة"><i class="fas fa-clone"></i> بدائل ${product.alternatives_count}</span>`;
        }
        const finalPrice = product.discount_percent > 0
            ? (product.price * (1 - product.discount_percent / 100)).toFixed(2)
            : product.price.toFixed(2);
        let stockText = `${product.quantity} متوفر`;
        if (product.quantity === 0) stockText = 'غير متوفر';
        if (product.quantity > 0 && product.quantity <= 10) stockText = `${product.quantity} متبقي`;
        const stockClass = product.quantity === 0
            ? 'out-of-stock'
            : product.quantity <= 10
                ? 'low-stock'
                : 'in-stock';

        return `
        <div class="product-card">
            <div class="product-image with-wishlist">
                ${product.image ? `<img src="${product.image}" alt="${product.name}">` : `<i class="fas fa-pills"></i>`}
                <button class="product-wishlist-btn" onclick="toggleWishlist(${product.id})" title="${isWishlisted ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}">
                    <i class="${isWishlisted ? 'fas' : 'far'} fa-heart"></i>
                </button>
                ${offerBadge ? `<div class="product-offers">${offerBadge}</div>` : ''}
            </div>
            <div class="product-info">
                <h4>${highlightQuery(product.name, searchTerm)}</h4>
                <p class="product-category"><i class="fas fa-tag"></i> ${highlightQuery(product.category || 'غير محدد', searchTerm)}</p>
                ${product.active_ingredient ? `<p class="product-active-ingredient"><i class="fas fa-flask"></i> ${highlightQuery(product.active_ingredient, searchTerm)}</p>` : ''}
                <p class="product-warehouse"><i class="fas fa-warehouse"></i> ${escapeHtml(product.warehouse_name || '-')}</p>
                <div class="product-meta">
                    ${product.discount_percent > 0 ? `
                        <span class="product-price old-price">${product.price.toFixed(2)} ج.م</span>
                        <span class="product-price new-price">${finalPrice} ج.م</span>
                    ` : `
                        <span class="product-price">${finalPrice} ج.م</span>
                    `}
                    <span class="product-quantity ${stockClass}">${stockText}</span>
                </div>
                ${product.offer_note ? `<div class="offer-note"><i class="fas fa-info-circle"></i> ${escapeHtml(product.offer_note)}</div>` : ''}
            </div>
            <div class="product-actions">
                ${product.has_alternatives ? `
                <button class="btn-secondary btn-sm alternatives-open-btn" onclick="showAlternativesModal(${product.id})" title="عرض بدائل نفس المادة الفعالة">
                    <i class="fas fa-clone"></i>
                </button>
                ` : ''}
                <input
                    type="number"
                    class="cart-qty-input"
                    id="cart-qty-${product.id}"
                    min="1"
                    max="${Math.max(1, product.quantity)}"
                    value="1"
                    ${product.quantity === 0 ? 'disabled' : ''}
                >
                <button class="btn-primary btn-sm add-cart-btn" onclick="addToCart(${product.id}, Number(document.getElementById('cart-qty-${product.id}')?.value || 1))" ${product.quantity === 0 ? 'disabled' : ''}>
                    <i class="fas fa-cart-plus"></i>
                    ${product.quantity === 0 ? 'غير متوفر' : 'إضافة للسلة'}
                </button>
            </div>
        </div>
    `}).join('');
}

async function showAlternativesModal(productId) {
    try {
        const data = await apiCall(`/products/${productId}/alternatives`);
        const baseProduct = data.product || null;
        const alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];
        const titleEl = document.getElementById('alternatives-modal-title');
        const contentEl = document.getElementById('alternatives-modal-content');

        if (!titleEl || !contentEl) return;

        const productName = baseProduct?.name || 'المنتج';
        const ingredient = baseProduct?.active_ingredient || 'غير محدد';
        titleEl.textContent = `بدائل ${productName}`;

        if (!alternatives.length) {
            contentEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-flask"></i>
                    <p>لا توجد بدائل متاحة حالياً لنفس المادة الفعالة (${escapeHtml(ingredient)})</p>
                </div>
            `;
            document.getElementById('alternatives-modal').classList.add('active');
            return;
        }

        contentEl.innerHTML = `
            <p class="alternatives-subtitle">
                المادة الفعالة: <strong>${escapeHtml(ingredient)}</strong> • عدد البدائل: <strong>${alternatives.length}</strong>
            </p>
            <div class="alternatives-list">
                ${alternatives.map((alt) => {
                    const finalPrice = Number(alt.discount_percent) > 0
                        ? (Number(alt.price) * (1 - Number(alt.discount_percent) / 100)).toFixed(2)
                        : Number(alt.price || 0).toFixed(2);
                    return `
                    <div class="alternative-item">
                        <div class="alternative-item-main">
                            <h4>${escapeHtml(alt.name || '-')}</h4>
                            <p><i class="fas fa-warehouse"></i> ${escapeHtml(alt.warehouse_name || '-')}</p>
                            <p><i class="fas fa-coins"></i> ${finalPrice} ج.م ${Number(alt.discount_percent) > 0 ? `<span class="alt-old-price">${Number(alt.price || 0).toFixed(2)} ج.م</span>` : ''}</p>
                            <p><i class="fas fa-boxes"></i> ${Number(alt.quantity || 0)} متوفر</p>
                        </div>
                        <div class="alternative-item-actions">
                            <input
                                type="number"
                                class="cart-qty-input"
                                id="alt-cart-qty-${alt.id}"
                                min="1"
                                max="${Math.max(1, Number(alt.quantity || 0))}"
                                value="1"
                                ${Number(alt.quantity || 0) === 0 ? 'disabled' : ''}
                            >
                            <button class="btn-primary btn-sm" onclick="addToCart(${alt.id}, Number(document.getElementById('alt-cart-qty-${alt.id}')?.value || 1))" ${Number(alt.quantity || 0) === 0 ? 'disabled' : ''}>
                                <i class="fas fa-cart-plus"></i>
                                إضافة للسلة
                            </button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;

        document.getElementById('alternatives-modal').classList.add('active');
    } catch (error) {
        console.error(error);
    }
}

async function loadWishlistIds() {
    if (currentUser?.role !== 'pharmacy') return;
    try {
        const data = await apiCall('/wishlist/ids');
        wishlistProductIds = new Set(data.product_ids || []);
    } catch (error) {
        console.error(error);
    }
}

async function toggleWishlist(productId) {
    if (currentUser?.role !== 'pharmacy') return;
    try {
        if (wishlistProductIds.has(productId)) {
            await apiCall(`/wishlist/${productId}`, 'DELETE');
            wishlistProductIds.delete(productId);
            showToast('تمت الإزالة من المفضلة', 'success');
        } else {
            await apiCall(`/wishlist/${productId}`, 'POST');
            wishlistProductIds.add(productId);
            showToast('تمت الإضافة إلى المفضلة', 'success');
        }

        if (document.getElementById('wishlist-page')?.classList.contains('active')) {
            loadWishlistPage();
        } else {
            renderPharmacyProducts(products);
        }
    } catch (error) {
        console.error(error);
    }
}

async function loadWishlistPage() {
    try {
        await loadWishlistIds();
        const data = await apiCall('/wishlist');
        const items = data.items || [];
        renderPharmacyProducts(items, 'wishlist-products-grid');
    } catch (error) {
        console.error(error);
    }
}

function clearFilters() {
    const searchInput = document.getElementById('product-search');
    const categoryFilter = document.getElementById('category-filter');
    const warehouseFilter = document.getElementById('warehouse-filter');
    const sortFilter = document.getElementById('sort-filter');
    const minPriceFilter = document.getElementById('min-price-filter');
    const maxPriceFilter = document.getElementById('max-price-filter');
    const offersFilter = document.getElementById('offers-filter');

    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = '';
    if (warehouseFilter) warehouseFilter.value = '';
    if (sortFilter) sortFilter.value = '';
    if (minPriceFilter) minPriceFilter.value = '';
    if (maxPriceFilter) maxPriceFilter.value = '';
    if (offersFilter) offersFilter.value = '';

    pharmacyProductsPage = 1;
    updateBrowseFiltersState();
    searchProducts(1);
}

function toggleView(view) {
    const grid = document.getElementById('pharmacy-products-grid');
    if (!grid) return;

    document.querySelectorAll('#browse-products-page .view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    grid.classList.toggle('list-view', view === 'list');
    
    // Save preference
    localStorage.setItem('productViewPreference', view);
}

function toggleWarehouseProductsView(view) {
    const grid = document.getElementById('warehouse-products-grid');
    if (!grid) return;

    document.querySelectorAll('#products-page .warehouse-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    grid.classList.toggle('list-view', view === 'list');
    localStorage.setItem('warehouseProductViewPreference', view);
}

function initWarehouseProductsViewPreference() {
    const savedView = localStorage.getItem('warehouseProductViewPreference') || 'grid';
    toggleWarehouseProductsView(savedView);
}

// Initialize view preference on page load
function initViewPreference() {
    const savedView = localStorage.getItem('productViewPreference') || 'grid';
    toggleView(savedView);
}

function toggleFiltersPanel() {
    const panel = document.getElementById('browse-filters-section');
    if (!panel) return;
    
    panel.classList.toggle('active');
    
    // Add overlay when panel is open
    if (panel.classList.contains('active')) {
        const overlay = document.createElement('div');
        overlay.className = 'filters-overlay';
        overlay.onclick = toggleFiltersPanel;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    } else {
        const overlay = document.querySelector('.filters-overlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
    }
}

function applyFiltersAndClose() {
    searchProducts(1);
    toggleFiltersPanel();
}

// ========================================
// Cart
// ========================================

function addToCart(productId, requestedQuantity = 1) {
    const qty = Number.isFinite(requestedQuantity) ? Math.floor(requestedQuantity) : 1;
    const safeQty = Math.max(1, qty);

    const product = products.find(p => p.id === productId);
    if (!product) {
        // Need to fetch product first
        apiCall(`/products/${productId}`).then(data => {
            const p = data.product;
            const existing = cart.find(item => item.product_id === p.id);
            
            if (existing) {
                const nextQty = existing.quantity + safeQty;
                if (nextQty <= p.quantity) {
                    existing.quantity = nextQty;
                    showToast('تم تحديث الكمية', 'success');
                } else {
                    showToast('الكمية المتوفرة غير كافية', 'warning');
                }
            } else {
                if (safeQty > p.quantity) {
                    showToast('الكمية المتوفرة غير كافية', 'warning');
                    return;
                }
                cart.push({
                    product_id: p.id,
                    name: p.name,
                    price: p.price,
                    warehouse_id: p.warehouse_id,
                    warehouse_name: p.warehouse_name,
                    quantity: safeQty,
                    max_quantity: p.quantity
                });
                showToast('تمت الإضافة للسلة', 'success');
            }
            
            updateCartCount();
        });
    } else {
        const existing = cart.find(item => (item.product_id || item.id) === productId);
        
        if (existing) {
            if (!existing.product_id && existing.id) {
                existing.product_id = existing.id;
            }
            const nextQty = existing.quantity + safeQty;
            if (nextQty <= product.quantity) {
                existing.quantity = nextQty;
                showToast('تم تحديث الكمية', 'success');
            } else {
                showToast('الكمية المتوفرة غير كافية', 'warning');
            }
        } else {
            if (safeQty > product.quantity) {
                showToast('الكمية المتوفرة غير كافية', 'warning');
                return;
            }
            cart.push({
                product_id: product.id,
                name: product.name,
                price: product.price,
                warehouse_id: product.warehouse_id,
                warehouse_name: product.warehouse_name,
                quantity: safeQty,
                max_quantity: product.quantity
            });
            showToast('تمت الإضافة للسلة', 'success');
        }
        
        updateCartCount();
    }
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = count;
}

function renderCart() {
    const container = document.getElementById('cart-items');
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket"></i>
                <p>السلة فارغة</p>
            </div>
        `;
        document.getElementById('cart-items-count').textContent = '0';
        document.getElementById('cart-total').textContent = '0 ج.م';
        return;
    }
    
    // Group by warehouse
    const grouped = cart.reduce((acc, item) => {
        const key = item.warehouse_id;
        if (!acc[key]) {
            acc[key] = {
                warehouse_name: item.warehouse_name,
                warehouse_id: item.warehouse_id,
                items: []
            };
        }
        acc[key].items.push(item);
        return acc;
    }, {});
    
    container.innerHTML = Object.values(grouped).map(group => `
        <div style="background: var(--background); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
            <h4 style="margin-bottom: 12px; color: var(--primary);">${group.warehouse_name}</h4>
            ${group.items.map(item => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <span class="cart-item-price">${item.price.toFixed(2)} ج.م</span>
                    </div>
                    <div class="quantity-control">
                        <button class="quantity-btn" onclick="updateCartQuantity(${item.product_id}, -1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateCartQuantity(${item.product_id}, 1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <span class="cart-item-total">${(item.price * item.quantity).toFixed(2)} ج.م</span>
                    <button class="btn-danger btn-sm" onclick="removeFromCart(${item.product_id})">
                        <i class="fas fa-trash-can"></i>
                    </button>
                </div>
            `).join('')}
        </div>
    `).join('');
    
    // Update totals
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('cart-items-count').textContent = cart.length;
    document.getElementById('cart-total').textContent = total.toFixed(2) + ' ج.م';
}

function updateCartQuantity(productId, change) {
    const item = cart.find(i => i.product_id === productId);
    if (item) {
        const newQty = item.quantity + change;
        if (newQty <= 0) {
            removeFromCart(productId);
        } else if (newQty <= item.max_quantity) {
            item.quantity = newQty;
            renderCart();
        } else {
            showToast('الكمية المتوفرة غير كافية', 'warning');
        }
    }
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.product_id !== productId);
    updateCartCount();
    renderCart();
}

async function checkout() {
    if (cart.length === 0) {
        showToast('السلة فارغة', 'warning');
        return;
    }
    
    // Group by warehouse
    const grouped = cart.reduce((acc, item) => {
        const key = item.warehouse_id;
        const itemProductId = item.product_id || item.id;
        if (!acc[key]) {
            acc[key] = [];
        }
        if (!itemProductId || !item.quantity || item.quantity <= 0) {
            return acc;
        }
        acc[key].push({
            product_id: itemProductId,
            quantity: item.quantity
        });
        return acc;
    }, {});
    
    try {
        const entries = Object.entries(grouped).filter(([, items]) => Array.isArray(items) && items.length > 0);
        if (entries.length === 0) {
            showToast('بيانات السلة غير صالحة، أعد إضافة المنتجات ثم حاول مرة أخرى', 'error');
            return;
        }

        for (const [warehouse_id, items] of entries) {
            await apiCall('/orders', 'POST', {
                warehouse_id: parseInt(warehouse_id),
                items: items
            });
        }
        
        showToast('تم تقديم الطلب بنجاح!', 'success');
        cart = [];
        updateCartCount();
        navigateTo('my-orders');
    } catch (error) {
        console.error(error);
    }
}

// ========================================
// Orders
// ========================================

async function loadWarehouseOrders() {
    try {
        const status = document.getElementById('order-status-filter').value;
        const endpoint = status ? `/orders?status=${status}` : '/orders';
        
        const data = await apiCall(endpoint);
        renderWarehouseOrdersTable(data.orders);
    } catch (error) {
        console.error(error);
    }
}

function renderWarehouseOrdersTable(orders) {
    const tbody = document.getElementById('warehouse-orders-table');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا توجد طلبات</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>#${order.id}</td>
            <td>${order.pharmacy_name}</td>
            <td>${order.items.length} منتج</td>
            <td>${order.total_amount.toFixed(2)} ج.م</td>
            <td>${order.commission.toFixed(2)} ج.م</td>
            <td><span class="status-badge ${order.status}">${getStatusName(order.status)}</span></td>
            <td>${formatDate(order.created_at)}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="viewOrderDetails(${order.id})">
                    <i class="fas fa-eye"></i>
                </button>
                ${order.status === 'pending' ? `
                    <button class="btn-danger btn-sm" title="متاح للطلبات المعلقة فقط" onclick="deleteOrder(${order.id}, '${order.status}')">
                        <i class="fas fa-trash-can"></i>
                    </button>
                ` : `
                    <span style="font-size: 12px; color: var(--text-secondary);">الحذف للطلبات المعلقة فقط</span>
                `}
                ${order.status !== 'delivered' && order.status !== 'cancelled' ? `
                    <select onchange="updateOrderStatus(${order.id}, this.value)" style="padding: 4px; margin-right: 4px;">
                        <option value="">تغيير الحالة</option>
                        <option value="processing">قيد التنفيذ</option>
                        <option value="shipped">تم الشحن</option>
                        <option value="delivered">تم التسليم</option>
                        <option value="cancelled">إلغاء</option>
                    </select>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

async function loadPharmacyOrders() {
    try {
        const status = document.getElementById('pharmacy-order-status-filter').value;
        const endpoint = status ? `/orders/my-orders?status=${status}` : '/orders/my-orders';
        
        const data = await apiCall(endpoint);
        renderPharmacyOrdersTable(data.orders);
    } catch (error) {
        console.error(error);
    }
}

function renderPharmacyOrdersTable(orders) {
    const tbody = document.getElementById('pharmacy-orders-table');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">لا توجد طلبات</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>#${order.id}</td>
            <td>${order.warehouse_name}</td>
            <td>${order.items.length} منتج</td>
            <td>${order.total_amount.toFixed(2)} ج.م</td>
            <td><span class="status-badge ${order.status}">${getStatusName(order.status)}</span></td>
            <td>${formatDate(order.created_at)}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="viewOrderDetails(${order.id})">
                    <i class="fas fa-eye"></i>
                </button>
                ${order.status === 'pending' ? `
                    <button class="btn-danger btn-sm" title="متاح للطلبات المعلقة فقط" onclick="deleteOrder(${order.id}, '${order.status}')">
                        <i class="fas fa-trash-can"></i>
                    </button>
                ` : `
                    <span style="font-size: 12px; color: var(--text-secondary);">الحذف للطلبات المعلقة فقط</span>
                `}
                ${order.status === 'delivered' && !order.rated ? `
                    <button class="btn-primary btn-sm" onclick="showRateModal(${order.id}, ${order.warehouse_id})">
                        <i class="fas fa-star"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

async function deleteOrder(orderId, status = 'pending') {
    if (status !== 'pending') {
        showToast('يمكن حذف الطلبات المعلقة فقط', 'error');
        return;
    }

    if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
    
    try {
        await apiCall(`/orders/${orderId}`, 'DELETE');
        showToast('تم حذف الطلب بنجاح', 'success');

        if (currentUser?.role === 'warehouse') {
            await Promise.all([loadWarehouseOrders(), loadDashboard()]);
        } else if (currentUser?.role === 'pharmacy') {
            await Promise.all([loadPharmacyOrders(), loadDashboard()]);
        } else if (currentUser?.role === 'admin') {
            await loadDashboard();
        }
    } catch (error) {
        console.error(error);
        showToast(error.message || 'فشل حذف الطلب', 'error');
    }
}

async function viewOrderDetails(orderId) {
    try {
        const data = await apiCall(`/orders/${orderId}`);
        const order = data.order;
        const timeline = Array.isArray(order.timeline) ? order.timeline : [];
        
        const content = document.getElementById('order-details-content');
        content.innerHTML = `
            <div style="margin-bottom: 16px;">
                <strong>رقم الطلب:</strong> #${order.id}<br>
                <strong>الحالة:</strong> <span class="status-badge ${order.status}">${getStatusName(order.status)}</span><br>
                <strong>التاريخ:</strong> ${formatDate(order.created_at)}<br>
                <strong>نافذة الإلغاء حتى:</strong> ${order.cancellable_until ? formatDate(order.cancellable_until) : '-'}<br>
                <strong>تاريخ التسليم المتوقع:</strong> ${order.expected_delivery_date ? formatDate(order.expected_delivery_date) : '-'}
            </div>
            
            <div style="margin-bottom: 16px;">
                <h4>الصيدلية</h4>
                <p>${order.pharmacy_name}</p>
                <p>${order.pharmacy_address || ''}</p>
            </div>
            
            <div style="margin-bottom: 16px;">
                <h4>المخزن</h4>
                <p>${order.warehouse_name}</p>
                <p>${order.warehouse_address || ''}</p>
            </div>

            <div style="margin-bottom: 16px;">
                <h4>الملاحظات</h4>
                <p><strong>ملاحظة الصيدلية:</strong> ${order.pharmacy_note || '-'}</p>
                <p><strong>ملاحظة المخزن:</strong> ${order.warehouse_note || '-'}</p>
            </div>
            
            <h4>المنتجات</h4>
            <div style="margin-bottom: 16px;">
                ${order.items.map(item => `
                    <div style="padding: 8px; border-bottom: 1px solid var(--border);">
                        <div style="display: flex; justify-content: space-between;">
                            <span>${item.product?.name || 'منتج #' + item.product_id}</span>
                            <span>${item.price.toFixed(2)} ج.م × ${item.quantity}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="border-top: 2px solid var(--border); padding-top: 16px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>المبلغ الإجمالي:</span>
                    <strong>${order.total_amount.toFixed(2)} ج.م</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>العمولة (10%):</span>
                    <span>${order.commission.toFixed(2)} ج.م</span>
                </div>
            </div>

            <div style="border-top: 2px solid var(--border); margin-top: 16px; padding-top: 16px;">
                <h4 style="margin-bottom: 12px;">التتبع الزمني للطلب</h4>
                ${renderOrderTimeline(timeline)}
            </div>
        `;
        
        document.getElementById('order-details-modal').classList.add('active');
    } catch (error) {
        console.error(error);
    }
}

async function updateOrderStatus(orderId, status) {
    if (!status) return;
    
    try {
        await apiCall(`/orders/${orderId}/status`, 'PUT', { status });
        showToast('تم تحديث حالة الطلب', 'success');
        loadWarehouseOrders();
    } catch (error) {
        console.error(error);
    }
}

// ========================================
// Invoices
// ========================================

async function loadInvoices() {
    try {
        const data = await apiCall('/invoices/my-stats');
        const stats = data.stats || { total_orders: 0, total_sales: 0, total_commission: 0, net_earnings: 0 };
        
        document.getElementById('invoice-total').textContent = (stats.total_sales || 0).toFixed(2) + ' ج.م';
        document.getElementById('invoice-commission').textContent = (stats.total_commission || 0).toFixed(2) + ' ج.م';
        document.getElementById('invoice-net').textContent = (stats.net_earnings || 0).toFixed(2) + ' ج.م';
        
        // Load invoice list
        const invoicesData = await apiCall('/invoices/my-invoices');
        renderInvoicesTable(invoicesData.invoices);
    } catch (error) {
        console.error(error);
    }
}

function renderInvoicesTable(invoices) {
    const tbody = document.getElementById('invoices-table');
    
    if (!invoices || invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">لا توجد فواتير</td></tr>';
        return;
    }
    
    tbody.innerHTML = invoices.map(invoice => {
        const invoiceTotal = Number(invoice.amount || 0) + Number(invoice.commission || 0);
        return `
        <tr>
            <td>#${invoice.id}</td>
            <td>#${invoice.order_id}</td>
            <td>${invoice.pharmacy_name || invoice.warehouse_name || '-'}</td>
            <td>${invoice.amount.toFixed(2)} ج.م</td>
            <td>${invoice.commission.toFixed(2)} ج.م</td>
            <td>${invoiceTotal.toFixed(2)} ج.م</td>
            <td><span class="status-badge ${invoice.status}">${invoice.status === 'paid' ? 'مدفوعة' : (invoice.status === 'cancelled' ? 'ملغاة' : 'معلقة')}</span></td>
            <td>${formatDate(invoice.created_at)}</td>
            <td>
                <button type="button" class="btn-secondary btn-sm" onclick="printInvoice(${invoice.id})" title="طباعة">
                    <i class="fas fa-print"></i>
                </button>
                <button type="button" class="btn-secondary btn-sm" onclick="manageInvoicePayments(${invoice.id}, ${invoiceTotal})" title="المدفوعات">
                    <i class="fas fa-money-check-alt"></i>
                </button>
                <button type="button" class="btn-secondary btn-sm" onclick="editInvoice(${invoice.id}, '${invoice.status}', ${invoice.amount}, ${invoice.commission}, ${invoiceTotal})" title="تعديل">
                    <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="btn-danger btn-sm" onclick="deleteInvoice(${invoice.id})" title="حذف">
                    <i class="fas fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `;
    }).join('');
}

function editInvoice(id, status, amount, commission, netAmount) {
    // Create a modal for editing
    const modalHtml = `
        <div class="modal active" id="invoice-edit-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>تعديل الفاتورة #${id}</h3>
                    <button class="close-btn" onclick="closeModal('invoice-edit-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="invoice-edit-form">
                        <div class="form-group">
                            <label>حالة الفاتورة</label>
                            <select id="invoice-status" class="form-control">
                                <option value="pending" ${status === 'pending' ? 'selected' : ''}>معلقة</option>
                                <option value="paid" ${status === 'paid' ? 'selected' : ''}>مدفوعة</option>
                                <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>ملغاة</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>المبلغ</label>
                            <input type="number" id="invoice-amount" class="form-control" step="0.01" value="${amount}">
                        </div>
                        <div class="form-group">
                            <label>العمولة</label>
                            <input type="number" id="invoice-commission" class="form-control" step="0.01" value="${commission}">
                        </div>
                        <div class="form-group">
                            <label>الإجمالي بعد العمولة</label>
                            <input type="number" id="invoice-net-amount" class="form-control" step="0.01" value="${netAmount}">
                        </div>
                        <input type="hidden" id="invoice-id" value="${id}">
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" onclick="closeModal('invoice-edit-modal')">إلغاء</button>
                            <button type="submit" class="btn-primary">حفظ التعديلات</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('invoice-edit-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Handle form submission
    document.getElementById('invoice-edit-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const invoiceId = document.getElementById('invoice-id').value;
        const invoiceData = {
            status: document.getElementById('invoice-status').value,
            amount: parseFloat(document.getElementById('invoice-amount').value),
            commission: parseFloat(document.getElementById('invoice-commission').value),
            net_amount: parseFloat(document.getElementById('invoice-net-amount').value)
        };
        
        try {
            await apiCall(`/invoices/${invoiceId}`, 'PUT', invoiceData);
            showToast('تم تحديث الفاتورة بنجاح', 'success');
            closeModal('invoice-edit-modal');
            loadInvoices();
        } catch (error) {
            console.error(error);
        }
    });
}

async function deleteInvoice(id) {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) {
        return;
    }
    
    try {
        await apiCall(`/invoices/${id}`, 'DELETE');
        showToast('تم حذف الفاتورة بنجاح', 'success');
        loadInvoices();
    } catch (error) {
        console.error(error);
    }
}

// ========================================
// Notifications
// ========================================

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function initializeWebPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return;
    }

    pushState.supported = true;

    try {
        const config = await apiCall('/notifications/push/config');
        pushState.enabled = Boolean(config?.enabled);
        pushState.publicKey = config?.publicKey || null;
        if (!pushState.enabled || !pushState.publicKey) {
            return;
        }

        if (!pushState.swRegistration) {
            pushState.swRegistration = await navigator.serviceWorker.register('/sw.js');
        }

        if (Notification.permission === 'granted') {
            await syncPushSubscriptionWithServer(false);
        }
    } catch (error) {
        console.error('Push initialization failed:', error);
    }
}

async function syncPushSubscriptionWithServer(allowPrompt) {
    if (!pushState.supported || !pushState.enabled || !pushState.publicKey) {
        return;
    }

    if (!pushState.swRegistration) {
        pushState.swRegistration = await navigator.serviceWorker.register('/sw.js');
    }

    if (Notification.permission === 'default' && allowPrompt) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            showToast('لم يتم منح إذن إشعارات المتصفح', 'warning');
            return;
        }
    }

    if (Notification.permission !== 'granted') {
        return;
    }

    let subscription = await pushState.swRegistration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await pushState.swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(pushState.publicKey)
        });
    }

    await apiCall('/notifications/push/subscribe', 'POST', { subscription });
}

async function unsubscribePushOnServer() {
    if (!pushState.supported || !pushState.swRegistration) return;
    const subscription = await pushState.swRegistration.pushManager.getSubscription();
    if (!subscription) return;

    await apiCall('/notifications/push/unsubscribe', 'DELETE', {
        endpoint: subscription.endpoint
    });
    await subscription.unsubscribe();
}

async function loadNotificationsCount() {
    try {
        const data = await apiCall('/notifications/unread-count');
        const count = data.count;
        
        if (count > 0) {
            document.getElementById('notif-count').textContent = count;
            document.getElementById('notif-count').style.display = 'block';
            document.getElementById('header-notif-count').textContent = count;
            document.getElementById('header-notif-count').style.display = 'block';
        } else {
            document.getElementById('notif-count').style.display = 'none';
            document.getElementById('header-notif-count').style.display = 'none';
        }
    } catch (error) {
        console.error(error);
    }
}

function buildNotificationsQuery() {
    const query = new URLSearchParams();
    query.set('page', String(notificationPage));
    query.set('limit', '20');

    if (notificationFilters.read === '0' || notificationFilters.read === '1') {
        query.set('read', notificationFilters.read);
    }

    if (notificationFilters.type) {
        query.set('type', notificationFilters.type);
    }

    if (notificationFilters.grouped) {
        query.set('grouped', '1');
    }

    return query.toString();
}

async function loadNotifications() {
    try {
        const query = buildNotificationsQuery();
        const data = await apiCall(`/notifications?${query}`);
        notifications = data.notifications || [];
        notificationPagination = data.pagination || null;
        renderNotificationPagination(notificationPagination);
        renderNotifications(data.notifications);
    } catch (error) {
        console.error(error);
    }
}

function getNotificationTypeLabel(type) {
    const labels = {
        new_order: 'طلب جديد',
        order_update: 'تحديث طلب',
        low_stock: 'مخزون منخفض',
        new_rating: 'تقييم جديد',
        return_request: 'طلب مرتجع',
        sms_queued: 'رسالة SMS',
        email_queued: 'إرسال بريد',
        wishlist_price_change: 'تغيير سعر المفضلة',
        wishlist_offer_added: 'عرض جديد بالمفضلة',
        info: 'تنبيه'
    };
    return labels[type] || type || 'تنبيه';
}

function getNotificationDetailLines(notif) {
    const lines = [];
    lines.push(`النوع: ${getNotificationTypeLabel(notif.type)}`);

    if (notif.related_id !== null && notif.related_id !== undefined) {
        lines.push(`مرجع العملية: #${notif.related_id}`);
    }

    if (notif.related_summary?.entity === 'product') {
        if (notif.related_summary.name) {
            lines.push(`المنتج: ${notif.related_summary.name}`);
        }
        if (notif.related_summary.quantity !== null && notif.related_summary.quantity !== undefined) {
            lines.push(`الكمية الحالية: ${notif.related_summary.quantity}`);
        }
    }

    const orderSummary = notif.related_summary?.entity === 'order'
        ? notif.related_summary
        : (notif.metadata?.order_id || notif.metadata?.order_status || notif.metadata?.total_amount !== undefined
            ? {
                status: notif.metadata?.order_status || null,
                total_amount: notif.metadata?.total_amount ?? null,
                expected_delivery_date: notif.metadata?.expected_delivery_date || null,
                items_count: notif.metadata?.items_count ?? null,
                total_quantity: notif.metadata?.total_quantity ?? null
            }
            : null);

    if (orderSummary) {
        if (orderSummary.status) {
            lines.push(`حالة الطلب: ${getStatusName(orderSummary.status)}`);
        }
        if (orderSummary.total_amount !== null && orderSummary.total_amount !== undefined) {
            lines.push(`إجمالي الطلب: ${Number(orderSummary.total_amount).toFixed(2)} ج.م`);
        }
        if (orderSummary.items_count !== null && orderSummary.items_count !== undefined) {
            lines.push(`عدد الأصناف: ${orderSummary.items_count}`);
        }
        if (orderSummary.total_quantity !== null && orderSummary.total_quantity !== undefined) {
            lines.push(`إجمالي الكمية: ${orderSummary.total_quantity}`);
        }
        if (orderSummary.expected_delivery_date) {
            lines.push(`التسليم المتوقع: ${formatDate(orderSummary.expected_delivery_date)}`);
        }
    }

    if (notif.related_summary?.entity === 'return' && notif.related_summary.status) {
        lines.push(`حالة المرتجع: ${notif.related_summary.status}`);
    }

    if (notif.related_summary?.entity === 'invoice') {
        if (notif.related_summary.status) {
            lines.push(`حالة الفاتورة: ${notif.related_summary.status}`);
        }
        if (notif.related_summary.amount !== null && notif.related_summary.amount !== undefined) {
            lines.push(`قيمة الفاتورة: ${Number(notif.related_summary.amount).toFixed(2)} ج.م`);
        }
    }

    if (notif.related_summary?.entity === 'rating' && notif.related_summary.value !== null && notif.related_summary.value !== undefined) {
        lines.push(`التقييم: ${notif.related_summary.value}/5`);
    }

    if (notif.metadata?.old_price !== undefined && notif.metadata?.new_price !== undefined) {
        lines.push(`السعر: ${notif.metadata.old_price} -> ${notif.metadata.new_price}`);
    }

    if (notif.read && notif.read_at) {
        lines.push(`تمت القراءة: ${formatDate(notif.read_at)}`);
    }

    return lines;
}

function renderNotifications(notifications) {
    const container = document.getElementById('notifications-list');
    
    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bell"></i>
                <p>لا توجد إشعارات</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = notifications.map(notif => `
        <div class="notification-item ${notif.read ? '' : 'unread'}">
            <div class="notification-icon">
                <i class="fas fa-${getNotificationIcon(notif.type)}"></i>
            </div>
            <div class="notification-content">
                <p>
                    ${escapeHtml(notif.message)}
                    ${Number(notif.grouped_count || 1) > 1 ? `<span class="notification-group-badge">x${notif.grouped_count}</span>` : ''}
                </p>
                ${(() => {
                    const detailLines = getNotificationDetailLines(notif);
                    if (!detailLines.length) return '';
                    return `
                        <div class="notification-meta">
                            ${detailLines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
                        </div>
                    `;
                })()}
                <span class="notification-time">${formatDate(notif.created_at)}</span>
            </div>
            <div class="notification-actions">
                ${!notif.read ? `
                    <button class="btn-secondary btn-sm" onclick="markNotificationRead(${notif.id})">
                        <i class="fas fa-check"></i>
                    </button>
                    ${Number(notif.grouped_count || 1) > 1 ? `
                        <button class="btn-secondary btn-sm" onclick="markNotificationGroupRead('${encodeURIComponent(notif.type)}', '${encodeURIComponent(notif.message)}', ${notif.related_id === null || notif.related_id === undefined ? 'null' : notif.related_id})">
                            <i class="fas fa-layer-group"></i>
                        </button>
                    ` : ''}
                ` : ''}
            </div>
        </div>
    `).join('');
}

function renderNotificationPagination(pagination) {
    const container = document.getElementById('notifications-pagination');
    if (!container) return;

    if (!pagination || !pagination.total_pages || pagination.total_pages <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <button class="btn-secondary btn-sm" onclick="goToNotificationPage(${pagination.page - 1})" ${pagination.has_prev ? '' : 'disabled'}>
            السابق
        </button>
        <span>صفحة ${pagination.page} من ${pagination.total_pages}</span>
        <button class="btn-secondary btn-sm" onclick="goToNotificationPage(${pagination.page + 1})" ${pagination.has_next ? '' : 'disabled'}>
            التالي
        </button>
    `;
}

function goToNotificationPage(page) {
    if (!notificationPagination) return;
    if (page < 1 || page > notificationPagination.total_pages) return;
    notificationPage = page;
    loadNotifications();
}

function applyNotificationFilters() {
    notificationFilters.read = document.getElementById('notification-read-filter')?.value || '';
    notificationFilters.type = document.getElementById('notification-type-filter')?.value || '';
    notificationFilters.grouped = Boolean(document.getElementById('notification-grouped-filter')?.checked);
    notificationPage = 1;
    loadNotifications();
}

function resetNotificationFilters() {
    document.getElementById('notification-read-filter').value = '';
    document.getElementById('notification-type-filter').value = '';
    document.getElementById('notification-grouped-filter').checked = false;
    notificationFilters.read = '';
    notificationFilters.type = '';
    notificationFilters.grouped = false;
    notificationPage = 1;
    loadNotifications();
}

async function markNotificationRead(id) {
    try {
        await apiCall(`/notifications/${id}/read`, 'PUT');
        loadNotifications();
        loadNotificationsCount();
    } catch (error) {
        console.error(error);
    }
}

async function markAllRead() {
    try {
        await apiCall('/notifications/read-all', 'PUT');
        showToast('تم تحديد جميع الإشعارات كمقروءة', 'success');
        loadNotifications();
        loadNotificationsCount();
    } catch (error) {
        console.error(error);
    }
}

async function markNotificationGroupRead(encodedType, encodedMessage, relatedId) {
    try {
        await apiCall('/notifications/read-group', 'PUT', {
            type: decodeURIComponent(encodedType),
            message: decodeURIComponent(encodedMessage),
            related_id: relatedId === null ? null : Number(relatedId)
        });
        loadNotifications();
        loadNotificationsCount();
    } catch (error) {
        console.error(error);
    }
}

async function deleteReadNotifications() {
    if (!confirm('هل تريد حذف جميع الإشعارات المقروءة؟')) {
        return;
    }

    try {
        const data = await apiCall('/notifications/read', 'DELETE');
        showToast(`تم حذف ${data.deleted_count || 0} إشعار`, 'success');
        loadNotifications();
        loadNotificationsCount();
    } catch (error) {
        console.error(error);
    }
}

async function sendTestPushNotification() {
    try {
        await initializeWebPush();
        await syncPushSubscriptionWithServer(true);
        await apiCall('/notifications/push/test', 'POST');
        showToast('تم إرسال إشعار تجريبي', 'success');
    } catch (error) {
        console.error(error);
    }
}

function toggleNotificationSettings() {
    const panel = document.getElementById('notification-settings-panel');
    if (!panel) return;

    const shouldOpen = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = shouldOpen ? 'block' : 'none';

    if (shouldOpen) {
        loadNotificationSettings();
    }
}

function applyNotificationSettingsToForm(settings) {
    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(Number(value));
    };

    setChecked('setting-order-updates', settings.order_updates);
    setChecked('setting-low-stock', settings.low_stock);
    setChecked('setting-ratings', settings.ratings);
    setChecked('setting-returns', settings.returns);
    setChecked('setting-system-alerts', settings.system_alerts);
    setChecked('setting-marketing', settings.marketing);
    setChecked('setting-email-enabled', settings.email_enabled);
    setChecked('setting-sms-enabled', settings.sms_enabled);
    setChecked('setting-push-enabled', settings.push_enabled);
}

async function loadNotificationSettings() {
    try {
        const data = await apiCall('/notifications/settings');
        if (data?.settings) {
            notificationSettingsCache = { ...data.settings };
            applyNotificationSettingsToForm(data.settings);
        }
    } catch (error) {
        console.error(error);
    }
}

async function saveNotificationSettings() {
    const payload = {
        order_updates: document.getElementById('setting-order-updates')?.checked ? 1 : 0,
        low_stock: document.getElementById('setting-low-stock')?.checked ? 1 : 0,
        ratings: document.getElementById('setting-ratings')?.checked ? 1 : 0,
        returns: document.getElementById('setting-returns')?.checked ? 1 : 0,
        system_alerts: document.getElementById('setting-system-alerts')?.checked ? 1 : 0,
        marketing: document.getElementById('setting-marketing')?.checked ? 1 : 0,
        email_enabled: document.getElementById('setting-email-enabled')?.checked ? 1 : 0,
        sms_enabled: document.getElementById('setting-sms-enabled')?.checked ? 1 : 0,
        push_enabled: document.getElementById('setting-push-enabled')?.checked ? 1 : 0
    };

    try {
        await apiCall('/notifications/settings', 'PUT', payload);
        notificationSettingsCache = { ...payload };
        if (payload.push_enabled) {
            await syncPushSubscriptionWithServer(true);
        } else {
            await unsubscribePushOnServer();
        }
        showToast('تم حفظ إعدادات الإشعارات', 'success');
    } catch (error) {
        console.error(error);
    }
}

// ========================================
// Ratings
// ========================================

async function loadRatings() {
    try {
        // Load warehouses for rating (pharmacy only)
        if (currentUser.role === 'pharmacy') {
            const warehousesData = await apiCall('/auth/warehouses');
            document.getElementById('rate-warehouse-section').style.display = 'block';
            
            document.getElementById('warehouses-for-rating').innerHTML = warehousesData.warehouses.map(w => `
                <div class="warehouse-card">
                    <h4>${w.username}</h4>
                    <p>${w.address || ''}</p>
                    <div class="warehouse-rating">
                        <div class="star-rating">
                            ${[1,2,3,4,5].map(i => `
                                <i class="fas fa-star ${i <= Math.round(w.rating || 0) ? 'active' : ''}"></i>
                            `).join('')}
                        </div>
                        <span>${w.rating ? w.rating.toFixed(1) : '0'} (${w.rating_count || 0} تقييم)</span>
                    </div>
                </div>
            `).join('');
        } else {
            document.getElementById('rate-warehouse-section').style.display = 'none';
        }
        
        // Load own ratings
        // This would require a new API endpoint, for now we'll show an empty list
        document.getElementById('my-ratings-list').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-star"></i>
                <p>لا توجد تقييمات</p>
            </div>
        `;
    } catch (error) {
        console.error(error);
    }
}

function showRateModal(orderId, warehouseId) {
    document.getElementById('rate-order-id').value = orderId;
    document.getElementById('rate-warehouse-id').value = warehouseId;
    document.getElementById('rating-value').value = 0;
    document.getElementById('rating-comment').value = '';
    
    document.querySelectorAll('#rate-modal .star-rating i').forEach(star => {
        star.classList.remove('active');
    });
    
    // Setup star rating
    document.querySelectorAll('#rate-modal .star-rating i').forEach(star => {
        star.onclick = function() {
            const value = parseInt(this.dataset.value);
            document.getElementById('rating-value').value = value;
            
            document.querySelectorAll('#rate-modal .star-rating i').forEach((s, i) => {
                s.classList.toggle('active', i < value);
            });
        };
    });
    
    document.getElementById('rate-modal').classList.add('active');
}

async function submitRating(e) {
    e.preventDefault();
    
    const orderId = parseInt(document.getElementById('rate-order-id').value);
    const warehouseId = parseInt(document.getElementById('rate-warehouse-id').value);
    const rating = parseInt(document.getElementById('rating-value').value);
    const comment = document.getElementById('rating-comment').value;
    
    if (rating === 0) {
        showToast('يرجى اختيار التقييم', 'warning');
        return;
    }
    
    try {
        await apiCall('/ratings', 'POST', {
            warehouse_id: warehouseId,
            order_id: orderId,
            rating: rating,
            comment: comment
        });
        
        showToast('شكراً لك! تم إرسال التقييم', 'success');
        closeModal('rate-modal');
        loadPharmacyOrders();
    } catch (error) {
        console.error(error);
    }
}

// ========================================
// Helpers
// ========================================

function getRoleName(role) {
    const roles = {
        'admin': 'مدير النظام',
        'warehouse': 'مخزن دواء',
        'pharmacy': 'صيدلية'
    };
    return roles[role] || role;
}

function getStatusName(status) {
    const statuses = {
        'pending': 'قيد الانتظار',
        'processing': 'قيد التنفيذ',
        'shipped': 'تم الشحن',
        'delivered': 'تم التسليم',
        'cancelled': 'ملغى'
    };
    return statuses[status] || status;
}

async function printInvoice(invoiceId) {
    // Try opening a print tab immediately while still inside user click context.
    const popup = window.open('about:blank', '_blank');

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/invoices/${invoiceId}/pdf`, {
            method: 'GET',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!response.ok) {
            throw new Error(`فشل تحميل الفاتورة للطباعة (${response.status})`);
        }
        const html = await response.text();
        const existingFrame = document.getElementById('invoice-print-frame');
        if (existingFrame) {
            existingFrame.remove();
        }

        if (popup && !popup.closed) {
            popup.document.open();
            popup.document.write(html);
            popup.document.close();
        } else {
            const iframe = document.createElement('iframe');
            iframe.id = 'invoice-print-frame';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.setAttribute('aria-hidden', 'true');
            document.body.appendChild(iframe);

            iframe.onload = () => {
                setTimeout(() => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                    } catch (e) {
                        console.error(e);
                        showToast('تعذر بدء الطباعة', 'error');
                    }
                }, 150);
            };

            if ('srcdoc' in iframe) {
                iframe.srcdoc = html;
            } else {
                const doc = iframe.contentWindow.document;
                doc.open();
                doc.write(html);
                doc.close();
            }
        }
    } catch (error) {
        console.error(error);
        if (popup && !popup.closed) {
            popup.close();
        }
        showToast(error.message || 'فشل تحميل الفاتورة للطباعة', 'error');
    }
}

async function manageInvoicePayments(invoiceId, invoiceNetAmount) {
    try {
        const data = await apiCall(`/invoices/${invoiceId}/payments`);
        const summary = data.summary || { total_paid: 0 };
        const totalPaid = Number(summary.total_paid || 0);
        const remaining = Number(invoiceNetAmount || 0) - totalPaid;

        const add = confirm(
            `إجمالي المدفوع: ${totalPaid.toFixed(2)} ج.م\n` +
            `المتبقي: ${remaining.toFixed(2)} ج.م\n\n` +
            `هل تريد تسجيل دفعة جديدة؟`
        );
        if (!add) return;

        const amountInput = prompt('أدخل مبلغ الدفعة:');
        if (!amountInput) return;
        const amount = parseFloat(amountInput);
        if (isNaN(amount) || amount <= 0) {
            showToast('قيمة الدفعة غير صالحة', 'error');
            return;
        }

        const method = prompt('طريقة الدفع (اختياري):') || null;
        const reference = prompt('رقم المرجع (اختياري):') || null;
        await apiCall(`/invoices/${invoiceId}/payments`, 'POST', {
            amount,
            payment_method: method,
            reference
        });
        showToast('تم تسجيل الدفعة بنجاح', 'success');
        await loadInvoices();
    } catch (error) {
        console.error(error);
        showToast(error.message || 'فشل إدارة المدفوعات', 'error');
    }
}

async function generateFinancialReport() {
    try {
        const yearInput = prompt('أدخل السنة للتقرير (مثال: 2026). اتركه فارغًا لتقرير شامل:');
        const monthInput = prompt('أدخل الشهر (1-12) أو اتركه فارغًا لتقرير سنوي/شامل:');

        const query = new URLSearchParams();
        const year = yearInput ? parseInt(yearInput, 10) : NaN;
        const month = monthInput ? parseInt(monthInput, 10) : NaN;

        if (!Number.isNaN(year)) {
            query.set('year', String(year));
        }
        if (!Number.isNaN(month)) {
            query.set('month', String(month));
        }

        const qs = query.toString() ? `?${query.toString()}` : '';
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/invoices/reports/financial/print${qs}`, {
            method: 'GET',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!response.ok) {
            throw new Error(`فشل توليد التقرير (${response.status})`);
        }
        const html = await response.text();
        const looksLikeAppShell =
            html.includes('<div id="app" class="page">') ||
            html.includes('<title>CuraLink') ||
            html.includes('<title>PharmaConnect');
        if (looksLikeAppShell) {
            throw new Error('الخادم يعمل بإصدار قديم. أعد تشغيل السيرفر ثم جرّب توليد التقرير مرة أخرى.');
        }

        const reportWindow = window.open('about:blank', '_blank');
        if (reportWindow && !reportWindow.closed) {
            reportWindow.document.open();
            reportWindow.document.write(html);
            reportWindow.document.close();
            return;
        }

        // Fallback if popup blocked.
        const existingFrame = document.getElementById('financial-report-print-frame');
        if (existingFrame) {
            existingFrame.remove();
        }
        const iframe = document.createElement('iframe');
        iframe.id = 'financial-report-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        iframe.onload = () => {
            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) {
                    console.error(e);
                    showToast('تعذر فتح التقرير للطباعة', 'error');
                }
            }, 120);
        };

        if ('srcdoc' in iframe) {
            iframe.srcdoc = html;
        } else {
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
        }
    } catch (error) {
        console.error(error);
        showToast(error.message || 'فشل توليد التقرير', 'error');
    }
}

function getOrderEventName(eventType) {
    const eventNames = {
        'order_created': 'إنشاء الطلب',
        'order_status_changed': 'تغيير حالة الطلب',
        'order_cancelled': 'إلغاء الطلب',
        'order_deleted': 'حذف الطلب (إلغاء منطقي)',
        'order_viewed': 'تمت مشاهدة الطلب'
    };
    return eventNames[eventType] || eventType;
}

function getActorDisplay(event) {
    const roleNames = {
        admin: 'المدير',
        warehouse: 'المخزن',
        pharmacy: 'الصيدلية'
    };

    const roleText = event.actor_role ? (roleNames[event.actor_role] || event.actor_role) : 'النظام';
    if (event.actor_username) {
        return `${roleText} (${event.actor_username})`;
    }
    return roleText;
}

function renderOrderTimeline(timeline) {
    if (!timeline || timeline.length === 0) {
        return '<div class="empty-state">لا توجد أحداث تتبع لهذا الطلب.</div>';
    }

    return `
        <div style="display: grid; gap: 10px;">
            ${timeline.map(event => `
                <div style="padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface);">
                    <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px;">
                        <strong>${getOrderEventName(event.event_type)}</strong>
                        <span style="color: var(--text-secondary); font-size: 12px;">${formatDate(event.created_at)}</span>
                    </div>
                    <div style="font-size: 13px; margin-bottom: 4px;">${event.message || ''}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        <span>المنفذ: ${getActorDisplay(event)}</span>
                        ${event.from_status && event.to_status ? `<span> | الحالة: ${getStatusName(event.from_status)} -> ${getStatusName(event.to_status)}</span>` : (event.to_status ? `<span> | الحالة: ${getStatusName(event.to_status)}</span>` : '')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function getNotificationIcon(type) {
    const icons = {
        'new_order': 'shopping-cart',
        'order_update': 'sync-alt',
        'low_stock': 'exclamation-triangle',
        'new_rating': 'star',
        'return_request': 'undo',
        'sms_queued': 'sms',
        'email_queued': 'envelope',
        'info': 'info-circle'
    };
    return icons[type] || 'bell';
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ========================================
// Initialize
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    
    // Setup nav clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.page);
        });
    });

    updateBrowseFiltersState();
    setFiltersPanelExpanded(!window.matchMedia('(max-width: 768px)').matches);
});
