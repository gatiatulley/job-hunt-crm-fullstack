const API = 'http://localhost:8000'

const state = {
  screen: 'dashboard',
  context: null,
  profiles: [],
  resumes: [],
  letters: [],
  presets: [],
  runs: [],
  currentRun: null,
  vacancies: [],
  selectedVacancyIds: [],
  query: 'project manager',
  orTerms: ['project manager', 'project coordinator', 'business analyst'],
  andTerms: ['IT'],
  notTerms: ['senior'],
  filters: {
    location: 'Moscow',
    format: 'Remote / Hybrid',
    experience: 'No experience / 1-3 years',
    employment: 'Full-time / Internship',
    salary_from: 70000,
    salary_only: true,
    excluded: 'sales, lead',
  },
  queryPreview: { built_query: '', human_readable: '' },
  advanced: false,
  bulkForm: { mode: 'target', target_success: 30, max_attempts: 100, dry_run: true },
  activeLetterId: null,
  activeLetterDraft: { name: '', content: '', is_default: false },
  saveMessage: '',
  pollId: null,
}

function iconFor(label) {
  const map = {
    Dashboard: '🏠', Search: '🔎', Results: '💼', 'Bulk Apply': '🎯', 'Run Progress': '▶️', Logs: '📊', Resumes: '📄', Profiles: '👤', Letters: '💌'
  }
  return map[label] || '✨'
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json()
}

async function bootstrap() {
  try {
    const [context, profiles, resumes, letters, presets, runs] = await Promise.all([
      api('/api/context'),
      api('/api/profiles'),
      api('/api/resumes'),
      api('/api/letters'),
      api('/api/search/presets'),
      api('/api/apply/runs'),
    ])
    state.context = context
    state.profiles = profiles
    state.resumes = resumes
    state.letters = letters
    state.presets = presets
    state.runs = runs
    const defaultLetter = letters.find((item) => item.is_default) || letters[0]
    if (defaultLetter) {
      state.activeLetterId = defaultLetter.id
      state.activeLetterDraft = { ...defaultLetter }
    }
    if (presets[0]) {
      const preset = presets[0]
      state.query = preset.query || ''
      state.orTerms = preset.or_terms || []
      state.andTerms = preset.and_terms || []
      state.notTerms = preset.not_terms || []
      state.filters = preset.filters || state.filters
    }
    await previewQuery()
    render()
  } catch (err) {
    document.getElementById('app').innerHTML = `<div class="boot">Не удалось загрузить сервис: ${escapeHtml(err.message)}</div>`
  }
}

async function previewQuery() {
  state.queryPreview = await api('/api/search/query-preview', {
    method: 'POST',
    body: JSON.stringify({
      query: state.query,
      or_terms: state.orTerms,
      and_terms: state.andTerms,
      not_terms: state.notTerms,
    }),
  })
}

async function runSearch() {
  const data = await api('/api/search/vacancies', {
    method: 'POST',
    body: JSON.stringify({
      query: state.query,
      or_terms: state.orTerms,
      and_terms: state.andTerms,
      not_terms: state.notTerms,
      filters: state.filters,
    }),
  })
  state.queryPreview = { built_query: data.built_query, human_readable: data.human_readable }
  state.vacancies = data.vacancies
  state.selectedVacancyIds = data.vacancies.slice(0, 2).map((v) => v.id)
  state.screen = 'results'
  render()
}

async function activateProfile(profileId) {
  await api('/api/profiles/activate', { method: 'POST', body: JSON.stringify({ profile_id: profileId }) })
  await bootstrap()
}

async function activateResume(resumeId) {
  await api('/api/resumes/activate', { method: 'POST', body: JSON.stringify({ resume_id: resumeId }) })
  await bootstrap()
}

