# Certificate Name Change Request Feature

## Description  
This PR implements a comprehensive certificate name change request system that enables verified student accounts to request name changes on their certificates. The feature addresses needs such as correcting errors or reflecting legal name updates, ensuring that the process is authenticated, trackable, and transparent.

## Related Issues  
Implements: Certificate Name Change Request Feature
- Submit name change requests with supporting documentation
- Track request status (Pending/Approved/Rejected)
- View and filter submitted requests
- Complete security and validation implementation

## Changes Made  

### 📁 New Files Created

#### Models
- [x] **src/models/CertificateNameChangeRequest.js**
  - MongoDB schema for certificate name change requests
  - Fields: studentId, certificateId, newFullName, reason, supportingDocumentUrl, status, requestedDate, reviewedDate, reviewedBy, adminNotes
  - Validation: name (2-100 chars), reason (10-500 chars)
  - Status enum: Pending, Approved, Rejected
  - Indexes for efficient querying on studentId, status, and createdAt

#### Controllers
- [x] **src/controllers/certificateNameChangeController.js**
  - `submitNameChangeRequest()` - Creates new name change request with file upload support
  - `getMyNameChangeRequests()` - Retrieves all requests for authenticated student with optional status filter
  - `getNameChangeRequestById()` - Fetches specific request by ID with ownership verification

#### Routes
- [x] **src/routes/certificateNameChangeRoutes.js**
  - POST `/certificates/name-change/request` - Submit name change request
  - GET `/certificates/name-change/my-requests` - Get all requests with status filter
  - GET `/certificates/name-change/request/:requestId` - Get single request by ID
  - Multer configuration for file uploads (5MB limit, PDF/JPG/PNG only)
  - Rate limiting middleware integration
  - Verified student authentication middleware

#### Validators
- [x] **src/validators/certificateNameChangeValidator.js**
  - `nameChangeRequestSchema` - Validates request submission
    - newFullName: 2-100 chars, letters/spaces/hyphens/apostrophes only
    - reason: 10-500 chars required
    - certificateId: optional valid MongoDB ObjectId
  - `statusFilterSchema` - Validates query parameters
    - status: Pending, Approved, or Rejected

#### Tests
- [x] **src/tests/unit/certificateNameChange.test.js** (15 test cases)
  - Model validation tests
  - Controller logic tests
  - Status transition tests
  - Document upload handling tests
  - Access control verification tests

- [x] **src/tests/integration/certificateNameChangeRoutes.test.js** (15+ test cases)
  - Full API endpoint testing
  - Authentication/authorization tests
  - Rate limiting verification
  - File upload integration tests
  - Status filtering tests
  - Cross-user access prevention tests

### 📝 Modified Files

#### Route Registration
- [x] **src/routes/index.js**
  - Added import for certificateNameChangeRoutes
  - Registered route: `router.use("/certificates/name-change", certificateNameChangeRoutes)`

#### Documentation
- [x] **API_DOCS.md**
  - Added "Certificate Name Change Requests" section to Table of Contents
  - Comprehensive API documentation with:
    - Endpoint descriptions
    - Request/response examples
    - Error response codes
    - Validation rules
    - Rate limiting information
    - Security requirements

