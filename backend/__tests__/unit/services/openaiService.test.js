const openaiService = require('../../../src/services/openaiService');
const { createTestData, cleanTestData } = require('../../helpers/testHelpers');

// Mock OpenAI API
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn()
        }
      },
      embeddings: {
        create: jest.fn()
      }
    }))
  };
});

describe('OpenAI Service', () => {
  let testData;
  let mockOpenAI;

  beforeAll(async () => {
    testData = await createTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Get mock instance
    const OpenAI = require('openai').default;
    mockOpenAI = new OpenAI();
  });

  describe('Text Generation', () => {
    test('should generate proposal text', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Generated proposal text for Gazprom LLC regarding oxygen cylinders supply agreement.'
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const clientData = {
        name: 'Gazprom LLC',
        contactPerson: 'Ivan Petrov'
      };
      const products = [
        { name: 'Oxygen Cylinder 40L', quantity: 20, price: 3500 }
      ];

      const proposal = await openaiService.generateProposal(clientData, products);

      expect(proposal).toBeDefined();
      expect(typeof proposal).toBe('string');
      expect(proposal.length).toBeGreaterThan(0);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    test('should generate email template', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Subject: Order Confirmation\n\nDear Ivan Petrov,\n\nThank you for your order...'
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const emailData = {
        type: 'order_confirmation',
        clientName: 'Gazprom LLC',
        contactPerson: 'Ivan Petrov',
        orderNumber: 'ORD-001'
      };

      const email = await openaiService.generateEmailTemplate(emailData);

      expect(email).toBeDefined();
      expect(typeof email).toBe('string');
      expect(email).toContain('Ivan Petrov');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    test('should generate contract template', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'CONTRACT FOR SUPPLY OF OXYGEN CYLINDERS\n\nParty 1: CO-LAB Company\nParty 2: Gazprom LLC...'
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const contractData = {
        clientName: 'Gazprom LLC',
        products: [{ name: 'Oxygen Cylinder 40L', quantity: 20 }],
        duration: '12 months',
        totalAmount: 840000
      };

      const contract = await openaiService.generateContract(contractData);

      expect(contract).toBeDefined();
      expect(typeof contract).toBe('string');
      expect(contract).toContain('Gazprom LLC');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Analysis Functions', () => {
    test('should analyze client sentiment from communications', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              sentiment: 'positive',
              confidence: 0.85,
              keyTopics: ['pricing', 'delivery'],
              summary: 'Client is satisfied with service'
            })
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const communications = [
        'Thank you for the quick delivery',
        'The product quality is excellent',
        'Looking forward to future orders'
      ];

      const analysis = await openaiService.analyzeClientSentiment(communications);

      expect(analysis).toHaveProperty('sentiment');
      expect(analysis).toHaveProperty('confidence');
      expect(analysis.sentiment).toBe('positive');
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    test('should suggest pricing optimization', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              recommendations: [
                { product: 'Oxygen Cylinder 40L', suggestedPrice: 3750, reason: 'Market demand increase' }
              ],
              marketTrends: 'Rising demand for oxygen cylinders',
              competitiveAnalysis: 'Prices are competitive'
            })
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const marketData = {
        products: [{ name: 'Oxygen Cylinder 40L', currentPrice: 3500, sales: 100 }],
        competitors: [{ name: 'Competitor A', price: 3600 }],
        trends: { demand: 'increasing' }
      };

      const suggestions = await openaiService.suggestPricingOptimization(marketData);

      expect(suggestions).toHaveProperty('recommendations');
      expect(Array.isArray(suggestions.recommendations)).toBe(true);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Content Optimization', () => {
    test('should optimize product descriptions', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Premium 40-liter oxygen cylinder designed for industrial applications with enhanced safety features and reliable performance.'
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const productData = {
        name: 'Oxygen Cylinder 40L',
        description: 'Oxygen cylinder, 40 liters',
        category: 'cylinders',
        features: ['high-pressure', 'industrial-grade']
      };

      const optimized = await openaiService.optimizeProductDescription(productData);

      expect(optimized).toBeDefined();
      expect(typeof optimized).toBe('string');
      expect(optimized.length).toBeGreaterThan(productData.description.length);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    test('should generate marketing content', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Reliable Industrial Gas Solutions - Your Trusted Partner for High-Quality Oxygen and Propane Cylinders'
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const campaignData = {
        type: 'product_launch',
        products: ['Oxygen Cylinder 40L', 'Propane Cylinder 50L'],
        targetAudience: 'industrial clients',
        tone: 'professional'
      };

      const content = await openaiService.generateMarketingContent(campaignData);

      expect(content).toBeDefined();
      expect(typeof content).toBe('string');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Document Processing', () => {
    test('should summarize long documents', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Summary: Long-term supply agreement for oxygen cylinders with Gazprom LLC, including delivery schedules and payment terms.'
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const longDocument = 'A'.repeat(5000) + ' This is a contract for oxygen cylinder supply.';

      const summary = await openaiService.summarizeDocument(longDocument);

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeLessThan(longDocument.length);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    test('should extract key information from documents', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              clientName: 'Gazprom LLC',
              products: ['Oxygen Cylinder 40L'],
              quantities: [20],
              totalAmount: 70000,
              deliveryDate: '2024-03-15'
            })
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const document = 'Order from Gazprom LLC for 20 Oxygen Cylinders 40L, total 70000 rubles, delivery March 15, 2024';

      const extracted = await openaiService.extractKeyInformation(document);

      expect(extracted).toHaveProperty('clientName');
      expect(extracted).toHaveProperty('products');
      expect(extracted.clientName).toBe('Gazprom LLC');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    test('should handle API rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(rateLimitError);

      const clientData = { name: 'Test Client' };
      const products = [{ name: 'Test Product', quantity: 1 }];

      await expect(
        openaiService.generateProposal(clientData, products)
      ).rejects.toThrow('Rate limit exceeded');
    });

    test('should handle invalid API key errors', async () => {
      const authError = new Error('Invalid API key');
      authError.status = 401;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(authError);

      const emailData = { type: 'test', clientName: 'Test' };

      await expect(
        openaiService.generateEmailTemplate(emailData)
      ).rejects.toThrow('Invalid API key');
    });

    test('should handle malformed responses gracefully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'invalid json {'
          }
        }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const communications = ['test message'];

      // Should not throw error but return default/fallback response
      const result = await openaiService.analyzeClientSentiment(communications);
      
      expect(result).toBeDefined();
    });

    test('should handle empty or null inputs', async () => {
      await expect(
        openaiService.generateProposal(null, [])
      ).not.toThrow();

      await expect(
        openaiService.generateEmailTemplate({})
      ).not.toThrow();

      await expect(
        openaiService.summarizeDocument('')
      ).not.toThrow();
    });
  });

  describe('Configuration and Settings', () => {
    test('should use correct model and parameters', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Test response' } }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      await openaiService.generateProposal({ name: 'Test' }, []);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          temperature: expect.any(Number),
          max_tokens: expect.any(Number)
        })
      );
    });

    test('should handle different model configurations', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Creative response' } }]
      };
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      // Test with creative settings for marketing content
      await openaiService.generateMarketingContent({ type: 'creative' });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });
});
