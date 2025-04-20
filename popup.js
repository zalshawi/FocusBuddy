document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.tab).classList.add('active');
  });
});

// Load settings
chrome.storage.local.get('settings', (result) => {
  let settings = result.settings || {};
  document.getElementById('focus-time').value = settings.focusTime || 25;
  document.getElementById('break-time').value = settings.breakTime || 5;
  document.getElementById('daily-goal').value = settings.dailyGoal || 4;
  document.getElementById('tracking-domain').value = settings.trackingDomain || '';
  document.getElementById('show-end-focus').checked = settings.showEndFocus || false;
});

// Save settings
document.getElementById('save-settings').addEventListener('click', () => {
  let settings = {
    focusTime: parseInt(document.getElementById('focus-time').value) || 25,
    breakTime: parseInt(document.getElementById('break-time').value) || 5,
    dailyGoal: parseFloat(document.getElementById('daily-goal').value) || 4,
    trackingDomain: document.getElementById('tracking-domain').value.trim(),
    showEndFocus: document.getElementById('show-end-focus').checked
  };
  chrome.storage.local.set({ settings });
});

function formatTime(seconds) {
  let mins = Math.floor(seconds / 60);
  let secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update timer UI
function updateTimer() {
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    const stateEl = document.getElementById('state');
    const timeEl = document.getElementById('time-remaining');
    const focusEl = document.getElementById('focus-status');
    const startBtn = document.getElementById('start-button');
    const pauseBtn = document.getElementById('pause-button');
    const resumeBtn = document.getElementById('resume-button');
    const stopBtn = document.getElementById('stop-button');
    const breakBtn = document.getElementById('break-button');
    const endFocusBtn = document.getElementById('end-focus-button');
    const endFocusPoints = document.getElementById('end-focus-points');

    chrome.storage.local.get('settings', (result) => {
      const showEndFocus = result.settings?.showEndFocus || false;

      if (response.state === 'idle') {
        stateEl.textContent = 'Idle';
        timeEl.textContent = '';
        focusEl.textContent = '';
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        breakBtn.classList.remove('hidden');
        endFocusBtn.classList.add('hidden');
        endFocusPoints.classList.add('hidden');
      } else if (response.state === 'focusing') {
        stateEl.textContent = response.isPaused ? 'Paused' : 'Focusing';
        timeEl.textContent = `Time remaining: ${formatTime(response.timeRemaining)}`;
        focusEl.textContent = response.isPaused ? '' : (response.isCurrentlyFocused ? 'Focus' : 'Distracted');
        focusEl.className = response.isPaused ? '' : (response.isCurrentlyFocused ? 'focus' : 'distracted');
        startBtn.classList.add('hidden');
        breakBtn.classList.add('hidden');
        if (showEndFocus) {
          endFocusBtn.classList.remove('hidden');
          endFocusPoints.classList.remove('hidden');
        } else {
          endFocusBtn.classList.add('hidden');
          endFocusPoints.classList.add('hidden');
        }
        if (response.isPaused) {
          pauseBtn.classList.add('hidden');
          resumeBtn.classList.remove('hidden');
          stopBtn.classList.remove('hidden');
        } else {
          pauseBtn.classList.remove('hidden');
          resumeBtn.classList.add('hidden');
          stopBtn.classList.remove('hidden');
        }
      } else if (response.state === 'breaking') {
        stateEl.textContent = 'Break';
        timeEl.textContent = `Time remaining: ${formatTime(response.timeRemaining)}`;
        focusEl.textContent = '';
        startBtn.classList.add('hidden');
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        breakBtn.classList.add('hidden');
        endFocusBtn.classList.add('hidden');
        endFocusPoints.classList.add('hidden');
      }
    });

    // Update daily challenge
    chrome.storage.local.get(['dailyChallenge'], (result) => {
      const today = new Date().toISOString().split('T')[0];
      let challenge = result.dailyChallenge || { date: '', sessions: 0, target: 3, completed: false };
      if (challenge.date !== today) {
        challenge = { date: today, sessions: 0, target: 3, completed: false };
        chrome.storage.local.set({ dailyChallenge: challenge });
      }
      const challengeEl = document.getElementById('daily-challenge');
      if (challenge.completed) {
        challengeEl.textContent = 'Daily Challenge Completed: Earned 0.5 bonus points!';
      } else {
        challengeEl.textContent = `Daily Challenge: Complete ${challenge.target} focus sessions (${challenge.sessions}/${challenge.target})`;
      }
    });
  });
}

