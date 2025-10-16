document.addEventListener('DOMContentLoaded', function() {
    const startButton = document.getElementById('startAutomation');
    const stopButton = document.getElementById('stopAutomation');
    const keywordsInput = document.getElementById('keywords');
    const loadFromFileInput = document.getElementById('loadFromFile');
    const manualInputGroup = document.getElementById('manualInputGroup');
    const fileInputGroup = document.getElementById('fileInputGroup');
    const pageLimitInput = document.getElementById('pageLimit');
    const pageLimitValue = document.getElementById('pageLimitValue');
    const scheduleTimeInput = document.getElementById('scheduleTime');
    const statusDiv = document.getElementById('status');
    const privacyLink = document.getElementById('privacyLink');
    const disclaimerLink = document.getElementById('disclaimerLink');
    const privacyModal = document.getElementById('privacyModal');
    const privacyContent = document.getElementById('privacyContent');
    const closeModal = document.querySelector('.close');
    const progressBar = document.querySelector('.progress');

    // Load saved settings
    chrome.storage.sync.get(['scheduleTime', 'advancedSchedules'], (result) => {
        if (result.scheduleTime) {
            scheduleTimeInput.value = result.scheduleTime;
        }
        if (result.advancedSchedules) {
            loadSchedules(result.advancedSchedules);
        }
    });

    // Save schedule time on change
    scheduleTimeInput.addEventListener('change', () => {
        chrome.storage.sync.set({scheduleTime: scheduleTimeInput.value});
    });

    // Handle stats toggle
    document.getElementById('showStats').addEventListener('change', function() {
        const statsContainer = document.getElementById('statsContainer');
        if (this.checked) {
            statsContainer.style.display = 'flex';
            chrome.storage.sync.set({showStats: true});
        } else {
            statsContainer.style.display = 'none';
            chrome.storage.sync.set({showStats: false});
        }
    });

    // Save stats values on change
    document.getElementById('todayLimit').addEventListener('change', function() {
        chrome.storage.sync.set({todayLimit: parseInt(this.value)});
    });

    document.getElementById('cooldown').addEventListener('change', function() {
        chrome.storage.sync.set({cooldown: parseInt(this.value)});
    });

    // Populate file selects
    function populateFileSelect(select) {
        if (!select) {
            console.error('populateFileSelect: select element is null or undefined');
            return;
        }
        let options = '';
        for (let i = 0; i <= 42; i++) {
            options += `<option value="part${i}.txt">part${i}.txt</option>`;
        }
        select.innerHTML = options;
    }

    // Load schedules into UI
    function loadSchedules(schedules) {
        const list = document.getElementById('schedulesList');
        if (!list) {
            console.error('Element with id "schedulesList" not found.');
            // Try to find the element after a short delay in case DOM is not fully loaded
            setTimeout(() => {
                const delayedList = document.getElementById('schedulesList');
                if (delayedList) {
                    delayedList.innerHTML = '';
                    schedules.forEach((schedule, index) => {
                        addScheduleRow(schedule.date, schedule.time || '11:00', schedule.file, index);
                    });
                } else {
                    console.error('Element with id "schedulesList" still not found after delay.');
                }
            }, 100);
            return;
        }
        list.innerHTML = '';
        schedules.forEach((schedule, index) => {
            addScheduleRow(schedule.date, schedule.time || '11:00', schedule.file, index);
        });
    }

    // Add a schedule row
    function addScheduleRow(date = '', time = '11:00', file = 'part0.txt', index = null) {
        const list = document.getElementById('schedulesList');
        if (!list) {
            console.error('Element with id "schedulesList" not found.');
            return;
        }
        const row = document.createElement('div');
        row.className = 'schedule-row';
        row.innerHTML = `
            <input type="date" value="${date}" class="schedule-date">
            <input type="time" value="${time}" class="schedule-time">
            <select class="schedule-file"></select>
            <button class="remove-schedule btn-secondary"><i class="fas fa-trash"></i></button>
        `;
        list.appendChild(row);

        const fileSelect = row.querySelector('.schedule-file');
        populateFileSelect(fileSelect);
        fileSelect.value = file;

        row.querySelector('.remove-schedule').addEventListener('click', () => {
            if (list.children.length > 1) {
                row.remove();
                saveSchedules();
            } else {
                // Disable the delete button instead of alerting
                row.querySelector('.remove-schedule').disabled = true;
            }
        });

        row.querySelector('.schedule-date').addEventListener('change', saveSchedules);
        row.querySelector('.schedule-time').addEventListener('change', saveSchedules);
        fileSelect.addEventListener('change', saveSchedules);
    }

    // Save schedules to storage
    function saveSchedules() {
        const rows = document.querySelectorAll('.schedule-row');
        const schedules = Array.from(rows).map(row => ({
            date: row.querySelector('.schedule-date').value,
            time: row.querySelector('.schedule-time').value,
            file: row.querySelector('.schedule-file').value
        }));
        chrome.storage.sync.set({advancedSchedules: schedules});
    }

    // Handle advanced scheduling toggle
    document.getElementById('enableAdvancedScheduling').addEventListener('change', function() {
        const advanced = document.getElementById('advancedScheduling');
        if (advanced) {
            advanced.style.display = this.checked ? 'block' : 'none';
        } else {
            console.error('Element with id "advancedScheduling" not found.');
        }
        // Uncheck load from file when advanced scheduling is enabled
        if (this.checked) {
            loadFromFileInput.checked = false;
            manualInputGroup.style.display = 'block';
            fileInputGroup.style.display = 'none';
            document.querySelector('.action-description').style.display = 'block';
            enableActionsCheckbox.checked = false;
        }
    });

    // Add schedule button
    const addScheduleBtn = document.getElementById('addSchedule');
    if (addScheduleBtn) {
        addScheduleBtn.addEventListener('click', () => {
            addScheduleRow();
        });
    } else {
        console.error('Add Schedule button not found.');
    }

    // Add range button
    document.getElementById('addRange').addEventListener('click', () => {
        const start = document.getElementById('rangeStart').value;
        const end = document.getElementById('rangeEnd').value;
        const file = document.getElementById('rangeFile').value;
        if (start && end && file) {
            const startDate = new Date(start);
            const endDate = new Date(end);
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                addScheduleRow(dateStr, '11:00', file);
            }
            saveSchedules();
        }
    });

    // Populate range file select
    populateFileSelect(document.getElementById('rangeFile'));



    // Set initial state based on checkbox
    if (loadFromFileInput.checked) {
        // Do not hide manualInputGroup, keep it visible
        // manualInputGroup.style.display = 'none';
        fileInputGroup.style.display = 'block';
    } else {
        manualInputGroup.style.display = 'block';
        fileInputGroup.style.display = 'none';
    }

    // Toggle input groups based on checkbox
    loadFromFileInput.addEventListener('change', function() {
        if (this.checked) {
            // Do not hide manualInputGroup, keep it visible
            // manualInputGroup.style.display = 'none';
            fileInputGroup.style.display = 'block';
            enableActionsCheckbox.checked = false;
            document.querySelector('.action-description').style.display = 'none';
        } else {
            manualInputGroup.style.display = 'block';
            fileInputGroup.style.display = 'none';
            document.querySelector('.action-description').style.display = 'block';
        }
    });

    // Update page limit value display
    pageLimitInput.addEventListener('input', function() {
        pageLimitValue.textContent = this.value;
    });

    const connectCheckbox = document.getElementById('connectCheckbox');
    const followCheckbox = document.getElementById('followCheckbox');
    const enableActionsCheckbox = document.getElementById('enableActionsCheckbox');

    // Allow both checkboxes to be selected simultaneously

    // Handle enableActionsCheckbox
    enableActionsCheckbox.addEventListener('change', function() {
        const profileUrlsUploadContainer = document.getElementById('profileUrlsUploadContainer');
        if (this.checked) {
            loadFromFileInput.checked = false;
            manualInputGroup.style.display = 'block';
            fileInputGroup.style.display = 'none';
            document.querySelector('.action-description').style.display = 'block';
            if (profileUrlsUploadContainer) {
                profileUrlsUploadContainer.style.display = 'block';
            }
        } else {
            loadFromFileInput.checked = true;
            manualInputGroup.style.display = 'none';
            fileInputGroup.style.display = 'block';
            document.querySelector('.action-description').style.display = 'none';
            if (profileUrlsUploadContainer) {
                profileUrlsUploadContainer.style.display = 'none';
            }
        }
    });

    // Initial state
    if (loadFromFileInput.checked) {
        document.querySelector('.action-description').style.display = 'none';
    } else {
        document.querySelector('.action-description').style.display = 'block';
    }

    async function startAutomation() {
        let pageLimit = parseInt(pageLimitInput.value);
        let actions = [];

        // Check if Action Type is enabled and profile URLs file is uploaded
        if (enableActionsCheckbox.checked && document.getElementById('profileUrlsFileUpload').files[0]) {
            const fileInput = document.getElementById('profileUrlsFileUpload');
            const file = fileInput.files[0];
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });
            const urls = text.split('\n').map(url => url.trim()).filter(url => url);

            if (!urls.length) {
                statusDiv.textContent = 'No URLs found in file';
                statusDiv.style.color = '#dc3545';
                return;
            }

            if (connectCheckbox.checked) actions.push('connect');
            if (followCheckbox.checked) actions.push('follow');

            if (actions.length === 0) {
                statusDiv.textContent = 'Please select at least one action';
                statusDiv.style.color = '#dc3545';
                return;
            }

            // Send URLs to background for direct visiting and actions
            chrome.runtime.sendMessage({
                action: 'VISIT_URLS_AND_ACT',
                urls: urls,
                actionTypes: actions
            }, function(response) {
                statusDiv.textContent = response.status || 'Automation started';
                statusDiv.style.color = 'var(--linkedin-blue)';
                startProgressBar();
            });
            return;
        }

        if (loadFromFileInput.checked) {
            actions = ['collect'];
        } else {
            if (connectCheckbox.checked) actions.push('connect');
            if (followCheckbox.checked) actions.push('follow');

            if (actions.length === 0) {
                statusDiv.textContent = 'Please select at least one action';
                statusDiv.style.color = '#dc3545';
                return;
            }
        }

        // If advanced scheduling is enabled, set up alarms instead of starting automation
        if (document.getElementById('enableAdvancedScheduling').checked) {
            chrome.runtime.sendMessage({action: 'SETUP_ALARMS'}, (response) => {
                statusDiv.textContent = 'Advanced scheduling set up';
                statusDiv.style.color = 'var(--linkedin-blue)';
            });
            return;
        }

        statusDiv.textContent = 'Loading users from file...';
        statusDiv.style.color = 'var(--linkedin-blue)';

        try {
            let keywords = [];

            if (loadFromFileInput.checked) {
                const fileInput = document.getElementById('fileUpload');
                if (!fileInput.files[0]) {
                    statusDiv.textContent = 'Please select a file to upload';
                    statusDiv.style.color = '#dc3545';
                    return;
                }
                const file = fileInput.files[0];
                const text = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsText(file);
                });
                keywords = text.split('\n').map(k => k.trim()).filter(k => k);

                if (!keywords.length) {
                    statusDiv.textContent = 'No users found in file';
                    statusDiv.style.color = '#dc3545';
                    return;
                }

                // Check if file contains URLs or keywords
                if (keywords.length > 0 && keywords[0].startsWith('https://')) {
                    // Treat as profile URLs
                    const urls = keywords;
                    const actions = [];
                    if (connectCheckbox.checked) actions.push('connect');
                    if (followCheckbox.checked) actions.push('follow');
                    if (actions.length === 0) {
                        statusDiv.textContent = 'Please select at least one action';
                        statusDiv.style.color = '#dc3545';
                        return;
                    }

                    chrome.runtime.sendMessage({
                        action: 'VISIT_URLS_AND_ACT',
                        urls: urls,
                        actionTypes: actions
                    }, function(response) {
                        statusDiv.textContent = response.status || 'Automation started';
                        statusDiv.style.color = 'var(--linkedin-blue)';
                        startProgressBar();
                    });
                } else {
                    // Treat as keywords
                    const filename = file.name;
                    chrome.runtime.sendMessage({
                        action: 'START_LINKEDIN_AUTOMATION',
                        keywords: keywords,
                        pageLimit: Math.min(pageLimit, 10),
                        actionTypes: ['collect'],
                        filename: filename
                    }, function(response) {
                        statusDiv.textContent = response.status || 'Automation started';
                        statusDiv.style.color = 'var(--linkedin-blue)';
                        startProgressBar();
                    });
                }
            } else {
                // Manual input keywords
                const keywordsText = keywordsInput.value.trim();
                if (!keywordsText) {
                    statusDiv.textContent = 'Please enter at least one keyword';
                    statusDiv.style.color = '#dc3545';
                    return;
                }
                keywords = keywordsText.split('\n').map(k => k.trim()).filter(k => k);

                // Check if active tab is on LinkedIn search
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    const activeTab = tabs[0];
                    if (activeTab.url.includes('linkedin.com/search/results/people/')) {
                        // Send to content script in current tab
                        chrome.tabs.sendMessage(activeTab.id, {
                            action: 'EXECUTE_AUTOMATION',
                            keyword: keywords.join(' '),
                            pageLimit: Math.min(pageLimit, 10),
                            actionTypes: actions
                        });
                        statusDiv.textContent = 'Automation started in current tab';
                        statusDiv.style.color = 'var(--linkedin-blue)';
                        startProgressBar();
                    } else {
                        // Send to background to create new tab
                        chrome.runtime.sendMessage({
                            action: 'START_LINKEDIN_AUTOMATION',
                            keywords: keywords,
                            pageLimit: Math.min(pageLimit, 10),
                            actionTypes: actions
                        }, function(response) {
                            statusDiv.textContent = response.status || 'Automation started';
                            statusDiv.style.color = 'var(--linkedin-blue)';
                            startProgressBar();
                        });
                    }
                });
            }
        } catch (error) {
            statusDiv.textContent = 'Error loading keywords: ' + error.message;
            statusDiv.style.color = '#dc3545';
        }
    }

    startButton.addEventListener('click', function() {
        startAutomation();
    });


    stopButton.addEventListener('click', function() {
        chrome.runtime.sendMessage({
            action: 'STOP_LINKEDIN_AUTOMATION'
        }, function(response) {
            statusDiv.textContent = response.status || 'Automation stopped';
            statusDiv.style.color = 'var(--linkedin-blue)';
        });
    });

    function startProgressBar() {
        let width = 0;
        const interval = setInterval(() => {
            if (width >= 100) {
                clearInterval(interval);
            } else {
                width++;
                progressBar.style.width = width + '%';
            }
        }, 100);
    }

    function showModal(content) {
        privacyContent.innerHTML = content;
        privacyModal.style.display = 'block';
    }

    privacyLink.addEventListener('click', function(e) {
        e.preventDefault();
        showModal(`
            <div class="modal-header">
                <h2>Privacy Policy</h2>
                <p class="last-updated">Last Updated: December 2024</p>
            </div>
            
            <div class="modal-body">
                <section>
                    <h3>1. Information Collection</h3>
                    <p>This extension operates locally within your browser and does not collect, store, or transmit any personal information to external servers.</p>
                </section>

                <section>
                    <h3>2. Data Usage</h3>
                    <p>The extension uses provided search keywords temporarily to execute LinkedIn connection requests. All operations occur within your browser session.</p>
                </section>

                <section>
                    <h3>3. Browser Permissions</h3>
                    <p>We require minimal permissions to function:
                        - LinkedIn website access
                        - Local storage for settings
                        - Active tab access for automation</p>
                </section>

                <section>
                    <h3>4. Your Privacy Rights</h3>
                    <p>You maintain complete control over your data and can disable or remove the extension at any time.</p>
                </section>
            </div>
        `);
    });

    disclaimerLink.addEventListener('click', function(e) {
        e.preventDefault();
        showModal(`
            <div class="modal-header">
                <h2>Disclaimer</h2>
                <p class="last-updated">Last Updated: December 2024</p>
            </div>
            
            <div class="modal-body">
                <section>
                    <h3>Important Notice</h3>
                    <p>This tool is designed to assist with professional networking but comes with important considerations:</p>
                </section>

                <section>
                    <h3>Terms of Service</h3>
                    <p>Users should be aware that automated actions may violate LinkedIn's Terms of Service. Use this extension responsibly and at your own discretion.</p>
                </section>

                <section>
                    <h3>Usage Guidelines</h3>
                    <p>- Use the tool sparingly and ethically
                       - Respect daily connection limits
                       - Avoid spam-like behavior
                       - Consider personalizing connection requests</p>
                </section>

                <section>
                    <h3>Liability</h3>
                    <p>The developers are not responsible for any account restrictions or limitations that may result from using this tool.</p>
                </section>
            </div>
        `);
    });

    closeModal.addEventListener('click', function() {
        privacyModal.style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        if (event.target == privacyModal) {
            privacyModal.style.display = 'none';
        }
    });
});