/* ============================================
   The Station — Interactive Timeline App
   ============================================ */

(function () {
  'use strict';

  // --- State ---
  let timeline = null;
  let activeTaskId = null;

  // --- Constants ---
  const DAY_MS = 86400000;

  // --- Helpers ---
  function parseDate(str) { return new Date(str + 'T00:00:00'); }
  function daysBetween(a, b) { return Math.round((b - a) / DAY_MS); }
  function formatDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatShort(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function formatRelative(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  const root = document.documentElement;
  const DAY_W = parseInt(getComputedStyle(root).getPropertyValue('--day-w')) || 28;
  const ROW_H = parseInt(getComputedStyle(root).getPropertyValue('--row-h')) || 40;

  // --- Load timeline data ---
  async function loadTimeline() {
    const res = await fetch('/data/timeline.json');
    timeline = await res.json();
    renderAll();
  }

  // --- Render everything ---
  function renderAll() {
    const { meta, categories, tasks, milestones } = timeline;
    const rangeStart = parseDate(meta.dateRange.start);
    const rangeEnd = parseDate(meta.dateRange.end);
    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Header meta
    document.getElementById('versionBadge').textContent = `Timeline ${meta.version} — updated ${meta.updated}`;
    document.getElementById('todayBadge').textContent = `Today: ${formatDate(today)}`;

    // Legend
    const legendEl = document.getElementById('legendCategories');
    legendEl.innerHTML = categories.map(c =>
      `<span class="legend-item"><span class="legend-swatch" style="background:${c.color}"></span>${c.label}</span>`
    ).join('');

    // Build combined rows: tasks + milestones interleaved by date
    const rows = [];
    tasks.forEach(t => rows.push({ type: 'task', data: t, sortDate: parseDate(t.start) }));
    milestones.forEach(m => rows.push({ type: 'milestone', data: m, sortDate: parseDate(m.date) }));
    rows.sort((a, b) => a.sortDate - b.sortDate || (a.type === 'milestone' ? 1 : -1));

    // Remove duplicate milestones that match task ends
    // (keep milestones as visual markers but don't duplicate labels)

    // --- Render Labels ---
    const labelsEl = document.getElementById('ganttLabels');
    labelsEl.innerHTML = '<div class="gantt-label-header">Task</div>';

    rows.forEach(row => {
      if (row.type === 'task') {
        const t = row.data;
        const cat = categories.find(c => c.id === t.category);
        const el = document.createElement('div');
        el.className = 'gantt-label-row';
        el.dataset.id = t.id;
        el.innerHTML = `
          <span class="gantt-label-dot" style="background:${cat ? cat.color : '#666'}"></span>
          <span class="gantt-label-text">${t.label}</span>
          ${t.critical ? '<span class="gantt-label-critical">●</span>' : ''}
        `;
        el.addEventListener('click', () => openDetail(t.id));
        labelsEl.appendChild(el);
      } else {
        const m = row.data;
        const el = document.createElement('div');
        el.className = 'gantt-label-row milestone-row';
        el.innerHTML = `<span class="gantt-label-text">◆ ${m.label}</span>`;
        labelsEl.appendChild(el);
      }
    });

    // --- Render Chart Header ---
    const headerEl = document.getElementById('ganttHeader');
    const chartWidth = totalDays * DAY_W;
    headerEl.style.width = chartWidth + 'px';
    headerEl.innerHTML = '';

    // Month labels
    let currentMonth = -1;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(rangeStart.getTime() + i * DAY_MS);
      if (d.getMonth() !== currentMonth) {
        currentMonth = d.getMonth();
        const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const monthEl = document.createElement('div');
        monthEl.className = 'gantt-month';
        monthEl.style.left = (i * DAY_W) + 'px';
        // Calculate width to end of month
        let monthEnd = i;
        while (monthEnd < totalDays) {
          const dd = new Date(rangeStart.getTime() + monthEnd * DAY_MS);
          if (dd.getMonth() !== currentMonth) break;
          monthEnd++;
        }
        monthEl.style.width = ((monthEnd - i) * DAY_W) + 'px';
        monthEl.textContent = monthLabel;
        headerEl.appendChild(monthEl);
      }

      // Day numbers
      const dayEl = document.createElement('div');
      dayEl.className = 'gantt-day';
      if (d.getDay() === 0 || d.getDay() === 6) dayEl.classList.add('weekend');
      dayEl.style.left = (i * DAY_W) + 'px';
      dayEl.textContent = d.getDate();
      headerEl.appendChild(dayEl);
    }

    // --- Render Chart Body ---
    const bodyEl = document.getElementById('ganttBody');
    bodyEl.style.width = chartWidth + 'px';
    bodyEl.innerHTML = '';

    // Weekend columns (full height)
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(rangeStart.getTime() + i * DAY_MS);
      if (d.getDay() === 0 || d.getDay() === 6) {
        const col = document.createElement('div');
        col.className = 'gantt-weekend-col';
        col.style.left = (i * DAY_W) + 'px';
        bodyEl.appendChild(col);
      }
    }

    // Rows
    rows.forEach(row => {
      const rowEl = document.createElement('div');

      if (row.type === 'task') {
        const t = row.data;
        const cat = categories.find(c => c.id === t.category);
        const startDay = daysBetween(rangeStart, parseDate(t.start));
        const endDay = daysBetween(rangeStart, parseDate(t.end));
        const barLeft = startDay * DAY_W;
        const barWidth = (endDay - startDay + 1) * DAY_W;

        rowEl.className = 'gantt-row';

        const bar = document.createElement('div');
        bar.className = 'gantt-bar' + (t.critical ? ' critical' : '');
        bar.style.left = barLeft + 'px';
        bar.style.width = barWidth + 'px';
        bar.style.background = cat ? cat.color : '#666';
        bar.dataset.id = t.id;
        bar.textContent = t.label;

        bar.addEventListener('click', () => openDetail(t.id));
        bar.addEventListener('mouseenter', (e) => showTooltip(e, t));
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

        diamond.addEventListener('mouseenter', (e) => showTooltip(e, { label: m.label, start: m.date, end: m.date, notes: '' }));
        diamond.addEventListener('mouseleave', hideTooltip);

        rowEl.appendChild(diamond);
      }

      bodyEl.appendChild(rowEl);
    });

    // Today line
    const todayOffset = daysBetween(rangeStart, today);
    if (todayOffset >= 0 && todayOffset <= totalDays) {
      const todayLine = document.createElement('div');
      todayLine.className = 'gantt-today';
      todayLine.style.left = (todayOffset * DAY_W + DAY_W / 2) + 'px';
      bodyEl.appendChild(todayLine);
    }

    // Scroll to today
    const scrollEl = document.getElementById('ganttScroll');
    const targetScroll = Math.max(0, todayOffset * DAY_W - scrollEl.clientWidth / 3);
    scrollEl.scrollLeft = targetScroll;

    // Sync label scroll with gantt body (vertical)
    // Not needed since we don't have vertical scroll in this layout

    // Load global comments
    loadGlobalComments();
  }

  // --- Tooltip ---
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

    tooltipEl.innerHTML = `
      <div class="gantt-tooltip-title">${task.label}</div>
      <div class="gantt-tooltip-dates">${startDate} → ${endDate} (${days} days)</div>
      ${task.notes ? `<div class="gantt-tooltip-notes">${task.notes}</div>` : ''}
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
    if (tooltipEl && tooltipEl.classList.contains('visible')) {
      positionTooltip(e);
    }
  });

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }

  // --- Detail Panel ---
  const panelEl = document.getElementById('detailPanel');
  const contentEl = document.getElementById('detailContent');
  const closeBtn = document.getElementById('detailClose');

  function openDetail(taskId) {
    const task = timeline.tasks.find(t => t.id === taskId);
    if (!task) return;
    activeTaskId = taskId;

    const cat = timeline.categories.find(c => c.id === task.category);
    const startDate = formatDate(parseDate(task.start));
    const endDate = formatDate(parseDate(task.end));
    const days = daysBetween(parseDate(task.start), parseDate(task.end)) + 1;

    contentEl.innerHTML = `
      <div class="detail-task-name">${task.label}</div>
      <div class="detail-category" style="background:${cat ? cat.color + '20' : '#66666620'}; color:${cat ? cat.color : '#666'}">
        <span class="gantt-label-dot" style="background:${cat ? cat.color : '#666'}"></span>
        ${cat ? cat.label : ''}
      </div>
      <div class="detail-dates">${startDate} → ${endDate}</div>
      <div class="detail-duration">${days} days</div>
      ${task.critical ? '<div class="detail-critical-badge">⚠ Critical Path</div>' : ''}
      ${task.notes ? `<div class="detail-notes">${task.notes}</div>` : ''}
    `;

    // Highlight row
    document.querySelectorAll('.gantt-label-row').forEach(r => r.classList.remove('active'));
    const labelRow = document.querySelector(`.gantt-label-row[data-id="${taskId}"]`);
    if (labelRow) labelRow.classList.add('active');

    panelEl.classList.add('open');
    loadTaskComments(taskId);
  }

  closeBtn.addEventListener('click', () => {
    panelEl.classList.remove('open');
    activeTaskId = null;
    document.querySelectorAll('.gantt-label-row').forEach(r => r.classList.remove('active'));
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelEl.classList.contains('open')) {
      closeBtn.click();
    }
  });

  // --- Comments API ---
  const API_BASE = '/api/comments';

  async function fetchComments(taskId) {
    try {
      const url = taskId ? `${API_BASE}?taskId=${encodeURIComponent(taskId)}` : API_BASE;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load comments');
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
      listEl.innerHTML = '<div class="comments-empty">No comments yet.</div>';
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
          ${showTaskRef && c.taskId ? `<div class="comment-task-ref">Re: ${getTaskLabel(c.taskId)}</div>` : ''}
        </div>
      `).join('');
  }

  function getTaskLabel(taskId) {
    const t = timeline.tasks.find(t => t.id === taskId);
    return t ? t.label : taskId;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Task-specific comments
  async function loadTaskComments(taskId) {
    const listEl = document.getElementById('commentsList');
    listEl.innerHTML = '<div class="comments-empty">Loading...</div>';
    const comments = await fetchComments(taskId);
    renderComments(comments, listEl, false);
  }

  // Global comments
  async function loadGlobalComments() {
    const listEl = document.getElementById('globalCommentsList');
    listEl.innerHTML = '<div class="comments-empty">Loading...</div>';
    const comments = await fetchComments();
    renderComments(comments, listEl, true);
  }

  // --- Comment Forms ---
  // Task-specific form
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
    btn.textContent = 'Posting...';
    try {
      await postComment(taskNameInput.value.trim(), taskTextInput.value.trim(), activeTaskId);
      taskTextInput.value = '';
      taskCharCount.textContent = '0 / 500';
      // Remember name
      localStorage.setItem('timeline-username', taskNameInput.value.trim());
      await loadTaskComments(activeTaskId);
      await loadGlobalComments();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post Comment';
    }
  });

  // Global form
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
    btn.textContent = 'Posting...';
    try {
      await postComment(globalNameInput.value.trim(), globalTextInput.value.trim(), null);
      globalTextInput.value = '';
      globalCharCount.textContent = '0 / 500';
      localStorage.setItem('timeline-username', globalNameInput.value.trim());
      await loadGlobalComments();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post Comment';
    }
  });

  // Restore saved username
  const savedName = localStorage.getItem('timeline-username');
  if (savedName) {
    taskNameInput.value = savedName;
    globalNameInput.value = savedName;
  }

  // --- Init ---
  loadTimeline();

})();
