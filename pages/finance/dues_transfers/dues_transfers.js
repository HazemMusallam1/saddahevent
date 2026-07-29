// صفحة تحويلات المستحقات — تُحمّل ديناميكياً بعد SaddahDB.init()
// ثلاث تبويبات: أرباح الطلبات (للشريك التشغيلي) • مصاريف التشغيل/البنزين • المطالبات

const fmt = (n) => (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-US');

function allOrders() {
    const o = (window.SaddahDB && window.SaddahDB.data.orders) || [];
    const a = (window.SaddahDB && window.SaddahDB.data.archive) || [];
    return [...o, ...a];
}
function isCancelled(o) { return o.status === 'ملغي' || o.status === 'cancelled'; }
function saveDb() { window.SaddahDB.save(); }

// ─── التبديل بين التبويبات ───────────────────────────────────────────────
function duesSwitch(tab) {
    ['profits', 'fuel', 'claims'].forEach(t => {
        document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
        const btn = document.getElementById('tb-' + t);
        const active = t === tab;
        btn.className = 'tab-btn flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm ' +
            (active ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200');
    });
}
window.duesSwitch = duesSwitch;

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function getMonthKey(o) {
    const d = o.client?.deliveryDate || o.date;
    if (!d) return '0000-00';
    try {
        const [yr, mn] = d.split('-');
        if (yr && mn) return `${yr}-${mn}`;
        return '0000-00';
    } catch(e) { return '0000-00'; }
}

function renderGroupedTable(rows, containerId, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (rows.length === 0) return;
    
    const groups = {};
    rows.forEach(o => {
        const key = getMonthKey(o);
        if (!groups[key]) groups[key] = [];
        groups[key].push(o);
    });
    
    const sortedKeys = Object.keys(groups).sort().reverse();
    let html = '';
    
    sortedKeys.forEach(key => {
        let monthName = 'غير محدد';
        let yearNum = '0000';
        let monthNum = '00';
        if (key !== '0000-00') {
            const [yr, mn] = key.split('-');
            yearNum = yr;
            monthNum = parseInt(mn).toString();
            const idx = parseInt(mn) - 1;
            monthName = `شهر ${parseInt(mn)} - ${yr}`;
            if (MONTHS_AR[idx]) monthName = `${MONTHS_AR[idx]} (${parseInt(mn)}) ${yr}`;
        }
        
        const groupOrders = groups[key];
        
        html += `<div class="mt-6 mb-3 flex items-center gap-3">
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-sm font-bold shadow-sm">
                <i class="fa-regular fa-calendar-days"></i> ${monthName}
                <span class="bg-white/20 rounded-md px-2 text-xs">${groupOrders.length} طلب</span>
            </div>
            <div class="h-px flex-1 bg-slate-200"></div>
        </div>`;
        
        let tbody = groupOrders.map(o => {
            if (type === 'profit') {
                const share = (o.computed.netProfit > 0) ? (o.computed.netProfit * 0.30) : 0;
                const transferred = !!o.profitTransferred;
                const cb = transferred
                    ? `<td class="py-2.5 px-2 text-center text-emerald-500" title="مسوّاة${o.profitBatchId ? ' • دفعة #' + o.profitBatchId : ''}"><i class="fa-solid fa-check"></i></td>`
                    : `<td class="py-2.5 px-2 text-center"><input type="checkbox" class="dues-cb" data-type="profit" data-id="${o.id}" data-amount="${share}" data-year="${yearNum}" data-month="${monthNum}" onchange="duesUpdateSelbar('profit')"></td>`;
                return `
                    <tr class="border-t border-slate-50 hover:bg-slate-50/60">
                        ${cb}
                        <td class="py-2.5 px-3 font-bold text-slate-700">${o.client?.name || 'غير محدد'}</td>
                        <td class="py-2.5 px-2 text-center text-xs text-slate-400">${o.client?.deliveryDate || o.date || '-'}</td>
                        <td class="py-2.5 px-2 text-center font-bold text-slate-600 dir-ltr">${fmt(o.computed.total)}</td>
                        <td class="py-2.5 px-2 text-center text-slate-500 dir-ltr">${fmt(o.computed.netProfit)}</td>
                        <td class="py-2.5 px-2 text-center font-black text-emerald-600 dir-ltr">${fmt(share)}</td>
                        <td class="py-2.5 px-2 text-center">
                            <button onclick="window.DuesTransfersActions.toggleProfit('${o.id}')" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border transition ${transferred ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'}">
                                ${transferred ? '<i class="fa-solid fa-circle-check"></i> تم التحويل' : 'تحويل فردي'}
                            </button>
                        </td>
                    </tr>`;
            } else {
                const fuel = parseFloat(o.computed.fuel) || 0;
                const settled = !!o.fuelSettled;
                const cb = settled
                    ? `<td class="py-2.5 px-2 text-center text-emerald-500" title="مصروفة${o.fuelBatchId ? ' • دفعة #' + o.fuelBatchId : ''}"><i class="fa-solid fa-check"></i></td>`
                    : `<td class="py-2.5 px-2 text-center"><input type="checkbox" class="dues-cb" data-type="fuel" data-id="${o.id}" data-amount="${fuel}" data-year="${yearNum}" data-month="${monthNum}" onchange="duesUpdateSelbar('fuel')"></td>`;
                return `
                    <tr class="border-t border-slate-50 hover:bg-slate-50/60">
                        ${cb}
                        <td class="py-2.5 px-3 font-bold text-slate-700">${o.client?.name || 'غير محدد'}</td>
                        <td class="py-2.5 px-2 text-center text-xs text-slate-400">${o.client?.deliveryDate || o.date || '-'}</td>
                        <td class="py-2.5 px-2 text-center font-black text-red-600 dir-ltr">${fmt(fuel)}</td>
                        <td class="py-2.5 px-2 text-center">
                            <button onclick="window.DuesTransfersActions.toggleFuel('${o.id}')" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border transition ${settled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'}">
                                ${settled ? '<i class="fa-solid fa-circle-check"></i> تم الصرف' : 'صرف فردي'}
                            </button>
                        </td>
                    </tr>`;
            }
        }).join('');
        
        const tableHeaders = type === 'profit' 
            ? `<th class="py-3 px-2 w-8 text-center"><input type="checkbox" onclick="duesToggleMonth('${type}', '${key}', this.checked)" title="تحديد الكل لهذا الشهر"></th>
               <th class="py-3 px-3 text-right">العميل</th><th class="py-3 px-2 text-center">التاريخ</th>
               <th class="py-3 px-2 text-center">مبلغ الطلب</th>
               <th class="py-3 px-2 text-center">ربح الطلب</th><th class="py-3 px-2 text-center">حصة الشريك (30%)</th>
               <th class="py-3 px-2 text-center">التحويل</th>`
            : `<th class="py-3 px-2 w-8 text-center"><input type="checkbox" onclick="duesToggleMonth('${type}', '${key}', this.checked)" title="تحديد الكل لهذا الشهر"></th>
               <th class="py-3 px-3 text-right">العميل</th><th class="py-3 px-2 text-center">التاريخ</th>
               <th class="py-3 px-2 text-center">مصروف البنزين</th><th class="py-3 px-2 text-center">الصرف</th>`;

        html += `<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-500 text-xs"><tr>${tableHeaders}</tr></thead>
                <tbody>${tbody}</tbody>
            </table>
        </div>`;
    });
    
    container.innerHTML = html;
}

function duesToggleMonth(type, monthKey, checked) {
    const [yr, mn] = monthKey.split('-');
    const y = yr, m = parseInt(mn).toString();
    document.querySelectorAll(`.dues-cb[data-type="${type}"][data-year="${y}"][data-month="${m}"]`).forEach(cb => { cb.checked = checked; });
    duesUpdateSelbar(type);
}
window.duesToggleMonth = duesToggleMonth;

// ─── تبويب 1: أرباح الطلبات (حصة الشريك التشغيلي = 30%) ─────────
function renderProfits() {
    const rows = allOrders()
        .filter(o => o.computed && o.computed.netProfit > 0 && !isCancelled(o) && !o.excludeFromPortfolio)
        .sort((a, b) => (b.id || 0) - (a.id || 0));

    let pending = 0, done = 0;
    rows.forEach(o => {
        const share = (o.computed.netProfit > 0) ? (o.computed.netProfit * 0.30) : 0;
        if (o.profitTransferred) done += share; else pending += share;
    });

    renderGroupedTable(rows, 'profits-list-container', 'profit');

    document.getElementById('profits-empty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('pf-pending').innerText = fmt(pending);
    document.getElementById('pf-done').innerText = fmt(done);
    document.getElementById('pf-total').innerText = fmt(pending + done);
    duesUpdateSelbar('profit');
    renderProfitsLog();
}



// ─── تبويب 2: مصاريف التشغيل / البنزين (fuel) ─────────────────────────────
function renderFuel() {
    const rows = allOrders()
        .filter(o => o.computed && o.computed.fuel > 0 && !isCancelled(o))
        .sort((a, b) => (b.id || 0) - (a.id || 0));

    let pending = 0, done = 0;
    rows.forEach(o => {
        const fuel = parseFloat(o.computed.fuel) || 0;
        if (o.fuelSettled) done += fuel; else pending += fuel;
    });

    renderGroupedTable(rows, 'fuel-list-container', 'fuel');

    document.getElementById('fuel-empty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('fu-pending').innerText = fmt(pending);
    document.getElementById('fu-done').innerText = fmt(done);
    document.getElementById('fu-total').innerText = fmt(pending + done);
    duesUpdateSelbar('fuel');
    renderFuelLog();
}



// ─── تبويب 3: المطالبات (المعلّقة) ────────────────────────────────────────
function claimLabel(c) {
    if (c.title && !/[ÙØ]/.test(c.title)) return c.title;
    if (c.desc && !/[ÙØ]/.test(c.desc)) return c.desc;
    return c.orderId ? ('مطالبة على طلب #' + String(c.orderId).slice(-4)) : 'مطالبة';
}
function renderClaims() {
    const body = document.getElementById('claims-list');
    const claims = (window.SaddahDB.data.claims || []).filter(c => c.status === 'pending');
    let total = 0;
    body.innerHTML = claims.sort((a, b) => (b.id || 0) - (a.id || 0)).map(c => {
        const amt = parseFloat(c.amount) || 0; total += amt;
        return `
            <tr class="border-t border-slate-50 hover:bg-slate-50/60">
                <td class="py-2.5 px-3 font-bold text-indigo-700">${c.employee || '-'}</td>
                <td class="py-2.5 px-2 text-slate-700 text-xs">${claimLabel(c)}${c.orderId ? `<span class="block text-[9px] text-purple-500 font-bold"><i class="fa-solid fa-link"></i> #${String(c.orderId).slice(-4)}</span>` : ''}</td>
                <td class="py-2.5 px-2 text-center font-black text-red-600 dir-ltr">${fmt(amt)}</td>
                <td class="py-2.5 px-2 text-center">
                    <button onclick="window.DuesTransfersActions.settleClaim('${c.id}')" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 transition">تأشير صرف</button>
                </td>
            </tr>`;
    }).join('');

    document.getElementById('claims-empty').classList.toggle('hidden', claims.length > 0);
    document.getElementById('cl-count').innerText = claims.length;
    document.getElementById('cl-total').innerText = fmt(total);
    renderClaimsLog();
}



// ─── تحديد متعدد + تسوية كدفعة موثّقة ────────────────────────────────────
function duesSelected(type) {
    return Array.from(document.querySelectorAll(`.dues-cb[data-type="${type}"]:checked`));
}
function duesUpdateSelbar(type) {
    const sel = duesSelected(type);
    const bar = document.getElementById(type + '-selbar');
    if (!bar) return;
    const sum = sel.reduce((s, cb) => s + (parseFloat(cb.dataset.amount) || 0), 0);
    document.getElementById(type + '-selcount').innerText = sel.length;
    document.getElementById(type + '-selsum').innerText = fmt(sum);
    bar.classList.toggle('hidden', sel.length === 0);
    bar.classList.toggle('flex', sel.length > 0);
}
window.duesUpdateSelbar = duesUpdateSelbar;

let window.duesBatchCtx = duesBatchCtx = null;
function openDuesBatch(type) {
    const sel = duesSelected(type);
    if (sel.length === 0) return;
    
    let batchYear = '0000', batchMonth = '0';
    if (sel.length > 0) {
        batchYear = sel[0].dataset.year;
        batchMonth = sel[0].dataset.month;
        const diffMonths = sel.some(cb => cb.dataset.year !== batchYear || cb.dataset.month !== batchMonth);
        if (diffMonths) alert('تحذير: لقد قمت بتحديد طلبات من أشهر مختلفة. سيتم الحفظ في مجلد أول طلب تم اختياره.');
    }
    
    const items = sel.map(cb => {
        const o = allOrders().find(x => String(x.id) === String(cb.dataset.id));
        return { id: cb.dataset.id, name: (o && o.client && o.client.name) || 'غير محدد', amount: parseFloat(cb.dataset.amount) || 0 };
    });
    const total = items.reduce((s, i) => s + i.amount, 0);
    window.duesBatchCtx = duesBatchCtx = { type, items, total, batchYear, batchMonth };
    document.getElementById('db-kind-label').innerText = type === 'profit' ? 'أرباح الشريك التشغيلي' : 'مصاريف البنزين';
    document.getElementById('db-count').innerText = items.length;
    document.getElementById('db-total').innerText = fmt(total);
    document.getElementById('db-note').value = '';
    document.getElementById('db-receipt').value = '';
    const m = document.getElementById('dues-batch-modal');
    m.classList.remove('hidden'); m.classList.add('flex');
}
function closeDuesBatch() {
    const m = document.getElementById('dues-batch-modal');
    m.classList.add('hidden'); m.classList.remove('flex');
    duesBatchCtx = null;
}
window.openDuesBatch = openDuesBatch;
window.closeDuesBatch = closeDuesBatch;




// Expose functions and vars for actions module
window.allOrders = allOrders;
window.saveDb = saveDb;
window.renderProfits = renderProfits;
window.renderFuel = renderFuel;
window.renderClaims = renderClaims;
window.closeDuesBatch = closeDuesBatch;
window.fmt = fmt;

// ─── سجل الدفعات (يُشتق من العناصر المسوّاة المرتبطة برقم دفعة) ───────────
const folderNote = '<span class="text-[10px] text-slate-400"><i class="fa-solid fa-folder"></i> الإيصال في المجلد</span>';

function batchLogRow(b, receiptHtml) {
    const date = b.date ? new Date(b.date).toLocaleDateString('en-GB') : '';
    return `<div class="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
            <span class="font-mono text-xs text-slate-400">دفعة #${b.id}</span>
            ${date ? `<span class="text-xs text-slate-400">${date}</span>` : ''}
            ${b.who ? `<span class="font-bold text-indigo-700 text-sm">${b.who}</span>` : ''}
            <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">${b.count} عناصر</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
            <span class="font-black text-emerald-600 dir-ltr">${fmt(b.total)} ر.س</span>
            ${receiptHtml || ''}
        </div>
    </div>`;
}

function showLog(containerId, html) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = html;
    const empty = document.getElementById(containerId + '-empty');
    if (empty) empty.classList.toggle('hidden', html.length > 0);
}

function groupByBatch(items, batchKey, dateKey, amountFn) {
    const groups = {};
    items.forEach(it => {
        const bid = it[batchKey];
        if (!bid) return;
        const g = groups[bid] || (groups[bid] = { id: bid, count: 0, total: 0, date: null });
        g.count++; g.total += amountFn(it) || 0;
        const d = it[dateKey];
        if (d && (!g.date || d > g.date)) g.date = d;
    });
    return Object.values(groups).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function renderProfitsLog() {
    const batches = groupByBatch(
        allOrders().filter(o => o.profitTransferred && o.profitBatchId),
        'profitBatchId', 'profitTransferredAt', (o) => (o.computed && o.computed.netProfit > 0) ? (o.computed.netProfit * 0.30) : 0
    );
    showLog('profits-log', batches.map(b => batchLogRow(b, folderNote)).join(''));
}

function renderFuelLog() {
    const batches = groupByBatch(
        allOrders().filter(o => o.fuelSettled && o.fuelBatchId),
        'fuelBatchId', 'fuelSettledAt', (o) => parseFloat(o.computed && o.computed.fuel) || 0
    );
    showLog('fuel-log', batches.map(b => batchLogRow(b, folderNote)).join(''));
}

function renderClaimsLog() {
    const list = (window.SaddahDB.data.batches || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const html = list.map(bt => {
        const b = { id: bt.id, date: bt.date, who: bt.employee, count: (bt.claimsIds || []).length, total: bt.totalAmount };
        const receipt = bt.proofBase64
            ? `<button onclick="viewBatchReceipt('${bt.id}')" class="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-100"><i class="fa-solid fa-eye"></i> الإيصال</button>`
            : folderNote;
        return batchLogRow(b, receipt);
    }).join('');
    showLog('claims-log', html);
}

function viewBatchReceipt(id) {
    const b = (window.SaddahDB.data.batches || []).find(x => String(x.id) === String(id));
    if (!b || !b.proofBase64) return;
    const w = window.open();
    if (b.proofType && b.proofType.startsWith('image/')) w.document.write('<img src="' + b.proofBase64 + '" style="max-width:100%">');
    else w.location = b.proofBase64;
}
window.viewBatchReceipt = viewBatchReceipt;

// ─── البدء ────────────────────────────────────────────────────────────────
renderProfits();
renderFuel();
renderClaims();
duesSwitch('profits');
