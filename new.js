// "I need a website" page: live builder in the hero that hands off to the 2-step form,
// plus the WhatsApp contact points, real-work strip, "can't find you" search mock and payback calculator.
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

  niches.other = {
    url: 'yourbusiness.com', brand: 'Your Business', h: 'Local service you can count on.', sub: 'Friendly, reliable and right around the corner. Get in touch today.',
    btn: 'Get in touch', chip: 'Locally owned', c: ['What we do', 'Our prices', 'Areas we cover'], cta: "Tell us what you need, we'll reply today",
    icon: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z',
  };

  const $ = (id) => document.getElementById(id);
  const site = $('demo-site');
  const builder = $('builder');
  const nameInput = $('b-name');
  const echo = $('echo-name');

  // What a customer would type into Google for each trade, and how the copy refers to it
  const searches = {
    plumbing: ['plumber near me', 'a plumber'],
    hvac: ['ac repair near me', 'AC repair'],
    roofing: ['roofer near me', 'a roofer'],
    dental: ['dentist near me', 'a dentist'],
    medspa: ['med spa near me', 'a med spa'],
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
    const url = `${slug(name) || 'yourbusiness'}.com`;
    applyNiche(site, key, name ? { brand: name, url } : { brand: 'Your Business', url: 'yourbusiness.com' });
    echo.textContent = name ? `${name}'s website` : 'your website';

    // The search mock: their business fills the empty slot
    const [query, who] = searches[key];
    document.querySelector('[data-search-query]').textContent = query;
    document.querySelector('[data-search-who]').textContent = who;
    document.querySelector('[data-unseen-name]').textContent = name || 'your business';
    document.querySelector('[data-unseen-title]').textContent = name || 'Your Business';
    document.querySelector('[data-unseen-url]').textContent = name ? url : 'yourbusiness.com';
    unseenBox.classList.toggle('is-named', Boolean(name));

    updateWhatsApp(name);
  };

  let typingTimer;
  nameInput.addEventListener('input', () => {
    render();
    site.classList.add('is-typing');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => site.classList.remove('is-typing'), 700);
  });
  builder.addEventListener('change', (e) => {
    if (e.target.name !== 'trade') return;
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
    $('start').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => (biz.value ? city : biz).focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  });
  biz.addEventListener('input', () => { nameInput.value = biz.value; render(); });

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
})();
