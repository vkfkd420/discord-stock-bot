/**
 * STABLE UI v2.0 — /일정 Discord 화면 (날짜별 목록형)
 */
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const CALENDAR_UI_VERSION = '2.0.0';
const CALENDAR_COLLECTOR_MS = 3 * 60 * 1000;
const EVENTS_PER_PAGE = 5;

const IMPORTANCE_COLORS = {
    high: 0xff1744,
    medium: 0xfaa61a,
    low: 0xfee75c,
    default: 0x5865f2,
};

const IMPORTANCE_BADGE = {
    high: '🔴',
    medium: '🟠',
    low: '🟡',
};

function truncate(text, max = 4096) {
    if (!text) return '—';
    const s = String(text).trim();
    return s.length <= max ? s : s.slice(0, max - 3) + '...';
}

function filterEvents(events, importantOnly) {
    if (!importantOnly) return events;
    return events.filter((e) => e.importance >= 4);
}

function buildEventPages(events) {
    const pages = [];
    let batch = [];

    for (const event of events) {
        if (batch.length >= EVENTS_PER_PAGE) {
            pages.push(batch);
            batch = [];
        }
        batch.push(event);
    }

    if (batch.length) pages.push(batch);
    return pages.length ? pages : [[]];
}

function pageColor(pageEvents) {
    if (!pageEvents.length) return IMPORTANCE_COLORS.default;
    const max = Math.max(...pageEvents.map((e) => e.importance));
    if (max >= 5) return IMPORTANCE_COLORS.high;
    if (max >= 4) return IMPORTANCE_COLORS.medium;
    return IMPORTANCE_COLORS.low;
}

function formatEventBullet(event) {
    const badge = IMPORTANCE_BADGE[event.level] || '🟡';
    const shortImpact = event.impact.length > 60 ? event.impact.slice(0, 57) + '...' : event.impact;
    return `${badge} \`${event.timeKst}\` **${event.title}**\n   ${event.stars} · ${shortImpact}`;
}

function buildListDescription(pageEvents) {
    const lines = [];
    let lastDateKey = null;

    for (const event of pageEvents) {
        if (event.dateKey !== lastDateKey) {
            lines.push('', `**📅 ${event.dateLabel}**`);
            lastDateKey = event.dateKey;
        }
        lines.push(`• ${formatEventBullet(event)}`);
    }

    return truncate(lines.join('\n').trim(), 4000);
}

function buildCalendarContent({ page, totalPages, importantOnly, eventCount }) {
    const mode = importantOnly ? '🔴 중요 일정' : '📋 전체 일정';
    return `📅 **경제일정** · Page **${page} / ${totalPages}** · ${mode} · ${eventCount}건 · 오늘~7일`;
}

function buildCalendarEmbed(pageEvents, { page, totalPages, eventCount }) {
    const embed = new EmbedBuilder()
        .setColor(pageColor(pageEvents))
        .setTitle('📅 경제일정')
        .setDescription(
            pageEvents.length
                ? buildListDescription(pageEvents)
                : '표시할 일정이 없습니다. **전체 보기**를 눌러 보세요.'
        )
        .setFooter({
            text: `Page ${page}/${totalPages} · ${eventCount} events · v${CALENDAR_UI_VERSION}`,
        });

    return embed;
}

function buildCalendarControls({ totalPages, page, importantOnly }) {
    const nav = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cal_prev')
            .setLabel('이전')
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('cal_next')
            .setLabel('다음')
            .setEmoji('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
            .setCustomId('cal_toggle')
            .setLabel(importantOnly ? '전체 보기' : '중요만')
            .setEmoji(importantOnly ? '📋' : '🔴')
            .setStyle(importantOnly ? ButtonStyle.Secondary : ButtonStyle.Success)
    );

    return [nav];
}

function buildCalendarPayload(allEvents, page, importantOnly = true) {
    const filtered = filterEvents(allEvents, importantOnly);
    const pages = buildEventPages(filtered);
    const safePage = Math.min(page, Math.max(0, pages.length - 1));
    const pageEvents = pages[safePage] || [];

    return {
        content: buildCalendarContent({
            page: safePage + 1,
            totalPages: pages.length,
            importantOnly,
            eventCount: filtered.length,
        }),
        embeds: [
            buildCalendarEmbed(pageEvents, {
                page: safePage + 1,
                totalPages: pages.length,
                eventCount: filtered.length,
            }),
        ],
        components: buildCalendarControls({
            totalPages: pages.length,
            page: safePage,
            importantOnly,
        }),
        _meta: { pages, safePage },
    };
}

function disableCalendarControls(components) {
    return components.map((row) =>
        ActionRowBuilder.from(row).setComponents(
            row.components.map((c) => ButtonBuilder.from(c).setDisabled(true))
        )
    );
}

module.exports = {
    CALENDAR_UI_VERSION,
    CALENDAR_COLLECTOR_MS,
    buildCalendarPayload,
    buildCalendarControls,
    disableCalendarControls,
    filterEvents,
    buildEventPages,
};
