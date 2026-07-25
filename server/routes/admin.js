const express = require('express');
const router = express.Router();
const { getDb, prepare, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

function requireAdmin(req, res, next) {
  if (req.user.username !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Get all users
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const users = prepare(
      'SELECT id, username, email, country, phone, balance, first_deposit, account_deleted, created_at FROM users ORDER BY id DESC'
    ).all();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user details
router.get('/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const transactions = prepare(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC'
    ).all(req.params.userId);

    const trades = prepare(
      'SELECT * FROM trades WHERE user_id = ? ORDER BY date DESC'
    ).all(req.params.userId);

    res.json({ user, transactions, trades });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send trade request to user
router.post('/trade-request/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const activeSession = prepare(
      'SELECT * FROM admin_trade_sessions WHERE user_id = ? AND active = 1'
    ).get(req.params.userId);

    if (activeSession) {
      return res.json({ 
        alreadyOpen: true, 
        message: 'You already have access to this account.',
        sessionId: activeSession.id
      });
    }

    prepare(
      'INSERT INTO trade_requests (admin_id, user_id, status) VALUES (?, ?, ?)'
    ).run(req.user.id, req.params.userId, 'pending');

    prepare(
      'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)'
    ).run(req.params.userId, 'Admin wants to trade for you', 'trade_request');

    saveDatabase();

    res.json({ success: true, message: 'Trade request sent to user' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check trade request status
router.get('/trade-request-status/:userId', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const request = prepare(
      'SELECT * FROM trade_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1'
    ).get(req.params.userId);

    const activeSession = prepare(
      'SELECT * FROM admin_trade_sessions WHERE user_id = ? AND active = 1'
    ).get(req.params.userId);

    res.json({ request, activeSession });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// User responds to trade request
router.post('/trade-request-response', authenticateToken, async (req, res) => {
  const { requestId, response } = req.body;

  try {
    const db = await getDb();
    const request = prepare('SELECT * FROM trade_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (response === 'accepted') {
      prepare('UPDATE trade_requests SET status = ? WHERE id = ?').run('accepted', requestId);
      
      prepare(
        'INSERT INTO admin_trade_sessions (admin_id, user_id, active) VALUES (?, ?, 1)'
      ).run(request.admin_id, request.user_id);

      saveDatabase();

      res.json({ success: true, message: 'Trade request accepted' });
    } else {
      prepare('UPDATE trade_requests SET status = ? WHERE id = ?').run('declined', requestId);
      saveDatabase();
      res.json({ success: true, message: 'Trade request declined' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin login as user
router.post('/login-as-user/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const activeSession = prepare(
      'SELECT * FROM admin_trade_sessions WHERE user_id = ? AND active = 1'
    ).get(req.params.userId);

    if (!activeSession) {
      return res.status(403).json({ error: 'No active trade session. Send a trade request first.' });
    }

    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      success: true,
      adminSession: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin trades for user
router.post('/trade-for-user/:userId', authenticateToken, requireAdmin, async (req, res) => {
  const { type, amount } = req.body;

  try {
    const db = await getDb();
    const activeSession = prepare(
      'SELECT * FROM admin_trade_sessions WHERE user_id = ? AND active = 1'
    ).get(req.params.userId);

    if (!activeSession) {
      return res.status(403).json({ error: 'No active trade session' });
    }

    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);

    if (user.balance < amount && type === 'buy') {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const winChance = Math.random();
    const isWin = winChance > 0.45;
    
    let profit_loss;
    let result;

    if (isWin) {
      profit_loss = amount * (0.01 + Math.random() * 0.15);
      result = 'win';
    } else {
      profit_loss = -(amount * (0.01 + Math.random() * 0.1));
      result = 'loss';
    }

    let balance_after;
    if (type === 'buy') {
      balance_after = user.balance - amount + profit_loss;
    } else {
      balance_after = user.balance + profit_loss;
    }

    if (balance_after < 0) balance_after = 0;

    prepare('UPDATE users SET balance = ? WHERE id = ?').run(parseFloat(balance_after.toFixed(2)), req.params.userId);

    prepare(
      'INSERT INTO trades (user_id, type, amount, result, profit_loss, balance_after) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.params.userId, type, amount, result, parseFloat(profit_loss.toFixed(2)), parseFloat(balance_after.toFixed(2)));

    saveDatabase();

    res.json({
      success: true,
      result,
      profit_loss: profit_loss.toFixed(2),
      balance_after: balance_after.toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin transfers funds from user to admin
router.post('/transfer-to-admin/:userId', authenticateToken, requireAdmin, async (req, res) => {
  const { amount } = req.body;

  try {
    const db = await getDb();
    const activeSession = prepare(
      'SELECT * FROM admin_trade_sessions WHERE user_id = ? AND active = 1'
    ).get(req.params.userId);

    if (!activeSession) {
      return res.status(403).json({ error: 'No active trade session' });
    }

    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
    const admin = prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient user balance' });
    }

    // Deduct from user
    prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, req.params.userId);
    
    // Add to admin
    prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, req.user.id);

    // Record transaction for USER (withdrawal)
    prepare(
      'INSERT INTO transactions (user_id, type, platform, amount, amount_usd) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.userId, 'withdraw', 'Admin Transfer', 0, amount);

    // Record transaction for ADMIN (deposit)
    prepare(
      'INSERT INTO transactions (user_id, type, platform, amount, amount_usd) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'deposit', `Transfer from ${user.username}`, 0, amount);

    saveDatabase();

    // Send WebSocket notification to user if online
    const clients = req.app.get('clients');
    const userClient = clients.get(parseInt(req.params.userId));
    if (userClient && userClient.readyState === 1) {
      userClient.send(JSON.stringify({
        type: 'trade_update',
        message: `Admin transferred $${amount.toFixed(2)} from your account`
      }));
    }

    res.json({
      success: true,
      message: `Transferred $${amount.toFixed(2)} from ${user.username} to admin`,
      adminBalance: (admin.balance + amount).toFixed(2),
      userBalance: (user.balance - amount).toFixed(2)
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Close admin session
router.post('/close-session/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    prepare(
      'UPDATE admin_trade_sessions SET active = 0 WHERE user_id = ? AND active = 1'
    ).run(req.params.userId);
    saveDatabase();
    res.json({ success: true, message: 'Session closed' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete transaction
router.delete('/transaction/:transactionId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    prepare('DELETE FROM transactions WHERE id = ?').run(req.params.transactionId);
    saveDatabase();
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete trade
router.delete('/trade/:tradeId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    prepare('DELETE FROM trades WHERE id = ?').run(req.params.tradeId);
    saveDatabase();
    res.json({ success: true, message: 'Trade deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user account (soft delete)
router.post('/delete-user/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    prepare('UPDATE users SET account_deleted = 1 WHERE id = ?').run(req.params.userId);
    saveDatabase();
    res.json({ success: true, message: 'User account deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Restore user account
router.post('/restore-user/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    prepare('UPDATE users SET account_deleted = 0, delete_requested = 0 WHERE id = ?').run(req.params.userId);
    prepare('DELETE FROM retrieve_requests WHERE user_id = ?').run(req.params.userId);
    saveDatabase();
    res.json({ success: true, message: 'User account restored' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get retrieve requests
router.get('/retrieve-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const requests = prepare(
      `SELECT rr.*, u.username FROM retrieve_requests rr 
       JOIN users u ON rr.user_id = u.id 
       WHERE rr.status = 'pending' ORDER BY rr.date DESC`
    ).all();
    res.json({ requests });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// User requests account retrieval
router.post('/request-retrieve', async (req, res) => {
  const { userId } = req.body;

  try {
    const db = await getDb();
    const existing = prepare(
      'SELECT * FROM retrieve_requests WHERE user_id = ? AND status = ?'
    ).get(userId, 'pending');

    if (existing) {
      return res.json({ success: true, message: 'Request already sent' });
    }

    prepare('INSERT INTO retrieve_requests (user_id, status) VALUES (?, ?)').run(userId, 'pending');
    prepare('UPDATE users SET delete_requested = 1 WHERE id = ?').run(userId);
    saveDatabase();

    res.json({ success: true, message: 'Request sent, waiting for admin approval' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if admin has active session with a specific user
router.get('/check-session/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const session = prepare(
      'SELECT * FROM admin_trade_sessions WHERE user_id = ? AND active = 1'
    ).get(req.params.userId);
    
    res.json({ 
      hasActiveSession: !!session,
      session: session || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all active sessions for admin
router.get('/active-sessions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const sessions = prepare(
      `SELECT ats.*, u.username FROM admin_trade_sessions ats
       JOIN users u ON ats.user_id = u.id
       WHERE ats.admin_id = ? AND ats.active = 1 ORDER BY ats.date DESC`
    ).all(req.user.id);
    
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ====== route for admin's own transaction history ======
router.get('/my-transactions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    // Admin is user id 1 (or whatever their ID is)
    const transactions = prepare(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC'
    ).all(req.user.id);
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
module.exports = router;