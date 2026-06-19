const axios = require('axios');

const NAVER_INDEX = 'https://m.stock.naver.com/api/index';
const NAVER_FX = 'https://api.stock.naver.com/marketindex/exchange/FX_USDKRW';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const ER_API = 'https://open.er-api.com/v6/latest/USD';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

const FX_MIN = 900;
const FX_MAX = 2500;

function parseNum(value) {
    return Number(String(value).replace(/,/g, '')) || 0;
}

function isValidFxRate(price) {
    return price >= FX_MIN && price <= FX_MAX;
}

function buildQuote({ name, ticker, priceNum, changeNum, changePct, currency = 'KRW' }) {
    const isKR = currency === 'KRW';
    const priceStr = isKR
        ? priceNum.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원'
        : priceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const changeStr =
        (changeNum >= 0 ? '▲' : '▼') +
        (isKR
            ? Math.abs(changeNum).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원'
            : Math.abs(changeNum).toFixed(2)) +
        ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;

    const emoji =
        changePct >= 1 ? '🚀' : changePct >= 0 ? '📈' : changePct >= -1 ? '📉' : '💥';

    return { ticker, name, price: priceStr, change: changeStr, emoji };
}

function buildFxQuote(priceNum, changeNum, changePct) {
    if (!isValidFxRate(priceNum)) return null;
    return buildQuote({
        name: '달러/원',
        ticker: 'USD/KRW',
        priceNum,
        changeNum,
        changePct,
        currency: 'KRW',
    });
}

async function fetchNaverIndex(code) {
    const res = await axios.get(`${NAVER_INDEX}/${code}/basic`, { headers: UA, timeout: 10000 });
    const d = res.data;
    const price = parseNum(d.closePrice);
    const change = parseNum(d.compareToPreviousClosePrice);
    const isUp =
        d.compareToPreviousPrice?.name === 'RISING' ||
        d.compareToPreviousPrice?.name === 'UPPER_LIMIT';
    const signedChange = isUp ? Math.abs(change) : -Math.abs(change);
    const changePct = parseFloat(d.fluctuationsRatio) || 0;

    return buildQuote({
        name: d.stockName || code,
        ticker: code,
        priceNum: price,
        changeNum: signedChange,
        changePct,
        currency: 'KRW',
    });
}

async function fetchNaverUsdKrw() {
    const res = await axios.get(NAVER_FX, { headers: UA, timeout: 10000 });
    const d = res.data?.exchangeInfo;
    if (!d?.closePrice) return null;

    const price = parseNum(d.closePrice);
    const change = parseNum(d.fluctuations);
    const isUp =
        d.fluctuationsType?.name === 'RISING' || d.fluctuationsType?.name === 'UPPER_LIMIT';
    const signedChange = isUp ? Math.abs(change) : -Math.abs(change);
    const changePct = parseFloat(d.fluctuationsRatio) || 0;

    return buildFxQuote(price, signedChange, changePct);
}

async function fetchYahooFx() {
    const res = await axios.get(`${YAHOO_CHART}/KRW%3DX`, { headers: UA, timeout: 10000 });
    const meta = res.data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const changeNum = price - prev;
    const changePct = prev ? (changeNum / prev) * 100 : 0;

    return buildFxQuote(price, changeNum, changePct);
}

async function fetchErApiFx() {
    const res = await axios.get(ER_API, { timeout: 10000 });
    const price = res.data?.rates?.KRW;
    if (!price) return null;

    return buildFxQuote(price, 0, 0);
}

async function fetchTwelveDataFx() {
    const apiKey = process.env.TWELVEDATA_API_KEY;
    if (!apiKey) return null;

    const res = await axios.get('https://api.twelvedata.com/quote', {
        params: { symbol: 'USD/KRW', apikey: apiKey },
        timeout: 10000,
        validateStatus: () => true,
    });

    const d = res.data;
    if (!d?.close) return null;

    const price = Number(d.close);
    const change = Number(d.change) || 0;
    const changePct = Number(d.percent_change) || 0;

    return buildFxQuote(price, change, changePct);
}

async function fetchUsdKrw() {
    const sources = [
        { name: 'Naver', fn: fetchNaverUsdKrw },
        { name: 'Yahoo', fn: fetchYahooFx },
        { name: 'TwelveData', fn: fetchTwelveDataFx },
        { name: 'ExchangeRate', fn: fetchErApiFx },
    ];

    for (const { name, fn } of sources) {
        try {
            const quote = await fn();
            if (quote) {
                console.log(`[지수] 달러/원 ← ${name} (${quote.price})`);
                return quote;
            }
        } catch (e) {
            console.error(`[지수] 달러/원 ${name} 실패:`, e.message);
        }
    }

    console.error('[지수] 달러/원 모든 소스 실패');
    return null;
}

async function fetchYahooIndex(symbol) {
    const res = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(symbol)}`, {
        headers: UA,
        timeout: 10000,
    });
    const meta = res.data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const changeNum = price - prev;
    const changePct = prev ? (changeNum / prev) * 100 : 0;
    const nameMap = { '^GSPC': 'S&P 500', '^IXIC': '나스닥' };

    return buildQuote({
        name: nameMap[symbol] || symbol,
        ticker: symbol,
        priceNum: price,
        changeNum,
        changePct,
        currency: 'USD',
    });
}

const INDEX_SOURCES = {
    '^GSPC': () => fetchYahooIndex('^GSPC'),
    '^IXIC': () => fetchYahooIndex('^IXIC'),
    '^KS11': () => fetchNaverIndex('KOSPI'),
    'KRW=X': () => fetchUsdKrw(),
};

async function fetchIndexQuote(ticker) {
    const fetcher = INDEX_SOURCES[ticker];
    if (!fetcher) return null;

    try {
        return await fetcher();
    } catch (e) {
        console.error(`지수 조회 실패 [${ticker}]:`, e.message);
        return null;
    }
}

async function fetchIndices(definitions) {
    return Promise.all(
        definitions.map(async (item) => ({
            ...item,
            data: await fetchIndexQuote(item.ticker),
        }))
    );
}

module.exports = { fetchIndices, fetchIndexQuote, isValidFxRate };
