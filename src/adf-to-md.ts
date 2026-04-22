type Mark = {
  type?: string
  attrs?: Record<string, unknown>
}

type AdfNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: AdfNode[]
  marks?: Mark[]
}

function toNode(value: unknown): AdfNode | null {
  if (value && typeof value === 'object') return value as AdfNode
  return null
}

function childNodes(n: AdfNode): AdfNode[] {
  if (!Array.isArray(n.content)) return []
  return n.content.map((c) => toNode(c)).filter((c): c is AdfNode => c != null)
}

function getAttr(n: AdfNode, key: string): unknown {
  if (!n.attrs || typeof n.attrs !== 'object') return undefined
  return (n.attrs as Record<string, unknown>)[key]
}

function renderInlineNode(n: AdfNode): string {
  if (n.type === 'text' && typeof n.text === 'string') {
    let s = n.text
    const marks = Array.isArray(n.marks) ? n.marks : []
    const has = (t: string) => marks.some((m) => m?.type === t)

    if (has('code')) {
      return '`' + s + '`'
    }
    if (has('strike')) s = `~~${s}~~`
    if (has('em')) s = `*${s}*`
    if (has('strong')) s = `**${s}**`
    const link = marks.find((m) => m?.type === 'link')
    if (link) {
      const href = typeof link.attrs?.href === 'string' ? link.attrs.href : ''
      s = `[${s}](${href})`
    }
    return s
  }

  if (n.type === 'mention') {
    const text = getAttr(n, 'text')
    if (typeof text === 'string' && text.length > 0) return text
    const id = getAttr(n, 'id')
    if (typeof id === 'string') return `@[${id}]`
    return ''
  }

  if (n.type === 'hardBreak') return '\n'

  if (n.type === 'emoji') {
    const shortName = getAttr(n, 'shortName')
    if (typeof shortName === 'string') return shortName
    const textAttr = getAttr(n, 'text')
    return typeof textAttr === 'string' ? textAttr : ''
  }

  if (n.type === 'inlineCard' || n.type === 'blockCard') {
    const url = getAttr(n, 'url')
    return typeof url === 'string' ? url : ''
  }

  if (Array.isArray(n.content)) {
    return renderInlineChildren(n)
  }

  return ''
}

function renderInlineChildren(n: AdfNode): string {
  return childNodes(n).map(renderInlineNode).join('')
}

function renderBlock(n: AdfNode): string {
  switch (n.type) {
    case 'paragraph':
      return renderInlineChildren(n)

    case 'heading': {
      const raw = Number(getAttr(n, 'level'))
      const level = Number.isFinite(raw) ? Math.max(1, Math.min(6, raw)) : 1
      return '#'.repeat(level) + ' ' + renderInlineChildren(n)
    }

    case 'codeBlock': {
      const langAttr = getAttr(n, 'language')
      const lang = typeof langAttr === 'string' ? langAttr : ''
      const text = childNodes(n)
        .map((c) => (typeof c.text === 'string' ? c.text : ''))
        .join('')
      return '```' + lang + '\n' + text + '\n```'
    }

    case 'blockquote': {
      const inner = renderBlocks(childNodes(n))
      if (!inner.length) return '>'
      return inner
        .split('\n')
        .map((l) => (l.length ? `> ${l}` : '>'))
        .join('\n')
    }

    case 'bulletList':
      return childNodes(n)
        .map((li) => renderListItem(li, '- '))
        .join('\n')

    case 'orderedList': {
      const startRaw = Number(getAttr(n, 'order'))
      const start = Number.isFinite(startRaw) && startRaw > 0 ? startRaw : 1
      return childNodes(n)
        .map((li, idx) => renderListItem(li, `${start + idx}. `))
        .join('\n')
    }

    case 'taskList':
      return childNodes(n).map(renderTaskItem).join('\n')

    case 'taskItem':
      return renderTaskItem(n)

    case 'rule':
      return '---'

    case 'mediaGroup':
    case 'mediaSingle':
      return '[media]'

    case 'table':
      return renderTable(n)

    case 'panel': {
      const inner = renderBlocks(childNodes(n))
      return inner
        .split('\n')
        .map((l) => (l.length ? `> ${l}` : '>'))
        .join('\n')
    }

    default:
      if (Array.isArray(n.content)) return renderBlocks(childNodes(n))
      if (typeof n.text === 'string') return n.text
      return ''
  }
}

function renderListItem(item: AdfNode, bullet: string): string {
  const inner = renderBlocks(childNodes(item))
  const [head, ...rest] = inner.split('\n')
  const indent = ' '.repeat(bullet.length)
  return [bullet + (head ?? ''), ...rest.map((l) => (l.length ? indent + l : l))].join('\n')
}

function renderTaskItem(item: AdfNode): string {
  const state = getAttr(item, 'state') === 'DONE' ? 'x' : ' '
  const inner = renderInlineChildren(item).replace(/\n+/g, ' ')
  return `- [${state}] ${inner}`
}

function renderTable(n: AdfNode): string {
  const rows = childNodes(n).filter((r) => r.type === 'tableRow')
  if (!rows.length) return ''
  const cellText = (cell: AdfNode) =>
    childNodes(cell)
      .map((b) => renderBlock(b))
      .join(' ')
      .replace(/\n+/g, ' ')
      .trim() || ' '
  const head = rows[0]
  const body = rows.slice(1)
  const headCells = childNodes(head).map(cellText)
  if (!headCells.length) return ''
  const lines: string[] = []
  lines.push('| ' + headCells.join(' | ') + ' |')
  lines.push('| ' + headCells.map(() => '---').join(' | ') + ' |')
  for (const row of body) {
    const cells = childNodes(row).map(cellText)
    while (cells.length < headCells.length) cells.push(' ')
    lines.push('| ' + cells.join(' | ') + ' |')
  }
  return lines.join('\n')
}

function renderBlocks(nodes: AdfNode[]): string {
  return nodes
    .map((n) => renderBlock(n))
    .map((s) => s.replace(/\s+$/g, ''))
    .filter((s) => s.length > 0)
    .join('\n\n')
}

/**
 * Atlassian Document Format の doc を Markdown 文字列に変換する。
 * 対応: heading / paragraph / codeBlock / blockquote / bulletList / orderedList /
 * taskList / rule / text (strong/em/strike/code/link marks) / mention / hardBreak /
 * emoji / inlineCard / blockCard / table / panel。
 */
export function adfToMarkdown(doc: unknown): string {
  const root = toNode(doc)
  if (!root) return ''
  if (root.type === 'doc') {
    return renderBlocks(childNodes(root)).trim()
  }
  return renderBlock(root).trim()
}
