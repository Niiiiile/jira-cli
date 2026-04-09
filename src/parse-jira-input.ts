/** /projects/KEY/ … からプロジェクトキーを取る */
function projectKeyFromPath(pathname: string): string | null {
  const m = pathname.match(/\/projects\/([A-Za-z][A-Za-z0-9]*)(?:\/|$)/)
  return m ? m[1].toUpperCase() : null
}

function withHttpsIfHostLooksLikeAtlassian(s: string): string {
  const t = s.trim()
  if (/^https?:\/\//i.test(t)) return t
  if (/\.atlassian\.net/i.test(t)) return `https://${t.replace(/^\/+/, '')}`
  return t
}

/**
 * 課題キー（WEC-41）または Jira の課題 URL から課題キーを得る。
 * browse URL・selectedIssue・パス末尾のキーなどに対応。
 */
export function parseIssueKey(input: string): string {
  const raw = input.trim()
  if (!raw) {
    throw new Error('課題キーまたは URL が空です')
  }

  const fromSelected = raw.match(/[?&]selectedIssue=([A-Za-z][A-Za-z0-9]*-\d+)/i)
  if (fromSelected) {
    return normalizeIssueKey(fromSelected[1])
  }

  const fromBrowse = raw.match(/\/browse\/([A-Za-z][A-Za-z0-9]*-\d+)/i)
  if (fromBrowse) {
    return normalizeIssueKey(fromBrowse[1])
  }

  const bare = raw.match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/)
  if (bare) {
    return `${bare[1].toUpperCase()}-${bare[2]}`
  }

  const asUrl = withHttpsIfHostLooksLikeAtlassian(raw)
  try {
    const u = new URL(asUrl)
    const browse = u.pathname.match(/\/browse\/([A-Za-z][A-Za-z0-9]*-\d+)/i)
    if (browse) {
      return normalizeIssueKey(browse[1])
    }
    const sel = u.searchParams.get('selectedIssue')
    if (sel && /^[A-Za-z][A-Za-z0-9]*-\d+$/i.test(sel)) {
      return normalizeIssueKey(sel)
    }
    const seg = u.pathname.split('/').filter(Boolean)
    const last = seg[seg.length - 1]
    if (last && /^[A-Za-z][A-Za-z0-9]*-\d+$/i.test(last)) {
      return normalizeIssueKey(last)
    }
  } catch {
    /* 相対パス等は下で失敗 */
  }

  throw new Error(
    `課題キー（例: WEC-41）または課題 URL（.../browse/WEC-41 等）として解釈できません: ${raw.slice(0, 120)}${raw.length > 120 ? '…' : ''}`,
  )
}

function normalizeIssueKey(key: string): string {
  const m = key.match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/i)
  if (!m) return key.toUpperCase()
  return `${m[1].toUpperCase()}-${m[2]}`
}

/**
 * プロジェクトキー（WEC）・課題キー（WEC-41 なら WEC 部分）・ボード/プロジェクト URL からプロジェクトキーを得る。
 */
export function parseProjectRef(input: string): string {
  const raw = input.trim()
  if (!raw) {
    throw new Error('プロジェクトキーまたは URL が空です')
  }

  const asUrl = withHttpsIfHostLooksLikeAtlassian(raw)
  try {
    const u = new URL(asUrl)
    const fromPath = projectKeyFromPath(u.pathname)
    if (fromPath) return fromPath
    const pk = u.searchParams.get('projectKey')
    if (pk && /^[A-Za-z][A-Za-z0-9]*$/i.test(pk)) {
      return pk.toUpperCase()
    }
  } catch {
    /* 続行 */
  }

  const fromPathLoose = projectKeyFromPath(raw)
  if (fromPathLoose) return fromPathLoose

  const fromIssue = raw.match(/^([A-Za-z][A-Za-z0-9]*)-\d+$/i)
  if (fromIssue) {
    return fromIssue[1].toUpperCase()
  }

  const bare = raw.match(/^([A-Za-z][A-Za-z0-9]*)$/i)
  if (bare) {
    return bare[1].toUpperCase()
  }

  throw new Error(
    `プロジェクトキー（例: WEC）またはプロジェクト URL（.../projects/WEC/...）として解釈できません: ${raw.slice(0, 120)}${raw.length > 120 ? '…' : ''}`,
  )
}
