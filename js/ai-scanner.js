// ============================================================================
// МОДУЛЬ 6: AI-СКАНЕР ФОТО GEMINI (3.5 FLASH LITE) И ПРЕДПРОСМОТР ИЗМЕНЕНИЙ (js/ai-scanner.js)
// ============================================================================
function sanitizeGeminiKey(raw) {
  if (!raw) return '';
  let clean = raw.replace(/[\s"'`«»\u200B-\u200D\uFEFF]+/g, '').trim();
  const match = clean.match(/AIza[0-9A-Za-z\-_]{25,}/);
  if (match) return match[0];
  return clean;
}

function onApiKeyInput() {
  const input = document.getElementById('geminiApiKeyInput');
  const cleaned = sanitizeGeminiKey(input.value);
  if (cleaned) {
    localStorage.setItem(STORAGE_KEY_API, cleaned);
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('geminiApiKeyInput');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function discoverAvailableGeminiModels(apiKey) {
  // Приоритетная модель по требованию: gemini-3.5-flash-lite
  const defaultModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ];

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    const data = await resp.json();

    if (resp.ok && Array.isArray(data.models)) {
      const valid = data.models
        .filter(m => {
          const name = (m.name || '').toLowerCase();
          const methods = m.supportedGenerationMethods || [];
          return (
            methods.includes('generateContent') &&
            name.includes('gemini') &&
            name.includes('flash') &&
            !name.includes('tts') &&
            !name.includes('audio') &&
            !name.includes('computer-use') &&
            !name.includes('embedding') &&
            !name.includes('imagen') &&
            !name.includes('preview') &&
            !name.includes('exp') &&
            !name.includes('2.0') &&
            !name.includes('2.5') &&
            !name.includes('1.5')
          );
        })
        .map(m => m.name.replace(/^models\//, ''));

      if (valid.length > 0) {
        // Приоритет проверенной модели gemini-3.5-flash-lite
        const ordered = [...new Set([...defaultModels.filter(m => valid.includes(m)), ...valid])];
        return ordered;
      }
    }
  } catch (e) {}

  return defaultModels;
}

async function callGeminiWithFallback(apiKey, contentsPayload, useJsonConfig = true) {
  const models = await discoverAvailableGeminiModels(apiKey);
  let lastErrorMsg = 'Все модели временно перегружены';

  for (const modelName of models) {
    try {
      const bodyObj = { contents: contentsPayload };
      if (useJsonConfig) {
        bodyObj.generationConfig = { temperature: 0.1 };
      }

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj)
      });

      const data = await resp.json();

      if (!resp.ok || data.error) {
        const errMsg = data?.error?.message || `HTTP ${resp.status}`;
        lastErrorMsg = `[${modelName}] ${errMsg}`;

        if (errMsg.includes('API key not valid')) {
          throw new Error('API-ключ недействителен. Проверь ключ на aistudio.google.com/apikey');
        }
        continue;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        window.CURRENT_GEMINI_MODEL = modelName;
        return { text, modelName };
      }
    } catch (err) {
      if (err.message.includes('недействителен')) throw err;
      lastErrorMsg = err.message || String(err);
    }
  }

  throw new Error(lastErrorMsg);
}

async function testGeminiApiKey() {
  const input = document.getElementById('geminiApiKeyInput');
  const rawKey = sanitizeGeminiKey(input.value);
  input.value = rawKey;

  if (!rawKey) {
    showSyncMessage('⚠️ Введи свой Gemini API Key в поле выше.', true);
    return;
  }

  const btn = document.getElementById('testApiKeyBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Проверка...';
  showSyncMessage('🔍 Запрашиваем список доступных моделей (приоритет: gemini-3.5-flash-lite)...');

  try {
    const result = await callGeminiWithFallback(rawKey, [
      { parts: [{ text: 'Ответь одним словом: ОК' }] }
    ], false);

    localStorage.setItem(STORAGE_KEY_API, rawKey);
    showSyncMessage(`✅ Ключ успешно проверен и сохранён! Активная модель: <b>${result.modelName}</b>.`);
    showToast(`✅ Ключ рабочий (${result.modelName})`);
  } catch (err) {
    showSyncMessage(`❌ Ошибка проверки ключа: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔑 Проверить';
  }
}

function openSyncModal() {
  if (!isAdminMode) {
    handleAdminAuthClick();
    return;
  }
  document.getElementById('syncModal').classList.remove('hidden');
  const savedKey = localStorage.getItem(STORAGE_KEY_API) || '';
  document.getElementById('geminiApiKeyInput').value = savedKey;
  populateGithubInputs();
}

function closeSyncModal() {
  document.getElementById('syncModal').classList.add('hidden');
  document.getElementById('syncStatusMsg').classList.add('hidden');
}

function switchSyncTab(tab) {
  const isGh = tab === 'github';
  const isAi = tab === 'ai';
  const isJson = tab === 'json';

  const ghBody = document.getElementById('syncTabGithubBody');
  if (ghBody) ghBody.classList.toggle('hidden', !isGh);
  document.getElementById('syncTabAiBody').classList.toggle('hidden', !isAi);
  document.getElementById('syncTabJsonBody').classList.toggle('hidden', !isJson);

  const ghBtn = document.getElementById('syncTabGithubBtn');
  if (ghBtn) {
    ghBtn.className = isGh
      ? 'py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold bg-emerald-600 text-white transition'
      : 'py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold text-gray-400 hover:text-white transition';
  }
  document.getElementById('syncTabAiBtn').className = isAi
    ? 'py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold bg-purple-600 text-white transition'
    : 'py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold text-gray-400 hover:text-white transition';
  document.getElementById('syncTabJsonBtn').className = isJson
    ? 'py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold bg-indigo-600 text-white transition'
    : 'py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold text-gray-400 hover:text-white transition';
}

function showSyncMessage(text, isError = false) {
  const box = document.getElementById('syncStatusMsg');
  if (!box) return;
  box.classList.remove('hidden');
  box.className = `p-3 rounded-xl text-xs font-medium leading-relaxed break-words ${isError ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'}`;
  box.innerHTML = text;
}

let currentAiScanMode = 'auto'; // 'auto' | 'classes' | 'exams'

function setAiScanMode(mode) {
  currentAiScanMode = mode || 'auto';
  const modes = ['auto', 'classes', 'exams'];
  modes.forEach(m => {
    const btn = document.getElementById(`aiScanMode_${m}`);
    if (!btn) return;
    btn.className = (m === currentAiScanMode)
      ? 'py-2 px-2 rounded-lg text-[11px] font-bold bg-purple-600 text-white transition shadow-sm'
      : 'py-2 px-2 rounded-lg text-[11px] font-bold text-gray-400 hover:text-white transition';
  });
  const hint = document.getElementById('aiScanModeHint');
  if (hint) {
    if (currentAiScanMode === 'exams') {
      hint.innerHTML = '🎓 <b>Режим «Зачёты и экзамены»:</b> ИИ подготовит предпросмотр изменений кабинетов и времени в карточках зачётов/экзаменов. Обычные пары останутся нетронутыми!';
    } else if (currentAiScanMode === 'classes') {
      hint.innerHTML = '📚 <b>Режим «Обычные пары»:</b> ИИ подготовит предпросмотр изменений дневных/вечерних пар (14:10–20:10) и их кабинетов, не затрагивая ведомость экзаменов.';
    } else {
      hint.innerHTML = '🛡️ <b>Умный авто-режим:</b> ИИ сам отличает расписание пар (14:10–20:10) от зачётов/экзаменов и перед сохранением покажет окно подтверждения со старым и новым вариантом!';
    }
  }
}

function isLikelyExamItem(item, dateIso, dayArrayLength = 0, classesContext = CLASSES, examsContext = EXAMS) {
  if (!item || typeof item !== 'object') return false;
  if (item.isExam === true || item.eventType === 'exam') return true;

  const rawStart = normalizeTimeToken(item.start || item.time);
  const rawEnd = normalizeTimeToken(item.end);

  if (rawStart) {
    const sMin = timeToMin(rawStart);
    if (sMin > 0 && sMin < 13 * 60 + 30) return true;
  }

  const isStandardAfternoonStart = ['14:10', '15:50', '17:20', '18:50'].includes(rawStart);
  if (!rawEnd && !isStandardAfternoonStart) {
    return true;
  }

  const subj = item.subject || '';
  const baseDayClasses = (classesContext && Array.isArray(classesContext[dateIso])) ? classesContext[dateIso] : [];
  const matchesAfternoonClassOnThatDay = baseDayClasses.some(c => subjectsMatch(c.subject, subj));

  const allExamsRef = Array.isArray(examsContext) ? examsContext : [];
  const matchesExamOnThatDate = allExamsRef.some(ex => ex.date === dateIso && subjectsMatch(ex.subject, subj));
  if (matchesExamOnThatDate && !matchesAfternoonClassOnThatDay) {
    return true;
  }

  if (dayArrayLength === 1 && !matchesAfternoonClassOnThatDay) {
    const matchesAnySessionExam = allExamsRef.some(ex => subjectsMatch(ex.subject, subj));
    if (matchesAnySessionExam) return true;
  }

  return false;
}

function upsertExamRecordInList(examsList, examInput) {
  if (!examInput || typeof examInput !== 'object') return { updated: false, exam: null, oldExam: null, isNew: false };

  const dateIso = (examInput.date && /^\d{4}-\d{2}-\d{2}$/.test(examInput.date)) ? examInput.date : '';
  const rawTime = normalizeTimeToken(examInput.time || examInput.start);
  const cleanRoom = cleanRoomString(examInput.room);
  const subj = (examInput.subject || '').trim();
  const teacher = (examInput.teacher || '').trim();

  let targetExam = null;
  if (dateIso && subj) {
    targetExam = examsList.find(e => e.date === dateIso && subjectsMatch(e.subject, subj));
  }
  if (!targetExam && subj) {
    targetExam = examsList.find(e => subjectsMatch(e.subject, subj));
  }
  if (!targetExam && dateIso) {
    const sameDateExams = examsList.filter(e => e.date === dateIso);
    if (sameDateExams.length === 1) targetExam = sameDateExams[0];
  }

  if (targetExam) {
    const oldSnapshot = JSON.parse(JSON.stringify(targetExam));
    let changed = false;
    if (isValidRoomValue(cleanRoom) && targetExam.room !== cleanRoom) {
      targetExam.room = cleanRoom;
      changed = true;
    }
    if (rawTime) {
      const tMin = timeToMin(rawTime);
      if (tMin >= 7 * 60 && tMin <= 13 * 60 + 45 && targetExam.time !== rawTime) {
        targetExam.time = rawTime;
        changed = true;
      }
    }
    if (dateIso && SESSION_DATES.includes(dateIso) && targetExam.date !== dateIso) {
      targetExam.date = dateIso;
      changed = true;
    }
    if (teacher && isValidRoomValue(teacher) && targetExam.teacher !== teacher) {
      targetExam.teacher = teacher;
      changed = true;
    }
    examsList.sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));
    return { updated: changed, exam: targetExam, oldExam: oldSnapshot, isNew: false };
  }

  if (dateIso && subj) {
    const rawType = String(examInput.type || examInput.control || '').toLowerCase();
    const type = rawType.includes('экз') ? 'экз' : 'зач';
    const label = type === 'экз' ? 'Экзамен' : 'Зачёт';
    const validMorningTime = (rawTime && timeToMin(rawTime) < 14 * 60) ? rawTime : '09:30';
    const cleanNote = examInput.note ? String(examInput.note).replace(/По расписанию экзаменационной сессии группы 1Б/gi, '').trim() : '';
    const newExam = {
      date: dateIso,
      time: validMorningTime,
      subject: subj,
      type,
      label,
      teacher: teacher || 'уточняется',
      room: isValidRoomValue(cleanRoom) ? cleanRoom : 'уточняется',
      note: cleanNote
    };
    examsList.push(newExam);
    examsList.sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));
    return { updated: true, exam: newExam, oldExam: null, isNew: true };
  }

  return { updated: false, exam: null, oldExam: null, isNew: false };
}

function upsertExamRecord(examInput) {
  if (!Array.isArray(EXAMS)) EXAMS = [];
  return upsertExamRecordInList(EXAMS, examInput);
}

function mergeAfternoonClassesInMap(classesMap, dateIso, incomingClasses) {
  if (!Array.isArray(incomingClasses) || incomingClasses.length === 0) return false;

  const existingDay = (Array.isArray(classesMap[dateIso]) && classesMap[dateIso].length > 0)
    ? classesMap[dateIso]
    : [];

  const normalizedIncoming = incomingClasses.map(c => {
    const start = normalizeTimeToken(c.start || c.time) || '14:10';
    let end = normalizeTimeToken(c.end) || '';
    if (start === '14:10' && (end === '15:50' || !end)) end = '15:30';
    else if (start === '15:50' && (end === '17:20' || !end)) end = '17:10';
    else if (start === '17:20' && !end) end = '18:40';
    else if (start === '18:50' && !end) end = '20:10';
    else if (!end) end = '15:30';

    const room = cleanRoomString(c.room);
    const baseMatch = existingDay.find(
      b => b.start === start || subjectsMatch(b.subject, c.subject)
    );

    return {
      start,
      end,
      subject: (c.subject || (baseMatch && baseMatch.subject) || 'Дисциплина').trim(),
      control: c.control || (baseMatch && baseMatch.control) || 'зач',
      teacher: (c.teacher && c.teacher !== 'уточняется') ? c.teacher : ((baseMatch && baseMatch.teacher) || 'уточняется'),
      room,
      ...(c.note || (baseMatch && baseMatch.note) ? { note: c.note || baseMatch.note } : {})
    };
  });

  if (existingDay.length > normalizedIncoming.length) {
    const merged = existingDay.map(exCls => ({ ...exCls }));
    normalizedIncoming.forEach(inc => {
      let idx = merged.findIndex(m => m.start === inc.start);
      if (idx === -1) {
        idx = merged.findIndex(m => subjectsMatch(m.subject, inc.subject));
      }
      if (idx >= 0) {
        const prevRoom = merged[idx].room;
        merged[idx] = {
          ...merged[idx],
          ...inc,
          room: isValidRoomValue(inc.room) ? inc.room : (isValidRoomValue(prevRoom) ? prevRoom : 'уточняется')
        };
      } else {
        merged.push(inc);
      }
    });
    merged.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
    classesMap[dateIso] = merged;
    return true;
  }

  const fullUpdated = normalizedIncoming.map(inc => {
    const prevMatch = existingDay.find(m => m.start === inc.start || subjectsMatch(m.subject, inc.subject));
    const finalRoom = isValidRoomValue(inc.room)
      ? inc.room
      : (prevMatch && isValidRoomValue(prevMatch.room) ? prevMatch.room : 'уточняется');
    return {
      ...inc,
      room: finalRoom
    };
  });
  fullUpdated.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  classesMap[dateIso] = fullUpdated;
  return true;
}

function mergeAfternoonClassesForDay(dateIso, incomingClasses) {
  return mergeAfternoonClassesInMap(CLASSES, dateIso, incomingClasses);
}

// ============================================================================
// ПРЕДПРОСМОТР И СРАВНЕНИЕ (СТАРЫЙ ВАРИАНТ vs НОВЫЙ ВАРИАНТ) ПЕРЕД ОБНОВЛЕНИЕМ ПО ФОТО
// ============================================================================
let pendingPhotoSchedulePreview = null;

function formatClassLineForDiff(c) {
  if (!c) return '<i>нет записи</i>';
  const ctrl = c.control ? ` <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/10 uppercase font-mono">(${escapeHtml(c.control)})</span>` : '';
  return `<span class="font-mono font-bold text-indigo-200">${escapeHtml(c.start || '')}–${escapeHtml(c.end || '')}</span> • <b>«${escapeHtml(c.subject || 'Предмет')}»</b>${ctrl} • Преп.: <span class="text-gray-200">${escapeHtml(c.teacher || 'уточняется')}</span> • Каб: <b class="text-emerald-300 font-mono">${escapeHtml(c.room || 'уточняется')}</b>`;
}

function formatExamLineForDiff(ex) {
  if (!ex) return '<i>нет записи</i>';
  return `<span class="font-mono font-bold text-indigo-200">${toRuShortDate(ex.date)} в ${escapeHtml(ex.time || '09:30')}</span> • <b>${escapeHtml(ex.label || 'Контроль')} «${escapeHtml(ex.subject || '')}»</b> • Преп.: <span class="text-gray-200">${escapeHtml(ex.teacher || 'уточняется')}</span> • Каб: <b class="text-emerald-300 font-mono">${escapeHtml(ex.room || 'уточняется')}</b>`;
}

function getChangedFieldsBetweenClasses(oldC, newC) {
  const diffs = [];
  if ((oldC.start !== newC.start) || (oldC.end !== newC.end)) {
    diffs.push(`Время: ${oldC.start}–${oldC.end} ➔ ${newC.start}–${newC.end}`);
  }
  if ((oldC.subject || '').trim() !== (newC.subject || '').trim()) {
    diffs.push(`Предмет: «${oldC.subject}» ➔ «${newC.subject}»`);
  }
  if ((oldC.room || 'уточняется') !== (newC.room || 'уточняется')) {
    diffs.push(`Кабинет: ${oldC.room || 'уточняется'} ➔ ${newC.room || 'уточняется'}`);
  }
  if ((oldC.teacher || 'уточняется') !== (newC.teacher || 'уточняется')) {
    diffs.push(`Преподаватель: ${oldC.teacher || 'уточняется'} ➔ ${newC.teacher || 'уточняется'}`);
  }
  if ((oldC.control || 'зач') !== (newC.control || 'зач')) {
    diffs.push(`Контроль: (${oldC.control || 'зач'}) ➔ (${newC.control || 'зач'})`);
  }
  return diffs;
}

function getChangedFieldsBetweenExams(oldE, newE) {
  const diffs = [];
  if (oldE.date !== newE.date) {
    diffs.push(`Дата: ${toRuShortDate(oldE.date)} ➔ ${toRuShortDate(newE.date)}`);
  }
  if (oldE.time !== newE.time) {
    diffs.push(`Время: ${oldE.time} ➔ ${newE.time}`);
  }
  if ((oldE.room || 'уточняется') !== (newE.room || 'уточняется')) {
    diffs.push(`Кабинет: ${oldE.room || 'уточняется'} ➔ ${newE.room || 'уточняется'}`);
  }
  if ((oldE.teacher || 'уточняется') !== (newE.teacher || 'уточняется')) {
    diffs.push(`Преподаватель: ${oldE.teacher || 'уточняется'} ➔ ${newE.teacher || 'уточняется'}`);
  }
  if ((oldE.subject || '').trim() !== (newE.subject || '').trim()) {
    diffs.push(`Предмет: «${oldE.subject}» ➔ «${newE.subject}»`);
  }
  return diffs;
}

function buildPhotoScheduleDiffPreview(parsed, mode = 'auto', modelName = 'gemini-3.5-flash-lite') {
  const simClasses = JSON.parse(JSON.stringify(CLASSES || {}));
  const simExams = JSON.parse(JSON.stringify(EXAMS || []));
  const diffEntries = [];
  const unchangedEntries = [];

  const handleExamCandidate = (exItem) => {
    const res = upsertExamRecordInList(simExams, exItem);
    if (!res.exam) return;
    if (res.isNew) {
      diffEntries.push({
        kind: 'add',
        category: 'exam',
        dateIso: res.exam.date,
        badge: '➕ Новый зачёт/экзамен',
        badgeClass: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
        title: `${toRuShortDate(res.exam.date)} • ${res.exam.label} «${res.exam.subject}»`,
        oldHtml: '<i>В ведомости зачётов/экзаменов этой записи ранее не было</i>',
        newHtml: formatExamLineForDiff(res.exam),
        changedFields: ['Добавление новой записи контроля']
      });
    } else if (res.oldExam) {
      const fieldDiffs = getChangedFieldsBetweenExams(res.oldExam, res.exam);
      if (fieldDiffs.length > 0) {
        diffEntries.push({
          kind: 'overwrite',
          category: 'exam',
          dateIso: res.exam.date,
          badge: '✏️ Перезапись старых данных (Зачёт/Экзамен)',
          badgeClass: 'bg-amber-500/25 text-amber-200 border-amber-400/50',
          title: `${toRuShortDate(res.exam.date)} • ${res.exam.label} «${res.exam.subject}»`,
          oldHtml: formatExamLineForDiff(res.oldExam),
          newHtml: formatExamLineForDiff(res.exam),
          changedFields: fieldDiffs
        });
      } else {
        unchangedEntries.push({
          title: `${toRuShortDate(res.exam.date)} • ${res.exam.label} «${res.exam.subject}»`,
          html: formatExamLineForDiff(res.exam)
        });
      }
    }
  };

  if (Array.isArray(parsed.exams) && parsed.exams.length > 0) {
    parsed.exams.forEach(handleExamCandidate);
  }

  const classesSource = (parsed.classes && typeof parsed.classes === 'object' && !Array.isArray(parsed.classes))
    ? parsed.classes
    : parsed;

  const dateEntries = Object.entries(classesSource).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(v));
  const allDaysSingleExamSubject = dateEntries.length > 0 && dateEntries.every(([dKey, dArr]) => {
    if (dArr.length !== 1) return false;
    const item = dArr[0];
    return isLikelyExamItem(item, dKey, 1, simClasses, simExams) ||
           simExams.some(ex => subjectsMatch(ex.subject, item.subject));
  });

  const effectiveExamBatch = (mode === 'exams') || (parsed.type === 'exams') || (parsed.sheetType === 'exams') || allDaysSingleExamSubject;

  for (const [dateKey, dayArr] of dateEntries) {
    const afternoonForDay = [];
    for (const item of dayArr) {
      if (effectiveExamBatch || (mode !== 'classes' && isLikelyExamItem(item, dateKey, dayArr.length, simClasses, simExams))) {
        handleExamCandidate({ ...item, date: dateKey });
      } else {
        afternoonForDay.push(item);
      }
    }

    if (afternoonForDay.length > 0 && mode !== 'exams') {
      const oldDayArr = JSON.parse(JSON.stringify(simClasses[dateKey] || []));
      mergeAfternoonClassesInMap(simClasses, dateKey, afternoonForDay);
      const newDayArr = simClasses[dateKey] || [];

      const matchedOldIndices = new Set();

      newDayArr.forEach(newCls => {
        // Ищем соответствующую старую пару по времени начала или по предмету
        let oldIdx = oldDayArr.findIndex((o, i) => !matchedOldIndices.has(i) && o.start === newCls.start);
        if (oldIdx === -1) {
          oldIdx = oldDayArr.findIndex((o, i) => !matchedOldIndices.has(i) && subjectsMatch(o.subject, newCls.subject));
        }

        if (oldIdx >= 0) {
          matchedOldIndices.add(oldIdx);
          const oldCls = oldDayArr[oldIdx];
          const fieldDiffs = getChangedFieldsBetweenClasses(oldCls, newCls);
          if (fieldDiffs.length > 0) {
            diffEntries.push({
              kind: 'overwrite',
              category: 'class',
              dateIso: dateKey,
              badge: '✏️ Перезапись старых данных (Пара)',
              badgeClass: 'bg-amber-500/25 text-amber-200 border-amber-400/50',
              title: `${toRuShortDate(dateKey)} (${DAYS_SHORT[parseIsoLocal(dateKey).getDay()] || ''}) • Слот ${newCls.start}–${newCls.end}`,
              oldHtml: formatClassLineForDiff(oldCls),
              newHtml: formatClassLineForDiff(newCls),
              changedFields: fieldDiffs
            });
          } else {
            unchangedEntries.push({
              title: `${toRuShortDate(dateKey)} • ${newCls.start}–${newCls.end}`,
              html: formatClassLineForDiff(newCls)
            });
          }
        } else {
          diffEntries.push({
            kind: 'add',
            category: 'class',
            dateIso: dateKey,
            badge: '➕ Новая пара',
            badgeClass: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
            title: `${toRuShortDate(dateKey)} (${DAYS_SHORT[parseIsoLocal(dateKey).getDay()] || ''}) • Слот ${newCls.start}–${newCls.end}`,
            oldHtml: `<i>На ${toRuShortDate(dateKey)} в ${newCls.start}–${newCls.end} ранее пары не было</i>`,
            newHtml: formatClassLineForDiff(newCls),
            changedFields: ['Добавление новой пары в расписание']
          });
        }
      });

      // Проверяем, не была ли какая-то старая пара удалена при полной перезаписи дня
      oldDayArr.forEach((oldCls, idx) => {
        if (!matchedOldIndices.has(idx)) {
          diffEntries.push({
            kind: 'remove',
            category: 'class',
            dateIso: dateKey,
            badge: '🗑️ Удаление / замена старой пары',
            badgeClass: 'bg-rose-500/25 text-rose-200 border-rose-400/50',
            title: `${toRuShortDate(dateKey)} (${DAYS_SHORT[parseIsoLocal(dateKey).getDay()] || ''}) • Слот ${oldCls.start}–${oldCls.end}`,
            oldHtml: formatClassLineForDiff(oldCls),
            newHtml: '<i>В новом расписании с фото эта пара отсутствует (будет убрана)</i>',
            changedFields: ['Пара убрана при перезаписи дня']
          });
        }
      });
    }
  }

  return {
    parsed,
    mode,
    modelName,
    diffEntries,
    unchangedEntries
  };
}

