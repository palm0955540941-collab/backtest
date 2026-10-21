/**
 * XAUUSD Backtest Journal - Frontend Application Logic
 */

// Global State
let allTrades = [];
let currentStats = null;
let currentDetailTrade = null;
let chartInstances = {};

// Default datetime to now in local timezone format for datetime-local input
function getCurrentLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
  return localISOTime;
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // Setup Clipboard Paste listener for screenshots
  setupPasteListener();

  // Setup Drag and Drop listeners
  setupDropzones();

  // Check Database connection health
  checkHealth();

  // Load strategies for filter & autocomplete
  loadStrategies();

  // Load all trades and stats
  loadAllData();
});

// -----------------------------------------------------------------------------
// Theme Management (Light / Dark Mode)
// -----------------------------------------------------------------------------
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  if (window.lucide) {
    lucide.createIcons();
  }
  // Re-render charts with new theme colors if stats already loaded
  if (currentStats) {
    renderCharts(currentStats);
  }
}

// -----------------------------------------------------------------------------
// Database Health Check
// -----------------------------------------------------------------------------
async function checkHealth() {
  const badgeDot = document.getElementById('dbStatusDot');
  const badgeText = document.getElementById('dbStatusText');
  const banner = document.getElementById('dbErrorBanner');

  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    if (data.success && data.status === 'online') {
      badgeDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      badgeText.textContent = 'MySQL เชื่อมต่อแล้ว (XAMPP)';
      badgeText.className = 'text-emerald-400';
      banner.classList.add('hidden');
    } else {
      throw new Error(data.message || 'Offline');
    }
  } catch (err) {
    badgeDot.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
    badgeText.textContent = 'MySQL ไม่ได้เชื่อมต่อ';
    badgeText.className = 'text-rose-400';
    banner.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

// -----------------------------------------------------------------------------
// Data Loading
// -----------------------------------------------------------------------------
async function loadAllData() {
  const strategy = document.getElementById('filterStrategy').value;
  const session = document.getElementById('filterSession').value;
  const outcome = document.getElementById('filterOutcome').value;
  const timeframe = document.getElementById('filterTimeframe').value;

  const queryParams = new URLSearchParams();
  if (strategy && strategy !== 'ALL') queryParams.append('strategy', strategy);
  if (session && session !== 'ALL') queryParams.append('session', session);
  if (outcome && outcome !== 'ALL') queryParams.append('outcome', outcome);
  if (timeframe && timeframe !== 'ALL') queryParams.append('timeframe', timeframe);

  try {
    // 1. Fetch trades
    const tradesRes = await fetch(`/api/trades?${queryParams.toString()}`);
    const tradesData = await tradesRes.json();
    if (tradesData.success) {
      allTrades = tradesData.data;
      renderTradesTable(allTrades);
    }

    // 2. Fetch stats
    const statsRes = await fetch(`/api/stats?${queryParams.toString()}`);
    const statsData = await statsRes.json();
    if (statsData.success) {
      currentStats = statsData.data;
      updateKpis(currentStats);
      renderCharts(currentStats);
    }

    if (window.lucide) lucide.createIcons();
  } catch (error) {
    console.error('Error loading backtest data:', error);
  }
}

async function loadStrategies() {
  try {
    const res = await fetch('/api/trades/meta/strategies');
    const data = await res.json();
    if (data.success && data.strategies) {
      const filterSelect = document.getElementById('filterStrategy');
      const datalist = document.getElementById('strategyList');

      // Keep default option
      filterSelect.innerHTML = '<option value="ALL">ระบบทั้งหมด (All Strategies)</option>';
      datalist.innerHTML = '';

      // Default suggestions if empty
      const defaultSuggestions = ['SMC', 'Liquidity Sweep', 'FVG Order Block', 'Break & Retest', 'Trend Following'];
      const uniqueList = Array.from(new Set([...defaultSuggestions, ...data.strategies]));

      uniqueList.forEach(strat => {
        const option = document.createElement('option');
        option.value = strat;
        option.textContent = strat;
        filterSelect.appendChild(option);

        const dataOption = document.createElement('option');
        dataOption.value = strat;
        datalist.appendChild(dataOption);
      });
    }
  } catch (err) {
    console.warn('Could not load strategies list', err);
  }
}

function resetFilters() {
  document.getElementById('filterStrategy').value = 'ALL';
  document.getElementById('filterSession').value = 'ALL';
  document.getElementById('filterOutcome').value = 'ALL';
  document.getElementById('filterTimeframe').value = 'ALL';
  loadAllData();
}

// -----------------------------------------------------------------------------
// Update KPI Cards
// -----------------------------------------------------------------------------
function updateKpis(stats) {
  if (!stats) return;

  document.getElementById('statTotalTrades').textContent = stats.totalTrades;
  document.getElementById('statWins').textContent = `${stats.wins}W`;
  document.getElementById('statLosses').textContent = `${stats.losses}L`;
  document.getElementById('statBes').textContent = `${stats.bes}BE`;

  document.getElementById('statWinRate').textContent = `${stats.winRate}%`;
  document.getElementById('statBeRate').textContent = `${stats.beRate}%`;

  const totalREl = document.getElementById('statTotalR');
  const sign = stats.totalR >= 0 ? '+' : '';
  totalREl.textContent = `${sign}${stats.totalR} R`;
  if (stats.totalR > 0) {
    totalREl.className = 'text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400';
  } else if (stats.totalR < 0) {
    totalREl.className = 'text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400';
  } else {
    totalREl.className = 'text-2xl font-bold tracking-tight text-amber-600 dark:text-gold-400';
  }

  const avgREl = document.getElementById('statAvgR');
  const avgSign = stats.avgR >= 0 ? '+' : '';
  avgREl.textContent = `${avgSign}${stats.avgR} R`;

  document.getElementById('statProfitFactor').textContent = stats.profitFactor > 50 ? '∞' : stats.profitFactor;
  document.getElementById('statAvgWinR').textContent = `+${stats.avgWinR}R`;
  document.getElementById('statAvgLossR').textContent = `-${stats.avgLossR}R`;

  document.getElementById('statMaxDD').textContent = `-${stats.maxDrawdownR} R`;
  document.getElementById('statStreakWin').textContent = `${stats.maxConsecutiveWins}W`;
  document.getElementById('statStreakLoss').textContent = `${stats.maxConsecutiveLosses}L`;
}

// -----------------------------------------------------------------------------
// Render Interactive Charts
// -----------------------------------------------------------------------------
function renderCharts(stats) {
  if (!stats) return;

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipTitle = isDark ? '#f1f5f9' : '#0f172a';
  const tooltipBody = isDark ? '#cbd5e1' : '#334155';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';

  // Destroy previous instances to prevent canvas flickering
  Object.keys(chartInstances).forEach(key => {
    if (chartInstances[key]) chartInstances[key].destroy();
  });

  // 1. Equity Curve Chart
  const ctxEquity = document.getElementById('equityCurveChart').getContext('2d');
  const curvePoints = stats.equityCurve || [];

  const labels = curvePoints.map((p, i) => i === 0 ? 'Start' : `#${p.trade_number || i}`);
  const dataPoints = curvePoints.map(p => p.cumulative_r);

  const gradient = ctxEquity.createLinearGradient(0, 0, 0, 300);
  if (isDark) {
    gradient.addColorStop(0, 'rgba(234, 179, 8, 0.35)');
    gradient.addColorStop(1, 'rgba(234, 179, 8, 0.0)');
  } else {
    gradient.addColorStop(0, 'rgba(217, 119, 6, 0.25)');
    gradient.addColorStop(1, 'rgba(217, 119, 6, 0.0)');
  }

  chartInstances.equity = new Chart(ctxEquity, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Cumulative R',
        data: dataPoints,
        borderColor: isDark ? '#eab308' : '#d97706',
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.25,
        pointBackgroundColor: curvePoints.map(p => {
          if (p.outcome === 'WIN') return '#10b981';
          if (p.outcome === 'LOSS') return '#ef4444';
          return isDark ? '#94a3b8' : '#64748b';
        }),
        pointRadius: curvePoints.length > 30 ? 2 : 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              const p = curvePoints[context.dataIndex];
              if (!p || p.outcome === 'INIT') return `Cumulative: ${context.parsed.y} R`;
              const sign = p.realized_rr >= 0 ? '+' : '';
              return [
                `ผลลัพธ์: ${p.outcome} (${sign}${p.realized_rr} R)`,
                `กำไรสะสม: ${p.cumulative_r} R`,
                `ระบบ: ${p.strategy || '-'}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: value => `${value} R`
          }
        }
      }
    }
  });

  // 2. Win / Loss / BE Doughnut Chart
  const ctxPie = document.getElementById('outcomePieChart').getContext('2d');
  chartInstances.pie = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
      labels: ['Win', 'Loss', 'Breakeven'],
      datasets: [{
        data: [stats.wins, stats.losses, stats.bes],
        backgroundColor: ['#10b981', '#ef4444', isDark ? '#64748b' : '#94a3b8'],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: isDark ? '#cbd5e1' : '#334155', font: { size: 11 }, boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 8
        }
      },
      cutout: '72%'
    }
  });

  // 3. Strategy Bar Chart
  const ctxStrat = document.getElementById('strategyChart').getContext('2d');
  const stratLabels = stats.byStrategy.map(s => s.name);
  const stratR = stats.byStrategy.map(s => s.totalR);

  chartInstances.strategy = new Chart(ctxStrat, {
    type: 'bar',
    data: {
      labels: stratLabels,
      datasets: [{
        label: 'Total R',
        data: stratR,
        backgroundColor: stratR.map(r => r >= 0 ? '#10b981' : '#ef4444'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function(ctx) {
              const item = stats.byStrategy[ctx.dataIndex];
              return `Total: ${item.totalR} R | Win Rate: ${item.winRate}% (${item.wins}/${item.total})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 10 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 } }
        }
      }
    }
  });

  // 4. Session Bar Chart
  const ctxSession = document.getElementById('sessionChart').getContext('2d');
  const sessionLabels = stats.bySession.map(s => s.name);
  const sessionR = stats.bySession.map(s => s.totalR);

  chartInstances.session = new Chart(ctxSession, {
    type: 'bar',
    data: {
      labels: sessionLabels,
      datasets: [{
        label: 'Total R',
        data: sessionR,
        backgroundColor: isDark ? '#38bdf8' : '#0284c7',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function(ctx) {
              const item = stats.bySession[ctx.dataIndex];
              return `Total: ${item.totalR} R | Win Rate: ${item.winRate}% (${item.wins}/${item.total})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 10 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 } }
        }
      }
    }
  });

  // 5. Direction Bar Chart (BUY vs SELL)
  const ctxDir = document.getElementById('directionChart').getContext('2d');
  const dirLabels = stats.byDirection.map(d => d.name);
  const dirR = stats.byDirection.map(d => d.totalR);

  chartInstances.direction = new Chart(ctxDir, {
    type: 'bar',
    data: {
      labels: dirLabels,
      datasets: [{
        label: 'Total R',
        data: dirR,
        backgroundColor: ['#10b981', '#f43f5e'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: function(ctx) {
              const item = stats.byDirection[ctx.dataIndex];
              return `Total: ${item.totalR} R | Win Rate: ${item.winRate}% (${item.wins}/${item.total})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 10 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 } }
        }
      }
    }
  });
}

