// Aplikování dark mode co nejdříve (zabrání probliknutí bílé barvy při načítání)
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}

// Přidány tmavé odstíny (darkBg) pro každou kategorii
const CATEGORY_COLORS = {
    'Umělecké': { color: '#d94e34', bg: '#fbeee9', darkBg: '#1c1514' },
    'Technické': { color: '#7a3026', bg: '#f4eae9', darkBg: '#171312' },
    'Tábornicko-cestovatelské': { color: '#2d7a5b', bg: '#e9f4ef', darkBg: '#111815' },
    'Humanitní': { color: '#6b528e', bg: '#f1edf6', darkBg: '#16141a' },
    'Přírodovědné': { color: '#489a6b', bg: '#ecf7f0', darkBg: '#131915' },
    'Služba bližním': { color: '#c83232', bg: '#faeaea', darkBg: '#1a1212' },
    'Vodácké': { color: '#1d9dc7', bg: '#e7f6fb', darkBg: '#11181c' },
    'Sportovní': { color: '#2b5997', bg: '#eaeff7', darkBg: '#12161c' },
    'Život v oddíle': { color: '#d93d59', bg: '#fbecee', darkBg: '#1c1315' },
    'Duchovní': { color: '#c99a3e', bg: '#faf5ea', darkBg: '#1a1712' }
};

let state = {
    user: null,
    skupina: null, // Info o skupině z DB
    stavyOdborek: {},
    wishlistBadges: new Set(),
    ukolyStavy: {}, 
    badges: {},
    isLegacyMode: false,
    filters: { search: '', status: 'all', category: 'all' },
    activeBadgeId: null
};

async function initApp() {
    const grid = document.getElementById('badges-grid');

    try {
        const apiRes = await fetch('api.php', {
            method: 'GET',
            credentials: 'include' 
        });
        
        if (apiRes.status === 401) {
            window.location.href = 'index.html';
            return;
        }

        if (!apiRes.ok) throw new Error(`api.php vrátilo kód ${apiRes.status}`);
        const apiData = await apiRes.json();

        state.user = apiData.uzivatel;
        state.skupina = apiData.skupina; // Uložení dat o skupině
        state.stavyOdborek = apiData.stavy_odborek || {};

        state.wishlistBadges = new Set(
            Object.keys(state.stavyOdborek).filter(id => state.stavyOdborek[id] === 'chci_plnit')
        );
        
        state.ukolyStavy = {};
        (apiData.splnene_ukoly || []).forEach(u => {
            state.ukolyStavy[`${u.odborka_id}:${u.ukol_id}`] = u.stav || 'splneno';
        });

        setupHeader();
        setupLegacyToggle();
        setupEventListeners();
        setupSettings();
        
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await postApi({ akce: 'odhlasit' });
                window.location.href = 'index.html';
            });
        }
        
        await loadBadgesCatalog(false);

    } catch (err) {
        console.error("Chyba při inicializaci:", err);
        if (grid) {
            grid.innerHTML = `
                <div style="background: #fee2e2; border: 2px solid #ef4444; color: #991b1b; padding: 24px; border-radius: 12px; grid-column: 1 / -1;">
                    <h3 style="margin-bottom: 8px; font-weight: 800;">⚠️ Chyba při načítání</h3>
                    <p style="font-family: monospace; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #fca5a5;">${err.message}</p>
                </div>
            `;
        }
    }
}

async function loadBadgesCatalog(isLegacy) {
    state.isLegacyMode = isLegacy;
    const jsonFile = isLegacy ? 'data/badges_legacy.json' : 'data/badges.json';
    const grid = document.getElementById('badges-grid');
    if (grid) grid.innerHTML = `<div class="loading">Načítám katalog odborek (${isLegacy ? 'Legacy' : 'Aktivní'})...</div>`;

    try {
        const res = await fetch(jsonFile);
        if (!res.ok) throw new Error(`Nepodařilo se načíst ${jsonFile}`);
        state.badges = await res.json();
        state.filters.category = 'all';

        setupCategoryFilters();
        renderBadgesGrid();
        closeModal();
    } catch (err) {
        console.error("Chyba při načítání:", err);
        if (grid) grid.innerHTML = `<div class="loading" style="color: #b91c1c;">Nepodařilo se načíst soubor ${jsonFile}.</div>`;
    }
}

