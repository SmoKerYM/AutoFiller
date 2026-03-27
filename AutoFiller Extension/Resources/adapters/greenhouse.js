// adapters/greenhouse.js — Greenhouse ATS adapter (Step 9)
// Handles Select2 dropdowns, known field selectors, and file upload skipping.

const greenhouseAdapter = {
    name: 'greenhouse',

    /**
     * Detect if current page is a Greenhouse application.
     */
    detect() {
        const host = window.location.hostname;
        return host.includes('greenhouse.io') || host.includes('boards.greenhouse.io');
    },

    /**
     * Fill a Greenhouse application form.
     * Uses generic pipeline but adds Greenhouse-specific enhancements:
     * - Known field ID selectors as high-confidence overrides
     * - Select2 dropdown handling
     * - File upload field skipping
     *
     * @param {Object} profile
     * @returns {Promise<{ filled: Array, skipped: Array, notFound: Array }>}
     */
    async fill(profile) {
        const result = { filled: [], skipped: [], notFound: [] };

        // 1. Try known Greenhouse field IDs first (highest confidence)
        const knownFields = this._fillKnownFields(profile);
        result.filled.push(...knownFields.filled);
        const prefilledIds = new Set(knownFields.filledIds);

        // 2. Detect remaining fields using generic detector
        const fieldMap = detectAllFields();

        // Remove elements already filled by known-field pass
        for (const [element] of fieldMap) {
            if (prefilledIds.has(element.id)) {
                fieldMap.delete(element);
            }
        }

        console.log(`[AutoFiller][greenhouse] Known: ${knownFields.filled.length}, Detected: ${fieldMap.size} remaining`);

        // 3. Fill text inputs
        const textResults = fillDetectedFields(fieldMap, profile);
        result.filled.push(...textResults.filled);
        result.skipped.push(...textResults.skipped);

        // 4. Fill dropdowns — including Select2
        const dropdownResults = await fillDropdowns(fieldMap, profile);
        result.filled.push(...dropdownResults.filled);
        result.skipped.push(...dropdownResults.skipped);

        // 5. Report file upload fields as skipped
        const fileInputs = document.querySelectorAll(
            '#application_form input[type="file"], #main_fields input[type="file"]'
        );
        for (const fileInput of fileInputs) {
            const label = this._getFieldLabel(fileInput);
            result.skipped.push({
                field: label || 'fileUpload',
                reason: 'File upload — manual action required',
            });
        }

        // 6. Report not-found fields
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
        for (const field of profileFields) {
            if (!foundFields.has(field)) {
                result.notFound.push({ field });
            }
        }

        return result;
    },

    /**
     * Fill fields using known Greenhouse element IDs.
     * These are high-confidence direct mappings.
     */
    _fillKnownFields(profile) {
        const filled = [];
        const filledIds = [];

        const KNOWN_SELECTORS = {
            firstName:    '#first_name',
            lastName:     '#last_name',
            email:        '#email',
            phone:        '#phone',
            addressLine1: '#address',
            city:         '#location',
            linkedinUrl:  '#job_application_answers_attributes_0_text_value',
        };

        for (const [fieldType, selector] of Object.entries(KNOWN_SELECTORS)) {
            const value = profile[fieldType];
            if (!value) continue;

            const element = document.querySelector(selector);
            if (!element) continue;

            try {
                fillTextInput(element, value);
                filled.push({ field: fieldType, element: describeElement(element) });
                filledIds.push(element.id);
                console.log(`[AutoFiller][greenhouse] Known field: ${fieldType} → "${value}" via ${selector}`);
            } catch (err) {
                console.warn(`[AutoFiller][greenhouse] Failed known field ${fieldType}:`, err);
            }
        }

        return { filled, filledIds };
    },

    /**
     * Get label text for a Greenhouse form field.
     */
    _getFieldLabel(element) {
        if (element.id) {
            const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            if (label) return label.textContent.trim();
        }
        const wrapper = element.closest('.field');
        if (wrapper) {
            const label = wrapper.querySelector('label');
            if (label) return label.textContent.trim();
        }
        return '';
    },
};
