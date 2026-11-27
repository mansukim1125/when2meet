# 날모아

모임 주최자가 달력에서 시작일과 종료일을 정하면 두 날짜를 포함한 기간 전체가 후보가 됩니다. 공유 링크를 받은 참여자는 달력에서 해당 기간에 가능한 날짜를 골라 이름과 함께 제출할 수 있습니다. 결과 달력은 가능한 사람이 많을수록 진한 색을 표시합니다. 날짜를 누르면 가능한 사람의 수와 이름을 볼 수 있습니다. 가능한 날이 없는 경우에도 응답할 수 있습니다.

## 로컬 실행

Node.js 24 이상이 필요합니다. `DATABASE_URL`이 없는 로컬 환경에서는 기존 SQLite 파일을 사용합니다.

```sh
npm ci
npm start
```

브라우저에서 [http://127.0.0.1:3000](http://127.0.0.1:3000)을 열면 됩니다. 로컬 서버가 정적 화면과 API를 함께 제공하며, 모임과 응답은 `data/nalmoa.sqlite`에 저장합니다.

모임 링크를 아는 사람은 응답과 날짜별 결과를 볼 수 있습니다. 참여자는 응답을 작성한 브라우저에 저장된 키로 자기 응답을 수정할 수 있습니다. 여러 참여자 흐름을 한 기기에서 확인하려면 다른 브라우저나 시크릿 창을 사용하세요.

## Supabase Edge Functions 배포

공개 사이트의 백엔드는 기존 Supabase PostgreSQL의 `nalmoa.polls`와 `nalmoa.responses`를 사용합니다. 새 Supabase 프로젝트를 사용할 때만 [초기 스키마](server/postgres.sql)를 SQL Editor에서 실행합니다.

Supabase CLI에 로그인한 뒤 프로젝트 루트에서 배포합니다.

```sh
supabase functions deploy nalmoa --project-ref YOUR_PROJECT_REF --use-api
```

함수는 Supabase가 제공하는 `SUPABASE_DB_URL`을 읽습니다. 별도의 GitHub Pages DB 비밀 변수는 필요 없습니다. `supabase/config.toml`은 공개 공유 링크 흐름에 맞춰 게이트웨이 JWT 검사를 끕니다. 응답 수정은 함수가 기존 브라우저 토큰으로 검증합니다. 다른 프런트엔드 출처를 사용하려면 Supabase Edge Function Secrets에 `NALMOA_CORS_ORIGIN`을 설정합니다.

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/nalmoa/api/health`에서 `{"ok":true}`가 반환되면 데이터베이스 연결이 정상입니다.

## GitHub Pages 배포

1. 배포 워크플로에는 현재 날모아 프로젝트의 공개 Edge Function 주소가 기본값으로 설정돼 있습니다. 다른 Supabase 프로젝트를 배포할 때는 GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables**에서 `NALMOA_API_BASE_URL`에 `https://YOUR_PROJECT_REF.supabase.co/functions/v1/nalmoa`를 설정합니다.
2. **Settings → Pages → Source**를 **GitHub Actions**로 설정합니다. `main` 브랜치에 푸시하거나 **Actions → Deploy GitHub Pages → Run workflow**를 실행합니다. [GitHub Pages 게시 소스 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
3. 배포된 Pages 주소에서 모임을 만든 뒤 공유 링크를 열어 응답이 저장되는지 확인합니다. 같은 Pages 주소에서 기존 모임 링크와 해당 브라우저의 응답 수정 권한을 계속 사용할 수 있습니다.
