require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } = require('discord.js');
const cron = require('node-cron');
const newsCommand = require('./commands/news');
const stockCommand = require('./commands/stock');
const briefingCommand = require('./commands/briefing');
const { sendQuoteEmbed } = require('./commands/stock');
const { loadCache, updateStockCache, searchStock } = require('./service/stockSearch');
const { registerScheduler } = require('./scheduler');
const { warmNewsCache } = require('./utils/fetchNews');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
client.commands.set(newsCommand.data.name, newsCommand);
client.commands.set(stockCommand.data.name, stockCommand);
client.commands.set(briefingCommand.data.name, briefingCommand);

client.once('ready', async () => {
    console.log(`✅ 봇 로그인 성공: ${client.user.tag}`);

    // KRX 종목 캐시 로드
    await loadCache();

    // 슬래시 커맨드 등록
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: [newsCommand.data.toJSON(), stockCommand.data.toJSON(), briefingCommand.data.toJSON()] }
        );
        console.log('✅ 슬래시 커맨드 등록 완료');
    } catch (err) {
        console.error('❌ 커맨드 등록 실패:', err);
    }

    // 매일 오전 8시 종목 캐시 갱신
    cron.schedule('0 8 * * *', () => updateStockCache(), { timezone: 'Asia/Seoul' });

    // 투자 브리핑 스케줄러
    registerScheduler(client);

    // RSS 캐시 미리 로드 (첫 /뉴스·/브리핑 응답 지연 방지)
    warmNewsCache();
});

client.on('interactionCreate', async (interaction) => {
    // 슬래시 커맨드
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(`커맨드 오류 [${interaction.commandName}]:`, err.message);
            const msg = { content: '❌ 오류가 발생했습니다.', embeds: [], components: [] };
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(msg);
                } else {
                    await interaction.reply({ ...msg, flags: MessageFlags.Ephemeral });
                }
            } catch {
                // Unknown interaction / already acknowledged — 무시
            }
        }
        return;
    }

    // 종목 선택 메뉴
    if (interaction.isStringSelectMenu() && interaction.customId === 'stock_select') {
        await interaction.deferUpdate();
        const stock = JSON.parse(interaction.values[0]);
        await sendQuoteEmbed(interaction, stock);
    }
});

client.login(process.env.DISCORD_TOKEN);