async function saveLetter() {
  await api(`/api/letters/${state.activeLetterId}`, {
    method: 'PUT',
    body: JSON.stringify(state.activeLetterDraft),
  })
  state.saveMessage = 'Изменения сохранены'
  render()
  setTimeout(() => {
    state.saveMessage = ''
    render()
  }, 1800)
  await bootstrap()
}

async function startRun() {
  const run = await api('/api/apply/start', {
    method: 'POST',
    body: JSON.stringify({
      mode: state.bulkForm.mode,
      target_success: Number(state.bulkForm.target_success),
      max_attempts: Number(state.bulkForm.max_attempts),
      selected_vacancy_ids: state.selectedVacancyIds,
      dry_run: state.bulkForm.dry_run,
      preset_name: state.presets[0]?.name || 'Custom preset',
    }),
  })
  state.currentRun = run
  state.screen = 'progress'
  await refreshRuns()
  startPolling()
  render()
}

async function refreshRuns() {
  state.runs = await api('/api/apply/runs')
}

function startPolling() {
  stopPolling()
  state.pollId = setInterval(async () => {
    if (!state.currentRun) return
    const run = await api(`/api/apply/runs/${state.currentRun.id}`)
    state.currentRun = run
    await refreshRuns()
    render()
    if (run.status !== 'running') stopPolling()
  }, 1000)
}

function stopPolling() {
  if (state.pollId) {
    clearInterval(state.pollId)
    state.pollId = null
  }
}

function setScreen(screen) {
  state.screen = screen
  if (screen === 'progress' && state.currentRun?.status === 'running') startPolling()
  render()
}

function metrics() {
  const latest = state.runs[0]
  return {
    found: state.vacancies.length || 128,
    success: latest?.success ?? 18,
    failed: latest?.failed ?? 7,
    progress: latest?.target_success ? `${Math.round((latest.success / latest.target_success) * 100) || 0}%` : '60%',
  }
}

function statusClass(status) {
  return `status-pill ${status}`
}

function selectedCount() {
  return state.selectedVacancyIds.length
}

function toggleVacancy(id) {
  if (state.selectedVacancyIds.includes(id)) state.selectedVacancyIds = state.selectedVacancyIds.filter((x) => x !== id)
  else state.selectedVacancyIds.push(id)
  render()
}

function addTag(kind) {
  const input = document.getElementById(`tag-input-${kind}`)
  const value = input.value.trim()
  if (!value) return
  if (kind === 'or') state.orTerms.push(value)
  if (kind === 'and') state.andTerms.push(value)
  if (kind === 'not') state.notTerms.push(value)
  input.value = ''
  previewQuery().then(render)
}

function removeTag(kind, idx) {
  if (kind === 'or') state.orTerms.splice(idx, 1)
  if (kind === 'and') state.andTerms.splice(idx, 1)
  if (kind === 'not') state.notTerms.splice(idx, 1)
  previewQuery().then(render)
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
}

function renderTagEditor(kind, label, items, placeholder) {
  return `
    <div class="card">
      <div class="card-header">${label}</div>
      <div class="tag-wrap">
        ${items.length ? items.map((item, idx) => `<span class="tag-pill">${escapeHtml(item)} <button data-action="remove-tag" data-kind="${kind}" data-idx="${idx}">✕</button></span>`).join('') : '<span class="field-help">Пока пусто</span>'}
      </div>
      <div class="tag-controls">
        <input class="input" id="tag-input-${kind}" placeholder="${escapeHtml(placeholder)}" />
        <button class="btn btn-primary" data-action="add-tag" data-kind="${kind}">➕ Добавить</button>
      </div>
    </div>
  `
}

