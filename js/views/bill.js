import {
  dbAll, dbGet, dbPut, dbDelete,
  getCategoriesByType, addCategory, deleteCategory, getBudgetMap, setBudget
} from '../db.js';
import { fmtMoney, fmtDate, monthKey, dateStr, fmtDateTime, fmtMonthLabel, esc, dateToTs, toast, openModal, closeModal, confirmModal, trashIcon } from '../util.js';
import { renderCategoryPie, destroyAll } from '../charts.js';
import { exportBill } from '../export.js';
import { openImportModal } from '../import.js';

const SUBS = [
  { key: 'month', label: '月账单' },
  { key: 'year', label: '年账单' },
];

let monthSel = monthKey();
let yearSel = new Date().getFullYear();

function subnav(active) {
  return `<div class="subnav">${SUBS.map((s) => `<button data-sub="${s.key}" class="${s.key === active ? 'active' : ''}">${s.label}</button>`).join('')}</div>`;
}

export async function render(container, ctx, state) {
  const sub = state.billSub || 'month';
  destroyAll();
  container.innerHTML = subnav(sub) + `<div id="billBody"></div>`;
  container.querySelectorAll('.subnav button').forEach((b) => {
    b.onclick = () => ctx.goto('bill', b.dataset.sub);
  });
  const body = container.querySelector('#billBody');
  if (sub === 'month') await renderMonthBill(body, ctx);
  else await renderYearBill(body, ctx);
}

