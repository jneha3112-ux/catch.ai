// ─── Supabase Configuration ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://wbibehdgvmcrpgzaxkvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiaWJlaGRndm1jcnBnemF4a3Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTUwMTEsImV4cCI6MjA5Mzg3MTAxMX0.0STkt1RncpWrahh5kvse8Uf9kyH61Z6ENnt1UZIiHxk';

// Initialize client with PERSISTENT session storage (Remember Me by default)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,          // Keep session in localStorage
        autoRefreshToken: true,        // Auto renew token before it expires
        detectSessionInUrl: true       // Handle OAuth redirects automatically
    }
});

// ─── Toast Notification ────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const msg   = document.getElementById('toast-msg');
    const icon  = document.getElementById('toast-icon');
    if (!toast || !msg) return;

    toast.className = '';
    msg.textContent = message;

    const iconMap = { error: 'alert-circle', success: 'check-circle-2', info: 'info' };
    icon.setAttribute('data-lucide', iconMap[type] || 'info');
    toast.classList.add(type, 'show');
    if (window.lucide) lucide.createIcons();

    setTimeout(() => { toast.classList.remove('show'); }, 4500);
}

// ─── Session Check on auth.html load ──────────────────────────────────────────
// If already logged in → skip login page and go straight to dashboard
document.addEventListener('DOMContentLoaded', async () => {
    // Handle OAuth callback (Google/Facebook redirect back to this page)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        const { data, error } = await supabase.auth.getSession();
        if (data?.session) {
            window.location.replace('/dashboard.html');
            return;
        }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.replace('/dashboard.html');
    }
});

// ─── Social Login (Google / Facebook) ─────────────────────────────────────────
async function loginWith(provider) {
    showToast(`Connecting to ${provider}...`);
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: window.location.origin + '/dashboard.html',
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
        if (error) throw error;
    } catch (err) {
        showToast(err.message || 'Social login failed. Check provider settings.', 'error');
    }
}

// ─── Email / Password Login ────────────────────────────────────────────────────
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email      = document.getElementById('login-email').value.trim();
    const password   = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me')?.checked ?? true;
    const btn        = document.getElementById('login-btn');
    const btnText    = btn.querySelector('span');
    const originalLabel = btnText.textContent;

    btn.disabled = true;
    btnText.textContent = 'Signing in...';

    try {
        // Set session duration based on Remember Me
        if (!rememberMe) {
            // Session-only (cleared when browser closes)
            await supabase.auth.setSession({ access_token: '', refresh_token: '' }).catch(() => {});
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        showToast('Welcome back! Loading dashboard...', 'success');
        setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);

    } catch (err) {
        let msg = err.message;
        if (msg === 'Invalid login credentials') msg = 'Wrong email or password. Please try again.';
        if (msg.includes('Email not confirmed')) msg = 'Please verify your email first. Check your inbox.';
        showToast(msg, 'error');
        btn.disabled = false;
        btnText.textContent = originalLabel;
    }
});

// ─── Email / Password Sign Up ──────────────────────────────────────────────────
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fname    = document.getElementById('signup-fname').value.trim();
    const lname    = document.getElementById('signup-lname').value.trim();
    const email    = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const btn      = document.getElementById('signup-btn');
    const btnText  = btn.querySelector('span');
    const originalLabel = btnText.textContent;

    if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
    }

    btn.disabled = true;
    btnText.textContent = 'Creating account...';

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { first_name: fname, last_name: lname, full_name: `${fname} ${lname}` },
                emailRedirectTo: window.location.origin + '/dashboard.html'
            }
        });
        if (error) throw error;

        // If email confirmation is disabled in Supabase, session is returned immediately
        if (data.session) {
            showToast('Account created! Entering dashboard...', 'success');
            setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
        } else {
            showToast('Check your email to confirm your account, then sign in.', 'success');
            document.getElementById('signup-form').reset();
            setTimeout(() => { toggleAuth('login'); }, 2500);
        }

    } catch (err) {
        let msg = err.message;
        if (msg.includes('already registered')) msg = 'This email is already registered. Try logging in.';
        showToast(msg, 'error');
        btn.disabled = false;
        btnText.textContent = originalLabel;
    }
});
