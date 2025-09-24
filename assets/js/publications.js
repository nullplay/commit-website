/* Publications page controller — ES5, dynamic counts, compact UI */
// Data source: data/publications.json; edit that file to add publications.
/* === BibTeX generation (local, ES5) === */
// --- Safe URL localizer shim (works even if pubs.js isn't loaded) ---
// var localizeURL = (window.PUBS && typeof PUBS.localizeAssetURL === 'function')
//   ? function(u){ try { return PUBS.localizeAssetURL(u); } catch (e) { return u || ''; } }
//     : function(u){ return u || ''; };

// Localize commit links to site-relative (papers/... presentations/...)
var localizeURL = (window.PUBS && typeof PUBS.localizeAssetURL === 'function')
  ? function(u){ try { return PUBS.localizeAssetURL(u||''); } catch(e){ return u||''; } }
  : function(u){
      u = u || '';
      // handle https://commit.csail.mit.edu/(papers|presentations)/...
      // and https://groups.csail.mit.edu/commit/(papers|presentations)/...
      var m = u.match(/^https?:\/\/[^/]+\/(?:commit\/)?(papers|presentations)\/(.+)$/i);
      if (m) return (m[1].toLowerCase() + '/' + m[2]);
      return u;
    };


function bibtexKeyOf(it){
  if (it.bibtexKey) return it.bibtexKey;
  var t = (it.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return t.slice(0,24) + (it.year ? it.year : '');
}
function escBib(s){
  if (!s) return '';
  return String(s).replace(/[\n\r]+/g,' ').replace(/\s+/g,' ');
}
function firstDefined(){
  for (var i=0;i<arguments.length;i++){ var v=arguments[i]; if (v!==undefined && v!==null && v!=='') return v; }
  return '';
}
function venueOf(it){ return firstDefined(it.journal, it.booktitle, it.series, it.type, it.publisher); }
function locationOf(it){ return firstDefined(it.location, it.address); }
function titleOf(it){ return it.title || 'Untitled'; }

// Normalize item type for dedupe (fallback 'misc')
function normalizeType(t){
  return String(t || 'misc').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ===== Title & Author normalization ===== */

// Normalize title for dedup (case/space insensitive)
function normalizeTitle(s){
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Turn "Last, First [Middle]" into "First [Middle] Last"
function normalizeAuthorName(name){
  var t = String(name || '').trim();
  if (!t) return '';
  // If there's a comma, treat as "Last, First…"
  var comma = t.indexOf(',');
  if (comma >= 0){
    var last  = t.slice(0, comma).trim();
    var first = t.slice(comma + 1).trim();
    if (first) return first + ' ' + last;
    return last;
  }
  return t; // already "First Last"
}

// Tokenize authors string safely.
// Prefer " and " separators (BibTeX); if none, pair up "Last, First" by commas.
function _tokenizeAuthors(raw){
  var s = String(raw || '').trim();
  if (!s) return [];

  // If it contains ' and ', split on that (common BibTeX style)
  if (/\band\b/i.test(s)){
    return s.split(/\s+\band\b\s+/i).map(function(x){ return x.trim(); }).filter(Boolean);
  }

  // Fallback: try to pair "Last, First, Last, First, ..." by commas
  var parts = s.split(/\s*,\s*/);
  var out = [], i;
  for (i = 0; i < parts.length; i += 2){
    if (i + 1 < parts.length) out.push(parts[i] + ', ' + parts[i+1]);
    else out.push(parts[i]); // odd tail, keep as-is
  }
  return out;
}

// Public: list of normalized author display names ("First Last")
function listNormalizedAuthorsFromString(s){
  var toks = _tokenizeAuthors(s);
  var out = [], i, n;
  for (i = 0; i < toks.length; i++){
    n = normalizeAuthorName(toks[i]);
    if (n) out.push(n);
  }
  return out;
}

// Convenience: from item
function listNormalizedAuthors(it){
  var a = firstDefined(it.author0, it.authors, it.author);
  return listNormalizedAuthorsFromString(a);
}

// First author (normalized)
function firstAuthorOf(it){
  var arr = listNormalizedAuthors(it);
  return arr.length ? arr[0] : '';
}

// First author's first name
function firstAuthorFirstName(it){
    var n = firstAuthorOf(it);
  if (!n) return '';
    var parts = n.split(/\s+/);
  return parts[0];
}

// First author's last name
function firstAuthorLastName(it){

    var n = firstAuthorOf(it);

  if (!n) return '';
    var parts = n.split(/\s+/);

  return parts[parts.length - 1];
}


// Human-friendly labels for itemType keys
var TYPE_LABELS = {
  inproceedings: 'Conference Pub',
  article: 'Journal Article',
  mastersthesis: 'M.Eng. Thesis',
  phdthesis: 'PhD Thesis',
  techreport: 'Tech Report',
  book: 'Book',
  incollection: 'Book Chapter',
    misc: 'Other',
    'sciencethesis': "SM Thesis",
    sbthesis: "SB Thesis",
};
function typeLabel(k){
  k = (k || 'misc').toLowerCase().trim();
  return TYPE_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1));
}

var MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthNum(s){
  if(!s) return 0;
  var str = String(s).trim();
  if (!str) return 0;
  var digitMatch = str.match(/^(\d{1,2})$/);
  if (digitMatch) {
    var num = parseInt(digitMatch[1], 10);
    if (num >= 1 && num <= 12) return num;
  }
  var m = str.slice(0,3).toLowerCase();
  var map = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  return map[m] || 0;
}

function monthLabelFromParts(parts){
  if (!parts || !parts.month) return 'Other';
  var base = MONTH_ABBR[parts.month] || '';
  if (!base) return 'Other';
  if (parts.day) return base + ' ' + parts.day;
  return base;
}

function parseMonthDay(it){
  var month = 0;
  var day = 0;
  if (it && it.date) {
    var match = String(it.date).trim().match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);
    if (match) {
      if (match[2]) {
        var parsedMonth = parseInt(match[2], 10);
        if (parsedMonth >= 1 && parsedMonth <= 12) month = parsedMonth;
      }
      if (match[3]) {
        var parsedDay = parseInt(match[3], 10);
        if (!isNaN(parsedDay)) day = Math.max(0, parsedDay);
      }
    }
  }
  if (!month && it && it.month) {
    month = monthNum(it.month);
  }
  if (!day && it && it.day) {
    var d = parseInt(it.day, 10);
    if (!isNaN(d)) day = Math.max(0, d);
  }
  return { month: month, day: day };
}

