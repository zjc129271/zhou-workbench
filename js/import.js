// Excel 导入（基于全局 XLSX）
// 仅新增记录，绝不删除/覆盖已有数据。
import { dbAll, dbPut, addCategory } from './db.js';
import { uid, toast, openModal, closeModal } from './util.js';

// 类型识别：中文 / 英文  alike
const TYPE_MAP = {
  '收入': 'inc', '收': 'inc', 'in': 'inc', 'income': 'inc', 'incoming': 'inc',
  '支出': 'exp', '支': 'exp', 'out': 'exp', 'expense': 'exp', 'expenses': 'exp'
};

function findCol(header, keys) {
  for (const k of keys) {
    const i = header.findIndex((h) => h && String(h).includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

function parseAmount(v) {
  if (v == null) return NaN;
  const s = String(v).replace(/[¥￥,\s]/g, '');
  return parseFloat(s);
}

function parseTs(dateStr, timeStr) {
  if (dateStr == null || dateStr === '') return null;
  const ds = String(dateStr).trim();
  let m = ds.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = ds.match(/(\d{4})(\d{2})(\d{2})/); // YYYYMMDD
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return null;
  }
  let hh = 0, mm = 0;
  if (timeStr != null) {
    const tm = String(timeStr).match(/(\d{1,2})[:：](\d{2})/);
    if (tm) { hh = +tm[1]; mm = +tm[2]; }
  }
  const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt.getTime();
}

function parseType(v) {
  const s = String(v == null ? '' : v).trim();
  if (TYPE_MAP[s] !== undefined) return TYPE_MAP[s];
  if (/收|入|in|income|工资|奖金|理财|兼职/i.test(s)) return 'inc';
  if (/支|出|out|exp|expense|花|费/i.test(s)) return 'exp';
  return null;
}

// 解析 Excel 文件，批量写入 transactions。返回 {imported, skipped, total}
export async function importBill(file, { dedupe = false } = {}) {
  // CSV 用文本读，xls/xlsx 用 ArrayBuffer
  let wb;
  if (/\.csv$/i.test(file.name)) {
    wb = window.XLSX.read(await file.text(), { type: 'string' });
  } else {
    wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  }
  if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('文件中没有任何工作表');

  // 优先使用「账单」表（本应用导出的格式），否则取第一个
  const sheetName = wb.SheetNames.includes('账单') ? '账单' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (!rows.length) throw new Error('工作表为空');

  // 定位表头行（同时含日期类与金额类列）
  const headerIdx = rows.findIndex((r) =>
    r && r.some((c) => /日期|时间/.test(String(c))) && r.some((c) => /金额|数额|钱/.test(String(c))));
  if (headerIdx < 0) throw new Error('未找到含「日期/金额」的表头行，请确认表格格式');
  const header = rows[headerIdx].map((c) => String(c).trim());

  const ciDate = findCol(header, ['日期']);
  const ciTime = findCol(header, ['时间']);
  const ciType = findCol(header, ['类型']);
  const ciCat = findCol(header, ['类别', '分类']);
  const ciAmt = findCol(header, ['金额', '数额', '钱']);
  const ciNote = findCol(header, ['备注', '说明', '摘要']);
  if (ciDate < 0 || ciAmt < 0) throw new Error('缺少「日期」或「金额」列，无法导入');

  // 现有类别快照（用于自动新建缺失类别）
  const cats = await dbAll('categories');
  const catSet = new Set(cats.map((c) => (c.name || '') + '|' + (c.type || 'exp')));
  async function ensureCat(name, type) {
    const key = name + '|' + type;
    if (!catSet.has(key)) { await addCategory(name, type); catSet.add(key); }
  }

  // 去重：基于已有记录的 (ts|amount|category|note)
  let seen = null;
  if (dedupe) {
    const existing = await dbAll('transactions');
    seen = new Set(existing.map((t) => `${t.ts}|${t.amount}|${t.category}|${t.note || ''}`));
  }

  let imported = 0, skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === '')) continue;
    const ts = parseTs(row[ciDate], ciTime >= 0 ? row[ciTime] : '');
    const type = ciType >= 0 ? parseType(row[ciType]) : 'exp';
    const cat = ciCat >= 0 ? String(row[ciCat] || '').trim() : '';
    const amt = parseAmount(row[ciAmt]);
    const note = ciNote >= 0 ? String(row[ciNote] || '').trim() : '';
    if (ts == null || isNaN(amt) || amt === 0 || !cat) { skipped++; continue; }
    await ensureCat(cat, type || 'exp');
    const sig = `${ts}|${amt}|${cat}|${note}`;
    if (dedupe && seen.has(sig)) { skipped++; continue; }
    await dbPut('transactions', {
      id: 'tx_' + uid(),
      type: type || 'exp',
      amount: +amt.toFixed(2),
      category: cat,
      note,
      ts,
      createdAt: Date.now()
    });
    if (seen) seen.add(sig);
    imported++;
  }
  return { imported, skipped, total: imported + skipped };
}

// 导入弹窗（沿用项目自定义弹窗，避开 PWA 禁用的原生 confirm/prompt）
export function openImportModal(ctx) {
  const mask = openModal(`
    <div class="modal-card">
      <div class="modal-head">
        <div class="modal-card__title">导入账单 Excel</div>
        <button class="icon-btn" id="im-close" aria-label="关闭" style="font-size:18px">✕</button>
      </div>
      <div class="modal-card__body" style="padding:14px 18px">
        <p class="muted" style="font-size:13px;line-height:1.6;margin:0 0 10px">
          支持本应用「导出」的账单表（含 日期/类型/类别/金额/备注）。其它表格请尽量让表头含「日期、金额」等列。<br>
          <b>支持负数金额</b>：负数会原样导入并直接参与统计（如负支出冲减总额）。<br>
          仅<b>新增</b>记录，不会删除你手机上已有的数据。
        </p>
        <div class="field"><label>选择 Excel 文件</label><input class="input" id="im-file" type="file" accept=".xlsx,.xls,.csv" /></div>
        <label class="row" style="gap:8px;align-items:center;margin-top:8px;font-size:14px">
          <input type="checkbox" id="im-dedupe" /> 跳过重复记录（按 日期+金额+类别+备注 判断）
        </label>
        <div id="im-result" class="muted" style="font-size:13px;margin-top:10px;min-height:18px"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn--ghost" id="im-cancel">取消</button>
        <button class="btn" id="im-ok">开始导入</button>
      </div>
    </div>`);
  mask.querySelector('#im-close').onclick = () => closeModal(mask);
  mask.querySelector('#im-cancel').onclick = () => closeModal(mask);
  mask.querySelector('#im-ok').onclick = async () => {
    const f = mask.querySelector('#im-file').files[0];
    const dedupe = mask.querySelector('#im-dedupe').checked;
    const res = mask.querySelector('#im-result');
    if (!f) { toast('请先选择文件'); return; }
    res.textContent = '正在解析…';
    try {
      const r = await importBill(f, { dedupe });
      res.textContent = `完成：成功导入 ${r.imported} 条，跳过 ${r.skipped} 条。`;
      toast(`已导入 ${r.imported} 条`);
      setTimeout(() => { closeModal(mask); if (ctx && ctx.rerender) ctx.rerender(); }, 900);
    } catch (e) {
      res.textContent = '导入失败：' + (e && e.message ? e.message : e);
    }
  };
}
