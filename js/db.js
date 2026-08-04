// IndexedDB 数据层封装

const DB_NAME = 'life-workbench';
const DB_VERSION = 1;

const STORES = ['transactions', 'categories', 'budgets', 'memos', 'tasks', 'collections', 'journal', 'settings'];

// 预设类别：支出 / 收入 两类
const EXPENSE_PRESET = ['餐饮', '交通', '购物', '住房', '娱乐', '人情', '医疗', '日用', '学习', '其他'];
const INCOME_PRESET = ['工资', '奖金', '理财', '兼职', '其他收入'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('transactions')) {
        const s = db.createObjectStore('transactions', { keyPath: 'id' });
        s.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets', { keyPath: 'month' });
      if (!db.objectStoreNames.contains('memos')) {
        const s = db.createObjectStore('memos', { keyPath: 'id' });
        s.createIndex('remindAt', 'remindAt');
      }
      if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('journal')) {
        const s = db.createObjectStore('journal', { keyPath: 'id' });
        s.createIndex('collectionId', 'collectionId');
        s.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let req;
    if (fn) req = fn(os);
    // 始终返回请求的真实结果；缺失记录时 result 为 undefined（而不是把 IDBRequest 当结果返回）
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function dbGet(store, key) { return run(store, 'readonly', (os) => os.get(key)); }
export async function dbAll(store) { return run(store, 'readonly', (os) => os.getAll()); }
export async function dbPut(store, value) { return run(store, 'readwrite', (os) => os.put(value)); }
export async function dbDelete(store, key) { return run(store, 'readwrite', (os) => os.delete(key)); }
export async function dbClear(store) { return run(store, 'readwrite', (os) => os.clear()); }

// 设置项（单值）
export async function getSetting(key, def) {
  const r = await dbGet('settings', key);
  return r ? r.value : def;
}
export async function setSetting(key, value) {
  return dbPut('settings', { key, value });
}

// 初始化：预设类别(分收/支) + 默认主题 + 旧数据迁移
let seeded = null;
export async function seedIfNeeded() {
  if (seeded) return seeded;
  const cats = await dbAll('categories');

  // 首次：写入预设类别（带类型）
  if (cats.length === 0) {
    for (const name of EXPENSE_PRESET) await dbPut('categories', { id: 'cat_' + name, name, preset: true, type: 'exp' });
    for (const name of INCOME_PRESET) await dbPut('categories', { id: 'cat_' + name, name, preset: true, type: 'inc' });
  } else {
    // 迁移：旧类别没有 type 的归为支出；确保存在收入预设
    let dirty = false;
    for (const c of cats) {
      if (!c.type) { c.type = 'exp'; await dbPut('categories', c); dirty = true; }
    }
    const hasIncome = cats.some((c) => c.type === 'inc');
    if (!hasIncome) {
      for (const name of INCOME_PRESET) await dbPut('categories', { id: 'cat_' + name, name, preset: true, type: 'inc' });
    }
    if (dirty) { /* noop */ }
  }

  const theme = await getSetting('theme', null);
  if (theme === null) await setSetting('theme', 'auto');
  seeded = true;
  return true;
}

export async function getAllCategories() {
  const cats = await dbAll('categories');
  return cats.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'exp' ? -1 : 1;
    return (a.preset === b.preset) ? a.name.localeCompare(b.name) : (a.preset ? -1 : 1);
  });
}
export async function getCategoriesByType(type) {
  const cats = await getAllCategories();
  return cats.filter((c) => (c.type || 'exp') === type);
}
export async function addCategory(name, type = 'exp') {
  const n = name.trim();
  if (!n) return { ok: false, msg: '类别名不能为空' };
  const cats = await dbAll('categories');
  if (cats.some((c) => c.name === n && (c.type || 'exp') === type)) return { ok: false, msg: '该类型下类别已存在' };
  await dbPut('categories', { id: 'cat_' + n + '_' + Date.now().toString(36), name: n, preset: false, type });
  return { ok: true };
}
export async function deleteCategory(id) {
  const cat = await dbGet('categories', id);
  if (!cat) return { ok: false, msg: '类别不存在' };
  const txs = await dbAll('transactions');
  if (txs.some((t) => t.category === cat.name && (t.type || 'exp') === (cat.type || 'exp'))) {
    return { ok: false, msg: '该类别下还有账单，无法删除' };
  }
  await dbDelete('categories', id);
  return { ok: true };
}

// 预算：按月 + 按类别（keyPath=month，值为 {month, budgets:{cat:amount}}）
export async function getBudgetMap(month) {
  const r = await dbGet('budgets', month);
  return (r && r.budgets) || {};
}
export async function setBudget(month, cat, amount) {
  const r = await dbGet('budgets', month);
  const obj = r ? { ...r, budgets: { ...(r.budgets || {}) } } : { month, budgets: {} };
  if (amount > 0) obj.budgets[cat] = +amount.toFixed(2);
  else delete obj.budgets[cat];
  await dbPut('budgets', obj);
}

export { STORES };
