import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, StashFile } from '../types'
import { add, empty, fileName, parse, preview, remove, serialize } from './stash'

const PANE = 'pstash'
const SHOWN = 12
const NOT_PASTED = 'could not paste into the prompt; kept it'
const items = atom({ plugin: 'pstash', key: 'items' } as const, [] as Item[])
// True while a /stash run is under way, so its spinner can be blanked.
const isRunning = atom({ plugin: 'pstash', key: 'isRunning' } as const, false)
// The id of the picker row that holds the focus ring, for `x` and `y`.
const focused = atom({ plugin: 'pstash', key: 'focused' } as const, null as string | null)
// `v0.2.0`, plus ` · local` for a copy not installed from a marketplace.
const label = atom({ plugin: 'pstash', key: 'label' } as const, '')

// The transcript row of a `/stash ...` run, and the args in it to blank out.
const STASH_ROW = /<command-name>\/?(?:pstash:)?stash<\/command-name>/
const STASH_PROMPT = /^\s*\/(?:pstash:)?stash(?:\s|$)/
const ARGS = /<command-args>[\s\S]*?<\/command-args>/g

type $ = EngineInterface

/** `$PSTASH_DIR`, else `~/.pstash`, plus this project's file name. */
async function location($: $): Promise<{ path: string; project: string }> {
  const dir = (await $.env.get('PSTASH_DIR')) ?? `${await $.env.get('HOME')}/.pstash`
  const project = await $.session.root()
  return { path: `${dir.replace(/\/$/, '')}/${fileName(project)}`, project }
}

/** Reads the file fresh each time, so other sessions' changes are never lost. */
async function load($: $): Promise<StashFile> {
  const { path, project } = await location($)
  if (!(await $.fs.exists(path))) return empty(project)
  try {
    return parse(await $.fs.read(path), project)
  } catch (error) {
    throw new Error(`${path} is unreadable (${String(error)}); fix or delete it`)
  }
}

async function change($: $, edit: (file: StashFile) => StashFile): Promise<StashFile> {
  const { path } = await location($)
  const file = edit(await load($))
  await $.fs.write(path, serialize(file))
  await show($, file.items)
  return file
}

async function show($: $, list: Item[]): Promise<void> {
  await update($, items, () => list)
}

// Each command answers with one short line: a run that prints nothing has its
// row removed again, which flickers the screen.

async function stash($: $, text: string): Promise<string> {
  const now = await $.clock.now()
  const item: Item = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text,
    at: new Date(now).toISOString(),
    from: 'claude',
  }
  const file = await change($, f => add(f, item))
  return `stashed · ${file.items.length}`
}

/** Pastes at the cursor first and removes only once the box took it; `keep` leaves it stashed. */
async function pop($: $, item: Item, keep = false): Promise<string> {
  const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isOpen) await $.ui.close({ id: PANE })
  const filled = await $.prompt.fill({ text: item.text, mode: 'insert' })
  if (!filled.isFilled) return NOT_PASTED
  if (keep) return `pasted · kept, ${(await load($)).items.length} stashed`
  const file = await change($, f => remove(f, item.id))
  return `pasted · ${file.items.length} left`
}

async function popNewest($: $, keep = false): Promise<string> {
  const newest = (await load($)).items[0]
  return newest === undefined ? 'nothing stashed' : pop($, newest, keep)
}

/** The highlighted picker row, else the first, with its index. */
async function focusedItem($: $): Promise<{ at: number; target: Item | undefined }> {
  const list = await read($, items)
  const id = await read($, focused)
  const at = Math.max(0, list.findIndex(item => item.id === id))
  return { at, target: list[at] }
}

function reportPop($: $, pending: Promise<string>): void {
  pending.then(
    text => text === NOT_PASTED && $.ui.toast(text),
    error => failed($, error),
  )
}

async function openPicker($: $): Promise<string> {
  const file = await load($)
  await show($, file.items)
  if (file.items.length === 0) return 'nothing stashed · /stash <text> to add'
  const rows = Math.min(file.items.length, SHOWN) + 1
  await $.ui.open({ id: PANE, title: 'Stash', focus: true, closeOnEscape: true, rows })
  return `${file.items.length} stashed`
}

/** Deletes the highlighted row (else the first) and moves the ring to the row now in its place. */
async function deleteFocused($: $): Promise<void> {
  const { at, target } = await focusedItem($)
  if (target === undefined) return
  const file = await change($, f => remove(f, target.id))
  const next = file.items[Math.min(at, file.items.length - 1)]
  if (next === undefined) return $.ui.close({ id: PANE })
  await update($, focused, () => next.id)
  // A hotkey press leaves the ring on its own button once the press ends.
  $.clock.after(30, () => void $.ui.focus({ requestId: PANE, key: `pop-${next.id}` }))
}

