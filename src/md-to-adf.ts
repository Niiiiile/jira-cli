import type { JiraCredentials } from './config.js'
import { jiraRequest } from './jira-client.js'

type Node = Record<string, unknown>

type UserLite = {
  accountId: string
  displayName?: string
  emailAddress?: string
}

type Mark =
  | { kind: 'strong' | 'em' | 'code' | 'strike' }
  | { kind: 'link'; href: string }

type InlineToken =
  | { type: 'text'; marks: Mark[]; text: string }
  | { type: 'mention'; inner: string }
  | { type: 'hardBreak' }

function markToAdfNode(m: Mark): Node {
  if (m.kind === 'link') return { type: 'link', attrs: { href: m.href } }
  return { type: m.kind }
}

function tokenizeInline(text: string, marks: Mark[]): InlineToken[] {
  const out: InlineToken[] = []
  let buf = ''
  const flush = () => {
    if (buf.length) {
      out.push({ type: 'text', marks: [...marks], text: buf })
      buf = ''
    }
  }
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)

    let m: RegExpExecArray | null

    m = /^`([^`\n]+)`/.exec(rest)
    if (m) {
      flush()
      out.push({
        type: 'text',
        marks: [...marks, { kind: 'code' }],
        text: m[1],
      })
      i += m[0].length
      continue
    }

    m = /^@\[([^\]]+)\]/.exec(rest)
    if (m) {
      flush()
      out.push({ type: 'mention', inner: m[1].trim() })
      i += m[0].length
      continue
    }

    m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest)
    if (m) {
      flush()
      const alt = m[1] || m[2]
      out.push({
        type: 'text',
        marks: [...marks, { kind: 'link', href: m[2] }],
        text: alt,
      })
      i += m[0].length
      continue
    }

    m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
    if (m) {
      flush()
      const linkMark: Mark = { kind: 'link', href: m[2] }
      out.push(...tokenizeInline(m[1], [...marks, linkMark]))
      i += m[0].length
      continue
    }

    m = /^\*\*([^*\n][\s\S]*?)\*\*/.exec(rest) || /^__([^_\n][\s\S]*?)__/.exec(rest)
    if (m) {
      flush()
      out.push(...tokenizeInline(m[1], [...marks, { kind: 'strong' }]))
      i += m[0].length
      continue
    }

    m = /^~~([^~\n][\s\S]*?)~~/.exec(rest)
    if (m) {
      flush()
      out.push(...tokenizeInline(m[1], [...marks, { kind: 'strike' }]))
      i += m[0].length
      continue
    }

    m = /^\*([^*\s][^*\n]*?)\*/.exec(rest) || /^_([^_\s][^_\n]*?)_/.exec(rest)
    if (m) {
      flush()
      out.push(...tokenizeInline(m[1], [...marks, { kind: 'em' }]))
      i += m[0].length
      continue
    }

    buf += text[i]
    i++
  }
  flush()
  return out
}

/**
 * 同期版: メンションは解決せず placeholder ノードとして埋め込む。
 * `{ type:'mention', attrs:{ id: inner, text:'@'+inner, accessLevel:'' } }` の形。
 */
function parseInlineSync(text: string): Node[] {
  const tokens = tokenizeInline(text, [])
  const nodes: Node[] = []
  for (const t of tokens) {
    if (t.type === 'hardBreak') {
      nodes.push({ type: 'hardBreak' })
      continue
    }
    if (t.type === 'mention') {
      nodes.push({
        type: 'mention',
        attrs: { id: t.inner, text: `@${t.inner}`, accessLevel: '' },
      })
      continue
    }
    if (t.text.length === 0) continue
    const node: Node = { type: 'text', text: t.text }
    if (t.marks.length) node.marks = t.marks.map(markToAdfNode)
    nodes.push(node)
  }
  return nodes
}

function isBlockStart(line: string): boolean {
  if (/^\s*$/.test(line)) return true
  if (/^```/.test(line)) return true
  if (/^#{1,6}\s+/.test(line)) return true
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true
  if (/^>\s?/.test(line)) return true
  if (/^\s*[-*]\s+/.test(line)) return true
  if (/^\s*\d+\.\s+/.test(line)) return true
  return false
}

