# 🚀 Free Deployment Guide

This guide shows how to deploy the CNN Project for **FREE** using **Railway (Backend)** and **Vercel (Frontend)**.

---

## PART 1: Deploy Backend on Railway (FREE)

### Step 1: Sign Up on Railway
1. Go to [railway.app](https://railway.app)
2. Click **"Start Project"**
3. Sign in with **GitHub** (easiest)
4. Authorize Railway to access your GitHub account

### Step 2: Create New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Search for and select **`CVProject`**
4. Click **"Deploy Now"**

### Step 3: Configure Environment
1. Railway will auto-detect it's a Python project
2. Go to the **Variables** section
3. Add these environment variables:
   ```
   FLASK_ENV=production
   FLASK_DEBUG=0
   ```
4. Save variables

### Step 4: Railway Sets Up Automatically
- Railway automatically installs requirements.txt
- Reads Procfile and starts: `python app.py`
- Database will be created in `/tmp` (SQLite)
- Your backend will be live at something like: `https://your-project-api.up.railway.app`

### Step 5: Get Your Backend URL
1. Go to **Settings** tab
2. Copy the **Domain** URL (e.g., `https://cvproject-production.up.railway.app`)
3. **Save this URL** - you'll need it for the frontend!

---

## PART 2: Deploy Frontend on Vercel (FREE)

### Step 1: Sign Up on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Select **"Continue with GitHub"**
4. Authorize Vercel

### Step 2: Import Your Repository
1. Click **"New Project"**
2. Search for **`CVProject`** in "Import Git Repository"
3. Click **"Import"**

### Step 3: Configure Build Settings
1. **Framework Preset**: Select **Vite**
2. **Root Directory**: Set to `frontend`
3. Vercel should auto-detect everything

### Step 4: Add Environment Variables
1. In the **Environment Variables** section, add:
   ```
   VITE_API_URL = https://your-railway-backend-url.up.railway.app
   ```
   (Replace with the URL you copied from Step 5 above!)

2. Click **"Deploy"**

### Step 5: Your Frontend is LIVE!
- Vercel will give you a URL like: `https://cvproject.vercel.app`
- It automatically deploys on every GitHub push!

---

## PART 3: Test Your Deployment

### Frontend
- Open your Vercel URL in browser
- You should see the **Lunar Telemetry Dashboard**

### Backend Endpoints
Test these in your browser:
- **Base API**: `https://your-railway-url.up.railway.app/`
- **Get all craters**: `https://your-railway-url.up.railway.app/api/craters`
- **Get crater details**: `https://your-railway-url.up.railway.app/api/craters/shackleton`

---

## IMPORTANT NOTES

### ✅ What's Free
- **Railway**: First $5/month free, then pay-as-you-go (about $7/month for this project)
- **Vercel**: 100% FREE for frontend hosting
- **Total Cost**: ~$7/month or less

### ⚠️ Database Note
- SQLite database is stored on Railway's temporary storage
- Each deployment resets the database
- For production, upgrade to PostgreSQL ($7/month) - optional!

### 🔄 Auto-Deployment
- Both Vercel and Railway automatically redeploy when you push to GitHub
- Just update your code and push: `git push origin main`

### 🔗 CORS is Enabled
- Backend has `CORS` enabled, so frontend can call it from any domain
- No additional configuration needed!

---

## QUICK CHECKLIST

- [ ] Railway account created
- [ ] Backend deployed to Railway
- [ ] Backend domain URL copied
- [ ] Vercel account created
- [ ] Frontend imported from GitHub
- [ ] Environment variable `VITE_API_URL` set in Vercel
- [ ] Frontend deployed
- [ ] Test frontend in browser
- [ ] Test API endpoints

---

## TROUBLESHOOTING

### Frontend shows "Running raycaster & RANSAC detection..." but stuck
- **Solution**: Check browser console (F12) for API errors
- Make sure `VITE_API_URL` in Vercel matches your Railway URL exactly

### Backend returns 500 errors
- Check Railway **Logs** tab for error messages
- Ensure Python 3.11+ is specified in `runtime.txt`

### Database errors
- Railway auto-creates database on first run
- If stuck, go to Railway **Settings** > **Reset** > **Hard Reset**

---

## NEXT STEPS

### For Production
1. Upgrade Railway to PostgreSQL for persistent database
2. Add authentication (optional)
3. Set up custom domain

### For Development
- Continue pushing updates to GitHub
- Changes automatically deploy!

---

## COSTS BREAKDOWN

| Service | Free Tier | Cost |
|---------|-----------|------|
| Vercel (Frontend) | Unlimited | FREE ✅ |
| Railway (Backend) | $5/month credit | ~$2-7/month |
| Custom Domain | First 2 free | ~$10/year each |
| **TOTAL** | | **~$7/month** |

---

**Your project is now LIVE on the internet!** 🎉

📱 **Frontend**: Your Vercel URL
🔌 **Backend**: Your Railway URL
💾 **Database**: Auto-managed by Railway

Push code → Auto-deploys. Easy! 🚀
