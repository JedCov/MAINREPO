'use strict';

const $ = id => document.getElementById(id);
const dom = {};

const MAIN_DEFAULT_NAME = '4-Minute Core Workout';
const MAIN_DEFAULT_TEXT = 'Abdominal Crunches, 30, 10\nHundreds, 30, 10\nRoll-Like-A-Ball, 30, 10\nAbdominal Leg Raises, 30, 10\nLeg-To-Chest Raises, 30, 10\nCobra Pose, 30, 10\nPlank, 30, 0';

const defaults = {
  [MAIN_DEFAULT_NAME]: MAIN_DEFAULT_TEXT
};
const LEGACY_ROUTINE_NAMES = new Set([
  'Legacy: Monday Dumbbell Split',
  'Legacy: Wednesday Dumbbell Split',
  'Legacy: Friday Dumbbell Split',
  'Monday Dumbbell Split',
  'Wednesday Dumbbell Split',
  'Friday Dumbbell Split',
  'Monday: Biceps & Triceps',
  'Wednesday: Shoulders & Back',
  'Friday: Legs & Chest',
  'Strength Intro'
]);

let vault = {};
let routine = null;
let index = -1;
let mode = 'setup';
let seconds = 0;
let totalSeconds = 0;
let timer = null;
let paused = false;
let startedAt = 0;
let lastTick = null;
let selected = null;
let confirmAction = null;
let wakeLockSentinel = null;
const activeOverlays = new Set();

function isWorkoutActive() {
  return mode === 'ready' || mode === 'exercise' || mode === 'rest';
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || !navigator.wakeLock || !navigator.wakeLock.request) return;
  if (!isWorkoutActive() || document.visibilityState !== 'visible') return;
  if (wakeLockSentinel) return;

  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
  } catch (error) {
    wakeLockSentinel = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLockSentinel) return;

  try {
    await wakeLockSentinel.release();
  } catch (error) {
    // Wake lock may already be released by the browser.
  } finally {
    wakeLockSentinel = null;
  }
}

function clean(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function parse(text) {
  const exercises = [];

  String(text || '').split('\n').forEach(line => {
    const parts = line.split(',').map(x => x.trim());

    if (parts.length >= 2 && parts[0]) {
      exercises.push({
        name: parts[0],
        duration: Math.max(1, parseInt(parts[1], 10) || 30),
        rest: Math.max(0, parseInt(parts[2], 10) || 0)
      });
    }
  });

  return exercises;
}

function titleCase(text) {
  return String(text || '').replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function normaliseQuickRoutineText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/super\s*set/g, 'superset')
    .replace(/chip ups/g, 'chin ups')
    .replace(/chinups/g, 'chin ups')
    .replace(/pullups/g, 'pull ups')
    .replace(/pushups/g, 'push ups')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNaturalRoutine(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.includes(',')) return parse(raw);

  let normalised = normaliseQuickRoutineText(raw);
  const setMatch = normalised.match(/(\d+)\s*sets?/);
  const sets = setMatch ? Math.max(1, parseInt(setMatch[1], 10)) : 1;

  normalised = normalised
    .replace(/\d+\s*sets?/g, '')
    .replace(/^superset\s*/, '')
    .trim();

  const matches = Array.from(normalised.matchAll(/(\d+)\s+([^0-9]+?)(?=\s+\d+\s+|$)/g));
  if (!matches.length) return [];

  const movements = matches.map(match => ({
    reps: parseInt(match[1], 10),
    name: titleCase(match[2].replace(/^and\s+/, '').trim())
  })).filter(movement => movement.reps && movement.name);

  const exercises = [];
  for (let set = 1; set <= sets; set += 1) {
    movements.forEach((movement, movementIndex) => {
      const isLast = set === sets && movementIndex === movements.length - 1;
      exercises.push({
        name: `Set ${set}: ${movement.name}`,
        duration: Math.max(20, Math.min(60, movement.reps * 3)),
        rest: isLast ? 0 : 10
      });
    });
  }

  return exercises;
}