/* ============ 月账单 ============ */
async function renderMonthBill(body, ctx) {
  destroyAll();
  const mk = monthSel;
  const [catsExp, catsInc, txs, budgetMap] = await Promise.all([
    getCategoriesByType('exp'), getCategoriesByType('inc'), dbAll('transactions'), getBudgetMap(mk)
  ]);
  const monthTxs = txs.filter((t) => monthKey(t.ts) === mk);
  const expTxs = monthTxs.filter((t) => (t.type || 'exp') === 'exp');
  const incTxs = monthTxs.filter((t) => t.type === 'inc');

  // 支出：按全部支出类别预生成（无记录也显示，便于填预算）
  const expRows = catsExp.map((c) => {
    const cat = c.name;
    const actual = expTxs.filter((t) => t.category === cat).reduce((s, t) => s + t.amount, 0);
    const budget = budgetMap[cat] || 0;
    return { cat, budget, actual, diff: budget - actual };
  }).sort((a, b) => b.actual - a.actual);
  const totalBudget = +expRows.reduce((s, r) => s + r.budget, 0).toFixed(2);
  const totalActual = +expRows.reduce((s, r) => s + r.actual, 0).toFixed(2);
  const totalDiff = +(totalBudget - totalActual).toFixed(2);

  // 收入：按全部收入类别预生成
  const incRows = catsInc.map((c) => ({
    cat: c.name, amount: incTxs.filter((t) => t.category === c.name).reduce((s, t) => s + t.amount, 0)
  })).sort((a, b) => b.amount - a.amount);
  const totalInc = +incRows.reduce((s, r) => s + r.amount, 0).toFixed(2);

  const pieItems = expRows.filter((r) => r.actual > 0).map((r) => ({ name: r.cat, value: +r.actual.toFixed(2) }));

  body.innerHTML = `
    <div class="card">
      <div class="card__title">
        月份
        <span style="display:flex;gap:8px;align-items:center">
          <input class="input input--sm" id="mSel" type="month" value="${mk}" max="${monthKey()}" style="width:150px" />
          <button class="btn btn--sm btn--ghost" id="impMonth">导入</button>
          <button class="btn btn--sm btn--ghost" id="expMonth">导出</button>
        </span>
      </div>
    </div>

    <div class="card">
      <div class="card__title">支出 <button class="btn btn--sm" id="addExp" style="flex:0 0 auto">记一笔</button></div>
      <table class="tbl">
        <thead><tr><th>类别</th><th>预算</th><th>实际支出</th><th>差额</th></tr></thead>
        <tbody>
          ${expRows.map((r) => `
            <tr>
              <td>${esc(r.cat)}</td>
              <td><input class="budget-in" data-cat="${esc(r.cat)}" type="number" inputmode="decimal" value="${r.budget || ''}" placeholder="—" /></td>
              <td class="amount${r.actual < 0 ? ' amount--neg' : ''}">${fmtMoney(r.actual)}</td>
              <td class="amount ${r.diff < 0 ? 'neg' : ''}">${fmtMoney(r.diff)}</td>
            </tr>`).join('')}
          <tr class="tbl__total">
            <td>合计</td>
            <td>${fmtMoney(totalBudget)}</td>
            <td>${fmtMoney(totalActual)}</td>
            <td class="${totalDiff < 0 ? 'neg' : ''}">${fmtMoney(totalDiff)}</td>
          </tr>
        </tbody>
      </table>
      <div class="muted" style="font-size:12px;margin:8px 0 4px">预算可点单元格直接修改，自动保存</div>
      ${pieItems.length ? `<div class="chart-wrap"><canvas id="pieMonth"></canvas></div>` : `<div class="empty">本月暂无支出记录</div>`}
    </div>

    <div class="card">
      <div class="card__title">收入</div>
      <table class="tbl">
        <thead><tr><th>类别</th><th>金额</th></tr></thead>
        <tbody>
          ${incRows.map((r) => `<tr><td>${esc(r.cat)}</td><td class="amount amount--inc${r.amount < 0 ? ' amount--neg' : ''}">${fmtMoney(r.amount, true)}</td></tr>`).join('')}
          <tr class="tbl__total"><td>合计</td><td class="amount amount--inc${totalInc < 0 ? ' amount--neg' : ''}">${fmtMoney(totalInc, true)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card__title">账单 <span class="muted" style="font-weight:400;font-size:13px">${monthTxs.length} 笔</span></div>
      <div id="txList">${txListHtml(monthTxs)}</div>
    </div>`;

  body.querySelector('#mSel').onchange = () => { monthSel = body.querySelector('#mSel').value; renderMonthBill(body, ctx); };
  body.querySelector('#expMonth').onclick = () => { exportBill({ type: 'month', key: mk }); };
  body.querySelector('#impMonth').onclick = () => openImportModal(ctx);
  body.querySelector('#addExp').onclick = () => openRecordModal(ctx, 'exp');

  body.querySelectorAll('.budget-in').forEach((inp) => {
    inp.onchange = async () => {
      const v = parseFloat(inp.value);
      await setBudget(mk, inp.dataset.cat, isNaN(v) ? 0 : v);
      await renderMonthBill(body, ctx);
    };
  });

  body.querySelectorAll('[data-txdel]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmModal('删除这条记录？', { danger: true, okText: '删除' }))) return;
      await dbDelete('transactions', b.dataset.txdel);
      toast('已删除');
      await renderMonthBill(body, ctx);
    };
  });

  if (pieItems.length) {
    try { renderCategoryPie(body.querySelector('#pieMonth'), pieItems); }
    catch (e) { console.error('pie render failed', e); }
  }
}

