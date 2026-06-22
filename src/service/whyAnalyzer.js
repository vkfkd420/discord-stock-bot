const RSSParser = require('rss-parser');
const { fetchNewsExtended, detectSectors } = require('../utils/fetchNews');
const { fetchIndices } = require('../utils/fetchIndices');
const { fetchCalendarEvents } = require('../utils/fetchCalendar');
const { callLLM } = require('./llmClient');
const { getWhyQuote } = require('./whyQuote');
const { getWatchlistQuote } = require('./watchlistQuote');

const parser = new RSSParser({ timeout: 5000 });

const SECTOR_LABEL = {
    tech: 'AI/반도체',
    energy: '에너지',
    finance: '금융',
    auto: '자동차/EV',
    pharma: '제약/바이오',
    defense: '방산',
    battery: '2차전지',
    general: '시장',
};

const PEER_MAP = {
    '005930': ['000660'],
    '000660': ['005930'],
    NVDA: ['AMD', 'INTC'],
    AMD: ['NVDA', 'INTC'],
    TSLA: ['RIVN', 'F'],
    AAPL: ['MSFT', 'GOOGL'],
};

const SYSTEM_PROMPT = `당신은 주식 시장 분석가입니다. 종목이 오늘 왜 올랐거나 내렸는지 원인을 분석합니다.

규칙:
- 뉴스 제목을 그대로 복사하지 마세요. 투자자가 이해하기 쉬운 말로 요약하세요.
- 확실하지 않은 내용은 단정하지 말고 "~ 가능성이 있습니다"로 표현하세요.
- 주요 원인은 최대 3개만 작성하세요.
- 종목 직접 뉴스가 적어도 섹터 흐름, 시장 지수, 거래량, 동종업계 움직임을 활용해 보조 원인을 제시하세요.
- "명확한 원인은 확인되지 않음"만 단독으로 쓰지 마세요. 뉴스가 부족하면 "뉴스 기반 직접 원인은 제한적이지만, 수급/섹터 영향 가능성" 형태로 작성하세요.
- JSON만 출력하세요.

출력 스키마:
{
  "oneLiner": "20~80자 한줄 결론",
  "causes": [
    { "sentiment": "positive|negative|neutral", "title": "원인 제목", "description": "1~2줄 설명" }
  ],
  "newsSummaries": ["뉴스 요약1", "뉴스 요약2", "뉴스 요약3"],
  "marketImpact": "positive|neutral|negative",
  "sustainability": 1,
  "caution": "주의할 점 1~2줄"
}`;

function getTzParts(timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    }).formatToParts(new Date());

    const get = (type) => parts.find((p) => p.type === type)?.value;
    return {
        weekday: get('weekday'),
        hour: Number(get('hour')),
        minute: Number(get('minute')),
    };
}

function isKrMarketOpenHour(kst) {
    if (kst.weekday === 'Sat' || kst.weekday === 'Sun') return false;
    const mins = kst.hour * 60 + kst.minute;
    return mins >= 9 * 60 && mins < 10 * 60;
}

function isUsMarketOpenHour() {
    const et = getTzParts('America/New_York');
    if (et.weekday === 'Sat' || et.weekday === 'Sun') return false;
    const mins = et.hour * 60 + et.minute;
    return mins >= 9 * 60 + 30 && mins < 10 * 60 + 30;
}

function getNewsWindowHours(item) {
    let hours = 24;
    const kst = getTzParts('Asia/Seoul');

    if (kst.weekday === 'Mon') hours = 72;

    if (item.kind === 'kr' && isKrMarketOpenHour(kst)) {
        hours = Math.max(hours, 48);
    }
    if (item.kind === 'us' && isUsMarketOpenHour()) {
        hours = Math.max(hours, 48);
    }

    return hours;
}

