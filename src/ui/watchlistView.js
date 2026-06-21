const { EmbedBuilder } = require('discord.js');
const { COLORS, truncate } = require('../utils/discordUi');
const { MAX_ITEMS } = require('../service/watchlistStore');

function buildWatchlistPayload(rows, totalCount) {
    if (!rows.length) {
        return {
            content: '⭐ **관심종목**',
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.neutral)
                    .setDescription('등록된 관심종목이 없습니다.\n`/관심등록 종목명`으로 추가해 보세요.'),
            ],
        };
    }

    const blocks = rows.map((row) => {
        if (row.error) {
            return `**${row.name}**\n❌ ${row.error}`;
        }
        const arrow = row.isUp ? '📈' : '📉';
        return [
            `**${row.name}**`,
            `오늘의 포인트: ${row.point}`,
            `${row.price} · ${row.change} (${row.changePct}) ${arrow}`,
        ].join('\n');
    });

    const embed = new EmbedBuilder()
        .setColor(COLORS.quote)
        .setDescription(truncate(blocks.join('\n\n'), 4000))
        .setFooter({ text: `${totalCount}/${MAX_ITEMS}종목 · Naver/Yahoo · AI 요약` });

    return {
        content: `⭐ **관심종목** · ${totalCount}개`,
        embeds: [embed],
    };
}

function buildRegisterSuccess(item, count) {
    const label = item.kind === 'kr' ? `${item.name} (${item.code})` : `${item.name} (${item.ticker})`;
    return `✅ **${label}** 관심종목에 등록했습니다. (${count}/${MAX_ITEMS})`;
}

function buildRemoveSuccess(item, count) {
    const label = item.kind === 'kr' ? item.name : `${item.name} (${item.ticker})`;
    return `🗑️ **${label}** 관심종목에서 삭제했습니다. (${count}/${MAX_ITEMS})`;
}

module.exports = {
    buildWatchlistPayload,
    buildRegisterSuccess,
    buildRemoveSuccess,
};
