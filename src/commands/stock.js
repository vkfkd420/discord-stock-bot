const {
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
} = require('discord.js');
const { searchStock, getQuote } = require('../service/stockSearch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('주가')
        .setDescription('한국 주식 현재가를 조회합니다')
        .addStringOption((opt) =>
            opt
                .setName('종목')
                .setDescription('종목명 또는 종목코드 (예: 삼성전자, 005930)')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const input = interaction.options.getString('종목');
        const result = searchStock(input);

        // 검색 결과 없음
        if (result.type === 'none') {
            return interaction.editReply(
                `❌ **${input}** 종목을 찾을 수 없습니다.\n종목명 또는 6자리 종목코드로 검색해 보세요.`
            );
        }

        // 정확히 1개 일치 → 바로 조회
        if (result.type === 'exact') {
            return sendQuoteEmbed(interaction, result.stock);
        }

        // 여러 개 일치 → 선택 메뉴 표시
        const select = new StringSelectMenuBuilder()
            .setCustomId('stock_select')
            .setPlaceholder('종목을 선택해 주세요')
            .addOptions(
                result.stocks.map((s) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${s.name} (${s.code})`)
                        .setDescription(s.market)
                        .setValue(JSON.stringify({ code: s.code, name: s.name, market: s.market, suffix: s.suffix }))
                )
            );

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.editReply({
            content: `**"${input}"** 검색 결과입니다. 종목을 선택해 주세요:`,
            components: [row],
        });
    },
};

// Embed 전송 (export해서 index.js에서도 사용)
async function sendQuoteEmbed(interaction, stock) {
    const quote = await getQuote(stock);

    if (!quote) {
        return interaction.editReply(`❌ **${stock.name}** 시세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`);
    }

    const embed = new EmbedBuilder()
        .setTitle(`${quote.isUp ? '📈' : '📉'} ${quote.name} (${quote.ticker})`)
        .setColor(quote.isUp ? 0x2ecc71 : 0xe74c3c)
        .addFields(
            { name: '현재가', value: quote.price, inline: true },
            { name: '전일 대비', value: `${quote.change} (${quote.changePct})`, inline: true },
            { name: '전일 종가', value: quote.prevClose, inline: true },
            { name: '거래량', value: quote.volume, inline: true },
            { name: '시장', value: quote.market, inline: true }
        )
        .setFooter({ text: 'Naver Finance · 실시간 시세' })
        .setTimestamp();

    await interaction.editReply({ content: '', components: [], embeds: [embed] });
}

module.exports.sendQuoteEmbed = sendQuoteEmbed;