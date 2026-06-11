import { describe, expect, it } from 'vitest'
import { appManifest, walletManifest } from './web.js'

const SERVER_KEY = '02'.padEnd(66, '1')

describe('PaperTrade web manifest', () => {
  it('serves Wallet Toolbox permissions from the canonical manifest shape', () => {
    const manifest = appManifest(SERVER_KEY) as any

    expect(manifest.name).toBe('PaperTrade')
    expect(manifest.start_url).toBe('/')
    expect(manifest.metanet.schemaVersion).toBe(1)
    expect(manifest.metanet.serverIdentityKey).toBe(SERVER_KEY)
    expect(manifest.metanet.groupPermissions.protocolPermissions.length).toBeGreaterThan(0)
    expect(manifest.metanet.groupPermissions.certificateAccess).toEqual([])
    expect(manifest.metanet.groupPermissions.certificateFieldAccess).toBeUndefined()
    expect(manifest.metanet.counterpartyPermissions.protocols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ protocolName: '3241645161d8' }),
        expect.objectContaining({ protocolName: 'wallet payment' })
      ])
    )
    expect(manifest.babbage.groupPermissions).toEqual(manifest.metanet.groupPermissions)
    expect(manifest.babbage.counterpartyPermissions).toEqual(manifest.metanet.counterpartyPermissions)
  })

  it('keeps compatibility aliases equivalent to /manifest.json', () => {
    const canonical = appManifest(SERVER_KEY) as any
    const alias = walletManifest(SERVER_KEY) as any

    expect(alias.metanet).toEqual(canonical.metanet)
    expect(alias.babbage).toEqual(canonical.babbage)
    expect(alias.originator).toBe('papertrade.metanet.app')
  })
})
