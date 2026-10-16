# pstash

[![Latest release](https://img.shields.io/github/v/release/maxsoldev/pstash)](https://github.com/maxsoldev/pstash/releases/latest) [![License: MIT](https://img.shields.io/github/license/maxsoldev/pstash)](LICENSE)

Stash prompts for later and pop them back into the input box. A [Claude Code](https://claude.com/claude-code) mod: instant, no model call, works while Claude is busy, and the stashed text never reaches the model.

## Why not just type a follow-up?

A message you type while Claude is working is queued. Claude reads it during the current turn or right after it, so it becomes part of the work in progress. That's right for "also update the docs", and Claude often does those things anyway.

Stash is for prompts you **don't** want sent yet:

- **Side questions.** "How does the retry logic decide when to give up?" would derail the task Claude is on. Stash it and ask once the task is done.
- **Several ideas at once.** Jot down every question or follow-up as it comes to you, then expand on them and send them one at a time, in the order you choose.

## Install

In Claude Code:

```
/plugin install pstash --marketplace maxsoldev/pstash
```

## Use

| Command         | Does                                       |
| --------------- | ------------------------------------------ |
| `/stash <text>` | Saves the text                             |
| `/stash pop`    | Pastes the newest stash into the input box |
| `/stash yank`   | Same as pop, but keeps it in the stash     |
| `/stash`        | Opens the picker                           |

**1. Stash a prompt.** Type `/stash` and the prompt you want to send later.

![Typing /stash with a prompt](docs/1-adding.png)

**2. It's saved.** Press Enter: the prompt is stashed and the footer count goes up. The stashed text stays out of the chat and out of the model's context.

![The prompt is stashed](docs/2-added.png)

**3. Pop it back.** `/stash pop` pastes the newest stash into the input box, ready to edit or send.

![The prompt is back in the input box](docs/3-popped.png)

**Or pick one.** Bare `/stash` lists everything: Enter or `1`-`9` pastes, `y` pastes the highlighted prompt and keeps it, ↑↓ move, `x` deletes the highlighted prompt, Esc closes.

![The picker](docs/4-picker.png)

## Storage

One JSON file per project, shared by all sessions: `~/.pstash/<project path with non-alphanumerics as ->.json`. Set `PSTASH_DIR` to move it.

```json
{
  "version": 1,
  "project": "/Users/max/app",
  "items": [
    {
      "id": "lx2k9a3f",
      "text": "how does the retry logic decide when to give up...",
      "at": "2026-10-11T14:20:00.000Z",
      "from": "claude"
    }
  ]
}
```

Items are newest first, capped at 100, without duplicates. Each change re-reads the file, so sessions don't overwrite each other, and a file that doesn't parse is never overwritten. Any tool that follows this format can share the stash.

## What it runs and sends

**What it sends, and where.** Nothing. Stashes stay on your machine in `~/.pstash/`. The mod makes no network calls and no model calls.

**Which programs it runs.** None.

**What it changes in your prompts.** Nothing. It submits no prompts and adds nothing to yours.

**What it changes in the chat.** In the record of a `/stash` run it blanks the command's arguments, so the stashed text never reaches Claude. Claude only sees `/stash` and the short output line, like `stashed · 3`.

**What it reads.** The `HOME` and `PSTASH_DIR` environment variables, to find the stash folder, and the session's project root, to pick the file.

**What each hook does.**
- `session.start`: adds the `/stash` command and loads the stash count.
- `command.run` for `stash`: saves, pops, yanks or opens the picker.
- `session.append` for command rows: blanks the arguments of a `/stash` run.
- `prompt.submit`, `turn.start`, `turn.complete`: notice a `/stash` run outside a turn, so its spinner can be hidden. Prompts pass through unchanged.
- `ui.render` for `Spinner`: draws the spinner blank while `/stash` runs outside a turn.
- `ui.render` for `SessionMode`: adds `stash n` to the footer.
- `ui.render` for its pane: draws the picker.
- `ui.focus` for its pane: keeps the highlight on the prompts, so `x` and `y` always know which one to act on.

## License

[MIT](LICENSE)

## Develop

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```
