// Filtering, sorting, card/list markup, categories, and DOM reconciliation.
// Classic scripts intentionally expose handler functions to inline HTML events.

// ── Runtime helpers ──
function formatRuntime(mins) {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60),
    m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function rtBadge(m) {
  return m.rtRating ? `🍅 ${esc(m.rtRating)}` : '';
}

function _formatCinemaDate(dateStr, short) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return '';
  const ms = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const ss = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${short ? ss[d.getMonth()] : ms[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Date added helpers ──
function formatDateAdded(dateStr) {
  if (!dateStr) return 'Added: unknown';
  const todayStr = localDateStr(new Date());
  const addedStr = localDateStr(new Date(dateStr));
  const days = Math.round((new Date(todayStr) - new Date(addedStr)) / 86400000);
  if (days === 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < 30) return `Added ${days} days ago`;
  if (days < 60) return 'Added about 1 month ago';
  if (days < 365) return `Added about ${Math.floor(days / 30)} months ago`;
  if (days < 730) return 'Added about 1 year ago';
  return `Added about ${Math.floor(days / 365)} years ago`;
}

function formatDateWatched(dateStr) {
  if (!dateStr) return 'Watched: unknown';
  const todayStr = localDateStr(new Date());
  const watchedStr = localDateStr(new Date(dateStr));
  const days = Math.round((new Date(todayStr) - new Date(watchedStr)) / 86400000);
  if (days === 0) return 'Watched today';
  if (days === 1) return 'Watched yesterday';
  if (days < 30) return `Watched ${days} days ago`;
  if (days < 60) return 'Watched about 1 month ago';
  if (days < 365) return `Watched about ${Math.floor(days / 30)} months ago`;
  if (days < 730) return 'Watched about 1 year ago';
  return `Watched about ${Math.floor(days / 365)} years ago`;
}

// ── Staleness helper ──
function getStaleClass(m) {
  if (m.watched || m.graveyard || !m.dateAdded) return '';
  const days = (Date.now() - new Date(m.dateAdded).getTime()) / 86400000;
  if (days > 365) return ' card-stale-purple';
  if (days > 180) return ' card-stale-crimson';
  if (days > 90) return ' card-stale-red';
  if (days > 60) return ' card-stale-orange';
  if (days > 30) return ' card-stale-amber';
  return '';
}

// Watched films watched 6+ months ago are hidden from "all" to reduce clutter
function isArchivedWatched(m) {
  if (!m.watched) return false;
  if (m.rewatch) return false;
  const ref = m.dateWatched || m.dateAdded;
  if (!ref) return false;
  return (Date.now() - new Date(ref).getTime()) / 86400000 > 180;
}

// ── List view builders ──
function buildListRow(m, i) {
  const thumbSrc = m.poster ? m.poster.replace('/t/p/w500/', '/t/p/w92/') : '';
  const thumb = thumbSrc
    ? `<img class="list-thumb" data-src="${esc(thumbSrc)}" alt="${esc(m.title)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="list-thumb-placeholder" style="display:none">🎬</div>`
    : `<div class="list-thumb-placeholder">🎬</div>`;
  const soonPip = m.watchingSoon
    ? `<span class="list-soon-pip"></span>`
    : m.rewatchingSoon
      ? `<span class="list-rewatch-soon-pip"></span>`
      : '';
  const meta = [m.year, m.genre, m.director, formatRuntime(m.runtime)]
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  const badges = buildBadges(m, true);
  const staleClass = getStaleClass(m);
  const statusTag = m.graveyard
    ? `<span class="list-status graveyard">💀 Never</span>`
    : m.watched && m.rewatch
      ? `<span class="list-status rewatch">Rewatch</span>`
      : m.watched
        ? `<span class="list-status watched">✓ Watched</span>`
        : '';
  const exemptTag =
    state.currentFilter === 'categories' &&
    m.detachExempt &&
    state.categorySettings[m.category]?.detached
      ? `<span class="list-status list-status-visible">👁 Visible</span>`
      : '';
  const dateLabel = m.watched ? formatDateWatched(m.dateWatched) : formatDateAdded(m.dateAdded);
  const rowClass = `list-row${m.watched ? ' list-row-watched' : ''}${m.graveyard ? ' list-row-graveyard' : ''}${staleClass ? staleClass.replace('card-stale', 'list-stale') : ''}`;
  return `<div class="${rowClass}" data-id="${esc(m.id)}" data-render-hash="${esc(_cardHash(m))}" onclick="openDetail(${jsAttr(m.id)})" style="animation-delay:${i * 0.02}s">
    <div class="list-thumb-wrap">${thumb}${soonPip}</div>
    <div class="list-info">
      <div class="list-title">${esc(m.title)}</div>
      ${meta ? `<div class="list-meta">${meta}${m.rating ? ' · ★ ' + esc(m.rating) : ''}${m.rtRating ? ' · ' + rtBadge(m) : ''}</div>` : ''}
      <div class="list-badges">${badges}</div>
    </div>
    <div class="list-right">
      ${statusTag}${exemptTag}
      <span class="list-date">${dateLabel}</span>
    </div>
  </div>`;
}

function buildListCollectionGroup(name, groupMovies, startIdx) {
  const rows = groupMovies.map((m, i) => buildListRow(m, startIdx + i)).join('');
  return `<div class="list-collection-group"><div class="list-collection-label">🎬 ${esc(name)}</div>${rows}</div>`;
}

function buildListItems(items) {
  let idx = 0,
    html = '';
  for (const item of items) {
    if (item.type === 'card') {
      html += buildListRow(item.movie, idx++);
    } else {
      html += buildListCollectionGroup(item.name, item.movies, idx);
      idx += item.movies.length;
    }
  }
  return html;
}

function buildListGrouped(allMovies) {
  const groups = { netflix: [], disney: [], prime: [], cinema: [], other: [] };
  const cdMap = collectionDateMap();
  for (const m of allMovies) {
    const s = m.streaming || {};
    let placed = false;
    for (const k of GROUP_ORDER) {
      if (s[k]?.direct || s[k]?.vpn || (k === 'cinema' && s[k]?.coming)) {
        groups[k].push(m);
        placed = true;
        break;
      }
    }
    if (!placed) groups.other.push(m);
  }
  for (const k of GROUP_ORDER) {
    const rewatch = sortWithCollections(
      groups[k].filter((m) => m.watched && m.rewatch),
      cdMap
    );
    const regularWatched = sortWithCollections(
      groups[k].filter((m) => m.watched && !m.rewatch),
      cdMap
    );
    if (k === 'cinema') {
      const unwatched = sortWithCollections(
        groups[k].filter((m) => !m.watched),
        cdMap
      );
      groups[k] = [...unwatched, ...rewatch, ...regularWatched];
    } else {
      const directUnwatched = sortWithCollections(
        groups[k].filter((m) => !m.watched && m.streaming?.[k]?.direct),
        cdMap
      );
      const vpnUnwatched = sortWithCollections(
        groups[k].filter((m) => !m.watched && !m.streaming?.[k]?.direct && m.streaming?.[k]?.vpn),
        cdMap
      );
      const implicitUnwatched =
        k === 'other'
          ? sortWithCollections(
              groups[k].filter((m) => !m.watched && hasNoStreaming(m)),
              cdMap
            )
          : [];
      groups[k] = [
        ...directUnwatched,
        ...vpnUnwatched,
        ...implicitUnwatched,
        ...rewatch,
        ...regularWatched,
      ];
    }
  }
  let html = '',
    rowIdx = 0;
  for (const k of GROUP_ORDER) {
    if (!groups[k].length) continue;
    const meta = SERVICE_META[k];
    const total = groups[k].length;
    const items = groupIntoRenderItems(groups[k]);
    let sectionHtml = '';
    for (const item of items) {
      if (item.type === 'card') {
        sectionHtml += buildListRow(item.movie, rowIdx++);
      } else {
        sectionHtml += buildListCollectionGroup(item.name, item.movies, rowIdx);
        rowIdx += item.movies.length;
      }
    }
    html += `<div class="list-section">
      <div class="service-section-heading list-section-heading" style="--service-color:${meta.color};--service-glow:${meta.color}60;--service-rule:${meta.rule}">
        <span class="service-section-dot"></span>
        <span class="service-section-label">${meta.label}</span>
        <span class="service-section-count">${total} film${total !== 1 ? 's' : ''}</span>
        <span class="service-section-rule"></span>
      </div>
      <div class="list-rows">${sectionHtml}</div>
    </div>`;
  }
  return html;
}

// ── Render ──
function render() {
  const cnt = state.movies.filter((m) => !m.graveyard && !isDetachedMovie(m)).length;
  document.getElementById('headerCount').textContent = state.christmasMode
    ? cnt === 1
      ? '1 Christmas film'
      : `${cnt} Christmas films`
    : cnt === 1
      ? '1 film'
      : `${cnt} films`;
  // Show/hide companion filter pill
  const wf = document.getElementById('watchWithFilterBar');
  if (wf) {
    if (state.currentWatchWith) {
      document.getElementById('watchWithFilterName').textContent = state.currentWatchWith;
      wf.style.display = '';
    } else {
      wf.style.display = 'none';
    }
  }
  const soon = _postFilter(
    sortWithCollections(state.movies.filter((m) => m.watchingSoon && !m.graveyard))
  );
  const ss = document.getElementById('soonSection'),
    sd = document.getElementById('soonDivider'),
    sr = document.getElementById('soonStrip');
  if (soon.length && state.currentFilter === 'all' && !state.searchQuery) {
    ss.classList.add('visible');
    sd.style.display = 'none';
    sr.innerHTML = soon.map((m, i) => buildSoonCard(m, i)).join('');
  } else {
    ss.classList.remove('visible');
    sd.style.display = 'none';
  }
  const rewatchSoon = _postFilter(
    sortWithCollections(
      state.movies.filter((m) => m.rewatchingSoon && m.rewatch && m.watched && !m.graveyard)
    )
  );
  const rss = document.getElementById('rewatchSoonSection'),
    rsr = document.getElementById('rewatchSoonStrip');
  if (rewatchSoon.length && state.currentFilter === 'all' && !state.searchQuery) {
    rss.classList.add('visible');
    rsr.innerHTML = rewatchSoon.map((m, i) => buildRewatchSoonCard(m, i)).join('');
  } else {
    rss.classList.remove('visible');
  }
  requestAnimationFrame(_checkSoonLayout);

  if (state.currentFilter === 'categories') {
    renderCategoriesView();
    return;
  }

  const g = document.getElementById('movieGrid');
  const emptyIcon = state.christmasMode ? '🎄' : '🎬';
  const emptyMainMsg = state.christmasMode
    ? cnt === 0
      ? 'Your Christmas watchlist is empty.<br>Click <strong>Add Film</strong> to get started.'
      : 'No Christmas films to display.'
    : cnt === 0
      ? 'Your watchlist is empty.<br>Click <strong>Add Film</strong> to get started.'
      : 'No films to display.';
  const emptyFilterMsg = state.christmasMode
    ? cnt === 0
      ? 'Your Christmas watchlist is empty.<br>Click <strong>Add Film</strong> to get started.'
      : 'No Christmas films match this filter.'
    : cnt === 0
      ? 'Your watchlist is empty.<br>Click <strong>Add Film</strong> to get started.'
      : 'No films match this filter.';
  const emptyAll = `<div class="empty-all"><span class="empty-all-icon">${emptyIcon}</span><p class="empty-all-description">${emptyMainMsg}</p></div>`;
  const emptyFilter = `<div class="empty-state"><span class="empty-icon">${emptyIcon}</span><p>${emptyFilterMsg}</p></div>`;

  if (state.currentView === 'list') {
    g.className = 'list-container';
    if (state.currentFilter === 'all') {
      const base = state.searchQuery
        ? _postFilter(
            state.movies.filter(
              (m) => !m.graveyard && (state.searchIncludesDetached || !isDetachedMovie(m))
            )
          )
        : _postFilter(
            state.movies.filter(
              (m) =>
                !m.watchingSoon &&
                !m.rewatchingSoon &&
                !m.graveyard &&
                !isArchivedWatched(m) &&
                !isDetachedMovie(m)
            )
          );
      if (state.searchQuery) {
        if (!base.length) {
          _setHTML(g, _searchEmptyHTML(emptyFilter, emptyIcon));
        } else {
          _reconcileListRows(g, base.map((m, i) => buildListRow(m, i)).join(''));
        }
      } else if (state.currentGrouping === 'flat') {
        const _cdm = collectionDateMap();
        const _flatSorted = [
          ...sortWithCollections(
            base.filter((m) => !m.watched),
            _cdm
          ),
          ...sortWithCollections(
            base.filter((m) => m.watched && m.rewatch),
            _cdm
          ),
          ...sortWithCollections(
            base.filter((m) => m.watched && !m.rewatch),
            _cdm
          ),
        ];
        _setHTML(
          g,
          base.length
            ? `<div class="list-rows">${buildListItems(groupIntoRenderItems(_flatSorted))}</div>`
            : emptyAll
        );
      } else {
        _setHTML(g, base.length ? buildListGrouped(base) : emptyAll);
      }
    } else {
      const f = getFiltered();
      if (!f.length) {
        _setHTML(g, emptyFilter);
        return;
      }
      if (state.searchQuery) {
        _reconcileListRows(g, f.map((m, i) => buildListRow(m, i)).join(''));
      } else {
        _setHTML(g, `<div class="list-rows">${buildListItems(groupIntoRenderItems(f))}</div>`);
      }
    }
    return;
  }

  if (state.currentFilter === 'all') {
    const base = state.searchQuery
      ? _postFilter(
          state.movies.filter(
            (m) => !m.graveyard && (state.searchIncludesDetached || !isDetachedMovie(m))
          )
        )
      : _postFilter(
          state.movies.filter(
            (m) =>
              !m.watchingSoon &&
              !m.rewatchingSoon &&
              !m.graveyard &&
              !isArchivedWatched(m) &&
              !isDetachedMovie(m)
          )
        );
    if (state.searchQuery) {
      g.className = 'grid';
      if (base.length) _reconcile(g, base.map((m, i) => buildCard(m, i)).join(''));
      else _setHTML(g, _searchEmptyHTML(emptyFilter, emptyIcon));
    } else if (state.currentGrouping === 'flat') {
      g.className = 'grid';
      const _cdm2 = collectionDateMap();
      const _gridSorted = [
        ...sortWithCollections(
          base.filter((m) => !m.watched),
          _cdm2
        ),
        ...sortWithCollections(
          base.filter((m) => m.watched && m.rewatch),
          _cdm2
        ),
        ...sortWithCollections(
          base.filter((m) => m.watched && !m.rewatch),
          _cdm2
        ),
      ];
      if (base.length) _reconcile(g, renderItems(groupIntoRenderItems(_gridSorted)));
      else _setHTML(g, emptyAll);
    } else {
      g.className = 'movie-container';
      const grouped = buildGrouped(base);
      _setHTML(g, grouped || emptyAll);
    }
  } else {
    g.className = 'grid';
    const f = getFiltered();
    if (!f.length) {
      _setHTML(g, emptyFilter);
      return;
    }
    if (state.searchQuery) {
      _reconcile(g, f.map((m, i) => buildCard(m, i)).join(''));
    } else {
      _setHTML(g, renderItems(groupIntoRenderItems(f)));
    }
  }
  trimCardMetas();
}

// ── Categories view ──
function getCategoryNames() {
  // Returns category names sorted by the earliest dateAdded of any movie in each category
  const map = {};
  for (const m of state.movies) {
    if (!m.category) continue;
    const t = m.dateAdded ? new Date(m.dateAdded).getTime() : Infinity;
    if (!(m.category in map) || t < map[m.category]) map[m.category] = t;
  }
  return Object.keys(map).sort((a, b) => map[a] - map[b]);
}

function renderCategoriesView() {
  const g = document.getElementById('movieGrid');
  const strip = document.getElementById('categoryPillStrip');
  const opts = document.getElementById('categoryOptions');
  const cats = getCategoryNames();

  // Render pill strip — active pill gets a ⋯ menu button; all pills support right-click
  const addPill = `<button class="category-pill category-add-pill" onclick="openAddModalWithCategory(${jsAttr(state.currentCategory || '')})">&#43; Add Film</button>`;
  strip.innerHTML =
    addPill +
    cats
      .map((c) => {
        const count = state.movies.filter((m) => m.category === c).length;
        const active = state.currentCategory === c ? 'active' : '';
        const detached = state.categorySettings[c]?.detached;
        const detachedCls = detached ? 'detached' : '';
        const lockPrefix = detached ? '🔒 ' : '';
        const menuBtn = active
          ? `<span class="pill-menu-btn" onclick="openPillMenu(event,this,${jsAttr(c)})" title="Category options">&middot;&middot;&middot;</span>`
          : '';
        return `<button class="category-pill ${active} ${detachedCls}" onclick="selectCategory(${jsAttr(c)})" oncontextmenu="openPillMenu(event,this,${jsAttr(c)});return false;">${lockPrefix}${esc(c)}<span class="category-pill-count">${count}</span>${menuBtn}</button>`;
      })
      .join('');

  if (!cats.length) {
    opts.classList.remove('visible');
    opts.innerHTML = '';
    g.className = 'grid';
    g.innerHTML = `<div class="category-empty-state"><span class="empty-icon">📂</span><p>No categories yet.<br>Add a category to a film when editing or adding it.</p></div>`;
    return;
  }

  if (!state.currentCategory) {
    opts.classList.remove('visible');
    opts.innerHTML = '';
    g.className = 'grid';
    g.innerHTML = `<div class="category-empty-state"><span class="empty-icon">👆</span><p>Select a category above to browse its films.</p></div>`;
    return;
  }

  // Options area — detached row shown unless dismissed
  const isDetached = !!state.categorySettings[state.currentCategory]?.detached;
  const catEsc = state.currentCategory.replace(/'/g, "\\'");
  if (!state.categoryOptionsDismissed) {
    opts.innerHTML = `<div class="category-options-row">
      <div class="category-options-content">
        <div>
          <div class="category-options-label">Detached</div>
          <div class="category-options-desc">Hidden from all tabs except Watching Soon</div>
        </div>
        <label class="toggle-row toggle-fixed">
          <input type="checkbox" id="categoryDetachedToggle" onchange="toggleCategoryDetached()" ${isDetached ? 'checked' : ''}>
          <span class="track"></span>
        </label>
      </div>
      <button onclick="dismissCategoryOptions()" title="Dismiss" class="category-options-dismiss" style="color:var(--text-muted);" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color=''">&times;</button>
    </div>`;
    opts.classList.add('visible');
  } else {
    opts.classList.remove('visible');
    opts.innerHTML = '';
  }

  // Show movies in the selected category, sorted by the user's chosen sort
  const inCat = state.movies.filter((m) => m.category === state.currentCategory);
  const sorted = sortWithCollections(inCat);

  if (!sorted.length) {
    g.className = 'grid';
    g.innerHTML = `<div class="category-empty-state"><span class="empty-icon">🎬</span><p>No films in this category yet.</p></div>`;
    return;
  }

  if (state.currentView === 'list') {
    g.className = 'list-container';
    g.innerHTML = `<div class="list-rows">${buildListItems(groupIntoRenderItems(sorted))}</div>`;
  } else {
    g.className = 'grid';
    g.innerHTML = renderItems(groupIntoRenderItems(sorted));
    trimCardMetas();
  }
}

function selectCategory(name) {
  state.currentCategory = state.currentCategory === name ? null : name;
  render();
}

// Sort oldest-first (longest in list appears first, most recently added appears last)
function sortOldestFirst(a, b) {
  const ta = a.dateAdded ? new Date(a.dateAdded).getTime() : Infinity;
  const tb = b.dateAdded ? new Date(b.dateAdded).getTime() : Infinity;
  return ta - tb;
}

// Build a map of collection name → earliest dateAdded timestamp across ALL movies
function collectionDateMap() {
  const map = {};
  for (const m of state.movies) {
    if (!m.collection) continue;
    const t = m.dateAdded ? new Date(m.dateAdded).getTime() : Infinity;
    if (!(m.collection in map) || t < map[m.collection]) map[m.collection] = t;
  }
  return map;
}

// Returns the raw value used for sort comparison for the given field.
// Title strips leading articles so "The Dark Knight" files under D, not T.
function _movieSortValue(m, field) {
  switch (field) {
    case 'dateAdded':
      return m.dateAdded ? new Date(m.dateAdded).getTime() : 0;
    case 'dateWatched':
      return m.dateWatched ? new Date(m.dateWatched).getTime() : 0;
    case 'year':
      return m.releaseDate
        ? new Date(m.releaseDate + 'T00:00:00').getTime()
        : m.year
          ? new Date(m.year + '-01-01T00:00:00').getTime()
          : 0;
    case 'title':
      return (m.title || '').replace(/^(the|a|an)\s+/i, '').toLowerCase();
    case 'runtime':
      return m.runtime || 0;
    case 'rating':
      return parseFloat(String(m.rating || '').replace(/\/.*/, '')) || 0;
    default:
      return 0;
  }
}

// For collection films, anchor the whole collection at the value of its
// chronologically-earliest entry. Keeps collections together and gives them
// a single, stable sort position regardless of the field being sorted on.
function _collectionAnchorMap(arr, field) {
  const anchor = {};
  for (const m of arr) {
    if (!m.collection) continue;
    const yr = parseInt(m.year) || 9999;
    if (!(m.collection in anchor) || yr < anchor[m.collection].yr) {
      anchor[m.collection] = { yr, val: _movieSortValue(m, field) };
    }
  }
  const map = {};
  for (const c in anchor) map[c] = anchor[c].val;
  return map;
}

// Sort an array using the user-selected sort field & direction.
// Collections stay grouped together; non-collection films are compared
// against either other films or against a collection's anchor value.
// The cdMap parameter is kept for backward compatibility but no longer used —
// each call computes its own field-appropriate anchor map.
function sortWithCollections(arr, cdMap) {
  const [field, dir] = (state.currentSort || 'dateAdded-desc').split('-');
  const mult = dir === 'asc' ? 1 : -1;
  const collMap = _collectionAnchorMap(arr, field);
  return arr.slice().sort((a, b) => {
    const av =
      a.collection && collMap[a.collection] !== undefined
        ? collMap[a.collection]
        : _movieSortValue(a, field);
    const bv =
      b.collection && collMap[b.collection] !== undefined
        ? collMap[b.collection]
        : _movieSortValue(b, field);
    if (field === 'title') {
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    }
    return (av - bv) * mult;
  });
}

// Group a sorted array into render items: {type:'card',movie} or {type:'group',name,movies}
function groupIntoRenderItems(sorted) {
  const items = [],
    seen = new Set();
  for (const m of sorted) {
    if (m.collection) {
      if (seen.has(m.collection)) continue;
      seen.add(m.collection);
      const group = sorted
        .filter((x) => x.collection === m.collection)
        .sort((a, b) => {
          const va = a.releaseDate
            ? new Date(a.releaseDate + 'T00:00:00').getTime()
            : a.year
              ? new Date(a.year + '-01-01T00:00:00').getTime()
              : Infinity;
          const vb = b.releaseDate
            ? new Date(b.releaseDate + 'T00:00:00').getTime()
            : b.year
              ? new Date(b.year + '-01-01T00:00:00').getTime()
              : Infinity;
          return va - vb;
        });
      items.push({ type: 'group', name: m.collection, movies: group });
    } else {
      items.push({ type: 'card', movie: m });
    }
  }
  return items;
}

function buildCollectionGroup(name, movies, startIdx) {
  const cards = movies.map((m, i) => buildCard(m, startIdx + i)).join('');
  return `<div class="collection-group"><span class="collection-label-tag">&#127916; ${esc(name)}</span><div class="collection-inner">${cards}</div></div>`;
}

function renderItems(items) {
  let idx = 0,
    html = '';
  for (const item of items) {
    if (item.type === 'card') {
      html += buildCard(item.movie, idx++);
    } else {
      html += buildCollectionGroup(item.name, item.movies, idx);
      idx += item.movies.length;
    }
  }
  return html;
}

function buildGrouped(allMovies) {
  const groups = { netflix: [], disney: [], prime: [], cinema: [], other: [] };
  const cdMap = collectionDateMap();

  for (const m of allMovies) {
    const s = m.streaming || {};
    let placed = false;
    for (const k of GROUP_ORDER) {
      if (s[k]?.direct || s[k]?.vpn || (k === 'cinema' && s[k]?.coming)) {
        groups[k].push(m);
        placed = true;
        break;
      }
    }
    if (!placed) groups.other.push(m);
  }

  // Within each group:
  // Cinema — unwatched (oldest first) → watched (oldest first); no VPN tier
  // Others — direct unwatched (oldest first) → VPN-only unwatched (oldest first) → watched (oldest first)
  // Collection sorting respects the global earliest-added anchor across all movies
  for (const k of GROUP_ORDER) {
    const rewatch = sortWithCollections(
      groups[k].filter((m) => m.watched && m.rewatch),
      cdMap
    );
    const regularWatched = sortWithCollections(
      groups[k].filter((m) => m.watched && !m.rewatch),
      cdMap
    );
    if (k === 'cinema') {
      const unwatched = sortWithCollections(
        groups[k].filter((m) => !m.watched),
        cdMap
      );
      groups[k] = [...unwatched, ...rewatch, ...regularWatched];
    } else {
      const directUnwatched = sortWithCollections(
        groups[k].filter((m) => !m.watched && m.streaming?.[k]?.direct),
        cdMap
      );
      const vpnUnwatched = sortWithCollections(
        groups[k].filter((m) => !m.watched && !m.streaming?.[k]?.direct && m.streaming?.[k]?.vpn),
        cdMap
      );
      const implicitUnwatched =
        k === 'other'
          ? sortWithCollections(
              groups[k].filter((m) => !m.watched && hasNoStreaming(m)),
              cdMap
            )
          : [];
      groups[k] = [
        ...directUnwatched,
        ...vpnUnwatched,
        ...implicitUnwatched,
        ...rewatch,
        ...regularWatched,
      ];
    }
  }

  let html = '';
  let cardIdx = 0;
  for (const k of GROUP_ORDER) {
    if (!groups[k].length) continue;
    const meta = SERVICE_META[k];
    const total = groups[k].length;
    const items = groupIntoRenderItems(groups[k]);
    let sectionHtml = '';
    for (const item of items) {
      if (item.type === 'card') {
        sectionHtml += buildCard(item.movie, cardIdx++);
      } else {
        sectionHtml += buildCollectionGroup(item.name, item.movies, cardIdx);
        cardIdx += item.movies.length;
      }
    }
    html += `<div class="service-section">
      <div class="service-section-heading" style="--service-color:${meta.color};--service-glow:${meta.color}60;--service-rule:${meta.rule}">
        <span class="service-section-dot"></span>
        <span class="service-section-label">${meta.label}</span>
        <span class="service-section-count">${total} film${total !== 1 ? 's' : ''}</span>
        <span class="service-section-rule"></span>
      </div>
      <div class="service-grid">${sectionHtml}</div>
    </div>`;
  }
  return html;
}

// Apply user search and companion filters on top of the regular filter pipeline.
// When a search query is active, results are ranked by match quality:
//   title exact → title starts-with → title contains (all outrank everything else)
//   then: director → watchWith → genre/collection/category → year → notes
// Stable sort preserves the pipeline's existing order within each score tier.
function _postFilter(arr) {
  let r = arr;
  // Hide all watched films globally when the eye toggle is active.
  // The Watched and Graveyard filter views are exempt — they explicitly surface those films.
  if (
    state.hideWatched &&
    state.currentFilter !== 'watched' &&
    state.currentFilter !== 'graveyard' &&
    state.currentFilter !== 'rewatch'
  ) {
    r = r.filter((m) => !m.watched || m.rewatch);
  }
  if (state.currentWatchWith) {
    const w = state.currentWatchWith.toLowerCase();
    r = r.filter((m) => (m.watchWith || '').toLowerCase() === w);
  }
  if (!state.searchQuery) return r;

  const q = state.searchQuery.toLowerCase();

  const scored = r
    .map((m) => {
      const title = (m.title || '').toLowerCase();
      let score = 0;

      // ── Title tier (always wins over every other field) ──────────────────
      if (title === q)
        score = 100; // exact
      else if (title.startsWith(q))
        score = 80; // prefix
      else if (title.includes(q)) score = 60; // substring

      // ── Secondary fields (only reached when there is no title match) ─────
      if (score === 0) {
        if ((m.director || '').toLowerCase().includes(q)) score = Math.max(score, 20);
        if ((m.watchWith || '').toLowerCase().includes(q)) score = Math.max(score, 15);
        if ((m.genre || '').toLowerCase().includes(q)) score = Math.max(score, 10);
        if ((m.collection || '').toLowerCase().includes(q)) score = Math.max(score, 10);
        if ((m.category || '').toLowerCase().includes(q)) score = Math.max(score, 8);
        if (String(m.year || '').includes(q)) score = Math.max(score, 5);
        if ((m.notes || '').toLowerCase().includes(q)) score = Math.max(score, 3);
      }

      return { m, score };
    })
    .filter(({ score }) => score > 0);

  // Stable sort: items with equal scores keep their relative order from `r`
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ m }) => m);
}

