const defaultSettings = {
    focusTime: 25 * 60,
    breakTime: 5 * 60,
    trackedSites: ['coursera.org', 'udacity.com'],
    activeDays: [1, 2, 3, 4, 0],
    showResultsTab: true,
    enablePenaltyNotifications: true
  };
  
  let currentSession = null;
  let focusTime = 0;
  let logs = [];
  let isPaused = false;
  let focusInterval = null;
  let lastError = null;
  let isEnding = false;
  
  function log(message, isError = false) {
    const entry = `${new Date().toLocaleString()}: ${isError ? 'ERROR: ' : ''}${message}`;
    logs.push(entry);
    if (isError) lastError = entry;
  }
  
  async function loadSettings() {
    try {
      const { settings } = await chrome.storage.sync.get('settings');
      return { ...defaultSettings, ...settings };
    } catch (e) {
      log(`Failed to load settings: ${e.message}`, true);
      return defaultSettings;
    }
  }
  
  async function saveSettings(settings) {
    try {
      await chrome.storage.sync.set({ settings });
    } catch (e) {
      log(`Failed to save settings: ${e.message}`, true);
    }
  }
  
  async function loadStats() {
    try {
      const { dailyStats = {}, focusDates = [], achievements = [] } = await chrome.storage.sync.get(['dailyStats', 'focusDates', 'achievements']);
      return { dailyStats, focusDates, achievements };
    } catch (e) {
      log(`Failed to load stats: ${e.message}`, true);
      return { dailyStats: {}, focusDates: [], achievements: [] };
    }
  }
  
  async function saveStats(dailyStats, focusDates, achievements) {
    try {
      await chrome.storage.sync.set({ dailyStats, focusDates, achievements });
    } catch (e) {
      log(`Failed to save stats: ${e.message}`, true);
    }
  }
  
  async function startSession(type, duration) {
    try {
      if (currentSession) {
        await stopSession();
      }
      currentSession = { type, startTime: Date.now(), duration, focusTime: 0, pausedTime: 0, isPaused: false };
      focusTime = 0;
      isPaused = false;
      lastError = null;
      chrome.alarms.create('sessionEnd', { delayInMinutes: duration / 60 });
      focusInterval = setInterval(trackFocus, 1000);
      await trackFocus();
      log(`${type} session started`);
    } catch (e) {
      log(`Failed to start session: ${e.message}`, true);
      stopSession();
    }
  }
  
  async function pauseSession() {
    if (!currentSession || isPaused) {
      log('Cannot pause: No active session or already paused', true);
      return;
    }
    try {
      isPaused = true;
      currentSession.isPaused = true;
      currentSession.pausedTime = Date.now();
      chrome.alarms.clear('sessionEnd');
      clearInterval(focusInterval);
      updateBadge(currentSession.duration - Math.floor((Date.now() - currentSession.startTime) / 1000), true);
      log('Session paused');
    } catch (e) {
      log(`Failed to pause session: ${e.message}`, true);
    }
  }
  
  async function resumeSession() {
    if (!currentSession || !isPaused) {
      log('Cannot resume: No paused session', true);
      return;
    }
    try {
      isPaused = false;
      currentSession.isPaused = false;
      const pauseDuration = Date.now() - currentSession.pausedTime;
      currentSession.startTime += pauseDuration;
      const remaining = currentSession.duration - Math.floor((Date.now() - currentSession.startTime) / 1000);
      if (remaining <= 0) {
        endSession();
        return;
      }
      chrome.alarms.create('sessionEnd', { delayInMinutes: remaining / 60 });
      focusInterval = setInterval(trackFocus, 1000);
      await trackFocus();
      log('Session resumed');
    } catch (e) {
      log(`Failed to resume session: ${e.message}`, true);
      stopSession();
    }
  }
  
  async function stopSession() {
    if (!currentSession) return;
    try {
      currentSession = null;
      focusTime = 0;
      isPaused = false;
      clearInterval(focusInterval);
      chrome.alarms.clear('sessionEnd');
      chrome.action.setBadgeText({ text: '' });
      log('Session stopped');
    } catch (e) {
      log(`Failed to stop session: ${e.message}`, true);
    }
  }
  
  async function trackFocus() {
    if (!currentSession || isPaused) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const settings = await loadSettings();
      const isFocused = tab && tab.url && settings.trackedSites.some(site => tab.url.includes(site));
      if (isFocused) {
        focusTime += 1;
      }
      const elapsed = Math.floor((Date.now() - currentSession.startTime) / 1000);
      if (elapsed >= currentSession.duration) {
        endSession();
        return;
      }
      updateBadge(Math.max(0, currentSession.duration - elapsed), isFocused);
    } catch (e) {
      log(`Failed to track focus: ${e.message}`, true);
    }
  }
  
  async function updateBadge(remainingSeconds, isFocused) {
    try {
      const minutes = Math.ceil(Math.max(0, remainingSeconds) / 60);
      chrome.action.setBadgeText({ text: minutes > 0 ? minutes.toString() : '' });
      chrome.action.setBadgeBackgroundColor({ color: isFocused ? '#4CAF50' : '#F44336' });
    } catch (e) {
      log(`Failed to update badge: ${e.message}`, true);
    }
  }
  
  async function endSession() {
    if (!currentSession || isEnding) {
      log('No active session to end or already ending', true);
      return;
    }
    isEnding = true;
    const sessionType = currentSession.type;
    try {
      const settings = await loadSettings();
      const sessionDuration = currentSession.duration;
      const focusRatio = focusTime / sessionDuration;
      const basePoints = focusRatio >= 5/6 ? 1 : focusRatio >= 3/6 ? 0.5 : 0;
      const { dailyStats, focusDates, achievements } = await loadStats();
      const today = new Date().toISOString().split('T')[0];
      const streak = calculateStreak(focusDates, settings.activeDays);
      const multiplier = Math.min(1 + streak * 0.1, 2);
      let actualPoints = basePoints * multiplier;
  
      dailyStats[today] = dailyStats[today] || { points: 0, focusTime: 0, sessions: 0, challengeProgress: 0 };
      dailyStats[today].points += actualPoints;
      dailyStats[today].focusTime += focusTime / 60;
      dailyStats[today].sessions += 1;
      if (sessionType === 'focus' && sessionDuration >= 1500) {
        dailyStats[today].challengeProgress = (dailyStats[today].challengeProgress || 0) + 1;
        if (dailyStats[today].challengeProgress >= 3 && !dailyStats[today].challengeCompleted) {
          dailyStats[today].points += 1;
          dailyStats[today].challengeCompleted = true;
          actualPoints += 1;
        }
      }
  
      if (!focusDates.includes(today)) focusDates.push(today);
  
      const newAchievements = updateAchievements(achievements, dailyStats, streak, focusDates);
      await saveStats(dailyStats, focusDates, newAchievements);
      
      if (sessionType === 'focus' && settings.showResultsTab) {
        await chrome.alarms.clear('sessionEnd');
        chrome.tabs.create({ url: 'results.html' });
      }
      
      log(`Session ended: ${basePoints} base points, ${actualPoints} total points`);
    } catch (e) {
      log(`Failed to end session: ${e.message}`, true);
    } finally {
      currentSession = null;
      focusTime = 0;
      isPaused = false;
      isEnding = false;
      clearInterval(focusInterval);
      chrome.alarms.clear('sessionEnd');
      chrome.action.setBadgeText({ text: '' });
    }
  }
  
  function updateAchievements(achievements, dailyStats, streak, focusDates) {
    if (achievements.length >= 15) return achievements;
    const totalPoints = Object.values(dailyStats).reduce((sum, stats) => sum + stats.points, 0);
    const totalSessions = Object.values(dailyStats).reduce((sum, stats) => sum + stats.sessions, 0);
    const totalChallenges = Object.values(dailyStats).filter(stats => stats.challengeCompleted).length;
    
    const newAchievements = [...achievements];
    const addAchievement = (name) => {
      if (!newAchievements.some(ach => ach.name === name)) {
        newAchievements.push({ name, unlockedAt: new Date().toLocaleString() });
      }
    };
  
    if (totalSessions >= 1) addAchievement('First Focus');
    if (streak >= 3) addAchievement('3-Day Streak');
    if (totalPoints >= 10) addAchievement('Point Collector');
    if (totalSessions >= 5) addAchievement('Focus Novice');
    if (totalSessions >= 10) addAchievement('Focus Pro');
    if (streak >= 5) addAchievement('5-Day Streak');
    if (totalPoints >= 25) addAchievement('Points Master');
    if (totalChallenges >= 1) addAchievement('Challenge Starter');
    if (totalSessions >= 25) addAchievement('Focus Expert');
    if (streak >= 7) addAchievement('Week Streak');
    if (totalPoints >= 50) addAchievement('Points Legend');
    if (totalChallenges >= 3) addAchievement('Challenge Champion');
    if (totalSessions >= 50) addAchievement('Focus Master');
    if (focusDates.length >= 10) addAchievement('Consistent Worker');
    if (totalChallenges >= 5) addAchievement('Challenge Legend');
  
    return newAchievements.slice(0, 15);
  }
  
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
  
  chrome.tabs.onActivated.addListener(() => trackFocus());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && currentSession && !isPaused) trackFocus();
  });
  
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'sessionEnd' && currentSession && !isEnding) endSession();
  });
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (message.type === 'startFocus') {
          const settings = await loadSettings();
          await startSession('focus', settings.focusTime);
          sendResponse({ status: 'Focus started' });
        } else if (message.type === 'startBreak') {
          const settings = await loadSettings();
          await startSession('break', settings.breakTime);
          sendResponse({ status: 'Break started' });
        } else if (message.type === 'pauseSession') {
          await pauseSession();
          sendResponse({ status: 'Session paused' });
        } else if (message.type === 'resumeSession') {
          await resumeSession();
          sendResponse({ status: 'Session resumed' });
        } else if (message.type === 'stopSession') {
          await stopSession();
          sendResponse({ status: 'Session stopped' });
        } else if (message.type === 'getSession') {
          sendResponse({ currentSession, focusTime, isPaused, lastError });
        } else if (message.type === 'getStats') {
          const { dailyStats, focusDates, achievements } = await loadStats();
          const settings = await loadSettings();
          sendResponse({ dailyStats, focusDates, streak: calculateStreak(focusDates, settings.activeDays), achievements });
        } else if (message.type === 'updateSettings') {
          await saveSettings(message.settings);
          sendResponse({ status: 'Settings updated' });
        } else if (message.type === 'getSettings') {
          sendResponse(await loadSettings());
        } else if (message.type === 'getLogs') {
          sendResponse({ logs });
        } else if (message.type === 'exportStats') {
          const { dailyStats, focusDates, achievements } = await loadStats();
          sendResponse({ dailyStats, focusDates, achievements });
        }
      } catch (e) {
        log(`Message handler error: ${e.message}`, true);
        sendResponse({ status: 'Error', message: e.message });
      }
    })();
    return true;
  });
  
  chrome.runtime.onInstalled.addListener(() => {
    saveSettings(defaultSettings);
    log('FocusBuddy installed');
  });