/**
 * ==============================================================================
 * ไฟล์ตั้งค่าการเชื่อมต่อฐานข้อมูล SQLite (SQLite Database Connection)
 * ==============================================================================
 */

const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// เก็บอินสแตนซ์ของ Database ไว้ใช้งานร่วมกัน
let dbInstance = null;

async function getDb() {
  if (!dbInstance) {
    dbInstance = await open({
      filename: path.join(__dirname, '..', 'database.sqlite'),
      driver: sqlite3.Database
    });
  }
  return dbInstance;
}

/**
 * ฟังก์ชันสร้าง Table 'trades' อัตโนมัติเมื่อเริ่มเปิด Server ครั้งแรก
 */
async function initializeDatabase() {
  try {
    const db = await getDb();

    // สร้างตาราง trades ด้วย Syntax ที่รองรับ SQLite
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

    // สร้าง Index เพิ่มประสิทธิภาพการค้นหา
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_date ON trades (trade_date);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_outcome ON trades (outcome);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_strategy ON trades (strategy);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_session ON trades (session);`);

    console.log(`[Database] เชื่อมต่อและตรวจสอบตาราง 'trades' ใน SQLite สำเร็จ`);
    return true;
  } catch (error) {
    console.error('[Database Error] เกิดข้อผิดพลาดในการตั้งค่า SQLite:');
    console.error(`- ข้อความแจ้งเตือน: ${error.message}\n`);
    return false;
  }
}

module.exports = {
  getDb,
  initializeDatabase
};
