// Supabase Configuration
// TODO: Replace these with your actual Supabase Project URL and Anon Key
const SUPABASE_URL = 'https://wbibehdgvmcrpgzaxkvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiaWJlaGRndm1jcnBnemF4a3Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTUwMTEsImV4cCI6MjA5Mzg3MTAxMX0.0STkt1RncpWrahh5kvse8Uf9kyH61Z6ENnt1UZIiHxk';

let supabase;

// Toast Notification Helper
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    
    toast.className = '';
    msg.textContent = message;
    
    if(type === 'error') {
        toast.classList.add('error', 'show');
        icon.setAttribute('data-lucide', 'alert-circle');
    } else if(type === 'success') {
        toast.classList.add('success', 'show');
        icon.setAttribute('data-lucide', 'check-circle-2');
    } else {
        toast.classList.add('show');
        icon.setAttribute('data-lucide', 'info');
    }
    
    if(window.lucide) lucide.createIcons();
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Initialize Supabase if keys are provided
if(SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY_HERE') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Check Session on Load
document.addEventListener('DOMContentLoaded', async () => {
    if(supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if(session) {
            // Already logged in, redirect to dashboard
            window.location.href = '/dashboard.html';
        }
    }
});

// Handle Login
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if(!supabase) {
        showToast('Supabase keys missing. Please add them to js/auth.js', 'error');
        return;
    }

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Authenticating...';
        if(window.lucide) lucide.createIcons();

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        showToast('Login successful! Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 1000);

    } catch (error) {
        showToast(error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
        if(window.lucide) lucide.createIcons();
    }
});

// Handle Signup
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if(!supabase) {
        showToast('Supabase keys missing. Please add them to js/auth.js', 'error');
        return;
    }

    const fname = document.getElementById('signup-fname').value;
    const lname = document.getElementById('signup-lname').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const btn = document.getElementById('signup-btn');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Initializing...';
        if(window.lucide) lucide.createIcons();

        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    first_name: fname,
                    last_name: lname
                }
            }
        });

        if (error) throw error;

        // Note: Supabase requires email verification by default.
        showToast('Account created! Please check your email to verify.', 'success');
        
        // Reset form
        document.getElementById('signup-form').reset();
        
        setTimeout(() => {
            toggleView('login');
        }, 2000);

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if(window.lucide) lucide.createIcons();
    }
});