### 📂 Directories Created
- [x] **uploads/certificate-name-change-documents/**
  - Storage directory for supporting documents

## How to Test  

### Prerequisites
```bash
# Ensure MongoDB is running
# Ensure environment variables are set in config.env:
# - JWT_SECRET
# - MONGO_URI
```

### 1. Start the Server
```bash
npm start
# or for development
npm run dev
```

### 2. Test Endpoints with cURL or Postman

#### Submit a Name Change Request
```bash
curl -X POST http://localhost:3000/certificates/name-change/request \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newFullName": "John Michael Doe",
    "reason": "Legal name change after marriage ceremony",
    "certificateId": "optional_certificate_id"
  }'
```

#### Submit with Supporting Document
```bash
curl -X POST http://localhost:3000/certificates/name-change/request \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "newFullName=John Michael Doe" \
  -F "reason=Legal name change with documentation" \
  -F "supportingDocument=@/path/to/document.pdf"
```

#### Get All My Requests
```bash
curl -X GET http://localhost:3000/certificates/name-change/my-requests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Get Requests Filtered by Status
```bash
curl -X GET "http://localhost:3000/certificates/name-change/my-requests?status=Pending" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Get Specific Request by ID
```bash
curl -X GET http://localhost:3000/certificates/name-change/request/REQUEST_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Run Unit Tests
```bash
npm test src/tests/unit/certificateNameChange.test.js
```

### 4. Run Integration Tests
```bash
npm test src/tests/integration/certificateNameChangeRoutes.test.js
```

### 5. Validation Testing

**Test Case 1: Invalid Name Format**
```json
{
  "newFullName": "John123",
  "reason": "Testing invalid name"
}
// Expected: 400 Bad Request - name can only contain letters, spaces, hyphens, apostrophes
```

**Test Case 2: Short Reason**
```json
{
  "newFullName": "John Doe",
  "reason": "Short"
}
// Expected: 400 Bad Request - reason must be at least 10 characters
```

**Test Case 3: Unverified User**
```bash
# Login with unverified account
# Expected: 403 Forbidden - Only verified student accounts can request name changes
```

**Test Case 4: File Size Exceeded**
```bash
# Upload file > 5MB
# Expected: 400 Bad Request - File size limit exceeded
```

**Test Case 5: Invalid File Type**
```bash
# Upload .exe or .zip file
# Expected: 400 Bad Request - Only PDF, JPG, JPEG, and PNG files are allowed
```

## Security Features Implemented

### Authentication & Authorization
- [x] JWT token authentication required on all endpoints
- [x] Verified student account check before processing requests
- [x] Ownership verification - students can only view their own requests
- [x] User lookup with cache support for performance

### Input Validation
- [x] Joi schema validation on all inputs
- [x] Name format validation (letters, spaces, hyphens, apostrophes only)
- [x] Reason length validation (10-500 characters)
- [x] MongoDB ObjectId validation for certificateId
- [x] Status enum validation

### File Upload Security
- [x] File type whitelist (PDF, JPG, JPEG, PNG only)
- [x] File size limit (5MB maximum)
- [x] Unique filename generation to prevent overwrites
- [x] Secure storage path configuration
- [x] File extension validation

### Rate Limiting
- [x] Rate limiting middleware integrated
- [x] Prevents spam and abuse of submission endpoint
- [x] Configurable limits per route

### Data Integrity
- [x] Timestamps on all records (createdAt, updatedAt)
- [x] Default status of "Pending" on creation
- [x] Indexed fields for query performance
- [x] Referential integrity with User and Certificate models

## API Endpoints Summary

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/certificates/name-change/request` | Verified Students | Submit new name change request |
| GET | `/certificates/name-change/my-requests` | Verified Students | Get all requests with optional status filter |
| GET | `/certificates/name-change/request/:requestId` | Verified Students | Get specific request by ID |

## Response Examples

### Successful Request Submission
```json
{
  "success": true,
  "message": "Name change request submitted successfully",
  "data": {
    "requestId": "679a1b2c3d4e5f6g7h8i9j0k",
    "newFullName": "John Michael Doe",
    "status": "Pending",
    "requestedDate": "2026-01-23T10:30:00.000Z"
  }
}
```

### Request List Response
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "679a1b2c3d4e5f6g7h8i9j0k",
      "studentId": "user_id_123",
      "certificateId": "cert_id_456",
      "newFullName": "John Michael Doe",
      "reason": "Legal name change after marriage ceremony",
      "supportingDocumentUrl": "uploads/certificate-name-change-documents/doc-1234567890.pdf",
      "status": "Pending",
      "requestedDate": "2026-01-23T10:30:00.000Z",
      "createdAt": "2026-01-23T10:30:00.000Z",
      "updatedAt": "2026-01-23T10:30:00.000Z"
    }
  ]
}
```

## Error Responses

| Status Code | Scenario |
|-------------|----------|
| 400 | Validation error (invalid format, missing fields) |
| 401 | No authentication token provided |
| 403 | Unverified student account attempting access |
| 404 | Request not found or doesn't belong to user |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Checklist  

### Code Quality
- [x] Code follows the project's coding style
- [x] Consistent naming conventions used
- [x] Async/await pattern for database operations
- [x] Error handling with try-catch blocks
- [x] Logging for important operations and errors
- [x] DRY principles applied

### Testing
- [x] Unit tests created (15 test cases)
- [x] Integration tests created (15+ test cases)
- [x] Model validation tests
- [x] Controller logic tests
- [x] Route authentication tests
- [x] Error handling tests
- [x] Edge cases covered

### Documentation
- [x] API documentation updated in API_DOCS.md
- [x] Request/response examples provided
- [x] Error responses documented
- [x] Validation rules clearly stated
- [x] Rate limiting information included
- [x] Code comments added where necessary

### Security
- [x] Authentication implemented
- [x] Authorization checks in place
- [x] Input validation using Joi
- [x] File upload validation
- [x] Rate limiting configured
- [x] SQL injection prevention (NoSQL safe)
- [x] XSS prevention through validation

### Database
- [x] Model schema created with proper validation
- [x] Indexes added for query optimization
- [x] Referential integrity with User model
- [x] Timestamps enabled
- [x] Enum validation for status field

### File Management
- [x] Upload directory created
- [x] Multer configuration complete
- [x] File type validation
- [x] File size limits enforced
- [x] Secure filename generation

### Routes & Integration
- [x] Routes registered in main router
- [x] Middleware properly ordered
- [x] Validation middleware integrated
- [x] Authentication middleware integrated
- [x] Rate limiting middleware integrated

## Future Enhancements (Optional)
- [ ] Admin endpoints for reviewing/approving requests
- [ ] Email notifications on status changes
- [ ] Bulk request processing for admins
- [ ] Request history and audit log
- [ ] Certificate regeneration after approval
- [ ] Dashboard analytics for admins
- [ ] Request expiration after certain period

## Definition of Done - Verification

✅ **Verified students are able to submit name change requests successfully.**
- Controller validates user verification status
- Endpoint accepts all required fields
- File upload supported and validated

✅ **Students can track the status of their requests through the provided endpoint.**
- GET endpoint retrieves all user requests
- Status filtering implemented (Pending/Approved/Rejected)
- Individual request lookup by ID

✅ **Proper access control, validations, and spam protection mechanisms are in place.**
- JWT authentication required
- Verified student check implemented
- Rate limiting configured
- Input validation with Joi schemas
- File upload security measures

✅ **Endpoints are documented and covered by unit tests.**
- Comprehensive API documentation in API_DOCS.md
- 15 unit tests covering model and controller logic
- 15+ integration tests covering all endpoints
- Request/response examples provided

## Review Notes
This implementation provides a secure, scalable, and well-tested foundation for certificate name change requests. All security best practices have been followed, and the feature is production-ready.
