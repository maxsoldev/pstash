// Prints the version a commit message releases, or nothing when it releases none.
// Usage: node scripts/next-version.mjs <current version> <commit message>
// Conventional Commits: feat -> minor, fix/perf -> patch, `!` or BREAKING CHANGE ->
// major (minor while 0.x); any other type releases nothing.

export function nextVersion(current, message) {
  const match = /^(\w+)(\([^)]*\))?(!)?: /.exec(message)
  if (!match) return undefined
  const [, type, , bang] = match
  const isBreaking = bang === '!' || /^BREAKING[ -]CHANGE: /m.test(message)
  const [major, minor, patch] = current.split('.').map(Number)
  if (isBreaking) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`
  if (type === 'feat') return `${major}.${minor + 1}.0`
  if (type === 'fix' || type === 'perf') return `${major}.${minor}.${patch + 1}`
  return undefined
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const next = nextVersion(process.argv[2], process.argv[3] ?? '')
  if (next) console.log(next)
}
