/** One stashed prompt, as kept in the stash file. */
export type Item = { id: string; text: string; at: string; from: string }

/** The stash file of one project: `~/.pstash/<encoded project path>.json`. */
export type StashFile = { version: 1; project: string; items: Item[] }

declare module 'claude-code' {
  interface PluginState {
    pstash: { items: Item[]; isRunning: boolean; focused: string | null }
  }
}
