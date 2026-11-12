/**
 * 의존성 없는 최소 ZIP 리더.
 *
 * 중앙 디렉터리만 먼저 읽어 파일 목록을 얻고, 실제로 필요한 엔트리만
 * Blob.slice() 로 잘라 압축을 풉니다. 사진이 수 GB 들어 있는 인스타그램
 * 내보내기 ZIP 에서도 JSON 몇 개만 메모리에 올라옵니다.
 *
 * 지원: stored(0), deflate(8), ZIP64.
 */

const EOCD_SIG = 0x06054b50
const EOCD64_SIG = 0x06064b50
const EOCD64_LOCATOR_SIG = 0x07064b50
const CD_SIG = 0x02014b50

export type ZipEntry = {
  /** ZIP 내부 경로 */
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  /** 로컬 헤더의 파일 선두 오프셋 */
  localHeaderOffset: number
}

export class ZipError extends Error {}

function u16(v: DataView, o: number) {
  return v.getUint16(o, true)
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true)
}
function u64(v: DataView, o: number) {
  // ZIP64 필드. 2^53 을 넘는 ZIP 은 현실적으로 없으므로 Number 로 좁힙니다.
  const n = v.getBigUint64(o, true)
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('ZIP 파일이 너무 큽니다.')
  return Number(n)
}

async function view(blob: Blob, start: number, end: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer()
  return new DataView(buf)
}

/** 파일 끝에서 거꾸로 EOCD 시그니처를 찾습니다. */
async function findEocd(file: Blob): Promise<{ offset: number; view: DataView }> {
  // EOCD 는 22바이트 + 최대 65535바이트 주석.
  const maxTail = Math.min(file.size, 22 + 0xffff)
  const tailStart = file.size - maxTail
  const tail = await view(file, tailStart, file.size)
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === EOCD_SIG) return { offset: tailStart + i, view: tail }
  }
  throw new ZipError('ZIP 파일이 아니거나 파일이 손상되었습니다.')
}

/** 중앙 디렉터리의 위치/엔트리 수를 구합니다. ZIP64 면 해당 레코드를 따라갑니다. */
async function locateCentralDirectory(file: Blob) {
  const { offset: eocdOffset } = await findEocd(file)
  const eocd = await view(file, eocdOffset, eocdOffset + 22)

  let entryCount = u16(eocd, 10)
  let cdSize = u32(eocd, 12)
  let cdOffset = u32(eocd, 16)

  const needsZip64 = entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff
  if (needsZip64 && eocdOffset >= 20) {
    const loc = await view(file, eocdOffset - 20, eocdOffset)
    if (u32(loc, 0) === EOCD64_LOCATOR_SIG) {
      const eocd64Offset = u64(loc, 8)
      const eocd64 = await view(file, eocd64Offset, eocd64Offset + 56)
      if (u32(eocd64, 0) !== EOCD64_SIG) throw new ZipError('ZIP64 레코드를 읽을 수 없습니다.')
      entryCount = u64(eocd64, 32)
      cdSize = u64(eocd64, 40)
      cdOffset = u64(eocd64, 48)
    }
  }
  return { entryCount, cdSize, cdOffset }
}

/** ZIP64 확장 필드에서 실제 크기/오프셋을 꺼냅니다. */
function readZip64Extra(
  extra: DataView,
  need: { size: boolean; compressed: boolean; offset: boolean },
) {
  const out: { uncompressedSize?: number; compressedSize?: number; localHeaderOffset?: number } = {}
  let p = 0
  while (p + 4 <= extra.byteLength) {
    const id = u16(extra, p)
    const len = u16(extra, p + 2)
    if (id === 0x0001) {
      let q = p + 4
      // 필드는 0xFFFFFFFF 였던 것만 순서대로 들어 있습니다.
      if (need.size && q + 8 <= p + 4 + len) { out.uncompressedSize = u64(extra, q); q += 8 }
      if (need.compressed && q + 8 <= p + 4 + len) { out.compressedSize = u64(extra, q); q += 8 }
      if (need.offset && q + 8 <= p + 4 + len) { out.localHeaderOffset = u64(extra, q); q += 8 }
      break
    }
    p += 4 + len
  }
  return out
}

/** ZIP 의 파일 목록을 읽습니다. 압축은 아직 풀지 않습니다. */
export async function readZipIndex(file: Blob): Promise<ZipEntry[]> {
  const { entryCount, cdSize, cdOffset } = await locateCentralDirectory(file)
  const cd = await view(file, cdOffset, cdOffset + cdSize)
  const decoder = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []

  let p = 0
  for (let i = 0; i < entryCount && p + 46 <= cd.byteLength; i++) {
    if (u32(cd, p) !== CD_SIG) break
    const compressionMethod = u16(cd, p + 10)
    let compressedSize = u32(cd, p + 20)
    let uncompressedSize = u32(cd, p + 24)
    const nameLen = u16(cd, p + 28)
    const extraLen = u16(cd, p + 30)
    const commentLen = u16(cd, p + 32)
    let localHeaderOffset = u32(cd, p + 42)

    const name = decoder.decode(
      new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen),
    )

    if (
      uncompressedSize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      const extra = new DataView(cd.buffer, cd.byteOffset + p + 46 + nameLen, extraLen)
      const z64 = readZip64Extra(extra, {
        size: uncompressedSize === 0xffffffff,
        compressed: compressedSize === 0xffffffff,
        offset: localHeaderOffset === 0xffffffff,
      })
      if (z64.uncompressedSize !== undefined) uncompressedSize = z64.uncompressedSize
      if (z64.compressedSize !== undefined) compressedSize = z64.compressedSize
      if (z64.localHeaderOffset !== undefined) localHeaderOffset = z64.localHeaderOffset
    }

    // 디렉터리 엔트리는 건너뜁니다.
    if (!name.endsWith('/')) {
      entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset })
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** 엔트리 하나를 텍스트로 꺼냅니다. */
export async function readZipEntryText(file: Blob, entry: ZipEntry): Promise<string> {
  // 로컬 헤더에서 데이터 시작 위치를 계산합니다 (확장 필드 길이가 중앙 디렉터리와 다를 수 있음).
  const lh = await view(file, entry.localHeaderOffset, entry.localHeaderOffset + 30)
  const nameLen = u16(lh, 26)
  const extraLen = u16(lh, 28)
  const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen
  const raw = file.slice(dataStart, dataStart + entry.compressedSize)

  if (entry.compressionMethod === 0) return await raw.text()
  if (entry.compressionMethod !== 8) {
    throw new ZipError(`지원하지 않는 압축 방식입니다 (method ${entry.compressionMethod}).`)
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('이 브라우저는 ZIP 압축 해제를 지원하지 않습니다. 압축을 풀고 JSON 파일을 올려주세요.')
  }
  const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).text()
}
