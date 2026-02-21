# PharmaConnect - Supabase Configuration

## Status: ✅ Complete

## Files Updated for Supabase:

| File | Description |
|------|-------------|
| `package.json` | Added @supabase/supabase-js |
| `database/db.js` | Supabase client with callback API |
| `database/supabase-schema.sql` | SQL schema for Supabase |
| `routes/auth.js` | Updated to async/await |
| `vercel.json` | Fixed build configuration |

## Setup Steps:

### 1. Create Supabase Project
- Go to https://supabase.com
- Create new project

### 2. Run SQL Schema
- Open SQL Editor in Supabase dashboard
- Copy contents of `database/supabase-schema.sql`
- Run the SQL

### 3. Get Credentials
- Settings → API
- Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### 4. Deploy to Vercel
- Add environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `NODE_ENV=production`

## Test Accounts:
- Admin: admin@curalink.com / admin123
- Warehouse: warehouse1@test.com / warehouse123  
- Pharmacy: pharmacy1@test.com / pharmacy123
