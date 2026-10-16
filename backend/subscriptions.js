/* =============================================================
   FlexScribe — Subscriptions Backend (client-side data layer)
   backend/subscriptions.js

   Responsibilities:
   • Loads subscription data from SQL Server through API
   • Full CRUD: add, edit, toggle, delete
   • Derived stat recalculation
   • Donut chart data computation by category
   • CSV export
   • All database mutations refresh data from API
   • Exposes a single global SubscriptionStore object
============================================================= */

'use strict';

const SubscriptionStore = (() => {

    /* ----------------------------------------------------------
       CONSTANTS
    ---------------------------------------------------------- */

    const STORAGE_KEY = 'flexscribe_subscriptions';

    const CATEGORIES = [
        'Entertainment',
        'Music',
        'Shopping',
        'Productivity',
        'Education',
        'Utilities',
        'Fitness',
        'News',
        'Gaming',
        'Other'
    ];

    const BILLING_CYCLES = [
        'monthly',
        'yearly',
        'weekly',
        'quarterly'
    ];

    const CATEGORY_COLORS = {
        Entertainment: 'var(--orange)',
        Music:         'var(--green)',
        Shopping:      'var(--blue)',
        Productivity:  'var(--purple)',
        Education:     'var(--yellow)',
        Utilities:     '#22c55e',
        Fitness:       '#f43f5e',
        News:          '#06b6d4',
        Gaming:        '#a855f7',
        Other:         'var(--text-light)',
    };


    /* ----------------------------------------------------------
       PROVIDERS LIBRARY
    ---------------------------------------------------------- */

    /* Prices below are verified South African published prices.
       Multi-tier providers are listed as one entry per plan so each has
       its own exact price and a unique name (works with the per-user
       duplicate guard). Where a provider publishes a range, the mid/entry
       plans are split into named tiers. */
    const PROVIDERS = [

        /* ── Streaming & entertainment ── */
        {
            id: 'prov_netflix_mobile',
            name: 'Netflix Mobile',
            monthlyCost: 59.00,
            category: 'Entertainment',
            description: 'Netflix on one phone or tablet at a time.',
            rating: 4.3,
            logoClass: 'netflix',
            logoText: 'N',
            benefits: ['Watch on mobile', 'Standard definition', 'Downloads for offline'],
        },
        {
            id: 'prov_netflix_standard',
            name: 'Netflix Standard',
            monthlyCost: 159.00,
            category: 'Entertainment',
            description: 'Full HD on two screens at the same time.',
            rating: 4.5,
            logoClass: 'netflix',
            logoText: 'N',
            benefits: ['Full HD (1080p)', 'Watch on 2 devices', 'Downloads for offline'],
        },
        {
            id: 'prov_netflix_premium',
            name: 'Netflix Premium',
            monthlyCost: 229.00,
            category: 'Entertainment',
            description: '4K Ultra HD on up to four screens.',
            rating: 4.6,
            logoClass: 'netflix',
            logoText: 'N',
            benefits: ['4K Ultra HD + HDR', 'Watch on 4 devices', 'Spatial audio'],
        },
        {
            id: 'prov_dstv_starter',
            name: 'DStv Stream Starter',
            monthlyCost: 99.00,
            category: 'Entertainment',
            description: 'Entry streaming package of DStv channels.',
            rating: 3.9,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['Live DStv channels', 'Catch Up library', 'Stream on the go'],
        },
        {
            id: 'prov_dstv_select',
            name: 'DStv Stream Select',
            monthlyCost: 299.00,
            category: 'Entertainment',
            description: 'Wider channel bouquet with more variety.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['More channels', 'Catch Up library', 'Multiple streams'],
        },
        {
            id: 'prov_dstv_sports',
            name: 'DStv Stream Sports',
            monthlyCost: 399.00,
            category: 'Entertainment',
            description: 'Sport-focused DStv streaming package.',
            rating: 4.1,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['Live sport channels', 'SuperSport included', 'Catch Up'],
        },
        {
            id: 'prov_dstv_movies',
            name: 'DStv Stream Movies & Series',
            monthlyCost: 500.00,
            category: 'Entertainment',
            description: 'Movies and series heavy streaming package.',
            rating: 4.1,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['Movie channels', 'Series box sets', 'Catch Up library'],
        },
        {
            id: 'prov_dstv_premium',
            name: 'DStv Stream Premium',
            monthlyCost: 799.00,
            category: 'Entertainment',
            description: 'Full DStv channel line-up, top tier.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['All DStv channels', 'Full sport & movies', 'Multiple streams'],
        },
        {
            id: 'prov_showmax',
            name: 'Showmax',
            monthlyCost: 99.00,
            category: 'Entertainment',
            description: 'Local & international shows, sport, and movies.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'S',
            benefits: ['Local SA content', 'Live sport streaming', 'Download to watch offline'],
        },
        {
            id: 'prov_prime',
            name: 'Amazon Prime',
            monthlyCost: 99.00,
            category: 'Shopping',
            description: 'Free delivery, Prime Video & exclusive deals.',
            rating: 4.4,
            logoClass: 'prime',
            logoText: 'P',
            benefits: ['Free next-day delivery', 'Prime Video included', 'Exclusive deals'],
        },
        {
            id: 'prov_disney',
            name: 'Disney+',
            monthlyCost: 89.00,
            category: 'Entertainment',
            description: 'Disney, Pixar, Marvel, Star Wars & more.',
            rating: 4.3,
            logoClass: 'disney',
            logoText: 'D+',
            benefits: ['Exclusive originals', '4K streaming included', 'Download for offline'],
        },

        /* ── Music ── */
        {
            id: 'prov_spotify_student',
            name: 'Spotify Student',
            monthlyCost: 37.99,
            category: 'Music',
            description: 'Discounted Premium for verified students.',
            rating: 4.5,
            logoClass: 'spotify',
            logoText: 'S',
            benefits: ['Ad-free listening', 'Offline downloads', 'Student discount'],
        },
        {
            id: 'prov_spotify_standard',
            name: 'Spotify Premium',
            monthlyCost: 69.99,
            category: 'Music',
            description: 'Ad-free music & podcasts on demand.',
            rating: 4.6,
            logoClass: 'spotify',
            logoText: 'S',
            benefits: ['Ad-free listening', 'Offline downloads', 'High quality audio'],
        },
        {
            id: 'prov_spotify_platinum',
            name: 'Spotify Platinum',
            monthlyCost: 179.99,
            category: 'Music',
            description: 'Top-tier Spotify plan with extra features.',
            rating: 4.6,
            logoClass: 'spotify',
            logoText: 'S',
            benefits: ['Ad-free listening', 'Offline downloads', 'Premium extras'],
        },
        {
            id: 'prov_apple_music',
            name: 'Apple Music',
            monthlyCost: 59.99,
            category: 'Music',
            description: 'Over 100 million songs with spatial audio.',
            rating: 4.5,
            logoClass: 'apple',
            logoText: '♫',
            benefits: ['Spatial Audio with Dolby', 'Lossless audio quality', '100M+ songs'],
        },
        {
            id: 'prov_youtube_music',
            name: 'YouTube Music',
            monthlyCost: 84.99,
            category: 'Music',
            description: 'Ad-free music streaming and background play.',
            rating: 4.3,
            logoClass: 'youtube',
            logoText: '♫',
            benefits: ['Ad-free music', 'Background play', 'Offline downloads'],
        },
        {
            id: 'prov_youtube_music_family',
            name: 'YouTube Music Family',
            monthlyCost: 129.99,
            category: 'Music',
            description: 'YouTube Music for up to 6 family members.',
            rating: 4.3,
            logoClass: 'youtube',
            logoText: '♫',
            benefits: ['Up to 6 members', 'Ad-free music', 'Background play'],
        },
        {
            id: 'prov_youtube_premium',
            name: 'YouTube Premium',
            monthlyCost: 104.99,
            category: 'Entertainment',
            description: 'Ad-free videos, background play & YouTube Music.',
            rating: 4.4,
            logoClass: 'youtube',
            logoText: '▶',
            benefits: ['No ads on any video', 'Background play', 'YouTube Music included'],
        },
        {
            id: 'prov_youtube_premium_family',
            name: 'YouTube Premium Family',
            monthlyCost: 194.99,
            category: 'Entertainment',
            description: 'YouTube Premium for up to 6 family members.',
            rating: 4.4,
            logoClass: 'youtube',
            logoText: '▶',
            benefits: ['Up to 6 members', 'Ad-free videos', 'YouTube Music included'],
        },

        /* ── Productivity ── */
        {
            id: 'prov_microsoft365_personal',
            name: 'Microsoft 365 Personal',
            monthlyCost: 159.00,
            category: 'Productivity',
            description: 'Office apps + 1TB OneDrive for one person.',
            rating: 4.5,
            logoClass: 'microsoft',
            logoText: 'M',
            benefits: ['All Office apps', '1TB OneDrive storage', 'For 1 person'],
        },
        {
            id: 'prov_microsoft365_family',
            name: 'Microsoft 365 Family',
            monthlyCost: 199.00,
            category: 'Productivity',
            description: 'Office apps + 1TB each for up to 6 people.',
            rating: 4.5,
            logoClass: 'microsoft',
            logoText: 'M',
            benefits: ['All Office apps', '1TB OneDrive per person', 'Up to 6 people'],
        },
        {
            id: 'prov_microsoft365_premium',
            name: 'Microsoft 365 Premium',
            monthlyCost: 429.00,
            category: 'Productivity',
            description: 'Premium Microsoft 365 with advanced features.',
            rating: 4.5,
            logoClass: 'microsoft',
            logoText: 'M',
            benefits: ['All Office apps', 'Advanced security', 'Premium features'],
        },
        {
            id: 'prov_adobe',
            name: 'Adobe CC',
            monthlyCost: 599.00,
            category: 'Productivity',
            description: 'Photoshop, Illustrator, Premiere & 20+ apps.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'A',
            benefits: ['20+ creative apps', '100GB cloud storage', 'Adobe Fonts included'],
        },
        {
            id: 'prov_chatgpt',
            name: 'ChatGPT Plus',
            monthlyCost: 349.00,
            category: 'Productivity',
            description: 'GPT-4o access, DALL-E, plugins & priority.',
            rating: 4.7,
            logoClass: 'default',
            logoText: 'C',
            benefits: ['GPT-4o access', 'DALL-E image generation', 'Priority access'],
        },
        {
            id: 'prov_google_ai_ultra',
            name: 'Google AI Ultra',
            monthlyCost: 1859.99,
            category: 'Productivity',
            description: 'Google\'s top-tier AI plan with Gemini.',
            rating: 4.4,
            logoClass: 'default',
            logoText: 'G',
            benefits: ['Highest Gemini limits', 'Advanced AI models', 'Extra storage'],
        },
        {
            id: 'prov_canva',
            name: 'Canva Pro',
            monthlyCost: 149.00,
            category: 'Productivity',
            description: 'Premium templates, brand kits & magic tools.',
            rating: 4.6,
            logoClass: 'default',
            logoText: 'C',
            benefits: ['Premium templates', 'Brand kit', 'Magic resize'],
        },
        {
            id: 'prov_github',
            name: 'GitHub Pro',
            monthlyCost: 74.00,
            category: 'Productivity',
            description: 'Advanced code review, CI minutes & insights.',
            rating: 4.4,
            logoClass: 'default',
            logoText: 'G',
            benefits: ['Advanced code review', '3000 CI minutes', 'Required reviewers'],
        },
        {
            id: 'prov_dropbox',
            name: 'Dropbox',
            monthlyCost: 199.00,
            category: 'Utilities',
            description: '2TB cloud storage with smart sync & sharing.',
            rating: 4.1,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['2TB cloud storage', 'Smart sync', 'File recovery'],
        },
        {
            id: 'prov_nordvpn',
            name: 'NordVPN',
            monthlyCost: 89.00,
            category: 'Utilities',
            description: 'Fast & secure VPN with threat protection.',
            rating: 4.5,
            logoClass: 'default',
            logoText: 'N',
            benefits: ['5500+ servers', 'Threat protection', '6 simultaneous devices'],
        },

        /* ── Gaming ── */
        {
            id: 'prov_xbox_essential',
            name: 'Xbox Game Pass Essential',
            monthlyCost: 139.00,
            category: 'Gaming',
            description: 'Entry Game Pass with a library of games.',
            rating: 4.2,
            logoClass: 'default',
            logoText: 'X',
            benefits: ['Game library access', 'Online multiplayer', 'Member deals'],
        },
        {
            id: 'prov_xbox_premium',
            name: 'Xbox Game Pass Premium',
            monthlyCost: 199.00,
            category: 'Gaming',
            description: 'Larger Game Pass library and benefits.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'X',
            benefits: ['Bigger game library', 'Online multiplayer', 'Member deals'],
        },
        {
            id: 'prov_pc_game_pass',
            name: 'PC Game Pass',
            monthlyCost: 209.00,
            category: 'Gaming',
            description: 'Hundreds of PC games plus EA Play.',
            rating: 4.4,
            logoClass: 'default',
            logoText: 'P',
            benefits: ['Hundreds of PC games', 'EA Play included', 'Day-one releases'],
        },
        {
            id: 'prov_xbox_ultimate',
            name: 'Xbox Game Pass Ultimate',
            monthlyCost: 239.00,
            category: 'Gaming',
            description: 'Console + PC + cloud gaming, all in one.',
            rating: 4.6,
            logoClass: 'default',
            logoText: 'X',
            benefits: ['Console, PC & cloud', 'Day-one releases', 'EA Play included'],
        },

        /* ── Connectivity ── */
        {
            id: 'prov_rain_loop',
            name: 'Rain Unlimited Loop',
            monthlyCost: 399.00,
            category: 'Utilities',
            description: 'Rain entry unlimited connectivity plan.',
            rating: 3.8,
            logoClass: 'default',
            logoText: 'R',
            benefits: ['Unlimited data', 'No contract', '5G where available'],
        },
        {
            id: 'prov_rain_mobile',
            name: 'Rain Unlimited Mobile',
            monthlyCost: 595.00,
            category: 'Utilities',
            description: 'Unlimited mobile data from Rain.',
            rating: 3.9,
            logoClass: 'default',
            logoText: 'R',
            benefits: ['Unlimited mobile data', 'No contract', '4G/5G coverage'],
        },
        {
            id: 'prov_rain_home',
            name: 'Rain Unlimited 5G Home Wi-Fi',
            monthlyCost: 679.00,
            category: 'Utilities',
            description: 'Unlimited 5G home Wi-Fi from Rain.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'R',
            benefits: ['Unlimited 5G home data', 'No contract', 'Fast speeds'],
        },
        {
            id: 'prov_rain_one',
            name: 'Rain Unlimited Rain One',
            monthlyCost: 995.00,
            category: 'Utilities',
            description: 'Rain One bundle: home 5G plus mobile.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'R',
            benefits: ['Home 5G + mobile', 'Unlimited data', 'Single bill'],
        },

        /* ── Fitness ── */
        {
            id: 'prov_virgin_youth',
            name: 'Virgin Active Youth (18–23)',
            monthlyCost: 880.00,
            category: 'Fitness',
            description: 'Youth gym membership (24-month plan).',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'V',
            benefits: ['Full club access', 'Group classes', 'Ages 18–23'],
        },
        {
            id: 'prov_virgin_premier',
            name: 'Virgin Active Premier',
            monthlyCost: 1460.00,
            category: 'Fitness',
            description: 'Premier gym membership (24-month plan).',
            rating: 4.1,
            logoClass: 'default',
            logoText: 'V',
            benefits: ['All-club access', 'Group classes', 'Pool & spa'],
        },
        {
            id: 'prov_planet_fitness',
            name: 'Planet Fitness National',
            monthlyCost: 1600.00,
            category: 'Fitness',
            description: 'National gym membership across all clubs.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'P',
            benefits: ['National club access', 'Group classes', 'Full gym facilities'],
        },
        {
            id: 'prov_discovery_vitality',
            name: 'Discovery Vitality',
            monthlyCost: 349.00,
            category: 'Fitness',
            description: 'Rewards programme for a healthier lifestyle.',
            rating: 4.1,
            logoClass: 'default',
            logoText: 'V',
            benefits: ['Gym & health rewards', 'Discounts & cashback', 'Fitness tracking'],
        },
        {
            id: 'prov_strava',
            name: 'Strava Premium',
            monthlyCost: 149.00,
            category: 'Fitness',
            description: 'Advanced training & route analytics for athletes.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'S',
            benefits: ['Advanced analytics', 'Route planning', 'Training plans'],
        },

        /* ── Shopping ── */
        {
            id: 'prov_takealot_plus',
            name: 'Takealot Plus',
            monthlyCost: 39.00,
            category: 'Shopping',
            description: 'Free delivery on eligible Takealot orders.',
            rating: 4.2,
            logoClass: 'default',
            logoText: 'T',
            benefits: ['Free delivery', 'Member-only deals', 'Early access to sales'],
        },
        {
            id: 'prov_woolies_dash',
            name: 'Woolies Dash',
            monthlyCost: 99.00,
            category: 'Shopping',
            description: 'On-demand grocery delivery from Woolworths.',
            rating: 4.1,
            logoClass: 'default',
            logoText: 'W',
            benefits: ['60-min delivery', 'Fresh groceries', 'Wide product range'],
        },
        {
            id: 'prov_mrd_mrdfood',
            name: 'Mr D Plus',
            monthlyCost: 49.00,
            category: 'Shopping',
            description: 'Free delivery on food and groceries via Mr D.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'M',
            benefits: ['Free delivery', 'Exclusive offers', 'Priority support'],
        },

        /* ── Education ── */
        {
            id: 'prov_duolingo_super',
            name: 'Duolingo Super',
            monthlyCost: 129.00,
            category: 'Education',
            description: 'Ad-free language learning with unlimited hearts.',
            rating: 4.5,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['No ads', 'Unlimited hearts', 'Personalised practice'],
        },
        {
            id: 'prov_udemy',
            name: 'Udemy Personal Plan',
            monthlyCost: 299.00,
            category: 'Education',
            description: 'Access thousands of professional courses.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'U',
            benefits: ['10,000+ courses', 'Certificates', 'Learn at your pace'],
        },
        {
            id: 'prov_coursera_plus',
            name: 'Coursera Plus',
            monthlyCost: 999.00,
            category: 'Education',
            description: 'Unlimited access to 7,000+ courses & certs.',
            rating: 4.4,
            logoClass: 'default',
            logoText: 'C',
            benefits: ['7,000+ courses', 'Professional certificates', 'University content'],
        },
        {
            id: 'prov_skillshare',
            name: 'Skillshare',
            monthlyCost: 199.00,
            category: 'Education',
            description: 'Creative classes in design, business & more.',
            rating: 4.2,
            logoClass: 'default',
            logoText: 'S',
            benefits: ['Creative classes', 'Project-based learning', 'Offline viewing'],
        },

        /* ── News ── */
        {
            id: 'prov_news24',
            name: 'News24',
            monthlyCost: 75.00,
            category: 'News',
            description: 'South Africa\'s leading news, ad-light.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'N',
            benefits: ['Breaking SA news', 'Ad-light reading', 'Exclusive columns'],
        },
        {
            id: 'prov_dailymaverick',
            name: 'Daily Maverick Insider',
            monthlyCost: 150.00,
            category: 'News',
            description: 'Support independent SA investigative journalism.',
            rating: 4.2,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['In-depth journalism', 'Member events', 'Ad-free option'],
        },
        {
            id: 'prov_nyt',
            name: 'The New York Times',
            monthlyCost: 120.00,
            category: 'News',
            description: 'Global news, analysis, cooking & games.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'T',
            benefits: ['Global reporting', 'Cooking & games', 'Unlimited articles'],
        },

        /* ── Utilities / Cloud ── */
        {
            id: 'prov_google_one',
            name: 'Google One',
            monthlyCost: 34.99,
            category: 'Utilities',
            description: 'Expanded cloud storage across Google apps.',
            rating: 4.4,
            logoClass: 'default',
            logoText: 'G',
            benefits: ['100GB+ storage', 'Shared with family', 'Google support'],
        },
        {
            id: 'prov_icloud',
            name: 'iCloud+',
            monthlyCost: 17.99,
            category: 'Utilities',
            description: 'Apple cloud storage with Private Relay.',
            rating: 4.3,
            logoClass: 'apple',
            logoText: '',
            benefits: ['Secure cloud storage', 'Private Relay', 'Hide My Email'],
        },
        {
            id: 'prov_expressvpn',
            name: 'ExpressVPN',
            monthlyCost: 229.00,
            category: 'Utilities',
            description: 'High-speed VPN with servers worldwide.',
            rating: 4.4,
            logoClass: 'default',
            logoText: 'E',
            benefits: ['Servers in 90+ countries', 'No activity logs', '8 devices'],
        },

        /* ── Other ── */
        {
            id: 'prov_audible',
            name: 'Audible',
            monthlyCost: 120.00,
            category: 'Other',
            description: 'Audiobooks and originals, one credit a month.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'A',
            benefits: ['1 audiobook credit/mo', 'Audible Originals', 'Keep your books'],
        },
        {
            id: 'prov_patreon',
            name: 'Patreon',
            monthlyCost: 85.00,
            category: 'Other',
            description: 'Support your favourite creators monthly.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'P',
            benefits: ['Exclusive content', 'Creator perks', 'Community access'],
        },
    ];


    /* ----------------------------------------------------------
       PRIVATE STATE
    ---------------------------------------------------------- */

    let _subs = [];
    let _listeners = [];
    let _loaded = false;
    let _loadPromise = null;


    /* ----------------------------------------------------------
       LOAD DATA FROM SQL SERVER API
    ---------------------------------------------------------- */

    async function loadFromAPI() {

        if (typeof API === 'undefined') {
            console.error(
                'SubscriptionStore: API module not available.'
            );

            throw new Error('API not available');
        }

        const result = await API.Subscriptions.getAll();

        if (!result.success) {
            throw new Error(
                result.error || 'Failed to load subscriptions'
            );
        }

        const apiData = Array.isArray(result.data)
            ? result.data
            : (result.data?.data || []);

        _subs = apiData.map(function (s) {

            return {
                id: String(s.subscriptionID || s.id),

                name: s.serviceName || s.name || '',

                category: s.categoryName || s.category || 'Other',

                amount: parseFloat(s.billingAmount || s.amount) || 0,

                billingCycle: s.billingCycle || 'monthly',

                nextPaymentDate: s.billingDate
                    ? s.billingDate.split('T')[0]
                    : (s.nextPaymentDate || ''),

                active: s.subStatus
                    ? s.subStatus === 'active'
                    : (s.active !== undefined ? s.active : true),

                logoClass: s.logoClass || 'default',

                logoText: s.logoText ||
                    (s.serviceName || s.name || '?')
                        .charAt(0)
                        .toUpperCase(),

                notes: s.notes || '',

                createdAt: s.createdAt || '',

                customLogo: s.customLogo || '',

                colourTag: s.colorTag || s.colourTag || '',

                reminderDays: s.reminderDays || null,

                providerUrl: s.providerUrl || ''
            };
        });

        _loaded = true;

        // Notify UI that fresh database data is available.
        _listeners.forEach(function (fn) {
            fn(getStats());
        });

        return _subs;
    }


    /* ----------------------------------------------------------
       CHANGE NOTIFICATION
    ---------------------------------------------------------- */

    function _notify() {

        _listeners.forEach(function (fn) {
            fn(getStats());
        });
    }


    function onChange(fn) {

        if (typeof fn !== 'function') {
            return;
        }

        _listeners.push(fn);
    }


    function offChange(fn) {

        _listeners = _listeners.filter(function (listener) {
            return listener !== fn;
        });
    }


    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    function _uid() {

        return 'sub_' +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 6);
    }


    function _toMonthly(amount, cycle) {

        switch (cycle) {

            case 'weekly':
                return amount * 52 / 12;

            case 'monthly':
                return amount;

            case 'quarterly':
                return amount / 3;

            case 'yearly':
                return amount / 12;

            default:
                return amount;
        }
    }


    const CATEGORY_ID_MAP = {
        'Entertainment': 1, 'Music': 2, 'Shopping': 3, 'Productivity': 4,
        'Education': 5, 'Utilities': 6, 'Fitness': 7, 'News': 8,
        'Gaming': 9, 'Health': 10, 'AI': 11, 'Other': 12
    };

    function _categoryToID(categoryName) {
        return CATEGORY_ID_MAP[categoryName] || 12; // default to 'Other'
    }

    function _fmtDate(iso) {

        const d = _parseLocalDate(iso);
        if (!d) return '—';

        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }


    /* ----------------------------------------------------------
       DATE HELPERS — local timezone, no UTC shift bugs
    ---------------------------------------------------------- */

    /* Parse a stored date into a LOCAL Date at midnight. Handles:
       - "yyyy-mm-dd"            (parsed as local, NOT UTC)
       - full ISO timestamps     ("...T..Z")
       - Date objects / epoch ms
       Returns null for missing/invalid input (never an Invalid Date). */
    function _parseLocalDate(raw) {
        if (raw === null || raw === undefined || raw === '') return null;

        let d;
        if (raw instanceof Date) {
            d = new Date(raw.getTime());
        } else if (typeof raw === 'number') {
            d = new Date(raw);
        } else {
            const str = String(raw).trim();
            if (!str) return null;
            const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (m) {
                // Local date — avoids new Date("2026-10-05") being UTC.
                d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            } else {
                d = new Date(str);
            }
        }

        if (!d || isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /* Format a Date back to "yyyy-mm-dd" in local time (for inputs/anchors). */
    function _toISODate(d) {
        if (!d || isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /* THE shared helper. Returns the next payment Date for a subscription,
       or null when it shouldn't show one.

       Rules:
       - Paused / cancelled / inactive  -> null.
       - Active: advance the stored anchor date by the billing cycle (by
         CALENDAR units) until it is today or later. Always computed from
         the ORIGINAL anchor day so month-end rolls correctly
         (Jan 31 -> Feb 28 -> Mar 31, never Mar 28).
       - Invalid / missing anchor -> null. */
    function _getNextPaymentDate(sub, today) {
        if (!sub) return null;

        const isActive = (sub.active !== undefined)
            ? !!sub.active
            : (sub.subStatus ? sub.subStatus === 'active' : true);
        if (!isActive) return null;

        const anchor = _parseLocalDate(sub.nextPaymentDate);
        if (!anchor) return null;

        const base = today ? _parseLocalDate(today) : null;
        const ref = base || (function () { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();

        // Already today or in the future — use as-is.
        if (anchor.getTime() >= ref.getTime()) return anchor;

        const cycle = sub.billingCycle || 'monthly';
        const anchorDay = anchor.getDate();

        // Weekly advances by fixed 7-day steps.
        if (cycle === 'weekly') {
            const d = new Date(anchor.getTime());
            let guard = 0;
            while (d.getTime() < ref.getTime() && guard < 1000) {
                d.setDate(d.getDate() + 7);
                guard++;
            }
            return d;
        }

        // Month-based cycles (monthly / quarterly / yearly) — step whole
        // months from the ORIGINAL anchor, clamping the day to month-end.
        const monthStep = cycle === 'yearly' ? 12 : cycle === 'quarterly' ? 3 : 1;
        let n = 0;
        let candidate = new Date(anchor.getTime());
        let guard = 0;
        while (candidate.getTime() < ref.getTime() && guard < 4000) {
            n += monthStep;
            candidate = _addMonthsFromAnchor(anchor.getFullYear(), anchor.getMonth(), anchorDay, n);
            guard++;
        }
        return candidate;
    }

    /* Add `monthsToAdd` months to (year, month, anchorDay), clamping the day
       to the last day of the target month when the anchor day doesn't exist
       (e.g. 31 -> 28/29/30). Always computed from the original anchor day. */
    function _addMonthsFromAnchor(year, month, anchorDay, monthsToAdd) {
        const total = month + monthsToAdd;
        const targetYear = year + Math.floor(total / 12);
        const targetMonth = ((total % 12) + 12) % 12;
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        const day = Math.min(anchorDay, lastDay);
        const d = new Date(targetYear, targetMonth, day);
        d.setHours(0, 0, 0, 0);
        return d;
    }


    function _daysUntil(iso) {

        const then = _parseLocalDate(iso);
        if (!then) return null;

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return Math.round(
            (then - now) / 86400000
        );
    }


    function _fmtCurrency(val) {

        return 'R' +
            val
                .toFixed(2)
                .replace(
                    /\B(?=(\d{3})+(?!\d))/g,
                    ','
                );
    }


    /* ----------------------------------------------------------
       READ
    ---------------------------------------------------------- */

    function getAll() {

        return [..._subs];
    }


    function getActive() {

        return _subs.filter(function (s) {
            return s.active;
        });
    }


    function getById(id) {

        return _subs.find(function (s) {
            return s.id === id;
        }) || null;
    }


    /* ----------------------------------------------------------
       STATISTICS
    ---------------------------------------------------------- */

    function getStats() {

        const active = getActive();

        const monthly = active.reduce(
            function (sum, s) {

                return sum +
                    _toMonthly(
                        s.amount,
                        s.billingCycle
                    );
            },
            0
        );

        const annual = monthly * 12;


        // Potential savings from inactive subscriptions
        const inactive = _subs.filter(function (s) {
            return !s.active;
        });

        const savings =
            inactive.reduce(
                function (sum, s) {

                    return sum +
                        _toMonthly(
                            s.amount,
                            s.billingCycle
                        );
                },
                0
            ) * 12;


        // Upcoming payments in next 30 days
        const _todayMid = (function () { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();

        const upcoming = active
            .map(function (s) {
                // Attach the rolled-forward next date (never a past date).
                const next = _getNextPaymentDate(s, _todayMid);
                return next
                    ? Object.assign({}, s, { nextPaymentDate: _toISODate(next), _nextDate: next })
                    : null;
            })
            .filter(function (s) {
                if (!s) return false;
                const d = Math.round((s._nextDate - _todayMid) / 86400000);
                return d >= 0 && d <= 30;
            })
            .sort(function (a, b) {
                return a._nextDate - b._nextDate;
            });


        // Category breakdown
        const byCategory = {};

        active.forEach(function (s) {

            const m = _toMonthly(
                s.amount,
                s.billingCycle
            );

            byCategory[s.category] =
                (byCategory[s.category] || 0) + m;
        });


        const categorySlices =
            Object.entries(byCategory)
                .sort(function (a, b) {
                    return b[1] - a[1];
                })
                .map(function ([cat, amt]) {

                    return {
                        category: cat,

                        amount: amt,

                        pct: monthly > 0
                            ? Math.round(
                                (amt / monthly) * 100
                            )
                            : 0,

                        color:
                            CATEGORY_COLORS[cat] ||
                            CATEGORY_COLORS.Other,
                    };
                });


        return {

            activeCount: active.length,

            totalCount: _subs.length,

            monthly,

            annual,

            savings: Math.max(
                0,
                savings
            ),

            upcoming,

            byCategory: categorySlices,

            all: getAll(),

            fmtMonthly:
                _fmtCurrency(monthly),

            fmtAnnual:
                _fmtCurrency(annual),

            fmtSavings:
                _fmtCurrency(
                    Math.max(0, savings)
                ),
        };
    }


    /* ----------------------------------------------------------
       WRITE — ADD
    ---------------------------------------------------------- */

    async function add(fields) {

        // Client-side duplicate guard (case-insensitive) — fail fast with a
        // friendly message before hitting the API. The backend enforces this
        // too as the authoritative check.
        const incomingName = (fields.name || '').trim().toLowerCase();
        if (incomingName && _subs.some(function (s) {
            return (s.name || '').trim().toLowerCase() === incomingName;
        })) {
            throw new Error('You already have a "' + (fields.name || '').trim() + '" subscription.');
        }

        const sub = {

            serviceName:
                (fields.name || '').trim(),

            categoryID:
                _categoryToID(fields.category || 'Other'),

            billingAmount:
                parseFloat(fields.amount) || 0,

            billingCycle:
                fields.billingCycle || 'monthly',

            billingDate:
                fields.nextPaymentDate || null,

            notes:
                (fields.notes || '').trim(),

            logoClass:
                fields.logoClass || 'default',

            logoText:
                fields.logoText ||
                (fields.name || '?')
                    .charAt(0)
                    .toUpperCase(),

            colorTag:
                fields.colourTag || null,

            reminderDays:
                fields.reminderDays ? parseInt(fields.reminderDays) : null,

            providerUrl:
                fields.providerUrl || null
        };


        if (!sub.serviceName) {

            throw new Error(
                'Subscription name is required.'
            );
        }


        if (sub.billingAmount <= 0) {

            throw new Error(
                'Amount must be greater than zero.'
            );
        }


        if (!sub.billingDate) {

            throw new Error(
                'Billing date is required.'
            );
        }


        {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const selected = new Date(sub.billingDate + 'T00:00:00');
            if (selected < today) {
                throw new Error(
                    'Billing date cannot be in the past.'
                );
            }
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }


        // Send to SQL Server
        const result =
            await API.Subscriptions.add(sub);


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to add subscription.'
            );
        }


        // Reload from SQL Server
        await loadFromAPI();

        // Adding a subscription awards +10 (Subscription Management) — refresh
        // the Scribe Score + contextual tip to reflect it.
        try { if (window.ScribeScore) window.ScribeScore.refresh({ delta: 10, toast: 'Subscription added — ScribeScore +10' }); } catch (e) {}

        // Return actual database record
        return result.data;
    }


    /* ----------------------------------------------------------
       WRITE — EDIT
    ---------------------------------------------------------- */

    async function edit(id, fields) {

        const existing =
            _subs.find(function (s) {
                return s.id === id;
            });


        if (!existing) {
            return null;
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }

        // Map frontend field names to backend column names
        const mapped = {};
        if (fields.name !== undefined) mapped.serviceName = fields.name;
        if (fields.category !== undefined) mapped.categoryID = _categoryToID(fields.category);
        if (fields.amount !== undefined) mapped.billingAmount = parseFloat(fields.amount);
        if (fields.billingCycle !== undefined) mapped.billingCycle = fields.billingCycle;
        if (fields.nextPaymentDate !== undefined) mapped.billingDate = fields.nextPaymentDate || null;
        if (fields.notes !== undefined) mapped.notes = fields.notes || null;
        if (fields.logoClass !== undefined) mapped.logoClass = fields.logoClass;
        if (fields.logoText !== undefined) mapped.logoText = fields.logoText;
        if (fields.colourTag !== undefined) mapped.colorTag = fields.colourTag || null;
        if (fields.reminderDays !== undefined) mapped.reminderDays = fields.reminderDays ? parseInt(fields.reminderDays) : null;
        if (fields.providerUrl !== undefined) mapped.providerUrl = fields.providerUrl || null;

        const result =
            await API.Subscriptions.edit(
                id,
                mapped
            );


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to edit subscription.'
            );
        }


        await loadFromAPI();

        // A meaningful edit can award +5 (Subscription Management) once/month —
        // refresh the Scribe Score + tip (no-op if the backend didn't award).
        try { if (window.ScribeScore) window.ScribeScore.refresh(); } catch (e) {}

        return getById(id);
    }


    /* ----------------------------------------------------------
       WRITE — TOGGLE ACTIVE / PAUSED
    ---------------------------------------------------------- */

    async function toggle(id) {

        const existing =
            _subs.find(function (s) {
                return s.id === id;
            });


        if (!existing) {
            return null;
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }


        const result =
            await API.Subscriptions.toggle(id);


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to toggle subscription.'
            );
        }


        await loadFromAPI();


        return getById(id);
    }


    /* ----------------------------------------------------------
       WRITE — DELETE
    ---------------------------------------------------------- */

    async function remove(id) {

        const existing =
            _subs.find(function (s) {
                return s.id === id;
            });


        if (!existing) {
            return false;
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }


        const result =
            await API.Subscriptions.remove(id);


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to delete subscription.'
            );
        }


        await loadFromAPI();

        // Recording a cancellation awards +10 (Subscription Management) —
        // refresh the Scribe Score + contextual tip.
        try { if (window.ScribeScore) window.ScribeScore.refresh({ delta: 10, toast: 'Cancellation recorded — ScribeScore +10' }); } catch (e) {}

        return true;
    }


    /* ----------------------------------------------------------
       EXPORT — CSV
    ---------------------------------------------------------- */

    function exportCSV() {

        const headers = [
            'Name',
            'Category',
            'Amount',
            'Billing Cycle',
            'Next Payment',
            'Status',
            'Notes'
        ];


        const rows = _subs.map(function (s) {

            return [

                `"${s.name}"`,

                s.category,

                s.amount.toFixed(2),

                s.billingCycle,

                s.nextPaymentDate,

                s.active
                    ? 'Active'
                    : 'Paused',

                `"${s.notes}"`
            ];
        });


        const csv =
            [
                headers.join(','),
                ...rows.map(function (r) {
                    return r.join(',');
                })
            ].join('\n');


        const blob =
            new Blob(
                [csv],
                { type: 'text/csv' }
            );


        const url =
            URL.createObjectURL(blob);


        const a =
            document.createElement('a');


        a.href = url;

        a.download =
            `flexscribe-subscriptions-${
                new Date()
                    .toISOString()
                    .slice(0, 10)
            }.csv`;


        a.click();


        URL.revokeObjectURL(url);
    }


    /* ----------------------------------------------------------
       SORT
    ---------------------------------------------------------- */

    function sort(key, dir = 'asc') {

        _subs.sort(function (a, b) {

            let av;
            let bv;


            if (key === 'amount') {

                av =
                    _toMonthly(
                        a.amount,
                        a.billingCycle
                    );

                bv =
                    _toMonthly(
                        b.amount,
                        b.billingCycle
                    );

            } else if (key === 'date') {

                av =
                    a.nextPaymentDate || '';

                bv =
                    b.nextPaymentDate || '';

            } else if (key === 'category') {

                av = a.category;

                bv = b.category;

            } else {

                av =
                    a.name.toLowerCase();

                bv =
                    b.name.toLowerCase();
            }


            if (av < bv) {

                return dir === 'asc'
                    ? -1
                    : 1;
            }


            if (av > bv) {

                return dir === 'asc'
                    ? 1
                    : -1;
            }


            return 0;
        });


        _notify();
    }


    /* ----------------------------------------------------------
       RECOMMENDATIONS
    ---------------------------------------------------------- */

    function getProviders() {

        return [...PROVIDERS];
    }


    function getRecommendations() {

        const subscribedNames =
            new Set(
                _subs.map(function (s) {
                    return s.name
                        .toLowerCase()
                        .trim();
                })
            );


        return PROVIDERS.filter(
            function (p) {

                return !subscribedNames.has(
                    p.name
                        .toLowerCase()
                        .trim()
                );
            }
        );
    }


    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */

    // No seed data — real data loaded from FlexScribeDB via loadFromAPI()
    _subs = [];

    return Object.freeze({

        // Data access
        getAll,
        getActive,
        getById,
        getStats,
        getProviders,
        getRecommendations,

        // Database mutations
        add,
        edit,
        toggle,
        remove,
        sort,

        // Database loading
        loadFromAPI,

        // Export
        exportCSV,

        // Events
        onChange,
        offChange,

        // Constants
        CATEGORIES,
        BILLING_CYCLES,
        CATEGORY_COLORS,
        PROVIDERS,

        // Utilities
        fmtDate: _fmtDate,
        fmtCurrency: _fmtCurrency,
        daysUntil: _daysUntil,
        getNextPaymentDate: _getNextPaymentDate,
        parseLocalDate: _parseLocalDate,
        toISODate: _toISODate,
    });

})();