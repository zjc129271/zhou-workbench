// 图表封装（基于全局 Chart.js）
const PALETTE = ['#12915a', '#34c07a', '#7fb069', '#a7c957', '#bc8a5f', '#8d8741',
  '#5b8e7d', '#2a9d8f', '#e9c46a', '#c9871f', '#6f857a', '#3a7d44', '#1d7a8c', '#b56576'];

function textColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1a2620';
}
function mutedColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6f857a';
}
function borderColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#d9e6de';
}

const registry = new Map();
function mount(canvas, config) {
  const id = canvas.id || (canvas.id = 'cv_' + Math.random().toString(36).slice(2));
  if (registry.has(id)) registry.get(id).destroy();
  const chart = new window.Chart(canvas.getContext('2d'), config);
  registry.set(id, chart);
  return chart;
}
export function destroyAll() { registry.forEach((c) => { try { c.destroy(); } catch (e) { /* 画布可能已脱离 DOM，忽略 */ } }); registry.clear(); }

// 类别占比（环形）
export function renderCategoryPie(canvas, items) {
  // items: [{name, value}]
  const labels = items.map((i) => i.name);
  const data = items.map((i) => i.value);
  const colors = items.map((_, i) => PALETTE[i % PALETTE.length]);
  return mount(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: borderColor(), borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor(), boxWidth: 12, padding: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ¥${c.parsed.toFixed(2)}` } }
      }
    }
  });
}

// 预算 vs 实际（横向柱）
export function renderBudgetBar(canvas, budget, actual) {
  const over = actual > budget;
  return mount(canvas, {
    type: 'bar',
    data: {
      labels: ['预算', '实际'],
      datasets: [{
        data: [budget, actual],
        backgroundColor: [mutedColor(), over ? '#e5484d' : '#12915a'],
        borderRadius: 6, barThickness: 46
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ¥' + c.parsed.y.toFixed(2) } } },
      scales: {
        y: { beginAtZero: true, ticks: { color: mutedColor() }, grid: { color: borderColor() } },
        x: { ticks: { color: textColor() }, grid: { display: false } }
      }
    }
  });
}

// 年度按月趋势（堆叠/分组：支出与收入）
export function renderYearTrend(canvas, months, expArr, incArr) {
  return mount(canvas, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: '支出', data: expArr, backgroundColor: '#12915a', borderRadius: 5, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: '收入', data: incArr, backgroundColor: '#e9c46a', borderRadius: 5, barPercentage: 0.7, categoryPercentage: 0.8 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor(), boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ¥${c.parsed.y.toFixed(2)}` } } },
      scales: {
        y: { beginAtZero: true, ticks: { color: mutedColor() }, grid: { color: borderColor() } },
        x: { ticks: { color: mutedColor() }, grid: { display: false } }
      }
    }
  });
}
