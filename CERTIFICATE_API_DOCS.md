# Certificate Retrieval & Download Endpoints

## Overview
These endpoints allow students to retrieve, view, and download their earned certificates. All endpoints except the token-based download require authentication.

## Download Token Information
Download tokens are JWT-based tokens that provide time-limited access to certificate downloads.

**Token Structure:**
- Type: JWT (JSON Web Token)
- Expiration: 1 hour for single downloads, 2 hours for bulk downloads
- Contains: certificateId, studentId, type, nonce, timestamp
- Security: SHA-256 based, signed with JWT_SECRET

**Token Sources:**
- Query parameter: `?token=<token>`
- Header: `x-download-token: <token>`
- Bearer token: `Authorization: Bearer <token>`

---

## 1. Get My Certificates

`GET /api/certificates/my-certificates`

Retrieve all certificates for the authenticated student with filtering and pagination support.

**Authentication:** Required (Bearer token)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `courseId` (optional): Filter by specific course ID (MongoDB ObjectId)
- `issueDateStart` (optional): Filter certificates issued after this date (ISO 8601)
- `issueDateEnd` (optional): Filter certificates issued before this date (ISO 8601)
- `status` (optional): Filter by status (ACTIVE, REVOKED, EXPIRED)
- `page` (optional): Page number for pagination (default: 1, min: 1)
- `limit` (optional): Items per page (default: 10, min: 1, max: 100)

**cURL Example:**
```bash
curl -X GET "http://localhost:3002/api/certificates/my-certificates?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGc..."
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "studentId": "507f1f77bcf86cd799439012",
      "courseId": {
        "_id": "507f1f77bcf86cd799439013",
        "title": "Blockchain Fundamentals",
        "description": "Learn blockchain basics"
      },
      "tutorId": {
        "_id": "507f1f77bcf86cd799439014",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "issueDate": "2024-01-15T10:30:00.000Z",
      "status": "ACTIVE",
      "certificateUrl": "https://storage.example.com/cert123.pdf",
      "imageUrl": "https://storage.example.com/cert123.png",
      "downloadToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      "downloadTokenExpiry": 1706182800000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 25,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "message": "Retrieved 10 certificate(s)"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid query parameters
  ```json
  {
    "success": false,
    "errors": [
      {
        "field": "courseId",
        "message": "Invalid course ID format"
      }
    ]
  }
  ```
- `401 Unauthorized`: Missing or invalid authentication token
  ```json
  {
    "error": "Access denied, no token provided"
  }
  ```

---

## 2. Get Single Certificate

`GET /api/certificates/:certificateId`

Retrieve details of a specific certificate with ownership verification.

**Authentication:** Required (Bearer token)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Path Parameters:**
- `certificateId` (required): Certificate ID (MongoDB ObjectId)

**cURL Example:**
```bash
curl -X GET "http://localhost:3002/api/certificates/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer eyJhbGc..."
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "studentId": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Jane Smith",
      "email": "jane@example.com"
    },
    "courseId": {
      "_id": "507f1f77bcf86cd799439013",
      "title": "Blockchain Fundamentals",
      "description": "Learn blockchain basics",
      "tutorName": "John Doe",
      "duration": "6 weeks",
      "category": "Technology"
    },
    "tutorId": {
      "_id": "507f1f77bcf86cd799439014",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "/uploads/tutors/john.jpg"
    },
    "issueDate": "2024-01-15T10:30:00.000Z",
    "status": "ACTIVE",
    "certificateUrl": "https://storage.example.com/cert123.pdf",
    "imageUrl": "https://storage.example.com/cert123.png",
    "publicHash": "a1b2c3d4e5f6",
    "downloadToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "downloadTokenExpiry": 1706182800000
  },
  "message": "Certificate retrieved successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid certificate ID format
  ```json
  {
    "success": false,
    "errors": [
      {
        "field": "certificateId",
        "message": "Invalid certificate ID format"
      }
    ]
  }
  ```
