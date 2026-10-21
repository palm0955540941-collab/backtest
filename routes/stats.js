const express = require('express');
const router = express.Router();
const { getPool } = require('../config/database');

// GET /api/stats - คำนวณสถิติระบบเทรด Winrate, R:R, Max Drawdown, Equity Curve
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const { strategy, session, timeframe, startDate, endDate } = req.query;

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

    query += ' ORDER BY trade_date ASC, id ASC';

    const [trades] = await pool.query(query, params);

    const totalTrades = trades.length;

    if (totalTrades === 0) {
      return res.json({
        success: true,
        data: {
          totalTrades: 0,
          wins: 0,
          losses: 0,
          bes: 0,
          winRate: 0,
          lossRate: 0,
          beRate: 0,
          totalR: 0,
          avgR: 0,
          avgWinR: 0,
          avgLossR: 0,
          profitFactor: 0,
          maxDrawdownR: 0,
          maxConsecutiveWins: 0,
          maxConsecutiveLosses: 0,
          equityCurve: [],
          byStrategy: [],
          bySession: [],
          byTimeframe: [],
          byDirection: []
        }
      });
    }

    let wins = 0;
    let losses = 0;
    let bes = 0;
    let totalWinR = 0;
    let totalLossR = 0;
    let totalR = 0;

    let currentStreakWins = 0;
    let maxConsecutiveWins = 0;
    let currentStreakLosses = 0;
    let maxConsecutiveLosses = 0;

    let runningR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;

    const equityCurve = [
      { id: 0, trade_date: 'Start', outcome: 'INIT', realized_rr: 0, cumulative_r: 0 }
    ];

    const strategyMap = {};
    const sessionMap = {};
    const timeframeMap = {};
    const directionMap = {
      BUY: { total: 0, wins: 0, totalR: 0 },
      SELL: { total: 0, wins: 0, totalR: 0 }
    };

    trades.forEach((trade, index) => {
      const r = parseFloat(trade.realized_rr) || 0;
      totalR += r;
      runningR += r;

      // Track Max Drawdown (Peak to Valley)
      if (runningR > peakR) {
        peakR = runningR;
      }
      const currentDrawdown = peakR - runningR;
      if (currentDrawdown > maxDrawdownR) {
        maxDrawdownR = currentDrawdown;
      }

      // Equity curve point
      equityCurve.push({
        trade_number: index + 1,
        id: trade.id,
        trade_date: trade.trade_date,
        direction: trade.direction,
        strategy: trade.strategy,
        outcome: trade.outcome,
        realized_rr: r,
        cumulative_r: parseFloat(runningR.toFixed(2))
      });

      // Wins / Losses / BE
      if (trade.outcome === 'WIN') {
        wins++;
        totalWinR += r;
        currentStreakWins++;
        currentStreakLosses = 0;
        if (currentStreakWins > maxConsecutiveWins) maxConsecutiveWins = currentStreakWins;
      } else if (trade.outcome === 'LOSS') {
        losses++;
        totalLossR += Math.abs(r);
        currentStreakLosses++;
        currentStreakWins = 0;
        if (currentStreakLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentStreakLosses;
      } else {
        bes++;
        currentStreakWins = 0;
        currentStreakLosses = 0;
      }

      // Group by Strategy
      const stratName = trade.strategy || 'General';
      if (!strategyMap[stratName]) {
        strategyMap[stratName] = { total: 0, wins: 0, totalR: 0 };
      }
      strategyMap[stratName].total++;
      if (trade.outcome === 'WIN') strategyMap[stratName].wins++;
      strategyMap[stratName].totalR += r;

      // Group by Session
      const sessName = trade.session || 'London';
      if (!sessionMap[sessName]) {
        sessionMap[sessName] = { total: 0, wins: 0, totalR: 0 };
      }
      sessionMap[sessName].total++;
      if (trade.outcome === 'WIN') sessionMap[sessName].wins++;
      sessionMap[sessName].totalR += r;

      // Group by Timeframe
      const tfName = trade.timeframe || 'M15';
      if (!timeframeMap[tfName]) {
        timeframeMap[tfName] = { total: 0, wins: 0, totalR: 0 };
      }
      timeframeMap[tfName].total++;
      if (trade.outcome === 'WIN') timeframeMap[tfName].wins++;
      timeframeMap[tfName].totalR += r;

      // Group by Direction
      if (directionMap[trade.direction]) {
        directionMap[trade.direction].total++;
        if (trade.outcome === 'WIN') directionMap[trade.direction].wins++;
        directionMap[trade.direction].totalR += r;
      }
    });

    const winRate = parseFloat(((wins / totalTrades) * 100).toFixed(1));
    const lossRate = parseFloat(((losses / totalTrades) * 100).toFixed(1));
    const beRate = parseFloat(((bes / totalTrades) * 100).toFixed(1));
    const avgR = parseFloat((totalR / totalTrades).toFixed(2));
    const avgWinR = wins > 0 ? parseFloat((totalWinR / wins).toFixed(2)) : 0;
    const avgLossR = losses > 0 ? parseFloat((totalLossR / losses).toFixed(2)) : 0;
    const profitFactor = totalLossR > 0 ? parseFloat((totalWinR / totalLossR).toFixed(2)) : totalWinR > 0 ? 99.9 : 0;

    // Helper format group data
    const formatGroup = (map) => {
      return Object.keys(map).map(key => {
        const item = map[key];
        return {
          name: key,
          total: item.total,
          wins: item.wins,
          winRate: item.total > 0 ? parseFloat(((item.wins / item.total) * 100).toFixed(1)) : 0,
          totalR: parseFloat(item.totalR.toFixed(2)),
          avgR: item.total > 0 ? parseFloat((item.totalR / item.total).toFixed(2)) : 0
        };
      }).sort((a, b) => b.totalR - a.totalR);
    };

    res.json({
      success: true,
      data: {
        totalTrades,
        wins,
        losses,
        bes,
        winRate,
        lossRate,
        beRate,
        totalR: parseFloat(totalR.toFixed(2)),
        avgR,
        avgWinR,
        avgLossR,
        profitFactor,
        maxDrawdownR: parseFloat(maxDrawdownR.toFixed(2)),
        maxConsecutiveWins,
        maxConsecutiveLosses,
        equityCurve,
        byStrategy: formatGroup(strategyMap),
        bySession: formatGroup(sessionMap),
        byTimeframe: formatGroup(timeframeMap),
        byDirection: formatGroup(directionMap)
      }
    });
  } catch (error) {
    console.error('Error calculating stats:', error);
    res.status(500).json({ success: false, message: 'คำนวณสถิติไม่สำเร็จ', error: error.message });
  }
});

module.exports = router;
