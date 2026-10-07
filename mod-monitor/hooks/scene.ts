import type { AgentRow, FlowRow, ModRow } from '../types'

/** The model families the mods route between, and their colours. */
export type Family = 'haiku' | 'sonnet' | 'opus' | 'other'

export const FAMILY_COLOR: Record<Family, string> = {
  haiku: '#22a06b',
  sonnet: '#3b82f6',
  opus: '#a855f7',
  other: '#94a3b8',
}

export const MOD_ICON: Record<string, string> = {
  'task-planner': '🧭',
  'model-router': '🔀',
  'coding-agents': '🛠️',
}

const DEFAULT_MODS = ['task-planner', 'model-router', 'coding-agents']
const MOD_COLOR = '#d97757'
const SESSION_COLOR = '#f59e0b'
const YOU_COLOR = '#64748b'

export function familyOf(model: string): Family {
  if (/haiku/i.test(model)) return 'haiku'
  if (/sonnet/i.test(model)) return 'sonnet'
  if (/opus/i.test(model)) return 'opus'

  return 'other'
}

/** The plugin that owns a namespaced name (`model-router:coder` → `model-router`), else the name. */
export function ownerOf(name: string): string {
  const i = name.indexOf(':')

  return i > 0 ? name.slice(0, i) : name
}

/** Which node of the diagram a message end names: you, the session, a mod or a model. */
export function nodeOf(label: string): string {
  if (label === 'you') return 'you'
  if (label === 'session' || label === 'subagent') return 'session'
  const head = label.split(' ')[0] ?? label
  if (head.includes(':')) return ownerOf(head)
  if (/^(claude-)?(haiku|sonnet|opus)\b/i.test(head)) return `model:${familyOf(head)}`

  return head
}

export type Stats = { byFamily: Record<Family, number>; tokens: number; cheapShare: number | undefined }

export function statsOf(agents: readonly AgentRow[]): Stats {
  const byFamily: Record<Family, number> = { haiku: 0, sonnet: 0, opus: 0, other: 0 }
  let tokens = 0
  for (const a of agents) {
    byFamily[familyOf(a.model)] += 1
    tokens += a.tokens ?? 0
  }
  const total = agents.length
  const cheap = byFamily.haiku + byFamily.sonnet

  return { byFamily, tokens, cheapShare: total === 0 ? undefined : Math.round((cheap / total) * 100) }
}

