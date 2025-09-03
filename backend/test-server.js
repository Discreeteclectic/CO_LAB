const express = require('express');
const cors = require('cors');
const app = express();

// Simple CORS that works with Safari
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log(`[CORS] Request from origin: ${origin}, method: ${req.method}`);
  
  // Set CORS headers for all requests
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'X-Request-ID');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Handling OPTIONS preflight');
    return res.sendStatus(200);
  }
  
  next();
});

app.use(express.json());

// Test endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', (req, res) => {
  console.log('Login request:', req.body);
  const { email, password } = req.body;
  
  if (email === 'test@test.com' && password === 'password123') {
    res.json({
      message: 'Login successful',
      user: { id: '123', email, name: 'Test User' },
      token: 'test-token-123'
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

const PORT = 5002;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Login endpoint: http://localhost:${PORT}/api/auth/login`);
});