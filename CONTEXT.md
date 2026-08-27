# Domain Context

## Glossary

### Canonical User

서비스 안에서 한 사람을 대표하는 활성 사용자입니다. 문서 기여, 설정, 알림과 여러 OAuth Identity가 이 사용자 ID 하나에 귀속됩니다. 이메일은 계정 식별자가 아닌 선택 프로필 정보입니다.

### OAuth Identity

Google, 네이버, 카카오 같은 OAuth 공급자의 불변 사용자 식별자입니다. 하나의 Canonical User는 공급자별로 최대 한 개의 OAuth Identity를 가질 수 있습니다.

### Provider Email

OAuth 공급자가 OAuth Identity와 함께 확인해 준 선택 이메일입니다. 한 Canonical User는 연결된 Identity별로 여러 Provider Email을 가질 수 있으며, 로그인 식별자로 사용하지 않습니다.

### Primary Email

기준 OAuth Identity의 Provider Email로, 사용자를 대표해 표시되는 이메일입니다. 다른 Provider Email은 본인의 계정 연결 관리에서만 확인합니다.

### Protected Super Admin Email

운영자가 최고관리자용으로 지정한 Provider Email입니다. 지정을 먼저 해제하지 않는 한 해당 Identity 연결이나 계정을 제거할 수 없습니다.

### Retired User Alias

이미 별도 생성된 중복 사용자를 Canonical User로 합친 뒤 남기는 예전 사용자 ID 매핑입니다. 예전 프로필 URL과 문서 속 멘션은 이 별칭을 통해 Canonical User를 가리킵니다.

### 분야 기여

사용자가 특정 육아 분야의 공동 문서를 개선해 온 활동입니다. 해당 분야의 경험이나 전문 자격, 현재 문서 내용에 대한 동의를 의미하지 않습니다.

### 신뢰 기여자

누적된 위키 기여에 대한 평가가 운영 기준을 충족하여 자신의 편집을 별도 등록 요청 없이 반영할 수 있는 사용자입니다. 타인의 편집 요청을 검토할 권한이나 육아 분야의 전문 자격을 의미하지 않습니다.

### 사용자 뱃지

운영진이 확인한 사용자 특성을 공개 프로필에 표시하는 표식입니다. 운영 역할과 기여 신뢰 상태와 독립적으로 여러 개를 부여할 수 있으며, 뱃지마다 별도의 확인 기준을 가집니다.

### 자격 확인 전문가

운영진이 외부 전문 자격을 확인한 사용자에게 부여하는 사용자 뱃지입니다. 이 표시는 위키 검토 권한이나 모든 기여 내용의 정확성을 보증하지 않습니다.