function getFiltered() {
  return _postFilter(_getFilteredCore());
}

function _getFilteredCore() {
  const cdMap = collectionDateMap();
  let result;
  if (state.currentFilter === 'all')
    result = state.movies.filter(
      (m) =>
        !m.watchingSoon &&
        !m.rewatchingSoon &&
        !m.graveyard &&
        !isArchivedWatched(m) &&
        !isDetachedMovie(m)
    );
  else if (state.currentFilter === 'soon')
    result = state.movies.filter((m) => m.watchingSoon && !m.graveyard); // detached movies CAN appear in watching soon
  else if (state.currentFilter === 'watched')
    result = state.movies.filter((m) => m.watched && !m.graveyard && !isDetachedMovie(m));
  else if (state.currentFilter === 'rewatch') {
    result = state.movies.filter(
      (m) => m.watched && m.rewatch && !m.graveyard && !isDetachedMovie(m)
    );
    return sortWithCollections(result, cdMap);
  } else if (state.currentFilter === 'unwatched')
    result = state.movies.filter((m) => !m.watched && !m.graveyard && !isDetachedMovie(m));
  else if (state.currentFilter === 'graveyard') {
    result = state.movies.filter((m) => m.graveyard && !isDetachedMovie(m));
    return sortWithCollections(result, cdMap);
  } else if (state.currentFilter === 'vpn')
    result = state.movies.filter(
      (m) => !m.graveyard && !isDetachedMovie(m) && SERVICES.some((s) => m.streaming?.[s]?.vpn)
    );
  else if (state.currentFilter === 'cinema') {
    result = state.movies.filter(
      (m) =>
        !m.graveyard &&
        !isDetachedMovie(m) &&
        (m.streaming?.cinema?.direct || m.streaming?.cinema?.coming)
    );
    const unwatched = sortWithCollections(
      result.filter((m) => !m.watched),
      cdMap
    );
    const watched = sortWithCollections(
      result.filter((m) => m.watched),
      cdMap
    );
    return [...unwatched, ...watched];
  } else if (state.currentFilter === 'other') {
    // Include both explicit Other and implicit Other (no service set at all)
    result = state.movies.filter(
      (m) =>
        !m.graveyard &&
        !isDetachedMovie(m) &&
        (m.streaming?.other?.direct || m.streaming?.other?.vpn || hasNoStreaming(m))
    );
    const directUnwatched = sortWithCollections(
      result.filter((m) => !m.watched && m.streaming?.other?.direct),
      cdMap
    );
    const vpnUnwatched = sortWithCollections(
      result.filter((m) => !m.watched && !m.streaming?.other?.direct && m.streaming?.other?.vpn),
      cdMap
    );
    const implicitUnwatched = sortWithCollections(
      result.filter((m) => !m.watched && hasNoStreaming(m)),
      cdMap
    );
    const watched = sortWithCollections(
      result.filter((m) => m.watched),
      cdMap
    );
    return [...directUnwatched, ...vpnUnwatched, ...implicitUnwatched, ...watched];
  } else {
    result = state.movies.filter(
      (m) =>
        !m.graveyard &&
        !isDetachedMovie(m) &&
        (m.streaming?.[state.currentFilter]?.direct || m.streaming?.[state.currentFilter]?.vpn)
    );
    const directUnwatched = sortWithCollections(
      result.filter((m) => !m.watched && m.streaming?.[state.currentFilter]?.direct),
      cdMap
    );
    const vpnUnwatched = sortWithCollections(
      result.filter(
        (m) =>
          !m.watched &&
          !m.streaming?.[state.currentFilter]?.direct &&
          m.streaming?.[state.currentFilter]?.vpn
      ),
      cdMap
    );
    const watched = sortWithCollections(
      result.filter((m) => m.watched),
      cdMap
    );
    return [...directUnwatched, ...vpnUnwatched, ...watched];
  }
  return sortWithCollections(result, cdMap);
}