function countRoutineEntries(text) {
  const commaCount = parse(text).length;
  if (commaCount > 0) return commaCount;
  return parseNaturalRoutine(text).length;
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  setTimeout(() => dom.toast.classList.remove('show'), 2500);
}

function loadVaultData() {
  let storedVault = {};

  try {
    storedVault = JSON.parse(localStorage.getItem('tempo_vault')) || {};
  } catch {
    storedVault = {};
  }

  Object.keys(storedVault).forEach(name => {
    if (LEGACY_ROUTINE_NAMES.has(name)) {
      delete storedVault[name];
    }
  });

  vault = { ...defaults, ...storedVault };
  vault[MAIN_DEFAULT_NAME] = MAIN_DEFAULT_TEXT;
  localStorage.setItem('tempo_vault', JSON.stringify(vault));
  populateVaultUI();
}

function populateVaultUI() {
  const routineNames = Object.keys(vault).filter(name => !LEGACY_ROUTINE_NAMES.has(name));

  dom.vaultList.innerHTML = routineNames.map(name => `
    <div class="vault-item">
      <span class="font-bold">${clean(name)}</span>
      <button class="primary btn-small" type="button" data-routine-key="${encodeURIComponent(name)}">Play</button>
    </div>
  `).join('');

  dom.vaultList.querySelectorAll('button[data-routine-key]').forEach(button => {
    button.addEventListener('click', () => {
      const routineKey = decodeURIComponent(button.dataset.routineKey || '');
      showPreview(routineKey, vault[routineKey]);
    });
  });
}

function showPreview(name, text) {
  let exercises = parse(text);
  if (!exercises.length) exercises = parseNaturalRoutine(text);

  if (!exercises.length) {
    toast('Invalid routine format.');
    return;
  }

  selected = { name, exercises };
  dom.previewTitle.textContent = name;
  dom.previewMovements.textContent = exercises.length;

  const total = exercises.reduce((sum, ex) => sum + ex.duration + ex.rest, 0);
  dom.previewTime.textContent = `${Math.floor(total / 60)}m ${total % 60}s`;

  dom.previewList.innerHTML = exercises
    .map(ex => `• ${clean(ex.name)} (${ex.duration}s)`)
    .join('<br>');

  showDialog('previewDialog');
}

function loadExample() {
  selected = null;
  showPreview(MAIN_DEFAULT_NAME, MAIN_DEFAULT_TEXT);
}

function confirmStartPreview() {
  closeDialog('previewDialog');
  closeDialog('vaultDialog');

  if (selected) {
    startWorkout(selected);
  }
}

function startWorkout(data) {
  routine = data;
  index = -1;
  mode = 'ready';
  paused = false;
  startedAt = Date.now();

  dom.setup.classList.add('hidden');
  dom.workoutContainer.classList.remove('hidden');

  requestWakeLock();
  startPhase(10);
  render();
}

function startPhase(length) {
  clearInterval(timer);

  totalSeconds = length;
  seconds = length;
  lastTick = Date.now();

  timer = setInterval(tick, 250);
}

function tick() {
  if (paused) return;

  const now = Date.now();

  if (now - lastTick >= 1000) {
    seconds = Math.max(0, seconds - 1);
    lastTick = now;
    updateTimer();

    if (seconds <= 0) {
      nextScreen();
    }
  }
}

function nextScreen() {
  if (mode === 'ready') {
    showExercise(0);
    return;
  }

  if (mode === 'exercise') {
    const current = routine.exercises[index];

    if (current.rest > 0) {
      showRest();
      return;
    }

    if (index < routine.exercises.length - 1) {
      showExercise(index + 1);
    } else {
      finishWorkout();
    }

    return;
  }

  if (mode === 'rest') {
    if (index < routine.exercises.length - 1) {
      showExercise(index + 1);
    } else {
      finishWorkout();
    }
  }
}

