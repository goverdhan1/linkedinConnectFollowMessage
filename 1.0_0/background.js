function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Background script for managing LinkedIn automation workflow

async function loadKeywords(day = 0) {
    const url = chrome.runtime.getURL(`data/part${day}.txt`);
    const response = await fetch(url);
    const text = await response.text();
    return text.split('\n').map(k => k.trim()).filter(k => k);
}

let automationQueue = [];
let currentTabId = null;
let returnUrls = new Map();
let profileQueues = new Map(); // Store profile queues per keyword
let searchUrls = new Map(); // Store search URLs per tab
let allProfileLinks = []; // Array to accumulate all profile links
let allProfileLinksSet = new Set(); // Set for quick deduplication
let uploadedFilename = null; // Store the uploaded filename
let profilesVisited = 0; // Counter for profiles visited for actions

async function storeReturnUrl(tabId, url) {
    const key = 'returnUrl_' + tabId;
    await chrome.storage.session.set({[key]: url});
}

async function getReturnUrl(tabId) {
    const key = 'returnUrl_' + tabId;
    const result = await chrome.storage.session.get([key]);
    return result[key];
}

async function removeReturnUrl(tabId) {
    const key = 'returnUrl_' + tabId;
    await chrome.storage.session.remove([key]);
}

function startAutomation(keywords, pageLimit = 1, actionTypes = []) {
    allProfileLinks = []; // Reset profile links accumulator
    allProfileLinksSet = new Set(); // Reset deduplication set
    profileQueues.clear(); // Clear profile queues to avoid duplicates
    automationQueue = [...keywords];
    if (automationQueue.length === 0) return;

    const keyword = automationQueue.shift();
    chrome.tabs.create({
        url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keyword)}`
    }, (tab) => {
        currentTabId = tab.id;
        // Inject automation parameters into the tab
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.sendMessage(tabId, {
                    action: 'EXECUTE_AUTOMATION',
                    keyword: keyword,
                    pageLimit: pageLimit,
                    actionTypes: actionTypes
                });
            }
        });
    });
}

async function downloadProfileLinksFile() {
    console.log('downloadProfileLinksFile called');
    console.log('allProfileLinks length:', allProfileLinks.length);
    console.log('allProfileLinks content:', allProfileLinks);

    const summary = allProfileLinks.join('\n');
    console.log('Generated summary:', summary);

    if (!summary || summary.trim() === '') {
        console.error('No profile links to save - summary is empty');
        return;
    }
    try {
        // Convert summary to base64 data URL
        const base64Data = btoa(unescape(encodeURIComponent(summary)));
        const dataUrl = 'data:text/plain;base64,' + base64Data;

        // Use uploadedFilename if available, else fallback to timestamped filename
        const filename = uploadedFilename ? uploadedFilename : `profile-links-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.txt`;

        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
        });
        console.log('Profile links file downloaded successfully');
    } catch (error) {
        console.error('Error saving profile links file:', error);
        // Fallback: send message to popup or content script to show links
        if (currentTabId) {
            chrome.tabs.sendMessage(currentTabId, {
                action: 'SHOW_PROFILE_LINKS_POPUP',
                links: summary
            });
        }
    }
}

function processNextKeyword(pageLimit = 1, actionTypes = []) {
    if (automationQueue.length === 0) {
        // Download profile links file
        downloadProfileLinksFile();

        // Check if we need to perform actions on the collected profiles
        const needsActions = currentActionTypes.some(type => type === 'connect' || type === 'follow');
        if (needsActions && allProfileLinks.length > 0) {
            console.log(`Starting to visit ${allProfileLinks.length} profiles for actions: ${currentActionTypes}`);
            urlQueue = [...allProfileLinks];
            currentUrlActionTypes = currentActionTypes;
            visitNextUrl();
        } else {
            // No actions needed, keep the tab open for logs
            console.log('Automation completed. Tab remains open for log viewing.');
            currentTabId = null; // Reset but don't close
        }
        return;
    }

    const keyword = automationQueue.shift();
    if (currentTabId) {
        // Update the URL for the next keyword
        chrome.tabs.update(currentTabId, {
            url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keyword)}`
        }, (tab) => {
            // Wait for page load and send automation message
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    chrome.tabs.sendMessage(tabId, {
                        action: 'EXECUTE_AUTOMATION',
                        keyword: keyword,
                        pageLimit: pageLimit,
                        actionTypes: actionTypes
                    });
                }
            });
        });
    }
}

