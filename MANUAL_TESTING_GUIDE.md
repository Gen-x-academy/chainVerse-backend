# Manual Testing Guide - Certificate Retrieval & Download

## Overview
This guide provides comprehensive test scenarios for validating the certificate retrieval and download functionality. Use this alongside the Postman collection for thorough testing.

---

## Prerequisites

### Setup Steps
1. **Start the Server**
   ```bash
   npm start
   # Server should be running on http://localhost:3002
   ```

2. **Prepare Test Data**
   - Create a test student account (or use existing)
   - Ensure student has at least 2-3 certificates issued
   - Note down student credentials for login

3. **Import Postman Collection**
   - Import `Certificate_Retrieval_Postman_Collection.json`
   - Set up environment variables:
     - `baseUrl`: `http://localhost:3002`
     - `authToken`: (will be auto-populated on login)

4. **Install Testing Tools** (Optional)
   - Postman Desktop App
   - Thunder Client (VS Code extension)
   - Or use cURL commands

---

## Test Scenarios

### 1. Authentication & Authorization

#### Test 1.1: Student Login
**Objective:** Verify student can authenticate and receive a valid JWT token

**Steps:**
1. Send POST request to `/api/auth/login`
2. Use valid student credentials
3. Check response contains JWT token

**Expected Outcome:**
- ✅ Status: `200 OK`
- ✅ Response includes `token` field
- ✅ Token is saved to environment variables
- ✅ Token format: `eyJhbGc...` (JWT structure)

**Verification:**
```bash
# Token should be in format: header.payload.signature
echo $authToken | grep -o "\." | wc -l  # Should return 2
```

**Error Cases to Test:**
- Invalid email → `401 Unauthorized`
- Incorrect password → `401 Unauthorized`
- Missing credentials → `400 Bad Request`

---

#### Test 1.2: Unauthorized Access
**Objective:** Verify endpoints reject requests without authentication

**Steps:**
1. Send GET request to `/api/certificates/my-certificates`
2. **Do not** include Authorization header
3. Check error response

**Expected Outcome:**
- ✅ Status: `401 Unauthorized`
- ✅ Error message: "Access denied, no token provided"

**Verification:**
Test all protected endpoints without token:
- `GET /my-certificates` → 401
- `GET /:certificateId` → 401
- `GET /my-certificates/download-all` → 401
- `GET /:certificateId/verify-ownership` → 401

---

### 2. Certificate Retrieval

#### Test 2.1: Get All Certificates (Basic)
**Objective:** Retrieve student's certificate list with default pagination

**Steps:**
1. Login and get auth token
2. Send GET request to `/api/certificates/my-certificates`
3. Include Authorization header with token

**Expected Outcome:**
- ✅ Status: `200 OK`
- ✅ Response structure:
  ```json
  {
    "success": true,
    "data": [...],  // Array of certificates
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalCount": X,
      "totalPages": Y,
      "hasNextPage": boolean,
      "hasPrevPage": boolean
    },
    "message": "Retrieved X certificate(s)"
  }
  ```
- ✅ Each certificate has: `_id`, `courseId`, `studentId`, `status`, `certificateUrl`, `downloadToken`

**Verification:**
- Count certificates in response matches `totalCount` (if on first page and totalCount < limit)
- `page` equals 1
- `limit` equals 10 (default)
- `hasNextPage` is true if `totalCount` > 10
- `hasPrevPage` is false on first page

---

#### Test 2.2: Pagination
**Objective:** Verify pagination works correctly

**Steps:**
1. Get total count from Test 2.1
2. Request page 1 with limit=2: `?page=1&limit=2`
3. Request page 2 with limit=2: `?page=2&limit=2`
4. Request last page

**Expected Outcome:**
- ✅ Page 1 returns first 2 certificates
- ✅ Page 2 returns next 2 certificates (different from page 1)
- ✅ Last page: `hasNextPage` is false
- ✅ Total certificates across all pages equals `totalCount`

