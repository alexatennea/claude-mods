import { expect, test } from 'claude-code/testing'
import type { Register } from 'claude-code'

import { nodeOf, sceneSvg } from '../hooks/scene'

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0)
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
  on('clock.now', () => ({ value: NOW }))

  await $.agent.spawn({ prompt: 'Rework auth', description: 'Rework auth', subagentType: 'coding-agents:coder' })

  const term = await $.ui.mount({ plugin: 'mod-monitor', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'mod-monitor' })
  expect(await term.find({ text: 'fake-router' })).toBeDefined()
  expect(await term.find({ text: 'router: picked opus' })).toBeDefined()
  expect(await term.find({ text: '◉' })).toBeDefined()
  expect(await term.find({ text: '🧠 opus' })).toBeDefined()
  expect(await term.find({ text: 'fake-router → haiku' })).toBeDefined()
  expect(await term.find({ text: 'haiku → fake-router' })).toBeDefined()
  expect(await term.find({ text: 'session → coding-agents:coder (opus)' })).toBeDefined()

  const desk = await $.ui.mount({ plugin: 'mod-monitor', surface: 'desktop', component: 'Pane', props: PANE, requestId: 'mod-monitor' })
  const svg = await desk.find({ type: 'Svg' })
  expect(svg?.props.isInteractive).toBe(true)
  const source = String(svg?.props.source)
  expect(source).toContain('<svg')
  expect(source).toContain('animateMotion') // messages flying
  expect(source).toContain('stroke-dashoffset') // the running coder's link
  expect(source).toContain('fake-router')
  expect(await desk.find({ text: 'fake-router' })).toBeDefined()

  await $.turn.complete({ answer: 'Changed 3 files', durationMs: 12000, isAborted: false, turnId: 't1', agentId: 'c1', reason: 'end_turn', usage: { ...USAGE, model: 'opus' } })

  expect(await term.find({ text: '◉' })).toBeUndefined()
  expect(await term.find({ text: '✔' })).toBeDefined()
  expect(await term.find({ text: /Rework auth · 12s · 1\.2k tok/ })).toBeDefined()
  expect(await term.find({ text: '0% on cheaper models' })).toBeDefined()
  expect(await term.find({ text: 'coding-agents:coder (opus) → session' })).toBeDefined()
})

test('an empty pane says nothing has happened yet', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  const pane = await $.ui.mount({ plugin: 'mod-monitor', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'mod-monitor' })
  expect(await pane.find({ text: 'all quiet' })).toBeDefined()
  expect(await pane.find({ text: 'none yet' })).toBeDefined()
  expect(await pane.find({ text: 'nothing yet' })).toBeDefined()
})

test('message ends map onto the diagram nodes', () => {
  expect(nodeOf('you')).toBe('you')
  expect(nodeOf('subagent')).toBe('session')
  expect(nodeOf('haiku')).toBe('model:haiku')
  expect(nodeOf('claude-opus-5-5')).toBe('model:opus')
  expect(nodeOf('coding-agents:coder (claude-opus-5-5)')).toBe('coding-agents')
  expect(nodeOf('model-router')).toBe('model-router')
})

test('the scene stays a well-formed, bounded SVG with old messages left still', () => {
  const svg = sceneSvg({
    now: NOW,
    mods: [{ name: 'model-router', doing: 'rating <stuff> & things', at: NOW }],
    agents: [{ id: 'a', type: 'coding-agents:coder', model: 'claude-haiku-5-5', description: 'x', status: 'done', startedAt: NOW, seconds: 3, tokens: 500 }],
    flow: [{ at: NOW - 10 * 60_000, from: 'you', to: 'task-planner', text: 'old' }],
  })
  expect(svg).toContain('rating &lt;stuff&gt; &amp; things')
  expect(svg).not.toContain('animateMotion path') // a 10-minute-old message doesn't fly
  expect(svg).toContain('100% on cheaper models')
  expect(svg.length).toBeLessThan(131072)
})
