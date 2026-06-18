/* ========== SESSION CHECK ========== */
(function () {
    const sessionData = sessionStorage.getItem('rentease_session');
    if (!sessionData) {
        window.location.href = 'login.html';
        return;
    }
    try {
        const session = JSON.parse(sessionData);
        if (Date.now() - session.loginTime > 3600000) {
            sessionStorage.removeItem('rentease_session');
            window.location.href = 'login.html';
            return;
        }
        window.__loggedUser = session.user || 'Admin';
    } catch (e) {
        window.location.href = 'login.html';
    }
})();

/* ========== APP LOGIC ========== */
(function () {
    const username = window.__loggedUser || 'Admin';
    document.getElementById('profileUsername').textContent = username;
    document.getElementById('greetingName').textContent = username;

    const avatarImg = document.querySelector('.user-profile img');
    if (avatarImg) {
        avatarImg.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=003d47&color=fff&size=36';
    }

    const navLinks = document.querySelectorAll('#navLinks a');
    const sections = {
        dashboard: document.getElementById('section-dashboard'),
        units: document.getElementById('section-units'),
        tenants: document.getElementById('section-tenants'),
        leases: document.getElementById('section-leases'),
        payments: document.getElementById('section-payments'),
        reports: document.getElementById('section-reports')
    };

    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const actionBtnText = document.getElementById('actionBtnText');

    const meta = {
        dashboard: { title: 'Welcome back, ' + username, sub: 'Here\'s what\'s happening with your rentals today.', action: 'New Lease' },
        units: { title: 'Unit Management', sub: 'View and manage all apartment units.', action: 'Add Unit' },
        tenants: { title: 'Tenant Management', sub: 'View and manage all registered tenants.', action: 'Register Tenant' },
        leases: { title: 'Lease Contracts', sub: 'View and manage all lease agreements.', action: 'New Lease' },
        payments: { title: 'Payment Records', sub: 'View and manage all rental payments.', action: 'Record Payment' },
        reports: { title: 'Reports & Analytics', sub: 'Overview of property performance.', action: 'Export PDF' }
    };

    function switchSection(sectionId) {
        Object.values(sections).forEach(el => el.classList.remove('active'));
        if (sections[sectionId]) sections[sectionId].classList.add('active');

        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.section === sectionId);
        });

        const data = meta[sectionId] || meta.dashboard;
        pageTitle.innerHTML = `${data.title} <small>${data.sub}</small>`;
        actionBtnText.textContent = data.action;
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const section = this.dataset.section;
            if (section) switchSection(section);
        });
    });

    switchSection('dashboard');

    // Logout on profile click
    const profile = document.querySelector('.user-profile');
    if (profile) {
        profile.style.cursor = 'pointer';
        profile.addEventListener('click', function () {
            if (confirm('Log out?')) {
                sessionStorage.removeItem('rentease_session');
                window.location.href = 'login.html';
            }
        });
    }
})();