const cron = require('node-cron');
const { generateInvestmentBriefing } = require('./service/briefingGenerator');
const { sendBriefingToChannel } = require('./service/briefingDelivery');

const BRIEFING_SCHEDULE = [
    { cron: '30 8 * * *', label: '08:30', greeting: '☀️ **오전 브리핑**' },
    { cron: '0 11 * * *', label: '11:00', greeting: '🕚 **11시 브리핑**' },
    { cron: '30 15 * * *', label: '15:30', greeting: '🔔 **장 마감 브리핑**' },
];

async function sendDailyBriefing(client, { label, greeting }) {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID).catch(() => null);
    if (!channel) {
        console.error('브리핑 채널을 찾을 수 없습니다. CHANNEL_ID를 확인하세요.');
        return;
    }

    try {
        const briefing = await generateInvestmentBriefing(label);
        await channel.send({ content: greeting });
        await sendBriefingToChannel(channel, briefing);
        console.log(`[${new Date().toLocaleString('ko-KR')}] 브리핑 전송 완료 (${label})`);
    } catch (e) {
        console.error(`브리핑 전송 실패 (${label}):`, e.message);
    }
}

function registerScheduler(client) {
    const opts = { timezone: 'Asia/Seoul' };

    for (const { cron: expr, label, greeting } of BRIEFING_SCHEDULE) {
        cron.schedule(expr, () => sendDailyBriefing(client, { label, greeting }), opts);
    }

    const times = BRIEFING_SCHEDULE.map((s) => s.label).join(', ');
    console.log(`⏰ 스케줄러 등록 완료 (매일 ${times} Asia/Seoul)`);
}

module.exports = { registerScheduler, sendDailyBriefing };