function renderDashboard() {
  const m = metrics()
  return `
    <div class="section-title">
      <div><h2>Job Hunt CRM</h2></div>
      <button class="btn btn-primary" data-action="screen" data-screen="search">🔎 Начать поиск</button>
    </div>
    <div class="stats-grid">
      ${statCard('Найдено вакансий', m.found, 'последний поиск', '💼')}
      ${statCard('Success', m.success, 'последний запуск', '✅')}
      ${statCard('Failed', m.failed, 'с ошибками', '⚠️')}
      ${statCard('Target progress', m.progress, 'целевой сценарий', '🎯')}
    </div>
    <div class="two-col-layout">
      <div class="card">
        <div class="card-header">🎀 Быстрые действия</div>
        <div class="quick-grid">
          ${actionCard('Поиск вакансий', 'Фильтры, Boolean и шаблоны', 'search')}
          ${actionCard('Mass apply', 'Перейти к массовому отклику', 'results')}
          ${actionCard('История запусков', 'Проверить success и ошибки', 'logs')}
          ${actionCard('Шаблоны писем', 'Редактировать и сохранять', 'letters')}
        </div>
      </div>
      <div class="card">
        <div class="card-header">🐱 Текущий контекст</div>
        <div class="stack-col gap16">
          ${infoBox('Активный профиль', state.context.profile.name)}
          ${infoBox('Активное резюме', state.context.resume.title)}
          <div class="pink-alert">Сессия hh активна.</div>
        </div>
      </div>
    </div>
  `
}

function renderSearch() {
  return `
    <div class="section-title">
      <div><h2>Поиск вакансий</h2></div>
      <span class="tiny-badge">pinky mode</span>
    </div>
    <div class="card">
      <div class="search-top-row">
        <input class="input input-lg" id="query-input" value="${escapeHtml(state.query)}" placeholder="Введите ключевую роль" />
        <div class="btn-row">
          <button class="btn btn-outline">Выбрать шаблон</button>
          <button class="btn btn-outline">Сохранить</button>
          <button class="btn btn-primary" data-action="run-search">Найти вакансии</button>
        </div>
      </div>
      <div class="preset-row">
        ${(state.presets || []).map((p) => `<span class="pill soft">${escapeHtml(p.name || p)}</span>`).join('')}
      </div>
    </div>
    <div class="two-col-layout search-layout">
      <div class="card">
        <div class="card-header">💗 Фильтры</div>
        <div class="form-grid">
          ${field('Регион', `<input class="input" id="filter-location" value="${escapeHtml(state.filters.location)}" />`)}
          ${field('Формат работы', `<input class="input" id="filter-format" value="${escapeHtml(state.filters.format)}" />`)}
          ${field('Опыт', `<input class="input" id="filter-experience" value="${escapeHtml(state.filters.experience)}" />`)}
          ${field('Занятость', `<input class="input" id="filter-employment" value="${escapeHtml(state.filters.employment)}" />`)}
          ${field('Зарплата от', `<input type="number" class="input" id="filter-salary" value="${escapeHtml(state.filters.salary_from)}" />`)}
          ${field('Excluded компании / слова', `<input class="input" id="filter-excluded" value="${escapeHtml(state.filters.excluded)}" />`)}
          <div class="switch-box full">
            <div>
              <div class="field-label">Только с указанной зарплатой</div>
              <div class="field-help">Исключать пустые вилки</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="filter-salary-only" ${state.filters.salary_only ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="card highlight">
        <div class="card-header">Итоговый запрос</div>
        <div class="query-preview-human">${escapeHtml(state.queryPreview.human_readable)}</div>
        <div class="query-preview-code">${escapeHtml(state.queryPreview.built_query)}</div>
        <div class="note-box">Сначала держим simple mode дружелюбным, advanced mode — только для сложных логических деревьев.</div>
      </div>
    </div>
    <div class="tabbar">
      <button class="tab ${!state.advanced ? 'active' : ''}" data-action="toggle-advanced" data-value="false">Простой режим</button>
      <button class="tab ${state.advanced ? 'active' : ''}" data-action="toggle-advanced" data-value="true">Продвинутый режим</button>
    </div>
    ${!state.advanced ? `
      <div class="three-col-layout">
        ${renderTagEditor('or', 'Подойдёт любое', state.orTerms, 'Например, project coordinator')}
        ${renderTagEditor('and', 'Обязательно', state.andTerms, 'Например, IT')}
        ${renderTagEditor('not', 'Исключить', state.notTerms, 'Например, senior')}
      </div>
    ` : `
      <div class="card">
        <div class="card-header">🎀 Advanced Boolean Builder</div>
        <div class="advanced-builder">
          <div class="builder-toolbar">
            <button class="btn btn-outline small">+ Term</button>
            <button class="btn btn-outline small">+ AND Group</button>
            <button class="btn btn-outline small">+ OR Group</button>
            <button class="btn btn-outline small">+ NOT Group</button>
          </div>
          <div class="advanced-grid">
            <div class="tree-card">
              <div class="tree-badge and">AND</div>
              <div class="tree-children">
                <div class="tree-badge or">OR → PM / Analyst / Coordinator</div>
                <div class="tree-node">IT</div>
                <div class="tree-badge not">NOT → Senior</div>
              </div>
            </div>
            <div class="tree-card">
              <div class="field-label">Живой перевод логики</div>
              <div class="query-preview-human">Ищем PM, Analyst или Coordinator. Обязательно IT. Исключаем Senior.</div>
              <div class="query-preview-code">((${escapeHtml(state.orTerms.join(' OR '))}) AND ${escapeHtml(state.andTerms.join(' AND '))}) NOT (${escapeHtml(state.notTerms.join(' OR '))})</div>
              <div class="warning-box">На реальной реализации сюда пойдёт drag-and-drop AST tree builder.</div>
            </div>
          </div>
        </div>
      </div>
    `}
    <div class="footer-actions"><button class="btn btn-primary" data-action="run-search">✨ Перейти к результатам</button></div>
  `
}

