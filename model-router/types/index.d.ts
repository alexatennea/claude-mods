export type Tier = 'easy' | 'medium' | 'hard'
export type RouteTally = { easy: number; medium: number; hard: number; fallback: number }

declare module 'claude-code' {
  interface PluginState {
    'model-router': { tally: RouteTally }
  }
}
