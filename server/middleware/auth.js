const jwt = require('jsonwebtoken');

const JWT_SECRET = 'crypto_secret_key_2024_binance_clone';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, isAdmin: user.username === 'admin' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

module.exports = { authenticateToken, generateToken, JWT_SECRET };