function renderResults() {
  return `
    <div class="section-title">
      <div><h2>Результаты поиска</h2><p>Карточки вакансий, выбор и быстрый переход к массовому отклику</p></div>
      <div class="btn-row"><button class="btn btn-outline" data-action="screen" data-screen="search">Изменить поиск</button><button class="btn btn-primary" data-action="screen" data-screen="bulk">Mass apply</button></div>
    </div>
    <div class="card highlight">
      <div class="results-summary">
        <div><div class="muted">Найдено вакансий</div><div class="big-number">${state.vacancies.length}</div></div>
        <div class="pill-row wrap">
          <span class="pill soft">${escapeHtml(state.filters.format)}</span>
          <span class="pill soft">${escapeHtml(state.filters.location)}</span>
          <span class="pill soft">${escapeHtml(state.filters.experience)}</span>
          <span class="pill soft">${escapeHtml(state.andTerms.join(', '))}</span>
        </div>
        <div class="selected-box">Выбрано: <strong>${selectedCount()}</strong></div>
      </div>
    </div>
    <div class="cards-list">
      ${state.vacancies.map(v => `
        <div class="vacancy-card">
          <div class="vacancy-main">
            <input type="checkbox" ${state.selectedVacancyIds.includes(v.id) ? 'checked' : ''} data-action="toggle-vacancy" data-id="${v.id}" />
            <div>
              <div class="vacancy-title">${escapeHtml(v.title)}</div>
              <div class="vacancy-meta">${escapeHtml(v.company)} • ${escapeHtml(v.salary)}</div>
              <div class="pill-row wrap mt8"><span class="pill soft">${escapeHtml(v.format)}</span><span class="pill soft">${escapeHtml(v.location)}</span></div>
              <div class="vacancy-snippet">${escapeHtml(v.snippet)}</div>
            </div>
          </div>
          <div class="vacancy-actions"><button class="btn btn-outline">Открыть</button><button class="btn btn-primary">Откликнуться</button></div>
        </div>
      `).join('')}
    </div>
  `
}

