// Excel 导出（基于全局 XLSX）
import { dbAll, dbGet, getBudgetMap } from './db.js';
import { monthKey, dateStr, fmtMoney, esc } from './util.js';

function download(wb, filename) {
  window.XLSX.writeFile(wb, filename);
}

function billSheet(txs) {
  const rows = [['日期', '类型', '类别', '金额', '备注']];
  txs.slice().sort((a, b) => b.ts - a.ts).forEach((t) => {
    rows.push([
      dateStr(t.ts), t.type === 'inc' ? '收入' : '支出',
      t.category, t.amount, t.note || ''
    ]);
  });
  return window.XLSX.utils.aoa_to_sheet(rows);
}

function categorySummary(txs, type) {
  const map = {};
  txs.filter((t) => t.type === type).forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
  const rows = [['类别', type === 'inc' ? '收入合计' : '支出合计']];
  Object.keys(map).sort((a, b) => map[b] - map[a]).forEach((k) => rows.push([k, +map[k].toFixed(2)]));
  return window.XLSX.utils.aoa_to_sheet(rows);
}

export async function exportBill(range) {
  const all = await dbAll('transactions');
  let txs, name, sheets = {};
  if (range.type === 'month') {
    const mk = range.key;
    txs = all.filter((t) => monthKey(t.ts) === mk);
    const budgetMap = await getBudgetMap(mk);
    const exp = txs.filter((t) => (t.type || 'exp') === 'exp');
    const inc = txs.filter((t) => t.type === 'inc');
    const expTotal = exp.reduce((s, t) => s + t.amount, 0);
    const incTotal = inc.reduce((s, t) => s + t.amount, 0);
    name = `账单_${mk}.xlsx`;
    sheets['账单'] = billSheet(txs);
    // 支出按类别（含预算/实际/差额）
    const expCats = new Set(exp.map((t) => t.category));
    Object.keys(budgetMap).forEach((c) => expCats.add(c));
    const expRows = [['类别', '预算', '实际支出', '差额']];
    let totB = 0, totA = 0;
    [...expCats].forEach((cat) => {
      const a = exp.filter((t) => t.category === cat).reduce((s, t) => s + t.amount, 0);
      const b = budgetMap[cat] || 0;
      totB += b; totA += a;
      expRows.push([cat, +b.toFixed(2), +a.toFixed(2), +(b - a).toFixed(2)]);
    });
    expRows.push(['合计', +totB.toFixed(2), +totA.toFixed(2), +(totB - totA).toFixed(2)]);
    sheets['支出类别'] = window.XLSX.utils.aoa_to_sheet(expRows);
    // 收入按类别
    const incCats = {};
    inc.forEach((t) => { incCats[t.category] = (incCats[t.category] || 0) + t.amount; });
    const incRows = [['类别', '金额']];
    Object.keys(incCats).sort((a, b) => incCats[b] - incCats[a]).forEach((k) => incRows.push([k, +incCats[k].toFixed(2)]));
    incRows.push(['合计', +incTotal.toFixed(2)]);
    sheets['收入类别'] = window.XLSX.utils.aoa_to_sheet(incRows);
    const sum = [['项目', '金额'], ['预算合计', +totB.toFixed(2)], ['实际支出', +expTotal.toFixed(2)], ['实际收入', +incTotal.toFixed(2)], ['结余', +((incTotal - expTotal)).toFixed(2)]];
    sheets['概览'] = window.XLSX.utils.aoa_to_sheet(sum);
  } else {
    const year = String(range.year);
    txs = all.filter((t) => new Date(t.ts).getFullYear() === range.year);
    name = `账单_${year}年.xlsx`;
    sheets['账单'] = billSheet(txs);
    sheets['类别汇总'] = categorySummary(txs, 'exp');
    // 月度汇总
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(`${year}-${String(m).padStart(2, '0')}`);
    const mrows = [['月份', '支出合计', '收入合计']];
    months.forEach((mk) => {
      const mt = txs.filter((t) => monthKey(t.ts) === mk);
      const e = mt.filter((t) => t.type === 'exp').reduce((s, t) => s + t.amount, 0);
      const i = mt.filter((t) => t.type === 'inc').reduce((s, t) => s + t.amount, 0);
      mrows.push([mk, +e.toFixed(2), +i.toFixed(2)]);
    });
    sheets['月度汇总'] = window.XLSX.utils.aoa_to_sheet(mrows);
  }
  const wb = window.XLSX.utils.book_new();
  Object.keys(sheets).forEach((k) => window.XLSX.utils.book_append_sheet(wb, sheets[k], k));
  download(wb, name);
}

export async function exportJournal(collectionId, name) {
  const all = await dbAll('journal');
  const txs = collectionId ? all.filter((j) => j.collectionId === collectionId) : all;
  const cols = await dbAll('collections');
  const colMap = {}; cols.forEach((c) => colMap[c.id] = c.name);
  txs.sort((a, b) => b.ts - a.ts);
  const rows = txs.map((j) => {
    const kindLabel = j.kind === 'image' ? '图片' : j.kind === 'link' ? '链接' : '文字';
    let body = j.text || '';
    if (j.kind === 'link') body = (j.text ? j.text + '\n' : '') + '链接：' + (j.url || '');
    else if (j.kind === 'image') body = body || '[图片]';
    return `<tr>
      <td style="border:1px solid #ccc;padding:6px">${esc(colMap[j.collectionId] || '')}</td>
      <td style="border:1px solid #ccc;padding:6px">${kindLabel}</td>
      <td style="border:1px solid #ccc;padding:6px;white-space:pre-wrap">${esc(body)}</td>
      <td style="border:1px solid #ccc;padding:6px">${dateStr(j.ts)}</td>
    </tr>`;
  }).join('');
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${esc(name || '记录')}</title></head>
<body>
  <h2 style="color:#12915a">${esc(name || '日常记录')}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="background:#eaf2ec">
      <th style="border:1px solid #ccc;padding:6px">合集</th>
      <th style="border:1px solid #ccc;padding:6px">类型</th>
      <th style="border:1px solid #ccc;padding:6px">内容</th>
      <th style="border:1px solid #ccc;padding:6px">日期</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="border:1px solid #ccc;padding:6px">暂无记录</td></tr>'}</tbody>
  </table>
</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || '记录'}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
