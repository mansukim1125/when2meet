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

## Supabase와 Render로 백엔드 배포

### Supabase

1. Supabase 프로젝트를 만든 뒤 상단의 **Connect → Session pooler**에서 PostgreSQL 연결 URI를 복사합니다. Session pooler는 IPv4를 지원하며 포트는 `5432`입니다. URI의 비밀번호 자리에는 프로젝트의 **데이터베이스 비밀번호**를 넣습니다. 비밀번호의 `@`, `#`, `%` 같은 특수 문자는 URL 인코딩합니다. [Supabase 연결 문서](https://supabase.com/docs/guides/database/connecting-to-postgres)
2. **Database → Settings → SSL Configuration**에서 CA 인증서를 내려받습니다. Render에서 이 인증서를 사용해 PostgreSQL 서버의 인증서와 호스트 이름을 확인합니다. [Supabase SSL 설정 문서](https://supabase.com/docs/guides/platform/ssl-enforcement)

### Render

프로젝트 전체를 GitHub 저장소에 푸시합니다. Render에서 GitHub 저장소의 `main` 브랜치를 연결해 **Web Service**를 만듭니다. [Render 웹 서비스 문서](https://render.com/docs/web-services)

| 항목 | 값 |
| --- | --- |
| Language | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| `NODE_VERSION` | `24.22.1` |
| `HOST` | `0.0.0.0` |
| `CORS_ORIGIN` | `https://YOUR_USERNAME.github.io` 또는 Pages 커스텀 도메인의 출처 |
| `DATABASE_URL` | 아래의 PostgreSQL 연결 URI |

Render 서비스의 **Environment → Secret Files**에 Supabase CA 인증서 내용을 `supabase-ca.crt`라는 이름으로 저장합니다. **Environment Variables**의 `DATABASE_URL`은 아래 형식으로 설정합니다. 사용자 이름과 호스트는 Supabase가 발급한 값을 사용합니다. 기존 URI에 쿼리 문자열이 있으면 새 옵션은 `&`로 붙입니다. [Render 환경 변수와 Secret Files 문서](https://render.com/docs/configure-environment-variables)

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.crt
```

`DATABASE_URL`은 Render에만 저장합니다. `PORT`는 Render가 지정하며, SQLite용 `DB_PATH`나 영구 디스크 설정은 필요 없습니다. 서버는 첫 시작 시 `nalmoa` 스키마와 테이블을 자동으로 만듭니다. Render 주소의 `/api/health`에서 `{"ok":true}`가 반환되면 데이터베이스 연결이 정상입니다. 기존 로컬 모임과 응답은 로컬 SQLite에 있으며, 새 Supabase DB는 빈 상태로 시작합니다.

## GitHub Pages 배포

1. GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables**에서 `API_BASE_URL`에 Render 웹 서비스의 공개 HTTPS 주소를 설정합니다. 예를 들어 `https://nalmoa-api.onrender.com`을 넣습니다.
2. **Settings → Pages → Source**를 **GitHub Actions**로 설정합니다. `main` 브랜치에 푸시하거나 **Actions → Deploy GitHub Pages → Run workflow**를 실행합니다. [GitHub Pages 게시 소스 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
3. 배포된 Pages 주소에서 모임을 만든 뒤 공유 링크를 시크릿 창에서 열어 응답이 저장되는지 확인합니다. Render의 `CORS_ORIGIN`에는 Pages 주소에서 `/when2meet/` 같은 저장소 경로를 제외한 출처만 넣습니다.
