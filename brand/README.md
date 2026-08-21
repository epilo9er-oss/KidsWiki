# 브랜드 원본

`public/brand/` 의 서빙용 파생본을 다시 만들 때 쓰는 원본이다. 이 디렉터리는 `public/` 밖이라
배포에 포함되지 않는다(원본은 수백 KB 라 서빙할 이유가 없다).

| 원본 | 파생 | 만드는 법 |
| --- | --- | --- |
| `kiwi-mark.png` (525×515) | `public/brand/kiwi-mark-128.png`, `-256.png` | `sips -Z 128 brand/kiwi-mark.png --out public/brand/kiwi-mark-128.png` |
| `kiwi-wordmark.png` (1774×887) | `public/brand/kiwi-wordmark.png` (720px) | `sips -Z 720 brand/kiwi-wordmark.png --out public/brand/kiwi-wordmark.png` |

파비콘(`public/favicon.svg`)은 이 원본에서 축소한 게 아니라 **따로 그린 단순화 마크**다.
로우폴리 면과 씨앗 고리는 16px 에서 초록 덩어리로 뭉개져 축소본을 쓸 수 없다(측정 확인).
