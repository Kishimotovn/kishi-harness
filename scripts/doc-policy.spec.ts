import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { englishOnlyDocs, isMaintainedDoc } from './doc-policy.ts'
import { uniqueRepoFiles } from './repo-files.ts'
import { anchorCache, findViolations } from './verify-md-links.ts'

it('defaults to bilingual and reads an explicit fork setting', ({ onTestFinished }) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-doc-policy-'))
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true })
  })
  expect(englishOnlyDocs(root)).toBe(false)
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'guide.md'), '# English\n')
  writeFileSync(join(root, 'guide.zh.md'), '# Retained translation\n')
  const file = join(root, 'scripts/doc-policy.json')
  for (const englishOnly of [false, true]) {
    writeFileSync(file, JSON.stringify({ englishOnly }))
    expect(englishOnlyDocs(root)).toBe(englishOnly)
    expect(uniqueRepoFiles(root, ['*.md']).map(entry => basename(entry.abs)).sort())
      .toEqual(englishOnly ? ['guide.md'] : ['guide.md', 'guide.zh.md'])
  }
  for (const invalid of [null, [], {}, { englishOnly: 'true' }, { englishOnly: true, typo: true }]) {
    writeFileSync(file, JSON.stringify(invalid))
    expect(() => englishOnlyDocs(root)).toThrow('expected exactly one boolean field')
  }
})

it('keeps English checks and excludes Chinese only in English-only mode', () => {
  for (const englishOnly of [false, true]) {
    expect(isMaintainedDoc('docs/example.md', englishOnly)).toBe(true)
    expect(isMaintainedDoc('packages/core/agent/README.md', englishOnly)).toBe(true)
    expect(isMaintainedDoc('docs/example.zh.md', englishOnly)).toBe(!englishOnly)
  }
})

it('still rejects broken English links while ignoring retained Chinese links', ({ onTestFinished }) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-doc-policy-links-'))
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true })
  })
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'scripts/doc-policy.json'), JSON.stringify({ englishOnly: true }))
  writeFileSync(join(root, 'guide.md'), '# English\n\n[Missing](missing.md)\n')
  writeFileSync(join(root, 'guide.zh.md'), '# Retained translation\n\n[Stale](stale.md)\n')
  const scan = () => uniqueRepoFiles(root, ['*.md'])
    .flatMap(file => findViolations(file.abs, anchorCache(), root))
  expect(scan()).toMatchObject([{ file: 'guide.md', url: 'missing.md', reason: 'target' }])
  writeFileSync(join(root, 'guide.md'), '# English\n')
  expect(scan()).toEqual([])
})

it('uses the staged policy for commit checks and preserves bilingual enforcement otherwise', ({ onTestFinished }) => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-doc-policy-index-'))
  onTestFinished(() => {
    rmSync(temporary, { recursive: true, force: true })
  })
  const root = resolve(import.meta.dirname, '..')
  const options = { cwd: root, env: { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') }, encoding: 'utf8' as const }
  execFileSync('git', ['read-tree', '--empty'], options)
  const stage = (file: string, content: string): void => {
    const hash = execFileSync('git', ['hash-object', '-w', '--stdin'], { ...options, input: content }).trim()
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${hash},${file}`], options)
  }
  stage('scripts/translation-pairing.manifest.json', JSON.stringify({ excluded: [] }))
  stage('docs/policy-probe.md', '# English-only probe\n')
  const check = () => spawnSync(process.execPath, [
    '--import', 'tsx/esm', 'scripts/verify-translation-pairing.ts', '--cached', 'docs/policy-probe.md',
  ], options)
  const withoutPolicy = check()
  expect(withoutPolicy.error).toBeUndefined()
  expect(withoutPolicy.signal).toBeNull()
  expect(withoutPolicy.status).toBe(1)
  expect(withoutPolicy.stderr).toContain('must merge bilingual')
  for (const englishOnly of [true, false]) {
    stage('scripts/doc-policy.json', JSON.stringify({ englishOnly }))
    const result = check()
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(englishOnly ? 0 : 1)
    if (englishOnly) expect(result.stdout).toContain('skipped by English-only documentation policy')
    else expect(result.stderr).toContain('must merge bilingual')
  }
})
