// ===== App 主逻辑：路由 / 聊天 / 设置 =====
import { Store, skillLabel, WAIT_LINES, newId } from './store.js';
import { mdToHtml } from './md.js';
import { TOOLS } from './tools.js';
import { runSkill } from './engines.js';
import { chat, ping } from './llm.js';
import { SYSTEM_PROMPT } from './prompt.js';

const $ = (id) => document.getElementById(id);
const screen = $('screen');
const topTitle = $('tb-name'), topSub = $('tb-cfg'), topBack = $('btn-back'), topGear = $('btn-gear'), topAvatar = document.querySelector('#topbar .avatar');
const statusChip = $('status-chip'), inputWrap = $('inputwrap'), inputEl = $('chat-input'), sendBtn = $('btn-send');
const toast = $('toast');

let routeStack = ['chat'];
let sending = false;
let waitTimer = null, waitIdx = 0, waitEl = null;
let pinned = true;

// ---------- 基础 UI ----------
function showToast(msg, ms = 2400) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), ms);
}

function applyBackground() {
  const bg = Store.bg();
  const img = $('bg-image');
  if (bg.data) { img.src = bg.data; img.style.display = 'block'; img.style.filter = bg.blur > 0.5 ? `blur(${bg.blur}px)` : 'none'; }
  else img.style.display = 'none';
}

function scrollBottom(force) {
  if (!force && !pinned) return;
  requestAnimationFrame(() => { screen.scrollTop = screen.scrollHeight; });
}
screen.addEventListener('scroll', () => {
  pinned = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 80;
});

function startWaiting() {
  waitIdx = Math.floor(Math.random() * WAIT_LINES.length);
  waitEl = document.createElement('div');
  waitEl.className = 'msg witch';
  waitEl.innerHTML = '<div class="avatar">巫</div><div class="bubble witch-bubble bubble-waiting"><span class="wait-text"></span><span class="dots"><i></i><i></i><i></i></span></div>';
  screen.appendChild(waitEl);
  const t = waitEl.querySelector('.wait-text');
  const tick = () => { t.textContent = WAIT_LINES[waitIdx % WAIT_LINES.length]; waitIdx++; };
  tick();
  waitTimer = setInterval(tick, 2200);
  scrollBottom(true);
}
function stopWaiting() {
  clearInterval(waitTimer); waitTimer = null;
  if (waitEl) { waitEl.remove(); waitEl = null; }
}
function showStatus(text) {
  statusChip.textContent = text ? `✦ ${text} ✦` : '';
  statusChip.classList.toggle('show', !!text);
}

// ---------- 聊天渲染 ----------
function msgNode(m) {
  const row = document.createElement('div');
  if (m.role === 'user') {
    row.className = 'msg me';
    row.innerHTML = `<div class="bubble user-bubble">${mdToHtml(m.content)}</div>`;
  } else if (m.role === 'tool') {
    return null; // 工具原始结果不直接展示
  } else if (m.toolCalls && m.toolCalls.length) {
    return null; // 中间轮次（带工具调用）不直接展示，只展示最终回复
  } else {
    row.className = 'msg witch' + (m.isError ? ' error' : '');
    const body = m.isError ? m.content : mdToHtml(m.content);
    row.innerHTML = `<div class="avatar">巫</div><div class="bubble witch-bubble">${body}</div>`;
  }
  return row;
}

function renderChat() {
  screen.innerHTML = '';
  const msgs = Store.messages();
  if (!msgs.length) {
    const hint = document.createElement('div');
    hint.className = 'hint-center';
    hint.innerHTML = '🔮 水晶球已经亮了<br><br>告诉我你想问什么——<br>问运势报生辰（阳历年月日+几点），<br>问事情直接说事，抽牌也行。';
    screen.appendChild(hint);
    return;
  }
  for (const m of msgs) {
    const n = msgNode(m);
    if (n) screen.appendChild(n);
  }
  scrollBottom(true);
}

function appendNode(m) {
  const hint = screen.querySelector('.hint-center');
  if (hint) hint.remove();
  const n = msgNode(m);
  if (n) { screen.appendChild(n); scrollBottom(); }
  return n;
}

