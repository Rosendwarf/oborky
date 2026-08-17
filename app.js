/**
 * Frontend logika pro Skautské odborky Tracker (využití url šablony a id pro nášivky)
 */

const CATEGORY_COLORS = {
    'Umělecké': { color: '#d94e34', bg: '#fbeee9' },
    'Technické': { color: '#7a3026', bg: '#f4eae9' },
    'Tábornicko-cestovatelské': { color: '#2d7a5b', bg: '#e9f4ef' },
    'Humanitní': { color: '#6b528e', bg: '#f1edf6' },
    'Přírodovědné': { color: '#489a6b', bg: '#ecf7f0' },
    'Služba bližním': { color: '#c83232', bg: '#faeaea' },
    'Vodácké': { color: '#1d9dc7', bg: '#e7f6fb' },
    'Sportovní': { color: '#2b5997', bg: '#eaeff7' },
    'Život v oddíle': { color: '#d93d59', bg: '#fbecee' },
    'Duchovní': { color: '#c99a3e', bg: '#faf5ea' }
};

let state = {
    user: null,
    stavyOdborek: {},
    wishlistBadges: new Set(),
    ukolyStavy: {}, 
    badges: {},
    isLegacyMode: false,
    filters: {
        search: '',
        status: 'all',
        category: 'all'
    },
    activeBadgeId: null
};

async function initApp() {
    const grid = document.getElementById('badges-grid');

    try {
        const apiRes = await fetch('api.php');
        if (!apiRes.ok) throw new Error(`api.php vrátilo kód ${apiRes.status}`);
        const apiData = await apiRes.json();

        state.user = apiData.uzivatel;
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
        if (!res.ok) throw new Error(`Nepodařilo se načíst ${jsonFile} (kód ${res.status})`);
        state.badges = await res.json();

        state.filters.category = 'all';

        setupCategoryFilters();
        renderBadgesGrid();
        closeModal();

    } catch (err) {
        console.error("Chyba při načítání katalogu odborek:", err);
        if (grid) {
            grid.innerHTML = `<div class="loading" style="color: #b91c1c;">Nepodařilo se načíst soubor ${jsonFile}. Ujisti se, že existuje.</div>`;
        }
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

    const ageSelect = document.getElementById('age-group-select');
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
                    document.body.style.backgroundColor = CATEGORY_COLORS[cat].bg;
                } else {
                    document.body.style.backgroundColor = '';
                }
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

    let dtCount = 0;
    let dtPlanned = 0;
    let usCount = 0;
    let usPlanned = 0;

    (badge?.tasks?.dokaz_to || []).forEach(t => {
        const status = state.ukolyStavy[`${badgeId}:${t.id}`];
        if (status === 'splneno') {
            dtCount++;
            dtPlanned++;
        } else if (status === 'chci_plnit') {
            dtPlanned++;
        }
    });

    (badge?.tasks?.ukaz_se || []).forEach(t => {
        const status = state.ukolyStavy[`${badgeId}:${t.id}`];
        if (status === 'splneno') {
            usCount++;
            usPlanned++;
        } else if (status === 'chci_plnit') {
            usPlanned++;
        }
    });

    const dtReq = req.dokaz_to;
    const usReq = req.ukaz_se;
    const isComplete = dtCount >= dtReq && usCount >= usReq;
    const hasAnyTask = Object.keys(state.ukolyStavy).some(k => k.startsWith(`${badgeId}:`));

    const totalReq = dtReq + usReq;
    const totalDone = Math.min(dtCount, dtReq) + Math.min(usCount, usReq);
    const percent = totalReq > 0 ? Math.round((totalDone / totalReq) * 100) : 0;

    return { 
        dtCount, dtPlanned, dtReq, 
        usCount, usPlanned, usReq, 
        percent, isComplete, hasAnyTask 
    };
}

