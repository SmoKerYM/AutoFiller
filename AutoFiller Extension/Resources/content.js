// AutoFiller Content Script — Message Listener
// Detection (Step 5), Text filling (Step 6), Dropdowns (Step 7), Orchestration (Step 8)

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autofill') {
        console.log('[AutoFiller] Received autofill message with profile data:', Object.keys(message.data));

        const profile = message.data;
        const result = { filled: [], skipped: [], notFound: [] };

        // 1. Detect fields on the page
        const fieldMap = detectAllFields();
        console.log(`[AutoFiller] Detected ${fieldMap.size} fields`);

        // 2. Fill text inputs (Step 6)
        const textResults = fillDetectedFields(fieldMap, profile);
        result.filled.push(...textResults.filled);
        result.skipped.push(...textResults.skipped);

        // 3. Fill dropdowns (Step 7 — not yet implemented, skipped fields reported above)

        // 4. Report profile fields not found on the page
        const foundFields = new Set(
            [...result.filled, ...result.skipped].map(r => r.field)
        );
        const profileFields = Object.keys(profile).filter(k => profile[k] && k !== 'customFields');
        for (const field of profileFields) {
            if (!foundFields.has(field)) {
                result.notFound.push({ field });
            }
        }

        console.log('[AutoFiller] Results:', result);
        sendResponse(result);
        return true;
    }
});

console.log('[AutoFiller] Content script loaded.');
