import type { JiraCredentials } from './config.js'
import { jiraRequest } from './jira-client.js'

type UserLite = {
  accountId: string
  displayName?: string
  emailAddress?: string
}

async function resolveMention(inner: string, env: JiraCredentials): Promise<string> {
  const value = inner.trim()
  if (!value) return '@[]'

  const emailPrefix = /^email:/i
  if (emailPrefix.test(value)) {
    const email = value.replace(emailPrefix, '').trim()
    if (!email) throw new Error('@[email:...] にメールアドレスがありません')
    const users = await jiraRequest<UserLite[]>(
      env,
      `/user/search?query=${encodeURIComponent(email)}&maxResults=25`,
    )
    const exact = users.find((u) => u.emailAddress?.toLowerCase() === email.toLowerCase())
    const user = exact ?? users[0]
    if (!user) throw new Error(`ユーザーが見つかりません: ${email}`)
    return `[~accountid:${user.accountId}]`
  }

  return `[~accountid:${value}]`
}

/**
 * Jira Wiki Renderer の本文はそのまま維持し、CLI 補助記法のメンションだけ
 * Jira Wiki の user link notation に解決する。
 */
export async function resolveJiraWikiMentions(
  text: string,
  env: JiraCredentials,
): Promise<string> {
  let out = ''
  let last = 0
  const re = /@\[([^\]]+)\]/g

  for (let match = re.exec(text); match != null; match = re.exec(text)) {
    out += text.slice(last, match.index)
    out += await resolveMention(match[1], env)
    last = match.index + match[0].length
  }

  out += text.slice(last)
  return out
}
