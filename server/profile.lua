XSAdminProfile = true

local IsAdmin        = function(src) return exports['XS-AdminMenu']:IsAdmin(src) end
local HasPermission  = function(src, p) return exports['XS-AdminMenu']:HasPermission(src, p) end
local GetAdminCache  = function(src) return exports['XS-AdminMenu']:GetAdminCache(src) end
local Audit          = function(...) exports['XS-AdminMenu']:Audit(...) end
local GetIdentifiers = function(src) return exports['XS-AdminMenu']:GetIdentifiers(src) end
local GetJoinTime    = function(src) return exports['XS-AdminMenu']:GetJoinTime(src) end

local ACCOUNT_PERM = { cash = 'setcash', bank = 'setbank', crypto = 'setbank' }
local NO_MINUS = { cash = true, crypto = true }
local META_KEYS = { 'hunger', 'thirst', 'stress', 'armor', 'isdead', 'inlaststand', 'ishandcuffed', 'injail', 'tracker',
    'fingerprint', 'bloodtype', 'walletid', 'callsign', 'phone', 'licences', 'criminalrecord', 'jailitems' }
local SHOWN_IDS = { license = true, license2 = true, discord = true, steam = true, fivem = true, xbl = true, live = true }

local function decode(v, fallback)
    if type(v) == 'table' then return v end
    local ok, r = pcall(json.decode, v or '')
    if ok and type(r) == 'table' then return r end
    return fallback
end

local function slug(v)
    return (tostring(v or ''):lower():gsub('[^%w_%-]', '')):sub(1, 50)
end

