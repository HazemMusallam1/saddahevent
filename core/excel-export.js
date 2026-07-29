// excel-export.js

/**
 * دالة تصدير الطلبات إلى ملف Excel بـ 4 أقسام رئيسية حسب المعايير المحاسبية المعتمدة في خطة التنفيذ.
 */
function exportToExcel() {
    // استخدم المصفوفة المعرفة في order_tracking.js
    if (typeof globalOrders === 'undefined' || !globalOrders || globalOrders.length === 0) {
        alert("لا توجد طلبات مسجلة لتصديرها!");
        return;
    }

    const rows = [];
    
    // Header Row mapping
    const headers = [
        "رقم الطلب", "حالة الطلب", "اسم العميل", "تاريخ الطلب", "مدة الإيجار", "مسؤول التوصيل", "مسؤول الإرجاع", "الأصناف", // القسم 1
        "مبلغ الإيجار الأساسي", "إجمالي الطلب", "العربون", "التأمين", "المخصوم من التأمين", "المبلغ المستلم", "المبلغ المتبقي", // القسم 2
        "توصيل خارجي", "إرجاع للمستودع", "مصاريف أخرى (مشتريات)", "إجمالي المصاريف المباشرة", // القسم 3
        "ربح الطلب", "حصة التشغيل (10%)", "بنزين عبدالرزاق", "صافي التشغيل (بعد الخصم)", "الربح القابل للتوزيع", "ربح المجموعة الأولى (30%)", "ربح المجموعة الثانية (30%)", "ربح المجموعة الثالثة (30%)" // القسم 4
    ];
    
    // Arrays to store totals
    const totals = new Array(headers.length).fill(0);
    // Which columns should not be summed? (Strings and info)
    const noSumIndices = [0, 1, 2, 3, 4, 5, 6, 7];

    // Iterate over all orders
    globalOrders.forEach(order => {
        // --- القسم 1: البيانات الأساسية ---
        const orderId = order.id || '-';
        const isAudited = order.status === 'تم الجرد' ? "تم الجرد" : "لم يتم الجرد";
        const clientName = order.client?.name || '-';
        const orderDate = order.date || order.client?.deliveryDate || '-';
        const duration = order.client?.duration || '-';
        const delPerson = order.client?.deliveryPerson || '-';
        const retPerson = order.client?.returnPerson || '-';
        const items = (order.items || []).map(i => i.name).join(' ، ') || 'لا يوجد';

        // --- القسم 2: الإيرادات ---
        const subtotal = parseFloat(order.financials?.subTotal) || 0;
        const total = parseFloat(order.financials?.total) || 0;
        const deposit = parseFloat(order.financials?.deposit) || 0;
        const insurance = parseFloat(order.financials?.securityDeposit) || 0;
        
        let deductedInsurance = 0;
        if (order.returns && order.returns.length > 0) {
            order.returns.forEach(r => {
                deductedInsurance += parseFloat(r.deducted) || 0;
            });
        }
        
        // Sum of all payments
        let received = 0;
        if (order.paymentProofs && order.paymentProofs.length > 0) {
            order.paymentProofs.forEach(p => {
                received += parseFloat(p.amount) || 0;
            });
        } else {
            // Fallback to legacy paid if payments proofs don't exist
            received = parseFloat(order.financials?.paid) || 0;
        }
        
        // Remaining = Total - Received + Deducted Insurance
        const remaining = (total - received) + deductedInsurance;

        // --- القسم 3: المصروفات المباشرة ---
        const extDelivery = parseFloat(order.extraFinancials?.externalDelivery) || 0;
        const whDelivery = parseFloat(order.extraFinancials?.warehouseDelivery) || 0;
        
        const STRUCTURED_NAMES = ['توصيل خارجي', 'إرجاع مستودع', 'بنزين عبد الرزاق'];
        let otherExpenses = 0;
        if (order.expenses && order.expenses.length > 0) {
            order.expenses.forEach(e => {
                if (e && STRUCTURED_NAMES.indexOf(e.name) !== -1) return; // مُحتسبة بشكل منفصل (تجنّب الازدواج)
                otherExpenses += parseFloat(e.total || e.afterDiscount || e.amountAfterDiscount || e.amount) || 0;
            });
        }

        const totalExpenses = extDelivery + whDelivery + otherExpenses;

        // --- القسم 4: تحليل الأرباح ---
        // الربح = الإجمالي - المصروفات المباشرة (التأمين المصادَر لا يدخل في الربح — يُتابَع في صفحة تأمينات العملاء)
        const orderProfit = total - totalExpenses;
        
        // Operating Share = 10% of profit
        const operatingShare = orderProfit > 0 ? (orderProfit * 0.10) : 0;
        
        // Abdulrazzaq Fuel
        const fuel = parseFloat(order.extraFinancials?.abdulrazzaqFuel) || 0;
        
        // Net Operating
        const netOperating = operatingShare - fuel;
        
        // Distributable Profit (90% of profit)
        const distributable = orderProfit > 0 ? (orderProfit * 0.90) : 0;
        
        // 3 Groups (30% of total profit each, which is 1/3 of the 90%)
        const group1 = distributable / 3;
        const group2 = distributable / 3;
        const group3 = distributable / 3;

        // Build the row array
        const rowData = [
            orderId, isAudited, clientName, orderDate, duration, delPerson, retPerson, items,
            subtotal, total, deposit, insurance, deductedInsurance, received, remaining,
            extDelivery, whDelivery, otherExpenses, totalExpenses,
            orderProfit, operatingShare, fuel, netOperating, distributable, group1, group2, group3
        ];
        
        // Add to totals
        for (let i = 0; i < rowData.length; i++) {
            if (!noSumIndices.includes(i)) {
                totals[i] += parseFloat(rowData[i]) || 0;
            }
        }

        rows.push(rowData);
    });

    // Add totals row
    const totalsRow = new Array(headers.length).fill("");
    totalsRow[0] = "الإجمالي الشامل";
    for (let i = 0; i < totalsRow.length; i++) {
        if (!noSumIndices.includes(i)) {
            // Round to 2 decimals
            totalsRow[i] = Math.round((totals[i] + Number.EPSILON) * 100) / 100;
        }
    }
    rows.push(totalsRow);

    // Create Worksheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    
    // Optional: Make the header row bold/colored if the library supports it easily, 
    // but in raw SheetJS CE, styling requires xlsx-js-style. 
    // We will just adjust column widths here.
    const wscols = [
        {wch: 15}, {wch: 15}, {wch: 25}, {wch: 12}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 40},
        {wch: 12}, {wch: 12}, {wch: 10}, {wch: 10}, {wch: 15}, {wch: 12}, {wch: 12},
        {wch: 12}, {wch: 12}, {wch: 15}, {wch: 18},
        {wch: 12}, {wch: 15}, {wch: 12}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}
    ];
    ws['!cols'] = wscols;

    // RTL direction
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'].push({ rightToLeft: true });

    // Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير الطلبات");

    // Format current date for file name
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Save file
    XLSX.writeFile(wb, `التقرير_المالي_الشامل_${dateStr}.xlsx`);
}
