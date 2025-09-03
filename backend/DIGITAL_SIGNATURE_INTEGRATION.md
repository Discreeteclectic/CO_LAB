# Digital Signature System for Contract Management

This document describes the implementation of a comprehensive digital signature system for contract management in the CO-LAB CRM.

## Overview

The digital signature system provides secure, legally-compliant electronic signatures for contracts using RSA-2048 cryptography and SHA-256 hashing. The system supports multi-party signature workflows, document integrity verification, and comprehensive audit trails.

## Architecture

### Components

1. **Digital Signature Service** (`/src/services/digitalSignature.js`)
   - RSA key pair generation (2048-bit)
   - Document signing with RSA-SHA256
   - Signature verification and validation
   - Multi-signature document support
   - Signature workflow management

2. **Signature Keys Service** (`/src/services/signatureKeys.js`)
   - User key management
   - Secure key storage (in-memory for demo)
   - Key lifecycle management
   - Access control and validation

3. **Digital Signatures API** (`/src/routes/digitalSignatures.js`)
   - Complete REST API for signature operations
   - User key generation and management
   - Contract signing and verification
   - Signature request workflows

## Security Features

### Cryptographic Standards
- **Algorithm**: RSA with SHA-256 (RSA-SHA256)
- **Key Size**: 2048-bit RSA keys
- **Padding**: PSS padding for enhanced security
- **Hash Function**: SHA-256 for document integrity

### Security Measures
- Document tampering detection
- Key ownership verification
- Signature timestamp validation
- IP address and user agent logging
- Secure token generation for signature requests

## API Endpoints

### User Key Management

#### Generate Signature Keys
```http
POST /api/digital-signatures/keys/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "regenerate": false
}
```

#### Get User's Keys
```http
GET /api/digital-signatures/keys
Authorization: Bearer <token>
```

#### Revoke Keys
```http
DELETE /api/digital-signatures/keys
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Security concern"
}
```

### Contract Signing

#### Sign Contract
```http
POST /api/digital-signatures/sign
Authorization: Bearer <token>
Content-Type: application/json

{
  "contractId": "contract_123",
  "documentData": "base64_encoded_document",
  "signerInfo": {
    "role": "Contract Manager",
    "comments": "Approved as per company policy",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  }
}
```

#### Verify Signatures
```http
POST /api/digital-signatures/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "contractId": "contract_123",
  "documentData": "base64_encoded_document",
  "signatureId": "optional_specific_signature"
}
```

### Signature Workflow

#### Create Signature Request
```http
POST /api/digital-signatures/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "contractId": "contract_123",
  "requiredSigners": [
    {
      "userId": "user_456",
      "email": "manager@company.com",
      "name": "John Doe",
      "role": "Manager",
      "required": true
    },
    {
      "email": "client@clientcompany.com",
      "name": "Jane Smith",
      "role": "Client Representative",
      "required": false
    }
  ],
  "expirationHours": 72,
  "message": "Please review and sign the contract"
}
```

#### Get Contract Signature Status
```http
GET /api/digital-signatures/contract/:contractId
Authorization: Bearer <token>
```

### Administrative

#### Get Key Statistics (Admin Only)
```http
GET /api/digital-signatures/keys/statistics
Authorization: Bearer <token>
```

## Usage Examples

### JavaScript Client Integration

#### Generate Keys and Sign Contract
```javascript
// Generate signature keys
const generateKeys = async () => {
  const response = await fetch('/api/digital-signatures/keys/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ regenerate: false })
  });
  return response.json();
};

// Sign a contract
const signContract = async (contractId, documentData) => {
  const response = await fetch('/api/digital-signatures/sign', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contractId,
      documentData: btoa(documentData), // Base64 encode
      signerInfo: {
        role: 'Contract Manager',
        comments: 'Digital signature applied'
      }
    })
  });
  return response.json();
};

// Verify signature
const verifySignature = async (contractId, documentData) => {
  const response = await fetch('/api/digital-signatures/verify', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contractId,
      documentData: btoa(documentData)
    })
  });
  return response.json();
};
```