**Verification Checklist:**
- [ ] Page 1 different from Page 2
- [ ] No duplicate certificates across pages
- [ ] `totalCount` consistent across all requests
- [ ] `totalPages` = ceil(totalCount / limit)
- [ ] Invalid page (0, -1) returns `400 Bad Request`
- [ ] Invalid limit (0, 101) returns `400 Bad Request`

---

#### Test 2.3: Filter by Status
**Objective:** Verify status filtering works correctly

**Steps:**
1. Request with `?status=ACTIVE`
2. Request with `?status=REVOKED`
3. Request with `?status=EXPIRED`
4. Request with invalid status `?status=INVALID`

**Expected Outcome:**
- ✅ ACTIVE: Returns only certificates with status=ACTIVE
- ✅ REVOKED: Returns only revoked certificates (or empty array)
- ✅ EXPIRED: Returns only expired certificates (or empty array)
- ✅ INVALID status: `400 Bad Request` with validation error

**Verification:**
```javascript
// All returned certificates match filter
response.data.every(cert => cert.status === 'ACTIVE')
```

---

#### Test 2.4: Filter by Course
**Objective:** Verify course filtering returns correct certificates

**Steps:**
1. Get a certificate and note its `courseId._id`
2. Request with `?courseId=<courseId>`
3. Verify all returned certificates belong to that course

**Expected Outcome:**
- ✅ Status: `200 OK`
- ✅ All certificates have matching `courseId`
- ✅ Invalid courseId format → `400 Bad Request`
- ✅ Non-existent courseId → Returns empty array

**Verification:**
```javascript
response.data.every(cert => cert.courseId._id === requestedCourseId)
```

---

#### Test 2.5: Filter by Date Range
**Objective:** Verify date range filtering works

**Steps:**
1. Request with `?issueDateStart=2024-01-01`
2. Request with `?issueDateEnd=2024-12-31`
3. Request with both: `?issueDateStart=2024-01-01&issueDateEnd=2024-12-31`
4. Request with invalid dates

**Expected Outcome:**
- ✅ All returned certificates issued after start date
- ✅ All returned certificates issued before end date
- ✅ Invalid date format → `400 Bad Request`
- ✅ End date before start date → `400 Bad Request`

**Verification:**
```javascript
// Check dates are within range
response.data.every(cert => {
  const issueDate = new Date(cert.issueDate);
  return issueDate >= startDate && issueDate <= endDate;
})
```

---

#### Test 2.6: Combined Filters
**Objective:** Verify multiple filters work together

**Steps:**
1. Request with `?status=ACTIVE&courseId=<id>&page=1&limit=5`
2. Verify all filters applied correctly

**Expected Outcome:**
- ✅ Certificates match ALL filter criteria
- ✅ Pagination works with filters
- ✅ `totalCount` reflects filtered results

---

#### Test 2.7: Get Single Certificate
**Objective:** Retrieve details of a specific certificate

**Steps:**
1. Get a certificate ID from Test 2.1
2. Send GET to `/api/certificates/:certificateId`
3. Verify detailed response

**Expected Outcome:**
- ✅ Status: `200 OK`
- ✅ Response has full certificate details
- ✅ Includes populated `courseId` with course details
- ✅ Includes populated `tutorId` with tutor info
- ✅ Has `downloadToken` and `downloadTokenExpiry`
- ✅ `downloadTokenExpiry` is timestamp ~1 hour in future

**Verification:**
- Certificate belongs to authenticated student
- `downloadToken` is valid JWT
- Token expiry is reasonable (1 hour from now)
- Course and tutor data populated correctly

---

#### Test 2.8: Access Other Student's Certificate
**Objective:** Verify ownership validation prevents unauthorized access

**Steps:**
1. Get a certificate ID from another student (if possible)
2. Try to access it with current student's token
3. Check error response

**Expected Outcome:**
- ✅ Status: `404 Not Found` or `403 Forbidden`
- ✅ Error message indicates access denied
- ✅ No certificate data exposed

---

### 3. Certificate Ownership Verification

