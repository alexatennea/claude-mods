import { expect, test } from 'claude-code/testing'
import type { Register } from 'claude-code'

const USAGE = { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const PANE = { title: 'Mods', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

// Stands in for model-router: rates the task with a model, then picks one.
const router: Register = on => {
  on('agent.spawn', async ($, e, next) => {
    const rated = await $.model.complete({ model: 'haiku', prompt: e.prompt })
    $.ui.status('router: picked opus')
    return next({ ...e, model: rated.isAnswered && rated.text === 'hard' ? 'opus' : 'sonnet' })
  })
}

test('shows the mods, the agents and the messages between them', { plugins: [{ name: 'fake-router', register: router }] }, async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: 'hard', usage: USAGE } }))
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit', agentId: 'c1' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 7, 12, 0, 0) }))

  await $.agent.spawn({ prompt: 'Rework auth', description: 'Rework auth', subagentType: 'coding-agents:coder' })

  const panes = []
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: 'mod-monitor', surface, component: 'Pane', props: PANE, requestId: 'mod-monitor' })
    expect(await pane.find({ text: 'fake-router' })).toBeDefined()
    expect(await pane.find({ text: 'router: picked opus' })).toBeDefined()
    expect(await pane.find({ text: '● running' })).toBeDefined()
    expect(await pane.find({ text: 'fake-router → haiku' })).toBeDefined()
    expect(await pane.find({ text: 'haiku → fake-router' })).toBeDefined()
    expect(await pane.find({ text: 'session → coding-agents:coder (opus)' })).toBeDefined()
    panes.push(pane)
  }

  await $.turn.complete({
    answer: 'Changed 3 files',
    durationMs: 12000,
    isAborted: false,
    turnId: 't1',
    agentId: 'c1',
    reason: 'end_turn',
    usage: { ...USAGE, model: 'opus' },
  })

  for (const pane of panes) {
    expect(await pane.find({ text: '● running' })).toBeUndefined()
    expect(await pane.find({ text: /✓ coding-agents:coder on opus Rework auth · 12s · 1\.2k tok/ })).toBeDefined()
    expect(await pane.find({ text: 'coding-agents:coder (opus) → session' })).toBeDefined()
  }
})

test('an empty pane says nothing has happened yet', async $ => {
  const pane = await $.ui.mount({ plugin: 'mod-monitor', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'mod-monitor' })
  expect(await pane.find({ text: 'No mod activity yet.' })).toBeDefined()
  expect(await pane.find({ text: 'None started yet.' })).toBeDefined()
  expect(await pane.find({ text: 'Nothing yet.' })).toBeDefined()
})
