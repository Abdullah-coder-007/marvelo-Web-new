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
  const urlForm = $('url-form');
  const urlInput = $('u-site');
  const urlErr = $('u-site-err');
  const echo = $('echo-site');
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

  urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = domainOf(urlInput.value);
    if (!d || !d.includes('.')) {
      urlInput.setAttribute('aria-invalid', 'true');
      urlErr.textContent = d ? 'That doesn\'t look like a website address. Try something like yourbusiness.com.' : 'Add your website address, like yourbusiness.com.';
      urlInput.focus();
      return;
    }
    $('s-site').value = d;
    $('start').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => $('s-biz').focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  });
  $('s-site').addEventListener('input', (e) => { urlInput.value = e.target.value; showDomain(); });

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
