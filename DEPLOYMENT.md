# PharmaConnect Deployment Guide

## 🚀 Quick Deploy with Supabase

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in with GitHub
3. Click "New Project"
4. Fill in details:
   - **Name:** PharmaConnect
   - **Database Password:** Your secure password (remember this!)
   - **Region:** Choose nearest to your users

5. Wait for setup to complete (about 2 minutes)

### Step 2: Create Database Tables

1. In Supabase dashboard, click **SQL Editor**
2. Copy contents from `database/supabase-schema.sql`
3. Paste and click **Run**
4. Verify tables created (check **Table Editor** in sidebar)

### Step 3: Get Supabase Credentials

1. Go to **Project Settings** (gear icon)
2. Click **API**
3. Copy:
   - **Project URL** (SUPABASE_URL)
   - **anon public** key (SUPABASE_ANON_KEY)

### Step 4: Push to GitHub

```
bash
git init
git add .
git commit -m "Add Supabase support"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/PharmaConnect.git
git push -u origin main
```

### Step 5: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Add New → Project
3. Import your GitHub repository
4. In **Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_ANON_KEY` | Your anon public key |
| `NODE_ENV` | production |

5. Click **Deploy**

---

## 🔧 Alternative: Supabase + Local Development

### Local Setup

1. Create `.env` file:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

2. Install dependencies:
```bash
npm install
```

3. Run locally:
```
bash
npm run dev
```

---

## 📋 Database Schema

The project includes `database/supabase-schema.sql` with:

- **users** - Admin, warehouses, pharmacies
- **products** - Medicine listings
- **orders** - Pharmacy orders
- **order_items** - Order details
- **invoices** - Payment tracking
- **notifications** - User notifications
- **wishlist** - Pharmacy favorites
- **ratings** - Warehouse reviews
- **returns** - Order returns
- **And more...**

All tables have:
- Proper indexes for performance
- Row Level Security (RLS) policies
- Foreign key relationships

---

## 🔄 Using SQLite (Development Only)

For local development without Supabase:

1. Delete or comment out Supabase env variables
2. App will automatically use SQLite from `database/curalink.db`
3. Data will be stored locally

**Note:** SQLite won't persist on Vercel serverless!

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes (for Supabase) | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes (for Supabase) | Your anon public key |
| `DB_NAME` | No | Database name (default: curalink) |
| `JWT_SECRET` | No | Secret for JWT tokens |
| `NODE_ENV` | No | production or development |

---

## 🖥️ Default Test Accounts

After deployment, use these accounts:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@curalink.com | admin123 |
| Warehouse | warehouse1@test.com | warehouse123 |
| Pharmacy | pharmacy1@test.com | pharmacy123 |

---

## 🔧 Troubleshooting

### Database Connection Error
- Verify SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Check Supabase project is active
- Ensure RLS policies allow access

### Table Not Found
- Run `database/supabase-schema.sql` in Supabase SQL Editor
- Check Table Editor shows all tables

### Authentication Issues
- Clear browser cache
- Check JWT_SECRET is set in Vercel

### CORS Errors
- Update Supabase settings → API → CORS settings
- Add your Vercel domain to allowed origins

---

## 📚 Resources

- [Supabase Docs](https://supabase.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [GitHub Actions](https://docs.github.com/en/actions)

---

## 🔐 Security Notes

1. Keep `SUPABASE_ANON_KEY` secret (it's public but don't expose unnecessarily)
2. For production, configure proper RLS policies in Supabase
3. Use strong JWT_SECRET
4. Enable 2FA on Supabase and Vercel accounts
