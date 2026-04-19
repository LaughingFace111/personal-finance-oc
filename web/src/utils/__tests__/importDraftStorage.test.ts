import { clearImportDraft, loadImportDraft, saveImportDraft } from '../importDraftStorage';

type TestDraftRow = {
  tempId: string;
  amount: number;
};

type MockSessionStorage = Storage & {
  reset: () => void;
};

type VitestAPI = {
  beforeEach: (handler: () => void) => void;
  describe: (name: string, handler: () => void) => void;
  expect: (value: unknown) => {
    toBe: (expected: unknown) => void;
    toBeNull: () => void;
    toEqual: (expected: unknown) => void;
  };
  it: (name: string, handler: () => void) => void;
};

declare global {
  interface ImportMeta {
    vitest?: VitestAPI;
  }
}

function createMockSessionStorage(): MockSessionStorage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    reset() {
      store.clear();
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const vitest = import.meta.vitest;

if (vitest) {
  const storage = createMockSessionStorage();
  const testWindow = globalThis as typeof globalThis & {
    sessionStorage?: Storage;
  };

  testWindow.sessionStorage = storage;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: testWindow,
  });

  vitest.beforeEach(() => {
    storage.reset();
  });

  vitest.describe('importDraftStorage', () => {
    vitest.it('saves and loads draft correctly', () => {
      const draft = {
        rows: [{ tempId: 'row-1', amount: 10 }],
        selectedRowIds: new Set(['row-1']),
        timestamp: 123,
      };

      saveImportDraft<TestDraftRow>('parse-1', draft);

      expectLoadedDraft(loadImportDraft<TestDraftRow>('parse-1'), {
        rows: draft.rows,
        selectedRowIds: ['row-1'],
        timestamp: 123,
      }, vitest.expect);
    });

    vitest.it('returns null for nonexistent parseId', () => {
      vitest.expect(loadImportDraft<TestDraftRow>('missing-parse')).toBeNull();
    });

    vitest.it('clear removes draft', () => {
      saveImportDraft<TestDraftRow>('parse-1', {
        rows: [{ tempId: 'row-1', amount: 10 }],
        selectedRowIds: new Set(['row-1']),
        timestamp: 123,
      });

      clearImportDraft('parse-1');

      vitest.expect(loadImportDraft<TestDraftRow>('parse-1')).toBeNull();
    });

    vitest.it('isolates drafts by parseId', () => {
      saveImportDraft<TestDraftRow>('parse-1', {
        rows: [{ tempId: 'row-1', amount: 10 }],
        selectedRowIds: new Set(['row-1']),
        timestamp: 123,
      });
      saveImportDraft<TestDraftRow>('parse-2', {
        rows: [{ tempId: 'row-2', amount: 20 }],
        selectedRowIds: new Set(['row-2']),
        timestamp: 456,
      });

      expectLoadedDraft(loadImportDraft<TestDraftRow>('parse-1'), {
        rows: [{ tempId: 'row-1', amount: 10 }],
        selectedRowIds: ['row-1'],
        timestamp: 123,
      }, vitest.expect);
      expectLoadedDraft(loadImportDraft<TestDraftRow>('parse-2'), {
        rows: [{ tempId: 'row-2', amount: 20 }],
        selectedRowIds: ['row-2'],
        timestamp: 456,
      }, vitest.expect);
    });

    vitest.it('overwrites older draft with newer data', () => {
      saveImportDraft<TestDraftRow>('parse-1', {
        rows: [{ tempId: 'row-1', amount: 10 }],
        selectedRowIds: new Set(['row-1']),
        timestamp: 123,
      });
      saveImportDraft<TestDraftRow>('parse-1', {
        rows: [{ tempId: 'row-1', amount: 99 }],
        selectedRowIds: new Set(),
        timestamp: 456,
      });

      expectLoadedDraft(loadImportDraft<TestDraftRow>('parse-1'), {
        rows: [{ tempId: 'row-1', amount: 99 }],
        selectedRowIds: [],
        timestamp: 456,
      }, vitest.expect);
    });
  });
}

function expectLoadedDraft(
  draft: { rows: TestDraftRow[]; selectedRowIds: Set<string>; timestamp: number } | null,
  expected: { rows: TestDraftRow[]; selectedRowIds: string[]; timestamp: number },
  expectFn: VitestAPI['expect'],
) {
  if (!draft) {
    throw new Error('Expected draft to be present');
  }
  expectFn(draft?.rows).toEqual(expected.rows);
  expectFn(Array.from(draft?.selectedRowIds ?? [])).toEqual(expected.selectedRowIds);
  expectFn(draft?.timestamp).toBe(expected.timestamp);
}
