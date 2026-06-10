import { describe, expect, it } from 'vitest'
import { getPublicationDir } from './content.js'

describe('content paths', () => {
  it('keeps publication files under the PaperTrade data directory', () => {
    expect(getPublicationDir('abc')).toContain('/papertrade/publications/abc')
  })
})
