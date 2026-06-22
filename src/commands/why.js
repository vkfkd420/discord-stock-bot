const {
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
} = require('discord.js');
const { resolveWatchlistStock, toKrItem } = require('../service/watchlistResolver');
const { analyzeWhy } = require('../service/whyAnalyzer');
const { buildWhyPayload } = require('../ui/whyView');

async function runWhyAnalysis(interaction, item) {
    const result = await analyzeWhy(item);
    await interaction.editReply({ ...buildWhyPayload(result), components: [] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('왜')
        .setDescription('종목이 오늘 왜 올랐는지/내렸는지 원인을 분석합니다')
        .addStringOption((opt) =>
            opt
                .setName('종목')
                .setDescription('종목명·종목코드·티커 (예: 삼성전자, NVDA)')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();
        } catch (err) {
            console.error('[왜] defer 실패:', err.message);
            return;
        }

        const input = interaction.options.getString('종목');

        try {
            const resolved = await resolveWatchlistStock(input);

            if (resolved.reason === 'ambiguous') {
                const select = new StringSelectMenuBuilder()
                    .setCustomId('why_select')
                    .setPlaceholder('분석할 종목을 선택해 주세요')
                    .addOptions(
                        resolved.stocks.map((s) =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`${s.name} (${s.code})`)
                                .setDescription(s.market)
                                .setValue(JSON.stringify(toKrItem(s)))
                        )
                    );

                await interaction.editReply({
                    content: `**"${input}"** 검색 결과입니다. 분석할 종목을 선택해 주세요:`,
                    components: [new ActionRowBuilder().addComponents(select)],
                });
                return;
            }

            if (!resolved.ok) {
                await interaction.editReply(
                    `❌ **${input}** 종목을 찾을 수 없습니다.\n종목명·종목코드·티커(예: NVDA)로 입력해 보세요.`
                );
                return;
            }

            await runWhyAnalysis(interaction, resolved.item);
        } catch (err) {
            console.error('[왜] 처리 실패:', err.message);
            await interaction
                .editReply({
                    content: '❌ 종목 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
                    embeds: [],
                    components: [],
                })
                .catch(() => {});
        }
    },

    async handleWhySelect(interaction) {
        await interaction.deferUpdate();
        const item = JSON.parse(interaction.values[0]);

        try {
            await runWhyAnalysis(interaction, item);
        } catch (err) {
            console.error('[왜] 선택 분석 실패:', err.message);
            await interaction.editReply({
                content: '❌ 종목 분석 중 오류가 발생했습니다.',
                embeds: [],
                components: [],
            });
        }
    },
};
