// Marveloweb — shared interactions for every page.
// Each block only runs when its page has the matching markup.
(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Nav: border on scroll + mobile menu ----------
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  const menu = document.getElementById('menu');
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  if (nav && toggle && menu) {
    const setMenu = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
  }

  // ---------- Arrival sequence: curtain (first visit only) → page entrance ----------
  const curtain = document.querySelector('.curtain');
  // 'mw:arrived' tells page scripts the intro is over (the home page opens its path chooser then)
  const startHero = () => requestAnimationFrame(() => {
    root.classList.add('go');
    document.dispatchEvent(new Event('mw:arrived'));
  });
  if (curtain && root.classList.contains('intro')) {
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      root.classList.add('intro-leave');
      setTimeout(startHero, 280); // the page starts entering while the curtain is mid-wipe
      curtain.addEventListener('transitionend', () => curtain.remove(), { once: true });
      try { sessionStorage.setItem('mw-intro', '1'); } catch (e) {}
      removeEventListener('keydown', skip);
    };
    const skip = () => { clearTimeout(timer); leave(); };
    const timer = setTimeout(leave, 1750);
    curtain.addEventListener('click', skip);
    addEventListener('keydown', skip);
  } else {
    startHero();
  }

  // ---------- Trade skins for the mock website (concept copy, not client claims) ----------
  const niches = {
    plumbing: { url: 'flowrightplumbing.com', brand: 'FlowRight Plumbing', h: 'Leak? Fixed today.', sub: 'Licensed plumbers across the metro area. Upfront prices, no call-out surprises.', btn: 'Book a plumber', chip: 'Open 24/7', c: ['Emergency repairs', 'Water heaters', 'Drain cleaning'], cta: 'Call now, we answer around the clock',
      icon: 'M12 2.5s6.5 7.2 6.5 11.5a6.5 6.5 0 01-13 0C5.5 9.7 12 2.5 12 2.5z' },
    hvac: { url: 'coolbreezehvac.com', brand: 'Coolbreeze HVAC', h: 'AC out? Cool again by tonight.', sub: 'Same-day heating and cooling repairs, with a quote before we start.', btn: 'Get a quote', chip: 'Same-day service', c: ['AC repair', 'Furnace service', 'Maintenance plans'], cta: 'Book a tune-up before summer',
      icon: 'M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9 4l3 2 3-2M9 20l3-2 3 2' },
    roofing: { url: 'ridgelineroofing.com', brand: 'Ridgeline Roofing', h: "Storm damage? We're up there by tomorrow.", sub: 'Repairs, replacements and free inspections from a local crew.', btn: 'Free inspection', chip: 'Licensed & insured', c: ['Storm repair', 'Full replacement', 'Gutters'], cta: 'Get your roof checked this week',
      icon: 'M2 12l10-8 10 8M5 10v10h14V10M10 20v-5h4v5' },
    dental: { url: 'brightsidedental.com', brand: 'Brightside Dental', h: 'Same-week appointments, gentle care.', sub: 'Family dentistry with evening slots and online booking.', btn: 'Book online', chip: 'New patients welcome', c: ['Check-ups', 'Whitening', 'Emergency visits'], cta: 'Book your check-up in two minutes',
      icon: 'M7 3c-2.5 0-4 2-4 4.5 0 2.4 1 4.4 1.8 7 .7 2.4 1.3 6.5 2.7 6.5 1.6 0 1.4-5 4.5-5s2.9 5 4.5 5c1.4 0 2-4.1 2.7-6.5.8-2.6 1.8-4.6 1.8-7C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z' },
    medspa: { url: 'glowmedspa.com', brand: 'Glow Med Spa', h: 'Look rested. Feel like you.', sub: 'Facials, peels and injectables by licensed practitioners.', btn: 'Book a consultation', chip: 'Free first consultation', c: ['Facials', 'Chemical peels', 'Injectables'], cta: 'Your first consultation is on us',
      icon: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z' },
  };
  // Fill a .site mock with a trade's copy and colors; `over` replaces fields (e.g. a visitor's own business name)
  const applyNiche = (siteEl, key, over = {}) => {
    const n = { ...niches[key], ...over };
    siteEl.dataset.niche = key;
    siteEl.querySelector('.site__url').textContent = n.url;
    siteEl.querySelectorAll('[data-icon]').forEach((path) => path.setAttribute('d', n.icon));
    siteEl.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      el.textContent = k[0] === 'c' && k.length === 2 ? n.c[+k[1]] : n[k];
    });
  };
  window.MW = { niches, applyNiche, reducedMotion };

  // ---------- 3D assembly: floating pieces fly into one site as the section scrolls past ----------
  const assemble = document.querySelector('.assemble');
  if (assemble) {
    const site = assemble.querySelector('.site');
    const pieces = [...site.querySelectorAll('.piece')];

    // Where each piece floats before landing: x/y as a share of the site's width/height, z in px, rotations in degrees
    const scatter = [
      { x: -0.42, y: -0.62, z: -260, rx: 24, ry: -32, rz: -9 },  // nav
      { x: -0.62, y: 0.02, z: 180, rx: -12, ry: 34, rz: 5 },     // hero text
      { x: 0.58, y: -0.42, z: -120, rx: 16, ry: -28, rz: 7 },    // picture
      { x: -0.5, y: 0.62, z: 140, rx: -26, ry: 22, rz: -11 },    // card 1
      { x: 0.04, y: 0.78, z: -320, rx: 30, ry: 8, rz: 9 },       // card 2
      { x: 0.62, y: 0.52, z: 230, rx: -16, ry: -30, rz: -6 },    // card 3
      { x: 0.36, y: -0.8, z: 60, rx: 26, ry: 14, rz: 10 },       // call-to-action bar
    ];
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    if (reducedMotion) {
      assemble.classList.add('is-built');
    } else {
      let built = false, visible = false, raf = 0, px = 0, py = 0;
      const narrow = matchMedia('(max-width: 640px)');

      const frame = (now) => {
        raf = 0;
        const r = assemble.getBoundingClientRect();
        const span = r.height - innerHeight;
        const p = span > 0 ? clamp01(-r.top / span) : 1;
        const w = site.offsetWidth, h = site.offsetHeight;
        // On phones the site is tall and narrow: keep the scatter inside the screen, the depth shallower,
        // and shrink pieces while they float so they grow into place instead of crowding the screen
        // (yUp limits upward drift so nothing floats into the headline on a short screen)
        const k = narrow.matches ? { x: 0.38, y: 0.3, yUp: 0.08, z: 0.35, r: 0.7, s: 0.32 } : { x: 1, y: 1, yUp: 1, z: 1, r: 1, s: 0 };
        let landed = 0;

        pieces.forEach((el, i) => {
          const s = scatter[i];
          const t = easeInOut(clamp01((p - 0.04 - i * 0.045) / 0.5));
          const f = 1 - t;
          const fr = f * k.r;
          const drift = Math.sin(now / 1100 + i * 1.7) * 10 * f; // idle bobbing while it floats
          el.style.transform =
            `translate3d(${(s.x * k.x * w * f).toFixed(1)}px, ${(s.y * (s.y < 0 ? k.yUp : k.y) * h * f + drift).toFixed(1)}px, ${(s.z * k.z * f).toFixed(1)}px) ` +
            `rotateX(${(s.rx * fr).toFixed(2)}deg) rotateY(${(s.ry * fr).toFixed(2)}deg) rotateZ(${(s.rz * fr).toFixed(2)}deg) ` +
            `scale(${(1 - k.s * f).toFixed(3)})`;
          el.style.setProperty('--f', f.toFixed(3));
          if (t >= 1) landed++;
        });

        const b = clamp01((p - 0.55) / 0.2);
        site.style.setProperty('--built', b.toFixed(3));
        const tilt = 1 - b * 0.6; // the finished site still leans a little toward the pointer
        site.style.transform = `rotateX(${(-py * 6 * tilt).toFixed(2)}deg) rotateY(${(px * 8 * tilt).toFixed(2)}deg)`;

        const nowBuilt = landed === pieces.length;
        if (nowBuilt !== built) {
          built = nowBuilt;
          assemble.classList.toggle('is-built', built);
          if (built) {
            site.classList.add('is-snap');
            site.addEventListener('animationend', () => site.classList.remove('is-snap'), { once: true });
          }
        }
        if (visible) raf = requestAnimationFrame(frame);
      };

      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(frame);
      }).observe(assemble);

      assemble.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return; // a finger scrolling the page shouldn't tilt the site
        px = e.clientX / innerWidth - 0.5;
        py = e.clientY / innerHeight - 0.5;
      });
      frame(performance.now()); // place pieces before first paint of the section
    }

    // Niche picker re-skins the finished site
    const pickerButtons = assemble.querySelectorAll('.picker button');
    const pick = (key) => {
      applyNiche(site, key);
      pickerButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.niche === key)));
    };
    pickerButtons.forEach((b) => b.addEventListener('click', () => {
      if (site.dataset.niche === b.dataset.niche) return;
      site.classList.add('is-swapping');
      setTimeout(() => { pick(b.dataset.niche); site.classList.remove('is-swapping'); }, reducedMotion ? 0 : 220);
    }));
    pick('plumbing');
  }

  // ---------- Multi-step lead form (form.funnel) ----------
  // Each .funnel__panel is a step. Required fields carry data-msg (the error to show) and
  // aria-describedby (where to show it). No backend yet, so submitting opens the visitor's
  // email app with every answer filled in.
  const TO = 'hello@marveloweb.com';
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  document.querySelectorAll('form.funnel').forEach((form) => {
    const panels = [...form.querySelectorAll('.funnel__panel')];
    const stepLabel = form.querySelector('.funnel__step');
    const done = form.querySelector('.funnel__done');
    let at = 1;

    const setError = (input, msg) => {
      input.setAttribute('aria-invalid', String(Boolean(msg)));
      const out = document.getElementById(input.getAttribute('aria-describedby'));
      if (out) out.textContent = msg;
      return !msg;
    };
    const check = (input) => {
      const v = input.value.trim();
      if (input.required && !v) return setError(input, input.dataset.msg);
      if (input.type === 'email' && v && !isEmail(v)) return setError(input, 'Enter an email we can send your preview to.');
      return setError(input, '');
    };
    const validate = (panel) => {
      const bad = [...panel.querySelectorAll('input[required], input[type="email"]')].filter((i) => !check(i));
      if (bad.length) bad[0].focus();
      return !bad.length;
    };
    const goTo = (n) => {
      at = n;
      form.dataset.at = n;
      panels.forEach((p, i) => {
        const show = i === n - 1;
        p.hidden = !show;
        if (show && !reducedMotion) { p.classList.remove('is-entering'); void p.offsetWidth; p.classList.add('is-entering'); }
      });
      stepLabel.textContent = panels[n - 1].dataset.label;
      const first = [...panels[n - 1].querySelectorAll('input, select')].find((i) => !i.value) || panels[n - 1].querySelector('input, select');
      first.focus();
    };

    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]') && validate(panels[at - 1])) goTo(at + 1);
      if (e.target.closest('[data-back]')) goTo(at - 1);
    });
    form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') check(e.target); });
    form.addEventListener('focusout', (e) => { if (e.target.type === 'email' && e.target.value) check(e.target); });

    // "Label: answer" lines for the email body, in the order the fields appear
    const answers = () => {
      const lines = [];
      form.querySelectorAll('input, select, textarea').forEach((el) => {
        // hidden fields are included only when they carry a data-label (e.g. the redesign checklist answers)
        if (!el.name || (el.type === 'hidden' && !el.dataset.label) || ((el.type === 'checkbox' || el.type === 'radio') && !el.checked)) return;
        const v = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value.trim();
        if (!v) return;
        const label = el.dataset.label || (form.querySelector(`label[for="${el.id}"]`) || {}).firstChild?.textContent?.trim() || el.name;
        lines.push(`${label}: ${v}`);
      });
      return lines;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validate(panels[at - 1])) return;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn && submitBtn.disabled) return;
      const subjectFrom = form.elements[form.dataset.subjectField];
      const who = (subjectFrom && subjectFrom.value.trim()) || 'new enquiry';
      // Pages that define window.MW.sendLead (redesign) try the server first; anything else, or a failure, uses email
      let sent = false;
      if (window.MW && typeof window.MW.sendLead === 'function') {
        const label = submitBtn && submitBtn.firstChild;
        const was = label && label.nodeType === 3 ? label.nodeValue : null;
        if (submitBtn) submitBtn.disabled = true;
        if (was !== null) label.nodeValue = 'Sending… ';
        sent = await window.MW.sendLead(form).catch(() => false);
        if (submitBtn) submitBtn.disabled = false;
        if (was !== null) label.nodeValue = was;
      }
      const sentBox = done.querySelector('[data-done-sent]');
      const mailBox = done.querySelector('[data-done-mail]');
      if (!sent) {
        const body = [form.dataset.subject, '', ...answers()].join('\n');
        window.location.href = `mailto:${TO}?subject=${encodeURIComponent(`${form.dataset.subject}: ${who}`)}&body=${encodeURIComponent(body)}`;
      }
      if (sentBox) sentBox.hidden = !sent;
      if (mailBox) mailBox.hidden = Boolean(sent);

      panels.forEach((p) => (p.hidden = true));
      form.querySelector('.funnel__progress').hidden = true;
      done.hidden = false;
      const name = done.querySelector('[data-done-name]');
      if (name) name.textContent = who;
      done.focus();
    });
  });

  // ---------- Sticky main action on phones ----------
  // Shown once the hero is out of view, hidden again while the form is on screen.
  const sticky = document.querySelector('.sticky-cta');
  if (sticky) {
    const watched = [...document.querySelectorAll('[data-sticky-hide]')];
    const inView = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => inView.set(en.target, en.isIntersecting));
      const show = !watched.some((el) => inView.get(el));
      sticky.classList.toggle('is-shown', show);
      sticky.setAttribute('aria-hidden', String(!show));
      sticky.tabIndex = show ? 0 : -1;
    });
    watched.forEach((el) => io.observe(el));
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