function setupLegacyToggle() {
    const toggle = document.getElementById('legacy-toggle');
    if (!toggle) return;
    toggle.addEventListener('change', async (e) => {
        const legacyActive = e.target.checked;
        if (legacyActive) {
            document.body.classList.add('legacy-mode-active');
        } else {
            document.body.classList.remove('legacy-mode-active');
        }
        await loadBadgesCatalog(legacyActive);
    });
}

function setupHeader() {
    if (!state.user) return;
    const nameEl = document.getElementById('username-display');
    if (nameEl) nameEl.textContent = state.user.prezdivka;

    // Pokud je uživatel ve skupině, zobrazíme tlačítko v hlavičce
    const headerGroupBtn = document.getElementById('header-group-btn');
    if (headerGroupBtn && state.skupina && state.skupina.nazev) {
        headerGroupBtn.style.display = 'block';
        headerGroupBtn.addEventListener('click', () => {
            window.location.href = 'skupina.html';
        });
    }

    const ageSelect = document.getElementById('settings-age-group');
    if (ageSelect) {
        ageSelect.value = state.user.vekova_kategorie;
        ageSelect.addEventListener('change', async (e) => {
            const novaKategorie = e.target.value;
            state.user.vekova_kategorie = novaKategorie;
            await postApi({ akce: 'zmenit_kategorii', vekova_kategorie: novaKategorie });
            for (const badgeId of Object.keys(state.badges)) {
                await evaluateAndSyncBadgeStatus(badgeId, false);
            }
            renderBadgesGrid();
            if (state.activeBadgeId) openBadgeModal(state.activeBadgeId);
        });
    }
}

function setupSettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close-btn');
    const pwdForm = document.getElementById('change-password-form');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const togglePwdBtn = document.getElementById('toggle-password-btn');
    const pwdSection = document.getElementById('password-section');
    const toggleIcon = document.getElementById('toggle-password-icon');

    // Elementy pro skupinu
    const userGroupInfo = document.getElementById('user-group-info');
    const userGroupName = document.getElementById('user-group-name');
    const joinGroupForm = document.getElementById('join-group-form');
    const joinGroupBtn = document.getElementById('join-group-btn');
    const inviteCodeInput = document.getElementById('invite-code-input');
    const groupError = document.getElementById('group-error');

    // Otevírání modalu
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('open');
            // Reset formulářů a hlášek při každém otevření
            if (groupError) groupError.textContent = '';
            if (inviteCodeInput) inviteCodeInput.value = '';
            
            // Logika zobrazení skupiny
            if (state.skupina && state.skupina.nazev) {
                userGroupInfo.style.display = 'block';
                joinGroupForm.style.display = 'none';
                userGroupName.textContent = state.skupina.nazev;
            } else {
                userGroupInfo.style.display = 'none';
                joinGroupForm.style.display = 'block';
            }
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => settingsModal.classList.remove('open'));
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') settingsModal.classList.remove('open');
        });
    }

    // Odeslání pozvacího kódu
    if (joinGroupBtn) {
        joinGroupBtn.addEventListener('click', async () => {
            const kod = inviteCodeInput.value.trim().toUpperCase();
            if (!kod) {
                groupError.textContent = 'Zadej prosím platný kód.';
                return;
            }

            const res = await postApi({ akce: 'pripojit_skupinu', kod: kod });
            if (res && res.uspech) {
                // Skupina se úspěšně připojila, přesměrujeme rovnou na stránku skupiny
                groupError.style.color = '#15803d';
                groupError.textContent = 'Úspěšně připojeno! Přesměrovávám...';
                setTimeout(() => window.location.href = 'skupina.html', 1000);
            } else {
                groupError.style.color = '#dc2626';
                groupError.textContent = res?.chyba || 'Chyba při připojování ke skupině.';
            }
        });
    }

    // Rozbalování formuláře hesla
    if (togglePwdBtn && pwdSection) {
        togglePwdBtn.addEventListener('click', () => {
            if (pwdSection.style.display === 'none') {
                pwdSection.style.display = 'block';
                toggleIcon.textContent = '▲';
            } else {
                pwdSection.style.display = 'none';
                toggleIcon.textContent = '▼';
            }
        });
    }

    // Dark Mode
    if (darkModeToggle) {
        darkModeToggle.checked = document.body.classList.contains('dark-mode');
        
        darkModeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('darkMode', 'true');
                if (!state.isLegacyMode && state.filters.category !== 'all' && CATEGORY_COLORS[state.filters.category]) {
                    document.body.style.backgroundColor = CATEGORY_COLORS[state.filters.category].darkBg;
                }
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('darkMode', 'false');
                if (!state.isLegacyMode && state.filters.category !== 'all' && CATEGORY_COLORS[state.filters.category]) {
                    document.body.style.backgroundColor = CATEGORY_COLORS[state.filters.category].bg;
                }
            }
        });
    }

    // Změna hesla
    if (pwdForm) {
        pwdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const stare_heslo = document.getElementById('old-password').value;
            const nove_heslo = document.getElementById('new-password').value;
            const errEl = document.getElementById('pwd-error');
            const succEl = document.getElementById('pwd-success');
            
            errEl.textContent = '';
            succEl.textContent = '';

            const res = await postApi({ akce: 'zmenit_heslo', stare_heslo, nove_heslo });
            
            if (res && res.uspech) {
                succEl.textContent = 'Heslo bylo úspěšně změněno!';
                pwdForm.reset();
                setTimeout(() => { 
                    succEl.textContent = ''; 
                    pwdSection.style.display = 'none';
                    toggleIcon.textContent = '▼';
                }, 3000);
            } else {
                errEl.textContent = res?.chyba || 'Došlo k chybě při změně hesla.';
            }
        });
    }
}

