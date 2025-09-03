const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Create a test user and return the user object with JWT token
 */
async function createTestUser(userData = {}) {
  const defaultUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'MANAGER',
    isActive: true
  };

  const user = { ...defaultUser, ...userData };
  
  // Hash password
  const hashedPassword = await bcrypt.hash(user.password, 10);
  
  // Create user in database
  const createdUser = await prisma.user.create({
    data: {
      ...user,
      password: hashedPassword
    }
  });

  // Generate JWT token
  const token = jwt.sign(
    { 
      id: createdUser.id, 
      email: createdUser.email, 
      role: createdUser.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return {
    user: createdUser,
    token,
    password: user.password // Return original password for login tests
  };
}

/**
 * Create a test client
 */
async function createTestClient(clientData = {}) {
  const defaultClient = {
    name: 'Test Company Ltd',
    email: 'contact@testcompany.com',
    phone: '+1234567890',
    address: '123 Test Street',
    contactPerson: 'John Doe',
    notes: 'Test client for automated testing'
  };

  const client = { ...defaultClient, ...clientData };
  
  return await prisma.client.create({
    data: client
  });
}

/**
 * Create a test product
 */
async function createTestProduct(productData = {}) {
  const defaultProduct = {
    name: 'Test Product',
    description: 'A test product for automated testing',
    price: 100.00,
    unit: 'pcs',
    category: 'test',
    isActive: true
  };

  const product = { ...defaultProduct, ...productData };
  
  return await prisma.product.create({
    data: product
  });
}

/**
 * Create a test order
 */
async function createTestOrder(userId, clientId, orderData = {}) {
  const defaultOrder = {
    status: 'PENDING',
    totalAmount: 1000.00,
    notes: 'Test order for automated testing'
  };

  const order = { ...defaultOrder, ...orderData };
  
  return await prisma.order.create({
    data: {
      ...order,
      userId,
      clientId
    }
  });
}

/**
 * Create a test calculation
 */
async function createTestCalculation(userId, calculationData = {}) {
  const defaultCalculation = {
    clientName: 'Test Client',
    productName: 'Test Product',
    quantity: 10,
    basePrice: 100.00,
    
    // Gas costs
    gasCostPerUnit: 5.00,
    totalGasCost: 50.00,
    
    // Cylinder costs  
    cylinderCostPerUnit: 10.00,
    totalCylinderCost: 100.00,
    
    // Preparation costs
    preparationCostPerUnit: 2.00,
    totalPreparationCost: 20.00,
    
    // Logistics costs
    logisticsCostPerUnit: 3.00,
    totalLogisticsCost: 30.00,
    
    // Worker costs
    workerCostPerUnit: 1.00,
    totalWorkerCost: 10.00,
    
    // Kickback costs
    kickbackCostPerUnit: 0.50,
    totalKickbackCost: 5.00,
    
    // Totals
    totalProductionCost: 215.00,
    profitMargin: 20.00,
    finalPrice: 1000.00,
    totalProfit: 785.00,
    
    // Profitability
    profitMarginPercent: 78.50,
    isProfitable: true
  };

  const calculation = { ...defaultCalculation, ...calculationData };
  
  return await prisma.calculation.create({
    data: {
      ...calculation,
      userId
    }
  });
}

/**
 * Create multiple test records
 */
async function createTestData() {
  // Create test user
  const { user, token } = await createTestUser();
  
  // Create test client
  const client = await createTestClient();
  
  // Create test products
  const products = await Promise.all([
    createTestProduct({ name: 'Oxygen Cylinder', category: 'cylinders', price: 150.00 }),
    createTestProduct({ name: 'Pressure Regulator', category: 'regulators', price: 250.00 }),
    createTestProduct({ name: 'Gas Hose', category: 'hoses', price: 50.00 })
  ]);
  
  // Create test orders
  const orders = await Promise.all([
    createTestOrder(user.id, client.id, { status: 'PENDING', totalAmount: 500.00 }),
    createTestOrder(user.id, client.id, { status: 'COMPLETED', totalAmount: 1200.00 }),
    createTestOrder(user.id, client.id, { status: 'PROCESSING', totalAmount: 800.00 })
  ]);
  
  // Create test calculations
  const calculations = await Promise.all([
    createTestCalculation(user.id, { productName: 'Oxygen Cylinder', finalPrice: 150.00 }),
    createTestCalculation(user.id, { productName: 'Pressure Regulator', finalPrice: 250.00 })
  ]);

  return {
    user,
    token,
    client,
    products,
    orders,
    calculations
  };
}

/**
 * Clean all test data
 */
async function cleanTestData() {
  // Order matters due to foreign key constraints
  await prisma.calculation.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Generate authentication headers
 */
function getAuthHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Wait for a specified amount of time
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate mock request object
 */
function mockRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides
  };
}

/**
 * Generate mock response object
 */
function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Generate mock next function
 */
function mockNext() {
  return jest.fn();
}

module.exports = {
  createTestUser,
  createTestClient,
  createTestProduct,
  createTestOrder,
  createTestCalculation,
  createTestData,
  cleanTestData,
  getAuthHeaders,
  delay,
  mockRequest,
  mockResponse,
  mockNext,
  prisma
};