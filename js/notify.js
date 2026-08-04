// 提醒扫描：应用打开时定期检查到点的备忘并弹系统通知
import { dbAll, dbPut } from './db.js';
import { notify, ensureNotifyPermission } from './util.js';

let timer = null;

export async function startNotifier() {
  const perm = await ensureNotifyPermission();
  if (perm !== 'granted') return perm; // 未授权则不轮询
  const tick = async () => {
    try {
      const memos = await dbAll('memos');
      const now = Date.now();
      for (const m of memos) {
        if (m.done) continue;
        if (m.notified) continue;
        if (m.remindAt && m.remindAt <= now) {
          notify('备忘提醒', m.content);
          m.notified = true;
          await dbPut('memos', m);
        }
      }
    } catch (e) { /* ignore */ }
  };
  await tick();
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 30000);
  return 'granted';
}

export function stopNotifier() {
  if (timer) clearInterval(timer);
  timer = null;
}
