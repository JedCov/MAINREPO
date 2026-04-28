(function () {
  'use strict';

  let ctx = null;
  let unlocked = false;
  let lastTitle = '';
  let lastSecond = null;
  let lastSpoken = '';
  let voices = [];
  let selectedVoiceURI = '';
  let selectedVoiceName = '';
  let voiceSelectEl = null;

  function audioProfile() {
    const el = document.getElementById('audioProfile');
    return el ? el.value : 'full';
  }

  function soundVolume() {
    const el = document.getElementById('volumeControl');
    return el ? Number(el.value || 70) / 100 : Number(localStorage.getItem('tempoSoundVolume') || localStorage.getItem('tempoVolume') || 70) / 100;
  }

  function voiceVolume() {
    const el = document.getElementById('voiceVolumeControl');
    return el ? Number(el.value || 80) / 100 : Number(localStorage.getItem('tempoVoiceVolume') || 80) / 100;
  }

  function voicePromptsEnabled() {
    const el = document.getElementById('voicePromptsToggle');
    if (el) return !!el.checked;
    const saved = localStorage.getItem('tempoVoicePromptsEnabled');
    return saved === null ? true : saved === 'true';
  }

  function showAudioToast(message) {
    const toast = document.getElementById('toast');
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

      // Audible tap-confirmation tone. This must happen inside the user gesture on mobile.
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

  function speak(text) {
    const profile = audioProfile();
    if (profile === 'sound' || profile === 'silent') return;
    if (!('speechSynthesis' in window)) return;
    if (!voicePromptsEnabled()) return;
    if (!text || text === lastSpoken) return;

    lastSpoken = text;

    try {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      msg.rate = 0.82;
      msg.pitch = 1;
      msg.volume = Math.min(1, Math.max(0.05, voiceVolume()));

      const voice = resolveVoice();
      if (voice) {
        msg.voice = voice;
      }
      setTimeout(function () { window.speechSynthesis.speak(msg); }, 80);
    } catch (error) {
      console.warn('Tempo speech failed', error);
    }
  }

  function normalise(str) {
    return String(str || '').toLowerCase();
  }

  function scoreVoice(voice) {
    const name = normalise(voice.name);
    const lang = normalise(voice.lang);
    let score = 0;

    if (lang.indexOf('en') === 0 || lang.indexOf('-en') !== -1 || lang.indexOf('english') !== -1) score += 45;
    if (voice.default) score += 3;

    const preferredNames = [
      'samantha', 'victoria', 'karen', 'serena', 'moira', 'tessa',
      'google uk english female', 'google us english',
      'microsoft sonia', 'microsoft libby', 'microsoft aria', 'microsoft jenny', 'microsoft zira'
    ];
    preferredNames.forEach(function (token) {
      if (name.indexOf(token) !== -1) score += 25;
    });

    if (name.indexOf('female') !== -1 || name.indexOf('woman') !== -1 || name.indexOf('natural') !== -1 || name.indexOf('neural') !== -1) {
      score += 18;
    }

    const penalties = ['david', 'male', 'espeak', 'compact', 'default', 'robot'];
    penalties.forEach(function (token) {
      if (name.indexOf(token) !== -1) score -= 14;
    });

    if (name.indexOf('google') !== -1 || name.indexOf('microsoft') !== -1 || name.indexOf('apple') !== -1) {
      score += 4;
    }

    return score;
  }

  function bestVoice(list, requireEnglish) {
    const pool = requireEnglish
      ? list.filter(function (voice) {
        const lang = normalise(voice.lang);
        return lang.indexOf('en') === 0 || lang.indexOf('-en') !== -1 || lang.indexOf('english') !== -1;
      })
      : list.slice();

    if (!pool.length) return null;

    return pool
      .slice()
      .sort(function (a, b) { return scoreVoice(b) - scoreVoice(a); })[0];
  }

  function resolveVoice() {
    if (!voices.length) return null;

    if (selectedVoiceURI) {
      const byURI = voices.find(function (voice) { return voice.voiceURI === selectedVoiceURI; });
      if (byURI) return byURI;
    }

    if (selectedVoiceName) {
      const byName = voices.find(function (voice) { return voice.name === selectedVoiceName; });
      if (byName) return byName;
    }

    return bestVoice(voices, true) || bestVoice(voices, false) || null;
  }

  function onVoiceSelectionChange() {
    if (!voiceSelectEl) return;
    const value = voiceSelectEl.value;
    selectedVoiceURI = value || '';
    const selectedVoice = voices.find(function (voice) { return voice.voiceURI === value; });
    selectedVoiceName = selectedVoice ? selectedVoice.name : '';

    if (selectedVoiceURI) {
      localStorage.setItem('tempoVoiceURI', selectedVoiceURI);
      localStorage.setItem('tempoVoiceName', selectedVoiceName);
    } else {
      localStorage.removeItem('tempoVoiceURI');
      localStorage.removeItem('tempoVoiceName');
    }
  }

  function renderVoiceOptions() {
    if (!voiceSelectEl) return;

    if (!voices.length) {
      voiceSelectEl.innerHTML = '<option value="">No voices available</option>';
      return;
    }

    const preferred = resolveVoice();
    const initialURI = selectedVoiceURI || (preferred ? preferred.voiceURI : '');
    voiceSelectEl.innerHTML = voices.map(function (voice) {
      const label = voice.name + ' (' + voice.lang + ')';
      const selected = voice.voiceURI === initialURI ? ' selected' : '';
      return '<option value="' + voice.voiceURI + '"' + selected + '>' + label + '</option>';
    }).join('');

    voiceSelectEl.value = initialURI;
    onVoiceSelectionChange();
  }

  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
    renderVoiceOptions();
  }

  function previewVoice() {
    speak('This is the selected Tempo coach voice.');
  }

  function checkWorkoutScreen() {
    const view = document.getElementById('workoutView');
    if (!view) return;

    const heading = view.querySelector('h1');
    const detail = view.querySelector('p.text-muted');
    const timer = document.getElementById('mainTimer');
    const title = heading ? heading.textContent.trim() : '';
    const detailText = detail ? detail.textContent.trim() : '';

    if (title && title !== lastTitle) {
      lastTitle = title;
      lastSecond = null;

      if (title === 'PREPARE') {
        tone('work');
        speak('Get ready. Ready to move.');
      } else if (title === 'REST') {
        tone('rest');
        if (detailText.indexOf('Next:') === 0) {
          speak('Rest. Up next, ' + detailText.replace(/^Next:\s*/i, '') + '.');
        } else {
          speak('Rest.');
        }
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
    const legacyVolume = localStorage.getItem('tempoVolume');
    if (!localStorage.getItem('tempoSoundVolume') && legacyVolume !== null) {
      localStorage.setItem('tempoSoundVolume', legacyVolume);
    }
    if (!localStorage.getItem('tempoVoiceVolume') && legacyVolume !== null) {
      localStorage.setItem('tempoVoiceVolume', legacyVolume);
    }

    selectedVoiceURI = localStorage.getItem('tempoVoiceURI') || '';
    selectedVoiceName = localStorage.getItem('tempoVoiceName') || '';
    voiceSelectEl = document.getElementById('voiceSelect');
    if (voiceSelectEl) {
      voiceSelectEl.addEventListener('change', onVoiceSelectionChange);
    }

    const previewBtn = document.getElementById('previewVoiceBtn');
    if (previewBtn) {
      previewBtn.addEventListener('click', function (event) {
        event.preventDefault();
        unlockAudio();
        previewVoice();
      });
    }

    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    const view = document.getElementById('workoutView');
    if (!view) return;

    const observer = new MutationObserver(checkWorkoutScreen);
    observer.observe(view, { childList: true, subtree: true, characterData: true });
    setInterval(checkWorkoutScreen, 250);
  });
})();
