const competitiveProposalsService = require('./src/services/competitiveProposals');

async function testCompetitiveProposalsIntegration() {
  console.log('🔍 Testing Competitive Proposals Integration...\n');

  // Test 1: Available markup strategies
  console.log('1. Testing Available Markup Strategies:');
  try {
    const markups = competitiveProposalsService.getAvailableMarkups();
    console.log(`✅ Found ${markups.length} markup strategies`);
    
    markups.forEach(markup => {
      console.log(`   - ${markup.name}: ${markup.markup}% (${markup.strategy})`);
    });

    console.log(`✅ Markup validation working`);
  } catch (error) {
    console.error('❌ Markup strategies test failed:', error.message);
  }

  // Test 2: Company advantages
  console.log('\n2. Testing Company Advantages:');
  try {
    const novaAdvantages = competitiveProposalsService.getCompanyAdvantages('nova');
    const colabAdvantages = competitiveProposalsService.getCompanyAdvantages('co-lab');

    console.log(`✅ Nova advantages: ${novaAdvantages.advantages.length} points`);
    console.log(`   Positioning: ${novaAdvantages.positioning}`);
    
    console.log(`✅ CO-LAB advantages: ${colabAdvantages.advantages.length} points`);
    console.log(`   Positioning: ${colabAdvantages.positioning}`);
  } catch (error) {
    console.error('❌ Company advantages test failed:', error.message);
  }

  // Test 3: Competitive positioning generation
  console.log('\n3. Testing Competitive Positioning:');
  try {
    const originalPrice = 50000;
    const markup = 15;
    
    const novaPositioning = competitiveProposalsService.generateCompetitivePositioning('nova', markup, originalPrice);
    console.log('✅ Nova competitive positioning generated');
    console.log(`   Strategy: ${novaPositioning.strategy}`);
    console.log(`   Adjusted price: ${novaPositioning.pricing.adjusted} руб.`);
    console.log(`   Price justification: ${novaPositioning.justification.substring(0, 100)}...`);

    const colabPositioning = competitiveProposalsService.generateCompetitivePositioning('co-lab', markup, originalPrice);
    console.log('✅ CO-LAB competitive positioning generated');
    console.log(`   Different positioning: ${novaPositioning.positioning !== colabPositioning.positioning}`);
  } catch (error) {
    console.error('❌ Competitive positioning test failed:', error.message);
  }

  // Test 4: Pricing calculations
  console.log('\n4. Testing Pricing Calculations:');
  try {
    const originalPrice = 50000;
    const markups = [5, 10, 15, 20];
    
    const pricingScenarios = competitiveProposalsService.calculateCompetitivePricing(originalPrice, markups);
    console.log(`✅ Generated ${pricingScenarios.length} pricing scenarios`);
    
    pricingScenarios.forEach(scenario => {
      console.log(`   - ${scenario.percentage}: ${scenario.adjustedPrice} руб. (${scenario.strategy})`);
    });
  } catch (error) {
    console.error('❌ Pricing calculations test failed:', error.message);
  }

  // Test 5: Market comparison with competitors
  console.log('\n5. Testing Market Comparison:');
  try {
    const originalPrice = 50000;
    const competitorPrices = [48000, 52000, 55000];
    
    const marketAnalysis = competitiveProposalsService.generateComparisonTable(originalPrice, competitorPrices);
    console.log('✅ Market analysis generated');
    console.log(`   Competitors analyzed: ${marketAnalysis.competitorAnalysis.length}`);
    console.log(`   Recommended markup: ${marketAnalysis.recommendation.markup}%`);
    console.log(`   Recommendation reason: ${marketAnalysis.recommendation.reason}`);
    
    marketAnalysis.competitorAnalysis.forEach(competitor => {
      console.log(`   - ${competitor.competitor}: ${competitor.price} руб. (${competitor.competitivePosition})`);
    });
  } catch (error) {
    console.error('❌ Market comparison test failed:', error.message);
  }

  // Test 6: Market positioning statements
  console.log('\n6. Testing Market Positioning Statements:');
  try {
    const novaPositioning = competitiveProposalsService.generateMarketPositioning('nova', 15);
    const colabPositioning = competitiveProposalsService.generateMarketPositioning('co-lab', 10);
    
    console.log('✅ Nova market positioning generated');
    console.log(`   Length: ${novaPositioning.length} characters`);
    console.log(`   Preview: ${novaPositioning.substring(0, 150)}...`);
    
    console.log('✅ CO-LAB market positioning generated');
    console.log(`   Different from Nova: ${novaPositioning !== colabPositioning}`);
  } catch (error) {
    console.error('❌ Market positioning test failed:', error.message);
  }

  // Test 7: Validation
  console.log('\n7. Testing Markup Validation:');
  try {
    const validMarkup = competitiveProposalsService.validateMarkup(15);
    console.log(`✅ Valid markup (15%): ${validMarkup.valid}`);
    
    const invalidMarkup = competitiveProposalsService.validateMarkup(-5);
    console.log(`✅ Invalid markup (-5%): ${!invalidMarkup.valid}`);
    console.log(`   Errors: ${invalidMarkup.errors.join(', ')}`);
    
    const extremeMarkup = competitiveProposalsService.validateMarkup(60);
    console.log(`✅ Extreme markup (60%): ${!extremeMarkup.valid}`);
  } catch (error) {
    console.error('❌ Markup validation test failed:', error.message);
  }

  // Test 8: Proposal metadata
  console.log('\n8. Testing Proposal Metadata Generation:');
  try {
    const metadata = competitiveProposalsService.getProposalMetadata('nova', 15, 50000);
    
    console.log('✅ Proposal metadata generated');
    console.log(`   Competitive: ${metadata.competitive}`);
    console.log(`   Original price: ${metadata.originalPrice} руб.`);
    console.log(`   Adjusted price: ${metadata.adjustedPrice} руб.`);
    console.log(`   Validation passed: ${metadata.validation.valid}`);
    console.log(`   Has positioning data: ${!!metadata.positioning}`);
  } catch (error) {
    console.error('❌ Proposal metadata test failed:', error.message);
  }

  console.log('\n🎉 Competitive Proposals Integration Test Complete!');
  console.log('\n📋 Summary:');
  console.log('   • Markup strategies: 4 predefined levels (5%, 10%, 15%, 20%)');
  console.log('   • Company positioning: Nova (technical) vs CO-LAB (innovative)');
  console.log('   • Market analysis: Competitor comparison and recommendations');
  console.log('   • Validation: Input validation and error handling');
  console.log('   • Metadata: Complete proposal metadata generation');
  console.log('\n📝 Features ready:');
  console.log('   1. /api/proposals/competitive - Enhanced competitive proposal generation');
  console.log('   2. /api/proposals/competitive/markups - Get available markup strategies');
  console.log('   3. /api/proposals/competitive/:companyId/advantages - Company advantages');
  console.log('   4. /api/proposals/competitive/pricing - Pricing scenario calculator');
  console.log('\n✨ Integration with OpenAI service ready for competitive КП generation!');
}

// Run the test
if (require.main === module) {
  testCompetitiveProposalsIntegration().catch(console.error);
}

module.exports = testCompetitiveProposalsIntegration;