/* ============ 年账单 ============ */
async function renderYearBill(body, ctx) {
  destroyAll();
  const all = await dbAll('transactions');
  const curYear = new Date().getFullYear();
  let years = [...new Set(all.map((t) => new Date(t.ts).getFullYear()))].filter((y) => y <= curYear);
  if (!years.includes(yearSel) && yearSel <= curYear) years.push(yearSel);
  years.sort((a, b) => b - a);
  if (!years.length) years.push(curYear);

  const yearTxs = all.filter((t) => new Date(t.ts).getFullYear() === yearSel);
  const expTxs = yearTxs.filter((t) => (t.type || 'exp') === 'exp');
  const byCat = {};
  expTxs.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const catRows = Object.keys(byCat).map((k) => ({ cat: k, amount: +byCat[k].toFixed(2) })).sort((a, b) => b.amount - a.amount);
  const totalExp = +expTxs.reduce((s, t) => s + t.amount, 0).toFixed(2);
  const pieItems = catRows.map((r) => ({ name: r.cat, value: r.amount }));

  body.innerHTML = `
    <div class="card">
      <div class="card__title">
        年份
        <span style="display:flex;gap:8px;align-items:center">
          <select class="select select--sm" id="ySel" style="width:120px">
            ${years.map((y) => `<option value="${y}" ${y === yearSel ? 'selected' : ''}>${y}年</option>`).join('')}
          </select>
          <button class="btn btn--sm btn--ghost" id="impYear">导入</button>
          <button class="btn btn--sm btn--ghost" id="expYear">导出</button>
        </span>
      </div>
    </div>
    <div class="card">
      <div class="card__title">年度汇总 <span class="muted" style="font-weight:400;font-size:13px">${fmtMonthLabel(yearSel + '-01').slice(0,5)}年支出 ${fmtMoney(totalExp)}</span></div>
      ${catRows.length ? `
      <table class="tbl">
        <thead><tr><th>类别</th><th>金额</th></tr></thead>
        <tbody>
          ${catRows.map((r) => `<tr><td>${esc(r.cat)}</td><td class="amount${r.amount < 0 ? ' amount--neg' : ''}">${fmtMoney(r.amount)}</td></tr>`).join('')}
          <tr class="tbl__total"><td>合计</td><td class="${totalExp < 0 ? 'amount amount--neg' : ''}">${fmtMoney(totalExp)}</td></tr>
        </tbody>
      </table>
      <div class="chart-wrap"><canvas id="pieYear"></canvas></div>
      ` : `<div class="empty">本年暂无支出记录</div>`}
    </div>`;

  body.querySelector('#ySel').onchange = () => { yearSel = parseInt(body.querySelector('#ySel').value, 10); renderYearBill(body, ctx); };
  body.querySelector('#expYear').onclick = () => { exportBill({ type: 'year', year: yearSel }); };
  body.querySelector('#impYear').onclick = () => openImportModal(ctx);
  if (pieItems.length) {
    try { renderCategoryPie(body.querySelector('#pieYear'), pieItems); }
    catch (e) { console.error('pie render failed', e); }
  }
}

/* ============ 账单列表（按日分组） ============ */
function txListHtml(list) {
  if (!list.length) return `<div class="empty">本月还没有记录</div>`;
  const groups = {};
  list.slice().sort((a, b) => b.ts - a.ts).forEach((t) => {
    const d = dateStr(t.ts);
    (groups[d] = groups[d] || []).push(t);
  });
  return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map((d) => {
    const dayTxs = groups[d];
    const dayExp = dayTxs.filter((t) => (t.type || 'exp') === 'exp').reduce((s, t) => s + t.amount, 0);
    const dayInc = dayTxs.filter((t) => t.type === 'inc').reduce((s, t) => s + t.amount, 0);
    return `
    <div class="day-head">
      <span>${d}</span>
      <span class="day-head__sum"><span class="exp${dayExp < 0 ? ' neg' : ''}">支出 ${fmtMoney(dayExp)}</span><span class="inc${dayInc < 0 ? ' neg' : ''}">收入 ${fmtMoney(dayInc)}</span></span>
    </div>
    <ul class="list">${dayTxs.map((t) => `
      <li class="list-item">
        <div class="list-item__main">
          <div class="list-item__title">${esc(t.note || t.category)} <span class="tag">${esc(t.category)}</span></div>
          <div class="list-item__sub">${fmtDate(t.ts)} · ${(t.type || 'exp') === 'inc' ? '收入' : '支出'}</div>
        </div>
        <div class="amount ${t.type === 'inc' ? 'amount--inc' : ''}${t.amount < 0 ? ' amount--neg' : ''}">${fmtMoney(t.amount, t.type === 'inc')}</div>
        <button class="del-btn" data-txdel="${t.id}" aria-label="删除">${trashIcon()}</button>
      </li>`).join('')}</ul>
    `;
  }).join('');
}

