/* ============================================
   The Station — Interactive Timeline App
   with ZH/EN language toggle
   ============================================ */

(function () {
  'use strict';

  // ========== i18n ==========
  const strings = {
    zh: {
      projectTimeline: '项目时间线',
      timelineVersion: '时间线 {version} — 更新于 {date}',
      today: '当前：{date}',
      taskHeader: '任务',
      criticalPath: '关键路径',
      milestone: '里程碑',
      todayLabel: '今天',
      days: '{n} 天',
      daysUnit: '天',
      commentsTitle: '备注与评论',
      commentsNotice: '评论对项目团队可见，请使用真实姓名。',
      namePlaceholder: '你的名字',
      commentPlaceholder: '添加备注或评论...',
      globalCommentPlaceholder: '项目总体评论...',
      postComment: '发表评论',
      posting: '提交中...',
      noComments: '暂无评论。',
      loading: '加载中...',
      allComments: '所有项目评论',
      footer: 'The Station Food Market · 项目时间线 · 内部使用',
      re: '关于：',
      criticalBadge: '⚠ 关键路径',
      completedBadge: '✓ 已完成',
      completedOn: '完成于 {date}',
      todayMarker: '今天',
      commentCountLabel: '{n} 条评论',
      commentCountZero: '暂无评论',
      langToggle: '<span class="lang-active">中文</span> / EN'
    },
    en: {
      projectTimeline: 'Project Timeline',
      timelineVersion: 'Timeline {version} — updated {date}',
      today: 'Now: {date}',
      taskHeader: 'Task',
      criticalPath: 'Critical Path',
      milestone: 'Milestone',
      todayLabel: 'Today',
      days: '{n} days',
      daysUnit: 'days',
      commentsTitle: 'Notes & Comments',
      commentsNotice: 'Comments are visible to the project team. Please use your real name.',
      namePlaceholder: 'Your name',
      commentPlaceholder: 'Add a note or comment...',
      globalCommentPlaceholder: 'General project comment...',
      postComment: 'Post Comment',
      posting: 'Posting...',
      noComments: 'No comments yet.',
      loading: 'Loading...',
      allComments: 'All Project Comments',
      footer: 'The Station Food Market · Project Timeline · Internal Use',
      re: 'Re: ',
      criticalBadge: '⚠ Critical Path',
      completedBadge: '✓ Completed',
      completedOn: 'Completed on {date}',
      todayMarker: 'TODAY',
      commentCountLabel: '{n} comments',
      commentCountZero: 'No comments',
      langToggle: '中文 / <span class="lang-active">EN</span>'
    }
  };

  let lang = localStorage.getItem('timeline-lang') || 'zh';

  function t(key, params) {
    let s = (strings[lang] && strings[lang][key]) || (strings.en[key]) || key;
    if (params) {
      Object.keys(params).forEach(k => {
        s = s.replace('{' + k + '}', params[k]);
      });
    }
    return s;
  }

  /** Get localized field from a data object. Falls back to English field. */
  function tl(obj, field) {
    if (lang === 'zh' && obj[field + 'Zh']) return obj[field + 'Zh'];
    return obj[field] || '';
  }

  function applyStaticI18n() {
    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    // Language toggle button
    const toggleBtn = document.getElementById('langToggle');
    if (toggleBtn) toggleBtn.innerHTML = t('langToggle');
  }

  // ========== State ==========
  let timeline = null;
  let activeTaskId = null;
  let didInitialTimeScroll = false;
  let commentCounts = {};
  let allCommentsCache = [];

  // ========== Constants ==========
  const DAY_MS = 86400000;

  // ========== Helpers ==========
  function parseDate(str) { return new Date(str + 'T00:00:00'); }
  function daysBetween(a, b) { return Math.round((b - a) / DAY_MS); }

  function formatDate(d) {
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatShort(d) {
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }
  function formatMonthYear(d) {
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }
  function formatDateTime(d) {
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return d.toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatRelative(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (lang === 'zh') {
      if (mins < 1) return '刚刚';
      if (mins < 60) return mins + '分钟前';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + '小时前';
      const days = Math.floor(hrs / 24);
      return days + '天前';
    }
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  const root = document.documentElement;
  const DAY_W = parseInt(getComputedStyle(root).getPropertyValue('--day-w')) || 28;

  // ========== Load & Render ==========
  async function loadTimeline() {
    const res = await fetch('/data/timeline.json');
    timeline = await res.json();
    renderAll();
  }

  function renderAll() {
    applyStaticI18n();

    const { meta, categories, tasks, milestones } = timeline;
    const rangeStart = parseDate(meta.dateRange.start);
    const rangeEnd = parseDate(meta.dateRange.end);
    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    // Header
    document.getElementById('versionBadge').textContent = t('timelineVersion', { version: meta.version, date: meta.updated });
    document.getElementById('todayBadge').textContent = t('today', { date: formatDateTime(now) });

    // Legend categories
    const legendEl = document.getElementById('legendCategories');
    legendEl.innerHTML = categories.map(c =>
      `<span class="legend-item"><span class="legend-swatch" style="background:${c.color}"></span>${tl(c, 'label')}</span>`
    ).join('');

    // Legend extras
    const extrasEl = document.querySelector('.legend-extras');
    if (extrasEl) {
      extrasEl.innerHTML = `
        <span class="legend-item"><span class="legend-icon legend-icon--critical"></span> ${t('criticalPath')}</span>
        <span class="legend-item"><span class="legend-icon legend-icon--milestone"></span> ${t('milestone')}</span>
        <span class="legend-item"><span class="legend-icon legend-icon--today"></span> ${t('todayLabel')}</span>
      `;
    }

    // Combined rows
    const rows = [];
    tasks.forEach(t => rows.push({ type: 'task', data: t, sortDate: parseDate(t.start) }));
    milestones.forEach(m => rows.push({ type: 'milestone', data: m, sortDate: parseDate(m.date) }));
    rows.sort((a, b) => a.sortDate - b.sortDate || (a.type === 'milestone' ? 1 : -1));

    // --- Labels ---
    const labelsEl = document.getElementById('ganttLabels');
    labelsEl.innerHTML = `<div class="gantt-label-header">${t('taskHeader')}</div>`;

    rows.forEach(row => {
      if (row.type === 'task') {
        const tk = row.data;
        const cat = categories.find(c => c.id === tk.category);
        const el = document.createElement('div');
        el.className = 'gantt-label-row' + (tk.status === 'completed' ? ' completed' : '');
        el.dataset.id = tk.id;
        el.innerHTML = `
          <span class="gantt-label-dot" style="background:${cat ? cat.color : '#666'}"></span>
          <span class="gantt-label-text">${tl(tk, 'label')}</span>
          ${tk.status === 'completed' ? `<span class="gantt-label-completed" title="${t('completedBadge')}">✓</span>` : ''}
          ${tk.critical ? '<span class="gantt-label-critical">●</span>' : ''}
        `;
        el.addEventListener('click', () => openDetail(tk.id));
        labelsEl.appendChild(el);
      } else {
        const m = row.data;
        const el = document.createElement('div');
        el.className = 'gantt-label-row milestone-row';
        el.innerHTML = `<span class="gantt-label-text">◆ ${tl(m, 'label')}</span>`;
        labelsEl.appendChild(el);
      }
    });

    // --- Chart Header ---
    const headerEl = document.getElementById('ganttHeader');
    const chartWidth = totalDays * DAY_W;
    headerEl.style.width = chartWidth + 'px';
    headerEl.innerHTML = '';

    let currentMonth = -1;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(rangeStart.getTime() + i * DAY_MS);
      if (d.getMonth() !== currentMonth) {
        currentMonth = d.getMonth();
        const monthEl = document.createElement('div');
        monthEl.className = 'gantt-month';
        monthEl.style.left = (i * DAY_W) + 'px';
        let monthEnd = i;
        while (monthEnd < totalDays) {
          const dd = new Date(rangeStart.getTime() + monthEnd * DAY_MS);
          if (dd.getMonth() !== currentMonth) break;
          monthEnd++;
        }
        monthEl.style.width = ((monthEnd - i) * DAY_W) + 'px';
        monthEl.textContent = formatMonthYear(d);
        headerEl.appendChild(monthEl);
      }

      const dayEl = document.createElement('div');
      dayEl.className = 'gantt-day';
      if (d.getDay() === 0 || d.getDay() === 6) dayEl.classList.add('weekend');
      dayEl.style.left = (i * DAY_W) + 'px';
      dayEl.textContent = d.getDate();
      headerEl.appendChild(dayEl);
    }

    // --- Chart Body ---
    const bodyEl = document.getElementById('ganttBody');
    bodyEl.style.width = chartWidth + 'px';
    bodyEl.innerHTML = '';

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(rangeStart.getTime() + i * DAY_MS);
      if (d.getDay() === 0 || d.getDay() === 6) {
        const col = document.createElement('div');
        col.className = 'gantt-weekend-col';
        col.style.left = (i * DAY_W) + 'px';
        bodyEl.appendChild(col);
      }
    }

    rows.forEach(row => {
      const rowEl = document.createElement('div');

      if (row.type === 'task') {
        const tk = row.data;
        const cat = categories.find(c => c.id === tk.category);
        const startDay = daysBetween(rangeStart, parseDate(tk.start));
        const endDay = daysBetween(rangeStart, parseDate(tk.end));
        const barLeft = startDay * DAY_W;
        const barWidth = (endDay - startDay + 1) * DAY_W;

        rowEl.className = 'gantt-row';

        const bar = document.createElement('div');
        bar.className = 'gantt-bar' + (tk.critical ? ' critical' : '') + (tk.status === 'completed' ? ' completed' : '');
        bar.style.left = barLeft + 'px';
        bar.style.width = barWidth + 'px';
        bar.style.background = cat ? cat.color : '#666';
        bar.dataset.id = tk.id;
        bar.textContent = (tk.status === 'completed' ? '✓ ' : '') + tl(tk, 'label');

        bar.addEventListener('click', () => openDetail(tk.id));
        bar.addEventListener('mouseenter', (e) => showTooltip(e, tk));
        bar.addEventListener('mouseleave', hideTooltip);

        rowEl.appendChild(bar);
      } else {
        const m = row.data;
        const msDay = daysBetween(rangeStart, parseDate(m.date));
        const msLeft = msDay * DAY_W + DAY_W / 2;

        rowEl.className = 'gantt-row milestone-row';

        const diamond = document.createElement('div');
        diamond.className = 'gantt-milestone' + (m.critical ? ' critical' : '');
        diamond.style.left = msLeft + 'px';

        diamond.addEventListener('mouseenter', (e) => showTooltip(e, { label: m.label, labelZh: m.labelZh, start: m.date, end: m.date, notes: '', notesZh: '' }));
        diamond.addEventListener('mouseleave', hideTooltip);

        rowEl.appendChild(diamond);
      }

      bodyEl.appendChild(rowEl);
    });

    // Current-time line. Position is updated by updateCurrentTimeMarker(),
    // so the marker moves during the day without reloading the page.
    const todayLine = document.createElement('div');
    todayLine.className = 'gantt-today';
    todayLine.dataset.label = t('todayMarker');
    bodyEl.appendChild(todayLine);

    // If detail panel is open, re-render it
    if (activeTaskId && panelEl.classList.contains('open')) {
      openDetail(activeTaskId);
    }

    loadGlobalComments();

    // Update current-time marker label/position for current language.
    todayStyle.textContent = `.gantt-today::before { content: '${t('todayMarker')}'; }`;
    updateCurrentTimeMarker({ scrollIntoView: !didInitialTimeScroll });
    didInitialTimeScroll = true;

    // Apply cached comment badges then refresh from API
    applyCommentBadges();
    refreshCommentCounts();
  }

  // ========== Current-time marker ==========
  function getCurrentTimeOffset(rangeStart, totalDays) {
    const now = new Date();
    return {
      now,
      offsetDays: (now.getTime() - rangeStart.getTime()) / DAY_MS,
      inRange: now >= rangeStart && (now.getTime() - rangeStart.getTime()) / DAY_MS <= totalDays
    };
  }

  function updateCurrentTimeMarker(options = {}) {
    if (!timeline) return;
    const { meta } = timeline;
    const rangeStart = parseDate(meta.dateRange.start);
    const rangeEnd = parseDate(meta.dateRange.end);
    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
    const { now, offsetDays, inRange } = getCurrentTimeOffset(rangeStart, totalDays);

    const badge = document.getElementById('todayBadge');
    if (badge) badge.textContent = t('today', { date: formatDateTime(now) });

    const line = document.querySelector('.gantt-today');
    if (!line) return;
    if (!inRange) {
      line.style.display = 'none';
      return;
    }

    line.style.display = '';
    line.style.left = (offsetDays * DAY_W) + 'px';
    line.dataset.label = t('todayMarker');

    if (options.scrollIntoView) {
      const scrollEl = document.getElementById('ganttScroll');
      if (scrollEl) {
        const targetScroll = Math.max(0, offsetDays * DAY_W - scrollEl.clientWidth / 3);
        scrollEl.scrollLeft = targetScroll;
      }
    }
  }

  // ========== Tooltip ==========
  let tooltipEl = null;

  function showTooltip(e, task) {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'gantt-tooltip';
      document.body.appendChild(tooltipEl);
    }

    const startDate = formatShort(parseDate(task.start));
    const endDate = formatShort(parseDate(task.end));
    const days = daysBetween(parseDate(task.start), parseDate(task.end)) + 1;
    const notes = tl(task, 'notes');

    tooltipEl.innerHTML = `
      <div class="gantt-tooltip-title">${task.status === 'completed' ? '✓ ' : ''}${tl(task, 'label')}</div>
      <div class="gantt-tooltip-dates">${startDate} → ${endDate} (${t('days', { n: days })})</div>
      ${task.status === 'completed' ? `<div class="gantt-tooltip-completed">${task.completedDate ? t('completedOn', { date: formatDate(parseDate(task.completedDate)) }) : t('completedBadge')}</div>` : ''}
      ${notes ? `<div class="gantt-tooltip-notes">${notes}</div>` : ''}
    `;

    tooltipEl.classList.add('visible');
    positionTooltip(e);
  }

  function positionTooltip(e) {
    if (!tooltipEl) return;
    const x = e.clientX + 12;
    const y = e.clientY + 12;
    tooltipEl.style.left = Math.min(x, window.innerWidth - 320) + 'px';
    tooltipEl.style.top = Math.min(y, window.innerHeight - 150) + 'px';
  }

  document.addEventListener('mousemove', (e) => {
    if (tooltipEl && tooltipEl.classList.contains('visible')) positionTooltip(e);
  });

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }

  // ========== Detail Panel ==========
  const panelEl = document.getElementById('detailPanel');
  const contentEl = document.getElementById('detailContent');
  const closeBtn = document.getElementById('detailClose');

  function openDetail(taskId) {
    const task = timeline.tasks.find(tk => tk.id === taskId);
    if (!task) return;
    activeTaskId = taskId;

    const cat = timeline.categories.find(c => c.id === task.category);
    const startDate = formatDate(parseDate(task.start));
    const endDate = formatDate(parseDate(task.end));
    const days = daysBetween(parseDate(task.start), parseDate(task.end)) + 1;
    const notes = tl(task, 'notes');

    contentEl.innerHTML = `
      <div class="detail-task-name">${tl(task, 'label')}</div>
      <div class="detail-category" style="background:${cat ? cat.color + '20' : '#66666620'}; color:${cat ? cat.color : '#666'}">
        <span class="gantt-label-dot" style="background:${cat ? cat.color : '#666'}"></span>
        ${cat ? tl(cat, 'label') : ''}
      </div>
      <div class="detail-dates">${startDate} → ${endDate}</div>
      <div class="detail-duration">${t('days', { n: days })}</div>
      ${task.critical ? `<div class="detail-critical-badge">${t('criticalBadge')}</div>` : ''}
      ${task.status === 'completed' ? `<div class="detail-completed-badge">${task.completedDate ? t('completedOn', { date: formatDate(parseDate(task.completedDate)) }) : t('completedBadge')}</div>` : ''}
      ${notes ? `<div class="detail-notes">${notes}</div>` : ''}
    `;

    document.querySelectorAll('.gantt-label-row').forEach(r => r.classList.remove('active'));
    const labelRow = document.querySelector(`.gantt-label-row[data-id="${taskId}"]`);
    if (labelRow) labelRow.classList.add('active');

    panelEl.classList.add('open');
    loadTaskComments(taskId);
    updateDetailCommentCount();
  }

  closeBtn.addEventListener('click', () => {
    panelEl.classList.remove('open');
    activeTaskId = null;
    document.querySelectorAll('.gantt-label-row').forEach(r => r.classList.remove('active'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelEl.classList.contains('open')) closeBtn.click();
  });

  // ========== Comments API ==========
  const API_BASE = '/api/comments';

  async function fetchComments(taskId) {
    try {
      const url = taskId ? `${API_BASE}?taskId=${encodeURIComponent(taskId)}` : API_BASE;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed');
      return await res.json();
    } catch (err) {
      console.warn('Comments fetch failed:', err);
      return [];
    }
  }

  async function postComment(name, text, taskId) {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text, taskId: taskId || null })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to post comment');
    }
    return await res.json();
  }

  function renderComments(comments, listEl, showTaskRef) {
    if (!comments.length) {
      listEl.innerHTML = `<div class="comments-empty">${t('noComments')}</div>`;
      return;
    }
    listEl.innerHTML = comments
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(c => `
        <div class="comment-item">
          <div class="comment-header">
            <span class="comment-author">${escapeHtml(c.name)}</span>
            <span class="comment-time">${formatRelative(c.timestamp)}</span>
          </div>
          <div class="comment-body">${escapeHtml(c.text)}</div>
          ${showTaskRef && c.taskId ? `<div class="comment-task-ref">${t('re')}${getTaskLabel(c.taskId)}</div>` : ''}
        </div>
      `).join('');
  }

  function getTaskLabel(taskId) {
    const tk = timeline.tasks.find(t => t.id === taskId);
    return tk ? tl(tk, 'label') : taskId;
  }

  // ========== Comment Count Badges ==========
  async function refreshCommentCounts() {
    try {
      allCommentsCache = await fetchComments();
      commentCounts = {};
      allCommentsCache.forEach(c => {
        if (c.taskId) commentCounts[c.taskId] = (commentCounts[c.taskId] || 0) + 1;
      });
      applyCommentBadges();
    } catch (_) { /* silent */ }
  }

  function applyCommentBadges() {
    // Label rows
    document.querySelectorAll('.gantt-label-row[data-id]').forEach(row => {
      const id = row.dataset.id;
      const count = commentCounts[id] || 0;
      let badge = row.querySelector('.comment-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'comment-badge';
          row.appendChild(badge);
        }
        badge.textContent = '\uD83D\uDCAC' + count;
        badge.title = t('commentCountLabel', { n: count });
      } else if (badge) {
        badge.remove();
      }
    });

    // Gantt bars intentionally keep no inline comment badge to avoid visual clutter.
    document.querySelectorAll('.gantt-bar .bar-comment-badge').forEach(badge => badge.remove());

    // Global comments header count
    const globalHeader = document.querySelector('[data-i18n="allComments"]');
    if (globalHeader) {
      const total = allCommentsCache.length;
      let badge = globalHeader.querySelector('.global-comment-count');
      if (total > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'global-comment-count';
          globalHeader.appendChild(badge);
        }
        badge.textContent = total;
      } else if (badge) {
        badge.remove();
      }
    }

    // Detail panel
    updateDetailCommentCount();
  }

  function updateDetailCommentCount() {
    const countEl = document.getElementById('detailCommentCount');
    if (!countEl || !activeTaskId) return;
    const count = commentCounts[activeTaskId] || 0;
    countEl.textContent = count > 0
      ? t('commentCountLabel', { n: count })
      : t('commentCountZero');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadTaskComments(taskId) {
    const listEl = document.getElementById('commentsList');
    listEl.innerHTML = `<div class="comments-empty">${t('loading')}</div>`;
    const comments = await fetchComments(taskId);
    renderComments(comments, listEl, false);
  }

  async function loadGlobalComments() {
    const listEl = document.getElementById('globalCommentsList');
    listEl.innerHTML = `<div class="comments-empty">${t('loading')}</div>`;
    const comments = await fetchComments();
    renderComments(comments, listEl, true);
  }

  // ========== Comment Forms ==========
  const taskForm = document.getElementById('commentForm');
  const taskNameInput = document.getElementById('commentName');
  const taskTextInput = document.getElementById('commentText');
  const taskCharCount = document.getElementById('charCount');

  taskTextInput.addEventListener('input', () => {
    taskCharCount.textContent = `${taskTextInput.value.length} / 500`;
  });

  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = taskForm.querySelector('.comment-submit');
    btn.disabled = true;
    btn.textContent = t('posting');
    try {
      await postComment(taskNameInput.value.trim(), taskTextInput.value.trim(), activeTaskId);
      taskTextInput.value = '';
      taskCharCount.textContent = '0 / 500';
      localStorage.setItem('timeline-username', taskNameInput.value.trim());
      await loadTaskComments(activeTaskId);
      await loadGlobalComments();
      await refreshCommentCounts();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = t('postComment');
    }
  });

  const globalForm = document.getElementById('globalCommentForm');
  const globalNameInput = document.getElementById('globalCommentName');
  const globalTextInput = document.getElementById('globalCommentText');
  const globalCharCount = document.getElementById('globalCharCount');

  globalTextInput.addEventListener('input', () => {
    globalCharCount.textContent = `${globalTextInput.value.length} / 500`;
  });

  globalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = globalForm.querySelector('.comment-submit');
    btn.disabled = true;
    btn.textContent = t('posting');
    try {
      await postComment(globalNameInput.value.trim(), globalTextInput.value.trim(), null);
      globalTextInput.value = '';
      globalCharCount.textContent = '0 / 500';
      localStorage.setItem('timeline-username', globalNameInput.value.trim());
      await loadGlobalComments();
      await refreshCommentCounts();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = t('postComment');
    }
  });

  // Restore saved username
  const savedName = localStorage.getItem('timeline-username');
  if (savedName) {
    taskNameInput.value = savedName;
    globalNameInput.value = savedName;
  }

  // ========== Language Toggle ==========
  const langToggle = document.getElementById('langToggle');
  langToggle.addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('timeline-lang', lang);
    renderAll();
  });

  // ========== Today marker label via dynamic CSS ==========
  const todayStyle = document.createElement('style');
  document.head.appendChild(todayStyle);

  // ========== Init ==========
  loadTimeline();
  setInterval(() => updateCurrentTimeMarker(), 60000);

})();
