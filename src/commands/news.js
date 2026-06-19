const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchNews } = require('../utils/fetchNews');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('뉴스')
        .setDescription('최신 주식/경제 뉴스를 가져옵니다'),

    async execute(interaction) {
        await interaction.deferReply(); // 로딩 표시 (API 호출이 느릴 수 있음)

        const news = await fetchNews(5);

        if (!news.length) {
            return interaction.editReply('❌ 뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }

        const embed = new EmbedBuilder()
            .setTitle('📰 주식/경제 최신 뉴스')
            .setColor(0x5865f2)
            .setTimestamp()
            .setFooter({ text: 'Yahoo Finance RSS' });

        for (const item of news) {
            const sectorTags = item.sectors.map((s) => `\`${s}\``).join(' ');
            embed.addFields({
                name: `${item.impact} | ${item.title.slice(0, 80)}`,
                value: [
                    item.summary ? `> ${item.summary.slice(0, 100)}...` : '',
                    `📌 섹터: ${sectorTags}`,
                    `🔗 [기사 보기](${item.link})`,
                    item.pubDate ? `🕐 ${item.pubDate}` : '',
                ]
                    .filter(Boolean)
                    .join('\n'),
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};