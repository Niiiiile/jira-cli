import { loadDotenvFiles } from './load-dotenv.js'

export function bootstrapCli(): void {
  loadDotenvFiles()
}
