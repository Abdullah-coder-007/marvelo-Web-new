// Website check: while API_BASE is empty nothing below talks to the network and the old hand-off runs.
const API_BASE = '';
const TURNSTILE_SITE_KEY = '';

// "I already have a website" page: before/after slider, website-address hand-off, warning-signs checklist.
// Relies on window.MW from main.js; main.js also runs the 2-step form, sticky CTA and 3D assembly.
(() => {
  const { applyNiche, reducedMotion } = window.MW;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // ---------- before / after ----------
  const ba = $('ba');
  const range = ba.querySelector('.ba__range');
  applyNiche(ba.querySelector('.ba__after'), 'plumbing', { brand: 'Your Business', url: 'yourbusiness.com' });
  const setPos = (v) => ba.style.setProperty('--pos', `${v}%`);
  let touched = false;
  range.addEventListener('input', () => { touched = true; setPos(range.value); });

  // One demonstration sweep after the hero settles, so visitors see the slider is draggable
  const sweep = () => {
    if (reducedMotion || touched) return;
    const keys = [[0, 50], [900, 16], [1900, 84], [2700, 50]];
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => {
      if (touched) return;
      const t = now - start;
      let i = keys.findIndex(([at]) => at > t);
      if (i === -1) { setPos(50); range.value = 50; return; }
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const v = v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
      setPos(v.toFixed(2));
      range.value = Math.round(v);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const waitForGo = new MutationObserver(() => {
    if (!root.classList.contains('go')) return;
    waitForGo.disconnect();
    setTimeout(sweep, 1400);
  });
  if (root.classList.contains('go')) setTimeout(sweep, 1400);
  else waitForGo.observe(root, { attributes: true, attributeFilter: ['class'] });

  // ---------- website address: shows in both address bars, then hands off to the form ----------
  let checking = false;
  const urlForm = $('url-form');
  const urlInput = $('u-site');
  const urlErr = $('u-site-err');
  const echo = $('echo-site');
  const cityInput = $('u-city');
  const cityErr = $('u-city-err');
  if (API_BASE) $('u-city-wrap').hidden = false; // the city is only asked for while the check is switched on
  const domainOf = (s) => s.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
  const showDomain = () => {
    const d = domainOf(urlInput.value);
    ba.querySelectorAll('[data-url]').forEach((el) => (el.textContent = d || 'yourbusiness.com'));
    echo.textContent = d || 'your website';
  };
  urlInput.addEventListener('input', () => {
    showDomain();
    if (urlInput.getAttribute('aria-invalid') === 'true') { urlInput.setAttribute('aria-invalid', 'false'); urlErr.textContent = ''; }
  });
  cityInput.addEventListener('input', () => {
    if (cityInput.getAttribute('aria-invalid') === 'true') { cityInput.setAttribute('aria-invalid', 'false'); cityErr.textContent = ''; }
  });

  urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (checking) return; // a check is already running
    const d = domainOf(urlInput.value);
    if (!d || !d.includes('.')) {
      urlInput.setAttribute('aria-invalid', 'true');
      urlErr.textContent = d ? 'That doesn\'t look like a website address. Try something like yourbusiness.com.' : 'Add your website address, like yourbusiness.com.';
      urlInput.focus();
      return;
    }
    const city = cityInput.value.trim();
    if (API_BASE && !city) {
      cityInput.setAttribute('aria-invalid', 'true');
      cityErr.textContent = 'Add your city, like Columbus, OH.';
      cityInput.focus();
      return;
    }
    cityInput.setAttribute('aria-invalid', 'false');
    cityErr.textContent = '';
    $('s-site').value = d;
    if (API_BASE) { runCheck(d, city); return; }
    $('start').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => $('s-biz').focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  });
  $('s-site').addEventListener('input', (e) => { urlInput.value = e.target.value; showDomain(); });

  // ---------- website check report ----------
  const submitBtn = urlForm.querySelector('button[type="submit"]');
  if (API_BASE && submitBtn.firstChild) submitBtn.firstChild.nodeValue = 'Check my website '; // the label only changes while the check is switched on
  const reportEl = $('report');
  const statusEl = $('report-status');
  const stepsEl = $('report-steps');
  const bodyEl = $('report-body');
  const steps = [...stepsEl.children];
  const MSG_UNREACHED = "We couldn't reach that website.";
  const TOKEN_TIMEOUT = 30000;
  const FETCH_TIMEOUT = 40000;
  const MSG_LATER = 'Please try again in a little while.';
  let tsPromise = null;

  // Turnstile is only loaded once, and only when both constants are set
  const loadTurnstile = () => (tsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { tsPromise = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  }));
  // A fresh token for every check. Every way it can stall ends in a rejection, so the button never stays locked.
  const getToken = async (box = $('ts-box')) => {
    if (!TURNSTILE_SITE_KEY) return '';
    const ts = await loadTurnstile();
    return new Promise((resolve, reject) => {
      let id;
      const done = (fn, v) => { clearTimeout(t); try { ts.remove(id); } catch (e) {} fn(v); };
      const t = setTimeout(() => done(reject, new Error('turnstile')), TOKEN_TIMEOUT);
      const stall = () => done(reject, new Error('turnstile'));
      id = ts.render(box, {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: 'interaction-only',
        callback: (tok) => done(resolve, tok),
        'error-callback': stall,
        'timeout-callback': stall,
        'expired-callback': stall,
        'unsupported-callback': stall,
      });
    });
  };

  // Step ticks get a spoken state as well as the visual tick
  const tick = (li, done) => {
    li.classList.toggle('is-done', done);
    const old = li.querySelector('.sr');
    if (old) old.remove();
    if (done) li.appendChild(text('span', 'sr', ' done'));
  };
  const text = (tag, cls, str) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = str;
    return el;
  };
  const showReport = () => {
    reportEl.hidden = false;
    reportEl.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };
  const fail = (msg) => {
    stepsEl.hidden = true;
    bodyEl.hidden = true;
    showReport(); // unhide first so the live region announces the text
    statusEl.classList.add('is-error');
    statusEl.textContent = msg;
    reportEl.focus({ preventScroll: true });
  };

  // ---------- live preview (WordPress mshots screenshot) ----------
  const live = $('live');
  const liveImg = $('live-img');
  const livePanel = $('live-panel');
  let liveTimer = null;
  let baMoved = false;
  const moveBeforeAfter = () => {
    if (baMoved) return;
    baMoved = true;
    $('ba-after-slot').appendChild($('ba-wrap')); // a DOM move, so the slider's listeners keep working
    $('ba-after').hidden = false;
  };
  const showLive = (domain) => {
    clearTimeout(liveTimer);
    $('live-url').textContent = domain;
    $('live-domain').textContent = domain;
    livePanel.hidden = true;
    live.hidden = false;
    moveBeforeAfter();
    const src = `https://s.wordpress.com/mshots/v1/${encodeURIComponent('https://' + domain)}?w=1200&h=800`;
    let retried = false;
    // mshots may answer with a small placeholder first; a real screenshot is wide
    const good = () => liveImg.complete && liveImg.naturalWidth >= 600;
    liveImg.onload = () => { livePanel.hidden = true; };
    liveImg.onerror = () => { if (retried) livePanel.hidden = false; };
    liveImg.src = src;
    liveTimer = setTimeout(() => {
      if (good()) return;
      retried = true;
      liveImg.src = `${src}&r=2`;
      liveTimer = setTimeout(() => { if (!good()) livePanel.hidden = false; }, 6000);
    }, 4000);
  };

  let lastDomain = '';
  let lastCity = '';
  const renderRankings = (card, c) => {
    const table = document.createElement('table');
    table.className = 'rcard__rank';
    const head = table.createTHead().insertRow();
    head.appendChild(text('th', '', 'Search')).scope = 'col';
    head.appendChild(text('th', '', 'Position')).scope = 'col';
    const none = typeof c.depth === 'number' ? `Not in the top ${c.depth}` : 'Not on the first page';
    const tb = table.createTBody();
    (c.results || []).forEach((x) => {
      const row = tb.insertRow();
      row.appendChild(text('td', '', x.keyword));
      row.appendChild(text('td', '', typeof x.position === 'number' ? `#${x.position}` : none));
    });
    card.appendChild(table);
    const inMaps = (c.results || []).some((x) => x.inMaps);
    card.appendChild(text('p', 'rcard__maps', `Shows on Google Maps: ${inMaps ? 'Yes' : 'No'}`));
  };

  // address and city go into the funnel (the city as a hidden field, so the lead email carries it)
  const fillFunnel = () => {
    const f = $('funnel');
    if (lastDomain) $('s-site').value = lastDomain;
    if (lastCity) {
      let hid = f.querySelector('input[name="city"]');
      if (!hid) {
        hid = document.createElement('input');
        hid.type = 'hidden';
        hid.name = 'city';
        hid.dataset.label = 'City';
        f.appendChild(hid);
      }
      hid.value = lastCity;
    }
  };

  const renderReport = (r) => {
    $('report-score').textContent = typeof r.score === 'number' ? Math.round(r.score) : '–';
    $('report-verdict').textContent = r.verdict || '';
    const cards = $('report-cards');
    cards.replaceChildren();
    (r.categories || []).forEach((c) => {
      const card = document.createElement('article');
      card.className = 'rcard';
      const head = document.createElement('div');
      head.className = 'rcard__head';
      head.appendChild(text('h3', 'rcard__title', c.title));
      const na = c.status === 'unavailable' || typeof c.score !== 'number';
      head.appendChild(text('p', 'rcard__score' + (na ? ' is-na' : ''), na ? "Couldn't check" : `${Math.round(c.score)}/100`));
      card.appendChild(head);
      if (na) {
        // the server explains why in its first issue; show that text as it is
        const why = (c.issues && c.issues[0]) || {};
        card.appendChild(text('p', 'rcard__note', why.problem || "We couldn't check this one."));
        if (why.fix) card.appendChild(text('p', 'rcard__note', why.fix));
        cards.appendChild(card);
        return;
      }
      if (c.key === 'rankings' && (c.results || []).length) renderRankings(card, c);
      const list = document.createElement('ul');
      list.className = 'rcard__issues';
      (!na && c.issues ? c.issues : []).forEach((i) => {
        const li = document.createElement('li');
        li.appendChild(text('p', 'rcard__problem', i.problem));
        const fix = text('p', 'rcard__fix', ' ' + i.fix);
        fix.prepend(text('b', '', 'How we fix it:'));
        li.appendChild(fix);
        list.appendChild(li);
      });
      if (list.children.length) card.appendChild(list);
      else if (c.key !== 'rankings' || !(c.results || []).length) card.appendChild(text('p', 'rcard__none', 'Nothing to fix here.'));
      cards.appendChild(card);
    });
    // pitch
    const pitch = r.pitch || {};
    const pts = Array.isArray(pitch.points) ? pitch.points : [];
    $('report-pitch').hidden = !pts.length;
    $('pitch-title').textContent = pitch.headline || "Here's what's costing you customers";
    const pl = $('pitch-list');
    pl.replaceChildren();
    pts.forEach((p) => {
      const li = document.createElement('li');
      li.appendChild(text('p', 'pitch__problem', p.problem));
      li.appendChild(text('p', 'pitch__fix', p.fix));
      pl.appendChild(li);
    });
    // print-only header
    $('print-site').textContent = lastDomain;
    $('print-city').textContent = r.city || lastCity;
    $('print-date').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    fillFunnel();
    window.MW.lastReportId = r.id;
  };

  async function runCheck(domain, city) {
    if (checking) return;
    checking = true;
    window.MW.lastReportId = null; // never leave a stale id for the lead form
    lastDomain = domain;
    lastCity = city;
    showLive(domain);
    submitBtn.disabled = true;
    statusEl.classList.remove('is-error');
    bodyEl.hidden = true;
    steps.forEach((li) => tick(li, false));
    stepsEl.hidden = false;
    showReport();
    statusEl.textContent = 'Checking your website. This usually takes about 20 seconds.';
    const timers = [2000, 6000, 10000].map((ms, i) => setTimeout(() => tick(steps[i], true), ms));
    const abort = new AbortController();
    let fetchTimer; // started after the token arrives, so a slow Turnstile click does not eat the fetch budget
    try {
      const turnstileToken = await getToken();
      fetchTimer = setTimeout(() => abort.abort(), FETCH_TIMEOUT);
      const res = await fetch(`${API_BASE}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: domain, city, turnstileToken }),
        signal: abort.signal,
      });
      if (res.status === 429 || res.status === 403) { fail(MSG_LATER); return; }
      if (!res.ok) { fail(MSG_UNREACHED); return; }
      const report = await res.json();
      if (!report || typeof report.score !== 'number') { fail(MSG_UNREACHED); return; }
      timers.forEach(clearTimeout);
      steps.forEach((li) => tick(li, true));
      renderReport(report);
      stepsEl.hidden = true;
      bodyEl.hidden = false;
      showReport();
      statusEl.textContent = 'Your report is ready.';
      reportEl.focus({ preventScroll: true });
    } catch (err) {
      // a stalled Turnstile or a hung worker reads as "try again later"; a refused connection as unreachable
      fail(err && (err.name === 'AbortError' || err.message === 'turnstile') ? MSG_LATER : MSG_UNREACHED);
    } finally {
      timers.forEach(clearTimeout);
      clearTimeout(fetchTimer);
      checking = false;
      submitBtn.disabled = false;
    }
  }

  // Send the finished form to the server. Resolves true only on a 202; every other outcome is false so main.js falls back to email.
  if (API_BASE) {
    window.MW.sendLead = async (form) => {
      const abort = new AbortController();
      let timer;
      try {
        const data = {};
        [...form.elements].forEach((el) => {
          if (!el.name || (el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
          data[el.name] = el.value.trim();
        });
        data.reportId = window.MW.lastReportId || null;
        data.turnstileToken = await getToken($('ts-box-lead'));
        timer = setTimeout(() => abort.abort(), 20000);
        const res = await fetch(`${API_BASE}/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: abort.signal,
        });
        return res.status === 202;
      } catch (e) {
        return false;
      } finally {
        clearTimeout(timer);
      }
    };
  }

  // "Fix my website": the address and city go into the form, then jump to the first empty field
  $('report-enhance').addEventListener('click', () => {
    fillFunnel();
    $('start').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    const first = ['s-site', 's-biz'].map($).find((el) => !el.value.trim()) || $('s-biz');
    setTimeout(() => first.focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  });
  $('report-print').addEventListener('click', () => {
    const root = document.documentElement;
    const clear = () => { root.classList.remove('print-report'); window.removeEventListener('afterprint', clear); };
    root.classList.add('print-report');
    window.addEventListener('afterprint', clear);
    setTimeout(clear, 60000); // fallback if afterprint never fires
    window.print();
  });

  // ---------- warning-signs checklist ----------
  const boxes = [...document.querySelectorAll('#check-list input')];
  const bar = $('meter-bar');
  const messages = [
    'Tick anything that sounds familiar.',
    'A couple of fixes would make a real difference.',
    'A couple of fixes would make a real difference.',
    'Your website is probably costing you calls.',
    'Your website is probably costing you calls.',
    "Your website is working against you. Let's fix that.",
    "Your website is working against you. Let's fix that.",
  ];
  const update = () => {
    const picked = boxes.filter((b) => b.checked);
    const n = picked.length;
    $('meter-n').textContent = n;
    bar.style.width = `${(n / boxes.length) * 100}%`;
    $('meter-msg').textContent = messages[n];
    $('s-issues').value = picked.map((b) => b.value).join('; ');
  };
  boxes.forEach((b) => b.addEventListener('change', update));
  update();
})();
