document.addEventListener('DOMContentLoaded', async () => {
    try {
      const { dailyStats, focusDates } = await chrome.runtime.sendMessage({ type: 'getStats' });
      const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
      const today = new Date().toISOString().split('T')[0];
      const todayStats = dailyStats[today] || { points: 0, focusTime: 0, sessions: 1 };
      const streak = calculateStreak(focusDates, settings.activeDays);
  
      const pointsPerSession = todayStats.sessions > 0 ? (todayStats.points / todayStats.sessions).toFixed(1) : '0.0';
      document.getElementById('points').textContent = pointsPerSession;
      document.getElementById('focus-time').textContent = Math.round(todayStats.focusTime);
      document.getElementById('daily-points').textContent = todayStats.points.toFixed(1);
      document.getElementById('streak').textContent = streak;
  
      if (parseFloat(pointsPerSession) > 0) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#4CAF50', '#2196F3', '#FFD700']
        });
      }
  
      document.getElementById('next-focus').addEventListener('click', async () => {
        try {
          const response = await chrome.runtime.sendMessage({ type: 'startFocus' });
          if (response.status === 'Focus started') {
            window.close();
          }
        } catch (e) {
          console.error(`Failed to start focus: ${e.message}`);
        }
      });
  
      document.getElementById('take-break').addEventListener('click', async () => {
        try {
          const response = await chrome.runtime.sendMessage({ type: 'startBreak' });
          if (response.status === 'Break started') {
            window.close();
          }
        } catch (e) {
          console.error(`Failed to start break: ${e.message}`);
        }
      });
  
      function calculateStreak(focusDates, activeDays) {
        let streak = 0;
        let date = new Date();
        while (true) {
          const day = date.getDay();
          const dateStr = date.toISOString().split('T')[0];
          if (activeDays.includes(day)) {
            if (focusDates.includes(dateStr)) streak++;
            else break;
          }
          date.setDate(date.getDate() - 1);
        }
        return streak;
      }
    } catch (e) {
      console.error(`Results page error: ${e.message}`);
    }
  });