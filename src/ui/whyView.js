const { EmbedBuilder } = require('discord.js');
const { COLORS, truncate } = require('../utils/discordUi');

const SENTIMENT_ICON = {
    positive: '🟢',
    negative: '🔴',
    neutral: '🟡',
};

const IMPACT_LABEL = {
    positive: '🟢 긍정',
    negative: '🔴 부정',
    neutral: '🟡 중립',
};

function toStars(n) {
    const filled = Math.max(1, Math.min(5, Number(n) || 3));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function buildCausesBlock(causes) {
    if (!causes.length) {
        return '명확한 원인은 확인되지 않음';
    }

    return causes
        .map((c, i) => {
            const icon = SENTIMENT_ICON[c.sentiment] || '🟡';
            return `${i + 1}. ${icon} **${c.title}**\n${c.description}`;
        })
        .join('\n\n');
}

function buildNewsBlock(summaries) {
    if (!summaries.length) return '- 관련 뉴스 없음';
    return summaries.map((s) => `- ${s}`).join('\n');
}

function buildWhyPayload({ quote, question, analysis, windowHours = 24 }) {
    const color = quote.isUp ? COLORS.up : COLORS.down;
    const header = `🔎 **${quote.name}**, ${question}`;

    const body = [
        `**현재가:** ${quote.price}`,
        `**등락률:** ${quote.changePct} (${quote.change})`,
        `**거래량:** ${quote.volume}`,
        '',
        `**한줄 결론:**\n${analysis.oneLiner}`,
        '',
        '**주요 원인**',
        buildCausesBlock(analysis.causes),
        '',
        '**관련 뉴스 요약:**',
        buildNewsBlock(analysis.newsSummaries),
        '',
        `**시장 영향:** ${IMPACT_LABEL[analysis.marketImpact] || IMPACT_LABEL.neutral}`,
        `**지속 가능성:** ${toStars(analysis.sustainability)}`,
        '',
        `**주의할 점:**\n${analysis.caution}`,
    ].join('\n');

    const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(truncate(body, 4000))
        .setFooter({ text: `${quote.market} · AI 분석 · 최근 ${windowHours}시간` });

    return {
        content: header,
        embeds: [embed],
    };
}

module.exports = { buildWhyPayload };