function buildSoonCard(m, i) {
  const src = m.poster ? m.poster.replace('/t/p/w500/', '/t/p/w185/') : '';
  const img = src
    ? `<img class="soon-card-poster" data-src="${esc(src)}" alt="${esc(m.title)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="soon-card-placeholder" style="display:none">&#127917;</div>`
    : `<div class="soon-card-placeholder">&#127917;</div>`;
  return `<div class="soon-card" data-id="${esc(m.id)}" onclick="openDetail(${jsAttr(m.id)})" style="animation-delay:${i * 0.04}s"><div class="soon-pip"></div>${img}<div class="soon-card-body"><div class="soon-card-title">${esc(m.title)}</div>${m.year ? `<div class="soon-card-year">${esc(m.year)}</div>` : ''}</div></div>`;
}

function buildRewatchSoonCard(m, i) {
  const src = m.poster ? m.poster.replace('/t/p/w500/', '/t/p/w185/') : '';
  const img = src
    ? `<img class="rewatch-soon-card-poster" data-src="${esc(src)}" alt="${esc(m.title)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="rewatch-soon-card-placeholder" style="display:none">&#127917;</div>`
    : `<div class="rewatch-soon-card-placeholder">&#127917;</div>`;
  return `<div class="rewatch-soon-card" data-id="${esc(m.id)}" onclick="openDetail(${jsAttr(m.id)})" style="animation-delay:${i * 0.04}s"><div class="rewatch-soon-pip"></div>${img}<div class="rewatch-soon-card-body"><div class="rewatch-soon-card-title">${esc(m.title)}</div>${m.year ? `<div class="rewatch-soon-card-year">${esc(m.year)}</div>` : ''}</div></div>`;
}

