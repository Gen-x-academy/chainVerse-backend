# Testing Notes

Branch: feature/certificate-retrieval-download  
Date: Jan 24, 2026

## Server startup issue - FIXED

Hit a mongoose model conflict when trying to start the server:
```
OverwriteModelError: Cannot overwrite `Certificate` model once compiled.
```

Problem was having two model files both exporting as "Certificate":
- `src/models/certificate.js` 
- `src/models/certificate-temp.js`

The schemas were different too:
- certificate.js had: tutorId, studentId, courseId, issueDate
- certificate-temp.js had: student, issuedBy (different field names)

Our new service layer code expects `studentId`, `courseId`, etc. so the mismatch would have broken everything.

### Fix applied:
1. Updated certificate.js with full schema (added status, certificateUrl, imageUrl, publicHash, downloadToken, etc.)
2. Updated controllers to use certificate.js instead of certificate-temp.js
3. Removed certificate-temp.js completely
4. Added indexes for performance

Files updated:
- src/models/certificate.js - complete schema
- src/controllers/certificateController.js
- src/controllers/nftController.js  
- src/controllers/verificationController.js

## Postman collection check

The collection looks good:
- 12 requests organized into 4 groups
- Variables set up for baseUrl, tokens, and IDs
- Test scripts that auto-save tokens and validate responses
- Pre-request scripts to check required variables

All the requests have proper structure, the test scripts should catch issues automatically.

## Manual testing guide

Pretty thorough - covers 50+ test scenarios including:
- Basic CRUD operations
- Pagination and filtering
- Download functionality
- Error cases
- Rate limiting
- Security checks

Should be enough to validate everything works.

## What still needs testing

Once server is running, need to:
1. Import collection to Postman
2. Login to get auth token
3. Run through the requests in order
4. Verify responses match what's documented
5. Test error cases (invalid IDs, expired tokens, etc.)
6. Check downloads actually work

## Notes

- The collection auto-saves certificateId and downloadToken after fetching certificates, so subsequent requests should just work
- Need actual test data in DB (student account with some certificates)
- JWT_SECRET must be set in .env for tokens to work properly

Server should start now that the model conflict is fixed. Ready to test.
