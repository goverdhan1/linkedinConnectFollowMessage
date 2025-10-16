let automationConfig = {
    keyword: '',
    pageLimit: 3,
    currentPage: 0,
    connectionsProcessed: 0,
    maxConnectionsPerPage: 10,
    connectRequestsSent: 0,
    connectRequestsSkipped: 0,
    followRequestsSent: 0,
    followRequestsSkipped: 0,
    isStopped: false,
    hasVisitedProfile: false,
    profileIndex: 0,
    profileUrls: [],
    visitedProfiles: [], // Added to store visited profile links
    returnedFromProfile: false,
};

function saveVisitedProfile(profileUrl) {
    if (!automationConfig.visitedProfiles.includes(profileUrl)) {
        automationConfig.visitedProfiles.push(profileUrl);
        saveConfig();
        console.log(`Saved visited profile: ${profileUrl}`);
    } else {
        console.log(`Profile already visited: ${profileUrl}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getProfileName() {
    const nameElement = document.querySelector('h1') || document.querySelector('.pv-top-card-v2-ctas + h1') || document.querySelector('.pv-text-details__left-panel h1') || document.querySelector('.pv-top-card--list h1');
    return nameElement ? nameElement.textContent.trim() : 'Unknown User';
}

function randomDelay(min = 1000, max = 3000) {
    return new Promise(resolve =>
        setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
    );
}

async function waitForProfileLoad() {
    console.log('Waiting for profile page to load...');
    const maxWait = 15000; // 15 seconds max wait
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        // Check if shimmer is still present
        const shimmer = document.querySelector('.pvs-loader-wrapper__shimmer--animate');
        if (shimmer) {
            console.log('Shimmer still present, waiting...');
            await sleep(500);
            continue;
        }

        // Check if connect or follow button is present
        const connectBtn = document.querySelector(
            '.artdeco-button[aria-label*="Invite"], ' +
            '.artdeco-button[aria-label*="Connect"], ' +
            '.artdeco-button[data-control-name="invite"], ' +
            '.pv-top-card-v2-ctas .artdeco-button--primary, ' +
            '.discover-entity-type-card__connect-button, ' +
            'button[aria-label*="connect" i], ' +
            '.pvs-profile-actions__action button'
        );
        const followBtn = document.querySelector(
            '.artdeco-button[aria-label*="Follow"], ' +
            '.artdeco-button[data-control-name="follow"], ' +
            'button[aria-label*="follow" i], ' +
            '.pvs-profile-actions__action button'
        );

        if (connectBtn || followBtn) {
            console.log('Profile loaded, action button found');
            return true;
        }

        console.log('Action button not found yet, waiting...');
        await sleep(500);
    }

    console.log('Profile load timeout - proceeding anyway');
    return false;
}

async function processConnectActions() {
    console.log('Processing connect actions...');

    // Find all connect buttons with multiple selector strategies
    const connectButtons = document.querySelectorAll(
        '.artdeco-button[aria-label*="Invite"], ' +
        '.artdeco-button[aria-label*="Connect"], ' +
        '.artdeco-button[data-control-name="invite"], ' +
        '.pv-top-card-v2-ctas .artdeco-button--primary, ' +
        '.discover-entity-type-card__connect-button, ' +
        'button[aria-label*="connect" i], ' +
        '.pvs-profile-actions__action button'
    );

    console.log(`Found ${connectButtons.length} connect buttons`);

    let actionsPerformed = 0;

    for (let i = 0; i < Math.min(connectButtons.length, automationConfig.maxConnectionsPerPage); i++) {
        try {
            const button = connectButtons[i];

            if (!button || button.disabled) continue;

            // Check if already connected or pending by button text or aria-label
            const label = button.getAttribute('aria-label') || button.textContent || '';
            if (label.toLowerCase().includes('pending') || label.toLowerCase().includes('withdraw') || label.toLowerCase().includes('connected')) {
                automationConfig.connectRequestsSkipped++;
                console.log(`Skipping connect button ${i + 1} - already connected or pending`);
                continue;
            }

            // Scroll to button
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomDelay();

            // Ensure button is clickable
            button.focus();
            await randomDelay(500, 1000);

            // Click connect button
            button.click();
            console.log(`Clicked connect button ${i + 1}`);

            await randomDelay();

            // Handle connection request popup
            await handleConnectionRequestPopup();

            automationConfig.connectRequestsSent++;
            actionsPerformed++;
            console.log(`Processed connect action ${automationConfig.connectRequestsSent}`);
        } catch (error) {
            console.error('Error in connect action:', error);
        }
    }

    // If no actions were performed, handle based on current page
    if (actionsPerformed === 0) {
        if (window.location.href.includes('/in/')) {
            console.log('On profile page, no connect actions performed (already connected or button not found), skipping to next profile');
        } else {
            console.log('On search page, no connect actions performed, attempting to visit profiles...');
            const profileLinks = await extractAndSaveProfileLinks();
            await visitProfilesForConnect(profileLinks);
        }
    }
}

async function extractAndSaveProfileLinks() {
    // Find profile links in search results using multiple selectors for reliability
    let profileLinks = document.querySelectorAll('a[href*="/in/"]');

    // If no links found, try alternative selectors
    if (profileLinks.length === 0) {
        profileLinks = document.querySelectorAll('.entity-result__title-text a');
    }
    if (profileLinks.length === 0) {
        profileLinks = document.querySelectorAll('.search-result__result-link');
    }
    if (profileLinks.length === 0) {
        profileLinks = document.querySelectorAll('.reusable-search__result-container a[href*="/in/"]');
    }
    if (profileLinks.length === 0) {
        profileLinks = document.querySelectorAll('.search-results__result-item a[href*="/in/"]');
    }

    console.log(`Found ${profileLinks.length} profile links using selector`);

    const linksToSave = [];
    for (let i = 0; i < profileLinks.length; i++) {
        const link = profileLinks[i];
        const profileUrl = link.href;

        // Ensure it's a valid profile URL
        if (profileUrl && profileUrl.includes('/in/')) {
            linksToSave.push(profileUrl);
            console.log(`Extracted profile link: ${profileUrl}`);
        }
    }

    console.log(`Saved ${linksToSave.length} valid profile links`);

    // Send profile links to background script to save in .txt file
    chrome.runtime.sendMessage({
        action: 'SAVE_PROFILE_LINKS',
        keyword: automationConfig.keyword,
        profileLinks: linksToSave
    });

    return linksToSave;
}

async function visitProfilesForConnect(profileLinks) {
    for (let i = 0; i < profileLinks.length; i++) {
        const profileUrl = profileLinks[i];

        console.log(`Checking profile for connect: ${profileUrl}`);
        console.log(`Visited profiles count: ${automationConfig.visitedProfiles.length}`);

        if (automationConfig.visitedProfiles.includes(profileUrl)) {
            console.log(`Profile already visited: ${profileUrl}`);
            continue;
        }

        console.log(`Visiting profile for connect: ${profileUrl}`);

        // Navigate to profile using background script to ensure same tab
        chrome.runtime.sendMessage({
            action: 'NAVIGATE_TO_PROFILE',
            profileUrl: profileUrl
        });

        // Save that we are visiting a profile
        automationConfig.hasVisitedProfile = true;
        automationConfig.currentProfileUrl = profileUrl;
        saveConfig();

        // The script will stop here due to navigation, but the background will handle return
        return;
    }
}

async function handleConnectionRequestPopup() {
    console.log('Handling connection request popup...');

    // Wait for popup to appear by polling
    let popup = null;
    let attempts = 0;
    while (attempts < 20) { // 10 seconds
        popup = document.querySelector('.artdeco-modal') ||
                document.querySelector('[role="dialog"]') ||
                document.querySelector('.artdeco-modal__overlay') ||
                document.querySelector('.send-invitation') ||
                document.querySelector('.modal') ||
                document.querySelector('.artdeco-modal__content');
        if (popup) {
            console.log('Popup detected:', popup.className || popup.tagName);
            break;
        }
        console.log(`Waiting for popup... attempt ${attempts + 1}`);
        await sleep(500);
        attempts++;
    }

    if (!popup) {
        console.log('Popup not detected after 10 seconds');
        // Log all modals/dialogs for debugging
        const allModals = document.querySelectorAll('.artdeco-modal, [role="dialog"], .artdeco-modal__overlay, .send-invitation, .modal, .artdeco-modal__content');
        console.log(`All potential modals found: ${allModals.length}`);
        allModals.forEach((modal, index) => {
            console.log(`Modal ${index}: ${modal.className || modal.tagName}`);
        });
        return false;
    }

    // Log all buttons in the popup for debugging
    const allPopupButtons = popup.querySelectorAll('button');
    console.log(`All buttons in popup (${allPopupButtons.length}):`);
    allPopupButtons.forEach((btn, index) => {
        const text = btn.textContent.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const dataControl = btn.getAttribute('data-control-name');
        console.log(`Popup Button ${index}: text="${text}", aria-label="${ariaLabel}", data-control-name="${dataControl}", class="${btn.className}"`);
    });

    // Look for send button in the popup
    let sendButton = popup.querySelector('.artdeco-button--primary') ||
                     popup.querySelector('button[aria-label*="Send"]') ||
                     popup.querySelector('button[data-control-name="send_invitation"]') ||
                     popup.querySelector('.send-invitation__actions button.ml1') ||
                     popup.querySelector('button[type="submit"]') ||
                     popup.querySelector('button.ml1') ||
                     popup.querySelector('[data-control-name="send"]') ||
                     popup.querySelector('button[aria-label="Send without a note"]') ||
                     popup.querySelector('button[data-control-name="send"]') ||
                     popup.querySelector('button[data-test-id="send-invitation"]');

    if (!sendButton) {
        // Fallback: search within popup for button with matching text
        const buttons = popup.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent.trim().toLowerCase();
            if (text.includes('send') || text.includes('invite') || text.includes('connect')) {
                sendButton = btn;
                break;
            }
        }
    }

    if (!sendButton) {
        console.log('No send button found in popup');
        // Fallback: search globally for send button
        const globalSendButton = Array.from(document.querySelectorAll('button')).find(btn => {
            const text = btn.textContent.toLowerCase();
            return text.includes('send') || text.includes('invite') || text.includes('connect');
        });
        if (globalSendButton) {
            console.log('Clicking global send button:', globalSendButton.textContent.trim());
            globalSendButton.click();
            await randomDelay();
            return true;
        }
        console.log('No send button found anywhere');
        return false;
    }

    console.log('Clicking send button:', sendButton.textContent.trim());
    sendButton.click();
    await randomDelay();
    return true;
}

async function processFollowActions() {
    console.log('Processing follow actions...');

    // Find all follow buttons
    const followButtons = document.querySelectorAll(
        '.artdeco-button[aria-label*="Follow"], ' +
        '.artdeco-button[data-control-name="follow"], ' +
        'button[aria-label*="follow" i], ' +
        '.pvs-profile-actions__action button'
    );

    console.log(`Found ${followButtons.length} follow buttons`);

    let actionsPerformed = 0;

    for (let i = 0; i < Math.min(followButtons.length, automationConfig.maxConnectionsPerPage); i++) {
        try {
            const button = followButtons[i];

            if (!button || button.disabled) continue;

            // Check if already following
            const label = button.getAttribute('aria-label') || button.textContent || '';
            if (label.toLowerCase().includes('following') || label.toLowerCase().includes('unfollow')) {
                automationConfig.followRequestsSkipped++;
                console.log(`Skipping follow button ${i + 1} - already following`);
                continue;
            }

            // Scroll to button
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await randomDelay();

            // Click follow button
            button.click();
            console.log(`Clicked follow button ${i + 1}`);

            automationConfig.followRequestsSent++;
            actionsPerformed++;
            console.log(`Processed follow action ${automationConfig.followRequestsSent}`);
        } catch (error) {
            console.error('Error in follow action:', error);
        }
    }

    // If no actions were performed, handle based on current page
    if (actionsPerformed === 0) {
        if (window.location.href.includes('/in/')) {
            console.log('On profile page, no follow actions performed (already following or button not found), skipping to next profile');
        } else {
            console.log('On search page, no follow actions performed, attempting to visit profiles...');
            const profileLinks = await extractAndSaveProfileLinks();
            await visitProfilesForFollow(profileLinks);
        }
    }
}

async function visitProfilesForFollow(profileLinks) {
    for (let i = 0; i < profileLinks.length; i++) {
        const profileUrl = profileLinks[i];

        if (automationConfig.visitedProfiles.includes(profileUrl)) {
            console.log(`Profile already visited: ${profileUrl}`);
            continue;
        }

        console.log(`Visiting profile: ${profileUrl}`);

        // Navigate to profile using background script to ensure same tab
        chrome.runtime.sendMessage({
            action: 'NAVIGATE_TO_PROFILE',
            profileUrl: profileUrl
        });

        // Save that we are visiting a profile
        automationConfig.hasVisitedProfile = true;
        automationConfig.currentProfileUrl = profileUrl;
        saveConfig();

        // The script will stop here due to navigation
        return;
    }
}

async function navigateToNextPage() {
    const nextButton = document.querySelector('[aria-label="Next"]');
    if (nextButton && automationConfig.currentPage < automationConfig.pageLimit) {
        nextButton.click();
        await sleep(2000);
        automationConfig.currentPage++;
        return true;
    }
    return false;
}

let selectedActions = [];

async function runAutomation() {
    console.log('LinkedIn Profile Link Extraction Started');
    console.log('Current URL:', window.location.href);

    // Wait for page to fully load and search results to appear
    await randomDelay(3000, 5000);

    // We are on search results page - extract and save profile links
    console.log('On search results page, extracting profile links...');
    const profileLinks = await extractAndSaveProfileLinks();

    console.log(`Found ${profileLinks.length} profile links for keyword: ${automationConfig.keyword}`);

    // Check if we need to navigate to next page
    if (automationConfig.currentPage < automationConfig.pageLimit) {
        const nextPageSuccess = await navigateToNextPage();
        if (nextPageSuccess) {
            console.log(`Navigated to page ${automationConfig.currentPage + 1}`);
            // Continue on the same page
            return;
        } else {
            console.log('No more pages to navigate');
        }
    }

    // Move to next keyword after extraction
    chrome.runtime.sendMessage({action: 'AUTOMATION_COMPLETE'});
}

// Function to get visited profiles summary
function getVisitedProfilesSummary() {
    return automationConfig.visitedProfiles.join('\n');
}

// Load config from sessionStorage if exists
const savedConfig = sessionStorage.getItem('automationConfig');
if (savedConfig) {
    Object.assign(automationConfig, JSON.parse(savedConfig));
}

// Function to save config
function saveConfig() {
    sessionStorage.setItem('automationConfig', JSON.stringify(automationConfig));
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXECUTE_AUTOMATION') {
        automationConfig.keyword = request.keyword;
        automationConfig.pageLimit = request.pageLimit;
        automationConfig.currentPage = 0;
        automationConfig.hasVisitedProfile = false;
        automationConfig.isStopped = false;
        automationConfig.profileIndex = 0;
        automationConfig.profileUrls = [];
        automationConfig.returnedFromProfile = false;
        selectedActions = request.actionTypes || [];

        // Delay to ensure page is fully loaded
        setTimeout(runAutomation, 3000);
    } else if (request.action === 'STOP_AUTOMATION') {
        automationConfig.isStopped = true;
        console.log('Automation stop requested');
    } else if (request.action === 'GET_VISITED_PROFILES_SUMMARY') {
        const summary = getVisitedProfilesSummary();
        sendResponse({summary: summary});
    } else if (request.action === 'PERFORM_ACTION_ON_PROFILE') {
        const actionTypes = request.actionTypes || [];
        performActionsOnProfile(actionTypes);
    }
});

async function performActionsOnProfile(actionTypes) {
    console.log('Performing actions on profile:', actionTypes);

    let name = 'Unknown User';

    try {
        // Wait for profile to load
        await waitForProfileLoad();

        name = getProfileName();

        for (const action of actionTypes) {
            if (action === 'connect') {
                await performConnectOnProfile();
            } else if (action === 'follow') {
                await performFollowOnProfile();
            }
        }

        // Log successful completion
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Actions Completed', type: actionTypes[0] || 'profile'});
    } catch (error) {
        console.error('Error performing actions on profile:', error);
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Error', type: actionTypes[0] || 'profile'});
    } finally {
        // Always log the visit
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Visited', type: 'profile'});
        // Small delay to ensure log messages are processed before notifying completion
        await sleep(500);
        // After actions, notify background to process next URL
        chrome.runtime.sendMessage({action: 'URL_VISIT_COMPLETE'});
    }
}

async function performConnectOnProfile() {
    const name = getProfileName();

    // Only target the main profile's connect button in the top card area
    let connectBtn = document.querySelector('.pv-top-card-v2-ctas .artdeco-button--primary') ||
                     document.querySelector('.pv-top-card-v2-ctas button[aria-label*="Connect"]') ||
                     document.querySelector('.pv-top-card-v2-ctas button[aria-label*="Invite"]') ||
                     document.querySelector('.pv-top-card-v2-ctas .artdeco-button[data-control-name="invite"]') ||
                     document.querySelector('.pvs-profile-actions button[aria-label*="Connect"]') ||
                     document.querySelector('.pvs-profile-actions button[data-control-name="invite"]');

    // If no connect button found in main profile area, check if it's hidden behind a "More" dropdown in the top card
    if (!connectBtn) {
        console.log('No direct connect button found in main profile area, checking for More dropdown...');
        const moreButton = document.querySelector('.pv-top-card-v2-ctas button[aria-label="More actions"]') ||
                          document.querySelector('.pv-top-card-v2-ctas .artdeco-dropdown__trigger[aria-label*="More"]') ||
                          document.querySelector('.pv-top-card-v2-ctas button[id*="overflow-action"]');

        if (moreButton) {
            console.log('Found More button in top card, clicking to reveal options...');
            moreButton.click();
            await randomDelay(1000, 2000); // Wait for dropdown to open

            // Now search for connect button in the dropdown
            connectBtn = document.querySelector('.artdeco-dropdown__content button[aria-label*="Connect"]') ||
                         document.querySelector('.artdeco-dropdown__content button[aria-label*="Invite"]') ||
                         document.querySelector('.artdeco-dropdown__content [data-control-name="invite"]');

            console.log('Connect button after More click:', connectBtn ? 'Found' : 'Not found');
        }
    }

    if (!connectBtn) {
        console.log('No connect button found for main profile');
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'No Connect Button', type: 'connect'});
        return;
    }

    const label = connectBtn.getAttribute('aria-label') || connectBtn.textContent || '';
    if (label.toLowerCase().includes('pending') || label.toLowerCase().includes('withdraw') || label.toLowerCase().includes('connected')) {
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Pending', type: 'connect'});
        console.log('Already connected or pending');
        return;
    }

    // Click connect
    connectBtn.click();
    console.log('Clicked connect button for main profile');

    await randomDelay(2000, 4000); // Increased delay for popup

    // Handle popup
    const popupHandled = await handleConnectionRequestPopup();
    if (popupHandled) {
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Connected', type: 'connect'});
    } else {
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Popup Not Handled', type: 'connect'});
    }
}

async function performFollowOnProfile() {
    const name = getProfileName();

    // Find the follow button that is not already following
    const followBtn = Array.from(document.querySelectorAll(
        '.artdeco-button[aria-label*="Follow"], ' +
        '.artdeco-button[data-control-name="follow"], ' +
        'button[aria-label*="follow" i], ' +
        '.pvs-profile-actions__action button'
    )).find(btn => {
        const label = btn.getAttribute('aria-label') || btn.textContent || '';
        return label.toLowerCase().includes('follow') &&
               !label.toLowerCase().includes('following') &&
               !label.toLowerCase().includes('unfollow');
    });

    if (!followBtn) {
        chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Following', type: 'follow'});
        console.log('No follow button found or already following');
        return;
    }

    // Click follow
    followBtn.click();
    console.log('Clicked follow button');

    await randomDelay();

    chrome.runtime.sendMessage({action: 'LOG_ACTION', name, status: 'Followed', type: 'follow'});
}