### Multi-Party Signature Workflow
```javascript
// Create signature request for multiple parties
const createSignatureRequest = async (contractId) => {
  const requiredSigners = [
    {
      userId: 'manager_123',
      email: 'manager@company.com',
      name: 'John Manager',
      role: 'Approving Manager',
      required: true
    },
    {
      email: 'legal@company.com',
      name: 'Legal Department',
      role: 'Legal Review',
      required: true
    },
    {
      email: 'client@external.com',
      name: 'Client Representative',
      role: 'Client',
      required: false
    }
  ];

  const response = await fetch('/api/digital-signatures/request', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contractId,
      requiredSigners,
      expirationHours: 48,
      message: 'Please review and digitally sign this contract'
    })
  });

  return response.json();
};

// Check signature status
const getSignatureStatus = async (contractId) => {
  const response = await fetch(`/api/digital-signatures/contract/${contractId}`, {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });
  return response.json();
};
```

## Signature Certificate Structure

Each digital signature generates a certificate with complete audit information:

```json
{
  "certificateId": "uuid-v4",
  "documentInfo": {
    "title": "Contract #001",
    "type": "CONTRACT",
    "contractNumber": "C-2025-001",
    "documentId": "contract_id"
  },
  "signatureInfo": {
    "signatureId": "unique_signature_id",
    "signerName": "John Doe",
    "signerEmail": "john@company.com",
    "signerRole": "Manager",
    "signedAt": "2025-08-27T14:48:26.892Z",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  },
  "verification": {
    "algorithm": "RSA-SHA256",
    "version": "1.0",
    "documentHash": "sha256_hash"
  },
  "issuedAt": "2025-08-27T14:48:26.892Z",
  "issuer": "CO-LAB CRM Digital Signature Service"
}
```

## Workflow States

### Contract States
- `DRAFT` - Contract created but not sent for signing
- `SENT` - Signature request sent to required parties
- `SIGNED` - All required signatures collected
- `ACTIVE` - Contract is active and enforceable
- `COMPLETED` - Contract obligations fulfilled
- `CANCELLED` - Contract cancelled before completion

### Signature Request States
- `PENDING` - Waiting for signatures
- `COMPLETED` - All required signatures collected
- `EXPIRED` - Request expired without all signatures
- `CANCELLED` - Request cancelled by administrator

## Security Considerations

### Key Management
- Private keys stored securely (encrypted in production)
- Key revocation capabilities
- Key ownership verification
- Audit trail for all key operations

### Document Integrity
- SHA-256 hashing for tamper detection
- Base64 encoding for transport
- Signature validation before contract activation
- Version control for document changes

### Access Control
- User authentication required for all operations
- Role-based access to administrative functions
- IP address and user agent logging
- Session management and token validation

## Integration with Contract Workflow

The digital signature system integrates seamlessly with the existing contract management:

1. **Contract Creation**: Contracts start in `DRAFT` status
2. **Signature Request**: Send to required signers, status becomes `SENT`
3. **Digital Signing**: Each party signs using their private key
4. **Verification**: System verifies all signatures automatically
5. **Contract Activation**: Status changes to `SIGNED` then `ACTIVE`
6. **Audit Trail**: Complete signature history maintained

## Error Handling

### Common Error Scenarios
- Missing or invalid signature keys
- Document tampering detected
- Expired signature requests
- Invalid signature verification
- Network or service failures

### Error Response Format
```json
{
  "error": "Description of the error",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation details"
  },
  "timestamp": "2025-08-27T14:48:26.892Z"
}
```

## Monitoring and Logging

### Business Events Logged
- `signature_keys_generated` - New keys created
- `signature_keys_revoked` - Keys revoked
- `contract_signed` - Contract digitally signed
- `signature_request_created` - Multi-party request created
- `signature_verification_failed` - Invalid signature detected

### Metrics Tracked
- Total active signature keys
- Signature success/failure rates
- Average signature workflow completion time
- Document tampering detection events

## Production Deployment

### Requirements
- Secure key storage (HSM recommended)
- SSL/TLS encryption for all endpoints
- Database storage for signatures and certificates
- Backup and disaster recovery procedures
- Compliance with electronic signature laws

### Performance Considerations
- RSA operations are CPU-intensive
- Consider caching for key lookups
- Implement rate limiting for key generation
- Monitor signature verification times

## Legal Compliance

This system is designed to comply with:
- Electronic Signatures in Global and National Commerce Act (ESIGN)
- Uniform Electronic Transactions Act (UETA)
- European eIDAS Regulation
- Russian Federal Law on Electronic Signature

**Note**: Consult with legal experts for specific jurisdiction requirements.

## Future Enhancements

- Integration with external Certificate Authorities
- Hardware Security Module (HSM) support
- Advanced signature types (qualified signatures)
- Mobile signature applications
- Blockchain-based signature verification
- PDF signature embedding