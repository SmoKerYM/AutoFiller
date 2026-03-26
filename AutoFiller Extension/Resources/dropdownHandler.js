// dropdownHandler.js — Native + custom dropdown logic (Step 7)

/**
 * Country aliases for fuzzy matching in dropdowns.
 */
const COUNTRY_ALIASES = {
    'United Kingdom': ['united kingdom', 'uk', 'great britain', 'england', 'u.k.', 'gb'],
    'United States': ['united states', 'usa', 'us', 'u.s.a.', 'u.s.', 'america'],
    'Canada': ['canada', 'ca'],
    'Australia': ['australia', 'au'],
    'Germany': ['germany', 'deutschland', 'de'],
    'France': ['france', 'fr'],
    'India': ['india', 'in'],
    'China': ['china', 'cn'],
    'Japan': ['japan', 'jp'],
};

/**
 * Referral source aliases for "How did you hear about us?" dropdowns.
 */
const REFERRAL_ALIASES = {
    'LinkedIn': ['linkedin', 'linkedin job', 'linkedin job posting', 'linkedin jobs', 'job board', 'social media'],
    'Indeed': ['indeed', 'indeed.com'],
    'Glassdoor': ['glassdoor', 'glassdoor.com'],
    'Company Website': ['company website', 'career page', 'careers page', 'website'],
    'Employee Referral': ['referral', 'employee referral', 'friend', 'colleague'],
};

/**
 * Gender aliases for fuzzy matching.
 */
const GENDER_ALIASES = {
    'Male': ['male', 'man', 'm'],
    'Female': ['female', 'woman', 'f'],
    'Non-binary': ['non-binary', 'nonbinary', 'non binary', 'nb', 'genderqueer'],
    'Prefer not to say': ['prefer not to say', 'prefer not to disclose', 'decline to answer', 'decline'],
};

/**
 * Ethnic group aliases for fuzzy matching.
 */
const ETHNICITY_ALIASES = {
    'Asian - Chinese': ['asian - chinese', 'asian chinese', 'chinese', 'east asian'],
    'Asian - Indian': ['asian - indian', 'asian indian', 'indian', 'south asian'],
    'Asian - Other': ['asian - other', 'asian other', 'asian'],
    'Black / African': ['black', 'african', 'black / african', 'african american', 'black or african american'],
    'Hispanic / Latino': ['hispanic', 'latino', 'latina', 'latinx', 'hispanic / latino', 'hispanic or latino'],
    'White / Caucasian': ['white', 'caucasian', 'white / caucasian', 'european'],
    'Mixed / Multiple': ['mixed', 'multiple', 'two or more races', 'mixed / multiple', 'multiracial'],
    'Prefer not to say': ['prefer not to say', 'prefer not to disclose', 'decline to answer', 'decline'],
};

/**
 * City aliases for location dropdowns.
 * Greenhouse-style options often look like "London, England, United Kingdom".
 */
const CITY_ALIASES = {
    'London': ['london', 'london, england', 'london, uk', 'london, united kingdom', 'london, england, united kingdom'],
};

/**
 * Map profile field types to their alias maps.
 */
const FIELD_ALIAS_MAP = {
    country: COUNTRY_ALIASES,
    city: CITY_ALIASES,
    howDidYouHear: REFERRAL_ALIASES,
    gender: GENDER_ALIASES,
    ethnicGroup: ETHNICITY_ALIASES,
};

/**
 * Common application questions with fixed answers.
 * Each entry has:
 *   - answerPatterns: regexes to match the desired option text (tried in order, first match wins)
 *   - fallback: exact text to try if no regex matches
 */
const QUESTION_ANSWERS = {
    workAuth: {
        answerPatterns: [/^yes$/i, /^yes[,.\s]/i, /\byes\b/i],
        fallback: 'Yes',
    },
    sponsorship: {
        answerPatterns: [/^no$/i, /^no[,.\s]/i, /\bno\b/i],
        fallback: 'No',
    },
    workedBefore: {
        answerPatterns: [
            /i\s+have\s+not\s+worked/i,
            /have\s+not\s+(worked|been\s+employed)/i,
            /never\s+worked/i,
            /^no$/i, /^no[,.\s]/i, /\bno\b/i,
        ],
        fallback: 'No',
    },
    veteranStatus: {
        answerPatterns: [
            /not\s+a\s+protected\s+veteran/i,
            /i\s+am\s+not/i,
            /not\s+a\s+veteran/i,
            /no[,.\s]|^no$/i,
        ],
        fallback: 'I am not a protected veteran',
    },
    disabilityStatus: {
        answerPatterns: [
            /no.*(?:disability|disabled)/i,
            /don'?t\s+have\s+a\s+disability/i,
            /do\s+not\s+have\s+a\s+disability/i,
            /i\s+don'?t/i,
            /i\s+do\s+not/i,
            /no[,.\s]|^no$/i,
        ],
        fallback: 'No, I don\'t have a disability',
    },
    privacyAck: {
        answerPatterns: [/^yes$/i, /^yes[,.\s]/i, /\byes\b/i, /\backnowledge/i, /\baccept/i, /\bagree/i],
        fallback: 'Yes',
    },
    transgender: {
        answerPatterns: [/^no$/i, /^no[,.\s]/i, /\bno\b/i],
        fallback: 'No',
    },
};

