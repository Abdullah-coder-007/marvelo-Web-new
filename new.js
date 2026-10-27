// "I need a website" page: live builder in the hero, 2-step lead form, sticky phone CTA.
// Relies on window.MW from main.js (trade skins + applyNiche).
(() => {
  const { niches, applyNiche, reducedMotion } = window.MW;
  const TO = 'hello@marveloweb.com';

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

  // ---------- live builder ----------
  const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 28);
  const currentTrade = () => builder.querySelector('input[name="trade"]:checked').value;
  const render = () => {
    const name = nameInput.value.trim();
    const key = currentTrade();
    applyNiche(site, key, name ? { brand: name, url: `${slug(name) || 'yourbusiness'}.com` } : { brand: 'Your Business', url: 'yourbusiness.com' });
    echo.textContent = name ? `${name}'s website` : 'your website';
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

  // ---------- 2-step form ----------
  const funnel = $('funnel');
  const panels = funnel.querySelectorAll('.funnel__panel');
  const stepLabel = $('funnel-step');
  const done = funnel.querySelector('.funnel__done');
  const biz = $('s-biz'), trade = $('s-trade'), city = $('s-city'), email = $('s-email');

  const setError = (input, msg) => {
    input.setAttribute('aria-invalid', String(Boolean(msg)));
    $(input.getAttribute('aria-describedby')).textContent = msg;
    return !msg;
  };
  const goTo = (n) => {
    funnel.dataset.at = n;
    panels.forEach((p) => {
      const show = p.dataset.step === String(n);
      p.hidden = !show;
      if (show && !reducedMotion) { p.classList.remove('is-entering'); void p.offsetWidth; p.classList.add('is-entering'); }
    });
    stepLabel.textContent = n === 1 ? 'Step 1 of 2: your business' : 'Step 2 of 2: where to send your preview';
    panels[n - 1].querySelector('input:not([value]), input').focus();
  };

  // The hero builder hands its answers to the form, so the visitor never types them twice
  builder.addEventListener('submit', (e) => {
    e.preventDefault();
    biz.value = nameInput.value.trim();
    trade.value = currentTrade();
    $('start').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => (biz.value ? city : biz).focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  });
  biz.addEventListener('input', () => { nameInput.value = biz.value; render(); });

  funnel.querySelector('[data-next]').addEventListener('click', () => {
    const okBiz = setError(biz, biz.value.trim() ? '' : 'Add your business name so we know what to build.');
    const okCity = setError(city, city.value.trim() ? '' : 'Add your city or town so we can write for your area.');
    if (!okBiz) return biz.focus();
    if (!okCity) return city.focus();
    goTo(2);
  });
  funnel.querySelector('[data-back]').addEventListener('click', () => goTo(1));
  [biz, city].forEach((el) => el.addEventListener('input', () => { if (el.value.trim()) setError(el, ''); }));
  email.addEventListener('blur', () => { if (email.value) validEmail(); });

  const validEmail = () => setError(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Enter an email we can send your preview to.');

  funnel.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validEmail()) return email.focus();
    const d = new FormData(funnel);
    const tradeName = trade.options[trade.selectedIndex].text;
    const body = [
      'New website: free preview request',
      '',
      `Business: ${d.get('business')}`,
      `Trade: ${tradeName}`,
      `City: ${d.get('city')}`,
      `Name: ${d.get('name') || ''}`,
      `Email: ${d.get('email')}`,
      `Phone: ${d.get('phone') || ''}`,
    ].join('\n');
    window.location.href = `mailto:${TO}?subject=${encodeURIComponent(`Free website preview: ${d.get('business')}`)}&body=${encodeURIComponent(body)}`;

    panels.forEach((p) => (p.hidden = true));
    funnel.querySelector('.funnel__progress').hidden = true;
    done.hidden = false;
    $('done-copy').textContent = `Your email app should open with ${d.get('business')}'s details filled in. Press send and we'll start building.`;
    done.focus();
  });

  // ---------- sticky "Get my free website" on phones ----------
  // Shown once the hero is out of view, hidden again while the form is on screen.
  const sticky = document.querySelector('.sticky-cta');
  const seen = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => seen.set(en.target, en.isIntersecting));
    const show = !seen.get(document.querySelector('.nb-hero')) && !seen.get($('start'));
    sticky.classList.toggle('is-shown', show);
    sticky.setAttribute('aria-hidden', String(!show));
    sticky.tabIndex = show ? 0 : -1;
  });
  io.observe(document.querySelector('.nb-hero'));
  io.observe($('start'));
})();
