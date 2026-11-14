# 홍보영상 만들기

화면을 실제로 조작하면서 녹화합니다. 손으로 찍지 않으니, 화면이 바뀌면
다시 돌리기만 하면 됩니다.

```bash
npm run build          # 집계 주소 없이 빌드하세요. 촬영이 방문자 수에 섞입니다.
npx vite preview --port 4173 &
cd promo
node mkdemo.mjs        # 가짜 내보내기 파일을 만듭니다
node record.mjs        # raw/*.webm 으로 녹화
ffmpeg -i raw/*.webm -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -vf "fps=30,format=yuv420p" -c:v libx264 -profile:v high -crf 19 -preset slow \
  -movflags +faststart -c:a aac -b:a 128k -shortest unfollog-promo.mp4
```

결과: 1080×1920, 24초 안팎. 인스타 릴스와 스레드에 그대로 올라갑니다.

## 왜 이렇게 만들었나

**실제 내보내기 파일은 쓰면 안 됩니다.** 영상에 진짜 사람의 아이디가 그대로
찍힙니다. `mkdemo.mjs` 가 가짜 아이디로 두 시점의 파일을 만듭니다. 오늘 것에는
6명이 빠져 있고, 그중 2명은 내 팔로잉에서도 함께 사라져서 차단 의심으로
잡힙니다. 그래서 영상에 "언팔 4명 · 차단 의심 2명" 이 나옵니다.

**녹화는 CSS 픽셀 기준이라 화면 배율이 반영되지 않습니다.** 휴대폰 크기 그대로
찍으면 414px 짜리가 나오고, 그걸 1080 으로 늘리면 글자가 뭉갭니다. 그래서
`frame.html` 이 540px 짜리 화면을 2배로 늘린 1080px 판 위에 얹습니다. 글자가
늘어난 크기로 다시 그려져서 또렷합니다.

**자막은 안쪽 화면이 아니라 바깥 판에 올립니다.** 1080 크기로 직접 그려지니
선명하고, 앱 화면을 건드리지 않습니다.

## 집계에 섞이지 않게

빌드할 때 `VITE_API_URL` 을 **빼고** 하세요. 넣고 찍으면 촬영이 방문자로
기록되고, 그러잖아도 미리보기 주소 때문에 숫자가 부풀어 있습니다.

## 카드뉴스

```bash
cd promo/cards
node darkshots.mjs    # 카드 윗단에 넣을 앱 다크 모드 화면 (사이트가 떠 있어야 함)
node build.mjs        # out/01.png … 09.png (1440x1800)
```

### 해상도

2배(2160x2700)로 그린 뒤 **1440x1800** 으로 줄여 내보냅니다. `out/2x/` 에
줄이기 전 원본이 남습니다.

1080 으로 그대로 내보내면 요즘 폰에서 확대돼 보여서 뿌옇습니다. 인스타는
가로 1440 까지만 받고 그보다 크면 자기 방식으로 줄이는데, 2배로 그려 직접
줄이는 쪽이 훨씬 또렷합니다.

같은 이유로 `darkshots.mjs` 도 배율 2 로 찍습니다. 여기만 1배로 두면 카드
안에서 두 배로 늘어나 **그 부분만** 뿌옇게 보입니다. 실제로 그렇게 나왔었고,
아래 제목은 선명한데 위쪽 화면만 흐린 것으로 알아챘습니다.

`cards.mjs` 의 글만 고치면 다시 그려집니다. 디자인은 `style.css` 에 있습니다.

### 서체

제목은 Noto Sans KR 900, 본문은 Pretendard 600 입니다. 본문을 500 에서 올린
것은 검은 바탕에서 같은 굵기가 얇아 보이기 때문입니다.

`fonts/noto-900.woff2` 는 **카드에 실제로 쓰인 글자만** 담긴 조각입니다.
전체를 받으면 몇 MB 인데 36KB 로 끝납니다. 글을 고쳐서 없던 글자가 생기면
그 글자가 네모로 나오니, 그때는 다시 받으세요.

```bash
# cards.mjs 에 쓰인 글자를 뽑아 그 글자만 담긴 서체를 받습니다
node -e "import('./cards.mjs').then(({CARDS})=>{
  const t=JSON.stringify(CARDS).replace(/<[^>]+>/g,'');
  require('fs').writeFileSync('chars.txt',
    [...new Set(t.replace(/[\\\\\"\[\]{}:,]/g,''))].sort().join(''))})"
TXT=$(python3 -c "import urllib.parse;print(urllib.parse.quote(open('chars.txt').read().strip()))")
curl -sS -A Mozilla/5.0 \
  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@900&text=$TXT" -o noto.css
# noto.css 안의 주소를 받아 fonts/noto-900.woff2 로 저장하고,
# noto.css 의 주소를 그 경로로 바꾸세요
```
