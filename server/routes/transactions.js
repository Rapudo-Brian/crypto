const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, prepare, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// Exchange rates (KSH to USD)
const EXCHANGE_RATE = 0.007;
const MIN_DEPOSIT_KSH = 14286;
const MIN_WITHDRAWAL_KSH = 7143;

// Deposit
router.post('/deposit', authenticateToken, async (req, res) => {
  const { amount_ksh, platform, password, confirm } = req.body;

  if (!amount_ksh || !platform || !password || !confirm) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (amount_ksh < MIN_DEPOSIT_KSH) {
    return res.status(400).json({ error: `Minimum deposit is $100 (${Math.ceil(MIN_DEPOSIT_KSH)} KSH)` });
  }

  try {
    const db = await getDb();
    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const validPassword = bcrypt.compareSync(password, user.password);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const amount_usd = (amount_ksh * EXCHANGE_RATE);
    let bonus = 0;

    // First deposit bonus (30%)
    if (user.first_deposit === 0) {
      bonus = amount_usd * 0.3;
      prepare('UPDATE users SET first_deposit = 1 WHERE id = ?').run(req.user.id);
    }

    const total_deposit = parseFloat(amount_usd) + bonus;

    // Update balance
    prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(total_deposit, req.user.id);

    // Record transaction
    prepare(
      'INSERT INTO transactions (user_id, type, platform, amount, amount_usd) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'deposit', platform, amount_ksh, total_deposit);

    saveDatabase();

    // Get new balance
    const updatedUser = prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);

    res.json({
      success: true,
      message: `Deposit from ${platform} of ${amount_ksh.toLocaleString()} KSH was successful. New crypto balance: $${updatedUser.balance.toFixed(2)}`,
      balance: updatedUser.balance,
      bonus: bonus > 0 ? bonus : 0
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Withdraw
router.post('/withdraw', authenticateToken, async (req, res) => {
  const { amount_ksh, platform, password, confirm } = req.body;

  if (!amount_ksh || !platform || !password || !confirm) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const amount_usd_needed = amount_ksh * EXCHANGE_RATE;

  try {
    const db = await getDb();
    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    if (user.balance < amount_usd_needed) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    if (amount_usd_needed < 50) {
      return res.status(400).json({ error: `Minimum withdrawal is $50 (${Math.ceil(MIN_WITHDRAWAL_KSH)} KSH)` });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const amount_usd = amount_ksh * EXCHANGE_RATE;

    // Update balance
    prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount_usd, req.user.id);

    // Record transaction
    prepare(
      'INSERT INTO transactions (user_id, type, platform, amount, amount_usd) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'withdraw', platform, amount_ksh, amount_usd);

    saveDatabase();

    const updatedUser = prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);

    res.json({
      success: true,
      message: `Withdrawal to ${platform} of ${amount_ksh.toLocaleString()} KSH was successful. New crypto balance: $${updatedUser.balance.toFixed(2)}`,
      balance: updatedUser.balance
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get transaction history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const transactions = prepare(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC'
    ).all(req.user.id);
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;