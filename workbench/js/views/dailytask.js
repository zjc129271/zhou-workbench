import { dbAll, dbGet, dbPut, dbDelete } from '../db.js';
import { dateStr, fmtDate, startOfDay, esc, toast, confirmModal, trashIcon } from '../util.js';

let calYear, calMonth, selDay, dailyAdding = false;

function buildCalendar(dailyTasks) {
  const first = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // 周一为首
  const today = dateStr();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<td></td>');
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const incomplete = dailyTasks.filter((t) => !(t.doneDates || []).includes(ds)).length;
    const isToday = ds === today;
    const isPast = ds <= today;
    const dot = (incomplete > 0 && isPast) ? `<span class="dot"></span>` : '';
    const cls = ['day'];
    if (ds === selDay) cls.push('has-task');
    if (isToday) cls.push('today');
    cells.push(`<td><div class="${cls.join(' ')}" data-day="${ds}">${d}${dot}</div></td>`);
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');
  return `<table class="cal"><thead><tr><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th><th>日</th></tr></thead><tbody>${weeks.join('')}</tbody></table>`;
}

function taskItem(t, day) {
  const done = (t.doneDates || []).includes(day);
  const timeTag = t.time ? `<span class="tag">${esc(t.time)}</span>` : '';
  return `<li class="list-item ${done ? 'done' : ''}">
    <button class="check" data-toggle="${t.id}" aria-label="完成切换"></button>
    <div class="list-item__main"><div class="list-item__title">${esc(t.content)} ${timeTag}</div></div>
    <button class="del-btn" data-del="${t.id}" aria-label="删除">${trashIcon()}</button>
  </li>`;
}

function addFormHtml() {
  return `<div class="add-form">
    <div class="row">
      <input class="input" id="tcontent" placeholder="例如：喝水、背单词、运动" />
      <button class="btn btn--sm" id="addTask" style="flex:0 0 80px">添加</button>
    </div>
    <div class="field" style="margin:10px 0 0"><label>时间（可选）</label><input class="input" id="ttime" type="time" /></div>
  </div>`;
}

export async function render(container, ctx) {
  if (!selDay) selDay = dateStr();
  const now = new Date(selDay);
  calYear = now.getFullYear(); calMonth = now.getMonth();

  const tasks = await dbAll('tasks');
  const dailyTasks = tasks.filter((t) => t.kind === 'daily');

  container.innerHTML = `
    <div class="card">
      <div class="card__title">${fmtDate(new Date(selDay).getTime())} 的每日任务 <span class="muted" style="font-weight:400;font-size:13px">${dailyTasks.length}</span></div>
      ${dailyTasks.length ? `<ul class="list">${dailyTasks.map((t) => taskItem(t, selDay)).join('')}</ul>` : ''}
      ${dailyAdding ? addFormHtml() : `<div class="add-row" id="taskAdd">＋ 点击空白处添加任务</div>`}
    </div>

    <div class="card">
      <div class="cal-nav">
        <button class="icon-btn" data-prev style="width:34px;height:34px">‹</button>
        <div class="m">${calYear}年${calMonth + 1}月</div>
        <button class="icon-btn" data-next style="width:34px;height:34px">›</button>
      </div>
      ${buildCalendar(dailyTasks)}
      <div class="muted" style="font-size:12px;margin-top:8px">红点：该日有未完成的每日任务</div>
    </div>`;

  const addRow = container.querySelector('#taskAdd');
  if (addRow) addRow.onclick = () => { dailyAdding = true; ctx.rerender(); };
  if (dailyAdding) {
    container.querySelector('#addTask').onclick = async () => {
      const c = container.querySelector('#tcontent').value.trim();
      if (!c) return toast('请输入内容');
      const time = container.querySelector('#ttime').value;
      await dbPut('tasks', { id: 'task_' + Date.now().toString(36), kind: 'daily', content: c, time: time || '', doneDates: [], createdAt: Date.now() });
      dailyAdding = false;
      toast('已添加');
      ctx.rerender();
    };
  }

  container.querySelector('[data-prev]').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } ctx.rerender(); };
  container.querySelector('[data-next]').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } ctx.rerender(); };

  container.querySelectorAll('.day[data-day]').forEach((el) => {
    el.onclick = () => { selDay = el.dataset.day; ctx.rerender(); };
  });

  container.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const t = await dbGet('tasks', b.dataset.toggle);
      const arr = t.doneDates || [];
      const i = arr.indexOf(selDay);
      if (i >= 0) arr.splice(i, 1); else arr.push(selDay);
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
