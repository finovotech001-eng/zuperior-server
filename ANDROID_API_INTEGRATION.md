# Android App - Refresh Token API Integration Guide

This guide explains how to integrate the refresh token authentication system in your Android app.

## Overview

The authentication system uses:
- **Access Token (JWT)**: Short-lived token (1 day) for API requests
- **Refresh Token**: Long-lived token (7 days) to get new access tokens
- **Device Tracking**: Each login creates a refresh token with device info

## API Endpoints

### Base URL
```
Production: https://your-api-domain.com/api
Development: http://your-dev-domain.com/api
```

### Authentication Endpoints

#### 1. Login
**POST** `/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "userpassword"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "clientId": "c1234567890",
  "user": {
    "id": "uuid-here",
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

#### 2. Token Refresh
**POST** `/auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Response:**
```json
{
  "token": "new-access-token-here",
  "refreshToken": "new-refresh-token-here",
  "clientId": "c1234567890",
  "user": {
    "id": "uuid-here",
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

#### 3. Logout (Current Device)
**POST** `/auth/logout`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully. All cookies cleared."
}
```

#### 4. Logout All Devices
**POST** `/api/user/logout-all-devices`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out from all devices successfully"
}
```

#### 5. Get Active Sessions
**GET** `/api/user/active-sessions`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "log-id",
        "device": "Mobile",
        "browser": "Chrome 120",
        "createdAt": "2025-01-20T10:30:00Z"
      }
    ],
    "count": 1
  }
}
```

## Android Implementation Guide

### 1. Token Storage (Secure Storage)

**Use Android Keystore or EncryptedSharedPreferences:**

```kotlin
import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class TokenManager(private val context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "auth_tokens",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveTokens(accessToken: String, refreshToken: String, clientId: String) {
        sharedPreferences.edit()
            .putString("access_token", accessToken)
            .putString("refresh_token", refreshToken)
            .putString("client_id", clientId)
            .putLong("token_expires_at", System.currentTimeMillis() + (24 * 60 * 60 * 1000)) // 1 day
            .apply()
    }

    fun getAccessToken(): String? = sharedPreferences.getString("access_token", null)
    fun getRefreshToken(): String? = sharedPreferences.getString("refresh_token", null)
    fun getClientId(): String? = sharedPreferences.getString("client_id", null)

    fun isTokenExpired(): Boolean {
        val expiresAt = sharedPreferences.getLong("token_expires_at", 0)
        return System.currentTimeMillis() >= expiresAt
    }

    fun clearTokens() {
        sharedPreferences.edit().clear().apply()
    }
}
```

### 2. API Client with Auto Token Refresh

