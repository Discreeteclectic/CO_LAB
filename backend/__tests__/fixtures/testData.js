// Test fixtures for CO-LAB CRM

const testUsers = [
  {
    name: 'Admin User',
    email: 'admin@colab.com',
    password: 'admin123',
    role: 'ADMIN',
    isActive: true
  },
  {
    name: 'Manager User',
    email: 'manager@colab.com', 
    password: 'manager123',
    role: 'MANAGER',
    isActive: true
  },
  {
    name: 'Inactive User',
    email: 'inactive@colab.com',
    password: 'inactive123',
    role: 'MANAGER',
    isActive: false
  }
];

const testClients = [
  {
    name: 'Gazprom LLC',
    email: 'contact@gazprom.ru',
    phone: '+7-495-719-3001',
    address: '16 Nametkina St, Moscow, Russia',
    contactPerson: 'Ivan Petrov',
    notes: 'Major oil and gas company, VIP client'
  },
  {
    name: 'Rosneft JSC',
    email: 'info@rosneft.ru',
    phone: '+7-495-411-5420',
    address: '26/1 Sofiyskaya Emb, Moscow, Russia',
    contactPerson: 'Maria Smirnova',
    notes: 'Oil company, regular orders'
  },
  {
    name: 'Lukoil-Gas ZAO',
    email: 'supply@lukoil.com',
    phone: '+7-495-627-4444',
    address: '11 Sretensky Blvd, Moscow, Russia',
    contactPerson: 'Alexey Kuznetsov',
    notes: 'Gas distribution company'
  }
];

const testProducts = [
  {
    name: 'Oxygen Cylinder 40L',
    description: 'High-pressure oxygen cylinder, 40 liter capacity',
    price: 3500.00,
    unit: 'pcs',
    category: 'cylinders',
    isActive: true
  },
  {
    name: 'Propane Cylinder 50L',
    description: 'Propane gas cylinder, 50 liter capacity',
    price: 4200.00,
    unit: 'pcs',
    category: 'cylinders',
    isActive: true
  },
  {
    name: 'Oxygen Regulator BKO-50',
    description: 'Pressure regulator for oxygen cylinders',
    price: 2800.00,
    unit: 'pcs',
    category: 'regulators',
    isActive: true
  },
  {
    name: 'Gas Hose 9mm',
    description: 'Flexible gas hose, 9mm diameter',
    price: 150.00,
    unit: 'm',
    category: 'hoses',
    isActive: true
  },
  {
    name: 'Cylinder Valve',
    description: 'High-pressure valve for gas cylinders',
    price: 850.00,
    unit: 'pcs',
    category: 'fittings',
    isActive: true
  }
];

const testOrders = [
  {
    status: 'PENDING',
    totalAmount: 85000.00,
    notes: 'Urgent order for oxygen cylinders',
    priority: 'HIGH'
  },
  {
    status: 'PROCESSING',
    totalAmount: 45000.00,
    notes: 'Regular propane cylinder order',
    priority: 'MEDIUM'
  },
  {
    status: 'COMPLETED',
    totalAmount: 67000.00,
    notes: 'Regulators and fittings order',
    priority: 'MEDIUM'
  },
  {
    status: 'CANCELLED',
    totalAmount: 32000.00,
    notes: 'Cancelled by client',
    priority: 'LOW'
  }
];

const testCalculations = [
  {
    clientName: 'Gazprom LLC',
    productName: 'Oxygen Cylinder 40L',
    quantity: 20,
    basePrice: 3500.00,
    
    // Cost breakdown
    gasCostPerUnit: 500.00,
    totalGasCost: 10000.00,
    cylinderCostPerUnit: 1200.00,
    totalCylinderCost: 24000.00,
    preparationCostPerUnit: 200.00,
    totalPreparationCost: 4000.00,
    logisticsCostPerUnit: 300.00,
    totalLogisticsCost: 6000.00,
    workerCostPerUnit: 150.00,
    totalWorkerCost: 3000.00,
    kickbackCostPerUnit: 50.00,
    totalKickbackCost: 1000.00,
    
    // Totals
    totalProductionCost: 48000.00,
    profitMargin: 25.00,
    finalPrice: 70000.00,
    totalProfit: 22000.00,
    profitMarginPercent: 31.43,
    isProfitable: true,
    
    // Tax information
    taxRate: 20.00,
    taxAmount: 14000.00,
    finalPriceWithTax: 84000.00,
    netProfit: 8000.00
  },
  {
    clientName: 'Rosneft JSC',
    productName: 'Propane Cylinder 50L',
    quantity: 15,
    basePrice: 4200.00,
    
    // Cost breakdown
    gasCostPerUnit: 800.00,
    totalGasCost: 12000.00,
    cylinderCostPerUnit: 1500.00,
    totalCylinderCost: 22500.00,
    preparationCostPerUnit: 250.00,
    totalPreparationCost: 3750.00,
    logisticsCostPerUnit: 350.00,
    totalLogisticsCost: 5250.00,
    workerCostPerUnit: 200.00,
    totalWorkerCost: 3000.00,
    kickbackCostPerUnit: 75.00,
    totalKickbackCost: 1125.00,
    
    // Totals
    totalProductionCost: 47625.00,
    profitMargin: 20.00,
    finalPrice: 63000.00,
    totalProfit: 15375.00,
    profitMarginPercent: 24.40,
    isProfitable: true,
    
    // Tax information
    taxRate: 20.00,
    taxAmount: 12600.00,
    finalPriceWithTax: 75600.00,
    netProfit: 2775.00
  }
];

