import type { Register } from 'claude-code'

const CODER = 'coding-agents:coder'

const GUIDANCE = `# Delegating coding work
For implementation work, split it into focused tasks (or follow the current plan's steps) and hand each one to the ${CODER} agent, one task per call, with the files involved and how to check it. Leave the Agent tool's model parameter unset: a router picks the model per task. Make one-line edits yourself. Review each coder's report before starting the next dependent task.`

export const register: Register = on => {
  const running = new Map<string, string>()
  const label = () => (running.size === 0 ? undefined : `coders: ${running.size} running`)

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [...composed.sections, { id: 'coding-agents:guidance', text: GUIDANCE, scope: 'session' }],
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (e.subagentType === CODER && started.agentId) {
      running.set(started.agentId, e.description)
      $.ui.status(label())
    }

    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId && running.delete(e.agentId)) $.ui.status(label())

    return next(e)
  })
}
