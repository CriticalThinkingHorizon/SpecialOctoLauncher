// S2 Discord JWT-Token Client Service (modeled after discord-es5 DiscordClient.js)
// Implements Discord REST API v9/v6 + Gateway WebSocket (wss://gateway.discord.gg/?v=6&encoding=json)
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const DISCORD_API = 'https://discord.com/api';
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=6&encoding=json';
const REPO_TOKEN_FILE = path.join(__dirname, '../../discord-token.txt');
const HOME_TOKEN_DIR = path.join(os.homedir(), '.openclaw', 'discord');
const HOME_TOKEN_FILE = path.join(HOME_TOKEN_DIR, 'token.txt');
const S2_SAVE_STORAGE_DIR = 'save:/hbstorage';
const S2_SAVE_TOKEN_PATH = 'save:/hbstorage/discord_token.txt';
const S2_LEGACY_SAVE_ROOT_TOKEN_PATH = 'save:/discord_token.txt';
const S2_LEGACY_TMP_TOKEN_PATH = 'tmp:/discord_token.txt';
const TOKEN_PORTAL_PORT = Number(process.env.DISCORD_PORTAL_PORT || 39381);

const OperationCodes = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  PresenceUpdate: 3,
  Resume: 6,
  Reconnect: 7,
  RequestGuildMembers: 8,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatAcknowledgement: 11
};

function sanitizeAscii(str, maxLen = 60) {
  if (!str) return '';
  return String(str)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, maxLen);
}

