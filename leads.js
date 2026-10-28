// Private leads page. While API_BASE is empty nothing below talks to the network.
const API_BASE = '';

(function () {
  const STORE_KEY = 'mw-admin-key';
  const $ = (id) => document.getElementById(id);
  const text = (tag, cls, str) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = str;
    return el;
  };

  let adminKey = '';
  let leads = [];

  // ---------- storage (may be blocked) ----------
  const loadKey = () => { try { return localStorage.getItem(STORE_KEY) || ''; } catch (e) { return ''; } };
  const saveKey = (k) => { try { localStorage.setItem(STORE_KEY, k); } catch (e) { /* storage blocked: key lives in memory only */ } };
  const clearKey = () => { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } };

  // ---------- views ----------
  const show = (view) => {
    $('off').hidden = view !== 'off';
    $('login').hidden = view !== 'login';
    $('app').hidden = view !== 'app';
  };
  const askKey = (msg) => {
    adminKey = '';
    leads = [];
    $('rows').replaceChildren();
    $('key').value = '';
    $('login-error').textContent = msg || '';
    show('login');
    $('key').focus();
  };

  // ---------- helpers ----------
  const score = (l) => (l.report && typeof l.report.score === 'number' ? l.report.score : null);
  const fmtDate = (ms) => {
    const d = new Date(ms);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  const haystack = (l) => [l.name, l.email, l.phone, l.website, l.city, l.business, l.trade, l.issues].join(' ').toLowerCase();

  // ---------- table ----------
  function cellLink(href, label) {
    const td = document.createElement('td');
    if (label) {
      const a = text('a', '', label);
      a.href = href;
      td.appendChild(a);
    }
    return td;
  }

  function reportDetail(l) {
    const box = document.createElement('div');
    box.className = 'leads__detail';
    const r = l.report;
    if (!r) {
      box.appendChild(text('p', 'leads__muted', 'No website check was run for this lead.'));
      if (l.issues) box.appendChild(text('p', '', 'Warning signs: ' + l.issues));
      return box;
    }
    box.appendChild(text('p', 'leads__verdict', (r.verdict || '') + (typeof r.score === 'number' ? ' (score ' + r.score + ')' : '')));
    if (r.url) box.appendChild(text('p', 'leads__muted', 'Checked: ' + r.url + (r.city ? ' in ' + r.city : '')));
    const grid = text('div', 'leads__cats', '');
    (Array.isArray(r.categories) ? r.categories : []).forEach((c) => {
      const card = text('div', 'leads__cat', '');
      card.appendChild(text('h3', '', (c.title || c.key || '') + ': ' + (typeof c.score === 'number' ? c.score : 'n/a')));
      const issues = Array.isArray(c.issues) ? c.issues : [];
      if (issues.length) {
        const ul = document.createElement('ul');
        issues.forEach((i) => ul.appendChild(text('li', '', i.problem || '')));
        card.appendChild(ul);
      } else {
        card.appendChild(text('p', 'leads__muted', 'No issues found.'));
      }
      if (Array.isArray(c.results) && c.results.length) {
        const t = document.createElement('table');
        t.className = 'leads__rank';
        const head = document.createElement('tr');
        ['Search', 'Position', 'Maps'].forEach((h) => head.appendChild(text('th', '', h)));
        t.appendChild(head);
        c.results.forEach((x) => {
          const tr = document.createElement('tr');
          tr.appendChild(text('td', '', x.keyword || ''));
          tr.appendChild(text('td', '', x.position ? '#' + x.position : 'Not found'));
          tr.appendChild(text('td', '', x.inMaps ? 'Yes' : 'No'));
          t.appendChild(tr);
        });
        card.appendChild(t);
      }
      grid.appendChild(card);
    });
    box.appendChild(grid);
    if (r.pitch && Array.isArray(r.pitch.points) && r.pitch.points.length) {
      box.appendChild(text('h3', 'leads__pitch', r.pitch.headline || ''));
      const ul = document.createElement('ul');
      r.pitch.points.forEach((p) => ul.appendChild(text('li', '', (p.problem || '') + ' ' + (p.fix || ''))));
      box.appendChild(ul);
    }
    return box;
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const shown = q ? leads.filter((l) => haystack(l).includes(q)) : leads;
    const rows = $('rows');
    rows.replaceChildren();
    shown.forEach((l, n) => {
      const tr = document.createElement('tr');
      tr.className = 'leads__lead';
      const toggle = document.createElement('td');
      const btn = text('button', 'leads__toggle', '+');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Show report for ' + (l.name || 'this lead'));
      const detailId = 'detail-' + n;
      btn.setAttribute('aria-controls', detailId);
      toggle.appendChild(btn);
      tr.appendChild(toggle);
      tr.appendChild(text('td', 'nowrap', fmtDate(l.createdAt)));
      tr.appendChild(text('td', '', l.name));
      tr.appendChild(cellLink('mailto:' + l.email, l.email));
      tr.appendChild(cellLink('tel:' + l.phone.replace(/[^\d+]/g, ''), l.phone));
      tr.appendChild(text('td', '', l.website));
      tr.appendChild(text('td', '', l.city));
      tr.appendChild(text('td', '', l.trade || l.business));
      tr.appendChild(text('td', 'leads__wide', l.issues));
      const s = score(l);
      tr.appendChild(text('td', 'nowrap', s === null ? '' : String(s)));
      rows.appendChild(tr);

      const dr = document.createElement('tr');
      dr.className = 'leads__expand';
      dr.id = detailId;
      dr.hidden = true;
      const dtd = document.createElement('td');
      dtd.colSpan = 10;
      dr.appendChild(dtd);
      rows.appendChild(dr);

      btn.addEventListener('click', () => {
        const open = dr.hidden;
        if (open && !dtd.firstChild) dtd.appendChild(reportDetail(l));
        dr.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? '−' : '+';
      });
    });
    $('count').textContent = q ? shown.length + ' of ' + leads.length : String(leads.length);
    $('status').textContent = leads.length === 0 ? 'No leads yet.' : shown.length === 0 ? 'No leads match your search.' : '';
  }

  // ---------- CSV ----------
  function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t]/.test(s)) s = "'" + s; // stop spreadsheets running it as a formula
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCsv(list) {
    const head = ['Date', 'ID', 'Name', 'Email', 'Phone', 'Website', 'City', 'Business', 'Trade', 'Warning signs', 'Score', 'Verdict'];
    const lines = [head.map(csvCell).join(',')];
    list.forEach((l) => {
      const s = score(l);
      lines.push([
        new Date(l.createdAt).toISOString(), l.id, l.name, l.email, l.phone, l.website, l.city, l.business, l.trade, l.issues,
        s === null ? '' : s, l.report && l.report.verdict ? l.report.verdict : '',
      ].map(csvCell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }
  function downloadCsv() {
    const blob = new Blob(['﻿' + buildCsv(leads)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marveloweb-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- loading ----------
  async function load() {
    show('app');
    $('status').textContent = 'Loading leads…';
    $('rows').replaceChildren();
    let res;
    try {
      res = await fetch(API_BASE + '/leads', { headers: { authorization: 'Bearer ' + adminKey } });
    } catch (e) {
      $('status').textContent = "Couldn't reach the server. Check your connection and reload.";
      return;
    }
    if (res.status === 401) { clearKey(); askKey("That key didn't work. Try again."); return; }
    if (res.status === 429) { askKey('Too many wrong keys. Try again in an hour.'); return; }
    if (!res.ok) { $('status').textContent = "Couldn't load the leads. Try again in a minute."; return; }
    let data;
    try { data = await res.json(); } catch (e) { data = null; }
    leads = data && Array.isArray(data.leads) ? data.leads : [];
    leads.forEach((l) => { ['name', 'email', 'phone', 'website', 'city', 'business', 'trade', 'issues', 'id'].forEach((f) => { if (typeof l[f] !== 'string') l[f] = ''; }); });
    render();
  }

  // ---------- start ----------
  if (!API_BASE) {
    $('off').textContent = "The website check isn't switched on yet.";
    show('off');
    return;
  }
  $('login').addEventListener('submit', (e) => {
    e.preventDefault();
    const k = $('key').value.trim();
    if (!k) return;
    adminKey = k;
    saveKey(k);
    load();
  });
  $('search').addEventListener('input', render);
  $('csv').addEventListener('click', downloadCsv);
  $('forget').addEventListener('click', () => { clearKey(); askKey('This device has forgotten the key.'); });

  adminKey = loadKey();
  if (adminKey) load(); else askKey('');
})();
