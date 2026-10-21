const path = require('path');
const Database = require('better-sqlite3');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    const dbPath = path.join(__dirname, '..', 'database.sqlite');
    dbInstance = new Database(dbPath);
    // เปิดโหมด WAL เพื่อประสิทธิภาพที่ดีขึ้น
    dbInstance.pragma('journal_mode = WAL');
  }
  return {
    async all(query, params = []) {
      return dbInstance.prepare(query).all(params);
    },
    async get(query, params = []) {
      return dbInstance.prepare(query).get(params);
    },
    async run(query, params = []) {
      const info = dbInstance.prepare(query).run(params);
      return { lastID: info.lastInsertRowid, changes: info.changes };
    },
    async exec(query) {
      return dbInstance.exec(query);
    }
  };
}

async function initializeDatabase() {
  try {
    const db = getDb();

    const createTradesTableSQL = `
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_date TEXT NOT NULL,
        pair TEXT NOT NULL DEFAULT 'XAUUSD',
        direction TEXT NOT NULL CHECK(direction IN ('BUY', 'SELL')),
        timeframe TEXT NOT NULL DEFAULT 'M15',
        session TEXT NOT NULL DEFAULT 'London',
        strategy TEXT NOT NULL DEFAULT 'General',
        entry_price REAL NULL,
        sl_price REAL NULL,
        tp_price REAL NULL,
        exit_price REAL NULL,
        planned_rr REAL NULL DEFAULT 0.00,
        realized_rr REAL NOT NULL DEFAULT 0.00,
        outcome TEXT NOT NULL CHECK(outcome IN ('WIN', 'LOSS', 'BE')),
        chart_before TEXT NULL,
        chart_after TEXT NULL,
        entry_reason TEXT NULL,
        exit_reason TEXT NULL,
        tags TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await db.exec(createTradesTableSQL);
    console.log(`[Database] เชื่อมต่อและตรวจสอบตาราง 'trades' ใน SQLite สำเร็จ`);
    return true;
  } catch (error) {
    console.error('[Database Error] เกิดข้อผิดพลาดในการตั้งค่า SQLite:', error.message);
    return false;
  }
}

module.exports = {
  getDb,
  initializeDatabase
};
