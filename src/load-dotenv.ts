import { config } from 'dotenv'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 1. カレントディレクトリの `.env`（上書きなし＝シェルや既存 env を尊重）
 * 2. エントリと同じディレクトリの `.env`（`node dist/cli.js` なら `dist/.env`）を override で反映
 * 3. `tsx src/cli.ts` のときは `dist/.env` をさらに override で読み、`dist` の値が最優先
 */
/** dotenv 後に、よくある typo `IRA_HOST` を `JIRA_HOST` に寄せる */
function aliasIraHost(): void {
  const j = process.env.JIRA_HOST?.trim()
  const i = process.env.IRA_HOST?.trim()
  if (!j && i) process.env.JIRA_HOST = i
}

export function loadDotenvFiles(): void {
  const cliDir = dirname(fileURLToPath(import.meta.url))

  config({ path: join(process.cwd(), '.env') })

  config({ path: join(cliDir, '.env'), override: true })

  if (basename(cliDir) === 'src') {
    config({ path: join(cliDir, '..', 'dist', '.env'), override: true })
  }

  aliasIraHost()
}
