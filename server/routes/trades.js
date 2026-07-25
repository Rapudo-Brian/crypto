const express = require('express');
const router = express.Router();
const { getDb, prepare, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

function getCurrentPrice() {
  return 45000 + (Math.random() - 0.5) * 1000;
}

// Trade
router.post('/execute', authenticateToken, async (req, res) => {
  const { type, amount } = req.body;

  if (!type || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid trade parameters' });
  }

  try {
    const db = await getDb();
    const user = prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    if (user.balance < amount && type === 'buy') {
      return res.status(400).json({ error: 'Insufficient balance to trade' });
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

    prepare('UPDATE users SET balance = ? WHERE id = ?').run(parseFloat(balance_after.toFixed(2)), req.user.id);

    prepare(
      'INSERT INTO trades (user_id, type, amount, result, profit_loss, balance_after) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, type, amount, result, parseFloat(profit_loss.toFixed(2)), parseFloat(balance_after.toFixed(2)));

    saveDatabase();

    res.json({
      success: true,
      type,
      amount,
      result,
      profit_loss: profit_loss.toFixed(2),
      balance_after: balance_after.toFixed(2),
      entry_price: getCurrentPrice().toFixed(2),
      current_price: getCurrentPrice().toFixed(2)
    });
  } catch (error) {
    console.error('Trade error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get trade history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const trades = prepare(
      'SELECT * FROM trades WHERE user_id = ? ORDER BY date DESC'
    ).all(req.user.id);
    res.json({ trades });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current market data
router.get('/market', async (req, res) => {
  const cryptos = [
    { symbol: 'BTC/USDT', price: 45678.50, change: 2.34, volume: 28450000000 },
    { symbol: 'ETH/USDT', price: 2345.60, change: -1.23, volume: 15200000000 },
    { symbol: 'BNB/USDT', price: 312.45, change: 0.56, volume: 8900000000 },
    { symbol: 'SOL/USDT', price: 98.76, change: 5.67, volume: 5600000000 },
    { symbol: 'XRP/USDT', price: 0.589, change: -0.45, volume: 3200000000 },
    { symbol: 'ADA/USDT', price: 0.456, change: 1.23, volume: 1800000000 },
    { symbol: 'DOGE/USDT', price: 0.078, change: -2.10, volume: 950000000 },
    { symbol: 'DOT/USDT', price: 7.89, change: 3.45, volume: 780000000 }
  ];

  const updatedCryptos = cryptos.map(crypto => ({
    ...crypto,
    price: crypto.price * (1 + (Math.random() - 0.5) * 0.002),
    change: crypto.change + (Math.random() - 0.5) * 0.5
  }));

  res.json({ cryptos: updatedCryptos });
});

module.exports = router;