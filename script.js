(async function () {
  const svgNamespace = 'http://www.w3.org/2000/svg';

  function createDataNode(node, parentNamespace = null) {
    if (typeof node === 'string') return document.createTextNode(node);
    const namespace = parentNamespace || (node.tag === 'svg' ? svgNamespace : null);
    const element = namespace ? document.createElementNS(namespace, node.tag) : document.createElement(node.tag);
    Object.entries(node.attributes || {}).forEach(([name, value]) => element.setAttribute(name, value === null ? '' : value));
    (node.children || []).forEach(child => element.append(createDataNode(child, namespace)));
    return element;
  }

  const reportDataEl = document.getElementById('report-data');
  const reportData = reportDataEl ? JSON.parse(reportDataEl.textContent) : { sections: [] };
  const mount = document.getElementById('report-content');
  if (mount && Array.isArray(reportData.sections)) {
    reportData.sections.forEach(section => section.content.forEach(item => mount.append(createDataNode(item))));
  } else if (mount) {
    mount.textContent = 'Report content could not be loaded.';
  }

  (function () {
    let scale = 1;
    const root = document.documentElement;
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    const progressFill = document.getElementById('progressFill');

    if (zoomIn) {
      zoomIn.onclick = () => {
        scale = Math.min(1.35, scale + 0.08);
        root.style.setProperty('--font-scale', scale);
      };
    }

    if (zoomOut) {
      zoomOut.onclick = () => {
        scale = Math.max(0.85, scale - 0.08);
        root.style.setProperty('--font-scale', scale);
      };
    }

    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
      if (progressFill) progressFill.style.width = pct + '%';
    });

    const toc = document.getElementById('toc');
    const glance = document.getElementById('glance');
    const head = document.getElementById('tocHead');
    if (toc && glance && head) {
      const links = [...toc.querySelectorAll('a')];
      const targets = links.map(a => document.querySelector(a.getAttribute('href')));
      let ticking = false;

      const nav = document.querySelector('.topnav');
      function setNavH() { if (nav) document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px'); }
      setNavH();
      window.addEventListener('resize', setNavH);
      window.addEventListener('load', setNavH);

      toc.dataset.mode = 'open';
      head.setAttribute('aria-expanded', 'true');

      function updateVisibility() {
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
    }

    let activePop = null;
    function closePop() { if (activePop) { activePop.remove(); activePop = null; } }
    function showPop(target, text) {
      closePop();
      const pop = document.createElement('div');
      pop.className = 'pop';
      pop.innerHTML = '<span class="pop-close">&times;</span>' + text;
      document.body.appendChild(pop);
      const r = target.getBoundingClientRect();
      const top = window.scrollY + r.bottom + 8;
      let left = window.scrollX + r.left;
      if (left + 280 > window.innerWidth) left = window.innerWidth - 296;
      pop.style.top = top + 'px';
      pop.style.left = Math.max(8, left) + 'px';
      pop.querySelector('.pop-close').onclick = closePop;
      activePop = pop;
    }

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('term-link')) {
        e.stopPropagation();
        const key = e.target.dataset.key.toLowerCase();
        const card = [...document.querySelectorAll('#terms-list .term-card')].find(c => c.dataset.term.toLowerCase().includes(key) || key.includes(c.dataset.term.toLowerCase().split(' (')[0].toLowerCase()));
        const def = card ? card.dataset.def : 'Definition not found.';
        showPop(e.target, '<strong>' + (card ? card.dataset.term : key) + ':</strong> ' + def);
      } else if (e.target.classList.contains('fn')) {
        e.stopPropagation();
        showPop(e.target, e.target.dataset.fn);
      } else if (activePop && !activePop.contains(e.target)) {
        closePop();
      }
    });

    const chips = document.querySelectorAll('#termFilters .filter-chip');
    chips.forEach(chip => {
      chip.onclick = () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const cat = chip.dataset.cat;
        document.querySelectorAll('#terms-list .term-card').forEach(card => {
          card.classList.toggle('hidden', cat !== 'all' && card.dataset.cat !== cat);
        });
      };
    });

    const shell = document.getElementById('nepalMapShell');
    if (shell) {
      const svg = shell.querySelector('svg');
      const tip = document.getElementById('mapTip');
      const sites = [...shell.querySelectorAll('.site')];
      let pinned = null;

      function scaleLabels() {
        const w = svg ? svg.getBoundingClientRect().width || 1000 : 1000;
        const units = 1000 / w;
        if (svg) svg.style.setProperty('--nm-fs', Math.max(19, 12.5 * units).toFixed(1) + 'px');
      }
      scaleLabels();
      window.addEventListener('resize', scaleLabels);

      function esc(s) {
        return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      }

      function show(site) {
        sites.forEach(s => s.classList.toggle('on', s === site));
        if (tip) {
          tip.innerHTML = '<strong>' + esc(site.dataset.name) + '</strong><span class="kind">' + esc(site.dataset.kind) + '</span><p>' + esc(site.dataset.note) + '</p>';
          tip.classList.add('show');
        }
        const sr = shell.getBoundingClientRect();
        const r = site.querySelector('.hit').getBoundingClientRect();
        const cx = r.left + r.width / 2 - sr.left;
        const tw = tip ? tip.offsetWidth : 220;
        const th = tip ? tip.offsetHeight : 80;
        let left = Math.min(Math.max(cx - tw / 2, 8), sr.width - tw - 8);
        let topPos = r.top - sr.top - th - 4;
        if (topPos < 8) topPos = r.bottom - sr.top + 4;
        if (tip) {
          tip.style.left = left + 'px';
          tip.style.top = topPos + 'px';
        }
      }

      function hide() {
        pinned = null;
        if (tip) tip.classList.remove('show');
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

      document.addEventListener('click', (e) => {
        if (e.target.closest('.site')) return;
        if (tip && !tip.contains(e.target)) hide();
      });
    }

    /* ═══════════════════════════════════════════════════════════
       LANGUAGE TOGGLE  –  English ↔ नेपाली
       ═══════════════════════════════════════════════════════════ */
    (function initLangToggle() {
      const btn = document.getElementById('langToggle');
      if (!btn) return;

      let currentLang = 'en';

      /* ── helper: cache original text on an element ─────────── */
      function cacheOrig(el, attr) {
        if (!el.dataset[attr]) el.dataset[attr] = el.textContent;
      }

      /* ── 1. Static elements: swap via [data-en] / [data-ne] ── */
      function applyLangToStaticEls(lang) {
        // Swap all elements carrying data-en / data-ne attributes
        document.querySelectorAll('[data-en]').forEach(el => {
          const enVal = el.getAttribute('data-en');
          const neVal = el.getAttribute('data-ne');
          if (!enVal && !neVal) return;
          const target = lang === 'ne' ? neVal : enVal;
          if (target === null || target === undefined) return;
          // Only update leaf-text nodes (avoid overwriting children/markup)
          const childEls = [...el.children];
          if (childEls.length === 0) {
            el.textContent = target;
          }
        });
        // Swap image sources with data-src-en / data-src-ne
        document.querySelectorAll('[data-src-en], [data-src-ne]').forEach(img => {
          const enSrc = img.getAttribute('data-src-en');
          const neSrc = img.getAttribute('data-src-ne');
          const targetSrc = lang === 'ne' ? (neSrc || enSrc) : (enSrc || neSrc);
          if (targetSrc) {
            img.src = targetSrc;
          }
        });
        // Swap image alt attributes with data-alt-en / data-alt-ne
        document.querySelectorAll('[data-alt-en], [data-alt-ne]').forEach(img => {
          const enAlt = img.getAttribute('data-alt-en');
          const neAlt = img.getAttribute('data-alt-ne');
          const targetAlt = lang === 'ne' ? (neAlt || enAlt) : (enAlt || neAlt);
          if (targetAlt) {
            img.alt = targetAlt;
          }
        });
        // Page <title> (special case – no child elements)
        const titleEl = document.querySelector('title');
        if (titleEl) {
          const val = titleEl.getAttribute('data-' + lang);
          if (val) titleEl.textContent = val;
        }
        // <html lang> attribute
        document.documentElement.lang = lang === 'ne' ? 'ne' : 'en';
        // <body> font class for Nepali
        document.body.classList.toggle('lang-ne', lang === 'ne');
      }

      /* ── 2. Dynamic report sections ────────────────────────── */
      function patchSection(sectionId, t, lang) {
        const sec = document.getElementById(sectionId);
        if (!t || !sec) return;

        // eyebrow label
        const eyebrow = sec.querySelector('.section-eyebrow');
        if (eyebrow && t.eyebrow) {
          cacheOrig(eyebrow, 'enOrig');
          eyebrow.textContent = lang === 'ne' ? t.eyebrow : eyebrow.dataset.enOrig;
        }

        // h2 section title
        const h2 = sec.querySelector('.section-title');
        if (h2 && t.title) {
          cacheOrig(h2, 'enOrig');
          h2.textContent = lang === 'ne' ? t.title : h2.dataset.enOrig;
        }

        // first .section-lead paragraph
        const lead = sec.querySelector('.section-lead');
        if (lead && t.lead) {
          cacheOrig(lead, 'enOrig');
          lead.textContent = lang === 'ne' ? t.lead : lead.dataset.enOrig;
        }

        // .paras[] — map to <p> elements that are direct or near-direct children
        if (t.paras && t.paras.length) {
          // Gather <p> tags that sit at the section level (skip deeply nested ones in boxes)
          const allP = [...sec.querySelectorAll('p')].filter(p => {
            // skip paragraphs that are inside .finding-box, .acc, details, .box-panel
            return !p.closest('.finding-box, .acc, details, .box-panel, .pop');
          });
          allP.forEach((p, i) => {
            if (i >= t.paras.length) return;
            cacheOrig(p, 'enOrig');
            p.textContent = lang === 'ne' ? t.paras[i] : p.dataset.enOrig;
          });
        }

        // stat bar labels (glance)
        if (t.statLabels) {
          const labels = [...sec.querySelectorAll('.stat-bars .label')];
          labels.forEach((lbl, i) => {
            if (i >= t.statLabels.length) return;
            cacheOrig(lbl, 'enOrig');
            lbl.textContent = lang === 'ne' ? t.statLabels[i] : lbl.dataset.enOrig;
          });
        }

        // finding box (glance)
        if (t.findingLabel || t.findingText) {
          const fb = sec.querySelector('.finding-box');
          if (fb) {
            const lbl = fb.querySelector('.lbl');
            if (lbl && t.findingLabel) {
              cacheOrig(lbl, 'enOrig');
              lbl.textContent = lang === 'ne' ? t.findingLabel : lbl.dataset.enOrig;
            }
            const fp = fb.querySelector('p');
            if (fp && t.findingText) {
              cacheOrig(fp, 'enOrig');
              fp.textContent = lang === 'ne' ? t.findingText : fp.dataset.enOrig;
            }
          }
        }

        // terms lead (front-matter)
        if (t.termsLead) {
          const tl = sec.querySelector('.acc-body .section-lead');
          if (tl) {
            cacheOrig(tl, 'enOrig');
            tl.textContent = lang === 'ne' ? t.termsLead : tl.dataset.enOrig;
          }
        }

        // accordion summary labels
        if (t.acronymsSummary) {
          const summs = [...sec.querySelectorAll('summary')];
          if (summs[0]) {
            cacheOrig(summs[0], 'enOrig');
            summs[0].textContent = lang === 'ne' ? t.acronymsSummary : summs[0].dataset.enOrig;
          }
          if (summs[1] && t.termsSummary) {
            cacheOrig(summs[1], 'enOrig');
            summs[1].textContent = lang === 'ne' ? t.termsSummary : summs[1].dataset.enOrig;
          }
        }

        // acronym rows — translate the full-form span (second child of each .acr-row)
        if (t.acronyms && t.acronyms.length) {
          const rows = [...sec.querySelectorAll('.acr-row')];
          rows.forEach((row, i) => {
            if (i >= t.acronyms.length) return;
            const span = row.children[1]; // second span = full form text
            if (!span) return;
            cacheOrig(span, 'enOrig');
            span.textContent = lang === 'ne' ? t.acronyms[i] : span.dataset.enOrig;
          });
        }

        // term cards — translate .t (title) and .d (definition) within each card
        if (t.terms && t.terms.length) {
          const cards = [...sec.querySelectorAll('.term-card')];
          cards.forEach((card, i) => {
            if (i >= t.terms.length) return;
            const titleEl = card.querySelector('.t');
            const defEl = card.querySelector('.d');
            if (titleEl) {
              cacheOrig(titleEl, 'enOrig');
              titleEl.textContent = lang === 'ne' ? t.terms[i].title : titleEl.dataset.enOrig;
            }
            if (defEl) {
              cacheOrig(defEl, 'enOrig');
              defEl.textContent = lang === 'ne' ? t.terms[i].def : defEl.dataset.enOrig;
            }
            // also update the data-term and data-def used by pop-up tooltips
            if (lang === 'ne') {
              if (!card.dataset.enTerm) card.dataset.enTerm = card.dataset.term;
              if (!card.dataset.enDef) card.dataset.enDef = card.dataset.def;
              card.dataset.term = t.terms[i].title;
              card.dataset.def = t.terms[i].def;
            } else {
              if (card.dataset.enTerm) card.dataset.term = card.dataset.enTerm;
              if (card.dataset.enDef) card.dataset.def = card.dataset.enDef;
            }
          });
        }

        // about-study sub-heading
        if (t.aboutStudyTitle) {
          const asH = sec.querySelector('.about-study-title, h3');
          if (asH) {
            cacheOrig(asH, 'enOrig');
            asH.textContent = lang === 'ne' ? t.aboutStudyTitle : asH.dataset.enOrig;
          }
        }

        // h3 subheadings (e.g. in chapters)
        if (t.subheadings && t.subheadings.length) {
          const h3s = [...sec.querySelectorAll('h3')];
          h3s.forEach((h3, i) => {
            if (i >= t.subheadings.length) return;
            cacheOrig(h3, 'enOrig');
            h3.textContent = lang === 'ne' ? t.subheadings[i] : h3.dataset.enOrig;
          });
        }

        // Accordion boxes (e.g. details.acc in chapter sections like Box 6 and Box 7)
        if (t.boxes && t.boxes.length) {
          const accs = [...sec.querySelectorAll('details.acc')];
          accs.forEach((acc, i) => {
            if (i >= t.boxes.length) return;
            const bData = t.boxes[i];
            if (!bData) return;

            // Box summary / title
            if (bData.summary) {
              const summ = acc.querySelector('summary');
              if (summ) {
                cacheOrig(summ, 'enOrig');
                summ.textContent = lang === 'ne' ? bData.summary : summ.dataset.enOrig;
              }
            }

            // Box lead / intro paragraph
            if (bData.lead) {
              const bLead = acc.querySelector('.acc-body > p');
              if (bLead) {
                cacheOrig(bLead, 'enOrig');
                bLead.textContent = lang === 'ne' ? bData.lead : bLead.dataset.enOrig;
              }
            }

            // Box list items
            if (bData.items && bData.items.length) {
              const lis = [...acc.querySelectorAll('.acc-body li')];
              lis.forEach((li, liIdx) => {
                if (liIdx >= bData.items.length) return;
                cacheOrig(li, 'enOrig');
                li.textContent = lang === 'ne' ? bData.items[liIdx] : li.dataset.enOrig;
              });
            }

            // Box paragraphs (for multi-paragraph boxes like Box 7)
            if (bData.paras && bData.paras.length) {
              const bParas = [...acc.querySelectorAll('.acc-body > p')];
              bParas.forEach((bp, pIdx) => {
                if (pIdx >= bData.paras.length) return;
                cacheOrig(bp, 'enOrig');
                bp.textContent = lang === 'ne' ? bData.paras[pIdx] : bp.dataset.enOrig;
              });
            }
          });
        }

        // image alt attribute
        if (t.imageAlt) {
          const img = sec.querySelector('figure img, img');
          if (img) {
            cacheOrig(img, 'enAltOrig');
            img.alt = lang === 'ne' ? t.imageAlt : img.dataset.enAltOrig;
          }
        }
      }

      function applyLangToDynamicContent(lang) {
        const tr = window.NE_TRANSLATIONS;
        if (!tr) return;
        Object.keys(tr).forEach(id => {
          if (id === 'footer') return; // handled separately
          patchSection(id, tr[id], lang);
        });
        // Footer about paragraph
        if (tr.footer) {
          const footerP = document.querySelector('footer p:first-of-type');
          if (footerP) {
            cacheOrig(footerP, 'enOrig');
            footerP.textContent = lang === 'ne' ? tr.footer.about : footerP.dataset.enOrig;
          }
        }
      }


      /* ── 2b. Report body: every translatable element, matched by order ──
         ne.js holds one Nepali string per element (null = leave English).
         The selector + "leaf" rule below must stay identical to extract.py. */
      const UNIT_SEL = 'p,li,h2,h3,h4,summary,figcaption,caption,th,td,.tl-date,.tl-title,.tl-desc,.attr';
      function unitsOf(sec) {
        return [...sec.querySelectorAll(UNIT_SEL)].filter(el =>
          !el.querySelector(UNIT_SEL) && el.textContent.trim());
      }
      function applyUnits(lang) {
        const NE = window.NE_UNITS;
        if (!NE) return;
        Object.keys(NE).forEach(id => {
          const sec = document.getElementById(id);
          if (!sec) { console.warn('[i18n] section not found:', id); return; }
          const els = unitsOf(sec);
          if (els.length !== NE[id].length) {
            console.warn('[i18n] unit count mismatch in #' + id + ': page has ' + els.length + ', ne.js has ' + NE[id].length);
            return;
          }
          els.forEach((el, i) => {
            if (el.dataset.enHtml === undefined) el.dataset.enHtml = el.innerHTML;
            const ne = NE[id][i];
            if (lang === 'ne' && ne) {
              // keep footnote markers (<sup class="fn">) – the Nepali text has none of its own
              const keep = [...el.querySelectorAll('sup.fn')].map(n => n.outerHTML).join('');
              el.textContent = ne;
              if (keep) el.insertAdjacentHTML('beforeend', keep);
            } else {
              el.innerHTML = el.dataset.enHtml;
            }
          });
        });
      }


      /* ── 2c. "NID timeline at a glance" side panel (chapter 2) ── */
      function applyMini(lang) {
        const T = window.NE_MINI_TL;
        if (!T) return;
        const items = [...document.querySelectorAll('.mini-tl-item')];
        if (items.length !== T.items.length) { console.warn('[i18n] mini timeline: page has ' + items.length + ', ne.js has ' + T.items.length); return; }
        items.forEach((item, i) => {
          const box = item.querySelector(':scope > div');
          const yr = box && box.querySelector('.yr');
          const tn = box && [...box.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
          if (!yr || !tn) return;
          if (box.dataset.enTxt === undefined) { box.dataset.enTxt = tn.textContent; box.dataset.enYr = yr.textContent; }
          yr.textContent = lang === 'ne' ? T.items[i].yr : box.dataset.enYr;
          tn.textContent = lang === 'ne' ? T.items[i].text : box.dataset.enTxt;
        });
      }

      /* ── 3. Button click handler ─────────────────────────── */
      btn.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'ne' : 'en';
        const isNe = currentLang === 'ne';

        // Update button appearance
        btn.textContent = isNe ? 'English' : 'नेपाली';
        btn.title = isNe ? 'Switch to English' : 'Switch to Nepali';
        btn.setAttribute('aria-label', isNe ? 'Switch to English' : 'Switch to Nepali');
        btn.setAttribute('aria-pressed', String(isNe));
        btn.classList.toggle('lang-active', isNe);

        // Apply the language
        applyLangToStaticEls(currentLang);
        applyLangToDynamicContent(currentLang);
        applyUnits(currentLang);
        applyMini(currentLang);
      });

    })();

  })();
})();
