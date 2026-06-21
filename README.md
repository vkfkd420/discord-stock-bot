# discord-stock-bot

Discord 슬래시 커맨드로 **한국·미국 주식 시세**, **경제 뉴스**, **경제 일정**, **관심종목**을 제공하고, 매일 **AI 투자 브리핑**을 자동 전송하는 봇입니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| `/주가` | 한국 종목명·종목코드로 현재가 조회 (KOSPI/KOSDAQ) |
| `/뉴스` | 주식·경제 RSS 뉴스 (한국·미국) |
| `/브리핑` | AI 투자 브리핑 즉시 생성 |
| `/일정` | 오늘~7일 주요 경제·실적 일정 (날짜별 목록) |
| `/관심등록` | 관심종목 등록 (한국·미국, 최대 20개) |
| `/관심목록` | 관심종목 시세 + AI **오늘의 포인트** |
| `/관심삭제` | 관심종목 삭제 |
| 자동 브리핑 | 08:30 / 11:00 / 15:30 (KST) 지정 채널 전송 |
| 종목 캐시 | KIND 상장법인 목록을 로컬 캐시해 한글 종목명 검색 지원 |

## 동작 방식

```
봇 시작 → KIND 종목 목록 캐시 로드 (krxStocks.json)
       ↓
/주가 삼성전자 → 캐시에서 종목코드(005930) 검색 → 네이버 금융 API
/관심등록 NVDA → Yahoo Chart API로 티커 검증 → 사용자별 watchlist.json 저장
/관심목록 → 시세 조회 + RSS 뉴스 분석 → Gemini로 "오늘의 포인트" 요약
/일정 → TradingView·ForexFactory·FOMC·실적 캘린더 통합
```