function buildCard(m, i) {
  const stale = getStaleClass(m);
  const graveyardCls = m.graveyard ? ' card-graveyard' : '';
  const cardSrc = m.poster ? m.poster.replace('/t/p/w500/', '/t/p/w342/') : '';
  const ph = cardSrc
    ? `<img class="card-poster" data-src="${esc(cardSrc)}" alt="${esc(m.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="card-poster-placeholder" style="display:none">&#127917;<span>No poster</span></div>`
    : `<div class="card-poster-placeholder">&#127917;<span>No poster</span></div>`;
  const ov = m.graveyard
    ? `<div class="card-graveyard-overlay"><span class="graveyard-stamp">💀 Never</span></div>`
    : m.watched && m.rewatch
      ? `<div class="card-rewatch-overlay"><span class="rewatch-stamp">Rewatch</span></div>`
      : m.watched
        ? `<div class="card-watched-overlay"><span class="watched-stamp">Watched</span></div>`
        : '';
  const exemptPip =
    state.currentFilter === 'categories' &&
    m.detachExempt &&
    state.categorySettings[m.category]?.detached
      ? `<div class="detach-exempt-pip">Visible</div>`
      : '';
  return `<div class="card${stale}${graveyardCls}" data-id="${esc(m.id)}" data-render-hash="${esc(_cardHash(m))}" onclick="openDetail(${jsAttr(m.id)})" style="animation-delay:${i * 0.03}s">${ph}${ov}${exemptPip}<div class="card-body"><div class="card-title">${esc(m.title)}</div><div class="card-meta" data-year="${esc(m.year || '')}" data-genre="${esc(m.genre || '')}" data-runtime="${esc(formatRuntime(m.runtime) || '')}">${[m.year, m.genre, formatRuntime(m.runtime)].filter(Boolean).map(esc).join(' &middot; ')}</div><div class="card-services">${buildBadges(m, true)}</div></div></div>`;
}