// -----------------------------------------------------------------------------
// Render Trades Table
// -----------------------------------------------------------------------------
function renderTradesTable(trades) {
  const tbody = document.getElementById('tradesTableBody');
  document.getElementById('tradeCountDisplay').textContent = trades.length;

  if (trades.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-12 text-center text-slate-500 dark:text-slate-400">
          <div class="flex flex-col items-center justify-center space-y-2">
            <i data-lucide="layers" class="w-10 h-10 opacity-30"></i>
            <span class="text-sm font-semibold">ยังไม่มีข้อมูลการเทรด</span>
            <p class="text-xs text-slate-400 dark:text-slate-500">กดปุ่ม "+ บันทึกการเทรด" ด้านบนเพื่อเริ่มเก็บสถิติ Backtest ได้เลยครับ</p>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = trades.map(t => {
    // Format Date
    const d = new Date(t.trade_date);
    const dateStr = d.toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    // Direction Badge
    const dirBadge = t.direction === 'BUY'
      ? `<span class="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold">BUY</span>`
      : `<span class="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold">SELL</span>`;

    // Outcome Badge
    let outcomeBadge = '';
    if (t.outcome === 'WIN') {
      outcomeBadge = `<span class="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-bold">WIN</span>`;
    } else if (t.outcome === 'LOSS') {
      outcomeBadge = `<span class="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 font-bold">LOSS</span>`;
    } else {
      outcomeBadge = `<span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-500/30 font-bold">BE</span>`;
    }

    // Realized R pill
    const rVal = parseFloat(t.realized_rr) || 0;
    const rColor = rVal > 0 ? 'text-emerald-600 dark:text-emerald-400' : rVal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400';
    const rSign = rVal > 0 ? '+' : '';

    // Price summary string
    const entry = t.entry_price ? Number(t.entry_price).toFixed(2) : '-';
    const sl = t.sl_price ? Number(t.sl_price).toFixed(2) : '-';
    const tp = t.tp_price ? Number(t.tp_price).toFixed(2) : '-';
    const exit = t.exit_price ? Number(t.exit_price).toFixed(2) : '-';

    // Image Thumbnails
    let chartIcons = '';
    if (t.chart_before || t.chart_after) {
      if (t.chart_before) {
        chartIcons += `
          <button onclick="event.stopPropagation(); openLightbox('/uploads/${t.chart_before}')" title="ดูกราฟตอนเข้า" class="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 overflow-hidden inline-block hover:border-amber-500 transition mr-1 shadow-sm">
            <img src="/uploads/${t.chart_before}" class="w-full h-full object-cover">
          </button>
        `;
      }
      if (t.chart_after) {
        chartIcons += `
          <button onclick="event.stopPropagation(); openLightbox('/uploads/${t.chart_after}')" title="ดูกราฟตอนออก" class="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 overflow-hidden inline-block hover:border-amber-500 transition shadow-sm">
            <img src="/uploads/${t.chart_after}" class="w-full h-full object-cover">
          </button>
        `;
      }
    } else {
      chartIcons = `<span class="text-slate-400 dark:text-slate-600 text-[11px]">-</span>`;
    }

    return `
      <tr class="hover:bg-amber-500/5 dark:hover:bg-slate-800/40 transition cursor-pointer border-b border-slate-100 dark:border-slate-800/60" onclick="openDetailModal(${t.id})">
        <td class="py-3 px-4">
          <div class="font-bold text-slate-900 dark:text-white text-xs">#${t.id} ${t.pair || 'XAUUSD'}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">${dateStr} ${timeStr}</div>
        </td>
        <td class="py-3 px-3">${dirBadge}</td>
        <td class="py-3 px-3">
          <div class="font-semibold text-slate-800 dark:text-slate-200">${t.timeframe}</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">${t.session}</div>
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-gold-300 font-semibold border border-slate-200 dark:border-slate-700/80">
            ${t.strategy || 'General'}
          </span>
        </td>
        <td class="py-3 px-3 font-mono text-[11px]">
          <span class="text-slate-700 dark:text-slate-300">${entry}</span> / 
          <span class="text-rose-600 dark:text-rose-400">${sl}</span> / 
          <span class="text-emerald-600 dark:text-emerald-400">${tp}</span>
          ${exit !== '-' ? ` <span class="text-sky-600 dark:text-cyan-400 font-semibold">(${exit})</span>` : ''}
        </td>
        <td class="py-3 px-3 text-center text-slate-700 dark:text-slate-300 font-mono">
          ${t.planned_rr ? `1:${t.planned_rr}` : '-'}
        </td>
        <td class="py-3 px-3 text-center font-bold font-mono text-sm ${rColor}">
          ${rSign}${rVal}R
        </td>
        <td class="py-3 px-3 text-center">${outcomeBadge}</td>
        <td class="py-3 px-3 text-center">${chartIcons}</td>
        <td class="py-3 px-4 text-right" onclick="event.stopPropagation()">
          <div class="flex items-center justify-end space-x-1">
            <button onclick="openDetailModal(${t.id})" class="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="ดูรายละเอียด">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
            <button onclick="openEditModal(${t.id})" class="p-1.5 text-slate-400 hover:text-amber-600 dark:hover:text-gold-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="แก้ไข">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteTrade(${t.id})" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="ลบ">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Form & Calculations Helper
// -----------------------------------------------------------------------------
function setDirection(dir) {
  document.getElementById('inputDirection').value = dir;
  const btnBuy = document.getElementById('btnDirectionBuy');
  const btnSell = document.getElementById('btnDirectionSell');

  if (dir === 'BUY') {
    btnBuy.className = 'py-2 text-xs font-bold rounded-xl border border-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 transition flex items-center justify-center space-x-1 shadow-sm';
    btnSell.className = 'py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-dark-900 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center space-x-1';
  } else {
    btnSell.className = 'py-2 text-xs font-bold rounded-xl border border-rose-600 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 transition flex items-center justify-center space-x-1 shadow-sm';
    btnBuy.className = 'py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-dark-900 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center space-x-1';
  }
  calculateRR();
}

function updateRealizedRDisplay(val) {
  const rNum = parseFloat(val) || 0;
  const sign = rNum > 0 ? '+' : '';
  const displayEl = document.getElementById('displayRealizedR');
  displayEl.textContent = `${sign}${rNum.toFixed(2)} R`;
  document.getElementById('inputRealizedRr').value = rNum.toFixed(2);

  const manualInput = document.getElementById('inputManualRealizedRr');
  if (manualInput) manualInput.value = rNum.toFixed(2);

  if (rNum > 0) {
    displayEl.className = 'px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono font-black text-sm border border-emerald-300 dark:border-emerald-500/30';
  } else if (rNum < 0) {
    displayEl.className = 'px-2.5 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 font-mono font-black text-sm border border-rose-300 dark:border-rose-500/30';
  } else {
    displayEl.className = 'px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 font-mono font-black text-sm border border-slate-300 dark:border-slate-500/30';
  }
}

function setOutcome(outcome, autoUpdateR = true) {
  document.getElementById('inputOutcome').value = outcome;
  const btnWin = document.getElementById('btnOutcomeWin');
  const btnLoss = document.getElementById('btnOutcomeLoss');
  const btnBe = document.getElementById('btnOutcomeBe');

  const baseInactive = 'py-2.5 px-3 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-850 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex flex-col items-center justify-center';

  btnWin.className = outcome === 'WIN'
    ? 'py-2.5 px-3 text-xs font-bold rounded-xl border border-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 transition flex flex-col items-center justify-center shadow-sm'
    : baseInactive;

  btnLoss.className = outcome === 'LOSS'
    ? 'py-2.5 px-3 text-xs font-bold rounded-xl border border-rose-600 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 transition flex flex-col items-center justify-center shadow-sm'
    : baseInactive;

  btnBe.className = outcome === 'BE'
    ? 'py-2.5 px-3 text-xs font-bold rounded-xl border border-slate-400 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white transition flex flex-col items-center justify-center shadow-sm'
    : baseInactive;

  if (autoUpdateR) {
    const planned = parseFloat(document.getElementById('inputPlannedRr').value) || 2.0;
    if (outcome === 'WIN') {
      updateRealizedRDisplay(planned);
    } else if (outcome === 'LOSS') {
      updateRealizedRDisplay(-1.0);
    } else if (outcome === 'BE') {
      updateRealizedRDisplay(0.0);
    }
  }
}

function toggleManualR() {
  const sec = document.getElementById('manualRSection');
  if (sec) sec.classList.toggle('hidden');
}

function syncManualR(val) {
  if (val !== '' && !isNaN(parseFloat(val))) {
    updateRealizedRDisplay(parseFloat(val));
  }
}

// คำนวณ Planned RR และ Realized RR อัตโนมัติจากราคา Entry, SL, TP
function calculateRR() {
  const dir = document.getElementById('inputDirection').value;
  const entry = parseFloat(document.getElementById('inputEntryPrice').value);
  const sl = parseFloat(document.getElementById('inputSlPrice').value);
  const tp = parseFloat(document.getElementById('inputTpPrice').value);
  const exit = parseFloat(document.getElementById('inputExitPrice').value);

  const previewRisk = document.getElementById('previewRiskPoints');
  const previewReward = document.getElementById('previewRewardPoints');
  const previewPlanned = document.getElementById('previewPlannedRrText');
  const labelWin = document.getElementById('labelWinR');

  if (!isNaN(entry) && !isNaN(sl)) {
    const risk = Math.abs(entry - sl);
    previewRisk.textContent = risk.toFixed(2);

    if (!isNaN(tp) && risk > 0) {
      const reward = Math.abs(tp - entry);
      const plannedRr = parseFloat((reward / risk).toFixed(2));

      previewReward.textContent = reward.toFixed(2);
      previewPlanned.textContent = `1 : ${plannedRr.toFixed(2)}`;
      document.getElementById('inputPlannedRr').value = plannedRr.toFixed(2);
      if (labelWin) labelWin.textContent = `ได้ +${plannedRr.toFixed(2)} R`;

      // ถ้ามีการระบุ Exit Price (ราคาปิดจริง) ให้คำนวณตามราคาปิดจริง
      if (!isNaN(exit)) {
        let diff = (dir === 'BUY') ? (exit - entry) : (entry - exit);
        const realizedR = parseFloat((diff / risk).toFixed(2));

        if (realizedR > 0.05) {
          setOutcome('WIN', false);
        } else if (realizedR < -0.05) {
          setOutcome('LOSS', false);
        } else {
          setOutcome('BE', false);
        }
        updateRealizedRDisplay(realizedR);
      } else {
        // ถ้าไม่ได้ระบุ Exit Price ให้ใช้ผลลัพธ์จากปุ่ม Outcome (เช่น ถ้ากด WIN จะได้ Planned RR ทันที)
        const currentOutcome = document.getElementById('inputOutcome').value;
        if (currentOutcome === 'WIN') {
          updateRealizedRDisplay(plannedRr);
        } else if (currentOutcome === 'LOSS') {
          updateRealizedRDisplay(-1.0);
        } else if (currentOutcome === 'BE') {
          updateRealizedRDisplay(0.0);
        }
      }
    }
  } else {
    previewRisk.textContent = '-';
    previewReward.textContent = '-';
    previewPlanned.textContent = '1 : -';
  }
}

// -----------------------------------------------------------------------------
// Image Drag, Drop, Paste and Preview
// -----------------------------------------------------------------------------
function previewSelectedImage(input, previewContainerId, removeBtnId) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const container = document.getElementById(previewContainerId);
    const placeholder = container.nextElementSibling;
    const img = container.querySelector('img');
    img.src = e.target.result;
    container.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
    if (removeBtnId) document.getElementById(removeBtnId).classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removeImage(type) {
  if (type === 'before') {
    document.getElementById('fileChartBefore').value = '';
    document.getElementById('previewBefore').classList.add('hidden');
    document.getElementById('placeholderBefore').classList.remove('hidden');
    document.getElementById('removeBeforeBtn').classList.add('hidden');
    document.getElementById('remove_chart_before').value = 'true';
  } else {
    document.getElementById('fileChartAfter').value = '';
    document.getElementById('previewAfter').classList.add('hidden');
    document.getElementById('placeholderAfter').classList.remove('hidden');
    document.getElementById('removeAfterBtn').classList.add('hidden');
    document.getElementById('remove_chart_after').value = 'true';
  }
}

function setupDropzones() {
  const handleDrop = (e, fileInputId, previewId, removeBtnId) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const fileInput = document.getElementById(fileInputId);
      fileInput.files = e.dataTransfer.files;
      previewSelectedImage(fileInput, previewId, removeBtnId);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragover') {
      e.currentTarget.classList.add('dragover');
    } else {
      e.currentTarget.classList.remove('dragover');
    }
  };

  const dropBefore = document.getElementById('dropzoneBefore');
  const dropAfter = document.getElementById('dropzoneAfter');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
    dropBefore.addEventListener(ev, handleDrag);
    dropAfter.addEventListener(ev, handleDrag);
  });

  dropBefore.addEventListener('drop', (e) => handleDrop(e, 'fileChartBefore', 'previewBefore', 'removeBeforeBtn'));
  dropAfter.addEventListener('drop', (e) => handleDrop(e, 'fileChartAfter', 'previewAfter', 'removeAfterBtn'));
}

// Paste from Clipboard (Cmd+V or Ctrl+V)
function setupPasteListener() {
  window.addEventListener('paste', (e) => {
    const modal = document.getElementById('tradeModal');
    if (modal.classList.contains('hidden')) return; // only when modal is open

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        // Determine whether to assign to before or after
        const beforeImg = document.getElementById('previewBefore').querySelector('img').src;
        let targetInputId = 'fileChartBefore';
        let targetPreviewId = 'previewBefore';
        let targetRemoveId = 'removeBeforeBtn';

        if (beforeImg && !document.getElementById('previewBefore').classList.contains('hidden')) {
          targetInputId = 'fileChartAfter';
          targetPreviewId = 'previewAfter';
          targetRemoveId = 'removeAfterBtn';
        }

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(blob);
        const fileInput = document.getElementById(targetInputId);
        fileInput.files = dataTransfer.files;
        previewSelectedImage(fileInput, targetPreviewId, targetRemoveId);
        break;
      }
    }
  });
}

// -----------------------------------------------------------------------------
// Trade Modal Open / Edit / Close
// -----------------------------------------------------------------------------
function openTradeModal() {
  document.getElementById('modalTitle').textContent = 'บันทึกการเทรด Backtest ใหม่';
  document.getElementById('btnSubmitTrade').textContent = 'บันทึกการเทรด';
  document.getElementById('tradeForm').reset();
  document.getElementById('editTradeId').value = '';

  // Reset previews
  removeImage('before');
  removeImage('after');
  document.getElementById('remove_chart_before').value = 'false';
  document.getElementById('remove_chart_after').value = 'false';

  const nowIso = getCurrentLocalDateTime();
  document.getElementById('inputTradeDate').value = nowIso;
  autoDetectSessionFromDate(nowIso);

  document.getElementById('inputPair').value = 'XAUUSD';
  document.getElementById('inputEntryPrice').value = '';
  document.getElementById('inputSlPrice').value = '';
  document.getElementById('inputTpPrice').value = '';
  document.getElementById('inputExitPrice').value = '';
  document.getElementById('previewRiskPoints').textContent = '-';
  document.getElementById('previewRewardPoints').textContent = '-';
  document.getElementById('previewPlannedRrText').textContent = '1 : -';
  document.getElementById('inputPlannedRr').value = '2.0';
  document.getElementById('manualRSection').classList.add('hidden');
  setDirection('BUY');
  setOutcome('WIN');
  updateRealizedRDisplay(2.0);

  document.getElementById('tradeModal').classList.remove('hidden');
}

// ฟังก์ชันเลือก Session และเปลี่ยนสไตล์การ์ด Session ทั้ง 4 ให้สวยงาม
function setSession(session) {
  document.getElementById('inputSession').value = session;
  const sessionList = [
    { key: 'Asian' },
    { key: 'London' },
    { key: 'Overlap' },
    { key: 'New York', idKey: 'NewYork' }
  ];

  sessionList.forEach(s => {
    const id = 'sessionCard_' + (s.idKey || s.key);
    const btn = document.getElementById(id);
    if (btn) {
      const timeEl = btn.querySelector('.font-mono');
      if (s.key === session) {
        btn.className = 'session-card active p-2.5 rounded-xl border border-amber-500 bg-amber-50 dark:bg-gold-500/15 text-slate-900 dark:text-white transition flex flex-col items-center justify-center text-center cursor-pointer shadow-md shadow-amber-500/10';
        if (timeEl) timeEl.className = 'text-[10px] text-amber-600 dark:text-gold-300 font-mono mt-0.5';
      } else {
        btn.className = 'session-card p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-dark-900/80 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition flex flex-col items-center justify-center text-center cursor-pointer';
        if (timeEl) timeEl.className = 'text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5';
      }
    }
  });
}

// ตรวจจับและเลือก Session ตลาดอัตโนมัติตามเวลาประเทศไทย (UTC+7)
function autoDetectSessionFromDate(dateStr) {
  if (!dateStr) return;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return;

  const hours = d.getHours();
  let session = 'London';

  if (hours >= 6 && hours < 14) {
    session = 'Asian'; // 06:00 - 13:59
  } else if (hours >= 14 && hours < 19) {
    session = 'London'; // 14:00 - 18:59
  } else if (hours >= 19 && hours < 22) {
    session = 'Overlap'; // 19:00 - 21:59 (London & NY Overlap)
  } else {
    session = 'New York'; // 22:00 - 05:59
  }

  setSession(session);
}

async function openEditModal(tradeId) {
  try {
    const res = await fetch(`/api/trades/${tradeId}`);
    const data = await res.json();
    if (!data.success || !data.data) {
      alert('ไม่พบข้อมูลการเทรดนี้');
      return;
    }

    const t = data.data;
    document.getElementById('modalTitle').textContent = `แก้ไขรายการเทรด #${t.id}`;
    document.getElementById('btnSubmitTrade').textContent = 'บันทึกการแก้ไข';
    document.getElementById('editTradeId').value = t.id;

    // Populate Fields
    const d = new Date(t.trade_date);
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset).toISOString().slice(0, 16);
    document.getElementById('inputTradeDate').value = localDate;

    document.getElementById('inputPair').value = t.pair || 'XAUUSD';
    setDirection(t.direction);
    document.getElementById('inputStrategy').value = t.strategy || '';
    setSession(t.session || 'London');
    document.getElementById('inputTimeframe').value = t.timeframe || 'M15';

    document.getElementById('inputEntryPrice').value = t.entry_price || '';
    document.getElementById('inputSlPrice').value = t.sl_price || '';
    document.getElementById('inputTpPrice').value = t.tp_price || '';
    document.getElementById('inputExitPrice').value = t.exit_price || '';

    document.getElementById('inputPlannedRr').value = t.planned_rr || '';
    calculateRR();
    setOutcome(t.outcome, false);
    updateRealizedRDisplay(t.realized_rr);
    document.getElementById('manualRSection').classList.add('hidden');

    document.getElementById('inputEntryReason').value = t.entry_reason || '';
    document.getElementById('inputExitReason').value = t.exit_reason || '';
    document.getElementById('inputTags').value = t.tags || '';

    // Handle existing images
    document.getElementById('remove_chart_before').value = 'false';
    document.getElementById('remove_chart_after').value = 'false';

    if (t.chart_before) {
      const container = document.getElementById('previewBefore');
      container.querySelector('img').src = `/uploads/${t.chart_before}`;
      container.classList.remove('hidden');
      document.getElementById('placeholderBefore').classList.add('hidden');
      document.getElementById('removeBeforeBtn').classList.remove('hidden');
    } else {
      removeImage('before');
    }

    if (t.chart_after) {
      const container = document.getElementById('previewAfter');
      container.querySelector('img').src = `/uploads/${t.chart_after}`;
      container.classList.remove('hidden');
      document.getElementById('placeholderAfter').classList.add('hidden');
      document.getElementById('removeAfterBtn').classList.remove('hidden');
    } else {
      removeImage('after');
    }

    // Close detail modal if open
    closeDetailModal();

    document.getElementById('tradeModal').classList.remove('hidden');
  } catch (err) {
    console.error('Error fetching trade for edit:', err);
    alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
  }
}

function closeTradeModal() {
  document.getElementById('tradeModal').classList.add('hidden');
}

// -----------------------------------------------------------------------------
// Form Submit (Create or Update)
// -----------------------------------------------------------------------------
async function handleTradeSubmit(e) {
  e.preventDefault();

  const editId = document.getElementById('editTradeId').value;
  const formData = new FormData();

  formData.append('trade_date', document.getElementById('inputTradeDate').value);
  formData.append('pair', document.getElementById('inputPair').value.trim() || 'XAUUSD');
  formData.append('direction', document.getElementById('inputDirection').value);
  formData.append('strategy', document.getElementById('inputStrategy').value.trim() || 'General');
  formData.append('session', document.getElementById('inputSession').value);
  formData.append('timeframe', document.getElementById('inputTimeframe').value);

  formData.append('entry_price', document.getElementById('inputEntryPrice').value);
  formData.append('sl_price', document.getElementById('inputSlPrice').value);
  formData.append('tp_price', document.getElementById('inputTpPrice').value);
  formData.append('exit_price', document.getElementById('inputExitPrice').value);

  formData.append('planned_rr', document.getElementById('inputPlannedRr').value);
  formData.append('realized_rr', document.getElementById('inputRealizedRr').value);
  formData.append('outcome', document.getElementById('inputOutcome').value);

  formData.append('entry_reason', document.getElementById('inputEntryReason').value);
  formData.append('exit_reason', document.getElementById('inputExitReason').value);
  formData.append('tags', document.getElementById('inputTags').value);

  // Files
  const fileBefore = document.getElementById('fileChartBefore').files[0];
  if (fileBefore) formData.append('chart_before', fileBefore);

  const fileAfter = document.getElementById('fileChartAfter').files[0];
  if (fileAfter) formData.append('chart_after', fileAfter);

  if (editId) {
    formData.append('remove_chart_before', document.getElementById('remove_chart_before').value);
    formData.append('remove_chart_after', document.getElementById('remove_chart_after').value);
  }

  const submitBtn = document.getElementById('btnSubmitTrade');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';

  try {
    const url = editId ? `/api/trades/${editId}` : '/api/trades';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      body: formData
    });

    const result = await res.json();
    if (!result.success) {
      alert(`ไม่สามารถบันทึกได้: ${result.message}`);
      return;
    }

    closeTradeModal();
    loadAllData();
    loadStrategies();
  } catch (error) {
    console.error('Error submitting trade:', error);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

// -----------------------------------------------------------------------------
// Delete Trade
// -----------------------------------------------------------------------------
async function deleteTrade(id) {
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการเทรด #${id} นี้?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadAllData();
    } else {
      alert(`ลบไม่สำเร็จ: ${data.message}`);
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการลบรายการ');
  }
}