function monthDayValue(it){
  var parts = parseMonthDay(it);
  if (!parts.month) return 0;
  return (parts.month * 100) + Math.min(99, Math.max(0, parts.day || 0));
}

function monthLabelOf(it){
  if (!it) return 'Other';
  var parts = parseMonthDay(it);
  if (!parts.month) return 'Other';
  if (it.month && monthNum(it.month) === parts.month) {
    return String(it.month);
  }
  return monthLabelFromParts(parts);
}

  function splitKeywords(s){
    if(!s) return [];
    var parts = s.split(/[,;]+/), out=[], i, p;
    for(i=0;i<parts.length;i++){ p = parts[i].trim(); if(p) out.push(p); }
    return out;
  }


// Key extractors (for sorting within groups)
function keyFor(it, which){
  if (which==='year')     return it.year ? parseInt(it.year,10) : 0; // numeric
  if (which==='month')    return monthDayValue(it);
  if (which==='type')     return typeLabel(it.itemType || 'misc');   // pretty label
  if (which==='authors')  { var a = listNormalizedAuthors(it); return a.length?a[0]:'zzz'; } // first author
  if (which==='authorFirst') { var f = firstAuthorFirstName(it); return f ? f : 'zzz'; }
  if (which==='authorLast')  { var l = firstAuthorLastName(it); return l ? l : 'zzz'; }
  if (which==='keywords') {
    var ks = splitKeywords(it.keywords || '');
    if (ks.length) { ks.sort(function(a,b){ return a.localeCompare(b); }); return ks[0]; }
    return 'zzz';
  }
  return '';
}


function venueOf(it){ return firstDefined(it.journal, it.booktitle, it.series, it.type, it.publisher); }

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function makeSorter(key){
  // returns a function(a,b) for within-year sorting
  if (key === 'title')       return function(a,b){ return cmp((a.title||'').toLowerCase(), (b.title||'').toLowerCase()); };
  if (key === 'venue')       return function(a,b){ return cmp((venueOf(a)||'').toLowerCase(), (venueOf(b)||'').toLowerCase()); };
  if (key === 'firstAuthor') return function(a,b){ return cmp((firstAuthorOf(a)||'').toLowerCase(), (firstAuthorOf(b)||'').toLowerCase()); };
  if (key === 'type')        return function(a,b){ return cmp((a.itemType||'misc').toLowerCase(), (b.itemType||'misc').toLowerCase()); };
  if (key === 'month')       return function(a,b){ return cmp(monthDayValue(b), monthDayValue(a)); };
  return null; // default order (as in data) within year
}



