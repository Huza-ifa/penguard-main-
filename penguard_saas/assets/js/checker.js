(() => {
  'use strict';

  const editor = document.getElementById('editor');
  const checkBtn = document.getElementById('checkBtn');
  const clearBtn = document.getElementById('clearBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const langSelect = document.getElementById('langSelect');
  const issuesList = document.getElementById('issuesList');

  const statWords = document.getElementById('statWords');
  const statChars = document.getElementById('statChars');
  const statSentences = document.getElementById('statSentences');
  const statTime = document.getElementById('statTime');

  const scoreNum = document.getElementById('scoreNum');
  const scoreBar = document.getElementById('scoreBar');
  const readLevel = document.getElementById('readLevel');
  const metricGrammar = document.getElementById('metricGrammar');
  const metricSpelling = document.getElementById('metricSpelling');
  const metricTone = document.getElementById('metricTone');
  const metricReadability = document.getElementById('metricReadability');

  const API_URL = 'https://api.languagetool.org/v2/check';
  let lastCorrectedText = '';
  let lastIssues = [];

  /* ============================================================
     WEAK-SPOT TRACKER (local-only, no server/account needed)
     Tracks which categories/rule types trip you up over time,
     stored entirely in localStorage on this device.
     ============================================================ */
  const HISTORY_KEY = 'penguard_weakspots_v1';

  function loadWeakSpots() {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveWeakSpots(data) {
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }

  function recordIssues(issues) {
    const store = loadWeakSpots();
    for (const issue of issues) {
      const key = (issue.shortMessage || issue.category).trim().toLowerCase();
      if (!key) continue;
      if (!store[key]) store[key] = { count: 0, category: issue.category, label: issue.shortMessage || issue.category };
      store[key].count += 1;
    }
    saveWeakSpots(store);
    renderWeakSpots();
  }

  function renderWeakSpots() {
    const store = loadWeakSpots();
    const entries = Object.values(store).sort((a, b) => b.count - a.count).slice(0, 5);
    const panel = document.getElementById('weakSpotsPanel');
    if (!panel) return;

    if (entries.length === 0) {
      panel.innerHTML = `<div class="empty-state" style="padding:20px 8px;">Check a few pieces of text and your recurring patterns will show up here — stored only on this device.</div>`;
      return;
    }

    const maxCount = entries[0].count;
    panel.innerHTML = entries.map(e => `
      <div class="weakspot-row">
        <div class="weakspot-top">
          <span class="issue-tag tag-${e.category}">${e.category}</span>
          <span class="weakspot-count">${e.count}&times;</span>
        </div>
        <div class="weakspot-label">${escapeHtml(e.label)}</div>
        <div class="weakspot-bar-track"><div class="weakspot-bar-fill" style="width:${Math.round((e.count / maxCount) * 100)}%"></div></div>
      </div>
    `).join('');
  }

  document.getElementById('resetWeakSpotsBtn')?.addEventListener('click', () => {
    if (!confirm('Clear your local weak-spot history? This only affects this browser.')) return;
    saveWeakSpots({});
    renderWeakSpots();
  });

  /* ============================================================
     CONFIDENCE TAGS — LanguageTool doesn't expose a numeric
     confidence score, so we derive a simple, honest high/medium
     tier from the rule category: spelling/typo rules are near-
     deterministic (dictionary lookups), grammar rules are pattern
     based, and style/redundancy rules are the most subjective.
     ============================================================ */
  function confidenceFor(category) {
    if (category === 'spelling') return { label: 'High confidence', cls: 'conf-high' };
    if (category === 'punctuation' || category === 'grammar') return { label: 'Medium confidence', cls: 'conf-med' };
    return { label: 'Worth a look', cls: 'conf-low' };
  }

  /* ============================================================
     ACADEMIC MODE — flags contractions, casual phrasing, and
     first-person overuse for report/essay writing. Pure regex,
     runs client-side alongside the LanguageTool pass.
     ============================================================ */
  const academicToggle = document.getElementById('academicModeToggle');

  function checkAcademicStyle(text) {
    const flags = [];
    const contractionRe = /\b(don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|weren't|it's|i'm|you're|they're|we're|shouldn't|couldn't|wouldn't)\b/gi;
    let m;
    while ((m = contractionRe.exec(text)) !== null) {
      flags.push({
        offset: m.index, length: m[0].length, errorText: m[0],
        message: 'Contractions like this read as informal in academic writing.',
        shortMessage: 'Avoid contraction in academic writing',
        category: 'style',
        suggestions: [expandContraction(m[0])],
      });
    }

    const firstPersonCount = (text.match(/\b(I|my|me|we|our)\b/g) || []).length;
    if (firstPersonCount >= 4) {
      flags.push({
        offset: 0, length: 0, errorText: '',
        message: `First-person pronouns appear ${firstPersonCount} times. Many academic styles prefer passive or third-person framing for objectivity.`,
        shortMessage: 'Frequent first-person voice',
        category: 'style',
        suggestions: [],
      });
    }
    return flags;
  }

  function expandContraction(word) {
    const map = {
      "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot",
      "won't": "will not", "isn't": "is not", "aren't": "are not", "wasn't": "was not",
      "weren't": "were not", "it's": "it is", "i'm": "I am", "you're": "you are",
      "they're": "they are", "we're": "we are", "shouldn't": "should not",
      "couldn't": "could not", "wouldn't": "would not",
    };
    return map[word.toLowerCase()] || word;
  }


  /* ---------- Live counters as you type ---------- */
  editor.addEventListener('input', updateLiveStats);
  function updateLiveStats() {
    const text = editor.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || (text.trim() ? 1 : 0);

    statWords.textContent = words.toLocaleString();
    statChars.textContent = text.length.toLocaleString();
    statSentences.textContent = sentences.toLocaleString();
    statTime.textContent = Math.max(text.trim() ? 1 : 0, Math.round(words / 200));
  }

  /* ---------- Check button ---------- */
  checkBtn.addEventListener('click', runCheck);

  async function runCheck() {
    const text = editor.value.trim();
    if (!text) {
      renderEmpty('Enter some text first, then click Check text.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        text,
        language: langSelect.value,
        enabledOnly: 'false',
      });

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!res.ok) throw new Error('API request failed (' + res.status + ')');

      const data = await res.json();
      let issues = parseMatches(text, data.matches || []);

      if (academicToggle?.checked) {
        issues = issues.concat(checkAcademicStyle(text));
      }

      lastIssues = issues;
      recordIssues(issues);
      renderResults(text, issues);
    } catch (err) {
      renderEmpty('Could not reach the checking service. Check your connection and try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    checkBtn.disabled = loading;
    checkBtn.textContent = loading ? 'Checking…' : 'Check text';
  }

  /* ---------- Parse LanguageTool response ---------- */
  function parseMatches(originalText, matches) {
    return matches.map(m => {
      const offset = m.offset;
      const length = m.length;
      const errorText = originalText.substring(offset, offset + length);
      const suggestions = (m.replacements || []).slice(0, 5).map(r => r.value);
      const categoryId = (m.rule && m.rule.category && m.rule.category.id) || '';
      return {
        offset, length, errorText,
        message: m.message || '',
        shortMessage: m.shortMessage || '',
        category: mapCategory(categoryId),
        suggestions,
      };
    });
  }

  function mapCategory(id) {
    const u = (id || '').toUpperCase();
    if (u === 'TYPOS' || u === 'SPELLING') return 'spelling';
    if (u === 'PUNCTUATION') return 'punctuation';
    if (u === 'STYLE' || u === 'REDUNDANCY') return 'style';
    return 'grammar';
  }

  /* ---------- Scoring (mirrors the C# BaseGrammarChecker logic) ---------- */
  function calculateScore(issues, wordCount) {
    if (issues.length === 0) return 100;
    const raw = 100 - Math.round((issues.length / Math.max(wordCount, 1)) * 260);
    return Math.max(35, raw);
  }

  function estimateReadability(text, wordCount) {
    const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || 1;
    const avgWordsPerSentence = wordCount / sentences;
    if (avgWordsPerSentence <= 12) return { label: 'Easy', level: '5th–6th grade' };
    if (avgWordsPerSentence <= 18) return { label: 'Standard', level: '8th–9th grade' };
    if (avgWordsPerSentence <= 24) return { label: 'Fairly hard', level: '10th–12th grade' };
    return { label: 'Difficult', level: 'College level' };
  }

  function estimateTone(text) {
    const casualMarkers = /\b(gonna|wanna|kinda|lol|hey|yeah|awesome|cool)\b/i;
    const formalMarkers = /\b(therefore|furthermore|consequently|pursuant|hereby|shall)\b/i;
    if (formalMarkers.test(text)) return 'Formal';
    if (casualMarkers.test(text)) return 'Casual';
    return 'Neutral';
  }

  /* ---------- Apply corrections to build the "corrected" text ---------- */
  function buildCorrectedText(text, issues) {
    const ordered = issues
      .filter(i => i.suggestions.length > 0)
      .slice()
      .sort((a, b) => b.offset - a.offset);

    let result = text;
    for (const issue of ordered) {
      if (issue.offset < 0 || issue.offset + issue.length > result.length) continue;
      result = result.slice(0, issue.offset) + issue.suggestions[0] + result.slice(issue.offset + issue.length);
    }
    return result;
  }

  /* ---------- Render ---------- */
  function renderResults(text, issues) {
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const score = calculateScore(issues, wordCount);
    const readability = estimateReadability(text, wordCount);
    const tone = estimateTone(text);

    scoreNum.textContent = score;
    scoreBar.style.width = score + '%';
    scoreNum.style.color = score >= 80 ? 'var(--success)' : score >= 55 ? '#B45309' : 'var(--danger)';
    readLevel.textContent = readability.level;

    const grammarCount = issues.filter(i => i.category === 'grammar').length;
    const spellingCount = issues.filter(i => i.category === 'spelling').length;
    metricGrammar.textContent = grammarCount;
    metricSpelling.textContent = spellingCount;
    metricTone.textContent = tone;
    metricReadability.textContent = readability.label;

    lastCorrectedText = buildCorrectedText(text, issues);

    if (issues.length === 0) {
      issuesList.innerHTML = `
        <div class="empty-state">
          <div class="glyph">✓</div>
          No issues found — this text looks clean.
        </div>`;
      return;
    }

    issuesList.innerHTML = issues.map((issue, idx) => {
      const conf = confidenceFor(issue.category);
      return `
      <div class="issue-card" data-idx="${idx}">
        <div class="issue-top-row">
          <span class="issue-tag tag-${issue.category}">${issue.category}</span>
          <span class="confidence-tag ${conf.cls}">${conf.label}</span>
        </div>
        <div class="issue-words">
          ${issue.errorText ? `<span class="from">${escapeHtml(issue.errorText)}</span>` : ''}
          ${issue.suggestions[0] ? ` → <span class="to">${escapeHtml(issue.suggestions[0])}</span>` : ''}
        </div>
        <div class="issue-explain">${escapeHtml(issue.shortMessage || issue.message)}</div>
      </div>
    `;
    }).join('');

    issuesList.querySelectorAll('.issue-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        applyIssue(idx);
      });
    });
  }

  function applyIssue(idx) {
    const issue = lastIssues[idx];
    if (!issue || !issue.suggestions[0]) return;
    const text = editor.value;
    if (issue.offset < 0 || issue.offset + issue.length > text.length) return;

    editor.value = text.slice(0, issue.offset) + issue.suggestions[0] + text.slice(issue.offset + issue.length);
    updateLiveStats();
    runCheck();
  }

  function renderEmpty(message) {
    issuesList.innerHTML = `<div class="empty-state"><div class="glyph">!</div>${escapeHtml(message)}</div>`;
    scoreNum.textContent = '—';
    scoreBar.style.width = '0%';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- Toolbar actions ---------- */
  clearBtn.addEventListener('click', () => {
    editor.value = '';
    updateLiveStats();
    renderEmpty('Enter your text and click Check text to see suggestions here.');
    scoreNum.textContent = '100';
    scoreBar.style.width = '100%';
    readLevel.textContent = '—';
    metricGrammar.textContent = '0';
    metricSpelling.textContent = '0';
    metricTone.textContent = 'Neutral';
    metricReadability.textContent = '—';
  });

  copyBtn.addEventListener('click', async () => {
    if (!lastCorrectedText) return;
    try {
      await navigator.clipboard.writeText(lastCorrectedText);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy corrected'), 1500);
    } catch {
      prompt('Copy this text:', lastCorrectedText);
    }
  });

  downloadBtn.addEventListener('click', () => {
    const content = lastCorrectedText || editor.value;
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'penguard-corrected.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  /* ---------- Keyboard shortcut: Ctrl/Cmd+Enter to check ---------- */
  editor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runCheck();
    }
  });

  /* ---------- Init ---------- */
  renderWeakSpots();
})();