// -----------------------------------------------------------------------------
// Detail Modal View
// -----------------------------------------------------------------------------
async function openDetailModal(id) {
  try {
    const res = await fetch(`/api/trades/${id}`);
    const data = await res.json();
    if (!data.success || !data.data) return;

    currentDetailTrade = data.data;
    const t = currentDetailTrade;

    const d = new Date(t.trade_date);
    document.getElementById('detailDate').textContent = d.toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Badges in Header
    const dirBadgeClass = t.direction === 'BUY'
      ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
      : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800';
    const outcomeBadgeClass = t.outcome === 'WIN'
      ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
      : t.outcome === 'LOSS'
      ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30'
      : 'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30';

    document.getElementById('detailHeaderBadges').innerHTML = `
      <h3 class="text-base font-bold text-slate-900 dark:text-white">#${t.id} ${t.pair || 'XAUUSD'}</h3>
      <span class="px-2 py-0.5 rounded text-xs font-bold border ${dirBadgeClass}">${t.direction}</span>
      <span class="px-2 py-0.5 rounded-full text-xs font-bold border ${outcomeBadgeClass}">${t.outcome}</span>
      <span class="text-xs text-slate-500 dark:text-slate-400 font-mono">${t.timeframe} &bull; ${t.session}</span>
    `;

    document.getElementById('detailStrategy').textContent = t.strategy || 'General';
    document.getElementById('detailPlannedRr').textContent = t.planned_rr ? `1 : ${t.planned_rr}` : '-';

    const rVal = parseFloat(t.realized_rr) || 0;
    const rSign = rVal > 0 ? '+' : '';
    const rColor = rVal > 0 ? 'text-emerald-600 dark:text-emerald-400' : rVal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400';
    const detailREl = document.getElementById('detailRealizedR');
    detailREl.textContent = `${rSign}${rVal} R`;
    detailREl.className = `font-bold text-sm ${rColor}`;

    document.getElementById('detailEntryPrice').textContent = t.entry_price || '-';
    document.getElementById('detailSlPrice').textContent = t.sl_price || '-';
    document.getElementById('detailTpPrice').textContent = t.tp_price || '-';
    document.getElementById('detailExitPrice').textContent = t.exit_price || '-';

    // Chart Images
    const beforeContainer = document.getElementById('detailChartBeforeContainer');
    if (t.chart_before) {
      beforeContainer.innerHTML = `
        <img src="/uploads/${t.chart_before}" class="w-full max-h-72 object-contain cursor-zoom-in chart-thumbnail" onclick="openLightbox('/uploads/${t.chart_before}')">
      `;
    } else {
      beforeContainer.innerHTML = `<span class="text-slate-400 dark:text-slate-500 text-xs py-10">ไม่ได้แนบรูปภาพก่อนเข้า</span>`;
    }

    const afterContainer = document.getElementById('detailChartAfterContainer');
    if (t.chart_after) {
      afterContainer.innerHTML = `
        <img src="/uploads/${t.chart_after}" class="w-full max-h-72 object-contain cursor-zoom-in chart-thumbnail" onclick="openLightbox('/uploads/${t.chart_after}')">
      `;
    } else {
      afterContainer.innerHTML = `<span class="text-slate-400 dark:text-slate-500 text-xs py-10">ไม่ได้แนบรูปภาพตอนจบ</span>`;
    }

    document.getElementById('detailEntryReason').textContent = t.entry_reason || 'ไม่มีบันทึกเหตุผลการเข้า';
    document.getElementById('detailExitReason').textContent = t.exit_reason || 'ไม่มีบันทึกข้อคิด / สิ่งที่เรียนรู้';

    // Tags
    const tagsContainer = document.getElementById('detailTagsContainer');
    tagsContainer.innerHTML = '';
    if (t.tags) {
      const tagList = t.tags.split(',').map(tag => tag.trim()).filter(Boolean);
      tagList.forEach(tg => {
        const span = document.createElement('span');
        span.className = 'px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium';
        span.textContent = `#${tg}`;
        tagsContainer.appendChild(span);
      });
    }

    if (window.lucide) lucide.createIcons();
    document.getElementById('detailModal').classList.remove('hidden');
  } catch (err) {
    console.error('Error opening detail modal:', err);
  }
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
  currentDetailTrade = null;
}

function handleEditFromDetail() {
  if (currentDetailTrade) {
    openEditModal(currentDetailTrade.id);
  }
}

function handleDeleteFromDetail() {
  if (currentDetailTrade) {
    const id = currentDetailTrade.id;
    closeDetailModal();
    deleteTrade(id);
  }
}

// -----------------------------------------------------------------------------
// Lightbox Zoom
// -----------------------------------------------------------------------------
function openLightbox(imgSrc) {
  const lightbox = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImage');
  img.src = imgSrc;
  lightbox.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightboxModal').classList.add('hidden');
}
