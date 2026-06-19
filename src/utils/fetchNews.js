const RSSParser = require('rss-parser');
const parser = new RSSParser();

// 무료 RSS 피드 목록
const RSS_FEEDS = [
    'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI&region=US&lang=en-US',
    'https://www.investing.com/rss/news_285.rss',
];

// 섹터 키워드 매핑
const SECTOR_MAP = {
    tech: ['nvidia', 'apple', 'microsoft', 'google', 'meta', 'amazon', 'ai', 'chip', 'semiconductor', '반도체', '기술'],
    energy: ['oil', 'energy', 'opec', 'crude', '에너지', '유가', '원유'],
    finance: ['fed', 'interest rate', 'bank', 'treasury', '금리', '연준', '은행'],
    auto: ['tesla', 'ev', 'electric vehicle', '전기차', '자동차'],
    pharma: ['fda', 'drug', 'pharma', 'biotech', '제약', '바이오'],
};

function detectSectors(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const [sector, keywords] of Object.entries(SECTOR_MAP)) {
        if (keywords.some((k) => lower.includes(k))) found.push(sector);
    }
    return found.length > 0 ? found : ['general'];
}

function calcImpact(title) {
    const high = ['surge', 'crash', 'crisis', 'ban', 'emergency', 'record', '폭락', '급등', '위기', '제재'];
    const mid = ['rise', 'fall', 'drop', 'beat', 'miss', '상승', '하락', '예상'];
    const t = title.toLowerCase();
    if (high.some((w) => t.includes(w))) return '🔴 높음';
    if (mid.some((w) => t.includes(w))) return '🟡 중간';
    return '🟢 낮음';
}

async function fetchNews(limit = 5) {
    const items = [];
    for (const url of RSS_FEEDS) {
        try {
            const feed = await parser.parseURL(url);
            items.push(...feed.items.slice(0, limit));
        } catch (e) {
            console.error(`RSS 파싱 실패: ${url}`, e.message);
        }
    }

    // 중복 제거 후 최신순 정렬, limit개 반환
    const seen = new Set();
    return items
        .filter((item) => {
            if (seen.has(item.title)) return false;
            seen.add(item.title);
            return true;
        })
        .slice(0, limit)
        .map((item) => ({
            title: item.title || '제목 없음',
            summary: item.contentSnippet?.slice(0, 120) || item.title,
            link: item.link || '',
            sectors: detectSectors((item.title || '') + ' ' + (item.contentSnippet || '')),
            impact: calcImpact(item.title || ''),
            pubDate: item.pubDate ? new Date(item.pubDate).toLocaleString('ko-KR') : '',
        }));
}

module.exports = { fetchNews };