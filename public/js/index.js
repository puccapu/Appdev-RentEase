const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMessage');
const loginBtn = document.getElementById('loginBtn');

/*
    Name: updateDots
    Purpose: Fills in the PIN dot indicators to match how many digits have been typed.
    Used by: index.js (loginPin input listener)
    Found in: Line 11-21 in index.js
*/
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

/*
    Name: markDotsError
    Purpose: Briefly flashes the PIN dots red to signal an invalid PIN entry.
    Used by: index.js (login form submit handler)
    Found in: Line 29-42 in index.js
*/
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

/*
    Name: togglePinVisibility
    Purpose: Switches a PIN input between masked and plain-text display.
    Used by: index.html (eye icon button next to the PIN field)
    Found in: Line 42-45 in index.html
*/
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

document.getElementById('loginPin').addEventListener('input', function() {
    updateDots('loginPin', 'ld');
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
});

/*
    Name: showMessage
    Purpose: Displays a status message (error or success) under the login form.
    Used by: index.js (login form submit handler)
    Found in: Line 74-77 in index.js
*/
function showMessage(el, text, type = 'error') {
    el.textContent = text;
    el.className = 'form-message show ' + type;
}

/*
    Name: clearMessage
    Purpose: Hides and resets the login form's status message.
    Used by: index.js (login form submit handler)
    Found in: Line 85-88 in index.js
*/
function clearMessage(el) {
    el.className = 'form-message';
    el.textContent = '';
}

/*
    Name: setLoading
    Purpose: Toggles the login button's loading spinner state and disabled flag.
    Used by: index.js (login form submit handler)
    Found in: Line 96-99 in index.js
*/
function setLoading(btn, loading) {
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
}

loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearMessage(loginMsg);

    const name = document.getElementById('loginName').value.trim();
    const pin  = document.getElementById('loginPin').value.trim();

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

    setLoading(loginBtn, true);

    try {
        const res  = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, pin })
        });
        const data = await res.json();

        if (data.success) {
            showMessage(loginMsg, `Welcome, ${data.user}! Redirecting…`, 'success');
            sessionStorage.setItem('rentease_session', JSON.stringify({
                user: data.user, loginTime: Date.now()
            }));
            setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
        } else {
            showMessage(loginMsg, data.message || 'Invalid username or PIN. Please try again.', 'error');
            markDotsError('ld');
            document.getElementById('loginPin').value = '';
            updateDots('loginPin', 'ld');
            document.getElementById('loginPin').focus();
            setLoading(loginBtn, false);
        }
    } catch (err) {
        showMessage(loginMsg, 'Server error. Please try again.', 'error');
        setLoading(loginBtn, false);
    }
});

document.getElementById('loginPin').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && this.value.length === 4) {
        loginForm.dispatchEvent(new Event('submit'));
    }
});

const session = sessionStorage.getItem('rentease_session');
if (session) {
    try {
        const data = JSON.parse(session);
        if (data.user && (Date.now() - data.loginTime) < 3600000) {
            window.location.href = '/dashboard.html';
        }
    } catch {}
}

console.log('RENTEASE Login ready');