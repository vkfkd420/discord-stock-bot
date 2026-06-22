const axios = require('axios');
const { getQuote } = require('./stockSearch');
const { fetchYahooMeta } = require('./watchlistResolver');

const NAVER_STOCK_API = 'https://m.stock.naver.com/api/stock';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

function parsePrice(value) {
    return Number(String(value).replace(/,/g, '')) || 0;
}

function formatVolume(n) {
    if (!n || Number.isNaN(n)) return '-';
    return Number(n).toLocaleString('ko-KR') + '주';
}

async function getKrWhyQuote(item) {
    const quote = await getQuote({
        code: item.code,
        name: item.name,
        suffix: item.suffix,
        market: item.market,
    });
    if (!quote) return null;

    let volume = '-';
    let volumeRatio = null;
    try {
        const res = await axios.get(`${NAVER_STOCK_API}/${item.code}/basic`, {
            headers: UA,
            timeout: 10000,
        });
        const vol = parsePrice(res.data?.accumulatedTradingVolume ?? res.data?.tradingVolume);
        if (vol) volume = formatVolume(vol);
        const avgVol = parsePrice(res.data?.averageTradingVolume ?? res.data?.averageVolume);
        if (vol && avgVol) volumeRatio = vol / avgVol;
    } catch {
        // volume optional
    }

    return {
        name: quote.name,
        price: quote.price,
        changePct: quote.changePct,
        change: quote.change,
        volume,
        volumeRatio,
        isUp: quote.isUp,
        market: quote.market,
    };
}

async function getUsWhyQuote(item) {
    try {
        const meta = await fetchYahooMeta(item.ticker);
        if (!meta) return null;

        const price = Number(meta.regularMarketPrice);
        const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
        const changeVal = price - prev;
        const changePct = prev ? (changeVal / prev) * 100 : 0;
        const isUp = changeVal >= 0;
        const volume = meta.regularMarketVolume
            ? Number(meta.regularMarketVolume).toLocaleString('en-US') + ' shares'
            : '-';
        const volNum = Number(meta.regularMarketVolume) || 0;
        const avgVol = Number(meta.averageDailyVolume10Day || meta.averageDailyVolume3Month) || 0;
        const volumeRatio = volNum && avgVol ? volNum / avgVol : null;

        return {
            name: meta.shortName || meta.longName || item.name,
            price: `$${price.toFixed(2)}`,
            changePct: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
            change: `${isUp ? '▲' : '▼'} $${Math.abs(changeVal).toFixed(2)}`,
            volume,
            volumeRatio,
            isUp,
            market: meta.fullExchangeName || meta.exchangeName || 'US',
        };
    } catch (e) {
        console.error(`[왜] US 시세 실패 [${item.ticker}]:`, e.message);
        return null;
    }
}

async function getWhyQuote(item) {
    return item.kind === 'kr' ? getKrWhyQuote(item) : getUsWhyQuote(item);
}

module.exports = { getWhyQuote };
