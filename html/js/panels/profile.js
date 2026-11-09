// XS-AdminMenu — Player profile

const PF = { cid: null, src: null, base: null, data: null, tab: 'overview', lists: null, jobPick: null, gangPick: null, jobQuery: '', gangQuery: '', invQuery: '', inv: null, busy: false, timer: null };

const PF_TABS = [
    { id: 'overview',   label: 'Overview',     ico: 'dashboard' },
    { id: 'money',      label: 'Money',        ico: 'money' },
    { id: 'jobgang',    label: 'Job & Gang',   ico: 'job' },
    { id: 'inventory',  label: 'Inventory',    ico: 'inventory', perm: 'viewinv' },
    { id: 'vehicles',   label: 'Vehicles',     ico: 'spawner' },
    { id: 'actions',    label: 'Actions',      ico: 'self' },
    { id: 'moderation', label: 'Moderation',   ico: 'bans' },
];

const PF_ACCOUNTS = {
    cash:   { label: 'Cash',   perm: 'setcash', ico: 'money' },
    bank:   { label: 'Bank',   perm: 'setbank', ico: 'stats' },
    crypto: { label: 'Crypto', perm: 'setbank', ico: 'link' },
};

function _pfName(d) {
    const ci = (d && d.charinfo) || {};
    const full = [ci.firstname, ci.lastname].filter(Boolean).join(' ').trim();
    return full || (d && d.name) || (PF.base && PF.base.name) || 'Unknown';
}

function _pfInitials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function _pfNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function _pfMoney(n) {
    return '$' + Math.round(_pfNum(n)).toLocaleString('en-US');
}

