# SelfStar (AI · Backend · Frontend · Deploy)

이 문서는 SelfStar 프로젝트의 최종 한글 가이드입니다. 생성형 이미지·인스타그램 게시·대시보드 인사이트(모의 데이터 지원)를 하나의 모노레포로 제공합니다.

- AI: Imagen/Gemini 기반 이미지 생성 서빙 (`ai/`)
- Backend: FastAPI – OAuth, 파일/미디어, 댓글 자동응답, 게시/통계 API (`backend/`)
- Frontend: React + Vite – 챗/게시/인사이트 UI (`frontend/`)
- Nginx: 리버스 프록시/HTTPS (`nginx/`)
- Compose: dev/prod 스택 (`docker-compose.dev.yml`, `docker-compose.prod.yml`)
- Systemd/scripts: 서버 부팅 자동화, 인증서 발급/갱신 (`systemd/`, `scripts/`)

## 빠른 시작 (개발용 · Windows PowerShell)

사전 준비
- Docker Desktop 설치(WSL2 권장)
- 리포 클론 후 예제 환경파일을 복사/수정

환경파일 복사 예시
```powershell
Copy-Item env\backend.env.example  env\backend.dev
Copy-Item env\frontend.env.example env\frontend.dev
Copy-Item env\ai.dev.example       env\ai.dev
```
핵심 값(예)
- `env/backend.dev`
  - `BACKEND_URL=http://localhost`
  - `FRONTEND_URL=http://localhost`
  - `AI_SERVICE_URL=http://ai:8600`
  - (자동 답글) `AUTO_REPLY_SCHEDULER_ENABLED=1`, `AUTO_REPLY_INTERVAL_SECONDS=480` (8분)
- `env/frontend.dev` – 필요 시 API 베이스
- `env/ai.dev` – 모델/키 등

실행 (핫리로드)
```powershell
docker compose -f docker-compose.dev.yml up -d --build
```
접속
- 앱: http://localhost/
- 대시보드(Mock): http://localhost/dashboard?mock=1  ← 상단에 “Mock 데이터 표시 중” 배너
- 헬스: http://localhost/api/ping, http://localhost/health
중지
```powershell
docker compose -f docker-compose.dev.yml down
```

## 주요 기능

- 이미지 생성 파이프라인: 댓글/명령 → 프롬프트 설계 → Imagen 3 등으로 생성 → 저장소(Local/NCP S3) 저장 → (옵션) 앱 등록
- 인스타그램 게시: 파일 승격(`/media` 또는 `/files`) → Graph API 게시
- 대시보드 인사이트(Mock 지원): `?mock=1`로 팔로워/프로필 방문/도달/노출/좋아요 합계 및 스냅샷 증가치 데모 표시
- 자동 답글 스케줄러: `AUTO_REPLY_INTERVAL_SECONDS`로 주기 제어(예: 8분)

## 아키텍처 개요

- `frontend/` – React+Vite. 라우팅 예: `/dashboard`, `/chat`.
  - 데모 인사이트: `/dashboard?mock=1`
- `backend/` – FastAPI. 대표 라우트: `/health`, `/api/*`(댓글/이미지/게시/통계), 정적 미디어(`/media`), 문서(`/docs`/`/redoc`)
- `ai/serving/fastapi_app` – 이미지 생성 서빙(Imagen/Gemini). 필요 시 `vllm_server/` 대체 가능
- `nginx/conf.d/selfstar.conf` – HTTPS(443) 종단, `/api`·`/oauth`는 백엔드 프록시, 그 외는 프론트 전달
- Compose 네트워크 – 서비스 간 통신 및 포트 매핑

## 배포 요약(프로덕션)

전제
- 리눅스 서버, Docker & Compose 설치
- 도메인 A 레코드(예: `selfstar.duckdns.org`)와 80/443 오픈

