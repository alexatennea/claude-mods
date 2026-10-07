import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Tier } from '../types'

const tally = atom({ plugin: 'model-router', key: 'tally' } as const, { easy: 0, medium: 0, hard: 0, fallback: 0 })

const RUBRIC = `You rate a coding task's difficulty so it can be sent to a cheap or a strong model.
easy: mechanical change in one place - rename, text or config tweak, simple test, formatting, boilerplate.
medium: ordinary feature or bug fix across a few files with clear requirements.
hard: design decisions, subtle logic, concurrency, security, performance, data migrations, debugging an unclear failure, or broad refactors.
When unsure between two, pick the harder one. Answer with exactly one word: easy, medium or hard.`

export function parseTier(text: string): Tier | undefined {
  const m = /\b(easy|medium|hard)\b/i.exec(text)

  return m?.[1] ? (m[1].toLowerCase() as Tier) : undefined
}

export const register: Register = (on, options) => {
  const str = (key: string, fallback: string) => (typeof options[key] === 'string' && options[key] !== '' ? (options[key] as string) : fallback)
  const models: Record<Tier, string> = {
    easy: str('easyModel', 'haiku'),
    medium: str('mediumModel', 'sonnet'),
    hard: str('hardModel', 'opus'),
  }
  const classifier = str('classifierModel', 'haiku')
  const routed = new Set(str('routedAgents', 'coding-agents:coder').split(',').map(s => s.trim()).filter(Boolean))

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'routing', description: 'Show how many coding tasks went to each model' })

    return next(e)
  })

  on('command.run', { command: 'routing' }, async $ => {
    const t = await read($, tally)

    return {
      text: [
        `easy   → ${models.easy}: ${t.easy}`,
        `medium → ${models.medium}: ${t.medium}`,
        `hard   → ${models.hard}: ${t.hard}`,
        `unrated (sent to ${models.medium}): ${t.fallback}`,
      ].join('\n'),
    }
  })

  on('agent.spawn', async ($, e, next) => {
    // Only route our coding agents, and respect a model the caller chose on purpose.
    if (!routed.has(e.subagentType) || e.model) return next(e)

    const rated = await $.model.complete({
      model: classifier,
      system: [{ text: RUBRIC, cache: true }],
      prompt: `Task: ${e.description}\n\n${e.prompt.slice(0, 6000)}`,
      maxTokens: 5,
      effort: 'low',
      timeoutMs: 15000,
    })
    const tier = rated.isAnswered ? parseTier(rated.text) : undefined
    const model = models[tier ?? 'medium']

    await update($, tally, t => (tier ? { ...t, [tier]: t[tier] + 1 } : { ...t, fallback: t.fallback + 1 }))
    $.ui.status(`router: ${e.description.slice(0, 30)} → ${model}${tier ? ` (${tier})` : ' (unrated)'}`)

    return next({ ...e, model })
  }).catch(($, e, next) => next(e))
}
