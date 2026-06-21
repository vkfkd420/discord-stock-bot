const {
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
} = require('discord.js');
const { resolveWatchlistStock, toKrItem } = require('../service/watchlistResolver');
const { addToWatchlist, removeFromWatchlist, getUserWatchlist, MAX_ITEMS } = require('../service/watchlistStore');
const { getWatchlistQuote } = require('../service/watchlistQuote');
const { generateDailyPoints } = require('../service/watchlistPoint');
const {
    buildWatchlistPayload,
    buildRegisterSuccess,
    buildRemoveSuccess,
} = require('../ui/watchlistView');

async function handleRegister(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const input = interaction.options.getString('종목');
    const resolved = await resolveWatchlistStock(input);

    if (resolved.reason === 'ambiguous') {
        const select = new StringSelectMenuBuilder()
            .setCustomId('watchlist_register_select')
            .setPlaceholder('종목을 선택해 주세요')
            .addOptions(
                resolved.stocks.map((s) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${s.name} (${s.code})`)
                        .setDescription(s.market)
                        .setValue(JSON.stringify(toKrItem(s)))
                )
            );

        await interaction.editReply({
            content: `**"${input}"** 검색 결과입니다. 등록할 종목을 선택해 주세요:`,
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

    const result = addToWatchlist(interaction.user.id, resolved.item);
    if (result.reason === 'duplicate') {
        const label =
            result.item.kind === 'kr'
                ? `${result.item.name} (${result.item.code})`
                : `${result.item.name} (${result.item.ticker})`;
        await interaction.editReply(`ℹ️ **${label}**은(는) 이미 관심종목에 등록되어 있습니다.`);
        return;
    }
    if (result.reason === 'limit') {
        await interaction.editReply(`❌ 관심종목은 최대 ${MAX_ITEMS}개까지 등록할 수 있습니다.`);
        return;
    }

    await interaction.editReply(buildRegisterSuccess(result.item, result.count));
}

async function handleList(interaction) {
    await interaction.deferReply();

    const list = getUserWatchlist(interaction.user.id);
    if (!list.length) {
        await interaction.editReply(buildWatchlistPayload([], 0));
        return;
    }

    const [quotes, points] = await Promise.all([
        Promise.all(list.map((item) => getWatchlistQuote(item))),
        generateDailyPoints(list),
    ]);

    const rows = list.map((item, i) => {
        const quote = quotes[i];
        if (!quote) {
            return { name: item.name, error: '시세를 불러오지 못했습니다.' };
        }
        return {
            name: quote.name || item.name,
            price: quote.price,
            change: quote.change,
            changePct: quote.changePct,
            isUp: quote.isUp,
            point: points[item.name] || points[quote.name] || '특이 이슈 없음',
        };
    });

    await interaction.editReply(buildWatchlistPayload(rows, list.length));
}

async function handleRemove(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const input = interaction.options.getString('종목');
    const resolved = await resolveWatchlistStock(input);

    if (resolved.reason === 'ambiguous') {
        const select = new StringSelectMenuBuilder()
            .setCustomId('watchlist_remove_select')
            .setPlaceholder('삭제할 종목을 선택해 주세요')
            .addOptions(
                resolved.stocks.map((s) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${s.name} (${s.code})`)
                        .setDescription(s.market)
                        .setValue(JSON.stringify(toKrItem(s)))
                )
            );

        await interaction.editReply({
            content: `**"${input}"** 검색 결과입니다. 삭제할 종목을 선택해 주세요:`,
            components: [new ActionRowBuilder().addComponents(select)],
        });
        return;
    }

    if (!resolved.ok) {
        await interaction.editReply(
            `❌ **${input}** 종목을 찾을 수 없습니다.\n관심목록에 등록된 종목명·코드·티커로 입력해 보세요.`
        );
        return;
    }

    const result = removeFromWatchlist(interaction.user.id, resolved.item);
    if (!result.ok) {
        const label =
            resolved.item.kind === 'kr'
                ? `${resolved.item.name} (${resolved.item.code})`
                : `${resolved.item.name} (${resolved.item.ticker})`;
        await interaction.editReply(`❌ **${label}**은(는) 관심목록에 없습니다.`);
        return;
    }

    await interaction.editReply(buildRemoveSuccess(resolved.item, result.count));
}

async function handleRegisterSelect(interaction) {
    await interaction.deferUpdate();
    const item = JSON.parse(interaction.values[0]);
    const result = addToWatchlist(interaction.user.id, item);

    if (result.reason === 'duplicate') {
        await interaction.editReply({
            content: `ℹ️ **${item.name}**은(는) 이미 관심종목에 등록되어 있습니다.`,
            components: [],
        });
        return;
    }
    if (result.reason === 'limit') {
        await interaction.editReply({
            content: `❌ 관심종목은 최대 ${MAX_ITEMS}개까지 등록할 수 있습니다.`,
            components: [],
        });
        return;
    }

    await interaction.editReply({
        content: buildRegisterSuccess(result.item, result.count),
        components: [],
    });
}

async function handleRemoveSelect(interaction) {
    await interaction.deferUpdate();
    const item = JSON.parse(interaction.values[0]);
    const result = removeFromWatchlist(interaction.user.id, item);

    if (!result.ok) {
        await interaction.editReply({
            content: `❌ **${item.name}**은(는) 관심목록에 없습니다.`,
            components: [],
        });
        return;
    }

    await interaction.editReply({
        content: buildRemoveSuccess(item, result.count),
        components: [],
    });
}

const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('관심등록')
            .setDescription('관심종목을 등록합니다 (한국·미국 주식, 최대 20개)')
            .addStringOption((opt) =>
                opt
                    .setName('종목')
                    .setDescription('종목명·종목코드·티커 (예: 삼성전자, NVDA)')
                    .setRequired(true)
            ),
        execute: handleRegister,
    },
    {
        data: new SlashCommandBuilder()
            .setName('관심목록')
            .setDescription('등록한 관심종목 시세와 오늘의 포인트를 확인합니다'),
        execute: handleList,
    },
    {
        data: new SlashCommandBuilder()
            .setName('관심삭제')
            .setDescription('관심종목에서 종목을 삭제합니다')
            .addStringOption((opt) =>
                opt
                    .setName('종목')
                    .setDescription('종목명·종목코드·티커')
                    .setRequired(true)
            ),
        execute: handleRemove,
    },
];

commands.handleRegisterSelect = handleRegisterSelect;
commands.handleRemoveSelect = handleRemoveSelect;

module.exports = commands;
