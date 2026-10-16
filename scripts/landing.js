/* =============================================================
   FlexScribe — Landing Page Script
   scripts/landing.js
============================================================= */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    /* -- Sticky header ---------------------------------------- */
    const header = document.getElementById('site-header');
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    /* -- Hamburger menu --------------------------------------- */
    const toggle = document.getElementById('nav-toggle');
    const drawer = document.getElementById('nav-drawer');
    if (toggle && drawer) {
        toggle.addEventListener('click', () => {
            const open = drawer.hidden;
            drawer.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
        });
        // Close drawer on any drawer link click
        drawer.querySelectorAll('a').forEach(a =>
            a.addEventListener('click', () => { drawer.hidden = true; toggle.setAttribute('aria-expanded', 'false'); })
        );
    }

    /* -- Smooth scroll for all anchor links ------------------- */
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const id = a.getAttribute('href').slice(1);
            const target = id ? document.getElementById(id) : null;
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    /* -- Scroll reveal ---------------------------------------- */
    if (typeof UIUtils !== 'undefined') {
        UIUtils.revealOnScroll('.reveal');
    } else {
        // Fallback if UIUtils not loaded
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); } });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    }

    /* -- Animated counters in hero (fire once on load) -------- */
    function initHeroCounters() {
        document.querySelectorAll('.hero-stat-num[data-target]').forEach(el => {
            const target  = parseFloat(el.dataset.target);
            const prefix  = el.dataset.prefix  || '';
            const suffix  = el.dataset.suffix  || '';
            const isFloat = !Number.isInteger(target);
            const fmt     = v => prefix + (isFloat ? v.toFixed(1) : Math.round(v).toLocaleString()) + suffix;

            if (typeof UIUtils !== 'undefined') {
                UIUtils.animateCounter(el, 0, target, 1600, fmt);
            } else {
                el.textContent = fmt(target);
            }
        });
    }
    // Delay slightly to let the page paint first
    setTimeout(initHeroCounters, 600);

    /* -- Animated counters in About (on scroll) --------------- */
    const aboutCounters = document.querySelectorAll('.counter[data-target]');
    if (aboutCounters.length) {
        const counterObs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                const el     = e.target;
                const target = parseFloat(el.dataset.target);
                const suffix = el.dataset.suffix || '';
                const fmt    = v => Math.round(v).toLocaleString() + suffix;
                if (typeof UIUtils !== 'undefined') {
                    UIUtils.animateCounter(el, 0, target, 1400, fmt);
                } else {
                    el.textContent = fmt(target);
                }
                counterObs.unobserve(el);
            });
        }, { threshold: 0.5 });
        aboutCounters.forEach(el => counterObs.observe(el));
    }

    /* -- FAQ keyboard support --------------------------------- */
    document.querySelectorAll('.faq-item summary').forEach(s => {
        s.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                s.closest('details').toggleAttribute('open');
            }
        });
    });

    /* -- Contact form ----------------------------------------- */
    const form   = document.getElementById('contact-form');
    const submit = document.getElementById('contact-submit');
    if (form && submit) {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const name  = document.getElementById('c-name')?.value.trim();
            const email = document.getElementById('c-email')?.value.trim();
            const msg   = document.getElementById('c-msg')?.value.trim();

            if (!name || !email || !msg) {
                if (typeof UIUtils !== 'undefined') UIUtils.toast('Please fill in all fields.', 'error');
                return;
            }
            const emailOk = (typeof Validators !== 'undefined' && Validators.isValidEmail)
                ? Validators.isValidEmail(email)
                : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!emailOk) {
                if (typeof UIUtils !== 'undefined') UIUtils.toast('Please enter a valid email.', 'error');
                return;
            }

            // Loading state
            const btnText    = submit.querySelector('.btn-text');
            const btnSpinner = submit.querySelector('.btn-spinner');
            submit.disabled  = true;
            if (btnText)    btnText.style.display    = 'none';
            if (btnSpinner) btnSpinner.style.display = 'inline';

            // API call
            if (typeof API !== 'undefined') {
                await API.Support.submitContact({ name, email, message: msg });
            } else {
                await new Promise(r => setTimeout(r, 800));
            }

            // Reset
            submit.disabled  = false;
            if (btnText)    btnText.style.display    = '';
            if (btnSpinner) btnSpinner.style.display = 'none';
            form.reset();

            if (typeof UIUtils !== 'undefined') {
                UIUtils.toast('Message sent! We\'ll get back to you soon.', 'success', 4000);
            }
        });
    }

    /* -- Ripple on .ripple-btn -------------------------------- */
    if (typeof UIUtils !== 'undefined') UIUtils.initRipples();

});