function setupCategoryFilters() {
    const categories = ['all', ...new Set(Object.values(state.badges).map(b => b.category))];
    const container = document.getElementById('category-filters');
    if (!container) return;
    container.innerHTML = '';

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `cat-btn ${cat === 'all' ? 'active' : ''}`;
        btn.textContent = cat === 'all' ? 'Všechny kategorie' : cat;
        btn.dataset.category = cat;

        if (cat !== 'all' && CATEGORY_COLORS[cat]) {
            btn.style.setProperty('--cat-color', CATEGORY_COLORS[cat].color);
            btn.style.setProperty('--cat-bg', CATEGORY_COLORS[cat].bg);
        }

        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filters.category = cat;
            
            if (!state.isLegacyMode) {
                if (cat !== 'all' && CATEGORY_COLORS[cat]) {
                    const isDark = document.body.classList.contains('dark-mode');
                    document.body.style.backgroundColor = isDark ? CATEGORY_COLORS[cat].darkBg : CATEGORY_COLORS[cat].bg;
                } else {
                    document.body.style.backgroundColor = '';
                }
            } else {
                document.body.style.backgroundColor = '';
            }
            renderBadgesGrid();
        });
        container.appendChild(btn);
    });
}

function setupEventListeners() {
    const search = document.getElementById('search-input');
    if (search) {
        search.addEventListener('input', (e) => {
            state.filters.search = e.target.value.toLowerCase().trim();
            renderBadgesGrid();
        });
    }

    const filters = document.getElementById('status-filters');
    if (filters) {
        filters.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-btn')) return;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filters.status = e.target.dataset.status;
            renderBadgesGrid();
        });
    }

    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const modal = document.getElementById('badge-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'badge-modal') closeModal();
        });
    }
}

function calculateBadgeProgress(badgeId) {
    const badge = state.badges[badgeId];
    const ageGroup = state.user?.vekova_kategorie || 'starsi_skauti';
    const req = badge?.requirements?.[ageGroup] || { dokaz_to: 0, ukaz_se: 0 };

    let dtCount = 0; let dtPlanned = 0;
    let usCount = 0; let usPlanned = 0;

    (badge?.tasks?.dokaz_to || []).forEach(t => {
        const status = state.ukolyStavy[`${badgeId}:${t.id}`];
        if (status === 'splneno') { dtCount++; dtPlanned++; }
        else if (status === 'chci_plnit') { dtPlanned++; }
    });

    (badge?.tasks?.ukaz_se || []).forEach(t => {
        const status = state.ukolyStavy[`${badgeId}:${t.id}`];
        if (status === 'splneno') { usCount++; usPlanned++; }
        else if (status === 'chci_plnit') { usPlanned++; }
    });

    const dtReq = req.dokaz_to;
    const usReq = req.ukaz_se;
    const isComplete = dtCount >= dtReq && usCount >= usReq;
    const hasAnyTask = Object.keys(state.ukolyStavy).some(k => k.startsWith(`${badgeId}:`));

    const totalReq = dtReq + usReq;
    const totalDone = Math.min(dtCount, dtReq) + Math.min(usCount, usReq);
    const percent = totalReq > 0 ? Math.round((totalDone / totalReq) * 100) : 0;

    return { dtCount, dtPlanned, dtReq, usCount, usPlanned, usReq, percent, isComplete, hasAnyTask };
}

