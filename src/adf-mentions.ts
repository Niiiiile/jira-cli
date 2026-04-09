import type { JiraCredentials } from './config.js'
import { jiraRequest } from './jira-client.js'
import { plainTextToAdfBody } from './adf.js'

/**
 * テキスト内の `@[accountId]` または `@[email:user@example.com]` を Jira Cloud ADF の mention ノードに変換する。
 * accountId は Atlassian の形式（例: 712020:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）。
 */
const MENTION_PATTERN = /@\[([^\]]+)\]/g

function containsMentionPlaceholder(text: string): boolean {
  return /@\[([^\]]+)\]/.test(text)
}

type UserLite = {
  accountId: string
  displayName?: string
  emailAddress?: string
}

function splitLineWithMentions(line: string): Array<{ kind: 'text' | 'mention'; value: string }> {
  const segments: Array<{ kind: 'text' | 'mention'; value: string }> = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(MENTION_PATTERN.source, 'g')
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'text', value: line.slice(last, m.index) })
    }
    segments.push({ kind: 'mention', value: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < line.length) {
    segments.push({ kind: 'text', value: line.slice(last) })
  }
  return segments
}

async function resolveMentionInner(
  inner: string,
  env: JiraCredentials,
): Promise<{ accountId: string; label: string }> {
  const emailPrefix = /^email:/i
  if (emailPrefix.test(inner)) {
    const email = inner.replace(emailPrefix, '').trim()
    if (!email) {
      throw new Error('@[email:...] にメールアドレスがありません')
    }
    const users = await jiraRequest<UserLite[]>(
      env,
      `/user/search?query=${encodeURIComponent(email)}&maxResults=25`,
    )
    const exact = users.find((u) => u.emailAddress?.toLowerCase() === email.toLowerCase())
    const u = exact ?? users[0]
    if (!u) {
      throw new Error(`ユーザーが見つかりません: ${email}`)
    }
    return {
      accountId: u.accountId,
      label: u.displayName ?? u.emailAddress ?? email,
    }
  }

  const accountId = inner
  try {
    const u = await jiraRequest<UserLite>(
      env,
      `/user?accountId=${encodeURIComponent(accountId)}`,
    )
    return {
      accountId: u.accountId,
      label: u.displayName ?? accountId,
    }
  } catch {
    return { accountId, label: accountId }
  }
}

async function lineToParagraphContent(line: string, env: JiraCredentials): Promise<unknown[]> {
  const segments = splitLineWithMentions(line)
  if (segments.length === 0) {
    return []
  }
  const content: unknown[] = []
  for (const seg of segments) {
    if (seg.kind === 'text') {
      if (seg.value.length > 0) {
        content.push({ type: 'text', text: seg.value })
      }
    } else {
      const { accountId, label } = await resolveMentionInner(seg.value, env)
      content.push({
        type: 'mention',
        attrs: {
          id: accountId,
          text: `@${label}`,
          accessLevel: '',
        },
      })
    }
  }
  return content
}

/** `@[...]` を含むときだけ API で解決。含まなければ同期の plainTextToAdfBody。 */
export async function descriptionToAdf(
  env: JiraCredentials,
  text: string,
): Promise<Record<string, unknown>> {
  if (!containsMentionPlaceholder(text)) {
    return plainTextToAdfBody(text)
  }
  const lines = text.split(/\r?\n/)
  const content: unknown[] = []
  for (const line of lines) {
    const paraContent = await lineToParagraphContent(line, env)
    content.push({
      type: 'paragraph',
      content: paraContent.length ? paraContent : [],
    })
  }
  return {
    type: 'doc',
    version: 1,
    content: content.length ? content : [{ type: 'paragraph', content: [] }],
  }
}