function openPhotoDiffConfirmModal(previewObj) {
  pendingPhotoSchedulePreview = previewObj;
  const modal = document.getElementById('photoDiffConfirmModal');
  const modelBadge = document.getElementById('photoDiffModelBadge');
  const summaryStats = document.getElementById('photoDiffSummaryStats');
  const listContainer = document.getElementById('photoDiffItemsContainer');
  if (!modal || !listContainer) return;

  if (modelBadge) {
    modelBadge.textContent = `🤖 Модель: ${previewObj.modelName || 'gemini-3.5-flash-lite'}`;
  }

  const overwriteCount = previewObj.diffEntries.filter(d => d.kind === 'overwrite' || d.kind === 'remove').length;
  const addCount = previewObj.diffEntries.filter(d => d.kind === 'add').length;
  const unchangedCount = previewObj.unchangedEntries.length;

  if (summaryStats) {
    summaryStats.innerHTML = `
      <span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold text-xs">
        ✏️ Перезаписывается старых записей: ${overwriteCount}
      </span>
      <span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-bold text-xs">
        ➕ Новых записей: ${addCount}
      </span>
      ${unchangedCount > 0 ? `<span class="px-2.5 py-1 rounded-lg bg-white/10 text-gray-300 border border-white/15 text-xs">✓ Без изменений (совпадает): ${unchangedCount}</span>` : ''}
    `;
  }

  let html = '';

  if (previewObj.diffEntries.length === 0) {
    html += `
      <div class="p-4 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 text-xs text-indigo-100 space-y-2">
        <div class="font-bold text-sm text-white">ℹ️ Все распознанные с фото данные уже совпадают с текущим расписанием!</div>
        <p class="text-gray-300">Отличий от текущей базы не обнаружено (проверено записей: ${unchangedCount}). Ниже показаны распознанные строки. Ты можешь подтвердить синхронизацию или отменить.</p>
      </div>
    `;
  } else {
    html += previewObj.diffEntries.map((item, idx) => {
      const fieldsPills = (item.changedFields || []).map(f =>
        `<span class="inline-block px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-400/40 text-[10px] font-mono font-bold mr-1 mb-1">⚡ ${escapeHtml(f)}</span>`
      ).join('');

      return `
        <div class="p-3.5 rounded-2xl bg-gray-950/95 border border-white/15 space-y-2.5 shadow-lg">
          <div class="flex items-center justify-between gap-2 flex-wrap border-b border-white/10 pb-2">
            <div class="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-300 font-mono text-[10px]">#${idx + 1}</span>
              <span>${escapeHtml(item.title)}</span>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${item.badgeClass}">
              ${item.badge}
            </span>
          </div>

          ${fieldsPills ? `<div class="pt-0.5">${fieldsPills}</div>` : ''}

          <div class="grid grid-cols-1 gap-2 text-xs">
            <div class="p-2.5 rounded-xl bg-rose-950/55 border border-rose-500/40 space-y-1">
              <div class="text-[10px] font-extrabold uppercase tracking-wider text-rose-300 flex items-center gap-1">
                <span>🕰️ Старый вариант (сейчас в расписании):</span>
              </div>
              <div class="text-gray-200 leading-relaxed">${item.oldHtml}</div>
            </div>

            <div class="p-2.5 rounded-xl bg-emerald-950/55 border border-emerald-500/40 space-y-1">
              <div class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                <span>✨ Новый вариант (будет записано с фото):</span>
              </div>
              <div class="text-white leading-relaxed">${item.newHtml}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (previewObj.unchangedEntries.length > 0) {
    html += `
      <details class="p-3 rounded-xl bg-gray-950/70 border border-white/10 text-xs text-gray-300">
        <summary class="cursor-pointer font-bold text-gray-200 hover:text-white">
          👁️ Показать записи с фото, которые полностью совпали со старым расписанием (${previewObj.unchangedEntries.length} шт.)
        </summary>
        <div class="mt-2 space-y-1.5 pt-2 border-t border-white/10">
          ${previewObj.unchangedEntries.map(u => `
            <div class="p-2 rounded-lg bg-white/5 text-[11px] leading-relaxed">
              <span class="text-emerald-400 font-bold">✓ Без изменений:</span> ${u.html}
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  listContainer.innerHTML = html;
  modal.classList.remove('hidden');
}

function cancelPhotoScheduleUpdate() {
  pendingPhotoSchedulePreview = null;
  const modal = document.getElementById('photoDiffConfirmModal');
  if (modal) modal.classList.add('hidden');
  showSyncMessage('ℹ️ Обновление расписания по фото отменено пользователем. Старое расписание сохранено без изменений.');
  showToast('ℹ️ Изменение расписания отменено');
}

function confirmPhotoScheduleUpdate() {
  if (!pendingPhotoSchedulePreview) return;
  const { parsed, mode, modelName } = pendingPhotoSchedulePreview;
  pendingPhotoSchedulePreview = null;

  const modal = document.getElementById('photoDiffConfirmModal');
  if (modal) modal.classList.add('hidden');

  const res = applySmartScheduleUpdate(parsed, mode, 'AI-сканер фото', modelName);
  showSyncMessage(
    `🎉 <b>Изменения подтверждены и применены (${escapeHtml(modelName)})!</b> ${res.summaryHeader}.<br>` +
    `<div class="mt-1.5 text-[11px] space-y-0.5">${res.detailsList.join('<br>')}</div>`
  );
  showToast(`✅ Расписание обновлено (${modelName})`);
}

function applySmartScheduleUpdate(parsed, mode = 'auto', actionLabel = 'Импорт JSON', modelLabel = '') {
  let updatedClassDays = 0;
  let updatedExamsCount = 0;
  const detailsList = [];

  if (Array.isArray(parsed.exams) && parsed.exams.length > 0) {
    parsed.exams.forEach(exItem => {
      const res = upsertExamRecord(exItem);
      if (res.exam) {
        updatedExamsCount++;
        detailsList.push(`🎓 <b>${toRuShortDate(res.exam.date)} (${res.exam.time}):</b> ${res.exam.label} «${res.exam.subject}» — <b>Каб ${res.exam.room}</b>`);
      }
    });
  }

  const classesSource = (parsed.classes && typeof parsed.classes === 'object' && !Array.isArray(parsed.classes))
    ? parsed.classes
    : parsed;

  const dateEntries = Object.entries(classesSource).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(v));
  const allDaysSingleExamSubject = dateEntries.length > 0 && dateEntries.every(([dKey, dArr]) => {
    if (dArr.length !== 1) return false;
    const item = dArr[0];
    return isLikelyExamItem(item, dKey, 1) || (Array.isArray(EXAMS) && EXAMS.some(ex => subjectsMatch(ex.subject, item.subject)));
  });

  const effectiveExamBatch = (mode === 'exams') || (parsed.type === 'exams') || (parsed.sheetType === 'exams') || allDaysSingleExamSubject;

  for (const [dateKey, dayArr] of dateEntries) {
    const afternoonForDay = [];
    for (const item of dayArr) {
      if (effectiveExamBatch || (mode !== 'classes' && isLikelyExamItem(item, dateKey, dayArr.length))) {
        const res = upsertExamRecord({ ...item, date: dateKey });
        if (res.exam) {
          updatedExamsCount++;
          detailsList.push(`🎓 <b>${toRuShortDate(res.exam.date)} (${res.exam.time}):</b> ${res.exam.label} «${res.exam.subject}» — <b>Каб ${res.exam.room}</b>`);
        }
      } else {
        afternoonForDay.push(item);
      }
    }

    if (afternoonForDay.length > 0 && mode !== 'exams') {
      mergeAfternoonClassesForDay(dateKey, afternoonForDay);
      updatedClassDays++;
      const finalDay = CLASSES[dateKey] || [];
      const dayPairs = finalDay.map(p => `${p.start || ''}–${p.end || ''} ${p.subject || 'Предмет'} (Каб ${p.room || '?'})`).join(', ');
      detailsList.push(`📅 <b>${toRuShortDate(dateKey)}:</b> ${dayPairs}`);
    }
  }

  if (Array.isArray(parsed.shifts)) {
    WORK_SHIFTS_24H = [...parsed.shifts];
    detailsList.push(`🛠️ <b>Смены 09–09:</b> ${WORK_SHIFTS_24H.map(toRuShortDate).join(', ')}`);
  }
  if (parsed.notes && typeof parsed.notes === 'object') {
    PERSONAL_NOTES = { ...parsed.notes };
  }

  const summaryParts = [];
  if (updatedClassDays > 0) summaryParts.push(`учебных дней: ${updatedClassDays}`);
  if (updatedExamsCount > 0) summaryParts.push(`зачётов/экзаменов: ${updatedExamsCount}`);
  const summaryHeader = summaryParts.length > 0 ? `<b>Обновлено ${summaryParts.join(', ')}</b>` : `<b>Данные синхронизированы</b>`;
  const modelSuffix = modelLabel ? ` (${modelLabel})` : '';

  const logMsg = `${summaryHeader}${modelSuffix}<br>` + detailsList.join('<br>');
  logCalendarChange(actionLabel, logMsg);
  saveAllToStorage(updatedExamsCount > 0 && updatedClassDays === 0 ? 'Экзамены' : 'Обновление');
  refreshAllViews();

  return { updatedClassDays, updatedExamsCount, detailsList, summaryHeader };
}

function isClassDeletedInChangelog(dateIso, subject, startTime) {
  if (!Array.isArray(CALENDAR_CHANGELOG) || CALENDAR_CHANGELOG.length === 0) return false;
  const ruDate = toRuShortDate(dateIso);
  return CALENDAR_CHANGELOG.some(entry => {
    if (!entry || !entry.action || !entry.detail) return false;
    if (!entry.action.toLowerCase().includes('удален')) return false;
    const det = String(entry.detail);
    if (!det.includes(ruDate)) return false;
    if (subject && subjectsMatch(det, subject)) return true;
    if (startTime && det.includes(startTime)) return true;
    return false;
  });
}

function isExamDeletedInChangelog(dateIso, subject) {
  if (!Array.isArray(CALENDAR_CHANGELOG) || CALENDAR_CHANGELOG.length === 0) return false;
  const ruDate = toRuShortDate(dateIso);
  return CALENDAR_CHANGELOG.some(entry => {
    if (!entry || !entry.action || !entry.detail) return false;
    if (!entry.action.toLowerCase().includes('удален')) return false;
    const det = String(entry.detail);
    if (dateIso && !det.includes(ruDate)) return false;
    if (subject && subjectsMatch(det, subject)) return true;
    return false;
  });
}

function healScheduleAndExamsFromLogs() {
  let healed = false;
  let restoredClassDays = 0;
  let recoveredExamRooms = 0;
  let recoveredClassRooms = 0;

  if (!Array.isArray(EXAMS)) EXAMS = [];
  if (!CLASSES || typeof CLASSES !== 'object') CLASSES = {};

  const classDateKeys = Object.keys(CLASSES);
  const hasBogusDateKeys = classDateKeys.some(k => !/^2026-(?:10|11)-\d{2}$/.test(k) || k === '2026-10-14');
  if (hasBogusDateKeys) {
    for (const k of classDateKeys) {
      if (!/^2026-(?:10|11)-\d{2}$/.test(k) || k === '2026-10-14') {
        delete CLASSES[k];
        healed = true;
      }
    }
  }

  for (const dateIso of Object.keys(CLASSES)) {
    const currentArr = Array.isArray(CLASSES[dateIso]) ? CLASSES[dateIso] : [];
    const validAfternoon = [];
    for (const item of currentArr) {
      if (isLikelyExamItem(item, dateIso, currentArr.length)) {
        const res = upsertExamRecord({ ...item, date: dateIso });
        if (res.updated) recoveredExamRooms++;
        healed = true;
      } else {
        validAfternoon.push(item);
      }
    }
    if (validAfternoon.length !== currentArr.length) {
      CLASSES[dateIso] = validAfternoon;
      healed = true;
    }
  }

  CLASSES = sanitizeClassesData(CLASSES);
  EXAMS = sanitizeExamsData(EXAMS);

  if (Array.isArray(CALENDAR_CHANGELOG) && CALENDAR_CHANGELOG.length > 0) {
    const chronologicalLogs = [...CALENDAR_CHANGELOG].reverse();
    const lineRegex = /📅\s*<b>(\d{2})\.(\d{2})\.(\d{4}):<\/b>\s*(.*)/i;
    const itemRegex = /(?:^|,\s*)(?:(\d{1,2}[:.]\d{2}))?\s*[–-]\s*(?:(\d{1,2}[:.]\d{2}))?\s*(.+?)\s*\(Каб\s*([^)]+)\)/g;
    const examLogRegex = /🎓\s*<b>(\d{2})\.(\d{2})\.(\d{4})(?:\s*\((\d{1,2}[:.]\d{2})\))?:?<\/b>\s*[^«"]*?[«"]([^»"]+)[»"].*?Каб\s*([^<)]+)/i;

    for (const entry of chronologicalLogs) {
      if (!entry || !entry.detail) continue;
      if (entry.action && entry.action.toLowerCase().includes('удален')) continue;
      const lines = String(entry.detail).split(/<br\s*\/?>/i);
      const parsedLines = [];

      for (const rawLine of lines) {
        const cleanLine = rawLine.replace(/<\/?b>/gi, match => match.toLowerCase());
        const exMatch = cleanLine.match(examLogRegex);
        if (exMatch) {
          const iso = `${exMatch[3]}-${exMatch[2]}-${exMatch[1]}`;
          const tStr = normalizeTimeToken(exMatch[4] || '');
          const subjStr = exMatch[5].trim();
          const roomStr = cleanRoomString(exMatch[6]);
          if (isValidRoomValue(roomStr) && !isExamDeletedInChangelog(iso, subjStr)) {
            const res = upsertExamRecord({ date: iso, time: tStr, subject: subjStr, room: roomStr });
            if (res.updated) {
              recoveredExamRooms++;
              healed = true;
            }
          }
          continue;
        }

        const m = cleanLine.match(lineRegex);
        if (!m) continue;
        const iso = `${m[3]}-${m[2]}-${m[1]}`;
        const restText = m[4].replace(/<[^>]+>/g, '');
        const items = [];
        let im;
        itemRegex.lastIndex = 0;
        while ((im = itemRegex.exec(restText)) !== null) {
          items.push({
            start: normalizeTimeToken(im[1] || ''),
            end: normalizeTimeToken(im[2] || ''),
            subject: (im[3] || '').trim(),
            room: cleanRoomString(im[4] || '')
          });
        }
        if (items.length > 0) {
          parsedLines.push({ iso, items });
        }
      }

      for (const pl of parsedLines) {
        for (const it of pl.items) {
          if (!isValidRoomValue(it.room)) continue;
          if (isLikelyExamItem(it, pl.iso, pl.items.length)) {
            if (!isExamDeletedInChangelog(pl.iso, it.subject)) {
              const res = upsertExamRecord({ date: pl.iso, time: it.start, subject: it.subject, room: it.room });
              if (res.updated) {
                recoveredExamRooms++;
                healed = true;
              }
            }
          } else {
            const dayArr = CLASSES[pl.iso] || [];
            let targetCls = dayArr.find(c => c.start === it.start && subjectsMatch(c.subject, it.subject));
            if (!targetCls && it.start) targetCls = dayArr.find(c => c.start === it.start);
            if (targetCls && !isValidRoomValue(targetCls.room)) {
              targetCls.room = it.room;
              recoveredClassRooms++;
              healed = true;
            }
          }
        }
      }
    }
  }

  EXAMS.sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));

  if (healed) {
    try {
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(CLASSES));
      localStorage.setItem(STORAGE_KEY_EXAMS, JSON.stringify(EXAMS));
    } catch (e) {}
  }

  return { healed, restoredClassDays, recoveredExamRooms, recoveredClassRooms };
}

function manualRecoverFromLogs() {
  const res = healScheduleAndExamsFromLogs();
  saveAllToStorage('Восстановление');
  refreshAllViews();
  const examsWithRooms = EXAMS.filter(e => isValidRoomValue(e.room));
  const examListHtml = EXAMS.map(e => `• <b>${toRuShortDate(e.date)} (${e.time})</b> ${e.subject}: <b>Каб ${e.room}</b>`).join('<br>');
  showSyncMessage(
    `✅ <b>Восстановление расписания и кабинетов экзаменов выполнено!</b><br>` +
    `📚 Учебных дней в сетке пар: <b>${Object.keys(CLASSES).length}</b> (восстановлено дней: ${res.restoredClassDays}, кабинетов пар из логов: ${res.recoveredClassRooms})<br>` +
    `🎓 Кабинетов зачётов/экзаменов заполнено: <b>${examsWithRooms.length} из ${EXAMS.length}</b> (подтянуто из логов: ${res.recoveredExamRooms}):<br>` +
    `<div class="mt-1.5 pl-2 border-l-2 border-emerald-400/50 text-[11px] space-y-0.5">${examListHtml}</div>`
  );
  showToast(`🛠️ База восстановлена! Экзаменов с каб.: ${examsWithRooms.length}/${EXAMS.length}`);
}

function applyJsonPatch() {
  const raw = document.getElementById('jsonPatchInput').value.trim();
  if (!raw) {
    showSyncMessage('⚠️ Вставь JSON-код обновления в текстовое поле.', true);
    return;
  }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const res = applySmartScheduleUpdate(parsed, 'auto', 'Импорт JSON', '');
    showSyncMessage(`✅ ${res.summaryHeader}! Обычные пары и зачёты/экзамены аккуратно объединены без потери данных.`);
    showToast(`✅ База успешно обновлена`);
  } catch (e) {
    showSyncMessage('❌ Ошибка формата JSON. Убедись, что скопирован блок от { до }.', true);
  }
}

function exportCurrentScheduleJson() {
  const fullBackup = {
    classes: CLASSES,
    exams: EXAMS,
    shifts: WORK_SHIFTS_24H,
    notes: PERSONAL_NOTES
  };
  const dataStr = JSON.stringify(fullBackup, null, 2);
  document.getElementById('jsonPatchInput').value = dataStr;
  copyTextFallback(dataStr);
  showSyncMessage('📋 Полная база расписания скопирована в буфер обмена!');
}

async function resetToFactorySchedule() {
  localStorage.removeItem(STORAGE_KEY_CLASSES);
  localStorage.removeItem(STORAGE_KEY_EXAMS);
  localStorage.removeItem(STORAGE_KEY_SHIFTS);
  localStorage.removeItem(STORAGE_KEY_NOTES);
  localStorage.removeItem(STORAGE_KEY_STAMP);
  CLASSES = {};
  EXAMS = [];
  WORK_SHIFTS_24H = [];
  PERSONAL_NOTES = {};
  updateStorageBadge();
  refreshAllViews();
  showSyncMessage('⏳ Загружаем чистую базу из schedule.json...');
  const loaded = await pullScheduleFromGithub(true);
  if (loaded) {
    logCalendarChange('Сброс базы', 'База перезагружена из файла schedule.json');
    showSyncMessage('🔄 База успешно перезагружена из schedule.json!');
    showToast('🔄 База перезагружена из schedule.json');
  } else {
    showSyncMessage('⚠️ Локальная память очищена. Убедись, что файл schedule.json доступен.', true);
  }
}

async function scanPhotoWithGemini() {
  const keyInput = document.getElementById('geminiApiKeyInput');
  const apiKey = sanitizeGeminiKey(keyInput.value);
  keyInput.value = apiKey;

  const fileInput = document.getElementById('schedulePhotoInput');
  if (!apiKey) {
    showSyncMessage('⚠️ Введи свой Gemini API Key в поле №1.', true);
    return;
  }
  if (!fileInput.files || !fileInput.files[0]) {
    showSyncMessage('⚠️ Сначала выбери фотографию расписания со стенда (шаг №3).', true);
    return;
  }

  localStorage.setItem(STORAGE_KEY_API, apiKey);
  const btn = document.getElementById('scanPhotoBtn');
  btn.disabled = true;
  btn.textContent = '⏳ ИИ (gemini-3.5-flash-lite) распознаёт фото...';
  showSyncMessage('🔍 Сжимаем изображение и отправляем в Gemini (приоритет: gemini-3.5-flash-lite)...');

  try {
    const file = fileInput.files[0];
    const { base64Data, mimeType } = await compressAndConvertImage(file);

    const modeInstruction = currentAiScanMode === 'exams'
      ? 'На этом фото изображено РАСПИСАНИЕ ЗАЧЁТОВ И ЭКЗАМЕНОВ. Извлеки все зачёты и экзамены для группы 1Б строго в массив "exams", а объект "classes" оставь пустым {}.'
      : (currentAiScanMode === 'classes'
        ? 'На этом фото изображено РАСПИСАНИЕ ОБЫЧНЫХ УЧЕБНЫХ ПАР (14:10–20:10). Извлеки все пары для группы 1Б в объект "classes", а массив "exams" оставь пустым [].'
        : 'Определи автоматически, что на фото: расписание обычных дневных/вечерних пар (14:10–15:30, 15:50–17:10, 17:20–18:40, 18:50–20:10) ИЛИ ведомость/график сдачи зачётов и экзаменов (обычно утреннее время 08:00, 09:00, 09:30, 10:00, 11:00 или по одному предмету в день без времени окончания).');

    const prompt = `Ты точный парсер расписания Юридического факультета БГУ для специальности «Политология», 4 курс, заочное отделение, группа 1Б (год 2026).
Извлеки из фото ТОЛЬКО строки, относящиеся к группе "1Б" или общему потоку "1, 1Б" (строки только для группы "1" игнорируй!).
${modeInstruction}

ВАЖНЫЕ ПРАВИЛА РАЗДЕЛЕНИЯ ПАР И ЭКЗАМЕНОВ:
1. Обычные учебные пары (лекции и семинары) всегда идут в слотах 14:10–15:30, 15:50–17:10, 17:20–18:40, 18:50–20:10. Даже если рядом с предметом написано "(зач)" или "(экз)", это просто форма итоговой отчётности — сама пара с временем 14:10–20:10 записывается ТОЛЬКО в "classes"!
2. Сдача зачётов и экзаменов (расписание зачётов и экзаменов) — это отдельные события аттестации (обычно утром: 08:00, 09:30, 11:00, либо указано только время начала без времени конца). Они записываются ТОЛЬКО в массив "exams"!
Известные 7 зачётов/экзаменов этой сессии:
- 2026-10-30 (09:30): Государственная служба (зач, доц. Краснобаева Л.А.)
- 2026-11-03 (09:30): Финансовое право (зач, доц. Пилипенко А.А.)
- 2026-11-06 (09:30): Хозяйственное право (экз, ст. преп. Гавриленко А.В.)
- 2026-11-09 (09:30): Организация избирательных кампаний (зач, доц. Юсупов П.В.)
- 2026-11-10 (08:00): Уголовное право (экз, доц. Федчук И.Л.)
- 2026-11-11 (11:00): Политическая коммуникация (зач, доц. Абраменко Е.Г.)
- 2026-11-12 (09:30): Этнополитология (экз, доц. Слуцкая Л.В.)

Верни СТРОГО валидный JSON-объект без пояснений в следующем формате:
{
  "type": "classes или exams или mixed",
  "classes": {
    "2026-10-26": [
      {"start":"14:10","end":"15:30","subject":"Название","control":"экз или зач","teacher":"ФИО","room":"номер кабинета"}
    ]
  },
  "exams": [
    {"date":"2026-10-30","time":"09:30","subject":"Государственная служба","type":"зач","teacher":"доц. Краснобаева Л.А.","room":"номер кабинета"}
  ]
}`;

    const result = await callGeminiWithFallback(apiKey, [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }], true);

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Модель не вернула JSON-структуру расписания. Попробуй более чёткое фото.');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const previewObj = buildPhotoScheduleDiffPreview(parsed, currentAiScanMode, result.modelName);

    openPhotoDiffConfirmModal(previewObj);

    showSyncMessage(
      `🔍 <b>Фото распознано (${escapeHtml(result.modelName)})!</b> Проверь список изменений (старый и новый вариант) в открывшемся диалоговом окне и подтверди обновление.`
    );
    showToast(`🔍 Проверь и подтверди изменения (${result.modelName})`);
  } catch (err) {
    showSyncMessage(`❌ Не удалось распознать фото: <b>${escapeHtml(err.message)}</b>`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 Распознать фото для группы 1Б и проверить изменения';
  }
}

function compressAndConvertImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({
          base64Data: dataUrl.split(',')[1],
          mimeType: 'image/jpeg'
        });
      };
      img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}
