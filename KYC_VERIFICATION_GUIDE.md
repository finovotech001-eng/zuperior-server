# KYC Verification System Guide

This guide explains the complete KYC (Know Your Customer) verification flow using Shufti Pro API integration.

## 📋 Overview

The KYC system verifies user identity through:
1. **Document Verification** - Passport, ID Card, or Driving License
2. **Address Verification** - Utility Bill, Bank Statement, or Rent Agreement  
3. **AML Screening** - Background checks for sanctions and PEP (Politically Exposed Person)

## 🔄 Verification Flow

### Complete User Journey

```
User Uploads Document
        ↓
Frontend sends to Backend API
        ↓
Backend calls Shufti Pro API
        ↓
Shufti Pro processes document
        ↓
Status stored in database (Pending)
        ↓
Shufti Pro sends webhook callback
        ↓
Backend updates status in database
        ↓
Email notification sent to user
        ↓
Status shown in frontend (Green if Approved)
```

## 🎯 API Endpoints

### 1. Create KYC Record
**Endpoint:** `POST /api/kyc/create`  
**Auth:** Required  
**Description:** Initialize KYC record for user

```bash
curl -X POST http://localhost:5000/api/kyc/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "KYC record created successfully",
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "verificationStatus": "Pending",
    "isDocumentVerified": false,
    "isAddressVerified": false
  }
}
```

---

### 2. Submit Document for Verification
**Endpoint:** `POST /api/kyc/submit-document`  
**Auth:** Required  
**Description:** Submit ID document to Shufti Pro for verification

```bash
curl -X POST http://localhost:5000/api/kyc/submit-document \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "kyc_doc_1234567890",
    "document": {
      "proof": "base64_encoded_image_here",
      "supported_types": ["passport", "id_card", "driving_license"],
      "name": {
        "first_name": "John",
        "last_name": "Doe",
        "fuzzy_match": "1"
      },
      "dob": "1990-01-01"
    }
  }'
```

**Request Body:**
- `reference` (required): Unique reference ID for tracking
- `document.proof` (required): Base64 encoded document image
- `document.supported_types` (optional): Array of accepted document types
- `document.name` (required): User's name for verification
- `document.dob` (optional): Date of birth (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "message": "Document submitted for verification",
  "data": {
    "reference": "kyc_doc_1234567890",
    "event": "request.pending",
    "verification_url": null,
    "kyc": {
      "verificationStatus": "Pending",
      "documentReference": "kyc_doc_1234567890",
      "documentSubmittedAt": "2024-10-23T10:30:00Z"
    }
  }
}
```

---

### 3. Submit Address for Verification
**Endpoint:** `POST /api/kyc/submit-address`  
**Auth:** Required  
**Description:** Submit address proof to Shufti Pro for verification

```bash
curl -X POST http://localhost:5000/api/kyc/submit-address \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "kyc_addr_1234567890",
    "address": {
      "proof": "base64_encoded_image_here",
      "supported_types": ["utility_bill", "bank_statement"],
      "name": {
        "first_name": "John",
        "last_name": "Doe",
        "fuzzy_match": "1"
      },
      "full_address": "123 Main St, City, Country, 12345"
    }
  }'