export function kTokens(n: number): string {
  return n < 1000 ? `${n}` : `${Math.round(n / 100) / 10}k`
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type Node = { id: string; x: number; y: number; r: number; color: string; icon: string; label: string; tip: string }

const W = 690
const H = 360
const GRAPH_H = 290
const RECENT_MS = 120_000
const ACTIVE_MS = 20_000
const MAX_DOTS = 6

/**
 * The control room: you → session → mods → models, with live messages as
 * dots flying along the wires and running agents as pulsing, spinning links.
 * Drawn as an interactive SVG so SMIL animation and <title> tooltips work.
 */
export function sceneSvg(input: { now: number; mods: readonly ModRow[]; agents: readonly AgentRow[]; flow: readonly FlowRow[] }): string {
  const { now, mods, agents, flow } = input
  const running = agents.filter(a => a.status === 'running')
  const stats = statsOf(agents)

  const modNames = [...new Set([...DEFAULT_MODS, ...mods.map(m => m.name), ...agents.map(a => ownerOf(a.type))])].filter(
    n => n !== 'mod-monitor' && !n.includes(' ') && n !== '' && !['general-purpose', 'Explore', 'Plan', 'fork'].includes(n),
  )
  const families: Family[] = ['haiku', 'sonnet', 'opus', ...(stats.byFamily.other > 0 ? (['other'] as const) : [])]

  const nodes = new Map<string, Node>()
  const mid = GRAPH_H / 2
  nodes.set('you', { id: 'you', x: 52, y: mid, r: 22, color: YOU_COLOR, icon: '🧑', label: 'you', tip: 'You' })
  nodes.set('session', {
    id: 'session',
    x: 190,
    y: mid,
    r: 32,
    color: SESSION_COLOR,
    icon: '🤖',
    label: 'session',
    tip: 'The main Claude Code session',
  })
  modNames.forEach((name, i) => {
    const y = 40 + ((GRAPH_H - 80) * (i + 0.5)) / modNames.length
    const row = mods.find(m => m.name === name)
    nodes.set(name, {
      id: name,
      x: 370,
      y,
      r: 24,
      color: MOD_COLOR,
      icon: MOD_ICON[name] ?? '🧩',
      label: name,
      tip: row ? `${name}: ${row.doing}` : `${name}: idle`,
    })
  })
  families.forEach((f, i) => {
    const y = 30 + ((GRAPH_H - 60) * (i + 0.5)) / families.length
    const count = stats.byFamily[f]
    nodes.set(`model:${f}`, {
      id: `model:${f}`,
      x: 590,
      y,
      r: 26,
      color: FAMILY_COLOR[f],
      icon: f === 'haiku' ? '🍃' : f === 'sonnet' ? '🎼' : f === 'opus' ? '🧠' : '❔',
      label: f,
      tip: `${f}: ${count} task${count === 1 ? '' : 's'}`,
    })
  })

  const parts: string[] = []
  const line = (a: Node, b: Node, extra: string) =>
    `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${extra}/>`

  // Static wires.
  const you = nodes.get('you')!
  const session = nodes.get('session')!
  parts.push(`<g class="wire">`)
  parts.push(line(you, session, ''))
  for (const name of modNames) {
    parts.push(line(session, nodes.get(name)!, ''))
    if (name === 'model-router' || name === 'coding-agents') {
      for (const f of families) parts.push(line(nodes.get(name)!, nodes.get(`model:${f}`)!, 'class="faint"'))
    }
  }
  parts.push(`</g>`)

  // Running agents: a marching link from the owning mod to its model.
  for (const a of running) {
    const from = nodes.get(ownerOf(a.type)) ?? session
    const to = nodes.get(`model:${familyOf(a.model)}`)
    if (!to) continue
    parts.push(
      `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${to.color}" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round">` +
        `<animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.8s" repeatCount="indefinite"/>` +
        `<title>${esc(`${a.type} on ${a.model}: ${a.description}`)}</title></line>`,
    )
  }

  // Recent messages: dots flying along their wire.
  const recent = flow.filter(f => now - f.at < RECENT_MS).slice(-MAX_DOTS)
  recent.forEach((f, i) => {
    const a = nodes.get(nodeOf(f.from))
    const b = nodes.get(nodeOf(f.to))
    if (!a || !b || a === b) return
    const begin = `${(i * 0.35).toFixed(2)}s`
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${a.color}" stroke-width="2" opacity="0">` +
        `<animate attributeName="opacity" values="0;0.7;0" dur="1.6s" begin="${begin}" repeatCount="3"/></line>`,
    )
    parts.push(
      `<circle r="5" fill="${a.color}" opacity="0"><title>${esc(`${f.from} → ${f.to}: ${f.text}`)}</title>` +
        `<animate attributeName="opacity" values="0;1;1;0" dur="1.6s" begin="${begin}" repeatCount="3"/>` +
        `<animateMotion path="M${a.x},${a.y} L${b.x},${b.y}" dur="1.6s" begin="${begin}" repeatCount="3"/></circle>`,
    )
  })

  // Nodes, with a pulse when busy.
  for (const n of nodes.values()) {
    const modRow = mods.find(m => m.name === n.id)
    const runningHere = running.filter(a => ownerOf(a.type) === n.id || `model:${familyOf(a.model)}` === n.id).length
    const isBusy = runningHere > 0 || (modRow !== undefined && now - modRow.at < ACTIVE_MS)
    const isModel = n.id.startsWith('model:')
    const isIdleModel = isModel && stats.byFamily[n.label as Family] === 0
    parts.push(`<g${isIdleModel ? ' opacity="0.45"' : ''}><title>${esc(n.tip)}</title>`)
    if (isBusy) {
      parts.push(
        `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="none" stroke="${n.color}" stroke-width="2">` +
          `<animate attributeName="r" values="${n.r};${n.r + 14}" dur="1.4s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values="0.8;0" dur="1.4s" repeatCount="indefinite"/></circle>`,
      )
    }
    parts.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.color}" fill-opacity="0.18" stroke="${n.color}" stroke-width="2"/>`)
    if (isBusy && !isModel && n.id !== 'you') {
      // A little orbiting spark while working.
      parts.push(
        `<circle r="3.5" fill="${n.color}"><animateMotion dur="2s" repeatCount="indefinite" ` +
          `path="M${n.x + n.r + 6},${n.y} a${n.r + 6},${n.r + 6} 0 1,1 -${2 * (n.r + 6)},0 a${n.r + 6},${n.r + 6} 0 1,1 ${2 * (n.r + 6)},0"/></circle>`,
      )
    }
    parts.push(`<text x="${n.x}" y="${n.y + 7}" text-anchor="middle" font-size="${Math.round(n.r * 0.85)}">${n.icon}</text>`)
    parts.push(
      isModel
        ? `<text class="label" x="${n.x + n.r + 8}" y="${n.y + 4}">${esc(n.label)}</text>`
        : `<text class="label" x="${n.x}" y="${n.y + n.r + 16}" text-anchor="middle">${esc(n.label)}</text>`,
    )
    if (isModel) {
      const count = stats.byFamily[n.label as Family]
      if (count > 0) {
        parts.push(
          `<circle cx="${n.x + n.r * 0.75}" cy="${n.y - n.r * 0.75}" r="10" fill="${n.color}"/>` +
            `<text x="${n.x + n.r * 0.75}" y="${n.y - n.r * 0.75 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${count}</text>`,
        )
      }
    }
    parts.push(`</g>`)
  }

  // Bottom strip: the model mix and how much ran on cheaper models.
  const barX = 24
  const barW = W - 48
  const barY = GRAPH_H + 14
  const total = agents.length
  parts.push(`<rect x="${barX}" y="${barY}" width="${barW}" height="12" rx="6" class="track"/>`)
  let x = barX
  for (const f of ['haiku', 'sonnet', 'opus', 'other'] as const) {
    const n = stats.byFamily[f]
    if (n === 0 || total === 0) continue
    const w = (barW * n) / total
    parts.push(`<rect x="${x}" y="${barY}" width="${w}" height="12" fill="${FAMILY_COLOR[f]}"><title>${f}: ${n}</title></rect>`)
    if (w > 60) parts.push(`<text x="${x + 6}" y="${barY + 10}" font-size="9" font-weight="700" fill="#fff">${f} ${n}</text>`)
    x += w
  }
  const summary =
    total === 0
      ? 'No agents yet. Try /plan or ask for some coding work.'
      : `${total} task${total === 1 ? '' : 's'} · ${kTokens(stats.tokens)} tokens · 💰 ${stats.cheapShare}% on cheaper models` +
        (running.length > 0 ? ` · ⚡ ${running.length} running` : '')
  parts.push(`<text class="label" x="${barX}" y="${barY + 34}">${esc(summary)}</text>`)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, sans-serif">` +
    `<style>` +
    `.wire line{stroke:#8884;stroke-width:1.5}.wire line.faint{stroke:#8882;stroke-dasharray:2 4}` +
    `.label{font-size:12px;fill:#334155}.track{fill:#8883}` +
    `@media (prefers-color-scheme: dark){.label{fill:#e2e8f0}}` +
    `</style>` +
    parts.join('') +
    `</svg>`
  )
}
