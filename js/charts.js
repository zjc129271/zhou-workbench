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

// 类别占比（环形，带百分比标注）
export function renderCategoryPie(canvas, items) {
  // items: [{name, value}]
  const labels = items.map((i) => i.name);
  const data = items.map((i) => i.value);
  const total = data.reduce((s, v) => s + v, 0);
  const colors = items.map((_, i) => PALETTE[i % PALETTE.length]);

  // 自定义插件：在环形图每个扇区上绘制百分比
  const percentPlugin = {
    id: 'piePercentLabels',
    afterDatasetsDraw(chart) {
      const { ctx, data: { datasets } } = chart;
      const ds = datasets[0];
      const meta = chart.getDatasetMeta(0);
      const totalVal = ds.data.reduce((s, v) => s + v, 0);
      if (totalVal === 0) return;
      ctx.save();
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      meta.data.forEach((arc, i) => {
        const val = ds.data[i];
        if (val === 0) return;
        const pct = ((val / totalVal) * 100).toFixed(1) + '%';
        // 使用弧的中点角度来计算标签位置（略向圆心偏移）
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const r = (arc.outerRadius + arc.innerRadius) / 2;
        const x = arc.x + Math.cos(angle) * r;
        const y = arc.y + Math.sin(angle) * r;
        ctx.fillStyle = '#fff';
        ctx.fillText(pct, x, y);
      });
      ctx.restore();
    }
  };

  return mount(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: borderColor(), borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor(), boxWidth: 12, padding: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ¥${c.parsed.toFixed(2)} (${((c.parsed / total) * 100).toFixed(1)}%)` } }
      }
    },
    plugins: [percentPlugin]
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

// 月度折线图（支出或收入趋势，每个数据点标注金额）
export function renderMonthLineChart(canvas, labels, data, color, label) {
  // 自定义插件：在折线每个点上方绘制金额数值
  const dataLabelPlugin = {
    id: 'monthLineDatalabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      meta.data.forEach((point, i) => {
        const val = chart.data.datasets[0].data[i];
        if (val == null || val === 0) return;
        const txt = '¥' + val.toFixed(2);
        // 避免标签溢出顶部，做简单钳制
        const y = Math.max(point.y - 6, 12);
        ctx.fillText(txt, point.x, y);
      });
      ctx.restore();
    }
  };

  return mount(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color + '1A',
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: textColor(), boxWidth: 12, padding: 10, font: { size: 13 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ¥${c.parsed.y.toFixed(2)}` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: mutedColor(), font: { size: 11 }, callback: (v) => '¥' + v },
          grid: { color: borderColor() }
        },
        x: {
          ticks: { color: mutedColor(), font: { size: 12 } },
          grid: { display: false }
        }
      }
    },
    plugins: [dataLabelPlugin]
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
