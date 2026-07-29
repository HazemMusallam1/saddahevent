/**
 * تأمينات العملاء — محفظة التأمينات المصادرة
 * تعرض كل تأمينات العملاء وكم خُصم (صودِر) من كل عميل، مقسّمة حسب الأشهر.
 * مصدر البيانات: order.financials.securityDeposit + order.returns[] (deducted / refund)
 */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.SaddahDB.init();
        loadSecurities();
    } catch (error) {
        console.error('Error loading DB:', error);
    }
});

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                   'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function secFmt(n) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

// مفتاح الشهر: تاريخ التسليم إن وُجد، وإلا وقت إنشاء الطلب
function secMonthKey(order) {
    const d = order.client && order.client.deliveryDate;
    if (d && /^\d{4}-\d{2}/.test(d)) return d.substring(0, 7); // YYYY-MM
    const dt = new Date(order.id);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function loadSecurities() {
    const orders = window.SaddahDB.data.orders || [];
    const archive = window.SaddahDB.data.archive || [];
    const all = [...orders, ...archive];

    const rows = [];
    let totDeducted = 0, totRefunded = 0, totHeld = 0;

    all.forEach(o => {
        const security = parseFloat(o.financials && o.financials.securityDeposit) || 0;

        let deducted = 0, refunded = 0;
        if (Array.isArray(o.returns)) {
            o.returns.forEach(r => {
                deducted += parseFloat(r.deducted) || 0;
                refunded += parseFloat(r.refund) || 0;
            });
        }
        // التأمين المصادَر من الطبقة المحسوبة إن وُجد
        if (o.computed && o.computed.deductedInsurance != null) deducted = o.computed.deductedInsurance;

        // تجاهل الطلبات بلا أي تأمين
        if (security <= 0 && deducted <= 0 && refunded <= 0) return;

        const hasReturns = Array.isArray(o.returns) && o.returns.length > 0;
        let statusLabel, statusClass;
        if (deducted > 0 && refunded > 0) { statusLabel = 'مُسوّى — مُصادَر جزئياً'; statusClass = 'amber'; }
        else if (deducted > 0)            { statusLabel = 'مُصادَر بالكامل';        statusClass = 'red'; }
        else if (refunded > 0)            { statusLabel = 'أُعيد بالكامل للعميل';   statusClass = 'green'; }
        else                              { statusLabel = 'تحت اليد (لم يُسوَّ)';     statusClass = 'slate'; }

        totDeducted += deducted;
        totRefunded += refunded;
        if (!hasReturns) totHeld += security;

        rows.push({
            id: o.id,
            key: secMonthKey(o),
            client: (o.client && o.client.name) || 'عميل غير محدد',
            date: o.date || '-',
            security, deducted, refunded,
            statusLabel, statusClass
        });
    });

    // ملخص المحفظة
    document.getElementById('sum-deducted').textContent = secFmt(totDeducted);
    document.getElementById('sum-refunded').textContent = secFmt(totRefunded);
    document.getElementById('sum-held').textContent = secFmt(totHeld);

    renderByMonth(rows);
}

function badgeFor(cls, label) {
    const map = {
        red:   'bg-red-50 text-red-700 border-red-200',
        amber: 'bg-amber-50 text-amber-700 border-amber-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        slate: 'bg-slate-50 text-slate-600 border-slate-200'
    };
    return `<span class="text-[11px] font-bold border rounded-full px-2.5 py-0.5 ${map[cls] || map.slate}">${label}</span>`;
}

function renderByMonth(rows) {
    const container = document.getElementById('months-container');
    const emptyMsg = document.getElementById('empty-msg');
    container.innerHTML = '';

    if (rows.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    // تجميع حسب الشهر
    const monthMap = new Map();
    rows.forEach(r => {
        if (!monthMap.has(r.key)) monthMap.set(r.key, []);
        monthMap.get(r.key).push(r);
    });

    // أحدث شهر أولاً
    const sortedMonths = Array.from(monthMap.keys()).sort().reverse();

    sortedMonths.forEach(monthKey => {
        const [yr, mn] = monthKey.split('-');
        const monthNum = parseInt(mn);
        const monthName = MONTHS_AR[monthNum - 1] + ` (${monthNum}) ` + yr;
        const monthRows = monthMap.get(monthKey);
        monthRows.sort((a, b) => b.id - a.id);

        const monthDeducted = monthRows.reduce((s, r) => s + r.deducted, 0);

        const rowsHtml = monthRows.map(r => `
            <tr class="hover:bg-purple-50/40 transition-colors">
                <td class="text-right font-inter text-slate-400 py-3 px-3 text-xs">#${String(r.id).slice(-5)}</td>
                <td class="text-right font-bold text-gray-800 py-3 px-3">${r.client}</td>
                <td class="text-left font-inter text-slate-600 py-3 px-3">${secFmt(r.security)}</td>
                <td class="text-left font-inter font-black text-red-600 bg-red-50/40 py-3 px-3">${r.deducted > 0 ? '- ' + secFmt(r.deducted) : '—'}</td>
                <td class="text-left font-inter font-bold text-green-600 py-3 px-3">${r.refunded > 0 ? secFmt(r.refunded) : '—'}</td>
                <td class="text-center py-3 px-3">${badgeFor(r.statusClass, r.statusLabel)}</td>
            </tr>
        `).join('');

        container.innerHTML += `
            <div class="mb-8">
                <div class="flex items-center gap-3 mb-3">
                    <div class="h-px flex-1 bg-slate-200"></div>
                    <div class="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 text-white text-xs font-bold shrink-0">
                        <i class="fa-regular fa-calendar-days"></i>
                        ${monthName}
                        <span class="bg-white/20 rounded-full px-2 py-0.5 text-[10px]">${monthRows.length} طلب</span>
                        <span class="bg-red-500/30 rounded-full px-2 py-0.5 text-[10px]">مُصادَر: ${secFmt(monthDeducted)} ر.س</span>
                    </div>
                    <div class="h-px flex-1 bg-slate-200"></div>
                </div>
                <div class="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                    <table class="w-full">
                        <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200">
                            <tr>
                                <th class="py-3 px-3 text-right">رقم الطلب</th>
                                <th class="py-3 px-3 text-right">العميل</th>
                                <th class="py-3 px-3 text-left">التأمين (العقد)</th>
                                <th class="py-3 px-3 text-left">المُصادَر (المخصوم)</th>
                                <th class="py-3 px-3 text-left">المُعاد للعميل</th>
                                <th class="py-3 px-3 text-center">الحالة</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white">${rowsHtml}</tbody>
                    </table>
                </div>
            </div>`;
    });
}
