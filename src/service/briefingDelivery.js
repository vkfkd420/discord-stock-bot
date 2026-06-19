/**
 * STABLE UI v1.0 — /브리핑 Discord 전달 고정
 * 사용자 명시 요청 없이 embed 구조·첨부 .md 방식을 변경하지 말 것.
 */
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { buildBriefingEmbeds, buildIndicesEmbed, chunkEmbeds, sanitizeEmbeds } = require('../utils/discordUi');

function buildMarkdownAttachment(markdown, label) {
    const safeLabel = String(label).replace(/[^\w가-힣-]/g, '_');
    const filename = `briefing_${safeLabel}_${Date.now()}.md`;
    return new AttachmentBuilder(Buffer.from(markdown, 'utf-8'), { name: filename });
}

function buildHeaderEmbed(label, generatedAt) {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📋 AI 투자 브리핑')
        .setDescription(`**${generatedAt}** (KST)\n세션 \`${label}\``)
        .setFooter({ text: '헤지펀드 리서치 형식 · 전문은 .md 첨부' });
}

function prepareBriefingEmbeds(markdown, indices, label, generatedAt) {
    const header = buildHeaderEmbed(label, generatedAt);
    const indicesEmbed = buildIndicesEmbed(indices);
    const sectionEmbeds = buildBriefingEmbeds(markdown);
    return sanitizeEmbeds([header, indicesEmbed, ...sectionEmbeds]);
}

async function sendBriefingToChannel(channel, { markdown, indices, label, generatedAt }) {
    const mdFile = buildMarkdownAttachment(markdown, label);
    const allEmbeds = prepareBriefingEmbeds(markdown, indices, label, generatedAt);
    const chunks = chunkEmbeds(allEmbeds, 5);

    try {
        await channel.send({
            content: chunks.length > 1 ? `📢 **투자 브리핑** (1/${chunks.length})` : '📢 **투자 브리핑**',
            embeds: chunks[0],
            files: [mdFile],
        });

        for (let i = 1; i < chunks.length; i++) {
            await channel.send({
                content: `📋 **투자 브리핑** (${i + 1}/${chunks.length})`,
                embeds: chunks[i],
            });
        }
    } catch (err) {
        console.error('브리핑 embed 전송 실패, md만 전송:', err.message);
        await channel.send({
            content: '📢 **투자 브리핑** — embed 제한으로 전문 파일로 전달합니다.',
            embeds: sanitizeEmbeds([buildHeaderEmbed(label, generatedAt), buildIndicesEmbed(indices)]),
            files: [mdFile],
        });
    }
}

async function replyBriefing(interaction, { markdown, indices, label, generatedAt }) {
    const mdFile = buildMarkdownAttachment(markdown, label);
    const allEmbeds = prepareBriefingEmbeds(markdown, indices, label, generatedAt);
    const chunks = chunkEmbeds(allEmbeds, 5);

    try {
        await interaction.editReply({
            content: '📢 **투자 브리핑** (수동) · 카드 + `.md` 전문',
            embeds: chunks[0],
            files: [mdFile],
        });

        for (let i = 1; i < chunks.length; i++) {
            await interaction.followUp({
                content: `📋 **브리핑 계속** (${i + 1}/${chunks.length})`,
                embeds: chunks[i],
            });
        }
    } catch (err) {
        console.error('브리핑 embed 전송 실패, md만 전송:', err.message);
        await interaction.editReply({
            content: '📢 **투자 브리핑** — embed 제한으로 전문 파일로 전달합니다.',
            embeds: sanitizeEmbeds([buildHeaderEmbed(label, generatedAt), buildIndicesEmbed(indices)]),
            files: [mdFile],
        });
    }
}

module.exports = { sendBriefingToChannel, replyBriefing };
