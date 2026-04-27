(function () {
  'use strict';

  let ctx = null;
  let unlocked = false;
  let lastTitle = '';
  let lastSecond = null;
  let lastSpoken = '';

  function audioProfile() {
    const el = document.getElementById('audioProfile');
    return el ? el.value : 'full';
  }

  function volume() {
    const el = document.getElementById('volumeControl');
    return el ? Number(el.value || 70) / 100 : 0.7;
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
    gain.gain.exponentialRampToValueAtTime(level * volume(), now + 0.025);
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
    if (!text || text === lastSpoken) return;

    lastSpoken = text;

    try {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      msg.rate = 0.82;
      msg.pitch = 1;
      msg.volume = Math.min(1, Math.max(0.2, volume()));
      setTimeout(function () { window.speechSynthesis.speak(msg); }, 80);
    } catch (error) {
      console.warn('Tempo speech failed', error);
    }
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
    const view = document.getElementById('workoutView');
    if (!view) return;

    const observer = new MutationObserver(checkWorkoutScreen);
    observer.observe(view, { childList: true, subtree: true, characterData: true });
    setInterval(checkWorkoutScreen, 250);
  });
})();
