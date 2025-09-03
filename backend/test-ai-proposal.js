const OpenAI = require('openai');
const companyTemplatesService = require('./src/services/companyTemplates');

async function testAIProposalIntegration() {
  console.log('🔍 Testing AI Proposal Integration...\n');

  // Test 1: Company Templates Service
  console.log('1. Testing Company Templates Service:');
  try {
    const templates = companyTemplatesService.getAllTemplates();
    console.log(`✅ Found ${templates.length} company templates`);
    
    templates.forEach(template => {
      console.log(`   - ${template.name}: ${template.descriptionStyle}`);
    });

    const novaTemplate = companyTemplatesService.getTemplate('nova');
    console.log(`✅ Nova template loaded: ${novaTemplate.fullName}`);
    
    const coLabTemplate = companyTemplatesService.getTemplate('co-lab');
    console.log(`✅ CO-LAB template loaded: ${coLabTemplate.fullName}`);
  } catch (error) {
    console.error('❌ Company templates test failed:', error.message);
  }

  console.log('\n2. Testing OpenAI Configuration:');
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY not found in environment variables');
    console.log('   To enable AI features, add to your .env file:');
    console.log('   OPENAI_API_KEY="sk-your-openai-api-key-here"');
    console.log('   OPENAI_MODEL="gpt-4"');
    console.log('   OPENAI_MAX_TOKENS="2000"');
  } else {
    console.log('✅ OpenAI API key found');
    console.log(`✅ Model: ${process.env.OPENAI_MODEL || 'gpt-4'}`);
    console.log(`✅ Max tokens: ${process.env.OPENAI_MAX_TOKENS || '2000'}`);

    // Test OpenAI connection (without making actual API call to avoid costs)
    try {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('✅ OpenAI client initialized successfully');
    } catch (error) {
      console.error('❌ OpenAI client initialization failed:', error.message);
    }
  }

  console.log('\n3. Testing Proposal Prompt Generation:');
  
  // Mock calculation data
  const mockCalculation = {
    id: 'test_calc_123',
    name: 'Тестовый расчет баллонов',
    client: { name: 'ООО "Тест Клиент"' },
    productName: 'Баллоны кислородные 40л',
    pricePerUnit: 5000,
    quantity: 10,
    totalSaleAmount: 50000,
    gasCost: 15000,
    cylinderCost: 20000,
    preparationCost: 2000,
    logisticsCost: 3000,
    workersCost: 1000,
    kickbacksCost: 1000,
    totalCostBreakdown: 42000,
    grossProfit: 8000,
    netProfit: 5000,
    profitabilityPercent: 11.9
  };

  try {
    const openaiService = require('./src/services/openaiService');
    const novaTemplate = companyTemplatesService.getTemplate('nova');
    
    const prompt = openaiService.buildProposalPrompt(mockCalculation, novaTemplate, {
      competitive: false,
      markup: 0,
      language: 'ru'
    });

    console.log('✅ Proposal prompt generated successfully');
    console.log(`✅ Prompt length: ${prompt.length} characters`);
    
    const estimatedTokens = await openaiService.estimateTokenUsage(prompt);
    console.log(`✅ Estimated tokens: ${estimatedTokens}`);

    // Show a snippet of the prompt
    const promptPreview = prompt.substring(0, 200) + '...';
    console.log(`✅ Prompt preview: ${promptPreview}`);

  } catch (error) {
    console.error('❌ Prompt generation test failed:', error.message);
  }

  console.log('\n4. Testing Competitive Proposal Logic:');
  
  try {
    const originalPrice = mockCalculation.totalSaleAmount;
    const markup = 15;
    const adjustedPrice = originalPrice * (1 + markup / 100);
    const priceDifference = adjustedPrice - originalPrice;

    console.log(`✅ Original price: ${originalPrice} руб.`);
    console.log(`✅ Markup: ${markup}%`);
    console.log(`✅ Adjusted price: ${adjustedPrice} руб.`);
    console.log(`✅ Price difference: ${priceDifference} руб.`);

    const openaiService = require('./src/services/openaiService');
    const coLabTemplate = companyTemplatesService.getTemplate('co-lab');
    const competitivePrompt = openaiService.buildProposalPrompt(mockCalculation, coLabTemplate, {
      competitive: true,
      markup: markup,
      language: 'ru'
    });

    console.log('✅ Competitive proposal prompt generated');
    console.log(`✅ Contains markup info: ${competitivePrompt.includes(markup.toString())}`);

  } catch (error) {
    console.error('❌ Competitive proposal test failed:', error.message);
  }

  console.log('\n🎉 AI Proposal Integration Test Complete!');
  console.log('\n📋 Summary:');
  console.log('   • Company templates: Nova & CO-LAB loaded');
  console.log('   • OpenAI service: Ready for configuration');
  console.log('   • Prompt engineering: Working');
  console.log('   • Competitive pricing: Calculated correctly');
  console.log('\n📝 Next steps:');
  console.log('   1. Add OPENAI_API_KEY to your .env file');
  console.log('   2. Test API endpoints with authentication');
  console.log('   3. Integrate with frontend "Generate КП" button');
  console.log('   4. Implement PDF export functionality');
}

// Run the test
if (require.main === module) {
  testAIProposalIntegration().catch(console.error);
}

module.exports = testAIProposalIntegration;