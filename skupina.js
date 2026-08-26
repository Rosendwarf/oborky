let badgesCatalog = {};
let groupData = null;
let currentUser = null;
let aggregateFilter = 'splneno'; 

async function initGroupApp() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }

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

    } catch (err) {
        console.error("Chyba:", err);
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
    const descEl = document.getElementById('group-desc');
    descEl.textContent = groupData.skupina.popis || 'Zatím bez popisu.';

    if (groupData.skupina.je_admin) {
        document.getElementById('admin-controls').style.display = 'block';
        document.getElementById('invite-code-display').textContent = groupData.skupina.pozvaci_kod;
        
        const editBtn = document.getElementById('edit-desc-btn');
        const form = document.getElementById('edit-desc-form');
        const input = document.getElementById('desc-input');
        
        editBtn.style.display = 'block';
        editBtn.addEventListener('click', () => {
            descEl.style.display = 'none';
            form.style.display = 'block';
            input.value = groupData.skupina.popis;
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
            form.style.display = 'none';
            descEl.style.display = 'block';
        });

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
        
        li.style = 'padding: 10px; background: rgba(0,0,0,0.02); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: space-between; transition: border-color 0.2s;';
        
        const nameDiv = document.createElement('div');
        nameDiv.style = 'display: flex; align-items: center; gap: 10px; flex-grow: 1;';
        nameDiv.innerHTML = `👤 ${clen.prezdivka} ${isAdmin ? '<span title="Vedoucí (Admin)" style="font-size: 14px;">👑</span>' : ''}`;
        nameDiv.addEventListener('click', () => openMemberModal(clen.id));
        li.appendChild(nameDiv);

        if (groupData.skupina.je_admin && clen.id !== currentUser.id) {
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '❌';
            removeBtn.title = 'Vyhodit člena ze skupiny';
            removeBtn.style = 'background: transparent; border: 1px solid transparent; cursor: pointer; padding: 4px 6px; border-radius: 6px; transition: all 0.2s; font-size: 12px;';
            
            removeBtn.addEventListener('mouseover', () => {
                removeBtn.style.background = '#fee2e2';
                removeBtn.style.borderColor = '#fca5a5';
            });
            removeBtn.addEventListener('mouseout', () => {
                removeBtn.style.background = 'transparent';
                removeBtn.style.borderColor = 'transparent';
            });

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

        li.addEventListener('mouseover', () => li.style.borderColor = 'var(--primary)');
        li.addEventListener('mouseout', () => li.style.borderColor = 'var(--border)');
        list.appendChild(li);
    });
}

async function openMemberModal(clenId) {
    const res = await fetch(`api.php?akce=detail_clena&clen_id=${clenId}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();

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
            el.style = 'display: flex; flex-direction: column; align-items: center; width: 70px; text-align: center;';
            el.innerHTML = `
                <img src="data/nasivky/${b.id}.png" style="width: 40px; height: 40px; border-radius: 6px; border: 1px solid var(--border); background: #fff;" title="${b.name}">
                <span style="font-size: 10px; margin-top: 4px; line-height: 1.2;">${b.name}</span>
            `;
            return el;
        };

        if (o.stav === 'splneno') {
            doneContainer.appendChild(createBadgeEl()); counts.splneno++;
        } else if (o.stav === 'plnim') {
            plnimContainer.appendChild(createBadgeEl()); counts.plnim++;
        }
        
        // PŘIDÁNO: Nezávislá kontrola nového sloupce z databáze
        if (o.v_seznamu_prani == 1) {
            wishContainer.appendChild(createBadgeEl()); counts.chci_plnit++;
        }
    });

    if (counts.splneno === 0) doneContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted);">Zatím žádné splněné odborky.</span>';
    if (counts.plnim === 0) plnimContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted);">Momentálně nic neplní.</span>';
    if (counts.chci_plnit === 0) wishContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted);">Žádné odborky v plánu.</span>';

    document.getElementById('member-modal').classList.add('open');
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
        toggleBtn.style.display = 'none';
        const texty = {
            'splneno': 'Zatím nikdo nemá žádnou splněnou odborku.',
            'chci_plnit': 'Nikdo nemá žádné odborky v seznamu přání.',
            'plnim': 'Momentálně nikdo aktivně neplní žádnou odborku.'
        };
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">${texty[aggregateFilter]}</p>`;
        return;
    }

    toggleBtn.style.display = 'block';
    let allExpanded = false;
    const allBodies = [];

    let ikonka = ''; let bgC = ''; let txtC = ''; let nadpisStavu = '';
    if (aggregateFilter === 'splneno') { ikonka = '✅'; bgC = '#dcfce7'; txtC = '#15803d'; nadpisStavu = 'Splnili'; }
    if (aggregateFilter === 'chci_plnit') { ikonka = '⭐'; bgC = '#fef3c7'; txtC = '#b45309'; nadpisStavu = 'Chtějí plnit'; }
    if (aggregateFilter === 'plnim') { ikonka = '⏳'; bgC = '#e0f2fe'; txtC = '#0369a1'; nadpisStavu = 'Aktivně plní'; }

    filteredStats.forEach(stat => {
        const lide = stat[aggregateFilter];
        const pocet = lide.length;

        const item = document.createElement('div');
        item.style = 'border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); overflow: hidden;';
        
        const header = document.createElement('div');
        header.style = 'padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.02); font-weight: 600;';
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="data/nasivky/${stat.badge.id}.png" style="width: 28px; height: 28px; border-radius: 4px; background: #fff; border: 1px solid var(--border);">
                <span>${stat.badge.name}</span>
            </div>
            <div style="display: flex; gap: 8px; font-size: 12px;">
                <span style="background: ${bgC}; color: ${txtC}; padding: 2px 8px; border-radius: 12px;">${ikonka} ${pocet}</span>
            </div>
        `;

        const body = document.createElement('div');
        body.style = 'padding: 16px; display: none; border-top: 1px solid var(--border); font-size: 13px;';
        body.innerHTML = `<div><strong style="color: ${txtC};">${nadpisStavu}:</strong> ${lide.join(', ')}</div>`;
        
        allBodies.push(body);

        header.addEventListener('click', () => {
            body.style.display = body.style.display === 'none' ? 'block' : 'none';
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
    const userGroupInfo = document.getElementById('user-group-info');
    const userGroupName = document.getElementById('user-group-name');

    if (groupData && groupData.skupina && userGroupInfo && userGroupName) {
        userGroupInfo.style.display = 'block';
        userGroupName.textContent = groupData.skupina.nazev;
    }

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