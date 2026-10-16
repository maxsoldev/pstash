import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const DIR = '/home/u/.pstash'
const FILE = `${DIR}/-work-app.json`

/** Answers everything beneath the plugin: a file system in memory, a prompt box, the UI. */
function world(on: On, files: Record<string, string> = {}) {
  const box = { text: '', canFill: true }
  const toasts: string[] = []
  mock.clock(on, { now: 1_000 })
  on('env.get', ($, e) => ({ value: e.name === 'PSTASH_DIR' ? DIR : undefined }))
  on('session.root', () => ({ value: '/work/app' }))
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '' }))
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.focus', () => ({}))
  on('ui.status', () => ({ value: undefined }))
  // Stands for the engine's footer: draws the labels it is handed.
  on('ui.render', { component: 'SessionMode' }, ($, e) => h($.ui.resolve(e).Text, {}, e.props.modes.join(' & ')) as never)
  on('prompt.fill', ($, e) => {
    if (!box.canFill) return { isFilled: false }
    box.text += e.text
    return { isFilled: true }
  })
  return { files, box, toasts }
}

/** Runs `/stash <args>` as the person would. */
const run = ($: Engine, args: string) =>
  $.command.run({
    command: 'stash',
    args,
    origin: { kind: 'composer' } as never,
    presentation: { isFullscreen: false, columns: 80 },
  })

const stored = (files: Record<string, string>) => JSON.parse(files[FILE] ?? '{"items":[]}').items

test('stashes text into the project file, newest first, without repeats', async ($, on) => {
  const w = world(on)
  await run($, 'first')
  await run($, 'second')
  await run($, 'first')
  expect(stored(w.files).map((i: { text: string }) => i.text)).toEqual(['first', 'second'])
  expect((await run($, 'second')).text).toBe('stashed · 2')
  const ui = await $.ui.mount({ plugin: 'pstash', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  expect(JSON.stringify(await ui.drawn())).toContain('stash 2')
})

test('pop pastes the newest into the prompt and removes it', async ($, on) => {
  const w = world(on)
  await run($, 'older')
  await run($, 'what is a pty?')
  expect((await run($, 'pop')).text).toBe('pasted · 1 left')
  expect(w.box.text).toBe('what is a pty?')
  expect(stored(w.files).map((i: { text: string }) => i.text)).toEqual(['older'])
})

test('keeps the item when the prompt box refuses the paste', async ($, on) => {
  const w = world(on)
  await run($, 'keep me')
  w.box.canFill = false
  await run($, 'pop')
  expect(stored(w.files)).toHaveLength(1)
})

test('never overwrites a file it cannot read', async ($, on) => {
  const w = world(on, { [FILE]: 'not json' })
  const { text } = await run($, 'x')
  expect(w.files[FILE]).toBe('not json')
  expect(text).toMatch(/unreadable/)
})

test('the picker pastes the chosen item', async ($, on) => {
  const w = world(on)
  await run($, 'one')
  await run($, 'two')
  await run($, '')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'pstash',
      surface,
      component: 'Pane',
      requestId: 'pstash',
      props: { title: 'Stash', isFocused: true, bodyColumns: 60, placement: 'inline' } as never,
    })
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(4)
    await ui.unmount()
  }
  const ui = await $.ui.mount({
    plugin: 'pstash',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'pstash',
    props: { title: 'Stash', isFocused: true, bodyColumns: 60, placement: 'inline' } as never,
  })
  const id = stored(w.files)[1].id
  await ui.press({ key: `pop-${id}` })
  expect(w.box.text).toBe('one')
  expect(stored(w.files).map((i: { text: string }) => i.text)).toEqual(['two'])
})

test('blanks the stashed text in the command row the model reads', async ($, on) => {
  world(on)
  const session = mock.session(on)
  await run($, 'secret')
  const row = {
    door: 'command' as const,
    origin: { kind: 'composer' } as never,
    uuid: 'u1',
    message: {
      type: 'user' as const,
      role: 'user' as const,
      isMeta: false,
      content: [{ type: 'text', text: '<command-name>/stash</command-name><command-args>secret</command-args>' }],
    },
  }
  await $.session.append(row as never)
  const texts = JSON.stringify(session.appended().map(r => r.message.content))
  expect(texts).toContain('<command-args></command-args>')
  expect(texts).not.toContain('secret')
})

test('x deletes the highlighted row, and the ring stays on the rows', async ($, on) => {
  const w = world(on)
  await run($, 'one')
  await run($, 'two')
  await run($, '')
  const ui = await $.ui.mount({
    plugin: 'pstash',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'pstash',
    props: { title: 'Stash', isFocused: true, bodyColumns: 60, placement: 'inline' } as never,
  })
  const [two, one] = stored(w.files).map((i: { id: string }) => i.id)
  expect(await $.ui.focus({ component: 'Pane', requestId: 'pstash', element: 'delete', origin: { kind: 'person' } })).toMatchObject({ deny: expect.any(String) })
  await $.ui.focus({ component: 'Pane', requestId: 'pstash', element: `pop-${one}`, origin: { kind: 'person' } })
  await ui.press({ key: 'delete' })
  expect(stored(w.files).map((i: { id: string }) => i.id)).toEqual([two])
})

test('yank pastes the newest and keeps it stashed', async ($, on) => {
  const w = world(on)
  await run($, 'older')
  await run($, 'keep me')
  expect((await run($, 'yank')).text).toBe('pasted · kept, 2 stashed')
  expect(w.box.text).toBe('keep me')
  expect(stored(w.files).map((i: { text: string }) => i.text)).toEqual(['keep me', 'older'])
})

test('y in the picker pastes the highlighted row and keeps it', async ($, on) => {
  const w = world(on)
  await run($, 'one')
  await run($, 'two')
  await run($, '')
  const ui = await $.ui.mount({
    plugin: 'pstash',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'pstash',
    props: { title: 'Stash', isFocused: true, bodyColumns: 60, placement: 'inline' } as never,
  })
  const one = stored(w.files)[1].id
  await $.ui.focus({ component: 'Pane', requestId: 'pstash', element: `pop-${one}`, origin: { kind: 'person' } })
  await ui.press({ key: 'yank' })
  expect(w.box.text).toBe('one')
  expect(stored(w.files).map((i: { text: string }) => i.text)).toEqual(['two', 'one'])
})
