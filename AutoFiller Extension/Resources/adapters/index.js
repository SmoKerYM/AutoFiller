// adapters/index.js — Adapter router (Step 9)
// Selects the best adapter based on the current page's hostname.

/**
 * Get the appropriate adapter for the current page.
 * Platform-specific adapters handle ATS quirks; generic is the fallback.
 *
 * @returns {Object} Adapter with { name, detect(), fill(profile) }
 */
function getAdapter() {
    const host = window.location.hostname;

    if (host.includes('myworkdayjobs.com')) {
        console.log('[AutoFiller] Adapter: workday');
        return workdayAdapter;
    }
    if (host.includes('greenhouse.io') || host.includes('boards.greenhouse.io')) {
        console.log('[AutoFiller] Adapter: greenhouse');
        return greenhouseAdapter;
    }
    if (host.includes('jobs.lever.co')) {
        console.log('[AutoFiller] Adapter: lever');
        return leverAdapter;
    }

    console.log('[AutoFiller] Adapter: generic');
    return genericAdapter;
}