- **한국 주식 검색·시세**: [KIND](http://kind.krx.co.kr) + [네이버 금융 API](https://m.stock.naver.com)
- **미국 주식 시세**: Yahoo Finance Chart API
- **경제 일정**: TradingView · ForexFactory · FOMC · Nasdaq 실적
- **뉴스**: 한국경제 · 매일경제 · Yahoo Finance · Investing.com RSS
- **AI 요약**: Gemini / Groq / OpenAI (브리핑, 관심종목 포인트)

## 사전 준비

- [Node.js](https://nodejs.org/) **20.x** (`.nvmrc` 참고)
- [Discord Developer Portal](https://discord.com/developers/applications)에서 봇 애플리케이션 생성
- 봇을 서버에 초대 (`applications.commands` 스코프 포함)

### Discord 봇 설정

1. Developer Portal → **Bot** → Token 발급 → `DISCORD_TOKEN`
2. **OAuth2 → General** → Application ID → `CLIENT_ID`
3. Discord에서 서버·채널 ID 확인 (개발자 모드 ON → 우클릭 → ID 복사)
   - `GUILD_ID`: 서버 ID
   - `CHANNEL_ID`: 브리핑을 보낼 채널 ID

## 설치 및 실행

```bash
git clone https://github.com/vkfkd420/discord-stock-bot.git
cd discord-stock-bot
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 실제 값 입력

npm run dev   # 개발 (파일 변경 시 자동 재시작)
npm start     # 프로덕션
```

## 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `DISCORD_TOKEN` | ✅ | Discord 봇 토큰 |
| `CLIENT_ID` | ✅ | Discord 애플리케이션 ID |
| `GUILD_ID` | ✅ | 슬래시 커맨드 등록할 서버 ID |
| `CHANNEL_ID` | ✅ | 매일 브리핑을 보낼 채널 ID |
| `TWELVEDATA_API_KEY` | ⬜ | 브리핑 지수 조회·미국 종목명 검색 ([Twelve Data](https://twelvedata.com)) |
| `GEMINI_API_KEY` | ✅* | AI 브리핑·관심종목 포인트 — **무료** ([Google AI Studio](https://aistudio.google.com/apikey)) |
| `GROQ_API_KEY` | ✅* | AI 브리핑 — **무료** ([Groq Console](https://console.groq.com)) |
| `OPENAI_API_KEY` | ✅* | AI 브리핑 — 유료 ([OpenAI](https://platform.openai.com)) |
| `LLM_PROVIDER` | ⬜ | `gemini` / `groq` / `openai` (미설정 시 키 있는 provider 자동 선택) |

\* AI 기능은 **Gemini, Groq, OpenAI 중 하나**만 설정하면 됩니다. `/관심목록`의 오늘의 포인트는 LLM API가 필요합니다.

> ⚠️ `.env` 파일은 Git에 올리지 마세요. 토큰이 노출되면 Developer Portal에서 즉시 재발급하세요.

## 슬래시 커맨드

### `/주가 종목:<이름 또는 코드>`

```
/주가 종목:삼성전자
/주가 종목:005930
/주가 종목:카카오
```

- 종목명 **완전·부분 일치** 검색
- 여러 종목이 매칭되면 **선택 메뉴** 표시
- 6자리 종목코드는 바로 조회

### `/뉴스`

최신 주식·경제 뉴스를 Embed로 표시합니다. (한국·미국 탭 전환)

### `/브리핑`

헤지펀드 리서치 형식의 **AI 투자 브리핑**을 즉시 생성합니다 (약 1~2분 소요).

- 한국·미국 증시 뉴스 분석
- 핵심 뉴스 TOP 5, 주요 인물 발언, 섹터별 강도
- 투자자 행동 가이드
- 결과: 지수 Embed + `.md` 리포트 파일 첨부

### `/일정`

오늘부터 7일간 **주요 경제·실적 일정**을 날짜별 목록으로 표시합니다.

- CPI · FOMC · GDP · 실업률 · 옵션만기(OPEX) · 빅테크 실적 등
- 중요도(⭐) · KST 시각 · 예상 영향 요약
- **중요만 / 전체 보기** 토글, 페이지 넘김

### `/관심등록 종목:<이름·코드·티커>`

```
/관심등록 종목:삼성전자
/관심등록 종목:SK하이닉스
/관심등록 종목:NVDA
```

- 사용자별 저장 (`src/data/watchlist.json`)
- 최대 **20개**, 중복 등록 방지
- 한국주식(종목명·6자리 코드) · 미국주식(티커) 모두 지원

### `/관심목록`

등록한 관심종목의 **현재가·등락률**과 AI **오늘의 포인트**를 표시합니다.

- 오늘의 포인트: 최근 24시간 뉴스·실적·공시·주요 인물 발언을 20~40자로 요약
- 뉴스 제목 복사 없이 투자자 관점 한 줄 요약

### `/관심삭제 종목:<이름·코드·티커>`

관심목록에서 해당 종목을 삭제합니다.

## 자동 스케줄

| 시간 (KST) | 동작 |
|------------|------|
| 08:00 | KIND에서 종목 캐시 갱신 |
| 08:30 | AI 투자 브리핑 (오전) |
| 11:00 | AI 투자 브리핑 (11시) |
| 15:30 | AI 투자 브리핑 (장 마감) |

## 프로젝트 구조

```
discord-stock-bot/
├── src/
│   ├── index.js                  # 봇 진입점, interaction 처리
│   ├── commands/
│   │   ├── stock.js              # /주가
│   │   ├── news.js               # /뉴스
│   │   ├── briefing.js           # /브리핑
│   │   ├── calendar.js           # /일정
│   │   └── watchlist.js          # /관심등록 · /관심목록 · /관심삭제
│   ├── service/
│   │   ├── stockSearch.js        # 종목 캐시·검색·네이버 시세
│   │   ├── briefingGenerator.js  # AI 브리핑 생성
│   │   ├── llmClient.js          # Gemini / Groq / OpenAI
│   │   ├── watchlistStore.js     # 관심종목 저장
│   │   ├── watchlistResolver.js  # 종목명·티커 해석
│   │   ├── watchlistQuote.js     # 관심종목 시세
│   │   └── watchlistPoint.js     # 오늘의 포인트 (AI)
│   ├── ui/
│   │   ├── newsView.js           # /뉴스 UI
│   │   ├── calendarView.js       # /일정 UI
│   │   └── watchlistView.js      # /관심목록 UI
│   ├── utils/
│   │   ├── fetchStock.js         # 브리핑용 지수 시세
│   │   ├── fetchNews.js          # RSS 뉴스
│   │   ├── fetchCalendar.js      # 경제 일정
│   │   ├── fetchIndices.js       # 지수·환율
│   │   └── discordUi.js          # Embed 공통
│   ├── scheduler.js              # 매일 브리핑 스케줄
│   └── data/
│       ├── krxStocks.json        # 종목 캐시 (자동 생성·갱신)
│       └── watchlist.json        # 관심종목 (자동 생성, Git 제외)
├── .env.example
└── package.json
```

## 주의사항

- **봇은 한 번만 실행**하세요. 같은 토큰으로 프로세스가 2개 떠 있으면 `Unknown interaction` 오류가 날 수 있습니다.
- 종목 캐시는 24시간마다 자동 갱신됩니다. 최초 실행 시 KIND에서 다운로드합니다.
- 브리핑의 해외 지수는 Twelve Data API 키가 필요합니다. `/주가`(한국 주식)는 네이버 API를 사용하므로 별도 키가 필요 없습니다.
- `/관심목록`의 미국 주식 시세는 Yahoo Finance API를 사용합니다.
- `watchlist.json`은 사용자별 데이터이므로 Git에 포함되지 않습니다.

## 라이선스

ISC