#### Test 3.1: Verify Own Certificate
**Objective:** Confirm ownership verification endpoint works

**Steps:**
1. Get a valid certificate ID
2. Send GET to `/api/certificates/:certificateId/verify-ownership`
3. Check response

**Expected Outcome:**
- ✅ Status: `200 OK`
- ✅ Response:
  ```json
  {
    "success": true,
    "isOwner": true,
    "message": "Certificate ownership verified"
  }
  ```

---

#### Test 3.2: Verify Non-Owned Certificate
**Objective:** Test ownership check returns false for others' certificates

**Steps:**
1. Use certificate ID from another student
2. Send verification request
3. Check response

**Expected Outcome:**
- ✅ Status: `200 OK`
- ✅ `isOwner`: false
- ✅ Message: "Certificate not owned by this user"

---

### 4. Certificate Downloads

#### Test 4.1: Download All Certificates (ZIP)
**Objective:** Verify bulk download creates valid ZIP file

**Steps:**
1. Send GET to `/api/certificates/my-certificates/download-all`
2. Include auth token
3. Save response to file

**Expected Outcome:**
- ✅ Status: `200 OK`
- ✅ Content-Type: `application/zip`
- ✅ Content-Disposition header includes filename: `certificates_<studentId>_<timestamp>.zip`
- ✅ Response body is binary ZIP data
- ✅ ZIP file can be extracted
- ✅ ZIP contains all active certificates

**Verification Steps:**
1. Save response body to `test.zip`
2. Extract ZIP file
3. Count files matches number of ACTIVE certificates
4. Each file has proper naming: `<CourseName>_<certId>.pdf`
5. Files are valid PDFs/images

**cURL Test:**
```bash
curl -X GET "http://localhost:3002/api/certificates/my-certificates/download-all" \
  -H "Authorization: Bearer $TOKEN" \
  -o certificates.zip

# Verify it's a ZIP
file certificates.zip  # Should show: "Zip archive data"

# Extract and count files
unzip -l certificates.zip | tail -n 1
```

---

#### Test 4.2: Download with No Certificates
**Objective:** Handle case where student has no certificates

**Steps:**
1. Use student account with 0 certificates
2. Request bulk download

**Expected Outcome:**
- ✅ Status: `404 Not Found`
- ✅ Error message: "No certificates found for download"

---

#### Test 4.3: Download Single Certificate (Query Token)
**Objective:** Verify single certificate download with query parameter token

**Steps:**
1. Get certificate with download token (Test 2.7)
2. Send GET to `/api/certificates/download/:certificateId?token=<downloadToken>`
3. **No Authorization header needed**

**Expected Outcome:**
- ✅ Status: `200 OK` or `302 Redirect`
- ✅ Returns download URL or redirects to certificate
- ✅ Certificate file accessible

**Verification:**
- Token in query parameter is sufficient
- No auth header required
- Download succeeds within token expiry period

---

#### Test 4.4: Download Single Certificate (Header Token)
**Objective:** Verify token can be passed in header

**Steps:**
1. Send GET to `/api/certificates/download/:certificateId`
2. Include header: `x-download-token: <token>`

**Expected Outcome:**
- ✅ Same result as Test 4.3
- ✅ Header token accepted

---

#### Test 4.5: Download with Expired Token
**Objective:** Verify expired tokens are rejected

**Steps:**
1. Wait for token to expire (1 hour) OR use old token
2. Attempt download with expired token

**Expected Outcome:**
- ✅ Status: `401 Unauthorized`
- ✅ Error: "Download token has expired"

---

#### Test 4.6: Download with Invalid Token
**Objective:** Test tampered/invalid token rejection

**Steps:**
1. Modify token string (change few characters)
2. Attempt download

**Expected Outcome:**
- ✅ Status: `401` or `403`
- ✅ Error: "Invalid download token"

---

#### Test 4.7: Download Wrong Certificate with Valid Token
**Objective:** Verify token is specific to certificate

**Steps:**
1. Get download token for certificate A
2. Try to download certificate B using token from A

