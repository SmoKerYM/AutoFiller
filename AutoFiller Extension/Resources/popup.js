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

// Listen for results from content script
browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'autofillResults') {
        console.log('[AutoFiller] Received results:', message.results);
        displayResults(message.results);
    }
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
        await browser.tabs.sendMessage(tabs[0].id, {
            action: 'autofill',
            data: profile
        });
        // Results will arrive via browser.runtime.onMessage listener above
    } catch (err) {
        console.error('[AutoFiller] Error sending message:', err);
        statusDiv.textContent = 'Could not reach page. Try reloading.';
        autofillBtn.disabled = false;
    }
});

function formatFieldName(field) {
    return field
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

function displayResults(results) {
    statusDiv.hidden = true;
    resultsDiv.hidden = false;
    autofillBtn.disabled = false;

    const filledCount = results.filled ? results.filled.length : 0;
    const skippedCount = results.skipped ? results.skipped.length : 0;
    const notFoundCount = results.notFound ? results.notFound.length : 0;
    const totalDetected = filledCount + skippedCount;

    // No fields detected at all
    if (totalDetected === 0 && notFoundCount === 0) {
        resultsDiv.innerHTML = '<p class="no-fields">No form fields detected on this page.</p>';
        return;
    }

    // Summary line
    const summaryDiv = document.getElementById('results-summary');
    if (summaryDiv) {
        summaryDiv.textContent = `${filledCount} filled, ${skippedCount} skipped, ${notFoundCount} not on page`;
        summaryDiv.hidden = false;
    }

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

    // Filled — green checkmarks
    if (filledCount > 0) {
        filledSection.hidden = false;
        results.filled.forEach(item => {
            const li = document.createElement('li');
            li.className = 'result-item filled-item';
            li.textContent = formatFieldName(item.field || item);
            filledList.appendChild(li);
        });
    } else {
        filledSection.hidden = true;
    }

    // Skipped — yellow warnings
    if (skippedCount > 0) {
        skippedSection.hidden = false;
        results.skipped.forEach(item => {
            const li = document.createElement('li');
            li.className = 'result-item skipped-item';
            const name = document.createElement('span');
            name.textContent = formatFieldName(item.field || item);
            li.appendChild(name);
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

    // Not found — grey
    if (notFoundCount > 0) {
        notFoundSection.hidden = false;
        results.notFound.forEach(item => {
            const li = document.createElement('li');
            li.className = 'result-item not-found-item';
            li.textContent = formatFieldName(item.field || item);
            notFoundList.appendChild(li);
        });
    } else {
        notFoundSection.hidden = true;
    }
}
