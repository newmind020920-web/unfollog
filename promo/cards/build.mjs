// 카드뉴스를 그려서 1080x1350 PNG 로 뽑습니다.
import pw from '/opt/node-tools/node_modules/playwright/index.js'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { CARDS } from './cards.mjs'

const OUT = 'out'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT)

const total = CARDS.length

function topPanel(t) {
  if (!t) return ''
  if (t.kind === 'shot') return `<div class="panel shot"><img src="${t.src}"></div>`
  if (t.kind === 'pills')
    return `<div class="panel"><div class="pills">${t.rows
      .map(
        (r, i) => `<div class="pill"><span class="dot">${i + 1}</span>
        <span class="tx"><b>${r[0]}</b><em>${r[1]}</em></span></div>`,
      )
      .join('')}</div></div>`
  if (t.kind === 'path')
    return `<div class="panel"><div class="path">${t.steps
      .map((s) => `<span class="step">${s}</span>`)
      .join('<span class="arr">›</span>')}</div>
      <div class="notes">${t.note.map((n) => `<div class="note">${n}</div>`).join('')}</div></div>`
  // warn
  return `<div class="panel"><div class="form">${t.rows
    .map((r) => `<div class="field"><span>${r[0]}</span><i>${r[1]}</i></div>`)
    .join('')}<div class="stamp">${t.stamp}</div></div></div>`
}

const card = (c, i) => {
  if (c.kind === 'end')
    return `<section class="card end">
      <svg class="mark" viewBox="0 0 120 120">
        <defs><linearGradient id="g" x1="0" y1="120" x2="120" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#f7963c"/><stop offset=".52" stop-color="#d42e86"/>
          <stop offset="1" stop-color="#7b3fe4"/></linearGradient></defs>
        <circle cx="60" cy="60" r="60" fill="url(#g)"/>
        <g transform="translate(22 22) scale(3.15)">
          <path d="M16.8 6.25A7.5 7.5 0 1 1 7.2 6.25" fill="none" stroke="#fff"
                stroke-width="3.3" stroke-linecap="round"/></g>
      </svg>
      <div class="brand">언팔로그</div>
      <div class="url">${c.url}</div>
      <div class="note2">${c.foot}</div>
      <div class="cta">지금 확인해 보세요</div>
      <div class="wm">unfollog</div>
    </section>`

  return `<section class="card">
    <div class="top">${topPanel(c.top)}<div class="fade"></div></div>
    <div class="bottom">
      ${c.no ? `<div class="no">${c.no}</div>` : ''}
      <h2>${c.title.replace(/\n/g, '<br>')}</h2>
      <p>${c.body.replace(/\n/g, '<br>')}</p>
    </div>
    <div class="wm">unfollog</div>
  </section>`
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="../../node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css">
<link rel="stylesheet" href="noto.css">
<link rel="stylesheet" href="style.css">
</head><body>${CARDS.map(card).join('')}</body></html>`
writeFileSync('index.html', html)

// 2배로 그린 뒤 1440 으로 줄입니다. 인스타는 가로 1440 까지만 받고, 그 위는
// 자기 방식으로 줄여서 뭉갭니다. 2배로 그려 직접 줄이는 쪽이 훨씬 또렷합니다.
const b = await pw.chromium.launch({ args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 })
await p.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)
const cards = await p.locator('.card').all()
mkdirSync(`${OUT}/2x`, { recursive: true })
for (let i = 0; i < cards.length; i++) {
  await cards[i].screenshot({ path: `${OUT}/2x/${String(i + 1).padStart(2, '0')}.png` })
}
await b.close()

// 2160 → 1440 으로 줄입니다 (lanczos).
execFileSync('python3', ['-c', `
from PIL import Image
import glob, os
for f in sorted(glob.glob('${OUT}/2x/*.png')):
    im = Image.open(f).convert('RGB')
    im = im.resize((1440, 1800), Image.LANCZOS)
    im.save(os.path.join('${OUT}', os.path.basename(f)), optimize=True)
`])
console.log(`카드 ${cards.length}장 / ${total}`)
