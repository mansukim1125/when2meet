'use strict';

const byId = (id) => document.getElementById(id);
const monthFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });
const fullDateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeZone: 'UTC' });
const apiBase = (window.API_BASE_URL || '').replace(/\/$/, '');
const pollId = new URLSearchParams(location.search).get('poll');

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function message(id, text = '', isError = false) {
  const element = byId(id);
  element.textContent = text;
  element.classList.toggle('error', isError);
  element.hidden = !text;
}

function dateLabel(key) {
  return fullDateFormat.format(new Date(key));
}

function localKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${apiBase}/api/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || '서버 응답을 확인할 수 없습니다.');
  return result;
}

function makeCalendar(prefix, { first, last, selectable, selected, boundary, decorate, onSelect, onMonthChange }) {
  const label = byId(`${prefix}-month`);
  const previous = byId(`${prefix}-prev`);
  const next = byId(`${prefix}-next`);
  const grid = byId(`${prefix}-days`);
  const firstMonth = first.slice(0, 7);
  const lastMonth = last?.slice(0, 7);
  let month = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1);
  let locked = false;

  function update() {
    const monthKey = localKey(month).slice(0, 7);
    previous.disabled = locked || monthKey <= firstMonth;
    next.disabled = locked || Boolean(lastMonth && monthKey >= lastMonth);
    for (const button of grid.querySelectorAll('button')) {
      const key = button.dataset.date;
      button.disabled = locked || !selectable(key);
      button.setAttribute('aria-pressed', selected(key));
      button.classList.toggle('range-edge', Boolean(boundary?.(key)));
      decorate?.(button, key);
    }
  }

  function render() {
    label.textContent = monthFormat.format(month);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const cells = Array.from({ length: month.getDay() }, () => make('span'));
    const today = localKey(new Date());
    for (let day = 1; day <= lastDay; day += 1) {
      const key = localKey(new Date(year, monthIndex, day));
      const button = make('button', 'day', day);
      button.type = 'button';
      button.dataset.date = key;
      button.setAttribute('aria-label', dateLabel(key));
      if (key === today) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => onSelect(key));
      cells.push(button);
    }
    grid.replaceChildren(...cells);
    update();
  }

  function move(change, control, other) {
    month = new Date(month.getFullYear(), month.getMonth() + change, 1);
    onMonthChange?.();
    render();
    if (control.disabled) {
      (other.disabled ? grid.querySelector('button:not(:disabled)') : other)?.focus();
    }
  }

  previous.addEventListener('click', () => move(-1, previous, next));
  next.addEventListener('click', () => move(1, next, previous));
  render();
  return {
    update,
    setLocked(value) {
      locked = value;
      update();
    },
  };
}

function rangeDates(start, end) {
  const day = new Date(start);
  const last = new Date(end);
  const count = (last - day) / 86_400_000 + 1;
  if (count > 60) return [];
  return Array.from({ length: count }, () => {
    const key = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return key;
  });
}

