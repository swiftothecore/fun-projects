// Film forms/detail views, suggestions, status actions, toasts, and Surprise Me.
// Classic scripts intentionally expose handler functions to inline HTML events.

function syncCollapsedTitle() {
  const title = document.getElementById('fTitle').value.trim();
  const year = document.getElementById('fYear').value.trim();
  const genre = document.getElementById('fGenre').value.trim();
  document.getElementById('collapsedTitleText').textContent = title || 'Untitled';
  document.getElementById('collapsedTitleMeta').textContent = [year, genre]
    .filter(Boolean)
    .join(' · ');
}

function collapseMovieDetails() {
  syncCollapsedTitle();
  document.getElementById('movieDetailsCollapsible').classList.add('collapsed');
  document.getElementById('collapsedTitleBanner').style.display = 'flex';
  document.getElementById('showMovieDetailsBtn').style.display = 'none';
  document.getElementById('collectionFields').style.marginTop = '0';
}

function expandMovieDetails() {
  document.getElementById('movieDetailsCollapsible').classList.remove('collapsed');
  document.getElementById('collapsedTitleBanner').style.display = 'none';
  document.getElementById('showMovieDetailsBtn').style.display = 'none';
  document.getElementById('collectionFields').style.marginTop = '14px';
}

function toggleMovieDetails() {
  if (document.getElementById('movieDetailsCollapsible').classList.contains('collapsed'))
    expandMovieDetails();
  else collapseMovieDetails();
}

function updateModalJustWatch() {
  const t = document.getElementById('fTitle').value.trim(),
    el = document.getElementById('modalJustWatch');
  if (t) {
    el.href = `https://www.justwatch.com/au/search?q=${encodeURIComponent(t)}`;
    el.style.opacity = '1';
    el.style.pointerEvents = '';
  } else {
    el.href = '#';
    el.style.opacity = '0.35';
    el.style.pointerEvents = 'none';
  }
}

function updateModalLetterboxd() {
  const t = document.getElementById('fTitle').value.trim(),
    el = document.getElementById('modalLetterboxd');
  if (!el) return;
  if (t) {
    const m = state.editingId ? state.movies.find((x) => x.id === state.editingId) : null;
    const url =
      m?.tmdbId || state._pendingTmdbId
        ? `https://letterboxd.com/tmdb/${m?.tmdbId || state._pendingTmdbId}/`
        : `https://letterboxd.com/search/films/${encodeURIComponent(t)}/`;
    el.href = url;
    el.style.opacity = '1';
    el.style.pointerEvents = '';
  } else {
    el.href = '#';
    el.style.opacity = '0.35';
    el.style.pointerEvents = 'none';
  }
}

function updatePosterPreview(url) {
  const t = document.getElementById('posterThumb');
  if (url)
    t.innerHTML = `<img class="poster-preview-image" src="${esc(url)}" onerror="this.parentElement.innerHTML='&#127917;'">`;
  else t.innerHTML = '&#127917;';
}

function editDateWatched(id) {
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  const el = document.getElementById('detailDateWatched');
  if (!el) return;
  const cur = m.dateWatched ? localDateStr(new Date(m.dateWatched)) : localDateStr(new Date());
  const today = localDateStr(new Date());
  el.outerHTML = `<div class="date-edit-row" id="detailDateInput">
    <input class="date-edit-input" type="date" id="dateWatchedPicker" value="${cur}" max="${today}">
    <button class="date-save-button" onclick="saveDateWatched(${jsAttr(id)})">Save</button>
    <button class="date-cancel-button" onclick="openDetail(${jsAttr(id)})">Cancel</button>
  </div>`;
  document.getElementById('dateWatchedPicker').focus();
}

function saveDateWatched(id) {
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  const val = document.getElementById('dateWatchedPicker')?.value;
  if (val) {
    m.dateWatched = new Date(val + 'T12:00:00').toISOString();
    save();
    render();
  }
  openDetail(id);
}

function editDateAdded(id) {
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  const el = document.getElementById('detailDateAdded');
  if (!el) return;
  const cur = m.dateAdded ? localDateStr(new Date(m.dateAdded)) : localDateStr(new Date());
  const today = localDateStr(new Date());
  el.outerHTML = `<div class="date-edit-row" id="detailDateInput">
    <input class="date-edit-input" type="date" id="dateAddedPicker" value="${cur}" max="${today}">
    <button class="date-save-button" onclick="saveDateAdded(${jsAttr(id)})">Save</button>
    <button class="date-cancel-button" onclick="openDetail(${jsAttr(id)})">Cancel</button>
  </div>`;
  document.getElementById('dateAddedPicker').focus();
}

function saveDateAdded(id) {
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  const val = document.getElementById('dateAddedPicker')?.value;
  if (val) {
    m.dateAdded = new Date(val + 'T12:00:00').toISOString();
    save();
    render();
  }
  openDetail(id);
}

