document.addEventListener('DOMContentLoaded', function () {
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el && typeof fn === 'function') el.addEventListener('click', fn);
  };

  bind('mainStartBtn', window.loadExample);
  bind('vaultBtn', () => window.pushStateAndShow('vaultDialog'));
  bind('builderBtn', window.openBuilder);
  bind('settingsBtn', () => window.pushStateAndShow('settingsDialog'));
  bind('previewStartBtn', window.confirmStartPreview);
  bind('previewBackBtn', () => window.closeOverlay('previewDialog'));
  bind('restoreDefaultsBtn', window.restoreDefaults);
  bind('closeVaultBtn', () => window.closeOverlay('vaultDialog'));
  bind('btnSaveRoutine', window.saveAndStartCustom);
  bind('cancelBuilderBtn', () => window.closeOverlay('customDialog'));
  bind('saveSettingsBtn', window.saveSettings);
  bind('skipBtn', window.skip);
  bind('pauseBtn', window.togglePause);
  bind('endBtn', window.confirmEndSession);
  bind('confirmYesBtn', window.executeConfirm);
  bind('confirmCancelBtn', () => window.closeOverlay('confirmDialog'));
  bind('resumeBtn', window.resumeSession);
  bind('dismissResumeBtn', window.clearResumeState);
});