async function visitNextUrl() {
    if (urlQueue.length === 0) {
        // Done visiting all URLs
        console.log('All URLs visited');
        await downloadActionsSummary();
        return;
    }

    const url = urlQueue.shift();
    console.log(`Visiting URL: ${url}`);

    chrome.tabs.create({url: url}, (tab) => {
        currentTabId = tab.id;
        // Wait for page load and send message to perform actions
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.sendMessage(tabId, {
                    action: 'PERFORM_ACTION_ON_PROFILE',
                    actionTypes: currentUrlActionTypes
                });
            }
        });
    });
}

let currentActionTypes = [];
let urlQueue = []; // Queue for URLs to visit
let currentUrlActionTypes = []; // Action types for URL visiting

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'VISIT_URLS_AND_ACT') {
        const { urls, actionTypes } = request;
        urlQueue = [...urls];
        currentUrlActionTypes = actionTypes || [];

        if (urlQueue.length === 0) {
            sendResponse({status: 'No URLs to process'});
            return;
        }

        // Start visiting URLs
        visitNextUrl();
        sendResponse({status: 'URL visiting started'});
    } else if (request.action === 'START_LINKEDIN_AUTOMATION') {
        const { keywords, pageLimit, actionTypes, filename } = request;

        // Store the uploaded filename
        uploadedFilename = filename || null;

        // Store action types for subsequent keywords
        currentActionTypes = actionTypes || [];

        // Start automation (assuming user is already logged in)
        startAutomation(keywords, pageLimit, actionTypes);

        sendResponse({status: 'Automation initialized for ' + keywords.length + ' keywords'});
    } else if (request.action === 'AUTOMATION_COMPLETE') {
        // Process the next keyword in the queue
        processNextKeyword(1, currentActionTypes);
    } else if (request.action === 'STOP_LINKEDIN_AUTOMATION') {
        // Stop automation
        automationQueue = [];
        currentActionTypes = [];
        urlQueue = [];
        currentUrlActionTypes = [];
        if (currentTabId) {
            chrome.tabs.sendMessage(currentTabId, {action: 'STOP_AUTOMATION'});
            chrome.tabs.remove(currentTabId);
            currentTabId = null;
        }
        sendResponse({status: 'Automation stopped'});
    } else if (request.action === 'SAVE_SUMMARY') {
        const summary = request.summary;
        if (!summary) {
            console.error('No summary provided for SAVE_SUMMARY action');
            return;
        }
        try {
            const blob = new Blob([summary], {type: 'text/plain'});
            const url = URL.createObjectURL(blob);
            // Use uploadedFilename if available, else default
            const filename = uploadedFilename ? uploadedFilename.replace('.txt', '_summary.txt') : 'visited_profiles_summary.txt';
            chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            });
        } catch (error) {
            console.error('Error saving summary file:', error);
        }
    } else if (request.action === 'SAVE_PROFILE_LINKS_FILE') {
        const summary = request.summary;
        if (!summary) {
            console.error('No summary provided for SAVE_PROFILE_LINKS_FILE action');
            return;
        }
        try {
            const blob = new Blob([summary], {type: 'text/plain'});
            const url = URL.createObjectURL(blob);
            chrome.downloads.download({
                url: url,
                filename: 'profile-links.txt',
                saveAs: true
            });
        } catch (error) {
            console.error('Error saving profile links file:', error);
        }
    } else if (request.action === 'SCHEDULE_RETURN') {
        const { delay } = request;
        const tabId = sender.tab.id;
        const searchUrl = searchUrls.get(tabId) || 'https://www.linkedin.com/search/results/people/';
        const alarmName = 'return_to_search_' + tabId + '_' + Date.now();
        await storeReturnUrl(tabId, searchUrl);
        chrome.alarms.create(alarmName, { when: Date.now() + delay });
    } else if (request.action === 'SAVE_PROFILE_LINKS') {
        const { keyword, profileLinks } = request;
        console.log(`Saving ${profileLinks.length} profile links for keyword: ${keyword}`, profileLinks);

        // Deduplicate profileLinks internally ignoring query params and trimming
        const seen = new Set();
        const dedupedLinks = [];
        for (const link of profileLinks) {
            const trimmedLink = link.trim();
            const baseLink = trimmedLink.split('?')[0];
            if (!seen.has(baseLink)) {
                seen.add(baseLink);
                dedupedLinks.push(trimmedLink);
            }
        }

        profileQueues.set(keyword, dedupedLinks);

        // Deduplicate profile links before adding using Set with trimming and ignoring query params
        const uniqueLinks = dedupedLinks.filter(link => {
            const trimmedLink = link.trim();
            const baseLink = trimmedLink.split('?')[0];
            return !allProfileLinksSet.has(baseLink);
        });
        uniqueLinks.forEach(link => {
            const trimmedLink = link.trim();
            const baseLink = trimmedLink.split('?')[0];
            allProfileLinksSet.add(baseLink);
            allProfileLinks.push(baseLink);
        });

        console.log('Current profileQueues:', Array.from(profileQueues.entries()));
        sendResponse({status: 'Profile links saved'});
    } else if (request.action === 'GET_NEXT_PROFILE') {
        console.log('GET_NEXT_PROFILE called');
        console.log('Current profileQueues:', Array.from(profileQueues.entries()));

        // Get all profile queues and find one with remaining profiles
        let nextProfile = null;
        for (const [keyword, profiles] of profileQueues) {
            if (profiles && profiles.length > 0) {
                nextProfile = profiles.shift();
                console.log(`Returning next profile: ${nextProfile} for keyword: ${keyword}`);
                console.log('Remaining profiles for this keyword:', profiles.length);
                break;
            }
        }

        if (nextProfile) {
            sendResponse({profileUrl: nextProfile});
        } else {
            console.log('No more profiles found');
            sendResponse({profileUrl: null}); // No more profiles
        }
    } else if (request.action === 'NAVIGATE_TO_PROFILE') {
        const { profileUrl } = request;
        console.log(`Navigating to profile: ${profileUrl}`);
        if (currentTabId) {
            chrome.tabs.update(currentTabId, {url: profileUrl});
        }
    } else if (request.action === 'STORE_SEARCH_URL') {
        const { searchUrl } = request;
        const tabId = sender.tab.id;
        searchUrls.set(tabId, searchUrl);
        console.log(`Stored search URL for tab ${tabId}: ${searchUrl}`);
    } else if (request.action === 'SETUP_ALARMS') {
        setupAlarms();
        sendResponse({status: 'Alarms set up'});
    } else if (request.action === 'URL_VISIT_COMPLETE') {
        // Small delay to ensure all log messages are processed
        setTimeout(() => {
            // Close the tab
            if (currentTabId) {
                chrome.tabs.remove(currentTabId);
                currentTabId = null;
            }
            // Visit next URL
            visitNextUrl();
        }, 1000);
    } else if (request.action === 'LOG_ACTION') {
        await logAction(request.name, request.status, request.type);
    }
});

