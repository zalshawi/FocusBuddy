let settings = {};
let state = 'idle';
let startTime, endTime, focusedTime, lastCheckTime, currentTabId, isFocused;
let breakEndTime;
let isPaused = false;
let pauseStartTime;
let checkInterval;

chrome.storage.local.get('settings', (result) => {
  settings = result.settings || { focusTime: 25, breakTime: 5, dailyGoal: 4, trackingDomain: '', showEndFocus: false };
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    settings = changes.settings.newValue;
  }
});

function startFocusSession() {
  if (state !== 'idle') return;
  state = 'focusing';
  startTime = Date.now();
  endTime = startTime + settings.focusTime * 60 * 1000;
  focusedTime = 0;
  lastCheckTime = startTime;
  isPaused = false;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      isFocused = isOnTrackingDomain(tabs[0].url);
    }
    checkInterval = setInterval(checkFocusEnd, 1000);
    updateBadge();
  });
  chrome.tabs.onActivated.addListener(onTabActivated);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
}

function pauseFocusSession() {
  if (state !== 'focusing' || isPaused) return;
  isPaused = true;
  pauseStartTime = Date.now();
  updateBadge();
}

function resumeFocusSession() {
  if (state !== 'focusing' || !isPaused) return;
  isPaused = false;
  let pauseDuration = Date.now() - pauseStartTime;
  endTime += pauseDuration;
  lastCheckTime = Date.now();
  updateBadge();
}

function stopFocusSession() {
  if (state !== 'focusing') return;
  chrome.tabs.onActivated.removeListener(onTabActivated);
  chrome.tabs.onUpdated.removeListener(onTabUpdated);
  clearInterval(checkInterval);
  state = 'idle';
  isPaused = false;
  updateBadge();
}

function endFocusSession(customPoints = null) {
  let now = Date.now();
  let timeSpent = now - lastCheckTime;
  if (isFocused && !isPaused) {
    focusedTime += timeSpent;
  }
  let T = settings.focusTime * 60 * 1000;
  let ratio = focusedTime / T;
  // Calculate multiplier based on streak
  chrome.storage.local.get('streaks', (result) => {
    let streaks = result.streaks || { current: 0, max: 0 };
    let multiplier = 1 + 0.1 * Math.min(streaks.current, 5); // Max 1.5x at 5-day streak
    let points = customPoints !== null ? customPoints : (ratio >= 5/6 ? 1 : ratio >= 3/6 ? 0.5 : 0);
    points *= multiplier;
    points = Math.round(points * 10) / 10; // Round to 1 decimal
    console.log(`focusedTime: ${focusedTime}, T: ${T}, ratio: ${ratio}, multiplier: ${multiplier}, points: ${points}`);
    let today = new Date().toISOString().split('T')[0];
    chrome.storage.local.get(['dailyPoints', 'streaks', 'stats', 'dailyChallenge'], (result) => {
      let dailyPoints = result.dailyPoints || {};
      let streaks = result.streaks || { current: 0, max: 0 };
      let stats = result.stats || { totalPoints: 0, totalSessions: 0 };
      let dailyChallenge = result.dailyChallenge || { date: today, sessions: 0, target: 3, completed: false };
      
      dailyPoints[today] = (dailyPoints[today] || 0) + points;
      stats.totalPoints = (stats.totalPoints || 0) + points;
      stats.totalSessions = (stats.totalSessions || 0) + 1;
      
      if (points > 0) {
        let yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        streaks.current = dailyPoints[yesterday] > 0 ? streaks.current + 1 : 1;
        streaks.max = Math.max(streaks.max, streaks.current);
      }
      
      // Update daily challenge
      if (dailyChallenge.date === today && !dailyChallenge.completed) {
        dailyChallenge.sessions += 1;
        if (dailyChallenge.sessions >= dailyChallenge.target) {
          dailyChallenge.completed = true;
          dailyPoints[today] += 0.5; // Bonus points
          stats.totalPoints += 0.5;
        }
        chrome.storage.local.set({ dailyChallenge });
      }
      
      chrome.storage.local.set({ dailyPoints, streaks, stats });
      
      chrome.tabs.onActivated.removeListener(onTabActivated);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      clearInterval(checkInterval);
      console.log(`Popup URL: end_session_popup.html?points=${points}`);
      chrome.windows.create({
        url: `end_session_popup.html?points=${encodeURIComponent(points)}`,
        type: 'popup',
        width: 400,
        height: 200,
        focused: true
      }, (window) => {
        setTimeout(() => {
          if (window) {
            chrome.windows.remove(window.id);
          }
        }, 5000);
      });
      state = 'idle';
      isPaused = false;
      updateBadge();
      chrome.runtime.sendMessage({ action: 'updateStats' });
    });
  });
}