function _pfDuration(secs) {
    secs = _pfNum(secs);
    if (secs <= 0) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

function _pfBar(value, max, tone) {
    const pct = Math.max(0, Math.min(100, max > 0 ? (_pfNum(value) / max) * 100 : 0));
    return `<div class="pf-bar ${tone || ''}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

function _pfRow(label, value, mono) {
    return `<div class="pf-row"><span>${esc(label)}</span><b class="${mono ? 'mono' : ''}">${value}</b></div>`;
}

function _pfOnline() {
    return !!(PF.data && PF.data.online && PF.data.src);
}

function _pfBtn(def) {
    const d = PF.data || {};
    const disabled = def.online && !_pfOnline();
    return `<button class="pf-act ${def.tone || ''}" ${disabled ? 'disabled' : ''}
        data-ca-action="playerBtn" data-kind="${escAttr(def.kind)}" data-act="${escAttr(def.act)}"
        data-src="${escNum(d.src || 0)}" data-cid="${escAttr(d.citizenid || PF.cid)}" data-name="${escAttr(_pfName(d))}"
        ${def.state !== undefined ? `data-state="${escAttr(def.state)}"` : ''}>
        <span class="pf-act-ico">${icon(def.ico)}</span><span class="pf-act-label">${esc(def.label)}</span>
    </button>`;
}

function _pfToast(text, ok) {
    const el = document.getElementById('pf-toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'pf-toast show ' + (ok ? 'ok' : 'bad');
    clearTimeout(_pfToast.t);
    _pfToast.t = setTimeout(() => { el.className = 'pf-toast'; }, 3200);
}

async function pfOpen(cid, src, base) {
    if (!cid) return;
    PF.cid = cid;
    PF.src = src || null;
    PF.base = base || null;
    PF.data = null;
    PF.inv = null;
    PF.tab = 'overview';
    PF.jobPick = PF.gangPick = null;
    PF.jobQuery = PF.gangQuery = PF.invQuery = '';
    const panel = document.getElementById('player-profile-panel');
    panel.classList.remove('hidden');
    document.getElementById('player-profile-inner').innerHTML = `<div class="pf"><div class="pf-loading">${icon('players')}<span>Loading ${esc((base && base.name) || 'player')}…</span></div></div>`;
    await pfReload();
    if (!PF.timer) PF.timer = setInterval(_pfTick, 5000);
}

async function pfReload() {
    const cid = PF.cid;
    const data = await caFetch('XS-AdminMenu:server:getProfile', { citizenid: cid });
    if (PF.cid !== cid) return;
    if (!data) {
        document.getElementById('player-profile-inner').innerHTML = `<div class="pf"><div class="pf-loading">${icon('warn')}<span>Could not load this player.</span>
            <button class="btn btn-ghost btn-sm" data-ca-action="pfClose">Back to players</button></div></div>`;
        return;
    }
    PF.data = data;
    _pfRender();
}

async function _pfTick() {
    const panel = document.getElementById('player-profile-panel');
    if (!panel || panel.classList.contains('hidden') || !PF.cid || PF.busy) return;
    if (PF.tab !== 'overview' || !_pfOnline()) return;
    const cid = PF.cid;
    const data = await caFetch('XS-AdminMenu:server:getProfile', { citizenid: cid });
    if (data && PF.cid === cid && PF.tab === 'overview') {
        PF.data = data;
        _pfRender();
    }
}

function _pfRender() {
    const d = PF.data;
    const root = document.getElementById('player-profile-inner');
    if (!d || !root) return;
    const name = _pfName(d);
    const job = d.job || {};
    const gang = d.gang || {};
    const live = d.live || {};
    const staffColor = d.staff && /^#[0-9a-fA-F]{3,8}$/.test(d.staff.color || '') ? d.staff.color : 'var(--sky)';
    const warns = (d.warnings || []).length;
    const tabs = PF_TABS.filter((t) => !t.perm || hasPermission(t.perm));
    if (!tabs.some((t) => t.id === PF.tab)) PF.tab = 'overview';

    const quick = [
        { show: hasPermission('teleport'), kind: 'do', act: 'goto',     ico: 'goto',     label: 'Go to',    online: true },
        { show: hasPermission('bring'),    kind: 'do', act: 'bring',    ico: 'bring',    label: 'Bring',    online: true },
        { show: hasPermission('spectate'), kind: 'do', act: 'spectate', ico: 'spectate', label: 'Spectate', online: true },
        { show: hasPermission('freeze'),   kind: 'do', act: 'freeze',   ico: 'freeze',   label: 'Freeze',   online: true, state: 'true' },
        { show: hasPermission('revive'),   kind: 'do', act: 'revive',   ico: 'revive',   label: 'Revive',   online: true },
        { show: hasPermission('heal'),     kind: 'do', act: 'heal',     ico: 'heal',     label: 'Heal',     online: true },
    ].filter((b) => b.show);

    root.innerHTML = `<div class="pf">
        <div class="xs-lightbar"></div>
        <header class="pf-top">
            <button class="pf-back" data-ca-action="pfClose">${icon('chevron')}<span>Players</span></button>
            <div class="pf-avatar ${d.online ? 'on' : ''}">${esc(_pfInitials(name))}</div>
            <div class="pf-who">
                <h1>${esc(name)}${d.staff ? `<span class="pf-staff" style="--st:${staffColor}">${esc(d.staff.role || 'Staff')}</span>` : ''}</h1>
                <div class="pf-chips">
                    ${d.online
                        ? `<span class="pf-chip live"><i></i>Online · ID ${escNum(d.src)}</span>`
                        : `<span class="pf-chip off"><i></i>Offline${d.lastSeen ? ' · last seen ' + esc(formatDate(d.lastSeen)) : ''}</span>`}
                    <span class="pf-chip mono">${esc(d.citizenid)}</span>
                    <span class="pf-chip">${icon('job')}${esc(job.label || job.name || 'No job')}${job.grade && job.grade.name ? ' · ' + esc(job.grade.name) : ''}</span>
                    ${gang.name && gang.name !== 'none' ? `<span class="pf-chip">${icon('tag')}${esc(gang.label || gang.name)}${gang.grade && gang.grade.name ? ' · ' + esc(gang.grade.name) : ''}</span>` : ''}
                    ${d.online && live.ping !== undefined ? `<span class="pf-chip mono ${pingClass(live.ping)}">${escNum(live.ping)} ms</span>` : ''}
                    ${warns ? `<span class="pf-chip warn">${icon('warn')}${escNum(warns)} warning${warns === 1 ? '' : 's'}</span>` : ''}
                </div>
            </div>
            <div class="pf-quick">${quick.map(_pfBtn).join('')}</div>
            <button class="pf-icon" title="Refresh" data-ca-action="pfRefresh">${icon('refresh')}</button>
            <button class="pf-icon close" title="Close" data-ca-action="pfClose">${icon('close')}</button>
        </header>
        <div class="pf-body">
            <nav class="pf-tabs">
                ${tabs.map((t) => `<button class="pf-tab ${PF.tab === t.id ? 'on' : ''}" data-ca-action="pfTab" data-tab="${escAttr(t.id)}">
                    ${icon(t.ico)}<span>${esc(t.label)}</span>
                    ${t.id === 'moderation' && warns ? `<em>${escNum(warns)}</em>` : ''}
                    ${t.id === 'vehicles' && (d.vehicles || []).length ? `<em>${escNum(d.vehicles.length)}</em>` : ''}
                </button>`).join('')}
                <div class="pf-tabs-foot">
                    <span>Citizen ID</span><b class="mono">${esc(d.citizenid)}</b>
                    ${d.license ? `<span>Licence</span><b class="mono" title="${escAttr(d.license)}">${esc(String(d.license).replace(/^license:/, '').slice(0, 10))}…</b>` : ''}
                </div>
            </nav>
            <section class="pf-content" id="pf-content">${_pfTabHtml()}</section>
        </div>
        <div class="pf-toast" id="pf-toast"></div>
    </div>`;
    _pfAfterRender();
}

function _pfTabHtml() {
    switch (PF.tab) {
        case 'money':      return _pfMoneyTab();
        case 'jobgang':    return _pfJobGangTab();
        case 'inventory':  return _pfInventoryTab();
        case 'vehicles':   return _pfVehiclesTab();
        case 'actions':    return _pfActionsTab();
        case 'moderation': return _pfModerationTab();
        default:           return _pfOverviewTab();
    }
}

function _pfOverviewTab() {
    const d = PF.data;
    const ci = d.charinfo || {};
    const job = d.job || {};
    const gang = d.gang || {};
    const meta = d.metadata || {};
    const money = d.money || {};
    const live = d.live || null;
    const accounts = Object.keys(PF_ACCOUNTS).filter((k) => money[k] !== undefined);

    const tiles = accounts.map((k) => `<div class="pf-kpi">
        <span>${icon(PF_ACCOUNTS[k].ico)}${esc(PF_ACCOUNTS[k].label)}</span><b>${esc(_pfMoney(money[k]))}</b></div>`);
    if (live) {
        const maxHp = _pfNum(live.maxHealth) || 200;
        const hpPct = Math.max(0, Math.round(((_pfNum(live.health) - 100) / Math.max(1, maxHp - 100)) * 100));
        tiles.push(`<div class="pf-kpi"><span>${icon('heal')}Health</span><b>${escNum(Math.min(100, hpPct))}%</b>${_pfBar(hpPct, 100, hpPct < 30 ? 'red' : 'green')}</div>`);
        tiles.push(`<div class="pf-kpi"><span>${icon('shield')}Armour</span><b>${escNum(_pfNum(live.armour))}%</b>${_pfBar(live.armour, 100, 'blue')}</div>`);
        tiles.push(`<div class="pf-kpi"><span>${icon('clock')}Online for</span><b>${esc(_pfDuration(live.onlineSeconds))}</b></div>`);
    }

    const flags = [];
    if (meta.isdead) flags.push('<span class="pf-flag red">Dead</span>');
    else if (meta.inlaststand) flags.push('<span class="pf-flag amber">Downed</span>');
    if (meta.ishandcuffed) flags.push('<span class="pf-flag amber">Cuffed</span>');
    if (_pfNum(meta.injail) > 0) flags.push(`<span class="pf-flag amber">In jail · ${escNum(meta.injail)} months</span>`);
    if (meta.tracker) flags.push('<span class="pf-flag blue">Ankle monitor</span>');
    if (d.bans && d.bans.some((b) => _pfNum(b.is_active) === 1)) flags.push('<span class="pf-flag red">Active ban</span>');

    const veh = live && live.vehicle;
    const coords = live && live.coords;
    const history = (d.history || []).slice(0, 6);
    const ids = d.identifiers || [];

    return `<div class="pf-pad">
        <div class="pf-kpis">${tiles.join('')}</div>
        ${flags.length ? `<div class="pf-flags">${flags.join('')}</div>` : ''}
        <div class="pf-grid">
            <div class="pf-card">
                <div class="pf-card-h">${icon('character')}Character</div>
                ${_pfRow('Name', esc(_pfName(d)))}
                ${_pfRow('Date of birth', esc(ci.birthdate || '—'), true)}
                ${_pfRow('Gender', esc(ci.gender === 1 || ci.gender === '1' ? 'Female' : ci.gender === undefined ? '—' : 'Male'))}
                ${_pfRow('Nationality', esc(ci.nationality || '—'))}
                ${_pfRow('Phone', esc(ci.phone || meta.phone || '—'), true)}
                ${_pfRow('Bank account', esc(ci.account || '—'), true)}
                ${_pfRow('Fingerprint', esc(meta.fingerprint || '—'), true)}
                ${_pfRow('Blood type', esc(meta.bloodtype || '—'))}
            </div>
            <div class="pf-card">
                <div class="pf-card-h">${icon('job')}Work</div>
                ${_pfRow('Job', esc(job.label || job.name || '—'))}
                ${_pfRow('Grade', esc(job.grade ? `${job.grade.name || ''} (${_pfNum(job.grade.level)})` : '—'))}
                ${_pfRow('On duty', job.onduty ? '<span class="pf-yes">Yes</span>' : '<span class="pf-no">No</span>')}
                ${_pfRow('Boss', job.isboss ? '<span class="pf-yes">Yes</span>' : '<span class="pf-no">No</span>')}
                <div class="pf-sep"></div>
                ${_pfRow('Gang', esc(gang.name && gang.name !== 'none' ? (gang.label || gang.name) : 'None'))}
                ${_pfRow('Rank', esc(gang.grade && gang.name !== 'none' ? `${gang.grade.name || ''} (${_pfNum(gang.grade.level)})` : '—'))}
                ${meta.callsign ? _pfRow('Callsign', esc(meta.callsign), true) : ''}
            </div>
            ${live ? `<div class="pf-card">
                <div class="pf-card-h">${icon('heal')}Needs</div>
                <div class="pf-need"><span>Hunger</span>${_pfBar(meta.hunger, 100, _pfNum(meta.hunger) < 25 ? 'red' : 'green')}<b>${escNum(Math.round(_pfNum(meta.hunger)))}</b></div>
                <div class="pf-need"><span>Thirst</span>${_pfBar(meta.thirst, 100, _pfNum(meta.thirst) < 25 ? 'red' : 'blue')}<b>${escNum(Math.round(_pfNum(meta.thirst)))}</b></div>
                <div class="pf-need"><span>Stress</span>${_pfBar(meta.stress, 100, _pfNum(meta.stress) > 70 ? 'red' : 'amber')}<b>${escNum(Math.round(_pfNum(meta.stress)))}</b></div>
            </div>
            <div class="pf-card">
                <div class="pf-card-h">${icon('map')}Location</div>
                ${coords ? _pfRow('Coords', esc(`${coords.x}, ${coords.y}, ${coords.z}`), true) : ''}
                ${_pfRow('Heading', escNum(_pfNum(live.heading)) + '°', true)}
                ${_pfRow('Routing bucket', escNum(_pfNum(live.bucket)), true)}
                ${_pfRow('In a vehicle', veh ? `<span class="pf-plate">${esc(veh.plate || '—')}</span> ${veh.driver ? 'driving' : 'passenger'}` : '<span class="pf-no">No</span>')}
            </div>` : ''}
            <div class="pf-card">
                <div class="pf-card-h">${icon('audit')}Record</div>
                <div class="pf-mini">
                    <div><b>${escNum((d.warnings || []).length)}</b><span>Warnings</span></div>
                    <div><b>${escNum((d.bans || []).length)}</b><span>Bans</span></div>
                    <div><b>${escNum((d.notes || []).length)}</b><span>Notes</span></div>
                    <div><b>${escNum((d.vehicles || []).length)}</b><span>Vehicles</span></div>
                </div>
                <div class="pf-sub">Recent staff actions</div>
                ${history.length ? history.map((h) => `<div class="pf-hist"><b>${esc(String(h.action || '').replace(/_/g, ' ').toLowerCase())}</b><span>${esc(h.admin_name || '')} · ${esc(timeAgo(h.created_at))}</span></div>`).join('') : '<div class="pf-empty-sm">Nothing yet</div>'}
            </div>
            ${ids.length ? `<div class="pf-card">
                <div class="pf-card-h">${icon('lock')}Identifiers</div>
                ${ids.map((i) => _pfRow(i.type, esc(i.value), true)).join('')}
            </div>` : ''}
        </div>
    </div>`;
}

function _pfMoneyTab() {
    const d = PF.data;
    const money = d.money || {};
    const keys = Object.keys(PF_ACCOUNTS).filter((k) => money[k] !== undefined);
    if (!keys.length) return `<div class="pf-pad"><div class="pf-empty">${icon('money')}<b>No money accounts</b></div></div>`;
    return `<div class="pf-pad">
        <div class="pf-head"><h2>Money</h2><p>${d.online ? 'Changes land in their wallet straight away.' : 'They are offline. Changes are saved to their character.'}</p></div>
        <div class="pf-accounts">
            ${keys.map((k) => {
                const a = PF_ACCOUNTS[k];
                const can = hasPermission(a.perm);
                return `<div class="pf-account">
                    <div class="pf-account-top"><span>${icon(a.ico)}${esc(a.label)}</span>${can ? '' : `<em>${icon('lock')}No permission</em>`}</div>
                    <div class="pf-account-amt">${esc(_pfMoney(money[k]))}</div>
                    <div class="pf-amount">
                        <span>$</span><input class="input" id="pf-amt-${escAttr(k)}" type="number" min="0" step="1" placeholder="Amount" ${can ? '' : 'disabled'}>
                    </div>
                    <div class="pf-presets">
                        ${[100, 1000, 10000, 100000].map((v) => `<button class="pf-preset" ${can ? '' : 'disabled'} data-ca-action="pfPreset" data-account="${escAttr(k)}" data-value="${escNum(v)}">${esc(v >= 1000 ? (v / 1000) + 'k' : String(v))}</button>`).join('')}
                    </div>
                    <div class="pf-account-btns">
                        <button class="btn btn-success btn-sm" ${can ? '' : 'disabled'} data-ca-action="pfMoney" data-account="${escAttr(k)}" data-op="add">Add</button>
                        <button class="btn btn-amber btn-sm" ${can ? '' : 'disabled'} data-ca-action="pfMoney" data-account="${escAttr(k)}" data-op="remove">Remove</button>
                        <button class="btn btn-primary btn-sm" ${can ? '' : 'disabled'} data-ca-action="pfMoney" data-account="${escAttr(k)}" data-op="set">Set to</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

function _pfPicker(kind) {
    const isJob = kind === 'job';
    const lists = PF.lists || {};
    const all = (isJob ? lists.jobs : lists.gangs) || [];
    const query = (isJob ? PF.jobQuery : PF.gangQuery).toLowerCase();
    const picked = isJob ? PF.jobPick : PF.gangPick;
    const cur = (isJob ? PF.data.job : PF.data.gang) || {};
    const shown = all.filter((x) => !query || x.label.toLowerCase().includes(query) || x.name.toLowerCase().includes(query)).slice(0, 60);
    const pickDef = picked && all.find((x) => x.name === picked);
    const can = hasPermission('setjob');

    return `<div class="pf-card pf-pickcard">
        <div class="pf-card-h">${icon(isJob ? 'job' : 'tag')}${isJob ? 'Job' : 'Gang'}</div>
        <div class="pf-current">
            <div><span>Current</span><b>${esc(cur.name && cur.name !== 'none' ? (cur.label || cur.name) : (isJob ? 'No job' : 'No gang'))}</b>
            ${cur.grade ? `<em>${esc(cur.grade.name || '')} · ${isJob ? 'grade' : 'rank'} ${escNum(_pfNum(cur.grade.level))}</em>` : ''}</div>
            ${isJob && PF.data.online && can ? `<button class="pf-duty ${cur.onduty ? 'on' : ''}" data-ca-action="pfDuty" data-on="${cur.onduty ? 'false' : 'true'}">
                <i></i>${cur.onduty ? 'On duty' : 'Off duty'}</button>` : ''}
        </div>
        ${!can ? `<div class="pf-empty-sm">${icon('lock')}You cannot change ${isJob ? 'jobs' : 'gangs'}.</div>` : !all.length ? `<div class="pf-empty-sm">No ${isJob ? 'jobs' : 'gangs'} found on this server.</div>` : `
        <div class="pf-search">${icon('search')}<input class="input" id="pf-q-${kind}" placeholder="Search ${isJob ? 'jobs' : 'gangs'}" value="${escAttr(isJob ? PF.jobQuery : PF.gangQuery)}"></div>
        <div class="pf-pick">
            <div class="pf-list">
                ${shown.map((x) => `<button class="pf-item ${picked === x.name ? 'on' : ''} ${cur.name === x.name ? 'cur' : ''}" data-ca-action="pfPick" data-kind="${escAttr(kind)}" data-name="${escAttr(x.name)}">
                    <b>${esc(x.label)}</b><span class="mono">${esc(x.name)}</span></button>`).join('') || '<div class="pf-empty-sm">No match</div>'}
            </div>
            <div class="pf-grades">
                ${pickDef ? `<div class="pf-sub">${esc(pickDef.label)} · pick a ${isJob ? 'grade' : 'rank'}</div>
                    ${pickDef.grades.map((g) => `<button class="pf-grade" data-ca-action="pfSetRole" data-kind="${escAttr(kind)}" data-name="${escAttr(pickDef.name)}" data-grade="${escNum(g.level)}">
                        <span class="mono">${escNum(g.level)}</span><b>${esc(g.name)}</b>${g.boss ? '<em>Boss</em>' : ''}${isJob && g.pay ? `<i>${esc(_pfMoney(g.pay))}</i>` : ''}</button>`).join('') || '<div class="pf-empty-sm">No grades</div>'}`
                : `<div class="pf-empty-sm">Pick a ${isJob ? 'job' : 'gang'} on the left.</div>`}
            </div>
        </div>
        <div class="pf-quickrow">
            ${isJob && all.some((x) => x.name === 'unemployed') ? `<button class="btn btn-ghost btn-sm" data-ca-action="pfSetRole" data-kind="job" data-name="unemployed" data-grade="0">Make unemployed</button>` : ''}
            ${!isJob && all.some((x) => x.name === 'none') && cur.name && cur.name !== 'none' ? `<button class="btn btn-ghost btn-sm" data-ca-action="pfSetRole" data-kind="gang" data-name="none" data-grade="0">Remove from gang</button>` : ''}
        </div>`}
    </div>`;
}

function _pfJobGangTab() {
    if (!PF.lists) {
        _pfLoadLists();
        return `<div class="pf-pad"><div class="pf-loading">${icon('job')}<span>Loading jobs and gangs…</span></div></div>`;
    }
    return `<div class="pf-pad">
        <div class="pf-head"><h2>Job &amp; Gang</h2><p>${PF.data.online ? 'Changes apply straight away.' : 'They are offline. Changes are saved to their character.'}</p></div>
        <div class="pf-two">${_pfPicker('job')}${_pfPicker('gang')}</div>
    </div>`;
}

async function _pfLoadLists() {
    const lists = await caFetch('XS-AdminMenu:server:getJobsGangs', {});
    PF.lists = lists && typeof lists === 'object' ? { jobs: Array.isArray(lists.jobs) ? lists.jobs : [], gangs: Array.isArray(lists.gangs) ? lists.gangs : [] } : { jobs: [], gangs: [] };
    if (PF.tab === 'jobgang') _pfRenderContent();
}

function _pfInventoryTab() {
    const d = PF.data;
    if (!PF.inv) {
        _pfLoadInventory();
        return `<div class="pf-pad"><div class="pf-loading">${icon('inventory')}<span>Loading inventory…</span></div></div>`;
    }
    const items = (PF.inv.items || []).filter((it) => !PF.invQuery || (String(it.label || '') + ' ' + String(it.name || '')).toLowerCase().includes(PF.invQuery.toLowerCase()));
    const total = (PF.inv.items || []).reduce((n, it) => n + _pfNum(it.count), 0);
    return `<div class="pf-pad">
        <div class="pf-head"><h2>Inventory</h2><p>${escNum((PF.inv.items || []).length)} stacks · ${escNum(total)} items${PF.inv.weight !== undefined && PF.inv.maxWeight ? ` · ${escNum(Math.round(_pfNum(PF.inv.weight) / 1000))} / ${escNum(Math.round(_pfNum(PF.inv.maxWeight) / 1000))} kg` : ''}</p>
            <div class="pf-head-btns">
                <div class="pf-search sm">${icon('search')}<input class="input" id="pf-q-inv" placeholder="Search items" value="${escAttr(PF.invQuery)}"></div>
                <button class="btn btn-primary btn-sm" data-ca-action="playerBtn" data-kind="open" data-act="inventory" data-src="${escNum(d.src || 0)}" data-cid="${escAttr(d.citizenid)}" data-name="${escAttr(_pfName(d))}">${icon('inventory')}Give, take or clear</button>
            </div>
        </div>
        ${items.length ? `<div class="pf-items">${items.map((it) => `<div class="pf-itm" title="${escAttr(it.name)}">
            <span class="pf-itm-n">${escNum(_pfNum(it.count))}×</span><b>${esc(it.label || it.name)}</b><span class="mono">${esc(it.name)}</span></div>`).join('')}</div>`
            : `<div class="pf-empty">${icon('inventory')}<b>${PF.invQuery ? 'No match' : 'Empty pockets'}</b></div>`}
    </div>`;
}

async function _pfLoadInventory() {
    const d = PF.data;
    const inv = await caFetch('XS-AdminMenu:server:getInventory', { targetSrc: d.online ? d.src : null, targetCid: d.citizenid });
    PF.inv = inv && typeof inv === 'object' ? inv : { items: [] };
    if (PF.tab === 'inventory') _pfRenderContent();
}

function _pfVehiclesTab() {
    const list = PF.data.vehicles || [];
    const state = (v) => v.state === 1 ? ['In garage', 'green'] : v.state === 2 ? ['Impounded', 'red'] : v.state === 0 ? ['Out', 'amber'] : ['—', ''];
    return `<div class="pf-pad">
        <div class="pf-head"><h2>Vehicles</h2><p>${escNum(list.length)} owned</p></div>
        ${list.length ? `<div class="pf-table"><table>
            <thead><tr><th>Model</th><th>Plate</th><th>Garage</th><th>State</th><th>Fuel</th><th>Engine</th><th>Body</th></tr></thead>
            <tbody>${list.map((v) => {
                const [label, tone] = state(v);
                return `<tr>
                    <td><b>${esc(v.model || '—')}</b></td>
                    <td><span class="pf-plate">${esc(v.plate || '—')}</span></td>
                    <td>${esc(v.garage || '—')}</td>
                    <td><span class="pf-flag ${tone}">${esc(label)}</span></td>
                    <td>${v.fuel !== undefined && v.fuel !== null ? _pfBar(v.fuel, 100, 'amber') : '—'}</td>
                    <td>${v.engine !== undefined && v.engine !== null ? _pfBar(v.engine, 1000, 'green') : '—'}</td>
                    <td>${v.body !== undefined && v.body !== null ? _pfBar(v.body, 1000, 'blue') : '—'}</td>
                </tr>`;
            }).join('')}</tbody></table></div>`
            : `<div class="pf-empty">${icon('spawner')}<b>No vehicles</b><span>They do not own any cars.</span></div>`}
    </div>`;
}

function _pfActionsTab() {
    const P = (p) => hasPermission(p);
    const groups = [
        { title: 'Movement', items: [
            { show: P('teleport'),   kind: 'do',   act: 'goto',     ico: 'goto',     label: 'Go to them',  online: true },
            { show: P('bring'),      kind: 'do',   act: 'bring',    ico: 'bring',    label: 'Bring to me', online: true },
            { show: P('teleport'),   kind: 'open', act: 'sendto',   ico: 'map',      label: 'Send to…',    online: true },
            { show: P('resetpos'),   kind: 'do',   act: 'resetpos', ico: 'goto',     label: 'Reset position', online: true },
            { show: P('spectate'),   kind: 'do',   act: 'spectate', ico: 'spectate', label: 'Spectate',    online: true },
            { show: P('screenshot'), kind: 'open', act: 'watch',    ico: 'spectate', label: 'Watch live',  online: true },
        ] },
        { title: 'Health', items: [
            { show: P('revive'),     kind: 'do',   act: 'revive',    ico: 'revive', label: 'Revive',     online: true },
            { show: P('heal'),       kind: 'do',   act: 'heal',      ico: 'heal',   label: 'Heal',       online: true },
            { show: P('sethealth'),  kind: 'open', act: 'sethealth', ico: 'heal',   label: 'Set health', online: true },
            { show: P('killplayer'), kind: 'open', act: 'kill',      ico: 'warn',   label: 'Kill',       online: true, tone: 'danger' },
        ] },
        { title: 'Control', items: [
            { show: P('freeze'), kind: 'do',   act: 'freeze', ico: 'freeze', label: 'Freeze',   online: true, state: 'true' },
            { show: P('freeze'), kind: 'do',   act: 'freeze', ico: 'freeze', label: 'Unfreeze', online: true, state: 'false' },
            { show: P('slap'),   kind: 'do',   act: 'slap',   ico: 'warn',   label: 'Slap',     online: true },
            { show: P('eject'),  kind: 'open', act: 'eject',  ico: 'kick',   label: 'Eject from car', online: true },
        ] },
        { title: 'Items & vehicles', items: [
            { show: P('giveweapon'), kind: 'open', act: 'giveweapon',    ico: 'weapon',  label: 'Give weapon',   online: true },
            { show: P('clearinv'),   kind: 'do',   act: 'stripweapons',  ico: 'weapon',  label: 'Strip weapons', online: true, tone: 'danger' },
            { show: P('spawnveh'),   kind: 'open', act: 'spawnveh',      ico: 'spawner', label: 'Spawn vehicle', online: true },
            { show: P('deleteveh'),  kind: 'do',   act: 'deletevehicle', ico: 'trash',   label: 'Delete their car', online: true, tone: 'danger' },
            { show: P('viewinv'),    kind: 'open', act: 'inventory',     ico: 'inventory', label: 'Inventory' },
        ] },
        { title: 'Info & contact', items: [
            { show: P('screenshot'), kind: 'do',   act: 'screenshot',  ico: 'camera',    label: 'Screenshot',  online: true },
            { show: P('viewids'),    kind: 'open', act: 'identifiers', ico: 'search',    label: 'Identifiers', online: true },
            { show: P('dm'),         kind: 'open', act: 'dm',          ico: 'adminchat', label: 'Message them', online: true },
        ] },
    ];
    const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length);
    return `<div class="pf-pad">
        <div class="pf-head"><h2>Actions</h2><p>${_pfOnline() ? 'Everything you can do to this player.' : 'They are offline, so most actions are greyed out.'}</p></div>
        ${shown.length ? shown.map((g) => `<div class="pf-group"><div class="pf-sub">${esc(g.title)}</div><div class="pf-acts">${g.items.map(_pfBtn).join('')}</div></div>`).join('')
            : `<div class="pf-empty">${icon('lock')}<b>No actions</b><span>Your role has no player actions.</span></div>`}
    </div>`;
}

function _pfModerationTab() {
    const d = PF.data;
    const P = (p) => hasPermission(p);
    const big = [
        { show: P('warn'),    kind: 'open', act: 'warn', ico: 'warn',      label: 'Warn',  tone: 'amber' },
        { show: P('mute'),    kind: 'open', act: 'mute', ico: 'adminchat', label: 'Mute',  tone: 'amber', online: true },
        { show: P('kick'),    kind: 'open', act: 'kick', ico: 'kick',      label: 'Kick',  online: true },
        { show: P('tempban'), kind: 'open', act: 'ban',  ico: 'bans',      label: 'Ban',   tone: 'danger' },
    ].filter((b) => b.show);
    const warns = d.warnings || [];
    const bans = d.bans || [];
    const notes = d.notes;
    return `<div class="pf-pad">
        <div class="pf-head"><h2>Moderation</h2><p>Warnings, bans and notes on this character.</p></div>
        ${big.length ? `<div class="pf-acts big">${big.map(_pfBtn).join('')}</div>` : ''}
        <div class="pf-two">
            <div class="pf-card">
                <div class="pf-card-h">${icon('warn')}Warnings <em>${escNum(warns.length)}</em></div>
                ${warns.length ? warns.map((w) => `<div class="pf-entry">
                    <div><b>${esc(w.reason)}</b><span>${esc(w.admin_name || '')} · ${esc(formatDate(w.created_at))}</span></div>
                    ${P('warn') ? `<button class="pf-icon sm" title="Remove" data-ca-action="pfDelWarn" data-id="${escNum(w.id)}">${icon('close')}</button>` : ''}
                </div>`).join('') : '<div class="pf-empty-sm">No warnings</div>'}
            </div>
            <div class="pf-card">
                <div class="pf-card-h">${icon('bans')}Bans <em>${escNum(bans.length)}</em></div>
                ${bans.length ? bans.map((b) => `<div class="pf-entry">
                    <div><b>${esc(b.reason || 'No reason')}</b><span>${esc(b.admin_name || '')} · ${esc(formatDate(b.created_at))} · ${_pfNum(b.is_permanent) === 1 ? 'Permanent' : b.expires_at ? 'until ' + esc(formatDate(b.expires_at)) : '—'}</span></div>
                    <span class="pf-flag ${_pfNum(b.is_active) === 1 ? 'red' : ''}">${_pfNum(b.is_active) === 1 ? 'Active' : 'Lifted'}</span>
                </div>`).join('') : '<div class="pf-empty-sm">Never banned</div>'}
            </div>
        </div>
        ${Array.isArray(notes) ? `<div class="pf-card">
            <div class="pf-card-h">${icon('note')}Staff notes <em>${escNum(notes.length)}</em></div>
            ${P('addnote') ? `<div class="pf-noteadd"><input class="input" id="pf-note" maxlength="500" placeholder="Add a note other staff will see"><button class="btn btn-primary btn-sm" data-ca-action="pfAddNote">Add note</button></div>` : ''}
            ${notes.length ? notes.map((n) => `<div class="pf-entry"><div><b>${esc(n.note)}</b><span>${esc(n.admin_name || '')} · ${esc(formatDate(n.created_at))}</span></div></div>`).join('') : '<div class="pf-empty-sm">No notes yet</div>'}
        </div>` : ''}
        <div class="pf-card">
            <div class="pf-card-h">${icon('audit')}Staff history</div>
            ${(d.history || []).length ? d.history.map((h) => `<div class="pf-entry"><div><b>${esc(String(h.action || '').replace(/_/g, ' ').toLowerCase())}${h.details ? ' · ' + esc(h.details) : ''}</b><span>${esc(h.admin_name || '')} · ${esc(formatDate(h.created_at))}</span></div></div>`).join('') : '<div class="pf-empty-sm">No staff actions on record</div>'}
        </div>
    </div>`;
}

function _pfRenderContent() {
    const el = document.getElementById('pf-content');
    if (!el) return _pfRender();
    el.innerHTML = _pfTabHtml();
    _pfAfterRender();
}

function _pfAfterRender() {
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.oninput = function () { fn(this.value); };
    };
    bind('pf-q-job', (v) => { PF.jobQuery = v; _pfRefocus('pf-q-job'); });
    bind('pf-q-gang', (v) => { PF.gangQuery = v; _pfRefocus('pf-q-gang'); });
    bind('pf-q-inv', (v) => { PF.invQuery = v; _pfRefocus('pf-q-inv'); });
}

function _pfRefocus(id) {
    const before = document.getElementById(id);
    const pos = before ? before.selectionStart : null;
    _pfRenderContent();
    const after = document.getElementById(id);
    if (after) {
        after.focus();
        if (pos !== null) after.setSelectionRange(pos, pos);
    }
}

async function _pfEdit(payload, done) {
    if (PF.busy) return;
    PF.busy = true;
    const res = await caFetch('XS-AdminMenu:server:editPlayer', Object.assign({ citizenid: PF.cid }, payload));
    PF.busy = false;
    if (!res || !res.ok) return _pfToast((res && res.error) || 'That did not work', false);
    if (res.profile) PF.data = res.profile;
    _pfRender();
    _pfToast(done, true);
}

caAction('pfClose', () => {
    document.getElementById('player-profile-panel').classList.add('hidden');
    PF.cid = null;
    if (typeof loadPlayers === 'function' && document.getElementById('panel-players')?.classList.contains('active')) loadPlayers();
});

caAction('pfRefresh', () => { PF.inv = null; pfReload(); });

caAction('pfTab', (d) => {
    PF.tab = d.tab;
    if (d.tab === 'inventory') PF.inv = null;
    _pfRender();
});

caAction('pfPreset', (d) => {
    const el = document.getElementById('pf-amt-' + d.account);
    if (el) el.value = d.value;
});

caAction('pfMoney', (d) => {
    const el = document.getElementById('pf-amt-' + d.account);
    const amount = Math.floor(Number(el && el.value));
    if (!Number.isFinite(amount) || amount < 0 || (el && el.value === '')) return _pfToast('Enter an amount first', false);
    const label = (PF_ACCOUNTS[d.account] || {}).label || d.account;
    const verb = d.op === 'add' ? `Added ${_pfMoney(amount)} to ${label.toLowerCase()}` : d.op === 'remove' ? `Took ${_pfMoney(amount)} from ${label.toLowerCase()}` : `${label} set to ${_pfMoney(amount)}`;
    _pfEdit({ kind: 'money', account: d.account, op: d.op, amount }, verb);
});

caAction('pfPick', (d) => {
    if (d.kind === 'job') PF.jobPick = d.name; else PF.gangPick = d.name;
    _pfRenderContent();
});

caAction('pfSetRole', (d) => {
    const isJob = d.kind === 'job';
    const list = (PF.lists && (isJob ? PF.lists.jobs : PF.lists.gangs)) || [];
    const def = list.find((x) => x.name === d.name);
    const grade = def && def.grades.find((g) => g.level === Number(d.grade));
    const text = (isJob ? 'Job' : 'Gang') + ' set to ' + (def ? def.label : d.name) + (grade ? ' · ' + grade.name : '');
    if (isJob) PF.jobPick = null; else PF.gangPick = null;
    _pfEdit(isJob ? { kind: 'job', job: d.name, grade: Number(d.grade) } : { kind: 'gang', gang: d.name, grade: Number(d.grade) }, text);
});

caAction('pfDuty', (d) => {
    const on = d.on === 'true';
    _pfEdit({ kind: 'duty', on }, on ? 'Clocked them on duty' : 'Clocked them off duty');
});

caAction('pfAddNote', async () => {
    const el = document.getElementById('pf-note');
    const note = el && el.value.trim();
    if (!note) return;
    const ok = await caFetch('XS-AdminMenu:server:addNote', { citizenid: PF.cid, playerName: _pfName(PF.data), note });
    if (!ok) return _pfToast('Could not add the note', false);
    await pfReload();
    _pfToast('Note added', true);
});

caAction('pfDelWarn', async (d) => {
    const ok = await caFetch('XS-AdminMenu:server:deleteWarning', { warnId: Number(d.id), citizenid: PF.cid, playerName: _pfName(PF.data) });
    if (!ok) return _pfToast('Could not remove the warning', false);
    await pfReload();
    _pfToast('Warning removed', true);
});

function renderPlayerProfile(p) {
    if (!p) return;
    pfOpen(p.citizenid, p.onlineSrc || p.src, p);
}

window.pfOpen = pfOpen;
window.renderPlayerProfile = renderPlayerProfile;
