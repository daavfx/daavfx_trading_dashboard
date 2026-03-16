let storageDisabled = false;

const isQuotaError = (err: unknown): boolean => {
  const msg = String(err ?? "").toLowerCase();
  return msg.includes("quotaexceedederror") || msg.includes("quota exceeded");
};

export const safeSetItem = (key: string, value: string): boolean => {
  if (storageDisabled) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (isQuotaError(err)) {
      storageDisabled = true;
    }
    return false;
  }
};

export const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeRemoveItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const isStorageDisabled = (): boolean => storageDisabled;
