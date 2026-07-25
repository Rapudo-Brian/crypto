const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, prepare, saveDatabase } = require('../database');
const { authenticateToken, generateToken } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  const { username, email, password, country, phone } = req.body;

  if (!username || !email || !password || !country || !phone) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const db = await getDb();
    
    // Check if user exists
    const existingUser = prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const result = prepare(
      'INSERT INTO users (username, email, password, country, phone) VALUES (?, ?, ?, ?, ?)'
    ).run(username, email, hashedPassword, country, phone);

    const token = generateToken({ id: result.lastInsertRowid, username, isAdmin: false });

    res.json({
      success: true,
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        email,
        country,
        phone,
        balance: 0
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const db = await getDb();
    const user = prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (user.account_deleted) {
      return res.json({ 
        deleted: true, 
        message: 'Account deleted. Please contact admin to retrieve your account.',
        userId: user.id
      });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ 
      id: user.id, 
      username: user.username, 
      isAdmin: user.username === 'admin' 
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        country: user.country,
        phone: user.phone,
        balance: user.balance,
        first_deposit: user.first_deposit
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const user = prepare('SELECT id, username, email, country, phone, balance, first_deposit, created_at FROM users WHERE id = ?').get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get recent transactions
    const transactions = prepare(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 10'
    ).all(req.user.id);

    // Get recent trades
    const trades = prepare(
      'SELECT * FROM trades WHERE user_id = ? ORDER BY date DESC LIMIT 10'
    ).all(req.user.id);

    res.json({ user, transactions, trades });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check account status
router.get('/status/:userId', async (req, res) => {
  try {
    const db = await getDb();
    const user = prepare('SELECT id, account_deleted, username FROM users WHERE id = ?').get(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ deleted: user.account_deleted === 1, username: user.username });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;