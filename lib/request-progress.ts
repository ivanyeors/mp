export type RequestProgressListener = (activeApiRequests: number) => void;

let activeApiRequests = 0;
const listeners = new Set<RequestProgressListener>();

function emit() {
  for (const listener of listeners) listener(activeApiRequests);
}

export function getActiveApiRequests(): number {
  return activeApiRequests;
}

export function incrementActiveApiRequests(): void {
  activeApiRequests += 1;
  emit();
}

export function decrementActiveApiRequests(): void {
  activeApiRequests = Math.max(0, activeApiRequests - 1);
  emit();
}

export function subscribeActiveApiRequests(listener: RequestProgressListener): () => void {
  listeners.add(listener);
  // Push current state immediately so UI can render deterministically.
  listener(activeApiRequests);
  return () => {
    listeners.delete(listener);
  };
}
