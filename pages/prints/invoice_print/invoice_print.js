const data = JSON.parse(localStorage.getItem('current_order'));

if (data) {
    // 1. البيانات الأساسية
    document.getElementById('inv-date').innerText = new Date().toISOString().split('T')[0];
    document.getElementById('inv-num').innerText = '#INV-' + Math.floor(100000 + Math.random() * 900000);

    // تاريخ التوريد (بداية العقد)
    if (data.client.deliveryDate) {
        document.getElementById('supply-date').innerText = data.client.deliveryDate;
    }

    // 2. نوع العميل (فرد / شركة)
    const isCompany = data.client.type === 'company';
    if (isCompany) {
        document.getElementById('label-name').innerText = 'اسم المنشأة:';
        document.getElementById('label-id').innerText = 'الرقم الضريبي للعميل:';
        document.getElementById('c-name').innerText = data.client.name;
        document.getElementById('c-id').innerText = data.client.id || '-'; // الرقم الضريبي
    } else {
        document.getElementById('c-name').innerText = data.client.name;
        document.getElementById('c-id').innerText = data.client.id || '-';
    }
    document.getElementById('c-address').innerText = data.client.address || '-';

    // 3. الحسابات والجدول
    let itemsHTML = '';
    let subTotalInclusive = 0; // المجموع شامل الضريبة من البيانات المحفوظة
    let vatRate = parseFloat(data.financials.vatRate) || 0;

    data.items.forEach(item => {
        const totalItemInclusive = parseFloat(item.total);
        const totalItemOriginalInclusive = item.totalOriginal ? parseFloat(item.totalOriginal) : totalItemInclusive;
        const hasDiscount = totalItemOriginalInclusive > totalItemInclusive;
        const qty = parseInt(item.qty) || 1;

        const priceFactor = 1 + (vatRate / 100);

        // Exclusive Calculations
        const totalItemExclusive = totalItemInclusive / priceFactor;
        const totalItemOriginalExclusive = totalItemOriginalInclusive / priceFactor;

        const unitPriceExclusive = totalItemExclusive / qty;
        const unitPriceOriginalExclusive = totalItemOriginalExclusive / qty;

        subTotalInclusive += totalItemInclusive;

        let descHTML = `<span class="font-bold text-gray-800">${item.name}</span>`;
        if (item.desc) descHTML += `<div class="text-[9px] text-gray-500 mt-0.5">${item.desc}</div>`;

        if (hasDiscount) {
            const discountAmount = totalItemOriginalInclusive - totalItemInclusive;
            const discountPercent = (discountAmount / totalItemOriginalInclusive) * 100;
            descHTML += `<div class="text-[9px] text-red-500 font-bold mt-0.5">خصم خاص: ${discountAmount.toFixed(2)} ريال (${discountPercent.toFixed(1)}%)</div>`;
        }

        // Helper displays
        const unitPriceDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-gray-400 text-[9px]">${unitPriceOriginalExclusive.toFixed(2)}</span>
                 <span>${unitPriceExclusive.toFixed(2)}</span>
               </div>`
            : unitPriceExclusive.toFixed(2);

        const totalExclDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-gray-400 text-[9px]">${totalItemOriginalExclusive.toFixed(2)}</span>
                 <span>${totalItemExclusive.toFixed(2)}</span>
               </div>`
            : totalItemExclusive.toFixed(2);

        const totalInclDisplay = hasDiscount
            ? `<div class="flex flex-col items-center leading-none">
                 <span class="line-through text-gray-400 text-[9px]">${totalItemOriginalInclusive.toFixed(2)}</span>
                 <span>${totalItemInclusive.toFixed(2)}</span>
               </div>`
            : totalItemInclusive.toFixed(2);

        itemsHTML += `
            <tr class="border-b border-gray-50">
                <td class="py-3 px-4">${descHTML}</td>
                <td class="py-3 px-2 text-center font-inter font-bold text-gray-600">${qty}</td>
                <td class="py-3 px-2 text-center font-inter text-gray-500">${unitPriceDisplay}</td>
                <td class="py-3 px-2 text-center font-inter text-gray-600">${totalExclDisplay}</td>
                <td class="py-3 px-4 text-center font-inter font-bold text-gray-900">${totalInclDisplay}</td>
            </tr>
        `;
    });

    // إضافة التوصيل كبند إذا وجد
    const deliveryFee = parseFloat(data.financials.delivery) || 0;
    if (deliveryFee > 0) {
        const priceFactor = 1 + (vatRate / 100);
        const delExclusive = deliveryFee / priceFactor;
        subTotalInclusive += deliveryFee;

        itemsHTML += `
            <tr class="border-b border-gray-50 bg-gray-50/50">
                <td class="py-3 px-4"><span class="font-bold text-gray-700">رسوم التوصيل والتركيب</span></td>
                <td class="py-3 px-2 text-center font-inter font-bold text-gray-600">1</td>
                <td class="py-3 px-2 text-center font-inter text-gray-500">${delExclusive.toFixed(2)}</td>
                <td class="py-3 px-2 text-center font-inter text-gray-600">${delExclusive.toFixed(2)}</td>
                <td class="py-3 px-4 text-center font-inter font-bold text-gray-900">${deliveryFee.toFixed(2)}</td>
            </tr>
        `;
    }

    document.getElementById('items-body').innerHTML = itemsHTML;

    // 4. المجاميع النهائية
    const grandTotal = subTotalInclusive;
    const priceFactor = 1 + (vatRate / 100);
    const totalExclusive = grandTotal / priceFactor;
    const totalVat = grandTotal - totalExclusive;

    document.getElementById('subtotal-excl').innerText = totalExclusive.toFixed(2);
    document.getElementById('vat-val').innerText = totalVat.toFixed(2);
    document.getElementById('vat-rate-display').innerText = `${vatRate}%`;
    document.getElementById('total-val').innerText = grandTotal.toFixed(2) + ' ريال';

    // 5. المدفوع والمتبقي
    const deposit = parseFloat(data.financials.deposit) || 0;
    // التحقق مما إذا كان الطلب مكتملاً في السجلات (إذا تم الضغط على زر سداد كامل)
    let paidAmount = deposit;
    let remainingAmount = grandTotal - deposit;

    if (data.paymentStatus && data.paymentStatus.remaining) {
        paidAmount = grandTotal; // إذا كانت حالة "تم سداد المتبقي" مفعلة
        remainingAmount = 0;
        document.getElementById('inv-status').innerText = 'مدفوع بالكامل';
        document.getElementById('inv-status').className = 'font-bold text-emerald-600';
    } else if (remainingAmount <= 0) {
        document.getElementById('inv-status').innerText = 'مدفوع بالكامل';
        document.getElementById('inv-status').className = 'font-bold text-emerald-600';
    } else if (deposit > 0) {
        document.getElementById('inv-status').innerText = 'مدفوع جزئياً';
        document.getElementById('inv-status').className = 'font-bold text-orange-500';
    } else {
        document.getElementById('inv-status').innerText = 'غير مدفوع';
        document.getElementById('inv-status').className = 'font-bold text-red-500';
    }

    document.getElementById('paid-val').innerText = paidAmount.toFixed(2);
    document.getElementById('remaining-val').innerText = remainingAmount.toFixed(2);
}
