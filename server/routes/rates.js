const express = require('express');
const router = express.Router();
const db = require('../database');

// Get exchange rates
router.get('/exchange', (req, res) => {
  const rates = [
    { currency: 'USD/KSH', rate: 142.85, change: 0.15 },
    { currency: 'EUR/KSH', rate: 155.32, change: -0.23 },
    { currency: 'GBP/KSH', rate: 180.45, change: 0.08 },
    { currency: 'CNY/KSH', rate: 19.87, change: -0.12 }
  ];
  res.json({ rates });
});

// Get crypto chart data for graph
router.get('/chart/:symbol', (req, res) => {
  const points = [];
  const now = Date.now();
  
  // Generate 100 data points for the chart
  let price = 45000;
  for (let i = 99; i >= 0; i--) {
    price = price * (1 + (Math.random() - 0.5) * 0.01);
    points.push({
      time: now - i * 60000, // 1 minute intervals
      price: price
    });
  }

  res.json({ symbol: req.params.symbol, data: points });
});

module.exports = router;