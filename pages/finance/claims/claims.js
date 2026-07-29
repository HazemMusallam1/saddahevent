// DB Keys
const CLAIMS_DB_KEY = 'sadda_claims_db';
const BATCHES_DB_KEY = 'sadda_batches_db';

// State


let currentTab = 'pending';



// إرجاع وصف الطلب المرتبط بالمطالبة: "اسم العميل • #رقم"
// يستخدم الطبقة العلائقية في قاعدة البيانات الرئيسية
function getClaimOrderLabel(claim) {
    if (!claim || claim.orderId == null) return '';
    const label = window.SaddahDB.rel.orderLabel(claim.orderId);
    // احتياطي: لو الطلب محذوف، استخدم الاسم المخزّن في المطالبة
    if (label) return label;
    if (claim.clientName) return `${claim.clientName} • #${String(claim.orderId).slice(-4)}`;
    return '';
}

// نص مقروء؟ (الحروف Ø و Ù تظهر فقط في النصوص المشوّهة الترميز)
function isReadable(s) {
    return s && typeof s === 'string' && s.trim() !== '' && !/[ÙØ]/.test(s);
}

// عنوان المطالبة للعرض (يتجاهل النصوص المشوّهة ويستخدم بديلاً نظيفاً)
function getClaimTitle(claim) {
    if (isReadable(claim.title)) return claim.title;
    if (isReadable(claim.desc))  return claim.desc;
    if (isReadable(claim.type))  return claim.type;
    return claim.orderId ? 'مطالبة على طلب' : 'مطالبة';
}

// --- TABS & INITIALIZATION ---

function switchTab(tabName) {
    currentTab = tabName;
    document.getElementById('tab-pending').classList.toggle('hidden', tabName !== 'pending');
    document.getElementById('tab-batches').classList.toggle('hidden', tabName !== 'batches');

    const btnPending = document.getElementById('tab-btn-pending');
    const btnBatches = document.getElementById('tab-btn-batches');

    if (tabName === 'pending') {
        btnPending.classList.replace('bg-gray-700', 'bg-indigo-600');
        btnPending.classList.replace('hover:bg-gray-600', 'hover:bg-indigo-500');
        btnBatches.classList.replace('bg-indigo-600', 'bg-gray-700');
        btnBatches.classList.replace('hover:bg-indigo-500', 'hover:bg-gray-600');
        
        document.getElementById('page-title').innerText = 'PENDING CLAIMS';
        document.getElementById('page-subtitle').innerText = 'تقرير المطالبات المعلقة';
        document.getElementById('stat-1-title').innerText = 'عدد المطالبات';
        document.getElementById('stat-2-title').innerText = 'إجمالي المبالغ المعلقة';
        
        renderPendingClaims();
    } else {
        btnBatches.classList.replace('bg-gray-700', 'bg-indigo-600');
        btnBatches.classList.replace('hover:bg-gray-600', 'hover:bg-indigo-500');
        btnPending.classList.replace('bg-indigo-600', 'bg-gray-700');
        btnPending.classList.replace('hover:bg-indigo-500', 'hover:bg-gray-600');

        document.getElementById('page-title').innerText = 'SETTLEMENT BATCHES';
        document.getElementById('page-subtitle').innerText = 'سجل الدفعات المسددة';
        document.getElementById('stat-1-title').innerText = 'عدد الدفعات';
        document.getElementById('stat-2-title').innerText = 'إجمالي المبالغ المسددة';

        renderBatches();
    }
}