function trimCardMetas() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.card-meta[data-genre]').forEach((el) => {
      const genre = el.dataset.genre;
      if (!genre) return;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      const maxH = lh * 2 + 4;
      if (el.scrollHeight <= maxH) return;
      const parts = genre
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      if (parts.length <= 1) return;
      const year = el.dataset.year;
      const runtime = el.dataset.runtime;
      while (parts.length > 1 && el.scrollHeight > maxH) {
        parts.pop();
        el.textContent = [year, parts.join(', '), runtime].filter(Boolean).join(' · ');
      }
    });
  });
}

function getOtherShort(name) {
  if (!name) return 'OTH';
  const n = name.trim().toLowerCase();
  if (n === 'hbo max' || n === 'hbomax') return 'MAX';
  if (n === 'apple tv' || n === 'apple tv+') return 'ATV';
  if (n === 'youtube') return 'YT';
  return name.slice(0, 4).toUpperCase();
}

function buildBadges(m, c) {
  let o = '';
  const s = m.streaming || {};
  const sh = {
    netflix: 'NFLX',
    disney: 'D+',
    prime: 'PRIME',
    cinema: 'CINE',
    other: esc(getOtherShort(m.otherName)),
  };
  const fl = {
    netflix: 'Netflix',
    disney: 'Disney+',
    prime: 'Prime Video',
    cinema: 'In Cinemas',
    other: esc(m.otherName) || 'Other',
  };
  for (const k of SERVICES) {
    const l = c ? sh[k] : fl[k];
    if (s[k]?.direct) o += `<span class="service-badge ${k}">${l}</span>`;
    if (s[k]?.vpn)
      o += `<span class="service-badge vpn">${countryFlag(s[k]?.vpnCountry)} ${l}</span>`;
  }
  if (s.cinema?.coming) {
    const rd = m.releaseDate || null;
    o += `<span class="service-badge cinema-soon">&#127916; ${rd ? _formatCinemaDate(rd, true) : 'Coming Soon'}</span>`;
  }
  return o || `<span class="service-badge other">${c ? 'OTHER' : 'Other'}</span>`;
}

