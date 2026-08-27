/**
 * Správa klientské logiky pro skupinu (Live verze)
 */

if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}

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

let badgesCatalog = {};
let groupData = null;
let currentUser = null;
let aggregateFilter = 'splneno'; 

let currentMemberProfile = { prezdivka: '', vekova_kategorie: '', stavyOdborek: {}, ukolyStavy: {} };

async function initGroupApp() {
    try {
        const resCat = await fetch('data/badges.json');
        badgesCatalog = await resCat.json();

        const apiRes = await fetch('api.php?akce=skupina_data', { credentials: 'include' });
        if (apiRes.status === 401 || apiRes.status === 403) {
            window.location.href = 'aplikace.html';
            return;
        }

        groupData = await apiRes.json();
        
        const userRes = await fetch('api.php?akce=profil', { credentials: 'include' });
        const userData = await userRes.json();
        currentUser = userData.uzivatel; 
        document.getElementById('username-display').textContent = currentUser.prezdivka;

        setupAggregateFilters();
        renderGroupInfo();
        renderMembers();
        renderAggregate();
        
        setupGroupSettings();
        setupBadgeModalEvents();

    } catch (err) {
        const descEl = document.getElementById('group-desc-text');
        if (descEl) descEl.textContent = 'Data skupiny se nepodařilo načíst.';
    }
}

function setupAggregateFilters() {
    const tabs = document.querySelectorAll('#group-aggregate-filters .tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            aggregateFilter = e.target.dataset.status;
            renderAggregate();
        });
    });
}

function renderGroupInfo() {
    document.getElementById('group-name').textContent = groupData.skupina.nazev;
    const descEl = document.getElementById('group-desc-text');
    descEl.textContent = groupData.skupina.popis || 'Zatím bez popisu.';

    const editBtn = document.getElementById('edit-desc-btn');
    const form = document.getElementById('edit-desc-form');
    const input = document.getElementById('desc-input');
    const cancelBtn = document.getElementById('cancel-desc-btn');
    const groupSettingsBtn = document.getElementById('group-settings-btn');
    const groupSettingsModal = document.getElementById('group-settings-modal');

    if (groupData.skupina.je_admin) {
        editBtn.classList.remove('hidden');
        groupSettingsBtn.classList.remove('hidden');
        document.getElementById('invite-code-display').textContent = groupData.skupina.pozvaci_kod;
        
        editBtn.addEventListener('click', () => {
            descEl.classList.add('hidden');
            editBtn.classList.add('hidden');
            form.classList.remove('hidden');
            input.value = groupData.skupina.popis;
        });

        cancelBtn.addEventListener('click', () => {
            form.classList.add('hidden');
            descEl.classList.remove('hidden');
            editBtn.classList.remove('hidden');
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const novyPopis = input.value;
            await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ akce: 'upravit_popis_skupiny', popis: novyPopis })
            });
            descEl.textContent = novyPopis;
            groupData.skupina.popis = novyPopis;
            form.classList.add('hidden');
            descEl.classList.remove('hidden');
            editBtn.classList.remove('hidden');
        });

        groupSettingsBtn.addEventListener('click', () => groupSettingsModal.classList.add('open'));
        document.getElementById('group-settings-close-btn').addEventListener('click', () => groupSettingsModal.classList.remove('open'));

        document.getElementById('generate-code-btn').addEventListener('click', async () => {
            if (confirm('Generování nového kódu zneplatní ten starý. Pokračovat?')) {
                const res = await fetch('api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ akce: 'generovat_kod' })
                });
                const data = await res.json();
                if (data.uspech) {
                    document.getElementById('invite-code-display').textContent = data.kod;
                }
            }
        });
    }
}