/** Reads this copy's version off its plugin.json; installed copies live in the plugins cache. */
async function versionLabel($: $): Promise<string> {
  const manifest = JSON.parse(String(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)))
  const version = typeof manifest.version === 'string' ? `v${manifest.version}` : ''
  const isInstalled = $.plugin.root.includes('/.claude/plugins/')
  return isInstalled ? version : `${version} · local`
}

function message(error: unknown): string {
  return `pstash: ${error instanceof Error ? error.message : String(error)}`
}

function failed($: $, error: unknown): void {
  $.ui.toast(message(error), { timeoutMs: 8000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'stash',
      description: 'Stash a prompt for later; bare /stash picks one to paste back',
      argumentHint: '[text | pop | yank]',
      immediate: true,
    })
    $.ui.status(undefined) // clears the line 0.1.0 pinned
    await update($, isRunning, () => false) // a reload mid-run leaves it set
    await load($).then(file => show($, file.items), error => failed($, error))
    // Provenance only: a missing or odd manifest just leaves the label empty.
    await versionLabel($).then(text => update($, label, () => text), () => undefined)
    return next(e)
  })

  // Claude Code draws its "thinking" spinner while any command runs; the
  // flag is set as early as the prompt is seen, so the first frame is blank too.
  let isTurn = false
  on('turn.start', async ($, e, next) => {
    isTurn = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    isTurn = false
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    if (STASH_PROMPT.test(e.text)) await update($, isRunning, () => true)
    return next(e)
  })

  on('command.run', { command: 'stash' }, async ($, e) => {
    const args = e.args.trim()
    await update($, isRunning, () => true)
    try {
      if (args === '') return { text: await openPicker($) }
      if (args === 'pop') return { text: await popNewest($) }
      if (args === 'yank') return { text: await popNewest($, true) }
      return { text: await stash($, args) }
    } catch (error) {
      return { text: message(error) }
    } finally {
      await update($, isRunning, () => false)
    }
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (isTurn || !(await read($, isRunning))) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text> </Text>
  })

  // Keep stashed text out of the conversation (the screen draws the same row).
  on('session.append', { door: 'command' }, ($, e, next) => {
    const textOf = (b: { type: string; text?: unknown }) =>
      b.type === 'text' && typeof b.text === 'string' ? b.text : undefined
    const isStash = e.message.content.some(b => STASH_ROW.test(textOf(b) ?? ''))
    if (!isStash) return next(e)
    const content = e.message.content.map(b => {
      const text = textOf(b)
      return text === undefined ? b : { ...b, text: text.replace(ARGS, '<command-args></command-args>') }
    })
    return next({ ...e, message: { ...e.message, content } })
  })

  // The count, as a dim mode label at the right of the prompt footer.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const count = (await read($, items)).length
    if (count === 0) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, `stash ${count}`] } })
  })

  // The ring stays on the rows: never on the yank or delete control or the close mark.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const element = e.element ?? ''
    if (!element.startsWith('pop-')) {
      const id = await read($, focused)
      return id === null ? { deny: 'rows only' } : next({ ...e, element: `pop-${id}` })
    }
    await update($, focused, () => element.slice('pop-'.length))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, items)
    const version = await read($, label)
    const width = Math.max(10, e.props.bodyColumns - 4)
    if (list.length === 0) return <Text dimColor>Nothing stashed.</Text>

    return (
      <Box flexDirection="column">
        {list.map((item, i) => (
          <Button
            key={`pop-${item.id}`}
            plain
            {...(i < 9 ? { hotkey: String(i + 1) } : {})}
            {...(i === 0 ? { autoFocus: true as const } : {})}
            onPress={() => reportPop($, pop($, item))}
          >
            {preview(item.text, width)}
          </Button>
        ))}
        <Box>
          <Text dimColor>enter or 1-9 paste · ↑↓ move · </Text>
          <Button
            key="yank"
            plain
            dimColor
            hotkey="y"
            label="yank"
            onPress={() =>
              focusedItem($).then(
                ({ target }) => target && reportPop($, pop($, target, true)),
                error => failed($, error),
              )
            }
          />
          <Text dimColor> · </Text>
          <Button
            key="delete"
            plain
            dimColor
            hotkey="x"
            label="delete"
            onPress={() => deleteFocused($).catch(error => failed($, error))}
          />
          <Text dimColor> · esc close</Text>
          <Box flexGrow={1} justifyContent="flex-end">
            <Text dimColor>{version}</Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
