const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { initializeDatabase, getPool } = require('./config/database');
const tradesRouter = require('./routes/trades');
const statsRouter = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// เสิร์ฟโฟลเดอร์ static
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/trades', tradesRouter);
app.use('/api/stats', statsRouter);

// Health check endpoint สำหรับตรวจสอบสถานะการเชื่อมต่อ MySQL
app.get('/api/health', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    res.json({
      success: true,
      status: 'online',
      message: 'เชื่อมต่อฐานข้อมูล MySQL สำเร็จ'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'offline',
      message: 'ยังไม่สามารถเชื่อมต่อ MySQL ได้ กรุณาตรวจสอบว่าเปิด XAMPP แล้วหรือไม่',
      error: error.message
    });
  }
});

// Export CSV endpoint
app.get('/api/export/csv', async (req, res) => {
  try {
    const pool = getPool();
    const [trades] = await pool.query('SELECT * FROM trades ORDER BY trade_date ASC, id ASC');

    const headers = [
      'ID', 'Date', 'Pair', 'Direction', 'Timeframe', 'Session', 'Strategy',
      'Entry Price', 'SL Price', 'TP Price', 'Exit Price',
      'Planned RR', 'Realized RR', 'Outcome', 'Entry Reason', 'Exit Reason', 'Tags'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csvContent = '\uFEFF' + headers.join(',') + '\n'; // \uFEFF BOM for Excel Thai support
    trades.forEach(t => {
      const row = [
        t.id,
        t.trade_date ? new Date(t.trade_date).toISOString().replace('T', ' ').substring(0, 19) : '',
        t.pair,
        t.direction,
        t.timeframe,
        t.session,
        t.strategy,
        t.entry_price || '',
        t.sl_price || '',
        t.tp_price || '',
        t.exit_price || '',
        t.planned_rr || 0,
        t.realized_rr || 0,
        t.outcome,
        t.entry_reason || '',
        t.exit_reason || '',
        t.tags || ''
      ];
      csvContent += row.map(escapeCsv).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="xauusd_backtest_' + Date.now() + '.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Export CSV Error:', error);
    res.status(500).send('ไม่สามารถ Export CSV ได้');
  }
});

// เริ่มต้น Server และตรวจสอบฐานข้อมูล
async function startServer() {
  const isDbReady = await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 XAUUSD Backtest Journal Web App พร้อมใช้งานแล้ว!`);
    console.log(`🌐 เปิดเว็บได้ที่: http://localhost:${PORT}`);
    console.log(`📁 โฟลเดอร์เก็บรูปภาพ: /uploads`);
    console.log(`⚙️  ตั้งค่า MySQL ที่: config/database.js หรือ .env`);
    if (!isDbReady) {
      console.log(`⚠️  คำเตือน: ยังเชื่อมต่อ MySQL ไม่สำเร็จ อย่าลืมเปิด Apache & MySQL ใน XAMPP!`);
    }
    console.log(`=======================================================`);
  });
}

startServer();
