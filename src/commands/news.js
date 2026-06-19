const { SlashCommandBuilder, ComponentType } = require('discord.js');
const { fetchNews } = require('../utils/fetchNews');
const {
    NEWS_PAGE_SIZE,
    NEWS_COLLECTOR_MS,
    REGION_LABELS,
    buildNewsPayload,
    buildNewsControls,
    disableNewsControls,
} = require('../ui/newsView');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('뉴스')
        .setDescription('최신 주식/경제 뉴스를 가져옵니다')
        .addStringOption((opt) =>
            opt
                .setName('지역')
                .setDescription('뉴스 지역 필터')
                .addChoices(
                    { name: '🌐 전체', value: 'all' },
                    { name: '🇰🇷 한국', value: 'kr' },
                    { name: '🇺🇸 미국', value: 'us' }
                )
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();
        } catch (err) {
            console.error('[뉴스] defer 실패:', err.message);
            return;
        }

        const region = interaction.options.getString('지역') || 'all';
        const regionLabel = REGION_LABELS[region];

        try {
            const news = await fetchNews({ limit: NEWS_PAGE_SIZE, region });

            if (!news.length) {
                await interaction.editReply({
                    content: `❌ ${regionLabel} 뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`,
                    embeds: [],
                    components: [],
                });
                return;
            }

            let page = 0;

            await interaction.editReply(buildNewsPayload(news, page, regionLabel));
            const message = await interaction.fetchReply();

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: NEWS_COLLECTOR_MS,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    return buttonInteraction.reply({
                        content: '본인이 요청한 뉴스만 넘길 수 있습니다.',
                        ephemeral: true,
                    });
                }

                if (buttonInteraction.customId === 'news_prev') {
                    page = Math.max(0, page - 1);
                } else if (buttonInteraction.customId === 'news_next') {
                    page = Math.min(news.length - 1, page + 1);
                }

                await buttonInteraction.update(buildNewsPayload(news, page, regionLabel));
            });

            collector.on('end', () => {
                message
                    .edit({ components: disableNewsControls(buildNewsControls(news, page)) })
                    .catch(() => {});
            });
        } catch (err) {
            console.error('[뉴스] 처리 실패:', err.message);
            await interaction
                .editReply({
                    content: '❌ 뉴스를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
                    embeds: [],
                    components: [],
                })
                .catch(() => {});
        }
    },
};
