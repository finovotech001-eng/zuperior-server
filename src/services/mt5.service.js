// zuperior-dashboard/server/src/services/mt5.service.js (New File)

import axios from 'axios';

// MT5 Manager API Base URL from your documentation
const MT5_BASE_URL = 'http://18.130.5.209:5003/api';

/**
 * Executes a request to the MT5 Manager API.
 * @param {string} method - HTTP method (GET, POST).
 * @param {string} endpoint - The specific API path (e.g., 'Groups', 'Users').
 * @param {object} data - Request body data (for POST).
 * @param {string} accessToken - Optional Bearer token for authentication.
 */
const mt5Request = async (method, endpoint, data = null, accessToken = null) => {
    try {
        // Add timestamp to URL to prevent caching
        const separator = endpoint.includes('?') ? '&' : '?';
        const timestamp = Date.now() + Math.random();
        const url = `${MT5_BASE_URL}/${endpoint}${separator}_timestamp=${timestamp}`;
        console.log(`🔄 MT5 API Call: ${method} ${url}`);
        console.log('📤 Request Data:', data);

        const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'If-None-Match': '*',
            'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Cache-Control': 'no-cache'
        };

        // Add Bearer token if provided
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
            console.log('🔐 Using Bearer token authentication');
        }

        const response = await axios({
            method: method.toLowerCase(),
            url: url,
            data: data,
            headers: headers,
            timeout: 45000, // 45 seconds timeout - account creation should complete within this time
            // Disable all caching
            adapter: 'http',
            maxRedirects: 0,
            validateStatus: () => true
        });

        console.log('📥 Raw MT5 API Response:', response.data);

        // The MT5 API returns data directly as an array for Groups endpoint
        if (Array.isArray(response.data)) {
            console.log('✅ MT5 API Success: Groups data received');
            return response.data; // Return the array directly for Groups
        } else if (response.data && response.data.Success === true) {
            console.log('✅ MT5 API Success:', response.data.Data);
            return response.data.Data; // Return the 'Data' field on success
        } else if (response.data && response.data.Error !== null) {
            // Handle specific MT5 error messages
            console.error('❌ MT5 API Error:', response.data);
            throw new Error(`MT5 API Error: ${response.data.Message || JSON.stringify(response.data.Error)}`);
        } else {
            // Handle unexpected response structure
            console.error('⚠️ Unexpected MT5 API Response:', response.data);
            throw new Error('MT5 API returned a non-successful or invalid response.');
        }

    } catch (error) {
        // Handle network errors (e.g., MT5 server is down or unreachable)
        const errorMessage = error.response
            ? `MT5 HTTP Error ${error.response.status}: ${error.response.statusText}`
            : error.message;

        console.error('🚨 MT5 API Network Error:', errorMessage);
        console.error('📤 Request URL:', `${MT5_BASE_URL}/${endpoint}`);
        console.error('📤 Request Method:', method);
        console.error('📤 Request Data:', JSON.stringify(data, null, 2));
        
        if (error.response) {
            console.error('📥 Error Response Status:', error.response.status);
            console.error('📥 Error Response Headers:', error.response.headers);
            console.error('📥 Error Response Body:', JSON.stringify(error.response.data, null, 2));
        }
        
        throw new Error(`Failed to communicate with MT5 Manager: ${errorMessage}`);
    }
};

/**
 * Raw MT5 request that returns the full response object (includes Success, Data, Message)
 * Used for operations that need to check the Success status
 * @param {string} accessToken - Optional Bearer token for authentication.
 */
const mt5RequestRaw = async (method, endpoint, data = null, accessToken = null) => {
    try {
        const url = `${MT5_BASE_URL}/${endpoint}`;
        console.log(`🔄 MT5 API Call (Raw): ${method} ${url}`);
        console.log('📤 Request Data:', data);

        const headers = {
            'Content-Type': 'application/json',
        };

        // Add Bearer token if provided
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
            console.log('🔐 Using Bearer token authentication');
        }

        const response = await axios({
            method: method.toLowerCase(),
            url: url,
            data: data,
            headers: headers,
            timeout: 45000 // 45 seconds timeout for account operations
        });

        console.log('📥 Raw MT5 API Response:', response.data);
        return response.data; // Return the full response object

    } catch (error) {
        const errorMessage = error.response
            ? `MT5 HTTP Error ${error.response.status}: ${error.response.statusText}`
            : error.message;

        console.error('🚨 MT5 API Network Error (Raw):', errorMessage);
        console.error('📤 Request URL:', url);
        console.error('📤 Request Method:', method);
        console.error('📤 Request Data:', JSON.stringify(data, null, 2));
        
        if (error.response) {
            console.error('📥 Error Response Status:', error.response.status);
            console.error('📥 Error Response Headers:', error.response.headers);
            console.error('📥 Error Response Body:', JSON.stringify(error.response.data, null, 2));
        }
        
        throw new Error(`Failed to communicate with MT5 Manager: ${errorMessage}`);
    }
};

