const axios = require('axios');

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const TV_URL = 'https://economic-calendar.tradingview.com/events';
const FOMC_URL = 'https://the-calendar.net/api/finance/fomc/2026.json';
const NASDAQ_EARNINGS = 'https://api.nasdaq.com/api/calendar/earnings';
const EARNINGS_SYMBOLS = ['NVDA', 'TSLA', 'MSFT', 'AAPL'];

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache = null;
let cacheAt = 0;

const MACRO_RULES = [
    {
        category: 'CPI',
        pattern: /\bcpi\b|consumer price index/i,
        importance: 5,
        impact: '물가 재가속 시 금리 인상 우려로 성장주·채권 가격 변동성 확대',
    },
    {
        category: 'PPI',
        pattern: /\bppi\b|producer price index/i,
        importance: 4,
        impact: '생산자 물가가 CPI 선행지표로 작용해 인플레이션 기대를 흔듦',
    },
    {
        category: 'FOMC',
        pattern: /fomc|federal funds rate|fed interest rate decision|fed statement|fed press conference|fomc economic projections/i,
        importance: 5,
        impact: '연준 톤에 따라 금리·달러·미국 성장주 전반의 방향성이 결정됨',
    },
    {
        category: '금리결정',
        pattern: /interest rate decision|rate statement|official bank rate/i,
        importance: 5,
        impact: '중앙은행 금리 경로 변경 시 금융·성장주 섹터 로테이션 발생',
    },
    {
        category: '실업률',
        pattern: /non-farm|nonfarm|\bnfp\b|unemployment rate|jobless claims/i,
        importance: 5,
        impact: '고용 둔화 시 경기침체 우려, 고용 견조 시 연준 hawkish 재점화',
    },
    {
        category: 'GDP',
        pattern: /\bgdp\b|gross domestic product|advance gdp/i,
        importance: 5,
        impact: '경기 성장 속도에 따라 실적 기대와 금리 경로가 동시에 재평가됨',
    },
    {
        category: '소매판매',
        pattern: /retail sales/i,
        importance: 4,
        impact: '소비 강도가 내수·소비재·경기민감주 실적 기대를 좌우함',
    },
    {
        category: '미국 국채입찰',
        pattern: /\bbond auction\b|\bnote auction\b|\bbill auction\b|\bt-bill auction\b|treasury auction|\d-year note auction/i,
        importance: 3,
        impact: '수요 약세 시 장기금리 상승 → 성장주 밸류에이션 압박',
    },
];

const STATIC_RULES = {
    options: {
        importance: 4,
        impact: '월말 옵션 만기 전후 헤지·감마 청산으로 변동성 급증 가능',
    },
    earnings: {
        NVDA: { importance: 5, impact: 'AI·반도체 섹터 및 나스닥 변동성의 핵심 촉매' },
        TSLA: { importance: 4, impact: 'EV·성장주 심리 및 리스크 온 지표에 영향' },
        MSFT: { importance: 4, impact: '빅테크 AI 투자 내러티브와 S&P500 방향성에 영향' },
        AAPL: { importance: 4, impact: '소비·하드웨어 사이클 및 대형주 센티먼트에 영향' },
    },
};

function kstDateKey(date = new Date()) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function addDays(dateKey, days) {
    const d = new Date(`${dateKey}T12:00:00+09:00`);
    d.setDate(d.getDate() + days);
    return kstDateKey(d);
}

function formatDateLabel(dateKey, todayKey) {
    const d = new Date(`${dateKey}T12:00:00+09:00`);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday})`;
    return dateKey === todayKey ? `${label} · 오늘` : label;
}

function toStars(n) {
    return '⭐'.repeat(Math.max(1, Math.min(5, n)));
}

function matchMacroRule(title) {
    return MACRO_RULES.find((rule) => rule.pattern.test(title));
}

function formatTimeKst(iso) {
    if (!iso) return '종일';
    return (
        new Date(iso).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Seoul',
            hour12: false,
        }) + ' KST'
    );
}

function importanceLevel(n) {
    if (n >= 5) return 'high';
    if (n >= 4) return 'medium';
    return 'low';
}

function normalizeEvent({ dateKey, title, category, importance, impact, todayKey, timeIso }) {
    return {
        dateKey,
        dateLabel: formatDateLabel(dateKey, todayKey),
        timeKst: formatTimeKst(timeIso),
        title,
        category,
        importance,
        level: importanceLevel(importance),
        stars: toStars(importance),
        impact,
        isToday: dateKey === todayKey,
    };
}

function ffDateToKstKey(dateStr) {
    const d = new Date(dateStr);
    return kstDateKey(d);
}

async function fetchTradingView(startKey, endKey) {
    try {
        const from = `${startKey}T00:00:00.000Z`;
        const to = `${endKey}T23:59:59.000Z`;
        const res = await axios.get(TV_URL, {
            params: { from, to, countries: 'US' },
            headers: { ...UA, Origin: 'https://www.tradingview.com' },
            timeout: 15000,
        });
        return res.data?.result || [];
    } catch (e) {
        console.error('[일정] TradingView 실패:', e.message);
        return [];
    }
}

function tvDateToKstKey(iso) {
    return kstDateKey(new Date(iso));
}

function tvImportanceScore(tvValue, ruleImportance) {
    const mapped = tvValue === 1 ? 5 : tvValue === 0 ? 4 : 3;
    return Math.max(ruleImportance, mapped);
}

async function fetchForexFactory() {
    try {
        const res = await axios.get(FF_URL, { headers: UA, timeout: 15000, validateStatus: () => true });
        if (res.status !== 200 || !Array.isArray(res.data)) return [];
        return res.data;
    } catch (e) {
        console.error('[일정] ForexFactory 실패:', e.message);
        return [];
    }
}

async function fetchFomcMeetings() {
    try {
        const year = new Date().getFullYear();
        const res = await axios.get(`https://the-calendar.net/api/finance/fomc/${year}.json`, {
            headers: UA,
            timeout: 10000,
        });
        return res.data?.meetings || [];
    } catch (e) {
        console.error('[일정] FOMC 캘린더 실패:', e.message);
        return [];
    }
}

