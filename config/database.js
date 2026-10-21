/**
 * ==============================================================================
 * ไฟล์ตั้งค่าการเชื่อมต่อฐานข้อมูล MySQL (XAMPP Database Connection)
 * ==============================================================================
 * คุณสามารถแก้ไข User, Password, Host, Port หรือชื่อ Database ได้ที่นี่โดยตรง
 * หรือจะตั้งค่าผ่านไฟล์ .env ก็ได้เช่นกัน
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
  // สำหรับ XAMPP ปกติค่าเริ่มต้นคือ:
  // host: '127.0.0.1' หรือ 'localhost'
  // user: 'root'
  // password: '' (ว่างเปล่า)
  // port: 3306
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_NAME || 'xauusd_backtest',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00' // เวลาประเทศไทย
};

// สร้าง Connection Pool สำหรับใช้งานทั่วไป
let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

/**
 * ฟังก์ชันสร้าง Database และ Table อัตโนมัติเมื่อเริ่มเปิด Server ครั้งแรก
 * ทำให้ไม่ต้องเข้าไปกดสร้างตารางเองใน phpMyAdmin
 */
async function initializeDatabase() {
  try {
    // 1. เชื่อมต่อ MySQL เพื่อสร้าง Database หากยังไม่มี
    const rootConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    await rootConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` 
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await rootConnection.end();

    // 2. เชื่อมต่อ Database และสร้าง Table 'trades' สำหรับเก็บสถิติ Backtest
    const currentPool = getPool();
    const createTradesTableSQL = `
      CREATE TABLE IF NOT EXISTS \`trades\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`trade_date\` DATETIME NOT NULL COMMENT 'วันที่และเวลาทดสอบเทรด',
        \`pair\` VARCHAR(20) NOT NULL DEFAULT 'XAUUSD' COMMENT 'คู่เงิน/สินทรัพย์',
        \`direction\` ENUM('BUY', 'SELL') NOT NULL COMMENT 'ทิศทางเข้าออเดอร์',
        \`timeframe\` VARCHAR(10) NOT NULL DEFAULT 'M15' COMMENT 'ไทม์เฟรม M1, M5, M15, H1, H4 ฯลฯ',
        \`session\` VARCHAR(30) NOT NULL DEFAULT 'London' COMMENT 'ช่วงเวลา Asian, London, NY',
        \`strategy\` VARCHAR(100) NOT NULL DEFAULT 'General' COMMENT 'ชื่อระบบเทรด/Setup เช่น SMC, Breakout',
        \`entry_price\` DECIMAL(10, 3) NULL COMMENT 'ราคาเข้า',
        \`sl_price\` DECIMAL(10, 3) NULL COMMENT 'Stop Loss',
        \`tp_price\` DECIMAL(10, 3) NULL COMMENT 'Take Profit',
        \`exit_price\` DECIMAL(10, 3) NULL COMMENT 'ราคาปิดออเดอร์',
        \`planned_rr\` DECIMAL(6, 2) NULL DEFAULT 0.00 COMMENT 'RR ตามแผน (Target RR)',
        \`realized_rr\` DECIMAL(6, 2) NOT NULL DEFAULT 0.00 COMMENT 'RR จริงที่ได้ เช่น +2.5, -1.0, 0.0',
        \`outcome\` ENUM('WIN', 'LOSS', 'BE') NOT NULL COMMENT 'ผลลัพธ์: ชนะ, แพ้, เสมอทุน',
        \`chart_before\` VARCHAR(255) NULL COMMENT 'ชื่อไฟล์ภาพกราฟตอนเข้า',
        \`chart_after\` VARCHAR(255) NULL COMMENT 'ชื่อไฟล์ภาพกราฟตอนจบ',
        \`entry_reason\` TEXT NULL COMMENT 'เหตุผลการเข้าเทรด / Checklist',
        \`exit_reason\` TEXT NULL COMMENT 'เหตุผลการออก / ข้อคิด / ข้อผิดพลาด',
        \`tags\` VARCHAR(255) NULL COMMENT 'แท็กย่อย เช่น Follow Plan, FOMO',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_date (\`trade_date\`),
        INDEX idx_outcome (\`outcome\`),
        INDEX idx_strategy (\`strategy\`),
        INDEX idx_session (\`session\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await currentPool.query(createTradesTableSQL);
    console.log(`[Database] เชื่อมต่อ MySQL และตรวจสอบตาราง 'trades' ในฐานข้อมูล '${dbConfig.database}' สำเร็จ`);
    return true;
  } catch (error) {
    console.error('[Database Error] เกิดข้อผิดพลาดในการเชื่อมต่อ MySQL:');
    console.error(`- กรุณาตรวจสอบว่า XAMPP (Apache & MySQL) เปิดอยู่หรือไม่`);
    console.error(`- ตรวจสอบ User/Password ใน config/database.js หรือไฟล์ .env`);
    console.error(`- ข้อความแจ้งเตือน: ${error.message}\n`);
    return false;
  }
}

module.exports = {
  dbConfig,
  getPool,
  initializeDatabase
};
