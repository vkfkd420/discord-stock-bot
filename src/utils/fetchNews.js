const RSSParser = require('rss-parser');
const parser = new RSSParser({ timeout: 5000 });

const RSS_FEEDS = {
    us: [
        'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US',
        'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^IXIC&region=US&lang=en-US',
        'https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US',
        'https://www.investing.com/rss/news_285.rss',
    ],
    kr: [
        'https://www.hankyung.com/feed/economy',
        'https://www.hankyung.com/feed/stock',
        'https://www.mk.co.kr/rss/50300041/',
        'https://www.mk.co.kr/rss/50100041/',
    ],
};

const SECTOR_MAP = {
    tech: ['nvidia', 'apple', 'microsoft', 'google', 'meta', 'amazon', 'ai', 'chip', 'semiconductor', '반도체', '기술', 'IT'],
    energy: ['oil', 'energy', 'opec', 'crude', '에너지', '유가', '원유', '전력'],
    finance: ['fed', 'interest rate', 'bank', 'treasury', '금리', '연준', '은행', '금융'],
    auto: ['tesla', 'ev', 'electric vehicle', '전기차', '자동차', '현대차'],
    pharma: ['fda', 'drug', 'pharma', 'biotech', '제약', '바이오'],
    defense: ['defense', '방산', 'military', 'weapons'],
    battery: ['battery', '2차전지', 'lithium', '리튬', '전기차'],
};

const KR_HINTS = ['한국', '코스피', '코스닥', '삼성', '하이닉스', '네이버', '카카오', '현대', 'LG', 'SK', '국내', '원/달러', '원화', '금감원', '한은', '기재부'];

const CACHE_TTL_MS = 5 * 60 * 1000;
let newsCache = null;
let newsCacheAt = 0;

function detectSectors(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const [sector, keywords] of Object.entries(SECTOR_MAP)) {
        if (keywords.some((k) => lower.includes(k.toLowerCase()))) found.push(sector);
    }
    return found.length > 0 ? found : ['general'];
}

function calcImpact(title) {
    const high = ['surge', 'crash', 'crisis', 'ban', 'emergency', 'record', '폭락', '급등', '위기', '제재', 'rate cut', 'rate hike'];
    const mid = ['rise', 'fall', 'drop', 'beat', 'miss', '상승', '하락', '예상', '발표'];
    const t = title.toLowerCase();
    if (high.some((w) => t.includes(w))) return '🔴 높음';
    if (mid.some((w) => t.includes(w))) return '🟡 중간';
    return '🟢 낮음';
}

function isWithinHours(pubDate, hours) {
    if (!pubDate) return true;
    const published = new Date(pubDate);
    if (Number.isNaN(published.getTime())) return true;
    return Date.now() - published.getTime() <= hours * 60 * 60 * 1000;
}

function isWithin24Hours(pubDate) {
    return isWithinHours(pubDate, 24);
}

