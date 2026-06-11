import fs from 'fs/promises'
import path from 'path'

export const STARTER_AUTHOR_IDENTITY_KEY = 'papertrade-starter-library'
export const STARTER_AUTHOR_NAME = 'PaperTrade Starter Library'

export interface StarterWork {
  id: string
  title: string
  authorName: string
  description: string
  pages: string[]
}

export const STARTER_WORKS: StarterWork[] = [
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000001',
    title: 'Pride and Prejudice',
    authorName: 'Jane Austen',
    description: 'A public-domain classic of manners, family pressure, first impressions, and slow-earned affection.',
    pages: starterPages('Pride and Prejudice', 'Jane Austen', [
      'This starter edition introduces the world of the Bennet family, where inheritance rules and social expectations turn marriage into a serious family strategy.',
      'Elizabeth Bennet stands apart because she notices absurdity quickly and refuses to trade her judgment for comfort.',
      'Mr. Darcy begins as a figure of pride and distance, but the story steadily asks whether first impressions are always fair.',
      'The pleasure of the novel is not only romance. It is conversation, wit, embarrassment, correction, and the gradual discovery of character.',
      'This public-domain work is a useful seed title for PaperTrade because it demonstrates serialized reading, literary browsing, and page-by-page discovery.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000002',
    title: 'The Adventures of Sherlock Holmes',
    authorName: 'Arthur Conan Doyle',
    description: 'Public-domain detective stories built around observation, inference, and memorable London cases.',
    pages: starterPages('The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', [
      'Sherlock Holmes stories make ideal short-form newsstand reading: each case invites a reader to notice details before the detective explains them.',
      'Dr. Watson gives the stories their warmth. He is impressed, puzzled, loyal, and often just skeptical enough to keep the mystery human.',
      'The appeal is procedural: a visitor arrives, facts are gathered, false assumptions fall away, and a hidden pattern becomes visible.',
      'Holmes is not magic. The drama comes from disciplined attention applied to things other people overlook.',
      'This starter edition is included as royalty-free public-domain material for server operators who want a ready-made catalog on first launch.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000003',
    title: 'Alice in Wonderland',
    authorName: 'Lewis Carroll',
    description: 'A public-domain journey through wordplay, strange rules, impossible etiquette, and dream logic.',
    pages: starterPages('Alice in Wonderland', 'Lewis Carroll', [
      'Alice follows curiosity into a place where language slips, size changes, and ordinary rules stop behaving.',
      'The story works because it treats nonsense with formal seriousness. Every strange character seems to know the rules except Alice.',
      'For readers, the pleasure is motion: falling, growing, shrinking, arguing, reciting, questioning, and waking into another scene.',
      'The book remains useful for a digital newsstand because individual pages can feel like small complete surprises.',
      'This starter edition provides a royalty-free public-domain sample for a playful first browsing experience.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000004',
    title: 'The Time Machine',
    authorName: 'H. G. Wells',
    description: 'A public-domain science fiction landmark about invention, class, deep time, and fragile civilization.',
    pages: starterPages('The Time Machine', 'H. G. Wells', [
      'The Time Traveller begins with a device and a claim: time can be crossed as surely as distance.',
      'Wells turns that premise into a social warning. The future is not merely advanced; it is divided, altered, and unsettling.',
      'The story moves from drawing-room argument to far-future landscape, keeping the frame of scientific curiosity intact.',
      'Its power comes from scale. A single experiment becomes a tour through consequences that stretch beyond one human life.',
      'This public-domain seed work gives PaperTrade a concise speculative title for readers who want ideas with momentum.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000005',
    title: 'The Wonderful Wizard of Oz',
    authorName: 'L. Frank Baum',
    description: 'A public-domain American fantasy about travel, companionship, courage, and home.',
    pages: starterPages('The Wonderful Wizard of Oz', 'L. Frank Baum', [
      'Dorothy is carried from ordinary Kansas into a bright country where the road itself becomes a structure for adventure.',
      'The companions each believe they lack something essential, and each journey tests that belief in practical ways.',
      'Baum keeps the story direct and visual, which makes it a strong fit for page previews and mobile browsing.',
      'The book is generous with scenes: roads, fields, cities, disguises, dangers, and sudden turns of fortune.',
      'This royalty-free starter edition adds a family-friendly public-domain title to the default PaperTrade shelf.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000006',
    title: 'The Secret Garden',
    authorName: 'Frances Hodgson Burnett',
    description: 'A public-domain story of loneliness, recovery, friendship, and the hidden life of a garden.',
    pages: starterPages('The Secret Garden', 'Frances Hodgson Burnett', [
      'The story begins with a child who has been neglected into sharpness and sent to a house full of silence.',
      'Discovery changes the rhythm: a key, a door, a patch of earth, and the possibility that care can revive what looked lost.',
      'The garden is both place and process. It asks for attention, patience, labor, and trust.',
      'Friendship enters gradually, and the book treats health as something connected to air, movement, hope, and belonging.',
      'This public-domain seed title gives PaperTrade a quiet, restorative work for readers browsing beyond adventure and mystery.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000007',
    title: 'Moby-Dick',
    authorName: 'Herman Melville',
    description: 'A public-domain sea novel of obsession, labor, myth, danger, and encyclopedic attention.',
    pages: starterPages('Moby-Dick', 'Herman Melville', [
      'Melville opens a vast book through a restless narrator looking for the sea and for a change in the weather of his own mind.',
      'The voyage becomes more than travel. It is work, ritual, hierarchy, friendship, danger, and the pressure of Captain Ahab.',
      'The novel mixes story with catalog, philosophy, comedy, technical detail, and sudden lyric force.',
      'Its scale makes it useful as a seeded work: readers can sample a page, then decide whether to keep moving through the voyage.',
      'This starter edition places a major public-domain American classic on every new PaperTrade newsstand.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000008',
    title: 'Narrative of the Life of Frederick Douglass',
    authorName: 'Frederick Douglass',
    description: 'A public-domain autobiographical work about slavery, literacy, escape, and human dignity.',
    pages: starterPages('Narrative of the Life of Frederick Douglass', 'Frederick Douglass', [
      'Douglass gives direct testimony about slavery and insists on the moral clarity of lived experience.',
      'The book is brief, forceful, and carefully structured around memory, violence, learning, resistance, and escape.',
      'Literacy is central. Reading and writing become tools of self-possession in a system built to deny personhood.',
      'The work remains essential because it joins personal narrative to political argument without losing either force.',
      'This public-domain seed title adds historical weight and civic seriousness to the default PaperTrade collection.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000009',
    title: 'The Souls of Black Folk',
    authorName: 'W. E. B. Du Bois',
    description: 'A public-domain collection of essays on race, education, history, music, and American democracy.',
    pages: starterPages('The Souls of Black Folk', 'W. E. B. Du Bois', [
      'Du Bois writes with scholarship, memory, argument, and music in close relation.',
      'The essays examine the color line as a defining problem of American public life.',
      'Education, political rights, labor, grief, and culture are treated as connected questions rather than separate topics.',
      'The work rewards slow reading because its chapters move between analysis, history, personal encounter, and spirituals.',
      'This public-domain seed work gives PaperTrade a serious essay collection suitable for thoughtful page-by-page reading.'
    ])
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000010',
    title: 'Grimms Fairy Tales',
    authorName: 'Jacob and Wilhelm Grimm',
    description: 'Public-domain folk tales full of tests, transformations, bargains, warnings, and wonder.',
    pages: starterPages('Grimms Fairy Tales', 'Jacob and Wilhelm Grimm', [
      'The Grimm tales are compact, memorable, and built from direct narrative pressure: a problem appears, a test follows, and consequences arrive.',
      'They are not only children stories. Their patterns preserve older fears about hunger, luck, promises, family, and danger.',
      'A tale can turn quickly from ordinary work to enchantment, from kindness to reward, or from arrogance to punishment.',
      'This format makes them natural for a per-page newsstand because each short section carries its own charge.',
      'This royalty-free public-domain starter edition rounds out the default shelf with folk material familiar across generations.'
    ])
  }
]

function starterPages (title: string, authorName: string, body: string[]): string[] {
  return body.map((text, index) => `${title}\n${authorName}\n\nPage ${index + 1}\n\n${text}\n\nPaperTrade public-domain starter library.`)
}

function escapePdfText (value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrapLine (line: string, width: number): string[] {
  const words = line.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`
    if (next.length > width && current !== '') {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current !== '') lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function pageStream (page: string): string {
  const rawLines = page.split('\n').flatMap(line => wrapLine(line, 70))
  const lines = rawLines.slice(0, 31)
  const commands = [
    'BT',
    '/F1 17 Tf',
    '72 730 Td'
  ]
  lines.forEach((line, index) => {
    if (index > 0) commands.push('0 -22 Td')
    commands.push(`(${escapePdfText(line)}) Tj`)
  })
  commands.push('ET')
  return commands.join('\n')
}

export async function writeStarterPdf (work: StarterWork, targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const maxObjectId = 3 + work.pages.length * 2
  const objects = new Map<number, string>()
  const pageObjectIds = work.pages.map((_page, index) => 4 + index * 2)

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${work.pages.length} >>`)
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  work.pages.forEach((page, index) => {
    const pageObjectId = pageObjectIds[index]
    const contentObjectId = pageObjectId + 1
    const stream = pageStream(page)
    objects.set(pageObjectId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`)
    objects.set(contentObjectId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  })

  let pdf = '%PDF-1.4\n%PaperTrade\n'
  const offsets = [0]
  for (let id = 1; id <= maxObjectId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf)
    pdf += `${id} 0 obj\n${objects.get(id) ?? '<<>>'}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${maxObjectId + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let id = 1; id <= maxObjectId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  await fs.writeFile(targetPath, Buffer.from(pdf, 'utf8'))
}
