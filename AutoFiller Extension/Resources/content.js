// AutoFiller Content Script — Message Listener
// Detection implemented in Step 5; filling will be added in Steps 6-8

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autofill') {
        console.log('[AutoFiller] Received autofill message with profile data:', Object.keys(message.data));

        const profile = message.data;
        const result = { filled: [], skipped: [], notFound: [] };

        // Step 5: Detect fields on the page
        const fieldMap = detectAllFields();
        console.log(`[AutoFiller] Detected ${fieldMap.size} fields`);

        // Track which profile fields were detected
        const detectedFields = new Set();
        for (const [element, detection] of fieldMap) {
            detectedFields.add(detection.fieldType);
            // For now, report detected fields as skipped (filling comes in Step 6+)
            result.skipped.push({
                field: detection.fieldType,
                reason: 'Filling not yet implemented'
            });
        }

        // Report profile fields not found on the page
        const profileFields = Object.keys(profile).filter(k => profile[k] && k !== 'customFields');
        for (const field of profileFields) {
            if (!detectedFields.has(field)) {
                result.notFound.push({ field });
            }
        }

        console.log('[AutoFiller] Results:', result);
        sendResponse(result);
    }
});

console.log('[AutoFiller] Content script loaded.');
