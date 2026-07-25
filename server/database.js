const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'crypto.db');
let db = null;

async function initializeDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode (not supported in sql.js, so we skip)
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      country TEXT NOT NULL,
      phone TEXT NOT NULL,
      balance REAL DEFAULT 0,
      first_deposit INTEGER DEFAULT 0,
      account_deleted INTEGER DEFAULT 0,
      delete_requested INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      platform TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_usd REAL NOT NULL,
      status TEXT DEFAULT 'completed',
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      result TEXT NOT NULL,
      profit_loss REAL,
      balance_after REAL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trade_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_trade_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS retrieve_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS crypto_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      change_24h REAL,
      volume REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Check if admin exists, if not create it
  const adminExists = db.exec("SELECT id FROM users WHERE username = 'admin'");
  if (adminExists.length === 0) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('password', 10);
    db.run(
      "INSERT INTO users (username, email, password, country, phone, balance) VALUES (?, ?, ?, ?, ?, ?)",
      ['admin', 'admin@crypto.com', hashedPassword, 'Kenya', '0700000000', 0]
    );
  }

  saveDatabase();
  console.log('Database initialized successfully');
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Helper functions for database operations
function prepare(sql) {
  return {
    run: (...params) => {
      db.run(sql, params);
      saveDatabase();
      return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] || 0 };
    },
    get: (...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        stmt.free();
        const result = {};
        columns.forEach((col, i) => { result[col] = values[i]; });
        return result;
      }
      stmt.free();
      return undefined;
    },
    all: (...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results = [];
      const columns = stmt.getColumnNames();
      while (stmt.step()) {
        const values = stmt.get();
        const row = {};
        columns.forEach((col, i) => { row[col] = values[i]; });
        results.push(row);
      }
      stmt.free();
      return results;
    }
  };
}

// Initialize and export
let dbReady = null;

function getDb() {
  if (!dbReady) {
    dbReady = initializeDatabase();
  }
  return dbReady;
}

module.exports = { getDb, prepare, saveDatabase, initializeDatabase };