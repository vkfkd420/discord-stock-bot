const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../data/krxStocks.json');
const KIND_URL = 'http://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13';
const NAVER_STOCK_API = 'https://m.stock.naver.com/api/stock';
let stockCache = [];

function marketFromKind(value) {
    if (value.includes('코스닥')) return { market: 'KOSDAQ', suffix: '.KQ' };
    return { market: 'KOSPI', suffix: '.KS' };
}

// KIND 증권시장 상장법인 목록 (로그인 불필요)
async function fetchFromKIND() {
    const res = await axios.get(KIND_URL, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });

    const html = new TextDecoder('euc-kr').decode(res.data);
    const $ = cheerio.load(html);

    const stocks = [];
    $('table tr').each((_, tr) => {
        const cols = $(tr)
            .find('td')
            .map((__, td) => $(td).text().trim())
            .get();

        const name = cols[0];
        const code = cols[2];
        if (!name || !/^\d{6}$/.test(code)) return;

        const { market, suffix } = marketFromKind(cols[1] || '');
        stocks.push({ name, code, market, suffix });
    });

    return stocks;
}

async function updateStockCache() {
    console.log('📥 KRX 종목 리스트 업데이트 중... (KIND)');

    try {
        const stocks = await fetchFromKIND();
        if (stocks.length === 0) throw new Error('종목 데이터가 비어 있습니다');

        const dir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(
            CACHE_FILE,
            JSON.stringify({ updated: new Date().toISOString(), stocks }, null, 2)
        );

        stockCache = stocks;
        console.log(`✅ 종목 캐시 업데이트 완료: ${stocks.length}개`);
    } catch (e) {
        console.error('❌ 종목 캐시 업데이트 실패:', e.message);
        if (stockCache.length > 0) {
            console.log(`⚠️ 기존 메모리 캐시 ${stockCache.length}개 유지`);
        }
    }
}

async function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            const hoursDiff = (Date.now() - new Date(data.updated)) / 3600000;

            if (hoursDiff < 24 && data.stocks?.length > 0) {
                stockCache = data.stocks;
                console.log(`✅ 종목 캐시 로드: ${stockCache.length}개`);
                return;
            }
        }
    } catch (e) {
        console.error('캐시 파일 로드 실패:', e.message);
    }

    await updateStockCache();

    if (stockCache.length === 0) {
        console.warn('⚠️ 종목 캐시가 비어 있습니다. /주가 검색이 동작하지 않을 수 있습니다.');
    }
}

function searchStock(query) {
    const q = query.trim();

    if (stockCache.length === 0) {
        return { type: 'none' };
    }

    if (/^\d{6}$/.test(q)) {
        const found = stockCache.find((s) => s.code === q);
        return found ? { type: 'exact', stock: found } : { type: 'none' };
    }

    const exact = stockCache.filter((s) => s.name === q);
    if (exact.length === 1) return { type: 'exact', stock: exact[0] };
    if (exact.length > 1) return { type: 'multiple', stocks: exact.slice(0, 5) };

    const partial = stockCache.filter((s) => s.name.includes(q));
    if (partial.length === 0) return { type: 'none' };
    if (partial.length === 1) return { type: 'exact', stock: partial[0] };
    return { type: 'multiple', stocks: partial.slice(0, 5) };
}

function parsePrice(value) {
    return Number(String(value).replace(/,/g, '')) || 0;
}

async function getQuote(stock) {
    try {
        const res = await axios.get(`${NAVER_STOCK_API}/${stock.code}/basic`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000,
        });

        const d = res.data;
        if (!d?.closePrice) return null;

        const price = parsePrice(d.closePrice);
        const change = parsePrice(d.compareToPreviousClosePrice);
        const changePct = parseFloat(d.fluctuationsRatio) || 0;
        const isUp = d.compareToPreviousPrice?.name === 'RISING' || d.compareToPreviousPrice?.name === 'UPPER_LIMIT';
        const signedChange = isUp ? Math.abs(change) : -Math.abs(change);
        const prevClose = price - signedChange;

        return {
            name: d.stockName || stock.name,
            ticker: `${stock.code}${stock.suffix}`,
            market: d.stockExchangeName || stock.market,
            price: price.toLocaleString('ko-KR') + '원',
            change: (isUp ? '▲ ' : '▼ ') + Math.abs(change).toLocaleString('ko-KR') + '원',
            changePct: (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%',
            prevClose: prevClose.toLocaleString('ko-KR') + '원',
            volume: '-',
            isUp,
        };
    } catch (e) {
        console.error(`네이버 시세 조회 실패 [${stock.code}]:`, e.message);
        return null;
    }
}

module.exports = { loadCache, updateStockCache, searchStock, getQuote };
