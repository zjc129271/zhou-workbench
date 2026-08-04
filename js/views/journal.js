import { dbAll, dbPut, dbDelete } from '../db.js';
import { dateStr, fmtDate, tsToDtLocal } from '../util.js';
import { exportJournal } from '../export.js';
import { toast, promptModal, confirmModal, trashIcon } from '../util.js';

let selColl = 'all';

function entryHtml(j) {
  let media = '';
  if (j.kind === 'image' && j.media) {
    const url = URL.createObjectURL(j.media);
    media = `<div style="margin-top:8px"><img src="${url}" style="max-width:100%;border-radius:10px;max-height:200px" /></div>`;
  } else if (j.kind === 'link') {
    media = `<div style="margin-top:6px"><a href="${escapeHtml(j.url)}" target="_blank" rel="noopener" class="link-btn">${escapeHtml(j.url)}</a></div>`;
  }
  const kindLabel = j.kind === 'image' ? '🖼 图片' : j.kind === 'link' ? '🔗 链接' : '📝 文字';
  return `<li class="list-item">
      <div class="list-item__main">
      <div class="list-item__title">${kindLabel} <span class="muted" style="font-weight:400;font-size:12px">${fmtDate(j.ts)}</span></div>
      ${j.text ? `<div style="margin-top:4px;white-space:pre-wrap">${escapeHtml(j.text)}</div>` : ''}
      ${media}
    </div>
    <button class="del-btn" data-del="${j.id}" aria-label="删除">${trashIcon()}</button>
  </li>`;
}

export async function render(container, ctx) {
  const [cols, entriesAll] = await Promise.all([dbAll('collections'), dbAll('journal')]);
  const entries = selColl === 'all' ? entriesAll : entriesAll.filter((j) => j.collectionId === selColl);
  entries.sort((a, b) => b.ts - a.ts);
  const colMap = {}; cols.forEach((c) => colMap[c.id] = c.name);

  container.innerHTML = `
    <div class="card">
      <div class="card__title">合集 <button class="link-btn" id="addColl">+ 添加</button></div>
      <div class="chips" id="collChips">
        <span class="chip ${selColl === 'all' ? 'active' : ''}" data-coll="all">全部</span>
        ${cols.map((c) => `<span class="chip ${selColl === c.id ? 'active' : ''}" data-coll="${c.id}">${escapeHtml(c.name)}</span>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card__title">记录一笔</div>
      <div class="seg" style="margin-bottom:12px" id="kindSeg">
        <button class="active" data-kind="text">文字</button>
        <button data-kind="image">图片</button>
        <button data-kind="link">链接</button>
      </div>
      <div class="field"><label>合集</label><select class="select" id="jcoll">${cols.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') || '<option value="">（先添加合集）</option>'}</select></div>
      <div class="field"><label>内容</label><textarea class="textarea" id="jtext" placeholder="一日总结、情绪、感恩、小确幸…"></textarea></div>
      <div class="field" id="imgField" style="display:none"><label>图片</label><input class="input" id="jimg" type="file" accept="image/*" /></div>
      <div class="field" id="linkField" style="display:none"><label>链接</label><input class="input" id="jlink" placeholder="https://" /></div>
      <button class="btn" id="addEntry">保存记录</button>
    </div>

    <div class="card">
      <div class="card__title">记录列表 <span class="muted" style="font-weight:400;font-size:13px">${entries.length}</span>
        <button class="link-btn" id="expJ">导出</button></div>
      ${entries.length ? `<ul class="list">${entries.map(entryHtml).join('')}</ul>` : `<div class="empty">还没有记录</div>`}
    </div>`;

  let curKind = 'text';
  container.querySelectorAll('#kindSeg button').forEach((b) => {
    b.onclick = () => {
      curKind = b.dataset.kind;
      container.querySelectorAll('#kindSeg button').forEach((x) => x.classList.toggle('active', x === b));
      container.querySelector('#imgField').style.display = curKind === 'image' ? '' : 'none';
      container.querySelector('#linkField').style.display = curKind === 'link' ? '' : 'none';
    };
  });

  container.querySelectorAll('[data-coll]').forEach((c) => {
    c.onclick = () => { selColl = c.dataset.coll; ctx.rerender(); };
  });

  container.querySelector('#addColl').onclick = async () => {
    const name = await promptModal('合集名称（如：一日总结、情绪、健康、感恩）：');
    if (!name) return;
    await dbPut('collections', { id: 'coll_' + Date.now().toString(36), name });
    toast('已创建合集');
    ctx.rerender();
  };

  container.querySelector('#addEntry').onclick = async () => {
    const collId = container.querySelector('#jcoll').value;
    if (!collId) return toast('请先添加合集');
    const text = container.querySelector('#jtext').value.trim();
    let media = null, url = '';
    if (curKind === 'image') {
      const f = container.querySelector('#jimg').files[0];
      if (!f && !text) return toast('请选择图片或填写说明');
      media = f || null;
    } else if (curKind === 'link') {
      url = container.querySelector('#jlink').value.trim();
      if (!url) return toast('请输入链接');
    } else {
      if (!text) return toast('请输入内容');
    }
    await dbPut('journal', { id: 'jr_' + Date.now().toString(36), collectionId: collId, kind: curKind, text, url, media, ts: Date.now(), tags: [] });
    toast('已保存');
    ctx.rerender();
  };

  container.querySelector('#expJ').onclick = () => {
    const name = selColl === 'all' ? '全部记录' : colMap[selColl];
    exportJournal(selColl === 'all' ? null : selColl, name);
  };

  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmModal('删除这条记录？', { danger: true, okText: '删除' }))) return;
      await dbDelete('journal', b.dataset.del);
      ctx.rerender();
    };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
