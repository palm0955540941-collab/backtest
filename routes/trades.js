const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getPool } = require('../config/database');

// กำหนดโฟลเดอร์สำหรับเก็บรูปภาพชาร์ต
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ตั้งค่า Multer สำหรับจัดการการอัปโหลดไฟล์รูปภาพ
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (jpg, jpeg, png, webp, gif) เท่านั้น!'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // สูงสุด 10MB
  fileFilter: fileFilter
});

// Middleware ช่วยลบรูปเก่าทิ้งเมื่อมีการเปลี่ยนหรือลบข้อมูล
function removeFileSafe(filename) {
  if (!filename) return;
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn(`ลบไฟล์ ${filename} ไม่สำเร็จ:`, e.message);
    }
  }
}

// -----------------------------------------------------------------------------
// 1. GET /api/trades - ดึงรายการเทรดทั้งหมด (พร้อมระบบ Filter และ Pagination)
// -----------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const { strategy, session, outcome, direction, timeframe, startDate, endDate, sort } = req.query;

    let query = 'SELECT * FROM trades WHERE 1=1';
    const params = [];

    if (strategy && strategy !== 'ALL') {
      query += ' AND strategy = ?';
      params.push(strategy);
    }
    if (session && session !== 'ALL') {
      query += ' AND session = ?';
      params.push(session);
    }
    if (outcome && outcome !== 'ALL') {
      query += ' AND outcome = ?';
      params.push(outcome);
    }
    if (direction && direction !== 'ALL') {
      query += ' AND direction = ?';
      params.push(direction);
    }
    if (timeframe && timeframe !== 'ALL') {
      query += ' AND timeframe = ?';
      params.push(timeframe);
    }
    if (startDate) {
      query += ' AND trade_date >= ?';
      params.push(startDate + ' 00:00:00');
    }
    if (endDate) {
      query += ' AND trade_date <= ?';
      params.push(endDate + ' 23:59:59');
    }

    if (sort === 'oldest') {
      query += ' ORDER BY trade_date ASC, id ASC';
    } else {
      query += ' ORDER BY trade_date DESC, id DESC';
    }

    const [rows] = await pool.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลเทรดได้', error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/trades/:id - ดึงข้อมูลเทรดรายการเดียว