local function grades(raw)
    local out = {}
    for level, g in pairs(type(raw) == 'table' and raw or {}) do
        local n = tonumber(level)
        if n and type(g) == 'table' then
            out[#out + 1] = { level = n, name = tostring(g.name or n), boss = g.isboss == true, pay = tonumber(g.payment) }
        end
    end
    table.sort(out, function(a, b) return a.level < b.level end)
    return out
end

local function sorted(raw)
    local out = {}
    for name, def in pairs(type(raw) == 'table' and raw or {}) do
        if type(def) == 'table' then
            out[#out + 1] = { name = tostring(name), label = tostring(def.label or name), grades = grades(def.grades) }
        end
    end
    table.sort(out, function(a, b) return a.label:lower() < b.label:lower() end)
    return out
end

local function gradeOf(def, level)
    local list = type(def) == 'table' and def.grades or nil
    if type(list) ~= 'table' then return nil end
    return list[level] or list[tostring(level)]
end

local function online(citizenid)
    for _, s in ipairs(GetPlayers()) do
        local id = tonumber(s)
        local p = id and Framework.GetPlayer(id)
        if p and p.PlayerData and p.PlayerData.citizenid == citizenid then return id, p end
    end
    return nil, nil
end

local function redact(v)
    v = tostring(v or '')
    if #v <= 14 then return v end
    return v:sub(1, 10) .. '…' .. v:sub(-4)
end

local function nameOf(charinfo, fallback)
    local ci = type(charinfo) == 'table' and charinfo or {}
    local name = ((ci.firstname or '') .. ' ' .. (ci.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
    return name ~= '' and name or (fallback or '?')
end

local function safeQuery(sql, args)
    local ok, rows = pcall(MySQL.query.await, sql, args)
    return ok and rows or {}
end

local function pickMeta(meta)
    local out = {}
    meta = type(meta) == 'table' and meta or {}
    for _, key in ipairs(META_KEYS) do
        if meta[key] ~= nil then out[key] = meta[key] end
    end
    return out
end

local function live(src)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end
    local c = GetEntityCoords(ped)
    local info = {
        health = GetEntityHealth(ped),
        armour = GetPedArmour(ped),
        coords = { x = math.floor(c.x * 100) / 100, y = math.floor(c.y * 100) / 100, z = math.floor(c.z * 100) / 100 },
        heading = math.floor(GetEntityHeading(ped)),
        ping = GetPlayerPing(src),
        bucket = GetPlayerRoutingBucket(src),
    }
    local okMax, max = pcall(GetEntityMaxHealth, ped)
    info.maxHealth = okMax and tonumber(max) and max > 0 and max or 200
    local joined = GetJoinTime(src)
    info.onlineSeconds = joined and (os.time() - joined) or nil
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle and vehicle ~= 0 then
        info.vehicle = {
            plate = (GetVehicleNumberPlateText(vehicle) or ''):gsub('^%s+', ''):gsub('%s+$', ''),
            driver = GetPedInVehicleSeat(vehicle, -1) == ped,
            model = GetEntityModel(vehicle),
        }
    end
    return info
end

local function profile(admin, citizenid)
    local src, tp = online(citizenid)
    local out = { citizenid = citizenid, online = src ~= nil, src = src }
    if tp then
        local pd = tp.PlayerData
        out.charinfo, out.job, out.gang, out.money = pd.charinfo, pd.job, pd.gang, pd.money
        out.metadata, out.license = pickMeta(pd.metadata), pd.license
        out.live = live(src)
        local a = GetAdminCache(src)
        if a then out.staff = { role = a.roleLabel or a.role, color = a.roleColor } end
        if HasPermission(admin, 'viewids') then
            local ids = {}
            for kind, value in pairs(GetIdentifiers(src) or {}) do
                if SHOWN_IDS[kind] then ids[#ids + 1] = { type = kind, value = redact(value) } end
            end
            table.sort(ids, function(a2, b2) return a2.type < b2.type end)
            out.identifiers = ids
        end
    else
        local row = MySQL.single.await('SELECT * FROM players WHERE citizenid = ?', { citizenid })
        if not row then return nil end
        out.charinfo, out.job, out.gang = decode(row.charinfo, {}), decode(row.job, {}), decode(row.gang, {})
        out.money, out.metadata, out.license = decode(row.money, {}), pickMeta(decode(row.metadata, {})), row.license
        out.lastSeen = row.last_logged_out or row.last_updated
    end
    out.name = nameOf(out.charinfo, citizenid)
    out.warnings = safeQuery('SELECT * FROM admin_warnings WHERE citizenid = ? ORDER BY created_at DESC', { citizenid })
    out.bans = safeQuery('SELECT * FROM admin_bans WHERE citizenid = ? ORDER BY created_at DESC', { citizenid })
    if HasPermission(admin, 'viewnotes') then
        out.notes = safeQuery('SELECT * FROM admin_notes WHERE citizenid = ? ORDER BY created_at DESC', { citizenid })
    end
    out.history = safeQuery('SELECT action, admin_name, details, created_at FROM admin_audit WHERE target_citizenid = ? ORDER BY created_at DESC LIMIT 25', { citizenid })
    out.vehicles = safeQuery('SELECT * FROM player_vehicles WHERE citizenid = ? ORDER BY plate', { citizenid })
    for i, v in ipairs(out.vehicles) do
        out.vehicles[i] = {
            model = v.vehicle, plate = v.plate, garage = v.garage, state = tonumber(v.state),
            fuel = tonumber(v.fuel), engine = tonumber(v.engine), body = tonumber(v.body), depot = tonumber(v.depotprice),
        }
    end
    return out
end

lib.callback.register('XS-AdminMenu:server:getProfile', function(src, data)
    if not IsAdmin(src) then return nil end
    local cid = type(data) == 'table' and tostring(data.citizenid or '') or ''
    if cid == '' then return nil end
    return profile(src, cid)
end)

lib.callback.register('XS-AdminMenu:server:getJobsGangs', function(src)
    if not IsAdmin(src) then return nil end
    return { jobs = sorted(Framework.GetJobs()), gangs = sorted(Framework.GetGangs()) }
end)

local function saveOffline(citizenid, column, value)
    if column ~= 'money' and column ~= 'job' and column ~= 'gang' then return false end
    local affected = MySQL.update.await(('UPDATE players SET `%s` = ? WHERE citizenid = ?'):format(column), { json.encode(value), citizenid })
    return (tonumber(affected) or 0) > 0
end

local function editMoney(src, tp, cid, data)
    local account = slug(data.account)
    if not ACCOUNT_PERM[account] then return false, 'Unknown account' end
    if not HasPermission(src, ACCOUNT_PERM[account]) then return false, 'You cannot edit this account' end
    local amount = math.floor(tonumber(data.amount) or -1)
    if amount < 0 or amount > 1000000000000 then return false, 'Enter an amount' end
    local op = data.op
    if op ~= 'set' and op ~= 'add' and op ~= 'remove' then return false, 'Pick add, remove or set' end
    if tp then
        local money = tp.PlayerData.money or {}
        local cur = tonumber(money[account])
        if cur == nil then return false, 'They have no ' .. account .. ' account' end
        if op == 'add' then
            tp.Functions.AddMoney(account, amount, 'admin')
        elseif op == 'remove' then
            local take = NO_MINUS[account] and math.min(amount, cur) or amount
            if take > 0 then tp.Functions.RemoveMoney(account, take, 'admin') end
        elseif tp.Functions.SetMoney then
            tp.Functions.SetMoney(account, amount, 'admin')
        elseif amount > cur then
            tp.Functions.AddMoney(account, amount - cur, 'admin')
        elseif amount < cur then
            tp.Functions.RemoveMoney(account, cur - amount, 'admin')
        end
    else
        local row = MySQL.single.await('SELECT money FROM players WHERE citizenid = ?', { cid })
        if not row then return false, 'Character not found' end
        local money = decode(row.money, {})
        local cur = tonumber(money[account])
        if cur == nil then return false, 'They have no ' .. account .. ' account' end
        if op == 'add' then cur = cur + amount
        elseif op == 'remove' then cur = cur - amount
        else cur = amount end
        if NO_MINUS[account] and cur < 0 then cur = 0 end
        money[account] = cur
        if not saveOffline(cid, 'money', money) then return false, 'Could not save' end
    end
    return true, ('%s_MONEY'):format(op:upper()), ('%s $%d'):format(account, amount)
end

local function editJob(src, tp, cid, data)
    if not HasPermission(src, 'setjob') then return false, 'You cannot change jobs' end
    local name, level = slug(data.job), math.floor(tonumber(data.grade) or 0)
    local def = (Framework.GetJobs() or {})[name]
    if not def then return false, 'Unknown job' end
    local g = gradeOf(def, level)
    if not g then return false, 'That grade does not exist' end
    if tp then
        tp.Functions.SetJob(name, level)
    else
        local job = {
            name = name, label = def.label or name, type = def.type, payment = tonumber(g.payment) or 0,
            onduty = def.defaultDuty ~= false, isboss = g.isboss == true, grade = { name = g.name or tostring(level), level = level },
        }
        if not saveOffline(cid, 'job', job) then return false, 'Could not save' end
    end
    return true, 'SET_JOB', ('%s grade %d'):format(name, level)
end

local function editGang(src, tp, cid, data)
    if not HasPermission(src, 'setjob') then return false, 'You cannot change gangs' end
    local name, level = slug(data.gang), math.floor(tonumber(data.grade) or 0)
    local def = (Framework.GetGangs() or {})[name]
    if not def then return false, 'Unknown gang' end
    local g = gradeOf(def, level)
    if not g then return false, 'That rank does not exist' end
    if tp then
        if tp.Functions.SetGang then
            tp.Functions.SetGang(name, level)
        else
            return false, 'This framework cannot set a gang here'
        end
    else
        local gang = { name = name, label = def.label or name, isboss = g.isboss == true, grade = { name = g.name or tostring(level), level = level } }
        if not saveOffline(cid, 'gang', gang) then return false, 'Could not save' end
    end
    return true, 'SET_GANG', ('%s rank %d'):format(name, level)
end

local function editDuty(src, tp, _, data)
    if not HasPermission(src, 'setjob') then return false, 'You cannot change duty' end
    if not tp then return false, 'They are offline' end
    local on = data.on == true
    if tp.Functions.SetJobDuty then
        tp.Functions.SetJobDuty(on)
    else
        return false, 'This framework cannot set duty here'
    end
    return true, on and 'SET_DUTY_ON' or 'SET_DUTY_OFF', nil
end

local EDITS = { money = editMoney, job = editJob, gang = editGang, duty = editDuty }

lib.callback.register('XS-AdminMenu:server:editPlayer', function(src, data)
    if not IsAdmin(src) then return { ok = false, error = 'No access' } end
    data = type(data) == 'table' and data or {}
    local cid = tostring(data.citizenid or '')
    local edit = EDITS[data.kind]
    if cid == '' or not edit then return { ok = false, error = 'Nothing to change' } end
    local tSrc, tp = online(cid)
    if tSrc then pcall(function() exports['XS-AdminMenu']:AcExempt(tSrc) end) end
    local ok, action, details = edit(src, tp, cid, data)
    if not ok then return { ok = false, error = action } end
    local fresh = profile(src, cid)
    Audit(src, action, fresh and fresh.name or cid, cid, details)
    return { ok = true, profile = fresh }
end)