function openDetail(id) {
  if (state.selectionMode) {
    toggleSelect(id);
    return;
  }
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  const soonAllowed = !m.graveyard && !m.watched;
  const posterInner = m.poster
    ? `<img class="detail-poster" src="${esc(m.poster)}" alt="${esc(m.title)}" onerror="this.outerHTML='<div class=\\'detail-poster-placeholder\\'>&#127917;</div>'">`
    : `<div class="detail-poster-placeholder">&#127917;</div>`;
  const ph = m.graveyard
    ? posterInner
    : `<div class="detail-poster-wrap">${posterInner}${
        m.watched && m.rewatch
          ? `<button class="detail-soon-btn detail-rewatch-soon-btn${m.rewatchingSoon ? ' active' : ''}" onclick="toggleRewatchingSoon(${jsAttr(m.id)})">${m.rewatchingSoon ? 'Rewatching Soon' : 'Rewatch Soon'}</button>`
          : m.watched
            ? `<button class="detail-watched-btn" onclick="toggleWatched(${jsAttr(m.id)})">Watched</button>`
            : `<button class="detail-soon-btn${m.watchingSoon ? ' active' : ''}" onclick="toggleWatchingSoon(${jsAttr(m.id)})">${m.watchingSoon ? 'Watching Soon' : 'Watch Soon'}</button>`
      }</div>`;
  const svc = buildDetailSvc(m);
  const jw = `https://www.justwatch.com/au/search?q=${encodeURIComponent(m.title)}`;
  const lb = m.tmdbId
    ? `https://letterboxd.com/tmdb/${encodeURIComponent(m.tmdbId)}/`
    : `https://letterboxd.com/search/films/${encodeURIComponent(m.title)}/`;
  const tmdbUrl = m.tmdbId
    ? `https://www.themoviedb.org/movie/${encodeURIComponent(m.tmdbId)}`
    : null;
  const imdbUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(m.title + (m.year ? ' ' + m.year : ''))}`;
  document.getElementById('detailContent').innerHTML = `
    <div class="detail-poster-row">${ph}<div class="detail-info">
      <div class="detail-title">${esc(m.title)}</div>
      <div class="detail-meta">${[m.year, m.genre, m.director, formatRuntime(m.runtime)].filter(Boolean).map(esc).join(' &middot; ')}${m.rating || m.rtRating ? '<br>' + [m.rating ? '&#9733; ' + esc(m.rating) : '', rtBadge(m)].filter(Boolean).join(' &nbsp;&middot;&nbsp; ') : ''}</div>
      ${m.notes ? `<div id="detailNotesWrap" class="detail-notes-wrap clamped"><div id="detailNotes" class="detail-notes">${esc(m.notes)}</div><button class="detail-notes-expander" onclick="toggleDetailNotes()">...</button></div>` : ''}
      ${(() => {
        const b =
          (m.graveyard
            ? `<span class="service-badge graveyard-badge">&#128128; Graveyard</span>`
            : '') + (m.rewatch ? `<span class="service-badge rewatch-badge">Rewatch</span>` : '');
        return b ? `<div class="detail-status-badges">${b}</div>` : '';
      })()}
      <div class="spacing-top-sm">
        ${
          m.watched
            ? `<span class="detail-date-editable" id="detailDateWatched" onclick="editDateWatched(${jsAttr(m.id)})" title="Click to edit" onmouseover="this.style.color='var(--text-dim)'" onmouseout="this.style.color='var(--text-muted)'">${formatDateWatched(m.dateWatched)}</span>`
            : `<span class="detail-date-editable" id="detailDateAdded" onclick="editDateAdded(${jsAttr(m.id)})" title="Click to edit" onmouseover="this.style.color='var(--text-dim)'" onmouseout="this.style.color='var(--text-muted)'">${formatDateAdded(m.dateAdded)}</span>`
        }
      </div>
      ${m.watchWith ? `<div class="detail-watch-with"><span class="detail-watch-with-chip" onclick="filterByWatchWith(${esc(JSON.stringify(m.watchWith))})" title="Show all films tagged ${esc(m.watchWith)}">👥 ${esc(m.watchWith)}</span></div>` : ''}
    </div></div>
    <div class="detail-services-section"><div class="detail-services-title">Where to Watch</div><div class="detail-services-grid">${svc}</div></div>
    ${state.categorySettings[m.category]?.detached ? `<div class="detail-detach-option"><div class="flex-fill"><div class="detail-detach-label">Show in main list</div><div class="detail-detach-desc">Exception to detached category</div></div><label class="toggle-row toggle-fixed"><input type="checkbox" ${m.detachExempt ? 'checked' : ''} onchange="toggleDetachExempt(${jsAttr(m.id)})"><span class="track"></span></label></div>` : ''}
    <div class="detail-actions">
      <div class="detail-external-actions">
        ${m.tmdbId ? `<button class="btn-trailer" onclick="openTrailer(${jsAttr(m.tmdbId)},this)" title="Watch trailer on YouTube"><span class="trailer-dot"></span>Trailer</button>` : ''}
        <a class="btn-justwatch no-underline" href="${esc(jw)}" target="_blank" rel="noopener"><span class="jw-dot"></span>JW</a>
        <a class="btn-letterboxd no-underline" href="${esc(lb)}" target="_blank" rel="noopener"><span class="lb-dot"></span>LB</a>
        ${tmdbUrl ? `<a class="btn-tmdb no-underline" href="${esc(tmdbUrl)}" target="_blank" rel="noopener"><span class="tmdb-dot"></span>TMDB</a>` : ''}
        <a class="btn-imdb no-underline" href="${esc(imdbUrl)}" target="_blank" rel="noopener"><span class="imdb-dot"></span>IMDb</a>
        <button class="btn btn-ghost btn-sm" onclick="toggleGraveyard(${jsAttr(m.id)})" title="${m.graveyard ? 'Remove from graveyard' : 'Move to graveyard — never watching this'}" style="${m.graveyard ? 'color:#c084fc;border-color:rgba(124,58,237,0.4);' : 'color:var(--text-muted);'}">${m.graveyard ? '💀 Unbury' : '💀'}</button>
        ${m.watched && !m.graveyard ? `<button class="btn btn-ghost btn-sm" onclick="toggleRewatch(${jsAttr(m.id)})" title="${m.rewatch ? 'Remove rewatch flag' : 'Flag for rewatch'}" style="${m.rewatch ? 'color:#2dd4bf;border-color:rgba(45,212,191,0.4);' : 'color:var(--text-muted);'}">Rewatch</button>` : ''}
      </div>
      <div class="detail-primary-actions">
        <button class="btn btn-ghost" onclick="openEditFromDetail(${jsAttr(m.id)})">Edit</button>
        ${m.graveyard ? '' : `<button class="btn btn-primary" onclick="toggleWatched(${jsAttr(m.id)})">${m.watched ? 'Mark Unwatched' : 'Mark Watched'}</button>`}
      </div>
    </div>`;
  const _detailWasOpen = document.getElementById('detailModal').classList.contains('open');
  document.getElementById('detailModal').classList.add('open');
  state.currentDetailId = id;
  if (!_detailWasOpen) lockScroll();
  const dn = document.getElementById('detailNotes');
  const dw = document.getElementById('detailNotesWrap');
  if (dn && dw && dn.scrollHeight <= dn.clientHeight) {
    dw.classList.remove('clamped');
  }
}

function toggleDetailNotes() {
  document.getElementById('detailNotesWrap')?.classList.remove('clamped');
}

function buildDetailSvc(m) {
  const s = m.streaming || {};
  const lb = {
    netflix: 'Netflix',
    disney: 'Disney+',
    prime: 'Prime Video',
    cinema: 'In Cinemas',
    other: esc(m.otherName) || 'Other',
  };
  let o = '';
  for (const k of SERVICES) {
    if (s[k]?.direct) o += `<span class="detail-service-pill ${k}">${lb[k]}</span>`;
    if (s[k]?.vpn) {
      const c = s[k]?.vpnCountry ? ` &middot; ${esc(s[k].vpnCountry)}` : '';
      o += `<span class="detail-service-pill vpn">${countryFlag(s[k]?.vpnCountry)} ${lb[k]} (VPN${c})</span>`;
    }
  }
  if (s.cinema?.coming) {
    const rd = m.releaseDate || null;
    o += `<span class="detail-service-pill cinema-soon">&#127916; Coming to Cinemas${rd ? ` · ${_formatCinemaDate(rd, false)}` : ''}</span>`;
  }
  return o || `<span class="detail-service-pill other">Other</span>`;
}

