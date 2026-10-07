export type Difficulty = 'easy' | 'medium' | 'hard'
export type PlanStep = { text: string; difficulty?: Difficulty; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'task-planner': { goal: string; steps: PlanStep[]; plannerIds: string[] }
  }
}
