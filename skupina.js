let badgesCatalog = {};
let groupData = null;

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
        document.getElementById('username-display').textContent = userData.uzivatel.prezdivka;

        renderGroupInfo();
        renderMembers();
        renderAggregate();

    } catch (err) {
        console.error("Chyba:", err);
    }
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
        li.style = 'padding: 10px; background: rgba(0,0,0,0.02); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 10px; transition: border-color 0.2s;';
        
        li.innerHTML = `👤 ${clen.prezdivka} ${isAdmin ? '<span title="Vedoucí (Admin)" style="font-size: 14px;">👑</span>' : ''}`;
        
        li.addEventListener('click', () => openMemberModal(clen.id));
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
    const wishContainer = document.getElementById('member-wish-badges');
    doneContainer.innerHTML = '';
    wishContainer.innerHTML = '';

    let doneCount = 0;
    let wishCount = 0;

    data.odborky.forEach(o => {
        const b = badgesCatalog[o.odborka_id];
        if (!b) return;
        
        const badgeEl = document.createElement('div');
        badgeEl.style = 'display: flex; flex-direction: column; align-items: center; width: 70px; text-align: center;';
        badgeEl.innerHTML = `
            <img src="data/nasivky/${b.id}.png" style="width: 40px; height: 40px; border-radius: 6px; border: 1px solid var(--border); background: #fff;" title="${b.name}">
            <span style="font-size: 10px; margin-top: 4px; line-height: 1.2;">${b.name}</span>
        `;

        if (o.stav === 'splneno') {
            doneContainer.appendChild(badgeEl);
            doneCount++;
        } else if (o.stav === 'chci_plnit') {
            wishContainer.appendChild(badgeEl);
            wishCount++;
        }
    });

    if (doneCount === 0) doneContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted);">Zatím žádné splněné odborky.</span>';
    if (wishCount === 0) wishContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted);">Žádné odborky v plánu.</span>';

    document.getElementById('member-modal').classList.add('open');
}

function renderAggregate() {
    const container = document.getElementById('aggregate-list');
    container.innerHTML = '';

    const agr = groupData.agregace;
    const badgeStats = [];

    for (const badgeId in agr) {
        if (badgesCatalog[badgeId]) {
            badgeStats.push({
                badge: badgesCatalog[badgeId],
                splneno: agr[badgeId].splneno || [],
                chci_plnit: agr[badgeId].chci_plnit || []
            });
        }
    }

    badgeStats.sort((a, b) => (b.splneno.length + b.chci_plnit.length) - (a.splneno.length + a.chci_plnit.length));

    if (badgeStats.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 14px;">Ve skupině zatím nejsou žádné záznamy o odborkách.</p>';
        return;
    }

    badgeStats.forEach(stat => {
        const total = stat.splneno.length + stat.chci_plnit.length;
        if (total === 0) return;

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
                ${stat.splneno.length > 0 ? `<span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px;">✅ ${stat.splneno.length}</span>` : ''}
                ${stat.chci_plnit.length > 0 ? `<span style="background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 12px;">⭐ ${stat.chci_plnit.length}</span>` : ''}
            </div>
        `;

        const body = document.createElement('div');
        body.style = 'padding: 16px; display: none; border-top: 1px solid var(--border); font-size: 13px;';
        
        let bodyHtml = '';
        if (stat.splneno.length > 0) {
            bodyHtml += `<div style="margin-bottom: 8px;"><strong style="color: #15803d;">Splnili:</strong> ${stat.splneno.join(', ')}</div>`;
        }
        if (stat.chci_plnit.length > 0) {
            bodyHtml += `<div><strong style="color: #b45309;">Chtějí plnit:</strong> ${stat.chci_plnit.join(', ')}</div>`;
        }
        body.innerHTML = bodyHtml;

        header.addEventListener('click', () => {
            body.style.display = body.style.display === 'none' ? 'block' : 'none';
        });

        item.appendChild(header);
        item.appendChild(body);
        container.appendChild(item);
    });
}

document.getElementById('member-close-btn').addEventListener('click', () => {
    document.getElementById('member-modal').classList.remove('open');
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGroupApp);
} else {
    initGroupApp();
}