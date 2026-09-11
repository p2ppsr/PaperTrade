import { describe, expect, it } from 'vitest'
import { storageKeyForPath } from './objectStorage.js'

describe('object storage paths', () => {
  it('maps durable data paths to portable object keys', () => {
    expect(storageKeyForPath('/data/papertrade/publications/example/page-0001.png'))
      .toBe('publications/example/page-0001.png')
  })

  it('rejects paths outside the PaperTrade data directory', () => {
    expect(() => storageKeyForPath('/etc/passwd')).toThrow('outside DATA_DIR')
  })
})
