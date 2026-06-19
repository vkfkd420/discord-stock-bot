/**
 * STABLE UI v1.0 — /브리핑 LLM 프롬프트 고정
 * 사용자 명시 요청 없이 8섹션 템플릿·형식 규칙을 변경하지 말 것.
 */
const { buildFormatTemplate } = require('./briefingFormat');

const SECTION_HEADERS = buildFormatTemplate();

const SYSTEM_PROMPT = `당신은 월가 헤지펀드 리서치팀 수석 애널리스트다.

목표:
지난 24시간 동안 발표된 한국 및 미국 증시에 영향을 줄 수 있는 핵심 뉴스를 선별하여 투자 브리핑을 작성한다.

분석 원칙:
* 실제 시장에 영향을 줄 가능성이 있는 뉴스만 포함
* 중복 기사 제거, 루머·미확인 SNS 제외
* 투자자 관점에서 중요도 순으로 정렬
* 제공된 뉴스·지수 데이터에만 근거 (추측 금지)

형식 규칙 (가장 중요):
* 아래 8개 섹션 헤더를 순서·문구·이모지 그대로 사용 (한 글자도 변경 금지)
* 섹션 추가·삭제·병합·순서 변경 금지
* 서론, 결론, 인사말, 요약 문단 등 섹션 외 텍스트 출력 금지
* 정보가 없어도 섹션은 반드시 유지하고 본문만 "해당 없음" 또는 지정 형식으로 작성

뉴스 블록 형식 (한국/미국 섹션, 최대 5개):
제목:
3줄 요약:
관련 종목:
관련 섹터:
시장 영향: (🟢 긍정 / 🟡 중립 / 🔴 부정)
중요도: (★~★★★★★)
투자자 해석:

TOP 5 형식 (핵심 뉴스 / 한마디 섹션):
1위: ...
2위: ...
3위: ...
4위: ...
5위: ...

일정 섹션:
미국: ...
한국: ...

섹터 섹션 (7개 모두):
AI: 🟢/🟡/🔴 ...
반도체: ...
전력: ...
방산: ...
금융: ...
바이오: ...
2차전지: ...

행동 가이드 섹션:
단기 관점: ...
중기 관점: ...
오늘 주목 종목: ...
선정 이유: ...

출력은 반드시 아래 템플릿 구조를 그대로 따르고, 각 섹션 본문만 데이터로 채운다:

${SECTION_HEADERS}`;

function buildUserPrompt({ indices, krNews, usNews, generatedAt }) {
    const indexBlock = indices
        .filter((i) => i.data)
        .map((i) => `- ${i.label}: ${i.data.price} (${i.data.change})`)
        .join('\n');

    const formatNews = (items) =>
        items.length === 0
            ? '(수집된 기사 없음)'
            : items
                  .map(
                      (n, i) =>
                          `[${i + 1}] ${n.title}\n    요약: ${n.summary}\n    시각: ${n.pubDate}`
                  )
                  .join('\n');

    return `브리핑 작성 시각: ${generatedAt}

## 현재 주요 지수
${indexBlock || '(지수 데이터 없음)'}

## 한국 관련 뉴스 (${krNews.length}건)
${formatNews(krNews)}

## 미국 관련 뉴스 (${usNews.length}건)
${formatNews(usNews)}

위 데이터로 브리핑 본문을 작성하라.
섹션 헤더 8개는 템플릿과 동일하게 유지하고, 본문 내용만 채워라.`;
}

const FORMAT_RETRY_PROMPT = `이전 응답의 섹션 구조가 템플릿과 다릅니다.
섹션 헤더 8개를 아래와 정확히 동일하게 맞추고, 본문만 다시 작성하세요.
헤더 외 추가 텍스트는 금지합니다.

${SECTION_HEADERS}`;

module.exports = { SYSTEM_PROMPT, buildUserPrompt, FORMAT_RETRY_PROMPT };
