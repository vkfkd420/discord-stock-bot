const axios = require('axios');
const { searchStock } = require('./stockSearch');

const TWELVE_BASE = 'https://api.twelvedata.com';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

function toKrItem(stock) {
    return {
        kind: 'kr',
        code: stock.code,
        name: stock.name,
        suffix: stock.suffix,
        market: stock.market,
    };
}

async function fetchYahooMeta(ticker) {
    const res = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(ticker)}`, {
        params: { interval: '1d', range: '1d' },
        headers: UA,
        timeout: 10000,
        validateStatus: () => true,
    });

    const meta = res.data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice && meta?.regularMarketPrice !== 0) return null;

    return meta;
}

async function verifyUsTicker(ticker) {
    try {
        const meta = await fetchYahooMeta(ticker);
        if (!meta) return null;

        return {
            kind: 'us',
            ticker: meta.symbol || ticker,
            name: meta.shortName || meta.longName || ticker,
            market: meta.fullExchangeName || meta.exchangeName || 'US',
        };
    } catch {
        return null;
    }
}

async function searchUsSymbol(query) {
    const apiKey = process.env.TWELVEDATA_API_KEY;
    if (!apiKey) return null;

    try {
        const res = await axios.get(`${TWELVE_BASE}/symbol_search`, {
            params: { symbol: query, outputsize: 8 },
            timeout: 8000,
        });
        const rows = res.data?.data || [];
        const us = rows.find(
            (r) =>
                /nasdaq|nyse|amex|arcx|bats/i.test(r.exchange || '') ||
                r.country === 'United States'
        );
        if (!us?.symbol) return null;
        return verifyUsTicker(us.symbol);
    } catch {
        return null;
    }
}

async function resolveWatchlistStock(input) {
    const q = input.trim();
    if (!q) return { ok: false, reason: 'empty' };

    if (/^\d{6}$/.test(q)) {
        const result = searchStock(q);
        if (result.type === 'exact') return { ok: true, item: toKrItem(result.stock) };
        return { ok: false, reason: 'not_found' };
    }

    if (/^[A-Za-z]{1,5}(\.[A-Za-z])?$/.test(q) && !/[가-힣]/.test(q)) {
        const item = await verifyUsTicker(q.toUpperCase());
        return item ? { ok: true, item } : { ok: false, reason: 'not_found' };
    }

    if (/[가-힣]/.test(q)) {
        const result = searchStock(q);
        if (result.type === 'exact') return { ok: true, item: toKrItem(result.stock) };
        if (result.type === 'multiple') return { ok: false, reason: 'ambiguous', stocks: result.stocks };
        return { ok: false, reason: 'not_found' };
    }

    const direct = await verifyUsTicker(q.toUpperCase());
    if (direct) return { ok: true, item: direct };

    const searched = await searchUsSymbol(q);
    return searched ? { ok: true, item: searched } : { ok: false, reason: 'not_found' };
}

module.exports = { resolveWatchlistStock, toKrItem, fetchYahooMeta };
