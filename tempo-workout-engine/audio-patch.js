(function () {
  'use strict';

  let ctx = null;
  let unlocked = false;
  let lastTitle = '';
  let lastSecond = null;
  let lastSpoken = '';
  let availableVoices = [];

  function audioProfile() {
    const el = document.getElementById('audioProfile');
    return el ? el.value : 'full';
  }

  function soundVolume() {
    const el = document.getElementById('soundVolumeControl') || document.getElementById('volumeControl');
    const fallback = localStorage.getItem('tempoSoundVolume') || localStorage.getItem('tempoVolume') || 70;
    return Number(el ? el.value : fallback) / 100;
  }

  function voiceVolume() {
    const el = document.getElementById('voiceVolumeControl');
    const fallback = localStorage.getItem('tempoVoiceVolume') || localStorage.getItem('tempoVolume') || 70;
    return Number(el ? el.value : fallback) / 100;
  }

  function voicePromptsEnabled() {
    const el = document.getElementById('voicePromptsEnabled');
    const value = el ? el.value : (localStorage.getItem('tempoVoicePromptsEnabled') || 'true');
    return value !== 'false';
  }

  function voiceSelect() {
    return document.getElementById('voiceControl');
  }

  function isEnglishVoice(voice) {
    return /^en([-_]|$)/i.test(String(voice.lang || ''));
  }

  function voiceScore(voice) {
    const name = String(voice.name || '').toLowerCase();
    let score = 0;

    if (isEnglishVoice(voice)) score += 120;
    if (/samantha|victoria|karen|serena|moira|tessa/.test(name)) score += 140;
    if (/google uk english female|google us english|microsoft sonia|microsoft libby|microsoft aria|microsoft jenny|microsoft zira/.test(name)) score += 120;
    if (/female|woman|natural|neural|enhanced|premium/.test(name)) score += 40;
    if (/male|david|espeak|compact|default/.test(name)) score -= 80;
    if (voice.default) score += 5;

    return score;
  }

  function preferredVoice() {
    if (!availableVoices.length) return null;

    const englishVoices = availableVoices.filter(isEnglishVoice);
    const pool = englishVoices.length ? englishVoices : availableVoices;

    return pool.slice().sort(function (a, b) {
      return voiceScore(b) - voiceScore(a);
    })[0] || null;
  }

  function selectedVoice() {
    if (!availableVoices.length) return null;

    const select = voiceSelect();
    const selectedURI = (select && select.value) || localStorage.getItem('tempoVoiceURI') || '';
    const selectedName = localStorage.getItem('tempoVoiceName') || '';

    if (selectedURI) {
      const decoded = decodeURIComponent(selectedURI);
      const byURI = availableVoices.find(function (voice) {
        return voice.voiceURI === decoded;
      });
      if (byURI) return byURI;
    }

    if (selectedName) {
      const byName = availableVoices.find(function (voice) {
        return voice.name === selectedName;
      });
      if (byName) return byName;
    }

    return preferredVoice();
  }

  function persistSelectedVoice() {
    const select = voiceSelect();
    if (!select) return;

    const selectedURI = select.value || '';
    localStorage.setItem('tempoVoiceURI', selectedURI);

    const decoded = selectedURI ? decodeURIComponent(selectedURI) : '';
    const voice = availableVoices.find(function (entry) {
      return entry.voiceURI === decoded;
    });

    if (voice) {
      localStorage.setItem('tempoVoiceName', voice.name);
    } else {
      localStorage.removeItem('tempoVoiceName');
    }
  }

  function populateVoiceOptions() {
    const select = voiceSelect();
    if (!select) return;

    const voices = window.speechSynthesis && window.speechSynthesis.getVoices
      ? window.speechSynthesis.getVoices()
      : [];

    availableVoices = Array.isArray(voices) ? voices.slice() : [];

    if (!availableVoices.length) {
      select.innerHTML = '<option value="">Browser Default</option>';
      return;
    }

    const sorted = availableVoices.slice().sort(function (a, b) {
      return voiceScore(b) - voiceScore(a);
    });

    select.innerHTML = sorted.map(function (voice) {
      const label = voice.name + (voice.lang ? ' (' + voice.lang + ')' : '');
      return '<option value="' + encodeURIComponent(voice.voiceURI) + '">' + label + '</option>';
    }).join('');

    const savedURI = localStorage.getItem('tempoVoiceURI');
    const savedName = localStorage.getItem('tempoVoiceName');
    const byURI = savedURI
      ? sorted.find(function (voice) { return voice.voiceURI === decodeURIComponent(savedURI); })
      : null;
    const byName = savedName
      ? sorted.find(function (voice) { return voice.name === savedName; })
      : null;
    const chosen = byURI || byName || preferredVoice() || sorted[0];

    if (chosen) {
      const encodedURI = encodeURIComponent(chosen.voiceURI);
      select.value = encodedURI;
      localStorage.setItem('tempoVoiceURI', encodedURI);
      localStorage.setItem('tempoVoiceName', chosen.name);
    }
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

      if (!unlocked && 'speechSynthesis' in window) {
        const primer = new SpeechSynthesisUtterance('');
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
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

  function speak(text, force) {
    const profile = audioProfile();
    if (!force && (profile === 'sound' || profile === 'silent')) return;
    if (!force && !voicePromptsEnabled()) return;
    if (!('speechSynthesis' in window)) return;
    if (!text || text === lastSpoken) return;

    lastSpoken = text;

    try {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      const voice = selectedVoice();
      if (voice) {
        msg.voice = voice;
      }
      msg.rate = 0.82;
      msg.pitch = 1;
      msg.volume = Math.min(1, Math.max(0.2, voiceVolume()));
      setTimeout(function () { window.speechSynthesis.speak(msg); }, 80);
    } catch (error) {
      console.warn('Tempo speech failed', error);
    }
  }

  function previewVoice() {
    speak('This is the selected Tempo coach voice.', true);
  }

  function checkWorkoutScreen() {
    const view = document.getElementById('workoutView');
    if (!view) return;

    const heading = view.querySelector('h1');
    const timer = document.getElementById('mainTimer');
    const title = heading ? heading.textContent.trim() : '';

    if (title && title !== lastTitle) {
      lastTitle = title;
      lastSecond = null;

      if (title === 'PREPARE') {
        tone('work');
        speak('Ready to move.');
      } else if (title === 'REST') {
        tone('rest');
        const detail = view.querySelector('p');
        const nextText = detail && /^Next:\s*/.test(detail.textContent || '')
          ? String(detail.textContent || '').replace(/^Next:\s*/i, '').trim()
          : '';
        speak(nextText ? 'Rest. Up next: ' + nextText + '.' : 'Rest.');
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
    populateVoiceOptions();

    const select = voiceSelect();
    if (select) {
      select.addEventListener('change', persistSelectedVoice);
    }

    const voicePrompts = document.getElementById('voicePromptsEnabled');
    if (voicePrompts) {
      voicePrompts.addEventListener('change', function () {
        localStorage.setItem('tempoVoicePromptsEnabled', voicePrompts.value);
      });
    }

    const voiceVol = document.getElementById('voiceVolumeControl');
    if (voiceVol) {
      voiceVol.addEventListener('input', function () {
        localStorage.setItem('tempoVoiceVolume', voiceVol.value);
      });
    }

    const soundVol = document.getElementById('soundVolumeControl') || document.getElementById('volumeControl');
    if (soundVol) {
      soundVol.addEventListener('input', function () {
        localStorage.setItem('tempoSoundVolume', soundVol.value);
        localStorage.setItem('tempoVolume', soundVol.value);
      });
    }

    if (window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = populateVoiceOptions;
    }

    const view = document.getElementById('workoutView');
    if (!view) return;

    const observer = new MutationObserver(checkWorkoutScreen);
    observer.observe(view, { childList: true, subtree: true, characterData: true });
    setInterval(checkWorkoutScreen, 250);
  });

  window.previewVoice = previewVoice;
})();
