document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toRegister = document.getElementById('to-register');
    const toLogin = document.getElementById('to-login');

    if (toRegister) {
        toRegister.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
        });
    }

    if (toLogin) {
        toLogin.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const prezdivka = document.getElementById('login-prezdivka').value.trim();
            const heslo = document.getElementById('login-password').value;
            const errEl = document.getElementById('login-error');
            errEl.textContent = '';

            const res = await postAuthApi({ akce: 'prihlasit', prezdivka, heslo });
            if (res && res.uspech) {
                window.location.href = 'aplikace.html';
            } else {
                errEl.textContent = res?.chyba || 'Chyba při přihlášení.';
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const prezdivka = document.getElementById('reg-name').value.trim();
            const heslo = document.getElementById('reg-password').value;
            const vekova_kategorie = document.getElementById('reg-category').value;
            const errEl = document.getElementById('reg-error');
            errEl.textContent = '';

            const res = await postAuthApi({ akce: 'registrovat', prezdivka, heslo, vekova_kategorie });
            if (res && res.uspech) {
                window.location.href = 'aplikace.html';
            } else {
                errEl.textContent = res?.chyba || 'Chyba při registraci.';
            }
        });
    }
});

async function postAuthApi(data) {
    try {
        const res = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', 
            body: JSON.stringify(data)
        });
        return await res.json();
    } catch (err) {
        console.error('Chyba API:', err);
    }
}