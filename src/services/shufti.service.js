// server/src/services/shufti.service.js
// Shufti Pro API Integration Service

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHUFTI_PRO_API_URL = 'https://api.shuftipro.com/';
const CLIENT_ID = process.env.SHUFTI_PRO_CLIENT_ID;
const SECRET_KEY = process.env.SHUFTI_PRO_SECRET_KEY;
const CALLBACK_URL = process.env.SHUFTI_PRO_CALLBACK_URL;
const AML_CALLBACK_URL = process.env.SHUFTI_PRO_AML_CALLBACK_URL;

// Validate environment variables
const validateConfig = () => {
  if (!CLIENT_ID || !SECRET_KEY) {
    throw new Error('Shufti Pro credentials not configured. Please set SHUFTI_PRO_CLIENT_ID and SHUFTI_PRO_SECRET_KEY in .env file');
  }
};

/**
 * Create Basic Auth header for Shufti Pro API
 */
const getAuthHeader = () => {
  validateConfig();
  const authString = Buffer.from(`${CLIENT_ID}:${SECRET_KEY}`).toString('base64');
  return `Basic ${authString}`;
};

/**
 * Document Verification (Identity Proof)
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.email - User email
 * @param {string} params.country - Country code (e.g., 'GB', 'US')
 * @param {string} params.documentProof - Base64 encoded document image
 * @param {Array<string>} params.supportedTypes - Document types (e.g., ['passport', 'id_card', 'driving_license'])
 * @param {Object} params.name - Name object with first_name, last_name, fuzzy_match
 * @param {string} params.dob - Date of birth (YYYY-MM-DD) - optional
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyDocument = async ({
  reference,
  email,
  country,
  documentProof,
  supportedTypes = ['passport', 'id_card', 'driving_license'],
  name,
  dob
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      callback_url: CALLBACK_URL || 'http://localhost:3000/api/kyc/callback',
      email,
      country,
      language: 'EN',
      verification_mode: 'image_only',
      document: {
        proof: documentProof,
        supported_types: supportedTypes,
        fetch_enhanced_data: '1',
        name,
      }
    };

    // Add DOB if provided
    if (dob) {
      payload.document.dob = dob;
    }

    console.log('🚀 Calling Shufti Pro Document Verification API:', {
      reference,
      email,
      country,
      supportedTypes,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000, // 30 second timeout
    });

    console.log('✅ Shufti Pro Document Verification Response:', {
      reference,
      event: response.data.event,
      message: response.data.message
    });

    return response.data;
  } catch (error) {
    console.error('❌ Shufti Pro Document Verification Error:', {
      reference,
      error: error.response?.data || error.message
    });
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

/**
 * Address Verification (Proof of Address)
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.email - User email
 * @param {string} params.country - Country code
 * @param {string} params.addressProof - Base64 encoded address document
 * @param {Array<string>} params.supportedTypes - Document types (e.g., ['utility_bill', 'bank_statement'])
 * @param {Object} params.name - Name object with first_name, last_name, fuzzy_match
 * @param {string} params.fullAddress - Full address string
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyAddress = async ({
  reference,
  email,
  country,
  addressProof,
  supportedTypes = ['utility_bill', 'bank_statement', 'rent_agreement'],
  name,
  fullAddress
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      callback_url: CALLBACK_URL || 'http://localhost:3000/api/kyc/callback',
      email,
      country,
      language: 'EN',
      verification_mode: 'image_only',
      address: {
        proof: addressProof,
        supported_types: supportedTypes,
        full_address: fullAddress,
        name,
        fuzzy_match: '1'
      }
    };

    console.log('🚀 Calling Shufti Pro Address Verification API:', {
      reference,
      email,
      country,
      supportedTypes,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000,
    });

    console.log('✅ Shufti Pro Address Verification Response:', {
      reference,
      event: response.data.event,
      message: response.data.message
    });

    return response.data;
  } catch (error) {
    console.error('❌ Shufti Pro Address Verification Error:', {
      reference,
      error: error.response?.data || error.message
    });
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

/**
 * AML/Background Checks Verification
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.fullName - Full name for AML screening
 * @param {string} params.dob - Date of birth (YYYY-MM-DD)
 * @param {string} params.country - Country code
 * @param {Array<string>} params.filters - AML filters (e.g., ['sanction', 'pep', 'pep-class-1'])
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyAML = async ({
  reference,
  fullName,
  dob,
  country,
  filters = ['sanction', 'pep', 'pep-class-1']
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      callback_url: AML_CALLBACK_URL || CALLBACK_URL || 'http://localhost:3000/api/kyc/callback',
      language: 'EN',
      verification_mode: 'any',
      decline_on_single_step: '0',
      ttl: 60, // Time-to-live in minutes
      background_checks: {
        name: {
          full_name: fullName
        },
        filters,
        dob,
        alias_search: '1',
        rca_search: '1'
      }
    };

    console.log('🚀 Calling Shufti Pro AML Verification API:', {
      reference,
      fullName,
      filters,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000,
    });

    console.log('✅ Shufti Pro AML Verification Response:', {
      reference,
      event: response.data.event,
      message: response.data.message
    });

    return response.data;
  } catch (error) {
    console.error('❌ Shufti Pro AML Verification Error:', {
      reference,
      error: error.response?.data || error.message
    });
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

/**
 * Face Verification (Optional - for future use)
 * @param {Object} params - Verification parameters
 * @param {string} params.reference - Unique reference ID
 * @param {string} params.email - User email
 * @param {string} params.country - Country code
 * @param {string} params.faceProof - Base64 encoded face image or video
 * @returns {Promise<Object>} Shufti Pro API response
 */
export const verifyFace = async ({
  reference,
  email,
  country,
  faceProof
}) => {
  try {
    validateConfig();

    const payload = {
      reference,
      callback_url: CALLBACK_URL || 'http://localhost:3000/api/kyc/callback',
      email,
      country,
      language: 'EN',
      verification_mode: 'image_only',
      face: {
        proof: faceProof
      }
    };

    console.log('🚀 Calling Shufti Pro Face Verification API:', {
      reference,
      email,
      callback_url: payload.callback_url
    });

    const response = await axios.post(SHUFTI_PRO_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      timeout: 30000,
    });

    console.log('✅ Shufti Pro Face Verification Response:', {
      reference,
      event: response.data.event
    });

    return response.data;
  } catch (error) {
    console.error('❌ Shufti Pro Face Verification Error:', {
      reference,
      error: error.response?.data || error.message
    });
    
    throw {
      success: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data || error.message
    };
  }
};

export default {
  verifyDocument,
  verifyAddress,
  verifyAML,
  verifyFace
};



