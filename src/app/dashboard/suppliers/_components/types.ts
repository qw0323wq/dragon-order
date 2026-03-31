// ── 供應商管理共用型別 + 常數 ──

export interface Supplier {
  id: number
  name: string
  category: string
  contact: string | null
  phone: string | null
  notes: string | null
  noDeliveryDays: number[]
  leadDays: number
  paymentType: string
  isActive: boolean
  itemsCount: number
  companyName: string | null
  taxId: string | null
  address: string | null
  deliveryDays: number | null
  freeShippingMin: number | null
}

export interface SupplierFormData {
  name: string
  category: string
  contact: string
  phone: string
  no_delivery: string
  paymentType: string
  memo: string
  companyName: string
  taxId: string
  address: string
  deliveryDays: string
  freeShippingMin: string
}

export const EMPTY_FORM: SupplierFormData = {
  name: '',
  category: '',
  contact: '',
  phone: '',
  no_delivery: '',
  paymentType: '月結',
  memo: '',
  companyName: '',
  taxId: '',
  address: '',
  deliveryDays: '',
  freeShippingMin: '',
}

export const CATEGORY_COLORS: Record<string, string> = {
  肉品: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  海鮮: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  蔬菜: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  火鍋料: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  酒水: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  大陸: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  市場: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  雜貨: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  耗材: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
}

export const PAYMENT_TYPE_STYLES: Record<string, string> = {
  現結: 'bg-red-100 text-red-700 border-red-200',
  月結: 'bg-blue-100 text-blue-700 border-blue-200',
}

export const CATEGORIES = ['肉品', '海鮮', '蔬菜', '火鍋料', '酒水', '大陸', '市場', '雜貨', '耗材', '其他']
export const PAYMENT_TYPES = ['現結', '月結']
