/* ===========================================================
   PROFILE PANEL
   Sliding right-side panel for profile viewing.
   Editing happens in a separate modal window.
   Data persists to localStorage.
=========================================================== */

const ProfilePanel = (() => {
    'use strict';

    const PROFILE_KEY = 'flexscribe_profile';
    const ACCENT_KEY = 'flexscribe_dashboard_accent';
    const AVATAR_KEY = 'flexscribe_profile_avatar';

    const profileDefaults = { fullName: '', nickname: '', email: '', phone: '', dob: '', bio: '' };

    let _open = false;

    /* ── Panel Open / Close ── */
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

    /* ── Load profile into the read-only panel ── */
    function _loadProfile() {
        // Try to load from API first
        if (typeof API !== 'undefined') {
            API.Auth.getUser().then(function(result) {
                if (result.success && result.data) {
                    var d = result.data;
                    var data = {
                        fullName: ((d.firstName || '') + ' ' + (d.lastName || '')).trim(),
                        nickname: d.preferredName || d.firstName || '',
                        email: d.email || '',
                        phone: d.phone || '',
                        dob: d.dateOfBirth ? d.dateOfBirth.split('T')[0] : '',
                        bio: d.bio || ''
                    };
                    // Cache locally
                    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
                    // Cache avatar from DB if present
                    if (d.avatarUrl) {
                        localStorage.setItem(AVATAR_KEY, d.avatarUrl);
                    }
                    _populateFields(data);
                } else {
                    // Fallback to localStorage
                    var data = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || profileDefaults;
                    _populateFields(data);
                }
            }).catch(function() {
                var data = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || profileDefaults;
                _populateFields(data);
            });
        } else {
            var data = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || profileDefaults;
            _populateFields(data);
        }
    }

    function _populateFields(data) {
        var el;
        el = document.getElementById('pp-fullname'); if (el) el.value = data.fullName || '';
        el = document.getElementById('pp-nickname'); if (el) el.value = data.nickname || (data.fullName || '').split(' ')[0] || '';
        el = document.getElementById('pp-email'); if (el) el.value = data.email || '';
        el = document.getElementById('pp-phone'); if (el) el.value = data.phone || '';
        el = document.getElementById('pp-dob'); if (el) el.value = data.dob || '';
        el = document.getElementById('pp-bio'); if (el) el.value = data.bio || '';
        var avatar = localStorage.getItem(AVATAR_KEY);
        if (avatar) {
            var avatarImg = document.getElementById('pp-avatar-img');
            if (avatarImg) avatarImg.src = avatar;
        }
        var chipImg = document.querySelector('#user-chip img');
        if (chipImg && avatar) chipImg.src = avatar;
    }

    /* ── Edit Modal ── */
    function _openEditModal() {
        // Populate edit modal fields from current data (cached from API in localStorage)
        const data = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || profileDefaults;
        document.getElementById('pp-edit-fullname').value = data.fullName || '';
        document.getElementById('pp-edit-nickname').value = data.nickname || (data.fullName || '').split(' ')[0] || '';
        document.getElementById('pp-edit-email').value = data.email || '';
        document.getElementById('pp-edit-phone').value = data.phone || '';
        document.getElementById('pp-edit-dob').value = data.dob || '';
        document.getElementById('pp-edit-bio').value = data.bio || '';
        // Show the edit modal
        document.getElementById('pp-edit-modal').hidden = false;
    }

    function _closeEditModal() {
        document.getElementById('pp-edit-modal').hidden = true;
    }

    /* ── Save Confirmation ── */
    function _showSaveConfirm() {
        document.getElementById('pp-confirm-modal').hidden = false;
    }

    function _hideSaveConfirm() {
        document.getElementById('pp-confirm-modal').hidden = true;
    }

    /* ── Delete Confirmation ── */
    function _showDeleteConfirm() {
        document.getElementById('pp-delete-modal').hidden = false;
    }

    function _hideDeleteConfirm() {
        document.getElementById('pp-delete-modal').hidden = true;
    }

    /* ── Save Profile (called after confirmation) ── */
    function _saveProfile() {
        _hideSaveConfirm();

        const data = {
            fullName: document.getElementById('pp-edit-fullname').value.trim(),
            nickname: document.getElementById('pp-edit-nickname').value.trim(),
            email: document.getElementById('pp-edit-email').value.trim(),
            phone: document.getElementById('pp-edit-phone').value.trim(),
            dob: document.getElementById('pp-edit-dob').value,
            bio: document.getElementById('pp-edit-bio').value.trim()
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data));

        // Persist to backend API
        if (typeof API !== 'undefined') {
            var parts = data.fullName.split(/\s+/);
            var firstName = parts[0] || '';
            var lastName = parts.slice(1).join(' ') || '';
            API.Auth.updateProfile({
                firstName: firstName,
                lastName: lastName,
                preferredName: data.nickname || null,
                phone: data.phone || null,
                dateOfBirth: data.dob || null,
                bio: data.bio || null
            }).catch(function(err) {
                console.error('Profile save to DB failed:', err);
            });
        }

        // Determine display names
        const nickname = data.nickname || data.fullName.split(' ')[0];
        const fullName = data.fullName;
        const chipName = nickname + ' ' + (data.fullName.split(' ')[1] || '').charAt(0) + '.';

        // Update header user chip
        const chip = document.getElementById('header-user-name');
        if (chip) chip.textContent = chipName;

        const chipImg = document.getElementById('header-user-avatar');
        if (chipImg) chipImg.alt = chipName;

        // Update dashboard greeting
        const greetEl = document.querySelector('.page-title');
        if (greetEl && greetEl.textContent.includes('\u{1F44B}')) {
            greetEl.textContent = 'Welcome, ' + nickname + ' \u{1F44B}';
        }

        if (typeof pageTitles !== 'undefined') {
            pageTitles.dashboard.title = 'Welcome, ' + nickname + ' \u{1F44B}';
        }

        // Update FlexCard
        const flexcardName = document.getElementById('dash-fc-name');
        if (flexcardName) flexcardName.textContent = fullName.toUpperCase();

        // Update wallet virtual card name
        const walletCardName = document.querySelector('.wallet-card-name');
        if (walletCardName) walletCardName.textContent = chipName;

        // Close edit modal and refresh read-only panel
        _closeEditModal();
        _loadProfile();

        // Toast
        if (typeof UIUtils !== 'undefined') UIUtils.toast('Profile saved!', 'success');

        const userChip = document.getElementById('user-chip');
        if (userChip) {
            userChip.classList.add('pp-saved-flash');
            setTimeout(() => userChip.classList.remove('pp-saved-flash'), 2000);
        }
    }

    /* ── Delete Account ── */
    function _deleteAccount() {
        _hideDeleteConfirm();
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(AVATAR_KEY);
        localStorage.removeItem(ACCENT_KEY);
        sessionStorage.removeItem('flexscribe_token');
        if (typeof UIUtils !== 'undefined') UIUtils.toast('Account deleted.', 'error');
        setTimeout(() => {
            window.location.href = '../landing.html';
        }, 1000);
    }

    /* ── Bind Events ── */
    function _bindEvents() {
        // Panel close
        document.getElementById('profile-panel-close').addEventListener('click', close);
        document.getElementById('profile-panel-overlay').addEventListener('click', close);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) close(); });

        // Edit button opens the edit modal window
        document.getElementById('pp-edit-btn').addEventListener('click', _openEditModal);

        // Edit modal close/cancel
        document.getElementById('pp-edit-modal-close').addEventListener('click', _closeEditModal);
        document.getElementById('pp-edit-modal-cancel').addEventListener('click', _closeEditModal);

        // Edit modal save — show confirmation
        document.getElementById('pp-edit-modal-save').addEventListener('click', _showSaveConfirm);

        // Save confirmation
        document.getElementById('pp-confirm-cancel').addEventListener('click', _hideSaveConfirm);
        document.getElementById('pp-confirm-ok').addEventListener('click', _saveProfile);

        // Delete account
        document.getElementById('pp-delete-btn').addEventListener('click', _showDeleteConfirm);
        document.getElementById('pp-delete-cancel').addEventListener('click', _hideDeleteConfirm);
        document.getElementById('pp-delete-ok').addEventListener('click', _deleteAccount);

        // Avatar
        document.getElementById('pp-avatar').addEventListener('click', () => document.getElementById('pp-avatar-input').click());
        document.getElementById('pp-avatar-input').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                document.getElementById('pp-avatar-img').src = ev.target.result;
                localStorage.setItem(AVATAR_KEY, ev.target.result);
                const chipImg = document.querySelector('#user-chip img');
                if (chipImg) chipImg.src = ev.target.result;
                document.querySelectorAll('.pp-avatar-option').forEach(b => b.classList.remove('selected'));
                // Save to database
                if (typeof API !== 'undefined') {
                    API.Auth.updateProfile({ avatarUrl: ev.target.result }).catch(function() {});
                }
            };
            reader.readAsDataURL(file);
        });

        // Avatar grid
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
                const svg = btn.querySelector('svg');
                const svgData = new XMLSerializer().serializeToString(svg);
                const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                document.getElementById('pp-avatar-img').src = dataUri;
                localStorage.setItem(AVATAR_KEY, dataUri);
                const chipImg = document.querySelector('#user-chip img');
                if (chipImg) chipImg.src = dataUri;
                document.querySelectorAll('.pp-avatar-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                if (expandedGrid && !expandedGrid.hidden) {
                    expandedGrid.hidden = true;
                    if (moreBtn) moreBtn.textContent = '+';
                }
                // Save to database
                if (typeof API !== 'undefined') {
                    API.Auth.updateProfile({ avatarUrl: dataUri }).catch(function() {});
                }
            });
        });
    }

    // Init
    function init() {
        _bindEvents();
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
