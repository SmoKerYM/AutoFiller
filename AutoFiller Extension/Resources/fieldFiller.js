// fieldFiller.js — Event dispatch for inputs (Step 6)

/**
 * Fill a text input or textarea using the native setter bypass.
 * Critical for React/Vue: their synthetic event systems override .value,
 * so we use the native HTMLInputElement.prototype.value setter directly.
 */
function fillTextInput(element, value) {
    element.focus();
    element.dispatchEvent(new Event('focus', { bubbles: true }));

    // Native setter bypass — critical for React/Vue
    // Must pick the correct prototype based on element type
    const proto = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (setter) {
        setter.call(element, value);
    } else {
        element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Input types that are considered fillable text fields.
 */
const FILLABLE_TEXT_TYPES = new Set([
    'text', 'email', 'tel', 'url', 'search', ''
]);

/**
 * Fill all detected text inputs and textareas with matching profile values.
 * Skips <select> elements and custom dropdowns (handled in Step 7).
 *
 * @param {Map<HTMLElement, {fieldType: string, confidence: number}>} fieldMap
 * @param {Object} profile - User profile data
 * @returns {{ filled: Array, skipped: Array }}
 */
function fillDetectedFields(fieldMap, profile) {
    const filled = [];
    const skipped = [];

    for (const [element, detection] of fieldMap) {
        const { fieldType } = detection;

        // Skip <select> elements — handled by dropdownHandler
        if (element.tagName === 'SELECT') {
            continue;
        }

        // Skip question-answer fields — handled by dropdownHandler
        const QUESTION_FIELD_TYPES = ['workAuth', 'sponsorship', 'workedBefore', 'relatedToEmployee', 'veteranStatus', 'disabilityStatus', 'privacyAck', 'transgender'];
        if (QUESTION_FIELD_TYPES.includes(fieldType)) {
            continue;
        }

        // Handle fullName by combining firstName + lastName
        let value;
        if (fieldType === 'fullName') {
            value = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
        } else {
            value = profile[fieldType];
        }

        // Skip if no value in profile for this field
        if (!value) {
            skipped.push({ field: fieldType, reason: 'No value in profile' });
            continue;
        }

        // Skip non-text input types (checkboxes, radios, etc. should already
        // be filtered by the detector, but guard here too)
        const inputType = (element.type || '').toLowerCase();
        if (element.tagName === 'INPUT' && !FILLABLE_TEXT_TYPES.has(inputType)) {
            skipped.push({ field: fieldType, reason: `Unsupported input type: ${inputType}` });
            continue;
        }

        // Fill the field
        try {
            fillTextInput(element, value);
            filled.push({ field: fieldType, element: describeElement(element) });
            console.log(`[AutoFiller] Filled: ${fieldType} → "${value}" in ${describeElement(element)}`);
        } catch (err) {
            skipped.push({ field: fieldType, reason: `Error: ${err.message}` });
            console.warn(`[AutoFiller] Failed to fill ${fieldType}:`, err);
        }
    }

    return { filled, skipped };
}

/**
 * Helper: human-readable description of an element for logging/results.
 */
function describeElement(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const name = element.name ? `[name="${element.name}"]` : '';
    return `${tag}${id}${name}`;
}
