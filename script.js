(async function(){
  let reportData;
  const svgNamespace = 'http://www.w3.org/2000/svg';

  function createDataNode(node, parentNamespace = null){
    if (typeof node === 'string') return document.createTextNode(node);

    const namespace = parentNamespace || (node.tag === 'svg' ? svgNamespace : null);
    const element = namespace
      ? document.createElementNS(namespace, node.tag)
      : document.createElement(node.tag);

    Object.entries(node.attributes || {}).forEach(([name, value]) => {
      element.setAttribute(name, value === null ? '' : value);
    });
    (node.children || []).forEach(child => element.append(createDataNode(child, namespace)));
    return element;
  }

  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error('Could not load data.json');
    reportData = await response.json();
    const reportContent = document.getElementById('report-content');
    if (!reportContent) throw new Error('Report content mount is missing.');
    reportData.sections.forEach(section => {
      section.content.forEach(node => reportContent.append(createDataNode(node)));
    });
  } catch (error) {
    console.error(error);
    const reportContent = document.getElementById('report-content');
    if (reportContent) reportContent.textContent = 'Report content could not be loaded.';
    return;
  }

  (function(){
  /* ---------- Font zoom ---------- */
  let scale = 1;
  const root = document.documentElement;
  document.getElementById('zoomIn').onclick = () => { scale = Math.min(1.35, scale + 0.08); root.style.setProperty('--font-scale', scale); };
  document.getElementById('zoomOut').onclick = () => { scale = Math.max(0.85, scale - 0.08); root.style.setProperty('--font-scale', scale); };

  /* ---------- Reading progress ---------- */
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    const pct = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
    document.getElementById('progressFill').style.width = pct + '%';
  });

  /* ---------- English-only report ---------- */
  document.body.classList.remove('lang-ne');

  /* ---------- Popover (dictionary + footnotes) ---------- */
  let activePop = null;
  function closePop(){ if(activePop){ activePop.remove(); activePop = null; } }
  function showPop(target, text, title = ''){
    closePop();
    const pop = document.createElement('div');
    pop.className = 'pop';
    const close = document.createElement('span');
    close.className = 'pop-close';
    close.textContent = '\u00d7';
    pop.append(close);
    if (title) {
      const heading = document.createElement('strong');
      heading.textContent = title;
      pop.append(heading);
    }
    pop.append(document.createTextNode(text));
    document.body.appendChild(pop);
    const r = target.getBoundingClientRect();
    const top = window.scrollY + r.bottom + 8;
    let left = window.scrollX + r.left;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 296;
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8,left) + 'px';
    pop.querySelector('.pop-close').onclick = closePop;
    activePop = pop;
  }
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('term-link')) {
      e.stopPropagation();
      const key = e.target.dataset.key.toLowerCase();
      const card = [...document.querySelectorAll('#terms-list .term-card')].find(c => c.dataset.term.toLowerCase().includes(key) || key.includes(c.dataset.term.toLowerCase().split(' (')[0].toLowerCase()));
      const def = card ? card.dataset.def : 'Definition not found.';
      showPop(e.target, def, (card ? card.dataset.term : key) + ':');
    } else if (e.target.classList.contains('fn')) {
      e.stopPropagation();
      showPop(e.target, e.target.dataset.fn);
    } else if (activePop && !activePop.contains(e.target)) {
      closePop();
    }
  });

  /* ---------- Terminology filter chips ---------- */
  const termList = document.getElementById('terms-list');
  const chips = document.querySelectorAll('#termFilters .filter-chip');
  let activeCategory = 'all';

  function applyTermFilter(){
    termList.querySelectorAll('.term-card').forEach(card => {
      card.classList.toggle('hidden', activeCategory !== 'all' && card.dataset.cat !== activeCategory);
    });
  }

  chips.forEach(chip => {
    chip.onclick = () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategory = chip.dataset.cat;
      applyTermFilter();
    };
  });

  function loadTerms(){
      reportData.terms.forEach(term => {
        const card = document.createElement('div');
        card.className = 'term-card';
        card.dataset.cat = term.category;
        card.dataset.term = term.term;
        card.dataset.def = term.definition;

        const title = document.createElement('div');
        title.className = 't';
        title.textContent = term.term;
        const definition = document.createElement('div');
        definition.className = 'd';
        definition.textContent = term.definition;
        card.append(title, definition);
        termList.append(card);
      });
      applyTermFilter();
  }
  loadTerms();

  })();

