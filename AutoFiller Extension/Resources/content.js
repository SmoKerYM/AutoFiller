// AutoFiller Content Script — Message Listener
// Detection (Step 5), Text filling (Step 6), Dropdowns (Step 7), Orchestration (Step 8)

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autofill') {
        handleAutofill(message.data).then(sendResponse);
        return true; // Keep message channel open for async response
    }
});

async function handleAutofill(profile) {
    console.log('[AutoFiller] Starting autofill...', Object.keys(profile));
    const result = { filled: [], skipped: [], notFound: [] };

    // 1. Detect fields on the page
    const fieldMap = detectAllFields();
    console.log(`[AutoFiller] Detected ${fieldMap.size} fields`);

    // 2. Fill text inputs
    const textResults = fillDetectedFields(fieldMap, profile);
    result.filled.push(...textResults.filled);
    result.skipped.push(...textResults.skipped);

    // 3. Fill dropdowns (native <select> and custom)
    const dropdownResults = await fillDropdowns(fieldMap, profile);
    result.filled.push(...dropdownResults.filled);
    result.skipped.push(...dropdownResults.skipped);

    // 4. Report profile fields not found on the page
    const foundFields = new Set(
        [...result.filled, ...result.skipped].map(r => r.field)
    );
    const QUESTION_FIELDS = new Set(['workAuth', 'sponsorship', 'workedBefore', 'veteranStatus', 'disabilityStatus', 'privacyAck', 'transgender']);
    const profileFields = Object.keys(profile).filter(k => profile[k] && k !== 'customFields' && !QUESTION_FIELDS.has(k));
    for (const field of profileFields) {
        if (!foundFields.has(field)) {
            result.notFound.push({ field });
        }
    }

    console.log('[AutoFiller] Results:', result);
    return result;
}

console.log('[AutoFiller] Content script loaded.');
