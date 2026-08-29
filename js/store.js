// 本地存储层：providers / sessions / messages / persona / background
const LS = {
  get(k, d) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch { return d; }
  },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

export function defaultProviders() {
  return [
    { id: 'deepseek', label: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat', enabled: true },
    { id: 'openai', label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', enabled: true },
    { id: 'claude', label: 'Claude', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: '', model: 'claude-sonnet-4-20250514', enabled: true },
    { id: 'gemini', label: 'Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: '', model: 'gemini-2.0-flash', enabled: true },
    { id: 'kimi', label: 'Kimi 月之暗面', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', model: 'moonshot-v1-128k', enabled: true },
    { id: 'glm', label: '智谱 GLM', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-4-flash', enabled: true },
    { id: 'qwen', label: '通义千问', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', model: 'qwen-plus', enabled: true },
    { id: 'doubao', label: '豆包', protocol: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '', model: 'doubao-pro-32k', enabled: true },
  ];
}

const SKILL_LABELS = {
  ziwei_analysis: '紫微斗数', western_astrology: '西方占星', vedic_astrology: '印度占星',
  liuyao_divination: '六爻', meihua_divination: '梅花易数', tarot_reading: '塔罗牌',
  lenormand_reading: '雷诺曼卡', qimen_analysis: '奇门遁甲',
};
export const skillLabel = (n) => SKILL_LABELS[n] || n;

const MAX_PERSIST = 120;

export const Store = {
  init() {
    if (!LS.get('witch.providers')) LS.set('witch.providers', defaultProviders());
    if (!LS.get('witch.sessions')) {
      const s = { id: newId(), title: '新对话', updatedAt: Date.now() };
      LS.set('witch.sessions', [s]);
      LS.set('witch.activeSessionId', s.id);
      LS.set('witch.msgs_' + s.id, []);
    }
    // 清理孤儿消息
    const ids = new Set(this.sessions().map((s) => s.id));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k.startsWith('witch.msgs_') && !ids.has(k.slice(11))) localStorage.removeItem(k);
    }
  },

  providers() { return LS.get('witch.providers', defaultProviders()); },
  saveProviders(list) { LS.set('witch.providers', list); },
  provider(id) { return this.providers().find((p) => p.id === id); },
  upsertProvider(cfg) {
    const list = this.providers();
    const i = list.findIndex((p) => p.id === cfg.id);
    if (i >= 0) list[i] = cfg; else list.push(cfg);
    this.saveProviders(list);
  },
  deleteProvider(id) { this.saveProviders(this.providers().filter((p) => p.id !== id)); },
  newCustomId() { return 'custom_' + Date.now().toString(36); },

  activeCfg() {
    const id = LS.get('witch.activeProviderId', 'deepseek');
    const p = this.provider(id);
    return p && p.enabled && p.apiKey ? p : null;
  },
  setActiveProvider(id) { LS.set('witch.activeProviderId', id); },
  activeProviderId() { return LS.get('witch.activeProviderId', 'deepseek'); },

  sessions() { return LS.get('witch.sessions', []); },
  activeSessionId() { return LS.get('witch.activeSessionId'); },
  messages() { return LS.get('witch.msgs_' + this.activeSessionId(), []); },

  newSession(persist = true) {
    if (persist) this.flushMessages();
    const s = { id: newId(), title: '新对话', updatedAt: Date.now() };
    const list = this.sessions();
    list.unshift(s);
    LS.set('witch.sessions', list);
    LS.set('witch.activeSessionId', s.id);
    LS.set('witch.msgs_' + s.id, []);
    return s;
  },
  openSession(id) {
    this.flushMessages();
    LS.set('witch.activeSessionId', id);
  },
  deleteSession(id) {
    localStorage.removeItem('witch.msgs_' + id);
    let list = this.sessions().filter((s) => s.id !== id);
    LS.set('witch.sessions', list);
    if (this.activeSessionId() === id) {
      if (!list.length) { this.newSession(false); return; }
      this.openSession(list[0].id);
    }
  },
  touchSession(firstUserText) {
    const list = this.sessions();
    const s = list.find((x) => x.id === this.activeSessionId());
    if (!s) return;
    if (s.title === '新对话' && firstUserText) s.title = firstUserText.slice(0, 16);
    s.updatedAt = Date.now();
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    LS.set('witch.sessions', list);
  },
  flushMessages() {
    const cur = this._pendingMsgs ?? this.messages();
    LS.set('witch.msgs_' + this.activeSessionId(), cur.slice(-MAX_PERSIST));
    this._pendingMsgs = null;
  },
  setMessages(msgs) { this._pendingMsgs = msgs; },
  appendMessage(msg) {
    const cur = this._pendingMsgs ?? this.messages();
    cur.push(msg);
    this._pendingMsgs = cur;
  },
  updateLastMessage(msg) {
    const cur = this._pendingMsgs ?? this.messages();
    if (cur.length) cur[cur.length - 1] = msg;
    this._pendingMsgs = cur;
  },
  clearMessages() { this.setMessages([]); this.flushMessages(); },

  persona() { return LS.get('witch.persona', ''); },
  savePersona(t) { LS.set('witch.persona', t); },
  bg() { return LS.get('witch.bg', { data: '', blur: 14 }); },
  saveBg(bg) { LS.set('witch.bg', bg); },
};

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 与安卓一致的等待词
export const WAIT_LINES = [
  '女巫正在洗牌 🃏', '女巫把牌洗掉地上了', '女巫把牌捡起来', '女巫还在抽牌',
  '女巫抽出了牌', '女巫正在研究牌面是什么意思', '女巫有点头晕', '女巫睡着了 😴',
  '女巫开始说梦话了 💤',
];

export const DEFAULT_PERSONA_PROMPT = null; // 运行时由 prompt.js 提供
