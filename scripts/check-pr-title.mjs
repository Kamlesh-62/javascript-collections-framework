// Checks that a pull request title is a Conventional Commit header, because squash merges use it
// as the commit message on main. Reads the title from the PR_TITLE environment variable.

const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert']
const HEADER = new RegExp(
  `^(${TYPES.join('|')})(\\([a-z0-9]+(-[a-z0-9]+)*(,[a-z0-9]+(-[a-z0-9]+)*)*\\))?!?: (?<subject>[^ ].*)$`,
)

const title = process.env.PR_TITLE ?? ''
const problems = []
const match = HEADER.exec(title)
if (!match)
  problems.push(`must look like "<type>(<scope>): <subject>" with type one of ${TYPES.join(', ')}`)
const subject = match?.groups?.subject ?? ''
if (/^[A-Z]/.test(subject))
  problems.push('subject starts with a lowercase letter (imperative mood)')
if (subject.endsWith('.')) problems.push('subject has no trailing period')
if ([...title].length > 72) problems.push(`is ${[...title].length} characters; keep it to 72`)

if (problems.length > 0) {
  console.log(`✗ pull request title "${title}"`)
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exit(1)
}
console.log(`✓ pull request title "${title}"`)