async function fetchNasdaqEarnings(dateKey) {
    try {
        const res = await axios.get(NASDAQ_EARNINGS, {
            params: { date: dateKey },
            headers: { ...UA, Accept: 'application/json' },
            timeout: 10000,
        });
        const rows = res.data?.data?.rows || [];
        return rows.filter((row) => EARNINGS_SYMBOLS.includes(row.symbol));
    } catch (e) {
        console.error(`[일정] Nasdaq 실적 실패 [${dateKey}]:`, e.message);
        return [];
    }
}

function getOptionsExpiriesInRange(startKey, endKey) {
    const events = [];
    const start = new Date(`${startKey}T12:00:00+09:00`);
    const end = new Date(`${endKey}T12:00:00+09:00`);

    for (let y = start.getFullYear(); y <= end.getFullYear() + 1; y++) {
        for (let m = 0; m < 12; m++) {
            const thirdFriday = findThirdFriday(y, m);
            if (!thirdFriday) continue;
            const key = kstDateKey(thirdFriday);
            if (key >= startKey && key <= endKey) {
                events.push(key);
            }
        }
    }

    return [...new Set(events)];
}

function findThirdFriday(year, month) {
    const d = new Date(Date.UTC(year, month, 1, 12, 0, 0));
    let count = 0;
    while (d.getUTCMonth() === month) {
        if (d.getUTCDay() === 5) {
            count++;
            if (count === 3) return d;
        }
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return null;
}

function dedupeEvents(events) {
    const seen = new Set();
    return events.filter((e) => {
        const key = `${e.dateKey}|${e.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function sortEvents(events) {
    return events.sort((a, b) => {
        if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
        return b.importance - a.importance;
    });
}

async function fetchCalendarEvents({ force = false } = {}) {
    if (!force && cache && Date.now() - cacheAt < CACHE_TTL_MS) {
        return cache;
    }

    const todayKey = kstDateKey();
    const endKey = addDays(todayKey, 6);
    const events = [];

    const ff = await fetchForexFactory();
    for (const item of ff) {
        if (item.country !== 'USD') continue;
        const dateKey = ffDateToKstKey(item.date);
        if (dateKey < todayKey || dateKey > endKey) continue;

        const rule = matchMacroRule(item.title || '');
        if (!rule) continue;
        if (/continuing jobless|4-week average|retail inventories/i.test(item.title || '')) continue;

        const ffImpact =
            item.impact === 'High' ? 5 : item.impact === 'Medium' ? 4 : rule.importance;
        events.push(
            normalizeEvent({
                dateKey,
                timeIso: item.date,
                title: item.title,
                category: rule.category,
                importance: Math.max(rule.importance, ffImpact === 5 ? 5 : rule.importance),
                impact: rule.impact,
                todayKey,
            })
        );
    }

    const tv = await fetchTradingView(todayKey, endKey);
    for (const item of tv) {
        const dateKey = tvDateToKstKey(item.date);
        if (dateKey < todayKey || dateKey > endKey) continue;

        const rule = matchMacroRule(item.title || '');
        if (!rule) continue;
        if (/continuing jobless|4-week average|retail inventories/i.test(item.title || '')) continue;

        events.push(
            normalizeEvent({
                dateKey,
                timeIso: item.date,
                title: item.title,
                category: rule.category,
                importance: tvImportanceScore(item.importance, rule.importance),
                impact: rule.impact,
                todayKey,
            })
        );
    }

    const fomc = await fetchFomcMeetings();
    for (const meeting of fomc) {
        const dateKey = meeting.date;
        if (dateKey < todayKey || dateKey > endKey) continue;
        if (!/day 2|rate decision/i.test(meeting.name + meeting.note)) continue;

        events.push(
            normalizeEvent({
                dateKey,
                title: 'FOMC 금리 결정',
                category: 'FOMC',
                importance: 5,
                impact: '연준 톤에 따라 금리·달러·미국 성장주 전반의 방향성이 결정됨',
                todayKey,
            })
        );
    }

    for (const dateKey of getOptionsExpiriesInRange(todayKey, endKey)) {
        events.push(
            normalizeEvent({
                dateKey,
                title: '미국 월간 옵션 만기 (OPEX)',
                category: '옵션만기일',
                importance: STATIC_RULES.options.importance,
                impact: STATIC_RULES.options.impact,
                todayKey,
            })
        );
    }

    for (let i = 0; i < 7; i++) {
        const dateKey = addDays(todayKey, i);
        const earnings = await fetchNasdaqEarnings(dateKey);
        for (const row of earnings) {
            const meta = STATIC_RULES.earnings[row.symbol];
            events.push(
                normalizeEvent({
                    dateKey,
                    title: `${row.symbol} (${row.name}) 실적 발표`,
                    category: `${row.symbol} 실적`,
                    importance: meta.importance,
                    impact: meta.impact,
                    todayKey,
                })
            );
        }
    }

    const result = sortEvents(dedupeEvents(events));
    cache = result;
    cacheAt = Date.now();
    return result;
}

module.exports = { fetchCalendarEvents, toStars, formatDateLabel };
