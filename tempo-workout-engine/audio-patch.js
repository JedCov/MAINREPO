(function () {
  'use strict';

  const STORAGE = {
    audioProfile: 'tempoAudioProfile',
    soundVolume: 'tempoSoundVolume',
    voiceVolume: 'tempoVoiceVolume',
    voiceEnabled: 'tempoVoicePromptsEnabled',
    voiceUri: 'tempoVoiceURI',
    profileTouchedSession: 'tempoAudioProfileTouchedSession'
  };

  let ctx = null;
  let unlocked = false;
  let lastTitle = '';
  let lastSecond = null;
  let lastSpoken = '';
  let voices = [];

  function getEl(id) {
    return document.getElementById(id);
  }

  function audioProfile() {
    const el = getEl('audioProfile');
    return el ? el.value : 'full';
  }

  function readStoredNumber(key, fallback) {
    const raw = localStorage.getItem(key);
    const value = Number(raw);
    if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
    return fallback;
  }

  function readStoredPositiveNumber(key, fallback) {
    const raw = localStorage.getItem(key);
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    if (value <= 0) return fallback;
    return Math.max(1, Math.min(100, value));
  }

  function markProfileTouched() {
    try {
      sessionStorage.setItem(STORAGE.profileTouchedSession, '1');
    } catch (error) {
      console.warn('Tempo profile session flag failed', error);
    }
  }

  function soundVolume() {
    const el = getEl('volumeControl');
    return el ? Number(el.value || 50) / 100 : 0.5;
  }

  function voiceVolume() {
    const el = getEl('voiceVolumeControl');
    return el ? Number(el.value || 50) / 100 : 0.5;
  }

  function voicePromptsEnabled() {
    const el = getEl('voicePromptsToggle');
    return el ? !!el.checked : true;
  }

  function showAudioToast(message) {
    const toast = getEl('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 1600);
  }

  function ensureContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    return ctx;
  }

  function beep(freq, dur, level) {
    const context = ensureContext();
    if (!context) return;

    if (context.state === 'suspended') {
      context.resume().catch(function () {});
    }

    const now = context.currentTime + 0.01;
    const gain = context.createGain();
    const osc = context.createOscillator();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level * soundVolume(), now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  function unlockAudio() {
    const context = ensureContext();
    if (!context) return;

    try {
      if (context.state === 'suspended') {
        context.resume().catch(function () {});
      }

      if (!unlocked && audioProfile() !== 'voice' && audioProfile() !== 'silent') {
        beep(660, 0.18, 0.16);
      }

      if (!unlocked) {
        unlocked = true;
        showAudioToast('Audio enabled');
      }
    } catch (error) {
      console.warn('Tempo audio unlock failed', error);
    }
  }

  function tone(type) {
    const profile = audioProfile();
    if (profile === 'voice' || profile === 'silent') return;

    if (type === 'complete') {
      beep(523, 0.22, 0.18);
      setTimeout(function () { beep(659, 0.22, 0.18); }, 140);
      setTimeout(function () { beep(783, 0.28, 0.2); }, 280);
      return;
    }

    if (type === 'rest') {
      beep(392, 0.22, 0.16);
      setTimeout(function () { beep(329, 0.22, 0.16); }, 140);
      return;
    }

    if (type === 'countdown') {
      beep(880, 0.16, 0.2);
      return;
    }

    beep(523, 0.18, 0.16);
    setTimeout(function () { beep(659, 0.18, 0.16); }, 120);
    setTimeout(function () { beep(783, 0.22, 0.18); }, 240);
  }

  function chooseBestVoice(availableVoices) {
    if (!availableVoices.length) return null;

    const storedUri = localStorage.getItem(STORAGE.voiceUri);
    if (storedUri) {
      const exactStored = availableVoices.find(function (voice) { return voice.voiceURI === storedUri; });
      if (exactStored) return exactStored;
    }

    function isEnglish(voice) {
      return /^en([_-]|$)/i.test(String(voice.lang || ''));
    }

    function isUkEnglish(voice) {
      return /^en[-_]gb$/i.test(String(voice.lang || ''));
    }

    function isFemaleHint(voice) {
      return /female|samantha|victoria|karen|zira|aria|ava/i.test(String(voice.name || ''));
    }

    function isNaturalEnglishHint(voice) {
      return /google|natural|neural|wavenet|enhanced|premium|english|uk|british/i.test(String(voice.name || ''));
    }

    const exactGoogleUkFemale = availableVoices.find(function (voice) {
      return /^google uk english female$/i.test(String(voice.name || '').trim());
    });
    if (exactGoogleUkFemale) return exactGoogleUkFemale;

    const ukEnglishFemale = availableVoices.find(function (voice) {
      return isUkEnglish(voice) && isFemaleHint(voice);
    });
    if (ukEnglishFemale) return ukEnglishFemale;

    const ukEnglish = availableVoices.find(isUkEnglish);
    if (ukEnglish) return ukEnglish;

    const naturalEnglishFemale = availableVoices.find(function (voice) {
      return isEnglish(voice) && isFemaleHint(voice) && isNaturalEnglishHint(voice);
    });
    if (naturalEnglishFemale) return naturalEnglishFemale;

    const anyEnglishFemale = availableVoices.find(function (voice) {
      return isEnglish(voice) && isFemaleHint(voice);
    });
    if (anyEnglishFemale) return anyEnglishFemale;

    const anyEnglish = availableVoices.find(isEnglish);
    if (anyEnglish) return anyEnglish;

    const browserDefault = availableVoices.find(function (voice) { return voice.default; });
    return browserDefault || availableVoices[0];
  }

  function selectedVoice() {
    const select = getEl('voiceSelect');
    if (!select || !voices.length) return null;

    const selectedUri = select.value;
    return voices.find(function (voice) { return voice.voiceURI === selectedUri; }) || chooseBestVoice(voices);
  }

  function populateVoiceSelect() {
    const select = getEl('voiceSelect');
    if (!select || !('speechSynthesis' in window)) return;

    voices = window.speechSynthesis.getVoices() || [];
    select.innerHTML = '';

    if (!voices.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Browser default voice';
      select.appendChild(option);
      return;
    }

    voices.forEach(function (voice) {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = voice.name + ' (' + voice.lang + ')' + (voice.default ? ' — Default' : '');
      select.appendChild(option);
    });

    const preferred = chooseBestVoice(voices);
    if (preferred) select.value = preferred.voiceURI;
  }

  function speak(text, force) {
    const profile = audioProfile();
    if (!force && (profile === 'sound' || profile === 'silent')) return;
    if (!force && !voicePromptsEnabled()) return;
    if (!('speechSynthesis' in window)) return;
    if (!text || (!force && text === lastSpoken)) return;

    lastSpoken = text;

    try {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      const voice = selectedVoice();
      if (voice) msg.voice = voice;
      msg.rate = 0.75;
      msg.pitch = 1;
      msg.volume = Math.min(1, Math.max(0, voiceVolume()));
      if (force) {
        window.speechSynthesis.speak(msg);
      } else {
        setTimeout(function () { window.speechSynthesis.speak(msg); }, 80);
      }
    } catch (error) {
      console.warn('Tempo speech failed', error);
    }
  }

  function saveAudioSettings() {
    const sound = getEl('volumeControl');
    const voiceVol = getEl('voiceVolumeControl');
    const voiceToggle = getEl('voicePromptsToggle');
    const voiceSelect = getEl('voiceSelect');

    if (sound) {
      localStorage.setItem(STORAGE.soundVolume, String(sound.value));
      localStorage.setItem('tempoVolume', String(sound.value));
    }
    if (voiceVol) localStorage.setItem(STORAGE.voiceVolume, String(voiceVol.value));
    if (voiceToggle) localStorage.setItem(STORAGE.voiceEnabled, voiceToggle.checked ? '1' : '0');
    if (voiceSelect && voiceSelect.value) localStorage.setItem(STORAGE.voiceUri, voiceSelect.value);
  }

  function restoreAudioSettings() {
    const profile = getEl('audioProfile');
    const sound = getEl('volumeControl');
    const voiceVol = getEl('voiceVolumeControl');
    const voiceToggle = getEl('voicePromptsToggle');
    const profileChangedThisSession = sessionStorage.getItem(STORAGE.profileTouchedSession) === '1';
    let recovered = false;

    if (profile) {
      const validProfiles = { full: true, voice: true, sound: true, silent: true };
      const storedProfile = localStorage.getItem(STORAGE.audioProfile);
      let restoredProfile = validProfiles[storedProfile] ? storedProfile : 'full';

      if (restoredProfile === 'silent' && !profileChangedThisSession) {
        restoredProfile = 'full';
        recovered = true;
      }

      if (!validProfiles[storedProfile]) recovered = true;
      profile.value = restoredProfile;
      localStorage.setItem(STORAGE.audioProfile, restoredProfile);
    }

    if (sound) {
      const storedSound = localStorage.getItem(STORAGE.soundVolume);
      const legacySound = localStorage.getItem('tempoVolume');
      const hasStoredSound = storedSound !== null || legacySound !== null;
      const nextSound = readStoredPositiveNumber(STORAGE.soundVolume, readStoredPositiveNumber('tempoVolume', 50));
      if (hasStoredSound && nextSound === 50 && (Number(storedSound) <= 0 || Number(legacySound) <= 0)) {
        recovered = true;
      }
      sound.value = String(nextSound);
      localStorage.setItem(STORAGE.soundVolume, String(nextSound));
      localStorage.setItem('tempoVolume', String(nextSound));
    }
    if (voiceVol) {
      const storedVoiceVolume = localStorage.getItem(STORAGE.voiceVolume);
      const nextVoiceVolume = readStoredPositiveNumber(STORAGE.voiceVolume, 50);
      if (storedVoiceVolume !== null && Number(storedVoiceVolume) <= 0) recovered = true;
      voiceVol.value = String(nextVoiceVolume);
      localStorage.setItem(STORAGE.voiceVolume, String(nextVoiceVolume));
    }
    if (voiceToggle) {
      const storedVoiceEnabled = localStorage.getItem(STORAGE.voiceEnabled);
      const isValidVoiceFlag = storedVoiceEnabled === null || storedVoiceEnabled === '0' || storedVoiceEnabled === '1';
      const nextVoiceEnabled = isValidVoiceFlag ? storedVoiceEnabled !== '0' : true;
      voiceToggle.checked = nextVoiceEnabled;
      localStorage.setItem(STORAGE.voiceEnabled, nextVoiceEnabled ? '1' : '0');
      if (!isValidVoiceFlag) recovered = true;
    }

    if (recovered) {
      showAudioToast('Audio settings recovered');
    }
  }

  function previewVoice() {
    unlockAudio();
    speak('Tempo voice preview. Stay strong and keep moving.', true);
  }

  function checkWorkoutScreen() {
    const view = getEl('workoutView');
    if (!view) return;

    const heading = view.querySelector('h1');
    const timer = getEl('mainTimer');
    const title = heading ? heading.textContent.trim() : '';

    if (title && title !== lastTitle) {
      lastTitle = title;
      lastSecond = null;

      if (title === 'PREPARE') {
        tone('work');
        speak('Ready to move.');
      } else if (title === 'REST') {
        tone('rest');
        speak('Rest.');
      } else if (title === 'Done') {
        tone('complete');
        speak('Workout complete. Outstanding.');
      } else {
        tone('work');
        speak(title.toLowerCase());
      }
    }

    if (timer) {
      const value = Number(timer.textContent.trim());
      if (value > 0 && value <= 3 && value !== lastSecond) {
        lastSecond = value;
        tone('countdown');
      }
    }
  }

  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  document.addEventListener('click', unlockAudio, { capture: true });
  document.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });

  document.addEventListener('DOMContentLoaded', function () {
    restoreAudioSettings();
    populateVoiceSelect();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
    }

    const saveButton = getEl('saveSettingsBtn');
    if (saveButton) saveButton.addEventListener('click', saveAudioSettings);

    const previewButton = getEl('previewVoiceBtn');
    if (previewButton) previewButton.addEventListener('click', previewVoice);

    const voiceSelect = getEl('voiceSelect');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', function () {
        localStorage.setItem(STORAGE.voiceUri, voiceSelect.value);
      });
    }

    const voiceToggle = getEl('voicePromptsToggle');
    if (voiceToggle) {
      voiceToggle.addEventListener('change', function () {
        localStorage.setItem(STORAGE.voiceEnabled, voiceToggle.checked ? '1' : '0');
      });
    }

    const profileSelect = getEl('audioProfile');
    if (profileSelect) {
      profileSelect.addEventListener('change', function () {
        markProfileTouched();
        localStorage.setItem(STORAGE.audioProfile, profileSelect.value || 'full');
      });
    }

    const voiceVolumeInput = getEl('voiceVolumeControl');
    if (voiceVolumeInput) {
      voiceVolumeInput.addEventListener('change', function () {
        localStorage.setItem(STORAGE.voiceVolume, String(voiceVolumeInput.value));
      });
    }

    const soundVolumeInput = getEl('volumeControl');
    if (soundVolumeInput) {
      soundVolumeInput.addEventListener('change', function () {
        localStorage.setItem(STORAGE.soundVolume, String(soundVolumeInput.value));
        localStorage.setItem('tempoVolume', String(soundVolumeInput.value));
      });
    }

    const view = getEl('workoutView');
    if (!view) return;

    const observer = new MutationObserver(checkWorkoutScreen);
    observer.observe(view, { childList: true, subtree: true, characterData: true });
    setInterval(checkWorkoutScreen, 250);
  });
})();
