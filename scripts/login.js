/* =============================================================
   FlexScribe — Login / Register Script
   scripts/login.js
============================================================= */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const tabLogin      = document.getElementById('tab-login');
    const tabRegister   = document.getElementById('tab-register');
    const panelLogin    = document.getElementById('panel-login');
    const panelRegister = document.getElementById('panel-register');
    const successScreen = document.getElementById('success-screen');

    function showLogin() {
        panelLogin.hidden    = false;
        panelRegister.hidden = true;
        if (successScreen) successScreen.hidden = true;
        tabLogin.classList.add('active');
        tabLogin.setAttribute('aria-selected', 'true');
        tabRegister.classList.remove('active');
        tabRegister.setAttribute('aria-selected', 'false');
        history.replaceState(null, '', '?mode=login');
    }

    function showRegister() {
        panelLogin.hidden    = true;
        panelRegister.hidden = false;
        if (successScreen) successScreen.hidden = true;
        tabRegister.classList.add('active');
        tabRegister.setAttribute('aria-selected', 'true');
        tabLogin.classList.remove('active');
        tabLogin.setAttribute('aria-selected', 'false');
        history.replaceState(null, '', '?mode=register');
    }

    tabLogin.addEventListener('click', showLogin);
    tabRegister.addEventListener('click', showRegister);

    // Read URL param on load
    const urlMode = new URLSearchParams(window.location.search).get('mode');
    if (urlMode === 'register') {
        showRegister();
    } else {
        showLogin();
    }

    // Password visibility toggle
    function setupEyeToggle(btnId, inputId, iconId) {
        const btn   = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        const icon  = document.getElementById(iconId);
        if (!btn || !input) return;
        btn.addEventListener('click', () => {
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            if (icon) icon.className = isHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
        });
    }
    setupEyeToggle('toggle-login-pw', 'login-password', 'login-pw-icon');
    setupEyeToggle('toggle-reg-pw', 'reg-password', 'reg-pw-icon');
    setupEyeToggle('toggle-reg-confirm-pw', 'reg-confirm', 'reg-confirm-pw-icon');

    // Password strength meter
    const regPassword   = document.getElementById('reg-password');
    const strengthMeter = document.getElementById('strength-meter');
    const strengthLabel = document.getElementById('strength-label');

    function getStrength(pw) {
        if (!pw || pw.length < 4) return { level: 0, label: '' };
        if (pw.length < 8) return { level: 1, label: 'Weak' };
        let score = 0;
        if (/[a-z]/.test(pw)) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^a-zA-Z0-9]/.test(pw)) score++;
        if (pw.length >= 12 && score >= 4) return { level: 4, label: 'Very Strong' };
        if (pw.length >= 8 && score >= 3)  return { level: 3, label: 'Strong' };
        if (pw.length >= 8 && score >= 2)  return { level: 2, label: 'Fair' };
        return { level: 1, label: 'Weak' };
    }

    if (regPassword && strengthMeter && strengthLabel) {
        regPassword.addEventListener('input', () => {
            const pw = regPassword.value;
            const { level, label } = getStrength(pw);
            const classes = ['', 'strength-weak', 'strength-fair', 'strength-strong', 'strength-vstrong'];
            strengthMeter.className = 'strength-meter ' + (classes[level] || '');
            strengthLabel.textContent = label;

            // Update password hint checklist
            updatePasswordHint('hint-length',  pw.length >= 8);
            updatePasswordHint('hint-upper',   /[A-Z]/.test(pw));
            updatePasswordHint('hint-lower',   /[a-z]/.test(pw));
            updatePasswordHint('hint-number',  /[0-9]/.test(pw));
            updatePasswordHint('hint-special', /[^a-zA-Z0-9]/.test(pw));
        });
    }

    function updatePasswordHint(id, met) {
        const li = document.getElementById(id);
        if (!li) return;
        const bullet = li.querySelector('.hint-bullet');
        if (met) {
            li.classList.add('met');
            if (bullet) bullet.textContent = '✓';
        } else {
            li.classList.remove('met');
            if (bullet) bullet.textContent = '-';
        }
    }

    // Confirm password match
    const regConfirm     = document.getElementById('reg-confirm');
    const matchIndicator = document.getElementById('match-indicator');
    if (regConfirm && regPassword && matchIndicator) {
        function checkMatch() {
            const pw = regPassword.value;
            const cf = regConfirm.value;
            if (!cf) { matchIndicator.innerHTML = ''; return; }
            matchIndicator.innerHTML = pw === cf
                ? '<i class="fa-solid fa-check" style="color:var(--green)"></i>'
                : '<i class="fa-solid fa-xmark" style="color:var(--danger)"></i>';
        }
        regConfirm.addEventListener('input', checkMatch);
        regPassword.addEventListener('input', checkMatch);
    }

    // Remember me
    const loginEmail = document.getElementById('login-email');
    const rememberMe = document.getElementById('remember-me');
    if (loginEmail && rememberMe) {
        const saved = localStorage.getItem('flexscribe_remembered_email');
        if (saved) { loginEmail.value = saved; rememberMe.checked = true; }
    }

    // Forgot password
    const forgotTrigger = document.getElementById('forgot-trigger');
    const forgotPanel   = document.getElementById('forgot-panel');
    const forgotSendBtn = document.getElementById('forgot-send-btn');
    const forgotSuccess = document.getElementById('forgot-success');
    if (forgotTrigger && forgotPanel) {
        forgotTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            forgotPanel.classList.toggle('visible');
        });
    }
    if (forgotSendBtn) {
        forgotSendBtn.addEventListener('click', async () => {
            forgotSendBtn.disabled = true;
            forgotSendBtn.textContent = 'Sending...';
            if (typeof API !== 'undefined') await API.Auth.forgotPassword(document.getElementById('forgot-email')?.value);
            else await new Promise(r => setTimeout(r, 800));
            forgotSendBtn.textContent = 'Send Reset Link';
            forgotSendBtn.disabled = false;
            if (forgotSuccess) forgotSuccess.style.display = 'block';
        });
    }

    // Helpers
    function setError(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }
    function clearErrors() {
        document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        const eb = document.getElementById('auth-error');
        if (eb) { eb.textContent = ''; eb.classList.remove('visible'); }
    }
    function showAuthError(msg) {
        const el = document.getElementById('auth-error');
        if (el) { el.textContent = msg; el.classList.add('visible'); }
    }
    function isValidEmail(e) {
        if (typeof Validators !== 'undefined' && Validators.isValidEmail) return Validators.isValidEmail(e);
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    }
    function setBtnLoading(b) { b.classList.add('loading'); b.disabled = true; }
    function setBtnSuccess(b) { b.classList.remove('loading'); b.classList.add('success'); }
    function resetBtn(b) { b.classList.remove('loading', 'success'); b.disabled = false; }

    // Login form submit
    const loginForm   = document.getElementById('login-form');
    const loginSubmit = document.getElementById('login-submit');
    if (loginForm && loginSubmit) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();
            const email = loginEmail?.value.trim() || '';
            const pw    = document.getElementById('login-password')?.value || '';
            let valid = true;
            if (!email) { setError('login-email-error', 'Email is required.'); valid = false; }
            else if (email !== 'admin' && !isValidEmail(email)) { setError('login-email-error', 'Enter a valid email.'); valid = false; }
            if (!pw) { setError('login-password-error', 'Password is required.'); valid = false; }
            if (!valid) return;
            if (rememberMe?.checked) localStorage.setItem('flexscribe_remembered_email', email);
            else localStorage.removeItem('flexscribe_remembered_email');
            setBtnLoading(loginSubmit);
            let result;
            if (typeof API !== 'undefined') { result = await API.Auth.login(email, pw); }
            else { await new Promise(r => setTimeout(r, 1000)); sessionStorage.setItem('flexscribe_token', 'mock-token'); result = { success: true }; }
            if (result.success) { setBtnSuccess(loginSubmit); setTimeout(() => { window.location.href = result.data?.isAdmin ? 'admin.html' : 'loading.html'; }, 1200); }
            else { resetBtn(loginSubmit); showAuthError(result.error || 'Invalid credentials.'); }
        });
    }

    // Set max date for Date of Birth (today)
    const dobInput = document.getElementById('reg-dob');
    if (dobInput) {
        const today = new Date().toISOString().split('T')[0];
        dobInput.setAttribute('max', today);
    }

    // Register form submit
    const registerForm   = document.getElementById('register-form');
    const registerSubmit = document.getElementById('register-submit');
    if (registerForm && registerSubmit) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();
            const firstName = document.getElementById('reg-firstname')?.value.trim() || '';
            const lastName  = document.getElementById('reg-lastname')?.value.trim()  || '';
            const email     = document.getElementById('reg-email')?.value.trim()     || '';
            const phone     = document.getElementById('reg-phone')?.value.trim()     || '';
            const dob       = document.getElementById('reg-dob')?.value || '';
            const password  = regPassword?.value || '';
            const confirm   = regConfirm?.value  || '';
            const terms     = document.getElementById('reg-terms')?.checked;
            const marketing = document.getElementById('reg-marketing')?.checked || false;
            let valid = true;
            if (!firstName) { setError('reg-firstname-error', 'First name required.'); valid = false; }
            if (!lastName)  { setError('reg-lastname-error', 'Last name required.'); valid = false; }
            if (!email)     { setError('reg-email-error', 'Email required.'); valid = false; }
            else if (!isValidEmail(email)) { setError('reg-email-error', 'Enter a valid email.'); valid = false; }
            if (!phone)     { setError('reg-phone-error', 'Phone number required.'); valid = false; }
            else if (!/^0\d{9}$/.test(phone.replace(/\s/g, ''))) { setError('reg-phone-error', 'Enter a valid 10-digit number starting with 0.'); valid = false; }
            if (!dob)       { setError('reg-dob-error', 'Date of birth required.'); valid = false; }
            else {
                const dobDate = new Date(dob);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (dobDate >= today) { setError('reg-dob-error', 'Date of birth must be in the past.'); valid = false; }
                else {
                    const age = today.getFullYear() - dobDate.getFullYear();
                    const monthDiff = today.getMonth() - dobDate.getMonth();
                    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate()) ? age - 1 : age;
                    if (actualAge < 13) { setError('reg-dob-error', 'You must be at least 13 years old.'); valid = false; }
                }
            }
            if (!password)  { setError('reg-password-error', 'Password required.'); valid = false; }
            else {
                const pwResult = (typeof Validators !== 'undefined' && Validators.validatePassword)
                    ? Validators.validatePassword(password)
                    : { valid: /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/.test(password),
                        message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.' };
                if (!pwResult.valid) { setError('reg-password-error', pwResult.message); valid = false; }
            }
            if (password !== confirm) { setError('reg-confirm-error', 'Passwords do not match.'); valid = false; }
            if (!terms) { setError('reg-terms-error', 'You must accept the Terms.'); valid = false; }
            if (!valid) return;
            setBtnLoading(registerSubmit);
            let result;
            if (typeof API !== 'undefined') { result = await API.Auth.register({ firstName, lastName, email, phone, dob, password, confirmPassword: confirm, marketing, termsAccepted: !!terms }); }
            else { await new Promise(r => setTimeout(r, 1200)); sessionStorage.setItem('flexscribe_token', 'mock-token'); result = { success: true, data: { scribeScore: 500 } }; }
            if (result.success) {
                setBtnSuccess(registerSubmit);
                setTimeout(() => {
                    panelRegister.hidden = true;
                    document.querySelector('.login-switch').style.display = 'none';
                    if (successScreen) { successScreen.hidden = false; const pts = document.getElementById('success-points'); if (pts) pts.hidden = false; }
                    let sec = 3;
                    const cd = document.getElementById('success-countdown');
                    const iv = setInterval(() => { sec--; if (cd) cd.textContent = sec; if (sec <= 0) { clearInterval(iv); window.location.href = 'loading.html'; } }, 1000);
                }, 800);
            } else { resetBtn(registerSubmit); showAuthError(result.error || 'Registration failed.'); }
        });
    }

});
