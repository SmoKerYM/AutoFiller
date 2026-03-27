// adapters/lever.js — Lever ATS adapter (Step 9)
// Lever has relatively standard forms but uses non-semantic field names for
// custom questions (e.g. cards[abc123][field0]). This adapter scans by label
// text to reliably detect fields.

const leverAdapter = {
    name: 'lever',

    /**
     * Detect if current page is a Lever application.
     */
    detect() {
        return window.location.hostname.includes('jobs.lever.co');
    },

    /**
     * Fill a Lever application form.
     * Strategy:
     *   1. Fill known Lever standard fields by selector
     *   2. Scan all question blocks by label text → match to field patterns
     *   3. Fill text/textarea fields with profile values
     *   4. Fill dropdowns (native + custom) with profile values or answer patterns
     *
     * @param {Object} profile
     * @returns {Promise<{ filled: Array, skipped: Array, notFound: Array }>}
     */
    async fill(profile) {
        const result = { filled: [], skipped: [], notFound: [] };
        const handledElements = new Set();

        // 1. Fill known Lever standard fields
        const knownResults = this._fillKnownFields(profile);
        result.filled.push(...knownResults.filled);
        for (const el of knownResults.handledElements) handledElements.add(el);

        // 2. Scan question blocks by label text
        const questionResults = await this._fillQuestionBlocks(profile, handledElements);
        result.filled.push(...questionResults.filled);
        result.skipped.push(...questionResults.skipped);

        // 3. Fallback: run generic detection for anything missed
        const fieldMap = detectAllFields();
        const alreadyHandled = new Set([
            ...result.filled.map(r => r.field),
            ...result.skipped.map(r => r.field),
        ]);
        for (const [element, detection] of fieldMap) {
            if (handledElements.has(element) || alreadyHandled.has(detection.fieldType)) {
                fieldMap.delete(element);
            }
        }
        if (fieldMap.size > 0) {
            console.log(`[AutoFiller][lever] Fallback: ${fieldMap.size} fields from generic detection`);
            const fallbackText = fillDetectedFields(fieldMap, profile);
            result.filled.push(...fallbackText.filled);
            result.skipped.push(...fallbackText.skipped);
            const fallbackDropdowns = await fillDropdowns(fieldMap, profile);
            result.filled.push(...fallbackDropdowns.filled);
            result.skipped.push(...fallbackDropdowns.skipped);
        }

        // 4. Skip file uploads
        const fileInputs = document.querySelectorAll('input[type="file"]');
        for (const fileInput of fileInputs) {
            const label = fileInput.closest('.application-question, .application-field')
                ?.querySelector('label, .application-label')?.textContent?.trim();
            result.skipped.push({
                field: label || 'fileUpload',
                reason: 'File upload — manual action required',
            });
        }

        // 5. Report not-found
        const foundFields = new Set(
            [...result.filled, ...result.skipped].map(r => r.field)
        );
        if (foundFields.has('fullName')) {
            foundFields.add('firstName');
            foundFields.add('lastName');
        }
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
     * Fill known Lever standard fields by selector.
     */
    _fillKnownFields(profile) {
        const filled = [];
        const handledElements = new Set();

        // Lever standard fields — try multiple selector strategies
        const KNOWN_FIELDS = [
            { fieldType: 'fullName', selectors: ['input[name="name"]', '#name', 'input[autocomplete="name"]'] },
            { fieldType: 'email',    selectors: ['input[name="email"]', '#email', 'input[type="email"]'] },
            { fieldType: 'phone',    selectors: ['input[name="phone"]', '#phone', 'input[type="tel"]'] },
            { fieldType: 'linkedinUrl', selectors: ['input[name="urls[LinkedIn]"]', 'input[name="linkedin"]', 'input[name*="linkedin" i]'] },
        ];

        for (const { fieldType, selectors } of KNOWN_FIELDS) {
            let value;
            if (fieldType === 'fullName') {
                value = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
            } else {
                value = profile[fieldType];
            }
            if (!value) continue;

            let element = null;
            for (const sel of selectors) {
                try { element = document.querySelector(sel); } catch (e) { /* invalid selector */ }
                if (element) break;
            }
            if (!element) continue;
            if (element.value && element.value.trim()) continue; // already filled

            try {
                fillTextInput(element, value);
                filled.push({ field: fieldType, element: describeElement(element) });
                handledElements.add(element);
                console.log(`[AutoFiller][lever] Known: ${fieldType} → "${value}"`);
            } catch (err) {
                console.warn(`[AutoFiller][lever] Failed known field ${fieldType}:`, err);
            }
        }

        return { filled, handledElements };
    },

    /**
     * Scan all question blocks on the page, match labels to field patterns,
     * and fill the corresponding inputs/textareas/dropdowns.
     */
    async _fillQuestionBlocks(profile, handledElements) {
        const filled = [];
        const skipped = [];

        // Find all question containers — Lever wraps each in a div
        const questionBlocks = document.querySelectorAll(
            '.application-question, .application-field, ' +
            '.posting-question, [class*="question"], ' +
            '.application-form > div, .application-additional > div'
        );

        for (const block of questionBlocks) {
            // Get label text from the block
            const labelEl = block.querySelector('label, .application-label, legend, h3, h4');
            if (!labelEl) continue;
            const labelText = labelEl.textContent.trim();
            if (!labelText || labelText.length < 3) continue;

            // Match label against field patterns
            const fieldType = this._matchLabelToField(labelText);
            if (!fieldType) continue;

            // Find the input element(s) in this block
            const input = block.querySelector('input:not([type="hidden"]):not([type="file"]), textarea');
            const select = block.querySelector('select');
            // Skip already-handled elements
            if (input && handledElements.has(input)) continue;
            if (select && handledElements.has(select)) continue;

            // Determine if this is a question-answer field (hardcoded) or profile field
            const questionAnswer = this._getQuestionAnswer(fieldType);

            if (questionAnswer) {
                // Question-answer: fill dropdown or text with hardcoded answer
                if (select) {
                    const result = this._fillSelectByPatterns(select, questionAnswer.answerPatterns, questionAnswer.fallback);
                    if (result.success) {
                        filled.push({ field: fieldType, element: describeElement(select), matchedOption: result.matchedOption });
                        handledElements.add(select);
                        console.log(`[AutoFiller][lever] Question: ${fieldType} → "${result.matchedOption}"`);
                    } else {
                        skipped.push({ field: fieldType, reason: 'No matching answer option' });
                    }
                } else if (input) {
                    // Some question fields are text inputs (e.g., free-form yes/no)
                    try {
                        fillTextInput(input, questionAnswer.fallback);
                        filled.push({ field: fieldType, element: describeElement(input) });
                        handledElements.add(input);
                        console.log(`[AutoFiller][lever] Question (text): ${fieldType} → "${questionAnswer.fallback}"`);
                    } catch (err) {
                        skipped.push({ field: fieldType, reason: `Error: ${err.message}` });
                    }
                }
                continue;
            }

            // Profile-based field
            let value;
            if (fieldType === 'fullName') {
                value = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
            } else {
                value = profile[fieldType];
            }

            if (!value) {
                skipped.push({ field: fieldType, reason: 'No value in profile' });
                continue;
            }

            if (select) {
                // Native dropdown — use fuzzy matching
                const aliases = this._getAliases(fieldType);
                const result = fillNativeSelect(select, value, aliases);
                if (result.success) {
                    filled.push({ field: fieldType, element: describeElement(select), matchedOption: result.matchedOption });
                    handledElements.add(select);
                    console.log(`[AutoFiller][lever] Dropdown: ${fieldType} → "${result.matchedOption}"`);
                } else {
                    skipped.push({ field: fieldType, reason: `No matching option for "${value}"` });
                }
            } else if (input) {
                // Text input or textarea
                if (input.value && input.value.trim()) continue; // already filled
                try {
                    fillTextInput(input, value);
                    filled.push({ field: fieldType, element: describeElement(input) });
                    handledElements.add(input);
                    console.log(`[AutoFiller][lever] Text: ${fieldType} → "${value}"`);
                } catch (err) {
                    skipped.push({ field: fieldType, reason: `Error: ${err.message}` });
                }
            }
        }

        return { filled, skipped };
    },

    /**
     * Match a label string against FIELD_PATTERNS.
     * Returns the fieldType string or null.
     *
     * When multiple patterns match (e.g., "country" and "workAuth" both match
     * "Are you authorised to work in the country..."), question-answer patterns
     * are preferred over profile-field patterns since question labels are full
     * sentences that often contain profile-field keywords incidentally.
     */
    _matchLabelToField(labelText) {
        const QUESTION_TYPES = new Set([
            'workAuth', 'sponsorship', 'workedBefore', 'relatedToEmployee',
            'veteranStatus', 'disabilityStatus', 'privacyAck', 'transgender',
        ]);

        let profileMatch = null;
        for (const [fieldType, pattern] of Object.entries(FIELD_PATTERNS)) {
            if (pattern.test(labelText)) {
                // Question patterns get immediate priority
                if (QUESTION_TYPES.has(fieldType)) {
                    return fieldType;
                }
                // Remember first profile-field match as fallback
                if (!profileMatch) {
                    profileMatch = fieldType;
                }
            }
        }
        return profileMatch;
    },

    /**
     * Get question-answer config for a field type, if it's a hardcoded question.
     */
    _getQuestionAnswer(fieldType) {
        const QUESTION_ANSWERS_LOCAL = {
            workAuth: {
                answerPatterns: [/^yes$/i, /^yes[,.\s]/i, /\byes\b/i],
                fallback: 'Yes',
            },
            sponsorship: {
                answerPatterns: [/^no$/i, /^no[,.\s]/i, /\bno\b/i],
                fallback: 'No',
            },
            workedBefore: {
                answerPatterns: [/^no$/i, /^no[,.\s]/i, /\bno\b/i],
                fallback: 'No',
            },
            relatedToEmployee: {
                answerPatterns: [/^no$/i, /^no[,.\s]/i, /\bno\b/i],
                fallback: 'No',
            },
            veteranStatus: {
                answerPatterns: [/not\s+a\s+protected\s+veteran/i, /^no$/i, /\bno\b/i],
                fallback: 'I am not a protected veteran',
            },
            disabilityStatus: {
                answerPatterns: [/no.*disability/i, /^no$/i, /\bno\b/i],
                fallback: 'No',
            },
            privacyAck: {
                answerPatterns: [/^yes$/i, /\byes\b/i, /\backnowledge/i],
                fallback: 'Yes',
            },
            transgender: {
                answerPatterns: [/^no$/i, /\bno\b/i],
                fallback: 'No',
            },
        };
        return QUESTION_ANSWERS_LOCAL[fieldType] || null;
    },

    /**
     * Get alias map for a profile field type.
     */
    _getAliases(fieldType) {
        const map = {
            country:      typeof COUNTRY_ALIASES !== 'undefined' ? COUNTRY_ALIASES : null,
            city:         typeof CITY_ALIASES    !== 'undefined' ? CITY_ALIASES    : null,
            howDidYouHear: typeof REFERRAL_ALIASES !== 'undefined' ? REFERRAL_ALIASES : null,
            gender:       typeof GENDER_ALIASES  !== 'undefined' ? GENDER_ALIASES  : null,
            ethnicGroup:  typeof ETHNICITY_ALIASES !== 'undefined' ? ETHNICITY_ALIASES : null,
        };
        return map[fieldType] || null;
    },

    /**
     * Fill a native <select> using answer pattern matching.
     */
    _fillSelectByPatterns(selectElement, answerPatterns, fallback) {
        const options = Array.from(selectElement.options).filter(o => o.value !== '' && !o.disabled);

        for (const pattern of answerPatterns) {
            for (const option of options) {
                if (pattern.test(option.textContent.trim())) {
                    selectElement.value = option.value;
                    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, matchedOption: option.textContent.trim() };
                }
            }
        }

        // Fallback
        for (const option of options) {
            if (option.textContent.trim().toLowerCase() === (fallback || '').toLowerCase()) {
                selectElement.value = option.value;
                selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, matchedOption: option.textContent.trim() };
            }
        }

        return { success: false, matchedOption: null };
    },
};
