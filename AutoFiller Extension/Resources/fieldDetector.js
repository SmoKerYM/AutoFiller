// fieldDetector.js — Multi-signal field matching (Step 5)

/**
 * Pattern map: profile field name → regex to match against signals.
 */
const FIELD_PATTERNS = {
    firstName:      /first.?name|given.?name|fname|prénom/i,
    lastName:       /last.?name|sur.?name|family.?name|lname/i,
    email:          /e.?mail/i,
    phone:          /phone|mobile|tel(?:ephone)?|contact.?number/i,
    addressLine1:   /address.?(line.?1|1)|street|address(?!.*(2|city|post|zip|state|country))/i,
    city:           /city|town|municipality|location.?\(city\)|location/i,
    postalCode:     /post.?code|zip.?code|postal/i,
    country:        /country|nation/i,
    linkedinUrl:    /linkedin|linked.?in/i,
    howDidYouHear:  /how.*(hear|find|learn|know)|referral.?source|source/i,
    gender:         /(?<!trans)gender|sex(?!ual)/i,
    ethnicGroup:    /ethnic|race|ethnicity/i,
    age:            /age.?(group|range|bracket)|date.?of.?birth/i,
    // Common application questions (answered automatically)
    workAuth:         /legally\s+authorized.*work|authorized\s+to\s+work|right\s+to\s+work|work\s+authoriz/i,
    sponsorship:      /require.*sponsor|need.*sponsor|sponsor.*require|visa\s+sponsor|will\s+you.*sponsor/i,
    workedBefore:     /have\s+you\s+(worked|been\s+employed)\s+(at|for|with)|previously\s+(worked|employed)/i,
    veteranStatus:    /veteran|protected\s+veteran/i,
    disabilityStatus: /disability|disabled/i,
    privacyAck:       /privacy\s+(acknowledge?ment|policy|notice|statement)/i,
    transgender:      /transgender|trans\s+gender|identify.*transgender/i,
};

/**
 * Signal weights — higher weight = more confidence.
 */
const SIGNAL_WEIGHTS = {
    name:         8,
    id:           8,
    autocomplete: 15,
    placeholder:  6,
    label:        10,
    ariaLabel:    10,
    nearbyText:   3,
};

/** Minimum confidence score to consider a match valid. */
const CONFIDENCE_THRESHOLD = 5;

/**
 * Get the label text associated with a form element.
 */
function getLabelText(element) {
    // 1. Explicit: <label for="elementId">
    if (element.id) {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (explicitLabel) return explicitLabel.textContent.trim();
    }

    // 2. Implicit: <label> wrapping the input
    const parentLabel = element.closest('label');
    if (parentLabel) {
        // Get label text excluding the input's own text
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea');
        inputs.forEach(el => el.remove());
        const text = clone.textContent.trim();
        if (text) return text;
    }

    // 3. aria-labelledby → find referenced element's text
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const parts = labelledBy.split(/\s+/).map(id => {
            const el = document.getElementById(id);
            return el ? el.textContent.trim() : '';
        }).filter(Boolean);
        if (parts.length) return parts.join(' ');
    }

    return '';
}

/**
 * Get nearby text content (previous sibling, parent's direct text).
 */
function getNearbyText(element) {
    const texts = [];

    // Previous sibling text
    let prev = element.previousElementSibling;
    if (prev && prev.textContent) {
        texts.push(prev.textContent.trim());
    }

    // Parent's direct text (excluding children's text)
    const parent = element.parentElement;
    if (parent) {
        for (const node of parent.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                texts.push(node.textContent.trim());
            }
        }
    }

    return texts.join(' ').substring(0, 200);
}

/**
 * Collect all signals from a form element.
 * Returns an object of { signalName: signalValue }.
 */
function extractSignals(element) {
    return {
        name:         element.name || '',
        id:           element.id || '',
        autocomplete: element.autocomplete || element.getAttribute('autocomplete') || '',
        placeholder:  element.placeholder || '',
        label:        getLabelText(element),
        ariaLabel:    element.getAttribute('aria-label') || '',
        nearbyText:   getNearbyText(element),
    };
}

/**
 * Score a single element against all field patterns.
 * Returns { fieldType: string, confidence: number } or null if no match above threshold.
 */
function scoreElement(element) {
    const signals = extractSignals(element);
    let bestMatch = null;
    let bestScore = 0;

    for (const [fieldType, pattern] of Object.entries(FIELD_PATTERNS)) {
        let score = 0;

        for (const [signalName, signalValue] of Object.entries(signals)) {
            if (!signalValue) continue;
            if (pattern.test(signalValue)) {
                score += SIGNAL_WEIGHTS[signalName];
            }
        }

        // Bonus: input type alignment
        const inputType = element.type || '';
        if (fieldType === 'email' && inputType === 'email') score += 5;
        if (fieldType === 'phone' && inputType === 'tel') score += 5;
        if (fieldType === 'linkedinUrl' && inputType === 'url') score += 3;

        if (score > bestScore) {
            bestScore = score;
            bestMatch = fieldType;
        }
    }

    if (bestScore >= CONFIDENCE_THRESHOLD) {
        return { fieldType: bestMatch, confidence: bestScore };
    }
    return null;
}

/**
 * Scan the page for all form elements and detect which profile field each corresponds to.
 * Returns: Map<HTMLElement, { fieldType: string, confidence: number }>
 */
function detectAllFields() {
    const fieldMap = new Map();
    const elements = document.querySelectorAll('input, textarea, select');

    // Track which fieldTypes are already assigned (keep highest confidence)
    const bestByFieldType = new Map();

    for (const element of elements) {
        // Skip hidden, submit, button, file, and checkbox/radio inputs
        if (element.type === 'hidden' || element.type === 'submit' ||
            element.type === 'button' || element.type === 'file' ||
            element.type === 'checkbox' || element.type === 'radio' ||
            element.type === 'image' || element.type === 'reset') {
            continue;
        }

        // Skip invisible elements
        if (element.offsetParent === null && element.type !== 'select-one') continue;

        const result = scoreElement(element);
        if (!result) continue;

        const existing = bestByFieldType.get(result.fieldType);
        if (!existing || result.confidence > existing.confidence) {
            // Remove previous element for this fieldType if any
            if (existing) {
                fieldMap.delete(existing.element);
            }
            fieldMap.set(element, result);
            bestByFieldType.set(result.fieldType, { ...result, element });
        }

        console.log(
            `[AutoFiller] Detected: ${result.fieldType} → ${element.tagName.toLowerCase()}#${element.id || '(no-id)'}` +
            ` (confidence: ${result.confidence})`
        );
    }

    console.log(`[AutoFiller] Total fields detected: ${fieldMap.size}`);
    return fieldMap;
}
