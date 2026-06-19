/**
 * STABLE UI v1.0 — /브리핑 8섹션 형식 고정
 * 사용자 명시 요청 없이 CANONICAL_SECTIONS·헤더 문구를 변경하지 말 것.
 */
const CANONICAL_SECTIONS = [
    {
        key: 'kr',
        title: '🇰🇷 한국 증시 주요 뉴스',
        emptyBody: '해당 없음',
        match: (h) => /🇰🇷|한국|korea/i.test(h) && /뉴스|news/i.test(h),
    },
    {
        key: 'us',
        title: '🇺🇸 미국 증시 주요 뉴스',
        emptyBody: '해당 없음',
        match: (h) => /🇺🇸|미국|\bus\b/i.test(h) && /뉴스|news/i.test(h),
    },
    {
        key: 'top5',
        title: '🔥 오늘의 핵심 뉴스 TOP 5',
        emptyBody: [
            '1위: 해당 없음',
            '2위: 해당 없음',
            '3위: 해당 없음',
            '4위: 해당 없음',
            '5위: 해당 없음',
        ].join('\n'),
        match: (h) => /🔥|핵심.*top|top\s*5/i.test(h),
    },
    {
        key: 'voice',
        title: '🎤 주요 인물 발언 요약',
        emptyBody: '해당 없음',
        match: (h) => /🎤|인물.*발언|발언.*요약/.test(h),
    },
    {
        key: 'quote',
        title: '⚡ 오늘 시장을 움직인 한마디 TOP 5',
        emptyBody: [
            '1위: 해당 없음',
            '2위: 해당 없음',
            '3위: 해당 없음',
            '4위: 해당 없음',
            '5위: 해당 없음',
        ].join('\n'),
        match: (h) => /⚡|한마디|시장을.*움직/.test(h),
    },
    {
        key: 'calendar',
        title: '📅 오늘 체크할 일정',
        emptyBody: '미국: 해당 없음\n한국: 해당 없음',
        match: (h) => /📅|체크할.*일정|오늘.*일정/.test(h),
    },
    {
        key: 'sector',
        title: '📊 섹터별 강도 분석',
        emptyBody: [
            'AI: 🟡 해당 없음',
            '반도체: 🟡 해당 없음',
            '전력: 🟡 해당 없음',
            '방산: 🟡 해당 없음',
            '금융: 🟡 해당 없음',
            '바이오: 🟡 해당 없음',
            '2차전지: 🟡 해당 없음',
        ].join('\n'),
        match: (h) => /📊|섹터/.test(h),
    },
    {
        key: 'guide',
        title: '🎯 투자자 행동 가이드',
        emptyBody: '단기 관점: 해당 없음\n중기 관점: 해당 없음\n오늘 주목 종목: 해당 없음\n선정 이유: 해당 없음',
        match: (h) => /🎯|행동.*가이드|투자자.*가이드/.test(h),
    },
];

const REQUIRED_TITLES = CANONICAL_SECTIONS.map((s) => s.title);

function extractRawSections(markdown) {
    const sections = new Map();
    const parts = String(markdown || '').split(/^#\s+/m).filter(Boolean);

    for (const part of parts) {
        const firstLine = part.indexOf('\n');
        const header = (firstLine === -1 ? part : part.slice(0, firstLine)).trim();
        const body = (firstLine === -1 ? '' : part.slice(firstLine + 1)).trim();
        if (!header) continue;

        const def = CANONICAL_SECTIONS.find((s) => s.match(header));
        if (!def) continue;

        const prev = sections.get(def.key);
        if (!prev || body.length > prev.length) {
            sections.set(def.key, body);
        }
    }

    return sections;
}

function normalizeBriefingMarkdown(markdown) {
    const extracted = extractRawSections(markdown);

    return CANONICAL_SECTIONS.map(({ key, title, emptyBody }) => {
        const body = extracted.get(key)?.trim() || emptyBody;
        return `# ${title}\n${body}`;
    }).join('\n\n');
}

function validateBriefingStructure(markdown) {
    const titles = [...String(markdown || '').matchAll(/^#\s+(.+)$/gm)].map((m) => m[1].trim());
    if (titles.length < REQUIRED_TITLES.length) return false;

    for (let i = 0; i < REQUIRED_TITLES.length; i++) {
        if (titles[i] !== REQUIRED_TITLES[i]) return false;
    }

    return true;
}

function buildFormatTemplate() {
    return CANONICAL_SECTIONS.map(({ title, emptyBody }) => `# ${title}\n${emptyBody}`).join('\n\n');
}

module.exports = {
    CANONICAL_SECTIONS,
    REQUIRED_TITLES,
    normalizeBriefingMarkdown,
    validateBriefingStructure,
    buildFormatTemplate,
};
