const { SlashCommandBuilder, ComponentType } = require('discord.js');
const { fetchCalendarEvents } = require('../utils/fetchCalendar');
const {
    CALENDAR_COLLECTOR_MS,
    buildCalendarPayload,
    buildCalendarControls,
    disableCalendarControls,
    filterEvents,
    buildEventPages,
} = require('../ui/calendarView');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('일정')
        .setDescription('오늘부터 7일간 주요 경제·실적 일정을 확인합니다'),

    async execute(interaction) {
        try {
            await interaction.deferReply();
        } catch (err) {
            console.error('[일정] defer 실패:', err.message);
            return;
        }

        try {
            const events = await fetchCalendarEvents();

            if (!events.length) {
                await interaction.editReply({
                    content:
                        '❌ 표시할 경제일정이 없습니다. 잠시 후 다시 시도해 주세요.\n(CPI·FOMC·실적 등 데이터 소스 일시 제한일 수 있습니다)',
                    embeds: [],
                    components: [],
                });
                return;
            }

            let page = 0;
            let importantOnly = true;

            const reply = (p) => {
                const payload = buildCalendarPayload(events, p, importantOnly);
                page = payload._meta.safePage;
                delete payload._meta;
                return payload;
            };

            await interaction.editReply(reply(page));
            const message = await interaction.fetchReply();

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: CALENDAR_COLLECTOR_MS,
            });

            collector.on('collect', async (btn) => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({
                        content: '본인이 요청한 일정만 조작할 수 있습니다.',
                        ephemeral: true,
                    });
                }

                if (btn.customId === 'cal_prev') {
                    page = Math.max(0, page - 1);
                } else if (btn.customId === 'cal_next') {
                    const maxPage = buildEventPages(filterEvents(events, importantOnly)).length - 1;
                    page = Math.min(maxPage, page + 1);
                } else if (btn.customId === 'cal_toggle') {
                    importantOnly = !importantOnly;
                    page = 0;
                }

                await btn.update(reply(page));
            });

            collector.on('end', () => {
                const filtered = filterEvents(events, importantOnly);
                const totalPages = buildEventPages(filtered).length;
                message
                    .edit({
                        components: disableCalendarControls(
                            buildCalendarControls({ totalPages, page, importantOnly })
                        ),
                    })
                    .catch(() => {});
            });
        } catch (err) {
            console.error('[일정] 처리 실패:', err.message);
            await interaction
                .editReply({
                    content: '❌ 경제일정을 불러오는 중 오류가 발생했습니다.',
                    embeds: [],
                    components: [],
                })
                .catch(() => {});
        }
    },
};