절차
1) 환경파일 준비
```bash
mkdir -p env
cp env/backend.prod.example env/backend.prod
cp env/frontend.prod.example env/frontend.prod
cp env/ai.prod.example       env/ai.prod
# backend.prod: FRONTEND_URL/BACKEND_URL(https), DB/세션/OAuth 키 설정
```
2) 초기 기동(HTTP)
```bash
docker compose -f docker-compose.prod.yml up -d --build nginx backend frontend
```
3) 인증서 발급/갱신
```bash
./scripts/cert_issue.sh
# 이후 갱신
./scripts/cert_renew.sh
```
4) 전체 기동
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
5) 부팅 자동화(옵션)
- `systemd/selfstar.service`, `selfstar-cert-renew.*`를 서버 경로에 맞게 복사/활성화

접속(배포)
- 앱: https://selfstar.duckdns.org/
- 대시보드(Mock): https://selfstar.duckdns.org/dashboard?mock=1
- 헬스: https://selfstar.duckdns.org/health, https://selfstar.duckdns.org/__routes

## 환경 변수 요약

예제 파일을 참고해 필요한 값만 채워 주세요.
- Backend
  - 기본: `SESSION_SECRET`, `BACKEND_URL`, `FRONTEND_URL`, `AI_SERVICE_URL`
  - Instagram(META) OAuth: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_SCOPES`
  - NCP Object Storage(선택): `NCP_S3_ENDPOINT`, `NCP_S3_REGION`, `NCP_S3_BUCKET`, `NCP_S3_ACCESS_KEY`, `NCP_S3_SECRET_KEY`
  - 자동 답글: `AUTO_REPLY_SCHEDULER_ENABLED`, `AUTO_REPLY_INTERVAL_SECONDS`
- AI
  - Vertex/Gemini 모델 키/프로젝트/리전 등
- Frontend
  - API 베이스 등(Vite는 `VITE_` 접두사 사용)

자세한 예제
- `env/backend.env.example`, `env/backend.prod.example`
- `env/frontend.env.example`, `env/frontend.prod.example`
- `env/ai.dev.example`, `env/ai.prod.example`

## 트러블슈팅

- 502 Bad Gateway (예: `POST /api/instagram/comments/auto_image`)
  - 원인: 백엔드 예외/다운, 또는 긴 처리시간으로 타임아웃
  - 조치: Nginx 타임아웃 확대(개발 예)
    ```nginx
    location ^~ /api/ {
      proxy_pass http://backend_upstream;
      proxy_connect_timeout 60s;
      proxy_read_timeout 600s;
      proxy_send_timeout 600s;
    }
    ```
  - 로그 확인
    ```powershell
    docker compose -f docker-compose.dev.yml logs -f backend
    docker compose -f docker-compose.dev.yml logs -f nginx
    ```
- 인스타 업로드 400/403
  - `instagram_content_publish` 포함 여부, 계정/페이지 링크 및 토큰 유효성 확인
  - 업로드 URL이 공개 HTTPS인지 확인(로컬 개발은 ngrok 등으로 `BACKEND_URL` 공개 필요)
- 자동 답글 주기 변경 미반영
  - env 수정 후 백엔드 재시작 필요
    ```powershell
    docker compose -f docker-compose.dev.yml restart backend
    ```
- 포트 충돌(WinError 10048)
  ```powershell
  Get-NetTCPConnection -LocalPort 80,5174,8000,8600 -State Listen
  Stop-Process -Id <PID> -Force
  ```

## 리포 구조
```
ai/
  serving/
    fastapi_app/           # AI FastAPI 서빙 (이미지 생성)
    vllm_server/           # (옵션) vLLM 서버 스크립트
  training/                # 학습/노트북
backend/
  app/                     # FastAPI 앱 엔트리/라우트/코어
  tests/
frontend/
  src/                     # React + Vite 앱 (Dashboard/Chat 등)
nginx/
  conf.d/selfstar.conf     # 배포용 Nginx vhost
scripts/                   # 인증서 발급/갱신 스크립트
systemd/                   # 부팅 자동화 유닛 파일
env/                       # 예제 및 환경 파일들
```

## 참고/기여
- 데모/프로토타입과 운영 구성을 함께 제공합니다. 실 운영 시 정적 빌드 서빙, 로깅/모니터링, 비밀 관리(Secret Manager) 등을 권장합니다.
- 이슈/PR 환영합니다.