async function evaluateAndSyncBadgeStatus(badgeId, syncToServer = true) {
    const progress = calculateBadgeProgress(badgeId);
    let targetStatus = null;

    if (progress.isComplete) {
        targetStatus = 'splneno';
    } else if (progress.hasAnyTask) {
        targetStatus = 'plnim';
    } else if (state.wishlistBadges.has(badgeId)) {
        targetStatus = 'chci_plnit';
    }

    const currentStatus = state.stavyOdborek[badgeId] || null;

    if (targetStatus !== currentStatus) {
        if (targetStatus) {
            state.stavyOdborek[badgeId] = targetStatus;
        } else {
            delete state.stavyOdborek[badgeId];
        }

        if (syncToServer) {
            await postApi({
                akce: 'nastavit_stav_odborky',
                odborka_id: badgeId,
                stav: targetStatus
            });
        }
    }
}

async function toggleWishlist(badgeId, e) {
    if (e) e.stopPropagation();

    const isCurrentlyWishlisted = state.wishlistBadges.has(badgeId);

    if (isCurrentlyWishlisted) {
        state.wishlistBadges.delete(badgeId);
    } else {
        state.wishlistBadges.add(badgeId);
    }

    await evaluateAndSyncBadgeStatus(badgeId, true);
    renderBadgesGrid();
    if (state.activeBadgeId === badgeId) updateModalHeaderStatus(badgeId);
}

