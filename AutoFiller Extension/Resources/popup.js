const autofillBtn = document.getElementById('autofill-btn');
const noProfileDiv = document.getElementById('no-profile');
const mainContent = document.getElementById('main-content');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const settingsLink = document.getElementById('settings-link');
const setupLink = document.getElementById('setup-link');

// Open options page
function openOptions() {
    browser.runtime.openOptionsPage();
}

settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    openOptions();
});

setupLink.addEventListener('click', (e) => {
    e.preventDefault();
    openOptions();
});

// Autofill button click
autofillBtn.addEventListener('click', async () => {
    autofillBtn.disabled = true;
    statusDiv.hidden = false;
    statusDiv.textContent = 'Loading profile...';
    resultsDiv.hidden = true;

    // Load profile
    const { profile } = await browser.storage.local.get('profile');

    if (!profile) {
        mainContent.hidden = true;
        noProfileDiv.hidden = false;
        return;
    }

    statusDiv.textContent = 'Filling fields...';

    // Get active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
        statusDiv.textContent = 'No active tab found.';
        autofillBtn.disabled = false;
        return;
    }

    try {
        const response = await browser.tabs.sendMessage(tabs[0].id, {
            action: 'autofill',
            data: profile
        });

        console.log('[AutoFiller] Response from content script:', response);
        displayResults(response);
    } catch (err) {
        console.error('[AutoFiller] Error sending message:', err);
        statusDiv.textContent = 'Could not reach page. Try reloading.';
        autofillBtn.disabled = false;
    }
});

function displayResults(results) {
    statusDiv.hidden = true;
    resultsDiv.hidden = false;
    autofillBtn.disabled = false;

    const filledSection = document.getElementById('filled-section');
    const skippedSection = document.getElementById('skipped-section');
    const notFoundSection = document.getElementById('not-found-section');
    const filledList = document.getElementById('filled-list');
    const skippedList = document.getElementById('skipped-list');
    const notFoundList = document.getElementById('not-found-list');

    // Clear previous results
    filledList.innerHTML = '';
    skippedList.innerHTML = '';
    notFoundList.innerHTML = '';

    // Filled
    if (results.filled && results.filled.length > 0) {
        filledSection.hidden = false;
        results.filled.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.field || item;
            filledList.appendChild(li);
        });
    } else {
        filledSection.hidden = true;
    }

    // Skipped
    if (results.skipped && results.skipped.length > 0) {
        skippedSection.hidden = false;
        results.skipped.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.field || item;
            if (item.reason) {
                const reason = document.createElement('span');
                reason.className = 'reason';
                reason.textContent = ` — ${item.reason}`;
                li.appendChild(reason);
            }
            skippedList.appendChild(li);
        });
    } else {
        skippedSection.hidden = true;
    }

    // Not found
    if (results.notFound && results.notFound.length > 0) {
        notFoundSection.hidden = false;
        results.notFound.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.field || item;
            notFoundList.appendChild(li);
        });
    } else {
        notFoundSection.hidden = true;
    }
}
