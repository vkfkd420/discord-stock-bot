/**
 * STABLE UI v1.0 — /뉴스 Discord 화면 고정 스펙
 * 사용자 명시 요청 없이 이 파일의 레이아웃·필드·버튼 구성을 변경하지 말 것.
 *
 * 레이아웃 (고정):
 *   [content] 📰 주식·경제 뉴스 · {지역} · {n}/{total}
 *   [embed]   author=출처 / title=제목 / description=요약 / fields 3개 / footer
 *   [buttons] ◀ 이전 | ▶ 다음 | 🔗 기사 보기 (없으면 📋 링크 없음)
 */
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const NEWS_UI_VERSION = '1.0.0';
const NEWS_COLOR = 0x5865f2;
const NEWS_PAGE_SIZE = 10;
const NEWS_COLLECTOR_MS = 3 * 60 * 1000;

const REGION_LABELS = {
    all: '🌐 전체',
    kr: '🇰🇷 한국',
    us: '🇺🇸 미국',
};

const SECTOR_LABELS = {
    tech: '💻 기술',
    energy: '⚡ 에너지',
    finance: '🏦 금융',
    auto: '🚗 자동차',
    pharma: '💊 제약',
    defense: '🛡️ 방산',
    battery: '🔋 2차전지',
    general: '📌 일반',
};

function truncate(text, max = 1024) {
    if (!text) return '—';
    const s = String(text).trim();
    return s.length <= max ? s : s.slice(0, max - 3) + '...';
}

function isValidHttpUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function formatSectors(sectors) {
    if (!sectors?.length) return '—';
    return sectors.map((s) => SECTOR_LABELS[s] || s).join(' · ');
}

function buildNewsContent({ regionLabel, page, total }) {
    return `📰 **주식·경제 뉴스** · ${regionLabel} · **${page} / ${total}**`;
}

function buildNewsCardEmbed(item) {
    const regionFlag = item.region === 'kr' ? '🇰🇷' : '🇺🇸';
    const link = isValidHttpUrl(item.link) ? item.link : null;

    const embed = new EmbedBuilder()
        .setColor(NEWS_COLOR)
        .setAuthor({ name: `${regionFlag} ${item.source || 'RSS'} · ${item.impact || '🟢 낮음'}` })
        .setTitle(truncate(item.title, 256))
        .setDescription(truncate(item.summary || '요약 없음', 400))
        .addFields(
            { name: '📊 영향', value: item.impact || '—', inline: true },
            { name: '🏷️ 섹터', value: formatSectors(item.sectors), inline: true },
            { name: '🕐 게시', value: item.timeAgo || item.pubDate || '—', inline: true }
        )
        .setFooter({ text: `주식봇 RSS v${NEWS_UI_VERSION} · 최근 24시간` });

    if (link) embed.setURL(link);

    return embed;
}

function buildNewsPayload(news, page, regionLabel) {
    return {
        content: buildNewsContent({ regionLabel, page: page + 1, total: news.length }),
        embeds: [buildNewsCardEmbed(news[page])],
        components: buildNewsControls(news, page),
    };
}

function buildNewsControls(items, page) {
    const item = items[page];
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('news_prev')
            .setLabel('이전')
            .setEmoji('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('news_next')
            .setLabel('다음')
            .setEmoji('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= items.length - 1)
    );

    if (isValidHttpUrl(item.link)) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel('기사 보기')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(item.link)
        );
    } else {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('news_no_link')
                .setLabel('링크 없음')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }

    return [row];
}

function disableNewsControls(components) {
    return components.map((row) =>
        ActionRowBuilder.from(row).setComponents(
            row.components.map((component) => ButtonBuilder.from(component).setDisabled(true))
        )
    );
}

module.exports = {
    NEWS_UI_VERSION,
    NEWS_PAGE_SIZE,
    NEWS_COLLECTOR_MS,
    REGION_LABELS,
    buildNewsPayload,
    buildNewsControls,
    disableNewsControls,
};