// ---------- 发送循环 ----------
function setActiveBar() {
  const cfg = Store.activeCfg();
  topSub.textContent = cfg ? `${cfg.label} · ${cfg.model}` : '未配置 API';
}

async function send(text) {
  text = (text || '').trim();
  if (!text || sending) return;
  sending = true;
  inputEl.value = '';
  autoGrow();

  const userMsg = { role: 'user', content: text, ts: Date.now() };
  Store.appendMessage(userMsg);
  appendNode(userMsg);
  Store.touchSession(text);

  const cfg = Store.activeCfg();
  if (!cfg) {
    const err = { role: 'assistant', isError: true, content: '还没有配置 API Key。进设置 → AI 服务商，填上 Key 就能开聊（推荐 DeepSeek，便宜好用）。', ts: Date.now() };
    Store.appendMessage(err);
    appendNode(err);
    sending = false;
    return;
  }

  startWaiting();
  try {
    for (let turn = 0; turn < 6; turn++) {
      const persona = Store.persona() || SYSTEM_PROMPT;
      const history = Store.messages().slice(-30).map(({ role, content, name, toolCalls, callId }) => ({ role, content, name, toolCalls, callId }));
      // 最多 5 轮工具调用，最后一轮强制不带工具，保证一定出解读结果
      const toolsThisTurn = turn < 5 ? TOOLS : null;
      const r = await chat(cfg, history, persona, toolsThisTurn, null);

      if (r.toolCalls && r.toolCalls.length) {
        stopWaiting();
        const asst = { role: 'assistant', content: r.text || '', toolCalls: r.toolCalls, ts: Date.now() };
        Store.appendMessage(asst);
        for (const tc of r.toolCalls) {
          let args = {};
          try { args = JSON.parse(tc.arguments || '{}'); } catch { args = {}; }
          showStatus(`正在起盘 · ${skillLabel(tc.name)}`);
          const result = runSkill(tc.name, args);
          await new Promise((res) => setTimeout(res, 420)); // 起盘留一点仪式感
          const toolMsg = { role: 'tool', name: tc.name, callId: tc.id, content: JSON.stringify(result), ts: Date.now() };
          Store.appendMessage(toolMsg);
        }
        showStatus('');
        startWaiting(); // 下一轮解读
        continue;
      }

      stopWaiting();
      showStatus('');
      if (r.text) {
        const asst = { role: 'assistant', content: r.text, ts: Date.now() };
        Store.appendMessage(asst);
        if (liveEl) { liveEl.remove(); }
        appendNode(asst);
      }
      Store.flushMessages();
      break;
    }
  } catch (e) {
    stopWaiting();
    showStatus('');
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
    if (!aborted) {
      const err = { role: 'assistant', isError: true, content: '⚠ 连接出问题了：' + (e.message || e), ts: Date.now() };
      Store.appendMessage(err);
      appendNode(err);
    }
  }
  Store.flushMessages();
  sending = false;
}

sendBtn.addEventListener('click', () => send(inputEl.value));
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(inputEl.value); }
});
function autoGrow() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}
inputEl.addEventListener('input', autoGrow);

// ---------- 路由 ----------
function setTop(title, sub, { back = false, gear = false, avatar = false } = {}) {
  topTitle.textContent = title;
  topSub.textContent = sub || '';
  topBack.classList.toggle('hidden', !back);
  topGear.classList.toggle('hidden', !gear);
  topAvatar.classList.toggle('hidden', !avatar);
}
function showChatBar(show) {
  inputWrap.classList.toggle('hidden', !show);
}
function push(builder) { routeStack.push(builder); render(); }
function pop() { if (routeStack.length > 1) { routeStack.pop(); render(); } }
function render() {
  const top = routeStack[routeStack.length - 1];
  top();
}

topBack.addEventListener('click', pop);
topGear.addEventListener('click', () => push(settingsHome));

// ---------- 通用组件 ----------
function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}
function page(title, subtitle) {
  screen.innerHTML = '';
  setTop(title, subtitle || '', { back: true });
  showChatBar(false);
  showStatus('');
  const wrap = el('<div class="page"></div>');
  screen.appendChild(wrap);
  return wrap;
}
function card(inner, cls = '') {
  return el(`<div class="card ${cls}">${inner}</div>`);
}

