# discord-stock-bot

Discord 슬래시 커맨드로 **한국 주식 시세 조회**와 **경제 뉴스**를 제공하고, 매일 아침 **투자 브리핑**을 자동 전송하는 봇입니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| `/주가` | 한국 종목명·종목코드로 현재가 조회 (KOSPI/KOSDAQ) |
| `/뉴스` | 주식·경제 RSS 뉴스 최신 5건 |
| 자동 브리핑 | 매일 08:30 (KST) 주요 지수 + 뉴스를 지정 채널에 전송 |
| 종목 캐시 | KIND 상장법인 목록을 로컬 캐시해 한글 종목명 검색 지원 |

## 동작 방식

```
봇 시작 → KIND 종목 목록 캐시 로드 (krxStocks.json)
       ↓
/주가 삼성전자 → 캐시에서 종목코드(005930) 검색
       ↓
네이버 금융 API → 현재가·등락률 Embed 표시
```

- **종목 검색**: [KIND](http://kind.krx.co.kr) 상장법인 목록 (~2,700종목)
- **한국 주식 시세**: [네이버 금융 API](https://m.stock.naver.com)
- **브리핑 지수/뉴스**: Twelve Data · Yahoo Finance · RSS

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
| `TWELVEDATA_API_KEY` | ⬜ | 브리핑 지수 조회용 ([Twelve Data](https://twelvedata.com)) |
| `GEMINI_API_KEY` | ✅* | AI 브리핑 — **무료** ([Google AI Studio](https://aistudio.google.com/apikey)) |
| `GROQ_API_KEY` | ✅* | AI 브리핑 — **무료** ([Groq Console](https://console.groq.com)) |
| `OPENAI_API_KEY` | ✅* | AI 브리핑 — 유료 ([OpenAI](https://platform.openai.com)) |
| `LLM_PROVIDER` | ⬜ | `gemini` / `groq` / `openai` (미설정 시 키 있는 provider 자동 선택) |

\* AI 브리핑은 **Gemini, Groq, OpenAI 중 하나**만 설정하면 됩니다.

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

최신 주식·경제 뉴스 5건을 Embed로 표시합니다.

### `/브리핑`

헤지펀드 리서치 형식의 **AI 투자 브리핑**을 즉시 생성합니다 (약 1~2분 소요).

- 한국·미국 증시 뉴스 분석
- 핵심 뉴스 TOP 5, 주요 인물 발언, 섹터별 강도
- 투자자 행동 가이드
- 결과: 지수 Embed + `.md` 리포트 파일 첨부

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
│   ├── index.js              # 봇 진입점, interaction 처리
│   ├── commands/
│   │   ├── stock.js          # /주가 커맨드
│   │   └── news.js           # /뉴스 커맨드
│   ├── service/
│   │   └── stockSearch.js    # 종목 캐시·검색·네이버 시세
│   ├── utils/
│   │   ├── fetchStock.js     # 브리핑용 지수 시세
│   │   └── fetchNews.js      # RSS 뉴스
│   ├── scheduler.js          # 매일 브리핑 스케줄
│   └── data/
│       └── krxStocks.json    # 종목 캐시 (자동 생성·갱신)
├── .env.example
└── package.json
```

## 주의사항

- **봇은 한 번만 실행**하세요. 같은 토큰으로 프로세스가 2개 떠 있으면 `/주가` 명령이 `Unknown interaction` 오류를 낼 수 있습니다.
- 종목 캐시는 24시간마다 자동 갱신됩니다. 최초 실행 시 KIND에서 다운로드합니다.
- 브리핑의 해외 지수는 Twelve Data API 키가 필요합니다. `/주가`(한국 주식)는 네이버 API를 사용하므로 별도 키가 필요 없습니다.

## 라이선스

ISC
