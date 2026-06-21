const RSSParser = require('rss-parser');
const { fetchNewsByRegion } = require('../utils/fetchNews');
const { callLLM } = require('./llmClient');

const parser = new RSSParser({ timeout: 5000 });

const SYSTEM_PROMPT = `당신은 주식 투자 브리핑 전문가입니다.
각 종목에 대해 "오늘의 포인트"를 20~40자 한국어 한 줄로 작성하세요.

규칙:
- 뉴스 제목을 그대로 복사하지 마세요.
- 실적, 공시, 주요 인물 발언, 업황 변화를 투자자 관점으로 요약하세요.
- JSON 객체만 출력하세요. 키는 종목명(입력과 동일), 값은 포인트 문장입니다.
- 관련 정보가 없으면 "특이 이슈 없음"을 사용하세요.`;

function isWithin24Hours(pubDate) {
    if (!pubDate) return true;
    const published = new Date(pubDate);
    if (Number.isNaN(published.getTime())) return true;
    return Date.now() - published.getTime() <= 24 * 60 * 60 * 1000;
}

function buildKeywords(item) {
    const keys = new Set([item.name]);
    if (item.kind === 'us') {
        keys.add(item.ticker);
        keys.add(item.ticker.toLowerCase());
    }
    const compact = item.name.replace(/\s+/g, '');
    if (compact.length >= 2) keys.add(compact);
    return [...keys];
}

function matchesNews(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some((k) => lower.includes(String(k).toLowerCase()));
}

function pickNewsLines(newsItems, limit = 4) {
    return newsItems.slice(0, limit).map((n) => {
        const snippet = (n.summary || n.title || '').replace(/\s+/g, ' ').trim();
        return `- ${snippet.slice(0, 120)}`;
    });
}

async function fetchUsTickerNews(ticker, limit = 6) {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
    try {
        const feed = await parser.parseURL(url);
        return (feed.items || [])
            .filter(isWithin24Hours)
            .slice(0, limit)
            .map((item) => ({
                title: item.title || '',
                summary: (item.contentSnippet || item.content || item.title || '').slice(0, 200),
            }));
    } catch (e) {
        console.error(`[관심종목] Yahoo RSS 실패 [${ticker}]:`, e.message);
        return [];
    }
}

async function collectNewsForItem(item, cachedNews) {
    const keywords = buildKeywords(item);
    const fromCache = cachedNews.filter((n) =>
        matchesNews(`${n.title} ${n.summary}`, keywords)
    );

    if (item.kind === 'us') {
        const tickerNews = await fetchUsTickerNews(item.ticker);
        const merged = [
            ...fromCache.map((n) => ({ title: n.title, summary: n.summary })),
            ...tickerNews,
        ];
        const seen = new Set();
        return merged.filter((n) => {
            const key = n.title.trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    return fromCache.map((n) => ({ title: n.title, summary: n.summary }));
}

function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch {
        return null;
    }
}

function normalizePoint(text) {
    let s = String(text || '')
        .replace(/^오늘의\s*포인트[:：]\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (!s) return '특이 이슈 없음';
    if (s.length > 45) s = s.slice(0, 42) + '...';
    return s;
}

function fallbackPoint(newsItems) {
    if (!newsItems.length) return '특이 이슈 없음';
    const raw = (newsItems[0].summary || newsItems[0].title || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '특이 이슈 없음';
    const words = raw.split(/[\s,.]+/).filter(Boolean).slice(0, 6).join(' ');
    return normalizePoint(words || '특이 이슈 없음');
}

async function generateDailyPoints(items) {
    const { all: cachedNews } = await fetchNewsByRegion();
    const contexts = [];

    for (const item of items) {
        const newsItems = await collectNewsForItem(item, cachedNews);
        contexts.push({
            name: item.name,
            newsLines: pickNewsLines(newsItems),
        });
    }

    const allEmpty = contexts.every((c) => c.newsLines.length === 0);
    if (allEmpty) {
        return Object.fromEntries(contexts.map((c) => [c.name, '특이 이슈 없음']));
    }

    const userPrompt = contexts
        .map((c) => `[${c.name}]\n${c.newsLines.length ? c.newsLines.join('\n') : '(관련 뉴스 없음)'}`)
        .join('\n\n');

    try {
        const raw = await callLLM(SYSTEM_PROMPT, userPrompt);
        const parsed = extractJson(raw);
        if (parsed) {
            const result = {};
            for (const ctx of contexts) {
                result[ctx.name] = normalizePoint(parsed[ctx.name] || fallbackPoint([]));
            }
            return result;
        }
    } catch (e) {
        console.error('[관심종목] 포인트 LLM 실패:', e.message);
    }

    const fallback = {};
    for (let i = 0; i < items.length; i++) {
        const ctx = contexts[i];
        fallback[ctx.name] = fallbackPoint(
            ctx.newsLines.map((line) => ({ summary: line.replace(/^-\s*/, '') }))
        );
    }
    return fallback;
}

module.exports = { generateDailyPoints };
