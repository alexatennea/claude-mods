# Claude Code mods

Four mods that work together: plan first, then code with each task sent to a model that fits how hard it is, and watch it all happen.

| Mod | What it does |
| --- | --- |
| `task-planner` | `/plan <goal>` runs an **Opus** planner agent (read-only) that returns a checklist of focused tasks, each rated easy/medium/hard. The steps appear in a **Plan** pane. |
| `coding-agents` | Adds a `coder` subagent and tells the main session to hand each focused coding task to it, one at a time. |
| `model-router` | Before each `coder` starts, **Haiku** rates the task and the coder runs on **Haiku** (easy), **Sonnet** (medium) or **Opus** (hard). Falls back to Sonnet if rating fails; a model the session asks for explicitly wins. |
| `mod-monitor` | A **Mods** pane showing what each mod is doing, every agent they start (running / done, model, time, tokens) and the messages passing between you, the session, the mods and the models. |

They need Claude Code on your own computer (terminal `claude`, or the Code tab of the desktop app). Cloud sessions in the Claude app don't load plugins.

## Install

In a Claude Code session:

```
/plugin install task-planner --marketplace alexatennea/claude-mods
/plugin install coding-agents --marketplace alexatennea/claude-mods
/plugin install model-router --marketplace alexatennea/claude-mods
/plugin install mod-monitor --marketplace alexatennea/claude-mods
```

Answer `y` to add the marketplace the first time, then pick **user** scope so they're on in every session. Start a new session (or run `/reload-plugins`) and they're active.

## How to use

1. **Open your project** and start Claude Code there (`cd my-project && claude`). Use a wide terminal: panes show beside the conversation from about 144 columns; in a narrower one, open them with the commands below.
2. **Watch:** `/mods` opens the Mods pane.
3. **Plan:** `/plan add password reset to the login page`. The planner (Opus) reads the code and returns numbered steps rated easy/medium/hard; the **Plan** pane opens with them. Nothing is edited yet.
4. **Review the plan.** Ask for changes in plain words ("split step 3", "skip the email step") if needed.
5. **Build:** say "go ahead". The session hands each step to a `coder`. For each one the router asks Haiku to rate it, then the coder runs on Haiku, Sonnet or Opus. In the Mods pane you'll see e.g.:
   ```
   model-router → haiku: Task: Add reset route …
   haiku → model-router: medium
   session → coding-agents:coder (sonnet): Add reset route
   coding-agents:coder (sonnet) → session: done in 41s: Changed 2 files …
   ```
6. **Track progress:** `/plan-done 2` ticks off step 2; `/plan-view` reopens the Plan pane.
7. **Check spend:** `/routing` shows how many tasks went to each model.

You don't have to use `/plan`: asking for any coding work ("fix the failing date test") also goes through coder + router.

### Commands

| Command | Mod | Does |
| --- | --- | --- |
| `/plan <goal>` | task-planner | Plan a goal with the Opus planner |
| `/plan-view` | task-planner | Open the Plan pane |
| `/plan-done N` | task-planner | Tick (or untick) step N |
| `/routing` | model-router | Tasks per model so far |
| `/mods` | mod-monitor | Open the Mods pane |

## Configure

`model-router` options (in `/config`, or `pluginConfigs.model-router.options` in settings):

- `easyModel` / `mediumModel` / `hardModel`: defaults `haiku` / `sonnet` / `opus` (aliases always mean the latest of each)
- `classifierModel`: default `haiku`
- `routedAgents`: comma-separated agent types to route, default `coding-agents:coder`. Add more coding agents here as you build them.

## Develop

```
claude plugin validate model-router
claude plugin test model-router
claude --plugin-dir task-planner --plugin-dir coding-agents --plugin-dir model-router --plugin-dir mod-monitor
```