function renderBulk() {
  return `
    <div class="section-title"><div><h2>Bulk Apply Wizard</h2><p>Контролируемый сценарий массового отклика</p></div></div>
    <div class="two-col-layout bulk-layout">
      <div class="card"><div class="step-list"><div class="step-item active">Шаг 1</div><div class="step-item active">Шаг 2</div><div class="step-item active">Шаг 3</div></div></div>
      <div class="card">
        <div class="stack-col gap16">
          <div class="section-subtitle">Контекст запуска</div>
          <div class="form-grid compact-grid">
            ${infoBox('Профиль', state.context.profile.name)}
            ${infoBox('Резюме', state.context.resume.title)}
            ${infoBox('Письмо', (state.letters.find(x => x.is_default) || state.letters[0] || {}).name || '')}
            <div class="switch-box"><div><div class="field-label">Dry-run</div><div class="field-help">Проверка без реальной отправки</div></div><label class="switch"><input type="checkbox" id="bulk-dry-run" ${state.bulkForm.dry_run ? 'checked' : ''} /><span class="slider"></span></label></div>
          </div>
          <div class="section-subtitle">Режим обработки</div>
          <div class="mode-grid">
            <button class="mode-card ${state.bulkForm.mode === 'count' ? 'active-dark' : ''}" data-action="bulk-mode" data-mode="count"><div class="card-title">Обработать вакансии</div><div class="card-text">Система пройдётся по фиксированному количеству найденных вакансий.</div></button>
            <button class="mode-card ${state.bulkForm.mode === 'target' ? 'active-pink' : ''}" data-action="bulk-mode" data-mode="target"><div class="card-title">Получить N успешных откликов</div><div class="card-text">Процесс идёт дальше, пока не доберёт нужное число success или не упрётся в лимиты.</div></button>
          </div>
          ${state.bulkForm.mode === 'target' ? `
            <div class="form-grid compact-grid">
              ${field('Target success', `<input type="number" class="input" id="bulk-target-success" value="${escapeHtml(state.bulkForm.target_success)}" />`)}
              ${field('Max attempts', `<input type="number" class="input" id="bulk-max-attempts" value="${escapeHtml(state.bulkForm.max_attempts)}" />`)}
            </div>
          ` : ''}
          <div class="form-grid compact-grid">
            ${infoBox('Запрос', state.queryPreview.built_query)}
            ${infoBox('Выбрано вакансий', String(selectedCount()))}
          </div>
          <div class="footer-actions left"><button class="btn btn-primary" data-action="start-run">▶️ Запустить</button></div>
        </div>
      </div>
    </div>
  `
}

function renderProgress() {
  if (!state.currentRun) return `<div class="card">Нет активного запуска.</div>`
  return `
    <div class="section-title"><div><h2>Run in progress</h2><p>Прозрачный режим выполнения</p></div><button class="btn btn-outline" data-action="refresh-progress">🔄 Обновить</button></div>
    <div class="stats-grid">
      ${statCard('Success', `${state.currentRun.success}/${state.currentRun.target_success}`, 'добираем до целевого числа', '✅')}
      ${statCard('Attempts', `${state.currentRun.attempts}/${state.currentRun.max_attempts}`, 'использовано попыток', '⏱️')}
      ${statCard('Failed', state.currentRun.failed, 'неуспешные отклики', '⚠️')}
      ${statCard('Current vacancy', state.currentRun.current_vacancy || '—', state.currentRun.status, '💼')}
    </div>
    <div class="two-col-layout">
      <div class="card">
        <div class="card-header">Прогресс</div>
        ${progressBlock('Target success', state.currentRun.success, state.currentRun.target_success)}
        ${progressBlock('Attempts usage', state.currentRun.attempts, state.currentRun.max_attempts)}
        <div class="note-box">Сценарий target success активен: процесс не завершится, пока не соберёт нужное число success или не достигнет лимита попыток.</div>
      </div>
      <div class="card">
        <div class="card-header">Лента событий</div>
        <div class="events-list">
          ${state.currentRun.events.map(ev => `<div class="event-row"><div><div class="event-title">${escapeHtml(ev.title)}</div><div class="event-text">${escapeHtml(ev.company)} • ${escapeHtml(ev.message)}</div></div><span class="${statusClass(ev.status)}">${escapeHtml(ev.status)}</span></div>`).join('') || '<div class="field-help">Пока без событий</div>'}
        </div>
      </div>
    </div>
  `
}

