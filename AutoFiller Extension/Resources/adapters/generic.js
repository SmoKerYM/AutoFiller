// adapters/generic.js — Default fallback adapter (Step 9)
// Uses the generic detect + fill pipeline for unknown sites.

const genericAdapter = {
    name: 'generic',

    /**
     * Detect if this adapter should handle the current page.
     * Generic always returns false — it's the fallback.
     */
    detect() {
        return false;
    },

    /**
     * Fill all detected fields on the page using the generic pipeline.
     * @param {Object} profile - User profile data
     * @returns {Promise<{ filled: Array, skipped: Array, notFound: Array }>}
     */
    async fill(profile) {
        const result = { filled: [], skipped: [], notFound: [] };

        // 1. Detect fields on the page
        const fieldMap = detectAllFields();
        console.log(`[AutoFiller][generic] Detected ${fieldMap.size} fields`);

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
        const QUESTION_FIELDS = new Set([
            'workAuth', 'sponsorship', 'workedBefore', 'relatedToEmployee',
            'veteranStatus', 'disabilityStatus', 'privacyAck', 'transgender',
        ]);
        const profileFields = Object.keys(profile).filter(
            k => profile[k] && k !== 'customFields' && !QUESTION_FIELDS.has(k)
        );
        // If fullName was filled, don't report firstName/lastName as missing
        if (foundFields.has('fullName')) {
            foundFields.add('firstName');
            foundFields.add('lastName');
        }
        for (const field of profileFields) {
            if (!foundFields.has(field)) {
                result.notFound.push({ field });
            }
        }

        return result;
    },
};
