import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Difficulty, PlanStep } from '../types'

const PANE = 'task-plan'
const PLANNER = 'task-planner:planner'
const STEP = /^\s*[-*]\s*\[( |x|X)\]\s*(.+?)\s*(?:\((easy|medium|hard)\))?\s*$/

const goal = atom({ plugin: 'task-planner', key: 'goal' } as const, '')
const steps = atom({ plugin: 'task-planner', key: 'steps' } as const, [])
const plannerIds = atom({ plugin: 'task-planner', key: 'plannerIds' } as const, [])

export function parsePlan(answer: string): PlanStep[] {
  return answer.split('\n').flatMap(line => {
    const m = STEP.exec(line)
    if (!m?.[2]) return []
    return [{ text: m[2], difficulty: m[3] as Difficulty | undefined, isDone: m[1] !== ' ' }]
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'plan', description: 'Plan a goal with the Opus planner agent' })
    await $.command.register({ name: 'plan-done', description: 'Tick off plan step N (e.g. /plan-done 2)' })
    await $.command.register({ name: 'plan-view', description: 'Show the current plan in a pane' })

    return next(e)
  })

  on('command.run', { command: 'plan' }, async ($, e) => {
    const text = e.args.trim()
    if (!text) return { text: 'Usage: /plan <what you want to build or fix>' }
    await update($, goal, () => text)
    await $.prompt.submit({
      text: `Use the ${PLANNER} agent to plan this goal, then show me the plan and wait for my go-ahead before coding:\n\n${text}`,
    })

    return { text: `Planning: ${text}` }
  })

  on('command.run', { command: 'plan-done' }, async ($, e) => {
    const n = Number.parseInt(e.args.trim(), 10)
    const list = await read($, steps)
    if (!Number.isInteger(n) || n < 1 || n > list.length) {
      return { text: `Usage: /plan-done <1-${Math.max(list.length, 1)}>` }
    }
    await update($, steps, all => all.map((s, i) => (i === n - 1 ? { ...s, isDone: !s.isDone } : s)))

    return { text: `Step ${n} toggled.` }
  })

  on('command.run', { command: 'plan-view' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Plan' })

    return { text: 'Plan pane opened.' }
  })

  // Remember which subagents are planners, so their answers can be read as plans.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (e.subagentType === PLANNER && started.agentId) {
      const id = started.agentId
      await update($, plannerIds, ids => [...ids, id].slice(-20))
    }

    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const ids = await read($, plannerIds)
    if (e.agentId && ids.includes(e.agentId)) {
      const plan = parsePlan(e.answer)
      if (plan.length > 0) {
        await update($, steps, () => plan)
        $.ui.toast(`Plan ready: ${plan.length} steps`)
        void $.ui.open({ id: PANE, title: 'Plan' })
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, steps)
    const title = await read($, goal)
    const done = list.filter(s => s.isDone).length

    return (
      <Box flexDirection="column">
        {title !== '' && <Text bold>{title}</Text>}
        {list.length === 0 && <Text dimColor>No plan yet. Try /plan &lt;goal&gt;.</Text>}
        {list.length > 0 && <Text dimColor>{done}/{list.length} done</Text>}
        {list.map((s, i) => (
          <Text dimColor={s.isDone}>
            {s.isDone ? '[x]' : '[ ]'} {i + 1}. {s.text}
            {s.difficulty ? ` · ${s.difficulty}` : ''}
          </Text>
        ))}
      </Box>
    )
  })
}
