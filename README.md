# POLIS

정책의 성과와 한계를 출처와 함께 읽고, 시민이 독립적으로 판단하고 토론하는 한국어 서비스입니다.

## 로컬 데모

Node.js 22 이상과 npm이 필요합니다.

```sh
npm ci
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)에서 정책 아카이브를 볼 수 있습니다. **데모 체험**에서 역할을 선택하고 닉네임과 동의를 등록합니다. 런던 혼잡통행료 사례가 기본으로 들어 있습니다.

1. **편집자**로 편집실에서 학습 주제를 만들고 원문 주소, 원문 위치와 인용 근거를 등록한 뒤 검수를 요청합니다.
2. **검수자**로 다른 작성자의 원문과 인용을 대조합니다. 검수 기록을 남기고 발행을 승인하거나 보완을 요청합니다.
3. **발행 운영자**로 승인된 버전을 발행합니다. 정정 초안 작성 중에는 이전 발행본이 계속 공개됩니다. 재발행하면 정정 사유와 이전 버전을 열람할 수 있습니다.
4. **시민**으로 최신 버전에 의견을 남깁니다. 다른 계정으로 신고하고 검수자로 처리할 수 있습니다.

데모 변경은 서버 메모리에 브라우저별로 저장됩니다. 서버 재시작이나 세션 만료 후에는 초기화됩니다. 데모 역할 전환은 로컬 모드에서만 작동합니다.

## Firebase 모드

1. `.env.example`을 `.env.local`로 복사하고 `POLIS_MODE=firebase` 및 Firebase 웹 설정을 입력합니다. `POLIS_ORIGIN`에는 사이트의 정확한 오리진을 입력합니다. 예를 들어 로컬은 `http://127.0.0.1:3000`입니다.
2. Firebase Authentication에서 Google 로그인을 켜고 사이트 도메인을 허용합니다. 신규 Google 로그인으로 계정을 만들 수 있습니다.
3. 동일 프로젝트의 Cloud Firestore를 생성하고 포함된 `firestore.rules`를 적용합니다. 브라우저는 Firestore에 직접 접근하지 않고 서버 API를 사용합니다.
4. 서버에서 Application Default Credentials를 구성합니다. 로컬 서비스 계정 파일은 저장소 밖에 보관합니다. 배포 환경은 서비스 ID에 필요한 Firebase Auth 및 Firestore 권한을 부여합니다.
5. 검증된 관리 환경의 Firebase Admin SDK로 대상 UID에 `polisRole` 커스텀 클레임을 부여합니다. 값은 `editor`, `reviewer`, `admin`입니다. 기존 클레임과 병합하고 대상 사용자가 다시 로그인하도록 합니다. 클레임 없는 사용자는 시민으로 등록됩니다.

Firebase 모드는 빈 아카이브에서 시작합니다. 운영 패널에서 첫 주제를 발행합니다. Firebase 인증 토큰과 이메일 인증 여부, 동의 버전, 편집·검수·발행 권한을 서버에서 검사합니다. 주제와 이력은 주제별 문서에 트랜잭션으로 저장하며, 현재 구현은 초기 운영 규모를 위한 문서 크기 한도와 전체 목록 조회 방식을 사용합니다.

- [Firebase Admin SDK 설정](https://firebase.google.com/docs/admin/setup)
- [Firebase Auth 커스텀 클레임](https://firebase.google.com/docs/auth/admin/custom-claims)

## 확인

```sh
npm run check
npm test
npm run build
npm run start
```

별도 터미널에서 `npm run test:e2e`를 실행하면 Chrome에서 모바일 크기로 데모의 검수·발행·토론·정정을 검증합니다. Chrome이 설치되어 있어야 합니다. 다른 포트는 `POLIS_TEST_URL`로 지정할 수 있습니다.

### Firebase 에뮬레이터 통합 테스트

Firebase CLI와 Java 21 이상이 설치된 환경에서 실행합니다.

```sh
npm run build
npm run test:firebase
```

테스트는 로컬 `demo-polis` 프로젝트의 Auth와 Firestore 에뮬레이터를 사용합니다. `firebase-emulator` 모드는 로컬 주소와 `demo-` 프로젝트 ID, 두 에뮬레이터 설정이 모두 필요합니다. 일반 Firebase 모드는 에뮬레이터 환경변수가 설정되어 있으면 요청을 거부합니다. 테스트 계정과 역할을 만들고 토큰 검증, 동의 이력, 독립 검수, 발행 및 정정, 신고 처리, Firestore 직접 접근 차단을 검사합니다. 앱을 재시작해도 테스트 중 저장한 공개 이력이 유지되는지 확인합니다. 테스트 서버는 3011번 포트를 사용합니다. 실제 Google 로그인 팝업은 Firebase 프로젝트가 설정된 환경에서 확인합니다.

Chrome에서 가입 팝업과 동의 화면도 검증하려면 `POLIS_FIREBASE_BROWSER=1 npm run test:firebase`를 실행합니다.

### 첫 운영자와 검수자 지정

Firebase Authentication 사용자 목록에서 가입을 마친 회원의 UID를 확인합니다. 발행 운영자는 승인된 주제를 발행할 수 있고, 편집자가 작성한 초안은 작성자와 다른 검수자가 확인해야 합니다. 운영자가 직접 초안을 작성하면 별도 검수자 계정이 필요합니다.

로컬 Firebase 설정 파일이 `.env.firebase.local`인 경우 아래 명령으로 대상과 역할을 먼저 확인합니다.

```sh
node --env-file=.env.firebase.local scripts/polis-role.mjs \
  --project FIREBASE_PROJECT_ID --uid FIREBASE_AUTH_UID --role reviewer
```

확인한 명령에 `--apply`를 추가하면 저장합니다. `editor`, `reviewer`, `admin`은 각각 편집자, 검수자, 발행 운영자입니다. `member`는 운영 역할을 회수합니다. 기존의 다른 Firebase 커스텀 클레임은 유지됩니다. 권한 적용 시 기존 세션을 만료하므로 회원은 다시 로그인해야 합니다.
