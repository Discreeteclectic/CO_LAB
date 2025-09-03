# OpenAI GPT-4 Integration for Commercial Proposals

This document describes the implementation of AI-powered commercial proposal generation using OpenAI GPT-4 API.

## Overview

The system generates professional commercial proposals (КП) automatically from calculation data using GPT-4, supporting:
- Company-specific templates (Nova, CO-LAB)
- Competitive proposals with markup
- Different product descriptions per company
- Ukrainian/Russian language support
- Professional business formatting

## Architecture

### Components

1. **OpenAI Service** (`/src/services/openaiService.js`)
   - GPT-4 client initialization
   - Proposal generation with structured prompts
   - Token usage tracking
   - Error handling and retry logic

2. **Company Templates Service** (`/src/services/companyTemplates.js`)
   - Template management for Nova and CO-LAB
   - Company-specific styling and branding
   - Payment/delivery terms configuration
   - Contact information management

3. **Proposals API Routes** (`/src/routes/proposals.js`)
   - `/api/proposals/generate` - Generate standard КП
   - `/api/proposals/competitive` - Generate competitive КП with markup
   - `/api/proposals/templates` - Get company templates
   - `/api/proposals/customize` - Customize generated proposals
   - `/api/proposals/usage` - Get OpenAI usage statistics

## Environment Configuration

Add to your `.env` file:

```bash
# OpenAI Configuration
OPENAI_API_KEY="sk-your-openai-api-key-here"
OPENAI_MODEL="gpt-4"
OPENAI_MAX_TOKENS="2000"
```

## API Endpoints

### Generate Commercial Proposal

```http
POST /api/proposals/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "calculationId": "calc_123",
  "companyId": "nova",
  "language": "ru",
  "customRequirements": "Include delivery details",
  "includeBreakdown": true
}
```

### Generate Competitive Proposal (Enhanced)

```http
POST /api/proposals/competitive
Authorization: Bearer <token>
Content-Type: application/json

{
  "calculationId": "calc_123",
  "companyId": "co-lab",
  "markup": 15,
  "language": "ru",
  "customRequirements": "Highlight competitive advantages",
  "competitorPrices": [48000, 52000, 55000],
  "marketPosition": "premium"
}
```

### Get Available Markup Strategies

```http
GET /api/proposals/competitive/markups
Authorization: Bearer <token>
```

### Get Company Competitive Advantages

```http
GET /api/proposals/competitive/:companyId/advantages
Authorization: Bearer <token>
```

### Calculate Competitive Pricing Scenarios

```http
POST /api/proposals/competitive/pricing
Authorization: Bearer <token>
Content-Type: application/json

{
  "originalPrice": 50000,
  "markups": [5, 10, 15, 20],
  "competitorPrices": [48000, 52000, 55000]
}
```

### Get Company Templates

```http
GET /api/proposals/templates
Authorization: Bearer <token>
```

### Customize Generated Proposal

```http
POST /api/proposals/customize
Authorization: Bearer <token>
Content-Type: application/json

{
  "proposalText": "existing proposal text...",
  "modifications": "Add warranty information and payment terms",
  "companyId": "nova",
  "language": "ru"
}
```

## Company Templates

### Nova Template
- **Style**: Technical and detailed with focus on quality and reliability
- **Features**: High quality products, fast delivery, individual approach
- **Payment**: 50% prepayment, 50% within 14 days
- **Delivery**: 3-5 business days
- **Warranty**: 12 months

### CO-LAB Template
- **Style**: Innovative approach with emphasis on modern technologies
- **Features**: Innovative solutions, flexible cooperation terms
- **Payment**: 30% prepayment, 70% within 10 days
- **Delivery**: 2-4 business days
- **Warranty**: 18 months

## Cost Tracking

The system tracks OpenAI API usage:
- Token consumption per request
- Cost estimation
- Usage statistics per user
- Rate limiting and error handling

## Error Handling

- API key validation
- Rate limit management
- Quota exceeded handling
- Service availability checks
- Graceful fallbacks when AI is unavailable

## Security

- Environment variable for API keys
- User authentication required
- Calculation ownership verification
- Input validation and sanitization
- Logging of all AI operations

## Prompt Engineering

The system uses structured prompts that include:
- Company information and branding
- Calculation data and cost breakdown
- Profitability metrics
- Payment and delivery terms
- Professional formatting requirements
- Language-specific instructions

## Usage Examples

### Standard Proposal Generation
```javascript
const response = await fetch('/api/proposals/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    calculationId: 'calc_123',
    companyId: 'nova',
    language: 'ru'
  })
});

const result = await response.json();
console.log(result.proposal.text); // Generated КП
```

### Competitive Proposal with Markup
```javascript
const competitiveProposal = await fetch('/api/proposals/competitive', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    calculationId: 'calc_123',
    companyId: 'co-lab',
    markup: 10,
    customRequirements: 'Emphasize innovation and flexibility'
  })
});
```

## Integration with Frontend

The frontend should implement:
1. "Generate КП with AI" button in calculation interface
2. Company selection dropdown
3. Markup input for competitive proposals
4. Proposal preview and editing modal
5. PDF export functionality
6. Usage statistics dashboard

## Deployment Notes

1. **API Key Setup**: Ensure OpenAI API key is properly configured
2. **Model Access**: Verify GPT-4 access in your OpenAI account
3. **Rate Limits**: Configure appropriate rate limiting
4. **Monitoring**: Set up logging and monitoring for AI operations
5. **Backup**: Implement fallback mechanisms when AI is unavailable

## Cost Optimization

- Token usage estimation before generation
- Caching of frequently used templates
- Batch processing for multiple proposals
- Model selection based on complexity
- Usage quotas per user/organization

## Future Enhancements

- PDF generation integration
- Email sending capabilities
- Template customization interface
- Multi-language model support
- Advanced cost tracking dashboard
- Integration with existing КП workflow