function renderLogs() {
  const latest = state.runs[0]
  return `
    <div class="section-title"><div><h2>Logs & Run Details</h2><p>История запусков и результаты по каждой вакансии</p></div></div>
    <div class="two-col-layout logs-layout">
      <div class="card"><div class="card-header">История</div><div class="stack-col gap12">${state.runs.map(run => `<button class="run-card" data-action="open-run" data-id="${run.id}"><div><div class="card-title">${new Date(run.started_at).toLocaleString()}</div><div class="card-text">${escapeHtml(run.mode)}</div></div><div class="${statusClass(run.status)}">${escapeHtml(run.status)}</div></button>`).join('') || '<div>Запусков пока нет.</div>'}</div></div>
      <div class="card">
        <div class="card-header">Последний запуск</div>
        ${latest ? `
          <div class="form-grid compact-grid">${infoBox('Preset', latest.preset_name)}${infoBox('Результат', `Success ${latest.success} • Failed ${latest.failed}`)}</div>
          <div class="events-list mt16">${latest.events.map(ev => `<div class="event-row"><div><div class="event-title">${escapeHtml(ev.title)}</div><div class="event-text">${escapeHtml(ev.company)} • ${escapeHtml(ev.message)}</div></div><span class="${statusClass(ev.status)}">${escapeHtml(ev.status)}</span></div>`).join('')}</div>
        ` : '<div>Запусков пока нет.</div>'}
      </div>
    </div>
  `
}

function renderProfiles() {
  return `
    <div class="section-title"><div><h2>Profiles</h2><p>Профили hh и статус авторизации</p></div></div>
    <div class="cards-list two-up">
      ${state.profiles.map(item => `<div class="simple-card"><div><div class="card-title">${escapeHtml(item.name)}</div><div class="card-text">${escapeHtml(item.auth_status)}</div></div><button class="btn ${item.is_active ? 'btn-primary' : 'btn-outline'}" data-action="activate-profile" data-id="${item.id}">${item.is_active ? 'Активный' : 'Активировать'}</button></div>`).join('')}
    </div>
  `
}

function renderResumes() {
  return `
    <div class="section-title"><div><h2>Resumes</h2><p>Выбор активного резюме перед откликами</p></div></div>
    <div class="cards-list two-up">
      ${state.resumes.map(item => `<div class="simple-card"><div><div class="card-title">${escapeHtml(item.title)}</div><div class="card-text">${escapeHtml(item.id)}</div></div><button class="btn ${item.is_active ? 'btn-primary' : 'btn-outline'}" data-action="activate-resume" data-id="${item.id}">${item.is_active ? 'Активное' : 'Сделать активным'}</button></div>`).join('')}
    </div>
  `
}

