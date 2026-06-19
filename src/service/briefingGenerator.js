const { fetchNewsByRegion } = require('../utils/fetchNews');
const { fetchIndices: fetchMarketIndices } = require('../utils/fetchIndices');
const { SYSTEM_PROMPT, buildUserPrompt, FORMAT_RETRY_PROMPT } = require('./briefingPrompt');
const { normalizeBriefingMarkdown } = require('./briefingFormat');
const { callLLM } = require('./llmClient');

const INDICES = [
    { label: 'S&P 500', ticker: '^GSPC' },
    { label: '나스닥', ticker: '^IXIC' },
    { label: '코스피', ticker: '^KS11' },
    { label: '달러/원', ticker: 'KRW=X' },
];

async function generateBriefingMarkdown(userPrompt) {
    let raw = await callLLM(SYSTEM_PROMPT, userPrompt);
    let markdown = normalizeBriefingMarkdown(raw);

    const extractedCount = (raw.match(/^#\s+/gm) || []).length;
    if (extractedCount < 6) {
        console.log('[브리핑] 섹션 누락 감지 → 형식 재생성 시도');
        raw = await callLLM(SYSTEM_PROMPT, `${userPrompt}\n\n${FORMAT_RETRY_PROMPT}`);
        markdown = normalizeBriefingMarkdown(raw);
    }

    return markdown;
}

async function generateInvestmentBriefing(label = 'manual') {
    console.log(`[브리핑] 생성 시작 (${label})...`);

    const [indices, { kr, us }] = await Promise.all([
        fetchMarketIndices(INDICES),
        fetchNewsByRegion(),
    ]);

    const generatedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const userPrompt = buildUserPrompt({ indices, krNews: kr, usNews: us, generatedAt });
    const markdown = await generateBriefingMarkdown(userPrompt);

    console.log(`[브리핑] 생성 완료 (${label})`);

    return { markdown, indices, label, generatedAt };
}
module.exports = { generateInvestmentBriefing, INDICES };
