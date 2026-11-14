// 카드뉴스를 그려서 1080x1350 PNG 로 뽑습니다.
import pw from '/opt/node-tools/node_modules/playwright/index.js'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { CARDS } from './cards.mjs'

const OUT = 'out'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT)

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const nl = (s) => esc(s).replace(/\n/g, '<br>')

const page = (c, i) => {
  const n = `<div class="pg">${String(i + 1).padStart(2, '0')} <span>/ ${String(CARDS.length).padStart(2, '0')}</span></div>`
  if (c.kind === 'cover')
    return `<section class="card cover">
      <div class="eyebrow">${esc(c.eyebrow)}</div>
      <div class="mid"><h1>${nl(c.title)}</h1><div class="rule"></div><p class="sub">${nl(c.sub)}</p></div>
      <div class="foot"><span class="swipe">넘겨보세요 →</span>${n}</div>
    </section>`
  if (c.kind === 'chapter')
    return `<section class="card">
      <div class="head"><span class="no">${esc(c.no)}</span><span class="hair"></span></div>
      <div class="mid"><h2>${nl(c.title)}</h2><p class="body">${nl(c.body)}</p></div>
      <div class="foot">${n}</div>
    </section>`
  if (c.kind === 'list')
    return `<section class="card">
      <div class="head"><span class="no">${esc(c.no)}</span><span class="hair"></span></div>
      <div class="mid"><h2 class="sm">${nl(c.title)}</h2>
        <ul class="items">${c.items
          .map((it) => `<li><b>${esc(it[0])}</b><span>${esc(it[1])}</span></li>`)
          .join('')}</ul></div>
      <div class="foot">${n}</div>
    </section>`
  if (c.kind === 'shot')
    return `<section class="card shot">
      <div class="shotwrap"><img src="${c.src}"></div>
      <div class="mid"><p class="cap">${nl(c.caption)}</p></div>
      <div class="foot">${n}</div>
    </section>`
  return `<section class="card end">
    <div class="mid">
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
      <div class="rule short"></div>
      <div class="url">${esc(c.url)}</div>
      <div class="note">${esc(c.foot)}</div>
    </div>
    <div class="foot">${n}</div>
  </section>`
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="myeongjo.css">
<link rel="stylesheet" href="../../node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css">
<link rel="stylesheet" href="style.css">
</head><body>${CARDS.map(page).join('')}</body></html>`
writeFileSync('index.html', html)

const b = await pw.chromium.launch({ args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })
await p.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)
const cards = await p.locator('.card').all()
for (let i = 0; i < cards.length; i++) {
  await cards[i].screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}.png` })
}
await b.close()
console.log(`카드 ${cards.length}장`)