/* ============ Contents card: full list once you reach the overview; only the header click closes or reopens it ============ */
(function(){
  const toc = document.getElementById('toc');
  const glance = document.getElementById('glance');
  const head = document.getElementById('tocHead');
  if (!toc || !glance || !head) return;

  const links = [...toc.querySelectorAll('a')];
  const targets = links.map(a => document.querySelector(a.getAttribute('href')));
  let ticking = false;

  const nav = document.querySelector('.topnav');
  function setNavH(){ if (nav) document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px'); }
  setNavH();
  window.addEventListener('resize', setNavH);
  window.addEventListener('load', setNavH);

  toc.dataset.mode = 'open';
  head.setAttribute('aria-expanded', 'true');

  function updateVisibility(){
    ticking = false;
    const y = window.scrollY, vh = window.innerHeight;
    const top = glance.getBoundingClientRect().top + y;
    toc.classList.toggle('visible', y >= top - vh * 0.55);

    let idx = 0;
    targets.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= vh * 0.4) idx = i; });
    links.forEach((a, i) => {
      a.classList.toggle('active', i === idx);
      if (i === idx) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateVisibility); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  head.addEventListener('click', () => {
    const wasOpen = toc.dataset.mode === 'open';
    toc.dataset.mode = wasOpen ? 'closed' : 'open';
    head.setAttribute('aria-expanded', String(!wasOpen));
  });

  updateVisibility();
  window.addEventListener('load', updateVisibility);
})();

/* ============ Research map ============ */
(function(){
  const shell = document.getElementById('nepalMapShell');
  if (!shell) return;
  const svg = shell.querySelector('svg');
  const tip = document.getElementById('mapTip');
  const sites = [...shell.querySelectorAll('.site')];
  let pinned = null;

  function scaleLabels(){
    const w = svg.getBoundingClientRect().width || 1000;
    const units = 1000 / w;
    svg.style.setProperty('--nm-fs', Math.max(19, 12.5 * units).toFixed(1) + 'px');
  }
  scaleLabels();
  window.addEventListener('resize', scaleLabels);

  function esc(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function show(site){
    sites.forEach(s => s.classList.toggle('on', s === site));
    tip.innerHTML = '<strong>' + esc(site.dataset.name) + '</strong><span class="kind">' + esc(site.dataset.kind) + '</span><p>' + esc(site.dataset.note) + '</p>';
    tip.classList.add('show');
    const sr = shell.getBoundingClientRect();
    const r = site.querySelector('.hit').getBoundingClientRect();
    const cx = r.left + r.width / 2 - sr.left;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = Math.min(Math.max(cx - tw / 2, 8), sr.width - tw - 8);
    let topPos = r.top - sr.top - th - 4;
    if (topPos < 8) topPos = r.bottom - sr.top + 4;
    tip.style.left = left + 'px';
    tip.style.top = topPos + 'px';
  }
  function hide(){
    pinned = null;
    tip.classList.remove('show');
    sites.forEach(s => s.classList.remove('on'));
  }

  sites.forEach(site => {
    site.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !pinned) show(site); });
    site.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pinned) hide(); });
    site.addEventListener('click', e => {
      e.stopPropagation();
      if (pinned === site) hide(); else { pinned = site; show(site); }
    });
    site.addEventListener('focus', () => { if (!pinned) show(site); });
    site.addEventListener('blur', () => { if (!pinned) hide(); });
    site.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (pinned === site) hide(); else { pinned = site; show(site); } }
      if (e.key === 'Escape') hide();
    });
  });
  document.addEventListener('click', e => { if (!shell.contains(e.target)) hide(); else if (!e.target.closest('.site')) hide(); });
})();

/* ============ Index table: hovering a row lights up that district on the map ============ */
(function(){
  document.querySelectorAll('#siteIndex tbody tr').forEach(row => {
    const site = document.querySelector('.site[data-name="' + row.dataset.site + '"]');
    if (!site) return;
    row.addEventListener('pointerenter', () => site.classList.add('hl'));
    row.addEventListener('pointerleave', () => site.classList.remove('hl'));
  });
})();
})();
