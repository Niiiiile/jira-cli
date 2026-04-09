/**
 * コマンド結果を NDJSON（1 行 1 JSON）にする。
 * 配列系は 1 行ずつ、先頭にメタ行（`_: "meta"`）を付ける場合あり。
 */
function collectionToJsonl(
  object: Record<string, unknown>,
  collectionKey: string,
  rows: unknown[],
): string {
  const meta = { ...object }
  delete meta[collectionKey]
  const lines: string[] = []
  if (Object.keys(meta).length > 0) {
    lines.push(JSON.stringify({ _: 'meta', ...meta }))
  }
  for (const row of rows) {
    lines.push(JSON.stringify(row))
  }
  return `${lines.join('\n')}\n`
}

export function valueToJsonlLines(data: unknown): string {
  if (data == null) return '\n'
  if (typeof data !== 'object') {
    return `${JSON.stringify(data)}\n`
  }

  const o = data as Record<string, unknown>

  if ('issue' in o && o.issue != null && typeof o.issue === 'object') {
    return `${JSON.stringify(o.issue)}\n`
  }

  const issuesKey = 'issues' in o ? 'issues' : 'i' in o ? 'i' : null
  if (issuesKey && Array.isArray(o[issuesKey])) {
    return collectionToJsonl(o, issuesKey, o[issuesKey] as unknown[])
  }

  if ('comments' in o && Array.isArray(o.comments)) {
    return collectionToJsonl(o, 'comments', o.comments)
  }

  if ('c' in o && Array.isArray(o.c)) {
    return collectionToJsonl(o, 'c', o.c)
  }

  if ('projects' in o && Array.isArray(o.projects)) {
    return collectionToJsonl(o, 'projects', o.projects)
  }

  if ('p' in o && Array.isArray(o.p)) {
    return collectionToJsonl(o, 'p', o.p)
  }

  if ('users' in o && Array.isArray(o.users)) {
    return collectionToJsonl(o, 'users', o.users)
  }

  if ('u' in o && Array.isArray(o.u)) {
    return collectionToJsonl(o, 'u', o.u)
  }

  if (Array.isArray(data)) {
    return `${(data as unknown[]).map((x) => JSON.stringify(x)).join('\n')}\n`
  }

  return `${JSON.stringify(data)}\n`
}

/** `--format jsonl` のとき NDJSON 文字列を返す（incur はスカラー文字列をそのまま stdout へ出す） */
export function outJsonlIfNeeded(data: unknown, format: string): unknown {
  return format === 'jsonl' ? valueToJsonlLines(data) : data
}
