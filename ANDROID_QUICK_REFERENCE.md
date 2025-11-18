# Android API Quick Reference

## 🔑 Authentication Flow

### 1. Login
```kotlin
POST /auth/login
Body: { "email": "user@example.com", "password": "password" }
Response: { "token": "...", "refreshToken": "...", "clientId": "...", "user": {...} }
```

**Save both tokens securely!**

### 2. Making API Calls
```kotlin
Header: Authorization: Bearer {access_token}
```

### 3. Auto Token Refresh (When 401 Error)
```kotlin
POST /auth/refresh
Body: { "refreshToken": "..." }
Response: { "token": "new_token", "refreshToken": "new_refresh_token", ... }
```

**Update stored tokens with new ones!**

### 4. Logout Current Device
```kotlin
POST /auth/logout
Header: Authorization: Bearer {access_token}
Body: { "refreshToken": "..." }
```

### 5. Logout All Devices
```kotlin
POST /api/user/logout-all-devices
Header: Authorization: Bearer {access_token}
```

### 6. View Active Sessions
```kotlin
GET /api/user/active-sessions
Header: Authorization: Bearer {access_token}
Response: { "success": true, "data": { "sessions": [...], "count": 1 } }
```

## 📱 Implementation Checklist

- [ ] Use EncryptedSharedPreferences for token storage
- [ ] Implement OkHttp Interceptor for auto token refresh
- [ ] Handle 401 errors automatically
- [ ] Clear tokens on logout
- [ ] Show active sessions in settings
- [ ] Implement logout all devices feature

## 🔐 Security Notes

1. **Never store tokens in plain SharedPreferences**
2. **Use EncryptedSharedPreferences or Android Keystore**
3. **Never log tokens in production**
4. **Clear tokens on app uninstall**

## ⚡ Quick Code Snippets

### Save Tokens
```kotlin
tokenManager.saveTokens(accessToken, refreshToken, clientId)
```

### Get Access Token
```kotlin
val token = tokenManager.getAccessToken()
```

### Add to Request
```kotlin
request.header("Authorization", "Bearer $token")
```

### Check if Expired
```kotlin
if (tokenManager.isTokenExpired()) {
    // Refresh token
}
```

## 🚨 Error Handling

- **401 Unauthorized** → Try refresh token → If fails → Logout
- **403 Forbidden** → User account inactive → Show message
- **Network Error** → Retry with exponential backoff
- **Token Expired** → Auto refresh → Retry request

## 📚 Full Documentation

See `ANDROID_API_INTEGRATION.md` for complete implementation guide with code examples.

