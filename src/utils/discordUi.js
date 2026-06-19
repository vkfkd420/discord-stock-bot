const { EmbedBuilder } = require('discord.js');

const COLORS = {
    up: 0x00c853,
    down: 0xff1744,
    neutral: 0x5865f2,
    warning: 0xfaa61a,
    kr: 0xe74c3c,
    us: 0x3498db,
    hot: 0xf39c12,
    voice: 0x9b59b6,
    quote: 0xf1c40f,
    calendar: 0x95a5a6,
    sector: 0x1abc9c,
    guide: 0x2ecc71,
    indices: 0xfee75c,
};

function truncate(text, max = 1024) {
    if (!text) return '—';
    const s = String(text).trim();
    return s.length <= max ? s : s.slice(0, max - 3) + '...';
}

function sectionColor(title) {
    if (title.includes('🇰🇷')) return COLORS.kr;
    if (title.includes('🇺🇸')) return COLORS.us;
    if (title.includes('🔥')) return COLORS.hot;
    if (title.includes('🎤')) return COLORS.voice;
    if (title.includes('⚡')) return COLORS.quote;
    if (title.includes('📅')) return COLORS.calendar;
    if (title.includes('📊')) return COLORS.sector;
    if (title.includes('🎯')) return COLORS.guide;
    return COLORS.neutral;
}