function showExercise(i) {
  index = i;
  mode = 'exercise';
  startPhase(routine.exercises[index].duration);
  render();
}

function showRest() {
  mode = 'rest';
  startPhase(routine.exercises[index].rest);
  render();
}

function finishWorkout() {
  clearInterval(timer);
  mode = 'complete';
  releaseWakeLock();
  render();
}

function render() {
  dom.body.classList.toggle('rest-mode', mode === 'rest');
  dom.pauseBtn.textContent = paused ? 'Resume' : 'Pause';

  if (mode === 'complete') {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);

    dom.workoutView.innerHTML = `
      <div class="panel text-center">
        <div class="success-indicator">✓</div>
        <h1>Done</h1>
        <div class="infoGrid">
          <div class="black-box"><b>${routine.exercises.length}</b><span>Moves</span></div>
          <div class="black-box"><b>${Math.floor(elapsed / 60)}m</b><span>Time</span></div>
        </div>
        <button id="finishBtn" class="primary w-full mt-lg" type="button">Finish Session</button>
      </div>
    `;

    $('finishBtn').addEventListener('click', backToSetup);
    return;
  }

  const ex = routine.exercises[index] || { name: 'Prepare' };
  const title = mode === 'ready'
    ? 'PREPARE'
    : mode === 'rest'
      ? 'REST'
      : ex.name.toUpperCase();

  const sub = mode === 'ready'
    ? 'Mental Check'
    : mode === 'rest'
      ? 'Recovery'
      : 'Action Phase';

  const detail = mode === 'rest' && routine.exercises[index + 1]
    ? `Next: ${clean(routine.exercises[index + 1].name)}`
    : `${Math.max(index + 1, 0)} / ${routine.exercises.length}`;

  dom.workoutView.innerHTML = `
    <div class="panel" style="position:relative">
      <div class="pause-indicator" style="display:${paused ? 'block' : 'none'}">PAUSED</div>
      <h3>${sub}</h3>
      <h1>${clean(title)}</h1>
      <p class="text-muted">${detail}</p>
      <div id="mainTimer" class="timer">${String(seconds).padStart(2, '0')}</div>
      <div class="progressbar"><div id="progressFill" class="progress-fill"></div></div>
    </div>
  `;

  $('mainTimer').addEventListener('click', togglePause);
  updateTimer();
}

function updateTimer() {
  const time = $('mainTimer');
  const fill = $('progressFill');

  if (time) {
    time.textContent = String(seconds).padStart(2, '0');
  }

  if (fill) {
    const progress = totalSeconds ? (totalSeconds - seconds) / totalSeconds : 0;
    fill.style.transform = `scaleX(${progress})`;
  }
}

function togglePause() {
  if (mode === 'setup' || mode === 'complete') return;

  paused = !paused;
  lastTick = Date.now();
  render();
}

function skip() {
  if (mode !== 'setup' && mode !== 'complete') {
    nextScreen();
  }
}

function backToSetup() {
  clearInterval(timer);
  releaseWakeLock();

  routine = null;
  index = -1;
  mode = 'setup';
  paused = false;

  dom.body.classList.remove('rest-mode');
  dom.workoutContainer.classList.add('hidden');
  dom.setup.classList.remove('hidden');
}

function showDialog(id) {
  const dialog = $(id);

  if (dialog && !dialog.open) {
    dialog.showModal();
    activeOverlays.add(id);
  }
}

function closeDialog(id) {
  const dialog = $(id);

  if (dialog && dialog.open) {
    dialog.close();
  }
  activeOverlays.delete(id);
}

function pushStateAndShow(id) {
  showDialog(id);
  if (activeOverlays.has(id)) {
    history.pushState({ tempoOverlay: id }, '', location.href);
  }
}

function closeOverlay(id) {
  closeDialog(id);

  const state = history.state;
  if (state && state.tempoOverlay === id) {
    history.back();
  }
}

