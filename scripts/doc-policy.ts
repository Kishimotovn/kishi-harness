/** Fork documentation maintenance policy; an absent setting preserves bilingual DSH checks. */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Parse policy bytes from the worktree or Git index.
 * @param content - JSON setting, or undefined when the optional file is absent.
 * @returns whether English-only maintenance is explicitly enabled.
 */
export function parseDocPolicy(content: string | undefined): boolean {
  if (content === undefined) return false
  const value: unknown = JSON.parse(content)
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !('englishOnly' in value) || typeof value.englishOnly !== 'boolean'
    || Object.keys(value).length !== 1) {
    throw new Error('doc-policy.json: expected exactly one boolean field, englishOnly')
  }
  return value.englishOnly
}

/**
 * Read the fork's optional documentation setting, rejecting malformed configuration.
 * @param root - absolute repository root.
 * @returns whether only English documentation is maintained and published.
 */
export function englishOnlyDocs(root: string): boolean {
  const file = join(root, 'scripts/doc-policy.json')
  return parseDocPolicy(existsSync(file) ? readFileSync(file, 'utf8') : undefined)
}

/**
 * Select documentation maintained by this fork without deleting upstream translations.
 * @param file - repository-relative Markdown path.
 * @param englishOnly - whether Chinese documentation is upstream-maintained only.
 * @returns whether the file participates in source documentation checks.
 */
export function isMaintainedDoc(file: string, englishOnly: boolean): boolean {
  return !englishOnly || !file.endsWith('.zh.md')
}