```

**Request Body:**
- `reference` (required): Unique reference ID for tracking
- `address.proof` (required): Base64 encoded address document image
- `address.supported_types` (optional): Array of accepted document types
- `address.name` (required): User's name for verification
- `address.full_address` (required): Complete address string

---

### 4. Get KYC Status
**Endpoint:** `GET /api/kyc/status`  
**Auth:** Required  
**Description:** Get current KYC verification status for logged-in user

```bash
curl -X GET http://localhost:5000/api/kyc/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "KYC status retrieved successfully",
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "isDocumentVerified": true,
    "isAddressVerified": false,
    "verificationStatus": "Partially Verified",
    "documentReference": "kyc_doc_1234567890",
    "addressReference": null,
    "amlReference": null,
    "documentSubmittedAt": "2024-10-23T10:30:00Z",
    "addressSubmittedAt": null,
    "rejectionReason": null,
    "createdAt": "2024-10-23T10:00:00Z",
    "updatedAt": "2024-10-23T10:35:00Z"
  }
}
```

---

### 5. Shufti Pro Webhook Callback
**Endpoint:** `POST /api/kyc/callback`  
**Auth:** Not required (called by Shufti Pro)  
**Description:** Receives verification results from Shufti Pro

This endpoint is automatically called by Shufti Pro when verification is complete.

**Callback Payload Example:**
```json
{
  "reference": "kyc_doc_1234567890",
  "event": "verification.accepted",
  "verification_result": {
    "document": {
      "status": "accepted"
    }
  },
  "verification_data": {
    "document": {
      "name": "John Doe",
      "dob": "1990-01-01",
      "document_number": "AB123456"
    }
  }
}
```

---

## 🔐 Verification Status Values

| Status | Description | Frontend Display |
|--------|-------------|------------------|
| `Pending` | Documents submitted, awaiting verification | 🟡 Yellow / Pending |
| `Partially Verified` | One verification complete (document OR address) | 🟡 Yellow / Partially Complete |
| `Verified` | Both document and address verified | 🟢 Green / Verified |
| `Declined` | Verification failed/rejected | 🔴 Red / Declined |
| `Cancelled` | Verification cancelled or timeout | ⚫ Grey / Cancelled |

## 🎨 Frontend Implementation Guide

### 1. Show Status Based on Verification

```javascript
const getStatusColor = (status, isDocVerified, isAddressVerified) => {
  // Only show green when fully verified
  if (status === 'Verified' && isDocVerified && isAddressVerified) {
    return 'green'; // ✅ Approved
  }
  
  // Show yellow for pending or partial
  if (status === 'Pending' || status === 'Partially Verified') {
    return 'yellow'; // ⏳ Pending
  }
  
  // Show red for declined
  if (status === 'Declined') {
    return 'red'; // ❌ Declined
  }
  
  // Default grey for not started or cancelled
  return 'grey';
};
```

### 2. Fetch and Display KYC Status

```javascript
import { useState, useEffect } from 'react';

