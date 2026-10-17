'use strict';
const $ = id => document.getElementById(id); const { copilot: { createCopilot }, openai } = window.CCShared;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('cc.' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('cc.' + k, JSON.stringify(v)), del: k => localStorage.removeItem('cc.' + k) };
// localStorage-backed store with the same API as the Mac app's store
const store = {
  getSettings: () => ({ answerModel: 'gpt-4.1-mini', transcribeModel: 'gpt-4o-mini-transcribe', chunkSeconds: 6, autoAnswer: true, language: 'en', ...LS.get('settings', {}) }),
  saveSettings(s) { const { apiKey, ...r } = s; LS.set('settings', { ...this.getSettings(), ...r }); return this.getSettings(); },
  getProfile: () => ({ resume: '', notes: '', keywords: '', ...LS.get('profile', {}) }),
  saveProfile: p => LS.set('profile', p),
  newSession(title) { const d = new Date(); const s = { id: d.toISOString().replace(/[:.]/g, '-'), title: title || 'Call ' + d.toLocaleString(), startedAt: d.toISOString(), transcript: [], qa: [], wrapup: null }; this.saveSession(s); return s; },
  saveSession(s) { LS.set('s.' + s.id, s); const ids = LS.get('ids', []); if (!ids.includes(s.id)) { ids.push(s.id); LS.set('ids', ids); } return s; },
  getSession: id => LS.get('s.' + id, null),
  listSessions: () => LS.get('ids', []).map(id => LS.get('s.' + id, null)).filter(Boolean).map(s => ({ id: s.id, title: s.title, startedAt: s.startedAt, lines: s.transcript.length, hasWrapup: !!s.wrapup })).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  deleteSession(id) { LS.del('s.' + id); LS.set('ids', LS.get('ids', []).filter(x => x !== id)); }
};
const getKey = () => localStorage.getItem('cc.apiKey') || '';
let full = '';
const handlers = {
  transcript: e => { const d = document.createElement('div'); d.className = 'line'; d.innerHTML = `<b class="${e.speaker}">${e.speaker}:</b> ${esc(e.text)}`; $('tx').appendChild(d); $('tx').scrollTop = 1e9; },
  'answer-start': d => { full = ''; $('q').textContent = (d.refine ? '↻ ' : 'Q: ') + d.label; $('ans').textContent = '…'; $('ans').classList.remove('mut'); },
  'answer-delta': d => { full += d; $('ans').textContent = full; },
  error: m => { $('status').innerHTML = '<span class="err">' + esc(m) + '</span>'; }
};
const cp = createCopilot({ store, getKey, openai, emit: (e, d) => handlers[e] && handlers[e](d) });

// --- Mic capture in self-contained chunks (iOS Safari records audio/mp4) ---
const MIME = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/aac', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
let running = false, stream, rec, ctx, meterT, wake, meTalking = false;
async function start() {
  if (!getKey()) { handlers.error('Add your OpenAI API key in Settings first.'); return tab('settings'); }
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }); }
  catch (e) { return handlers.error('Microphone blocked: ' + e.message + '. Settings app › Safari › Microphone › Allow.'); }
  ctx = new (window.AudioContext || window.webkitAudioContext)(); const an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize); let peak = 0;
  meterT = setInterval(() => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; peak = Math.max(peak, Math.sqrt(s / buf.length)); }, 100);
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  running = true; $('tx').innerHTML = ''; $('wrapOut').innerHTML = ''; cp.start();
  const secs = +store.getSettings().chunkSeconds || 6;
  const next = () => {
    if (!running) return; peak = 0; const parts = []; let speakerYou = meTalking;
    rec = new MediaRecorder(stream, MIME ? { mimeType: MIME } : undefined);
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    rec.onstop = () => { const p = peak, you = speakerYou || meTalking; next(); if (p > 0.01 && parts.length) { const type = rec && parts[0].type || MIME || 'audio/mp4'; new Blob(parts, { type }).arrayBuffer().then(ab => cp.onAudio(you ? 'You' : 'Them', new Uint8Array(ab), type)); } };
    rec.start(); setTimeout(() => rec.state !== 'inactive' && rec.stop(), secs * 1000);
  };
  next();
  $('start').disabled = true; $('stop').disabled = false; $('status').textContent = 'Listening… everything is treated as "Them" unless you tap 🙋 I\'m talking.';
}
function stop() { running = false; try { rec.stop(); } catch {} stream?.getTracks().forEach(t => t.stop()); clearInterval(meterT); ctx?.close(); wake?.release?.(); cp.stop(); $('start').disabled = false; $('stop').disabled = true; $('status').textContent = 'Stopped. Saved to History.'; }
// note: Uint8Array has .length like Buffer, so copilot's size check works.