**Expected Outcome:**
- ✅ Status: `403 Forbidden`
- ✅ Error indicates token/certificate mismatch

---

### 5. Input Validation

#### Test 5.1: Invalid Certificate ID Format
**Objective:** Verify MongoDB ObjectId validation

**Steps:**
1. Request with invalid ID: `/api/certificates/not-a-valid-id`
2. Check validation error

**Expected Outcome:**
- ✅ Status: `400 Bad Request`
- ✅ Response:
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

---

#### Test 5.2: Invalid Query Parameters
**Objective:** Test parameter validation catches errors

**Test Cases:**
| Parameter | Invalid Value | Expected Error |
|-----------|---------------|----------------|
| `page` | 0 | "Page must be at least 1" |
| `page` | -5 | "Page must be at least 1" |
| `limit` | 0 | "Limit must be between 1 and 100" |
| `limit` | 150 | "Limit must be between 1 and 100" |
| `status` | "INVALID" | "Invalid status value" |
| `courseId` | "not-an-id" | "Invalid course ID format" |
| `issueDateStart` | "not-a-date" | "Invalid date format" |

**Expected Outcome:**
- ✅ All invalid inputs return `400 Bad Request`
- ✅ Error messages are descriptive
- ✅ Multiple errors returned if multiple fields invalid

---

#### Test 5.3: Sanitization
**Objective:** Verify unknown parameters are removed

**Steps:**
1. Request with extra parameters: `?page=1&hackAttempt=<script>&unknown=value`
2. Check parameters are sanitized

**Expected Outcome:**
- ✅ Request succeeds (unknown params ignored)
- ✅ No script injection possible
- ✅ Only valid params processed

---

### 6. Rate Limiting

#### Test 6.1: Verify Rate Limits
**Objective:** Confirm rate limiting is active

**Steps:**
1. Send 101 requests rapidly to `/api/certificates/my-certificates`
2. Check if rate limit triggered

**Expected Outcome:**
- ✅ First 100 requests: `200 OK`
- ✅ 101st request: `429 Too Many Requests`
- ✅ Response headers include:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 0`
  - `X-RateLimit-Reset: <timestamp>`

**Verification:**
```bash
# Script to test rate limit
for i in {1..105}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    http://localhost:3002/api/certificates/my-certificates
done | sort | uniq -c
```

Expected output:
```
100 200
5 429
```

---

### 7. Error Handling

#### Test 7.1: Server Errors
**Objective:** Verify graceful error handling

**Scenarios to Test:**
- Database connection error
- Invalid certificate URL
- ZIP generation failure

**Expected Outcome:**
- ✅ Status: `500 Internal Server Error`
- ✅ Generic error message (no sensitive info exposed)
- ✅ Error logged server-side

---

#### Test 7.2: Not Found Errors
**Objective:** Test 404 handling

**Steps:**
1. Request certificate with valid ID format but non-existent
2. Check error response

**Expected Outcome:**
- ✅ Status: `404 Not Found`
- ✅ Message: "Certificate not found"

---

### 8. Performance Testing

#### Test 8.1: Response Times
**Objective:** Verify acceptable performance

**Benchmarks:**
| Endpoint | Expected Response Time |
|----------|----------------------|
| GET /my-certificates | < 500ms |
| GET /:certificateId | < 300ms |
| GET /verify-ownership | < 200ms |
| GET /download-all | < 3s (depends on size) |

**Verification:**
Use Postman's response time display or:
```bash
curl -w "@curl-format.txt" -o /dev/null -s "URL"

# curl-format.txt:
time_total: %{time_total}s
```

---

#### Test 8.2: Load Testing
**Objective:** Test under concurrent load

**Steps:**
1. Use Apache Bench or similar tool
2. Send 100 concurrent requests
3. Monitor success rate and response times

**Expected Outcome:**
- ✅ 99%+ success rate
- ✅ No timeout errors
- ✅ Consistent response times

```bash
ab -n 1000 -c 100 -H "Authorization: Bearer $TOKEN" \
  http://localhost:3002/api/certificates/my-certificates
