export interface ReaderSpeechPreferences {
  autoRead: boolean
  rate: number
  voiceURI: string
}

export const READER_SPEECH_PREFERENCES_KEY = 'papertrade_reader_speech_preferences'

export const DEFAULT_READER_SPEECH_PREFERENCES: ReaderSpeechPreferences = {
  autoRead: false,
  rate: 1,
  voiceURI: ''
}

export function loadReaderSpeechPreferences (storage: Pick<Storage, 'getItem'>): ReaderSpeechPreferences {
  try {
    const value = JSON.parse(storage.getItem(READER_SPEECH_PREFERENCES_KEY) ?? '{}') as Partial<ReaderSpeechPreferences>
    return {
      autoRead: value.autoRead === true,
      rate: typeof value.rate === 'number' && value.rate >= 0.5 && value.rate <= 2 ? value.rate : 1,
      voiceURI: typeof value.voiceURI === 'string' ? value.voiceURI : ''
    }
  } catch {
    return { ...DEFAULT_READER_SPEECH_PREFERENCES }
  }
}

export function saveReaderSpeechPreferences (storage: Pick<Storage, 'setItem'>, preferences: ReaderSpeechPreferences): void {
  storage.setItem(READER_SPEECH_PREFERENCES_KEY, JSON.stringify(preferences))
}

export function speechChunks (text: string, maxLength = 220): string[] {
  const paragraphs = text.replace(/\s+/g, ' ').trim()
  if (paragraphs === '') return []
  const sentences = paragraphs.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [paragraphs]
  const chunks: string[] = []
  for (const sentenceValue of sentences) {
    let sentence = sentenceValue.trim()
    while (sentence.length > maxLength) {
      let splitAt = sentence.lastIndexOf(' ', maxLength)
      if (splitAt < Math.floor(maxLength / 2)) splitAt = maxLength
      chunks.push(sentence.slice(0, splitAt).trim())
      sentence = sentence.slice(splitAt).trim()
    }
    if (sentence === '') continue
    const previous = chunks[chunks.length - 1]
    if (previous != null && previous.length + sentence.length + 1 <= maxLength) {
      chunks[chunks.length - 1] = `${previous} ${sentence}`
    } else {
      chunks.push(sentence)
    }
  }
  return chunks
}