// --- Exported Functions matching your Roadmap ---

// 4.1 Get Groups API
export const getMt5Groups = () => {
    return mt5Request('GET', 'Groups');
};

// 4.2 Open MT5 Account API
export const openMt5Account = (userData) => {
    // Endpoint is '/api/Users' for account creation
    return mt5Request('POST', 'Users', userData);
};

// 4.3 Deposit (Add Balance) - Returns full response object
export const depositMt5Balance = (login, amount, comment) => {
    const endpoint = `Users/${login}/AddClientBalance`;
    return mt5RequestRaw('POST', endpoint, { balance: amount, comment });
};

// 4.4 Withdraw (Deduct Balance) - Returns full response object
export const withdrawMt5Balance = (login, amount, comment) => {
    const endpoint = `Users/${login}/DeductClientBalance`;
    // Note: DeductClientBalance usually takes a positive amount to deduct
    return mt5RequestRaw('POST', endpoint, { balance: amount, comment });
};



// 4.5 Get User Profile - ALWAYS FETCH FRESH (no cache)
export const getMt5UserProfile = (login, accessToken = null) => {
    const endpoint = `Users/${login}/getClientBalance`;
    const cacheBuster = Date.now() + Math.random();
    const endpointWithCacheBust = `${endpoint}?_t=${cacheBuster}&_nocache=${cacheBuster}&_fresh=${Date.now()}&_rand=${Math.random()}&_bust=${Date.now()}&v=${Math.floor(Math.random() * 1000000)}`;
    console.log(`[MT5 Service] 🔄 Fetching FRESH profile for ${login} (cache-bust: ${cacheBuster})`);
    return mt5Request('GET', endpointWithCacheBust, null, accessToken);
};

// 4.6 Update MT5 User Account - PUT /Users/{login}
export const updateMt5User = (login, userData, accessToken = null) => {
    const endpoint = `Users/${login}`;
    console.log(`[MT5 Service] 🔄 Updating user ${login} with data:`, userData);
    return mt5RequestRaw('PUT', endpoint, userData, accessToken);
};

// 4.7 Change MT5 Account Password - PUT /Security/users/{login}/password/change
export const changeMt5Password = (login, newPassword, passwordType = 'main') => {
    const endpoint = `Security/users/${login}/password/change`;
    const params = `?passwordType=${passwordType}`;
    const url = `${MT5_BASE_URL}/${endpoint}${params}`;
    
    console.log(`[MT5 Service] 🔐 Changing password for user ${login}, type: ${passwordType}`);
    
    // The API expects the password as a JSON string (not an object)
    // Body should be just the password string, e.g., '"NewPassword123"'
    const body = JSON.stringify(newPassword);
    
    return axios({
        method: 'PUT',
        url: url,
        data: body,
        headers: {
            'Content-Type': 'application/json',
            'accept': '*/*'
        },
        timeout: 30000 // 30 seconds timeout
    }).then(response => {
        console.log('📥 MT5 Password Change Response:', response.data);
        return response.data;
    }).catch(error => {
        const errorMessage = error.response
            ? `MT5 HTTP Error ${error.response.status}: ${error.response.statusText}`
            : error.message;
        console.error('🚨 MT5 Password Change Error:', errorMessage);
        throw new Error(`Failed to change password: ${errorMessage}`);
    });
};

// 4.8 Get MT5 Access Token (for authenticated requests)
export const getMt5AccessToken = async (accountId, password) => {
    try {
        const endpoint = 'client/ClientAuth/login';
        const url = `${MT5_BASE_URL}/${endpoint}`;
        
        const payload = {
            AccountId: parseInt(accountId),
            Password: password,
            DeviceId: `server_device_${accountId}`,
            DeviceType: "server"
        };

        console.log(`🔐 Getting MT5 access token for account: ${accountId}`);

        const response = await axios({
            method: 'post',
            url: url,
            data: payload,
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000 // 30 seconds timeout
        });

        console.log('📥 MT5 Access Token Response:', response.data);

        const accessToken = 
            response.data?.accessToken ||
            response.data?.AccessToken ||
            response.data?.token ||
            response.data?.Token ||
            response.data?.data?.accessToken ||
            response.data?.Data?.AccessToken ||
            response.data?.Result?.AccessToken ||
            null;

        if (!accessToken) {
            console.warn('⚠️ MT5 login response did not include access token. Raw:', response.data);
            return null; // Return null if token not available - API calls may still work without it
        }

        console.log('✅ MT5 access token obtained successfully');
        return accessToken;

    } catch (error) {
        const errorMessage = error.response
            ? `MT5 HTTP Error ${error.response.status}: ${error.response.statusText}`
            : error.message;

        console.error('🚨 MT5 Access Token Error:', errorMessage);
        return null; // Return null on error - API calls may still work without token
    }
};