function closeDetail() {
  if (!document.getElementById('detailModal').classList.contains('open')) return;
  document.getElementById('detailModal').classList.remove('open');
  state.currentDetailId = null;
  unlockScroll();
}

function handleDetailOverlay(e) {
  if (e.target === document.getElementById('detailModal')) closeDetail();
}

function toggleWatched(id) {
  const m = state.movies.find((x) => x.id === id);
  if (m) {
    m.watched = !m.watched;
    if (m.watched) {
      m.watchingSoon = false;
      m.dateWatched = new Date().toISOString();
      m.rewatch = false;
      m.rewatchingSoon = false;
    } else {
      m.dateWatched = undefined;
      m.rewatch = false;
      m.rewatchingSoon = false;
    }
    save();
    closeDetail();
    render();
  }
}

function openEditFromDetail(id) {
  closeDetail();
  setTimeout(() => openEditModal(id), 100);
}

function toggleGraveyard(id) {
  const m = state.movies.find((x) => x.id === id);
  if (m) {
    m.graveyard = !m.graveyard;
    // Moving to graveyard clears watched and watchingSoon flags
    if (m.graveyard) {
      m.watched = false;
      m.watchingSoon = false;
      m.rewatch = false;
      m.rewatchingSoon = false;
      m.dateWatched = undefined;
    }
    save();
    closeDetail();
    render();
  }
}

function toggleRewatch(id) {
  const m = state.movies.find((x) => x.id === id);
  if (m && m.watched) {
    m.rewatch = !m.rewatch;
    if (!m.rewatch) m.rewatchingSoon = false;
    save();
    render();
    openDetail(id);
  }
}

function toggleWatchingSoon(id) {
  const m = state.movies.find((x) => x.id === id);
  if (m) {
    m.watchingSoon = !m.watchingSoon;
    if (m.watchingSoon && m.streaming?.cinema?.coming) {
      m.streaming.cinema.coming = false;
    }
    save();
    render();
    openDetail(id);
  }
}

function toggleRewatchingSoon(id) {
  const m = state.movies.find((x) => x.id === id);
  if (m && m.watched && m.rewatch) {
    m.rewatchingSoon = !m.rewatchingSoon;
    save();
    render();
    openDetail(id);
  }
}

function lockScroll() {
  if (state._scrollLockCount === 0) {
    state._scrollLockY = window.scrollY;
    document.body.style.setProperty('--scroll-y', `-${state._scrollLockY}px`);
    document.body.classList.add('modal-open');
  }
  state._scrollLockCount++;
}

function unlockScroll() {
  state._scrollLockCount = Math.max(0, state._scrollLockCount - 1);
  if (state._scrollLockCount === 0) {
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('--scroll-y');
    window.scrollTo({ top: state._scrollLockY, behavior: 'instant' });
  }
}

function openAddModal() {
  state.editingId = null;
  document.getElementById('modalTitle').textContent = state.christmasMode
    ? '🎄 Add Christmas Film'
    : 'Add Film';
  clearForm();
  document.getElementById('deleteRow').style.display = 'none';
  document.getElementById('addModal').classList.add('open');
  lockScroll();
  updateModalJustWatch();
  updateModalLetterboxd();
  populateCollectionSuggestions();
  populateCategorySuggestions();
  populateWatchWithSuggestions();
  expandMovieDetails();
  if (state.tmdbKey) setTimeout(() => document.getElementById('searchInput').focus(), 80);
  else document.getElementById('fTitle').focus();
}

function populateCollectionSuggestions() {
  state._collectionNames = [
    ...new Set(state.movies.map((m) => m.collection).filter(Boolean)),
  ].sort();
}

function populateCategorySuggestions() {
  state._categoryNames = [...new Set(state.movies.map((m) => m.category).filter(Boolean))].sort();
}

function filterCollectionSuggestions() {
  const dd = document.getElementById('collectionDropdown');
  const q = document.getElementById('fCollection').value.trim().toLowerCase();
  const matches = q
    ? state._collectionNames.filter((n) => n.toLowerCase().includes(q))
    : state._collectionNames;
  state.collectionHighlightIndex = -1;
  if (!matches.length) {
    dd.style.display = 'none';
    return;
  }
  dd.innerHTML = matches
    .map(
      (n) =>
        `<div class="col-suggestion" data-name="${esc(n)}" onmousedown="pickCollection(${jsAttr(n)})"><span class="col-icon">&#127916;</span>${esc(n)}</div>`
    )
    .join('');
  dd.style.display = '';
}

