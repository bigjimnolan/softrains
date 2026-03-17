// frigate-login.js
// Shared Frigate login modal for maps and dashboard pages

let frigateLoginModalActive = false;

/**
 * Update visibility of Frigate login button based on authentication state
 */
function updateFrigateLoginButtonVisibility() {
    const btn = document.getElementById('frigate-login-btn');
    if (btn) {
        const isAuthenticated = sessionStorage.getItem('frigate_authenticated') === 'true';
        btn.style.display = isAuthenticated ? 'none' : 'block';
    }
}

/**
 * Wait for DOM to be ready
 * @returns {Promise} Resolves when document is ready
 */
function waitForDOM() {
    return new Promise((resolve) => {
        if (document.body) {
            resolve();
        } else {
            document.addEventListener('DOMContentLoaded', resolve);
        }
    });
}

/**
 * Show the Frigate login modal
 * @returns {Promise} Resolves when login is successful or modal is closed
 */
async function showFrigateLoginModal() {
    // Wait for DOM to be ready
    await waitForDOM();

    return new Promise((resolve) => {
        if (frigateLoginModalActive) {
            resolve();
            return;
        }
        frigateLoginModalActive = true;

        const modal = document.createElement('div');
        modal.id = 'frigate-login-modal';
        modal.className = 'frigate-login-modal-bg';

        const modalContent = document.createElement('div');
        modalContent.className = 'frigate-login-modal-content';

        const title = document.createElement('h2');
        title.className = 'frigate-login-modal-title';
        title.textContent = 'Frigate Authentication Required';

        const subtitle = document.createElement('p');
        subtitle.className = 'frigate-login-modal-subtitle';
        subtitle.textContent = 'System still operational. Please authenticate.';

        const userFormGroup = document.createElement('div');
        userFormGroup.className = 'frigate-login-form-group';
        const userLabel = document.createElement('label');
        userLabel.className = 'frigate-login-label';
        userLabel.textContent = 'Username:';
        const userInput = document.createElement('input');
        userInput.type = 'text';
        userInput.className = 'frigate-login-input';
        userInput.placeholder = 'Enter username';
        userFormGroup.appendChild(userLabel);
        userFormGroup.appendChild(userInput);

        const passFormGroup = document.createElement('div');
        passFormGroup.className = 'frigate-login-form-group';
        const passLabel = document.createElement('label');
        passLabel.className = 'frigate-login-label';
        passLabel.textContent = 'Password:';
        const passInput = document.createElement('input');
        passInput.type = 'password';
        passInput.className = 'frigate-login-input';
        passInput.placeholder = 'Enter password';
        passFormGroup.appendChild(passLabel);
        passFormGroup.appendChild(passInput);

        const errorMsg = document.createElement('div');
        errorMsg.className = 'frigate-login-error';

        // Add a memo area with accidentally visible todo
        const memo = document.createElement('div');
        memo.className = 'frigate-login-memo';
        const memoTitle = document.createElement('div');
        memoTitle.className = 'frigate-login-memo-title';
        memoTitle.textContent = '[MEMO - SYSTEM LOG]';
        const memoContent = document.createElement('div');
        memoContent.className = 'frigate-login-memo-content';
        memoContent.innerHTML = 'NOTE: Still waiting to hear back from the Frigate folks about enabling autologin. Been trying to reach them for 847 years now... they\'re probably just busy. In the meantime, users will need to authenticate manually. —SoftRains Team';
        memo.appendChild(memoTitle);
        memo.appendChild(memoContent);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'frigate-login-button-container';

        const loginBtn = document.createElement('button');
        loginBtn.className = 'frigate-login-btn-submit';
        loginBtn.textContent = 'Login';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'frigate-login-btn-cancel';
        cancelBtn.textContent = 'Cancel';

        buttonContainer.appendChild(loginBtn);
        buttonContainer.appendChild(cancelBtn);

        modalContent.appendChild(title);
        modalContent.appendChild(subtitle);
        modalContent.appendChild(userFormGroup);
        modalContent.appendChild(passFormGroup);
        modalContent.appendChild(errorMsg);
        modalContent.appendChild(memo);
        modalContent.appendChild(buttonContainer);

        modal.appendChild(modalContent);

        // Append to frigate-modal-container or document.body as fallback
        const container = document.getElementById('frigate-modal-container') || document.body;
        container.appendChild(modal);

        const closeModal = () => {
            modal.remove();
            frigateLoginModalActive = false;
        };

        const showError = (message) => {
            errorMsg.textContent = message;
            errorMsg.classList.add('show');
        };

        const clearError = () => {
            errorMsg.classList.remove('show');
        };

        loginBtn.addEventListener('click', async () => {
            const username = userInput.value.trim();
            const password = passInput.value.trim();

            if (!username || !password) {
                showError('Please enter both username and password');
                return;
            }

            clearError();
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';

            try {
                const response = await fetch('/proxy/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: username, password }),
                    credentials: 'include',
                });

                if (response.ok) {
                    // Mark that user has authenticated (frigate_token is HttpOnly, so we need a client-side flag)
                    sessionStorage.setItem('frigate_authenticated', 'true');
                    updateFrigateLoginButtonVisibility();
                    closeModal();
                    resolve();
                } else {
                    showError('Login failed. Please check your credentials.');
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Login';
                }
            } catch (error) {
                console.error('Login error:', error);
                showError('An error occurred. Please try again.');
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            }
        });

        cancelBtn.addEventListener('click', () => {
            closeModal();
            resolve();
        });

        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') passInput.focus();
        });

        passInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loginBtn.click();
        });

        userInput.focus();
    });
}

// Initialize button visibility on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateFrigateLoginButtonVisibility);
} else {
    updateFrigateLoginButtonVisibility();
}