async function logAction(name, status, type) {
    const result = await chrome.storage.local.get(['linkedinActions']);
    let actions = result.linkedinActions ? JSON.parse(result.linkedinActions) : [];
    actions.push({name, status, type, timestamp: new Date().toISOString()});
    await chrome.storage.local.set({linkedinActions: JSON.stringify(actions)});
    console.log('Logged action:', {name, status, type});
}

async function downloadActionsSummary() {
    // Wait a bit for any pending log messages to be processed
    await sleep(1000);
    const result = await chrome.storage.local.get(['linkedinActions']);
    const actions = result.linkedinActions ? JSON.parse(result.linkedinActions) : [];
    if (actions.length === 0) {
        console.log('No actions to download');
        return;
    }
    const summary = actions.map(action => `${action.timestamp} - ${action.type}: ${action.name} - ${action.status}`).join('\n');
    try {
        // Convert summary to base64 data URL
        const base64Data = btoa(unescape(encodeURIComponent(summary)));
        const dataUrl = 'data:text/plain;base64,' + base64Data;
        const filename = `actions-summary-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.txt`;
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
        });
        console.log('Actions summary downloaded');
        // Clear the actions after download
        await chrome.storage.local.remove(['linkedinActions']);
    } catch (error) {
        console.error('Error downloading actions summary:', error);
    }
}

