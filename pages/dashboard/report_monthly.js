const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

// Helper: Group orders by "Year-Month"
function groupByMonth(orders) {
    const groups = {};
    orders.forEach(order => {
        if (!order.client.date) return;
        // Format YYYY-MM
        const dateObj = new Date(order.client.date);
        const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

        if (!groups[key]) {
            groups[key] = {
                id: key,
                name: dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' }),
                orders: [],
                income: 0,
                expenses: 0,
                profit: 0
            };
        }

        const income = parseFloat(order.financials.total) || 0;
        const expenses = (order.expenses || []).reduce((sum, exp) => sum + (parseFloat(exp.total || exp.afterDiscount || exp.amount) || 0), 0);

        groups[key].orders.push(order);
        groups[key].income += income;
        groups[key].expenses += expenses;
        groups[key].profit += (income - expenses);
    });

    // Sort keys descending (newest first)
    return Object.keys(groups).sort().reverse().map(key => groups[key]);
}

// Script loaded dynamically after SaddahDB.init()
(function () {
    const orders = (window.SaddahDB && window.SaddahDB.data.orders) || [];
    const monthlyData = groupByMonth(orders);
    const container = document.getElementById('months-grid');

    if (monthlyData.length === 0) {
        container.innerHTML = `<div class="p-10 text-center text-gray-400 font-bold">لا توجد بيانات متاحة لعرضها.</div>`;
        return;
    }

    monthlyData.forEach(month => {
        // Create Month Card
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm break-inside-avoid';

        // Calculate max value for bar charts relative to this month ONLY (for visual proportion) or global?
        // Let's do simple visualization: Stacked bar

        const rows = month.orders.map(o => `
            <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td class="py-2 px-3 text-xs font-bold text-slate-700 font-inter">#${o.id}</td>
                <td class="py-2 px-3 text-xs text-slate-600">${o.client.date}</td>
                <td class="py-2 px-3 text-xs font-bold text-slate-800">${o.client.name}</td>
                <td class="py-2 px-3 text-xs text-center font-inter text-purple-600">${formatCurrency(o.financials.total)}</td>
            </tr>
        `).join('');

        card.innerHTML = `
            <div class="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                <h2 class="text-xl font-black text-slate-800">${month.name}</h2>
                <span class="bg-white border border-slate-200 px-3 py-1 rounded-full text-xs font-bold text-slate-500 font-inter">${month.id}</span>
            </div>
            
            <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Summary Stats -->
                <div class="md:col-span-1 space-y-4">
                    <div class="bg-purple-50 p-4 rounded-xl border border-purple-100">
                        <p class="text-xs text-purple-600 font-bold uppercase">المبيعات</p>
                        <p class="text-xl font-black text-purple-800 font-inter">${formatCurrency(month.income)}</p>
                    </div>
                    <div class="bg-red-50 p-4 rounded-xl border border-red-100">
                        <p class="text-xs text-red-600 font-bold uppercase">المصروفات</p>
                        <p class="text-xl font-black text-red-800 font-inter">${formatCurrency(month.expenses)}</p>
                    </div>
                    <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p class="text-xs text-emerald-600 font-bold uppercase">صافي الربح</p>
                        <p class="text-2xl font-black text-emerald-800 font-inter">${formatCurrency(month.profit)}</p>
                    </div>
                    <div class="text-xs text-center text-slate-400 pt-2 font-bold">
                        عدد الطلبات: <span class="font-inter text-slate-700 text-sm">${month.orders.length}</span>
                    </div>
                </div>

                <!-- Orders Micro-List -->
                <div class="md:col-span-2 border border-slate-100 rounded-xl overflow-hidden flex flex-col">
                    <div class="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500 border-b border-slate-100">تفاصيل طلبات الشهر</div>
                    <div class="overflow-y-auto max-h-60 grow">
                        <table class="w-full text-right">
                            <tbody class="divide-y divide-slate-50">
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
})();
