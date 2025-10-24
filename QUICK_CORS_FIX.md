# Quick CORS Fix - 2 Minute Setup

## The Problem
You're seeing CORS errors in production because your backend doesn't know your frontend's domain.

## The Fix (3 Steps)

### Step 1: Find Your Frontend URL
Example: `https://your-app.vercel.app` or `https://yourdomain.com`

### Step 2: Set Environment Variable
Add this to your **backend server** environment:

```
CLIENT_URL=https://your-frontend-url.com
```

**Important:** 
- Use the EXACT URL your frontend is hosted on
- Include `https://` (or `http://`)
- NO trailing slash
- For multiple domains: `CLIENT_URL=https://domain1.com,https://domain2.com`

### Step 3: Restart Backend
Restart your backend server to apply the changes.

## Platform-Specific Instructions

### Vercel:
1. Project Settings → Environment Variables
2. Add `CLIENT_URL` = `https://your-frontend-url.com`
3. Redeploy

### Heroku:
```bash
heroku config:set CLIENT_URL=https://your-frontend-url.com
```

### Railway/Render:
1. Environment Variables section
2. Add `CLIENT_URL` = `https://your-frontend-url.com`
3. Redeploy

### Docker:
```yaml
environment:
  - CLIENT_URL=https://your-frontend-url.com
```

## Verify It Worked

After restarting, check your backend logs. You should see:
```
Allowed CORS origins: [ 'https://your-frontend-url.com' ]
```

## Still Not Working?

1. ✅ Did you restart the backend?
2. ✅ Is the URL exactly the same (check for www. vs non-www)?
3. ✅ Are you using https:// in production?
4. ✅ Check browser console for the actual error message

## Example Configurations

**Development:**
```
CLIENT_URL=http://localhost:3000
```

**Production (Single Domain):**
```
CLIENT_URL=https://myapp.com
```

**Production (Multiple Domains):**
```
CLIENT_URL=https://myapp.com,https://www.myapp.com,https://app.myapp.com
```

---

For detailed troubleshooting, see `PRODUCTION_SETUP.md`

