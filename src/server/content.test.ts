import { describe, expect, it } from 'vitest'
import { getPublicationDir, normalizePageText } from './content.js'

describe('content paths', () => {
  it('keeps publication files under the PaperTrade data directory', () => {
    expect(getPublicationDir('abc')).toContain('/papertrade/publications/abc')
  })
})

describe('page accessibility text', () => {
  it('normalizes extracted PDF and OCR text for speech', () => {
    expect(normalizePageText('  A  page\r\n\r\n\r\n with\twords.\f  ')).toBe('A page\n\nwith words.')
  })
})
