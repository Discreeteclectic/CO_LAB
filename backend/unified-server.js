const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8080;

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Proxy API requests to backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:5001',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error' });
  }
}));

// Proxy health endpoint
app.use('/health', createProxyMiddleware({
  target: 'http://localhost:5001',
  changeOrigin: true
}));

// Fallback to index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/simple-login.html'));
});

app.listen(PORT, () => {
  console.log(`Unified server running on http://localhost:${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`API Proxy: http://localhost:${PORT}/api`);
  console.log(`\nOpen http://localhost:${PORT}/simple-login.html in Safari`);
});