function initCreate() {
  const today = localKey(new Date());
  const title = byId('title');
  const description = byId('description');
  const submit = byId('create-button');
  const reset = byId('reset-range');
  let start;
  let end;
  let dates = [];
  let saving = false;

  const calendar = makeCalendar('create', {
    first: today,
    selectable: (key) => key >= today,
    selected: (key) => Boolean(start && key >= start && key <= (end || start)),
    boundary: (key) => key === start || key === end,
    onSelect(key) {
      if (!start || end) {
        start = key;
        end = undefined;
        dates = [];
      } else {
        const [first, last] = [start, key].sort();
        dates = rangeDates(first, last);
        if (!dates.length) {
          message('create-message', '후보 기간은 최대 60일까지 선택할 수 있어요.', true);
          return;
        }
        start = first;
        end = last;
      }
      message('create-message');
      updateRange();
    },
  });

  function updateSubmit() {
    submit.disabled = saving || !title.value.trim() || !dates.length;
  }

  function updateRange() {
    calendar.update();
    byId('date-count').textContent = `${dates.length}일`;
    byId('range-summary').textContent = end
      ? (start === end ? dateLabel(start) : `${dateLabel(start)} ~ ${dateLabel(end)}`)
      : (start ? `시작일 · ${dateLabel(start)}` : '시작일과 종료일을 선택해 주세요.');
    byId('create-calendar-hint').textContent = end
      ? '다른 기간을 고르려면 새 시작일을 선택해 주세요.'
      : (start ? '종료일을 선택해 주세요. 하루만 후보로 두려면 같은 날짜를 한 번 더 선택하세요.' : '달력에서 시작일을 선택해 주세요.');
    reset.hidden = !start;
    updateSubmit();
  }

  reset.addEventListener('click', () => {
    start = end = undefined;
    dates = [];
    message('create-message');
    updateRange();
    byId('create-days').querySelector('button:not(:disabled)')?.focus();
  });
  title.addEventListener('input', updateSubmit);
  byId('create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    saving = true;
    title.readOnly = description.readOnly = reset.disabled = true;
    calendar.setLocked(true);
    updateSubmit();
    message('create-message');
    try {
      const { id } = await api('polls', {
        method: 'POST',
        body: { title: title.value, description: description.value, dates },
      });
      const link = new URL(location.href);
      link.search = '';
      link.searchParams.set('poll', id);
      location.assign(link);
    } catch (error) {
      message('create-message', error.message, true);
      saving = false;
      title.readOnly = description.readOnly = reset.disabled = false;
      calendar.setLocked(false);
      updateSubmit();
    }
  });
  byId('create-view').hidden = false;
}

function initResults(dates, candidates) {
  const detail = byId('result-detail');
  const legend = byId('results-legend');
  let activeDate;
  let counts = new Map(dates.map((key) => [key, []]));
  let highest = 0;

  function renderDetail() {
    if (!activeDate) {
      detail.replaceChildren(make('p', 'hint', '날짜를 누르면 가능한 사람을 볼 수 있어요.'));
      return;
    }

    const names = counts.get(activeDate);
    const best = names.length > 0 && names.length === highest;
    const heading = make('div', 'result-detail-heading');
    heading.append(
      make('h4', '', dateLabel(activeDate)),
      make('strong', '', `${best ? '최다 · ' : ''}${names.length}명 가능`),
    );
    detail.replaceChildren(heading);
    if (names.length) {
      const list = make('ul', 'result-names');
      list.setAttribute('aria-label', '가능한 참여자');
      for (const name of names) list.append(make('li', '', name));
      detail.append(list);
    } else {
      detail.append(make('p', 'hint', '이 날짜에 가능한 사람이 없어요.'));
    }
  }

  const calendar = makeCalendar('results', {
    first: dates[0],
    last: dates.at(-1),
    selectable: (key) => candidates.has(key),
    selected: (key) => key === activeDate,
    decorate(button, key) {
      const names = counts.get(key);
      if (!names) return;
      const fraction = highest ? names.length / highest : 0;
      button.style.setProperty('--heat', `${fraction * 100}%`);
      button.classList.toggle('heat-dark', fraction >= 0.66);
      button.setAttribute('aria-label', `${dateLabel(key)}, ${names.length}명 가능`);
      button.setAttribute('aria-controls', detail.id);
    },
    onSelect(key) {
      activeDate = key;
      calendar.update();
      renderDetail();
    },
    onMonthChange() {
      activeDate = undefined;
      renderDetail();
    },
  });

  return (data) => {
    const total = data.responses.length;
    counts = new Map(dates.map((key) => [key, []]));
    for (const response of data.responses) {
      for (const key of response.dates) counts.get(key).push(response.name);
    }
    highest = Math.max(...[...counts.values()].map((names) => names.length));
    byId('response-count').textContent = total ? `${total}명 응답` : '아직 응답이 없어요.';
    legend.hidden = highest === 0;
    legend.setAttribute('aria-label', `색이 진할수록 가능한 사람이 많아요. 0명에서 ${highest}명까지 표시됩니다.`);
    byId('results-maximum').textContent = `${highest}명`;
    calendar.update();
    if (activeDate) renderDetail();
  };
}

