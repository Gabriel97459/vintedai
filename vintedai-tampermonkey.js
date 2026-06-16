// ==UserScript==
// @name         VintedAI — Messages Automatiques
// @namespace    https://optivintedai.netlify.app
// @version      2.0
// @description  Connecté à VintedAI — affiche et envoie les messages générés par l'IA
// @match        https://www.vinted.fr/*
// @match        https://www.vinted.be/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ══ SUPABASE CONFIG (même que VintedAI) ══
  const SB_URL  = 'https://xipkqhctpyjjtmmuxxac.supabase.co';
  const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpcGtxaGN0cHlqanRtbXV4eGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4Nzc4NDgsImV4cCI6MjA5NDQ1Mzg0OH0.ExADaMv_83GNQvWChw-xOeSexxcQfd76ZDcTVTlAvv4';

  async function sbFetch(path, opts = {}) {
    const res = await fetch(SB_URL + '/rest/v1/' + path, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...opts.headers },
      ...opts,
    });
    if (!res.ok) throw new Error(await res.text());
    const txt = await res.text();
    return txt ? JSON.parse(txt) : [];
  }

  async function fetchMessages() {
    return sbFetch('vinted_messages?sent=eq.false&order=created_at.desc&limit=20');
  }

  async function markSent(id) {
    return sbFetch('vinted_messages?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sent: true }) });
  }

  // ══ CONFIG LOCALE ══
  const KEY = 'vai_tm';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const save = (v) => localStorage.setItem(KEY, JSON.stringify(v));
  let cfg = load();

  // ══ TEMPLATES LOCAUX (fallback si pas de messages IA) ══
  function getMsg(tone, disc, item, price) {
    const remise = disc > 0 ? (price ? ` Je vous propose ${Math.round(price * (1 - disc / 100))}€` : ` avec ${disc}% de remise`) : '';
    const art = item ? ` "${item}"` : '';
    if (tone === 'sympa')  return `Bonjour ! 😊 Votre article${art} m'intéresse vraiment !${remise ? remise + ' — qu\'en pensez-vous ?' : ''} N'hésitez pas si vous avez des questions ! 🌟`;
    if (tone === 'pro')    return `Bonjour, votre article${art} m'intéresse.${remise ? remise + '.' : ''} Cordialement.`;
    if (tone === 'urgent') return `Bonjour ! ⚡ Votre article${art} m'intéresse et je suis prêt(e) à acheter maintenant !${remise ? remise + ', je valide immédiatement !' : ' Disponible pour achat rapide !'} 🔥`;
    return '';
  }

  // ══ INJECT MESSAGE ══
  function injectMessage(text) {
    const selectors = [
      'textarea[data-testid="message-box"]',
      'textarea[class*="message"]',
      'textarea[class*="chat"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="écri"]',
      'div[contenteditable="true"][class*="message"]',
      'div[contenteditable="true"][class*="chat"]',
      'textarea',
    ];
    let input = null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { input = el; break; }
    }
    if (!input) { showToast('❌ Ouvre une conversation Vinted d\'abord.'); return false; }
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype || window.HTMLElement.prototype, 'value')?.set;
    if (setter) setter.call(input, text);
    else { input.value = text; }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    showToast('✅ Message inséré !');
    return true;
  }

  function clickSend() {
    const selectors = [
      'button[data-testid="send-message-button"]',
      'button[type="submit"][class*="message"]',
      'button[type="submit"][class*="send"]',
      'button[class*="send"]',
      'button[aria-label*="envoyer"]',
      'button[aria-label*="send"]',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) { btn.click(); return true; }
    }
    const textarea = document.querySelector('textarea');
    if (textarea) { textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); return true; }
    return false;
  }

  // ══ TOAST ══
  function showToast(msg) {
    document.querySelector('#vai-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'vai-toast';
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
      background: '#1a1535', color: '#ede9fe', padding: '10px 18px', borderRadius: '12px',
      fontSize: '13px', fontWeight: '600', zIndex: '999999', boxShadow: '0 4px 20px rgba(0,0,0,.5)',
      border: '1px solid rgba(139,92,246,.3)', maxWidth: '320px', textAlign: 'center',
      fontFamily: 'system-ui, sans-serif', transition: 'opacity .3s',
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3500);
  }

  // ══ SECTION MESSAGES VINTEDAI ══
  function buildAiSection(panel, autoSend) {
    const section = document.createElement('div');
    section.id = 'vai-ai-section';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px';
    const title = document.createElement('span');
    title.style.cssText = 'font-size:12px;font-weight:700;color:#ede9fe';
    title.textContent = '📥 Messages depuis VintedAI';
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '🔄';
    Object.assign(refreshBtn.style, { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#8b5cf6' });
    header.appendChild(title); header.appendChild(refreshBtn);
    section.appendChild(header);

    const listEl = document.createElement('div');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto';
    section.appendChild(listEl);

    async function loadMessages() {
      listEl.innerHTML = '<div style="font-size:11px;color:#7c7a9a;text-align:center;padding:8px">Chargement…</div>';
      try {
        const msgs = await fetchMessages();
        listEl.innerHTML = '';
        if (!msgs.length) {
          listEl.innerHTML = '<div style="font-size:11px;color:#7c7a9a;text-align:center;padding:8px">Aucun message en attente.<br>Génère une annonce sur VintedAI et clique "📤 Envoyer vers Bot".</div>';
          return;
        }
        msgs.forEach(m => {
          const item = document.createElement('div');
          Object.assign(item.style, {
            background: 'rgba(139,92,246,.1)', borderRadius: '10px', padding: '8px 10px',
            border: '1px solid rgba(139,92,246,.2)', cursor: 'pointer',
          });
          const titleEl = document.createElement('div');
          titleEl.style.cssText = 'font-size:11px;font-weight:700;color:#c4b5fd;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
          titleEl.textContent = m.title || '(sans titre)';
          const preview = document.createElement('div');
          preview.style.cssText = 'font-size:11px;color:#7c7a9a;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical';
          preview.textContent = m.message || '';
          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex;gap:5px;margin-top:6px';

          const useBtn = document.createElement('button');
          useBtn.textContent = '📨 Utiliser';
          Object.assign(useBtn.style, {
            flex: '1', padding: '4px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#8b5cf6,#10b981)', color: 'white',
            fontSize: '11px', fontWeight: '700', fontFamily: 'system-ui,sans-serif',
          });
          useBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = injectMessage(m.message);
            if (ok) {
              if (autoSend) setTimeout(() => { clickSend(); showToast('✅ Message envoyé !'); }, 600);
              try { await markSent(m.id); } catch (_) {}
              item.style.opacity = '0.4';
              useBtn.textContent = '✅ Utilisé';
              useBtn.disabled = true;
            }
          });

          const delBtn = document.createElement('button');
          delBtn.textContent = '🗑';
          Object.assign(delBtn.style, {
            padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.1)',
            cursor: 'pointer', background: 'rgba(255,255,255,.05)', color: '#7c7a9a',
            fontSize: '11px', fontFamily: 'system-ui,sans-serif',
          });
          delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try { await markSent(m.id); item.remove(); } catch (_) {}
          });

          actions.appendChild(useBtn); actions.appendChild(delBtn);
          item.appendChild(titleEl); item.appendChild(preview); item.appendChild(actions);
          listEl.appendChild(item);
        });
      } catch (e) {
        listEl.innerHTML = '<div style="font-size:11px;color:#ef4444;text-align:center;padding:8px">Erreur: ' + e.message + '</div>';
      }
    }

    refreshBtn.addEventListener('click', loadMessages);
    loadMessages();

    return { section, reload: loadMessages };
  }

  // ══ UI PANEL ══
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'vai-panel';
    Object.assign(panel.style, {
      position: 'fixed', bottom: '76px', right: '16px', width: '310px',
      background: '#16142a', border: '1px solid rgba(139,92,246,.3)', borderRadius: '18px',
      padding: '16px', zIndex: '999998', boxShadow: '0 8px 32px rgba(0,0,0,.6)',
      fontFamily: 'system-ui, sans-serif', display: 'none', maxHeight: '90vh', overflowY: 'auto',
    });

    cfg = load();
    let tone = cfg.tone || 'sympa';
    let disc = cfg.disc || 10;
    let autoSend = cfg.autoSend || false;
    let customItem = cfg.customItem || '';
    let customPrice = cfg.customPrice || '';

    // Titre
    const titleEl = document.createElement('div');
    titleEl.innerHTML = '🤖 <strong style="color:#ede9fe;font-size:14px">VintedAI Messages</strong>';
    titleEl.style.marginBottom = '12px';
    panel.appendChild(titleEl);

    // ── Section Messages VintedAI ──
    const { section: aiSection, reload: reloadAi } = buildAiSection(panel, autoSend);
    panel.appendChild(aiSection);

    // Séparateur
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:rgba(255,255,255,.08);margin:12px 0';
    panel.appendChild(sep);

    // ── Section Templates manuels ──
    const manualTitle = document.createElement('div');
    manualTitle.style.cssText = 'font-size:12px;font-weight:700;color:#7c7a9a;margin-bottom:8px';
    manualTitle.textContent = '✍️ Message rapide manuel';
    panel.appendChild(manualTitle);

    // Ton
    const toneWrap = document.createElement('div');
    toneWrap.style.cssText = 'display:flex;gap:6px;margin-bottom:10px';
    [['sympa', '😊 Sympa'], ['pro', '💼 Pro'], ['urgent', '⚡ Urgent']].forEach(([k, lbl]) => {
      const btn = document.createElement('button');
      btn.textContent = lbl; btn.dataset.tone = k;
      Object.assign(btn.style, {
        flex: '1', padding: '6px 2px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        fontSize: '11px', fontWeight: '700', fontFamily: 'system-ui,sans-serif',
        background: tone === k ? 'linear-gradient(135deg,#8b5cf6,#10b981)' : 'rgba(255,255,255,.08)',
        color: tone === k ? 'white' : '#7c7a9a',
      });
      btn.addEventListener('click', () => {
        tone = k; cfg.tone = k; save(cfg);
        toneWrap.querySelectorAll('button').forEach(b => {
          const active = b.dataset.tone === k;
          b.style.background = active ? 'linear-gradient(135deg,#8b5cf6,#10b981)' : 'rgba(255,255,255,.08)';
          b.style.color = active ? 'white' : '#7c7a9a';
        });
        updatePreview();
      });
      toneWrap.appendChild(btn);
    });
    panel.appendChild(toneWrap);

    // Remise
    const discRow = document.createElement('div');
    discRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px';
    const discLbl = document.createElement('span');
    discLbl.style.cssText = 'font-size:11px;color:#7c7a9a;white-space:nowrap';
    discLbl.textContent = 'Remise :';
    const discVal = document.createElement('span');
    discVal.style.cssText = 'font-size:12px;font-weight:800;color:#8b5cf6;min-width:30px';
    discVal.textContent = disc + '%';
    const discSlider = document.createElement('input');
    discSlider.type = 'range'; discSlider.min = '0'; discSlider.max = '40'; discSlider.value = disc;
    discSlider.style.cssText = 'flex:1;accent-color:#8b5cf6';
    discSlider.addEventListener('input', () => { disc = +discSlider.value; cfg.disc = disc; save(cfg); discVal.textContent = disc + '%'; updatePreview(); });
    discRow.appendChild(discLbl); discRow.appendChild(discSlider); discRow.appendChild(discVal);
    panel.appendChild(discRow);

    // Article
    const itemInp = document.createElement('input');
    Object.assign(itemInp, { type: 'text', placeholder: 'Article (optionnel)', value: customItem });
    Object.assign(itemInp.style, { width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: '#ede9fe', fontSize: '12px', fontFamily: 'system-ui,sans-serif', marginBottom: '6px', boxSizing: 'border-box' });
    itemInp.addEventListener('input', () => { customItem = itemInp.value; cfg.customItem = customItem; save(cfg); updatePreview(); });
    panel.appendChild(itemInp);

    // Prix
    const priceInp = document.createElement('input');
    Object.assign(priceInp, { type: 'number', placeholder: 'Prix actuel € (optionnel)', value: customPrice });
    Object.assign(priceInp.style, { width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: '#ede9fe', fontSize: '12px', fontFamily: 'system-ui,sans-serif', marginBottom: '10px', boxSizing: 'border-box' });
    priceInp.addEventListener('input', () => { customPrice = priceInp.value; cfg.customPrice = customPrice; save(cfg); updatePreview(); });
    panel.appendChild(priceInp);

    // Preview
    const preview = document.createElement('div');
    Object.assign(preview.style, { background: 'rgba(255,255,255,.04)', borderRadius: '10px', padding: '9px 11px', fontSize: '12px', color: '#ccc8ff', lineHeight: '1.6', marginBottom: '10px', border: '1px solid rgba(255,255,255,.07)', minHeight: '40px' });
    panel.appendChild(preview);
    function updatePreview() { preview.textContent = getMsg(tone, disc, customItem, customPrice ? +customPrice : null); }
    updatePreview();

    // Auto-send
    const autoRow = document.createElement('div');
    autoRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px';
    const autoChk = document.createElement('input');
    autoChk.type = 'checkbox'; autoChk.checked = autoSend; autoChk.id = 'vai-autosend';
    autoChk.style.accentColor = '#8b5cf6';
    autoChk.addEventListener('change', () => { autoSend = autoChk.checked; cfg.autoSend = autoSend; save(cfg); });
    const autoLbl = document.createElement('label');
    autoLbl.htmlFor = 'vai-autosend'; autoLbl.textContent = 'Envoyer automatiquement';
    autoLbl.style.cssText = 'font-size:12px;color:#7c7a9a;cursor:pointer';
    autoRow.appendChild(autoChk); autoRow.appendChild(autoLbl);
    panel.appendChild(autoRow);

    // Boutons
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '📨 Insérer & Envoyer';
    Object.assign(sendBtn.style, { width: '100%', padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#8b5cf6,#10b981)', color: 'white', fontWeight: '700', fontSize: '13px', fontFamily: 'system-ui,sans-serif' });
    sendBtn.addEventListener('click', () => {
      const msg = getMsg(tone, disc, customItem, customPrice ? +customPrice : null);
      const ok = injectMessage(msg);
      if (ok && autoSend) setTimeout(() => { clickSend(); showToast('✅ Message envoyé !'); }, 600);
    });
    panel.appendChild(sendBtn);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Juste copier';
    Object.assign(copyBtn.style, { width: '100%', padding: '8px', borderRadius: '10px', border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer', background: 'rgba(255,255,255,.05)', color: '#ede9fe', fontWeight: '600', fontSize: '12px', fontFamily: 'system-ui,sans-serif', marginTop: '6px' });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(getMsg(tone, disc, customItem, customPrice ? +customPrice : null));
      copyBtn.textContent = '✅ Copié !';
      setTimeout(() => copyBtn.textContent = '📋 Juste copier', 2000);
    });
    panel.appendChild(copyBtn);

    return { panel, reloadAi };
  }

  // ══ FAB ══
  function init() {
    if (document.getElementById('vai-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'vai-fab';
    fab.textContent = '🤖';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '20px', right: '16px', width: '52px', height: '52px',
      borderRadius: '50%', border: 'none', cursor: 'pointer', zIndex: '999999',
      background: 'linear-gradient(135deg,#8b5cf6,#10b981)', color: 'white',
      fontSize: '22px', boxShadow: '0 4px 16px rgba(139,92,246,.5)',
    });

    const { panel, reloadAi } = buildPanel();
    document.body.appendChild(panel);
    document.body.appendChild(fab);

    let open = false;
    fab.addEventListener('click', () => {
      open = !open;
      panel.style.display = open ? 'block' : 'none';
      fab.textContent = open ? '✕' : '🤖';
      if (open) reloadAi(); // rafraîchit les messages à chaque ouverture
    });

    document.addEventListener('click', (e) => {
      if (open && !panel.contains(e.target) && e.target !== fab) {
        open = false; panel.style.display = 'none'; fab.textContent = '🤖';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(init, 1000); }
  }).observe(document, { subtree: true, childList: true });

})();
