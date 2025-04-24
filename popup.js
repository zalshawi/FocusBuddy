document.addEventListener('DOMContentLoaded', () => {
    const elements = {
      timerDisplay: document.getElementById('timer-display'),
      focusStatus: document.getElementById('focus-status'),
      errorMessage: document.getElementById('error-message'),
      startFocus: document.getElementById('start-focus'),
      startBreak: document.getElementById('start-break'),
      pauseSession: document.getElementById('pause-session'),
      resumeSession: document.getElementById('resume-session'),
      stopSession: document.getElementById('stop-session'),
      statsPoints: document.getElementById('stats-points'),
      statsFocus: document.getElementById('stats-focus'),
      statsStreak: document.getElementById('stats-streak'),
      statsMultiplier: document.getElementById('stats-multiplier'),
      level: document.getElementById('level'),
      challengeProgress: document.getElementById('challenge-progress'),
      achievements: document.getElementById('achievements'),
      achievementCount: document.getElementById('achievement-count'),
      viewMore: document.getElementById('view-more'),
      focusTime: document.getElementById('focus-time'),
      breakTime: document.getElementById('break-time'),
      trackedSites: document.getElementById('tracked-sites'),
      activeDays: document.getElementById('active-days'),
      showResults: document.getElementById('show-results'),
      penaltyNotif: document.getElementById('penalty-notif'),
      saveSettings: document.getElementById('save-settings'),
      reportIssue: document.getElementById('report-issue'),
      exportStats: document.getElementById('export-stats'),
    };
  
    let lastPoints = 0;
  
    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    }
  
    async function updateUI() {
      try {
        const { currentSession, focusTime, isPaused, lastError } = await chrome.runtime.sendMessage({ type: 'getSession' });
        const { dailyStats, focusDates, streak, achievements } = await chrome.runtime.sendMessage({ type: 'getStats' });
        const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
        
        elements.errorMessage.style.display = lastError ? 'block' : 'none';
        elements.errorMessage.textContent = lastError || '';
  
        if (currentSession) {
          const elapsed = isPaused ? 
            Math.floor((currentSession.pausedTime - currentSession.startTime) / 1000) :
            Math.floor((Date.now() - currentSession.startTime) / 1000);
          const remaining = Math.max(currentSession.duration - elapsed, 0);
          elements.timerDisplay.textContent = formatTime(remaining);
          
          if (isPaused) {
            elements.focusStatus.textContent = 'Paused';
            elements.focusStatus.style.color = '#333';
            elements.startFocus.style.display = 'none';
            elements.startBreak.style.display = 'none';
            elements.pauseSession.style.display = 'none';
            elements.resumeSession.style.display = 'inline';
            elements.stopSession.style.display = 'inline';
          } else {
            const isFocused = focusTime > elapsed / 2;
            elements.focusStatus.textContent = isFocused ? 'Focused' : 'Distracted';
            elements.focusStatus.style.color = isFocused ? '#4CAF50' : '#F44336';
            elements.startFocus.style.display = 'none';
            elements.startBreak.style.display = 'none';
            elements.pauseSession.style.display = 'inline';
            elements.resumeSession.style.display = 'none';
            elements.stopSession.style.display = 'inline';
          }
        } else {
          elements.timerDisplay.textContent = formatTime(settings.focusTime);
          elements.focusStatus.textContent = 'Not Started';
          elements.focusStatus.style.color = '#333';
          elements.startFocus.style.display = 'inline';
          elements.startBreak.style.display = 'inline';
          elements.pauseSession.style.display = 'none';
          elements.resumeSession.style.display = 'none';
          elements.stopSession.style.display = 'none';
        }
  
        const today = new Date().toISOString().split('T')[0];
        const todayStats = dailyStats[today] || { points: 0, focusTime: 0, challengeProgress: 0 };
        
        if (todayStats.points !== lastPoints) {
          elements.statsPoints.classList.add('animate-points');
          setTimeout(() => elements.statsPoints.classList.remove('animate-points'), 1000);
          lastPoints = todayStats.points;
        }
        
        elements.statsPoints.textContent = todayStats.points.toFixed(1);
        elements.statsFocus.textContent = Math.round(todayStats.focusTime);
        elements.statsStreak.textContent = streak;
        elements.statsMultiplier.textContent = Math.min(1 + streak * 0.1, 2).toFixed(1);
        elements.challengeProgress.textContent = todayStats.challengeProgress || 0;
  
        const totalPoints = Object.values(dailyStats).reduce((sum, stats) => sum + stats.points, 0);
        const level = Math.floor(totalPoints / 10);
        elements.level.textContent = level;
  
        elements.achievements.innerHTML = achievements.map(ach => `<li title="Unlocked: ${ach.unlockedAt}">${ach.name}</li>`).join('');
        elements.achievementCount.textContent = achievements.length;
      } catch (e) {
        elements.errorMessage.style.display = 'block';
        elements.errorMessage.textContent = `UI Error: ${e.message}`;
      }
    }
  
    elements.startFocus.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'startFocus' }));
    elements.startBreak.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'startBreak' }));
    elements.pauseSession.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'pauseSession' }));
    elements.resumeSession.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'resumeSession' }));
    elements.stopSession.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'stopSession' }));
  
    async function loadSettings() {
      try {
        const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
        elements.focusTime.value = settings.focusTime / 60;
        elements.breakTime.value = settings.breakTime / 60;
        elements.trackedSites.value = settings.trackedSites.join('\n');
        Array.from(elements.activeDays.options).forEach(opt => 
          opt.selected = settings.activeDays.includes(Number(opt.value)));
        elements.showResults.checked = settings.showResultsTab;
        elements.penaltyNotif.checked = settings.enablePenaltyNotifications;
      } catch (e) {
        elements.errorMessage.style.display = 'block';
        elements.errorMessage.textContent = `Settings Load Error: ${e.message}`;
      }
    }
  
    elements.saveSettings.addEventListener('click', async () => {
      try {
        const settings = {
          focusTime: Math.max(1, Number(elements.focusTime.value)) * 60,
          breakTime: Math.max(1, Number(elements.breakTime.value)) * 60,
          trackedSites: elements.trackedSites.value.split('\n').filter(Boolean),
          activeDays: Array.from(elements.activeDays.selectedOptions).map(opt => Number(opt.value)),
          showResultsTab: elements.showResults.checked,
          enablePenaltyNotifications: elements.penaltyNotif.checked,
        };
        await chrome.runtime.sendMessage({ type: 'updateSettings', settings });
        updateUI();
      } catch (e) {
        elements.errorMessage.style.display = 'block';
        elements.errorMessage.textContent = `Settings Error: ${e.message}`;
      }
    });
  
    elements.reportIssue.addEventListener('click', async () => {
      try {
        const { logs } = await chrome.runtime.sendMessage({ type: 'getLogs' });
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'focusbuddy-log.json';
        link.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        elements.errorMessage.style.display = 'block';
        elements.errorMessage.textContent = `Log Download Error: ${e.message}`;
      }
    });
  
    elements.exportStats.addEventListener('click', async () => {
      try {
        const { dailyStats, focusDates, achievements } = await chrome.runtime.sendMessage({ type: 'exportStats' });
        const blob = new Blob([JSON.stringify({ dailyStats, focusDates, achievements }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'focusbuddy-stats.json';
        link.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        elements.errorMessage.style.display = 'block';
        elements.errorMessage.textContent = `Stats Export Error: ${e.message}`;
      }
    });
  
    elements.viewMore.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'getStats' }).then(({ dailyStats }) => {
        const weeklyStats = Object.entries(dailyStats)
          .filter(([date]) => new Date(date) > new Date().setDate(new Date().getDate() - 7))
          .reduce((acc, [, stats]) => ({
            points: acc.points + stats.points,
            focusTime: acc.focusTime + stats.focusTime
          }), { points: 0, focusTime: 0 });
        const monthlyStats = Object.entries(dailyStats)
          .filter(([date]) => new Date(date) > new Date().setDate(new Date().getDate() - 30))
          .reduce((acc, [, stats]) => ({
            points: acc.points + stats.points,
            focusTime: acc.focusTime + stats.focusTime
          }), { points: 0, focusTime: 0 });
        alert(`Weekly: ${weeklyStats.focusTime.toFixed(0)} min, ${weeklyStats.points.toFixed(1)} points\nMonthly: ${monthlyStats.focusTime.toFixed(0)} min, ${monthlyStats.points.toFixed(1)} points`);
      });
    });
  
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById(btn.dataset.tab).style.display = 'block';
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.tab === 'settings-tab') loadSettings();
      });
    });
  
    setInterval(updateUI, 1000);
    updateUI();
  });