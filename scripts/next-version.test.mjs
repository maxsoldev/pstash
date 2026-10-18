import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextVersion } from './next-version.mjs'

test('feat bumps minor, fix and perf bump patch', () => {
  assert.equal(nextVersion('0.2.0', 'feat: add yank (#1)'), '0.3.0')
  assert.equal(nextVersion('0.2.3', 'fix(picker): keep the ring on rows (#2)'), '0.2.4')
  assert.equal(nextVersion('1.4.0', 'perf: read the file once'), '1.4.1')
})

test('breaking is major from 1.0, minor before', () => {
  assert.equal(nextVersion('0.2.3', 'feat!: drop /stash list'), '0.3.0')
  assert.equal(nextVersion('1.2.3', 'fix: x\n\nBREAKING CHANGE: the file moved'), '2.0.0')
})

test('other types and free text release nothing', () => {
  for (const message of ['docs: new screenshots', 'chore(release): v0.2.0', 'Merge branch main', 'feature: no']) {
    assert.equal(nextVersion('0.2.0', message), undefined)
  }
})