// ---------- 设置：首页 ----------
function settingsHome() {
  const w = page('设置');
  const cfg = Store.activeCfg();
  const act = Store.provider(Store.activeProviderId());
  w.appendChild(card(`<div class="kv"><span>🔮 AI 服务商</span><span class="chev">›</span></div><div class="sub">${act ? act.label + ' · ' + act.model : '未配置，点进去填 Key'}</div>`, 'tappable'));
  w.lastElementChild.addEventListener('click', () => push(providersScreen));
  w.appendChild(card(`<div class="kv"><span>🎭 人设提示词</span><span class="chev">›</span></div><div class="sub">${Store.persona() ? '自定义' : '女巫默认人设'}</div>`, 'tappable'));
  w.lastElementChild.addEventListener('click', () => push(personaScreen));
  w.appendChild(card(`<div class="kv"><span>🖼 聊天背景</span><span class="chev">›</span></div><div class="sub">${Store.bg().data ? '自定义图片' : '默认星云夜空'}</div>`, 'tappable'));
  w.lastElementChild.addEventListener('click', () => push(backgroundScreen));
  w.appendChild(card(`<div class="kv"><span>🛡 隐私说明</span><span class="chev">›</span></div>`, 'tappable'));
  w.lastElementChild.addEventListener('click', () => push(privacyScreen));
  w.appendChild(card(`<div class="kv"><span>♥ 捐赠支持</span><span class="chev">›</span></div><div class="sub">如果女巫的梦话对你有帮助</div>`, 'tappable'));
  w.lastElementChild.addEventListener('click', () => push(donateScreen));
  w.appendChild(card(`<div class="kv"><span>📖 关于 · 安装教程</span><span class="chev">›</span></div><div class="sub">Web v1.0.0</div>`, 'tappable'));
  w.lastElementChild.addEventListener('click', () => push(aboutScreen));
  w.appendChild(card(`<div class="btn danger" id="clear-btn">清空当前对话</div>`));
  w.querySelector('#clear-btn').addEventListener('click', () => {
    if (confirm('当前会话的聊天记录将无法恢复（其他历史对话不受影响）。确定清空？')) {
      Store.clearMessages();
      showToast('已清空当前对话');
      pop(); renderChat();
    }
  });
  const note = el('<div class="note">所有数据只保存在这台设备的浏览器里，清除浏览器数据 = 恢复出厂。</div>');
  w.appendChild(note);
}

// ---------- 设置：服务商列表 ----------
function providersScreen() {
  const w = page('AI 服务商', '填入你自己的 API Key');
  w.appendChild(el('<div class="note">Key 只保存在你的浏览器本地，请求由你的浏览器直连服务商，不经过本站服务器。</div>'));
  for (const p of Store.providers()) {
    const dotCls = p.apiKey ? (p.enabled ? 'on' : 'off') : 'nokey';
    const row = card(`
      <div class="session-row"><span class="dot ${dotCls}"></span>
        <div style="flex:1"><b>${p.label}</b><div class="sub">${p.model}${Store.activeProviderId() === p.id ? ' · 当前使用' : ''}</div></div>
        <span class="chev">›</span></div>`, 'tappable');
    row.addEventListener('click', () => push(() => providerEdit(p.id)));
    w.appendChild(row);
  }
  const add = el('<div class="btn ghost" style="margin-top:10px">＋ 自定义服务商</div>');
  add.addEventListener('click', () => push(() => providerEdit(Store.newCustomId())));
  w.appendChild(add);
}