// Scheduled execution
async function setupAlarms() {
    // Clear existing alarms
    const alarms = await chrome.alarms.getAll();
    for (const alarm of alarms) {
        if (alarm.name.startsWith('schedule_') || alarm.name === 'dailyAutomation') {
            chrome.alarms.clear(alarm.name);
        }
    }

    const result = await chrome.storage.sync.get(['scheduleTime', 'advancedSchedules']);
    const scheduleTime = result.scheduleTime || '11:00';
    const advancedSchedules = result.advancedSchedules || [];

    if (advancedSchedules.length > 0) {
        // Set alarms for specific dates
        advancedSchedules.forEach(schedule => {
            const scheduleTime = schedule.time || '11:00';
            const date = new Date(schedule.date + 'T' + scheduleTime);
            if (date > new Date()) {
                chrome.alarms.create(`schedule_${schedule.date}`, {
                    when: date.getTime()
                });
            }
        });
    } else {
        // Fallback to daily
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        const now = new Date();
        const next = new Date(now);
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        chrome.alarms.create('dailyAutomation', {
            when: next.getTime(),
            periodInMinutes: 24 * 60
        });
    }
}

chrome.runtime.onInstalled.addListener(async () => {
    await setupAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
    await setupAlarms();
});

// Listen for storage changes to update alarms
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'sync' && (changes.scheduleTime || changes.advancedSchedules)) {
        await setupAlarms();
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('Alarm fired:', alarm.name, new Date().toISOString());
    if (alarm.name === 'dailyAutomation') {
        const now = new Date();
        const day = now.getDay();
        try {
            const keywords = await loadKeywords(day);
            if (keywords.length > 0) {
                console.log('Starting daily automation with keywords:', keywords);
                startAutomation(keywords, 1, ['collect']);
            } else {
                console.log('No keywords found for daily automation');
            }
        } catch (error) {
            console.error('Error in scheduled automation:', error);
        }
    } else if (alarm.name.startsWith('schedule_')) {
        const date = alarm.name.replace('schedule_', '');
        console.log('Advanced schedule alarm for date:', date);
        const result = await chrome.storage.sync.get(['advancedSchedules']);
        const schedule = result.advancedSchedules.find(s => s.date === date);
        if (schedule) {
            try {
                const fileNum = schedule.file.match(/part(\d+)\.txt/)[1];
                const keywords = await loadKeywords(parseInt(fileNum));
                if (keywords.length > 0) {
                    console.log('Starting advanced automation with keywords:', keywords);
                    startAutomation(keywords, 1, ['collect']);
                } else {
                    console.log('No keywords found for advanced automation');
                }
            } catch (error) {
                console.error('Error in advanced scheduled automation:', error);
            }
        } else {
            console.log('No schedule found for date:', date);
        }
    } else if (alarm.name.startsWith('return_to_search_')) {
        const tabId = parseInt(alarm.name.split('_')[3]);
        const url = await getReturnUrl(tabId);
        if (url) {
            chrome.tabs.update(tabId, {url: url});
            await removeReturnUrl(tabId);
            searchUrls.delete(tabId);
        }
    }
});
