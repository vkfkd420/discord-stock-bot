const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { fetchNews } = require('./utils/fetchNews');
const { fetchStock } = require('./utils/fetchStock');

// 주요 지수 목록
const INDICES = [
    { label: 'S&P 500', ticker: '^GSPC' },
    { label: '나스닥', ticker: '^IXIC' },
    { label: '코스피', ticker: '^KS11' },
    { label: '달러/원', ticker: 'KRW=X' },
];

async function sendDailyBriefing(client) {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID).catch(() => null);
    if (!channel) {
        console.error('브리핑 채널을 찾을 수 없습니다. CHANNEL_ID를 확인하세요.');
        return;
    }

    // 뉴스 + 주가 병렬 조회
    const [newsItems, ...stockResults] = await Promise.all([
        fetchNews(4),
        ...INDICES.map((i) => fetchStock(i.ticker).then((s) => ({ ...i, data: s }))),
    ]);

    // 주가 임베드
    const stockEmbed = new EmbedBuilder()
        .setTitle('📊 주요 지수 현황')
        .setColor(0xfee75c)
        .setTimestamp();

    for (const { label, data } of stockResults) {
        if (data) {
            stockEmbed.addFields({
                name: label,
                value: `${data.emoji} ${data.price}  ${data.change}`,
                inline: true,
            });
        }
    }

    // 뉴스 임베드
    const newsEmbed = new EmbedBuilder()
        .setTitle('📰 오늘의 주요 뉴스')
        .setColor(0x5865f2)
        .setFooter({ text: '매일 오전 8:30 자동 브리핑' });

    for (const item of newsItems) {
        const sectorTags = item.sectors.map((s) => `\`${s}\``).join(' ');
        newsEmbed.addFields({
            name: `${item.impact} ${item.title.slice(0, 70)}`,
            value: `${sectorTags}\n🔗 [기사 보기](${item.link})`,
        });
    }

    await channel.send({
        content: '📢 **오전 투자 브리핑**이 도착했습니다!',
        embeds: [stockEmbed, newsEmbed],
    });

    console.log(`[${new Date().toLocaleString('ko-KR')}] 브리핑 전송 완료`);
}

function registerScheduler(client) {
    // 매일 오전 8:30 (한국시간 기준 = UTC 23:30 전날)
    // 서버가 한국 시간이라면 '30 8 * * *'
    // 서버가 UTC라면 '30 23 * * *'
    cron.schedule('30 8 * * *', () => sendDailyBriefing(client), {
        timezone: 'Asia/Seoul',
    });

    console.log('⏰ 스케줄러 등록 완료 (매일 08:30 Asia/Seoul)');
}

module.exports = { registerScheduler, sendDailyBriefing };