// -----------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการเทรดนี้' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล', error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 3. POST /api/trades - เพิ่มรายการเทรดใหม่ พร้อมอัปโหลดรูป
// -----------------------------------------------------------------------------
router.post('/', upload.fields([
  { name: 'chart_before', maxCount: 1 },
  { name: 'chart_after', maxCount: 1 }
]), async (req, res) => {
  try {
    const pool = getPool();
    const {
      trade_date,
      pair = 'XAUUSD',
      direction,
      timeframe = 'M15',
      session = 'London',
      strategy = 'General',
      entry_price,
      sl_price,
      tp_price,
      exit_price,
      planned_rr,
      realized_rr,
      outcome,
      entry_reason,
      exit_reason,
      tags
    } = req.body;

    let finalPlannedRr = (planned_rr !== undefined && planned_rr !== '') ? parseFloat(planned_rr) : null;
    let finalRealizedRr = (realized_rr !== undefined && realized_rr !== '') ? parseFloat(realized_rr) : null;

    const entryNum = entry_price ? parseFloat(entry_price) : null;
    const slNum = sl_price ? parseFloat(sl_price) : null;
    const tpNum = tp_price ? parseFloat(tp_price) : null;
    const exitNum = exit_price ? parseFloat(exit_price) : null;

    // คำนวณ Planned RR อัตโนมัติจาก Entry, SL, TP ถ้าไม่ได้ระบุ
    if ((finalPlannedRr === null || isNaN(finalPlannedRr)) && entryNum !== null && slNum !== null && tpNum !== null) {
      const risk = Math.abs(entryNum - slNum);
      if (risk > 0) {
        finalPlannedRr = parseFloat((Math.abs(tpNum - entryNum) / risk).toFixed(2));
      }
    }

    // คำนวณ Realized RR อัตโนมัติจาก Exit หรือ Outcome ถ้าไม่ได้ระบุ
    if (finalRealizedRr === null || isNaN(finalRealizedRr)) {
      if (exitNum !== null && entryNum !== null && slNum !== null) {
        const risk = Math.abs(entryNum - slNum);
        if (risk > 0) {
          const diff = direction === 'BUY' ? (exitNum - entryNum) : (entryNum - exitNum);
          finalRealizedRr = parseFloat((diff / risk).toFixed(2));
        }
      } else if (outcome === 'WIN') {
        finalRealizedRr = finalPlannedRr !== null ? finalPlannedRr : 2.0;
      } else if (outcome === 'LOSS') {
        finalRealizedRr = -1.0;
      } else if (outcome === 'BE') {
        finalRealizedRr = 0.0;
      } else {
        finalRealizedRr = 0.0;
      }
    }

    if (!trade_date || !direction || !outcome) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน (วันที่, ทิศทาง Buy/Sell, ผลลัพธ์)'
      });
    }

    const chart_before = req.files && req.files['chart_before'] ? req.files['chart_before'][0].filename : null;
    const chart_after = req.files && req.files['chart_after'] ? req.files['chart_after'][0].filename : null;

    const sql = `
      INSERT INTO trades (
        trade_date, pair, direction, timeframe, session, strategy,
        entry_price, sl_price, tp_price, exit_price,
        planned_rr, realized_rr, outcome,
        chart_before, chart_after,
        entry_reason, exit_reason, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      trade_date,
      pair,
      direction,
      timeframe,
      session,
      strategy.trim() || 'General',
      entryNum,
      slNum,
      tpNum,
      exitNum,
      finalPlannedRr !== null ? finalPlannedRr : 0.0,
      finalRealizedRr !== null ? finalRealizedRr : 0.0,
      outcome,
      chart_before,
      chart_after,
      entry_reason || '',
      exit_reason || '',
      tags || ''
    ];

    const [result] = await pool.query(sql, values);
    res.status(201).json({
      success: true,
      message: 'บันทึกข้อมูลสำเร็จ',
      insertId: result.insertId
    });
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ success: false, message: 'บันทึกข้อมูลไม่สำเร็จ', error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 4. PUT /api/trades/:id - แก้ไขรายการเทรด
// -----------------------------------------------------------------------------
router.put('/:id', upload.fields([
  { name: 'chart_before', maxCount: 1 },
  { name: 'chart_after', maxCount: 1 }
]), async (req, res) => {
  try {
    const pool = getPool();
    const tradeId = req.params.id;

    // ตรวจสอบว่ามีรายการเดิมอยู่หรือไม่
    const [existing] = await pool.query('SELECT * FROM trades WHERE id = ?', [tradeId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการแก้ไข' });
    }
    const oldTrade = existing[0];

    const {
      trade_date,
      pair,
      direction,
      timeframe,
      session,
      strategy,
      entry_price,
      sl_price,
      tp_price,
      exit_price,
      planned_rr,
      realized_rr,
      outcome,
      entry_reason,
      exit_reason,
      tags,
      remove_chart_before,
      remove_chart_after
    } = req.body;

    let chart_before = oldTrade.chart_before;
    let chart_after = oldTrade.chart_after;

    // ถ้ามีการอัปโหลดรูปใหม่แทนที่ หรือสั่งลบรูปเดิม
    if (req.files && req.files['chart_before']) {
      removeFileSafe(oldTrade.chart_before);
      chart_before = req.files['chart_before'][0].filename;
    } else if (remove_chart_before === 'true') {
      removeFileSafe(oldTrade.chart_before);
      chart_before = null;
    }

    if (req.files && req.files['chart_after']) {
      removeFileSafe(oldTrade.chart_after);
      chart_after = req.files['chart_after'][0].filename;
    } else if (remove_chart_after === 'true') {
      removeFileSafe(oldTrade.chart_after);
      chart_after = null;
    }

    let finalPlannedRr = (planned_rr !== undefined && planned_rr !== '') ? parseFloat(planned_rr) : oldTrade.planned_rr;
    let finalRealizedRr = (realized_rr !== undefined && realized_rr !== '') ? parseFloat(realized_rr) : oldTrade.realized_rr;

    const entryNum = entry_price !== undefined ? (entry_price ? parseFloat(entry_price) : null) : oldTrade.entry_price;
    const slNum = sl_price !== undefined ? (sl_price ? parseFloat(sl_price) : null) : oldTrade.sl_price;
    const tpNum = tp_price !== undefined ? (tp_price ? parseFloat(tp_price) : null) : oldTrade.tp_price;
    const exitNum = exit_price !== undefined ? (exit_price ? parseFloat(exit_price) : null) : oldTrade.exit_price;
    const currentDir = direction || oldTrade.direction;
    const currentOutcome = outcome || oldTrade.outcome;

    if (entryNum !== null && slNum !== null && tpNum !== null) {
      const risk = Math.abs(entryNum - slNum);
      if (risk > 0) {
        finalPlannedRr = parseFloat((Math.abs(tpNum - entryNum) / risk).toFixed(2));
      }
    }

    if (finalRealizedRr === null || isNaN(finalRealizedRr) || (exitNum !== null && exit_price !== undefined)) {
      if (exitNum !== null && entryNum !== null && slNum !== null) {
        const risk = Math.abs(entryNum - slNum);
        if (risk > 0) {
          const diff = currentDir === 'BUY' ? (exitNum - entryNum) : (entryNum - exitNum);
          finalRealizedRr = parseFloat((diff / risk).toFixed(2));
        }
      } else if (currentOutcome === 'WIN') {
        finalRealizedRr = finalPlannedRr || 2.0;
      } else if (currentOutcome === 'LOSS') {
        finalRealizedRr = -1.0;
      } else if (currentOutcome === 'BE') {
        finalRealizedRr = 0.0;
      }
    }

    const sql = `
      UPDATE trades SET
        trade_date = ?, pair = ?, direction = ?, timeframe = ?, session = ?, strategy = ?,
        entry_price = ?, sl_price = ?, tp_price = ?, exit_price = ?,
        planned_rr = ?, realized_rr = ?, outcome = ?,
        chart_before = ?, chart_after = ?,
        entry_reason = ?, exit_reason = ?, tags = ?
      WHERE id = ?
    `;

    const values = [
      trade_date || oldTrade.trade_date,
      pair || oldTrade.pair,
      direction || oldTrade.direction,
      timeframe || oldTrade.timeframe,
      session || oldTrade.session,
      strategy !== undefined ? strategy.trim() : oldTrade.strategy,
      entryNum,
      slNum,
      tpNum,
      exitNum,
      finalPlannedRr !== null ? finalPlannedRr : 0.0,
      finalRealizedRr !== null ? finalRealizedRr : 0.0,
      currentOutcome,
      chart_before,
      chart_after,
      entry_reason !== undefined ? entry_reason : oldTrade.entry_reason,
      exit_reason !== undefined ? exit_reason : oldTrade.exit_reason,
      tags !== undefined ? tags : oldTrade.tags,
      tradeId
    ];

    await pool.query(sql, values);
    res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ success: false, message: 'แก้ไขข้อมูลไม่สำเร็จ', error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 5. DELETE /api/trades/:id - ลบรายการเทรด
// -----------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const tradeId = req.params.id;

    const [rows] = await pool.query('SELECT chart_before, chart_after FROM trades WHERE id = ?', [tradeId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการลบ' });
    }

    // ลบไฟล์ภาพที่ผูกอยู่
    removeFileSafe(rows[0].chart_before);
    removeFileSafe(rows[0].chart_after);

    await pool.query('DELETE FROM trades WHERE id = ?', [tradeId]);
    res.json({ success: true, message: 'ลบรายการเทรดสำเร็จ' });
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ success: false, message: 'ไม่สามารถลบรายการได้', error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 6. GET /api/trades/meta/strategies - ดึงรายชื่อ Strategy ที่เคยบันทึกไว้
// -----------------------------------------------------------------------------
router.get('/meta/strategies', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT DISTINCT strategy FROM trades 
      WHERE strategy IS NOT NULL AND strategy != '' 
      ORDER BY strategy ASC
    `);
    const strategies = rows.map(r => r.strategy);
    res.json({ success: true, strategies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