// ---------- 设置：服务商编辑 ----------
function providerEdit(id) {
  const isNew = !Store.provider(id);
  const p = Store.provider(id) || { id, label: '自定义', protocol: 'openai', baseUrl: '', apiKey: '', model: '', enabled: true };
  const w = page(isNew ? '新增服务商' : p.label);

  const c = card(`
    <label class="fl">名称</label><input class="field" id="f-label" value="${p.label}">
    <label class="fl">API Key</label>
    <div class="keyrow"><input class="field" id="f-key" type="password" value="${p.apiKey || ''}" placeholder="sk-..."><button class="eye" id="f-eye">👁</button></div>
    <label class="fl">模型</label><input class="field" id="f-model" value="${p.model || ''}" placeholder="如 deepseek-chat">
    <label class="fl">接口地址 Base URL</label><input class="field" id="f-url" value="${p.baseUrl || ''}" placeholder="https://api.example.com/v1">
    <label class="fl">协议类型</label>
    <div class="chips" id="f-proto">
      <button class="chip" data-v="openai">OpenAI 兼容</button>
      <button class="chip" data-v="anthropic">Claude</button>
      <button class="chip" data-v="gemini">Gemini</button>
    </div>
    <div class="kv" style="margin-top:12px"><span>启用</span><input type="checkbox" id="f-en" ${p.enabled ? 'checked' : ''} class="switch"></div>
    <div class="rowbtns">
      <button class="btn ghost" id="f-test">测试连接</button>
      <span id="f-status" class="sub"></span>
    </div>
    <button class="btn" id="f-save">保存</button>
    ${!isNew ? '<button class="btn ghost" id="f-active">设为当前使用</button>' : ''}
    ${p.id.startsWith('custom_') ? '<button class="btn danger" id="f-del">删除此服务商</button>' : ''}
  `);
  w.appendChild(c);

  let protocol = p.protocol;
  const syncChips = () => c.querySelectorAll('#f-proto .chip').forEach((b) => b.classList.toggle('active', b.dataset.v === protocol));
  c.querySelectorAll('#f-proto .chip').forEach((b) => b.addEventListener('click', () => { protocol = b.dataset.v; syncChips(); }));
  syncChips();
  c.querySelector('#f-eye').addEventListener('click', () => {
    const k = c.querySelector('#f-key');
    k.type = k.type === 'password' ? 'text' : 'password';
  });
  c.querySelector('#f-test').addEventListener('click', async () => {
    const testCfg = {
      protocol, label: 'test',
      baseUrl: c.querySelector('#f-url').value.trim() || (protocol === 'openai' ? 'https://api.deepseek.com/v1' : protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://generativelanguage.googleapis.com/v1beta'),
      apiKey: c.querySelector('#f-key').value.trim(),
      model: c.querySelector('#f-model').value.trim() || 'gpt-4o-mini',
    };
    const st = c.querySelector('#f-status');
    st.textContent = '测试中…';
    const r = await ping(testCfg);
    st.textContent = r.ok ? `✓ 连通（${(r.ms / 1000).toFixed(1)}s）` : `✕ ${r.error}`;
  });
  c.querySelector('#f-save').addEventListener('click', () => {
    const cfg = {
      id: p.id, protocol, enabled: c.querySelector('#f-en').checked,
      label: c.querySelector('#f-label').value.trim() || '未命名',
      apiKey: c.querySelector('#f-key').value.trim(),
      model: c.querySelector('#f-model').value.trim(),
      baseUrl: c.querySelector('#f-url').value.trim(),
    };
    if (!cfg.model) { showToast('模型名不能为空'); return; }
    if (!cfg.baseUrl) {
      cfg.baseUrl = protocol === 'openai' ? 'https://api.deepseek.com/v1' : protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://generativelanguage.googleapis.com/v1beta';
    }
    if (isNew && !cfg.apiKey) { showToast('先填 API Key 才能用'); }
    Store.upsertProvider(cfg);
    if (isNew || !Store.provider(Store.activeProviderId())) Store.setActiveProvider(cfg.id);
    showToast('已保存');
    pop(); push(providersScreen); routeStack.pop(); // 回到列表
  });
  const act = c.querySelector('#f-active');
  if (act) act.addEventListener('click', () => {
    Store.setActiveProvider(p.id);
    showToast('已设为当前使用'); pop();
  });
  const del = c.querySelector('#f-del');
  if (del) del.addEventListener('click', () => {
    if (confirm('确定删除该服务商？')) { Store.deleteProvider(p.id); showToast('已删除'); pop(); }
  });
}

// ---------- 设置：人设 ----------
function personaScreen() {
  const w = page('人设提示词', '留空使用女巫默认人设');
  const c = card(`
    <textarea class="field persona" id="p-text" placeholder="（使用女巫默认人设）"></textarea>
    <div class="rowbtns">
      <button class="btn" id="p-save">保存</button>
      <button class="btn ghost" id="p-reset">恢复默认</button>
    </div>`);
  w.appendChild(c);
  const ta = c.querySelector('#p-text');
  ta.value = Store.persona();
  c.querySelector('#p-save').addEventListener('click', () => { Store.savePersona(ta.value.trim()); showToast('已保存'); pop(); });
  c.querySelector('#p-reset').addEventListener('click', () => { Store.savePersona(''); ta.value = ''; showToast('已恢复女巫默认人设'); });
  w.appendChild(el('<div class="note">默认人设：直来直去的神秘女巫，说梦话，但句句真东西。想换风格就自己写一段。</div>'));
}

// ---------- 设置：背景 ----------
function backgroundScreen() {
  const w = page('聊天背景', '图片只存本地浏览器');
  let blur = Store.bg().blur || 0;
  const c = card(`
    <div class="bg-preview" id="bg-prev"></div>
    <div class="slider-row"><span class="sl-label">背景模糊</span>
      <input type="range" id="bg-blur" min="0" max="24" step="1" value="${blur}">
      <span class="sl-val" id="bg-blur-v">${blur < 1 ? '关闭' : blur}</span></div>
    <div class="rowbtns">
      <button class="btn" id="bg-pick">选择图片</button>
      <button class="btn ghost" id="bg-clear">恢复默认星空</button>
    </div>
    <input type="file" id="bg-file" accept="image/*" class="hidden">
  `);
  w.appendChild(c);
  const prev = c.querySelector('#bg-prev');
  const data = Store.bg().data;
  if (data) { prev.style.backgroundImage = `url(${data})`; prev.textContent = ''; }
  const file = c.querySelector('#bg-file');
  c.querySelector('#bg-pick').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const d = cv.toDataURL('image/jpeg', 0.85);
      prev.style.backgroundImage = `url(${d})`; prev.textContent = '';
      Store.saveBg({ data: d, blur });
      applyBackground();
      showToast('背景已更新');
    };
    img.src = URL.createObjectURL(f);
  });
  const slider = c.querySelector('#bg-blur'), val = c.querySelector('#bg-blur-v');
  slider.addEventListener('input', () => {
    blur = +slider.value;
    val.textContent = blur < 1 ? '关闭' : blur;
    if (Store.bg().data) prev.style.filter = blur > 0 ? `blur(${blur / 2}px)` : 'none';
  });
  slider.addEventListener('change', () => {
    const bg = Store.bg(); bg.blur = blur;
    Store.saveBg(bg); applyBackground();
  });
  c.querySelector('#bg-clear').addEventListener('click', () => {
    Store.saveBg({ data: '', blur: 0 });
    prev.style.backgroundImage = 'none'; prev.textContent = '预览';
    applyBackground();
    showToast('已恢复默认星空');
  });
  w.appendChild(el('<div class="note">图片压缩后仅保存在浏览器 localStorage，不上传任何服务器。调大模糊可让文字更清晰。</div>'));
}

