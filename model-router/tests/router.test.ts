import { expect, test } from 'claude-code/testing'

const USAGE = { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

for (const [rating, model] of [['easy', 'haiku'], ['medium', 'sonnet'], ['hard', 'opus']] as const) {
  test(`a task rated ${rating} runs on ${model}`, async ($, on) => {
    on('model.complete', () => ({ value: { isAnswered: true, text: rating, usage: USAGE } }))
    on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit', agentId: 'a1' }))

    const started = await $.agent.spawn({ prompt: 'Do the thing', description: 'thing', subagentType: 'coding-agents:coder' })

    expect(started.model).toBe(model)
  })
}

test('an unanswered rating falls back to the medium model', async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }))
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit', agentId: 'a1' }))

  const started = await $.agent.spawn({ prompt: 'x', description: 'x', subagentType: 'coding-agents:coder' })

  expect(started.model).toBe('sonnet')
})

test('other agents and explicit models are left alone', async ($, on) => {
  let rated = 0
  on('model.complete', () => (rated++, { value: { isAnswered: true, text: 'easy', usage: USAGE } }))
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit', agentId: 'a1' }))

  const other = await $.agent.spawn({ prompt: 'x', description: 'x', subagentType: 'Explore' })
  const pinned = await $.agent.spawn({ prompt: 'x', description: 'x', subagentType: 'coding-agents:coder', model: 'opus' })

  expect(other.model).toBe('inherit')
  expect(pinned.model).toBe('opus')
  expect(rated).toBe(0)
})

test('models are configurable', { options: { hardModel: 'claude-opus-5-5' } }, async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Hard.', usage: USAGE } }))
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit', agentId: 'a1' }))

  const started = await $.agent.spawn({ prompt: 'x', description: 'x', subagentType: 'coding-agents:coder' })

  expect(started.model).toBe('claude-opus-5-5')
})