function renderBadgesGrid() {
    const container = document.getElementById('badges-grid');
    if (!container) return;
    container.innerHTML = '';

    const filtered = Object.values(state.badges).filter(b => {
        if (state.filters.search) {
            const badgeName = (b.name || '').toLowerCase();
            if (!badgeName.includes(state.filters.search)) return false;
        }

        if (state.filters.category !== 'all' && b.category !== state.filters.category) return false;
        
        if (state.filters.status !== 'all') {
            const currentStatus = state.stavyOdborek[b.id];
            if (state.filters.status === 'chci_plnit') {
                if (!state.wishlistBadges.has(b.id)) return false;
            } else if (currentStatus !== state.filters.status) {
                return false;
            }
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
        const theme = CATEGORY_COLORS[b.category] || { color: '#2d6a4f', bg: '#d8f3dc' };
        
        // Cesta k nášivce generovaná z ID
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
                        <button class="star-btn ${isWishlisted ? 'active' : ''}" title="${isWishlisted ? 'Odebrat ze seznamu přání' : 'Přidat do seznamu přání'}">
                            ${isWishlisted ? '★' : '☆'}
                        </button>
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
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress.percent}%;"></div>
                </div>
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
    const modal = document.getElementById('badge-modal');
    const theme = CATEGORY_COLORS[badge.category] || { color: '#2d6a4f', bg: '#d8f3dc' };

    modal.style.setProperty('--badge-theme-color', state.isLegacyMode ? '#b45309' : theme.color);
    modal.style.setProperty('--badge-theme-bg', state.isLegacyMode ? '#fef3c7' : theme.bg);

    const modalIcon = document.getElementById('modal-badge-icon');
    modalIcon.src = `data/nasivky/${badge.id}.png`;
    modalIcon.style.display = 'block';

    // Generování URL z uložené url šablony
    const methodologyLink = document.getElementById('modal-methodology-link');
    methodologyLink.href = `https://odborky.skauting.cz/odborka/${badge.url}/`;

    const junshopLink = document.getElementById('modal-junshop-link');
    junshopLink.href = `https://www.junshop.cz/odborka-${badge.url}`;

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
        <button class="star-btn ${isWishlisted ? 'active' : ''}" id="modal-star-btn" style="font-size: 24px;" title="${isWishlisted ? 'Odebrat ze seznamu přání' : 'Přidat do seznamu přání'}">
            ${isWishlisted ? '★' : '☆'}
        </button>
    `;

    document.getElementById('modal-star-btn').addEventListener('click', (e) => toggleWishlist(badgeId, e));
}

function renderModalTasks(badge) {
    const dtList = document.getElementById('dt-task-list');
    const usList = document.getElementById('us-task-list');

    dtList.innerHTML = '';
    usList.innerHTML = '';

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
            
            let titlePart = "";
            let bodyPart = "";

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
                    bodyPart = '';
                }
            }

            const li = document.createElement('li');
            li.className = `task-item ${isChecked ? 'completed' : ''} ${isPlanned ? 'planned' : ''}`;
            li.innerHTML = `
                <input type="checkbox" id="chk_${task.id}" ${isChecked ? 'checked' : ''} title="Označit jako splněné">
                <div class="task-content">
                    <div class="task-header">
                        <span class="task-badge-tag">${tagSymbol}</span>
                        <label class="task-title" for="chk_${task.id}">${titlePart}</label>
                    </div>
                    ${bodyPart ? `<label class="task-body" for="chk_${task.id}">${bodyPart}</label>` : ''}
                </div>
                <div class="task-actions">
                    <button class="task-plan-btn ${isPlanned ? 'active' : ''}" title="${isPlanned ? 'Odebrat z plánu plnění' : 'Chci plnit (přidat do plánu)'}">
                        ⭐
                    </button>
                </div>
            `;

            li.querySelector('input').addEventListener('change', async (e) => {
                const checked = e.target.checked;
                const newStatus = checked ? 'splneno' : null;

                if (checked) {
                    state.ukolyStavy[key] = 'splneno';
                    li.classList.add('completed');
                    li.classList.remove('planned');
                } else {
                    delete state.ukolyStavy[key];
                    li.classList.remove('completed');
                }

                const planBtn = li.querySelector('.task-plan-btn');
                planBtn.classList.remove('active');

                await postApi({
                    akce: 'prepnout_ukol',
                    odborka_id: badge.id,
                    ukol_id: task.id,
                    stav: newStatus
                });

                await evaluateAndSyncBadgeStatus(badge.id, true);
                updateModalProgress(badge.id);
                updateModalHeaderStatus(badge.id);
                renderBadgesGrid();
            });

            li.querySelector('.task-plan-btn').addEventListener('click', async () => {
                const currentlyPlanned = state.ukolyStavy[key] === 'chci_plnit';
                const newStatus = currentlyPlanned ? null : 'chci_plnit';

                if (currentlyPlanned) {
                    delete state.ukolyStavy[key];
                    li.classList.remove('planned');
                } else {
                    state.ukolyStavy[key] = 'chci_plnit';
                    li.classList.add('planned');
                    li.querySelector('input').checked = false;
                    li.classList.remove('completed');
                }

                const planBtn = li.querySelector('.task-plan-btn');
                planBtn.classList.toggle('active', !currentlyPlanned);

                await postApi({
                    akce: 'prepnout_ukol',
                    odborka_id: badge.id,
                    ukol_id: task.id,
                    stav: newStatus
                });

                await evaluateAndSyncBadgeStatus(badge.id, true);
                updateModalProgress(badge.id);
                updateModalHeaderStatus(badge.id);
                renderBadgesGrid();
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

    const dtReq = req.dokaz_to > 0 ? req.dokaz_to : 1;
    const usReq = req.ukaz_se > 0 ? req.ukaz_se : 1;

    document.getElementById('dt-progress-text').textContent = `${progress.dtCount} (plán: ${progress.dtPlanned}) / ${req.dokaz_to}`;
    updateDualProgressBar('dt', progress.dtCount, progress.dtPlanned, dtReq);

    document.getElementById('us-progress-text').textContent = `${progress.usCount} (plán: ${progress.usPlanned}) / ${req.ukaz_se}`;
    updateDualProgressBar('us', progress.usCount, progress.usPlanned, usReq);
}

function updateDualProgressBar(type, count, planned, targetReq) {
    const targetSafe = targetReq > 0 ? targetReq : 1;
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
            body: JSON.stringify(data)
        });
        return await res.json();
    } catch (err) {
        console.error('Chyba komunikace s API:', err);
    }
}

function getStatusName(status) {
    status = status || '';
    switch (status) {
        case 'chci_plnit': return '⭐ Wishlist';
        case 'plnim': return '⏳ Plním';
        case 'splneno': return '✅ Splněno';
        default: return '';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}