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
