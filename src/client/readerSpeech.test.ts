import { describe, expect, it } from 'vitest'
import {
  DEFAULT_READER_SPEECH_PREFERENCES,
  loadReaderSpeechPreferences,
  saveReaderSpeechPreferences,
  speechChunks
} from './readerSpeech'

describe('reader speech preferences', () => {
  it('round trips the reader accessibility settings', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }
    saveReaderSpeechPreferences(storage, { autoRead: true, rate: 1.25, voiceURI: 'voice-1' })
    expect(loadReaderSpeechPreferences(storage)).toEqual({ autoRead: true, rate: 1.25, voiceURI: 'voice-1' })
  })

  it('uses safe defaults for malformed preferences', () => {
    expect(loadReaderSpeechPreferences({ getItem: () => '{bad' })).toEqual(DEFAULT_READER_SPEECH_PREFERENCES)
  })

  it('splits long page text into speech-engine-friendly chunks', () => {
    const chunks = speechChunks(`First sentence. ${'long words '.repeat(40)}Last sentence.`, 80)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every(chunk => chunk.length <= 80)).toBe(true)
    expect(chunks.join(' ')).toContain('First sentence.')
  })
})