function renderMembers() {
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    
    groupData.clenove.forEach(clen => {
        const isAdmin = clen.role === 'admin';
        const li = document.createElement('li');
        li.className = 'member-item';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'member-name';
        nameDiv.innerHTML = `👤 ${clen.prezdivka} ${isAdmin ? '<span title="Vedoucí (Admin)" class="font-14">👑</span>' : ''}`;
        nameDiv.addEventListener('click', () => openMemberModal(clen.id));
        li.appendChild(nameDiv);

        if (groupData.skupina.je_admin && clen.id !== currentUser.id) {
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '❌';
            removeBtn.title = 'Vyhodit člena ze skupiny';
            removeBtn.className = 'member-remove-btn';

            removeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Opravdu chceš vyhodit člena ${clen.prezdivka} ze skupiny? Data o jeho odborkách mu zůstanou, ale vy už je neuvidíte.`)) {
                    const res = await fetch('api.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ akce: 'vyhodit_clena', clen_id: clen.id })
                    });
                    const data = await res.json();
                    if (data.uspech) {
                        const apiRes = await fetch('api.php?akce=skupina_data', { credentials: 'include' });
                        groupData = await apiRes.json();
                        renderMembers();
                        renderAggregate();
                    } else {
                        alert(data.chyba || 'Došlo k chybě při vyhazování člena.');
                    }
                }
            });
            li.appendChild(removeBtn);
        }
        list.appendChild(li);
    });
}

async function openMemberModal(clenId) {
    try {
        const res = await fetch(`api.php?akce=detail_clena&clen_id=${clenId}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();

        currentMemberProfile.prezdivka = data.prezdivka;
        currentMemberProfile.vekova_kategorie = data.vekova_kategorie || 'starsi_skauti';
        currentMemberProfile.stavyOdborek = {};
        currentMemberProfile.ukolyStavy = {};

        data.odborky.forEach(o => {
            if (o.stav) currentMemberProfile.stavyOdborek[o.odborka_id] = o.stav;
        });

        data.splnene_ukoly.forEach(u => {
            currentMemberProfile.ukolyStavy[`${u.odborka_id}:${u.ukol_id}`] = u.stav || 'splneno';
        });

        document.getElementById('member-modal-name').textContent = data.prezdivka;
        
        const doneContainer = document.getElementById('member-done-badges');
        const plnimContainer = document.getElementById('member-plnim-badges');
        const wishContainer = document.getElementById('member-wish-badges');
        
        doneContainer.innerHTML = '';
        plnimContainer.innerHTML = '';
        wishContainer.innerHTML = '';

        let counts = { splneno: 0, chci_plnit: 0, plnim: 0 };

        data.odborky.forEach(o => {
            const b = badgesCatalog[o.odborka_id];
            if (!b) return;
            
            const createBadgeEl = () => {
                const el = document.createElement('div');
                el.className = 'badge-mini-item';
                el.innerHTML = `
                    <img src="data/nasivky/${b.id}.png" class="badge-mini-icon" title="${b.name}">
                    <span class="badge-mini-title">${b.name}</span>
                `;
                el.addEventListener('click', () => openReadonlyBadgeModal(b.id));
                return el;
            };

            if (o.stav === 'splneno') {
                doneContainer.appendChild(createBadgeEl()); counts.splneno++;
            } else if (o.stav === 'plnim') {
                plnimContainer.appendChild(createBadgeEl()); counts.plnim++;
            }
            
            if (o.v_seznamu_prani == 1) {
                wishContainer.appendChild(createBadgeEl()); counts.chci_plnit++;
            }
        });

        if (counts.splneno === 0) doneContainer.innerHTML = '<span class="text-muted font-13">Zatím žádné splněné odborky.</span>';
        if (counts.plnim === 0) plnimContainer.innerHTML = '<span class="text-muted font-13">Momentálně nic neplní.</span>';
        if (counts.chci_plnit === 0) wishContainer.innerHTML = '<span class="text-muted font-13">Žádné odborky v plánu.</span>';

        document.getElementById('member-modal').classList.add('open');
    } catch (e) {
        // Tiché selhání bez rušení uživatele
    }
}

function openReadonlyBadgeModal(badgeId) {
    const badge = badgesCatalog[badgeId];
    const theme = CATEGORY_COLORS[badge.category] || { color: '#2d6a4f', bg: '#d8f3dc' };
    const modal = document.getElementById('badge-modal');

    modal.style.setProperty('--badge-theme-color', theme.color);
    modal.style.setProperty('--badge-theme-bg', theme.bg);

    const modalIcon = document.getElementById('modal-badge-icon');
    modalIcon.src = `data/nasivky/${badge.id}.png`;
    modalIcon.classList.remove('hidden');

    document.getElementById('modal-badge-category').textContent = badge.category;
    document.getElementById('modal-badge-title').textContent = badge.name;
    document.getElementById('modal-badge-desc').textContent = badge.description;

    const statusContainer = document.getElementById('modal-status-container');
    const userStatus = currentMemberProfile.stavyOdborek[badgeId];
    statusContainer.innerHTML = userStatus ? `<span class="status-badge status-${userStatus}">${userStatus === 'splneno' ? '✅ Splněno' : '⏳ Plní'}</span>` : '';

    renderReadonlyTasks(badge);
    updateReadonlyProgress(badgeId);
    
    modal.classList.add('open');
}

function renderReadonlyTasks(badge) {
    const dtList = document.getElementById('dt-task-list');
    const usList = document.getElementById('us-task-list');
    dtList.innerHTML = ''; usList.innerHTML = '';

    const renderList = (tasks, container, isDokazTo) => {
        (tasks || []).forEach((task, idx) => {
            const key = `${badge.id}:${task.id}`;
            const taskStatus = currentMemberProfile.ukolyStavy[key];
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
                <input type="checkbox" id="ro_chk_${task.id}" ${isChecked ? 'checked' : ''} disabled>
                <div class="task-content">
                    <div class="task-header">
                        <span class="task-badge-tag">${tagSymbol}</span>
                        <label class="task-title cursor-default" for="ro_chk_${task.id}">${titlePart}</label>
                    </div>
                    ${bodyPart ? `<label class="task-body cursor-default" for="ro_chk_${task.id}">${bodyPart}</label>` : ''}
                </div>
            `;
            container.appendChild(li);
        });
    };
    renderList(badge.tasks?.dokaz_to, dtList, true);
    renderList(badge.tasks?.ukaz_se, usList, false);
}

function updateReadonlyProgress(badgeId) {
    const badge = badgesCatalog[badgeId];
    const ageGroup = currentMemberProfile.vekova_kategorie;
    const req = badge?.requirements?.[ageGroup] || { dokaz_to: 0, ukaz_se: 0 };

    let dtCount = 0; let dtPlanned = 0;
    let usCount = 0; let usPlanned = 0;

    (badge?.tasks?.dokaz_to || []).forEach(t => {
        const status = currentMemberProfile.ukolyStavy[`${badgeId}:${t.id}`];
        if (status === 'splneno') { dtCount++; dtPlanned++; }
        else if (status === 'chci_plnit') { dtPlanned++; }
    });

    (badge?.tasks?.ukaz_se || []).forEach(t => {
        const status = currentMemberProfile.ukolyStavy[`${badgeId}:${t.id}`];
        if (status === 'splneno') { usCount++; usPlanned++; }
        else if (status === 'chci_plnit') { usPlanned++; }
    });

    document.getElementById('dt-progress-text').textContent = `${dtCount} / ${req.dokaz_to}`;
    document.getElementById('us-progress-text').textContent = `${usCount} / ${req.ukaz_se}`;

    const updateDualBar = (type, count, targetSafe) => {
        const donePercent = Math.min(100, Math.round((count / targetSafe) * 100));
        let barContainer = document.getElementById(`${type}-progress-bar-container`);
        if (!barContainer) {
            const barWrapper = document.getElementById(`${type}-progress-bar`).parentElement;
            barWrapper.innerHTML = `
                <div id="${type}-progress-bar-container" class="relative w-100 h-100 rounded-4 overflow-hidden border-top-1">
                    <div id="${type}-done-fill" class="absolute top-0 left-0 h-100 rounded-4 progress-fill"></div>
                </div>
            `;
        }
        document.getElementById(`${type}-done-fill`).style.width = `${donePercent}%`;
    };

    updateDualBar('dt', dtCount, req.dokaz_to > 0 ? req.dokaz_to : 1);
    updateDualBar('us', usCount, req.ukaz_se > 0 ? req.ukaz_se : 1);
}

function setupBadgeModalEvents() {
    document.getElementById('modal-close-btn').addEventListener('click', () => {
        document.getElementById('badge-modal').classList.remove('open');
    });
}

function renderAggregate() {
    const container = document.getElementById('aggregate-list');
    const toggleBtn = document.getElementById('toggle-view-btn');
    container.innerHTML = '';

    const agr = groupData.agregace;
    const badgeStats = [];

    for (const badgeId in agr) {
        if (badgesCatalog[badgeId]) {
            badgeStats.push({
                badge: badgesCatalog[badgeId],
                splneno: agr[badgeId].splneno || [],
                chci_plnit: agr[badgeId].chci_plnit || [],
                plnim: agr[badgeId].plnim || []
            });
        }
    }

    const filteredStats = badgeStats.filter(stat => stat[aggregateFilter].length > 0);
    filteredStats.sort((a, b) => b[aggregateFilter].length - a[aggregateFilter].length);

    if (filteredStats.length === 0) {
        toggleBtn.classList.add('hidden');
        const texty = {
            'splneno': 'Zatím nikdo nemá žádnou splněnou odborku.',
            'chci_plnit': 'Nikdo nemá žádné odborky v seznamu přání.',
            'plnim': 'Momentálně nikdo aktivně neplní žádnou odborku.'
        };
        container.innerHTML = `<p class="text-muted font-14">${texty[aggregateFilter]}</p>`;
        return;
    }

    toggleBtn.classList.remove('hidden');
    let allExpanded = false;
    const allBodies = [];

    let ikonka = ''; let bgC = 'bg-success-light'; let txtC = 'text-success'; let nadpisStavu = '';
    if (aggregateFilter === 'splneno') { ikonka = '✅'; nadpisStavu = 'Splnili'; }
    if (aggregateFilter === 'chci_plnit') { ikonka = '⭐'; bgC = 'bg-warning-light'; txtC = 'text-warning'; nadpisStavu = 'Chtějí plnit'; }
    if (aggregateFilter === 'plnim') { ikonka = '⏳'; bgC = 'bg-info-light'; txtC = 'text-info'; nadpisStavu = 'Aktivně plní'; }

    filteredStats.forEach(stat => {
        const lide = stat[aggregateFilter];
        const pocet = lide.length;

        const item = document.createElement('div');
        item.className = 'aggregate-item';
        
        const header = document.createElement('div');
        header.className = 'aggregate-header';
        header.innerHTML = `
            <div class="flex items-center gap-12">
                <img src="data/nasivky/${stat.badge.id}.png" class="aggregate-badge-icon">
                <span>${stat.badge.name}</span>
            </div>
            <div class="flex gap-8 font-12">
                <span class="${bgC} ${txtC} aggregate-count-badge">${ikonka} ${pocet}</span>
            </div>
        `;

        const body = document.createElement('div');
        body.className = 'aggregate-body';
        body.innerHTML = `<div><strong class="${txtC}">${nadpisStavu}:</strong> ${lide.join(', ')}</div>`;
        
        allBodies.push(body);

        header.addEventListener('click', () => {
            body.style.display = body.style.display === 'block' ? 'none' : 'block';
        });

        item.appendChild(header);
        item.appendChild(body);
        container.appendChild(item);
    });

    const newToggleBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
    
    newToggleBtn.addEventListener('click', () => {
        allExpanded = !allExpanded;
        newToggleBtn.textContent = allExpanded ? 'Sbalit vše' : 'Rozbalit vše';
        allBodies.forEach(b => b.style.display = allExpanded ? 'block' : 'none');
    });
}

function setupGroupSettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close-btn');
    const logoutBtn = document.getElementById('logout-btn-settings');
    const darkModeToggle = document.getElementById('dark-mode-toggle');

    if (settingsBtn) settingsBtn.addEventListener('click', () => settingsModal.classList.add('open'));
    if (closeBtn) closeBtn.addEventListener('click', () => settingsModal.classList.remove('open'));
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') settingsModal.classList.remove('open');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ akce: 'odhlasit' })
            });
            window.location.href = 'index.html';
        });
    }

    if (darkModeToggle) {
        darkModeToggle.checked = document.body.classList.contains('dark-mode');
        darkModeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('darkMode', 'true');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('darkMode', 'false');
            }
        });
    }
}

document.getElementById('member-close-btn').addEventListener('click', () => {
    document.getElementById('member-modal').classList.remove('open');
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGroupApp);
} else {
    initGroupApp();
}