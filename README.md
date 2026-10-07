# Claude Code mods

Three mods that work together: plan first, then code with each task sent to a model that fits how hard it is.

| Mod | What it does |
| --- | --- |
| `task-planner` | `/plan <goal>` runs an **Opus** planner agent (read-only) that returns a checklist of focused tasks, each rated easy/medium/hard. The steps appear in a **Plan** pane. `/plan-done N` ticks a step, `/plan-view` reopens the pane. |
| `coding-agents` | Adds a `coder` subagent and tells the main session to hand each focused coding task to it, one task at a time. Status line shows how many coders are running. |
| `model-router` | Before each `coder` starts, **Haiku** rates the task (costs very little) and the coder runs on **Haiku** (easy), **Sonnet** (medium) or **Opus** (hard). If rating fails it uses Sonnet. If the session asks for a model explicitly, that wins. `/routing` shows the tally. |

## Install

In a Claude Code terminal session:

```
/plugin install task-planner --marketplace alexatennea/claude-mods
/plugin install coding-agents --marketplace alexatennea/claude-mods
/plugin install model-router --marketplace alexatennea/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope = all your sessions).

## Use

1. `/plan add password reset to the login page`
2. Read the plan, then say "go ahead".
3. The session hands each step to the coder; watch the status line for which model each one got.
4. `/routing` to see how many tasks went to each model.

## Configure

`model-router` options (in `/config`, or `pluginConfigs.model-router.options` in settings):

- `easyModel` / `mediumModel` / `hardModel`: defaults `haiku` / `sonnet` / `opus` (aliases always mean the latest of each)
- `classifierModel`: default `haiku`
- `routedAgents`: comma-separated agent types to route, default `coding-agents:coder`. Add more coding agents here as you build them.

## Develop

```
claude plugin validate model-router
claude plugin test model-router
claude --plugin-dir task-planner --plugin-dir coding-agents --plugin-dir model-router
```
