import type { JiraCredentials } from './config.js'
import { markdownToAdf } from './md-to-adf.js'

/**
 * 説明文・コメント本文を Jira の ADF body に変換する。
 * 入力は Markdown として解釈され、`@[accountId]` / `@[email:user@example.com]` は
 * Jira API で accountId / 表示名に解決される。
 */
export async function descriptionToAdf(
  env: JiraCredentials,
  text: string,
): Promise<Record<string, unknown>> {
  return markdownToAdf(text, env)
}
