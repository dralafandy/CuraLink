# PharmaConnect - نظام الوساطة الدوائية

## 1. Project Overview

**Project Name:** PharmaConnect
**Project Type:** Node.js Web Application
**Core Functionality:** نظام رقمي متكامل يعمل كوسيط بين المخازن الدوائية والصيدليات
**Target Users:** المخازن الدوائية، الصيدليات، مدير المنصة

---

## 2. UI/UX Specification

### Layout Structure

**الصفحات الرئيسية:**
1. صفحة الدخول/تسجيل الدخول
2. لوحة تحكم المخازن
3. لوحة تحكم الصيدليات
4. صفحة إدارة الطلبات
5. صفحة الفواتير والمدفوعات
6. صفحة الإشعارات والتنبيهات
7. صفحة التقييمات

**Responsive Breakpoints:**
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Visual Design

**Color Palette:**
- Primary: #1B4D3E (Dark Green - Trust/Healthcare)
- Secondary: #2D7A5F (Medium Green)
- Accent: #F4A261 (Orange - Alerts/CTA)
- Background: #F8FAF9 (Light Gray-Green)
- Card Background: #FFFFFF
- Text Primary: #1A1A2E
- Text Secondary: #6B7280
- Success: #10B981
- Warning: #F59E0B
- Danger: #EF4444
- Info: #3B82F6

**Typography:**
- Arabic Font: 'Cairo', sans-serif
- Headings: Cairo Bold
- Body: Cairo Regular
- Sizes: h1: 32px, h2: 24px, h3: 20px, h4: 16px, body: 14px

**Spacing System:**
- Base unit: 8px
- Margins: 8px, 16px, 24px, 32px, 48px
- Card padding: 24px
- Section gap: 32px

**Visual Effects:**
- Card shadows: 0 4px 6px rgba(0,0,0,0.05)
- Hover shadows: 0 8px 15px rgba(0,0,0,0.1)
- Border radius: 12px (cards), 8px (buttons), 6px (inputs)
- Transitions: 0.3s ease

### Components

**Cards:**
- Statistics cards with icons and values
- Product cards with image, name, price, quantity
- Order cards with status badges

**Buttons:**
- Primary: #1B4D3E background, white text
- Secondary: transparent with border
- Danger: #EF4444 for delete actions

**Forms:**
- Input fields with labels
- Select dropdowns
- Date pickers
- Number inputs with +/- buttons

**Tables:**
- Striped rows
- Sortable headers
- Pagination

**Status Badges:**
- Pending: #F59E0B (Orange)
- Processing: #3B82F6 (Blue)
- Shipped: #8B5CF6 (Purple)
- Delivered: #10B981 (Green)
- Cancelled: #EF4444 (Red)

---

## 3. Functionality Specification

### 3.1 نظام المستخدمين

**الأدوار:**
- admin: مدير المنصة
- warehouse: مخزن دواء
- pharmacy: صيدلية

**بيانات المستخدم:**
- اسم المستخدم
- البريد الإلكتروني
- كلمة المرور
- رقم الهاتف
- العنوان
- الدور
- التقييم (معدل)
- تاريخ التسجيل

### 3.2 لوحة تحكم المخازن

**الميزات:**
- عرض إحصائيات: عدد المنتجات، الطلبات، المبيعات
- إضافة/تعديل/حذف المنتجات
- تفاصيل المنتج: الاسم، الوصف، الصورة، السعر، الكمية، تاريخ الصلاحية
- عرض الطلبات الواردة
- تحديث حالة الطلبات
- عرض المدفوعات والعمولات

### 3.3 لوحة تحكم الصيدليات

**الميزات:**
- تصفح المنتجات حسب الفئة
- البحث عن منتجات
- إضافة للسلة
- تأكيد الطلب
- تتبع حالة الطلب
- عرض سجل الطلبات
- تقييم المخازن

### 3.4 نظام الطلبات

**حالات الطلب:**
- pending: قيد الانتظار
- processing: قيد التنفيذ
- shipped: تم الشحن
- delivered: تم التسليم
- cancelled: ملغى

**بيانات الطلب:**
- رقم الطلب
- الصيدلية (المستخدم)
- المخزن
- قائمة المنتجات
- الكميات
- الإجمالي
- العمولة (10%)
- الحالة
- تاريخ الإنشاء
- تاريخ التحديث

### 3.5 نظام الفواتير والمدفوعات

**بيانات الفاتورة:**
- رقم الفاتورة
- الطلب المرتبط
- المبلغ الإجمالي
- العمولة (10%)
- الصافي للمخزن
- حالة الدفع
- تاريخ الدفع

### 3.6 نظام العمولات

- نسبة العمولة: 10% من كل طلب
- احتساب تلقائي
- تقارير بالعمولات

### 3.7 نظام التنبيهات

**أنواع التنبيهات:**
- نقص المخزون (كمية أقل من 10)
- انتهاء الصلاحية (خلال 30 يوم)
- طلب جديد
- تغيير حالة الطلب
- تقييم جديد

### 3.8 نظام التقييم

**التقييمات:**
- تقييم الصيدليات للمخازن (1-5 نجوم)
- تعليق اختياري
- تاريخ التقييم

---

## 4. Technical Architecture

### Backend (Node.js + Express)
- Server: Express.js
- Database: SQLite3
- Authentication: JWT
- Password: bcrypt

### API Endpoints

**المستخدمين:**
- POST /api/auth/register
- POST /api/auth/login
- GET /api/users/profile
- PUT /api/users/profile

**المنتجات:**
- GET /api/products
- GET /api/products/:id
- POST /api/products (warehouse)
- PUT /api/products/:id (warehouse)
- DELETE /api/products/:id (warehouse)

**الطلبات:**
- GET /api/orders
- GET /api/orders/:id
- POST /api/orders
- PUT /api/orders/:id/status (warehouse)
- GET /api/orders/my-orders (pharmacy)

**الفواتير:**
- GET /api/invoices
- GET /api/invoices/:id

**التقييمات:**
- GET /api/ratings/:warehouseId
- POST /api/ratings

**الإشعارات:**
- GET /api/notifications
- PUT /api/notifications/:id/read

---

## 5. Database Schema

### users
- id, username, email, password, phone, address, role, rating, created_at

### products
- id, warehouse_id, name, description, category, price, quantity, expiry_date, image, created_at

### orders
- id, pharmacy_id, warehouse_id, total_amount, commission, status, created_at, updated_at

### order_items
- id, order_id, product_id, quantity, price

### invoices
- id, order_id, amount, commission, net_amount, status, paid_at

### ratings
- id, pharmacy_id, warehouse_id, order_id, rating, comment, created_at

### notifications
- id, user_id, type, message, read, created_at

---

## 6. Acceptance Criteria

### Must Have:
- [ ] تسجيل دخول ونظام مصادقة
- [ ] لوحات تحكم منفصلة لكل دور
- [ ] إضافة وتعديل المنتجات
- [ ] تصفح المنتجات والبحث
- [ ] إنشاء طلبات
- [ ] تحديث حالة الطلبات
- [ ] عرض الفواتير
- [ ] إشعارات نقص المخزون
- [ ] تقييم المخازن

### Visual Checkpoints:
- [ ] تصميم عربي متجاوب
- [ ] ألوان متناسقة
- [ ] أيقونات وصور
- [ ] تأثيرات حركية
- [ ] جداول وقوائم