async function initPoll() {
  byId('page-title').textContent = '모임';
  byId('page-description').textContent = '';
  message('page-status', '모임을 불러오는 중입니다.');
  if (!/^[A-Za-z0-9_-]{16}$/.test(pollId)) {
    message('page-status', '공유 링크를 확인해 주세요.', true);
    return;
  }

  const storageKey = `nalmoa:response:${pollId}`;
  let token;
  try {
    token = localStorage.getItem(storageKey);
  } catch {
    token = null;
  }

  const path = `polls/${pollId}`;
  let poll;
  try {
    poll = await api(path, { token });
  } catch (error) {
    message('page-status', error.message, true);
    return;
  }

  const chosen = new Set(poll.ownResponse?.dates);
  const name = byId('name');
  const submit = byId('response-button');
  const refresh = byId('refresh-button');
  const editing = Boolean(poll.ownResponse);
  if (editing) {
    name.value = poll.ownResponse.name;
    submit.textContent = '응답 수정';
  }

  const candidates = new Set(poll.dates);
  const voteCount = byId('vote-count');
  const voteCalendar = makeCalendar('vote', {
    first: poll.dates[0],
    last: poll.dates.at(-1),
    selectable: (key) => candidates.has(key),
    selected: (key) => chosen.has(key),
    onSelect(key) {
      if (chosen.has(key)) chosen.delete(key);
      else chosen.add(key);
      voteCalendar.update();
      voteCount.textContent = `${chosen.size}일 선택`;
      message('response-message');
    },
  });
  voteCount.textContent = `${chosen.size}일 선택`;

  const renderResults = initResults(poll.dates, candidates);

  byId('response-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled || refresh.disabled) return;
    if (!name.value.trim()) {
      message('response-message', '이름을 입력해 주세요.', true);
      name.focus();
      return;
    }

    submit.disabled = true;
    refresh.disabled = true;
    name.readOnly = true;
    voteCalendar.setLocked(true);
    message('response-message');
    let savedInBrowser = true;
    try {
      if (!token) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        token = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
      }
      try {
        localStorage.setItem(storageKey, token);
      } catch {
        savedInBrowser = false;
      }
      const updated = await api(`${path}/responses`, {
        method: 'PUT',
        body: { name: name.value, dates: [...chosen] },
        token,
      });
      renderResults(updated);
      submit.textContent = '응답 수정';
      message('response-message', savedInBrowser
        ? '응답을 저장했어요. 이 브라우저에서 다시 수정할 수 있어요.'
        : '응답을 저장했어요. 이 탭에서 다시 수정할 수 있어요.');
    } catch (error) {
      message('response-message', error.message, true);
    } finally {
      submit.disabled = false;
      refresh.disabled = false;
      name.readOnly = false;
      voteCalendar.setLocked(false);
    }
  });

  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    submit.disabled = true;
    message('results-message');
    try {
      renderResults(await api(path));
    } catch (error) {
      message('results-message', error.message, true);
    } finally {
      refresh.disabled = false;
      submit.disabled = false;
    }
  });

  const share = byId('share-button');
  share.hidden = false;
  share.addEventListener('click', async () => {
    const link = new URL(location.href);
    link.search = '';
    link.searchParams.set('poll', pollId);
    link.hash = '';
    try {
      await navigator.clipboard.writeText(link.href);
      share.textContent = '링크 복사 완료';
    } catch {
      const field = byId('share-fallback');
      field.value = link.href;
      field.hidden = false;
      field.select();
    }
  });

  document.title = `${poll.title} · 날모아`;
  byId('page-title').textContent = poll.title;
  byId('page-description').textContent = poll.description;
  byId('page-description').hidden = !poll.description;
  renderResults(poll);
  message('page-status');
  byId('poll-view').hidden = false;
}

if (pollId === null) initCreate();
else initPoll();
