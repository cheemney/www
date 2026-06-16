(function () {
  'use strict';

  var STATE = {
    posts: [],
    loaded: false,
    loading: null,
    q: ''
  };

  var OVERLAY_ID = 'search-overlay';
  var OVERLAY_INPUT_ID = 'search-overlay-input';
  var OVERLAY_RESULTS_ID = 'search-overlay-results';
  var OVERLAY_STATUS_ID = 'search-overlay-status';

  var PAGE_INPUT_ID = 'searchpage-input';
  var PAGE_RESULTS_ID = 'searchpage-results';
  var PAGE_STATUS_ID = 'searchpage-status';

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlight(text, terms) {
    if (!terms.length) return escapeHTML(text);
    var pattern = new RegExp('(' + terms.map(escapeRegex).join('|') + ')', 'gi');
    var escaped = escapeHTML(text);
    return escaped.replace(pattern, '<mark>$1</mark>');
  }

  function loadIndex() {
    if (STATE.loaded) return Promise.resolve(STATE.posts);
    if (STATE.loading) return STATE.loading;
    STATE.loading = fetch('/index.json', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('index fetch failed: ' + r.status);
        return r.json();
      })
      .then(function (data) {
        STATE.posts = (data && data.posts) || [];
        STATE.loaded = true;
        return STATE.posts;
      })
      .catch(function (err) {
        console.error('Search index failed to load:', err);
        STATE.loading = null;
        return [];
      });
    return STATE.loading;
  }

  function scorePost(post, terms) {
    var title = (post.title || '').toLowerCase();
    var summary = (post.summary || '').toLowerCase();
    var tags = (post.tags || []).map(function (t) { return String(t).toLowerCase(); });
    var haystack = title + ' ' + summary + ' ' + tags.join(' ');
    var allHit = true;
    var score = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (haystack.indexOf(t) === -1) { allHit = false; break; }
      if (title.indexOf(t) !== -1) score += 10;
      if (tags.some(function (tag) { return tag === t; })) score += 5;
      if (summary.indexOf(t) !== -1) score += 1;
    }
    return allHit ? score : 0;
  }

  function search(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return [];
    var terms = q.split(/\s+/).filter(Boolean);
    return STATE.posts
      .map(function (p) { return { post: p, score: scorePost(p, terms) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (r) { return r.post; });
  }

  function renderResults(target, query, results) {
    var list = document.getElementById(target.resultsId);
    var status = document.getElementById(target.statusId);
    if (!list) return;

    if (!query.trim()) {
      list.innerHTML = '';
      if (status) status.textContent = '';
      return;
    }
    if (!results.length) {
      list.innerHTML = '<li class="search-no-results">No posts match &ldquo;' + escapeHTML(query) + '&rdquo;.</li>';
      if (status) status.textContent = 'No results';
      return;
    }
    var terms = query.trim().toLowerCase().split(/\s+/);
    list.innerHTML = results.map(function (p) {
      var title = highlight(p.title || '', terms);
      var summary = highlight(p.summary || '', terms);
      var date = p.date || '';
      return ''
        + '<li class="search-result">'
        +   '<a class="search-result__link" href="' + escapeHTML(p.permalink) + '">'
        +     '<span class="search-result__title">' + title + '</span>'
        +     '<span class="search-result__meta">'
        +       '<time>' + escapeHTML(date) + '</time>'
        +     '</span>'
        +     (summary ? '<span class="search-result__summary">' + summary + '</span>' : '')
        +   '</a>'
        + '</li>';
    }).join('');
    if (status) status.textContent = results.length + ' result' + (results.length === 1 ? '' : 's');
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function openOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    if (overlay.hidden) {
      overlay.hidden = false;
      document.documentElement.classList.add('search-open');
      var input = document.getElementById(OVERLAY_INPUT_ID);
      if (input) {
        input.value = '';
        setTimeout(function () { input.focus(); }, 0);
      }
      var status = document.getElementById(OVERLAY_STATUS_ID);
      if (status) status.textContent = 'Type to search';
      loadIndex();
    }
  }

  function closeOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.documentElement.classList.remove('search-open');
    var list = document.getElementById(OVERLAY_RESULTS_ID);
    if (list) list.innerHTML = '';
  }

  function bindOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-search-close') !== null) {
        closeOverlay();
      }
    });

    var input = document.getElementById(OVERLAY_INPUT_ID);
    if (input) {
      var runSearch = debounce(function () {
        var q = input.value;
        STATE.q = q;
        var results = search(q);
        renderResults(
          { resultsId: OVERLAY_RESULTS_ID, statusId: OVERLAY_STATUS_ID },
          q,
          results
        );
      }, 80);
      input.addEventListener('input', runSearch);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) {
        e.preventDefault();
        closeOverlay();
      } else if (e.key === '/' && overlay.hidden) {
        var ae = document.activeElement;
        var tag = ae && ae.tagName;
        var isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          openOverlay();
        }
      }
    });
  }

  function bindOverlayTriggers() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-search-open]');
      if (!t) return;
      e.preventDefault();
      openOverlay();
    });
  }

  function bindSearchPage() {
    var input = document.getElementById(PAGE_INPUT_ID);
    if (!input) return;
    var run = debounce(function () {
      var q = input.value;
      var results = search(q);
      renderResults(
        { resultsId: PAGE_RESULTS_ID, statusId: PAGE_STATUS_ID },
        q,
        results
      );
    }, 80);
    input.addEventListener('input', run);
    loadIndex().then(function () { run(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    bindOverlay();
    bindOverlayTriggers();
    bindSearchPage();
    loadIndex();
  }
})();
