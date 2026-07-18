(() => {
  'use strict';

  /* ---------- Dark mode ---------- */
  const themeBtn = document.getElementById('themeBtn');
  const stored = localStorage_safe_get('penguard_theme');
  if (stored === 'dark') document.body.classList.add('dark');

  themeBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage_safe_set('penguard_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });

  function localStorage_safe_get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  function localStorage_safe_set(key, val) {
    try { window.localStorage.setItem(key, val); } catch { /* ignore */ }
  }

  /* ---------- Command palette (Ctrl/Cmd + K) ---------- */
  const cmdkOverlay = document.getElementById('cmdkOverlay');
  const cmdkInput = document.getElementById('cmdkInput');
  const cmdkResults = document.getElementById('cmdkResults');
  const cmdkBtn = document.getElementById('cmdkBtn');

  const PAGES = [
    { label: 'Grammar checker', href: '#checker' },
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Blog', href: '#blog' },
    { label: 'Comma rules', href: '/blog/comma-rules' },
    { label: 'Active vs. passive voice', href: '/blog/active-vs-passive-voice' },
    { label: 'Affect vs. effect', href: '/blog/affect-vs-effect' },
    { label: 'Resume writing tips', href: '/blog/resume-writing' },
  ];

  function openCmdk() {
    cmdkOverlay.classList.add('open');
    cmdkInput.value = '';
    renderCmdk('');
    setTimeout(() => cmdkInput.focus(), 30);
  }
  function closeCmdk() { cmdkOverlay.classList.remove('open'); }

  function renderCmdk(query) {
    const q = query.trim().toLowerCase();
    const matches = PAGES.filter(p => p.label.toLowerCase().includes(q));
    cmdkResults.innerHTML = matches.map(p =>
      `<a class="cmdk-item" href="${p.href}">${p.label}<span>↵</span></a>`
    ).join('') || '<div class="cmdk-item">No matches</div>';
  }

  cmdkBtn?.addEventListener('click', openCmdk);
  cmdkInput?.addEventListener('input', (e) => renderCmdk(e.target.value));
  cmdkOverlay?.addEventListener('click', (e) => { if (e.target === cmdkOverlay) closeCmdk(); });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      cmdkOverlay.classList.contains('open') ? closeCmdk() : openCmdk();
    }
    if (e.key === 'Escape') closeCmdk();
  });

  /* ---------- Hero typing animation ---------- */
  const target = document.getElementById('heroTypeTarget');
  if (target) {
    const before = 'She dont like apples and dont know why.';
    const afterHtml = 'She <span class="fix">doesn\'t</span> like apples and <span class="fix">doesn\'t</span> know why.';
    let i = 0;
    let phase = 'typing';

    function tick() {
      if (phase === 'typing') {
        i++;
        target.innerHTML = escapeHtml(before.slice(0, i)) + '<span class="blink-cursor"></span>';
        if (i >= before.length) {
          phase = 'pause';
          setTimeout(tick, 500);
          return;
        }
        setTimeout(tick, 38);
      } else if (phase === 'pause') {
        target.innerHTML = before.replace('dont', '<span class="err">dont</span>').replace('dont', '<span class="err">dont</span>');
        phase = 'reveal';
        setTimeout(tick, 900);
      } else if (phase === 'reveal') {
        target.innerHTML = afterHtml;
        phase = 'done';
      }
    }
    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    tick();
  }

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- Utility buttons ---------- */
  document.getElementById('pasteBtn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const editor = document.getElementById('editor');
      editor.value = text;
      editor.dispatchEvent(new Event('input'));
    } catch {
      alert('Clipboard access was blocked. Paste manually with Ctrl/Cmd+V instead.');
    }
  });

  document.getElementById('voiceBtn')?.addEventListener('click', () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Voice input is not supported in this browser.');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const editor = document.getElementById('editor');
      editor.value += (editor.value ? ' ' : '') + e.results[0][0].transcript;
      editor.dispatchEvent(new Event('input'));
    };
    rec.start();
  });

  document.getElementById('shareBtn')?.addEventListener('click', async () => {
    const url = window.location.href.split('#')[0] + '#checker';
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard.');
    } catch {
      prompt('Copy this link:', url);
    }
  });
})();