function closeAllOverlays() {
  Array.from(activeOverlays).forEach(id => closeDialog(id));
}

function handleBackNavigation() {
  closeAllOverlays();
}

function handleVisibilityWakeLock() {
  if (document.visibilityState === 'visible') {
    requestWakeLock();
    return;
  }

  releaseWakeLock();
}

function openBuilder() {
  dom.routineName.value = '';
  dom.customList.value = '';
  validateAndPreview();
  showDialog('customDialog');
}

function validateAndPreview() {
  const count = countRoutineEntries(dom.customList.value);
  dom.btnSaveRoutine.disabled = count === 0;
  dom.routinePreview.textContent = count
    ? `${count} moves detected.`
    : 'Enter movements...';
}

function saveAndStartCustom() {
  const name = dom.routineName.value.trim() || 'Custom Routine';
  const text = dom.customList.value.trim();

  if (!parse(text).length && !parseNaturalRoutine(text).length) {
    toast('Add at least one movement.');
    return;
  }

  vault[name] = text;
  localStorage.setItem('tempo_vault', JSON.stringify(vault));

  populateVaultUI();
  closeDialog('customDialog');
  showPreview(name, text);
}

function restoreDefaults() {
  vault = { [MAIN_DEFAULT_NAME]: MAIN_DEFAULT_TEXT };
  localStorage.setItem('tempo_vault', JSON.stringify(vault));
  populateVaultUI();
}

function confirmEndSession() {
  confirmAction = () => {
    closeDialog('confirmDialog');
    backToSetup();
  };

  showDialog('confirmDialog');
}

function executeConfirm() {
  if (confirmAction) {
    confirmAction();
  }
}

function loadSettings() {
  dom.volumeControl.value = localStorage.getItem('tempoVolume') || 70;
  dom.audioProfile.value = localStorage.getItem('tempoAudioProfile') || 'full';
}

function saveSettings() {
  localStorage.setItem('tempoVolume', dom.volumeControl.value);
  localStorage.setItem('tempoAudioProfile', dom.audioProfile.value);
  closeDialog('settingsDialog');
  toast('Settings saved');
}

function resumeSession() {
  toast('Resume support is planned for v5.9.');
}

function clearResumeState() {
  dom.resumeCard.classList.add('hidden');
}

function boot() {
  [
    'body',
    'setup',
    'workoutContainer',
    'workoutView',
    'pauseBtn',
    'vaultList',
    'vaultDialog',
    'customDialog',
    'settingsDialog',
    'resumeCard',
    'volumeControl',
    'customList',
    'routineName',
    'toast',
    'routinePreview',
    'btnSaveRoutine',
    'confirmDialog',
    'previewDialog',
    'previewTitle',
    'previewMovements',
    'previewTime',
    'previewList',
    'audioProfile'
  ].forEach(id => {
    dom[id] = $(id);
  });

  loadSettings();
  loadVaultData();

  dom.customList.addEventListener('input', validateAndPreview);
  dom.routineName.addEventListener('input', validateAndPreview);
  ['previewDialog', 'vaultDialog', 'customDialog', 'settingsDialog', 'confirmDialog'].forEach(id => {
    const dialog = $(id);
    if (!dialog) return;
    dialog.addEventListener('close', () => {
      activeOverlays.delete(id);
    });
  });
  window.addEventListener('popstate', handleBackNavigation);
  document.addEventListener('visibilitychange', handleVisibilityWakeLock);
}
Object.assign(window, {
  loadExample,
  confirmStartPreview,
  pushStateAndShow,
  closeOverlay,
  openBuilder,
  saveAndStartCustom,
  restoreDefaults,
  saveSettings,
  resumeSession,
  clearResumeState,
  skip,
  togglePause,
  confirmEndSession,
  executeConfirm,
  backToSetup,
  showPreview,
  validateAndPreview,
  parseNaturalRoutine
});
document.addEventListener('DOMContentLoaded', boot);