/**
 * Parse an age range from option text. Handles formats like:
 *   "25-34", "25–34", "25 - 34", "25 to 34", "55+", "Under 18", "65 and over"
 * Returns { min, max } or null if no range found.
 */
function parseAgeRange(text) {
    const normalized = text.trim().toLowerCase();

    // "Under X" or "Below X"
    const underMatch = normalized.match(/(?:under|below|less than|younger than)\s*(\d+)/);
    if (underMatch) return { min: 0, max: parseInt(underMatch[1], 10) - 1 };

    // "X+" or "X and over" or "X or older" or "Over X"
    const overMatch = normalized.match(/(\d+)\s*\+/) ||
                      normalized.match(/(\d+)\s*(?:and over|or older|or more|and above)/) ||
                      normalized.match(/(?:over|above|older than)\s*(\d+)/);
    if (overMatch) return { min: parseInt(overMatch[1], 10), max: 199 };

    // "X-Y", "X–Y", "X — Y", "X to Y"
    const rangeMatch = normalized.match(/(\d+)\s*[-–—]\s*(\d+)/) ||
                       normalized.match(/(\d+)\s+to\s+(\d+)/);
    if (rangeMatch) return { min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) };

    return null;
}

/**
 * Find the <option> in a native <select> whose age range contains the given age.
 */
function fillAgeSelect(selectElement, age) {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum)) return { success: false, matchedOption: null };

    for (const option of selectElement.options) {
        if (option.value === '' || option.disabled) continue;
        const range = parseAgeRange(option.textContent);
        if (range && ageNum >= range.min && ageNum <= range.max) {
            selectElement.value = option.value;
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, matchedOption: option.textContent.trim() };
        }
    }

    return { success: false, matchedOption: null };
}

/**
 * Find a matching option in a custom dropdown whose age range contains the given age.
 */
async function fillAgeCustomDropdown(triggerElement, age) {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum)) return { success: false, matchedOption: null };

    // Open dropdown
    triggerElement.click();
    triggerElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    triggerElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await waitForDropdownOptions(500);

    const optionSelectors = [
        '[role="option"]', '[role="listbox"] li', '[data-value]',
        '.dropdown-option', '.select-option', '.option', 'ul[role="listbox"] li',
    ];

    for (const selector of optionSelectors) {
        const options = document.querySelectorAll(selector);
        if (options.length === 0) continue;

        for (const option of options) {
            if (option.offsetParent === null && getComputedStyle(option).display === 'none') continue;
            const range = parseAgeRange(option.textContent);
            if (range && ageNum >= range.min && ageNum <= range.max) {
                option.click();
                return { success: true, matchedOption: option.textContent.trim() };
            }
        }
    }

    triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { success: false, matchedOption: null };
}

/**
 * Normalize text for comparison: lowercase, trim, collapse whitespace.
 */
