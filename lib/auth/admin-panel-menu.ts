const OPEN_EVENT = "admin-panel-menu:open";
const bus = new EventTarget();

export function openAdminPanelMenu(): void {
  bus.dispatchEvent(new Event(OPEN_EVENT));
}

export function subscribeAdminPanelMenu(cb: () => void): () => void {
  bus.addEventListener(OPEN_EVENT, cb);
  return () => bus.removeEventListener(OPEN_EVENT, cb);
}
