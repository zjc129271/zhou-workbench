import { dbAll, dbGet, dbPut, dbDelete } from '../db.js';
import { fmtDateTime, dtLocalToTs, dateStr, esc, toast, confirmModal, trashIcon } from '../util.js';

let memoAdding = false;

function itemHtml(m) {
  const when = m.remindAt ? fmtDateTime(m.remindAt) : '无提醒时间';
  return `<li class="list-item ${m.done ? 'done' : ''}">
    <button class="check" data-toggle="${m.id}" aria-label="完成切换"></button>
    <div class="list-item__main">
      <div class="list-item__title">${esc(m.content)}</div>
      <div class="list-item__sub">${when}</div>
    </div>
    <button class="del-btn" data-del="${m.id}" aria-label="删除">${trashIcon()}</button>
  </li>`;
}

function addFormHtml() {
  return `<div class="add-form">
    <textarea class="textarea" id="mcontent" placeholder="临时想法、待办杂事、口头约定…" style="min-height:60px"></textarea>
    <input class="input" id="mtime" type="datetime-local" style="margin-top:8px" />
    <div class="row" style="margin-top:8px">
      <button class="btn btn--sm" id="saveMemo" style="flex:1">保存</button>
      <button class="btn btn--sm btn--ghost" id="cancelMemo" style="flex:0 0 80px">取消</button>
    </div>
  </div>`;
}

export async function render(container, ctx) {
  const memos = await dbAll('memos');
  const sorted = memos.slice().sort((a, b) => {
    const ra = a.remindAt == null ? Infinity : a.remindAt;
    const rb = b.remindAt == null ? Infinity : b.remindAt;
    if (ra !== rb) return ra - rb;
    return b.createdAt - a.createdAt;
  });

  container.innerHTML = `
    <div class="card">
      <div class="card__title">全部备忘 <span class="muted" style="font-weight:400;font-size:13px">${memos.length} 条</span></div>
      ${sorted.length ? `<ul class="list">${sorted.map(itemHtml).join('')}</ul>` : ''}
      ${memoAdding ? addFormHtml() : `<div class="add-row" id="memoAdd">＋ 点击空白处添加备忘</div>`}
    </div>`;

  const addRow = container.querySelector('#memoAdd');
  if (addRow) addRow.onclick = () => { memoAdding = true; ctx.rerender(); };

  if (memoAdding) {
    container.querySelector('#saveMemo').onclick = async () => {
      const content = container.querySelector('#mcontent').value.trim();
      const t = container.querySelector('#mtime').value;
      if (!content) return toast('请输入内容');
      const remindAt = t ? dtLocalToTs(t) : null;
      await dbPut('memos', { id: 'memo_' + Date.now().toString(36), content, remindAt, done: false, notified: false, createdAt: Date.now() });
      memoAdding = false;
      toast('已添加');
      ctx.rerender();
    };
    container.querySelector('#cancelMemo').onclick = () => { memoAdding = false; ctx.rerender(); };
  }

  container.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const m = await dbGet('memos', b.dataset.toggle);
      m.done = !m.done;
      await dbPut('memos', m);
      ctx.rerender();
    };
  });
  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmModal('删除这条备忘？', { danger: true, okText: '删除' }))) return;
      await dbDelete('memos', b.dataset.del);
      ctx.rerender();
    };
  });
}
