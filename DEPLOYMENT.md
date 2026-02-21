# PharmaConnect Deployment Guide

## ⚠️ Important - Database Change

This project now uses **Supabase** (PostgreSQL) instead of SQLite for proper serverless support.

---

## Quick Deploy with Supabase + Vercel

### Step 1: Create Supabase Project
1. Go to https://supabase.com
2. Sign in with GitHub
3. Click "New Project"
4. Fill in project details:
   - **Name**: PharmaConnect
   - **Database Password**: (remember this!)
   - **Region**: Choose closest to your users

### Step 2: Run SQL Schema
1. In Supabase dashboard, go to **SQL Editor**
2. Copy contents from `database/supabase-schema.sql`
3. Click **Run** to execute

### Step 3: Get API Credentials
1. Go to **Settings → API**
2. Copy:
   - **Project URL** (SUPABASE_URL)
   - **anon public** key (SUPABASE_ANON_KEY)

### Step 4: Deploy to Vercel
1. Go to https://vercel.com
2. Import your GitHub repository
3. Add environment variables:
   
```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   NODE_ENV=production
   
```
4. Deploy!

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Your Supabase anon key |
| `NODE_ENV` | No | Set to `production` for live |

---

## Troubleshooting

### Database not connecting
- Verify SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Check Supabase project is not paused
- Ensure SQL schema was run successfully

### Authentication errors
- Clear browser cache and login again
- Check JWT_SECRET in auth routes

### Build errors
- Ensure all dependencies are in package.json
- Run `npm install` locally first

---

## Local Development

1. Create Supabase project
2. Run SQL schema locally
3. Create `.env` file:
   
```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   
```
4. Run `npm run dev`

---

## Default Accounts (after SQL runs)
- **Admin**: admin@curalink.com / admin123
- **Warehouse**: warehouse1@test.com / warehouse123
- **Pharmacy**: pharmacy1@test.com / pharmacy123

---

## Need Help?
- Vercel Docs: https://vercel.com/docs
- Supabase Docs: https://supabase.com/docs
