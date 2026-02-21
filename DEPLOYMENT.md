# PharmaConnect Deployment Guide

## ⚠️ Important Note About SQLite and Vercel

This project uses SQLite database. **Vercel serverless functions are ephemeral**, meaning:
- Database changes won't persist between function invocations
- The `/tmp` directory is temporary and gets cleared
- Each request may hit a different server instance

### Solutions for Database Persistence:

#### Option A: Use External Database (Recommended for Production)
For production, use PostgreSQL, MySQL, or a service like:
- **Neon** (Free PostgreSQL) - https://neon.tech
- **Supabase** (Free PostgreSQL) - https://supabase.com
- **Railway** (MySQL/PostgreSQL) - https://railway.app

#### Option B: Use Vercel with SQLite (Limited)
For testing/demo purposes, the app will work but:
- Data resets on each deployment
- Not suitable for production with real data
- Use the `/tmp` directory for temporary storage

---

## 🚀 Quick Deploy to Vercel

### Step 1: Push to GitHub
```
bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/PharmaConnect.git
git push -u origin main
```

### Step 2: Connect to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click "Add New..." → "Project"
4. Import your GitHub repository
5. Configure settings:
   - **Framework Preset:** Other
   - **Build Command:** Leave empty
   - **Output Directory:** Leave empty
6. Click "Deploy"

### Step 3: Get Your URL
- Vercel provides a URL like `your-app.vercel.app`

---

## 🔧 Environment Variables

If using external database, add these in Vercel dashboard:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL/MySQL connection string | `postgres://user:pass@host:5432/db` |
| `DB_NAME` | Database name | `pharmaconnect` |
| `JWT_SECRET` | Secret for JWT tokens | `your-secret-key` |
| `NODE_ENV` | Environment | `production` |

---

## 📋 Vercel Configuration

The project includes `vercel.json` with proper configuration:

```
json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" },
    { "src": "public/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" },
    { "src": "/login", "dest": "/public/login.html" },
    { "src": "/(.*)", "dest": "/public/$1" }
  ]
}
```

---

## 🔄 GitHub Actions Deployment

The project includes `.github/workflows/deploy.yml` for automatic deployment:

1. **Push to main branch** → Deploys to production
2. **Create Pull Request** → Deploys preview version

### Required Secrets (Vercel Dashboard → Settings → Git Integrations):
- `VERCEL_TOKEN` - Your Vercel API token
- `VERCEL_ORG_ID` - Your organization ID
- `VERCEL_PROJECT_ID` - Your project ID

---

## 🖥️ Alternative Hosting Options

### Option 1: Railway (Recommended for SQLite)
Railway supports persistent file storage perfect for SQLite.

1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys
6. Your app: `your-app.railway.app`

**Free tier:** $5 credit/month

### Option 2: Render
Render offers persistent disk for SQLite.

1. Go to [render.com](https://render.com)
2. Create "Web Service"
3. Connect GitHub repository
4. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add Persistent Disk: Yes (required for SQLite)

**Free tier:** 750 hours/month

### Option 3: Traditional VPS (DigitalOcean, Linode)
1. Create Ubuntu VPS
2. Install Node.js:
   
```
bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
```
3. Clone repo or upload files
4. Install PM2:
   
```
bash
   sudo npm install -g pm2
   pm2 start server.js --name pharmaconnect
   pm2 startup
   pm2 save
   
```
5. Setup Nginx reverse proxy for SSL

---

## 🧪 Testing Local Development

```
bash
# Install dependencies
npm install

# Run development server
npm run dev

# Server runs on http://localhost:3000
```

### Default Accounts:
- **Admin:** admin@curalink.com / admin123
- **Warehouse:** warehouse1@test.com / warehouse123
- **Pharmacy:** pharmacy1@test.com / pharmacy123

---

## 📝 Troubleshooting

### Database Issues
- Ensure `database/` folder exists in deployment
- Check file permissions for `.db` files
- On Railway/Render, database persists between deploys
- On Vercel, use external database for persistence

### Port Issues
- App uses `process.env.PORT || 3000`
- Hosting platforms set PORT automatically

### Static Files Not Loading
- Check `public/` folder is in git
- Verify paths in HTML/JS files

### Common Vercel Errors
| Error | Solution |
|-------|----------|
| 404 on API routes | Check `vercel.json` routes configuration |
| Database not found | Ensure database file is in correct location |
| Function timeout | Increase maxDuration in vercel.json |

---

## 📚 Additional Resources

- Vercel Docs: https://vercel.com/docs
- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs
- SQLite3 Node.js: https://www.npmjs.com/package/sqlite3

---

## ⚡ Performance Tips

1. **Use CDN** - Vercel automatically serves static files via CDN
2. **Optimize Images** - Compress images in `public/uploads/`
3. **Database Indexes** - Already configured in `database/db.js`
4. **API Response Caching** - Consider adding cache headers

---

## 🔐 Security Notes

1. Change JWT_SECRET in production
2. Use HTTPS (automatic on Vercel)
3. Validate user input on all endpoints
4. Keep dependencies updated
5. Don't commit sensitive data to GitHub
