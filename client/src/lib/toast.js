// Petit store global pour afficher un toast depuis n'importe quel module
let snapshot = { msg: '', visible: false };
const listeners = new Set();
let timer;

function set(next) {
  snapshot = next;
  listeners.forEach(fn => fn());
}

export function toast(msg) {
  set({ msg, visible: true });
  clearTimeout(timer);
  timer = setTimeout(() => set({ ...snapshot, visible: false }), 3000);
}

export const subscribeToast = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getToast = () => snapshot;