async function evaluateAndSyncBadgeStatus(badgeId, syncToServer = true) {
    const progress = calculateBadgeProgress(badgeId);
    let targetStatus = null;

    if (progress.isComplete) targetStatus = 'splneno';
    else if (progress.hasAnyTask) targetStatus = 'plnim';
    else if (state.wishlistBadges.has(badgeId)) targetStatus = 'chci_plnit';

    const currentStatus = state.stavyOdborek[badgeId] || null;

    if (targetStatus !== currentStatus) {
        if (targetStatus) state.stavyOdborek[badgeId] = targetStatus;
        else delete state.stavyOdborek[badgeId];

        if (syncToServer) {
            await postApi({ akce: 'nastavit_stav_odborky', odborka_id: badgeId, stav: targetStatus });
        }
    }
}

async function toggleWishlist(badgeId, e) {
    if (e) e.stopPropagation();
    if (state.wishlistBadges.has(badgeId)) state.wishlistBadges.delete(badgeId);
    else state.wishlistBadges.add(badgeId);
    
    await evaluateAndSyncBadgeStatus(badgeId, true);
    renderBadgesGrid();
    if (state.activeBadgeId === badgeId) updateModalHeaderStatus(badgeId);
}

function renderBadgesGrid() {
    const container = document.getElementById('badges-grid');
    if (!container) return;
    container.innerHTML = '';

    const filtered = Object.values(state.badges).filter(b => {
        if (state.filters.search && !((b.name || '').toLowerCase().includes(state.filters.search))) return false;
        if (state.filters.category !== 'all' && b.category !== state.filters.category) return false;
        if (state.filters.status !== 'all') {
            const currentStatus = state.stavyOdborek[b.id];
            if (state.filters.status === 'chci_plnit') {
                if (!state.wishlistBadges.has(b.id)) return false;
            } else if (currentStatus !== state.filters.status) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="loading">Žádné odborky neodpovídají zadanému filtru.</div>`;
        return;
    }

    filtered.forEach(b => {
        const progress = calculateBadgeProgress(b.id);
        const userStatus = state.stavyOdborek[b.id];
        const isWishlisted = state.wishlistBadges.has(b.id);
        const theme = CATEGORY_COLORS[b.category] || { color: '#2d6a4f', bg: '#d8f3dc', darkBg: '#111815' };
        const iconPath = `data/nasivky/${b.id}.png`;

        const card = document.createElement('div');
        card.className = `badge-card ${state.isLegacyMode ? 'is-legacy' : ''}`;
        card.style.setProperty('--badge-theme-color', state.isLegacyMode ? '#b45309' : theme.color);
        card.style.setProperty('--badge-theme-bg', state.isLegacyMode ? '#fef3c7' : theme.bg);

        card.innerHTML = `
            <div>
                <div class="card-top">
                    <span class="category-pill">${b.category} ${state.isLegacyMode ? ' (Výslužba)' : ''}</span>
                    <div class="card-top-right">
                        ${userStatus && userStatus !== 'chci_plnit' ? `<span class="status-badge status-${userStatus}">${getStatusName(userStatus)}</span>` : ''}
                        <button class="star-btn ${isWishlisted ? 'active' : ''}" title="Seznam přání">${isWishlisted ? '★' : '☆'}</button>
                    </div>
                </div>
                <div class="card-header-main">
                    <img src="${iconPath}" alt="${b.name}" class="badge-icon-img" onerror="this.style.display='none'">
                    <div>
                        <h3>${b.name}</h3>
                        <p>${b.description || ''}</p>
                    </div>
                </div>
            </div>
            <div class="progress-box">
                <span><span>Postup:</span> <strong>${progress.percent}%</strong></span>
                <div class="progress-bar"><div class="progress-fill" style="width: ${progress.percent}%;"></div></div>
            </div>
        `;
        card.querySelector('.star-btn').addEventListener('click', (e) => toggleWishlist(b.id, e));
        card.addEventListener('click', () => openBadgeModal(b.id));
        container.appendChild(card);
    });
}

function openBadgeModal(badgeId) {
    state.activeBadgeId = badgeId;
    const badge = state.badges[badgeId];
    const theme = CATEGORY_COLORS[badge.category] || { color: '#2d6a4f', bg: '#d8f3dc' };
    const modal = document.getElementById('badge-modal');

    modal.style.setProperty('--badge-theme-color', state.isLegacyMode ? '#b45309' : theme.color);
    modal.style.setProperty('--badge-theme-bg', state.isLegacyMode ? '#fef3c7' : theme.bg);

    const modalIcon = document.getElementById('modal-badge-icon');
    modalIcon.src = `data/nasivky/${badge.id}.png`;
    modalIcon.style.display = 'block';

    document.getElementById('modal-methodology-link').href = `https://odborky.skauting.cz/odborka/${badge.url}/`;
    document.getElementById('modal-junshop-link').href = `https://www.junshop.cz/odborka-${badge.url}`;
    document.getElementById('modal-badge-category').textContent = badge.category + (state.isLegacyMode ? ' (Ve výslužbě)' : '');
    document.getElementById('modal-badge-title').textContent = badge.name;
    document.getElementById('modal-badge-desc').textContent = badge.description;

    updateModalHeaderStatus(badgeId);
    renderModalTasks(badge);
    updateModalProgress(badgeId);
    modal.classList.add('open');
}

function updateModalHeaderStatus(badgeId) {
    const container = document.getElementById('modal-status-container');
    const userStatus = state.stavyOdborek[badgeId];
    const isWishlisted = state.wishlistBadges.has(badgeId);

    container.innerHTML = `
        ${userStatus && userStatus !== 'chci_plnit' ? `<span class="status-badge status-${userStatus}">${getStatusName(userStatus)}</span>` : ''}
        <button class="star-btn ${isWishlisted ? 'active' : ''}" id="modal-star-btn" style="font-size: 24px;">${isWishlisted ? '★' : '☆'}</button>
    `;
    document.getElementById('modal-star-btn').addEventListener('click', (e) => toggleWishlist(badgeId, e));
}

function renderModalTasks(badge) {
    const dtList = document.getElementById('dt-task-list');
    const usList = document.getElementById('us-task-list');
    dtList.innerHTML = ''; usList.innerHTML = '';

    const renderList = (tasks, container, isDokazTo) => {
        (tasks || []).forEach((task, idx) => {
            const key = `${badge.id}:${task.id}`;
            const taskStatus = state.ukolyStavy[key];
            const isChecked = taskStatus === 'splneno';
            const isPlanned = taskStatus === 'chci_plnit';

            let tagSymbol = '';
            if (isDokazTo) {
                const match = task.id.match(/dt_([a-z0-9]+)/i);
                tagSymbol = match ? match[1].toUpperCase() : String.fromCharCode(65 + idx);
            } else {
                const match = task.id.match(/us_(\d+)/i);
                tagSymbol = match ? match[1] : (idx + 1).toString();
            }

            let cleanTitle = task.title.replace(/^[A-Z0-9]{1,2}[\.\)]\s*/, '').trim();
            let titlePart = "", bodyPart = "";
            const firstSentenceMatch = cleanTitle.match(/^(.+?[\.!?])(\s+[\s\S]*)$/);
            
            if (firstSentenceMatch && firstSentenceMatch[1].length < 60) {
                titlePart = firstSentenceMatch[1].trim();
                bodyPart = firstSentenceMatch[2].trim();
            } else {
                const words = cleanTitle.split(' ');
                if (words.length > 5) {
                    titlePart = words.slice(0, 4).join(' ') + '.';
                    bodyPart = words.slice(4).join(' ');
                } else {
                    titlePart = cleanTitle;
                }
            }

            const li = document.createElement('li');
            li.className = `task-item ${isChecked ? 'completed' : ''} ${isPlanned ? 'planned' : ''}`;
            li.innerHTML = `
                <input type="checkbox" id="chk_${task.id}" ${isChecked ? 'checked' : ''}>
                <div class="task-content">
                    <div class="task-header">
                        <span class="task-badge-tag">${tagSymbol}</span>
                        <label class="task-title" for="chk_${task.id}">${titlePart}</label>
                    </div>
                    ${bodyPart ? `<label class="task-body" for="chk_${task.id}">${bodyPart}</label>` : ''}
                </div>
                <div class="task-actions">
                    <button class="task-plan-btn ${isPlanned ? 'active' : ''}">⭐</button>
                </div>
            `;

            li.querySelector('input').addEventListener('change', async (e) => {
                const checked = e.target.checked;
                const newStatus = checked ? 'splneno' : null;

                if (checked) {
                    state.ukolyStavy[key] = 'splneno';
                    li.classList.add('completed'); li.classList.remove('planned');
                } else {
                    delete state.ukolyStavy[key];
                    li.classList.remove('completed');
                }
                li.querySelector('.task-plan-btn').classList.remove('active');

                await postApi({ akce: 'prepnout_ukol', odborka_id: badge.id, ukol_id: task.id, stav: newStatus });
                await evaluateAndSyncBadgeStatus(badge.id, true);
                updateModalProgress(badge.id); updateModalHeaderStatus(badge.id); renderBadgesGrid();
            });

            li.querySelector('.task-plan-btn').addEventListener('click', async () => {
                const currentlyPlanned = state.ukolyStavy[key] === 'chci_plnit';
                const newStatus = currentlyPlanned ? null : 'chci_plnit';

                if (currentlyPlanned) {
                    delete state.ukolyStavy[key]; li.classList.remove('planned');
                } else {
                    state.ukolyStavy[key] = 'chci_plnit';
                    li.classList.add('planned'); li.classList.remove('completed');
                    li.querySelector('input').checked = false;
                }
                li.querySelector('.task-plan-btn').classList.toggle('active', !currentlyPlanned);

                await postApi({ akce: 'prepnout_ukol', odborka_id: badge.id, ukol_id: task.id, stav: newStatus });
                await evaluateAndSyncBadgeStatus(badge.id, true);
                updateModalProgress(badge.id); updateModalHeaderStatus(badge.id); renderBadgesGrid();
            });
            container.appendChild(li);
        });
    };
    renderList(badge.tasks?.dokaz_to, dtList, true);
    renderList(badge.tasks?.ukaz_se, usList, false);
}

function updateModalProgress(badgeId) {
    const progress = calculateBadgeProgress(badgeId);
    const badge = state.badges[badgeId];
    const ageGroup = state.user?.vekova_kategorie || 'starsi_skauti';
    const req = badge?.requirements?.[ageGroup] || { dokaz_to: 0, ukaz_se: 0 };

    document.getElementById('dt-progress-text').textContent = `${progress.dtCount} (plán: ${progress.dtPlanned}) / ${req.dokaz_to}`;
    updateDualProgressBar('dt', progress.dtCount, progress.dtPlanned, req.dokaz_to > 0 ? req.dokaz_to : 1);

    document.getElementById('us-progress-text').textContent = `${progress.usCount} (plán: ${progress.usPlanned}) / ${req.ukaz_se}`;
    updateDualProgressBar('us', progress.usCount, progress.usPlanned, req.ukaz_se > 0 ? req.ukaz_se : 1);
}

function updateDualProgressBar(type, count, planned, targetSafe) {
    const plannedPercent = Math.min(100, Math.round((planned / targetSafe) * 100));
    const donePercent = Math.min(100, Math.round((count / targetSafe) * 100));
    let barContainer = document.getElementById(`${type}-progress-bar-container`);
    
    if (!barContainer) {
        const barWrapper = document.getElementById(`${type}-progress-bar`).parentElement;
        barWrapper.innerHTML = `
            <div id="${type}-progress-bar-container" style="position: relative; width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                <div id="${type}-planned-fill" style="position: absolute; top: 0; left: 0; height: 100%; background: #cbd5e1; border-radius: 3px; transition: width 0.3s;"></div>
                <div id="${type}-done-fill" style="position: absolute; top: 0; left: 0; height: 100%; background: var(--badge-theme-color, #2d6a4f); border-radius: 3px; transition: width 0.3s;"></div>
            </div>
        `;
    }
    document.getElementById(`${type}-planned-fill`).style.width = `${plannedPercent}%`;
    document.getElementById(`${type}-done-fill`).style.width = `${donePercent}%`;
}

function closeModal() {
    document.getElementById('badge-modal').classList.remove('open');
    state.activeBadgeId = null;
}

async function postApi(data) {
    try {
        const res = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', 
            body: JSON.stringify(data)
        });
        return await res.json();
    } catch (err) {
        console.error('Chyba komunikace s API:', err);
    }
}

function getStatusName(status) {
    switch (status) {
        case 'chci_plnit': return '⭐ Wishlist';
        case 'plnim': return '⏳ Plním';
        case 'splneno': return '✅ Splněno';
        default: return '';
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();