function isWithinHours(pubDate, hours) {
    if (!pubDate) return true;
    const published = new Date(pubDate);
    if (Number.isNaN(published.getTime())) return true;
    return Date.now() - published.getTime() <= hours * 60 * 60 * 1000;
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

function matchesSector(newsSectors, stockSectors) {
    return newsSectors.some((s) => stockSectors.includes(s) && s !== 'general');
}

async function fetchUsTickerNews(ticker, maxAgeHours, limit = 10) {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
    try {
        const feed = await parser.parseURL(url);
        return (feed.items || [])
            .filter((item) => isWithinHours(item.pubDate, maxAgeHours))
            .slice(0, limit)
            .map((item) => ({
                title: item.title || '',
                summary: (item.contentSnippet || item.content || item.title || '').slice(0, 250),
                pubDateRaw: item.pubDate,
            }));
    } catch (e) {
        console.error(`[왜] Yahoo RSS 실패 [${ticker}]:`, e.message);
        return [];
    }
}

function dedupeNews(items) {
    const seen = new Set();
    return items.filter((n) => {
        const key = (n.title || n.summary || '').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function collectStockNews(item, cachedNews, maxAgeHours) {
    const keywords = buildKeywords(item);
    const fromCache = cachedNews.filter((n) => matchesNews(`${n.title} ${n.summary}`, keywords));

    if (item.kind === 'us') {
        const tickerNews = await fetchUsTickerNews(item.ticker, maxAgeHours);
        return dedupeNews([
            ...fromCache.map((n) => ({ title: n.title, summary: n.summary })),
            ...tickerNews,
        ]);
    }

    return fromCache.map((n) => ({ title: n.title, summary: n.summary }));
}

function collectSectorNews(stockSectors, cachedNews) {
    return cachedNews
        .filter((n) => matchesSector(n.sectors || [], stockSectors))
        .slice(0, 6)
        .map((n) => ({ title: n.title, summary: n.summary }));
}

function detectStockSectors(item) {
    const text = `${item.name} ${item.ticker || ''} ${item.code || ''}`;
    return detectSectors(text);
}

function kstTodayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

async function collectCalendarContext() {
    const events = await fetchCalendarEvents();
    const today = kstTodayKey();

    return events
        .filter((e) => e.dateKey === today)
        .filter((e) => e.importance >= 4)
        .slice(0, 5)
        .map((e) => `${e.dateLabel}: ${e.title} (${e.category}) — ${e.impact}`);
}

async function collectIndexContext(item) {
    const defs =
        item.kind === 'kr'
            ? [
                  { label: '코스피', ticker: '^KS11' },
                  { label: '달러/원', ticker: 'KRW=X' },
              ]
            : [
                  { label: 'S&P 500', ticker: '^GSPC' },
                  { label: '나스닥', ticker: '^IXIC' },
                  { label: '달러/원', ticker: 'KRW=X' },
              ];

    const indices = await fetchIndices(defs);
    return indices.filter((i) => i.data);
}

function parseChangePct(str) {
    const m = String(str).match(/([+-]?\d+\.?\d*)/);
    return m ? parseFloat(m[1]) : 0;
}

function indexTrend(indices) {
    const pcts = indices.map((i) => parseChangePct(i.data?.change || ''));
    if (!pcts.length) return 'neutral';
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    if (avg >= 0.3) return 'up';
    if (avg <= -0.3) return 'down';
    return 'neutral';
}

async function collectPeerContext(item) {
    const peerKeys = PEER_MAP[item.code] || PEER_MAP[item.ticker] || [];
    if (!peerKeys.length) return [];

    const lines = [];
    for (const key of peerKeys.slice(0, 2)) {
        const peerItem =
            item.kind === 'kr'
                ? { kind: 'kr', code: key, name: key, suffix: '.KS', market: 'KOSPI' }
                : { kind: 'us', ticker: key, name: key, market: 'US' };

        const q = await getWatchlistQuote(peerItem);
        if (q) {
            lines.push(`${q.name}: ${q.changePct} (${q.change})`);
        }
    }
    return lines;
}

function buildVolumeContext(quote) {
    if (!quote.volumeRatio) {
        return { signal: 'unknown', line: `거래량: ${quote.volume}`, description: null };
    }

    if (quote.volumeRatio >= 1.5) {
        return {
            signal: 'high',
            line: `거래량: ${quote.volume} (평균 대비 ${quote.volumeRatio.toFixed(1)}배)`,
            description: `거래량이 평균보다 크게 증가해 ${quote.isUp ? '매수' : '매도'} 수급이 유입된 가능성이 있습니다.`,
        };
    }
    if (quote.volumeRatio <= 0.7) {
        return {
            signal: 'low',
            line: `거래량: ${quote.volume} (평균 대비 ${quote.volumeRatio.toFixed(1)}배)`,
            description: '거래량은 평균 이하로, 뉴스보다 관망세·저유동성 영향 가능성이 있습니다.',
        };
    }

    return {
        signal: 'normal',
        line: `거래량: ${quote.volume} (평균 대비 ${quote.volumeRatio.toFixed(1)}배)`,
        description: '거래량은 평균 수준입니다.',
    };
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

function clampCauses(causes) {
    if (!Array.isArray(causes)) return [];
    return causes.slice(0, 3).map((c) => ({
        sentiment: ['positive', 'negative', 'neutral'].includes(c.sentiment) ? c.sentiment : 'neutral',
        title: String(c.title || '원인 미확인').slice(0, 80),
        description: String(c.description || '').slice(0, 300),
    }));
}

function buildFallbackAnalysis(quote, ctx) {
    const causes = [];
    const isUp = quote.isUp;
    const upDown = isUp ? '상승' : '하락';
    const sectorLabel = SECTOR_LABEL[ctx.primarySector] || '시장';

    if (ctx.indexTrend === 'up' || ctx.indexTrend === 'down') {
        const aligned =
            (isUp && ctx.indexTrend === 'up') || (!isUp && ctx.indexTrend === 'down');
        causes.push({
            sentiment: ctx.indexTrend === 'up' ? 'positive' : 'negative',
            title: aligned ? '시장 지수 동반' : '시장 지수와 괴리',
            description: aligned
                ? `${sectorLabel}·대형 지수 흐름과 같은 방향으로 움직인 가능성이 있습니다.`
                : `지수와 다른 방향으로 움직여 종목 개별 수급 영향 가능성이 있습니다.`,
        });
    }

    if (ctx.sectorNews.length > 0) {
        causes.push({
            sentiment: isUp ? 'positive' : 'negative',
            title: isUp ? '섹터 강세' : '섹터 약세',
            description: `${sectorLabel} 관련 이슈가 업종 전반에 영향을 준 가능성이 있습니다.`,
        });
    }

    if (ctx.volumeContext.signal === 'high') {
        causes.push({
            sentiment: isUp ? 'positive' : 'negative',
            title: '거래량 증가',
            description: ctx.volumeContext.description,
        });
    }

    if (ctx.peerLines.length > 0) {
        causes.push({
            sentiment: 'neutral',
            title: '동종업계 연동',
            description: `동종 종목 흐름: ${ctx.peerLines.join(' · ')}`,
        });
    }

    if (ctx.windowHours >= 48 && causes.length < 3) {
        causes.push({
            sentiment: 'neutral',
            title: '주말 뉴스 반영 가능성',
            description:
                '직접 뉴스는 제한적이나 주말·전일 이슈가 장 초반에 반영됐을 가능성이 있습니다.',
        });
    }

    if (causes.length === 0) {
        causes.push({
            sentiment: 'neutral',
            title: '수급·섹터 영향',
            description: `뉴스 기반 직접 원인은 제한적이나, ${sectorLabel} 수급과 시장 분위기가 ${upDown}에 영향을 준 가능성이 있습니다.`,
        });
    }

    const volumeHint =
        ctx.volumeContext.signal === 'high'
            ? '거래량 증가'
            : ctx.volumeContext.signal === 'low'
              ? '저조한 거래량'
              : '수급';

    const oneLiner =
        ctx.directNewsCount === 0
            ? `뉴스 기반 직접 원인은 제한적이지만, ${sectorLabel} ${isUp ? '강세' : '약세'}와 ${volumeHint}가 ${upDown}에 영향을 준 것으로 보입니다.`
            : `직접 뉴스 외에도 ${sectorLabel} 흐름과 ${volumeHint}가 ${upDown}에 추가 영향을 준 것으로 보입니다.`;

    const sectorNewsSummaries = ctx.sectorNews
        .slice(0, 3)
        .map((n) => (n.summary || n.title).replace(/\s+/g, ' ').trim().slice(0, 100));

    return {
        oneLiner: oneLiner.slice(0, 100),
        causes: clampCauses(causes).slice(0, 3),
        newsSummaries: sectorNewsSummaries.length ? sectorNewsSummaries : ['관련 뉴스 없음 — 섹터·수급 기반 보조 분석'],
        marketImpact: isUp ? 'positive' : 'negative',
        sustainability: ctx.volumeContext.signal === 'high' ? 3 : 2,
        caution: '뉴스·공시 추가 확인이 필요하며, 장 초반 변동성에 유의하세요.',
        insufficient: false,
    };
}

function normalizeAnalysis(raw, quote, ctx) {
    const causes = clampCauses(raw?.causes);
    const hasDirectNews = ctx.directNewsCount > 0;
    const hasUsefulCauses = causes.length > 0;
    const vagueOnly =
        raw?.oneLiner?.includes('명확한 원인은 확인되지 않') && !hasUsefulCauses;

    if (!raw || vagueOnly || (!hasDirectNews && !hasUsefulCauses)) {
        return buildFallbackAnalysis(quote, ctx);
    }

    if (!hasUsefulCauses) {
        return buildFallbackAnalysis(quote, ctx);
    }

    const sustainability = Math.max(1, Math.min(5, Number(raw.sustainability) || 3));

    return {
        oneLiner: String(
            raw.oneLiner ||
                `뉴스와 시장 흐름을 종합하면 ${quote.isUp ? '상승' : '하락'} 요인이 복합적으로 작용한 것으로 보입니다.`
        ).slice(0, 100),
        causes,
        newsSummaries: (Array.isArray(raw.newsSummaries) ? raw.newsSummaries : [])
            .slice(0, 3)
            .map((s) => String(s).slice(0, 120)),
        marketImpact: ['positive', 'negative', 'neutral'].includes(raw.marketImpact)
            ? raw.marketImpact
            : quote.isUp
              ? 'positive'
              : 'negative',
        sustainability,
        caution: String(raw.caution || '단기 변동성에 유의하세요.').slice(0, 200),
        insufficient: false,
    };
}

async function analyzeWhy(item) {
    const quote = await getWhyQuote(item);
    if (!quote) {
        throw new Error('시세를 불러오지 못했습니다.');
    }

    const windowHours = getNewsWindowHours(item);
    const stockSectors = detectStockSectors(item);
    const primarySector = stockSectors.find((s) => s !== 'general') || 'general';

    const [{ all: cachedNews }, indexRows, calendarLines, peerLines] = await Promise.all([
        fetchNewsExtended(windowHours),
        collectIndexContext(item),
        collectCalendarContext(),
        collectPeerContext(item),
    ]);

    const newsItems = await collectStockNews(item, cachedNews, windowHours);
    const sectorNews = collectSectorNews(stockSectors, cachedNews);
    const volumeContext = buildVolumeContext(quote);
    const indexLines = indexRows.map((i) => `${i.label}: ${i.data.price} (${i.data.change})`);
    const idxTrend = indexTrend(indexRows);

    const direction = quote.isUp ? '상승' : '하락';
    const question = quote.isUp ? '오늘 왜 오르지?' : '오늘 왜 내리지?';

    const ctx = {
        windowHours,
        directNewsCount: newsItems.length,
        sectorNews,
        primarySector,
        indexTrend: idxTrend,
        volumeContext,
        peerLines,
    };

    const newsBlock = newsItems.length
        ? newsItems.map((n, i) => `${i + 1}. ${n.summary || n.title}`).join('\n')
        : '(종목 직접 뉴스 없음)';

    const sectorBlock = sectorNews.length
        ? sectorNews.map((n, i) => `${i + 1}. ${n.summary || n.title}`).join('\n')
        : '(섹터 뉴스 없음)';

    const userPrompt = [
        `종목: ${quote.name} (${item.kind === 'us' ? item.ticker : item.code})`,
        `시장: ${quote.market}`,
        `뉴스 조회 범위: 최근 ${windowHours}시간`,
        `오늘 ${direction} (${question})`,
        '',
        '[시세]',
        `현재가: ${quote.price}`,
        `등락: ${quote.change} (${quote.changePct})`,
        volumeContext.line,
        '',
        '[시장 지수]',
        indexLines.length ? indexLines.join('\n') : '(지수 데이터 없음)',
        `지수 종합 흐름: ${idxTrend === 'up' ? '상승' : idxTrend === 'down' ? '하락' : '보합'}`,
        '',
        '[섹터]',
        `추정 섹터: ${SECTOR_LABEL[primarySector] || primarySector}`,
        sectorBlock,
        '',
        '[동종업계]',
        peerLines.length ? peerLines.join('\n') : '(동종 종목 데이터 없음)',
        '',
        '[경제 일정 영향]',
        calendarLines.length ? calendarLines.join('\n') : '(오늘 주요 일정 없음)',
        '',
        `[최근 ${windowHours}시간 종목 직접 뉴스]`,
        newsBlock,
        '',
        `위 정보를 종합해 ${quote.name}이 오늘 ${direction}한 원인을 분석하세요.`,
        '직접 뉴스가 없으면 섹터·지수·거래량·동종업계로 보조 분석하세요.',
        '"명확한 원인은 확인되지 않음"만 단독 출력하지 마세요.',
    ].join('\n');

    let analysis;
    try {
        const raw = await callLLM(SYSTEM_PROMPT, userPrompt);
        analysis = normalizeAnalysis(extractJson(raw), quote, ctx);

        if (analysis.newsSummaries.length === 0 || analysis.newsSummaries[0] === '관련 뉴스 없음') {
            const direct = newsItems.slice(0, 3).map((n) =>
                (n.summary || n.title).replace(/\s+/g, ' ').trim().slice(0, 100)
            );
            const sector = sectorNews.slice(0, 3).map((n) =>
                (n.summary || n.title).replace(/\s+/g, ' ').trim().slice(0, 100)
            );
            analysis.newsSummaries = direct.length ? direct : sector.length ? sector : analysis.newsSummaries;
        }
    } catch (e) {
        console.error('[왜] LLM 분석 실패:', e.message);
        analysis = buildFallbackAnalysis(quote, ctx);
    }

    return {
        item,
        quote,
        question,
        analysis,
        windowHours,
    };
}

module.exports = { analyzeWhy, getNewsWindowHours };