/* ============ 记一笔弹窗 ============ */
export async function openRecordModal(ctx, defaultType = 'exp') {
  let type = defaultType;
  let selCat = '';
  const mask = openModal(`
    <div class="modal-card">
      <div class="modal-head">
        <div class="seg" id="m-type">
          <button data-t="exp" class="${defaultType === 'exp' ? 'active' : ''}">支出</button>
          <button data-t="inc" class="${defaultType === 'inc' ? 'active' : ''}">收入</button>
        </div>
        <button class="icon-btn" id="m-close" aria-label="关闭" style="font-size:18px">✕</button>
      </div>
      <div class="field"><label>金额</label><input class="input" id="m-amt" type="number" inputmode="decimal" placeholder="0.00" /></div>
      <div class="muted" style="font-size:12px;margin-top:-4px">可输入负数，负数将直接参与统计（如负支出冲减总额）</div>
      <div class="field"><label>备注</label><input class="input" id="m-note" placeholder="可选" /></div>
      <div class="field"><label>时间</label><input class="input" id="m-date" type="date" value="${dateStr()}" /></div>
      <div class="field">
        <label>类别</label>
        <div class="chips" id="m-cats"></div>
        <button class="link-btn" id="m-manage">+ 管理类别</button>
        <div id="m-manage-area" class="manage-area" style="display:none"></div>
      </div>
      <button class="btn" id="m-save">保存</button>
    </div>
  `);
  const catsEl = mask.querySelector('#m-cats');
  const manageEl = mask.querySelector('#m-manage-area');

  async function renderCats() {
    const cats = await getCategoriesByType(type);
    if (!selCat || !cats.find((c) => c.name === selCat)) selCat = cats[0] ? cats[0].name : '';
    catsEl.innerHTML = cats.length
      ? cats.map((c) => `<span class="chip ${c.name === selCat ? 'active' : ''}" data-cat="${esc(c.name)}">${esc(c.name)}</span>`).join('')
      : `<span class="muted">该类型下暂无类别，点右上「管理类别」添加</span>`;
    catsEl.querySelectorAll('[data-cat]').forEach((el) => { el.onclick = () => { selCat = el.dataset.cat; renderCats(); }; });
  }
  async function renderManage() {
    const cats = await getCategoriesByType(type);
    manageEl.innerHTML = `
      <div class="chips">${cats.map((c) => `<span class="chip">${esc(c.name)}<span class="chip__x" data-del="${c.id}" title="删除">✕</span></span>`).join('')}</div>
      <div class="row" style="margin-top:8px"><input class="input" id="m-newcat" placeholder="新类别名" /><button class="btn btn--sm" id="m-addcat" style="flex:0 0 80px">添加</button></div>`;
    manageEl.querySelectorAll('[data-del]').forEach((el) => { el.onclick = async () => { const r = await deleteCategory(el.dataset.del); toast(r.ok ? '已删除' : r.msg); if (r.ok) { await renderCats(); await renderManage(); } }; });
    manageEl.querySelector('#m-addcat').onclick = async () => {
      const v = manageEl.querySelector('#m-newcat').value.trim();
      if (!v) return;
      const r = await addCategory(v, type);
      toast(r.ok ? '已添加' : r.msg);
      if (r.ok) { manageEl.querySelector('#m-newcat').value = ''; await renderCats(); await renderManage(); }
    };
  }

  mask.querySelectorAll('#m-type button').forEach((b) => {
    b.onclick = async () => {
      type = b.dataset.t;
      mask.querySelectorAll('#m-type button').forEach((x) => x.classList.toggle('active', x === b));
      await renderCats(); await renderManage();
    };
  });
  mask.querySelector('#m-manage').onclick = async () => {
    const open = manageEl.style.display !== 'none';
    manageEl.style.display = open ? 'none' : '';
    if (!open) await renderManage();
  };
  mask.querySelector('#m-close').onclick = () => closeModal(mask);
  mask.querySelector('#m-save').onclick = async () => {
    try {
      const amt = parseFloat(mask.querySelector('#m-amt').value);
      if (isNaN(amt) || amt === 0) return toast('请输入有效金额');
      if (!selCat) return toast('请选择类别');
      const note = mask.querySelector('#m-note').value.trim();
      const ts = dateToTs(mask.querySelector('#m-date').value);
      await dbPut('transactions', { id: 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, amount: +amt.toFixed(2), category: selCat, note, ts, createdAt: Date.now() });
      toast('已记录');
      closeModal(mask);
      ctx.rerender();
    } catch (e) {
      console.error('save transaction failed', e);
      toast('保存失败：' + (e && e.message ? e.message : e));
    }
  };

  await renderCats();
}
