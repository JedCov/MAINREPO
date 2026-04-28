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
let closingFromPopstate = false;
let suppressPopstateClose = false;

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

function clampDuration(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(600, parsed));
}

function clampRest(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.max(0, Math.min(600, parsed));
}

function parseNaturalLanguageLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return { exercises: [], warnings: [] };

  const warnings = [];
  const roundsMatch = raw.match(/^(\d+)\s*(?:rounds?|sets?)\s*:\s*(.+)$/i);
  if (roundsMatch) {
    const rounds = Math.max(1, clampDuration(roundsMatch[1], 1));
    const block = roundsMatch[2];
    const pieces = block.split(/\s*,\s*/).map(piece => piece.trim()).filter(Boolean);
    const parsedPieces = pieces.flatMap(piece => parseNaturalLanguageLine(piece).exercises);
    const exercises = [];

    for (let round = 1; round <= rounds; round += 1) {
      parsedPieces.forEach(piece => {
        exercises.push({
          name: `Round ${round}: ${piece.name}`,
          duration: piece.duration,
          rest: piece.rest,
          note: piece.note || ''
        });
      });
    }

    warnings.push(`Interpreted as ${rounds} rounds.`);
    return { exercises, warnings };
  }

  const repPattern = /([a-z][a-z\s-]*?)\s+(\d+)\s*x\s*(\d+)/ig;
  const repMatches = Array.from(raw.replace(/^superset\s*/i, '').matchAll(repPattern));
  if (repMatches.length) {
    return {
      exercises: repMatches.map(match => ({
        name: titleCase(match[1].trim()),
        duration: 30,
        rest: null,
        note: `${match[2]}x${match[3]} reps`
      })),
      warnings: ['Rep-based input converted to 30s work intervals.']
    };
  }

  const patterns = [
    /^(.+?)\s*(?:for\s*)?(\d+)\s*(?:s|sec|secs|second|seconds)\b(?:[,\s;:-]*(?:rest|break)\s*(\d+)\s*(?:s|sec|secs|second|seconds)?)?$/i,
    /^(\d+)\s*(?:s|sec|secs|second|seconds)\s+(.+?)(?:[,\s;:-]*(\d+)\s*(?:s|sec|secs|second|seconds)\s*(?:rest|break))?$/i,
    /^(.+?)\s+(\d+)\s*s(?:ec(?:onds?)?)?\b(?:\s*(?:rest|break)\s*(\d+)\s*s(?:ec(?:onds?)?)?)?$/i,
    /^(.+?)(?:\s*(?:rest|break)\s*(\d+)\s*s(?:ec(?:onds?)?)?)?$/i
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = raw.match(patterns[i]);
    if (!match) continue;

    let name = '';
    let duration = 30;
    let rest = null;

    if (i === 0) {
      name = match[1].trim();
      duration = clampDuration(match[2], 30);
      rest = match[3] == null ? null : clampRest(match[3], 10);
    } else if (i === 1) {
      duration = clampDuration(match[1], 30);
      name = match[2].trim();
      rest = match[3] == null ? null : clampRest(match[3], 10);
    } else if (i === 2) {
      name = match[1].trim();
      duration = clampDuration(match[2], 30);
      rest = match[3] == null ? null : clampRest(match[3], 10);
    } else {
      name = match[1].trim();
      rest = match[2] == null ? null : clampRest(match[2], 10);
      warnings.push(`Used default 30s work for "${raw}".`);
    }

    name = titleCase(name.replace(/^and\s+/i, '').trim());
    if (!name) break;

    return {
      exercises: [{ name, duration, rest, note: '' }],
      warnings
    };
  }

  return {
    exercises: [],
    warnings: [`Could not confidently parse "${raw}".`]
  };
}

function parseCustomExercises(text) {
  const lines = String(text || '').split('\n');
  const exercises = [];
  const warnings = [];

  lines.forEach((line, lineIndex) => {
    const raw = line.trim();
    if (!raw) return;

    const parts = raw.split(',').map(part => part.trim());
    const looksStructured = parts.length >= 2 && parts[0] && /^-?\d+$/.test(parts[1]);

    if (looksStructured) {
      const duration = clampDuration(parts[1], 30);
      const hasRest = parts.length >= 3 && /^-?\d+$/.test(parts[2]);
      const rest = hasRest ? clampRest(parts[2], 10) : null;
      if (parts.length >= 3 && !hasRest) {
        warnings.push(`Line ${lineIndex + 1}: rest value was unclear, default applied.`);
      }
      exercises.push({
        name: parts[0],
        duration,
        rest,
        note: ''
      });
      return;
    }

    const parsed = parseNaturalLanguageLine(raw);
    if (!parsed.exercises.length) {
      warnings.push(...parsed.warnings);
      return;
    }

    exercises.push(...parsed.exercises);
    warnings.push(...parsed.warnings);
  });

  const normalised = exercises.map((exercise, exerciseIndex) => ({
    name: exercise.name || `Move ${exerciseIndex + 1}`,
    duration: clampDuration(exercise.duration, 30),
    rest: exercise.rest == null
      ? (exerciseIndex < exercises.length - 1 ? 10 : 0)
      : clampRest(exercise.rest, exerciseIndex < exercises.length - 1 ? 10 : 0),
    note: exercise.note || ''
  }));

  return { exercises: normalised, warnings };
}

function normaliseRoutineText(exercises) {
  return exercises.map(exercise => `${exercise.name}, ${exercise.duration}, ${exercise.rest}`).join('\n');
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

  vault = { ...storedVault };
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
  releaseWakeLock();
  mode = 'complete';
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
  }
}

