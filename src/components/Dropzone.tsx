import { useRef, useState, type DragEvent } from 'react'
import { Button, Icon, Spinner, cx } from './ui'

export function Dropzone({
  onFiles,
  busy,
  compact = false,
}: {
  onFiles: (files: File[]) => void
  busy: boolean
  compact?: boolean
}) {
  const [hovering, setHovering] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setHovering(false)
    if (busy) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  const label = busy ? '분석 중…' : '파일 선택'

  if (compact) {
    return (
      <>
        <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <Icon name="upload" size={15} />}
          {busy ? '분석 중…' : '새 스냅샷 추가'}
        </Button>
        <FileInput inputRef={inputRef} onFiles={onFiles} />
      </>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setHovering(true)
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={handleDrop}
      className={cx(
        'relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors sm:p-12',
        hovering ? 'border-brand bg-brand-soft/40' : 'border-line-strong bg-surface/60',
        busy && 'opacity-70',
      )}
    >
      <div
        className={cx(
          'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border',
          hovering ? 'border-brand/50 bg-brand/15 text-brand' : 'border-line bg-surface-2 text-muted',
        )}
      >
        {busy ? <Spinner className="h-5 w-5" /> : <Icon name="upload" size={22} />}
      </div>

      <p className="text-base font-semibold">
        인스타그램 내보내기 파일을 여기에 끌어다 놓으세요
      </p>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        내려받은 <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[12px]">.zip</code>{' '}
        을 그대로 올리거나, 압축을 푼 뒤{' '}
        <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[12px]">followers_1.json</code>
        {' '}과{' '}
        <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[12px]">following.json</code>
        {' '}을 함께 선택해도 됩니다.
      </p>

      <div className="mt-5">
        <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <Icon name="upload" size={16} />}
          {label}
        </Button>
      </div>

      <p className="mt-5 text-[12px] text-faint">
        파일은 네트워크로 전송되지 않습니다. 브라우저 안에서만 읽습니다.
      </p>

      <FileInput inputRef={inputRef} onFiles={onFiles} />
    </div>
  )
}

function FileInput({
  inputRef,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement>
  onFiles: (files: File[]) => void
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept=".zip,.json,.html,.htm,application/zip,application/json,text/html"
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length) onFiles(files)
        e.target.value = '' // 같은 파일을 다시 올릴 수 있게 초기화
      }}
    />
  )
}
