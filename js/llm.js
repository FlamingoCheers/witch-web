// ===== LLM 客户端：三协议流式 + 工具调用 =====
const trimSlash = (s) => (s || '').replace(/\/+$/, '');

async function sseReader(res, onEvent) {
  // 返回 Promise<void>；onEvent(type, data)  type='data'|'done'
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line) continue;
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') { onEvent('done'); return; }
        onEvent('data', data);
      }
    }
  }
  onEvent('done');
}

async function readError(res) {
  let detail = '';
  try { detail = await res.text(); } catch { /* ignore */ }
  return `HTTP ${res.status}${detail ? ': ' + detail.slice(0, 400) : ''}`;
}

// ===== OpenAI 兼容 =====
async function chatOpenAI(cfg, messages, systemPrompt, tools, onDelta, signal) {
  const msgs = [{ role: 'system', content: systemPrompt }];
  for (const m of messages) {
    if (m.role === 'user') msgs.push({ role: 'user', content: m.content });
    else if (m.role === 'tool') msgs.push({ role: 'tool', tool_call_id: m.callId, content: m.content });
    else if (m.role === 'assistant') {
      const a = { role: 'assistant', content: m.content || null };
      if (m.toolCalls && m.toolCalls.length) {
        a.tool_calls = m.toolCalls.map((t) => ({
          id: t.id, type: 'function',
          function: { name: t.name, arguments: t.arguments || '{}' },
        }));
      }
      msgs.push(a);
    }
  }
  const body = { model: cfg.model, messages: msgs, stream: true };
  if (tools && tools.length) body.tools = tools;
  const res = await fetch(trimSlash(cfg.baseUrl) + '/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));

  let text = '';
  const tcMap = new Map();
  await sseReader(res, (type, data) => {
    if (type !== 'data') return;
    let j;
    try { j = JSON.parse(data); } catch { return; }
    const choice = j.choices && j.choices[0];
    if (!choice) return;
    const d = choice.delta || {};
    if (d.content) { text += d.content; onDelta && onDelta(d.content, text); }
    if (d.tool_calls) {
      for (const t of d.tool_calls) {
        const idx = t.index ?? 0;
        if (!tcMap.has(idx)) tcMap.set(idx, { id: t.id || ('call_' + idx), name: '', arguments: '' });
        const cur = tcMap.get(idx);
        if (t.id) cur.id = t.id;
        if (t.function) {
          if (t.function.name) cur.name += t.function.name;
          if (t.function.arguments) cur.arguments += t.function.arguments;
        }
      }
    }
  });
  const toolCalls = [...tcMap.values()].filter((t) => t.name);
  return { text, toolCalls };
}

// ===== Anthropic =====
async function chatAnthropic(cfg, messages, systemPrompt, tools, onDelta, signal) {
  const msgs = [];
  let pendingTools = [];
  const flushTools = () => {
    if (pendingTools.length) { msgs.push({ role: 'user', content: pendingTools }); pendingTools = []; }
  };
  for (const m of messages) {
    if (m.role === 'user') { flushTools(); msgs.push({ role: 'user', content: m.content }); }
    else if (m.role === 'tool') {
      let parsed = {};
      try { parsed = JSON.parse(m.content); } catch { parsed = { result: m.content }; }
      pendingTools.push({ type: 'tool_result', tool_use_id: m.callId, content: JSON.stringify(parsed) });
    } else if (m.role === 'assistant') {
      flushTools();
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      if (m.toolCalls && m.toolCalls.length) {
        for (const t of m.toolCalls) {
          let input = {};
          try { input = JSON.parse(t.arguments || '{}'); } catch { input = {}; }
          content.push({ type: 'tool_use', id: t.id, name: t.name, input });
        }
      }
      if (content.length) msgs.push({ role: 'assistant', content });
    }
  }
  flushTools();

  const body = {
    model: cfg.model, max_tokens: 8192, messages: msgs, stream: true,
    system: systemPrompt,
  };
  if (tools && tools.length) {
    body.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  const res = await fetch(trimSlash(cfg.baseUrl) + '/messages', {
    method: 'POST', signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));

  let text = '';
  const tcMap = new Map(); // index → {id,name,arguments}
  let curTextIdx = null, curToolIdx = null;
  await sseReader(res, (type, data) => {
    if (type !== 'data') return;
    let j;
    try { j = JSON.parse(data); } catch { return; }
    if (j.type === 'content_block_start') {
      const cb = j.content_block;
      if (cb.type === 'tool_use') { curToolIdx = j.index; tcMap.set(j.index, { id: cb.id, name: cb.name, arguments: '' }); }
      else if (cb.type === 'text') curTextIdx = j.index;
    } else if (j.type === 'content_block_delta') {
      const d = j.delta;
      if (d.type === 'text_delta' && curTextIdx === j.index) { text += d.text; onDelta && onDelta(d.text, text); }
      else if (d.type === 'input_json_delta' && curToolIdx === j.index) {
        const cur = tcMap.get(curToolIdx);
        if (cur) cur.arguments += d.partial_json || '';
      }
    } else if (j.type === 'content_block_stop') { curTextIdx = null; curToolIdx = null; }
  });
  const toolCalls = [...tcMap.values()].filter((t) => t.name);
  return { text, toolCalls };
}

// ===== Gemini =====
function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const allowed = ['type', 'format', 'description', 'nullable', 'enum', 'items', 'properties', 'required', 'minimum', 'maximum'];
  const out = {};
  for (const k of Object.keys(schema)) {
    if (!allowed.includes(k)) continue;
    let v = schema[k];
    if (k === 'type' && typeof v === 'string') v = v.toUpperCase();
    else if (k === 'items') v = sanitizeGeminiSchema(v);
    else if (k === 'properties') {
      const p = {};
      for (const pk of Object.keys(v)) p[pk] = sanitizeGeminiSchema(v[pk]);
      v = p;
    }
    out[k] = v;
  }
  return out;
}

async function chatGemini(cfg, messages, systemPrompt, tools, onDelta, signal) {
  const contents = [];
  let pendingTools = [];
  const flushTools = () => {
    if (pendingTools.length) { contents.push({ role: 'user', parts: pendingTools }); pendingTools = []; }
  };
  for (const m of messages) {
    if (m.role === 'user') { flushTools(); contents.push({ role: 'user', parts: [{ text: m.content }] }); }
    else if (m.role === 'tool') {
      let parsed = {};
      try { parsed = JSON.parse(m.content); } catch { parsed = { result: m.content }; }
      pendingTools.push({ functionResponse: { name: m.name || 'tool', response: { result: parsed } } });
    } else if (m.role === 'assistant') {
      flushTools();
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls && m.toolCalls.length) {
        for (const t of m.toolCalls) {
          let args = {};
          try { args = JSON.parse(t.arguments || '{}'); } catch { args = {}; }
          parts.push({ functionCall: { name: t.name, args } });
        }
      }
      if (parts.length) contents.push({ role: 'model', parts });
    }
  }
  flushTools();

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };
  if (tools && tools.length) {
    body.tools = [{
      functionDeclarations: tools.map((t) => {
        const s = sanitizeGeminiSchema(t.function.parameters);
        return { name: t.function.name, description: t.function.description, parameters: s };
      }),
    }];
  }
  const url = `${trimSlash(cfg.baseUrl)}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));

  let text = '';
  const toolCalls = [];
  await sseReader(res, (type, data) => {
    if (type !== 'data') return;
    let j;
    try { j = JSON.parse(data); } catch { return; }
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [];
    for (const p of parts) {
      if (p.text) { text += p.text; onDelta && onDelta(p.text, text); }
      if (p.functionCall) toolCalls.push({
        id: 'g_' + p.functionCall.name + '_' + toolCalls.length,
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args || {}),
      });
    }
  });
  return { text, toolCalls };
}

// ===== 对外入口 =====
export async function chat(cfg, history, systemPrompt, tools, onDelta, signal) {
  if (cfg.protocol === 'anthropic') return chatAnthropic(cfg, history, systemPrompt, tools, onDelta, signal);
  if (cfg.protocol === 'gemini') return chatGemini(cfg, history, systemPrompt, tools, onDelta, signal);
  return chatOpenAI(cfg, history, systemPrompt, tools, onDelta, signal);
}

export async function ping(cfg) {
  const t0 = Date.now();
  try {
    const r = await chat(cfg, [{ role: 'user', content: 'ping' }], '你是连通性测试助手，收到消息请回复 pong 两个字母，不要有任何其他内容。', null, null, undefined);
    const ms = Date.now() - t0;
    if (!r.text && !r.toolCalls.length) return { ok: false, error: '空响应' };
    return { ok: true, ms, text: (r.text || '').trim().slice(0, 60) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
