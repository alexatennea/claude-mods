export type AgentRow = {
  id: string
  type: string
  model: string
  description: string
  status: 'running' | 'done' | 'stopped'
  startedAt: number
  seconds?: number
  tokens?: number
}
export type FlowRow = { at: number; from: string; to: string; text: string }
export type ModRow = { name: string; doing: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'mod-monitor': { agents: AgentRow[]; flow: FlowRow[]; mods: ModRow[] }
  }
}