function hideCollectionSuggestions() {
  state.collectionHighlightIndex = -1;
  document.getElementById('collectionDropdown').style.display = 'none';
}

function pickCollection(name) {
  document.getElementById('fCollection').value = name;
  hideCollectionSuggestions();
}

function onCollectionKeyDown(e) {
  const dd = document.getElementById('collectionDropdown');
  if (dd.style.display === 'none') return;
  const items = dd.querySelectorAll('.col-suggestion');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.collectionHighlightIndex = Math.min(state.collectionHighlightIndex + 1, items.length - 1);
    updateCollectionHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.collectionHighlightIndex = Math.max(state.collectionHighlightIndex - 1, -1);
    updateCollectionHighlight(items);
  } else if (e.key === 'Enter') {
    const target =
      state.collectionHighlightIndex >= 0 ? items[state.collectionHighlightIndex] : items[0];
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      pickCollection(target.dataset.name);
    }
  }
}

function updateCollectionHighlight(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === state.collectionHighlightIndex));
  if (state.collectionHighlightIndex >= 0)
    items[state.collectionHighlightIndex].scrollIntoView({ block: 'nearest' });
}

function filterCategorySuggestions() {
  const dd = document.getElementById('categoryDropdown');
  const q = document.getElementById('fCategory').value.trim().toLowerCase();
  const matches = q
    ? state._categoryNames.filter((n) => n.toLowerCase().includes(q))
    : state._categoryNames;
  state.categoryHighlightIndex = -1;
  if (!matches.length) {
    dd.style.display = 'none';
    return;
  }
  dd.innerHTML = matches
    .map(
      (n) =>
        `<div class="cat-suggestion" data-name="${esc(n)}" onmousedown="pickCategory(${jsAttr(n)})"><span class="cat-icon">&#128196;</span>${esc(n)}</div>`
    )
    .join('');
  dd.style.display = '';
}

function hideCategorySuggestions() {
  state.categoryHighlightIndex = -1;
  document.getElementById('categoryDropdown').style.display = 'none';
}

function pickCategory(name) {
  document.getElementById('fCategory').value = name;
  hideCategorySuggestions();
}

function onCategoryKeyDown(e) {
  const dd = document.getElementById('categoryDropdown');
  if (dd.style.display === 'none') return;
  const items = dd.querySelectorAll('.cat-suggestion');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.categoryHighlightIndex = Math.min(state.categoryHighlightIndex + 1, items.length - 1);
    updateCategoryHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.categoryHighlightIndex = Math.max(state.categoryHighlightIndex - 1, -1);
    updateCategoryHighlight(items);
  } else if (e.key === 'Enter') {
    const target =
      state.categoryHighlightIndex >= 0 ? items[state.categoryHighlightIndex] : items[0];
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      pickCategory(target.dataset.name);
    }
  }
}

function updateCategoryHighlight(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === state.categoryHighlightIndex));
  if (state.categoryHighlightIndex >= 0)
    items[state.categoryHighlightIndex].scrollIntoView({ block: 'nearest' });
}

// ── Watching-With (companion) suggestions ─────────────────────────────────
// Mirrors the category suggestion pattern: cached list, filtered dropdown,
// arrow-key + Enter navigation.
function populateWatchWithSuggestions() {
  state._watchWithNames = [...new Set(state.movies.map((m) => m.watchWith).filter(Boolean))].sort();
}

function filterWatchWithSuggestions() {
  const dd = document.getElementById('watchWithDropdown');
  const q = document.getElementById('fWatchWith').value.trim().toLowerCase();
  const matches = q
    ? state._watchWithNames.filter((n) => n.toLowerCase().includes(q))
    : state._watchWithNames;
  state.watchWithHighlightIndex = -1;
  if (!matches.length) {
    dd.style.display = 'none';
    return;
  }
  dd.innerHTML = matches
    .map(
      (n) =>
        `<div class="cat-suggestion" data-name="${esc(n)}" onmousedown="pickWatchWith(${jsAttr(n)})"><span class="cat-icon">👥</span>${esc(n)}</div>`
    )
    .join('');
  dd.style.display = '';
}

function hideWatchWithSuggestions() {
  state.watchWithHighlightIndex = -1;
  document.getElementById('watchWithDropdown').style.display = 'none';
}

function pickWatchWith(name) {
  document.getElementById('fWatchWith').value = name;
  hideWatchWithSuggestions();
}

function onWatchWithKeyDown(e) {
  const dd = document.getElementById('watchWithDropdown');
  if (dd.style.display === 'none') return;
  const items = dd.querySelectorAll('.cat-suggestion');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.watchWithHighlightIndex = Math.min(state.watchWithHighlightIndex + 1, items.length - 1);
    updateWatchWithHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.watchWithHighlightIndex = Math.max(state.watchWithHighlightIndex - 1, -1);
    updateWatchWithHighlight(items);
  } else if (e.key === 'Enter') {
    const target =
      state.watchWithHighlightIndex >= 0 ? items[state.watchWithHighlightIndex] : items[0];
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      pickWatchWith(target.dataset.name);
    }
  }
}

function updateWatchWithHighlight(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === state.watchWithHighlightIndex));
  if (state.watchWithHighlightIndex >= 0)
    items[state.watchWithHighlightIndex].scrollIntoView({ block: 'nearest' });
}

// ── Watching-With filter (set from detail modal chip) ─────────────────────
function filterByWatchWith(name) {
  if (!name) return;
  state.currentWatchWith = name;
  closeDetail();
  // Scroll the grid into view so the filtered result is immediately visible
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}

function clearWatchWithFilter() {
  state.currentWatchWith = null;
  render();
}