const testNotifications = [
  {
    type: 'ORDER',
    title: 'New Order Created',
    message: 'Order ORD-001 has been created and requires processing',
    priority: 'MEDIUM',
    isRead: false
  },
  {
    type: 'SYSTEM',
    title: 'Low Stock Alert',
    message: 'Oxygen Cylinder 40L stock is running low (5 units remaining)',
    priority: 'HIGH',
    isRead: false
  },
  {
    type: 'REMINDER',
    title: 'Follow-up Call',
    message: 'Schedule follow-up call with Gazprom LLC about proposal',
    priority: 'MEDIUM',
    isRead: true
  }
];

const testContracts = [
  {
    title: 'Oxygen Supply Agreement',
    description: 'Long-term oxygen cylinder supply agreement',
    status: 'ACTIVE',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    totalAmount: 500000.00,
    terms: 'Monthly delivery of 50 oxygen cylinders'
  },
  {
    title: 'Equipment Maintenance Contract',
    description: 'Annual equipment maintenance and support',
    status: 'PENDING',
    startDate: new Date('2024-02-01'),
    endDate: new Date('2025-01-31'),
    totalAmount: 120000.00,
    terms: 'Quarterly maintenance visits and emergency support'
  }
];

const validationTestCases = {
  user: {
    valid: {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      role: 'MANAGER'
    },
    invalid: [
      { name: '', email: 'john@example.com', password: 'password123', role: 'MANAGER' },
      { name: 'John Doe', email: 'invalid-email', password: 'password123', role: 'MANAGER' },
      { name: 'John Doe', email: 'john@example.com', password: '123', role: 'MANAGER' },
      { name: 'John Doe', email: 'john@example.com', password: 'password123', role: 'INVALID' }
    ]
  },
  client: {
    valid: {
      name: 'Test Company',
      email: 'contact@test.com',
      phone: '+1234567890'
    },
    invalid: [
      { name: '', email: 'contact@test.com', phone: '+1234567890' },
      { name: 'Test Company', email: 'invalid-email', phone: '+1234567890' },
      { name: 'Test Company', email: 'contact@test.com', phone: 'invalid-phone' }
    ]
  },
  product: {
    valid: {
      name: 'Test Product',
      price: 100.00,
      unit: 'pcs',
      category: 'test'
    },
    invalid: [
      { name: '', price: 100.00, unit: 'pcs', category: 'test' },
      { name: 'Test Product', price: -10.00, unit: 'pcs', category: 'test' },
      { name: 'Test Product', price: 100.00, unit: '', category: 'test' }
    ]
  }
};

const performanceTestData = {
  bulkUsers: Array.from({ length: 100 }, (_, i) => ({
    name: `User ${i + 1}`,
    email: `user${i + 1}@test.com`,
    password: 'password123',
    role: 'MANAGER',
    isActive: true
  })),
  bulkClients: Array.from({ length: 500 }, (_, i) => ({
    name: `Client Company ${i + 1}`,
    email: `client${i + 1}@test.com`,
    phone: `+1234567${String(i).padStart(3, '0')}`,
    contactPerson: `Contact Person ${i + 1}`
  })),
  bulkOrders: Array.from({ length: 1000 }, (_, i) => ({
    status: ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'][i % 4],
    totalAmount: Math.random() * 100000 + 1000,
    notes: `Test order ${i + 1}`
  }))
};

module.exports = {
  testUsers,
  testClients,
  testProducts,
  testOrders,
  testCalculations,
  testNotifications,
  testContracts,
  validationTestCases,
  performanceTestData
};