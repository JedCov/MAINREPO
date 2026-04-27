(function () {
  'use strict';

  window.tempoSplitRoutines = {
    'Monday: Biceps & Triceps': 'Dumbbell Curls, 30, 10\nOverhead Tricep Extension, 30, 10\nHammer Curls, 30, 10\nClose-Grip Incline Pushups, 30, 10\nTricep Kickbacks, 30, 10\nChair Dips, 30, 0',
    'Wednesday: Shoulders & Back': 'Arnold Press, 30, 10\nOne-Arm Bench Row, 30, 10\nLateral Raises, 30, 10\nRear-Delt Fly, 30, 10\nFront Raises, 30, 10\nUpright Row With Broomstick, 30, 0',
    'Friday: Legs & Chest': 'Goblet Squats, 30, 10\nFeet-Elevated Pushups, 30, 10\nSplit Squats, 30, 10\nSlow-Tempo Pushups, 30, 10\nRomanian Deadlift, 30, 10\nWide-Grip Pushups, 30, 0'
  };

  window.applyTempoSplitRoutines = function () {
    const routines = window.tempoSplitRoutines;
    localStorage.setItem('tempo_vault', JSON.stringify(routines));
    localStorage.setItem('tempo_default_routine_version', '5.8.8-workout-splits');

    const vaultList = document.getElementById('vaultList');
    if (!vaultList) return;

    vaultList.innerHTML = Object.keys(routines).map(function (name) {
      return '<div class="vault-item"><span class="font-bold">' + name + '</span><button class="primary btn-small" type="button" data-split-routine="' + name + '">Play</button></div>';
    }).join('');
  };

  try {
    window.applyTempoSplitRoutines();
  } catch (error) {
    console.warn('Could not update Tempo split routines', error);
  }
})();

(function () {
  'use strict';

  function titleCase(text) {
    return String(text || '').replace(/\w\S*/g, function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  function normaliseExerciseName(name) {
    return titleCase(String(name || '').trim()
      .replace(/^and\s+/, '')
      .replace(/\s+/g, ' '));
  }

  function quickParseRoutine(rawText) {
    const raw = String(rawText || '').trim();
    if (!raw) return '';
    if (raw.indexOf(',') !== -1) return raw;

    let text = raw.toLowerCase();
    text = text.replace(/super\s*set/g, 'superset');
    text = text.replace(/chip ups/g, 'chin ups');
    text = text.replace(/chinups/g, 'chin ups');
    text = text.replace(/pullups/g, 'pull ups');
    text = text.replace(/pushups/g, 'push ups');
    text = text.replace(/\s+/g, ' ').trim();

    const setMatch = text.match(/(\d+)\s*sets?/);
    const sets = setMatch ? Math.max(1, parseInt(setMatch[1], 10)) : 1;
    text = text.replace(/\d+\s*sets?/g, '').trim();
    text = text.replace(/^superset\s*/, '').trim();

    const matches = Array.from(text.matchAll(/(\d+)\s+([^0-9]+?)(?=\s+\d+\s+|$)/g));
    if (!matches.length) return raw;

    const movements = matches.map(function (match) {
      return {
        reps: parseInt(match[1], 10),
        name: normaliseExerciseName(match[2])
      };
    }).filter(function (movement) { return movement.name && movement.reps; });

    if (!movements.length) return raw;

    const lines = [];
    for (let set = 1; set <= sets; set += 1) {
      movements.forEach(function (movement, movementIndex) {
        const isLast = set === sets && movementIndex === movements.length - 1;
        const work = Math.max(20, Math.min(60, movement.reps * 3));
        lines.push('Set ' + set + ': ' + movement.name + ', ' + work + ', ' + (isLast ? 0 : 10));
      });
    }

    return lines.join('\n');
  }

  function setRoutinePreview(message) {
    const preview = document.getElementById('routinePreview');
    if (preview) preview.textContent = message;
  }

  function enableQuickSaveIfNeeded() {
    const listEl = document.getElementById('customList');
    const saveBtn = document.getElementById('btnSaveRoutine');
    if (!listEl || !saveBtn) return;

    const converted = quickParseRoutine(listEl.value);
    const isValid = converted && converted.indexOf(',') !== -1;
    if (isValid) {
      saveBtn.disabled = false;
      const count = converted.split('\n').filter(Boolean).length;
      setRoutinePreview(count + ' moves detected.');
    }
  }

  window.saveTempoQuickRoutine = function () {
    const listEl = document.getElementById('customList');
    const converted = quickParseRoutine(listEl ? listEl.value : '');

    if (!converted || converted.indexOf(',') === -1) {
      setRoutinePreview('Use: Exercise, seconds, rest or Superset 8 chin ups 12 pushups 3 sets');
      return;
    }

    if (listEl) {
      listEl.value = converted;
      listEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const saveBtn = document.getElementById('btnSaveRoutine');
    if (saveBtn) saveBtn.disabled = false;

    if (window.saveAndStartCustom) window.saveAndStartCustom();
  };

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'customList') {
      setTimeout(enableQuickSaveIfNeeded, 0);
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(enableQuickSaveIfNeeded, 250);
  });
})();

document.addEventListener('click', function (event) {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset && button.dataset.splitRoutine) {
    const name = button.dataset.splitRoutine;
    const text = window.tempoSplitRoutines && window.tempoSplitRoutines[name];
    if (window.showPreview && text) window.showPreview(name, text);
    event.preventDefault();
    return;
  }

  const actions = {
    mainStartBtn: function () { window.loadExample && window.loadExample(); },
    vaultBtn: function () { window.applyTempoSplitRoutines && window.applyTempoSplitRoutines(); window.pushStateAndShow && window.pushStateAndShow('vaultDialog'); },
    builderBtn: function () { window.openBuilder && window.openBuilder(); },
    settingsBtn: function () { window.pushStateAndShow && window.pushStateAndShow('settingsDialog'); },
    previewStartBtn: function () { window.confirmStartPreview && window.confirmStartPreview(); },
    previewBackBtn: function () { window.closeOverlay && window.closeOverlay('previewDialog'); },
    restoreDefaultsBtn: function () { window.applyTempoSplitRoutines && window.applyTempoSplitRoutines(); },
    closeVaultBtn: function () { window.closeOverlay && window.closeOverlay('vaultDialog'); },
    btnSaveRoutine: function () { window.saveTempoQuickRoutine && window.saveTempoQuickRoutine(); },
    cancelBuilderBtn: function () { window.closeOverlay && window.closeOverlay('customDialog'); },
    saveSettingsBtn: function () { window.saveSettings && window.saveSettings(); },
    skipBtn: function () { window.skip && window.skip(); },
    pauseBtn: function () { window.togglePause && window.togglePause(); },
    endBtn: function () { window.confirmEndSession && window.confirmEndSession(); },
    confirmYesBtn: function () { window.executeConfirm && window.executeConfirm(); },
    confirmCancelBtn: function () { window.closeOverlay && window.closeOverlay('confirmDialog'); },
    resumeBtn: function () { window.resumeSession && window.resumeSession(); },
    dismissResumeBtn: function () { window.clearResumeState && window.clearResumeState(); }
  };

  const action = actions[button.id];
  if (!action) return;
  event.preventDefault();
  action();
});
