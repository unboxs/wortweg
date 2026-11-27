import type { SqlJsStatic } from 'sql.js'

let pending: Promise<SqlJsStatic> | null = null

/** 只在用户导入时加载。浏览器里读的是打包进本站的 wasm，不是牌组，也不会把牌组发出去。 */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!pending) pending = initSql()
  return pending
}

async function initSql(): Promise<SqlJsStatic> {
  const mod = await import('sql.js')
  const initSqlJs = mod.default
  if (typeof window === 'undefined') return initSqlJs()
  const wasmMod = await import('sql.js/dist/sql-wasm.wasm?url')
  const response = await fetch(wasmMod.default)
  if (!response.ok) throw new Error('无法加载本机的牌组解析组件')
  const wasmBinary = await response.arrayBuffer()
  return initSqlJs({ wasmBinary })
}