function formatCurrency(num) {
    return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// --- RENDER PENDING CLAIMS ---
// مجموع المبلغ لكل موظف (لمصفوفة مطالبات)
function employeeTotals(arr) {
    const m = {};
    (arr || []).forEach(c => { const e = (c.employee || 'بدون موظف'); m[e] = (m[e] || 0) + (parseFloat(c.amount) || 0); });
    return m;
}
function employeeChipsHtml(totals) {
    const keys = Object.keys(totals || {});
    if (!keys.length) return '';
    return keys.sort((a, b) => totals[b] - totals[a]).map(e => `
        <span style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#4338ca;border:1px solid #e0e7ff;border-radius:9px;padding:4px 10px;font-size:12px;font-weight:700;white-space:nowrap;">
            <i class="fa-solid fa-user-tie" style="color:#818cf8;"></i> ${e}
            <span style="font-weight:800;font-family:'Inter',sans-serif;">${formatCurrency(totals[e])}</span>
        </span>`).join('');
}
function empTotalsText(totals) {
    return Object.keys(totals || {}).sort((a, b) => totals[b] - totals[a]).map(e => `${e}: ${formatCurrency(totals[e])}`).join(' · ');
}

function renderPendingClaims() {
    const tableBody = document.getElementById('claims-list');
    const emptyMsg = document.getElementById('empty-msg');
    
    // Set Header Date
    const today = new Date().toLocaleDateString('en-GB');
    document.getElementById('report-date').innerText = today;

    tableBody.innerHTML = '';
    const pendingClaims = window.SaddahDB.data.claims.filter(c => c.status === 'pending');

    if (pendingClaims.length === 0) {
        emptyMsg.classList.remove('hidden');
        document.getElementById('claims-count').innerText = '0';
        document.getElementById('claims-total').innerText = '0';
        const _pe = document.getElementById('pending-by-employee'); if (_pe) _pe.innerHTML = '';
        return;
    }
    emptyMsg.classList.add('hidden');

    let totalAmount = 0;

    pendingClaims.forEach(claim => {
        const amount = parseFloat(claim.amount) || 0;
        totalAmount += amount;

        // ── ملاحظة المرتجعات (إن وُجدت فاتورة مرتجعة) ──
        let returnNote = '';
        if (claim.hasLinkedReturns && claim.originalAmount != null) {
            const origAmt = parseFloat(claim.originalAmount) || 0;
            if (origAmt !== amount) {
                returnNote = `<div class="flex items-center gap-1 mt-0.5">
                    <span class="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-bold">
                        <i class="fa-solid fa-rotate-left"></i> المبلغ الأصلي: <s>${formatCurrency(origAmt)}</s> ← بعد المرتجع: ${formatCurrency(amount)}
                    </span>
                </div>`;
            }
        }

        const row = `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
                <td class="py-2 px-1 font-inter text-slate-500 text-[10px] text-center">#${claim.id}</td>
                <td class="py-2 px-1 text-center font-bold text-indigo-700">${claim.employee || '-'}</td>
                <td class="py-2 px-1">
                    <div class="font-bold text-slate-800 text-xs mb-0.5">${getClaimTitle(claim)}</div>
                    ${getClaimOrderLabel(claim) ? `<div class="text-[9px] text-purple-600 font-bold mb-0.5"><i class="fa-solid fa-link"></i> ${getClaimOrderLabel(claim)}</div>` : ''}
                    ${returnNote}
                    <div class="flex items-center gap-1 mt-0.5">
                        <span class="text-[9px] text-slate-400 block">${claim.date ? new Date(claim.date).toLocaleDateString('en-GB') : ''}</span>
                        ${claim.isCapital ? `<span class="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[8px] font-bold">من رأس المال</span>` : ''}
                    </div>
                </td>
                <td class="py-2 px-1 text-center">
                     <span class="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                        ${isReadable(claim.type) ? claim.type : 'عام'}
                    </span>
                </td>
                <td class="py-2 px-1 text-left">
                     <div class="font-black text-red-600 text-sm" dir="ltr">
                        ${formatCurrency(amount)}
                     </div>
                </td>
                <td class="py-2 px-1 text-center no-print">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="openEditClaim('${claim.id}')" title="تعديل"
                            class="bg-white border border-slate-200 hover:border-indigo-500 hover:bg-indigo-500 hover:text-white text-slate-400 w-6 h-6 rounded transition flex items-center justify-center">
                            <i class="fa-solid fa-pen text-[10px]"></i>
                        </button>
                        <button onclick="window.ClaimsActions.deleteClaim('${claim.id}')" title="حذف"
                            class="bg-white border border-slate-200 hover:border-red-500 hover:bg-red-500 hover:text-white text-slate-400 w-6 h-6 rounded transition flex items-center justify-center">
                            <i class="fa-solid fa-trash-can text-[10px]"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });


    const pe = document.getElementById('pending-by-employee');
    if (pe) {
        pe.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2 flex-wrap">
            <span class="text-[11px] font-bold text-slate-400 ml-1"><i class="fa-solid fa-users ml-1"></i> المجموع لكل موظف:</span>
            ${employeeChipsHtml(employeeTotals(pendingClaims))}</div>`;
    }

    document.getElementById('claims-count').innerText = pendingClaims.length;
    document.getElementById('claims-total').innerText = formatCurrency(totalAmount);
}


// --- RENDER BATCHES ---
function renderBatches() {
    const tableBody = document.getElementById('batches-list');
    const emptyMsg = document.getElementById('empty-batches-msg');
    
    tableBody.innerHTML = '';

    if (window.SaddahDB.data.batches.length === 0) {
        emptyMsg.classList.remove('hidden');
        document.getElementById('claims-count').innerText = '0';
        document.getElementById('claims-total').innerText = '0';
        return;
    }
    emptyMsg.classList.add('hidden');

    let totalAmount = 0;

    window.SaddahDB.data.batches.forEach(batch => {
        const amount = parseFloat(batch.totalAmount) || 0;
        totalAmount += amount;

        const bClaims = getBatchClaims(batch);          // فواتير الدفعة
        const empTotals = employeeTotals(bClaims);       // المبلغ لكل موظف في الدفعة

        const row = `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
                <td class="py-2 px-1 font-inter font-bold text-slate-700 text-[10px] text-center">#${batch.id}</td>
                <td class="py-2 px-1 text-center font-bold text-indigo-700">
                    ${batch.employee}
                    ${Object.keys(empTotals).length > 1 ? `<div class="text-[9px] font-bold text-purple-600 mt-0.5"><i class="fa-solid fa-users"></i> ${empTotalsText(empTotals)}</div>` : ''}
                </td>
                <td class="py-2 px-1 text-center">
                    <span class="text-[10px] text-slate-500 block">${new Date(batch.date).toLocaleString('en-GB')}</span>
                </td>
                <td class="py-2 px-1 text-center">
                     <button onclick="toggleBatchDetails('${batch.id}')"
                        class="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 transition inline-flex items-center gap-1">
                        ${batch.claimsIds.length} فواتير <i id="batch-chev-${batch.id}" class="fa-solid fa-chevron-down text-[8px]"></i>
                    </button>
                </td>
                <td class="py-2 px-1 text-left">
                     <div class="font-black text-emerald-600 text-sm" dir="ltr">
                        ${formatCurrency(amount)}
                     </div>
                </td>
                <td class="py-2 px-1 text-center no-print flex items-center justify-center gap-1">
                    ${batch.proofBase64 ? 
                        `<button onclick="viewAttachment('${batch.id}')" 
                            class="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1 text-[10px] rounded font-bold transition flex items-center justify-center gap-1">
                            <i class="fa-solid fa-eye"></i> عرض
                        </button>` : 
                        `<span class="text-[10px] text-slate-400">لا يوجد إيصال</span>`
                    }
                    <button onclick="editBatch('${batch.id}')"
                        class="bg-white border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 px-2 py-1 rounded transition flex items-center justify-center" title="تعديل الدفعة">
                        <i class="fa-solid fa-pen text-[10px]"></i>
                    </button>
                    <button onclick="window.ClaimsActions.deleteBatch('${batch.id}')"
                        class="bg-white border border-slate-200 hover:border-red-500 hover:bg-red-500 hover:text-white text-slate-400 px-2 py-1 rounded transition flex items-center justify-center">
                        <i class="fa-solid fa-trash-can text-[10px]"></i>
                    </button>
                </td>
            </tr>
        `;

        // صف التفاصيل (مطوي): ملخّص لكل موظف + فواتير الدفعة باختصار
        const detailSummary = `<div class="px-2.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
            <span class="text-[10px] font-bold text-slate-400">المبلغ لكل شخص:</span>${employeeChipsHtml(empTotals)}</div>`;
        const detailInner = detailSummary + (bClaims.length
            ? bClaims.map(bc => `
                <div class="flex items-center justify-between gap-2 py-1.5 px-2.5 border-b border-slate-100 last:border-0">
                    <div class="min-w-0 flex-1 text-right">
                        <span class="font-bold text-slate-700 text-[11px]">${bc.title || 'مطالبة'}</span>
                        ${bc.employee ? `<span class="text-[9px] text-slate-400"> · ${bc.employee}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${bc.hasInvoice
                            ? `<button onclick="viewClaimInvoice('${String(bc.id).replace(/'/g, '')}')" class="text-indigo-500 hover:text-indigo-700 text-[10px] font-bold" title="عرض الفاتورة"><i class="fa-solid fa-file-invoice"></i> فاتورة</button>`
                            : '<span class="text-[9px] text-slate-300">لا فاتورة</span>'}
                        <span class="font-black text-slate-800 font-inter text-[11px]" dir="ltr">${formatCurrency(bc.amount)}</span>
                    </div>
                </div>`).join('')
            : '<p class="text-center text-[11px] text-slate-400 py-2">لا تفاصيل متاحة</p>');

        const detailRow = `
            <tr id="batch-det-${batch.id}" class="hidden bg-slate-50/70">
                <td colspan="6" class="px-3 pb-2 pt-0">
                    <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">${detailInner}</div>
                </td>
            </tr>`;

        tableBody.innerHTML += row + detailRow;
    });

    document.getElementById('claims-count').innerText = window.SaddahDB.data.batches.length;
    document.getElementById('claims-total').innerText = formatCurrency(totalAmount);
}

// فواتير/مصاريف الدفعة: من اللقطة المحفوظة إن وُجدت، وإلا من المطالبات الحيّة بالمعرّفات
function getBatchClaims(batch) {
    if (Array.isArray(batch.claimsSnapshot) && batch.claimsSnapshot.length) {
        return batch.claimsSnapshot.map(s => {
            const live = window.SaddahDB.data.claims.find(c => String(c.id) === String(s.id));
            return { id: s.id, title: s.title, amount: s.amount, employee: s.employee, hasInvoice: !!(live && (live.invoiceBase64 || live.fileLink)) };
        });
    }
    const ids = (batch.claimsIds || []).map(String);
    return window.SaddahDB.data.claims.filter(c => ids.includes(String(c.id))).map(c => ({
        id: c.id, title: getClaimTitle(c), amount: parseFloat(c.amount) || 0, employee: c.employee || '',
        hasInvoice: !!(c.invoiceBase64 || c.fileLink)
    }));
}

function toggleBatchDetails(batchId) {
    const det = document.getElementById('batch-det-' + batchId);
    const chev = document.getElementById('batch-chev-' + batchId);
    if (!det) return;
    det.classList.toggle('hidden');
    const open = !det.classList.contains('hidden');
    if (chev) { chev.classList.toggle('fa-chevron-down', !open); chev.classList.toggle('fa-chevron-up', open); }
}

// عرض فاتورة مطالبة (capital: base64 / order: saddah:// عبر المُحلِّل) في عارض المرفقات
function viewClaimInvoice(claimId) {
    const c = window.SaddahDB.data.claims.find(x => String(x.id) === String(claimId));
    if (!c) { alert('المطالبة غير موجودة'); return; }
    let url = null, isPdf = false;
    if (c.invoiceBase64) {
        url = c.invoiceBase64;
        isPdf = /pdf/i.test(c.invoiceName || '') || /^data:application\/pdf/i.test(c.invoiceBase64);
    } else if (c.fileLink) {
        url = window.resolveSaddahUrl ? window.resolveSaddahUrl(c.fileLink) : c.fileLink;
        isPdf = /\.pdf($|\?)/i.test(String(c.fileLink));
    }
    if (!url) { alert('لا توجد فاتورة لهذه المطالبة'); return; }
    const modal = document.getElementById('attachment-viewer-modal');
    const body = document.getElementById('viewer-body');
    body.innerHTML = isPdf
        ? `<iframe src="${url}" class="w-full h-full rounded-lg border-0"></iframe>`
        : `<img src="${url}" class="max-w-full max-h-full object-contain rounded-lg">`;
    modal.classList.remove('hidden');
}

// --- SETTLEMENT LOGIC ---

let editingBatchId = null;

function openBatchModal() {
    const pendingClaims = window.SaddahDB.data.claims.filter(c => c.status === 'pending');
    if (pendingClaims.length === 0) {
        alert('لا توجد مطالبات معلقة.');
        return;
    }

    editingBatchId = null;
    document.getElementById('batch-form').reset();
    document.getElementById('batch-proof').required = true;
    document.querySelector('#batch-modal h3').innerHTML = '<i class="fa-solid fa-money-bill-transfer text-indigo-500"></i> تسوية دفعة (تحويلة واحدة)';
    document.querySelector('#batch-form button[type="submit"]').innerText = 'تأكيد وحفظ الدفعة';

    renderBatchClaims();   // يعرض كل المطالبات المعلقة مجمّعة حسب الموظف
    calcBatchTotal();

    const modal = document.getElementById('batch-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function editBatch(batchId) {
    const batch = window.SaddahDB.data.batches.find(b => b.id === batchId);
    if (!batch) return;

    editingBatchId = batchId;
    document.getElementById('batch-form').reset();
    document.getElementById('batch-recipient').value = batch.recipient || batch.employee || '';
    document.getElementById('batch-proof').required = false;
    document.querySelector('#batch-modal h3').innerHTML = `<i class="fa-solid fa-pen text-indigo-500"></i> تعديل الدفعة #${batchId}`;
    document.querySelector('#batch-form button[type="submit"]').innerText = 'حفظ التعديلات';

    renderBatchClaims();   
    calcBatchTotal();

    const modal = document.getElementById('batch-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeBatchModal() {
    const modal = document.getElementById('batch-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// يعرض كل المطالبات المعلقة (وفي وضع التعديل يعرض أيضاً فواتير الدفعة الحالية)
function renderBatchClaims() {
    const container = document.getElementById('batch-claims-container');
    
    // جلب المطالبات: المعلّقة دائمًا + مطالبات الدفعة إذا كنا في وضع التعديل
    let displayClaims = window.SaddahDB.data.claims.filter(c => c.status === 'pending');
    if (editingBatchId) {
        const batchClaims = window.SaddahDB.data.claims.filter(c => String(c.batchId) === String(editingBatchId));
        displayClaims = [...displayClaims, ...batchClaims];
    }

    if (displayClaims.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 text-xs py-4">لا توجد مطالبات</p>';
        return;
    }

    // تجميع حسب الموظف
    const groups = {};
    displayClaims.forEach(c => { const e = c.employee || 'بدون موظف'; (groups[e] = groups[e] || []).push(c); });

    let html = '';
    Object.keys(groups).forEach(emp => {
        const safeEmp = String(emp).replace(/"/g, '&quot;');
        html += `<div class="mb-2 last:mb-0">
            <div class="flex items-center justify-between bg-indigo-100/60 px-2 py-1.5 rounded-md text-[11px] font-bold text-indigo-800 sticky top-0">
                <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" class="batch-emp-all w-3.5 h-3.5 text-indigo-600 rounded" data-emp="${safeEmp}" checked onchange="toggleEmpClaims(this)">
                    <i class="fa-solid fa-user-tie"></i> ${emp}
                </label>
                <span class="text-[9px] text-indigo-500">${groups[emp].length} فاتورة</span>
            </div>`;
        groups[emp].forEach(c => {
            const isCap = c.isCapital ? '<span class="text-green-600 text-[9px] font-bold">(رأس مال)</span>' : '';
            // في وضع التعديل، نجعل المطالبات الخاصة بالدفعة محددة افتراضياً
            const isChecked = editingBatchId ? (String(c.batchId) === String(editingBatchId) ? 'checked' : '') : 'checked';
            html += `
                <label class="flex items-center gap-2 p-1.5 pr-3 hover:bg-white rounded cursor-pointer border-b border-gray-100 last:border-0">
                    <input type="checkbox" class="batch-claim-cb w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" value="${c.id}" data-emp="${safeEmp}" ${isChecked} onchange="calcBatchTotal()">
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800 text-xs truncate">${getClaimTitle(c)} ${isCap}</p>
                        <p class="text-[10px] text-gray-500">${c.date ? new Date(c.date).toLocaleDateString('en-GB') : ''}</p>
                    </div>
                    <div class="font-black text-indigo-700 text-sm dir-ltr flex-shrink-0">${formatCurrency(c.amount)}</div>
                </label>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

// تحديد/إلغاء كل فواتير موظف دفعة واحدة
function toggleEmpClaims(cb) {
    const emp = cb.getAttribute('data-emp');
    document.querySelectorAll('.batch-claim-cb').forEach(x => {
        if (x.getAttribute('data-emp') === emp) x.checked = cb.checked;
    });
    calcBatchTotal();
}

function calcBatchTotal() {
    const checked = document.querySelectorAll('.batch-claim-cb:checked');
    const ids = Array.from(checked).map(cb => cb.value);
    const selected = window.SaddahDB.data.claims.filter(c => ids.includes(c.id));
    const total = selected.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

    document.getElementById('batch-total-amount').innerText = formatCurrency(total) + ' ريال';
    document.getElementById('batch-count').innerText = selected.length;

    // مزامنة مربعات "تحديد كل موظف" مع حالة فواتيره
    document.querySelectorAll('.batch-emp-all').forEach(allCb => {
        const emp = allCb.getAttribute('data-emp');
        const boxes = Array.from(document.querySelectorAll('.batch-claim-cb')).filter(x => x.getAttribute('data-emp') === emp);
        allCb.checked = boxes.length > 0 && boxes.every(x => x.checked);
    });
}


// ─── تعديل المطالبة (مع مزامنة الطلب المرتبط وقاعدة البيانات الرئيسية) ───
let editingClaimId = null;

function findOrderById(id) {
    const D = (window.SaddahDB && window.SaddahDB.data) || {};
    return (D.orders || []).find(o => String(o.id) === String(id))
        || (D.archive || []).find(o => String(o.id) === String(id))
        || null;
}

function openEditClaim(id) {
    const c = window.SaddahDB.data.claims.find(x => String(x.id) === String(id));
    if (!c) return;
    editingClaimId = id;
    document.getElementById('ec-employee').value = c.employee || '';
    document.getElementById('ec-title').value = getClaimTitle(c);
    document.getElementById('ec-amount').value = parseFloat(c.amount) || 0;

    const note = document.getElementById('ec-order-note');
    const label = getClaimOrderLabel(c);
    if (c.orderId != null && label) {
        document.getElementById('ec-order-label').textContent = label;
        note.classList.remove('hidden');
    } else {
        note.classList.add('hidden');
    }

    const modal = document.getElementById('edit-claim-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeEditClaim() {
    const modal = document.getElementById('edit-claim-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    editingClaimId = null;
}


// --- CAPITAL CLAIM LOGIC ---
function openCapitalClaimModal() {
    document.getElementById('capital-claim-form').reset();
    if (document.getElementById('cc-date')) {
        document.getElementById('cc-date').value = new Date().toISOString().split('T')[0];
    }
    const modal = document.getElementById('capital-claim-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeCapitalClaimModal() {
    const modal = document.getElementById('capital-claim-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}





// --- ATTACHMENT VIEWER ---
function viewAttachment(batchId) {
    const batch = window.SaddahDB.data.batches.find(b => b.id === batchId);
    if (!batch || !batch.proofBase64) return;

    const modal = document.getElementById('attachment-viewer-modal');
    const viewerBody = document.getElementById('viewer-body');
    
    modal.classList.remove('hidden');
    viewerBody.innerHTML = '';

    if (batch.proofType.startsWith('image/')) {
        viewerBody.innerHTML = `<img src="${batch.proofBase64}" class="max-w-full max-h-full object-contain rounded-lg">`;
    } else if (batch.proofType === 'application/pdf') {
        viewerBody.innerHTML = `<iframe src="${batch.proofBase64}" class="w-full h-full rounded-lg border-0"></iframe>`;
    } else {
        viewerBody.innerHTML = `<p class="text-white text-sm font-bold">لا يمكن عرض هذا النوع من الملفات.</p>`;
    }
}

function closeAttachmentViewer() {
    document.getElementById('attachment-viewer-modal').classList.add('hidden');
    document.getElementById('viewer-body').innerHTML = '';
}

// Init — script loaded dynamically after SaddahDB.init()
switchTab('pending');

