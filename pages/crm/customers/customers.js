/**
 * سجل العملاء — يجمع كل العملاء من الطلبات (والأرشيف) مع بياناتهم.
 * (عرض فقط: الاسم، النوع، الجوال، العنوان، عدد الطلبات، إجمالي القيمة + بحث)
 */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.SaddahDB.init();
        buildCustomers();
    } catch (e) {
        console.error('Customers load error:', e);
    }
});

let ALL = [];
const fmtMoney = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));

function buildCustomers() {
    const orders = window.SaddahDB.data.orders || [];
    const archive = window.SaddahDB.data.archive || [];
    const all = [...orders, ...archive];
    const map = new Map();

    all.forEach(o => {
        const c = o.client;
        if (!c || !c.name) return;
        const key = c.name.trim();
        if (!map.has(key)) {
            map.set(key, { name: key, phone: '', address: '', type: c.type || 'individual', orders: 0, total: 0, lastTs: 0 });
        }
        const r = map.get(key);
        r.orders++;
        r.total += (o.computed && parseFloat(o.computed.revenue)) || parseFloat(o.financials && o.financials.total) || 0;
        if (c.phone && !r.phone) r.phone = ('' + c.phone).trim();
        if (c.address && !r.address) r.address = ('' + c.address).trim();
        const ts = o.id || 0;
        if (ts > r.lastTs) r.lastTs = ts;
    });

    ALL = [...map.values()].sort((a, b) => b.orders - a.orders || b.total - a.total);

    document.getElementById('cust-count').textContent = ALL.length;
    document.getElementById('cust-phones').textContent = ALL.filter(c => c.phone).length;
    renderCustomers(ALL);
}

function renderCustomers(list) {
    const tb = document.getElementById('cust-rows');
    if (!list.length) {
        tb.innerHTML = '<tr><td colspan="5" class="text-center text-slate-400 py-8 text-sm font-bold">لا يوجد عملاء مطابقون</td></tr>';
        return;
    }
    tb.innerHTML = list.map(c => `
        <tr class="hover:bg-slate-50 border-b border-slate-50">
            <td class="py-3 px-3">
                <div class="font-bold text-slate-800">${c.name}</div>
                <div class="text-[11px] text-slate-400">${c.type === 'company' ? 'شركة / مؤسسة' : 'فرد'}</div>
            </td>
            <td class="py-3 px-3 font-inter text-slate-600 text-sm" dir="ltr" style="text-align:right">${c.phone || '—'}</td>
            <td class="py-3 px-3 text-slate-500 text-sm">${c.address || '—'}</td>
            <td class="py-3 px-3 text-center font-inter font-bold text-slate-700">${c.orders}</td>
            <td class="py-3 px-3 text-center font-inter font-bold text-slate-700">${fmtMoney(c.total)}</td>
        </tr>`).join('');
}

function searchCustomers(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) { renderCustomers(ALL); return; }
    renderCustomers(ALL.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
    ));
}
