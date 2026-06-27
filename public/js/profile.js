(function() {
    'use strict';

    const defaultProfile = {
        firstName: window.__loggedUser || 'Admin',
        lastName: '',
        email: '', phone: '', role: 'Admin'
    };
    let profile = {};

    function fullName() {
        const f = profile.firstName || '';
        const l = profile.lastName  || '';
        return (f + ' ' + l).trim() || 'Admin';
    }

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

    function populateForm() {
        document.getElementById('eFirstName').value = profile.firstName || '';
        document.getElementById('eLastName').value  = profile.lastName  || '';
        document.getElementById('eEmail').value     = profile.email     || '';
        document.getElementById('ePhone').value     = profile.phone     || '';
    }

    function enterEdit() {
        populateForm();
        document.getElementById('viewMode').classList.add('hidden');
        document.getElementById('editForm').classList.add('active');
    }

    function exitEdit() {
        document.getElementById('viewMode').classList.remove('hidden');
        document.getElementById('editForm').classList.remove('active');
    }

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

    document.getElementById('editToggleBtn').addEventListener('click', enterEdit);
    document.getElementById('cancelEditBtn').addEventListener('click', exitEdit);

    document.getElementById('profileForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        profile.firstName = document.getElementById('eFirstName').value.trim() || profile.firstName;
        profile.lastName  = document.getElementById('eLastName').value.trim();
        profile.email     = document.getElementById('eEmail').value.trim();
        profile.phone     = document.getElementById('ePhone').value.trim();
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