import { wantCompact } from './agent-compact.js'
import { outJsonlIfNeeded } from './jsonl-lines.js'

type OutputContext = {
  agent: boolean
  format: string
}

export function finalizeOutput<T>(context: OutputContext, data: T): unknown {
  return outJsonlIfNeeded(data, context.format)
}

export function finalizeCompactOutput<T>(
  context: OutputContext,
  full: T,
  slim: (value: T) => unknown,
): unknown {
  const data = wantCompact(context.agent) ? slim(full) : full
  return finalizeOutput(context, data)
}
