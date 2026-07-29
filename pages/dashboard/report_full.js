// DB Key
const DB_KEY = 'sadda_orders_db';

// Helper
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

let allOrders = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Load Data
    allOrders = JSON.parse(localStorage.getItem(DB_KEY)) || [];

    // Set Header Date
    const dateEl = document.getElementById('report-date-full');
    if (dateEl) {
        dateEl.innerText = new Date().toLocaleDateString('en-GB');
    }

    // Set Filers defaults
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');

    // Default to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    if (startInput) startInput.valueAsDate = firstDay;
    if (endInput) endInput.valueAsDate = lastDay;

    // Initial Render
    renderTable(allOrders);
});

function renderTable(ordersData) {
    const tbody = document.getElementById('report-table-body');
    tbody.innerHTML = '';

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalProfit = 0;

    // Sort by date desc
    ordersData.sort((a, b) => new Date(b.client.date) - new Date(a.client.date));

    ordersData.forEach(order => {
        const income = parseFloat(order.financials.total) || 0;

        // Calculate Expenses
        let expenses = 0;
        if (order.expenses && Array.isArray(order.expenses)) {
            expenses = order.expenses.reduce((sum, exp) => sum + (parseFloat(exp.total || exp.afterDiscount || exp.amount) || 0), 0);
        } else {
            // Legacy check
            expenses = (parseFloat(order.financials.expenseDriver) || 0) +
                (parseFloat(order.financials.expenseWorkers) || 0) +
                (parseFloat(order.financials.expenseOther) || 0);
        }

        const profit = income - expenses;

        totalIncome += income;
        totalExpenses += expenses;
        totalProfit += profit;

        const row = `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
                <td class="py-2 px-1 font-inter text-slate-500 text-[10px] text-center">#${order.id}</td>
                <td class="py-2 px-1 font-bold text-slate-800 text-xs">${order.client.name}</td>
                <td class="py-2 px-1 text-center font-inter text-slate-600 text-[10px]">${order.client.date ? new Date(order.client.date).toLocaleDateString('en-GB') : '-'}</td>
                <td class="py-2 px-1 text-left font-black font-inter text-slate-800 text-xs" dir="ltr">${formatCurrency(income)}</td>
                <td class="py-2 px-1 text-left font-black font-inter text-red-500 text-xs" dir="ltr">${formatCurrency(expenses)}</td>
                <td class="py-2 px-1 text-left font-black font-inter text-emerald-600 text-xs" dir="ltr">${formatCurrency(profit)}</td>
                <td class="py-2 px-1 text-center">
                    <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-bold border border-slate-200">
                        ${order.status === 'completed' ? 'مكتمل' : 'معلق'}
                    </span>
                </td>
                <td class="py-2 px-1 text-center no-print border-r border-slate-50">
                     <a href="contract_print.html?id=${order.id}" target="_blank" class="text-slate-400 hover:text-brand-600 transition w-6 h-6 rounded-full hover:bg-brand-50 flex items-center justify-center mx-auto" title="عرض العقد">
                        <i class="fa-solid fa-file-contract text-xs"></i>
                    </a>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    // Update Summary Cards
    const elCount = document.getElementById('total-count');
    const elIncome = document.getElementById('total-income');
    const elExpenses = document.getElementById('total-expenses');
    const elProfit = document.getElementById('total-profit');

    if (elCount) elCount.innerText = ordersData.length;
    if (elIncome) elIncome.innerText = formatCurrency(totalIncome);
    if (elExpenses) elExpenses.innerText = formatCurrency(totalExpenses);
    if (elProfit) elProfit.innerText = formatCurrency(totalProfit);
}

function applyFilters() {
    const startVal = document.getElementById('filter-start').value;
    const endVal = document.getElementById('filter-end').value;

    if (!startVal && !endVal) {
        renderTable(allOrders);
        return;
    }

    const startDate = startVal ? new Date(startVal) : new Date('2000-01-01');
    const endDate = endVal ? new Date(endVal) : new Date('2100-01-01');
    // Set End Date to end of day
    endDate.setHours(23, 59, 59, 999);

    const filtered = allOrders.filter(o => {
        if (!o.client.date) return false;
        const oDate = new Date(o.client.date);
        return oDate >= startDate && oDate <= endDate;
    });

    renderTable(filtered);
}

function resetFilters() {
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value = '';

    // Reset to default month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');

    if (startInput) startInput.valueAsDate = firstDay;
    if (endInput) endInput.valueAsDate = lastDay;

    renderTable(allOrders);
}