// Update stats
function updateStats() {
  chrome.storage.local.get(['dailyPoints', 'streaks', 'settings', 'stats', 'achievements'], (result) => {
    let dailyPoints = result.dailyPoints || {};
    let streaks = result.streaks || { current: 0, max: 0 };
    let settings = result.settings || { dailyGoal: 4 };
    let stats = result.stats || { totalPoints: 0, totalSessions: 0 };
    let achievements = result.achievements || {};
    let today = new Date().toISOString().split('T')[0];
    let todayPoints = dailyPoints[today] || 0;

    // Update points display with animation
    const todayPointsEl = document.getElementById('today-points');
    if (todayPointsEl.textContent !== todayPoints.toString()) {
      todayPointsEl.classList.add('animate-pulse');
      setTimeout(() => todayPointsEl.classList.remove('animate-pulse'), 1000);
    }
    todayPointsEl.textContent = todayPoints;
    let dots = Math.floor(todayPoints);
    document.getElementById('today-dots').innerHTML = '<span class="dot"></span>'.repeat(dots);
    document.getElementById('daily-progress').style.width = `${Math.min((todayPoints / settings.dailyGoal) * 100, 100)}%`;

    let weekPoints = 0;
    let monthPoints = 0;
    let currentDate = new Date();
    for (let i = 0; i < 7; i++) {
      let date = new Date(currentDate - i * 86400000).toISOString().split('T')[0];
      weekPoints += dailyPoints[date] || 0;
    }
    for (let date in dailyPoints) {
      let d = new Date(date);
      if (d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear()) {
        monthPoints += dailyPoints[date];
      }
    }
    document.getElementById('week-points').textContent = weekPoints;
    document.getElementById('month-points').textContent = monthPoints;
    document.getElementById('streak').textContent = streaks.current;

    // Calculate focus level
    const totalPoints = stats.totalPoints || 0;
    const levels = [
      { level: 1, minPoints: 0, maxPoints: 10 },
      { level: 2, minPoints: 11, maxPoints: 25 },
      { level: 3, minPoints: 26, maxPoints: 50 },
      { level: 4, minPoints: 51, maxPoints: 100 },
      { level: 5, minPoints: 101, maxPoints: Infinity }
    ];
    const currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) || levels[0];
    const nextLevel = levels.find(l => l.level === currentLevel.level + 1);
    const levelProgress = nextLevel ? ((totalPoints - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100 : 100;
    document.getElementById('focus-level').textContent = `${currentLevel.level} (${totalPoints} points)`;
    document.getElementById('level-progress').style.width = `${Math.min(levelProgress, 100)}%`;

    // Update achievements
    const achievementList = [
      { id: 'beginner', name: 'Beginner', desc: 'Earn 10 points', condition: () => totalPoints >= 10 },
      { id: 'scholar', name: 'Scholar', desc: 'Earn 50 points', condition: () => totalPoints >= 50 },
      { id: 'master', name: 'Master', desc: 'Earn 100 points', condition: () => totalPoints >= 100 },
      { id: 'streak_starter', name: 'Streak Starter', desc: '3-day streak', condition: () => streaks.max >= 3 },
      { id: 'streak_pro', name: 'Streak Pro', desc: '7-day streak', condition: () => streaks.max >= 7 },
      { id: 'marathon', name: 'Marathon', desc: 'Complete 10 focus sessions', condition: () => stats.totalSessions >= 10 },
      { id: 'super_focus', name: 'Super Focus', desc: 'Earn 5 points in one day', condition: () => todayPoints >= 5 }
    ];
    achievementList.forEach(ach => {
      if (ach.condition() && !achievements[ach.id]) {
        achievements[ach.id] = true;
        chrome.storage.local.set({ achievements });
      }
    });
    const achievementHtml = achievementList.map(ach => {
      const unlocked = achievements[ach.id];
      return `<div class="achievement ${unlocked ? 'unlocked' : 'locked'}">${ach.name}: ${ach.desc}</div>`;
    }).join('');
    document.getElementById('achievements').innerHTML = achievementHtml;
  });
}

// Button actions
document.getElementById('start-button').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startFocus' }, updateTimer);
});
document.getElementById('pause-button').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'pauseFocus' }, updateTimer);
});
document.getElementById('resume-button').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'resumeFocus' }, updateTimer);
});
document.getElementById('stop-button').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopFocus' }, updateTimer);
});
document.getElementById('break-button').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startBreak' }, updateTimer);
});
document.getElementById('end-focus-button').addEventListener('click', () => {
  const points = parseFloat(document.getElementById('end-focus-points').value);
  chrome.runtime.sendMessage({ action: 'endFocusImmediately', points }, updateTimer);
});
document.getElementById('export-stats').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'exportStats' });
});
document.getElementById('reset-stats').addEventListener('click', () => {
  if (confirm('Are you sure you want to reset all stats?')) {
    chrome.runtime.sendMessage({ action: 'resetStats' }, updateStats);
  }
});

// Handle updateStats message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateStats') {
    updateStats();
  }
});

// Initial updates
updateTimer();
updateStats();
setInterval(updateTimer, 1000);
setInterval(updateStats, 5000);