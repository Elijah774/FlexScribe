/* ===========================================================
   PROFILE PANEL
   Sliding right-side panel for profile editing.
   Data persists to localStorage.
=========================================================== */

const ProfilePanel = (() => {
    'use strict';

    const PROFILE_KEY = 'flexscribe_profile';
    const ACCENT_KEY = 'flexscribe_dashboard_accent';
    const AVATAR_KEY = 'flexscribe_profile_avatar';

    const profileDefaults = { fullName: 'Sarah Mitchell', nickname: 'Sarah', email: 'sarah.m@email.com', phone: '+27 71 234 5678', dob: '1998-03-15', bio: 'Finance enthusiast and FlexScribe power user.' };

    let _open = false;

    function open() {
        const overlay = document.getElementById('profile-panel-overlay');
        const panel = document.getElementById('profile-panel');
        overlay.hidden = false;
        panel.hidden = false;
        document.querySelector('.master-container').classList.add('blurred');
        requestAnimationFrame(() => {
            panel.classList.add('open');
            overlay.classList.add('visible');
        });
        _loadProfile();
        _open = true;
    }

    function close() {
        const overlay = document.getElementById('profile-panel-overlay');
        const panel = document.getElementById('profile-panel');
        panel.classList.remove('open');
        overlay.classList.remove('visible');
        document.querySelector('.master-container').classList.remove('blurred');
        panel.addEventListener('transitionend', () => {
            if (!panel.classList.contains('open')) {
                panel.hidden = true;
                overlay.hidden = true;
            }
        }, { once: true });
        _open = false;
    }

    function _loadProfile() {
        const data = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || profileDefaults;
        document.getElementById('pp-fullname').value = data.fullName || '';
        document.getElementById('pp-nickname').value = data.nickname || data.fullName.split(' ')[0] || '';
        document.getElementById('pp-email').value = data.email || '';
        document.getElementById('pp-phone').value = data.phone || '';
        document.getElementById('pp-dob').value = data.dob || '';
        document.getElementById('pp-bio').value = data.bio || '';
        const avatar = localStorage.getItem(AVATAR_KEY);
        if (avatar) document.getElementById('pp-avatar-img').src = avatar;
        // Also update the header chip image
        const chipImg = document.querySelector('#user-chip img');
        if (chipImg && avatar) chipImg.src = avatar;
    }

    function _saveProfile() {
        const data = {
            fullName: document.getElementById('pp-fullname').value.trim(),
            nickname: document.getElementById('pp-nickname').value.trim(),
            email: document.getElementById('pp-email').value.trim(),
            phone: document.getElementById('pp-phone').value.trim(),
            dob: document.getElementById('pp-dob').value,
            bio: document.getElementById('pp-bio').value.trim()
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data));

        // Determine display names
        const nickname = data.nickname || data.fullName.split(' ')[0];
        const fullName = data.fullName;
        const chipName = nickname + ' ' + (data.fullName.split(' ')[1] || '').charAt(0) + '.';

        // Update header user chip (uses nickname)
        const chip = document.querySelector('#user-chip span');
        if (chip) chip.textContent = chipName;

        // Update header alt text
        const chipImg = document.querySelector('#user-chip img');
        if (chipImg) chipImg.alt = chipName;

        // Update dashboard greeting (uses nickname)
        const greetEl = document.querySelector('.page-title');
        if (greetEl && greetEl.textContent.includes('\u{1F44B}')) {
            greetEl.textContent = 'Welcome, ' + nickname + ' \u{1F44B}';
        }

        // Update pageTitles so future navigation uses the nickname
        if (typeof pageTitles !== 'undefined') {
            pageTitles.dashboard.title = 'Welcome, ' + nickname + ' \u{1F44B}';
        }

        // Update FlexCard (uses FULL NAME only)
        const flexcardName = document.querySelector('.flexcard-name');
        if (flexcardName) flexcardName.textContent = fullName.toUpperCase();

        // Update wallet virtual card name (uses nickname)
        const walletCardName = document.querySelector('.wallet-card-name');
        if (walletCardName) walletCardName.textContent = chipName;
        
        // Close the panel
        close();
        
        // Show saved indicator
        if (typeof UIUtils !== 'undefined') UIUtils.toast('Profile saved!', 'success');
        
        // Add a brief "saved" indicator on the user chip
        const userChip = document.getElementById('user-chip');
        if (userChip) {
            userChip.classList.add('pp-saved-flash');
            setTimeout(() => userChip.classList.remove('pp-saved-flash'), 2000);
        }
    }

    function _bindEvents() {
        // Close
        document.getElementById('profile-panel-close').addEventListener('click', close);
        document.getElementById('profile-panel-overlay').addEventListener('click', close);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) close(); });

        // Profile save
        document.getElementById('pp-save-btn').addEventListener('click', _saveProfile);

        // Avatar
        document.getElementById('pp-avatar').addEventListener('click', () => document.getElementById('pp-avatar-input').click());
        document.getElementById('pp-avatar-input').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                document.getElementById('pp-avatar-img').src = ev.target.result;
                localStorage.setItem(AVATAR_KEY, ev.target.result);
                // Update header chip avatar
                const chipImg = document.querySelector('#user-chip img');
                if (chipImg) chipImg.src = ev.target.result;
                // Clear any selected avatar option
                document.querySelectorAll('.pp-avatar-option').forEach(b => b.classList.remove('selected'));
            };
            reader.readAsDataURL(file);
        });

        // Avatar grid selection
        const moreBtn = document.getElementById('pp-avatar-more-btn');
        const expandedGrid = document.getElementById('pp-avatar-expanded');
        if (moreBtn && expandedGrid) {
            moreBtn.addEventListener('click', () => {
                expandedGrid.hidden = !expandedGrid.hidden;
                moreBtn.textContent = expandedGrid.hidden ? '+' : '\u2212';
            });
        }

        document.querySelectorAll('.pp-avatar-option').forEach(btn => {
            btn.addEventListener('click', () => {
                // Get the SVG as a data URI
                const svg = btn.querySelector('svg');
                const svgData = new XMLSerializer().serializeToString(svg);
                const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                
                // Set as profile avatar
                document.getElementById('pp-avatar-img').src = dataUri;
                localStorage.setItem(AVATAR_KEY, dataUri);
                
                // Update header chip avatar
                const chipImg = document.querySelector('#user-chip img');
                if (chipImg) chipImg.src = dataUri;
                
                // Highlight selected, clear others
                document.querySelectorAll('.pp-avatar-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                
                // Close expanded grid after selection
                if (expandedGrid && !expandedGrid.hidden) {
                    expandedGrid.hidden = true;
                    if (moreBtn) moreBtn.textContent = '+';
                }
            });
        });
    }

    // Init — called once on page load
    function init() {
        _bindEvents();
        // Apply saved accent globally on page load
        const savedAccent = localStorage.getItem(ACCENT_KEY);
        if (savedAccent && savedAccent !== '#FF8A34') {
            const targets = [document.documentElement, document.body];
            targets.forEach(el => {
                el.style.setProperty('--orange', savedAccent);
                el.style.setProperty('--orange-hover', savedAccent + 'CC');
                el.style.setProperty('--orange-tint', savedAccent + '1F');
                el.style.setProperty('--orange-glow', savedAccent + '33');
            });
        }
    }

    return { open, close, init };
})();
