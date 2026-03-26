// options.js — Profile storage UI (Step 3)

const DEFAULTS = {
    firstName: 'Mingwei',
    lastName: 'Yan',
    email: 'mingweiyzh@outlook.com',
    phone: '07442862107',
    addressLine1: '14 St. George Wharf',
    city: 'London',
    postalCode: 'SW8 2LR',
    country: 'United Kingdom',
    linkedinUrl: 'https://www.linkedin.com/in/mingwei-yan-my324',
    howDidYouHear: 'LinkedIn',
    gender: 'Male',
    ethnicGroup: 'Asian - Chinese',
    age: '',
    customFields: []
};

const FIELD_IDS = [
    'firstName', 'lastName', 'email', 'phone',
    'addressLine1', 'city', 'postalCode', 'country',
    'linkedinUrl',
    'howDidYouHear', 'gender', 'ethnicGroup', 'age'
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
    const { profile } = await browser.storage.local.get('profile');

    // Use saved profile or defaults on first use
    const data = profile || DEFAULTS;
    populateForm(data);

    // If first use, save defaults immediately
    if (!profile) {
        await browser.storage.local.set({ profile: DEFAULTS });
    }

    document.getElementById('profileForm').addEventListener('submit', handleSave);
    document.getElementById('addCustomField').addEventListener('click', () => addCustomFieldRow('', ''));
}

function populateForm(data) {
    for (const id of FIELD_IDS) {
        const el = document.getElementById(id);
        if (el) el.value = data[id] || '';
    }

    // Custom fields
    const list = document.getElementById('customFieldsList');
    list.innerHTML = '';
    const customs = data.customFields || [];
    for (const { key, value } of customs) {
        addCustomFieldRow(key, value);
    }
}

function addCustomFieldRow(key, value) {
    const list = document.getElementById('customFieldsList');
    const row = document.createElement('div');
    row.className = 'custom-field-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Field name';
    keyInput.value = key;
    keyInput.className = 'custom-key';

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.placeholder = 'Value';
    valInput.value = value;
    valInput.className = 'custom-value';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '\u00D7';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
}

async function handleSave(e) {
    e.preventDefault();

    const profile = {};
    for (const id of FIELD_IDS) {
        profile[id] = document.getElementById(id).value.trim();
    }

    // Collect custom fields (skip empty rows)
    profile.customFields = [];
    const rows = document.querySelectorAll('.custom-field-row');
    for (const row of rows) {
        const key = row.querySelector('.custom-key').value.trim();
        const value = row.querySelector('.custom-value').value.trim();
        if (key) {
            profile.customFields.push({ key, value });
        }
    }

    await browser.storage.local.set({ profile });

    // Show confirmation
    const status = document.getElementById('saveStatus');
    status.textContent = 'Saved!';
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 2000);
}
