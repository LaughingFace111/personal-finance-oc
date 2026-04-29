/**
 * 🛡️ L: 全局应用状态管理器
 * 解决跨页面数据同步问题：分期执行/平账后，Dashboard 等页面无需 F5 即可看到最新数据
 */
import { create } from 'zustand'

const SHOW_HIDDEN_STORAGE_KEY = 'app:show-hidden-transactions'
const SHOW_TEMPLATE_AMOUNTS_STORAGE_KEY = 'app:show-template-amounts'

const readBool = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw == null) return fallback
  return raw === 'true'
}

interface AppStore {
  /** 全局刷新计数器 — 任何页面修改了账户数据后 +1，监听此值的页面自动重新拉取 */
  refreshVersion: number
  /** 触发一次全局刷新 */
  triggerRefresh: () => void

  /** 信用账户待还摘要是否需要刷新 */
  creditSummaryDirty: boolean
  markCreditSummaryDirty: () => void
  clearCreditSummaryDirty: () => void

  /** 🛡️ L: 隐身账单透视开关（默认关闭） */
  showHiddenTransactions: boolean
  toggleHiddenTransactions: () => void

  /** 快捷模板金额显示开关 */
  showTemplateAmounts: boolean
  setShowTemplateAmounts: (value: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  refreshVersion: 0,
  triggerRefresh: () => set((s) => ({ refreshVersion: s.refreshVersion + 1 })),

  creditSummaryDirty: false,
  markCreditSummaryDirty: () => set({ creditSummaryDirty: true }),
  clearCreditSummaryDirty: () => set({ creditSummaryDirty: false }),

  showHiddenTransactions: readBool(SHOW_HIDDEN_STORAGE_KEY, false),
  toggleHiddenTransactions: () => set((s) => {
    const next = !s.showHiddenTransactions
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHOW_HIDDEN_STORAGE_KEY, String(next))
    }
    return { showHiddenTransactions: next }
  }),

  showTemplateAmounts: readBool(SHOW_TEMPLATE_AMOUNTS_STORAGE_KEY, true),
  setShowTemplateAmounts: (value: boolean) => set(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHOW_TEMPLATE_AMOUNTS_STORAGE_KEY, String(value))
    }
    return { showTemplateAmounts: value }
  }),
}))