```

---

### 9. Security Testing

#### Test 9.1: Token Security
**Objective:** Verify download tokens are secure

**Checks:**
- [ ] Token cannot be reused after expiry
- [ ] Token tied to specific certificate
- [ ] Token tied to specific student
- [ ] Token has nonce to prevent replay attacks
- [ ] Token signed with JWT_SECRET

---

#### Test 9.2: SQL/NoSQL Injection
**Objective:** Test injection attack prevention

**Steps:**
1. Try injecting malicious code in parameters:
   - `?courseId[$ne]=null`
   - `?status='; DROP TABLE--`
2. Verify attacks blocked

**Expected Outcome:**
- ✅ `400 Bad Request` or parameters sanitized
- ✅ No database manipulation
- ✅ Validation catches injection attempts

---

### 10. Integration Testing

#### Test 10.1: Full User Flow
**Objective:** Test complete certificate retrieval workflow

**User Story:**
*"As a student, I want to view all my course certificates and download them."*

**Steps:**
1. Student logs in
2. Views certificate list (filtered by active)
3. Pages through results
4. Clicks specific certificate to view details
5. Verifies ownership
6. Downloads individual certificate
7. Downloads all certificates as ZIP

**Expected Outcome:**
- ✅ All steps complete successfully
- ✅ Data consistency throughout flow
- ✅ Tokens remain valid during flow
- ✅ No errors or unexpected behavior

---

## Test Execution Checklist

### Pre-Testing
- [ ] Server is running
- [ ] Test database has sample data
- [ ] Postman collection imported
- [ ] Environment variables configured
- [ ] Test credentials available

### Core Functionality
- [ ] Authentication works
- [ ] Get all certificates (basic)
- [ ] Pagination works correctly
- [ ] All filters work (status, course, dates)
- [ ] Get single certificate
- [ ] Verify ownership
- [ ] Download all certificates (ZIP)
- [ ] Download single certificate (query token)
- [ ] Download single certificate (header token)

### Error Cases
- [ ] Unauthorized access blocked (401)
- [ ] Invalid IDs rejected (400)
- [ ] Non-existent certificates (404)
- [ ] Expired tokens rejected (401)
- [ ] Invalid tokens rejected (403)
- [ ] Rate limiting active (429)

### Edge Cases
- [ ] Empty result sets handled
- [ ] Large result sets paginated
- [ ] Invalid pagination parameters
- [ ] Multiple filters combined
- [ ] Certificate without course/tutor data
- [ ] Token expiry edge cases

### Performance
- [ ] Response times acceptable
- [ ] Concurrent requests handled
- [ ] Large ZIP files download correctly

### Security
- [ ] Can't access others' certificates
- [ ] Tokens properly secured
- [ ] Injection attempts blocked
- [ ] Sensitive data not exposed in errors

---

## Troubleshooting

### Common Issues

**Issue: "authToken is undefined"**
- **Solution:** Run "Student Login" request first to set token

**Issue: "certificateId is undefined"**
- **Solution:** Run "Get All My Certificates" first to populate IDs

**Issue: Downloads fail**
- **Solution:** Check certificate files exist at URLs in database

**Issue: Rate limit reached during testing**
- **Solution:** Wait 60 seconds or restart server to reset counters

**Issue: ZIP file corrupted**
- **Solution:** Check response is saved as binary, not text

---

## Reporting Issues

When reporting bugs, include:
1. **Request details:** Method, URL, headers, body
2. **Expected outcome**
3. **Actual outcome**
4. **Response status code and body**
5. **Environment:** OS, Node version, MongoDB version
6. **Steps to reproduce**
7. **Server logs** (if available)

---

## Success Criteria Summary

✅ All 10 test sections pass
✅ All core functionality works
✅ Error handling is robust
✅ Performance is acceptable
✅ Security measures are effective
✅ No critical bugs found

**Ready for Production:** When all checklist items are complete and documented.
