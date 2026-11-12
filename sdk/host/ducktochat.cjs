const fs = require('node:fs');
const path = require('node:path');

const STATE_PATH = path.join(__dirname, '..', '..', 'runs', 'ducktochat-state.json');
const ROOMS = ['A', 'B', 'C', 'D'];

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.rooms) throw new Error('invalid state');
    for (const r of ROOMS) if (!Array.isArray(parsed.rooms[r])) parsed.rooms[r] = [];
    if (!parsed.consoles) parsed.consoles = {};
    if (!Number.isInteger(parsed.nextConsole)) parsed.nextConsole = 1;
    return parsed;
  } catch (_) {
    return { nextConsole: 1, consoles: {}, rooms: { A: [], B: [], C: [], D: [] } };
  }
}

function saveState(state) {
  try { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); } catch (_) {}
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}

function registerConsole(state) {
  const key = String(process.pid);
  if (!state.consoles[key]) {
    state.consoles[key] = 'Console ' + (state.nextConsole++);
  }
  return state.consoles[key];
}

function roomName(idx) {
  const i = Math.max(0, Math.min(ROOMS.length - 1, idx | 0));
  return ROOMS[i];
}

module.exports = {
  create(rpc) {
    return {
      async fetchRoom(roomIdx) {
        const state = loadState();
        const author = registerConsole(state);
        saveState(state);
        const room = roomName(roomIdx);
        const msgs = state.rooms[room] || [];
        const recent = msgs.slice(-8);
        return { author, room, messages: recent, total: msgs.length };
      },
      async sendMessage(roomIdx, text) {
        const state = loadState();
        const author = registerConsole(state);
        const room = roomName(roomIdx);
        state.rooms[room] = state.rooms[room] || [];
        const msg = {
          id: Date.now() + '-' + Math.random().toString(36).slice(2),
          author,
          text: String(text || '').slice(0, 104),
          time: new Date().toLocaleTimeString()
        };
        state.rooms[room].push(msg);
        if (state.rooms[room].length > 50) state.rooms[room] = state.rooms[room].slice(-50);
        saveState(state);
        return { status: 200, author };
      }
    };
  }
};