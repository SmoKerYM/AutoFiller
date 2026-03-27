// AutoFiller Content Script — Message Listener
// Detection (Step 5), Text filling (Step 6), Dropdowns (Step 7),
// Orchestration (Step 8), Adapter routing (Step 9)

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.action === 'autofill') {
        // Safari doesn't reliably return async responses via sendResponse or
        // returned Promises. Instead, send results back via runtime.sendMessage.
        handleAutofill(message.data).then(result => {
            browser.runtime.sendMessage({ action: 'autofillResults', results: result });
        });
        return Promise.resolve({ status: 'started' });
    }
});

async function handleAutofill(profile) {
    console.log('[AutoFiller] Starting autofill...', Object.keys(profile));

    // Select the right adapter for this platform
    const adapter = getAdapter();
    console.log(`[AutoFiller] Using adapter: ${adapter.name}`);

    // Delegate to the adapter — each returns { filled, skipped, notFound }
    const result = await adapter.fill(profile);

    console.log('[AutoFiller] Results:', result);
    return result;
}

console.log('[AutoFiller] Content script loaded.');
