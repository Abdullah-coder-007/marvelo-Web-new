// Home page ("I need a website"): path chooser after the intro, rotating headline words,
// live builder with photo templates that hands off to the 2-step form, WhatsApp contact points,
// real-work strip, "can't find you" search mock, payback calculator and the standard/rush price switch.
// Relies on window.MW from main.js (trade skins + applyNiche); main.js also runs the form and sticky CTA.

// ---------- Fill these in: each part of the page stays hidden until its value is set ----------
// WhatsApp number in international format, digits only, e.g. '15125550100' or '919876543210'.
const WHATSAPP = '';
// Your launched sites: { name, trade, url, note } where note is one short line about what you did.
const LIVE_SITES = [
  // { name: 'Rivera Plumbing', trade: 'Plumbing', url: 'https://riveraplumbing.com', note: 'New site, live in 6 days' },
];
// Starter price used by the "pays for itself" calculator; keep in step with the pricing section.
const STARTER_PRICE = 999;

(() => {
  const { niches, applyNiche, reducedMotion } = window.MW;
  const $ = (id) => document.getElementById(id);

  // ---------- path chooser: a small box over the page, once per visit ----------
  const pick = $('pick');
  const seenPick = () => { try { return sessionStorage.getItem('mw-path'); } catch (e) { return null; } };
  const setPick = (v) => { try { sessionStorage.setItem('mw-path', v); } catch (e) {} };
  // ?path=new comes from the redesign page's "Need a new website?" link, so they have already chosen
  if (new URLSearchParams(location.search).has('path')) setPick('new');
  if (pick && typeof pick.showModal === 'function' && !seenPick()) {
    document.addEventListener('mw:arrived', () => setTimeout(() => {
      pick.showModal();
      pick.querySelector('[data-pick="new"]').focus();
    }, reducedMotion ? 0 : 650), { once: true });
    pick.addEventListener('click', (e) => {
      const choice = e.target.closest('[data-pick]');
      if (!choice) return;
      setPick(choice.dataset.pick);
      if (choice.dataset.pick === 'new') pick.close();
    });
    pick.addEventListener('cancel', () => setPick('new')); // Escape: stay on this page
  }

  // ---------- rotating words in headings ----------
  // The real word sits in a .sr span for screen readers; the visible one swaps every few seconds.
  document.querySelectorAll('.rotator').forEach((el, n) => {
    const words = el.dataset.words.split('|');
    const word = el.querySelector('[data-word]');
    if (reducedMotion || words.length < 2) return;
    let i = 0;
    const swap = () => {
      if (document.hidden) return;
      i = (i + 1) % words.length;
      el.style.width = `${word.offsetWidth}px`;
      el.classList.add('is-out');
      setTimeout(() => {
        word.textContent = words[i];
        el.classList.replace('is-out', 'is-in');
        el.style.width = `${word.offsetWidth}px`; // the box eases to the new word's width
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-in')));
      }, 320);
    };
    setTimeout(() => setInterval(swap, 2800), 1800 + n * 700);
  });

  // ---------- trade templates: copy, colors and a real photo for each trade ----------
  Object.assign(niches, {
    clinic: { url: 'harborfamilyclinic.com', brand: 'Harbor Family Clinic', h: 'See a doctor this week, not next month.', sub: 'Family medicine, check-ups and walk-in care, with online booking.',
      btn: 'Book a visit', chip: 'Same-week appointments', c: ['General check-ups', 'Walk-in care', 'Vaccinations'], cta: 'Book your visit online in two minutes',
      icon: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z' },
    law: { url: 'carterlanelaw.com', brand: 'Carter & Lane Law', h: 'Clear legal advice from day one.', sub: 'Family, property and business law, with a free first consultation.',
      btn: 'Free consultation', chip: 'Free first call', c: ['Family law', 'Property', 'Business law'], cta: 'Talk to a lawyer this week',
      icon: 'M12 3v18M6 21h12M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z' },
    realestate: { url: 'oaklinerealty.com', brand: 'Oakline Realty', h: 'Find the home that fits your life.', sub: 'Local agents who know every street. Buy, sell or rent with confidence.',
      btn: 'View listings', chip: 'Free home valuation', c: ['Homes for sale', 'Sell your home', 'Rentals'], cta: 'Find out what your home is worth',
      icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
    salon: { url: 'luxestudiosalon.com', brand: 'Luxe Studio', h: "Hair you'll want to show off.", sub: 'Cuts, color and styling by senior stylists. Book online any time.',
      btn: 'Book now', chip: 'Online booking', c: ['Cut & style', 'Color', 'Bridal'], cta: 'Your next appointment is one tap away',
      icon: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12' },
    other: { url: 'yourbusiness.com', brand: 'Your Business', h: 'Local service you can count on.', sub: 'Friendly, reliable and right around the corner. Get in touch today.',
      btn: 'Get in touch', chip: 'Locally owned', c: ['What we do', 'Our prices', 'Areas we cover'], cta: "Tell us what you need, we'll reply today",
      icon: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z' },
  });
  // Photos from Unsplash (free to use); in a real build we swap in the client's own
  const photo = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;
  const photos = {
    clinic: photo('1519494026892-80bbd2d6fd0d'), dental: photo('1629909613654-28e377c37b09'), medspa: photo('1570172619644-dfd03ed5d881'),
    law: photo('1589829545856-d10d557cf95f'), realestate: photo('1600596542815-ffad4c1539a9'), salon: photo('1560066984-138dadb4c035'),
    hvac: photo('1621905251189-08b45d6a269e'), plumbing: photo('1585704032915-c3400ca199e7'), roofing: photo('1632759145351-1d592919f522'),
    other: photo('1600880292203-757bb62b4baf'),
  };
  // warm the cache once the page is idle so switching trades never shows an empty frame
  addEventListener('load', () => setTimeout(() => Object.values(photos).forEach((src) => { new Image().src = src; }), 1200), { once: true });

  const site = $('demo-site');
  const builder = $('builder');
  const nameInput = $('b-name');
  const echo = $('echo-name');

  // What a customer would type into a search box for each trade, and how the copy refers to it
  const searches = {
    clinic: ['clinic near me', 'a clinic'],
    dental: ['dentist near me', 'a dentist'],
    medspa: ['med spa near me', 'a med spa'],
    law: ['lawyer near me', 'a lawyer'],
    realestate: ['real estate agent near me', 'a real estate agent'],
    salon: ['hair salon near me', 'a salon'],
    hvac: ['ac repair near me', 'AC repair'],
    plumbing: ['plumber near me', 'a plumber'],
    roofing: ['roofer near me', 'a roofer'],
    other: ['services near me', 'a business like yours'],
  };
  const unseenBox = document.querySelector('.serp__you');

  // ---------- WhatsApp: prefilled with the business name once the visitor has typed it ----------
  const waLinks = document.querySelectorAll('[data-wa]');
  const updateWhatsApp = (name) => {
    if (!WHATSAPP) return;
    const text = name ? `Hi, I run ${name} and I'd like a free website preview.` : "Hi, I'd like a free website preview for my business.";
    const href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
    waLinks.forEach((a) => (a.href = href));
  };
  if (WHATSAPP) {
    document.querySelectorAll('[data-wa], [data-wa-block]').forEach((el) => (el.hidden = false));
    document.documentElement.classList.add('has-wa');
  }

  // ---------- live builder ----------
  const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 28);
  const currentTrade = () => builder.querySelector('input[name="trade"]:checked').value;
  const render = () => {
    const name = nameInput.value.trim();
    const key = currentTrade();
    const url = `${slug(name) || niches[key].url.replace('.com', '')}.com`;
    applyNiche(site, key, name ? { brand: name, url } : {});
    site.style.setProperty('--s-photo', `url("${photos[key]}")`);
    echo.textContent = name ? `${name}'s` : 'your';

    // The search mock: their business fills the empty slot
    const [query, who] = searches[key];
    document.querySelector('[data-search-query]').textContent = query;
    document.querySelector('[data-search-who]').textContent = who;
    document.querySelector('[data-unseen-name]').textContent = name || 'your business';
    document.querySelector('[data-unseen-title]').textContent = name || 'Your Business';
    document.querySelector('[data-unseen-url]').textContent = name ? url : 'yourbusiness.com';
    unseenBox.classList.toggle('is-named', Boolean(name));

    updateWhatsApp(name);
    updateMini(name || niches[key].brand, url, niches[key].icon);
  };

  // ---------- phones: a live strip at the bottom mirrors the demo while it's out of sight ----------
  const mini = document.querySelector('.mini-live');
  const miniName = mini.querySelector('[data-mini-name]'), miniUrl = mini.querySelector('[data-mini-url]');
  const phone = matchMedia('(max-width: 760px)');
  let touched = false, builderSeen = false, demoSeen = false;
  const updateMini = (name, url, icon) => {
    miniName.textContent = name;
    miniUrl.textContent = url;
    mini.querySelector('[data-mini-icon]').setAttribute('d', icon);
    mini.style.setProperty('--mini-accent', getComputedStyle(site).getPropertyValue('--s-accent'));
    // a little bounce on each change, only while the strip is on screen (the animation would pull it into view)
    if (mini.classList.contains('is-shown') && !reducedMotion) { mini.classList.remove('is-pinged'); void mini.offsetWidth; mini.classList.add('is-pinged'); }
  };
  const toggleMini = () => {
    const show = phone.matches && touched && builderSeen && !demoSeen;
    mini.classList.toggle('is-shown', show);
    mini.tabIndex = show ? 0 : -1;
  };
  new IntersectionObserver(([en]) => { builderSeen = en.isIntersecting; toggleMini(); }).observe(builder);
  // the demo counts as seen once a quarter of it is on screen
  new IntersectionObserver(([en]) => { demoSeen = en.intersectionRatio > 0.25; toggleMini(); }, { threshold: [0, 0.25, 0.5] }).observe(site);
  const touch = () => { if (!touched) { touched = true; toggleMini(); } };
  mini.addEventListener('click', (e) => {
    e.preventDefault();
    site.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  });

  let typingTimer;
  nameInput.addEventListener('input', () => {
    touch();
    render();
    site.classList.add('is-typing');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => site.classList.remove('is-typing'), 700);
  });
  builder.addEventListener('change', (e) => {
    if (e.target.name !== 'trade') return;
    touch();
    site.classList.add('is-swapping');
    setTimeout(() => { render(); site.classList.remove('is-swapping'); }, reducedMotion ? 0 : 220);
  });
  render();

  // ---------- hand-off to the 2-step form (the form itself lives in main.js) ----------
  const biz = $('s-biz'), trade = $('s-trade'), city = $('s-city');

  // The hero builder hands its answers to the form, so the visitor never types them twice
  builder.addEventListener('submit', (e) => {
    e.preventDefault();
    biz.value = nameInput.value.trim();
    trade.value = currentTrade();
    $('s-email').value = $('b-email').value.trim();
    $('s-phone').value = $('b-phone').value.trim();
    $('start').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => (biz.value ? city : biz).focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  });
  biz.addEventListener('input', () => { nameInput.value = biz.value; render(); });

  // ---------- where customers search: Google, Google Maps, Apple Maps, Bing in turn ----------
  const engines = document.querySelector('.engines');
  if (engines) {
    const serp = engines.querySelector('.serp');
    const buttons = [...engines.querySelectorAll('[data-engine]')].filter((b) => b.tagName === 'BUTTON');
    const desc = document.querySelector('[data-unseen-desc]');
    let at = 0, auto = !reducedMotion, paused = false, visible = false;
    const show = (i) => {
      at = i;
      const key = buttons[i].dataset.engine;
      serp.dataset.engine = key;
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      desc.textContent = key === 'gmaps' || key === 'apple' ? 'Not on the map yet' : 'Not listed yet';
      if (!reducedMotion) { serp.classList.remove('is-switching'); void serp.offsetWidth; serp.classList.add('is-switching'); }
    };
    buttons.forEach((b, i) => b.addEventListener('click', () => { auto = false; show(i); })); // a click means they're choosing, so stop rotating
    engines.addEventListener('pointerenter', () => (paused = true));
    engines.addEventListener('pointerleave', () => (paused = false));
    engines.addEventListener('focusin', () => (paused = true));
    engines.addEventListener('focusout', () => (paused = false));
    new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(engines);
    setInterval(() => { if (auto && !paused && visible && !document.hidden) show((at + 1) % buttons.length); }, 3200);
  }

  // ---------- real work: one card per launched site ----------
  if (LIVE_SITES.length) {
    const grid = $('real-grid');
    LIVE_SITES.forEach((s) => {
      const domain = s.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const li = document.createElement('li');
      li.innerHTML = `
        <a class="real-card" target="_blank" rel="noopener">
          <span class="real-card__bar" aria-hidden="true"><i></i><i></i><i></i><span></span></span>
          <span class="real-card__shot"><span class="real-card__fallback"></span><img alt="" loading="lazy" width="800" height="500"></span>
          <span class="real-card__meta">
            <span class="real-card__top"><b></b><span class="real-card__live">Live</span></span>
            <span data-trade></span>
            <p></p>
          </span>
        </a>`;
      const a = li.querySelector('a');
      a.href = s.url;
      a.setAttribute('aria-label', `${s.name}, ${s.trade} website, opens in a new tab`);
      li.querySelector('.real-card__bar span').textContent = domain;
      li.querySelector('.real-card__fallback').textContent = domain;
      li.querySelector('b').textContent = s.name;
      li.querySelector('[data-trade]').textContent = s.trade;
      li.querySelector('p').textContent = s.note || '';
      // A screenshot of the live site; if it fails, the domain panel underneath stays visible
      const img = li.querySelector('img');
      img.src = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(s.url)}?w=800&h=500`;
      img.addEventListener('error', () => img.remove());
      grid.append(li);
    });
    $('work').hidden = false;
  }

  // ---------- payback calculator ----------
  const range = $('job-value'), out = $('job-out'), jobsN = $('jobs-n'), dots = $('jobs-dots');
  const money = (n) => `$${n.toLocaleString('en-US')}`;
  const updatePayback = () => {
    const value = Number(range.value);
    const jobs = Math.max(1, Math.ceil(STARTER_PRICE / value));
    out.textContent = money(value);
    jobsN.textContent = jobs === 1 ? 'your first job' : `${jobs} jobs`;
    // one filled square per job it takes, then a few dashed ones for the jobs that are pure profit
    const shown = Math.min(jobs, 20);
    dots.innerHTML = '<i></i>'.repeat(shown) + '<i class="is-extra"></i>'.repeat(Math.max(0, Math.min(4, 24 - shown)));
  };
  range.addEventListener('input', updatePayback);
  updatePayback();

  // ---------- standard / rush pricing ----------
  const pricing = $('pricing');
  const speedSelect = $('s-speed');
  const setSpeed = (speed) => {
    const rush = speed === 'rush';
    pricing.dataset.speed = speed;
    pricing.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.speed === speed)));
    pricing.querySelectorAll('[data-price]').forEach((el) => (el.textContent = money(Number(rush ? el.dataset.rush : el.dataset.price))));
    pricing.querySelectorAll('[data-time]').forEach((el) => (el.textContent = rush ? 'Live in 3 days' : 'Live in 7 days'));
    speedSelect.value = speed;
  };
  pricing.querySelectorAll('button[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(b.dataset.speed)));
  pricing.querySelector('[data-rush-cta]').addEventListener('click', () => setSpeed('rush'));
  speedSelect.addEventListener('change', () => setSpeed(speedSelect.value));
})();
