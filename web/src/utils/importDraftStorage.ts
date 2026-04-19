const IMPORT_DRAFT_PREFIX = 'import-draft:';

type StoredImportDraft<Row> = {
  rows: Row[];
  selectedRowIds: string[];
  timestamp: number;
};

export type ImportDraft<Row> = {
  rows: Row[];
  selectedRowIds: Set<string>;
  timestamp: number;
};

function getDraftKey(parseId: string) {
  return `${IMPORT_DRAFT_PREFIX}${parseId}`;
}

function getSessionStorage(): Storage | null {
  const storageHost =
    typeof window !== 'undefined'
      ? window
      : (globalThis as typeof globalThis & { sessionStorage?: Storage });

  if (!('sessionStorage' in storageHost) || !storageHost.sessionStorage) {
    return null;
  }

  try {
    return storageHost.sessionStorage;
  } catch {
    return null;
  }
}

export function saveImportDraft<Row>(parseId: string, draft: ImportDraft<Row>) {
  if (!parseId) return;

  const storage = getSessionStorage();
  if (!storage) return;

  const payload: StoredImportDraft<Row> = {
    rows: draft.rows,
    selectedRowIds: Array.from(draft.selectedRowIds),
    timestamp: draft.timestamp,
  };

  try {
    storage.setItem(getDraftKey(parseId), JSON.stringify(payload));
  } catch {
    // Ignore storage quota and serialization failures for best-effort drafts.
  }
}

export function loadImportDraft<Row>(parseId: string): ImportDraft<Row> | null {
  if (!parseId) return null;

  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(getDraftKey(parseId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredImportDraft<Row>>;
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.selectedRowIds) || typeof parsed.timestamp !== 'number') {
      return null;
    }

    return {
      rows: parsed.rows,
      selectedRowIds: new Set(parsed.selectedRowIds.filter((value): value is string => typeof value === 'string')),
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export function clearImportDraft(parseId: string) {
  if (!parseId) return;

  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(getDraftKey(parseId));
  } catch {
    // Ignore storage access failures.
  }
}

export function clearAllImportDrafts() {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(IMPORT_DRAFT_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage access failures.
  }
}
