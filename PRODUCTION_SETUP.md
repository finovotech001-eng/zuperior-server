# Production CORS Setup Guide

## Problem
Your application is experiencing CORS (Cross-Origin Resource Sharing) errors in production because the backend server doesn't recognize the production frontend domain as an allowed origin.

## Solution

### 1. Set the CLIENT_URL Environment Variable

In your production server environment, you **must** set the `CLIENT_URL` environment variable to include your frontend domain(s).

#### For a single domain:
```bash
CLIENT_URL=https://yourdomain.com
```

#### For multiple domains (comma-separated):
```bash
CLIENT_URL=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com
```

### 2. Environment Variable Setup by Platform

#### Vercel / Netlify / Railway / Render:
1. Go to your project settings
2. Navigate to "Environment Variables" section
3. Add: `CLIENT_URL` = `https://yourdomain.com`
4. Redeploy your application

#### Heroku:
```bash
heroku config:set CLIENT_URL=https://yourdomain.com
```

#### Docker:
Add to your docker-compose.yml or Dockerfile:
```yaml
environment:
  - CLIENT_URL=https://yourdomain.com
```

#### Traditional Server (Linux):
Add to `/etc/environment` or your process manager config (PM2, systemd):
```bash
export CLIENT_URL=https://yourdomain.com
```

### 3. Verify Configuration

After setting the environment variable and restarting your backend server, you should see in your logs:
```
Server is running on port 5000
API URL: http://localhost:5000/
Allowed CORS origins: [ 'https://yourdomain.com' ]
```

If you see an origin being blocked, the logs will show:
```
CORS: Blocked origin https://wrong-domain.com. Allowed origins: [ 'https://yourdomain.com' ]
```

### 4. Common Issues and Fixes

#### Issue: "Origin is undefined"
- This happens with server-side requests. The updated code now allows requests with no origin.

#### Issue: "Still getting CORS errors"
- Make sure you've restarted the backend server after setting the environment variable
- Verify the CLIENT_URL matches EXACTLY (including http:// or https://, no trailing slash)
- Check browser console for the actual origin being used
- Clear your browser cache and cookies

#### Issue: "Works in development, fails in production"
- Development uses `http://localhost:3000` (default)
- Production needs your actual domain set in CLIENT_URL

### 5. Required Environment Variables for Production

Create these environment variables in your production environment:

```bash
# Required
CLIENT_URL=https://yourdomain.com
DATABASE_URL=your-database-connection-string
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Optional (if using these features)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourdomain.com
```

### 6. Testing

To test if CORS is working:
1. Open your production frontend
2. Open browser DevTools (F12)
3. Go to Network tab
4. Try making a request (e.g., login)
5. Check the request headers - you should see:
   - `Access-Control-Allow-Origin: https://yourdomain.com`
   - `Access-Control-Allow-Credentials: true`

## Changes Made

The following files were updated to improve CORS handling:

1. **`src/index.js`**:
   - Enhanced CORS configuration with better origin validation
   - Added support for preflight OPTIONS requests
   - Added logging for debugging CORS issues
   - Extended allowed headers and methods

## Need Help?

If you're still experiencing CORS issues after following this guide:
1. Check the server logs for "CORS: Blocked origin" messages
2. Verify the CLIENT_URL environment variable is set correctly
3. Ensure you've restarted the server after setting environment variables
4. Make sure your frontend is using the correct backend URL (NEXT_PUBLIC_BACKEND_API_URL)

