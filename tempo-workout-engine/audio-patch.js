(function () {
  'use strict';

  let ctx = null;
  let unlocked = false;
  let lastTitle = '';
  let lastSecond = null;

  function audioProfile() {
    const el = document.getElementById('audioProfile');
    return el ? el.value : 'full';
  }

  function volume() {
    const el = document.getElementById('volumeControl');
    return el ? Number(el.value || 70) / 100 : 0.7;
  }

  function unlockAudio() {
    if (unlocked) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !ctx) ctx = new AudioCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      unlocked = true;
      console.log('Tempo audio unlocked');
    } catch (error) {
      console.warn('Tempo audio unlock failed', error);
    }
  }

  function tone(type) {
    const profile = audioProfile();
    if (profile === 'voice' || profile === 'silent') return;
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = type === 'complete' ? [523, 659, 783, 1046] : type === 'rest' ? [392, 329] : type === 'countdown' ? [880] : [523, 659, 783];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22 * volume(), now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    gain.connect(ctx.destination);

    freqs.forEach(function (freq) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.85);
    });
  }

  function speak(text) {
    const profile = audioProfile();
    if (profile === 'sound' || profile === 'silent') return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      msg.rate = 0.85;
      msg.pitch = 1;
      msg.volume = Math.min(1, Math.max(0, volume()));
      window.speechSynthesis.speak(msg);
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

  document.addEventListener('click', unlockAudio, { capture: true });
  document.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });

  document.addEventListener('DOMContentLoaded', function () {
    const view = document.getElementById('workoutView');
    if (!view) return;

    const observer = new MutationObserver(checkWorkoutScreen);
    observer.observe(view, { childList: true, subtree: true, characterData: true });
    setInterval(checkWorkoutScreen, 300);
  });
})();
