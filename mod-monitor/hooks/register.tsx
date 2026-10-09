import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, FlowRow, ModRow } from '../types'

import { FAMILY_COLOR, MOD_ICON, familyOf, kTokens, nodeOf, ownerOf, sceneSvg, statsOf } from './scene'

const PANE = 'mod-monitor'
const ME = 'mod-monitor'
const MAX_FLOW = 200
const MAX_AGENTS = 50
/** CSS pixels: tall enough to read; the drawing keeps its shape and centres in whatever width the pane has. */
const SVG_HEIGHT = 380

const agents = atom({ plugin: 'mod-monitor', key: 'agents' } as const, [])
const flow = atom({ plugin: 'mod-monitor', key: 'flow' } as const, [])
const mods = atom({ plugin: 'mod-monitor', key: 'mods' } as const, [])

export { ownerOf }

export function short(text: string, max = 60): string {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function clockOf(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')

  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

async function say($: EngineInterface, from: string, to: string, text: string) {
  const row: FlowRow = { at: await $.clock.now(), from, to, text: short(text, 80) }
  await update($, flow, rows => [...rows, row].slice(-MAX_FLOW))
}

async function doing($: EngineInterface, name: string, what: string) {
  if (name === 'engine' || name === ME) return
  const row: ModRow = { name, doing: short(what, 70), at: await $.clock.now() }
  await update($, mods, rows => [...rows.filter(r => r.name !== name), row].sort((a, b) => a.name.localeCompare(b.name)))
}

export const register: Register = on => {
  // Which plugin answers each slash command, learnt as they register.
  const commandOwner = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Show what each mod is doing and how they talk to each other' })
    void $.ui.open({ id: PANE, title: 'Mods' })

    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Mods' })

    return { text: 'Mods pane opened.' }
  })

  // Learn command owners, so "/plan" shows as you → task-planner.
  on('command.register', async ($, e, next) => {
    const done = await next(e)
    if (next.origin.plugin !== 'engine') commandOwner.set(e.name, next.origin.plugin)

    return done
  }).catch(($, e, next) => next(e))

  on('command.run', async ($, e, next) => {
    const owner = commandOwner.get(e.command)
    if (owner && owner !== ME) {
      await say($, 'you', owner, `/${e.command} ${e.args}`)
      await doing($, owner, `running /${e.command}`)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // A mod handing the session a prompt to act on.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'plugin' && e.origin.name !== ME) {
      await say($, e.origin.name, 'session', e.text)
      await doing($, e.origin.name, 'asked the session to act')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // A mod asking a model a side question (the router's rating, for one).
  on('model.complete', async ($, e, next) => {
    const asker = next.origin.plugin
    const answer = await next(e)
    if (asker !== 'engine' && asker !== ME) {
      const reply = answer.deny ?? (answer.value.isAnswered ? answer.value.text : `no answer (${answer.value.reason})`)
      await say($, asker, e.model, e.prompt)
      await say($, e.model, asker, reply)
      await doing($, asker, `asked ${e.model}: "${short(reply, 20)}"`)
    }

    return answer
  }).catch(($, e, next) => next(e))

  // What mods put on the status line or in toasts is what they say they're doing.
  on('ui.status', async ($, e, next) => {
    if (e.text) await doing($, next.origin.plugin, e.text)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.toast', async ($, e, next) => {
    await doing($, next.origin.plugin, e.text)

    return next(e)
  }).catch(($, e, next) => next(e))

  // Subagents: who started them, on which model, and when they report back.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) {
      const row: AgentRow = {
        id: started.agentId,
        type: e.subagentType,
        model: started.model,
        description: e.description,
        status: 'running',
        startedAt: await $.clock.now(),
      }
      await update($, agents, rows => [...rows, row].slice(-MAX_AGENTS))
      await say($, e.parentAgentId ? 'subagent' : 'session', `${e.subagentType} (${started.model})`, e.description)
      if (e.subagentType.includes(':')) await doing($, ownerOf(e.subagentType), `${e.subagentType} working: ${e.description}`)
    } else if (started.deny) {
      await say($, 'session', e.subagentType, `refused: ${started.deny}`)
    }

    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const id = e.agentId
      const list = await read($, agents)
      const row = list.find(r => r.id === id)
      if (row) {
        const seconds = Math.round(e.durationMs / 1000)
        const tokens = e.usage ? e.usage.input_tokens + e.usage.output_tokens : undefined
        const status = e.isAborted ? 'stopped' : 'done'
        await update($, agents, rows => rows.map(r => (r.id === id ? { ...r, status, seconds, tokens } : r)))
        await say($, `${row.type} (${row.model})`, 'session', `${status} in ${seconds}s: ${e.answer}`)
        if (row.type.includes(':')) await doing($, ownerOf(row.type), `${row.type} ${status} (${seconds}s)`)
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const modRows = await read($, mods)
    const agentRows = await read($, agents)
    const flowRows = await read($, flow)
    const now = await $.clock.now()
    const running = agentRows.filter(a => a.status === 'running')
    const finished = agentRows.filter(a => a.status !== 'running').slice(-4)
    const stats = statsOf(agentRows)
    const rows = e.viewport?.rows ?? 30

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const room = Math.max(3, rows - 12 - modRows.length - running.length - finished.length)

      return (
        <Box flexDirection="column">
          <Text bold>🎛️  Mods</Text>
          {modRows.length === 0 && <Text dimColor>   all quiet… try /plan</Text>}
          {modRows.map(m => (
            <Text wrap="truncate-end">
              {now - m.at < 20_000 ? '⚡' : '  '} {MOD_ICON[m.name] ?? '🧩'} <Text color="claude">{m.name}</Text> <Text dimColor>{m.doing}</Text>
            </Text>
          ))}

          <Text bold>🤖 Agents</Text>
          {agentRows.length === 0 && <Text dimColor>   none yet</Text>}
          {running.map(a => (
            <Text wrap="truncate-end">
              {'   '}
              <Text color="warning">◉</Text> <Text color={badgeOf(a.model).color} bold>{badgeOf(a.model).text}</Text> {a.description} <Text dimColor>· {Math.round((now - a.startedAt) / 1000)}s</Text>
            </Text>
          ))}
          {finished.map(a => (
            <Text wrap="truncate-end">
              {'   '}
              {a.status === 'done' ? <Text color="success">✔</Text> : <Text color="error">✘</Text>} <Text color={badgeOf(a.model).color} bold>{badgeOf(a.model).text}</Text> <Text dimColor>{a.description} · {a.seconds ?? 0}s{a.tokens !== undefined ? ` · ${kTokens(a.tokens)} tok` : ''}</Text>
            </Text>
          ))}
          {agentRows.length > 0 && (
            <Text>
              {'   '}
              {(['haiku', 'sonnet', 'opus', 'other'] as const).map(f => (
                <Text color={FAMILY_COLOR[f]}>{'█'.repeat(Math.round((24 * stats.byFamily[f]) / agentRows.length))}</Text>
              ))}{' '}
              <Text dimColor>💰 {stats.cheapShare}% on cheaper models · {kTokens(stats.tokens)} tok</Text>
            </Text>
          )}

          <Text bold>📡 Messages</Text>
          {flowRows.length === 0 && <Text dimColor>   nothing yet</Text>}
          {flowRows.slice(-room).map(f => (
            <Text wrap="truncate-end">
              <Text dimColor>{clockOf(f.at)}</Text> {iconOf(f.from)} → {iconOf(f.to)} <Text dimColor>{f.from} → {f.to}: {f.text}</Text>
            </Text>
          ))}
        </Box>
      )
    }

    // Desktop, editor and phone: the animated control room, then the latest messages.
    const { Box, Text, Svg } = $.ui.resolve(e)
    const svg = sceneSvg({ now, mods: modRows, agents: agentRows, flow: flowRows })

    return (
      <Box flexDirection="column" gap={1}>
        <Svg source={svg} alt={describe(modRows, agentRows)} height={SVG_HEIGHT} isInteractive />
        <Box flexDirection="column">
          <Text bold>📡 Messages</Text>
          {flowRows.length === 0 && <Text dimColor>Nothing yet. Try /plan or ask for some coding work.</Text>}
          {flowRows.slice(-8).reverse().map(f => (
            <Text wrap="truncate-end">
              <Text dimColor>{clockOf(f.at)}</Text> {iconOf(f.from)} <Text bold>{f.from}</Text> → {iconOf(f.to)} <Text bold>{f.to}</Text> <Text dimColor>{f.text}</Text>
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}

/** A model as a coloured badge: 🍃 haiku, 🎼 sonnet, 🧠 opus. */
export function badgeOf(model: string) {
  const f = familyOf(model)

  return { text: `${iconOf(f)} ${f}`, color: FAMILY_COLOR[f] }
}

export function iconOf(label: string): string {
  const node = nodeOf(label)
  if (node === 'you') return '🧑'
  if (node === 'session') return '🤖'
  if (node === 'model:haiku') return '🍃'
  if (node === 'model:sonnet') return '🎼'
  if (node === 'model:opus') return '🧠'
  if (node.startsWith('model:')) return '❔'

  return MOD_ICON[node] ?? '🧩'
}

function describe(modRows: readonly ModRow[], agentRows: readonly AgentRow[]): string {
  const running = agentRows.filter(a => a.status === 'running')
  const mods = modRows.map(m => `${m.name}: ${m.doing}`).join('; ')

  return `Mod activity. ${mods || 'No mod activity yet.'} ${running.length} agents running, ${agentRows.length} started in all.`
}