function renderLetters() {
  return `
    <div class="section-title"><div><h2>Cover Letters</h2><p>Шаблоны сопроводительных писем</p></div><button class="btn btn-primary">➕ Создать шаблон</button></div>
    <div class="two-col-layout letters-layout">
      <div class="card">
        <div class="stack-col gap12">
          ${state.letters.map(letter => `<button class="template-button ${state.activeLetterId === letter.id ? 'active' : ''}" data-action="select-letter" data-id="${letter.id}">${escapeHtml(letter.name)}</button>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header">🐱 ${escapeHtml(state.activeLetterDraft.name || 'Template')}</div>
        <div class="stack-col gap16">
          ${field('Название', `<input class="input" id="letter-name" value="${escapeHtml(state.activeLetterDraft.name)}" />`)}
          ${field('Текст', `<textarea class="textarea" id="letter-content">${escapeHtml(state.activeLetterDraft.content)}</textarea>`)}
          <div class="switch-box"><div><div class="field-label">Сделать шаблоном по умолчанию</div><div class="field-help">Будет подставляться в bulk apply</div></div><label class="switch"><input type="checkbox" id="letter-default" ${state.activeLetterDraft.is_default ? 'checked' : ''} /><span class="slider"></span></label></div>
          <div class="footer-actions between"><div class="save-msg">${escapeHtml(state.saveMessage)}</div><button class="btn btn-primary" data-action="save-letter">💾 Сохранить изменения</button></div>
        </div>
      </div>
    </div>
  `
}

function renderApp() {
  return `
    <aside class="sidebar">
      <div class="brand-card"><div class="brand-icon">🐱</div><div><div class="brand-kicker">pinky kawaii mode</div><div class="brand-title">Job Hunt CRM 🎀</div></div></div>
      <nav class="nav-list">
        ${[['dashboard','Dashboard'],['search','Search'],['results','Results'],['bulk','Bulk Apply'],['progress','Run Progress'],['logs','Logs'],['resumes','Resumes'],['profiles','Profiles'],['letters','Letters']].map(([id,label]) => `<button class="nav-item ${state.screen===id?'active':''}" data-action="screen" data-screen="${id}">${iconFor(label)} <span>${label}</span></button>`).join('')}
      </nav>
      <div class="context-mini"><div class="mini-row">👤 ${escapeHtml(state.context.profile.name)}</div><div class="mini-row">📄 ${escapeHtml(state.context.resume.title)}</div><div class="mini-pill">HH session active 🎀</div></div>
    </aside>
    <main class="main-panel">
      <header class="topbar">
        <div><div class="muted">Активный контекст</div><div class="pill-row wrap"><span class="pill">Профиль: ${escapeHtml(state.context.profile.name)}</span><span class="pill">Резюме: ${escapeHtml(state.context.resume.title)}</span><span class="pill success">hh active</span></div></div>
        <div class="topbar-actions"><button class="btn btn-outline">🛡️ Проверить сессию</button><button class="btn btn-primary" data-action="screen" data-screen="search">✨ Новый поиск</button></div>
      </header>
      <section class="content-area">
        ${
          state.screen === 'dashboard' ? renderDashboard() :
          state.screen === 'search' ? renderSearch() :
          state.screen === 'results' ? renderResults() :
          state.screen === 'bulk' ? renderBulk() :
          state.screen === 'progress' ? renderProgress() :
          state.screen === 'logs' ? renderLogs() :
          state.screen === 'profiles' ? renderProfiles() :
          state.screen === 'resumes' ? renderResumes() :
          renderLetters()
        }
      </section>
    </main>
  `
}

function render() {
  document.getElementById('app').innerHTML = `<div class="app-shell">${renderApp()}</div>`
  bindEvents()
}

function bindEvents() {
  document.querySelectorAll('[data-action="screen"]').forEach(btn => btn.onclick = () => setScreen(btn.dataset.screen))
  document.querySelectorAll('[data-action="run-search"]').forEach(btn => btn.onclick = () => { syncSearchInputs(); runSearch() })
  document.querySelectorAll('[data-action="toggle-vacancy"]').forEach(input => input.onchange = () => toggleVacancy(input.dataset.id))
  document.querySelectorAll('[data-action="bulk-mode"]').forEach(btn => btn.onclick = () => { state.bulkForm.mode = btn.dataset.mode; render() })
  document.querySelectorAll('[data-action="start-run"]').forEach(btn => btn.onclick = () => { syncBulkInputs(); startRun() })
  document.querySelectorAll('[data-action="open-run"]').forEach(btn => btn.onclick = async () => { state.currentRun = await api(`/api/apply/runs/${btn.dataset.id}`); state.screen = 'progress'; if (state.currentRun.status === 'running') startPolling(); render() })
  document.querySelectorAll('[data-action="activate-profile"]').forEach(btn => btn.onclick = () => activateProfile(btn.dataset.id))
  document.querySelectorAll('[data-action="activate-resume"]').forEach(btn => btn.onclick = () => activateResume(btn.dataset.id))
  document.querySelectorAll('[data-action="select-letter"]').forEach(btn => btn.onclick = () => { const letter = state.letters.find(l => l.id === btn.dataset.id); state.activeLetterId = letter.id; state.activeLetterDraft = { ...letter }; render() })
  document.querySelectorAll('[data-action="save-letter"]').forEach(btn => btn.onclick = () => { syncLetterInputs(); saveLetter() })
  document.querySelectorAll('[data-action="toggle-advanced"]').forEach(btn => btn.onclick = () => { state.advanced = btn.dataset.value === 'true'; render() })
  document.querySelectorAll('[data-action="add-tag"]').forEach(btn => btn.onclick = () => addTag(btn.dataset.kind))
  document.querySelectorAll('[data-action="remove-tag"]').forEach(btn => btn.onclick = () => removeTag(btn.dataset.kind, Number(btn.dataset.idx)))
  document.querySelectorAll('[data-action="refresh-progress"]').forEach(btn => btn.onclick = async () => { if (state.currentRun) state.currentRun = await api(`/api/apply/runs/${state.currentRun.id}`); await refreshRuns(); render() })
}

function syncSearchInputs() {
  const ids = ['query-input','filter-location','filter-format','filter-experience','filter-employment','filter-salary','filter-excluded','filter-salary-only']
  if (!document.getElementById('query-input')) return
  state.query = document.getElementById('query-input').value
  state.filters.location = document.getElementById('filter-location').value
  state.filters.format = document.getElementById('filter-format').value
  state.filters.experience = document.getElementById('filter-experience').value
  state.filters.employment = document.getElementById('filter-employment').value
  state.filters.salary_from = Number(document.getElementById('filter-salary').value)
  state.filters.excluded = document.getElementById('filter-excluded').value
  state.filters.salary_only = document.getElementById('filter-salary-only').checked
}

function syncBulkInputs() {
  const dry = document.getElementById('bulk-dry-run')
  if (dry) state.bulkForm.dry_run = dry.checked
  const ts = document.getElementById('bulk-target-success')
  const ma = document.getElementById('bulk-max-attempts')
  if (ts) state.bulkForm.target_success = Number(ts.value)
  if (ma) state.bulkForm.max_attempts = Number(ma.value)
}

function syncLetterInputs() {
  state.activeLetterDraft.name = document.getElementById('letter-name').value
  state.activeLetterDraft.content = document.getElementById('letter-content').value
  state.activeLetterDraft.is_default = document.getElementById('letter-default').checked
}

function statCard(title, value, hint, icon) {
  return `<div class="stat-card"><div><div class="muted">${escapeHtml(String(title))}</div><div class="stat-value">${escapeHtml(String(value))}</div><div class="field-help">${escapeHtml(String(hint))}</div></div><div class="stat-icon">${icon}</div></div>`
}

function actionCard(title, text, screen) {
  return `<button class="action-card" data-action="screen" data-screen="${screen}"><div class="card-title">${escapeHtml(title)}</div><div class="card-text">${escapeHtml(text)}</div></button>`
}

function infoBox(label, value) {
  return `<div class="info-box"><div class="muted">${escapeHtml(label)}</div><div class="card-title mt4">${escapeHtml(value)}</div></div>`
}

function field(label, control) {
  return `<label class="field"><div class="field-label">${escapeHtml(label)}</div>${control}</label>`
}

function progressBlock(label, value, total) {
  const percent = total ? Math.min(100, Math.round((value / total) * 100)) : 0
  return `<div class="progress-block"><div class="progress-head"><span>${escapeHtml(label)}</span><span>${value}/${total}</span></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div></div>`
}

bootstrap()
