(function() {
    'use strict';

    const defaultProfile = {
        firstName: window.__loggedUser || 'Admin',
        lastName: '',
        email: '', phone: '', role: 'Admin'
    };
    let profile = {};

    /*
        Name: fullName
        Purpose: Combines the profile's first and last name into a display name, falling back to 'Admin'.
        Used by: profile.js (renderView)
        Found in: Line 17-21 in profile.js
    */
    function fullName() {
        const f = profile.firstName || '';
        const l = profile.lastName  || '';
        return (f + ' ' + l).trim() || 'Admin';
    }

    /*
        Name: load
        Purpose: Fetches the logged-in user's profile from the server and stores it locally, redirecting to login if the session is invalid.
        Used by: profile.js (called on script init)
        Found in: Line 29-43 in profile.js
    */
    async function load() {
        try {
            const res = await fetch('/api/profile');
            if (res.status === 401) { window.location.href = '/index.html'; return; }
            const data = await res.json();
            profile = {
                ...defaultProfile,
                firstName: data.first_name || defaultProfile.firstName,
                lastName:  data.last_name  || '',
                email:     data.email      || '',
                phone:     data.phone      || '',
                role:      data.role       || 'Admin',
            };
        } catch(e) { profile = { ...defaultProfile }; }
    }

    /*
        Name: save
        Purpose: Sends the edited profile fields to the server to persist them.
        Used by: profile.js (profileForm submit handler)
        Found in: Line 51-62 in profile.js
    */
    async function save() {
        await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: profile.firstName,
                lastName:  profile.lastName,
                email:     profile.email,
                phone:     profile.phone,
            })
        });
    }

    /*
        Name: renderView
        Purpose: Populates the read-only profile view (name, role, avatar, and field values) from the current profile data.
        Used by: profile.js (after load(), and after saving an edit)
        Found in: Line 70-92 in profile.js
    */
    function renderView() {
        const v = (val) => val && val.trim() ? val : null;
        const name = fullName();

        document.getElementById('displayName').textContent = name;
        document.getElementById('displayRole').innerHTML =
            `<i class="fas fa-shield-alt"></i> ${profile.role || 'Admin'}`;
        document.getElementById('avatarImg').src =
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=003d47&color=fff&size=96&bold=true`;

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (!el) return;
            const s = v(val);
            el.textContent = s || 'Not set';
            el.classList.toggle('muted', !s);
        };

        set('vFirstName', profile.firstName);
        set('vLastName',  profile.lastName);
        set('vEmail',     profile.email);
        set('vPhone',     profile.phone);
    }

    /*
        Name: populateForm
        Purpose: Fills the edit form's input fields with the current profile values.
        Used by: profile.js (enterEdit)
        Found in: Line 100-105 in profile.js
    */
    function populateForm() {
        document.getElementById('eFirstName').value = profile.firstName || '';
        document.getElementById('eLastName').value  = profile.lastName  || '';
        document.getElementById('eEmail').value     = profile.email     || '';
        document.getElementById('ePhone').value     = profile.phone     || '';
    }

    /*
        Name: enterEdit
        Purpose: Switches the profile page into edit mode.
        Used by: profile.js (editToggleBtn click handler)
        Found in: Line 113-117 in profile.js
    */
    function enterEdit() {
        populateForm();
        document.getElementById('viewMode').classList.add('hidden');
        document.getElementById('editForm').classList.add('active');
    }

    /*
        Name: exitEdit
        Purpose: Switches the profile page back to read-only view mode.
        Used by: profile.js (cancelEditBtn click handler, and after a successful save)
        Found in: Line 125-128 in profile.js
    */
    function exitEdit() {
        document.getElementById('viewMode').classList.remove('hidden');
        document.getElementById('editForm').classList.remove('active');
    }

    /*
        Name: showToast
        Purpose: Shows a temporary toast notification confirming an action succeeded or failed.
        Used by: profile.js (profileForm submit handler)
        Found in: Line 136-147 in profile.js
    */
    let toastTimer = null;
    function showToast(msg, type = 'success') {
        const el = document.getElementById('toast');
        const icon = el.querySelector('i');
        document.getElementById('toastMsg').textContent = msg;
        el.className = 'toast' + (type === 'error' ? ' error' : '');
        icon.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
        clearTimeout(toastTimer);
        void el.offsetWidth;
        el.classList.add('show');
        toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
    }

    /*
        Name: isValidPhone
        Purpose: Validates a phone number string. Empty is allowed since phone is
        optional; if a value is given, it must contain exactly 11 digits once
        formatting characters (spaces, dashes, parentheses, "+") are stripped.
        Used by: profile.js (profileForm submit handler)
        Found in: Line 150-158 in profile.js
    */
    function isValidPhone(phone) {
        const digits = (phone || '').replace(/\D/g, '');
        return digits.length === 0 || digits.length === 11;
    }

    document.getElementById('editToggleBtn').addEventListener('click', enterEdit);
    document.getElementById('cancelEditBtn').addEventListener('click', exitEdit);

    document.getElementById('profileForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const phone = document.getElementById('ePhone').value.trim();
        if (!isValidPhone(phone)) {
            showToast('Phone number must be exactly 11 digits.', 'error');
            document.getElementById('ePhone').focus();
            return;
        }
        profile.firstName = document.getElementById('eFirstName').value.trim() || profile.firstName;
        profile.lastName  = document.getElementById('eLastName').value.trim();
        profile.email     = document.getElementById('eEmail').value.trim();
        profile.phone     = phone;
        await save();
        renderView();
        exitEdit();
        showToast('Profile updated successfully.');
    });

    document.getElementById('dashboardBtn').addEventListener('click', () => {
        window.location.href = '/dashboard.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (confirm('Log out of RentEase?')) {
            await fetch('/api/logout', { method: 'POST' });
            sessionStorage.removeItem('rentease_session');
            window.location.href = '/index.html';
        }
    });

    load().then(renderView);
})();