function _checkSoonLayout() {
  const wrapper = document.getElementById('soonWrapper');
  if (!wrapper) return;
  if (window.innerWidth <= 640) {
    wrapper.classList.remove('soon-combined');
    return;
  }
  const ss = document.getElementById('soonSection');
  const rss = document.getElementById('rewatchSoonSection');
  if (!ss.classList.contains('visible') || !rss.classList.contains('visible')) {
    wrapper.classList.remove('soon-combined');
    return;
  }
  // scrollWidth is unreliable when content doesn't overflow its container —
  // it just returns the container width. Calculate directly from card count instead.
  const CARD = 130,
    GAP = 16;
  const nSoon = document.getElementById('soonStrip').querySelectorAll('.soon-card').length;
  const nRewatch = document
    .getElementById('rewatchSoonStrip')
    .querySelectorAll('.rewatch-soon-card').length;
  const soonW = nSoon > 0 ? nSoon * CARD + (nSoon - 1) * GAP : 0;
  const rewatchW = nRewatch > 0 ? nRewatch * CARD + (nRewatch - 1) * GAP : 0;
  // outer padding (48*2=96) + soonW + gap (52px) + rewatchW
  const totalNeeded = 96 + soonW + 52 + rewatchW;
  wrapper.classList.toggle('soon-combined', totalNeeded <= document.documentElement.clientWidth);
}

