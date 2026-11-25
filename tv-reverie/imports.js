let pasteSession = null;

function openPasteImport() {
  const modal = document.getElementById('pasteImportModal');
  if (modal.classList.contains('open')) return;
  pasteSession = { category: currentCategory || '' };
  document.getElementById('pasteShows').value = '';
  modal.classList.add('open');
  lockScroll();
  returnToPaste();
}

function closePasteImport() {
  const modal = document.getElementById('pasteImportModal');
  if (!modal.classList.contains('open')) return;
  pasteSession?.controller?.abort();
  pasteSession = null;
  modal.classList.remove('open');
  unlockScroll();
}

function returnToPaste() {
  pasteSession.controller?.abort();
  pasteSession = { category: pasteSession.category };
  document.getElementById('pasteEntry').hidden = false;
  document.getElementById('pasteReview').hidden = true;
  document.getElementById('pasteReview').replaceChildren();
  document.getElementById('pasteBack').hidden = true;
  document.getElementById('pasteConfirm').hidden = true;
  document.getElementById('pasteFind').hidden = false;
  document.getElementById('pasteFind').disabled = false;
  document.getElementById('pasteStatus').textContent = tmdbKey ? '' : 'Shows will be added manually unless you set up a TMDB key.';
  if (!addModalMobile.matches) document.getElementById('pasteShows').focus();
}

function parsePastedSeries(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim()
      .replace(/^(?:[-*+•]|\d+[.)])\s+/, '')
      .replace(/^\[[ xX]\]\s*/, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/\*\*|__/g, '').trim();
    if (!clean || /^#+\s/.test(clean)) continue;
    const withYear = clean.match(/^(.+?)\s*\((\d{4})\)$/);
    const title = withYear ? withYear[1].trim() : clean;
    const year = withYear ? withYear[2] : '';
    const key = JSON.stringify([normalizeSeriesTitle(title), year]);
    if (!entries.has(key)) entries.set(key, { title, year });
  }
  return [...entries.values()];
}

async function reviewPasteShows() {
  const entries = parsePastedSeries(document.getElementById('pasteShows').value);
  const status = document.getElementById('pasteStatus');
  if (!entries.length) {
    status.textContent = 'Paste at least one show title.';
    return;
  }
  const session = pasteSession;
  if (!session || session.controller) return;
  session.controller = new AbortController();
  session.entries = entries;
  document.getElementById('pasteEntry').hidden = true;
  document.getElementById('pasteFind').hidden = true;
  document.getElementById('pasteBack').hidden = false;
  status.textContent = tmdbKey ? 'Looking up shows…' : '';
  let finished = 0;
  await runSeriesPool(entries, async entry => {
    if (session.controller.signal.aborted) return;
    if (tmdbKey) await matchPasteEntry(session, entry, entry.title);
    if (session === pasteSession) status.textContent = `Reviewed ${++finished} of ${entries.length}`;
  });
  if (session !== pasteSession) return;
  status.textContent = 'Review matches and uncheck any shows you want to skip.';
  document.getElementById('pasteReview').hidden = false;
  document.getElementById('pasteConfirm').hidden = false;
  entries.forEach((entry, index) => drawPasteEntry(session, entry, index));
}

async function matchPasteEntry(session, entry, query, useYear = true) {
  const search = {};
  entry.search = search;
  try {
    const year = useYear ? entry.year : '';
    const hits = await searchSeries(query, { year, signal: session.controller.signal });
    if (session !== pasteSession || search !== entry.search) return;
    entry.results = hits.slice(0, 8);
    const match = matchSeries(hits, query, year);
    if (match && !entry.results.includes(match)) entry.results.unshift(match);
    entry.match = match?.id || '';
    entry.failed = false;
  } catch {
    if (session !== pasteSession || search !== entry.search) return;
    entry.failed = true;
  }
}

