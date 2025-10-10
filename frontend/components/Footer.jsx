export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* 상단: 브랜드 + 링크 묶음 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* 브랜드 */}
          <div className="space-y-3">
            <div className="text-xl font-bold tracking-tight">
              <span className="text-blue-600">SelfStar</span>.AI
            </div>
            <p className="text-sm text-slate-600 leading-6">
              SelfStar에서 가상의 인물을<br />
              제작하여 인플루언서로 활동해보세요.<br />
              저희가 도와드릴게요.
            </p>

            {/* 소셜 아이콘 (Instagram / GitHub / Email 만) */}
            <div className="flex items-center gap-4 pt-2">
              {/* Instagram */}
              <a
                aria-label="Instagram"
                href="#"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" />
                  <circle cx="12" cy="12" r="4" stroke="currentColor" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
              </a>

              {/* GitHub */}
              {/* path SVG 벡터 아이콘 경로 데이터 d
              즉, viewBox가 0 0 24 24로 설계가 되어있어서 어떤 크기로든 깔끔하게 스케일링 가능*/}
              <a
                aria-label="GitHub"
                href="#"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .296c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.016-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.744.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.418-1.305.762-1.606-2.665-.303-5.466-1.333-5.466-5.932 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.653.243 2.873.119 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.803 5.625-5.475 5.921.43.371.823 1.102.823 2.222 0 1.606-.015 2.899-.015 3.293 0 .319.216.694.825.576C20.565 22.092 24 17.592 24 12.296c0-6.627-5.373-12-12-12z" />
                </svg>
              </a>

              {/* Email */}
              <a
                aria-label="Email"
                href="mailto:hello@selfstar.ai"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" />
                  <path d="M4 7l8 6 8-6" stroke="currentColor" />
                </svg>
              </a>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">제품</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><a href="#" className="hover:text-slate-900">대시보드</a></li>
              <li><a href="#" className="hover:text-slate-900">예약 발행</a></li>
              <li><a href="#" className="hover:text-slate-900">리포트/통계</a></li>
              <li><a href="#" className="hover:text-slate-900">크레딧/요금제</a></li>
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">리소스</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><a href="#" className="hover:text-slate-900">가이드</a></li>
              <li><a href="#" className="hover:text-slate-900">튜토리얼</a></li>
              <li><a href="#" className="hover:text-slate-900">공지사항</a></li>
            </ul>
          </div>

          <div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><a href="#" className="hover:text-slate-900">소개</a></li>
              <li><a href="#" className="hover:text-slate-900">채용</a></li>
              <li><a href="#" className="hover:text-slate-900">문의</a></li>
            </ul>
          </div>
        </div>

        {/* 구분선 */}
        <div className="my-8 border-t border-slate-200" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* 언어 선택 (더미) */}
          <div className="flex items-center gap-3">
            <label htmlFor="lang" className="text-sm text-slate-600">언어</label>
            <select
              id="lang"
              className="h-9 px-3 rounded-xl border border-slate-300 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option>한국어</option>
              <option>English</option>
            </select>
          </div>

          {/* 정책 링크 */}
          <div className="flex items-center gap-4 text-sm">
            <a href="#" className="text-slate-600 hover:text-slate-900">이용약관</a>
            <span className="text-slate-300">|</span>
            <a href="#" className="text-slate-600 hover:text-slate-900">개인정보처리방침</a>
            <span className="text-slate-300">|</span>
            <a href="mailto:hello@selfstar.ai" className="text-slate-600 hover:text-slate-900">고객센터</a>
          </div>

          {/* 카피라이트 */}
          <div className="text-sm text-slate-500">
            © {year} SelfStar.AI. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