function openEditModal(id) {
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  state.editingId = id;
  document.getElementById('modalTitle').textContent = state.christmasMode
    ? '🎄 Edit Christmas Film'
    : 'Edit Film';
  document.getElementById('deleteRow').style.display = 'flex';
  populateForm(m);
  document.getElementById('addModal').classList.add('open');
  lockScroll();
  updateModalJustWatch();
  updateModalLetterboxd();
  populateCollectionSuggestions();
  populateCategorySuggestions();
  populateWatchWithSuggestions();
  expandMovieDetails();
}

function closeAddModal() {
  // Escape calls every close fn — only unlock scroll for a modal that was actually open
  if (!document.getElementById('addModal').classList.contains('open')) return;
  document.getElementById('addModal').classList.remove('open');
  document.getElementById('searchResults').classList.remove('open');
  document.getElementById('searchHint').classList.remove('visible');
  state.editingId = null;
  state._pendingTmdbId = null;
  state._pendingReleaseDate = null;
  unlockScroll();
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('addModal')) closeAddModal();
}

function clearForm() {
  [
    'fTitle',
    'fYear',
    'fReleaseDate',
    'fGenre',
    'fDirector',
    'fRating',
    'fRuntime',
    'fPoster',
    'fNotes',
    'fOtherName',
    'fCollection',
    'fCategory',
    'fWatchWith',
    'searchInput',
    'fVpnCountry-netflix',
    'fVpnCountry-disney',
    'fVpnCountry-prime',
    'fVpnCountry-other',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('fWatched').checked = false;
  document.getElementById('fWatchingSoon').checked = false;
  document.querySelectorAll('.toggle-chip').forEach((c) => c.classList.remove('active'));
  document.getElementById('fOtherName').classList.remove('visible');
  document.querySelectorAll('.vpn-country-input').forEach((el) => el.classList.remove('visible'));
  document.getElementById('posterThumb').innerHTML = '&#127917;';
  document.getElementById('searchResults').classList.remove('open');
  document.getElementById('searchHint').classList.remove('visible');
  state._pendingTmdbId = null;
  state._pendingReleaseDate = null;
}

function populateForm(m) {
  document.getElementById('fTitle').value = m.title || '';
  document.getElementById('fYear').value = m.year || '';
  document.getElementById('fReleaseDate').value = m.releaseDate || '';
  document.getElementById('fGenre').value = m.genre || '';
  document.getElementById('fDirector').value = m.director || '';
  document.getElementById('fRating').value = m.rating || '';
  document.getElementById('fRuntime').value = m.runtime > 0 ? m.runtime : '';
  document.getElementById('fPoster').value = m.poster || '';
  document.getElementById('fNotes').value = m.notes || '';
  document.getElementById('fOtherName').value = m.otherName || '';
  document.getElementById('fCollection').value = m.collection || '';
  document.getElementById('fCategory').value = m.category || '';
  document.getElementById('fWatchWith').value = m.watchWith || '';
  document.getElementById('fWatched').checked = !!m.watched;
  document.getElementById('fWatchingSoon').checked = !!m.watchingSoon;
  updatePosterPreview(m.poster || '');
  document.querySelectorAll('.toggle-chip').forEach((c) => c.classList.remove('active'));
  const s = m.streaming || {};
  for (const k of SERVICES) {
    if (s[k]?.direct)
      document
        .querySelector(`.toggle-chip[data-service="${k}"][data-type="direct"]`)
        ?.classList.add('active');
    if (s[k]?.vpn)
      document
        .querySelector(`.toggle-chip[data-service="${k}"][data-type="vpn"]`)
        ?.classList.add('active');
    const ci = document.getElementById(`fVpnCountry-${k}`);
    if (ci) {
      ci.value = s[k]?.vpnCountry || '';
      ci.classList.toggle('visible', !!s[k]?.vpn);
    }
  }
  document
    .getElementById('fOtherName')
    .classList.toggle('visible', !!(s.other?.direct || s.other?.vpn));
  // Restore cinema coming soon chip
  const comingChip = document.querySelector(
    '.toggle-chip[data-service="cinema"][data-type="coming"]'
  );
  if (comingChip) comingChip.classList.toggle('active', !!s.cinema?.coming);
}

function toggleChip(btn) {
  btn.classList.toggle('active');
  // Cinema direct and coming soon are mutually exclusive
  if (btn.dataset.service === 'cinema' && btn.classList.contains('active')) {
    const other = btn.dataset.type === 'direct' ? 'coming' : 'direct';
    document
      .querySelector(`.toggle-chip[data-service="cinema"][data-type="${other}"]`)
      ?.classList.remove('active');
  }
  document
    .getElementById('fOtherName')
    .classList.toggle(
      'visible',
      !!document.querySelector('.toggle-chip[data-service="other"].active')
    );
  if (btn.dataset.type === 'vpn') {
    const ci = document.getElementById(`fVpnCountry-${btn.dataset.service}`);
    if (ci) ci.classList.toggle('visible', btn.classList.contains('active'));
  }
}

function saveMovie() {
  const title = document.getElementById('fTitle').value.trim();
  if (!title) {
    document.getElementById('fTitle').style.borderColor = 'var(--danger)';
    document.getElementById('fTitle').focus();
    setTimeout(() => (document.getElementById('fTitle').style.borderColor = ''), 1500);
    return;
  }
  const streaming = {};
  for (const k of SERVICES) {
    const d = document
      .querySelector(`.toggle-chip[data-service="${k}"][data-type="direct"]`)
      ?.classList.contains('active');
    const v = document
      .querySelector(`.toggle-chip[data-service="${k}"][data-type="vpn"]`)
      ?.classList.contains('active');
    const vc = document.getElementById(`fVpnCountry-${k}`)?.value.trim() || '';
    if (d || v) streaming[k] = { direct: !!d, vpn: !!v, vpnCountry: v ? vc : '' };
  }
  // Handle cinema "coming soon" as a separate toggle
  const existing = state.editingId ? state.movies.find((m) => m.id === state.editingId) : null;
  const comingSoon = document
    .querySelector('.toggle-chip[data-service="cinema"][data-type="coming"]')
    ?.classList.contains('active');
  if (comingSoon) {
    if (!streaming.cinema) streaming.cinema = { direct: false, vpn: false, vpnCountry: '' };
    streaming.cinema.coming = true;
  }
  const watched = document.getElementById('fWatched').checked;
  const movie = {
    id: state.editingId || crypto.randomUUID(),
    title,
    year: document.getElementById('fYear').value.trim(),
    releaseDate: document.getElementById('fReleaseDate').value.trim() || existing?.releaseDate,
    genre: document.getElementById('fGenre').value.trim(),
    director: document.getElementById('fDirector').value.trim(),
    rating: document.getElementById('fRating').value.trim(),
    runtime: parseInt(document.getElementById('fRuntime').value) || undefined,
    poster: document.getElementById('fPoster').value.trim(),
    notes: document.getElementById('fNotes').value.trim(),
    otherName: document.getElementById('fOtherName').value.trim(),
    collection: document.getElementById('fCollection').value.trim(),
    category: document.getElementById('fCategory').value.trim(),
    watchWith: document.getElementById('fWatchWith').value.trim(),
    tmdbId: state._pendingTmdbId || existing?.tmdbId || null,
    ...(existing &&
    (!state._pendingTmdbId || state._pendingTmdbId === existing.tmdbId) &&
    existing.title === title &&
    (existing.year || '') === document.getElementById('fYear').value.trim()
      ? { rtRating: existing.rtRating, rtCheckedAt: existing.rtCheckedAt, imdbId: existing.imdbId }
      : {}),
    detachExempt: existing?.detachExempt || false,
    graveyard: existing?.graveyard || false,
    watched,
    rewatch: watched ? existing?.rewatch || false : false,
    // If marked watched, strip watchingSoon
    watchingSoon: watched ? false : document.getElementById('fWatchingSoon').checked,
    rewatchingSoon: watched ? existing?.rewatchingSoon || false : false,
    streaming,
    dateAdded: existing?.dateAdded || new Date().toISOString(),
    dateWatched: watched
      ? existing?.dateWatched || (existing?.watched ? undefined : new Date().toISOString())
      : undefined,
  };
  if (state.editingId) {
    const i = state.movies.findIndex((m) => m.id === state.editingId);
    if (i !== -1) state.movies[i] = movie;
  } else state.movies.push(movie);
  save();
  closeAddModal();
  render();
  scheduleBackfills(500, [backfillReleaseDates, backfillRtRatings]);
  // Suppress the fadeIn re-animation on every card/row that already existed —
  // only the newly added/edited entry should animate into view.
  const savedId = movie.id;
  document
    .querySelectorAll(
      `.card:not([data-id="${CSS.escape(savedId)}"]),.list-row:not([data-id="${CSS.escape(savedId)}"]),.soon-card:not([data-id="${CSS.escape(savedId)}"])`
    )
    .forEach((el) => {
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
}

function deleteCurrentMovie() {
  if (!state.editingId) return;
  const m = state.movies.find((x) => x.id === state.editingId);
  if (!m) return;
  state.undoStack.push(JSON.parse(JSON.stringify(state.movies)));
  state.redoStack = [];
  state.movies = state.movies.filter((x) => x.id !== state.editingId);
  save();
  closeAddModal();
  render();
  showDeleteToast(m.title);
}

function showDeleteToast(title) {
  const DURATION = 6000;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-msg"><strong>${esc(title)}</strong> removed.</span><button class="toast-undo" onclick="undoDelete(this.closest('.toast'))">Undo</button><div class="toast-progress" style="animation:toastProgress ${DURATION}ms linear forwards"></div>`;
  document.getElementById('toastContainer').appendChild(t);
  t._timer = setTimeout(() => dismissToast(t), DURATION);
}

function dismissToast(t) {
  clearTimeout(t._timer);
  t.classList.add('out');
  setTimeout(() => t.remove(), 220);
}

function undoDelete(toast) {
  if (!state.undoStack.length) return;
  state.redoStack.push(JSON.parse(JSON.stringify(state.movies)));
  state.movies = state.undoStack.pop();
  save();
  render();
  dismissToast(toast);
  showInfoToast('Deletion undone.', 3000);
}

function redoDelete() {
  if (!state.redoStack.length) return;
  state.undoStack.push(JSON.parse(JSON.stringify(state.movies)));
  state.movies = state.redoStack.pop();
  save();
  render();
  showInfoToast('Deletion redone.', 3000);
}

function showInfoToast(msg, dur = 3000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-msg">${esc(msg)}</span><div class="toast-progress" style="animation:toastProgress ${dur}ms linear forwards"></div>`;
  document.getElementById('toastContainer').appendChild(t);
  t._timer = setTimeout(() => dismissToast(t), dur);
}

function toggleCategoryDetached() {
  if (!state.currentCategory) return;
  if (!state.categorySettings[state.currentCategory])
    state.categorySettings[state.currentCategory] = {};
  state.categorySettings[state.currentCategory].detached =
    !state.categorySettings[state.currentCategory].detached;
  saveCategorySettings();
  render();
}

function openAddModalWithCategory(cat) {
  openAddModal();
  document.getElementById('fCategory').value = cat;
}

function dismissCategoryOptions() {
  state.categoryOptionsDismissed = true;
  writeStorage('category_options_dismissed', '1');
  document.getElementById('categoryOptions').classList.remove('visible');
  document.getElementById('categoryOptions').innerHTML = '';
}

function openPillMenu(e, btn, name) {
  e.stopPropagation();
  e.preventDefault();
  const isDetached = !!state.categorySettings[name]?.detached;
  const pop = document.getElementById('categoryPillPopover');
  pop.innerHTML = `<div class="popover-label">Category options</div>
    <label class="toggle-row category-popover-toggle">
      <input type="checkbox" onchange="toggleCategoryDetachedByName(${jsAttr(name)})" ${isDetached ? 'checked' : ''}>
      <span class="track"></span>
      <span class="toggle-label category-popover-label">Detached</span>
    </label>`;
  pop.style.display = 'block';
  // Position below the button, clamped to viewport
  const rect = btn.getBoundingClientRect();
  const pw = Math.max(pop.offsetWidth, 196);
  let left = rect.left + window.scrollX,
    top = rect.bottom + window.scrollY + 6;
  if (left + pw > window.innerWidth + window.scrollX - 12)
    left = window.innerWidth + window.scrollX - pw - 12;
  if (rect.bottom + pop.offsetHeight > window.innerHeight - 12)
    top = rect.top + window.scrollY - pop.offsetHeight - 6;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

function closePillMenu() {
  document.getElementById('categoryPillPopover').style.display = 'none';
}

function toggleCategoryDetachedByName(name) {
  if (!state.categorySettings[name]) state.categorySettings[name] = {};
  state.categorySettings[name].detached = !state.categorySettings[name].detached;
  saveCategorySettings();
  render();
  // Keep popover open so the user can see the new state
  // Re-open with fresh state
  const pop = document.getElementById('categoryPillPopover');
  const toggle = pop.querySelector('input[type=checkbox]');
  if (toggle) toggle.checked = !!state.categorySettings[name]?.detached;
}

function toggleDetachExempt(id) {
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  m.detachExempt = !m.detachExempt;
  save();
  render();
  openDetail(id);
}

function openSurpriseModal() {
  // Reset state
  const ra = document.getElementById('surpriseResultArea');
  ra.style.display = 'none';
  ra.classList.remove('revealed');
  document.getElementById('surpriseActionRow').innerHTML =
    `<button class="btn btn-primary button-fill" onclick="runSurprise()">🎲 Surprise Me</button>`;
  state._surpriseSeenIds = new Set();
  updateSurprisePoolCount();
  document.getElementById('surpriseModal').classList.add('open');
  lockScroll();
}

function closeSurpriseModal() {
  if (!document.getElementById('surpriseModal').classList.contains('open')) return;
  document.getElementById('surpriseModal').classList.remove('open');
  state._surpriseSeenIds = new Set();
  unlockScroll();
}

function handleSurpriseOverlay(e) {
  if (e.target === document.getElementById('surpriseModal')) closeSurpriseModal();
}

function toggleSurpriseChip(btn) {
  btn.classList.toggle('active');
  onSurpriseOptionChange();
}

function onSurpriseOptionChange() {
  state._surpriseSeenIds = new Set(); // pool may have changed; reset suggestion history
  updateSurprisePoolCount();
  // Clear any existing result since filters changed
  const ra = document.getElementById('surpriseResultArea');
  if (ra && ra.style.display !== 'none') {
    ra.style.display = 'none';
    ra.classList.remove('revealed');
    document.getElementById('surpriseActionRow').innerHTML =
      `<button class="btn btn-primary button-fill" onclick="runSurprise()">🎲 Surprise Me</button>`;
  }
}

function updateSurprisePoolCount() {
  const el = document.getElementById('surprisePoolCount');
  if (!el) return;
  const n = getSurprisePool().length;
  if (n === 0) {
    const maxRuntime = getSurpriseMaxRuntime();
    el.textContent =
      maxRuntime > 0
        ? 'No films match — try a longer runtime limit or different filters.'
        : 'No unwatched films match these filters.';
    el.classList.add('empty');
  } else {
    el.textContent = `${n} unwatched film${n !== 1 ? 's' : ''} in the pool`;
    el.classList.remove('empty');
  }
}

function selectRuntimeChip(btn) {
  document.querySelectorAll('.surprise-runtime-chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  onSurpriseOptionChange();
}

function getSurpriseMaxRuntime() {
  const active = document.querySelector('.surprise-runtime-chip.active');
  return active ? parseInt(active.dataset.maxruntime) || 0 : 0;
}

// Returns the pool of films eligible to be picked, respecting all filters
// and the collection-ordering safety rule.
function getSurprisePool() {
  const includeVpn = document.getElementById('surpriseIncludeVpn').checked;
  const active = [...document.querySelectorAll('.surprise-svc-chip.active')].map(
    (c) => c.dataset.service
  );
  const anyService = active.length === 0;

  // Base pool: unwatched, non-graveyard, non-detached
  let pool = state.movies.filter((m) => !m.watched && !m.graveyard && !isDetachedMovie(m));

  // Service filter
  if (!anyService) {
    pool = pool.filter((m) => {
      const s = m.streaming || {};
      return active.some((svc) => {
        if (svc === 'cinema') return s.cinema?.direct || s.cinema?.coming;
        // Implicit Other films (no service set) match when 'other' is selected
        if (svc === 'other')
          return s.other?.direct || (includeVpn && s.other?.vpn) || hasNoStreaming(m);
        return s[svc]?.direct || (includeVpn && s[svc]?.vpn);
      });
    });
  } else if (!includeVpn) {
    // All services but VPN excluded: must have at least one direct/non-VPN availability.
    // Implicit Other (no service set) is treated as a direct-accessible Other.
    pool = pool.filter((m) => {
      const s = m.streaming || {};
      return SERVICES.some((sv) => s[sv]?.direct) || s.cinema?.coming || hasNoStreaming(m);
    });
  }

  // Collection safety: a film is only eligible if every film that appears
  // earlier in its collection (sorted by year, ascending) is already watched.
  // This prevents suggesting film 2 when film 1 hasn't been seen yet.
  pool = pool.filter((m) => {
    if (!m.collection) return true;

    // Sort all films in this collection by year (films without a year go last)
    const siblings = state.movies
      .filter((x) => x.collection === m.collection)
      .sort((a, b) => {
        const va = a.releaseDate
          ? new Date(a.releaseDate + 'T00:00:00').getTime()
          : a.year
            ? new Date(a.year + '-01-01T00:00:00').getTime()
            : 9e15;
        const vb = b.releaseDate
          ? new Date(b.releaseDate + 'T00:00:00').getTime()
          : b.year
            ? new Date(b.year + '-01-01T00:00:00').getTime()
            : 9e15;
        return va - vb;
      });

    const idx = siblings.findIndex((x) => x.id === m.id);
    if (idx <= 0) return true; // First in collection — always eligible

    // Every film before this one must be watched (graveyarded ones are skipped,
    // otherwise giving up on one entry would block the rest of the series forever)
    for (let i = 0; i < idx; i++) {
      if (!siblings[i].watched && !siblings[i].graveyard) return false;
    }
    return true;
  });

  // Runtime filter — when a limit is set, films with no runtime data are excluded
  // to avoid accidentally picking something that could be much longer than wanted.
  const maxRuntime = getSurpriseMaxRuntime();
  if (maxRuntime > 0) {
    pool = pool.filter((m) => m.runtime > 0 && m.runtime <= maxRuntime);
  }

  return pool;
}

function buildSurpriseBadges(m) {
  let o = '';
  const s = m.streaming || {};
  const fl = {
    netflix: 'Netflix',
    disney: 'Disney+',
    prime: 'Prime Video',
    cinema: 'In Cinemas',
    other: esc(m.otherName) || 'Other',
  };
  for (const k of SERVICES) {
    const label = fl[k];
    if (s[k]?.direct) o += `<span class="service-badge ${k}">${label}</span>`;
    if (s[k]?.vpn) {
      const country = s[k]?.vpnCountry;
      const countryText = country ? ` · ${esc(country)}` : '';
      o += `<span class="service-badge vpn">${countryFlag(s[k]?.vpnCountry)} ${label}${countryText}</span>`;
    }
  }
  if (s.cinema?.coming) o += `<span class="service-badge cinema-soon">&#127916; Coming Soon</span>`;
  return o || `<span class="service-badge other">Other</span>`;
}

function runSurprise() {
  // Animate the dice icon in the title
  const diceEl = document.getElementById('surpriseDiceIcon');
  if (diceEl) {
    diceEl.classList.remove('dice-spin');
    void diceEl.offsetWidth; // force reflow to restart animation
    diceEl.classList.add('dice-spin');
    setTimeout(() => diceEl.classList.remove('dice-spin'), 450);
  }

  const pool = getSurprisePool();

  if (!pool.length) {
    showSurpriseEmpty();
    return;
  }

  // Exclude every film already suggested this session.
  // If the entire pool has been exhausted, reset and start fresh.
  let candidates = pool.filter((m) => !state._surpriseSeenIds.has(m.id));
  if (!candidates.length) {
    state._surpriseSeenIds = new Set();
    candidates = pool;
  }

  const m = candidates[Math.floor(Math.random() * candidates.length)];
  state._surpriseSeenIds.add(m.id);

  showSurprisePick(m);
}

function showSurprisePick(m) {
  const poster = m.poster
    ? `<img class="surprise-result-poster" src="${esc(m.poster)}" alt="${esc(m.title)}" onerror="this.outerHTML='<div class=\\'surprise-result-placeholder\\'>🎬</div>'">`
    : `<div class="surprise-result-placeholder">🎬</div>`;

  const meta = [m.year, m.genre, formatRuntime(m.runtime)].filter(Boolean).map(esc).join(' · ');
  const rating =
    m.rating || m.rtRating
      ? `<div class="surprise-result-rating">${[m.rating ? '★ ' + esc(m.rating) : '', rtBadge(m)].filter(Boolean).join(' · ')}</div>`
      : '';

  // Collection position note
  let collNote = '';
  if (m.collection) {
    const siblings = state.movies
      .filter((x) => x.collection === m.collection)
      .sort((a, b) => {
        const va = a.releaseDate
          ? new Date(a.releaseDate + 'T00:00:00').getTime()
          : a.year
            ? new Date(a.year + '-01-01T00:00:00').getTime()
            : 9e15;
        const vb = b.releaseDate
          ? new Date(b.releaseDate + 'T00:00:00').getTime()
          : b.year
            ? new Date(b.year + '-01-01T00:00:00').getTime()
            : 9e15;
        return va - vb;
      });
    const idx = siblings.findIndex((x) => x.id === m.id);
    if (idx >= 0 && siblings.length > 1) {
      collNote = `<div class="surprise-collection-note">🎬 Film ${idx + 1} of ${siblings.length} &middot; ${esc(m.collection)}</div>`;
    }
  }

  const badges = buildSurpriseBadges(m);

  const ra = document.getElementById('surpriseResultArea');
  ra.innerHTML = `
    <div class="surprise-result-row">
      ${poster}
      <div class="flex-content">
        <div class="surprise-result-title">${esc(m.title)}</div>
        ${meta ? `<div class="surprise-result-meta">${meta}</div>` : ''}
        ${rating}
        ${collNote}
        <div class="surprise-result-badges">${badges}</div>
      </div>
    </div>`;

  ra.style.display = 'block';
  ra.classList.remove('revealed');
  void ra.offsetWidth;
  ra.classList.add('revealed');

  document.getElementById('surpriseActionRow').innerHTML = `
    <button class="btn btn-primary button-fill" onclick="openSurprisedFilm(${jsAttr(m.id)})">Open Film</button>
    <button class="btn btn-ghost" onclick="runSurprise()">🎲 Again</button>`;
}

function showSurpriseEmpty() {
  const ra = document.getElementById('surpriseResultArea');
  ra.innerHTML = `
    <div class="surprise-empty">
      <span class="surprise-empty-icon">🤷</span>
      <p class="surprise-empty-description">No unwatched films match these filters.<br>Try selecting fewer services or enabling VPN films.</p>
    </div>`;
  ra.style.display = 'block';
  ra.classList.remove('revealed');
  void ra.offsetWidth;
  ra.classList.add('revealed');
  document.getElementById('surpriseActionRow').innerHTML =
    `<button class="btn btn-primary button-fill" onclick="runSurprise()">🎲 Try Again</button>`;
}

function openSurprisedFilm(id) {
  closeSurpriseModal();
  setTimeout(() => openDetail(id), 100);
}
