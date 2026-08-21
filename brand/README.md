# 브랜드 자산

`public/brand/` 의 서빙용 파생본을 다시 만들 때 쓰는 원본이다. 이 디렉터리는 `public/` 밖이라
배포에 포함되지 않는다(원본 3장이 900KB 를 넘어 서빙할 이유가 없다).

## 세 가지를 구분한다

| | 무엇 | 원본 | 서빙본 |
| --- | --- | --- | --- |
| **심볼** (symbol) | 그림만 | `kiwi-symbol.png` 525×515 | `public/brand/kiwi-symbol-128.png`, `-256.png` |
| **워드마크** (wordmark) | 글자만 | `kiwi-wordmark.png` 1014×276 | `public/brand/kiwi-wordmark.png` 480px |
| **시그니처** (signature) | 심볼 + 워드마크 | `kiwi-signature.png` 1774×887 | `public/brand/kiwi-signature.png` 720px |

영어로는 심볼 = logomark/brandmark, 워드마크 = logotype, 시그니처 = lockup/combination mark.
"CI" 는 이 셋과 전용색·전용서체·여백 규정까지 묶은 **시스템 전체**를 가리키는 말이라 파일 한
장의 이름으로는 쓰지 않는다.

## 어디에 쓰나

- **심볼** — 헤더 브랜드(40px). 옆에 위키 이름 텍스트가 따로 붙으므로 글자가 없어야 한다.
- **시그니처** — 홈 히어로. 이름을 그림으로 세우는 자리.
- **워드마크** — 현재 미사용. 심볼이 이미 옆에 있어 중복인 자리(좁은 모바일 헤더, 푸터 한 줄)
  용으로 준비해 뒀다. **밝은 연두 배경에는 올리지 말 것** — 워드마크가 밝은 초록에서 진한
  초록으로 흐르는 그라데이션이라 앞 두 글자("키즈")가 `kiwi-flesh` 헤더색(#8fbc45) 위에서
  거의 사라진다(브라우저 확인). 흰·크림·어두운 배경에서는 네 글자 모두 또렷하다.

## 파생본 만들기

```sh
sips -Z 128 brand/kiwi-symbol.png    --out public/brand/kiwi-symbol-128.png
sips -Z 256 brand/kiwi-symbol.png    --out public/brand/kiwi-symbol-256.png
sips -Z 720 brand/kiwi-signature.png --out public/brand/kiwi-signature.png
sips -Z 480 brand/kiwi-wordmark.png  --out public/brand/kiwi-wordmark.png
```

## 알아둘 것

- **워드마크는 임시본이다.** 디자이너가 준 시그니처에서 글자 영역(x600,y317,1014×276)을 잘라
  만들었다. 경계는 알파 채널을 열·행 단위로 스캔해 찾은 값이라 잘림은 없지만, 원래 시그니처
  기준으로 잡힌 자간·여백을 그대로 물려받았다. 단독으로 쓸 때 어색하면 디자이너에게 워드마크
  단독본을 따로 요청하는 게 맞다.
- **파비콘(`public/favicon.svg`)은 이 원본들의 축소본이 아니다.** 따로 그린 단순화 마크다.
  로우폴리 면과 씨앗 고리는 16px 에서 초록 덩어리로 뭉개져 축소본을 쓸 수 없다(측정 확인).