$('start').onclick = start; $('stop').onclick = stop;
$('me').onclick = () => { meTalking = !meTalking; $('me').classList.toggle('on', meTalking); };
document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => cp.refine(b.dataset.r));
$('latest').onclick = () => cp.answerLatest(); $('copy').onclick = () => navigator.clipboard.writeText(full);
$('askf').onsubmit = e => { e.preventDefault(); const q = $('ask').value.trim(); if (q) { $('ask').value = ''; $('ask').blur(); cp.ask(q); } };
function renderWrap(w, el) { if (!w) return; el.innerHTML = `<div class="card"><div class="row"><button class="a">Copy all</button><button class="b">Copy email</button></div><pre>${esc(w.markdown)}</pre></div>`; el.querySelector('.a').onclick = () => navigator.clipboard.writeText(w.markdown); el.querySelector('.b').onclick = () => navigator.clipboard.writeText(w.followUpEmail); }
$('wrap').onclick = async () => { $('wrapOut').textContent = 'Writing wrap-up…'; const w = await cp.wrapup(); w ? renderWrap(w, $('wrapOut')) : $('wrapOut').textContent = ''; };

// Profile
function loadForms() { const p = store.getProfile(), s = store.getSettings(); for (const k of ['resume', 'notes', 'keywords']) $(k).value = p[k]; for (const k of ['answerModel', 'transcribeModel', 'language', 'chunkSeconds']) $(k).value = s[k] ?? ''; $('autoAnswer').checked = s.autoAnswer; $('kmsg').textContent = getKey() ? '✓ Key saved on this iPhone only.' : 'No key yet. Stored only on this iPhone; sent only to api.openai.com.'; }
$('saveProfile').onclick = () => { store.saveProfile({ resume: $('resume').value, notes: $('notes').value, keywords: $('keywords').value }); $('pmsg').textContent = 'Saved ✓'; };
$('file').onchange = async e => { const f = e.target.files[0]; if (f) $('resume').value = await f.text(); };
// Settings
$('saveKey').onclick = () => { const k = $('apiKey').value.trim(); if (k) localStorage.setItem('cc.apiKey', k); $('apiKey').value = ''; loadForms(); };
$('clearKey').onclick = () => { localStorage.removeItem('cc.apiKey'); loadForms(); };
$('testKey').onclick = async () => { $('kmsg').textContent = 'Testing…'; try { await openai.testKey({ apiKey: $('apiKey').value.trim() || getKey() }); $('kmsg').textContent = '✓ Key works'; } catch (e) { $('kmsg').textContent = '✗ ' + e.message; } };
$('saveSettings').onclick = () => { store.saveSettings({ answerModel: $('answerModel').value, transcribeModel: $('transcribeModel').value, language: $('language').value.trim(), chunkSeconds: +$('chunkSeconds').value || 6, autoAnswer: $('autoAnswer').checked }); $('smsg').textContent = 'Saved ✓'; };
// History
function loadHistory() {
  $('view').innerHTML = ''; const list = store.listSessions();
  $('list').innerHTML = list.map(s => `<div class="card"><b>${esc(s.title)}</b><div class="mut">${s.lines} lines${s.hasWrapup ? ' · wrapped up' : ''}</div><div class="row" style="margin-top:6px"><button data-o="${s.id}">Open</button><button data-d="${s.id}">Delete</button></div></div>`).join('') || '<p class="mut">No calls yet.</p>';
  $('list').querySelectorAll('[data-o]').forEach(b => b.onclick = () => openS(b.dataset.o));
  $('list').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm('Delete?')) { store.deleteSession(b.dataset.d); loadHistory(); } });
}
function openS(id) {
  const s = store.getSession(id); $('list').innerHTML = '<button id="back">‹ Back</button>'; $('back').onclick = loadHistory;
  $('view').innerHTML = `<div class="card"><b>${esc(s.title)}</b><div class="row" style="margin:8px 0"><button id="sw">Wrap up</button></div><div id="swo"></div>${s.transcript.map(e => `<div class="line"><b class="${e.speaker}">${e.speaker}:</b> ${esc(e.text)}</div>`).join('')}${s.qa.map(x => `<p><b>Q: ${esc(x.q)}</b><br>${esc(x.a)}</p>`).join('')}</div>`;
  renderWrap(s.wrapup, $('swo')); $('sw').onclick = async () => { $('swo').textContent = 'Writing…'; const w = await cp.wrapup(id); w ? renderWrap(w, $('swo')) : $('swo').textContent = ''; };
}
function tab(t) { document.querySelectorAll('nav button').forEach(b => b.classList.toggle('sel', b.dataset.tab === t)); document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === t)); if (t === 'history') loadHistory(); }
document.querySelectorAll('nav button').forEach(b => b.onclick = () => tab(b.dataset.tab));
loadForms(); if (!getKey()) tab('settings');
if (!MIME && !window.MediaRecorder) handlers.error('This browser cannot record audio. Update iOS to 14.3 or newer.');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