function drawPasteEntry(session, entry, index) {
  const review = document.getElementById('pasteReview');
  const row = review.querySelector(`[data-paste-index="${index}"]`) || document.createElement('div');
  row.className = 'import-entry';
  row.dataset.pasteIndex = index;
  const duplicate = findSavedSeries(entry.match, entry.title, entry.year);
  const heading = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = entry.include ?? !duplicate;
  checkbox.onchange = () => { entry.include = checkbox.checked; };
  heading.append(checkbox, ` ${entry.title}${entry.year ? ` (${entry.year})` : ''}${duplicate ? ' · In your list' : ''}`);
  row.replaceChildren(heading);

  if (tmdbKey) {
    const options = document.createElement('select');
    options.setAttribute('aria-label', `TMDB match for ${entry.title}`);
    options.add(new Option('Add manually', ''));
    for (const show of entry.results || []) {
      const year = dateOnly(show.first_air_date).slice(0, 4);
      options.add(new Option(`${show.name || show.title}${year ? ` (${year})` : ''}`, show.id));
    }
    options.value = entry.match || '';
    options.onchange = () => { entry.match = options.value; };

    const query = document.createElement('input');
    query.type = 'search';
    query.value = entry.title;
    query.setAttribute('aria-label', `Search again for ${entry.title}`);
    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-sm';
    button.textContent = 'Search again';
    button.onclick = async () => {
      if (!query.value.trim()) return;
      button.disabled = true;
      await matchPasteEntry(session, entry, query.value.trim(), false);
      if (session === pasteSession) drawPasteEntry(session, entry, index);
    };
    const alternatives = document.createElement('div');
    alternatives.className = 'import-alternatives';
    alternatives.append(query, button);
    row.append(options, alternatives);
    if (entry.failed) row.append('Lookup failed. Search again or add manually.');
  }
  if (!row.isConnected) review.append(row);
}

async function confirmPasteShows() {
  const session = pasteSession;
  if (!session?.entries || session.saving) return;
  const entries = session.entries.filter(entry => entry.include ?? !findSavedSeries(entry.match, entry.title, entry.year));
  if (!entries.length) {
    document.getElementById('pasteStatus').textContent = 'Select at least one show to add.';
    return;
  }
  session.saving = true;
  const confirm = document.getElementById('pasteConfirm');
  confirm.disabled = true;
  document.getElementById('pasteStatus').textContent = 'Adding shows…';
  const matched = [];
  const key = tmdbKey;
  try {
    await runSeriesPool(entries, async entry => {
      if (session !== pasteSession || !entry.match || !key) return;
      try {
        const data = await getSeriesDetails(entry.match, key);
        matched[entries.indexOf(entry)] = showFromTmdb(data, Number(entry.match));
      } catch {}
    });
    if (session !== pasteSession) return;
    const before = JSON.parse(JSON.stringify(shows));
    for (const [index, entry] of entries.entries()) {
      const show = matched[index]?.title ? matched[index] : { title: entry.title, year: entry.year };
      if (findSavedSeries(show.tmdbId, show.title, show.year)) continue;
      shows.push({ ...show, id: crypto.randomUUID(), category: session.category, dateAdded: new Date().toISOString() });
    }
    const added = shows.length - before.length;
    if (added) {
      undoStack.push(before);
      redoStack = [];
      save(true);
      render();
      scheduleMetadata();
    }
    closePasteImport();
    if (added) showChangeToast(`${added} show${added === 1 ? '' : 's'} added.`, 'Import');
    else showInfoToast('All selected shows are already in your list.');
  } finally {
    confirm.disabled = false;
  }
}

function openExport() {
  const modal = document.getElementById('exportModal');
  if (modal.classList.contains('open')) return;
  modal.classList.add('open');
  lockScroll();
}

function closeExport() {
  const modal = document.getElementById('exportModal');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  unlockScroll();
}

function exportShows(unwatchedOnly = false) {
  const rows = [[
    'Title', 'Premiere Year', 'Premiere Date', 'Status', 'Episode Runtime (min)', 'Episode Count',
    'Category', 'Watch With', 'Streaming Services', 'IMDb ID', 'TMDB ID', 'Notes',
  ]];
  const labels = { unwatched:'Unwatched', watching:'Watching', more_to_come:'More to come', finished_for_good:'Finished' };
  for (const show of shows) {
    if (unwatchedOnly && (show.watched || show.graveyard)) continue;
    const services = SERVICES.filter(key => show.streaming?.[key]?.direct)
      .map(key => (key === 'other' && show.otherName) || SERVICE_META[key].label);
    rows.push([
      show.title, show.year, show.firstAirDate, show.graveyard ? 'Dropped' : labels[showStatus(show)],
      show.episodeRuntime, show.episodeCount, show.category, show.watchWith, services.join('; '),
      show.imdbId, show.tmdbId, show.notes,
    ]);
  }
  const cell = value => {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type:'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = unwatchedOnly ? 'tv-reverie-unwatched.csv' : 'tv-reverie.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  closeExport();
}
