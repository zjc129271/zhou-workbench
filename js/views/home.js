import { dbAll, dbGet } from '../db.js';
import { dateStr, monthKey, fmtMoney, startOfDay, endOfDay, fmtDateTime, weekKey, fmtMonthLabel, esc, toast } from '../util.js';

function statCard(val, lbl, extra = '') {
  return `<div class="stat"><div class="stat__val ${extra}">${val}</div><div class="stat__lbl">${lbl}</div></div>`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export async function render(container, ctx) {
  const [tasks, txs, jrn, memos] = await Promise.all([
    dbAll('tasks'), dbAll('transactions'), dbAll('journal'), dbAll('memos')
  ]);
  const today = dateStr();
  const wk = weekKey();
  const dailyTasks = tasks.filter((t) => t.kind === 'daily');
  const weeklyTasks = tasks.filter((t) => t.kind === 'weekly');
  const dailyDone = dailyTasks.filter((t) => (t.doneDates || []).includes(today)).length;
  const weeklyDone = weeklyTasks.filter((t) => (t.doneDates || []).includes(wk)).length;
  const txToday = txs.filter((t) => t.ts >= startOfDay() && t.ts <= endOfDay()).length;
  const jrToday = jrn.filter((j) => j.ts >= startOfDay() && j.ts <= endOfDay()).length;

  const mk = monthKey();
  const upcoming = memos
    .filter((m) => !m.done && m.remindAt)
    .sort((a, b) => a.remindAt - b.remindAt)
    .slice(0, 5);

  container.innerHTML = `
    <div class="hero">
      <div class="hero__greet">${greeting()}</div>
      <div class="hero__date">${fmtDateTime(Date.now()).split(' ')[0]} · ${fmtMonthLabel(mk)}</div>
    </div>

    <section class="section">
      <div class="section__head"><h3>今日概览</h3></div>
      <div class="dash">
        ${statCard(`${dailyDone}<span class="muted" style="font-size:13px">/${dailyTasks.length}</span>`, '每日任务完成')}
        ${statCard(`${weeklyDone}<span class="muted" style="font-size:13px">/${weeklyTasks.length}</span>`, '本周任务完成')}
        ${statCard(txToday, '今日记账笔数')}
        ${statCard(jrToday, '今日记录条数')}
      </div>
    </section>

    <section class="section">
      <div class="section__head"><h3>待办提醒</h3><button class="link-btn" data-go="memo">全部</button></div>
      <div class="card">
        ${upcoming.length ? `<ul class="list">${upcoming.map((m) => `
          <li class="list-item ${m.done ? 'done' : ''}">
            <div class="list-item__main">
              <div class="list-item__title">${esc(m.content)}</div>
              <div class="list-item__sub">${fmtDateTime(m.remindAt)}</div>
            </div>
          </li>`).join('')}</ul>` : `<div class="empty">暂无临近提醒</div>`}
      </div>
    </section>
  `;

  container.querySelectorAll('[data-go]').forEach((el) => {
    el.onclick = () => ctx.goto(el.getAttribute('data-go'));
  });
}