function closeDialog(id) {
  const dialog = $(id);

  if (dialog && dialog.open) {
    if (closingFromPopstate) {
      dialog.close();
      closingFromPopstate = false;
      return;
    }
    dialog.close();
  }
}

function pushStateAndShow(id) {
  try {
    history.pushState({ tempoOverlay: id }, '', window.location.href);
  } catch {}
  showDialog(id);
}

function closeOverlay(id) {
  if (history.state && history.state.tempoOverlay) {
    suppressPopstateClose = true;
    history.back();
  }
  closeDialog(id);
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (mode === 'setup' || mode === 'complete') return;
  if (document.visibilityState !== 'visible') return;

  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {}
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

function closeTopDialog() {
  const openDialogs = [
    dom.confirmDialog,
    dom.settingsDialog,
    dom.customDialog,
    dom.vaultDialog,
    dom.previewDialog
  ].filter(dialog => dialog && dialog.open);

  const topDialog = openDialogs[0];
  if (!topDialog) return false;

  closingFromPopstate = true;
  closeDialog(topDialog.id);
  return true;
}

function openBuilder() {
  dom.routineName.value = '';
  dom.customList.value = '';
  validateAndPreview();
  showDialog('customDialog');
}

function validateAndPreview() {
  const parsed = parseCustomExercises(dom.customList.value);
  const count = parsed.exercises.length;
  dom.btnSaveRoutine.disabled = count === 0;

  if (!count) {
    dom.routinePreview.innerHTML = 'Enter movements...';
    return;
  }

  const movementPreview = parsed.exercises
    .map(exercise => `• ${clean(exercise.name)} — ${exercise.duration}s / rest ${exercise.rest}s${exercise.note ? ` (${clean(exercise.note)})` : ''}`)
    .join('<br>');

  const warningPreview = parsed.warnings.length
    ? `<br><br><span class="text-muted">Assumptions:<br>${parsed.warnings.map(message => `• ${clean(message)}`).join('<br>')}</span>`
    : '';

  dom.routinePreview.innerHTML = `<b>${count} moves detected.</b><br>${movementPreview}${warningPreview}`;
}

function saveAndStartCustom() {
  const name = dom.routineName.value.trim() || 'Custom Routine';
  const parsed = parseCustomExercises(dom.customList.value);

  if (!parsed.exercises.length) {
    toast('Add at least one movement.');
    return;
  }

  const text = normaliseRoutineText(parsed.exercises);
  dom.customList.value = text;

  vault[name] = text;
  localStorage.setItem('tempo_vault', JSON.stringify(vault));

  populateVaultUI();
  closeDialog('customDialog');
  showPreview(name, text);
}

function normaliseCustomRoutineInput() {
  const parsed = parseCustomExercises(dom.customList.value);
  if (!parsed.exercises.length) return false;

  dom.customList.value = normaliseRoutineText(parsed.exercises);
  dom.customList.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
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
  const legacyVolume = localStorage.getItem('tempoVolume');
  const savedSoundVolume = localStorage.getItem('tempoSoundVolume');
  const savedVoiceVolume = localStorage.getItem('tempoVoiceVolume');

  if (dom.soundVolumeControl) {
    dom.soundVolumeControl.value = savedSoundVolume || legacyVolume || 70;
  } else if (dom.volumeControl) {
    dom.volumeControl.value = savedSoundVolume || legacyVolume || 70;
  }

  if (dom.voiceVolumeControl) {
    dom.voiceVolumeControl.value = savedVoiceVolume || legacyVolume || 70;
  }

  dom.audioProfile.value = localStorage.getItem('tempoAudioProfile') || 'full';
  if (dom.voicePromptsEnabled) {
    dom.voicePromptsEnabled.value = localStorage.getItem('tempoVoicePromptsEnabled') || 'true';
  }
}

function saveSettings() {
  const soundVolumeValue = dom.soundVolumeControl
    ? dom.soundVolumeControl.value
    : (dom.volumeControl ? dom.volumeControl.value : 70);

  localStorage.setItem('tempoSoundVolume', soundVolumeValue);
  localStorage.setItem('tempoVolume', soundVolumeValue);
  if (dom.voiceVolumeControl) {
    localStorage.setItem('tempoVoiceVolume', dom.voiceVolumeControl.value);
  }
  if (dom.voicePromptsEnabled) {
    localStorage.setItem('tempoVoicePromptsEnabled', dom.voicePromptsEnabled.value);
  }
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
    'soundVolumeControl',
    'voiceVolumeControl',
    'voicePromptsEnabled',
    'voiceControl',
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
    'audioProfile',
    'previewVoiceBtn'
  ].forEach(id => {
    dom[id] = $(id);
  });

  loadSettings();
  loadVaultData();

  dom.customList.addEventListener('input', validateAndPreview);
  dom.routineName.addEventListener('input', validateAndPreview);

  [dom.previewDialog, dom.vaultDialog, dom.customDialog, dom.settingsDialog, dom.confirmDialog]
    .filter(Boolean)
    .forEach(dialog => {
      dialog.addEventListener('close', () => {
        if (closingFromPopstate) return;
        if (history.state && history.state.tempoOverlay) {
          suppressPopstateClose = true;
          history.back();
        }
      });
    });

  window.addEventListener('popstate', () => {
    if (suppressPopstateClose) {
      suppressPopstateClose = false;
      return;
    }
    closeTopDialog();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mode !== 'setup' && mode !== 'complete') {
      requestWakeLock();
      return;
    }
    releaseWakeLock();
  });
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
  parseNaturalRoutine,
  normaliseCustomRoutineInput
});
document.addEventListener('DOMContentLoaded', boot);