// ---------- 隐私说明 ----------
function privacyScreen() {
  const w = page('隐私说明', '数据去哪了，一次说清');
  w.appendChild(card(`
    <p><b>1. 这个网站本身</b><br>纯静态页面，托管在 GitHub Pages 上。我们没有任何后端服务器，<b>不收集、不存储、看不到你的任何数据</b>。</p>
    <p><b>2. 你的聊天记录与生辰</b><br>只保存在你设备的浏览器 localStorage 里。清除浏览器数据即彻底删除。</p>
    <p><b>3. API Key</b><br>只存在你的浏览器里。解读时，你的浏览器<b>直连</b>你填的 AI 服务商（DeepSeek/OpenAI/Claude/Gemini…），请求不经过本站。</p>
    <p><b>4. 占卜引擎</b><br>六门术数的排盘计算全部在你的浏览器本地完成（JavaScript），断网也能起卦，只有 AI 解读需要联网。</p>
    <p><b>5. 平台侧</b><br>如所有网站一样，托管平台（GitHub）会记录访问 IP 等日志，这是平台行为，与本站无关。</p>
  `));
}

// ---------- 捐赠 ----------
function donateScreen() {
  const w = page('捐赠支持', '♥');
  w.appendChild(el('<div class="donate-title">♥ 感谢你听到女巫的梦话</div>'));
  const img = el(`<img class="qr-img" src="./assets/donate_qr.png" alt="赞赏码">`);
  w.appendChild(img);
  const btn = el('<div class="btn">保存收款码到相册</div>');
  btn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = './assets/donate_qr.png';
    a.download = 'donate_qr.png';
    a.click();
    showToast('已开始下载');
  });
  w.appendChild(btn);
  w.appendChild(el('<div class="note">安卓用户可长按图片保存。收款码仅作赞赏用，金额随意，不强制。</div>'));
}