- `404 Not Found`: Certificate not found or unauthorized access
  ```json
  {
    "success": false,
    "message": "Certificate not found"
  }
  ```
- `401 Unauthorized`: Missing authentication
  ```json
  {
    "error": "Access denied, no token provided"
  }
  ```

---

## 3. Download All Certificates (ZIP)

`GET /api/certificates/my-certificates/download-all`

Download all active certificates for the authenticated student as a single ZIP file.

**Authentication:** Required (Bearer token)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3002/api/certificates/my-certificates/download-all" \
  -H "Authorization: Bearer eyJhbGc..." \
  -o my-certificates.zip
```

**Success Response (200):**
- Content-Type: `application/zip`
- Content-Disposition: `attachment; filename="certificates_<studentId>_<timestamp>.zip"`
- Body: Binary ZIP file containing all certificates

**ZIP Contents:**
```
certificates_507f1f77bcf86cd799439012_1706182800.zip
├── Blockchain_Fundamentals_507f1f77.pdf
├── Smart_Contracts_101_507f1f88.pdf
└── Web3_Development_507f1f99.png
```

**Error Responses:**
- `404 Not Found`: No certificates available
  ```json
  {
    "success": false,
    "message": "No certificates found for download"
  }
  ```
- `401 Unauthorized`: Missing authentication
  ```json
  {
    "error": "Access denied, no token provided"
  }
  ```
- `500 Internal Server Error`: ZIP generation failed
  ```json
  {
    "success": false,
    "message": "Error downloading certificates",
    "error": "Failed to create ZIP file"
  }
  ```

---

## 4. Download Single Certificate

`GET /api/certificates/download/:certificateId`

Download a single certificate using a time-limited download token. No authentication header required.

**Authentication:** Download token (in query, header, or Bearer token)

**Path Parameters:**
- `certificateId` (required): Certificate ID (MongoDB ObjectId)

**Query Parameters:**
- `token` (required if not in headers): Download token

**Headers (Optional):**
```
x-download-token: <download_token>
# OR
Authorization: Bearer <download_token>
```

**cURL Example:**
```bash
# Using query parameter
curl -X GET "http://localhost:3002/api/certificates/download/507f1f77bcf86cd799439011?token=eyJhbGc..." \
  -o certificate.pdf

# Using header
curl -X GET "http://localhost:3002/api/certificates/download/507f1f77bcf86cd799439011" \
  -H "x-download-token: eyJhbGc..." \
  -o certificate.pdf
```

**Success Response (200):**
- Redirects to certificate URL or returns download link
  ```json
  {
    "success": true,
    "message": "Certificate download link",
    "downloadUrl": "https://storage.example.com/cert123.pdf"
  }
  ```

**Error Responses:**
- `400 Bad Request`: Invalid certificate ID
  ```json
  {
    "success": false,
    "errors": [
      {
        "field": "certificateId",
        "message": "Invalid certificate ID format"
      }
    ]
  }
  ```
- `401 Unauthorized`: Missing or expired token
  ```json
  {
    "success": false,
    "message": "Download token has expired"
  }
  ```
- `403 Forbidden`: Invalid token for this certificate
  ```json
  {
    "success": false,
    "message": "Invalid download token"
  }
  ```
- `404 Not Found`: Certificate not found or access denied
  ```json
  {
    "success": false,
    "message": "Certificate not found or access denied"
  }
  ```

---

## 5. Verify Certificate Ownership

`GET /api/certificates/:certificateId/verify-ownership`

Check if the authenticated student owns a specific certificate.

**Authentication:** Required (Bearer token)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Path Parameters:**
- `certificateId` (required): Certificate ID (MongoDB ObjectId)

**cURL Example:**
```bash
curl -X GET "http://localhost:3002/api/certificates/507f1f77bcf86cd799439011/verify-ownership" \
  -H "Authorization: Bearer eyJhbGc..."
