function normaliseRoutineBeforeSave() {
  const listEl = document.getElementById('customList');
  if (!listEl || !window.parseNaturalRoutine) return;

  const raw = String(listEl.value || '').trim();
  if (!raw || raw.indexOf(',') !== -1) return;

  const exercises = window.parseNaturalRoutine(raw);
  if (!Array.isArray(exercises) || exercises.length === 0) return;

  listEl.value = exercises.map(function (exercise) {
    return exercise.name + ', ' + exercise.duration + ', ' + exercise.rest;
  }).join('\n');

  listEl.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('click', function (event) {
  const button = event.target.closest('button');
  if (!button) return;

  const actions = {
    mainStartBtn: function () { window.loadExample && window.loadExample(); },
    vaultBtn: function () { window.pushStateAndShow && window.pushStateAndShow('vaultDialog'); },
    builderBtn: function () { window.openBuilder && window.openBuilder(); },
    settingsBtn: function () { window.pushStateAndShow && window.pushStateAndShow('settingsDialog'); },
    previewStartBtn: function () { window.confirmStartPreview && window.confirmStartPreview(); },
    previewBackBtn: function () { window.closeOverlay && window.closeOverlay('previewDialog'); },
    closeVaultBtn: function () { window.closeOverlay && window.closeOverlay('vaultDialog'); },
    btnSaveRoutine: function () { normaliseRoutineBeforeSave(); window.saveAndStartCustom && window.saveAndStartCustom(); },
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
