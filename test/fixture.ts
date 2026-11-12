import { deflateRawSync, crc32 } from 'node:zlib'

type Entry = { name: string; content: string; store?: boolean }

/** 테스트용 ZIP 을 직접 조립합니다 (중앙 디렉터리 포함, ZIP64 아님). */
export function buildZip(entries: Entry[]): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const raw = Buffer.from(e.content, 'utf8')
    const data = e.store ? raw : deflateRawSync(raw)
    const method = e.store ? 0 : 8
    const crc = crc32(raw)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0, 6)
    lh.writeUInt16LE(method, 8)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(raw.length, 22)
    lh.writeUInt16LE(name.length, 26)
    lh.writeUInt16LE(0, 28)
    locals.push(lh, name, data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(offset, 42)
    centrals.push(cd, name)

    offset += lh.length + name.length + data.length
  }

  const cdBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)

  return new Uint8Array(Buffer.concat([...locals, cdBuf, eocd]))
}

/** 인스타그램 followers_*.json 형식 (최상위가 배열) */
export function followersJson(users: [string, number][]) {
  return JSON.stringify(
    users.map(([value, timestamp]) => ({
      title: '',
      media_list_data: [],
      string_list_data: [{ href: `https://www.instagram.com/${value}`, value, timestamp }],
    })),
  )
}

/** 인스타그램 following.json 형식 (relationships_following 래퍼) */
export function followingJson(users: [string, number][]) {
  return JSON.stringify({
    relationships_following: users.map(([value, timestamp]) => ({
      title: '',
      media_list_data: [],
      string_list_data: [{ href: `https://www.instagram.com/${value}`, value, timestamp }],
    })),
  })
}

export function pendingJson(users: string[]) {
  return JSON.stringify({
    relationships_follow_requests_sent: users.map((value) => ({
      title: '',
      media_list_data: [],
      string_list_data: [{ href: `https://www.instagram.com/${value}`, value, timestamp: 1 }],
    })),
  })
}
