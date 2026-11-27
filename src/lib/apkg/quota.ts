/** 浏览器拒绝写入时的几种名字。Chrome、Firefox、Safari 并不统一。 */
export function isQuotaError(err: unknown): boolean {
  if (!err || (typeof err !== 'object' && typeof err !== 'string')) return false
  if (typeof err === 'string') return /quota/i.test(err)
  const record = err as { name?: string; code?: number; message?: string; inner?: unknown }
  if (record.name === 'QuotaExceededError' || record.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  if (record.code === 22 || record.code === 1014) return true
  if (record.inner && isQuotaError(record.inner)) return true
  return typeof record.message === 'string' && /quota|exceeded the quota|storage/i.test(record.message)
}
