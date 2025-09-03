const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;

// Путь к файлу для хранения данных
const DATA_FILE = path.join(__dirname, 'data.json');

// Инициализируем пустые массивы для хранения данных
let allUsers = [];
let allOrders = [];
let allProducts = [];
let allClients = [];
let allContracts = [];
let allTransactions = [];
let allCalculations = [];
let allClientHistory = [];
let allContractHistory = [];
let allSerialNumbers = [];
let allWriteOffCategories = [];
let allCostCategories = [];

// Функция сохранения данных в файл
function saveData() {
  const data = {
    users: allUsers,
    clients: allClients,
    products: allProducts,
    orders: allOrders,
    contracts: allContracts,
    transactions: allTransactions,
    calculations: allCalculations,
    clientHistory: allClientHistory,
    contractHistory: allContractHistory,
    serialNumbers: allSerialNumbers,
    writeOffCategories: allWriteOffCategories,
    costCategories: allCostCategories
  };
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('Data saved to file');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Функция загрузки данных из файла
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (data.users) allUsers.splice(0, allUsers.length, ...data.users);
      if (data.clients) allClients.splice(0, allClients.length, ...data.clients);
      if (data.products) allProducts.splice(0, allProducts.length, ...data.products);
      if (data.orders) allOrders.splice(0, allOrders.length, ...data.orders);
      if (data.contracts) allContracts.splice(0, allContracts.length, ...data.contracts);
      if (data.transactions) allTransactions.splice(0, allTransactions.length, ...data.transactions);
      if (data.calculations) allCalculations.splice(0, allCalculations.length, ...data.calculations);
      if (data.clientHistory) allClientHistory.splice(0, allClientHistory.length, ...data.clientHistory);
      if (data.contractHistory) allContractHistory.splice(0, allContractHistory.length, ...data.contractHistory);
      if (data.serialNumbers) allSerialNumbers.splice(0, allSerialNumbers.length, ...data.serialNumbers);
      if (data.writeOffCategories) allWriteOffCategories.splice(0, allWriteOffCategories.length, ...data.writeOffCategories);
      if (data.costCategories) allCostCategories.splice(0, allCostCategories.length, ...data.costCategories);
      console.log('Data loaded from file');
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Загружаем данные сразу после определения функции
loadData();

// Старые статичные данные удалены - теперь используются данные из data.json

// Старые статичные данные удалены

// Старые статичные данные удалены

// Старые статичные данные удалены

const server = http.createServer((req, res) => {
  
  
  // Add CORS headers to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Get single order by ID - MUST BE FIRST to prevent other endpoints from catching it
  if (req.url.match(/^\/api\/orders\/[\w-]+$/) && req.method === 'GET') {
    const orderId = req.url.split('/').pop();
        
    const order = allOrders.find(o => o.id === orderId);
    
    if (order) {
      // Find client data
      const client = allClients.find(c => c.id === order.clientId);
      
      // Enrich items with product data
      const enrichedItems = (order.items || []).map(item => {
        const product = allProducts.find(p => p.id === item.id);
        return {
          ...item,
          product: product ? {
            id: product.id,
            name: product.name,
            unit: product.unit || 'шт',
            sku: product.sku
          } : {
            id: item.id,
            name: 'Товар удален',
            unit: 'шт'
          }
        };
      });
      
      const enrichedOrder = {
        ...order,
        client: client || order.client,
        items: enrichedItems
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(enrichedOrder));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
    }
    return;
  }
  
  // API endpoints
  if (req.url === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        console.log('Login body received:', body);
        const data = JSON.parse(body);
        
        // Проверяем пользователя в базе данных
        const user = allUsers.find(u => 
          u.email === data.email && 
          u.password === data.password && 
          u.status === 'active'
        );
        
        if (user) {
          // Создаем токен на основе ID пользователя и времени
          const token = Buffer.from(`${user.id}-${Date.now()}`).toString('base64');
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            message: 'Login successful',
            user: { 
              id: user.id, 
              email: user.email, 
              name: user.name,
              role: user.role,
              permissions: user.permissions || []
            },
            token: token
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Неверный логин или пароль' }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON data' }));
      }
    });
    return;
  }
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', timestamp: new Date().toISOString() }));
    return;
  }
  
  // Helper function to verify token and get user
  function verifyToken(req) {
    const authHeader = req.headers['authorization'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        // Декодируем токен и получаем ID пользователя
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const userId = decoded.split('-').slice(0, -1).join('-'); // Убираем timestamp, оставляем ID
        
        // Находим пользователя
        const user = allUsers.find(u => u.id === userId && u.status === 'active');
        return user;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  if (req.url === '/api/auth/verify' && req.method === 'GET') {
    const user = verifyToken(req);
    
    if (user) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        valid: true, 
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name,
          role: user.role,
          permissions: user.permissions || []
        }
      }));
      return;
    }
    
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: false, error: 'Invalid token' }));
    return;
  }
  
  // API endpoints for managers
  if (req.url === '/api/managers' && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const managers = allUsers.filter(u => (u.role === 'manager' || u.role === 'admin') && u.status === 'active')
      .map(u => ({ id: u.id, name: u.name, email: u.email, department: u.department, role: u.role }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      managers: managers.length > 0 ? managers : [
        { id: 'user-manager-1', name: 'Виталий' },
        { id: 'user-manager-2', name: 'Ориф' }
      ]
    }));
    return;
  }

  // Update user avatar
  if (req.url.match(/^\/api\/users\/[\w-]+\/avatar$/) && req.method === 'PUT') {
    const userId = req.url.split('/')[3];
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const user = allUsers.find(u => u.id === userId);
        
        if (user) {
          user.avatar = data.avatar;
          saveData();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Avatar updated successfully' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User not found' }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
      }
    });
    return;
  }

  // Delete user avatar
  if (req.url.match(/^\/api\/users\/[\w-]+\/avatar$/) && req.method === 'DELETE') {
    const userId = req.url.split('/')[3];
    const user = allUsers.find(u => u.id === userId);
    
    if (user) {
      user.avatar = null;
      saveData();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Avatar removed successfully' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
    }
    return;
  }

  // Alias for managers API without /api prefix
  if (req.url === '/managers' && req.method === 'GET') {
    const managers = allUsers.filter(u => (u.role === 'manager' || u.role === 'admin') && u.status === 'active')
      .map(u => ({ id: u.id, name: u.name, email: u.email, department: u.department, role: u.role }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      managers: managers.length > 0 ? managers : [
        { id: 'user-manager-1', name: 'Виталий' },
        { id: 'user-manager-2', name: 'Ориф' }
      ]
    }));
    return;
  }

  // Users management endpoints
  if (req.url === '/api/users' && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user || user.role !== 'admin') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin access required' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      users: allUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        department: u.department,
        avatar: u.avatar,
        createdAt: u.createdAt
      }))
    }));
    return;
  }

  if (req.url === '/api/users' && req.method === 'POST') {
    const user = verifyToken(req);
    if (!user || user.role !== 'admin') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin access required' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const userData = JSON.parse(body);
        
        // Check if email already exists
        if (allUsers.find(u => u.email === userData.email)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email уже используется' }));
          return;
        }
        
        const newUser = {
          id: `user-${Date.now()}`,
          email: userData.email,
          password: userData.password,
          name: userData.name,
          role: userData.role,
          status: userData.status || 'active',
          department: userData.department || null,
          avatar: null,
          createdAt: new Date().toISOString(),
          permissions: userData.role === 'admin' ? ['all'] : ['clients', 'orders', 'products', 'calculations', 'warehouse']
        };
        
        allUsers.push(newUser);
        saveData();
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'User created successfully', user: newUser }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
      }
    });
    return;
  }

  if (req.url.match(/^\/api\/users\/[\w-]+$/) && req.method === 'PUT') {
    const userId = req.url.split('/')[3];
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const userData = JSON.parse(body);
        const userIndex = allUsers.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User not found' }));
          return;
        }
        
        // Check if email is being changed and not duplicated
        if (userData.email && userData.email !== allUsers[userIndex].email) {
          if (allUsers.find(u => u.email === userData.email && u.id !== userId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email уже используется' }));
            return;
          }
        }
        
        // Update user data
        allUsers[userIndex] = {
          ...allUsers[userIndex],
          name: userData.name || allUsers[userIndex].name,
          email: userData.email || allUsers[userIndex].email,
          role: userData.role || allUsers[userIndex].role,
          status: userData.status || allUsers[userIndex].status,
          department: userData.department !== undefined ? userData.department : allUsers[userIndex].department,
          password: userData.password || allUsers[userIndex].password,
          permissions: userData.role === 'admin' ? ['all'] : ['clients', 'orders', 'products', 'calculations', 'warehouse']
        };
        
        saveData();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'User updated successfully' }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
      }
    });
    return;
  }

  if (req.url.match(/^\/api\/users\/[\w-]+$/) && req.method === 'DELETE') {
    const userId = req.url.split('/')[3];
    const userIndex = allUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }
    
    allUsers.splice(userIndex, 1);
    saveData();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'User deleted successfully' }));
    return;
  }

  if (req.url.match(/^\/api\/users\/[\w-]+\/status$/) && req.method === 'PUT') {
    const userId = req.url.split('/')[3];
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { status } = JSON.parse(body);
        const user = allUsers.find(u => u.id === userId);
        
        if (user) {
          user.status = status;
          saveData();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Status updated successfully' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User not found' }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
      }
    });
    return;
  }

  if (req.url.match(/^\/api\/users\/[\w-]+\/password$/) && req.method === 'PUT') {
    const userId = req.url.split('/')[3];
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { newPassword } = JSON.parse(body);
        const user = allUsers.find(u => u.id === userId);
        
        if (user) {
          user.password = newPassword;
          saveData();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Password updated successfully' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User not found' }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
      }
    });
    return;
  }
  
  // Mock clients endpoint
  // Handle GET for client history (must be before single client endpoint)
  if (req.url.match(/^\/api\/clients\/\d+\/history$/) && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const clientId = req.url.split('/')[3]; // /api/clients/ID/history -> ['', 'api', 'clients', 'ID', 'history']
    console.log(`Getting history for client: ${clientId}`);
    console.log(`Total history records: ${allClientHistory.length}`);
    
    const history = allClientHistory.filter(h => h.clientId === clientId)
                                 .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log(`Found ${history.length} history records for client ${clientId}`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history }));
    return;
  }

  // Handle GET for single client by ID
  if (req.url.match(/^\/api\/clients\/\d+$/) && req.method === 'GET') {
    const clientId = req.url.split('/').pop();
    const client = allClients.find(c => c.id === clientId);
    
    if (client) {
      // Add calculation count for single client too
      const calculationCount = allCalculations.filter(calc => 
        calc.organizationINN === client.inn
      ).length;
      
      const clientWithCount = {
        ...client,
        calculationCount: calculationCount
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(clientWithCount));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Client not found' }));
    }
    return;
  }

  // Handle GET for all clients with pagination and search
  if (req.url.includes('/api/clients') && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const searchTerm = url.searchParams.get('search') || '';
    
    
    // Filter clients based on search term
    let filteredClients = allClients;
    if (searchTerm) {
      const search = searchTerm.toLowerCase().replace(/[\s\-\(\)]/g, ''); // Remove spaces, dashes, parentheses for phone/INN search
      filteredClients = allClients.filter(client => {
        // Normalize phone and INN for comparison
        const normalizedPhone = client.phone ? client.phone.toLowerCase().replace(/[\s\-\(\)\+]/g, '') : '';
        const normalizedInn = client.inn ? client.inn.toLowerCase().replace(/[\s\-]/g, '') : '';
        
        const matches = (
          (client.name && client.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (client.inn && (client.inn.includes(searchTerm) || normalizedInn.includes(search))) ||
          (client.phone && (normalizedPhone.includes(search))) ||
          (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (client.telegram && client.telegram.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (client.contactPerson && client.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (client.code && client.code.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        
        if (matches) {
        }
        
        return matches;
      });
    }
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedClients = filteredClients.slice(startIndex, endIndex);
    
    // Add calculation counts for each client
    const clientsWithCounts = paginatedClients.map(client => {
      // Count calculations by matching client INN with calculation organizationINN
      const calculationCount = allCalculations.filter(calc => 
        calc.organizationINN === client.inn
      ).length;
      
      // Debug logging
      console.log(`Client: ${client.name}, INN: "${client.inn}", Calculation count: ${calculationCount}`);
      if (client.name === 'Рога и копыта') {
        console.log('Calculations for Рога и копыта:', allCalculations.map(c => ({
          name: c.name,
          orgINN: c.organizationINN,
          orgName: c.organizationName
        })));
      }
      
      return {
        ...client,
        calculationCount: calculationCount
      };
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      clients: clientsWithCounts,
      pagination: {
        page: page,
        limit: limit,
        total: filteredClients.length,
        totalPages: Math.ceil(filteredClients.length / limit)
      },
      meta: {
        totalCount: filteredClients.length
      }
    }));
    return;
  }
  
  // Handle POST for new clients
  if (req.url === '/api/clients' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const newClient = {
          id: Date.now().toString(),
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        allClients.push(newClient);
        saveData();
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newClient));
      } catch (error) {
        console.error('Error creating client:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create client' }));
      }
    });
    return;
  }
  
  // Handle PUT for updating clients
  if (req.url.match(/^\/api\/clients\/\d+$/) && req.method === 'PUT') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const clientId = req.url.split('/').pop();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const clientIndex = allClients.findIndex(c => c.id === clientId);
      
      if (clientIndex !== -1) {
        const oldClient = { ...allClients[clientIndex] };
        const newClient = {
          ...oldClient,
          ...data,
          id: clientId,
          updatedAt: new Date().toISOString()
        };
        
        // Логируем изменения
        const changes = [];
        const fields = ['name', 'inn', 'contactPerson', 'position', 'phone', 'email', 'telegram'];
        const fieldNames = {
          name: 'Название',
          inn: 'ИНН', 
          contactPerson: 'Контактное лицо',
          position: 'Должность',
          phone: 'Телефон',
          email: 'Email',
          telegram: 'Telegram'
        };
        
        fields.forEach(field => {
          const oldValue = oldClient[field] || '';
          const newValue = newClient[field] || '';
          if (oldValue !== newValue) {
            changes.push({
              field: fieldNames[field],
              oldValue: oldValue,
              newValue: newValue
            });
          }
        });
        
        if (changes.length > 0) {
          // Добавляем запись в историю
          allClientHistory.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            clientId: clientId,
            clientName: oldClient.name,
            action: 'UPDATE',
            changes: changes,
            changedBy: user.name,
            changedByUserId: user.id,
            createdAt: new Date().toISOString()
          });
          
          console.log(`Client history: ${user.name} updated ${oldClient.name}:`, changes);
        }
        
        allClients[clientIndex] = newClient;
        saveData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(allClients[clientIndex]));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Client not found' }));
      }
    });
    return;
  }
  

  // Handle DELETE for removing clients
  if (req.url.match(/^\/api\/clients\/\d+$/) && req.method === 'DELETE') {
    const clientId = req.url.split('/').pop();
    const clientIndex = allClients.findIndex(c => c.id === clientId);
    
    if (clientIndex !== -1) {
      const deletedClient = allClients.splice(clientIndex, 1)[0];
      saveData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Client deleted successfully', client: deletedClient }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Client not found' }));
    }
    return;
  }
  
  // Calculate warehouse stats from allProducts array (must be BEFORE general warehouse endpoint)
  if (req.url === '/api/warehouse/stats') {
    const totalProducts = allProducts.length;
    const totalQuantity = allProducts.reduce((sum, product) => sum + (product.quantity || 0), 0);
    const lowStockCount = allProducts.filter(product => product.quantity <= product.minQuantity).length;
    const totalValue = allProducts.reduce((sum, product) => sum + (product.quantity * product.price), 0);
    const uniqueCategories = new Set(allProducts.map(product => product.category));
    const categories = uniqueCategories.size;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      totalProducts: totalProducts,
      totalQuantity: totalQuantity,
      lowStockCount: lowStockCount,
      totalValue: totalValue,
      categories: categories
    }));
    return;
  }
  
  // Mock warehouse endpoint (for order creation) - use real products data
  if (req.url.includes('/api/warehouse') && req.method === 'GET') {
    // Use actual products from allProducts array, only items with quantity > 0
    const warehouseItems = allProducts.filter(product => product.quantity > 0);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      items: warehouseItems,
      total: warehouseItems.length
    }));
    return;
  }

  // Mock warehouse/products endpoint
  // Handle GET for product-specific transactions (MUST BE BEFORE general products endpoint)
  if (req.url.match(/^\/api\/products\/[\w-]+\/transactions/) && req.method === 'GET') {
    const productId = req.url.split('/')[3];
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    
    console.log(`Getting transactions for product: ${productId}`);
    
    // Filter transactions for specific product (ensure string comparison)
    const productTransactions = allTransactions.filter(t => String(t.productId) === String(productId));
    
    console.log(`Found ${productTransactions.length} transactions for product ${productId}`);
    
    // Sort by date (newest first)
    productTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Limit results
    const limitedTransactions = productTransactions.slice(0, limit);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      transactions: limitedTransactions,
      total: productTransactions.length
    }));
    return;
  }
  
  // Handle GET for single product by ID
  if (req.url.match(/^\/api\/products\/[\w-]+$/) && req.method === 'GET') {
    const productId = req.url.split('/').pop();
    const product = allProducts.find(p => p.id === productId);
    
    if (product) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(product));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Product not found' }));
    }
    return;
  }

  // Handle GET for serial numbers by product ID
  if (req.url.match(/^\/api\/serial-numbers\/product\/[\w-]+$/) && req.method === 'GET') {
    const productId = req.url.split('/').pop();
    
    // Фильтруем номера баллонов по ID товара
    const productSerialNumbers = allSerialNumbers.filter(sn => sn.productId === productId);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      serialNumbers: productSerialNumbers,
      total: productSerialNumbers.length 
    }));
    return;
  }

  // Handle GET for products list (but NOT product-specific endpoints like /api/products/123/transactions)
  if (req.url.match(/^\/api\/products(\?|$)/) && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    
    // Use global allProducts array
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedProducts = allProducts.slice(startIndex, endIndex);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      products: paginatedProducts,
      suppliers: ['Поставщик 1', 'Поставщик 2', 'Поставщик 3'],
      stockStats: {
        totalItems: allProducts.length,
        lowStock: 1,
        outOfStock: 0,
        totalValue: 890000
      },
      pagination: {
        page: page,
        limit: limit,
        total: allProducts.length,
        totalPages: Math.ceil(allProducts.length / limit)
      },
      meta: {
        totalCount: allProducts.length
      }
    }));
    return;
  }

  // Handle GET for all transactions
  if (req.url.includes('/api/transactions') && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const type = url.searchParams.get('type');
    
    let filteredTransactions = allTransactions;
    
    // Filter by type if specified
    if (type) {
      filteredTransactions = allTransactions.filter(t => t.type === type);
    }
    
    // Sort by date (newest first)
    filteredTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      transactions: paginatedTransactions,
      pagination: {
        page: page,
        limit: limit,
        total: filteredTransactions.length,
        totalPages: Math.ceil(filteredTransactions.length / limit)
      }
    }));
    return;
  }

  // Handle POST for warehouse transactions/operations
  if (req.url === '/api/transactions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const transactionData = JSON.parse(body);
        
        // Find the product
        const product = allProducts.find(p => p.id === transactionData.productId);
        if (!product) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Product not found' }));
          return;
        }
        
        const oldQuantity = product.quantity || 0;
        let newQuantity = oldQuantity;
        
        // Update product quantity based on operation type
        if (transactionData.type === 'INCOMING') {
          newQuantity = oldQuantity + (transactionData.quantity || 0);
        } else if (transactionData.type === 'OUTGOING') {
          newQuantity = Math.max(0, oldQuantity - (transactionData.quantity || 0));
        } else if (transactionData.type === 'INVENTORY') {
          newQuantity = transactionData.quantity || 0;
        }
        
        // Update product
        product.quantity = newQuantity;
        product.updatedAt = new Date().toISOString();
        
        // Create transaction record
        const transaction = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          type: transactionData.type,
          productId: transactionData.productId,
          productName: product.name,
          quantity: transactionData.type === 'INCOMING' ? transactionData.quantity : 
                   transactionData.type === 'OUTGOING' ? -transactionData.quantity :
                   transactionData.quantity - oldQuantity,
          oldQuantity: oldQuantity,
          newQuantity: newQuantity,
          reason: transactionData.reason || '',
          writeOffCategory: transactionData.writeOffCategory || '', // Категория списания
          clientId: transactionData.clientId || null,
          createdAt: new Date().toISOString(),
          createdBy: transactionData.createdBy || 'Пользователь'
        };
        
        // Добавляем информацию о номерах баллонов если она есть
        if (transactionData.cylinderNumbers && Array.isArray(transactionData.cylinderNumbers)) {
          transaction.cylinderNumbers = transactionData.cylinderNumbers;
        }
        
        if (transactionData.missingCylinderNumbers && Array.isArray(transactionData.missingCylinderNumbers)) {
          transaction.missingCylinderNumbers = transactionData.missingCylinderNumbers;
        }
        
        allTransactions.push(transaction);
        
        // Update serial numbers status for INVENTORY operations
        if (transactionData.type === 'INVENTORY' && transactionData.missingCylinderNumbers && Array.isArray(transactionData.missingCylinderNumbers)) {
          transactionData.missingCylinderNumbers.forEach(cylinderNumber => {
            if (cylinderNumber && cylinderNumber.trim()) {
              const serialNumberRecord = allSerialNumbers.find(sn => 
                sn.serialNumber === cylinderNumber.trim() && sn.productId === transactionData.productId
              );
              if (serialNumberRecord) {
                serialNumberRecord.status = 'lost';
                serialNumberRecord.updatedAt = new Date().toISOString();
              }
            }
          });
        }
        
        // Save data
        saveData();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Transaction created successfully',
          transaction: transaction,
          product: product
        }));
      } catch (error) {
        console.error('Error creating transaction:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create transaction' }));
      }
    });
    return;
  }
  
  // Handle POST for creating serial numbers
  if (req.url === '/api/serial-numbers' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.productId || !data.serialNumbers || !Array.isArray(data.serialNumbers)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid data format' }));
          return;
        }
        
        // Создаем новые номера баллонов
        const newSerialNumbers = data.serialNumbers.map(sn => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          productId: data.productId,
          serialNumber: sn.serialNumber,
          manufactureDate: sn.manufactureDate || null,
          certificationDate: sn.certificationDate || null,
          nextCertificationDate: sn.nextCertificationDate || null,
          status: 'active', // active, damaged, lost
          createdAt: new Date().toISOString(),
          createdBy: 'System'
        }));
        
        // Добавляем в массив
        allSerialNumbers.push(...newSerialNumbers);
        saveData();
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Serial numbers created successfully',
          serialNumbers: newSerialNumbers
        }));
        
      } catch (error) {
        console.error('Error creating serial numbers:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create serial numbers' }));
      }
    });
    return;
  }
  
  // Handle PUT for updating serial numbers status
  if (req.url === '/api/serial-numbers/status' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.serialNumbers || !Array.isArray(data.serialNumbers) || !data.status) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid data format' }));
          return;
        }
        
        // Обновляем статус номеров баллонов
        let updated = 0;
        data.serialNumbers.forEach(serialNumber => {
          const serialNumberRecord = allSerialNumbers.find(sn => sn.serialNumber === serialNumber);
          if (serialNumberRecord) {
            serialNumberRecord.status = data.status;
            serialNumberRecord.updatedAt = new Date().toISOString();
            updated++;
          }
        });
        
        if (updated > 0) {
          saveData();
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: `Updated ${updated} serial numbers`,
          updated: updated
        }));
        
      } catch (error) {
        console.error('Error updating serial numbers status:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update serial numbers status' }));
      }
    });
    return;
  }
  
  // Handle POST for new products
  if (req.url === '/api/products' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      
      // Create new product with generated ID
      const newProduct = {
        id: Date.now().toString(),
        name: data.name,
        sku: data.sku || `SKU${Date.now()}`,
        price: parseFloat(data.price) || 0,
        purchasePrice: parseFloat(data.purchasePrice) || 0,
        quantity: parseInt(data.quantity) || 0,
        minQuantity: parseInt(data.minQuantity) || 0,
        supplier: data.supplier || '',
        category: data.category || '',
        description: data.description || '',
        location: data.location || '',
        status: 'active',
        unit: data.unit || 'шт',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Add new product to global array
      allProducts.push(newProduct);
      saveData();
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newProduct));
    });
    return;
  }
  
  // Handle PUT for updating products
  if (req.url.match(/^\/api\/products\/[\w-]+$/) && req.method === 'PUT') {
    const productId = req.url.split('/').pop();
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        // Find product index in the global array
        const productIndex = allProducts.findIndex(p => p.id === productId);
        
        if (productIndex !== -1) {
          // Update the product
          const existingProduct = allProducts[productIndex];
          const updatedProduct = {
            ...existingProduct,
            name: data.name || existingProduct.name,
            sku: data.sku || existingProduct.sku,
            price: data.price !== undefined ? parseFloat(data.price) : existingProduct.price,
            purchasePrice: data.purchasePrice !== undefined ? parseFloat(data.purchasePrice) : existingProduct.purchasePrice,
            quantity: data.quantity !== undefined ? parseInt(data.quantity) : existingProduct.quantity,
            minQuantity: data.minQuantity !== undefined ? parseInt(data.minQuantity) : existingProduct.minQuantity,
            supplier: data.supplier !== undefined ? data.supplier : existingProduct.supplier,
            category: data.category !== undefined ? data.category : existingProduct.category,
            description: data.description !== undefined ? data.description : existingProduct.description,
            location: data.location !== undefined ? data.location : existingProduct.location,
            unit: data.unit || existingProduct.unit,
            status: data.status || existingProduct.status,
            updatedAt: new Date().toISOString()
          };
          
          allProducts[productIndex] = updatedProduct;
          saveData();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(updatedProduct));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Product not found' }));
        }
      } catch (error) {
        console.error('Error updating product:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update product' }));
      }
    });
    return;
  }
  
  // Handle DELETE for products
  if (req.url.match(/^\/api\/products\/\d+$/) && req.method === 'DELETE') {
    const productId = req.url.split('/').pop();
    
    // Find product index in the global array
    const productIndex = allProducts.findIndex(p => p.id === productId);
    
    if (productIndex !== -1) {
      // Remove product from the array
      const deletedProduct = allProducts.splice(productIndex, 1)[0];
      saveData();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Product deleted successfully', 
        product: deletedProduct 
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Product not found' }));
    }
    return;
  }
  
  // Calculate warehouse stats from allProducts array
  if (req.url === '/api/warehouse/stats') {
    const totalProducts = allProducts.length;
    const lowStockCount = allProducts.filter(product => product.quantity <= product.minQuantity).length;
    const totalValue = allProducts.reduce((sum, product) => sum + (product.quantity * product.price), 0);
    const uniqueCategories = new Set(allProducts.map(product => product.category));
    const categories = uniqueCategories.size;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      totalProducts: totalProducts,
      lowStockCount: lowStockCount,
      totalValue: totalValue,
      categories: categories
    }));
    return;
  }
  
  // Mock orders stats endpoint
  if (req.url === '/api/orders/stats/overview') {
    // Calculate real statistics from allOrders array
    const totalOrders = allOrders.length;
    const activeOrders = allOrders.filter(order => order.status !== 'CLOSED').length;
    const completedOrders = allOrders.filter(order => order.status === 'CLOSED').length;
    const totalAmount = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      totalOrders: totalOrders,
      activeOrders: activeOrders,
      completedOrders: completedOrders,
      totalAmount: totalAmount,
      totalRevenue: totalAmount  // Добавляем поле для совместимости с фронтендом
    }));
    return;
  }
  
  // Handle GET for single order (must come before general orders endpoint)
  if (req.url.match(/^\/api\/orders\/\d+$/) && req.method === 'GET') {
    const orderId = req.url.split('/').pop();
    
    // Find order in the global array
    const order = allOrders.find(o => o.id === orderId);
    
    if (order) {
      // Include client information if available
      if (order.clientId && !order.client) {
        const client = allClients.find(c => c.id === order.clientId);
        if (client) {
          order.client = {
            id: client.id,
            name: client.name,
            phone: client.phone,
            email: client.email
          };
        }
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(order));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
    }
    return;
  }
  
  // Get single order by ID - MUST BE BEFORE general orders endpoint
  if (req.url.match(/^\/api\/orders\/[\w-]+$/) && req.method === 'GET') {
    const orderId = req.url.split('/').pop();
    
    const order = allOrders.find(o => o.id === orderId);
    
    if (order) {
      // Find client data
      const client = allClients.find(c => c.id === order.clientId);
      
      // Enrich items with product data
      const enrichedItems = (order.items || []).map(item => {
        const product = allProducts.find(p => p.id === item.id);
        return {
          ...item,
          product: product ? {
            id: product.id,
            name: product.name,
            unit: product.unit || 'шт',
            sku: product.sku
          } : {
            id: item.id,
            name: 'Товар удален',
            unit: 'шт'
          }
        };
      });
      
      const enrichedOrder = {
        ...order,
        client: client || order.client,
        items: enrichedItems
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(enrichedOrder));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
    }
    return;
  }
  
  // Get pending warehouse orders - MUST BE BEFORE general orders endpoint
  if (req.url === '/api/orders/warehouse/pending' && req.method === 'GET') {
    
    // Get real orders with status PAID, FOR_SHIPMENT_UNPAID or PICKING from allOrders
    const pendingOrders = allOrders.filter(order => 
      order.status === 'PAID' || order.status === 'FOR_SHIPMENT_UNPAID' || order.status === 'PICKING'
    ).map(order => {
      // Find client data
      const client = allClients.find(c => c.id === order.clientId);
      
      // Enrich items with product data
      const enrichedItems = (order.items || []).map(item => {
        const product = allProducts.find(p => p.id === item.id);
        return {
          ...item,
          product: product ? {
            id: product.id,
            name: product.name,
            unit: product.unit || 'шт',
            sku: product.sku
          } : {
            id: item.id,
            name: 'Товар удален',
            unit: 'шт'
          }
        };
      });
      
      return {
        id: order.id,
        number: order.number || order.id,
        orderNumber: order.orderNumber || order.id,
        client: {
          id: client?.id,
          name: client?.name || 'Неизвестный клиент'
        },
        status: order.status,
        totalAmount: order.totalAmount || order.total || 0,
        items: enrichedItems,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });
    
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ orders: pendingOrders }));
    return;
  }
  
  // Mock orders endpoint (exclude single order requests and warehouse/pending)
  if (req.url.includes('/api/orders') && req.method === 'GET' && 
      !req.url.match(/^\/api\/orders\/[\w-]+$/) && 
      !req.url.includes('/api/orders/warehouse/pending')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 10;
    const statusParam = url.searchParams.get('status');
    const excludeClosed = url.searchParams.get('excludeClosed') === 'true';
    const searchTerm = url.searchParams.get('search') || '';
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    
    
    // Filter orders based on parameters
    let filteredOrders = allOrders;
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filteredOrders = filteredOrders.filter(order => {
        // Найдем полные данные клиента по clientId
        const clientData = allClients.find(c => c.id === order.clientId);
        
        return (
          (order.orderNumber && order.orderNumber.toLowerCase().includes(search)) ||
          (order.number && order.number.toLowerCase().includes(search)) ||
          (order.client && order.client.name && order.client.name.toLowerCase().includes(search)) ||
          (order.client && order.client.phone && order.client.phone.toLowerCase().replace(/[\s\-\(\)\+]/g, '').includes(search.replace(/[\s\-\(\)]/g, ''))) ||
          (order.client && order.client.email && order.client.email.toLowerCase().includes(search)) ||
          (order.manager && order.manager.toLowerCase().includes(search)) ||
          (order.totalAmount && order.totalAmount.toString().includes(search)) ||
          (order.total && order.total.toString().includes(search)) ||
          // Поиск по ИНН клиента
          (clientData && clientData.inn && clientData.inn.includes(searchTerm)) ||
          (order.client && order.client.inn && order.client.inn.includes(searchTerm))
        );
      });
    }
    
    // Date filter
    if (dateFrom || dateTo) {
      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        let matches = true;
        
        if (dateFrom) {
          const fromDate = new Date(dateFrom + 'T00:00:00.000Z');
          matches = matches && orderDate >= fromDate;
        }
        
        if (dateTo) {
          const toDate = new Date(dateTo + 'T23:59:59.999Z');
          matches = matches && orderDate <= toDate;
        }
        
        return matches;
      });
    }
    
    if (statusParam) {
      // Filter by specific status
      filteredOrders = filteredOrders.filter(order => order.status === statusParam);
    } else if (excludeClosed) {
      // Exclude closed orders (for active tab)
      filteredOrders = filteredOrders.filter(order => order.status !== 'CLOSED');
    }
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      orders: paginatedOrders,
      pagination: {
        page: page,
        limit: limit,
        total: filteredOrders.length,
        totalPages: Math.ceil(filteredOrders.length / limit)
      },
      meta: {
        totalCount: filteredOrders.length
      }
    }));
    return;
  }
  
  // Get specific order by ID
  if (req.url.match(/^\/api\/orders\/\d+$/) && req.method === 'GET') {
    const orderId = req.url.split('/').pop();
    const order = allOrders.find(o => o.id === orderId);
    
    if (order) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(order));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
    }
    return;
  }

  // Duplicate endpoint removed - now handled before general orders endpoint

  // Handle POST for order shipment
  if (req.url.match(/^\/api\/orders\/[\w-]+\/shipment$/) && req.method === 'POST') {
    const orderId = req.url.split('/')[3];
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const shipmentData = JSON.parse(body);
        
        // Find the order
        const orderIndex = allOrders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Order not found' }));
          return;
        }
        
        const order = allOrders[orderIndex];
        
        // Update order status to SHIPPED
        order.status = 'SHIPPED';
        order.shippedAt = new Date().toISOString();
        order.updatedAt = new Date().toISOString();
        
        // Create structured shipment data with cylinder numbers
        const shipment = {
          ...shipmentData,
          cylinderNumbers: []
        };
        
        // Extract all cylinder numbers with their product associations
        if (shipmentData.items) {
          shipmentData.items.forEach(item => {
            const productId = item.productId || item.id;
            if (item.serialNumbers && item.serialNumbers.length > 0) {
              item.serialNumbers.forEach(cylinderNumber => {
                if (cylinderNumber && cylinderNumber.trim()) {
                  shipment.cylinderNumbers.push({
                    cylinderNumber: cylinderNumber.trim(),
                    productId: productId
                  });
                }
              });
            }
          });
        }
        
        order.shipment = shipment;
        
        // Reduce product quantities in warehouse
        if (shipmentData.items) {
          shipmentData.items.forEach(shipmentItem => {
            // Use productId from shipment data
            const productId = shipmentItem.productId;
            const product = allProducts.find(p => p.id === productId);
            if (product) {
              const oldQuantity = product.quantity || 0;
              product.quantity = Math.max(0, oldQuantity - shipmentItem.quantity);
              product.updatedAt = new Date().toISOString();
              
              // Create transaction record for the shipment
              const transaction = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                type: 'SHIPMENT',
                productId: productId,
                productName: product.name,
                quantity: -shipmentItem.quantity,
                oldQuantity: oldQuantity,
                newQuantity: product.quantity,
                orderId: orderId,
                orderNumber: order.number,
                cylinderNumbers: shipmentItem.serialNumbers || [],
                reason: `Отгрузка по заявке ${order.number}`,
                createdAt: new Date().toISOString(),
                createdBy: 'Система'
              };
              
              allTransactions.push(transaction);
              
              // Update serial numbers status to 'shipped'
              if (shipmentItem.serialNumbers && shipmentItem.serialNumbers.length > 0) {
                shipmentItem.serialNumbers.forEach(serialNumber => {
                  if (serialNumber && serialNumber.trim()) {
                    const serialNumberRecord = allSerialNumbers.find(sn => 
                      sn.serialNumber === serialNumber.trim() && sn.productId === productId
                    );
                    if (serialNumberRecord) {
                      serialNumberRecord.status = 'shipped';
                      serialNumberRecord.updatedAt = new Date().toISOString();
                    }
                  }
                });
              }
            }
          });
        }
        
        // Save data
        saveData();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Shipment created successfully',
          order: order 
        }));
      } catch (error) {
        console.error('Error creating shipment:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create shipment' }));
      }
    });
    return;
  }

  // Handle POST for new orders
  if (req.url === '/api/orders' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      
      // Find client data
      const client = allClients.find(c => c.id === data.clientId);
      
      // Calculate total amount from items
      const totalAmount = data.items ? data.items.reduce((sum, item) => sum + (item.quantity * item.price), 0) : 0;
      
      // Generate new order number based on the last order
      const lastOrderNumber = allOrders.length > 0 
        ? Math.max(...allOrders.map(o => parseInt(o.number) || 0))
        : 0;
      const newOrderNumber = (lastOrderNumber + 1).toString();
      
      const newOrder = {
        id: Date.now().toString(),
        number: newOrderNumber,
        orderNumber: newOrderNumber,
        clientId: data.clientId,
        client: client ? {
          id: client.id,
          name: client.name,
          phone: client.phone,
          email: client.email
        } : null,
        status: 'CREATED',
        manager: data.manager || 'Менеджер 1',
        totalAmount: totalAmount,
        total: totalAmount,
        items: data.items || [],
        itemsCount: data.items ? data.items.length : 0,
        notes: data.notes || null,
        orderDate: data.orderDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Add new order to the global array
      allOrders.push(newOrder);
      saveData();
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newOrder));
    });
    return;
  }
  
  // Handle DELETE for orders
  if (req.url.match(/^\/api\/orders\/\d+$/) && req.method === 'DELETE') {
    const orderId = req.url.split('/').pop();
    
    // Find order index in the global array
    const orderIndex = allOrders.findIndex(o => o.id === orderId);
    
    if (orderIndex !== -1) {
      // Remove order from the array
      const deletedOrder = allOrders.splice(orderIndex, 1)[0];
      saveData();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Order deleted successfully', order: deletedOrder }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
    }
    return;
  }
  
  // Handle PATCH for order status updates
  if (req.url.match(/^\/api\/orders\/\d+\/status$/) && req.method === 'PATCH') {
    const orderId = req.url.split('/')[3];
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      
      // Find order in the global array
      const orderIndex = allOrders.findIndex(o => o.id === orderId);
      
      if (orderIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order not found' }));
        return;
      }
      
      const order = allOrders[orderIndex];
      const newStatus = data.status;
      
      // КРИТИЧЕСКИ ВАЖНО: Запретить перевод в статус SHIPPED без фактической отгрузки
      if (newStatus === 'SHIPPED') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Перевод заявки в статус "Отгружена" возможен только через интерфейс склада с указанием номеров баллонов. Используйте функцию "Отгрузка" в разделе "Заявки на отгрузку" на складе.',
          code: 'SHIPMENT_REQUIRES_WAREHOUSE_INTERFACE'
        }));
        return;
      }
      
      // Update order status for allowed transitions
      allOrders[orderIndex].status = newStatus;
      allOrders[orderIndex].updatedAt = new Date().toISOString();
      saveData();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Order status updated successfully', 
        order: allOrders[orderIndex] 
      }));
    });
    return;
  }
  
  // Handle general PUT for order updates
  if (req.url.match(/^\/api\/orders\/\d+$/) && req.method === 'PUT') {
    const orderId = req.url.split('/')[3];
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        // Find order in the global array
        const orderIndex = allOrders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Order not found' }));
          return;
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Запретить установку статуса SHIPPED через PUT
        if (data.status === 'SHIPPED') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Перевод заявки в статус "Отгружена" возможен только через интерфейс склада с указанием номеров баллонов. Используйте функцию "Отгрузка" в разделе "Заявки на отгрузку" на складе.',
            code: 'SHIPMENT_REQUIRES_WAREHOUSE_INTERFACE'
          }));
          return;
        }
        
        // Update order data (excluding forbidden status changes)
        const currentOrder = allOrders[orderIndex];
        allOrders[orderIndex] = {
          ...currentOrder,
          ...data,
          id: orderId, // Preserve ID
          updatedAt: new Date().toISOString()
        };
        
        saveData();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          message: 'Order updated successfully', 
          order: allOrders[orderIndex] 
        }));
        
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON data' }));
      }
    });
    return;
  }
  
  // Mock contracts endpoint  
  if (req.url.includes('/api/contracts/stats/overview')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      totalActive: 2,
      totalAmount: 445000,
      expiringCount: 0,
      totalContracts: 3
    }));
    return;
  }
  
  // Handle POST for signing contracts
  if (req.url.match(/^\/api\/contracts\/\d+\/sign$/) && req.method === 'POST') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const contractId = req.url.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const contractIndex = allContracts.findIndex(c => c.id === contractId);
      
      if (contractIndex !== -1) {
        const oldContract = { ...allContracts[contractIndex] };
        allContracts[contractIndex] = {
          ...allContracts[contractIndex],
          signedDate: data.signedDate || new Date().toISOString(),
          status: 'ACTIVE',
          updatedAt: new Date().toISOString()
        };
        
        // Добавляем запись в историю о подписании
        allContractHistory.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          contractId: contractId,
          contractNumber: oldContract.contractNumber,
          action: 'SIGN',
          changes: [{
            field: 'Статус',
            oldValue: oldContract.status,
            newValue: 'ACTIVE'
          }],
          changedBy: user.name,
          changedByUserId: user.id,
          createdAt: new Date().toISOString()
        });
        
        saveData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          message: 'Contract signed successfully',
          contract: allContracts[contractIndex]
        }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Contract not found' }));
      }
    });
    return;
  }

  // Handle PUT for updating contracts
  if (req.url.match(/^\/api\/contracts\/\d+$/) && req.method === 'PUT') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const contractId = req.url.split('/').pop();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const contractIndex = allContracts.findIndex(c => c.id === contractId);
      
      if (contractIndex !== -1) {
        const oldContract = { ...allContracts[contractIndex] };
        const newContract = {
          ...oldContract,
          ...data,
          id: contractId,
          updatedAt: new Date().toISOString()
        };
        
        // Логируем изменения
        const changes = [];
        const fields = ['contractNumber', 'contractType', 'totalAmount', 'validFrom', 'validTo', 'description', 'terms', 'conditions', 'responsibleManager', 'autoRenewal', 'status'];
        const fieldNames = {
          contractNumber: 'Номер договора',
          contractType: 'Тип договора', 
          totalAmount: 'Сумма договора',
          validFrom: 'Действует с',
          validTo: 'Действует до',
          description: 'Описание',
          terms: 'Условия',
          conditions: 'Дополнительные условия',
          responsibleManager: 'Ответственный менеджер',
          autoRenewal: 'Автопродление',
          status: 'Статус'
        };
        
        fields.forEach(field => {
          const oldValue = oldContract[field] || '';
          const newValue = newContract[field] || '';
          if (oldValue !== newValue) {
            changes.push({
              field: fieldNames[field],
              oldValue: oldValue,
              newValue: newValue
            });
          }
        });
        
        if (changes.length > 0) {
          // Добавляем запись в историю
          allContractHistory.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            contractId: contractId,
            contractNumber: oldContract.contractNumber,
            action: 'UPDATE',
            changes: changes,
            changedBy: user.name,
            changedByUserId: user.id,
            createdAt: new Date().toISOString()
          });
          
          console.log(`Contract history: ${user.name} updated ${oldContract.contractNumber}:`, changes);
        }
        
        allContracts[contractIndex] = newContract;
        saveData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(allContracts[contractIndex]));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Contract not found' }));
      }
    });
    return;
  }

  // Handle DELETE for removing contracts
  if (req.url.match(/^\/api\/contracts\/\d+$/) && req.method === 'DELETE') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied. Only admins can delete contracts.' }));
      return;
    }

    const contractId = req.url.split('/').pop();
    const contractIndex = allContracts.findIndex(c => c.id === contractId);
    
    if (contractIndex !== -1) {
      const deletedContract = allContracts.splice(contractIndex, 1)[0];
      
      // Добавляем запись в историю об удалении
      allContractHistory.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        contractId: contractId,
        contractNumber: deletedContract.contractNumber,
        action: 'DELETE',
        changes: [{
          field: 'Статус',
          oldValue: deletedContract.status,
          newValue: 'DELETED'
        }],
        changedBy: user.name,
        changedByUserId: user.id,
        createdAt: new Date().toISOString()
      });
      
      saveData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Contract deleted successfully', 
        contract: deletedContract 
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contract not found' }));
    }
    return;
  }

  // Handle GET for contract history (must be before single contract endpoint)
  if (req.url.match(/^\/api\/contracts\/\d+\/history$/) && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const contractId = req.url.split('/')[3]; // /api/contracts/ID/history -> ['', 'api', 'contracts', 'ID', 'history']
    console.log(`Getting history for contract: ${contractId}`);
    console.log(`Total contract history records: ${allContractHistory.length}`);
    
    const history = allContractHistory.filter(h => h.contractId === contractId)
                                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log(`Found ${history.length} history records for contract ${contractId}`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history }));
    return;
  }

  // Handle GET for single contract by ID
  if (req.url.match(/^\/api\/contracts\/\d+$/) && req.method === 'GET') {
    const contractId = req.url.split('/').pop();
    const contract = allContracts.find(c => c.id === contractId);
    
    if (contract) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(contract));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contract not found' }));
    }
    return;
  }
  
  if (req.url.includes('/api/contracts') && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 10;
    const searchTerm = url.searchParams.get('search') || '';
    const statusFilter = url.searchParams.get('status') || '';
    const contractTypeFilter = url.searchParams.get('contractType') || '';
    
    
    // Filter contracts based on search parameters
    let filteredContracts = allContracts;
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filteredContracts = filteredContracts.filter(contract => {
        return (
          (contract.contractNumber && contract.contractNumber.toLowerCase().includes(search)) ||
          (contract.client && contract.client.name && contract.client.name.toLowerCase().includes(search)) ||
          (contract.description && contract.description.toLowerCase().includes(search)) ||
          (contract.client && contract.client.inn && contract.client.inn.includes(searchTerm))
        );
      });
    }
    
    // Status filter
    if (statusFilter) {
      filteredContracts = filteredContracts.filter(contract => 
        contract.status.toUpperCase() === statusFilter.toUpperCase()
      );
    }
    
    // Contract type filter
    if (contractTypeFilter) {
      filteredContracts = filteredContracts.filter(contract => 
        contract.contractType.toUpperCase() === contractTypeFilter.toUpperCase()
      );
    }
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedContracts = filteredContracts.slice(startIndex, endIndex);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      contracts: paginatedContracts,
      pagination: {
        page: page,
        limit: limit,
        total: filteredContracts.length,
        totalPages: Math.ceil(filteredContracts.length / limit)
      },
      meta: {
        totalCount: filteredContracts.length
      },
      clients: [
        {
          id: '1',
          name: 'ООО "Тестовая компания"',
          inn: '1234567890',
          phone: '+7 900 123-45-67',
          email: 'test@company.ru'
        },
        {
          id: '2', 
          name: 'ИП Иванов И.И.',
          inn: '0987654321',
          phone: '+7 900 987-65-43',
          email: 'ivanov@mail.ru'
        },
        {
          id: '3',
          name: 'ООО "Ромашка"',
          inn: '5555666777',
          phone: '+7 900 555-12-34',
          email: 'info@romashka.ru'
        }
      ]
    }));
    return;
  }

  // Handle order calculation endpoints
  if (req.url.match(/^\/api\/orders\/\d+\/calculation$/) && req.method === 'GET') {
    const orderId = req.url.split('/')[3];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ orderId, status: 'no_calculation', message: 'No calculation found' }));
    return;
  }

  if (req.url.match(/^\/api\/orders\/\d+\/create-calculation$/) && req.method === 'POST') {
    const orderId = req.url.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderId, calculationId: Date.now(), message: 'Calculation created' }));
    });
    return;
  }

  if (req.url.match(/^\/api\/orders\/\d+\/send-proposal$/) && req.method === 'POST') {
    const orderId = req.url.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderId, message: 'Proposal sent successfully' }));
    });
    return;
  }

  if (req.url.match(/^\/api\/orders\/\d+\/duplicate-calculation$/) && req.method === 'POST') {
    const orderId = req.url.split('/')[3];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ orderId, calculationId: Date.now(), message: 'Calculation duplicated' }));
    return;
  }

  if (req.url.match(/^\/api\/orders\/\d+\/proposal-response$/) && req.method === 'PUT') {
    const orderId = req.url.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderId, message: 'Proposal response saved' }));
    });
    return;
  }

  if (req.url.match(/^\/api\/contracts\/from-order\/\d+$/) && req.method === 'POST') {
    const orderId = req.url.split('/').pop();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const contractData = JSON.parse(body);
      const newContract = {
        id: Date.now().toString(),
        orderId: orderId,
        contractNumber: `CT-${Date.now()}`,
        ...contractData,
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      allContracts.push(newContract);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ contract: newContract, message: 'Contract created from order' }));
    });
    return;
  }
  
  // Get single calculation (must be before general calculations endpoint)
  if (req.url.match(/^\/api\/calculations\/[\w-]+$/) && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const calcId = req.url.split('/').pop();
    const calculation = allCalculations.find(c => c.id === calcId);
    
    if (!calculation) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Calculation not found' }));
      return;
    }
    
    // Check permissions
    if (user.role !== 'admin' && calculation.createdByUserId !== user.id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Permission denied' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(calculation));
    return;
  }

  // Get all calculations
  if (req.url.includes('/api/calculations') && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const searchTerm = url.searchParams.get('search') || '';
    
    // Filter calculations based on user role
    let filteredCalculations = allCalculations;
    if (user.role !== 'admin') {
      filteredCalculations = allCalculations.filter(calc => calc.responsibleManager === user.id);
    }
    
    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filteredCalculations = filteredCalculations.filter(calc => 
        (calc.productName && calc.productName.toLowerCase().includes(search)) ||
        (calc.organizationName && calc.organizationName.toLowerCase().includes(search)) ||
        (calc.organizationINN && calc.organizationINN.includes(searchTerm))
      );
    }
    
    // Sort by date (newest first)
    filteredCalculations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedCalculations = filteredCalculations.slice(startIndex, endIndex);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      calculations: paginatedCalculations,
      pagination: {
        page,
        limit,
        total: filteredCalculations.length,
        totalPages: Math.ceil(filteredCalculations.length / limit)
      }
    }));
    return;
  }

  // Create new calculation
  if (req.url === '/api/calculations' && req.method === 'POST') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const calculationData = JSON.parse(body);
        
        // Create new calculation
        const newCalculation = {
          id: `calc-${Date.now()}`,
          ...calculationData,
          createdBy: user.name,
          createdByUserId: user.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Calculate profitability
        const totalCost = (calculationData.gasCost || 0) + 
                         (calculationData.cylinderCost || 0) + 
                         (calculationData.preparationCost || 0) +
                         (calculationData.logisticsCost || 0) +
                         (calculationData.workersCost || 0) +
                         (calculationData.kickbacksCost || 0);
        
        const totalSales = (calculationData.pricePerUnit || 0) * (calculationData.quantity || 1);
        const grossProfit = totalSales - totalCost;
        const vatAmount = totalSales * (calculationData.vatPercent || 12) / 100;
        const incomeTaxAmount = totalSales * (calculationData.incomeTaxPercent || 2) / 100;
        const netProfit = grossProfit - vatAmount - incomeTaxAmount;
        const profitabilityPercent = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
        
        newCalculation.totalCost = totalCost;
        newCalculation.totalSales = totalSales;
        newCalculation.grossProfit = grossProfit;
        newCalculation.netProfit = netProfit;
        newCalculation.profitabilityPercent = profitabilityPercent;
        
        allCalculations.push(newCalculation);
        saveData();
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          message: 'Calculation saved successfully',
          calculation: newCalculation
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid calculation data' }));
      }
    });
    return;
  }


  // Delete calculation
  if (req.url.match(/^\/api\/calculations\/[\w-]+$/) && req.method === 'DELETE') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const calcId = req.url.split('/').pop();
    const calcIndex = allCalculations.findIndex(c => c.id === calcId);
    
    if (calcIndex === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Calculation not found' }));
      return;
    }
    
    // Check permissions
    const calculation = allCalculations[calcIndex];
    if (user.role !== 'admin' && calculation.createdByUserId !== user.id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Permission denied' }));
      return;
    }
    
    allCalculations.splice(calcIndex, 1);
    saveData();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Calculation deleted successfully' }));
    return;
  }

  // Profitability analysis endpoint
  if (req.url === '/api/calculations/profitability-analysis' && req.method === 'POST') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        console.log('Profitability analysis body received:', body);
        const data = JSON.parse(body);
        
        // Calculate profitability analysis
        const productCost = data.costs.productCost || 0;
        const deliveryCost = data.costs.deliveryCost || 0;
        const additionalCost = data.costs.additionalCost || 0;
        const quantity = data.sales.quantity || 1;
        const unitPrice = data.sales.unitPrice || 0;
        
        const totalCost = (productCost + deliveryCost + additionalCost) * quantity;
        const totalSaleAmount = unitPrice * quantity;
        const grossProfit = totalSaleAmount - totalCost;
        
        // Calculate taxes
        const vatRate = data.taxes.vatRate || 12;
        const incomeTaxRate = data.taxes.incomeTaxRate || 2;
        
        const vatAmount = (totalSaleAmount * vatRate) / 100;
        const incomeTaxAmount = (totalSaleAmount * incomeTaxRate) / 100;
        
        const netProfit = grossProfit - vatAmount - incomeTaxAmount;
        const profitabilityPercent = totalSaleAmount > 0 ? (netProfit / totalSaleAmount) * 100 : 0;
        
        const analysis = {
          totalCost: totalCost,
          totalCostBreakdown: {
            productCost: productCost * quantity,
            deliveryCost: deliveryCost * quantity,
            additionalCost: additionalCost * quantity
          },
          totalSaleAmount: totalSaleAmount,
          grossProfit: grossProfit,
          grossMargin: totalSaleAmount > 0 ? (grossProfit / totalSaleAmount) * 100 : 0,
          vatAmount: vatAmount,
          incomeTaxAmount: incomeTaxAmount,
          totalTaxes: vatAmount + incomeTaxAmount,
          netProfit: netProfit,
          profitabilityPercent: profitabilityPercent,
          breakEvenPrice: totalCost / quantity + (totalCost / quantity) * (vatRate + incomeTaxRate) / 100
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ analysis }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid calculation data' }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/')) {
    // Default response for other API calls
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', data: [] }));
    return;
  }
  
  // Serve static files
  let filePath = req.url;
  if (filePath === '/') filePath = '/simple-login.html';
  
  // Handle query parameters
  if (filePath.includes('?')) {
    filePath = filePath.split('?')[0];
  }
  
  const fullPath = path.join(__dirname, '../frontend', filePath);
  
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<h1>404 Not Found</h1><p>File not found: ${filePath}</p><p>Available files: simple-login.html, markup_calculator.html, login.html</p>`);
      return;
    }
    
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'application/javascript';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.json') contentType = 'application/json';
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });

  // API endpoints for reference data (справочники)
  if (req.url === '/api/writeoff-categories' && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      writeOffCategories: allWriteOffCategories,
      message: 'Write-off categories retrieved successfully' 
    }));
    return;
  }

  if (req.url === '/api/cost-categories' && req.method === 'GET') {
    const user = verifyToken(req);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      costCategories: allCostCategories,
      message: 'Cost categories retrieved successfully' 
    }));
    return;
  }

});

// Данные уже загружены в начале файла

server.listen(PORT, () => {
  console.log(`
========================================
✅ Simple All-in-One Server Running!
========================================
Open in Safari: http://localhost:${PORT}/simple-login.html

Available Users:
  
  Admin:
    Email: admin@colab.uz
    Password: Admin2024!
  
  Manager 1 (Виталий):
    Email: vitaliy@colab.uz
    Password: Vitaliy2024
  
  Manager 2 (Ориф):
    Email: orif@colab.uz
    Password: Orif2024
========================================
  `);
});