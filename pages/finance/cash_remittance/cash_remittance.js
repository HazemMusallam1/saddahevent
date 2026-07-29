// js/cash_remittance.js — تحويل الكاش المُحصّل إلى المؤسسة
// ─────────────────────────────────────────────────────────────
// الفكرة: كل دفعة كاش من عميل تبقى "بذمة الموظف" حتى يحوّلها للمؤسسة.
// هذه الصفحة تجمع كل الكاش غير المُحوّل، وتسمح باختياره وإرفاق إيصال
// تحويل واحد للمؤسسة، ثم تؤشّر عليه أنه "تم التحويل".
// ─────────────────────────────────────────────────────────────

let allOrders = [];
let selectedKeys = new Set(); // "orderId:proofIndex"

function getOrders() {
    const orders = (window.SaddahDB && window.SaddahDB.data.orders) || [];
    const archive = (window.SaddahDB && window.SaddahDB.data.archive) || [];
    return [...orders, ...archive];
}

// كل دفعات الكاش غير المُسوّاة عبر جميع الطلبات
// ملاحظة: الدفعات القديمة بدون حقل method تُعتبر "كاش غير مصنّف" افتراضياً
// حتى يصنّفها المستخدم (كاش يبقى / تحويل يُزال من القائمة).
function getUnsettledCash() {
    const result = [];
    getOrders().forEach(order => {
        (order.paymentProofs || []).forEach((p, idx) => {
            const amount = parseFloat(p.amount) || 0;
            if (amount <= 0) return; // تجاهل الدفعات الصفرية أو المرفقات بدون مبلغ
            const isCashOrUnclassified = (p.method === 'cash' || !p.method);
            const isInsurance = (p.desc || '').includes('تأمين');
            
            // التأمين (نقداً) يبقى مع الموظف ليرجعه للعميل لاحقاً، ولا يحوّل للمؤسسة.
            if (isCashOrUnclassified && !p.settledToInstitution && !isInsurance) {
                result.push({
                    orderId: order.id,
                    clientName: order.client?.name || 'غير محدد',
                    orderDate: order.date || '',
                    proofIndex: idx,
                    desc: p.desc || 'دفعة',
                    amount: amount,
                    date: p.date,
                    classified: !!p.method   // false = قديمة غير مصنّفة
                });
            }
        });
    });
    return result;
}

// سجل التحويلات السابقة (مُستنتج من الدفعات المُسوّاة المجمّعة بـ settlementId)
function getRemittanceHistory() {
    const map = new Map();
    getOrders().forEach(order => {
        (order.paymentProofs || []).forEach(p => {
            if (p.settledToInstitution && p.settlementId) {
                if (!map.has(p.settlementId)) {
                    map.set(p.settlementId, {
                        id: p.settlementId,
                        date: p.settlementDate,
                        receipt: p.settlementReceipt || '',
                        total: 0,
                        count: 0
                    });
                }
                const s = map.get(p.settlementId);
                s.total += parseFloat(p.amount) || 0;
                s.count += 1;
            }
        });
    });
    return Array.from(map.values()).sort((a, b) => (b.id || 0) - (a.id || 0));
}

function fmt(n) {
    return (parseFloat(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function render() {
    const unsettled = getUnsettledCash();

    // إجمالي الكاش بذمتك
    const totalCash = unsettled.reduce((s, x) => s + x.amount, 0);
    document.getElementById('stat-total-cash').innerText = fmt(totalCash) + ' ر.س';
    document.getElementById('stat-count').innerText = unsettled.length;

    // المبلغ المحدد
    let selectedTotal = 0;
    unsettled.forEach(x => { if (selectedKeys.has(`${x.orderId}:${x.proofIndex}`)) selectedTotal += x.amount; });
    document.getElementById('stat-selected').innerText = fmt(selectedTotal) + ' ر.س';
    document.getElementById('confirm-btn').disabled = selectedKeys.size === 0;

    // قائمة الكاش غير المُحوّل
    const listEl = document.getElementById('cash-list');
    if (unsettled.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-16 text-slate-400">
                <div class="text-5xl mb-3">✅</div>
                <p class="font-bold">لا يوجد كاش بذمتك — كل شيء مُحوّل للمؤسسة!</p>
            </div>`;
    } else {
        listEl.innerHTML = unsettled.map(x => {
            const key = `${x.orderId}:${x.proofIndex}`;
            const checked = selectedKeys.has(key);
            const unclassifiedBadge = !x.classified
                ? `<span class="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-bold">غير مصنّفة — تُعتبر كاش</span>`
                : `<span class="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-bold">💵 كاش</span>`;
            return `
                <div class="flex items-center gap-3 bg-white border ${checked ? 'border-green-400 bg-green-50/40' : 'border-slate-200'} rounded-xl p-4 hover:border-green-300 transition">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleSelect('${key}')" class="w-5 h-5 accent-green-600 rounded shrink-0 cursor-pointer">
                    <div class="flex-1 min-w-0">
                        <div class="font-black text-slate-800 truncate">${x.clientName}</div>
                        <div class="text-xs text-slate-400 font-bold flex flex-wrap gap-2 mt-0.5 items-center">
                            <span><i class="fa-regular fa-calendar"></i> ${x.orderDate}</span>
                            <span class="text-slate-300">|</span>
                            <span>${x.desc}</span>
                            ${unclassifiedBadge}
                        </div>
                    </div>
                    <div class="text-green-600 font-black text-lg shrink-0">${fmt(x.amount)} <span class="text-xs">ر.س</span></div>
                    <button onclick="window.CashRemittanceActions.markAsTransfer('${key}')" title="كانت تحويل بنكي — أزِلها من الكاش"
                        class="shrink-0 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 hover:bg-blue-100 transition">
                        🏦 كانت تحويل
                    </button>
                </div>`;
        }).join('');
    }

    renderHistory();
}

function toggleSelect(key) {
    if (selectedKeys.has(key)) selectedKeys.delete(key);
    else selectedKeys.add(key);
    render();
}



function selectAll() {
    const unsettled = getUnsettledCash();
    if (selectedKeys.size === unsettled.length) {
        selectedKeys.clear(); // الكل محدد → ألغِ التحديد
    } else {
        unsettled.forEach(x => selectedKeys.add(`${x.orderId}:${x.proofIndex}`));
    }
    render();
}



function renderHistory() {
    const history = getRemittanceHistory();
    const el = document.getElementById('history-list');
    if (!el) return;

    if (history.length === 0) {
        el.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">لا توجد تحويلات سابقة</p>';
        return;
    }

    el.innerHTML = history.map(h => `
        <div class="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
                <div class="font-black text-slate-700">${fmt(h.total)} ر.س</div>
                <div class="text-[11px] text-slate-400 font-bold">
                    ${h.date ? new Date(h.date).toLocaleDateString('en-GB') : ''} • ${h.count} دفعة
                    ${h.receipt ? ` • <span class="text-blue-500">📎 ${h.receipt}</span>` : ''}
                </div>
            </div>
            <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold shrink-0">تم التحويل ✓</span>
        </div>
    `).join('');
}


// Expose functions and vars for actions module
window.getOrders = getOrders;
window.getUnsettledCash = getUnsettledCash;
window.selectedKeys = selectedKeys;
window.fmt = fmt;
window.render = render;


// Bootstrap
render();