```kotlin
import okhttp3.*
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.IOException

class AuthInterceptor(
    private val tokenManager: TokenManager,
    private val apiService: ApiService
) : Interceptor {

    @Throws(IOException::class)
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        // Get access token
        val accessToken = tokenManager.getAccessToken()
        
        // Add token to request
        val authenticatedRequest = if (accessToken != null) {
            originalRequest.newBuilder()
                .header("Authorization", "Bearer $accessToken")
                .build()
        } else {
            originalRequest
        }

        // Execute request
        var response = chain.proceed(authenticatedRequest)

        // If 401 Unauthorized, try to refresh token
        if (response.code == 401 && accessToken != null) {
            response.close()
            
            // Try to refresh token
            val refreshToken = tokenManager.getRefreshToken()
            if (refreshToken != null) {
                try {
                    val refreshResponse = apiService.refreshToken(
                        RefreshTokenRequest(refreshToken)
                    ).execute()
                    
                    if (refreshResponse.isSuccessful) {
                        val tokenResponse = refreshResponse.body()
                        tokenResponse?.let {
                            // Save new tokens
                            tokenManager.saveTokens(
                                it.token,
                                it.refreshToken,
                                it.clientId
                            )
                            
                            // Retry original request with new token
                            val newRequest = originalRequest.newBuilder()
                                .header("Authorization", "Bearer ${it.token}")
                                .build()
                            
                            return chain.proceed(newRequest)
                        }
                    } else {
                        // Refresh failed, logout user
                        tokenManager.clearTokens()
                        // Navigate to login screen
                    }
                } catch (e: Exception) {
                    // Refresh failed, logout user
                    tokenManager.clearTokens()
                    // Navigate to login screen
                }
            } else {
                // No refresh token, logout user
                tokenManager.clearTokens()
                // Navigate to login screen
            }
        }

        return response
    }
}

// Retrofit API Service
interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
    
    @POST("auth/refresh")
    suspend fun refreshToken(@Body request: RefreshTokenRequest): Response<TokenResponse>
    
    @POST("auth/logout")
    suspend fun logout(
        @Header("Authorization") token: String,
        @Body request: RefreshTokenRequest
    ): Response<LogoutResponse>
    
    @POST("api/user/logout-all-devices")
    suspend fun logoutAllDevices(
        @Header("Authorization") token: String
    ): Response<LogoutAllResponse>
    
    @GET("api/user/active-sessions")
    suspend fun getActiveSessions(
        @Header("Authorization") token: String
    ): Response<ActiveSessionsResponse>
}

// Data Classes
data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val token: String,
    val refreshToken: String,
    val clientId: String,
    val user: User
)

data class User(
    val id: String,
    val name: String,
    val email: String
)

data class RefreshTokenRequest(
    val refreshToken: String
)

data class TokenResponse(
    val token: String,
    val refreshToken: String,
    val clientId: String,
    val user: User
)

data class LogoutResponse(
    val success: Boolean,
    val message: String
)

data class LogoutAllResponse(
    val success: Boolean,
    val message: String
)

data class ActiveSessionsResponse(
    val success: Boolean,
    val data: SessionsData
)

data class SessionsData(
    val sessions: List<Session>,
    val count: Int
)

data class Session(
    val id: String,
    val device: String,
    val browser: String,
    val createdAt: String
)
```

### 3. Retrofit Setup

```kotlin
object RetrofitClient {
    private const val BASE_URL = "https://your-api-domain.com/api/"
    
    fun create(tokenManager: TokenManager): ApiService {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        
        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(logging)
            .addInterceptor(AuthInterceptor(tokenManager, createApiService()))
            .build()
        
        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
    
    private fun createApiService(): ApiService {
        val retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        return retrofit.create(ApiService::class.java)
    }
}
```

### 4. Login Flow

```kotlin
class LoginViewModel(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) : ViewModel() {
    
    suspend fun login(email: String, password: String): Result<Unit> {
        return try {
            val response = apiService.login(LoginRequest(email, password))
            
            if (response.isSuccessful) {
                val loginResponse = response.body()
                loginResponse?.let {
                    // Save tokens securely
                    tokenManager.saveTokens(
                        it.token,
                        it.refreshToken,
                        it.clientId
                    )
                    Result.success(Unit)
                } ?: Result.failure(Exception("Invalid response"))
            } else {
                Result.failure(Exception("Login failed: ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

### 5. Logout Flow

```kotlin
class AuthRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {
    
    suspend fun logout(): Result<Unit> {
        return try {
            val accessToken = tokenManager.getAccessToken()
            val refreshToken = tokenManager.getRefreshToken()
            
            if (accessToken != null && refreshToken != null) {
                apiService.logout(
                    "Bearer $accessToken",
                    RefreshTokenRequest(refreshToken)
                )
            }
            
            // Clear tokens regardless of API call result
            tokenManager.clearTokens()
            Result.success(Unit)
        } catch (e: Exception) {
            // Still clear tokens on error
            tokenManager.clearTokens()
            Result.failure(e)
        }
    }
    
