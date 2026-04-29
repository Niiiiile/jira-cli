import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Cli, z } from 'incur'
import { resolveCredentials } from './config.js'
import { jiraFetchBinary, jiraRequest } from './jira-client.js'
import { finalizeCompactOutput } from './output.js'
import { authOptions } from './shared.js'

type RawAttachmentMeta = {
  id?: string
  filename?: string
  mimeType?: string
  size?: number
  created?: string
  content?: string
  thumbnail?: string
  author?: { displayName?: string; accountId?: string } | null
}

async function loadAttachmentMeta(
  creds: { host: string; email: string; apiToken: string },
  id: string,
): Promise<RawAttachmentMeta> {
  return jiraRequest<RawAttachmentMeta>(creds, `/attachment/${encodeURIComponent(id)}`)
}

export const attachmentCli = Cli.create('attachment', {
  description: '添付ファイルのメタデータ取得・ダウンロード',
})
  .command('get', {
    description: '添付ファイルのメタデータを取得（id は issue show の attachments[].id）',
    args: z.object({
      id: z.string().describe('Attachment ID（例: 24486）'),
    }),
    options: authOptions,
    output: z.any(),
    async run(c) {
      const creds = resolveCredentials(c.options)
      const meta = await loadAttachmentMeta(creds, c.args.id)
      const full = {
        id: meta.id ?? c.args.id,
        filename: meta.filename ?? '',
        mimeType: meta.mimeType ?? '',
        size: meta.size ?? 0,
        created: meta.created ?? null,
        author: meta.author?.displayName ?? null,
        content: meta.content ?? '',
        thumbnail: meta.thumbnail ?? null,
      }
      return finalizeCompactOutput(c, full, (d) => ({
        id: d.id,
        name: d.filename,
        size: d.size,
        mime: d.mimeType || undefined,
        url: d.content,
        ...(d.created ? { t: d.created } : {}),
        ...(d.author ? { a: d.author } : {}),
      }))
    },
  })
  .command('download', {
    description:
      '添付ファイルを取得する。--out 未指定ならテキスト系は標準出力へ。バイナリは --out 必須',
    args: z.object({
      id: z.string().describe('Attachment ID（例: 24486）'),
    }),
    options: z.object({
      out: z
        .string()
        .optional()
        .describe(
          '保存先パス。"-" で標準出力、ディレクトリ指定ならサーバー側の filename を使用',
        ),
      force: z.boolean().optional().describe('既存ファイルを上書き'),
      ...authOptions.shape,
    }),
    output: z.any(),
    async run(c) {
      const creds = resolveCredentials(c.options)
      const { bytes, mimeType, filename } = await jiraFetchBinary(
        creds,
        `/attachment/content/${encodeURIComponent(c.args.id)}`,
      )
      const out = c.options.out

      if (out === '-' || (!out && isTextMime(mimeType))) {
        await new Promise<void>((resolve, reject) => {
          process.stdout.write(bytes, (err) => (err ? reject(err) : resolve()))
        })
        // stdout に本文を書いたので envelope をそのまま返すと混ざる。即終了。
        process.exit(0)
      }

      if (!out) {
        throw new Error(
          `バイナリ (${mimeType}) は --out <path> で保存先を指定してください。標準出力したい場合は --out -`,
        )
      }

      let target = out
      try {
        const stat = await fs.stat(out)
        if (stat.isDirectory()) {
          const fn = filename ?? `attachment-${c.args.id}`
          target = path.join(out, fn)
        }
      } catch {
        // not exist → そのまま target として使う
      }

      if (!c.options.force) {
        try {
          await fs.access(target)
          throw new Error(`既に存在します: ${target}（--force で上書き可）`)
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            if (e instanceof Error && e.message.startsWith('既に存在します')) throw e
          }
        }
      }

      await fs.writeFile(target, bytes)
      return {
        ok: true,
        written: target,
        size: bytes.length,
        mime: mimeType,
        filename: filename ?? undefined,
      }
    },
  })

const TEXT_MIME_RE =
  /^(text\/|application\/(json|xml|x-ndjson|yaml|x-yaml|javascript|typescript|x-sh|x-shellscript|markdown))/i

function isTextMime(mime: string): boolean {
  return TEXT_MIME_RE.test(mime) || /\+(json|xml|yaml)$/i.test(mime)
}
