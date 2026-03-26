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
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value'
    )?.set;

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
        const value = profile[fieldType];

        // Skip if no value in profile for this field
        if (!value) {
            skipped.push({ field: fieldType, reason: 'No value in profile' });
            continue;
        }

        // Skip <select> elements — handled by dropdownHandler in Step 7
        if (element.tagName === 'SELECT') {
            skipped.push({ field: fieldType, reason: 'Dropdown — handled separately' });
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
