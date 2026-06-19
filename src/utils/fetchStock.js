const axios = require('axios');

const API_KEY = process.env.TWELVEDATA_API_KEY;
const BASE_URL = 'https://api.twelvedata.com';

// KRX 종목 목록 캐시 (앱 시작시 1회 로드)
let krxStockMap = {}; // { '삼성전자': '005930', ... }

// KRX에서 전체 종목 목록 로드
async function loadKRXStocks() {
    const markets = [
        { id: 'STK', name: 'KOSPI' },
        { id: 'KSQ', name: 'KOSDAQ' },
    ];

    for (const market of markets) {
        try {
            console.log(`KRX ${market.name} 요청 중...`);

            const res = await axios.post(
                'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
                new URLSearchParams({
                    bld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
                    locale: 'ko_KR',
                    mktId: market.id,
                    share: '1',
                    money: '1',
                    csvxls_isNo: 'false',
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        Referer: 'http://data.krx.co.kr',
                        'User-Agent': 'Mozilla/5.0',
                    },
                    timeout: 10000,
                }
            );

            console.log('KRX 응답 키:', Object.keys(res.data));
            console.log('KRX 응답 샘플:', JSON.stringify(res.data).slice(0, 500));

            const stocks = res.data?.OutBlock_1 ?? [];
            console.log(`파싱된 종목 수: ${stocks.length}`);

            if (stocks.length > 0) {
                console.log('첫 번째 종목 구조:', JSON.stringify(stocks[0]));
            }

            for (const s of stocks) {
                const name = s.ISU_ABBRV?.trim();
                const code = s.ISU_SRT_CD?.trim();
                if (name && code) krxStockMap[name] = code;
            }

            console.log(`✅ KRX ${market.name} 종목 ${stocks.length}개 로드 완료`);
        } catch (e) {
            console.error(`KRX ${market.name} 로드 실패:`, e.message);
        }
    }
}

// 한글 종목명 → 종목코드 검색
function searchKRXTicker(query) {
    // 완전 일치
    if (krxStockMap[query]) return krxStockMap[query];

    // 부분 일치 (앞에서부터)
    const match = Object.keys(krxStockMap).find((name) => name.includes(query));
    return match ? krxStockMap[match] : null;
}

async function resolveTicker(input) {
    // 숫자 6자리 → 한국 종목코드
    if (/^\d{6}$/.test(input)) return input;

    // 이미 티커 형식 (NVDA, AAPL 등)
    if (/^[A-Z\^]{1,6}(\.(KS|KQ))?$/i.test(input)) return input.toUpperCase();

    // 한글 → KRX 캐시에서 검색
    if (/[ㄱ-ㅎ가-힣]/.test(input)) {
        const code = searchKRXTicker(input);
        if (code) return code;
        console.log(`KRX에서 "${input}" 찾지 못함`);
        return null;
    }

    // 영문 종목명 → Twelve Data 검색
    try {
        const res = await axios.get(`${BASE_URL}/symbol_search`, {
            params: { symbol: input, outputsize: 5 },
            timeout: 5000,
        });
        const data = res.data?.data;
        if (!data || data.length === 0) return null;
        const krStock = data.find((d) => d.exchange === 'KRX' || d.exchange === 'KOSDAQ');
        return (krStock ?? data[0]).symbol;
    } catch (e) {
        console.error('영문 종목 검색 실패:', e.message);
        return null;
    }
}

async function fetchStock(input) {
    const ticker = await resolveTicker(input);
    if (!ticker) return null;

    // 6자리 코드면 KRX 명시
    const symbol = /^\d{6}$/.test(ticker) ? `${ticker}:KRX` : ticker;

    try {
        const res = await axios.get(`${BASE_URL}/quote`, {
            params: { symbol, apikey: API_KEY },
            timeout: 5000,
        });

        const d = res.data;
        if (d.status === 'error' || !d.close) {
            console.error('Twelve Data 오류:', d.message);
            return null;
        }

        const price = Number(d.close) || 0;
        const change = Number(d.change) || 0;
        const changePct = Number(d.percent_change) || 0;
        const isKR = d.currency === 'KRW';

        const priceStr = isKR
            ? price.toLocaleString('ko-KR') + '원'
            : '$' + price.toFixed(2);

        const changeStr =
            (change >= 0 ? '▲' : '▼') +
            (isKR
                ? Math.abs(change).toLocaleString('ko-KR') + '원'
                : Math.abs(change).toFixed(2)) +
            ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;

        const emoji =
            changePct >= 1 ? '🚀' : changePct >= 0 ? '📈' : changePct >= -1 ? '📉' : '💥';

        return {
            ticker: d.symbol,
            name: d.name || ticker,
            price: priceStr,
            change: changeStr,
            emoji,
            high: isKR
                ? Number(d.high).toLocaleString('ko-KR') + '원'
                : '$' + Number(d.high).toFixed(2),
            low: isKR
                ? Number(d.low).toLocaleString('ko-KR') + '원'
                : '$' + Number(d.low).toFixed(2),
            volume: Number(d.volume).toLocaleString(),
        };
    } catch (e) {
        console.error(`주가 조회 실패 [${ticker}]:`, e.message);
        return null;
    }
}

module.exports = { fetchStock, loadKRXStocks };