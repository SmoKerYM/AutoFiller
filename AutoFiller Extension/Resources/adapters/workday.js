// adapters/workday.js — Workday ATS adapter (Step 9)
// Targets data-automation-id attributes and handles Workday's custom dropdowns.

const workdayAdapter = {
    name: 'workday',

    /**
     * Detect if current page is a Workday application.
     */
    detect() {
        return window.location.hostname.includes('myworkdayjobs.com');
    },

    /**
     * Fill a Workday application form.
     * Workday uses:
     * - data-automation-id attributes for field identification
     * - Custom dropdown components (click → type → select from filtered list)
     * - Multi-page forms with "Next" buttons
     *
     * @param {Object} profile
     * @returns {Promise<{ filled: Array, skipped: Array, notFound: Array }>}
     */
    async fill(profile) {
        const result = { filled: [], skipped: [], notFound: [] };

        // 1. Fill text fields using data-automation-id
        const textResults = this._fillTextFields(profile);
        result.filled.push(...textResults.filled);
        result.skipped.push(...textResults.skipped);

        // 2. Fill Workday custom dropdowns
        const dropdownResults = await this._fillWorkdayDropdowns(profile);
        result.filled.push(...dropdownResults.filled);
        result.skipped.push(...dropdownResults.skipped);

        // 3. Fill question-answer dropdowns (work auth, sponsorship, etc.)
        const questionResults = await this._fillQuestionDropdowns(profile);
        result.filled.push(...questionResults.filled);
        result.skipped.push(...questionResults.skipped);

        // 4. Fallback: run generic detection for anything we missed
        const fieldMap = detectAllFields();
        const alreadyFilled = new Set(result.filled.map(r => r.field));
        const alreadySkipped = new Set(result.skipped.map(r => r.field));
        // Remove already-handled fields from the map
        for (const [element, detection] of fieldMap) {
            if (alreadyFilled.has(detection.fieldType) || alreadySkipped.has(detection.fieldType)) {
                fieldMap.delete(element);
            }
        }
        if (fieldMap.size > 0) {
            console.log(`[AutoFiller][workday] Fallback: ${fieldMap.size} fields from generic detection`);
            const fallbackText = fillDetectedFields(fieldMap, profile);
            result.filled.push(...fallbackText.filled);
            result.skipped.push(...fallbackText.skipped);
            const fallbackDropdowns = await fillDropdowns(fieldMap, profile);
            result.filled.push(...fallbackDropdowns.filled);
            result.skipped.push(...fallbackDropdowns.skipped);
        }

        // 5. Detect multi-page form
        const nextButton = document.querySelector(
            '[data-automation-id="bottom-navigation-next-button"], ' +
            '[data-automation-id="nextButton"], ' +
            'button[data-automation-id*="next"]'
        );
        if (nextButton) {
            result.skipped.push({
                field: '_multiPage',
                reason: 'Multi-page form detected — click "Next" and run autofill again',
            });
            console.log('[AutoFiller][workday] Multi-page form detected. Next button found but not auto-clicked.');
        }

        // 6. Report not-found
        const foundFields = new Set(
            [...result.filled, ...result.skipped].map(r => r.field)
        );
        const QUESTION_FIELDS = new Set([
            'workAuth', 'sponsorship', 'workedBefore', 'relatedToEmployee',
            'veteranStatus', 'disabilityStatus', 'privacyAck', 'transgender',
        ]);
        if (foundFields.has('fullName')) {
            foundFields.add('firstName');
            foundFields.add('lastName');
        }
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
     * Known Workday data-automation-id → profile field mappings for text inputs.
     */
    _TEXT_FIELD_MAP: {
        'legalNameSection_firstName':  'firstName',
        'legalNameSection_lastName':   'lastName',
        'name-given':                  'firstName',
        'name-family':                 'lastName',
        'email':                       'email',
        'phone-number':                'phone',
        'phone-device-type':           null, // skip
        'addressSection_addressLine1': 'addressLine1',
        'addressSection_city':         'city',
        'addressSection_postalCode':   'postalCode',
        'linkedinQuestion':            'linkedinUrl',
        'linkedin':                    'linkedinUrl',
    },

    /**
     * Fill text inputs using data-automation-id selectors.
     */
    _fillTextFields(profile) {
        const filled = [];
        const skipped = [];

        for (const [automationId, fieldType] of Object.entries(this._TEXT_FIELD_MAP)) {
            if (!fieldType) continue;
            const value = profile[fieldType];
            if (!value) continue;

            const element = document.querySelector(`[data-automation-id="${automationId}"]`);
            if (!element) continue;

            // Only fill input/textarea elements
            const input = element.matches('input, textarea')
                ? element
                : element.querySelector('input, textarea');
            if (!input) continue;

            // Skip if already filled
            if (input.value && input.value.trim()) continue;

            try {
                fillTextInput(input, value);
                filled.push({ field: fieldType, element: describeElement(input) });
                console.log(`[AutoFiller][workday] Text: ${fieldType} → "${value}" via [data-automation-id="${automationId}"]`);
            } catch (err) {
                skipped.push({ field: fieldType, reason: `Error: ${err.message}` });
            }
        }

        return { filled, skipped };
    },

    /**
     * Known Workday dropdown automation IDs → profile field mappings.
     */
    _DROPDOWN_FIELD_MAP: {
        'countryDropdown':             'country',
        'addressSection_countryRegion':'country',
        'location':                    'city',
        'phone-device-type':           null, // handled separately if needed
    },

    /**
     * Fill Workday custom dropdowns.
     * Workday dropdowns: click to open → type to search → select from filtered list.
     */
    async _fillWorkdayDropdowns(profile) {
        const filled = [];
        const skipped = [];

        for (const [automationId, fieldType] of Object.entries(this._DROPDOWN_FIELD_MAP)) {
            if (!fieldType) continue;
            const value = profile[fieldType];
            if (!value) continue;

            const container = document.querySelector(`[data-automation-id="${automationId}"]`);
            if (!container) continue;

            try {
                const result = await this._fillWorkdayDropdown(container, value, fieldType);
                if (result.success) {
                    filled.push({ field: fieldType, element: `[data-automation-id="${automationId}"]`, matchedOption: result.matchedOption });
                    console.log(`[AutoFiller][workday] Dropdown: ${fieldType} → "${result.matchedOption}"`);
                } else {
                    skipped.push({ field: fieldType, reason: `No matching option for "${value}"` });
                }
            } catch (err) {
                skipped.push({ field: fieldType, reason: `Dropdown error: ${err.message}` });
            }
        }

        return { filled, skipped };
    },

    /**
     * Fill a single Workday custom dropdown.
     * Steps: click trigger → type search term → wait for options → click match.
     */
    async _fillWorkdayDropdown(container, targetText, fieldType) {
        // Find the clickable trigger (button or the container itself)
        const trigger = container.querySelector('button, [role="combobox"], [aria-haspopup]') || container;

        // Click to open
        trigger.click();
        trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        // Find or wait for input to type into
        let searchInput = container.querySelector('input[type="text"], input:not([type])');
        if (!searchInput) {
            // Sometimes the input appears after clicking
            await this._waitForElement(container, 'input', 300);
            searchInput = container.querySelector('input[type="text"], input:not([type])');
        }

        // Type search term (use first word to avoid over-filtering)
        if (searchInput) {
            const searchTerm = targetText.split(/\s*[-–—,]\s*/)[0].trim();
            searchInput.focus();
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) {
                setter.call(searchInput, searchTerm);
            } else {
                searchInput.value = searchTerm;
            }
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Wait for filtered options
        await this._waitForDropdownOptions(800);

        // Get alias map for this field type
        const aliases = {
            country: typeof COUNTRY_ALIASES !== 'undefined' ? COUNTRY_ALIASES : null,
            city:    typeof CITY_ALIASES    !== 'undefined' ? CITY_ALIASES    : null,
        }[fieldType] || null;

        // Search for matching option
        const optionSelectors = [
            '[role="option"]',
            '[data-automation-id*="promptOption"]',
            '[data-automation-id*="selectWidget"] li',
            '[role="listbox"] li',
            '[data-value]',
        ];

        for (const selector of optionSelectors) {
            const options = document.querySelectorAll(selector);
            for (const option of options) {
                if (option.offsetParent === null && getComputedStyle(option).display === 'none') continue;
                if (fuzzyMatch(option.textContent, targetText, aliases)) {
                    option.click();
                    return { success: true, matchedOption: option.textContent.trim() };
                }
            }
        }

        // Close dropdown
        if (searchInput) {
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } else {
            trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
        return { success: false, matchedOption: null };
    },

    /**
     * Fill question-answer dropdowns on Workday (work auth, sponsorship, etc.).
     * Workday renders these as custom dropdown components with question labels.
     */
    async _fillQuestionDropdowns(profile) {
        const filled = [];
        const skipped = [];

        // Workday question patterns → answer config
        const WORKDAY_QUESTIONS = {
            workAuth: {
                labelPattern: /legally\s+authorized.*work|authorized\s+to\s+work|right\s+to\s+work|eligible\s+to\s+work/i,
                answerPatterns: [/^yes$/i, /^yes[,.\s]/i, /\byes\b/i],
                fallback: 'Yes',
            },
            sponsorship: {
                labelPattern: /require.*sponsor|need.*sponsor|sponsor.*require|visa\s+sponsor|will\s+you.*sponsor/i,
                answerPatterns: [/^no$/i, /^no[,.\s]/i, /\bno\b/i],
                fallback: 'No',
            },
            gender: {
                labelPattern: /(?<!trans)gender|how\s+do\s+you\s+identify/i,
                useProfileValue: true,
                fieldType: 'gender',
            },
            ethnicGroup: {
                labelPattern: /ethnic|race|ethnicity/i,
                useProfileValue: true,
                fieldType: 'ethnicGroup',
            },
            veteranStatus: {
                labelPattern: /veteran|protected\s+veteran/i,
                answerPatterns: [
                    /not\s+a\s+protected\s+veteran/i,
                    /i\s+am\s+not/i,
                    /not\s+a\s+veteran/i,
                    /no[,.\s]|^no$/i,
                ],
                fallback: 'I am not a protected veteran',
            },
            disabilityStatus: {
                labelPattern: /disability|disabled/i,
                answerPatterns: [
                    /no.*(?:disability|disabled)/i,
                    /don'?t\s+have\s+a\s+disability/i,
                    /do\s+not\s+have\s+a\s+disability/i,
                    /no[,.\s]|^no$/i,
                ],
                fallback: 'No',
            },
        };

        // Find all dropdown-like containers on the page
        const dropdownContainers = document.querySelectorAll(
            '[data-automation-id*="formField"], ' +
            '[data-automation-id*="questionField"], ' +
            '[data-automation-id*="eeoc"], ' +
            '[data-automation-id*="dropdown"]'
        );

        // Also search for generic question containers by structure:
        // Workday typically wraps questions in a div with a label and a dropdown button
        const allContainers = new Set(dropdownContainers);

        // Search for any element that has a dropdown trigger (button with aria-haspopup)
        // and walk up to find the question container
        const dropdownTriggers = document.querySelectorAll(
            'button[aria-haspopup="listbox"], ' +
            '[role="combobox"], ' +
            '[aria-haspopup="listbox"]'
        );

        for (const trigger of dropdownTriggers) {
            // Walk up to find the question container (up to 5 levels)
            let container = trigger.parentElement;
            for (let i = 0; i < 5 && container; i++) {
                // Check if this container has label text
                const labelEl = container.querySelector('label, legend, [data-automation-id*="label"], h3, h4, p');
                if (labelEl && labelEl.textContent.trim().length > 10) {
                    allContainers.add(container);
                    break;
                }
                container = container.parentElement;
            }
        }

        // For each question, find the matching container and fill it
        for (const [questionType, config] of Object.entries(WORKDAY_QUESTIONS)) {
            let matched = false;

            for (const container of allContainers) {
                const containerText = container.textContent || '';
                if (!config.labelPattern.test(containerText)) continue;

                // Found matching question — now find and fill the dropdown
                const trigger = container.querySelector(
                    'button[aria-haspopup="listbox"], ' +
                    'button[aria-haspopup="true"], ' +
                    '[role="combobox"], ' +
                    '[aria-haspopup="listbox"]'
                );
                if (!trigger) continue;

                // Check if already answered (dropdown shows a selected value)
                const selectedText = trigger.textContent.trim().toLowerCase();
                if (selectedText && selectedText !== 'select' && selectedText !== 'select...' &&
                    selectedText !== 'select one' && selectedText !== '--select--' &&
                    selectedText !== 'choose one' && selectedText !== 'please select') {
                    console.log(`[AutoFiller][workday] Question already answered: ${questionType} = "${trigger.textContent.trim()}"`);
                    continue;
                }

                let result;
                if (config.useProfileValue) {
                    // Use profile value with fuzzy matching (gender, ethnicity)
                    const value = profile[config.fieldType];
                    if (!value) {
                        skipped.push({ field: questionType, reason: 'No value in profile' });
                        matched = true;
                        continue;
                    }
                    const aliases = {
                        gender:      typeof GENDER_ALIASES    !== 'undefined' ? GENDER_ALIASES    : null,
                        ethnicGroup: typeof ETHNICITY_ALIASES !== 'undefined' ? ETHNICITY_ALIASES : null,
                    }[config.fieldType] || null;
                    result = await this._fillWorkdayQuestionDropdown(trigger, config.fieldType, null, null, value, aliases);
                } else {
                    // Use answer patterns
                    result = await this._fillWorkdayQuestionDropdown(trigger, questionType, config.answerPatterns, config.fallback, null, null);
                }

                if (result.success) {
                    filled.push({ field: questionType, element: describeElement(trigger), matchedOption: result.matchedOption });
                    console.log(`[AutoFiller][workday] Question: ${questionType} → "${result.matchedOption}"`);
                } else {
                    skipped.push({ field: questionType, reason: 'No matching answer option' });
                    console.log(`[AutoFiller][workday] Question skipped: ${questionType} — no match`);
                }
                matched = true;
                break; // Only fill first matching container per question
            }

            if (!matched) {
                // Question not found on page — that's fine, not all pages have all questions
                console.log(`[AutoFiller][workday] Question not on page: ${questionType}`);
            }
        }

        return { filled, skipped };
    },

    /**
     * Fill a Workday question dropdown.
     * Opens the dropdown, searches options by pattern or fuzzy match, clicks the match.
     */
    async _fillWorkdayQuestionDropdown(trigger, fieldType, answerPatterns, fallback, profileValue, aliases) {
        // Click to open
        trigger.click();
        trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        await this._waitForDropdownOptions(600);

        // Collect all visible options
        const optionSelectors = [
            '[role="option"]',
            '[data-automation-id*="promptOption"]',
            '[role="listbox"] li',
            'ul[role="listbox"] li',
        ];

        const seen = new Set();
        const allOptions = [];
        for (const selector of optionSelectors) {
            for (const option of document.querySelectorAll(selector)) {
                if (seen.has(option)) continue;
                seen.add(option);
                if (option.offsetParent === null && getComputedStyle(option).display === 'none') continue;
                allOptions.push(option);
            }
        }

        // Try matching
        if (answerPatterns) {
            // Pattern-based matching (workAuth, sponsorship, etc.)
            for (const pattern of answerPatterns) {
                for (const option of allOptions) {
                    if (pattern.test(option.textContent.trim())) {
                        option.click();
                        return { success: true, matchedOption: option.textContent.trim() };
                    }
                }
            }
            // Fallback text match
            if (fallback) {
                for (const option of allOptions) {
                    if (normalizeText(option.textContent) === normalizeText(fallback)) {
                        option.click();
                        return { success: true, matchedOption: option.textContent.trim() };
                    }
                }
            }
        } else if (profileValue) {
            // Fuzzy matching (gender, ethnicity)
            for (const option of allOptions) {
                if (fuzzyMatch(option.textContent, profileValue, aliases)) {
                    option.click();
                    return { success: true, matchedOption: option.textContent.trim() };
                }
            }
        }

        // Close dropdown
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { success: false, matchedOption: null };
    },

    /**
     * Wait for dropdown options to appear.
     */
    _waitForDropdownOptions(timeout = 600) {
        return new Promise((resolve) => {
            let resolved = false;
            const observer = new MutationObserver(() => {
                if (!resolved) {
                    resolved = true;
                    observer.disconnect();
                    setTimeout(resolve, 50);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    observer.disconnect();
                    resolve();
                }
            }, timeout);
        });
    },

    /**
     * Wait for a specific element to appear inside a container.
     */
    _waitForElement(container, selector, timeout = 300) {
        return new Promise((resolve) => {
            const existing = container.querySelector(selector);
            if (existing) { resolve(existing); return; }

            let resolved = false;
            const observer = new MutationObserver(() => {
                const el = container.querySelector(selector);
                if (el && !resolved) {
                    resolved = true;
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(container, { childList: true, subtree: true });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    observer.disconnect();
                    resolve(null);
                }
            }, timeout);
        });
    },
};
