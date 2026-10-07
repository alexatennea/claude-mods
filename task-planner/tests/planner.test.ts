import { expect, test } from 'claude-code/testing'

import { parsePlan } from '../hooks/register'

test('parses checklist lines with difficulty', () => {
  const plan = parsePlan(['Plan:', '- [ ] Add the route (medium)', '- [x] Rename the flag (easy)', '* [ ] Design the cache', 'Risks: none'].join('\n'))

  expect(plan).toEqual([
    { text: 'Add the route', difficulty: 'medium', isDone: false },
    { text: 'Rename the flag', difficulty: 'easy', isDone: true },
    { text: 'Design the cache', difficulty: undefined, isDone: false },
  ])
})

test("a planner's answer becomes the plan, and /plan-done ticks a step", async ($, on) => {
  on('agent.spawn', () => ({ model: 'opus', agentId: 'p1' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.agent.spawn({ prompt: 'plan it', description: 'plan', subagentType: 'task-planner:planner' })
  await $.turn.complete({ answer: '- [ ] One (easy)\n- [ ] Two (hard)', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'p1', reason: 'end_turn' })

  const tooFar = await $.command.run({ command: 'plan-done', args: '3' })
  expect(tooFar.text).toBe('Usage: /plan-done <1-2>')

  const done = await $.command.run({ command: 'plan-done', args: '2' })
  expect(done.text).toBe('Step 2 toggled.')
})