// ── DOM reconciliation ────────────────────────────────────────────────────
// Fingerprint of everything that affects how a card/row looks.
// Including currentFilter because the exemptPip + statusTag depend on it.
function _cardHash(m) {
  return [
    m.id,
    m.title || '',
    m.year || '',
    m.poster || '',
    m.watched ? 1 : 0,
    m.rewatch ? 1 : 0,
    m.rewatchingSoon ? 1 : 0,
    m.watchingSoon ? 1 : 0,
    m.rating || '',
    m.genre || '',
    m.director || '',
    m.runtime || '',
    m.category || '',
    m.graveyard ? 1 : 0,
    m.collection || '',
    m.watchWith || '',
    JSON.stringify(m.streaming || {}),
    m.otherName || '',
    m.dateWatched || '',
    m.dateAdded || '',
    m.detachExempt ? 1 : 0,
    m._animateIn ? 1 : 0,
    state.currentFilter,
    m.releaseDate || '',
    m.rtRating || '',
  ].join('\0');
}

// djb2 hash — cheap fingerprint for long HTML strings
function _htmlHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

// innerHTML with hash guard — skips the write when content hasn't changed
function _setHTML(el, html) {
  const h = _htmlHash(html);
  if (state.htmlCache.get(el) === h) return;
  state.htmlCache.set(el, h);
  el.innerHTML = html;
}

