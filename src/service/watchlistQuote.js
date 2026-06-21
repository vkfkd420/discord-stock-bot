const { getQuote } = require('./stockSearch');
const { fetchYahooMeta } = require('./watchlistResolver');

async function getKrQuote(item) {
    const quote = await getQuote({
        code: item.code,
        name: item.name,
        suffix: item.suffix,
        market: item.market,
    });
    if (!quote) return null;

    return {
        name: quote.name,
        price: quote.price,
        changePct: quote.changePct,
        change: quote.change,
        isUp: quote.isUp,
    };
}

async function getUsQuote(item) {
    try {
        const meta = await fetchYahooMeta(item.ticker);
        if (!meta) return null;

        const price = Number(meta.regularMarketPrice);
        const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
        const changeVal = price - prev;
        const changePct = prev ? (changeVal / prev) * 100 : 0;
        const isUp = changeVal >= 0;

        return {
            name: meta.shortName || meta.longName || item.name,
            price: `$${price.toFixed(2)}`,
            changePct: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
            change: `${isUp ? '▲' : '▼'} $${Math.abs(changeVal).toFixed(2)}`,
            isUp,
        };
    } catch (e) {
        console.error(`[관심종목] US 시세 실패 [${item.ticker}]:`, e.message);
        return null;
    }
}

async function getWatchlistQuote(item) {
    return item.kind === 'kr' ? getKrQuote(item) : getUsQuote(item);
}

module.exports = { getWatchlistQuote };