// ---------- 关于 ----------
function aboutScreen() {
  const w = page('关于', '这个女巫在说梦话吧');
  w.appendChild(card(`
    <p class="center-b"><b>🌙 这个女巫在说梦话吧</b></p>
    <p class="sub center-b">Web v1.0.0 · 六门术数 · 纯本地排盘</p>
    <p>技术栈：纯原生 JavaScript PWA，紫微（iztro）+ 西占（astronomy-engine）+ 干支（lunar-javascript）+ 六爻/梅花（移植自安卓引擎）。</p>
    <p>开源地址：<a href="https://github.com/FlamingoCheers/dreaming-witch" target="_blank" rel="noopener">github.com/FlamingoCheers/dreaming-witch</a></p>
  `));
  w.appendChild(card(`
    <p><b>📱 加到 iPhone 主屏幕（推荐）</b></p>
    <p>1. 用 Safari 打开本页<br>2. 点分享按钮 ⇧<br>3. 选「添加到主屏幕」<br>4. 像原生 App 一样全屏使用，断网也能起卦</p>
    <p><b>💻 电脑 / 安卓</b><br>浏览器地址栏一般会出现「安装」图标，点击即可安装成独立应用。</p>
  `));
  w.appendChild(card(`
    <p><b>⚖️ 免责声明</b></p>
    <p>本应用仅供娱乐与文化参考。占卜结果为程序生成的趋势描述，不构成医疗、法律、投资建议；重大决策请咨询专业人士，你的命运永远在你自己手里。</p>
  `));
}

// ---------- 会话列表 ----------
function sessionsScreen() {
  const w = page('对话历史', '女巫 · 会话管理');
  for (const s of Store.sessions()) {
    const active = s.id === Store.activeSessionId();
    const d = new Date(s.updatedAt);
    const time = `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const row = card(`
      <div class="session-row">
        <div style="flex:1"><b>${s.title}</b><div class="sub">${time}${active ? ' · 当前' : ''}</div></div>
        <button class="mini-del" title="删除">✕</button>
      </div>`, 'tappable');
    row.addEventListener('click', (e) => {
      if (e.target.closest('.mini-del')) {
        if (confirm(`删除「${s.title}」？记录将无法恢复。`)) {
          Store.deleteSession(s.id);
          showToast('已删除');
          render();
        }
        return;
      }
      Store.openSession(s.id);
      routeStack = ['chat'];
      renderChat(); setTop('女巫', '', { gear: true, avatar: true });
      showChatBar(true);
      setActiveBar();
    });
    w.appendChild(row);
  }
  const add = el('<div class="btn ghost" style="margin-top:12px">＋ 新建对话</div>');
  add.addEventListener('click', () => {
    Store.newSession();
    routeStack = ['chat'];
    renderChat(); setTop('女巫', '', { gear: true, avatar: true });
    showChatBar(true);
  });
  w.appendChild(add);
}

// ---------- 顶栏按钮绑定 ----------
topTitle.addEventListener('click', () => { if (routeStack.length === 1) push(sessionsScreen); });

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ---------- 启动 ----------
Store.init();
applyBackground();
setActiveBar();
renderChat();
$('topbar').classList.remove('hidden');
setTop('女巫', '', { gear: true, avatar: true });
showChatBar(true);
