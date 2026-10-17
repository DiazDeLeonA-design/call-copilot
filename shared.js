// AUTO-GENERATED from src/lib by scripts/build-iphone.js — do not edit.
(function(){
const M = {}; const require = n => M[n.replace("./", "")];
M['questions'] = (function(){ const module = { exports: {} }; const exports = module.exports;
'use strict';
// Heuristic question detection for lines spoken by "Them".
const STARTERS = ['what','why','how','when','where','who','which','whose','can you','could you','would you','will you','do you','did you','have you','are you','is there','is it','should','tell me','walk me through','describe','explain','talk about','give me an example','share an example','what\'s','how\'s','have you ever','any questions'];

function normalize(t) { return String(t || '').trim().replace(/\s+/g, ' '); }

function isQuestion(text) {
  const t = normalize(text).toLowerCase();
  if (t.split(' ').length < 3) return false;
  if (/\?\s*$/.test(t) || /\?/.test(t)) return true;
  const stripped = t.replace(/^(so|okay|ok|and|alright|great|well|um|uh|right|now)[,\s]+/g, '');
  return STARTERS.some(s => stripped.startsWith(s + ' ') || stripped.includes(', ' + s + ' '));
}

// Extract the most relevant question sentence from a chunk of text.
function extractQuestion(text) {
  const t = normalize(text);
  const sentences = t.match(/[^.?!]+[.?!]?/g) || [t];
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (isQuestion(sentences[i])) {
      // include preceding sentence for context if short
      const prev = i > 0 ? sentences[i - 1].trim() + ' ' : '';
      return (prev.length < 160 ? prev : '') + sentences[i].trim();
    }
  }
  return isQuestion(t) ? t : null;
}

// Debounce helper: avoid answering the same/similar question twice.
function similar(a, b) {
  const wa = new Set(normalize(a).toLowerCase().split(/\W+/).filter(Boolean));
  const wb = new Set(normalize(b).toLowerCase().split(/\W+/).filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let inter = 0; for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size);
}

function createDetector({ cooldownMs = 4000, now = () => Date.now() } = {}) {
  let last = { text: '', at: 0 };
  return function detect(entry) {
    if (!entry || entry.speaker !== 'Them') return null;
    const q = extractQuestion(entry.text);
    if (!q) return null;
    const t = now();
    if (similar(q, last.text) > 0.7 && t - last.at < 60000) return null;
    if (t - last.at < cooldownMs) return null;
    last = { text: q, at: t };
    return q;
  };
}

module.exports = { isQuestion, extractQuestion, similar, createDetector };

return module.exports; })();
M['prompts'] = (function(){ const module = { exports: {} }; const exports = module.exports;
'use strict';
const MAX_PROFILE = 12000;

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

function transcriptToText(entries, maxChars = 6000) {
  const lines = (entries || []).map(e => `${e.speaker}: ${e.text}`);
  let out = lines.join('\n');
  if (out.length > maxChars) out = '…' + out.slice(out.length - maxChars);
  return out;
}

function systemPrompt(profile = {}) {
  const parts = [
    'You are Call Copilot, a discreet real-time assistant helping the user during a live call or job interview.',
    'Write answers the user can say out loud in first person, as themselves. Be natural, confident and concise.',
    'Default format: one-line direct answer, then 2-4 short bullet points with specifics. No preamble, no "As an AI".',
    'Use the user\'s real background from their profile; never invent employers, degrees or numbers that are not in it. If unsure, suggest a safe honest phrasing.'
  ];
  if (profile.resume) parts.push('\n## User resume\n' + clip(profile.resume, MAX_PROFILE));
  if (profile.notes) parts.push('\n## User notes (company, role, talking points)\n' + clip(profile.notes, MAX_PROFILE / 2));
  return parts.join('\n');
}

const REFINE = {
  shorter: 'Rewrite your previous answer much shorter: 1-2 sentences I can say right away.',
  deeper: 'Go deeper on your previous answer: add more detail, reasoning and concrete specifics from my background.',
  example: 'Give a concrete example or short STAR story (Situation, Task, Action, Result) from my background supporting the previous answer.',
  simpler: 'Rewrite your previous answer in simpler, plain words, as if explaining to a non-expert.'
};

function answerMessages({ profile, transcript, question, history = [] }) {
  const msgs = [{ role: 'system', content: systemPrompt(profile) }];
  const tx = transcriptToText(transcript);
  if (tx) msgs.push({ role: 'system', content: '## Recent call transcript ("You" = the user, "Them" = other side)\n' + tx });
  for (const h of history.slice(-6)) msgs.push(h);
  msgs.push({ role: 'user', content: question });
  return msgs;
}

function refineMessages({ profile, transcript, history, kind }) {
  const instr = REFINE[kind];
  if (!instr) throw new Error('Unknown refine kind: ' + kind);
  return answerMessages({ profile, transcript, history, question: instr });
}

function questionPrompt(q) { return `The other person just asked: "${q}"\nGive me what to say.`; }

// Transcription prompt: jargon/names from profile to help spelling. Keep short.
function transcriptionPrompt(profile = {}, maxChars = 800) {
  const src = `${profile.keywords || ''}\n${profile.notes || ''}\n${profile.resume || ''}`;
  const words = src.match(/\b([A-Z][a-zA-Z0-9+#.\-]{1,}|[A-Z]{2,}[a-z0-9]*)\b/g) || [];
  const seen = new Set(); const out = [];
  for (const w of words) { const k = w.toLowerCase(); if (!seen.has(k) && w.length > 1) { seen.add(k); out.push(w); } }
  let s = out.join(', ');
  if (s.length > maxChars) s = s.slice(0, maxChars).replace(/,[^,]*$/, '');
  return s ? 'A job interview or work call. Vocabulary: ' + s + '.' : 'A job interview or work call.';
}

function wrapupMessages({ profile, transcript }) {
  return [
    { role: 'system', content: 'You summarize calls for the user ("You"). Respond ONLY with JSON: {"overview": string, "keyQuestions": string[], "actionItems": string[], "followUpEmail": string}. The follow-up email is from the user, warm and professional, with a subject line on the first line as "Subject: ...".' + (profile && profile.resume ? '\nUser background:\n' + clip(profile.resume, 3000) : '') },
    { role: 'user', content: 'Transcript:\n' + transcriptToText(transcript, 60000) }
  ];
}

function parseWrapup(text) {
  let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  let o; try { o = JSON.parse(s); } catch { return { overview: String(text || ''), keyQuestions: [], actionItems: [], followUpEmail: '' }; }
  const arr = v => Array.isArray(v) ? v.map(String) : (v ? [String(v)] : []);
  return { overview: String(o.overview || ''), keyQuestions: arr(o.keyQuestions), actionItems: arr(o.actionItems), followUpEmail: String(o.followUpEmail || '') };
}

function wrapupToMarkdown(w, title = 'Call') {
  const list = a => a.length ? a.map(x => '- ' + x).join('\n') : '- (none)';
  return `# ${title}\n\n## Overview\n${w.overview}\n\n## Key questions\n${list(w.keyQuestions)}\n\n## Action items\n${list(w.actionItems)}\n\n## Follow-up email\n${w.followUpEmail}\n`;
}

module.exports = { systemPrompt, answerMessages, refineMessages, questionPrompt, transcriptionPrompt, transcriptToText, wrapupMessages, parseWrapup, wrapupToMarkdown, REFINE };

return module.exports; })();
M['openai'] = (function(){ const module = { exports: {} }; const exports = module.exports;
'use strict';
// Minimal OpenAI client using fetch (Node 18+/Electron). fetchImpl injectable for tests.
const BASE = 'https://api.openai.com/v1';

async function errText(res) { try { const j = await res.json(); return j.error?.message || JSON.stringify(j); } catch { return res.statusText; } }

async function transcribe({ apiKey, audio, mime = 'audio/webm', model = 'gpt-4o-mini-transcribe', prompt, language, fetchImpl = (...a) => fetch(...a) }) {
  const fd = new FormData();
  const ext = mime.includes('wav') ? 'wav' : (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ? 'm4a' : 'webm';
  fd.append('file', audio instanceof Blob ? audio : new Blob([audio], { type: mime }), 'chunk.' + ext);
  fd.append('model', model);
  fd.append('response_format', 'json');
  if (prompt) fd.append('prompt', prompt);
  if (language) fd.append('language', language);
  const res = await fetchImpl(BASE + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: fd });
  if (!res.ok) throw new Error('Transcription failed: ' + await errText(res));
  const j = await res.json();
  return (j.text || '').trim();
}

// Parse an SSE text stream from chat completions; calls onDelta(text).
async function readSSE(body, onDelta) {
  const decoder = new TextDecoder(); let buf = ''; let full = '';
  const handle = line => {
    line = line.trim(); if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim(); if (data === '[DONE]') return;
    try { const d = JSON.parse(data).choices?.[0]?.delta?.content; if (d) { full += d; onDelta(d); } } catch {}
  };
  const push = chunk => {
    buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let idx; while ((idx = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, idx)); buf = buf.slice(idx + 1); }
  };
  if (body && typeof body.getReader === 'function') { // browsers (iOS Safari) without async-iterable streams
    const r = body.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; push(value); }
  } else { for await (const chunk of body) push(chunk); }
  if (buf) handle(buf);
  return full;
}

async function chatStream({ apiKey, messages, model = 'gpt-4.1-mini', onDelta = () => {}, signal, fetchImpl = (...a) => fetch(...a), temperature = 0.4 }) {
  const res = await fetchImpl(BASE + '/chat/completions', {
    method: 'POST', signal,
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, temperature })
  });
  if (!res.ok) throw new Error('Answer failed: ' + await errText(res));
  return readSSE(res.body, onDelta);
}

async function chatJSON({ apiKey, messages, model = 'gpt-4.1-mini', fetchImpl = (...a) => fetch(...a) }) {
  const res = await fetchImpl(BASE + '/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } })
  });
  if (!res.ok) throw new Error('Wrap-up failed: ' + await errText(res));
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

async function testKey({ apiKey, fetchImpl = (...a) => fetch(...a) }) {
  const res = await fetchImpl(BASE + '/models', { headers: { Authorization: 'Bearer ' + apiKey } });
  if (!res.ok) throw new Error(await errText(res));
  return true;
}

module.exports = { transcribe, chatStream, chatJSON, readSSE, testKey };

return module.exports; })();
M['copilot'] = (function(){ const module = { exports: {} }; const exports = module.exports;
'use strict';
// Orchestrates transcription, question detection, answers, and wrap-up. Electron-free (testable).
const P = require('./prompts');
const { createDetector } = require('./questions');

function createCopilot({ store, getKey, openai, emit = () => {}, now = () => Date.now() }) {
  let sess = null; let history = []; let ctrl = null; let lastQuestion = null;
  const detect = createDetector({ now });
  const queue = { You: Promise.resolve(), Them: Promise.resolve() };

  const key = () => { const k = getKey(); if (!k) { emit('error', 'Add your OpenAI API key in Settings first.'); throw new Error('NO_KEY'); } return k; };
  const persist = () => { if (sess) store.saveSession(sess); };

  function addLine(speaker, text) {
    if (!sess) sess = store.newSession();
    const entry = { speaker, text, at: new Date(now()).toISOString() };
    sess.transcript.push(entry); persist();
    emit('transcript', entry);
    const q = detect(entry);
    if (q) { lastQuestion = q; emit('question', q); if (store.getSettings().autoAnswer) runAnswer(P.questionPrompt(q), q); }
    return entry;
  }

  async function runAnswer(userMsg, label, refineKind) {
    let apiKey; try { apiKey = key(); } catch { return null; }
    if (ctrl) ctrl.abort();
    const my = ctrl = new AbortController();
    const s = store.getSettings(); const profile = store.getProfile();
    const transcript = sess ? sess.transcript.slice(-60) : [];
    const messages = refineKind ? P.refineMessages({ profile, transcript, history, kind: refineKind })
      : P.answerMessages({ profile, transcript, history, question: userMsg });
    emit('answer-start', { label: label || userMsg, refine: refineKind || null });
    try {
      const full = await openai.chatStream({ apiKey, model: s.answerModel, messages, signal: my.signal, onDelta: d => { if (ctrl === my) emit('answer-delta', d); } });
      history.push({ role: 'user', content: refineKind ? P.REFINE[refineKind] : userMsg }, { role: 'assistant', content: full });
      history = history.slice(-8);
      if (sess) { sess.qa.push({ q: label || userMsg, a: full, refine: refineKind || null, at: new Date(now()).toISOString() }); persist(); }
      emit('answer-done', full);
      return full;
    } catch (e) {
      if (e.name !== 'AbortError') emit('error', e.message);
      return null;
    } finally { if (ctrl === my) ctrl = null; }
  }

  return {
    current: () => sess,
    start(title) { sess = store.newSession(title); history = []; lastQuestion = null; emit('session', sess); return sess; },
    stop() { const s = sess; persist(); emit('session-stopped', s && s.id); return s; },
    addLine,
    onAudio(speaker, buf, mime) {
      if (!buf || buf.length < 2000) return Promise.resolve();
      const sp = speaker === 'You' ? 'You' : 'Them';
      queue[sp] = queue[sp].then(async () => {
        let apiKey; try { apiKey = key(); } catch { return; }
        const s = store.getSettings();
        try {
          const text = await openai.transcribe({ apiKey, audio: buf, mime, model: s.transcribeModel, prompt: P.transcriptionPrompt(store.getProfile()), language: s.language || undefined });
          if (text && !/^(thank you\.?|thanks for watching\.?|you)$/i.test(text.trim())) addLine(sp, text);
        } catch (e) { emit('error', e.message); }
      });
      return queue[sp];
    },
    ask(q) { q = String(q || '').trim(); if (!q) return null; return runAnswer(q, q); },
    refine(kind) { if (!history.length) { emit('error', 'Nothing to refine yet.'); return null; } return runAnswer(null, kind[0].toUpperCase() + kind.slice(1), kind); },
    answerLatest() {
      const q = lastQuestion || (sess && [...sess.transcript].reverse().find(e => e.speaker === 'Them')?.text);
      if (!q) { emit('error', 'No question heard yet.'); return null; }
      return runAnswer(P.questionPrompt(q), q);
    },
    cancel() { if (ctrl) ctrl.abort(); ctrl = null; },
    async wrapup(id) {
      const s = id ? store.getSession(id) : sess;
      if (!s || !s.transcript.length) { emit('error', 'No transcript to wrap up.'); return null; }
      let apiKey; try { apiKey = key(); } catch { return null; }
      try {
        const raw = await openai.chatJSON({ apiKey, model: store.getSettings().answerModel, messages: P.wrapupMessages({ profile: store.getProfile(), transcript: s.transcript }) });
        s.wrapup = P.parseWrapup(raw); s.wrapup.markdown = P.wrapupToMarkdown(s.wrapup, s.title);
        store.saveSession(s); if (sess && sess.id === s.id) sess = s;
        return s.wrapup;
      } catch (e) { emit('error', e.message); return null; }
    }
  };
}
module.exports = { createCopilot };

return module.exports; })();
window.CCShared = M;
})();
