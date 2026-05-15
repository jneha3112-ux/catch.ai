/**
 * Catch.ai | Neural Dashboard Core Logic
 * Cleaned and modularized for high-performance iteration.
 */

// Global State
let currentUserPlan = 'free';

// ── DASHBOARD NAVIGATION ──────────────────────────────────────────
function switchTab(tabId) {
    console.log("Switching to tab:", tabId);

    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Deactivate all nav buttons
    document.querySelectorAll('.nav-tab-link').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show target tab
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) {
        targetTab.classList.add('active');

        // GSAP Reveal for content
        gsap.from(targetTab.children, {
            y: 20,
            opacity: 0,
            duration: 0.5,
            stagger: 0.1,
            ease: "power2.out"
        });
    }

    // Activate target button
    const targetBtn = document.querySelector(`[data-tab-btn="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    // Update Header Title
    const titles = {
        'overview': 'Business Intelligence',
        'inbox': 'Visual Triage Hub',
        'kb': 'Neural Knowledge',
        'connections': 'Clinic Integration',
        'billing': 'System License',
        'profile': 'Operator Profile'
    };
    const headerTitle = document.getElementById('header-title');
    if (headerTitle && titles[tabId]) headerTitle.innerText = titles[tabId];

    // Re-run icons
    if (window.lucide) try { lucide.createIcons(); } catch (e) { }
}

// ── AUTH & SESSION ──────────────────────────────────────────────────
async function handleSignOut() {
    showToast("Signing out of Neural Hub...", "info");
    setTimeout(async () => {
        try {
            if (window.sb) await window.sb.auth.signOut();
        } catch (e) { console.error('Sign-out error:', e); }

        // Clear local storage prefix as fallback
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-')) localStorage.removeItem(key);
        });
        window.location.href = 'auth.html';
    }, 1000);
}

// ── SUBSCRIPTION & FEATURE GATING ────────────────────────────────────
async function initSubscriptionSystem() {
    console.log("Dashboard: initSubscriptionSystem starting...");
    try {
        if (!window.sb || !window.sb.auth) {
            console.error('Supabase auth module missing');
            return;
        }

        const { data: { session } } = await window.sb.auth.getSession();
        if (!session) {
            window.location.href = 'auth.html';
            return;
        }

        const user = session.user;

        // Fetch or Create Profile
        let profile = null;
        const { data: existingProfile, error: fetchError } = await window.sb.from('profiles').select('*').eq('id', user.id).single();

        if (fetchError && fetchError.code === 'PGRST116') {
            const newProfileData = {
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || '',
                clinic_name: user.user_metadata?.clinic_name || '',
                plan: 'free',
                trial_start: new Date().toISOString(),
                subscription_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
            };
            const { data: newProfile } = await window.sb.from('profiles').insert([newProfileData]).select().single();
            profile = newProfile;
        } else {
            profile = existingProfile;
        }

        currentUserPlan = profile?.plan || 'free';

        // Populate UI
        populateProfileUI(profile, user);
        await loadRealStats(window.sb, user.id);

        // Check Onboarding
        const isComplete = profile?.full_name?.trim() && profile?.clinic_name?.trim() && profile?.phone?.trim();
        if (!isComplete) {
            setTimeout(() => showOnboarding('1'), 800);
        } else if (!sessionStorage.getItem('catch_welcome_shown')) {
            setTimeout(() => showOnboarding('2'), 800);
        }

        // Handle Redirects (PayPal)
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment');
        if (paymentStatus && paymentStatus.includes('success')) {
            const plan = paymentStatus.includes('pro') ? 'pro' : 'starter';
            const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            await window.sb.from('profiles').upsert({ id: user.id, plan: plan, subscription_end: thirtyDays });
            currentUserPlan = plan;
            window.history.replaceState({}, document.title, "dashboard.html");
            showToast(`Payment Successful! Welcome to Catch.ai ${plan.toUpperCase()}.`, "success");
        }

        applyFeatureGating(currentUserPlan);
        startTrialTimer(profile, user);

    } catch (e) {
        console.error("Subscription system failed:", e);
    }
}

function startTrialTimer(profile, user) {
    const runTimer = () => {
        const timerEl = document.getElementById('trial-timer-display');
        const planLabelEl = document.getElementById('billing-plan-label');
        if (!timerEl) return;

        if (currentUserPlan === 'pro' || currentUserPlan === 'starter') {
            const endDate = profile?.subscription_end ? new Date(profile.subscription_end).toLocaleDateString() : 'Active';
            timerEl.innerText = endDate;
            timerEl.classList.add('text-[#10b981]');
            if (planLabelEl) planLabelEl.innerText = currentUserPlan.toUpperCase() + ' PLAN';
            return;
        }

        const startDate = new Date(profile?.trial_start || user.created_at);
        const expiryDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);
        const diff = expiryDate - new Date();

        if (diff <= 0) {
            document.getElementById('trial-lock-modal')?.classList.add('is-active');
            timerEl.innerText = "Expired";
            return;
        }

        const hrs = Math.floor((diff / (1000 * 60 * 60)));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        timerEl.innerText = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    runTimer();
    setInterval(runTimer, 1000);
}

// ── PROFILE MANAGEMENT ───────────────────────────────────────────────
function populateProfileUI(profile, user) {
    if (!profile && !user) return;

    const name = profile?.full_name || user?.user_metadata?.full_name || '';
    const clinic = profile?.clinic_name || user?.user_metadata?.clinic_name || '';
    const phone = profile?.phone || '';
    const gender = profile?.gender || 'female';
    const dob = profile?.dob || '';

    // Header display
    const headerName = document.getElementById('user-display-name');
    const headerClinic = document.getElementById('sidebar-user-clinic');
    if (headerName) headerName.innerText = name || 'Anonymous Operator';
    if (headerClinic) headerClinic.innerText = clinic || 'Unitialized System';

    // Profile tab
    const pName = document.getElementById('profile-display-name');
    const pClinic = document.getElementById('profile-display-clinic');
    const pEmail = document.getElementById('profile-display-email');
    const pBadge = document.getElementById('profile-plan-badge');

    if (pName) pName.innerText = name || 'Clinic Operator';
    if (pClinic) pClinic.innerText = clinic || 'Awaiting calibration...';
    if (pEmail) pEmail.innerText = user?.email || '—';

    if (pBadge) {
        const plan = profile?.plan || 'free';
        pBadge.innerText = plan.toUpperCase() + (plan === 'free' ? ' TRIAL' : ' PLAN');
        pBadge.className = `text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border ${plan === 'pro' ? 'border-[#10b981] text-[#10b981]' : plan === 'starter' ? 'border-blue-400 text-blue-400' : 'border-white/20 text-white/40'}`;
    }

    // Inputs
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('profile-name', name);
    setVal('profile-clinic', clinic);
    setVal('profile-phone', phone);
    setVal('profile-gender', gender);
    setVal('profile-dob', dob);
    setVal('profile-email', user?.email || '');
}

async function saveProfile() {
    const btn = document.querySelector('button[onclick="saveProfile()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="animate-spin w-4 h-4 rounded-full border-2 border-white/20 border-t-white"></i> Saving...';
    }

    try {
        const { data: { session } } = await window.sb.auth.getSession();
        const updates = {
            id: session.user.id,
            full_name: document.getElementById('profile-name').value,
            clinic_name: document.getElementById('profile-clinic').value,
            phone: document.getElementById('profile-phone').value,
            gender: document.getElementById('profile-gender').value,
            dob: document.getElementById('profile-dob').value,
            updated_at: new Date().toISOString(),
        };

        const { error } = await window.sb.from('profiles').upsert(updates);
        if (error) throw error;

        populateProfileUI(updates, session.user);
        showToast("Profile updated successfully! 🦾", "success");
    } catch (err) {
        showToast("Failed to save: " + err.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save Changes';
            if (window.lucide) lucide.createIcons();
        }
    }
}

// ── ONBOARDING LOGIC ────────────────────────────────────────────────
function showOnboarding(step = '1') {
    const overlay = document.getElementById('onboarding-overlay');
    const step1 = document.getElementById('onboarding-step-1');
    const step2 = document.getElementById('onboarding-step-2');
    if (!overlay || !step1 || !step2) return;

    overlay.classList.add('active');
    if (step === '2') {
        step1.classList.remove('active');
        step2.classList.add('active');
        sessionStorage.setItem('catch_welcome_shown', 'true');
        animateAheadCount();
    } else {
        step1.classList.add('active');
        step2.classList.remove('active');
    }

    gsap.from('.onboarding-card', { y: 50, opacity: 0, duration: 1, ease: "power4.out" });
}

function animateAheadCount() {
    const countEl = document.getElementById('ahead-count');
    if (!countEl) return;
    let count = { val: 0 };
    const targetCount = Math.floor(Math.random() * 500) + 2450;
    gsap.to(count, {
        val: targetCount,
        duration: 3,
        ease: "power3.out",
        onUpdate: () => { countEl.innerText = Math.floor(count.val).toLocaleString(); }
    });
}

async function submitOnboarding(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('ob-submit-btn');
    const name = document.getElementById('ob-name')?.value?.trim();
    const clinic = document.getElementById('ob-clinic')?.value?.trim();
    const phone = document.getElementById('ob-phone')?.value?.trim();

    if (!name || !clinic || !phone) { alert("Please fill required fields."); return; }

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Processing...';
    if (window.lucide) lucide.createIcons();

    try {
        const { data: { user } } = await window.sb.auth.getUser();
        const updates = {
            id: user.id,
            full_name: name,
            clinic_name: clinic,
            phone: phone,
            updated_at: new Date().toISOString()
        };
        await window.sb.from('profiles').upsert(updates);
        populateProfileUI(updates, user);
        showOnboarding('2');
    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.innerHTML = 'Initialize System <i data-lucide="zap" class="w-4 h-4"></i>';
    }
}

function finishOnboarding() {
    localStorage.setItem('catch_welcome_shown', 'true');
    gsap.to('#onboarding-overlay', {
        opacity: 0, duration: 0.8, ease: "power2.inOut",
        onComplete: () => document.getElementById('onboarding-overlay')?.classList.remove('active')
    });
}

// ── VAPI CALL LOGIC ──────────────────────────────────────────────────
async function initiateVapiCall() {
    if (currentUserPlan === 'free' || currentUserPlan === 'expired') {
        document.getElementById('trial-lock-modal')?.classList.add('is-active');
        return;
    }

    const phoneInput = document.getElementById('simulate-phone-input').value.trim();
    const btn = document.getElementById('simulate-call-btn');
    const icon = document.getElementById('simulate-icon');

    if (!phoneInput.startsWith('+')) { alert("Include country code (e.g. +1)"); return; }

    btn.disabled = true;
    icon.setAttribute('data-lucide', 'loader-2');
    icon.classList.add('animate-spin');

    try {
        const { data: { session } } = await window.sb.auth.getSession();
        const response = await fetch("/api/vapi/call", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
            body: JSON.stringify({ phoneNumber: phoneInput })
        });

        if (!response.ok) throw new Error("Call failed");
        showToast("Call initiated! 📞", "success");
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btn.disabled = false;
        icon.setAttribute('data-lucide', 'phone-call');
        icon.classList.remove('animate-spin');
        if (window.lucide) lucide.createIcons();
    }
}

// ── REAL STATS LOADER ────────────────────────────────────────────────
async function loadRealStats(sb, userId) {
    try {
        const { data: logs } = await sb.from('call_logs').select('*').eq('user_id', userId);
        const total = logs?.length || 0;
        const booked = logs?.filter(l => l.booking_status === 'booked').length || 0;
        
        document.getElementById('stat-revenue').textContent = '$' + (booked * 120).toLocaleString();
        document.getElementById('stat-calls').textContent = total;
        document.getElementById('stat-total-syncs').textContent = total.toLocaleString();

        renderActivityFeed(logs);
    } catch (e) { console.warn('Stats failed'); }
}

function renderActivityFeed(logs) {
    const feed = document.getElementById('neural-activity-feed');
    if (!feed) return;
    if (!logs || logs.length === 0) {
        feed.innerHTML = '<div class="py-20 opacity-20 text-center">No Neural Activity</div>';
        return;
    }
    feed.innerHTML = logs.slice(0, 8).map(log => `
        <div class="flex gap-4 p-4 rounded-2xl bg-dash-gray border border-white/5">
            <div class="w-10 h-10 rounded-full flex items-center justify-center bg-dash-orange/10">
                <i data-lucide="activity" class="w-5 h-5 text-dash-orange"></i>
            </div>
            <div>
                <p class="text-sm font-bold text-white">${log.caller_number || 'Unknown Call'}</p>
                <p class="text-[10px] text-dash-text-muted">AI Intercepted</p>
            </div>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

// ── UTILS & TOASTS ──────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-premium ${type}`;
    toast.innerHTML = `<div class="toast-icon-wrap"><span>⚡</span></div><div class="flex-1"><p class="text-sm text-white">${message}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('active'), 10);
    setTimeout(() => { toast.classList.remove('active'); setTimeout(() => toast.remove(), 600); }, 5000);
}

function applyFeatureGating(plan) {
    if (plan === 'pro') return;
    document.querySelectorAll('.premium-lock-overlay').forEach(el => el.remove());
    ['tab-inbox', 'tab-kb'].forEach(id => {
        const tab = document.getElementById(id);
        if (tab) {
            tab.style.position = 'relative';
            tab.insertAdjacentHTML('beforeend', '<div class="premium-lock-overlay absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center m-4 rounded-2xl">Upgrade to Unlock</div>');
        }
    });
}

// ── INITIALIZATION ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Icons
    if (window.lucide) try { lucide.createIcons(); } catch (e) { }

    // Three.js Background
    try { initThreeJS(); } catch (e) { }

    // GSAP
    gsap.from('.top-navbar', { y: -80, opacity: 0, duration: 1, ease: "power3.out" });

    // Subscriptions
    initSubscriptionSystem();

    // Form listener
    document.getElementById('onboarding-form')?.addEventListener('submit', submitOnboarding);
});

// Three.js Logic (Simplified)
function initThreeJS() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    // Simple particle system
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 500; i++) vertices.push(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.PointsMaterial({ color: 0xFF4500, size: 0.05 });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    function animate() {
        requestAnimationFrame(animate);
        points.rotation.y += 0.001;
        renderer.render(scene, camera);
    }
    animate();
}
