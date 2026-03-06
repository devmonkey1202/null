export type StorageParser<T> = (raw: string | null) => T;
export type StorageSerializer<T> = (value: T) => string;

const EVENT_NAME = "null-storage-sync";

export function readStorageKey<T>(key: string, parse: StorageParser<T>, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return fallback;
  }
}

export function writeStorageKey<T>(key: string, value: T, serialize: StorageSerializer<T>) {
  if (typeof window === "undefined") return;
  let raw = "";
  try {
    raw = serialize(value);
    localStorage.setItem(key, raw);
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key, raw } }));
  } catch {
    // ignore
  }
}

export function subscribeStorageKey<T>(key: string, parse: StorageParser<T>, onChange: (value: T) => void) {
  if (typeof window === "undefined") return () => {};
  const handleValue = (raw: string | null) => {
    try {
      onChange(parse(raw));
    } catch {
      // ignore parse errors
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    handleValue(event.newValue);
  };
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ key: string; raw: string }>).detail;
    if (!detail || detail.key !== key) return;
    handleValue(detail.raw ?? null);
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, onCustom as EventListener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, onCustom as EventListener);
  };
}
