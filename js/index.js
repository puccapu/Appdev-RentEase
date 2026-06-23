/* ═══════════════════════════════════════════
    RENTEASE — LOGIN (admin only)
    ═══════════════════════════════════════════ */

// ─── DOM REFS ───
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMessage');
const loginBtn = document.getElementById('loginBtn');

// ─── PIN DOT HELPERS ───
function updateDots(inputId, dotPrefix) {
    const input = document.getElementById(inputId);
    const val = input ? input.value : '';
    const len = Math.min(val.length, 4);
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(dotPrefix + i);
        if (!dot) continue;
        dot.classList.remove('filled', 'error-dot');
        if (i < len) dot.classList.add('filled');
    }
}

function markDotsError(dotPrefix) {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(dotPrefix + i);
        if (!dot) continue;
        dot.classList.remove('filled');
        dot.classList.add('error-dot');
    }
    setTimeout(() => {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(dotPrefix + i);
            if (dot) dot.classList.remove('error-dot');
        }
    }, 700);
}

// ─── TOGGLE PIN VISIBILITY ───
window.togglePinVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye-slash';
    }
};

// ─── PIN INPUT SYNC ───
document.getElementById('loginPin').addEventListener('input', function() {
    updateDots('loginPin', 'ld');
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
});

// ─── SHOW MESSAGE ───
function showMessage(el, text, type = 'error') {
    el.textContent = text;
    el.className = 'form-message show ' + type;
}

function clearMessage(el) {
    el.className = 'form-message';
    el.textContent = '';
}

function setLoading(btn, loading) {
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
}

// ─── LOGIN (hardcoded admin) ───
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    clearMessage(loginMsg);

    const name = document.getElementById('loginName').value.trim();
    const pin = document.getElementById('loginPin').value.trim();

    if (!name) {
        showMessage(loginMsg, 'Please enter your username.', 'error');
        document.getElementById('loginName').focus();
        return;
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        showMessage(loginMsg, 'PIN must be exactly 4 digits.', 'error');
        markDotsError('ld');
        document.getElementById('loginPin').focus();
        return;
    }

    // ─── HARDCODED ADMIN CHECK ───
    if (name.toLowerCase() === 'admin' && pin === '2121') {
        //  Success
        showMessage(loginMsg, 'Welcome, Admin! Redirecting…', 'success');
        setLoading(loginBtn, true);

        sessionStorage.setItem('rentease_session', JSON.stringify({
            user: 'Admin',
            loginTime: Date.now()
        }));

        setTimeout(() => {
            window.location.href = '../php/dashboard.html';
        }, 800);
    } else {
        //  Invalid credentials
        showMessage(loginMsg, 'Invalid username or PIN. Please try again.', 'error');
        markDotsError('ld');
        document.getElementById('loginPin').value = '';
        updateDots('loginPin', 'ld');
        document.getElementById('loginPin').focus();
    }
});

// ─── ENTER KEY ON PIN FIELD ───
document.getElementById('loginPin').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && this.value.length === 4) {
        loginForm.dispatchEvent(new Event('submit'));
    }
});

// ─── CHECK EXISTING SESSION ───
const session = sessionStorage.getItem('rentease_session');
if (session) {
    try {
        const data = JSON.parse(session);
        if (data.user && (Date.now() - data.loginTime) < 3600000) {
            // Already logged in – redirect to dashboard
            window.location.href = '../php/dashboard.html';
        }
    } catch {}
}

console.log('RENTEASE Login ready — use admin / 2121');