// Keyed in-place reconciliation — only touches nodes that changed or moved.
// Falls back to _setHTML for content that mixes non-keyed nodes (group headers etc).
function _reconcile(container, newHTML) {
  const temp = document.createElement('div');
  temp.innerHTML = newHTML;
  const newNodes = Array.from(temp.children);
  if (!newNodes.length || newNodes.some((n) => !n.dataset.id)) {
    _setHTML(container, newHTML);
    return;
  }
  // Index existing keyed children; remove any non-keyed stragglers
  const existing = new Map();
  for (const ch of Array.from(container.children)) {
    if (ch.dataset.id) existing.set(ch.dataset.id, ch);
    else ch.remove();
  }
  // Walk new list in order, patching in-place
  let cursor = container.firstChild;
  for (const newNode of newNodes) {
    const id = newNode.dataset.id;
    const old = existing.get(id);
    if (old) {
      existing.delete(id);
      if (old.dataset.renderHash === newNode.dataset.renderHash) {
        // Unchanged — reposition if out of order, then advance cursor
        if (old !== cursor) container.insertBefore(old, cursor);
        cursor = old.nextSibling;
      } else {
        // Content changed — swap in the new node
        container.insertBefore(newNode, old);
        old.remove();
        cursor = newNode.nextSibling;
      }
    } else {
      // New node — insert at current position
      container.insertBefore(newNode, cursor);
      cursor = newNode.nextSibling;
    }
  }
  // Remove nodes no longer in the list
  for (const stale of existing.values()) stale.remove();
}

// Reconcile into a .list-rows wrapper inside g, creating it if needed
function _reconcileListRows(g, rowsHTML) {
  let lr = g.querySelector(':scope>.list-rows');
  if (!lr) {
    g.innerHTML = '';
    lr = document.createElement('div');
    lr.className = 'list-rows';
    g.appendChild(lr);
  }
  _reconcile(lr, rowsHTML);
}

function _allMoviesPool() {
  return [...getNormalList(), ...getChristmasList()];
}

function isDetachedMovie(m) {
  if (!m.category) return false;
  if (m.detachExempt) return false;
  return !!state.categorySettings[m.category]?.detached;
}

function includeDetachedInSearch() {
  state.searchIncludesDetached = true;
  render();
}

function _searchEmptyHTML(fallback, icon) {
  if (!state.searchIncludesDetached) {
    const detachedHits = _postFilter(
      state.movies.filter((m) => !m.graveyard && isDetachedMovie(m))
    );
    if (detachedHits.length) {
      return `<div class="empty-state"><span class="empty-icon">${icon}</span><p>No results in your main watchlist.</p><button class="btn btn-ghost btn-sm detached-search-button" onclick="includeDetachedInSearch()">Search detached categories too</button></div>`;
    }
  }
  return fallback;
}
