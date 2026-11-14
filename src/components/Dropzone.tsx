import { useRef, useState, type DragEvent, type RefObject } from 'react'
import { Button, Icon, Spinner, cx } from './ui'

export function Dropzone({
  onFiles,
  busy,
  compact = false,
  label = '파일 올리기',
  size = 'sm',
  full = false,
}: {
  onFiles: (files: File[]) => void
  busy: boolean
  compact?: boolean
  /** compact 일 때 버튼에 쓸 글자 */
  label?: string
  size?: 'sm' | 'md'
  full?: boolean
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

  if (compact) {
    return (
      <>
        <Button
          variant="primary"
          size={size}
          full={full}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          data-reupload
        >
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={16} />}
          {busy ? '분석 중' : label}
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
        'rounded-[20px] px-6 py-10 text-center transition-colors sm:py-14',
        hovering ? 'bg-brand-weak' : 'bg-card shadow-card',
        busy && 'opacity-70',
      )}
    >
      <div
        className={cx(
          'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] transition-colors',
          hovering ? 'bg-brand text-white' : 'bg-brand-weak text-brand',
        )}
      >
        {busy ? <Spinner className="h-6 w-6" /> : <Icon name="upload" size={26} />}
      </div>

      <p className="display text-[20px] font-bold sm:text-[22px]">
        {hovering ? '여기에 놓아주세요' : '파일을 여기에 끌어다 놓으세요'}
      </p>
      <p className="ko mx-auto mt-2.5 max-w-sm text-[15px] leading-[1.6] text-muted">
        인스타그램에서 받은 ZIP을 그대로 올리면 돼요. 압축을 풀었다면{' '}
        <b className="font-semibold text-fg-2">followers</b> 와{' '}
        <b className="font-semibold text-fg-2">following</b> 파일을 함께 선택해 주세요.
      </p>

      <div className="mx-auto mt-7 max-w-[280px]">
        <Button variant="primary" size="lg" full onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Spinner className="h-5 w-5" /> : null}
          {busy ? '분석 중' : '파일 선택하기'}
        </Button>
      </div>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[13px] text-faint">
        <Icon name="lock" size={14} />
        파일은 네트워크로 전송되지 않아요
      </p>

      <FileInput inputRef={inputRef} onFiles={onFiles} />
    </div>
  )
}

function FileInput({
  inputRef,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement>
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