    suspend fun logoutAllDevices(): Result<Unit> {
        return try {
            val accessToken = tokenManager.getAccessToken()
            
            if (accessToken != null) {
                val response = apiService.logoutAllDevices("Bearer $accessToken")
                if (response.isSuccessful) {
                    tokenManager.clearTokens()
                    Result.success(Unit)
                } else {
                    Result.failure(Exception("Logout failed"))
                }
            } else {
                Result.failure(Exception("No access token"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

### 6. Active Sessions Screen

```kotlin
class SessionsViewModel(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) : ViewModel() {
    
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions.asStateFlow()
    
    suspend fun loadActiveSessions() {
        try {
            val accessToken = tokenManager.getAccessToken()
            if (accessToken != null) {
                val response = apiService.getActiveSessions("Bearer $accessToken")
                if (response.isSuccessful) {
                    _sessions.value = response.body()?.data?.sessions ?: emptyList()
                }
            }
        } catch (e: Exception) {
            // Handle error
        }
    }
}
```

## Best Practices

### 1. Token Security
- ✅ **Always use EncryptedSharedPreferences or Android Keystore**
- ✅ **Never log tokens in production**
- ✅ **Store tokens securely, never in SharedPreferences without encryption**
- ✅ **Clear tokens on app uninstall (automatic with EncryptedSharedPreferences)**

### 2. Token Refresh Strategy
- ✅ **Automatically refresh on 401 errors**
- ✅ **Refresh proactively before expiration (e.g., 5 minutes before)**
- ✅ **Handle refresh failures gracefully (logout user)**
- ✅ **Prevent multiple simultaneous refresh requests**

### 3. Error Handling
- ✅ **Handle network errors gracefully**
- ✅ **Show user-friendly error messages**
- ✅ **Logout on authentication failures**
- ✅ **Retry failed requests with exponential backoff**

### 4. User Experience
- ✅ **Show loading indicators during auth operations**
- ✅ **Navigate to login on token expiration**
- ✅ **Show active sessions in settings**
- ✅ **Allow logout from specific devices (future feature)**

## Complete Flow Diagram

```
1. User Logs In
   ↓
2. Save Access Token + Refresh Token (Encrypted)
   ↓
3. Use Access Token for API Calls
   ↓
4. If 401 Error → Auto Refresh Token
   ↓
5. If Refresh Fails → Logout User
   ↓
6. User Can View Active Sessions
   ↓
7. User Can Logout All Devices
```

## Example Usage

```kotlin
// In your Activity/Fragment
class MainActivity : AppCompatActivity() {
    private lateinit var tokenManager: TokenManager
    private lateinit var apiService: ApiService
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        tokenManager = TokenManager(this)
        apiService = RetrofitClient.create(tokenManager)
        
        // Check if user is logged in
        if (tokenManager.getAccessToken() == null) {
            // Navigate to login
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }
    
    private fun logout() {
        lifecycleScope.launch {
            val repository = AuthRepository(apiService, tokenManager)
            repository.logout()
            // Navigate to login
            startActivity(Intent(this@MainActivity, LoginActivity::class.java))
            finish()
        }
    }
    
    private fun logoutAllDevices() {
        lifecycleScope.launch {
            val repository = AuthRepository(apiService, tokenManager)
            repository.logoutAllDevices()
            // Navigate to login
            startActivity(Intent(this@MainActivity, LoginActivity::class.java))
            finish()
        }
    }
}
```

## Dependencies (build.gradle)

```gradle
dependencies {
    // Retrofit
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    
    // OkHttp
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.12.0'
    
    // Encrypted SharedPreferences
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'
    
    // Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    
    // ViewModel
    implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0'
    implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.7.0'
}
```

## Testing

### Test Login
```kotlin
@Test
fun testLogin() {
    runBlocking {
        val response = apiService.login(
            LoginRequest("test@example.com", "password123")
        )
        assertTrue(response.isSuccessful)
        assertNotNull(response.body()?.token)
        assertNotNull(response.body()?.refreshToken)
    }
}
```

### Test Token Refresh
```kotlin
@Test
fun testTokenRefresh() {
    runBlocking {
        val refreshToken = "valid-refresh-token"
        val response = apiService.refreshToken(
            RefreshTokenRequest(refreshToken)
        )
        assertTrue(response.isSuccessful)
        assertNotNull(response.body()?.token)
    }
}
```

## Troubleshooting

### Issue: Token refresh fails
- **Check**: Refresh token is not expired
- **Check**: Refresh token is not revoked
- **Solution**: Logout and login again

### Issue: 401 errors after login
- **Check**: Access token is being sent in Authorization header
- **Check**: Token format is correct: `Bearer {token}`
- **Solution**: Verify interceptor is adding header correctly

### Issue: Multiple refresh requests
- **Check**: Implement request queuing for refresh
- **Solution**: Use a mutex/lock to prevent concurrent refreshes

## Support

For issues or questions, contact the backend team or check the API documentation.