function parseBriefingSections(markdown) {
    const sections = [];
    const parts = markdown.split(/^#\s+/m).filter(Boolean);

    for (const part of parts) {
        const firstLine = part.indexOf('\n');
        if (firstLine === -1) continue;
        const title = part.slice(0, firstLine).trim();
        const body = part.slice(firstLine + 1).trim();
        if (title && body) sections.push({ title, body });
    }

    return sections;
}

const DISCORD_EMBED_MAX = 5200;
const FIELD_VALUE_MAX = 900;

function embedCharCount(embed) {
    const data = embed.toJSON();
    let len = 0;
    if (data.title) len += data.title.length;
    if (data.description) len += data.description.length;
    if (data.author?.name) len += data.author.name.length;
    if (data.footer?.text) len += data.footer.text.length;
    for (const field of data.fields || []) {
        len += (field.name || '').length + (field.value || '').length;
    }
    return len;
}

function fitsEmbedLimit(embed) {
    return embedCharCount(embed) <= DISCORD_EMBED_MAX;
}

function bodyToFields(body) {
    const blocks = body.split(/\n(?=제목:)/).filter((b) => b.trim());
    if (blocks.length <= 1) return null;

    const fields = [];
    for (const block of blocks) {
        const titleMatch = block.match(/제목:\s*(.+)/);
        const summaryMatch = block.match(/3줄 요약:\s*([\s\S]*?)(?=\n(?:관련|시장|중요|투자|$))/);
        const stocksMatch = block.match(/관련 종목:\s*(.+)/);
        const sectorMatch = block.match(/관련 섹터:\s*(.+)/);
        const impactMatch = block.match(/시장 영향:\s*(.+)/);
        const importanceMatch = block.match(/중요도:\s*(.+)/);
        const insightMatch = block.match(/투자자 해석:\s*([\s\S]*?)(?=\n\n|$)/);

        const name = truncate(titleMatch?.[1] || '뉴스', 256);
        const value = truncate(
            [
                summaryMatch?.[1]?.trim(),
                stocksMatch?.[1] ? `종목: ${stocksMatch[1].trim()}` : '',
                sectorMatch?.[1] ? `섹터: ${sectorMatch[1].trim()}` : '',
                impactMatch?.[1] ? `영향 ${impactMatch[1].trim()}` : '',
                importanceMatch?.[1] ? importanceMatch[1].trim() : '',
                insightMatch?.[1]?.trim() ? `💡 ${insightMatch[1].trim()}` : '',
            ]
                .filter(Boolean)
                .join('\n'),
            1024
        );

        if (name && value) fields.push({ name, value: truncate(value, FIELD_VALUE_MAX), inline: false });
    }

    return fields.length ? fields : null;
}

function splitFieldsIntoEmbeds(title, fields) {
    const embeds = [];
    const cleanTitle = truncate(title.replace(/^#+\s*/, ''), 256);
    let batch = [];

    const makeTitle = (partIndex) =>
        partIndex > 0 ? truncate(`${cleanTitle} (${partIndex + 1})`, 256) : cleanTitle;

    const flush = (partIndex) => {
        if (batch.length === 0) return;
        embeds.push(
            new EmbedBuilder()
                .setColor(sectionColor(title))
                .setTitle(makeTitle(partIndex))
                .addFields(batch)
        );
        batch = [];
    };

    for (const field of fields) {
        const partIndex = embeds.length;
        const titleForTest = makeTitle(partIndex);
        const candidate = [...batch, field];
        const test = new EmbedBuilder()
            .setColor(sectionColor(title))
            .setTitle(titleForTest)
            .addFields(candidate);

        if (!fitsEmbedLimit(test) && batch.length > 0) {
            flush(partIndex - 1);
            batch = [field];
        } else if (!fitsEmbedLimit(test) && batch.length === 0) {
            embeds.push(
                new EmbedBuilder()
                    .setColor(sectionColor(title))
                    .setTitle(makeTitle(partIndex))
                    .addFields({ name: field.name, value: truncate(field.value, FIELD_VALUE_MAX), inline: false })
            );
        } else {
            batch = candidate;
        }
    }

    flush(embeds.length);
    return embeds.flatMap((embed) => enforceEmbedLimit(embed));
}

function splitDescriptionEmbeds(title, body) {
    const embeds = [];
    const cleanTitle = truncate(title.replace(/^#+\s*/, ''), 256);
    let remaining = body;

    while (remaining.length > 0) {
        const suffix = embeds.length > 0 ? ` (${embeds.length + 1})` : '';
        let chunkSize = Math.min(remaining.length, 3500);

        while (chunkSize > 0) {
            const chunk = remaining.slice(0, chunkSize);
            const test = new EmbedBuilder()
                .setColor(sectionColor(title))
                .setTitle(cleanTitle + suffix)
                .setDescription(chunk);

            if (fitsEmbedLimit(test)) {
                embeds.push(test);
                remaining = remaining.slice(chunkSize);
                break;
            }
            chunkSize -= 200;
        }

        if (chunkSize <= 0) {
            embeds.push(
                new EmbedBuilder()
                    .setColor(sectionColor(title))
                    .setTitle(cleanTitle + suffix)
                    .setDescription(truncate(remaining, 3500))
            );
            break;
        }
    }

    return embeds.length
        ? embeds.flatMap((embed) => enforceEmbedLimit(embed))
        : [new EmbedBuilder().setColor(sectionColor(title)).setTitle(cleanTitle).setDescription('—')];
}

function enforceEmbedLimit(embed) {
    if (fitsEmbedLimit(embed)) return [embed];

    const data = embed.toJSON();
    const color = data.color ?? COLORS.neutral;
    const title = data.title || '브리핑';

    if (data.fields?.length > 1) {
        return data.fields.flatMap((field, i) =>
            enforceEmbedLimit(
                new EmbedBuilder()
                    .setColor(color)
                    .setTitle(truncate(`${title} (${i + 1})`, 256))
                    .addFields({ ...field, value: truncate(field.value, FIELD_VALUE_MAX) })
            )
        );
    }

    if (data.fields?.length === 1) {
        const field = data.fields[0];
        const shortened = truncate(field.value, FIELD_VALUE_MAX);
        const single = new EmbedBuilder()
            .setColor(color)
            .setTitle(truncate(title, 256))
            .addFields({ name: field.name, value: shortened, inline: false });

        if (fitsEmbedLimit(single)) return [single];

        return splitDescriptionEmbeds(title, shortened);
    }

    if (data.description) {
        return splitDescriptionEmbeds(title, data.description);
    }

    return [
        new EmbedBuilder()
            .setColor(color)
            .setTitle(truncate(title, 256))
            .setDescription('내용이 길어 일부만 표시됩니다.'),
    ];
}

function sanitizeEmbeds(embeds) {
    return embeds.flatMap((embed) => enforceEmbedLimit(embed));
}

function buildSectionEmbeds(title, body) {
    const fields = bodyToFields(body);
    if (fields) return splitFieldsIntoEmbeds(title, fields);
    return splitDescriptionEmbeds(title, truncate(body, 8000));
}

function buildSectionEmbed(title, body) {
    return buildSectionEmbeds(title, body)[0];
}

function buildBriefingEmbeds(markdown) {
    const sections = parseBriefingSections(markdown);
    return sanitizeEmbeds(sections.flatMap(({ title, body }) => buildSectionEmbeds(title, body)));
}

function chunkEmbeds(embeds, maxPerMessage = 5) {
    const chunks = [];
    for (let i = 0; i < embeds.length; i += maxPerMessage) {
        chunks.push(embeds.slice(i, i + maxPerMessage));
    }
    return chunks;
}

function isValidSnapshotQuote(label, data) {
    if (!data?.price) return false;
    if (label === '달러/원') {
        return data.price.includes('원') && !data.price.includes('$');
    }
    return true;
}

function buildIndicesEmbed(indices) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.indices)
        .setTitle('📊 시장 스냅샷')
        .setTimestamp();

    const withData = indices.filter((i) => i.data && isValidSnapshotQuote(i.label, i.data));
    if (withData.length === 0) {
        embed.setDescription('지수 데이터를 불러오지 못했습니다.');
        return embed;
    }

    for (const { label, data } of withData) {
        embed.addFields({
            name: label,
            value: `${data.emoji} **${data.price}**\n${data.change}`,
            inline: true,
        });
    }

    return embed;
}

function buildStockEmbed(quote) {
    const color = quote.isUp ? COLORS.up : COLORS.down;
    const arrow = quote.isUp ? '▲' : '▼';

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: quote.market })
        .setTitle(quote.name)
        .setDescription(`## ${quote.price}\n${arrow} ${quote.change} (${quote.changePct})`)
        .addFields(
            { name: '전일 종가', value: quote.prevClose, inline: true },
            { name: '종목코드', value: quote.ticker, inline: true },
            { name: '거래량', value: quote.volume, inline: true }
        )
        .setFooter({ text: 'Naver Finance · 실시간' })
        .setTimestamp();
}

module.exports = {
    COLORS,
    truncate,
    buildBriefingEmbeds,
    buildIndicesEmbed,
    buildStockEmbed,
    sanitizeEmbeds,
    chunkEmbeds,
};