function startBreakSession() {
  state = 'breaking';
  breakEndTime = Date.now() + settings.breakTime * 60 * 1000;
  setTimeout(endBreakSession, settings.breakTime * 60 * 1000);
  updateBadge();
}

function endBreakSession() {
  state = 'idle';
  updateBadge();
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Break Over',
    message: 'Ready for your next focus session?'
  });
}

function onTabActivated(activeInfo) {
  if (state !== 'focusing' || isPaused) return;
  let now = Date.now();
  let timeSpent = now - lastCheckTime;
  if (isFocused) {
    focusedTime += timeSpent;
  }
  lastCheckTime = now;
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) {
      currentTabId = tab.id;
      isFocused = isOnTrackingDomain(tab.url);
      updateBadge();
    }
  });
}

function onTabUpdated(tabId, changeInfo, tab) {
  if (state !== 'focusing' || isPaused || tabId !== currentTabId || !changeInfo.url) return;
  let now = Date.now();
  let timeSpent = now - lastCheckTime;
  if (isFocused) {
    focusedTime += timeSpent;
  }
  lastCheckTime = now;
  isFocused = isOnTrackingDomain(tab.url);
  updateBadge();
}

function isOnTrackingDomain(url) {
  if (!settings.trackingDomain || !url) return false;
  try {
    let hostname = new URL(url).hostname;
    return hostname.endsWith(settings.trackingDomain);
  } catch (e) {
    return false;
  }
}

function updateBadge() {
  if (state === 'focusing') {
    if (isPaused) {
      chrome.action.setBadgeText({ text: 'P' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
    } else {
      let remaining = Math.max(0, (endTime - Date.now()) / 1000);
      let text = remaining > 60 ? Math.floor(remaining / 60).toString() : '<1';
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: isFocused ? '#4CAF50' : '#F44336' });
    }
  } else if (state === 'breaking') {
    let remaining = Math.max(0, (breakEndTime - Date.now()) / 1000);
    let text = remaining > 60 ? Math.floor(remaining / 60).toString() : '<1';
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function checkFocusEnd() {
  if (state === 'focusing' && !isPaused && Date.now() >= endTime) {
    clearInterval(checkInterval);
    endFocusSession();
  }
}

function endFocusImmediately(points = null) {
  if (state === 'focusing') {
    clearInterval(checkInterval);
    endFocusSession(points);
  }
}

function resetStats() {
  chrome.storage.local.set({
    dailyPoints: {},
    streaks: { current: 0, max: 0 },
    stats: { totalPoints: 0, totalSessions: 0 },
    achievements: {},
    dailyChallenge: { date: '', sessions: 0, target: 3, completed: false }
  });
}

function exportStatsToCsv() {
  chrome.storage.local.get(['dailyPoints'], (result) => {
    let dailyPoints = result.dailyPoints || {};
    let csv = 'Date,Points\n';
    for (let date in dailyPoints) {
      csv += `${date},${dailyPoints[date]}\n`;
    }
    let dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    chrome.downloads.download({
      url: dataUrl,
      filename: 'study_focus_stats.csv',
      saveAs: true
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getState') {
    let response = { state, isPaused };
    if (state === 'focusing') {
      let now = Date.now();
      response.timeRemaining = isPaused ? Math.max(0, (endTime - pauseStartTime) / 1000) : Math.max(0, (endTime - now) / 1000);
      response.isCurrentlyFocused = isFocused;
    } else if (state === 'breaking') {
      let now = Date.now();
      response.timeRemaining = Math.max(0, (breakEndTime - now) / 1000);
    }
    sendResponse(response);
  } else if (request.action === 'startFocus') {
    startFocusSession();
    sendResponse({ success: true });
  } else if (request.action === 'pauseFocus') {
    pauseFocusSession();
    sendResponse({ success: true });
  } else if (request.action === 'resumeFocus') {
    resumeFocusSession();
    sendResponse({ success: true });
  } else if (request.action === 'stopFocus') {
    stopFocusSession();
    sendResponse({ success: true });
  } else if (request.action === 'startBreak') {
    startBreakSession();
    sendResponse({ success: true });
  } else if (request.action === 'endFocusImmediately') {
    endFocusImmediately(request.points);
    sendResponse({ success: true });
  } else if (request.action === 'resetStats') {
    resetStats();
    sendResponse({ success: true });
  } else if (request.action === 'exportStats') {
    exportStatsToCsv();
    sendResponse({ success: true });
  }
});