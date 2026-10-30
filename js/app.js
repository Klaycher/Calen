// ============================================================================
// МОДУЛЬ 7: ТОЧКА ВХОДА, УСТАНОВКА PWA И ЗАПУСК ПРИЛОЖЕНИЯ (js/app.js)
// ============================================================================
let deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const nativeBtn = document.getElementById('pwaNativeInstallBtn');
  if (nativeBtn) nativeBtn.classList.remove('hidden');
  const textEl = document.getElementById('pwaInstallBtnText');
  if (textEl) textEl.textContent = 'Установить';
});

window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  const nativeBtn = document.getElementById('pwaNativeInstallBtn');
  if (nativeBtn) nativeBtn.classList.add('hidden');
  const textEl = document.getElementById('pwaInstallBtnText');
  if (textEl) textEl.textContent = 'Установлено';
  showToast('🎉 Приложение успешно установлено на телефон!');
});

function isRunningStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         (window.navigator && window.navigator.standalone === true);
}

function handlePwaInstallClick() {
  if (isRunningStandalone()) {
    showToast('📱 Приложение уже открыто в отдельном окне!');
    return;
  }
  if (deferredPwaPrompt) {
    triggerPwaPrompt();
  } else {
    openPwaInstallModal();
  }
}

function openPwaInstallModal() {
  const modal = document.getElementById('pwaInstallModal');
  if (modal) modal.classList.remove('hidden');
}

function closePwaInstallModal() {
  const modal = document.getElementById('pwaInstallModal');
  if (modal) modal.classList.add('hidden');
}

async function triggerPwaPrompt() {
  if (!deferredPwaPrompt) {
    openPwaInstallModal();
    return;
  }
  try {
    deferredPwaPrompt.prompt();
    const choice = await deferredPwaPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      showToast('✅ Установка приложения запущена...');
    }
    deferredPwaPrompt = null;
    closePwaInstallModal();
  } catch (e) {
    openPwaInstallModal();
  }
}

if (isRunningStandalone()) {
  const btn = document.getElementById('pwaInstallHeaderBtn');
  if (btn) {
    btn.innerHTML = '<span>📱</span> <span class="hidden md:inline">Установлено</span>';
    btn.className = 'px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600/25 text-emerald-200 border border-emerald-500/30 transition flex items-center gap-1 shadow-sm';
  }
}

// Первичный запуск v1.0.1
applyAdminVisibility();
updateStorageBadge();

async function bootstrapModularApp() {
  // 1. Загружаем внешние базы с сайта и GitHub (teachers.json, releases.json, schedule.json)
  await loadModularDataFiles();

  // 2. Отрисовываем интерфейс
  applyAdminVisibility();
  updateStorageBadge();
  updateChangelogBadge();
  if (typeof renderAiPhotoQueueUI === 'function') {
    renderAiPhotoQueueUI();
  }
  selectToday();
  refreshAllViews();

  // 3. Запрашиваем самый свежий schedule.json напрямую с GitHub API
  pullScheduleFromGithub(false, true);

  // 4. Автоматически проверяем обновления при возвращении пользователя во вкладку / разблокировке телефона
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pullScheduleFromGithub(false, true);
    }
  });
  window.addEventListener('focus', () => {
    pullScheduleFromGithub(false, true);
  });

  // 5. Периодические таймеры (живая сводка каждую секунду, проверка обновлений на GitHub каждые 30 сек)
  setInterval(renderAssistantTemplate, 1000);
  setInterval(() => {
    pullScheduleFromGithub(false, true);
  }, 30000);
}

bootstrapModularApp();
