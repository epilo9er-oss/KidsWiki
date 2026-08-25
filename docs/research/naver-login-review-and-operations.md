# 네이버 로그인 검수·운영 준수 조사

- 조사일: 2026-08-25
- 범위: 로그인 버튼, 사전 검수 자료, 개인정보·운영 의무, 회원 탈퇴/연동 해제
- 출처: 네이버 개발자센터와 네이버 고객센터의 공식 자료만 사용

## 결론

KidsWiki가 지금처럼 **이용자 식별자만 요청**한다면 검수 제출물은 간단하다. 네이버 로그인 버튼이 보이는 화면부터 가입·로그인 완료까지의 모든 화면을 순서대로 캡처해 **하나의 파일**로 제출하면 되고, 식별자 외 제공 정보의 활용처 증빙은 내지 않아도 된다. 네이버는 추가 정보 입력이 없는 짧은 가입 절차를 오히려 권장한다. ([네이버 로그인 사전 검수 가이드](https://developers.naver.com/docs/login/verify/verify.md))

버튼은 현재 [네이버 로그인 버튼 사용 가이드](https://developers.naver.com/docs/login/bi/bi.md)의 색상·로고·크기·여백 규칙을 지켜야 한다. 다만 제공된 [1인 사업자용 PDF](https://developers.naver.com/inc/devcenter/downloads/naveridro/naverlogin_solo_guide.pdf)의 “`네이버 아이디로 로그인` 문구 유지” 설명과 달리, 현재 BI 가이드는 로그인 목적에 맞는 문구 변경을 허용한다.

서비스 탈퇴나 네이버 연동 해제 때는 네이버 토큰을 폐기하고 서비스가 보관하던 개인정보를 파기해야 한다. 토큰 폐기는 PDF의 구형 `grant_type=delete` 예제가 아니라 현재 공식 API의 `POST https://nid.naver.com/oauth2.0/revoke`를 사용해야 한다. ([네이버 로그인 개발가이드](https://developers.naver.com/docs/login/devguide/devguide.md), [네이버 로그인 API 명세](https://developers.naver.com/docs/login/api/api.md))

## 1. 자료 우선순위와 PDF의 주의점

제공된 PDF는 네이버 개발자센터 도메인에 게시된 실무 안내 자료지만, 문서 자체가 법적 자문이 아니라고 밝히며 일부 내용이 현재 전용 문서와 다르다. 충돌 시 아래 순서로 적용하는 것이 안전하다.

1. [NAVER API 서비스 이용약관](https://developers.naver.com/products/intro/terms/terms.md)
2. [네이버 로그인 사전 검수 가이드](https://developers.naver.com/docs/login/verify/verify.md)
3. [네이버 로그인 버튼 사용 가이드](https://developers.naver.com/docs/login/bi/bi.md)
4. [네이버 로그인 개발가이드](https://developers.naver.com/docs/login/devguide/devguide.md)와 [API 명세](https://developers.naver.com/docs/login/api/api.md)
5. [1인 사업자용 PDF](https://developers.naver.com/inc/devcenter/downloads/naveridro/naverlogin_solo_guide.pdf)

실제 차이는 다음과 같다.

| 항목 | PDF 설명 | 현재 공식 전용 문서 | 적용 기준 |
| --- | --- | --- | --- |
| 버튼 문구 | `네이버 아이디로 로그인` 유지 | 로그인 목적에 맞으면 국·영문 문구 변경 가능 | 현재 BI 가이드 |
| 토큰 폐기 | `/oauth2.0/token`, `grant_type=delete` | `/oauth2.0/revoke`, `token`과 선택적 `token_type_hint` | 현재 API 명세 |
| 검수 기간 | 통상 1~2주 | 신청일부터 2~3영업일 이내 결과 통지 | 현재 사전 검수 가이드 |
| 탈퇴 화면 증빙 | 사실상 필수처럼 안내 | 현재 공통 제출 목록에는 탈퇴 화면을 명시하지 않음 | 기능은 구현하되 기본 검수 파일과 분리 가능 |

## 2. 로그인 버튼 디자인

네이버는 공식 한글·영문 버튼 애셋을 Figma, AI, PNG로 제공한다. 가장 낮은 검수 위험은 공식 **녹색 완성형 버튼**을 사용하는 것이다. ([네이버 로그인 버튼 사용 가이드](https://developers.naver.com/docs/login/bi/bi.md))

직접 스타일링할 경우에도 다음 규칙은 지켜야 한다.

- 배경 녹색은 `#03A94D` (`RGB 3, 169, 77`)이고 지정 색상은 변경할 수 없다.
- N 로고 형태를 바꾸거나 다른 형태와 조합할 수 없다.
- N 로고는 아이콘형 18px, 완성형 16px 이상이어야 한다.
- 가운데 정렬 시 로고와 레이블 간격은 8px을 유지한다.
- 문구는 네이버 로그인 목적을 분명히 나타내는 범위에서 변경할 수 있다. 공식 예시에도 `네이버로 간편가입`, `Start with Naver` 등이 포함된다.
- 여러 소셜 로그인 버튼과 함께 놓을 때 네이버 버튼만 작게 만들지 않고, 컬러 버튼들 사이에서 네이버만 흰색으로 약화하지 않는 것이 권장된다.

위 규칙은 단순 미관 권고만은 아니다. 네이버 로그인 API 특약조건은 BI 가이드와 적용 가이드 준수를 요구하고, 일반 약관도 BI 가이드에 반하는 사용을 금지한다. ([NAVER API 서비스 이용약관](https://developers.naver.com/products/intro/terms/terms.md))

## 3. 사전 검수 기준과 증빙

정식 오픈해 모든 네이버 아이디가 로그인하게 하려면 사전 검수를 통과해야 한다. 검수 전에도 애플리케이션 등록자와 등록된 관리자·테스터는 로그인 테스트를 할 수 있다. ([네이버 로그인 사전 검수 가이드](https://developers.naver.com/docs/login/verify/verify.md))

검수자는 다음을 확인한다.

- 서비스 콘텐츠가 네이버 로그인 운영원칙·약관·관계 법령에 부합하는지
- 버튼 클릭부터 로그인·회원가입 완료까지 전체 과정이 정상 동작하는지
- 네이버 가입 직후 같은 문서·가입 세션에서 별도 서비스 비밀번호를 요구하지 않는지
- 이용자 식별자 외에 선택한 모든 제공 정보가 실제 서비스에서 쓰이는지
- 애플리케이션 이름과 로고가 실제 서비스 브랜드를 나타내며 네이버를 사칭하지 않는지
- 업종상 별도 법적 요건이나 증빙이 필요한지

KidsWiki의 현재 설정이 **이용자 식별자만 선택**한 상태라면 제출 준비는 다음으로 충분하다.

1. 네이버 버튼이 노출된 로그인 화면을 캡처한다.
2. 등록자 또는 등록된 테스트 계정으로 네이버 로그인과 정보 제공 동의를 진행한다.
3. 계정 선택/가입 확인처럼 서비스가 추가로 보여 주는 모든 단계를 캡처한다.
4. 가입·로그인이 완료된 화면까지 캡처한다.
5. 위 화면을 순서대로 하나의 PDF 또는 이미지 파일로 묶고, “추가 정보 입력 없이 이용자 식별자만으로 가입 완료”라고 설명한다.

식별자 외 권한을 모두 해제하면 “제공정보 활용처 확인” 항목 자체가 나타나지 않으며 별도 활용처 자료도 제출하지 않아도 된다. 나중에 이름·이메일·프로필 사진 등을 추가하면 해당 정보가 실제 노출되거나 이용되는 화면을 각각 제출해야 하고, 단순 통계 수집은 활용 사례로 인정되지 않는다. ([네이버 로그인 사전 검수 가이드](https://developers.naver.com/docs/login/verify/verify.md))

현재 공식 공통 검수 항목에는 개인정보처리방침 화면이나 회원 탈퇴 화면을 모든 서비스가 반드시 첨부해야 한다고 명시돼 있지는 않다. 다만 서비스 콘텐츠가 불완전하거나 업종상 추가 확인이 필요하면 소개 자료·소명·증빙을 추가 요청할 수 있으며, API 이용약관에 따른 개인정보 보호·파기 의무는 검수 자료와 별개로 계속 적용된다. ([네이버 로그인 사전 검수 가이드](https://developers.naver.com/docs/login/verify/verify.md), [NAVER API 서비스 이용약관](https://developers.naver.com/products/intro/terms/terms.md))

## 4. 운영정책·약관·개인정보 의무

네이버 API 이용약관과 네이버 로그인 특약조건에서 KidsWiki에 직접 관련된 요구는 다음과 같다.

- 네이버가 주는 이용자 식별 해시값은 회원 식별 목적으로만 안전하게 보관하고 제3자에게 전송·공개하지 않는다.
- 이름·이메일·프로필 같은 추가 정보는 가입에 필요하고 이용자가 동의한 경우에만 저장하며, 동의받은 목적 범위에서만 사용한다.
- 개인정보 접근 인력을 최소화하고 접근 통제·안전한 전송·법령상 필요한 암호화 조치를 적용한다.
- 개인정보의 제공·이용 목적이 달성되면 지체 없이 파기한다.
- 네이버 프로필 정보는 법률상 본인 확인, 나이 확인, 법정대리인 동의 확인 수단으로 사용할 수 없다. 그런 의무가 생기면 별도 절차가 필요하다.
- 네이버와의 제휴 관계가 있는 것처럼 보이게 하거나 네이버 브랜드·서비스를 모방하지 않는다.
- 불법·유해 콘텐츠, 아동·청소년을 성범죄 대상으로 삼거나 비인격화하는 콘텐츠, 권리 침해 콘텐츠가 있는 서비스에는 API를 적용할 수 없다.
- 서비스 종료 또는 네이버 로그인 제거 시 버튼 표기를 제거하고 Client ID도 삭제한다.

근거: [NAVER API 서비스 이용약관](https://developers.naver.com/products/intro/terms/terms.md)

제공된 PDF의 개인정보처리방침 항목과 구체적인 보존 기간 예시는 실무 참고용이다. 실제 처리방침에는 KidsWiki가 실제로 수집하는 항목·목적·보유 기간·파기 방법·위탁/국외 이전·이용자 권리·책임자 연락처를 사실대로 맞춰야 하지만, PDF에 적힌 `접속 로그 3개월`, `결제 정보 5년`을 서비스 사정과 법적 근거 확인 없이 그대로 복사해서는 안 된다. ([1인 사업자용 PDF](https://developers.naver.com/inc/devcenter/downloads/naveridro/naverlogin_solo_guide.pdf), [NAVER API 서비스 이용약관](https://developers.naver.com/products/intro/terms/terms.md))

## 5. 회원 탈퇴와 네이버 연동 해제

현재 네이버 개발가이드는 사용자가 서비스를 탈퇴하거나 네이버 로그인을 더 이상 이용하지 않아 연동을 해제할 때 Token Revocation API로 연결을 끊도록 안내한다. 성공하면 access token과 refresh token이 함께 무효화되고 네이버의 “연결된 서비스 관리”에서도 해당 서비스가 제거된다. ([네이버 로그인 개발가이드](https://developers.naver.com/docs/login/devguide/devguide.md))

현재 요청 형식은 다음과 같다. PDF의 `grant_type=delete` 예제를 새 구현에 사용하지 않는다. ([네이버 로그인 API 명세](https://developers.naver.com/docs/login/api/api.md))

```http
POST https://nid.naver.com/oauth2.0/revoke
Content-Type: application/x-www-form-urlencoded

client_id=...
client_secret=...
token=ACCESS_TOKEN_OR_REFRESH_TOKEN
token_type_hint=access_token
```

- `client_id`, `client_secret`, `token`은 필수다.
- `token_type_hint`는 선택이며 `access_token` 또는 `refresh_token`이다.
- 지정한 토큰과 연결된 반대편 토큰도 함께 폐기된다.
- 성공 또는 이미 폐기/부재한 토큰은 HTTP 200이며, 응답 본문이 아니라 상태 코드로 판정한다.
- 503은 일시 장애로 재시도할 수 있지만, 400·401은 요청 또는 자격 증명을 수정해야 한다.

서비스 탈퇴 처리 순서는 **네이버 토큰 폐기 → 서비스 DB의 개인정보 삭제·익명화와 법정 보존 데이터 분리 → 모든 서비스 세션 폐기**가 안전하다. 첫 단계에 실패했는데 계정과 토큰부터 영구 삭제하면 네이버 연동을 끊을 수단도 잃으므로, 실패를 이용자에게 알리고 재시도 가능한 상태를 남겨야 한다. 이는 네이버가 탈퇴·연동 해제 시 토큰 폐기를 요구하고 개인정보 목적 달성 시 파기를 요구한다는 두 공식 규칙을 함께 만족시키기 위한 구현상 결론이다. ([네이버 로그인 개발가이드](https://developers.naver.com/docs/login/devguide/devguide.md), [NAVER API 서비스 이용약관](https://developers.naver.com/products/intro/terms/terms.md))

## 6. KidsWiki 실행 체크리스트

- [ ] 네이버 버튼을 공식 녹색 완성형 애셋으로 교체하거나 현재 BI 규격과 정확히 일치시킨다.
- [ ] 네이버 애플리케이션 이름·로고가 KidsWiki 브랜드를 명확히 나타내는지 확인한다.
- [ ] 이용자 식별자 외 제공 정보 권한이 모두 해제됐는지 다시 확인한다.
- [ ] 로그인 버튼부터 가입 완료까지의 캡처를 하나의 검수 파일로 만든다.
- [ ] 네이버 가입 과정에서 별도의 서비스 비밀번호를 요구하지 않는지 확인한다.
- [x] 마이페이지에 회원 탈퇴와 개별 네이버 연동 해제 동작을 제공한다.
- [x] 탈퇴/연동 해제 시 현재 `/oauth2.0/revoke`를 호출하고 실패를 처리한다.
- [ ] 개인정보처리방침의 실제 수집 항목과 OAuth 권한이 일치하는지 확인한다.
- [ ] 탈퇴 시 개인정보·세션·법정 보존 데이터 처리 정책을 실제 코드와 일치시킨다.

구현 메모: KidsWiki는 연동 해지·탈퇴 직전에 네이버로 재인증해 새 access token을 받고, 이를 저장하지 않은 채 `/oauth2.0/revoke`에 즉시 사용한다. 폐기 실패 시 로컬 identity와 계정을 유지해 재시도할 수 있게 하며, 성공한 경우에만 로컬 연결 해지 또는 계정 익명화·전체 세션 폐기를 진행한다.
