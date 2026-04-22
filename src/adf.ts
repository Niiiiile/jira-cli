import { adfToMarkdown } from './adf-to-md.js'
import { markdownToAdf, markdownToAdfSync } from './md-to-adf.js'

/**
 * ADF ノードからプレーンテキストを抽出する簡易関数。書式は落ちる。
 *
 * 書式（Markdown）を保持したい場合は {@link adfToMarkdown} を使うこと。
 * 互換のため残してある。
 */
export function plainTextFromAdf(node: unknown): string {
  if (node == null) return ''
  if (typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (n.type === 'mention') {
    const a = n.attrs as Record<string, unknown> | undefined
    if (a && typeof a.text === 'string') return a.text
    if (a && typeof a.id === 'string') return `@[${a.id}]`
    return ''
  }
  if (!Array.isArray(n.content)) return ''
  const inner = n.content.map((c) => plainTextFromAdf(c)).filter(Boolean)
  if (n.type === 'paragraph' || n.type === 'heading') {
    return inner.join('') + '\n'
  }
  return inner.join('\n')
}

/**
 * Markdown 文字列（またはプレーンテキスト）を ADF doc に変換する。
 * `@[...]` メンションは解決せず placeholder として残る。
 *
 * メンションも解決したい場合は {@link markdownToAdf} を使用すること。
 */
export function plainTextToAdfBody(text: string): Record<string, unknown> {
  return markdownToAdfSync(text)
}

export { adfToMarkdown, markdownToAdf, markdownToAdfSync }
