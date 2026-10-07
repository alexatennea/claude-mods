import { expect, test } from 'claude-code/testing'

test('the system prompt tells the session to delegate to the coder agent', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Hi.', scope: 'shared' }] }))

  const { sections } = await $.prompt.compose({ model: 'opus', promptModel: 'opus', surfaces: [], tools: [], outputStyle: null, traits: [] })

  expect(sections.map(s => s.id)).toEqual(['intro', 'coding-agents:guidance'])
  expect(sections[1]?.text).toContain('coding-agents:coder')
})
