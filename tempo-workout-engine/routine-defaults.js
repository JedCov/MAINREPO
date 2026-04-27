(function () {
  'use strict';

  const version = '5.8.7-workout-splits';
  const key = 'tempo_default_routine_version';

  const routines = {
    'Monday: Biceps & Triceps': 'Dumbbell Curls, 30, 10\nOverhead Tricep Extension, 30, 10\nHammer Curls, 30, 10\nClose-Grip Incline Pushups, 30, 10\nTricep Kickbacks, 30, 10\nChair Dips, 30, 0',
    'Wednesday: Shoulders & Back': 'Arnold Press, 30, 10\nOne-Arm Bench Row, 30, 10\nLateral Raises, 30, 10\nRear-Delt Fly, 30, 10\nFront Raises, 30, 10\nUpright Row With Broomstick, 30, 0',
    'Friday: Legs & Chest': 'Goblet Squats, 30, 10\nFeet-Elevated Pushups, 30, 10\nSplit Squats, 30, 10\nSlow-Tempo Pushups, 30, 10\nRomanian Deadlift, 30, 10\nWide-Grip Pushups, 30, 0'
  };

  try {
    if (localStorage.getItem(key) !== version) {
      localStorage.setItem('tempo_vault', JSON.stringify(routines));
      localStorage.setItem(key, version);
    }
  } catch (error) {
    console.warn('Could not update Tempo default routines', error);
  }
})();
