const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/watchlist.json');
const MAX_ITEMS = 20;

function ensureFile() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
    }
}

function readAll() {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch {
        return { users: {} };
    }
}

function writeAll(data) {
    ensureFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function itemKey(item) {
    return item.kind === 'kr' ? `kr:${item.code}` : `us:${item.ticker}`;
}

function getUserWatchlist(userId) {
    const data = readAll();
    return data.users[userId] || [];
}

function addToWatchlist(userId, item) {
    const data = readAll();
    const list = data.users[userId] || [];
    const key = itemKey(item);

    if (list.some((entry) => itemKey(entry) === key)) {
        return { ok: false, reason: 'duplicate', item: list.find((e) => itemKey(e) === key) };
    }

    if (list.length >= MAX_ITEMS) {
        return { ok: false, reason: 'limit', count: list.length };
    }

    const entry = { ...item, addedAt: new Date().toISOString() };
    data.users[userId] = [...list, entry];
    writeAll(data);
    return { ok: true, item: entry, count: data.users[userId].length };
}

function removeFromWatchlist(userId, item) {
    const data = readAll();
    const list = data.users[userId] || [];
    const key = itemKey(item);
    const next = list.filter((entry) => itemKey(entry) !== key);

    if (next.length === list.length) {
        return { ok: false, reason: 'not_found' };
    }

    data.users[userId] = next;
    writeAll(data);
    return { ok: true, count: next.length };
}

module.exports = {
    MAX_ITEMS,
    itemKey,
    getUserWatchlist,
    addToWatchlist,
    removeFromWatchlist,
};
