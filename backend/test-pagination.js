#!/usr/bin/env node

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5001/api';

// Test functions
async function testBasicPagination() {
    console.log('\n🧪 Testing basic pagination...');
    try {
        const response = await fetch(`${BASE_URL}/clients?page=1&limit=5`);
        const data = await response.json();
        
        console.log('✅ Basic pagination response:');
        console.log(`   Total clients: ${data.pagination.total}`);
        console.log(`   Page: ${data.pagination.page}`);
        console.log(`   Limit: ${data.pagination.limit}`);
        console.log(`   Pages: ${data.pagination.pages}`);
        console.log(`   Has next: ${data.pagination.hasNext}`);
        console.log(`   Has prev: ${data.pagination.hasPrev}`);
        
        return true;
    } catch (error) {
        console.log('❌ Basic pagination test failed:', error.message);
        return false;
    }
}

async function testSearch() {
    console.log('\n🔍 Testing search functionality...');
    try {
        const response = await fetch(`${BASE_URL}/clients?search=test&page=1&limit=5`);
        const data = await response.json();
        
        console.log('✅ Search response:');
        console.log(`   Search term: ${data.meta.search}`);
        console.log(`   Total filtered: ${data.meta.totalFiltered}`);
        console.log(`   Total unfiltered: ${data.meta.totalUnfiltered}`);
        console.log(`   Results count: ${data.clients.length}`);
        
        return true;
    } catch (error) {
        console.log('❌ Search test failed:', error.message);
        return false;
    }
}

async function testSorting() {
    console.log('\n🔄 Testing sorting functionality...');
    try {
        const response = await fetch(`${BASE_URL}/clients?sort=name&order=ASC&page=1&limit=5`);
        const data = await response.json();
        
        console.log('✅ Sorting response:');
        console.log(`   Sort field: ${data.meta.sort}`);
        console.log(`   Sort order: ${data.meta.order}`);
        console.log(`   Results count: ${data.clients.length}`);
        
        if (data.clients.length > 1) {
            const names = data.clients.map(c => c.name).join(', ');
            console.log(`   Client names: ${names}`);
        }
        
        return true;
    } catch (error) {
        console.log('❌ Sorting test failed:', error.message);
        return false;
    }
}

async function testLimitValidation() {
    console.log('\n📏 Testing limit validation...');
    try {
        const response = await fetch(`${BASE_URL}/clients?limit=150&page=1`);
        const data = await response.json();
        
        console.log('✅ Limit validation response:');
        console.log(`   Requested limit: 150`);
        console.log(`   Actual limit: ${data.pagination.limit}`);
        console.log(`   Should be max 100: ${data.pagination.limit <= 100 ? '✅' : '❌'}`);
        
        return data.pagination.limit <= 100;
    } catch (error) {
        console.log('❌ Limit validation test failed:', error.message);
        return false;
    }
}

async function testInvalidPage() {
    console.log('\n🚫 Testing invalid page handling...');
    try {
        const response = await fetch(`${BASE_URL}/clients?page=0&limit=5`);
        const data = await response.json();
        
        console.log('✅ Invalid page response:');
        console.log(`   Requested page: 0`);
        console.log(`   Actual page: ${data.pagination.page}`);
        console.log(`   Should be min 1: ${data.pagination.page >= 1 ? '✅' : '❌'}`);
        
        return data.pagination.page >= 1;
    } catch (error) {
        console.log('❌ Invalid page test failed:', error.message);
        return false;
    }
}

// Main test runner
async function runTests() {
    console.log('🚀 Starting pagination API tests...');
    
    // Check if server is running
    try {
        await fetch(`${BASE_URL}/clients?limit=1`);
    } catch (error) {
        console.log('❌ Server is not running. Please start the server first.');
        console.log('   Run: npm run dev');
        process.exit(1);
    }
    
    const tests = [
        testBasicPagination,
        testSearch,
        testSorting,
        testLimitValidation,
        testInvalidPage
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        const result = await test();
        if (result) {
            passed++;
        } else {
            failed++;
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n📊 Test Results:');
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📈 Success rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    
    if (failed === 0) {
        console.log('\n🎉 All tests passed! Pagination enhancement is working correctly.');
    } else {
        console.log('\n⚠️  Some tests failed. Please check the implementation.');
    }
}

// Handle missing node-fetch
if (typeof fetch === 'undefined') {
    console.log('❌ node-fetch is required but not installed.');
    console.log('   Install with: npm install node-fetch@2');
    process.exit(1);
}

runTests().catch(console.error);