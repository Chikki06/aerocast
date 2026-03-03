// Simple client-side event emitter for UI events
type Callback = () => void;

const listeners = new Set<Callback>();

export function onDashboardClose(cb: Callback) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function offDashboardClose(cb: Callback) {
  listeners.delete(cb);
}

export function emitDashboardClose() {
  for (const cb of Array.from(listeners)) {
    try {
      cb();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("ui-events listener error", e);
    }
  }
}

export default { onDashboardClose, offDashboardClose, emitDashboardClose };