function KYCStatus() {
  const [kycData, setKycData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKYCStatus();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchKYCStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchKYCStatus = async () => {
    try {
      const token = localStorage.getItem('userToken');
      const response = await fetch('/api/kyc/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setKycData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch KYC status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!kycData) return <div>No KYC data</div>;

  const { verificationStatus, isDocumentVerified, isAddressVerified } = kycData;
  const statusColor = getStatusColor(verificationStatus, isDocumentVerified, isAddressVerified);

  return (
    <div className="kyc-status">
      <h3>KYC Verification Status</h3>
      
      {/* Document Verification */}
      <div className="verification-item">
        <span>Identity Document:</span>
        <span className={`status ${isDocumentVerified ? 'verified' : 'pending'}`}>
          {isDocumentVerified ? '✅ Verified' : '⏳ Pending'}
        </span>
      </div>

      {/* Address Verification */}
      <div className="verification-item">
        <span>Address Proof:</span>
        <span className={`status ${isAddressVerified ? 'verified' : 'pending'}`}>
          {isAddressVerified ? '✅ Verified' : '⏳ Pending'}
        </span>
      </div>

      {/* Overall Status */}
      <div className={`overall-status ${statusColor}`}>
        {verificationStatus}
      </div>

      {/* Show rejection reason if declined */}
      {kycData.rejectionReason && (
        <div className="rejection-reason">
          <strong>Reason:</strong> {kycData.rejectionReason}
        </div>
      )}
    </div>
  );
}
```

### 3. Submit Document

```javascript
async function submitDocument(file, firstName, lastName, documentType) {
  try {
    // Convert file to base64
    const base64 = await fileToBase64(file);
    
    // Generate unique reference
    const reference = `kyc_doc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    const token = localStorage.getItem('userToken');
    
    const response = await fetch('http://localhost:5000/api/kyc/submit-document', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reference,
        document: {
          proof: base64,
          supported_types: [documentType],
          name: {
            first_name: firstName,
            last_name: lastName,
            fuzzy_match: "1"
          }
        }
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Document submitted:', data.data.reference);
      // Show success message
      return data;
    } else {
      console.error('❌ Submission failed:', data.message);
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error submitting document:', error);
    throw error;
  }
}

// Helper function to convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // Remove data:image/...;base64, prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

---

## ⚙️ Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Shufti Pro API Credentials
SHUFTI_PRO_CLIENT_ID=your_client_id_here
SHUFTI_PRO_SECRET_KEY=your_secret_key_here

# Callback URLs (must be publicly accessible)
SHUFTI_PRO_CALLBACK_URL=https://yourdomain.com/api/kyc/callback
SHUFTI_PRO_AML_CALLBACK_URL=https://yourdomain.com/api/kyc/callback

# Test Mode (set to 'true' for development)
NEXT_PUBLIC_KYC_TEST_MODE=false
```

### Get Shufti Pro Credentials

1. Sign up at [Shufti Pro](https://shuftipro.com/)
2. Get your Client ID and Secret Key from dashboard
3. Configure webhook callback URL
4. Set allowed IPs for webhooks (optional but recommended)

---

## 🧪 Testing

### Test Mode

For development/testing without calling Shufti Pro:

1. Set `NEXT_PUBLIC_KYC_TEST_MODE=true` in `.env`
2. Documents will be auto-approved without API calls
3. Useful for frontend development and testing

### Manual Testing

```bash
# 1. Create KYC record
curl -X POST http://localhost:5000/api/kyc/create \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Submit test document
curl -X POST http://localhost:5000/api/kyc/submit-document \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @test-document.json

# 3. Check status
curl -X GET http://localhost:5000/api/kyc/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Simulate webhook callback (for testing)
curl -X POST http://localhost:5000/api/kyc/callback \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "kyc_doc_test123",
    "event": "verification.accepted",
    "verification_result": {
      "document": {"status": "accepted"}
    }
  }'
```

---

## 📧 Email Notifications

Emails are automatically sent when:

| Event | Template | Trigger |
|-------|----------|---------|
| Document Accepted | `kycStatus` | Shufti callback with accepted status |
| Document Rejected | `kycStatus` | Shufti callback with declined status |
| Address Accepted | `kycStatus` | Shufti callback with accepted status |
| Address Rejected | `kycStatus` | Shufti callback with declined status |
| Full Verification Complete | `kycStatus` | Both document and address verified |

---

## 🐛 Troubleshooting

### Issue: Documents not submitting
**Solution:**
- Check Shufti Pro credentials in `.env`
- Verify base64 encoding is correct
- Check file size (max 10MB recommended)
- Ensure image quality is good

### Issue: Callback not received
**Solution:**
- Verify callback URL is publicly accessible
- Check firewall settings
- Test callback URL with curl
- Review Shufti Pro dashboard for webhook logs

### Issue: Status not updating
**Solution:**
- Check backend logs for webhook errors
- Verify reference IDs match
- Ensure database connection is working
- Try manual status update via API

### Issue: Always shows "Pending"
**Solution:**
- Wait for Shufti Pro to process (can take 1-5 minutes)
- Check if webhook callback is being received
- Verify verificationStatus field in database
- Check for API rate limits

---

## 📊 Database Schema

### KYC Table Structure

```sql
CREATE TABLE "KYC" (
  id                  UUID PRIMARY KEY,
  userId              UUID UNIQUE NOT NULL,
  isDocumentVerified  BOOLEAN DEFAULT false,
  isAddressVerified   BOOLEAN DEFAULT false,
  verificationStatus  TEXT DEFAULT 'Pending',
  documentReference   TEXT,
  addressReference    TEXT,
  amlReference        TEXT,
  documentSubmittedAt TIMESTAMP,
  addressSubmittedAt  TIMESTAMP,
  rejectionReason     TEXT,
  createdAt           TIMESTAMP DEFAULT NOW(),
  updatedAt           TIMESTAMP DEFAULT NOW()
);
```

---

## 🔒 Security Best Practices

1. **Never store passwords in KYC records**
2. **Use HTTPS for callback URLs**
3. **Validate webhook signatures** (if provided by Shufti Pro)
4. **Rate limit submission endpoints**
5. **Log all verification attempts**
6. **Encrypt sensitive data at rest**
7. **Use secure random for reference IDs**

---

## 📈 Monitoring & Analytics

Track these metrics:
- **Submission Rate**: Documents submitted per day
- **Approval Rate**: Percentage of approved verifications
- **Average Processing Time**: Time from submission to callback
- **Rejection Reasons**: Common reasons for failures
- **Retry Rate**: Users resubmitting after rejection

---

## 🆘 Support

For issues:
1. Check server logs for detailed errors
2. Review Shufti Pro dashboard for API logs
3. Test with curl commands above
4. Verify environment variables are set
5. Check database for KYC record status

---

**Last Updated:** October 2024  
**Version:** 1.0.0  
**Status:** ✅ Production Ready

