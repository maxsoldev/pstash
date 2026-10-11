// The stash file format and the operations on it. No engine calls here:
// any harness can read and write the same files.
import type { Item, StashFile } from '../types'

export const LIMIT = 100

/** `/Users/max/app` -> `-Users-max-app.json`, one file per project. */
export function fileName(project: string): string {
  return `${project.replace(/[^A-Za-z0-9]/g, '-')}.json`
}

export function empty(project: string): StashFile {
  return { version: 1, project, items: [] }
}

/** Parses a stash file; throws on anything it does not recognise, so a bad file is never overwritten. */
export function parse(text: string, project: string): StashFile {
  const data: unknown = JSON.parse(text)
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.items)) {
    throw new Error('not a pstash v1 file')
  }
  const items = data.items.filter(isItem)
  return { version: 1, project: typeof data.project === 'string' ? data.project : project, items }
}

export function serialize(file: StashFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/** Puts `item` first; an item with the same text moves up instead of repeating. */
export function add(file: StashFile, item: Item): StashFile {
  const rest = file.items.filter(one => one.text !== item.text)
  return { ...file, items: [item, ...rest].slice(0, LIMIT) }
}

export function remove(file: StashFile, id: string): StashFile {
  return { ...file, items: file.items.filter(one => one.id !== id) }
}

/** First line of `text`, cut to `width` cells with an ellipsis. */
export function preview(text: string, width: number): string {
  const lines = text.trim().split('\n')
  const first = lines[0] ?? ''
  const more = lines.length > 1 ? ' …' : ''
  const room = Math.max(1, width - more.length)
  const cut = first.length > room ? `${first.slice(0, room - 1)}…` : first
  return cut + more
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isItem(value: unknown): value is Item {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    typeof value.at === 'string' &&
    typeof value.from === 'string'
  )
}