function isKoreanNews(item) {
    const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.link || ''}`;
    if (/[가-힣]/.test(text)) return true;
    return KR_HINTS.some((h) => text.includes(h));
}

function extractSource(link) {
    try {
        const host = new URL(link).hostname.replace(/^www\./, '');
        const map = {
            'finance.yahoo.com': 'Yahoo Finance',
            'hankyung.com': '한국경제',
            'mk.co.kr': '매일경제',
            'investing.com': 'Investing.com',
        };
        return map[host] || host;
    } catch {
        return 'RSS';
    }
}

function timeAgo(pubDate) {
    if (!pubDate) return '';
    const diff = Date.now() - new Date(pubDate).getTime();
    if (Number.isNaN(diff) || diff < 0) return '';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
}

function normalizeItem(item, region = 'us') {
    return {
        title: item.title || '제목 없음',
        summary: (item.contentSnippet || item.content || item.title || '').slice(0, 400),
        link: item.link || '',
        region,
        source: extractSource(item.link || ''),
        sectors: detectSectors((item.title || '') + ' ' + (item.contentSnippet || '')),
        impact: calcImpact(item.title || ''),
        pubDate: item.pubDate ? new Date(item.pubDate).toLocaleString('ko-KR') : '',
        pubDateRaw: item.pubDate,
        timeAgo: timeAgo(item.pubDate),
    };
}

async function fetchFeedItems(url, perFeed = 15) {
    try {
        const feed = await parser.parseURL(url);
        return feed.items.slice(0, perFeed);
    } catch (e) {
        console.error(`RSS 파싱 실패: ${url}`, e.message);
        return [];
    }
}

async function fetchNewsExtended(maxAgeHours = 24) {
    const [usRaw, krRaw] = await Promise.all([
        Promise.all(RSS_FEEDS.us.map((url) => fetchFeedItems(url, 20))),
        Promise.all(RSS_FEEDS.kr.map((url) => fetchFeedItems(url, 20))),
    ]);

    const dedupeRaw = (items) => {
        const seen = new Set();
        return items.filter((item) => {
            const key = (item.title || '').trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const within = (item) => isWithinHours(item.pubDate, maxAgeHours);

    const allUs = dedupeRaw(usRaw.flat().filter(within)).map((item) => normalizeItem(item, 'us'));
    const allKr = dedupeRaw(krRaw.flat().filter(within)).map((item) => normalizeItem(item, 'kr'));

    const krFromUs = allUs.filter(isKoreanNews);
    const seenKr = new Set();
    const kr = [...allKr, ...krFromUs].filter((n) => {
        if (seenKr.has(n.title)) return false;
        seenKr.add(n.title);
        return true;
    });

    const us = allUs.filter((n) => !isKoreanNews(n));
    return { kr, us, all: [...kr, ...us] };
}

async function fetchNewsByRegion({ force = false } = {}) {
    if (!force && newsCache && Date.now() - newsCacheAt < CACHE_TTL_MS) {
        return newsCache;
    }

    const [usRaw, krRaw] = await Promise.all([
        Promise.all(RSS_FEEDS.us.map((url) => fetchFeedItems(url))),
        Promise.all(RSS_FEEDS.kr.map((url) => fetchFeedItems(url))),
    ]);

    const dedupeRaw = (items) => {
        const seen = new Set();
        return items.filter((item) => {
            const key = (item.title || '').trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const allUs = dedupeRaw(usRaw.flat().filter(isWithin24Hours)).map((item) => normalizeItem(item, 'us'));
    const allKr = dedupeRaw(krRaw.flat().filter(isWithin24Hours)).map((item) => normalizeItem(item, 'kr'));

    const krFromUs = allUs.filter(isKoreanNews);
    const seenKr = new Set();
    const kr = [...allKr, ...krFromUs]
        .filter((n) => {
            if (seenKr.has(n.title)) return false;
            seenKr.add(n.title);
            return true;
        })
        .slice(0, 30);

    const us = allUs.filter((n) => !isKoreanNews(n)).slice(0, 30);

    newsCache = { kr, us, all: [...kr, ...us] };
    newsCacheAt = Date.now();

    return newsCache;
}

async function warmNewsCache() {
    try {
        await fetchNewsByRegion({ force: true });
        console.log('✅ 뉴스 RSS 캐시 워밍 완료');
    } catch (e) {
        console.error('뉴스 RSS 캐시 워밍 실패:', e.message);
    }
}

async function fetchNews({ limit = 10, region = 'all' } = {}) {
    const { kr, us } = await fetchNewsByRegion();
    if (region === 'kr') return kr.slice(0, limit);
    if (region === 'us') return us.slice(0, limit);
    return [...kr, ...us].slice(0, limit);
}

module.exports = {
    fetchNews,
    fetchNewsByRegion,
    fetchNewsExtended,
    warmNewsCache,
    detectSectors,
    SECTOR_MAP,
};
