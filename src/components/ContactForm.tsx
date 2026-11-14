import { useState } from 'react'
import { Button, Card, Icon, Spinner } from './ui'
import { failureText, sendInquiry, type SendResult } from '../lib/contact'

const MAX = 2000

/**
 * 문의 폼.
 *
 * 숫자 요약을 함께 보낼지는 본인이 고릅니다. 기본은 켜 두되, 무엇이 담기는지
 * 그 자리에 그대로 보여줍니다. "브라우저 밖으로 나가지 않는다" 고 말해 온
 * 서비스에서 몰래 보내면 그 말이 거짓이 됩니다.
 */
export function ContactForm({ meta }: { meta: string }) {
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [attach, setAttach] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)

  const left = MAX - message.length

  async function submit() {
    if (!message.trim() || sending) return
    setSending(true)
    setResult(await sendInquiry({ message, contact, meta: attach ? meta : undefined }))
    setSending(false)
  }

  if (result?.ok) {
    return (
      <Card className="p-6 text-center" data-sent>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-green-weak text-green">
          <Icon name="check" size={26} />
        </div>
        <p className="display text-[19px] font-bold">보냈어요</p>
        <p className="ko mt-2 text-[15px] leading-[1.65] text-muted">
          {contact.trim()
            ? '적어주신 곳으로 답장할게요. 확인에 하루 이틀 걸릴 수 있어요.'
            : '답장받을 곳을 적지 않으셔서 따로 답장은 못 드려요. 내용은 잘 받았어요.'}
        </p>
        <div className="mt-5">
          <Button
            variant="card"
            onClick={() => {
              setMessage('')
              setContact('')
              setResult(null)
            }}
          >
            하나 더 보내기
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5 sm:p-6">
      <label className="ko block text-[15px] font-semibold" htmlFor="q-message">
        무엇이 잘 안 되나요?
      </label>
      <textarea
        id="q-message"
        value={message}
        maxLength={MAX}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        placeholder="예) 인스타에는 팔로워가 800명인데 여기서는 500명으로 나와요."
        className="ko mt-2.5 w-full resize-y rounded-2xl bg-sunken px-4 py-3.5 text-[15px] leading-[1.6] outline-none placeholder:text-faint focus:ring-2 focus:ring-brand"
      />
      <p className="tnum mt-1.5 text-right text-[12px] text-faint">{left}자 남음</p>

      <label className="ko mt-4 block text-[15px] font-semibold" htmlFor="q-contact">
        답장받을 곳 <span className="font-normal text-faint">(선택)</span>
      </label>
      <input
        id="q-contact"
        value={contact}
        maxLength={200}
        onChange={(e) => setContact(e.target.value)}
        placeholder="카톡 아이디, 이메일, 인스타 아이디 등"
        className="ko mt-2.5 w-full rounded-2xl bg-sunken px-4 py-3.5 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-brand"
      />
      <p className="ko mt-1.5 text-[13px] leading-[1.55] text-faint">
        비워 두셔도 돼요. 그러면 답장은 못 드리지만 내용은 전달돼요.
      </p>

      <div className="mt-5 rounded-2xl bg-sunken p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={attach}
            onChange={(e) => setAttach(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
          />
          <span className="min-w-0">
            <span className="ko block text-[14px] font-semibold">숫자 요약도 함께 보내기</span>
            <span className="ko mt-1 block text-[13px] leading-[1.6] text-muted">
              숫자가 이상하다는 문의는 이게 있어야 원인을 찾을 수 있어요. 아래 한 줄이
              그대로 전달돼요.
            </span>
            <span className="tnum mt-2 block rounded-xl bg-card px-3 py-2 text-[12px] leading-[1.6] break-words text-muted">
              {meta}
            </span>
          </span>
        </label>
      </div>

      {result && !result.ok && (
        <div className="mt-4 rounded-2xl bg-red-weak p-4">
          <p className="ko text-[14px] leading-[1.6] font-semibold text-red">
            {failureText(result)}
          </p>
          <p className="tnum mt-1.5 text-[12px] text-red/70">오류 {result.detail}</p>
        </div>
      )}

      <div className="mt-5">
        <Button variant="primary" size="lg" full onClick={submit} disabled={!message.trim() || sending}>
          {sending ? <Spinner className="h-5 w-5" /> : null}
          {sending ? '보내는 중' : '보내기'}
        </Button>
      </div>

      <p className="ko mt-4 text-[13px] leading-[1.6] text-faint">
        팔로워 목록과 아이디는 어떤 경우에도 보내지 않아요. 올리신 파일도 그대로예요.
      </p>
    </Card>
  )
}
