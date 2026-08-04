import { dbAll, dbGet, dbPut, dbDelete } from '../db.js';
import { weekKey, weekdayCN, startOfDay, esc, toast, confirmModal, trashIcon } from '../util.js';

let calYear, calMonth, selWeek, weeklyAdding = false;

function weeksOfMonthDetailed(year, month) {
  const out = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let cur = new Date(first);
  const dow = (cur.getDay() + 6) % 7;
  cur.setDate(cur.getDate() - dow);
  while (cur <= last) {
    out.push({ key: weekKey(cur.getTime()), label: `${cur.getMonth() + 1}/${cur.getDate()}`, ts: cur.getTime() });
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function taskItem(t, wk) {
  const done = (t.doneDates || []).includes(wk);
  return `<li class="list-item ${done ? 'done' : ''}">
    <button class="check" data-toggle="${t.id}" aria-label="完成切换"></button>
    <div class="list-item__main">
      <div class="list-item__title">${esc(t.content)}</div>
      <div class="list-item__sub">${weekdayCN(t.weekday)}</div>
    </div>
    <button class="del-btn" data-del="${t.id}" aria-label="删除">${trashIcon()}</button>
  </li>`;
}

function addFormHtml() {
  return `<div class="add-form">
    <div class="row">
      <input class="input" id="tcontent" placeholder="例如：周报、家庭日" />
      <select class="select" id="twd" style="flex:0 0 100px">
        ${[1, 2, 3, 4, 5, 6, 0].map((w) => `<option value="${w}">${weekdayCN(w)}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn--sm" id="addTask" style="margin-top:8px;flex:0 0 auto">添加</button>
  </div>`;
}

export async function render(container, ctx) {
  if (!selWeek) selWeek = weekKey();
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();

  const tasks = await dbAll('tasks');
  const weeklyTasks = tasks.filter((t) => t.kind === 'weekly');
  const weeks = weeksOfMonthDetailed(calYear, calMonth);

  container.innerHTML = `
    <div class="card">
      <div class="card__title">每周任务 <span class="muted" style="font-weight:400;font-size:13px">${weeklyTasks.length}</span></div>
      ${weeklyTasks.length ? `<ul class="list">${weeklyTasks.map((t) => taskItem(t, selWeek)).join('')}</ul>` : ''}
      ${weeklyAdding ? addFormHtml() : `<div class="add-row" id="taskAdd">＋ 点击空白处添加任务</div>`}
    </div>

    <div class="card">
      <div class="card__title">周视图</div>
      <div class="subnav">
        ${weeks.map((w) => {
          const incomplete = weeklyTasks.filter((t) => !(t.doneDates || []).includes(w.key)).length;
          const isPast = w.ts <= startOfDay();
          const dot = (incomplete > 0 && isPast) ? '🔴' : '';
          return `<button data-week="${w.key}" class="${w.key === selWeek ? 'active' : ''}">${w.label}${dot}</button>`;
        }).join('')}
      </div>
      <div class="muted" style="font-size:12px">🔴：该周有未完成的每周任务</div>
    </div>`;

  const addRow = container.querySelector('#taskAdd');
  if (addRow) addRow.onclick = () => { weeklyAdding = true; ctx.rerender(); };
  if (weeklyAdding) {
    container.querySelector('#addTask').onclick = async () => {
      const c = container.querySelector('#tcontent').value.trim();
      const wd = parseInt(container.querySelector('#twd').value, 10);
      if (!c) return toast('请输入内容');
      await dbPut('tasks', { id: 'task_' + Date.now().toString(36), kind: 'weekly', content: c, weekday: wd, doneDates: [], createdAt: Date.now() });
      weeklyAdding = false;
      toast('已添加');
      ctx.rerender();
    };
  }

  container.querySelectorAll('[data-week]').forEach((b) => {
    b.onclick = () => { selWeek = b.dataset.week; ctx.rerender(); };
  });

  container.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const all = await dbAll('tasks');
      const t = all.find((x) => x.id === b.dataset.toggle);
      const arr = t.doneDates || [];
      const i = arr.indexOf(selWeek);
      if (i >= 0) arr.splice(i, 1); else arr.push(selWeek);
      t.doneDates = arr;
      await dbPut('tasks', t);
      ctx.rerender();
    };
  });
  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmModal('删除这条任务？', { danger: true, okText: '删除' }))) return;
      await dbDelete('tasks', b.dataset.del);
      ctx.rerender();
    };
  });
}
