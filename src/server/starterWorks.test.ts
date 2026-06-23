import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { STARTER_WORKS, readStarterText, starterCoverPath, starterTextPath, writeStarterPdf } from './starterWorks.js'

describe('starter public-domain works', () => {
  it('vendors real source text and cover art for every starter work', async () => {
    expect(STARTER_WORKS).toHaveLength(10)

    for (const work of STARTER_WORKS) {
      const textStat = await fs.stat(await starterTextPath(work))
      const coverStat = await fs.stat(await starterCoverPath(work))
      expect(textStat.isFile()).toBe(true)
      expect(coverStat.isFile()).toBe(true)

      const text = await readStarterText(work)
      expect(text.length).toBeGreaterThan(20000)
      expect(text).not.toContain('PaperTrade public-domain starter library')
    }
  })

  it('generates a real multi-page PDF from source text', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'papertrade-starter-'))
    const pdfPath = path.join(dir, 'pride-and-prejudice.pdf')
    await writeStarterPdf(STARTER_WORKS[0], pdfPath)

    const pdf = await fs.readFile(pdfPath, 'utf8')
    const pageCount = Number(pdf.match(/\/Count ([0-9]+)/)?.[1] ?? '0')

    expect(pageCount).toBeGreaterThan(5)
    expect(pdf).toContain('%PaperTrade public-domain edition')
    expect(pdf).not.toContain('PaperTrade public-domain starter library')
  })
})