```

**Success Response (200):**
```json
{
  "success": true,
  "isOwner": true,
  "message": "Certificate ownership verified"
}
```

**Response When Not Owner:**
```json
{
  "success": true,
  "isOwner": false,
  "message": "Certificate not owned by this user"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid certificate ID
  ```json
  {
    "success": false,
    "errors": [
      {
        "field": "certificateId",
        "message": "Invalid certificate ID format"
      }
    ]
  }
  ```
- `401 Unauthorized`: Missing authentication
  ```json
  {
    "error": "Access denied, no token provided"
  }
  ```

---

## Pagination Details

Pagination is available on the `/my-certificates` endpoint.

**Parameters:**
- `page`: Page number (default: 1, minimum: 1)
- `limit`: Items per page (default: 10, minimum: 1, maximum: 100)

**Response Format:**
```json
{
  "pagination": {
    "page": 2,
    "limit": 10,
    "totalCount": 45,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": true
  }
}
```

**Navigation:**
- Next page: Increment `page` by 1 (if `hasNextPage` is true)
- Previous page: Decrement `page` by 1 (if `hasPrevPage` is true)
- Last page: Use `totalPages` value

---

## Filtering Options

The `/my-certificates` endpoint supports multiple filters:

**Course Filter:**
```bash
GET /api/certificates/my-certificates?courseId=507f1f77bcf86cd799439013
```

**Date Range Filter:**
```bash
GET /api/certificates/my-certificates?issueDateStart=2024-01-01&issueDateEnd=2024-12-31
```

**Status Filter:**
```bash
GET /api/certificates/my-certificates?status=ACTIVE
```

**Combined Filters:**
```bash
GET /api/certificates/my-certificates?courseId=507f1f77bcf86cd799439013&status=ACTIVE&page=1&limit=20
```

**Filter Validation:**
- `courseId`: Must be a valid MongoDB ObjectId
- `issueDateStart/End`: Must be valid ISO 8601 date strings
- End date must be after start date
- `status`: Must be one of: ACTIVE, REVOKED, EXPIRED
- Unknown query parameters are automatically removed

---

## Rate Limiting

Certificate endpoints respect the global API rate limits:

**Authenticated Users:**
- Window: 60 seconds
- Max requests: 100 per window

**Download Endpoints:**
- Bulk download: Limited to prevent abuse
- Single download: Rate limited per certificate

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706182800
```

**Rate Limit Exceeded (429):**
```json
{
  "error": "Too many requests, please try again later"
}
```

---

## Security Considerations

**Download Tokens:**
- Tokens expire after 1-2 hours
- Include unique nonce to prevent replay attacks
- Signed with JWT_SECRET for integrity
- Validated against certificate ownership

**Access Control:**
- Students can only access their own certificates
- Ownership verified on every request
- Invalid attempts are logged

**Data Privacy:**
- Certificate URLs may contain sensitive information
- Download tokens provide time-limited access
- Public hashes available for sharing (separate endpoint)

---

## Usage Examples

**Example 1: List all certificates**
```javascript
const response = await fetch('http://localhost:3002/api/certificates/my-certificates', {
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
});
const { data, pagination } = await response.json();
console.log(`Found ${pagination.totalCount} certificates`);
```

**Example 2: Filter by course**
```javascript
const response = await fetch(
  `http://localhost:3002/api/certificates/my-certificates?courseId=${courseId}`,
  {
    headers: { 'Authorization': `Bearer ${authToken}` }
  }
);
```

**Example 3: Download single certificate**
```javascript
// First, get certificate with download token
const cert = await fetch(`http://localhost:3002/api/certificates/${certId}`, {
  headers: { 'Authorization': `Bearer ${authToken}` }
}).then(r => r.json());

// Then use token to download
const blob = await fetch(
  `http://localhost:3002/api/certificates/download/${certId}?token=${cert.data.downloadToken}`
).then(r => r.blob());
```

**Example 4: Download all certificates**
```javascript
const response = await fetch(
  'http://localhost:3002/api/certificates/my-certificates/download-all',
  {
    headers: { 'Authorization': `Bearer ${authToken}` }
  }
);
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'my-certificates.zip';
a.click();
```
