const { SlashCommandBuilder } = require('discord.js');
const { generateInvestmentBriefing } = require('../service/briefingGenerator');
const { replyBriefing } = require('../service/briefingDelivery');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('브리핑')
        .setDescription('AI 투자 브리핑을 지금 바로 생성합니다 (1~2분 소요)'),

    async execute(interaction) {
        try {
            await interaction.deferReply();
        } catch (err) {
            console.error('[브리핑] defer 실패:', err.message);
            return;
        }

        try {
            await interaction.editReply('⏳ **브리핑 생성 중...** 뉴스 수집 → AI 분석 (약 1~2분)');

            const briefing = await generateInvestmentBriefing('수동');
            await replyBriefing(interaction, briefing);
        } catch (err) {
            console.error('브리핑 조회 실패:', err.message);
            await interaction
                .editReply({
                    content: `❌ 브리핑 생성 실패: ${err.message.slice(0, 500)}`,
                    embeds: [],
                    components: [],
                })
                .catch(() => {});
        }
    },
};