function wrapMessageLines(str, lineWidth = 55, maxLines = 3) {
  const clean = String(str || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = [];
  let remaining = clean;
  for (let i = 0; i < maxLines; i++) {
    if (!remaining) {
      lines.push('');
      continue;
    }
    if (remaining.length <= lineWidth) {
      lines.push(remaining);
      remaining = '';
      continue;
    }
    if (i === maxLines - 1) {
      lines.push(remaining.slice(0, lineWidth - 3) + '...');
      remaining = '';
      break;
    }
    let splitAt = remaining.lastIndexOf(' ', lineWidth);
    if (splitAt <= Math.floor(lineWidth * 0.4)) {
      splitAt = lineWidth;
    }
    lines.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return lines;
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hr = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mo}-${day} ${hr}:${min}`;
  } catch {
    return '';
  }
}

class S2DiscordClient {
  constructor() {
    this.token = null;
    this.lastFileMtime = 0;
    this.pendingServerTokenSync = false;
    this.status = 0; // 0 = No Token, 1 = Connecting, 2 = Connected, 3 = Auth Error
    this.statusDetail = 'No token! Use http://<server>:39381 or press (+)';
    this.user = null;
    this.guilds = [];       // [{ id: '@me', name: '[Direct Messages]', isDm: true }, ...guilds]
    this.dmChannels = [];   // [{ id, name, lastMessageId, raw }]
    this.guildChannels = new Map(); // guildId -> [{ id, name, position, isSection, raw }]
    this.collapsedSections = new Set(); // sectionId strings that the user collapsed
    this.activeChannels = []; // Currently displayed channel & section list
    this.messagesByChannel = new Map(); // channelId -> [{ id, author, timestamp, content, reactions, isMe, hasMyThumb, raw }]

    this.guildWindowOffset = 0;
    this.activeGuildIdx = 0;   // index into this.guilds
    this.channelWindowOffset = 0;
    this.activeChannelIdx = 0; // index into this.activeChannels
    this.messageScrollOffset = 0; // offset from newest window (0 = bottom/newest 5 messages)

    this.socket = null;
    this.heartbeatInterval = null;
    this.socketLastSequence = null;
    this.readyData = null;
    this.gatewayState = 0; // 0 = off, 1 = connected, 2 = reconnecting
    this.portalServer = null;
    this.startTokenPortal();
  }

  startTokenPortal() {
    if (this.portalServer) return;
    try {
      const srv = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === 'GET' && req.url === '/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: this.status,
            statusDetail: this.statusDetail,
            user: this.user,
            guilds: this.guilds.length,
            gatewayState: this.gatewayState
          }));
          return;
        }
        if (req.method === 'POST' && (req.url === '/token' || req.url === '/')) {
          let body = '';
          req.on('data', chunk => {
            if (body.length < 4096) body += chunk.toString('utf8');
          });
          req.on('end', async () => {
            let newToken = body.trim();
            try {
              if (newToken.startsWith('{')) {
                const parsed = JSON.parse(newToken);
                newToken = String(parsed.token || '').trim();
              } else if (newToken.startsWith('token=')) {
                newToken = decodeURIComponent(newToken.slice(6).replace(/\+/g, ' ')).trim();
              }
            } catch {}
            newToken = newToken.replace(/^["']|["']$/g, '').trim();
            if (newToken.length > 20) {
              await this.saveToken(newToken, null);
              this.pendingServerTokenSync = true;
              this.status = 0; // Trigger immediate reconnect on next S2 poll or right now
              await this.connect(null);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                status: this.status,
                user: this.user ? `@${this.user.username}` : null,
                detail: this.statusDetail
              }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'Token too short or invalid' }));
            }
          });
          return;
        }

        // Default GET: Render Token Portal Web UI
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Discord S2 - Server Token Sender</title>
  <style>
    body { background: #1e1f22; color: #f2f3f5; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #313338; padding: 32px; border-radius: 12px; width: 100%; max-width: 480px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); border: 1px solid #5865f2; }
    h1 { margin: 0 0 8px; font-size: 22px; color: #fff; }
    p { margin: 0 0 20px; color: #b5bac1; font-size: 14px; line-height: 1.4; }
    input { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 8px; border: 1px solid #1e1f22; background: #1e1f22; color: #fff; font-size: 14px; margin-bottom: 16px; outline: none; }
    input:focus { border-color: #5865f2; }
    button { width: 100%; padding: 12px; border: none; border-radius: 8px; background: #5865f2; color: #fff; font-weight: 600; font-size: 15px; cursor: pointer; }
    button:hover { background: #4752c4; }
    .status { margin-top: 16px; padding: 10px 12px; border-radius: 6px; background: #2b2d31; font-size: 13px; color: #dbdee1; }
    code { background: #1e1f22; padding: 2px 6px; border-radius: 4px; color: #949cf7; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Discord S2 Token Sender</h1>
    <p>Paste your Discord JWT token below to send it directly from the server to your S2 console (saved to <code>discord-token.txt</code> and committed to <code>save:/hbstorage/discord_token.txt</code>).</p>
    <input id="tok" type="password" placeholder="Paste Discord JWT Token here..." autocomplete="off" />
    <button onclick="sendToken()">Send Token to S2 & Connect</button>
    <div class="status" id="st">Status: ${this.statusDetail.replace(/</g, '&lt;')}</div>
  </div>
  <script>
    async function sendToken() {
      const tok = document.getElementById('tok').value.trim();
      const st = document.getElementById('st');
      if (!tok) { st.textContent = 'Please paste a token first.'; return; }
      st.textContent = 'Sending token & connecting to Discord...';
      try {
        const r = await fetch('/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) });
        const d = await r.json();
        st.textContent = d.ok ? ('Success! ' + d.detail) : ('Error: ' + d.error);
      } catch (e) {
        st.textContent = 'Request failed: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      srv.on('error', () => {});
      srv.listen(TOKEN_PORTAL_PORT, '0.0.0.0', () => {
        console.log(`[DISCORD PORTAL] Web Token Sender listening on http://0.0.0.0:${TOKEN_PORTAL_PORT}`);
      });
      srv.unref();
      this.portalServer = srv;
    } catch {}
  }

  checkServerFileUpdate() {
    try {
      if (fs.existsSync(REPO_TOKEN_FILE)) {
        const st = fs.statSync(REPO_TOKEN_FILE);
        if (st.mtimeMs > this.lastFileMtime) {
          const t = fs.readFileSync(REPO_TOKEN_FILE, 'utf8').replace(/^["']|["']$/g, '').trim();
          if (t.length > 20 && t !== this.token) {
            this.token = t;
            this.lastFileMtime = st.mtimeMs;
            this.pendingServerTokenSync = true;
            return true;
          }
          this.lastFileMtime = st.mtimeMs;
        }
      }
    } catch {}
    return false;
  }

  async authorizedFetch(endpointOrUrl, options = {}) {
    const url = endpointOrUrl.startsWith('http') ? endpointOrUrl : `${DISCORD_API}${endpointOrUrl}`;
    const headers = {
      'Authorization': this.token,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ...(options.headers || {})
    };
    return fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(12000)
    });
  }

  async ensureHbStorageDir(fsService) {
    if (!fsService) return;
    try {
      if (typeof fsService.ensureDir === 'function') {
        await fsService.ensureDir(S2_SAVE_STORAGE_DIR);
      } else {
        const st = await fsService.statPath(S2_SAVE_STORAGE_DIR);
        if (!st.exists || st.entryType !== 1) {
          if (st.exists && st.entryType === 0) {
            await fsService.deletePath(S2_SAVE_STORAGE_DIR).catch(() => {});
          }
          await fsService.mkdirPath(S2_SAVE_STORAGE_DIR);
        }
      }
    } catch {}
  }

  async persistTokenToS2Save(tokenStr, fsService) {
    if (!fsService || !tokenStr) return;
    try {
      await this.ensureHbStorageDir(fsService);
      await fsService.deletePath(S2_SAVE_TOKEN_PATH).catch(() => {});
      const wr = await fsService.writeBytesAt(S2_SAVE_TOKEN_PATH, 0, Buffer.from(tokenStr, 'utf8'));
      if (wr.result === 0) {
        await fsService.commitMount('save');
        console.log(`[DISCORD] Token saved and committed to ${S2_SAVE_TOKEN_PATH} (${wr.bytesWritten}B)`);
      }
    } catch (err) {
      console.warn('[DISCORD] Failed to persist token to save:/hbstorage:', err.message);
    }
  }

  async loadStoredToken(fsService) {
    if (this.token) return this.token;

    // 1. Ensure save:/hbstorage directory exists and check save:/hbstorage/discord_token.txt first
    if (fsService) {
      await this.ensureHbStorageDir(fsService);
      try {
        const rd = await fsService.readBytesAt(S2_SAVE_TOKEN_PATH, 0, 256);
        if (rd.result === 0 && rd.data && rd.data.length > 20) {
          const t = rd.data.toString('utf8').replace(/\0.*$/, '').trim();
          if (t.length > 20) {
            this.token = t;
            return this.token;
          }
        }
      } catch {}

      // Migrate legacy save:/discord_token.txt or tmp:/discord_token.txt to save:/hbstorage/discord_token.txt
      for (const legacyPath of [S2_LEGACY_SAVE_ROOT_TOKEN_PATH, S2_LEGACY_TMP_TOKEN_PATH]) {
        try {
          const rdLegacy = await fsService.readBytesAt(legacyPath, 0, 256);
          if (rdLegacy.result === 0 && rdLegacy.data && rdLegacy.data.length > 20) {
            const t = rdLegacy.data.toString('utf8').replace(/\0.*$/, '').trim();
            if (t.length > 20) {
              this.token = t;
              await fsService.deletePath(legacyPath).catch(() => {});
              await this.persistTokenToS2Save(t, fsService);
              return this.token;
            }
          }
        } catch {}
      }
    }

    // 2. Check environment variable
    if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.trim().length > 20) {
      this.token = process.env.DISCORD_TOKEN.trim();
      await this.persistTokenToS2Save(this.token, fsService);
      return this.token;
    }

    // 3. Check repo discord-token.txt
    try {
      if (fs.existsSync(REPO_TOKEN_FILE)) {
        const t = fs.readFileSync(REPO_TOKEN_FILE, 'utf8').trim();
        if (t.length > 20) {
          this.token = t;
          await this.persistTokenToS2Save(t, fsService);
          return this.token;
        }
      }
    } catch {}

    // 4. Check ~/.openclaw/discord/token.txt
    try {
      if (fs.existsSync(HOME_TOKEN_FILE)) {
        const t = fs.readFileSync(HOME_TOKEN_FILE, 'utf8').trim();
        if (t.length > 20) {
          this.token = t;
          await this.persistTokenToS2Save(t, fsService);
          return this.token;
        }
      }
    } catch {}

    return null;
  }

  async saveToken(newToken, fsService) {
    const clean = String(newToken || '').replace(/^["']|["']$/g, '').trim();
    if (!clean) return false;
    this.token = clean;
    try {
      fs.mkdirSync(HOME_TOKEN_DIR, { recursive: true });
      fs.writeFileSync(HOME_TOKEN_FILE, clean, 'utf8');
    } catch {}
    try {
      fs.writeFileSync(REPO_TOKEN_FILE, clean, 'utf8');
    } catch {}
    await this.persistTokenToS2Save(clean, fsService);
    return true;
  }

  normalizeMessage(m) {
    const authorObj = m.author || {};
    const author = sanitizeAscii(authorObj.global_name || authorObj.username || 'Unknown', 22) || 'User';
    const timestamp = formatTimestamp(m.timestamp);
    let text = m.content || '';
    if (Array.isArray(m.attachments) && m.attachments.length > 0) {
      const attNames = m.attachments.map(a => a.filename || 'file').join(', ');
      text = text ? `${text} [File: ${attNames}]` : `[Attachment: ${attNames}]`;
    }
    if (!text && Array.isArray(m.embeds) && m.embeds.length > 0) {
      const emb = m.embeds[0];
      text = `[Embed: ${emb.title || emb.description || 'rich media'}]`;
    }
    const reactions = Array.isArray(m.reactions) ? m.reactions : [];
    let totalReactions = 0;
    let hasMyThumb = false;
    for (const r of reactions) {
      totalReactions += Number(r.count || 0);
      if (r.me) hasMyThumb = true;
    }
    let badge = '';
    if (totalReactions > 0) {
      badge = `[+${totalReactions} React]`;
    } else if (m.pinned) {
      badge = '[Pinned]';
    } else if (Array.isArray(m.attachments) && m.attachments.length > 0) {
      badge = '[Attachment]';
    }
    return {
      id: String(m.id || ''),
      channelId: String(m.channel_id || ''),
      author,
      timestamp,
      badge: sanitizeAscii(badge, 15),
      lines: wrapMessageLines(text, 55, 3),
      isMe: Boolean(this.user && authorObj.id === this.user.id),
      hasMyThumb,
      totalReactions,
      raw: m
    };
  }

  async connect(fsService) {
    await this.loadStoredToken(fsService);
    if (!this.token) {
      this.status = 0;
      this.statusDetail = 'No token! Press (+) or save discord-token.txt';
      return false;
    }

    this.status = 1;
    this.statusDetail = 'Connecting to Discord API...';

    try {
      // 1. Load @me user (DiscordClient.prototype.loadUser)
      const meResp = await this.authorizedFetch('/users/@me');
      if (!meResp.ok) {
        this.status = 3;
        this.statusDetail = `Auth failed (HTTP ${meResp.status}). Press (+) to set token`;
        console.warn(`[DISCORD] /users/@me returned HTTP ${meResp.status}`);
        return false;
      }
      const meData = await meResp.json();
      this.user = {
        id: meData.id,
        username: sanitizeAscii(meData.username || 'User', 22),
        globalName: sanitizeAscii(meData.global_name || meData.username || 'User', 22)
      };

      // 2. Load Direct Message channels (DiscordClient.prototype.loadChannels)
      const dmResp = await this.authorizedFetch('/users/@me/channels');
      if (dmResp.ok) {
        const dmData = await dmResp.json();
        if (Array.isArray(dmData)) {
          const dms = dmData.filter(ch => ch.type === 1 || ch.type === 3);
          dms.sort((a, b) => {
            const idA = a.last_message_id ? BigInt(a.last_message_id) : 0n;
            const idB = b.last_message_id ? BigInt(b.last_message_id) : 0n;
            return idA > idB ? -1 : idA < idB ? 1 : 0;
          });
          this.dmChannels = dms.map(ch => {
            const recs = Array.isArray(ch.recipients) ? ch.recipients : [];
            const first = recs[0] || {};
            let label = first.global_name || first.username || ch.name || 'DM';
            if (recs.length > 1) label += ` +${recs.length - 1}`;
            return {
              id: String(ch.id),
              name: '@' + (sanitizeAscii(label, 28) || 'DM'),
              lastMessageId: ch.last_message_id || null,
              type: ch.type,
              raw: ch
            };
          });
        }
      }

      // 3. Load Guilds (DiscordClient.prototype.loadGuilds)
      const guildsResp = await this.authorizedFetch('/users/@me/guilds');
      const guildList = [
        { id: '@me', name: '[Direct Messages]', isDm: true }
      ];
      if (guildsResp.ok) {
        const gData = await guildsResp.json();
        if (Array.isArray(gData)) {
          for (const g of gData) {
            guildList.push({
              id: String(g.id),
              name: sanitizeAscii(g.name || 'Server', 30) || 'Server',
              isDm: false,
              raw: g
            });
          }
        }
      }
      this.guilds = guildList;
      this.activeGuildIdx = 0;
      this.guildWindowOffset = 0;

      // 4. Select initial guild (Direct Messages if non-empty, otherwise first server)
      if (this.dmChannels.length === 0 && this.guilds.length > 1) {
        await this.selectGuild(1);
      } else {
        await this.selectGuild(0);
      }

      this.status = 2;
      this.statusDetail = `Connected as @${this.user.username}`;
      this.connectGateway();
      return true;
    } catch (err) {
      console.error('[DISCORD] Connection error:', err.message);
      this.status = 3;
      this.statusDetail = `Error: ${sanitizeAscii(err.message, 36)}`;
      return false;
    }
  }

  canAccessChannel(channel, guild, memberRoles, roleMap, userId) {
    // 1. Check base guild permissions if provided by /users/@me/guilds
    const ALL_PERMS = (1n << 63n) - 1n;
    const ADMINISTRATOR = 1n << 3n;
    const VIEW_CHANNEL = 1n << 10n;

    if (guild?.raw?.owner) return true;
    if (guild?.raw?.permissions != null && (!roleMap || roleMap.size === 0)) {
      try {
        const gPerms = BigInt(guild.raw.permissions);
        if ((gPerms & ADMINISTRATOR) === ADMINISTRATOR) return true;
      } catch {}
    }

    // 2. Compute base permissions from @everyone role + member's assigned roles
    let basePerms = VIEW_CHANNEL;
    if (roleMap && roleMap.size > 0) {
      const everyoneRole = roleMap.get(String(guild.id));
      basePerms = everyoneRole ? BigInt(everyoneRole.permissions || 0) : 0n;
      for (const rId of memberRoles) {
        const r = roleMap.get(String(rId));
        if (r && r.permissions != null) {
          try { basePerms |= BigInt(r.permissions); } catch {}
        }
      }
    } else if (guild?.raw?.permissions != null) {
      try { basePerms = BigInt(guild.raw.permissions); } catch {}
    }

    if ((basePerms & ADMINISTRATOR) === ADMINISTRATOR) return true;

    // 3. Apply channel permission_overwrites in Discord's official hierarchy:
    //    (a) @everyone overwrite -> (b) Role overwrites (OR allow, OR deny) -> (c) Member overwrite
    let perms = basePerms;
    const overwrites = Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [];
    if (overwrites.length > 0) {
      const owEveryone = overwrites.find(o => String(o.id) === String(guild.id));
      if (owEveryone) {
        try {
          perms &= ~BigInt(owEveryone.deny ?? owEveryone.deny_new ?? 0);
          perms |= BigInt(owEveryone.allow ?? owEveryone.allow_new ?? 0);
        } catch {}
      }

      let roleAllow = 0n;
      let roleDeny = 0n;
      const roleSet = new Set(memberRoles.map(String));
      for (const ow of overwrites) {
        const isRoleOw = (ow.type === 0 || ow.type === 'role') && String(ow.id) !== String(guild.id);
        if (isRoleOw && roleSet.has(String(ow.id))) {
          try {
            roleAllow |= BigInt(ow.allow ?? ow.allow_new ?? 0);
            roleDeny |= BigInt(ow.deny ?? ow.deny_new ?? 0);
          } catch {}
        }
      }
      perms &= ~roleDeny;
      perms |= roleAllow;

      if (userId) {
        const owMember = overwrites.find(o => String(o.id) === String(userId));
        if (owMember) {
          try {
            perms &= ~BigInt(owMember.deny ?? owMember.deny_new ?? 0);
            perms |= BigInt(owMember.allow ?? owMember.allow_new ?? 0);
          } catch {}
        }
      }
    }

    return (perms & VIEW_CHANNEL) === VIEW_CHANNEL;
  }

  buildCategorizedChannels(guildId) {
    const entry = this.guildChannels.get(guildId);
    if (!entry) return [];
    const { sections, uncategorized, bySection } = entry;
    const rows = [];

    for (const ch of uncategorized) {
      rows.push(ch);
    }

    for (const sec of sections) {
      const children = bySection.get(sec.id) || [];
      if (children.length === 0) continue; // Only show sections that contain accessible channels
      const isCollapsed = this.collapsedSections.has(sec.id);
      const secTitle = sanitizeAscii(sec.rawName || 'SECTION', 25).toUpperCase() || 'SECTION';
      rows.push({
        id: sec.id,
        name: `${isCollapsed ? '[+]' : '[v]'} ${secTitle}`,
        isSection: true,
        isCollapsed,
        position: sec.position,
        raw: sec.raw
      });
      if (!isCollapsed) {
        for (const ch of children) {
          rows.push(ch);
        }
      }
    }
    return rows;
  }

  async selectGuild(guildIdx) {
    if (guildIdx < 0 || guildIdx >= this.guilds.length) return;
    this.activeGuildIdx = guildIdx;
    if (guildIdx < this.guildWindowOffset) this.guildWindowOffset = guildIdx;
    if (guildIdx >= this.guildWindowOffset + 12) this.guildWindowOffset = guildIdx - 11;

    const guild = this.guilds[guildIdx];
    this.channelWindowOffset = 0;
    this.activeChannelIdx = 0;
    this.messageScrollOffset = 0;

    if (guild.isDm) {
      this.activeChannels = this.dmChannels;
    } else {
      if (!this.guildChannels.has(guild.id)) {
        try {
          // Fetch guild channels, guild roles, and current user's member roles in parallel
          // (matching DiscordGuild.prototype.load in discord-es5)
          const [chResp, rolesResp, memberResp] = await Promise.all([
            this.authorizedFetch(`/guilds/${guild.id}/channels`),
            this.authorizedFetch(`/guilds/${guild.id}/roles`).catch(() => null),
            this.user?.id
              ? this.authorizedFetch(`/guilds/${guild.id}/members/${this.user.id}`).catch(() => null)
              : Promise.resolve(null)
          ]);

          const roleMap = new Map();
          if (rolesResp && rolesResp.ok) {
            const rolesData = await rolesResp.json().catch(() => []);
            if (Array.isArray(rolesData)) {
              for (const r of rolesData) {
                roleMap.set(String(r.id), r);
              }
            }
          } else if (Array.isArray(guild.raw?.roles)) {
            for (const r of guild.raw.roles) {
              roleMap.set(String(r.id), r);
            }
          }

          let memberRoles = [];
          if (memberResp && memberResp.ok) {
            const memData = await memberResp.json().catch(() => null);
            if (memData && Array.isArray(memData.roles)) {
              memberRoles = memData.roles.map(String);
            }
          } else if (this.readyData && Array.isArray(this.readyData.guilds)) {
            const readyGuild = this.readyData.guilds.find(g => String(g.id) === String(guild.id));
            const myMem = Array.isArray(readyGuild?.members)
              ? readyGuild.members.find(m => String(m.user?.id || m.user_id) === String(this.user?.id))
              : null;
            if (myMem && Array.isArray(myMem.roles)) {
              memberRoles = myMem.roles.map(String);
            }
          }

          if (chResp.ok) {
            const chData = await chResp.json();
            if (Array.isArray(chData)) {
              // 1. Extract Category Sections (type === 4) sorted by position
              const rawSections = chData
                .filter(c => c.type === 4)
                .sort((a, b) => (a.position || 0) - (b.position || 0) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

              const sections = rawSections.map(s => ({
                id: String(s.id),
                rawName: s.name || 'Section',
                position: s.position || 0,
                raw: s
              }));
              const sectionIds = new Set(sections.map(s => s.id));

              // 2. Filter text/announcement channels (type 0, 5) to ONLY those the user can access
              const accessibleTextChs = chData
                .filter(c => (c.type === 0 || c.type === 5) && this.canAccessChannel(c, guild, memberRoles, roleMap, this.user?.id))
                .sort((a, b) => (a.position || 0) - (b.position || 0) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

              const uncategorized = [];
              const bySection = new Map();
              for (const s of sections) bySection.set(s.id, []);

              for (const c of accessibleTextChs) {
                const parentId = c.parent_id ? String(c.parent_id) : null;
                const formatted = {
                  id: String(c.id),
                  name: ' #' + (sanitizeAscii(c.name || 'channel', 27) || 'channel'),
                  cleanName: '#' + (sanitizeAscii(c.name || 'channel', 28) || 'channel'),
                  parentId,
                  position: c.position || 0,
                  type: c.type,
                  isSection: false,
                  raw: c
                };
                if (parentId && sectionIds.has(parentId)) {
                  bySection.get(parentId).push(formatted);
                } else {
                  uncategorized.push(formatted);
                }
              }

              this.guildChannels.set(guild.id, { sections, uncategorized, bySection });
            }
          }
        } catch (err) {
          console.error('[DISCORD] Failed to load guild channels:', err.message);
        }
      }
      this.activeChannels = this.buildCategorizedChannels(guild.id);
    }

    const firstRealIdx = this.activeChannels.findIndex(c => !c.isSection);
    if (firstRealIdx !== -1) {
      await this.selectChannel(firstRealIdx);
    } else if (this.activeChannels.length > 0) {
      this.activeChannelIdx = 0;
    }
  }

  async selectChannel(channelIdx) {
    if (channelIdx < 0 || channelIdx >= this.activeChannels.length) return false;
    const item = this.activeChannels[channelIdx];
    if (!item) return false;

    // If user clicked a Section Header row, toggle collapse/expand for that section!
    if (item.isSection) {
      const guild = this.guilds[this.activeGuildIdx];
      if (guild && !guild.isDm) {
        const currentSelectedId = this.activeChannels[this.activeChannelIdx]?.id;
        if (this.collapsedSections.has(item.id)) {
          this.collapsedSections.delete(item.id);
        } else {
          this.collapsedSections.add(item.id);
        }
        this.activeChannels = this.buildCategorizedChannels(guild.id);
        const restoredIdx = this.activeChannels.findIndex(c => c.id === currentSelectedId && !c.isSection);
        const secIdx = this.activeChannels.findIndex(c => c.id === item.id && c.isSection);
        if (restoredIdx !== -1) {
          this.activeChannelIdx = restoredIdx;
        } else if (secIdx !== -1) {
          this.activeChannelIdx = secIdx;
        }
        if (this.channelWindowOffset >= this.activeChannels.length) {
          this.channelWindowOffset = Math.max(0, this.activeChannels.length - 14);
        }
      }
      return false; // Did not open a chat channel (only toggled section)
    }

    this.activeChannelIdx = channelIdx;
    if (channelIdx < this.channelWindowOffset) this.channelWindowOffset = channelIdx;
    if (channelIdx >= this.channelWindowOffset + 14) this.channelWindowOffset = channelIdx - 13;
    this.messageScrollOffset = 0;

    await this.loadMessages(item.id);
    return true; // Opened a real chat channel
  }

  async loadMessages(channelId, limit = 25) {
    if (!channelId) return [];
    try {
      const resp = await this.authorizedFetch(`/channels/${channelId}/messages?limit=${limit}`);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          const sorted = data
            .slice()
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map(m => this.normalizeMessage(m));
          this.messagesByChannel.set(channelId, sorted);
          return sorted;
        }
      }
    } catch (err) {
      console.error('[DISCORD] loadMessages error:', err.message);
    }
    return this.messagesByChannel.get(channelId) || [];
  }

  async sendMessage(content) {
    const channel = this.activeChannels[this.activeChannelIdx];
    if (!channel || !content || !content.trim()) return false;
    try {
      const resp = await this.authorizedFetch(`/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() })
      });
      if (resp.ok) {
        const msgData = await resp.json();
        const list = this.messagesByChannel.get(channel.id) || [];
        list.push(this.normalizeMessage(msgData));
        this.messagesByChannel.set(channel.id, list);
        this.messageScrollOffset = 0;
        return true;
      }
    } catch (err) {
      console.error('[DISCORD] sendMessage error:', err.message);
    }
    return false;
  }

  async toggleReactionOnVisible(visibleSlotIdx) {
    const channel = this.activeChannels[this.activeChannelIdx];
    if (!channel) return false;
    const visible = this.getVisibleMessages();
    const target = visible[visibleSlotIdx];
    if (!target) return false;

    const emoji = encodeURIComponent('👍');
    const method = target.hasMyThumb ? 'DELETE' : 'PUT';
    try {
      const resp = await this.authorizedFetch(
        `/channels/${channel.id}/messages/${target.id}/reactions/${emoji}/@me`,
        { method }
      );
      if (resp.ok || resp.status === 204) {
        await this.loadMessages(channel.id);
        return true;
      }
    } catch (err) {
      console.error('[DISCORD] toggleReaction error:', err.message);
    }
    return false;
  }

  connectGateway() {
    if (typeof WebSocket === 'undefined' || !this.token) return;
    if (this.socket && this.gatewayState === 1) return;

    try {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.socket) {
        try { this.socket.close(); } catch {}
      }

      this.gatewayState = 2;
      const ws = new WebSocket(GATEWAY_URL);
      this.socket = ws;

      ws.onopen = () => {
        this.gatewayState = 1;
        ws.send(JSON.stringify({
          op: OperationCodes.Identify,
          d: {
            token: this.token,
            properties: {
              os: 'windows',
              browser: 'chrome',
              device: 'desktop'
            }
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString('utf8'));
          if (data.op === OperationCodes.Hello && data.d?.heartbeat_interval) {
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = setInterval(() => {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ op: OperationCodes.Heartbeat, d: this.socketLastSequence || null }));
              }
            }, data.d.heartbeat_interval);
          } else if (data.op === OperationCodes.Heartbeat) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ op: OperationCodes.Heartbeat, d: this.socketLastSequence || null }));
            }
          } else if (data.op === OperationCodes.Dispatch) {
            this.socketLastSequence = data.s;
            if (data.t === 'READY') {
              this.readyData = data.d;
            } else if (data.t === 'MESSAGE_CREATE' && data.d?.channel_id) {
              const chId = String(data.d.channel_id);
              if (this.messagesByChannel.has(chId)) {
                const list = this.messagesByChannel.get(chId);
                if (!list.some(m => m.id === String(data.d.id))) {
                  list.push(this.normalizeMessage(data.d));
                }
              }
            } else if (data.t === 'MESSAGE_UPDATE' && data.d?.channel_id) {
              const chId = String(data.d.channel_id);
              const list = this.messagesByChannel.get(chId);
              if (list) {
                const idx = list.findIndex(m => m.id === String(data.d.id));
                if (idx !== -1) {
                  list[idx] = this.normalizeMessage({ ...list[idx].raw, ...data.d });
                }
              }
            } else if (data.t === 'MESSAGE_DELETE' && data.d?.channel_id) {
              const chId = String(data.d.channel_id);
              const list = this.messagesByChannel.get(chId);
              if (list) {
                const idx = list.findIndex(m => m.id === String(data.d.id));
                if (idx !== -1) list.splice(idx, 1);
              }
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        this.gatewayState = 0;
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
      };

      ws.onerror = () => {
        this.gatewayState = 0;
      };
    } catch {
      this.gatewayState = 0;
    }
  }

  getVisibleMessages() {
    const channel = this.activeChannels[this.activeChannelIdx];
    const all = (channel && this.messagesByChannel.get(channel.id)) || [];
    if (all.length <= 5) return all;
    const maxScroll = Math.max(0, all.length - 5);
    const clampedScroll = Math.max(0, Math.min(this.messageScrollOffset, maxScroll));
    const startIdx = Math.max(0, all.length - 5 - clampedScroll);
    return all.slice(startIdx, startIdx + 5);
  }

  buildGpuBuffer() {
    const buf = Buffer.alloc(2240);
    const visGuilds = this.guilds.slice(this.guildWindowOffset, this.guildWindowOffset + 12);
    const visChannels = this.activeChannels.slice(this.channelWindowOffset, this.channelWindowOffset + 14);
    const channel = this.activeChannels[this.activeChannelIdx];
    const allMsgs = (channel && this.messagesByChannel.get(channel.id)) || [];
    const visMsgs = this.getVisibleMessages();

    const relGuildIdx = Math.max(0, Math.min(11, this.activeGuildIdx - this.guildWindowOffset));
    const relChannelIdx = Math.max(0, Math.min(13, this.activeChannelIdx - this.channelWindowOffset));

    // Header (64 bytes)
    buf.writeUInt32LE(this.status >>> 0, 0);
    buf.writeUInt32LE(visGuilds.length >>> 0, 4);
    buf.writeUInt32LE(visChannels.length >>> 0, 8);
    buf.writeUInt32LE(visMsgs.length >>> 0, 12);
    buf.writeUInt32LE(relGuildIdx >>> 0, 16);
    buf.writeUInt32LE(relChannelIdx >>> 0, 20);
    buf.writeUInt32LE(this.guilds.length >>> 0, 24);
    buf.writeUInt32LE(this.activeChannels.length >>> 0, 28);
    buf.writeUInt32LE(allMsgs.length >>> 0, 32);
    buf.writeUInt32LE(this.gatewayState >>> 0, 36);

    const userTag = this.user ? `@${this.user.username}` : 'Not Logged In';
    buf.write(userTag.slice(0, 23), 40, 24, 'utf8');

    // Guilds (12 * 32 = 384 bytes at offset 64)
    for (let i = 0; i < visGuilds.length; i++) {
      buf.write(visGuilds[i].name.slice(0, 31), 64 + i * 32, 32, 'utf8');
    }

    // Channels (14 * 32 = 448 bytes at offset 448)
    for (let i = 0; i < visChannels.length; i++) {
      const chItem = visChannels[i];
      buf.write(chItem.name.slice(0, 30), 448 + i * 32, 30, 'utf8');
      let chFlags = 0;
      if (chItem.isSection) {
        chFlags = 1 | (chItem.isCollapsed ? 2 : 0);
      }
      buf[448 + i * 32 + 31] = chFlags;
    }

    // Active Header Banner (64 bytes at offset 896)
    let banner = this.statusDetail;
    if (this.status === 2) {
      const gName = this.guilds[this.activeGuildIdx]?.name || 'Discord';
      const cName = (channel?.cleanName || channel?.name || '(no channel)').trim();
      const gwStr = this.gatewayState === 1 ? 'LIVE' : 'REST';
      banner = `${gName}  >  ${cName}  [${gwStr}]`;
    }
    buf.write(sanitizeAscii(banner, 63), 896, 64, 'utf8');

    // Messages (5 * 256 = 1280 bytes at offset 960)
    for (let i = 0; i < visMsgs.length; i++) {
      const m = visMsgs[i];
      const base = 960 + i * 256;
      buf.write(m.author.slice(0, 23), base + 0, 24, 'utf8');
      buf.write(m.timestamp.slice(0, 15), base + 24, 16, 'utf8');
      buf.write(m.badge.slice(0, 15), base + 40, 16, 'utf8');
      buf.write((m.lines[0] || '').slice(0, 59), base + 56, 60, 'utf8');
      buf.write((m.lines[1] || '').slice(0, 59), base + 116, 60, 'utf8');
      buf.write((m.lines[2] || '').slice(0, 59), base + 176, 60, 'utf8');
      const flags = (m.isMe ? 1 : 0) | (m.hasMyThumb ? 2 : 0) | ((Math.min(255, m.totalReactions) & 0xff) << 8);
      buf.writeUInt32LE(flags >>> 0, base + 236);
    }

    return buf;
  }

  async handleAction({ action = 0, arg = 0, fsService, swkbdService }) {
    if (this.checkServerFileUpdate()) {
      this.status = 0;
    }
    if (this.pendingServerTokenSync && this.token && fsService) {
      this.pendingServerTokenSync = false;
      await this.persistTokenToS2Save(this.token, fsService);
    }

    if (action === 0) {
      // Init or Refresh
      if (this.status !== 2) {
        await this.connect(fsService);
      } else {
        const channel = this.activeChannels[this.activeChannelIdx];
        if (channel) await this.loadMessages(channel.id);
      }
    } else if (action === 1) {
      // Select Guild (relative to current window or absolute)
      const targetGuildIdx = this.guildWindowOffset + (arg & 0xff);
      if (targetGuildIdx >= 0 && targetGuildIdx < this.guilds.length) {
        await this.selectGuild(targetGuildIdx);
      }
    } else if (action === 2) {
      // Select Channel (relative to current window)
      const targetChIdx = this.channelWindowOffset + (arg & 0xff);
      if (targetChIdx >= 0 && targetChIdx < this.activeChannels.length) {
        await this.selectChannel(targetChIdx);
      }
    } else if (action === 3) {
      // Scroll Messages (arg = 1 for older/up, arg = 2 for newer/down)
      const channel = this.activeChannels[this.activeChannelIdx];
      const allMsgs = (channel && this.messagesByChannel.get(channel.id)) || [];
      const maxScroll = Math.max(0, allMsgs.length - 5);
      if (arg === 1) {
        this.messageScrollOffset = Math.min(maxScroll, this.messageScrollOffset + 1);
      } else if (arg === 2) {
        this.messageScrollOffset = Math.max(0, this.messageScrollOffset - 1);
      }
    } else if (action === 4) {
      // Toggle thumbs-up reaction on visible message slot arg
      await this.toggleReactionOnVisible(arg & 0x07);
    } else if (action === 5) {
      // Compose & Send Message via S2 Native Software Keyboard
      if (swkbdService && this.status === 2) {
        const chName = this.activeChannels[this.activeChannelIdx]?.name || 'channel';
        const kbdRes = await swkbdService.show({
          headerText: `Discord - Send to ${chName}`,
          guideText: 'Type your Discord message...',
          okText: 'Send'
        });
        if (kbdRes.result === 0 && kbdRes.text && kbdRes.text.trim().length > 0) {
          await this.sendMessage(kbdRes.text.trim());
        }
      }
    } else if (action === 6) {
      // Enter / Update Discord JWT Token via S2 Native Software Keyboard (or reload from file)
      if (swkbdService) {
        const kbdRes = await swkbdService.show({
          headerText: 'Discord JWT Token Login',
          subText: 'Or place token in discord-token.txt on server',
          guideText: 'Paste or type your Discord token...',
          okText: 'Login',
          initialText: ''
        });
        if (kbdRes.result === 0 && kbdRes.text && kbdRes.text.trim().length > 20) {
          await this.saveToken(kbdRes.text.trim(), fsService);
          await this.connect(fsService);
        } else {
          // Even if cancelled on swkbd, re-check discord-token.txt & tmp:/discord_token.txt!
          this.token = null;
          await this.connect(fsService);
        }
      } else {
        this.token = null;
        await this.connect(fsService);
      }
    } else if (action === 7) {
      // Page Guilds or Channels window:
      // arg = 1: Guilds window up, 2: Guilds window down, 3: Channels window up, 4: Channels window down
      if (arg === 1 && this.guildWindowOffset > 0) {
        this.guildWindowOffset--;
      } else if (arg === 2 && this.guildWindowOffset + 12 < this.guilds.length) {
        this.guildWindowOffset++;
      } else if (arg === 3 && this.channelWindowOffset > 0) {
        this.channelWindowOffset--;
      } else if (arg === 4 && this.channelWindowOffset + 14 < this.activeChannels.length) {
        this.channelWindowOffset++;
      }
    }

    return this.buildGpuBuffer();
  }
}

const singleton = new S2DiscordClient();
module.exports = singleton;