function buildBibtex(it, localizeURLFn){
  if (it.oldbibtex && /^\s*@/m.test(String(it.oldbibtex))) {
    return String(it.oldbibtex);
  }
  var typ = it.itemType || 'misc';
  var key = bibtexKeyOf(it);
  var out = [];
  out.push('@' + typ + '{' + key + ',');

  function pushLine(k, v){ if (v) out.push('  ' + k + ' = {' + v + '},'); }

  var url = localizeURLFn ? localizeURLFn(it.url || '') : (it.url || '');
  var slides = localizeURLFn ? localizeURLFn(it.slides || '') : (it.slides || '');

  pushLine('author',    escBib(firstDefined(it.author0, it.authors, it.author)));
  pushLine('title',     '{' + escBib(titleOf(it)) + '}');
  pushLine('booktitle', escBib(it.booktitle || ''));
  pushLine('journal',   escBib(it.journal || ''));
  pushLine('series',    escBib(it.series || ''));
  pushLine('publisher', escBib(it.publisher || ''));
  pushLine('school',    escBib(it.school || ''));
  pushLine('address',   escBib(locationOf(it)));
  pushLine('location',  escBib(locationOf(it)));
  pushLine('month',     escBib(it.month || ''));
  pushLine('year',      escBib(it.year || ''));
  pushLine('volume',    escBib(it.volume || ''));
  pushLine('number',    escBib(it.issue || it.number || ''));
  pushLine('pages',     escBib(it.pages || ''));
  pushLine('doi',       escBib(it.doi || ''));
  pushLine('keywords',  escBib(it.keywords || ''));
  pushLine('url',       escBib(url));
  if (slides) pushLine('note', 'Slides: ' + slides);

  // drop trailing comma
  if (out.length > 1) out[out.length-1] = out[out.length-1].replace(/,+\s*$/, '');
  out.push('}');
  return out.join('\n');
}

function createBibLink(it){
  var a = document.createElement('a');
  a.className = 'pub-action';
  a.textContent = 'BibTeX';
  var bib = buildBibtex(it, localizeURL);
  var blob = new Blob([bib], {type:'text/plain'});
  a.href = URL.createObjectURL(blob);
  a.download = bibtexKeyOf(it) + '.bib';
  a.addEventListener('click', function(){
    var href = a.href;
    setTimeout(function(){ URL.revokeObjectURL(href); }, 1500);
  });
  return a;
}


