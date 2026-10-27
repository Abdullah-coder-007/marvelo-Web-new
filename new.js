// "I need a website" page: live builder in the hero that hands off to the 2-step form.
// Relies on window.MW from main.js (trade skins + applyNiche); main.js also runs the form and sticky CTA.
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
})();