function genLocalId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function parseBlocksSync(lines: string[]): Node[] {
  const blocks: Node[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    const fence = /^```(\S*)\s*$/.exec(line)
    if (fence) {
      const lang = fence[1] || null
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      const cb: Node = {
        type: 'codeBlock',
        content: buf.length ? [{ type: 'text', text: buf.join('\n') }] : [],
      }
      if (lang) cb.attrs = { language: lang }
      blocks.push(cb)
      continue
    }

    if (/^\s*$/.test(line)) {
      i++
      continue
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({
        type: 'heading',
        attrs: { level: h[1].length },
        content: parseInlineSync(h[2].trim()),
      })
      i++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const inner = parseBlocksSync(quoteLines)
      blocks.push({
        type: 'blockquote',
        content: inner.length ? inner : [{ type: 'paragraph', content: [] }],
      })
      continue
    }

    if (/^\s*[-*]\s+\[[ xX]\]\s+/.test(line)) {
      const items: Node[] = []
      while (
        i < lines.length &&
        /^\s*[-*]\s+\[[ xX]\]\s+/.test(lines[i])
      ) {
        const tm = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i])!
        const state = tm[1].toLowerCase() === 'x' ? 'DONE' : 'TODO'
        items.push({
          type: 'taskItem',
          attrs: { localId: genLocalId(), state },
          content: parseInlineSync(tm[2]),
        })
        i++
      }
      blocks.push({
        type: 'taskList',
        attrs: { localId: genLocalId() },
        content: items,
      })
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: Node[] = []
      while (
        i < lines.length &&
        /^\s*[-*]\s+/.test(lines[i]) &&
        !/^\s*[-*]\s+\[[ xX]\]\s+/.test(lines[i])
      ) {
        const lm = /^\s*[-*]\s+(.*)$/.exec(lines[i])!
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineSync(lm[1]),
            },
          ],
        })
        i++
      }
      blocks.push({ type: 'bulletList', content: items })
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: Node[] = []
      let order: number | null = null
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const lm = /^\s*(\d+)\.\s+(.*)$/.exec(lines[i])!
        if (order === null) order = Number(lm[1])
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineSync(lm[2]),
            },
          ],
        })
        i++
      }
      blocks.push({
        type: 'orderedList',
        attrs: { order: order ?? 1 },
        content: items,
      })
      continue
    }

    const paraLines: string[] = [line]
    i++
    while (i < lines.length && !isBlockStart(lines[i])) {
      paraLines.push(lines[i])
      i++
    }
    const paraContent: Node[] = []
    for (let k = 0; k < paraLines.length; k++) {
      if (k > 0) paraContent.push({ type: 'hardBreak' })
      paraContent.push(...parseInlineSync(paraLines[k]))
    }
    blocks.push({ type: 'paragraph', content: paraContent })
  }

  return blocks
}

/**
 * Markdown を ADF に変換する同期版。メンション `@[...]` は解決せず、
 * `text` 属性も `@<inner>` になる placeholder として埋め込む。
 *
 * API でメンションを解決したい場合は {@link markdownToAdf} を使う。
 */
export function markdownToAdfSync(text: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/)
  const blocks = parseBlocksSync(lines)
  return {
    type: 'doc',
    version: 1,
    content: blocks.length ? blocks : [{ type: 'paragraph', content: [] }],
  }
}

async function resolveMentionPlaceholder(
  placeholder: Node,
  env: JiraCredentials,
): Promise<Node> {
  const attrs = placeholder.attrs as Record<string, unknown> | undefined
  const inner = typeof attrs?.id === 'string' ? attrs.id : ''
  if (!inner) return placeholder

  const emailPrefix = /^email:/i
  if (emailPrefix.test(inner)) {
    const email = inner.replace(emailPrefix, '').trim()
    if (!email) throw new Error('@[email:...] にメールアドレスがありません')
    const users = await jiraRequest<UserLite[]>(
      env,
      `/user/search?query=${encodeURIComponent(email)}&maxResults=25`,
    )
    const exact = users.find((u) => u.emailAddress?.toLowerCase() === email.toLowerCase())
    const u = exact ?? users[0]
    if (!u) throw new Error(`ユーザーが見つかりません: ${email}`)
    return {
      type: 'mention',
      attrs: {
        id: u.accountId,
        text: `@${u.displayName ?? u.emailAddress ?? email}`,
        accessLevel: '',
      },
    }
  }

  try {
    const u = await jiraRequest<UserLite>(
      env,
      `/user?accountId=${encodeURIComponent(inner)}`,
    )
    return {
      type: 'mention',
      attrs: {
        id: u.accountId,
        text: `@${u.displayName ?? inner}`,
        accessLevel: '',
      },
    }
  } catch {
    return placeholder
  }
}

async function resolveMentions(node: unknown, env: JiraCredentials): Promise<unknown> {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) {
    const out: unknown[] = []
    for (const child of node) {
      out.push(await resolveMentions(child, env))
    }
    return out
  }
  const n = node as Node
  if (n.type === 'mention') {
    return resolveMentionPlaceholder(n, env)
  }
  if (Array.isArray(n.content)) {
    const resolved: unknown[] = []
    for (const child of n.content) {
      resolved.push(await resolveMentions(child, env))
    }
    return { ...n, content: resolved }
  }
  return n
}

/**
 * Markdown を ADF に変換し、メンション `@[...]` を Jira API で
 * accountId / 表示名に解決する。env を渡さない場合は placeholder のまま。
 *
 * 対応記法: 見出し (# ... ######), 強調 (bold / italic), 取り消し線 (strike),
 * 行内コード, フェンスドコードブロック, 箇条書き, 番号付きリスト,
 * チェックリスト (- [ ] / - [x]), 引用 (>), 水平線 (---), リンク, 画像,
 * メンション @[accountId] / @[email:...]
 */
export async function markdownToAdf(
  text: string,
  env: JiraCredentials | null = null,
): Promise<Record<string, unknown>> {
  const doc = markdownToAdfSync(text)
  if (!env) return doc
  return (await resolveMentions(doc, env)) as Record<string, unknown>
}