(function () {
  'use strict';

  var JSON_PATH = 'data/publications.json';

  var state = {
    mode: 'interactive',     // 'noninteractive' | 'interactive'
    years: {},                  // map of selected year -> true
    titleQuery: '',
    keywords: {},               // map of selected keyword -> true
    authors: {},                // map of selected author -> true
    types: {},                  // map of selected itemType -> true
    scroll: {                   // range-controlled scroll positions (0..1)
      keywords: 0,
      authors: 0,
      types: 0
    },
      sortKey: 'none',   // 'none' | 'title' | 'venue' | 'firstAuthor' | 'type' | 'month'
      sortDesc: false,
      sortOrder: ['year','month','type','authorLast'],  // default
      authorSort: 'first'

  };

  var els = {
    errors: document.getElementById('pubs-errors'),
    results: document.getElementById('pubs-results'),
    count: document.getElementById('pubs-count'),
    filtersInteractive: document.getElementById('filters-interactive'),
    btnClear: document.getElementById('btn-clear'),
    years: document.getElementById('facet-years'),
    title: document.getElementById('facet-title'),
    kwBox: document.getElementById('facet-keywords'),
    auBox: document.getElementById('facet-authors'),
      tyBox: document.getElementById('facet-types'),
      authorSort: document.getElementById('author-sort'),
      // els:
      sort1: document.getElementById('sort-1'),
      sort2: document.getElementById('sort-2'),
      sort3: document.getElementById('sort-3'),
      sort4: document.getElementById('sort-4'),
      sortReset: document.getElementById('sort-reset'),

  };

  var DATA = [];  // raw array
  var ALL_AUTHORS = [];  // unique normalized author names

  /* ---------- Small helpers ---------- */
  function text(s){ return document.createTextNode(s || ''); }
  function firstDefined(){ for(var i=0;i<arguments.length;i++){ var v=arguments[i]; if(v!==undefined&&v!==null&&v!=='') return v; } return ''; }
  function authorsOf(it){ return firstDefined(it.author0, it.authors, it.author); }
  function titleOf(it){ return it.title || 'Untitled'; }
  function venueOf(it){ return firstDefined(it.journal, it.booktitle, it.series, it.type, it.publisher); }
  function locationOf(it){ return firstDefined(it.location, it.address); }
  function splitAuthors(s){
    if(!s) return [];
    var parts = s.split(/\s+and\s+|,/i), out=[], i, p;
    for(i=0;i<parts.length;i++){ p = parts[i].trim(); if(p) out.push(p); }
    return out;
  }
  function splitKeywords(s){
    if(!s) return [];
    var parts = s.split(/[,;]+/), out=[], i, p;
    for(i=0;i<parts.length;i++){ p = parts[i].trim(); if(p) out.push(p); }
    return out;
  }

  // If pubs.js is loaded, reuse its localizer and bib link; else graceful fallback
    //  var localizeURL = (window.PUBS && PUBS.localizeAssetURL) ? function(u){ try{return PUBS.localizeAssetURL(u);}catch(_){return u;} } : function(u){ return u; };
  var makeBibLink = (window.PUBS && PUBS.makeBibDownloadLink) ? PUBS.makeBibDownloadLink : function(){ var a=document.createElement('span'); return a; };

  /* ---------- Build static UI shells (kept; content dynamic) ---------- */

  // Year grid entries and their count badges
  var yearBtnMap = {}; // year -> {btn, badgeNode}

  function buildYearGrid(yearValuesSortedDesc) {
    els.years.innerHTML = '';
    yearBtnMap = {};
    for (var i=0;i<yearValuesSortedDesc.length;i++){
      var y = String(yearValuesSortedDesc[i]);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'year-btn';
      btn.setAttribute('data-year', y);
      btn.appendChild(text(y));
      // space + badge
      btn.appendChild(text(' '));
      var badge = document.createElement('span');
      badge.className = 'year-badge';
      badge.appendChild(text('0'));
      btn.appendChild(badge);

      btn.onclick = (function(yy){
        return function(){
          state.years[yy] = !state.years[yy];
          applyFilters();
        };
      })(y);

      yearBtnMap[y] = { btn: btn, badge: badge.firstChild };
      els.years.appendChild(btn);
    }
  }

function buildFacetBox(list, mount, facetKey, stateMap, labelFor) {
  mount.innerHTML = '';

  var scrollWrap = document.createElement('div');   // the element that scrolls
  scrollWrap.className = 'facet-scroll';

  var listEl = document.createElement('div');       // tall inner list
  listEl.className = 'facet-items';
  scrollWrap.appendChild(listEl);

  // Build checkboxes
  var itemMap = {}; // value -> { cb, textNode }
  for (var i = 0; i < list.length; i++) {
    var value = list[i];                 // canonical filter value (e.g., itemType key)
    var labelText = labelFor ? labelFor(value) : value;  // pretty label

    var label = document.createElement('label');
    label.className = 'facet-item';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = value;

    var txt = document.createElement('span');
    txt.className = 'facet-text';
    var textNodeValue = document.createTextNode(labelText + ' (0)');
    txt.appendChild(textNodeValue);
    txt.title = labelText; // show full label on hover (handles truncation)

    cb.onchange = (function (val, map) {
      return function () { map[val] = !!this.checked; applyFilters(); };
    })(value, stateMap);

    label.appendChild(cb);
    label.appendChild(txt);
    listEl.appendChild(label);

    itemMap[value] = { cb: cb, textNode: textNodeValue, labelText: labelText };
  }

  mount.appendChild(scrollWrap);

  // Stash references for dynamic count updates
  mount._facet = { listEl: listEl, itemMap: itemMap, scrollWrap: scrollWrap, key: facetKey, labelFor: labelFor || null };
}


  function authorNameParts(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return { first: '', last: '' };
    }
    return {
      first: parts[0].toLowerCase(),
      last: parts[parts.length - 1].toLowerCase()
    };
  }

  function compareAuthors(a, b, mode) {
    var ap = authorNameParts(a);
    var bp = authorNameParts(b);
    var primaryA = (mode === 'last') ? ap.last : ap.first;
    var primaryB = (mode === 'last') ? bp.last : bp.first;
    var cmpPrimary = primaryA.localeCompare(primaryB);
    if (cmpPrimary !== 0) return cmpPrimary;

    var fullA = String(a || '').toLowerCase();
    var fullB = String(b || '').toLowerCase();
    var cmpFull = fullA.localeCompare(fullB);
    if (cmpFull !== 0) return cmpFull;
    return 0;
  }

  function sortAuthorValues(values, mode) {
    var arr = values.slice();
    arr.sort(function (a, b) { return compareAuthors(a, b, mode); });
    return arr;
  }

  function rebuildAuthorFacet() {
    if (!els.auBox) return;
    var prevScroll = 0;
    if (els.auBox._facet && els.auBox._facet.scrollWrap) {
      prevScroll = els.auBox._facet.scrollWrap.scrollTop;
    }
    var sorted = sortAuthorValues(ALL_AUTHORS, state.authorSort || 'first');
    buildFacetBox(sorted, els.auBox, 'authors', state.authors);
    if (els.auBox._facet && els.auBox._facet.scrollWrap) {
      els.auBox._facet.scrollWrap.scrollTop = prevScroll;
    }
  }


  /* ---------- Rendering one publication (same look as index) ---------- */
  function renderItem(it){
    var li = document.createElement('li');
    li.className = 'pub-item';

    var localPDF = localizeURL(it.url || '');

    var t = document.createElement('div');
    t.className = 'pub-title';
    if (localPDF) {
      var a = document.createElement('a');
      a.href = localPDF; a.target = '_blank'; a.rel = 'noopener';
      a.appendChild(text(titleOf(it)));
      t.appendChild(a);
    } else {
      t.appendChild(text(titleOf(it)));
    }
    t.appendChild(text('.'));
    li.appendChild(t);

    var auth = authorsOf(it);
    if (auth){ var al = document.createElement('div'); al.className = 'pub-authors'; al.appendChild(text(auth + '.')); li.appendChild(al); }

    var ven = venueOf(it);
    if (ven){ var vl = document.createElement('div'); vl.className = 'pub-venue'; vl.appendChild(text(ven + '.')); li.appendChild(vl); }

    var meta = document.createElement('div'); meta.className = 'pub-meta';
    var loc = locationOf(it), bits=[];
    if (loc) bits.push(loc + '.');
    if (it.month) bits.push(String(it.month) + ',');
    if (it.year)  bits.push(String(it.year) + '.');
    if (bits.length) meta.appendChild(text(bits.join(' ') + ' '));
    // Bib + Slides
      meta.appendChild(makeBibLink(it));
      meta.appendChild(createBibLink(it));

    var slides = localizeURL(it.slides || '');
    if (slides) { meta.appendChild(text(' ')); var sA=document.createElement('a'); sA.href=slides; sA.target='_blank'; sA.rel='noopener'; sA.className='pub-action'; sA.appendChild(text('Slides')); meta.appendChild(sA); }
    li.appendChild(meta);

    if (it.price){ var pr=document.createElement('div'); pr.className='pub-price'; pr.appendChild(text(it.price)); li.appendChild(pr); }

    return li;
  }


function renderList(mount, items){
  var order = state.sortOrder.slice();                  // e.g. ['none','authors','none','year']
  var active = order.filter(function(k){ return k !== 'none'; });

  // Case 1: no primary (order[0] === 'none') → flat list
  if (!active.length || order[0] === 'none') {
    var flat = items.slice();

    // Apply remaining sort keys (skip initial 'none')
    for (var r = order.length - 1; r >= 0; r--){
      (function(which){
        if (which === 'none') return;
        flat.sort(function(a,b){
          if (which==='year') return (keyFor(b,'year') - keyFor(a,'year')); // year desc
          if (which==='month') return (keyFor(b,'month') - keyFor(a,'month'));
          return cmp(String(keyFor(a,which)).toLowerCase(), String(keyFor(b,which)).toLowerCase());
        });
      })(order[r]);
    }

    var ul = document.createElement('ul'); ul.className = 'pub-list';
    for (var i=0;i<flat.length;i++) ul.appendChild(renderItem(flat[i]));
    mount.innerHTML = '';
    mount.appendChild(ul);
    return;
  }

  // Case 2: group by the first active key
  var primary = active[0];
  var rest = [];
  // take the remaining keys in their original positions, skipping 'none' and the primary
  for (var i=0;i<order.length;i++){
    var k = order[i];
    if (k !== 'none' && k !== primary) rest.push(k);
  }

  var groups = {}; // label -> items
  var groupSortValue = {}; // label -> numeric sort helper
  function add(label, it, sortVal){
    if (!groups[label]) groups[label]=[];
    groups[label].push(it);
    if (sortVal !== undefined) {
      var current = groupSortValue[label];
      if (current === undefined || sortVal > current) groupSortValue[label] = sortVal;
    }
  }

  for (var i2=0;i2<items.length;i2++){
    var it = items[i2];
    if (primary==='year'){
      add(it.year ? String(it.year) : 'Other', it);
    } else if (primary==='month'){
      var label = monthLabelOf(it);
      var sortVal = (label === 'Other') ? 0 : monthDayValue(it);
      add(label, it, sortVal);
    } else if (primary==='type'){
      add(typeLabel(it.itemType || 'misc'), it);
    } else if (primary==='authors'){
      var as = listNormalizedAuthors(it); if (as.length){ for (var a=0;a<as.length;a++) add(as[a], it); } else add('Other', it);
    } else if (primary==='authorFirst'){
      var fn = firstAuthorFirstName(it); add(fn || 'Other', it);
    } else if (primary==='authorLast'){
      var ln = firstAuthorLastName(it); add(ln || 'Other', it);
    } else if (primary==='keywords'){
      var ks = splitKeywords(it.keywords || ''); if (ks.length){ for (var k2=0;k2<ks.length;k2++) add(ks[k2], it); } else add('Other', it);
    }
  }

  var headers = Object.keys(groups);
  headers.sort(function(A,B){
    if (primary==='year'){
      if (A==='Other' && B!=='Other') return 1;
      if (B==='Other' && A!=='Other') return -1;
      return (parseInt(B,10)||0) - (parseInt(A,10)||0); // desc
    }
    if (primary==='month'){
      if (A==='Other' && B!=='Other') return 1;
      if (B==='Other' && A!=='Other') return -1;
      var aVal = groupSortValue[A] || 0;
      var bVal = groupSortValue[B] || 0;
      if (aVal !== bVal) return bVal - aVal;
      return A.toLowerCase().localeCompare(B.toLowerCase());
    }
    return A.toLowerCase().localeCompare(B.toLowerCase());
  });

  var container = document.createElement('div');
  for (var h=0; h<headers.length; h++){
    var label = headers[h];
    var arr = groups[label].slice();

    // multi-key within group
    for (var r2 = rest.length - 1; r2 >= 0; r2--){
      (function(which){
        arr.sort(function(a,b){
          if (which==='year') return (keyFor(b,'year') - keyFor(a,'year'));
          if (which==='month') return (keyFor(b,'month') - keyFor(a,'month'));
          return cmp(String(keyFor(a,which)).toLowerCase(), String(keyFor(b,which)).toLowerCase());
        });
      })(rest[r2]);
    }

    var sec = document.createElement('div');
    var h3 = document.createElement('h3'); h3.textContent = label;
    sec.appendChild(h3);
    var ul = document.createElement('ul'); ul.className = 'pub-list';
    for (var j=0;j<arr.length;j++) ul.appendChild(renderItem(arr[j]));
    sec.appendChild(ul);
    container.appendChild(sec);
  }

  mount.innerHTML = '';
  mount.appendChild(container);
}


  /* ---------- Filtering & Dynamic counts ---------- */

  // Returns items filtered by current state, optionally excluding one facet ("years"|"keywords"|"authors"|"types")
  function filteredItems(excludeFacet){
    var items = DATA.slice();

    // Title
    var q = state.titleQuery.replace(/\s+/g,' ').trim().toLowerCase();
    if (q) {
      items = items.filter(function(it){
        return (it.title||'').toLowerCase().indexOf(q) >= 0;
      });
    }

    // Years
    if (excludeFacet !== 'years') {
      var yKeys = keysSelected(state.years);
      if (yKeys.length){
        items = items.filter(function(it){ return it.year && yKeys.indexOf(String(it.year)) >= 0; });
      }
    }

    // Keywords
    if (excludeFacet !== 'keywords') {
      var kwKeys = keysSelected(state.keywords);
      if (kwKeys.length){
        items = items.filter(function(it){
          var kws = splitKeywords(it.keywords || '');
          for (var i=0;i<kws.length;i++) if (kwKeys.indexOf(kws[i]) >= 0) return true;
          return false;
        });
      }
    }

    // Authors
    if (excludeFacet !== 'authors') {
// Authors (OR within facet)
var auKeys = keysSelected(state.authors);
if (auKeys.length){
  items = items.filter(function (it) {
    var as = listNormalizedAuthors(it);   // <-- normalized
    for (var i = 0; i < as.length; i++) if (auKeys.indexOf(as[i]) >= 0) return true;
    return false;
  });
}

    }

    // Types
    if (excludeFacet !== 'types') {
      var tyKeys = keysSelected(state.types);
      if (tyKeys.length){
        items = items.filter(function(it){
          var t = it.itemType || 'misc';
          return tyKeys.indexOf(t) >= 0;
        });
      }
    }

    return items;
  }

  function keysSelected(map){
    var out=[], k;
    for (k in map) if (map[k]) out.push(k);
    return out;
  }

  function updateDynamicCounts(){
    // Years (exclude its own selections)
    var itemsY = filteredItems('years'), yCounts = {}, i;
    for (i=0;i<itemsY.length;i++){
      var y = itemsY[i].year ? String(itemsY[i].year) : '';
      if (y) yCounts[y] = (yCounts[y]||0) + 1;
    }
    // update year badges + active class
    for (var yKey in yearBtnMap){
      var badgeNode = yearBtnMap[yKey].badge;
	badgeNode.nodeValue = ' (' + String(yCounts[yKey] || 0) + ')';

      yearBtnMap[yKey].btn.className = state.years[yKey] ? 'year-btn active' : 'year-btn';
    }

    // Keywords
    var itemsK = filteredItems('keywords'), kCounts = {}, j;
    for (i=0;i<itemsK.length;i++){
      var kws = splitKeywords(itemsK[i].keywords || '');
      for (j=0;j<kws.length;j++) kCounts[kws[j]] = (kCounts[kws[j]]||0) + 1;
    }
    updateFacetCounts(els.kwBox, 'keywords', kCounts, state.keywords);

    // Authors
// Authors dynamic counts
var itemsA = filteredItems('authors'), aCounts = {};
for (i = 0; i < itemsA.length; i++){
  var as = listNormalizedAuthors(itemsA[i]);  // <-- normalized
  for (j = 0; j < as.length; j++) aCounts[as[j]] = (aCounts[as[j]] || 0) + 1;
}
updateFacetCounts(els.auBox, 'authors', aCounts, state.authors);


    // Types
var itemsT = filteredItems('types'), tCounts = {};
for (i = 0; i < itemsT.length; i++){
  var t = (itemsT[i].itemType || 'misc').toLowerCase().trim();
  tCounts[t] = (tCounts[t] || 0) + 1;
}
updateFacetCounts(els.tyBox, 'types', tCounts, state.types);

  }

  function updateFacetCounts(mount, facetKey, countsMap, stateMap) {
    var facet = mount._facet;
    if (!facet) return;

    var itemMap = facet.itemMap;
  for (var val in itemMap) {
    var cnt = countsMap[val] || 0;
    var display = facet.labelFor ? facet.labelFor(val) : val;
    itemMap[val].textNode.nodeValue = display + ' (' + cnt + ')';

    var disabled = (cnt === 0) && !stateMap[val];
    itemMap[val].cb.disabled = disabled;
    itemMap[val].cb.parentNode.className = disabled ? 'facet-item disabled' : 'facet-item';
    itemMap[val].cb.checked = !!stateMap[val];
  }
}

  function updatePublicationCount(count){
    if (!els.count) return;
    var label = (count === 1) ? '1 paper' : (count + ' papers');
    els.count.textContent = '(' + label + ')';
  }

  updatePublicationCount(0);

  function applyFilters(){
    // recompute dynamic counts first (so user sees availability)
    updateDynamicCounts();

    // then produce final result set (include all active facets)
    var items = filteredItems(null);

    updatePublicationCount(items.length);

    // sort by year desc, stable
    items.sort(function(a,b){
      var ay = a.year ? parseInt(a.year,10) : 0;
      var by = b.year ? parseInt(b.year,10) : 0;
      if (ay !== by) return by - ay;
      var am = monthDayValue(a);
      var bm = monthDayValue(b);
      if (am !== bm) return bm - am;
      return 0;
    });

    renderList(els.results, items);

    // interactive panel visibility
    els.filtersInteractive.className = (state.mode === 'interactive') ? 'filters-interactive' : 'filters-interactive hidden';
  }

  function clearAll(){
    state.years = {};
    state.titleQuery = '';
    state.keywords = {};
    state.authors = {};
    state.types = {};
    state.scroll = { keywords:0, authors:0, types:0 };
    if (els.title) els.title.value = '';
    applyFilters();
  }

  /* ---------- Boot ---------- */
  function boot(){
    // Mode toggle
    var radios = document.querySelectorAll('input[name=mode]');
    for (var i=0;i<radios.length;i++){
      radios[i].onchange = function(){ state.mode = this.value; applyFilters(); };
    }

    // Title search
    els.title.oninput = function(){ state.titleQuery = els.title.value || ''; applyFilters(); };

    // Clear
      els.btnClear.onclick = function(){ clearAll(); };

    if (els.authorSort) {
      els.authorSort.value = state.authorSort;
      els.authorSort.onchange = function(){
        state.authorSort = this.value || 'first';
        rebuildAuthorFacet();
        applyFilters();
      };
    }

function downloadText(filename, text){
  var blob = new Blob([text], {type:'text/plain'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 0);
}

// Ensure the button exists; if not, create it in the filter row
var btnExport = document.getElementById('btn-export-bib') || (function(){
  var row = document.querySelector('.filter-row');
  if (!row) return null;
  var b = document.createElement('button');
  b.id = 'btn-export-bib';
  b.type = 'button';
  b.className = 'btn';
  b.textContent = 'Export .bib';
  row.appendChild(b);
  return b;
})();

if (btnExport) {
  btnExport.onclick = function(){
    // Export exactly what’s currently shown
 var items = filteredItems(null);

// Group by year like the UI
var byYear = {};
for (var i=0;i<items.length;i++){
  var y = items[i].year ? String(items[i].year) : 'Other';
  if (!byYear[y]) byYear[y] = [];
  byYear[y].push(items[i]);
}
var years = Object.keys(byYear).sort(function(a,b){
  if (a==='Other' && b!=='Other') return 1;
  if (b==='Other' && a!=='Other') return -1;
  var ai = parseInt(a,10)||0, bi = parseInt(b,10)||0;
  return bi - ai;
});

// Within-year sort same as UI
var sorter = makeSorter(state.sortKey);
var dir = state.sortDesc ? -1 : 1;

var out = [], yi, y;
for (yi=0; yi<years.length; yi++){
  y = years[yi];
  var arr = byYear[y].slice();
  if (sorter) arr.sort(function(a,b){ return dir * sorter(a,b); });

  for (var k=0; k<arr.length; k++){
    out.push(buildBibtex(arr[k], localizeURL));
    if (yi !== years.length-1 || k !== arr.length-1) out.push('\n\n');
  }
}

downloadText('commit-publications.bib', out.join(''));

  };
}

function uniqueOrder(arr){
  // Keep order, remove duplicates except 'none' (allowed multiple),
  // then append any missing real keys to complete 4 slots.
  var seen = {}, out = [], ALL = ['year','keywords','authors','type'], i, k;
  for (i=0;i<arr.length;i++){
    k = arr[i] || 'none';
    if (k === 'none') { out.push('none'); continue; }
    if (!seen[k]) { seen[k]=1; out.push(k); }
  }
  // pad to 4 with 'none'
  while (out.length < 4) out.push('none');
  return out.slice(0,4);
}
function applySortUIToState(){
  state.sortOrder = uniqueOrder([
    (els.sort1 && els.sort1.value) || 'none',
    (els.sort2 && els.sort2.value) || 'none',
    (els.sort3 && els.sort3.value) || 'none',
    (els.sort4 && els.sort4.value) || 'none'
  ]);
}
function refreshSortUI(){
  var so = state.sortOrder;
  if (els.sort1) els.sort1.value = so[0];
  if (els.sort2) els.sort2.value = so[1];
  if (els.sort3) els.sort3.value = so[2];
  if (els.sort4) els.sort4.value = so[3];

  // Disable chosen non-'none' values in other selects to avoid duplicates
  var picks = [so[0], so[1], so[2], so[3]];
  var selects = [els.sort1, els.sort2, els.sort3, els.sort4];
  for (var i=0;i<selects.length;i++){
    var s = selects[i]; if (!s) continue;
    for (var j=0;j<s.options.length;j++){
      var v = s.options[j].value;
      s.options[j].disabled = false;
      if (v !== 'none') {
        // if v is selected elsewhere (not this select), disable it here
        var selectedElsewhere = (v===picks[0] && s!==els.sort1) ||
                                (v===picks[1] && s!==els.sort2) ||
                                (v===picks[2] && s!==els.sort3) ||
                                (v===picks[3] && s!==els.sort4);
        if (selectedElsewhere) s.options[j].disabled = true;
      }
    }
  }
}


function onSortChange(){
  applySortUIToState();
  refreshSortUI();
  applyFilters(); // re-render with new grouping/sort
}

      // hook up
      if (els.sort1) els.sort1.onchange = onSortChange;
      if (els.sort2) els.sort2.onchange = onSortChange;
      if (els.sort3) els.sort3.onchange = onSortChange;
      if (els.sort4) els.sort4.onchange = onSortChange;
if (els.sortReset) els.sortReset.onclick = function(){
  state.sortOrder = ['none','none','none','none']; // <— all none on reset
  refreshSortUI();
  applyFilters();
};

      // initialize UI
      refreshSortUI();


    // Load JSON
    var xhr = new XMLHttpRequest();
    xhr.open('GET', JSON_PATH, true);
    xhr.onreadystatechange = function(){
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300){
        try {
            DATA = JSON.parse(xhr.responseText);

	    // --- Dedupe by normalized title ---
// --- Dedupe by normalized (title + type) ---
// Prefer the entry that has a URL (PDF) or DOI; otherwise keep first seen.
(function(){
  var bestByKey = Object.create(null);
  var order = []; // preserve overall order for stable output

  function isBetter(a, b){
    // Return true if a is better than b
    var aHasPdf = !!(a && a.url);
    var bHasPdf = !!(b && b.url);
    if (aHasPdf !== bHasPdf) return aHasPdf;

    var aHasDoi = !!(a && a.doi);
    var bHasDoi = !!(b && b.doi);
    if (aHasDoi !== bHasDoi) return aHasDoi;

    // (optional) prefer one with slides
    var aHasSlides = !!(a && a.slides);
    var bHasSlides = !!(b && b.slides);
    if (aHasSlides !== bHasSlides) return aHasSlides;

    return false; // otherwise don't replace
  }

  for (var i = 0; i < DATA.length; i++){
    var it = DATA[i];
    var key = normalizeTitle(it.title) + '|' + normalizeType(it.itemType);
    if (!bestByKey[key]) {
      bestByKey[key] = it;
      order.push(key);
    } else if (isBetter(it, bestByKey[key])) {
      bestByKey[key] = it;
    }
  }

  var dedup = [];
  for (var j = 0; j < order.length; j++){
    dedup.push(bestByKey[order[j]]);
  }
  DATA = dedup;
})();



          // YEARS: compute global list first (unique, desc)
          var ySet = {}, i;
          for (i=0;i<DATA.length;i++){ if (DATA[i].year) ySet[String(DATA[i].year)] = 1; }
          var years = []; for (var k in ySet) years.push(parseInt(k,10));
          years.sort(function(a,b){ return b-a; });
          buildYearGrid(years);

            // Facets static lists (values only; counts dynamic)
            var kwSet = {}, auSet = {};
            for (i=0;i<DATA.length;i++){
		var it = DATA[i], j;
		var kws = splitKeywords(it.keywords || '');
		for (j=0;j<kws.length;j++) kwSet[kws[j]] = 1;
		var aus = listNormalizedAuthors(it);
		for (j=0;j<aus.length;j++) auSet[normalizeAuthorName(aus[j])] = 1;
            }
	    // Types (canonical keys), values sorted by pretty label
	    var tySet = {}, i;
	    for (i = 0; i < DATA.length; i++){
		var ty = (DATA[i].itemType || 'misc').toLowerCase().trim();
		tySet[ty] = 1;
	    }
	    var tyVals = Object.keys(tySet).sort(function(a,b){ return typeLabel(a).localeCompare(typeLabel(b)); });

	    // Build types facet; pass labelFor so UI shows friendly names but values remain canonical
	    buildFacetBox(tyVals, els.tyBox, 'types', state.types, typeLabel);

          var kwVals = Object.keys(kwSet).sort(function(a,b){ return a.localeCompare(b); });
          ALL_AUTHORS = Object.keys(auSet);


          buildFacetBox(kwVals, els.kwBox, 'keywords', state.keywords);
          rebuildAuthorFacet();

          applyFilters(); // initial render and dynamic counts
        } catch (e) {
          els.errors.textContent = 'Failed to parse publications.json: ' + e.message;
        }
      } else {
        els.errors.textContent = 'HTTP ' + xhr.status + ' loading ' + JSON_PATH;
      }
    };
    xhr.send();
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})();
