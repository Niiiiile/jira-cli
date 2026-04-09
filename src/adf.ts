/** Atlassian Document Format からプレーンテキストを抽出（簡易） */
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

/** 1 行でも複数行でも ADF doc に変換（課題の description 用） */
export function plainTextToAdfBody(text: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/)
  const content = lines.map((line) => ({
    type: 'paragraph',
    content: line.length ? [{ type: 'text', text: line }] : [],
  }))
  return {
    type: 'doc',
    version: 1,
    content: content.length ? content : [{ type: 'paragraph', content: [] }],
  }
}
