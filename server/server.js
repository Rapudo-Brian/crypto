const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// WebSocket connections
const clients = new Map();

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'auth') {
        clients.set(data.userId, ws);
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    for (let [userId, client] of clients.entries()) {
      if (client === ws) {
        clients.delete(userId);
        break;
      }
    }
  });
});

// Make wss and clients accessible
app.set('wss', wss);
app.set('clients', clients);

// Routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const tradeRoutes = require('./routes/trades');
const adminRoutes = require('./routes/admin');
const ratesRoutes = require('./routes/rates');

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rates', ratesRoutes);

// Serve main HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize database and start server
const { initializeDatabase } = require('./database');

async function startServer() {
  await initializeDatabase();
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`CRYPTO server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});