function normalizeText(text) {
    return (text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if a short string matches as a whole word within a longer string.
 * Prevents "uk" matching "ukraine" — requires word boundaries.
 */
function wordBoundaryMatch(text, term) {
    if (!term || !text) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s,;()/\\-])${escaped}(?:$|[\\s,;()/\\-])`, 'i');
    return re.test(text);
}

/**
 * Smart substring match: uses word-boundary matching for short terms (<=3 chars)
 * to prevent false positives like "uk" matching "ukraine".
 */
function smartIncludes(text, term) {
    if (term.length <= 5) {
        return wordBoundaryMatch(text, term);
    }
    return text.includes(term);
}

/**
 * Fuzzy match: check if optionText matches targetText or any of its aliases.
 * Returns true if there's a match.
 */
function fuzzyMatch(optionText, targetText, aliases) {
    const normalized = normalizeText(optionText);
    const target = normalizeText(targetText);

    // Direct match
    if (normalized === target) return true;
    if (smartIncludes(normalized, target) || smartIncludes(target, normalized)) return true;

    // Check aliases — gather all alias lists for the target
    if (aliases) {
        const aliasLists = [];
        if (aliases[targetText]) aliasLists.push(aliases[targetText]);
        for (const [key, list] of Object.entries(aliases)) {
            if (normalizeText(key) === target && list !== aliases[targetText]) {
                aliasLists.push(list);
            }
        }
        for (const aliasList of aliasLists) {
            for (const alias of aliasList) {
                if (normalized === alias || smartIncludes(normalized, alias) || smartIncludes(alias, normalized)) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Fill a native <select> by trying each answer pattern regex against option text.
 * Used for common question fields (workAuth, sponsorship, etc.).
 */
function fillSelectByPatterns(selectElement, answerPatterns, fallback) {
    const options = Array.from(selectElement.options).filter(o => o.value !== '' && !o.disabled);

    // Try each pattern in priority order
    for (const pattern of answerPatterns) {
        for (const option of options) {
            if (pattern.test(option.textContent.trim())) {
                selectElement.value = option.value;
                selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, matchedOption: option.textContent.trim() };
            }
        }
    }

    // Fallback: try exact text match on fallback string
    for (const option of options) {
        if (normalizeText(option.textContent) === normalizeText(fallback)) {
            selectElement.value = option.value;
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, matchedOption: option.textContent.trim() };
        }
    }

    return { success: false, matchedOption: null };
}

/**
 * Fill a custom dropdown by trying each answer pattern regex against option text.
 */
async function fillCustomDropdownByPatterns(triggerElement, answerPatterns, fallback) {
    triggerElement.click();
    triggerElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    triggerElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await waitForDropdownOptions(500);

    const optionSelectors = [
        '[role="option"]', '[role="listbox"] li', '[data-value]',
        '.dropdown-option', '.select-option', '.option', 'ul[role="listbox"] li',
    ];

    // Collect all visible options across selectors (deduplicated)
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

    // Try each pattern in priority order
    for (const pattern of answerPatterns) {
        for (const option of allOptions) {
            if (pattern.test(option.textContent.trim())) {
                option.click();
                return { success: true, matchedOption: option.textContent.trim() };
            }
        }
    }

    triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { success: false, matchedOption: null };
}

/**
 * Fill a native <select> element by fuzzy-matching an option.
 *
 * @param {HTMLSelectElement} selectElement
 * @param {string} targetText - The profile value to match (e.g., "United Kingdom")
 * @param {Object} aliases - Alias map for fuzzy matching
 * @returns {{ success: boolean, matchedOption: string|null }}
 */
function fillNativeSelect(selectElement, targetText, aliases) {
    const options = selectElement.options;

    // First pass: exact text match
    for (const option of options) {
        if (normalizeText(option.textContent) === normalizeText(targetText)) {
            selectElement.value = option.value;
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, matchedOption: option.textContent.trim() };
        }
    }

    // Second pass: fuzzy match with aliases
    for (const option of options) {
        if (option.value === '' || option.disabled) continue; // Skip placeholder options
        if (fuzzyMatch(option.textContent, targetText, aliases)) {
            selectElement.value = option.value;
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, matchedOption: option.textContent.trim() };
        }
    }

    return { success: false, matchedOption: null };
}

/**
 * Detect if an element is a custom dropdown trigger (not a native <select>).
 */
function isCustomDropdown(element) {
    const role = element.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return true;

    if (element.getAttribute('aria-haspopup') === 'listbox' ||
        element.getAttribute('aria-haspopup') === 'true') return true;

    const classNames = (element.className || '').toLowerCase();
    if (/select|dropdown|combobox|chosen|select2/.test(classNames)) return true;

    // Check if it's a div/button with dropdown-like attributes
    if ((element.tagName === 'DIV' || element.tagName === 'BUTTON' || element.tagName === 'SPAN') &&
        (element.getAttribute('aria-expanded') !== null || element.getAttribute('aria-controls'))) {
        return true;
    }

    return false;
}

/**
 * Wait for dropdown options to appear using MutationObserver with timeout.
 * Returns when new elements appear or timeout expires.
 */
function waitForDropdownOptions(timeout = 500) {
    return new Promise((resolve) => {
        let resolved = false;

        const observer = new MutationObserver(() => {
            if (!resolved) {
                resolved = true;
                observer.disconnect();
                // Small delay for rendering
                setTimeout(resolve, 50);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        // Timeout fallback
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                observer.disconnect();
                resolve();
            }
        }, timeout);
    });
}

/**
 * Fill a custom dropdown by clicking to open, finding a matching option, and clicking it.
 *
 * @param {HTMLElement} triggerElement - The element that opens the dropdown
 * @param {string} targetText - The value to match
 * @param {Object} aliases - Alias map for fuzzy matching
 * @returns {Promise<{ success: boolean, matchedOption: string|null }>}
 */
async function fillCustomDropdown(triggerElement, targetText, aliases) {
    // 1. Click trigger to open dropdown
    triggerElement.click();
    triggerElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    triggerElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    // 2. Wait for options to render
    await waitForDropdownOptions(500);

    // 3. Search for visible options
    const optionSelectors = [
        '[role="option"]',
        '[role="listbox"] li',
        '[data-value]',
        '.dropdown-option',
        '.select-option',
        '.option',
        'ul[role="listbox"] li',
    ];

    let matchedOption = null;

    for (const selector of optionSelectors) {
        const options = document.querySelectorAll(selector);
        if (options.length === 0) continue;

        for (const option of options) {
            // Only consider visible options
            if (option.offsetParent === null && getComputedStyle(option).display === 'none') continue;

            if (fuzzyMatch(option.textContent, targetText, aliases)) {
                matchedOption = option;
                break;
            }
        }
        if (matchedOption) break;
    }

    // 4. Click matching option or close dropdown
    if (matchedOption) {
        matchedOption.click();
        return { success: true, matchedOption: matchedOption.textContent.trim() };
    }

    // Close dropdown by clicking trigger again or pressing Escape
    triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { success: false, matchedOption: null };
}

/**
 * Fill all detected dropdown fields (native <select> and custom dropdowns).
 *
 * @param {Map<HTMLElement, {fieldType: string, confidence: number}>} fieldMap
 * @param {Object} profile - User profile data
 * @returns {Promise<{ filled: Array, skipped: Array }>}
 */
async function fillDropdowns(fieldMap, profile) {
    const filled = [];
    const skipped = [];

    for (const [element, detection] of fieldMap) {
        const { fieldType } = detection;
        const value = profile[fieldType];

        // Only process dropdown-type fields
        const isNativeSelect = element.tagName === 'SELECT';
        const isCustom = isCustomDropdown(element);

        if (!isNativeSelect && !isCustom) continue;

        // Question-answer fields: use pattern matching, not profile values
        const questionAnswer = QUESTION_ANSWERS[fieldType];
        if (questionAnswer) {
            let result;
            if (isNativeSelect) {
                result = fillSelectByPatterns(element, questionAnswer.answerPatterns, questionAnswer.fallback);
            } else {
                result = await fillCustomDropdownByPatterns(element, questionAnswer.answerPatterns, questionAnswer.fallback);
            }
            if (result.success) {
                filled.push({ field: fieldType, element: describeElement(element), matchedOption: result.matchedOption });
                console.log(`[AutoFiller] Question answered: ${fieldType} → "${result.matchedOption}" in ${describeElement(element)}`);
            } else {
                skipped.push({ field: fieldType, reason: `No matching answer option found` });
                console.log(`[AutoFiller] Question skipped: ${fieldType} — no matching answer in ${describeElement(element)}`);
            }
            continue;
        }

        // Skip if no value in profile
        if (!value) {
            skipped.push({ field: fieldType, reason: 'No value in profile' });
            continue;
        }

        // Age field: use range-parsing logic instead of text matching
        if (fieldType === 'age') {
            let result;
            if (isNativeSelect) {
                result = fillAgeSelect(element, value);
            } else {
                result = await fillAgeCustomDropdown(element, value);
            }
            if (result.success) {
                filled.push({ field: fieldType, element: describeElement(element), matchedOption: result.matchedOption });
                console.log(`[AutoFiller] Age dropdown filled: age ${value} → "${result.matchedOption}" in ${describeElement(element)}`);
            } else {
                skipped.push({ field: fieldType, reason: `No age range matching age ${value}` });
                console.log(`[AutoFiller] Age dropdown skipped: no range contains age ${value} in ${describeElement(element)}`);
            }
            continue;
        }

        const aliases = FIELD_ALIAS_MAP[fieldType] || null;

        if (isNativeSelect) {
            const result = fillNativeSelect(element, value, aliases);
            if (result.success) {
                filled.push({ field: fieldType, element: describeElement(element), matchedOption: result.matchedOption });
                console.log(`[AutoFiller] Dropdown filled: ${fieldType} → "${result.matchedOption}" in ${describeElement(element)}`);
            } else {
                skipped.push({ field: fieldType, reason: `No matching option for "${value}"` });
                console.log(`[AutoFiller] Dropdown skipped: ${fieldType} — no match for "${value}" in ${describeElement(element)}`);
            }
        } else if (isCustom) {
            try {
                const result = await fillCustomDropdown(element, value, aliases);
                if (result.success) {
                    filled.push({ field: fieldType, element: describeElement(element), matchedOption: result.matchedOption });
                    console.log(`[AutoFiller] Custom dropdown filled: ${fieldType} → "${result.matchedOption}"`);
                } else {
                    skipped.push({ field: fieldType, reason: `No matching option for "${value}" in custom dropdown` });
                    console.log(`[AutoFiller] Custom dropdown skipped: ${fieldType} — no match for "${value}"`);
                }
            } catch (err) {
                skipped.push({ field: fieldType, reason: `Custom dropdown error: ${err.message}` });
                console.warn(`[AutoFiller] Custom dropdown error for ${fieldType}:`, err);
            }
        }
    }

    return { filled, skipped };
}
