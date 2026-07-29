// Script is loaded dynamically after SaddahDB.init() — assign directly
let orders = (window.SaddahDB && window.SaddahDB.data.orders) || [];

let currentFilter = 'all';
let activeOrderId = null;

// ─── Central save helper ──────────────────────────────────────────────────────
// Always syncs the local `orders` array back into SaddahDB before writing to
// localStorage.  This keeps things correct even if `orders` was reassigned
// (e.g. via filter/splice operations that break the original reference).
function saveOrders() {
    window.SaddahDB.data.orders = orders;
    window.SaddahDB.save();
}

function persistOrder(orderId) {
    saveOrders();
}

// --- Tabs Logic ---
function switchTab(tab) {
    document.getElementById('tab-expenses').classList.add('hidden');
    document.getElementById('tab-proofs').classList.add('hidden');
    document.getElementById('tab-btn-expenses').classList.remove('border-purple-600', 'text-purple-600');
    document.getElementById('tab-btn-proofs').classList.remove('border-purple-600', 'text-purple-600');

    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-btn-${tab}`).classList.add('border-purple-600', 'text-purple-600');
}

// --- Financial Modal Functions ---

function openFinancialModal(orderId) {
    activeOrderId = orderId;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Ensure arrays & objects exist
    if (!order.expenses) order.expenses = [];
    if (!order.paymentProofs) order.paymentProofs = [];
    if (!order.paymentStatus) {
        order.paymentStatus = {
            deposit: parseFloat(order.financials.deposit) > 0,
            security: false,
            remaining: false,
            completed: false,
            securityReturned: false
        };
    }

    document.getElementById('fin-order-id').innerText = `Order #${order.id} - ${order.client.name}`;

    // Set initial toggle states
    renderPaymentStatusUI(order);

    renderFinancialModal();

    const modal = document.getElementById('financial-modal');
    modal.classList.remove('hidden');
    // Small timeout to allow display:block to apply before opacity transition
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('fin-modal-content').classList.remove('scale-95');
    }, 10);

    switchFinTab('status'); // Default tab
}

function closeFinancialModal() {
    const modal = document.getElementById('financial-modal');
    modal.classList.add('opacity-0');
    document.getElementById('fin-modal-content').classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        activeOrderId = null;
        renderOrders(); // Refresh main list
    }, 300);
}

function switchFinTab(tab) {
    ['status', 'proofs', 'expenses'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        const btn = document.getElementById(`tab-btn-${t}`);
        btn.classList.remove('border-purple-600', 'text-purple-600');
        btn.classList.add('border-transparent', 'text-slate-400');
    });

    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`tab-btn-${tab}`);
    activeBtn.classList.remove('border-transparent', 'text-slate-400');
    activeBtn.classList.add('border-purple-600', 'text-purple-600');
}

function renderFinancialModal() {
    if (!activeOrderId) return;
    const order = orders.find(o => o.id == activeOrderId);
    if (!order) return;

    // 1. Calculate Financials
    const total = parseFloat(order.financials.total) || 0;
    const deposit = parseFloat(order.financials.deposit) || 0;
    const security = parseFloat(order.financials.securityDeposit) || 0;

    // Calculate Paid based on status
    let paid = 0;
    if (order.paymentStatus.remaining || order.paymentStatus.completed) {
        paid = total; // Fully paid
    } else if (order.paymentStatus.deposit) {
        paid = deposit;
    }

    const remaining = total - paid;

    // Update Top Stats
    document.getElementById('fin-total').innerText = formatCurrency(total);
    document.getElementById('fin-paid').innerText = formatCurrency(paid);
    document.getElementById('fin-remaining').innerText = formatCurrency(remaining);
    document.getElementById('fin-security').innerText = formatCurrency(security);

    // Update Contract URL Input
    const contractUrlInp = document.getElementById('contract-url');
    const openContractBtn = document.getElementById('open-contract-btn');

    if (contractUrlInp) {
        contractUrlInp.value = order.contractUrl || '';
        if (order.contractUrl) {
            openContractBtn.href = order.contractUrl;
            openContractBtn.classList.remove('hidden');
        } else {
            openContractBtn.classList.add('hidden');
        }
    }

    // Update Status Amounts in Tab
    document.getElementById('amt-deposit').innerText = formatCurrency(deposit);
    document.getElementById('amt-security').innerText = formatCurrency(security);
    document.getElementById('amt-remaining').innerText = formatCurrency(total - deposit); // Remaining after deposit

    // 2. Render Expenses List
    const expList = document.getElementById('expenses-list');
    expList.innerHTML = '';
    if (order.expenses.length === 0) {
        expList.innerHTML = '<tr class="border-b border-slate-50"><td colspan="4" class="py-4 text-center text-xs text-slate-400">لا توجد مصروفات مسجلة</td></tr>';
    } else {
        order.expenses.forEach((exp, idx) => {
            let attachmentIcon = '-';
            if (exp.attachment) {
                const attType = exp.attachment.type || '';
                const type = attType === 'link' ? 'link' : (attType.includes('pdf') ? 'pdf' : 'image');
                const safeName = (exp.attachment.name || exp.name || 'file').replace(/'/g, "");

                let attData = exp.attachment.data || exp.attachment.link || '';
                if (window.resolveSaddahUrl) attData = window.resolveSaddahUrl(attData);
                if (type === 'link') {
                    attachmentIcon = `<a href="${attData}" target="_blank" class="text-blue-500 hover:text-blue-700 text-xs"><i class="fa-brands fa-google-drive"></i></a>`;
                } else if (attData) {
                    attachmentIcon = `<button onclick="openAttachmentViewer('${attType}', '${attData}', '${safeName}')" class="text-purple-500 hover:text-purple-700 text-xs"><i class="fa-solid fa-paperclip"></i></button>`;
                }
            }

            // بادجات طريقة الدفع
            let paymentBadges = '';
            if (exp.cashPaid > 0 || exp.transferPaid > 0) {
                if (exp.cashPaid > 0)
                    paymentBadges += `<span class="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-bold">💵 ${formatCurrency(exp.cashPaid)}</span>`;
                if (exp.transferPaid > 0)
                    paymentBadges += `<span class="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-bold ml-1">🏦 ${formatCurrency(exp.transferPaid)}</span>`;
            }

            // وسم المطالبة: يوضّح أن هذا المصروف عليه مطالبة لموظف
            let claimBadge = '';
            if (exp.claimId && window.SaddahDB && Array.isArray(window.SaddahDB.data.claims)) {
                const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
                if (claim) {
                    const emp = String(claim.employee || 'موظف').replace(/</g, '&lt;');
                    const settled = claim.status === 'settled' || claim.batchId;
                    claimBadge = settled
                        ? `<span class="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 font-bold"><i class="fa-solid fa-hand-holding-dollar"></i> مطالبة: ${emp} ✓</span>`
                        : `<span class="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 font-bold"><i class="fa-solid fa-hand-holding-dollar"></i> مطالبة: ${emp}</span>`;
                }
            }

            const row = `
                <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td class="py-2 px-2">
                        <div class="text-slate-700 font-bold text-xs">${exp.desc || exp.name}</div>
                        ${(claimBadge || paymentBadges) ? `<div class="flex gap-1 mt-1 flex-wrap items-center">${claimBadge}${paymentBadges}</div>` : ''}
                    </td>
                    <td class="py-2 px-2 text-slate-800 font-black text-xs">${formatCurrency(exp.amount)}</td>
                    <td class="py-2 px-2 text-center">${attachmentIcon}</td>
                    <td class="py-2 px-2 text-center">
                        <button onclick="window.OrdersActions.deleteExpense(${idx})" class="text-slate-300 hover:text-red-500 transition"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>
            `;
            expList.innerHTML += row;
        });
    }

    // 3. Render Proofs List
    const proofList = document.getElementById('proofs-list');
    proofList.innerHTML = '';
    if (!order.paymentProofs || order.paymentProofs.length === 0) {
        proofList.innerHTML = '<p class="col-span-full text-center text-slate-400 text-xs py-4">لا توجد إثباتات مرفقة.</p>';
    } else {
        order.paymentProofs.forEach((proof, idx) => {
            const dateStr = proof.date ? new Date(proof.date).toLocaleDateString('en-GB') : '';
            const att = proof.attachment || proof;
            let type = att.type || 'image/jpeg';
            let data = att.data || att.link || att.image || '';
            if (window.resolveSaddahUrl) data = window.resolveSaddahUrl(data);
            let name = att.name || proof.desc || `proof_${idx}`;
            let safeName = name.replace(/'/g, "").replace(/[\s\.]/g, "_");

            let thumbnail = '';

            if (type === 'link') {
                // External Link Style
                thumbnail = `
                    <a href="${data}" target="_blank" class="w-full h-full bg-blue-50 flex flex-col items-center justify-center text-blue-500 gap-2 cursor-pointer no-underline group hover:bg-blue-100 transition">
                        <i class="fa-brands fa-google-drive text-3xl group-hover:scale-110 transition"></i>
                        <span class="text-[9px] font-bold text-center px-1 truncate w-full">رابط خارجي</span>
                         <span class="text-[8px] text-blue-400">اضغط للفتح</span>
                    </a>
                `;
            } else if (type.includes('pdf')) {
                thumbnail = `
                    <div class="w-full h-full bg-red-50 flex flex-col items-center justify-center text-red-500 gap-2 cursor-pointer hover:bg-red-100 transition" onclick="openAttachmentViewer('${type}', '${data}', '${safeName}')">
                        <i class="fa-solid fa-file-pdf text-3xl"></i>
                        <span class="text-[8px] font-bold text-center px-1 truncate w-full">${name}</span>
                    </div>
                `;
            } else {
                thumbnail = `<img src="${data}" class="w-full h-full object-cover cursor-pointer hover:scale-105 transition duration-500" onclick="openAttachmentViewer('${type}', '${data}', '${safeName}')">`;
            }

            const card = `
                <div class="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
                    ${thumbnail}
                    <button onclick="window.OrdersActions.deleteProof(${idx})" class="absolute top-2 left-2 bg-white/90 text-red-500 w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition shadow-sm opacity-0 group-hover:opacity-100 z-10">
                        <i class="fa-solid fa-trash text-[10px]"></i>
                    </button>
                    ${type !== 'link' ? `<div class="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] p-1 text-center truncate pointer-events-none z-10">${dateStr}</div>` : ''}
                </div>
            `;
            proofList.innerHTML += card;
        });
    }
}

// --- Status Management Functions ---



function saveContractUrl() {
    if (!activeOrderId) return;
    const orderIndex = orders.findIndex(o => o.id == activeOrderId);
    if (orderIndex === -1) return;

    const url = document.getElementById('contract-url').value.trim();
    orders[orderIndex].contractUrl = url;
    
        saveOrders();


    // Update UI button
    const openContractBtn = document.getElementById('open-contract-btn');
    if (url) {
        openContractBtn.href = url;
        openContractBtn.classList.remove('hidden');
    } else {
        openContractBtn.classList.add('hidden');
    }
}

function toggleSecurityReturned() {
    if (!activeOrderId) return;
    const orderIndex = orders.findIndex(o => o.id == activeOrderId);
    if (orderIndex === -1) return;

    // Can only return security if it was paid
    if (!orders[orderIndex].paymentStatus.security) {
        alert('لم يتم دفع التأمين بعد.');
        document.getElementById('check-security-returned').checked = false;
        return;
    }

    orders[orderIndex].paymentStatus.securityReturned = document.getElementById('check-security-returned').checked;
    
        saveOrders();

}

function renderPaymentStatusUI(order) {
    const ps = order.paymentStatus;

    // Helper to style buttons
    const setStatus = (id, active) => {
        const iconContainer = document.getElementById(`icon-${id}`);
        const icon = iconContainer.querySelector('i');

        if (active) {
            iconContainer.className = 'w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 border border-emerald-500 shadow-sm transition-all scale-110';
            icon.className = 'fa-solid fa-check text-white text-sm';
            // Also highlight parent container
            iconContainer.parentElement.parentElement.classList.add('border-purple-200', 'bg-purple-50/30');
        } else {
            iconContainer.className = 'w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 shadow-sm transition-all';
            icon.className = 'fa-solid fa-check text-slate-300 text-xs';
            iconContainer.parentElement.parentElement.classList.remove('border-purple-200', 'bg-purple-50/30');
        }
    };

    setStatus('deposit', ps.deposit);
    setStatus('security', ps.security);
    setStatus('remaining', ps.remaining);

    // Checkbox
    document.getElementById('check-security-returned').checked = ps.securityReturned === true;
}

// Handle File Input Change for UI feedback
document.getElementById('expense-file')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    const indicator = document.getElementById('file-indicator');
    const nameDisplay = document.getElementById('file-name-display');

    if (file) {
        indicator.classList.remove('hidden');
        nameDisplay.innerText = `ملف مرفق: ${file.name}`;
        nameDisplay.classList.remove('hidden');
    } else {
        indicator.classList.add('hidden');
        nameDisplay.classList.add('hidden');
    }
});

function addCurrentExpense() {
    if (!activeOrderId) return;
    const nameInp = document.getElementById('expense-name');
    const amountInp = document.getElementById('expense-amount');
    const fileInp = document.getElementById('expense-file');

    const name = nameInp.value.trim();
    const amount = parseFloat(amountInp.value);
    const file = fileInp.files[0];

    if (!name || isNaN(amount) || amount <= 0) {
        alert('الرجاء إدخال وصف ومبلغ صحيح.');
        return;
    }

    const processExpense = (attachmentData) => {
        const orderIndex = orders.findIndex(o => o.id == activeOrderId);
        if (orderIndex === -1) return;
        if (!orders[orderIndex].expenses) orders[orderIndex].expenses = [];

        orders[orderIndex].expenses.push({
            name: name,
            amount: amount,
            date: new Date().toISOString(),
            attachment: attachmentData
        });

        
        saveOrders();

        renderFinancialModal();

        // Reset inputs
        nameInp.value = '';
        amountInp.value = '';
        fileInp.value = '';
        document.getElementById('file-indicator').classList.add('hidden');
        document.getElementById('file-name-display').classList.add('hidden');
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const result = e.target.result;
            // For images, we might want to resize if too large
            if (file.type.startsWith('image/')) {
                const img = new Image();
                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const MAX_DIM = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_DIM) {
                            height *= MAX_DIM / width;
                            width = MAX_DIM;
                        }
                    } else {
                        if (height > MAX_DIM) {
                            width *= MAX_DIM / height;
                            height = MAX_DIM;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    const resizedData = canvas.toDataURL('image/jpeg', 0.7);
                    processExpense({ type: file.type, data: resizedData, name: file.name });
                };
                img.src = result;
            } else if (file.type === 'application/pdf') {
                // Check size limit (e.g. 1MB)
                if (file.size > 1024 * 1024) {
                    alert('حجم ملف PDF كبير جداً. الحد الأقصى 1 ميجابايت.');
                    return;
                }
                processExpense({ type: file.type, data: result, name: file.name });
            } else {
                alert('نوع الملف غير مدعوم. يرجى اختيار صورة أو PDF.');
            }
        };
        reader.readAsDataURL(file);
    } else {
        processExpense(null);
    }
}

function openAttachmentViewer(type, data, filename) {
    const modal = document.getElementById('attachment-viewer-modal');
    const body = document.getElementById('viewer-body');
    const title = document.getElementById('viewer-title');
    const info = document.getElementById('viewer-info');
    const downloadBtn = document.getElementById('viewer-download-btn');

    title.innerText = filename || 'عرض المرفق';
    info.innerText = `Type: ${type}`;

    // Render Content
    body.innerHTML = '';

    if (type.includes('pdf')) {
        // Convert Base64 to Blob for better PDF support
        try {
            // Check if data is a Data URI
            let base64Part = data;
            if (data.includes(',')) {
                base64Part = data.split(',')[1];
            }

            const binaryString = window.atob(base64Part);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(blob);

            // Setup Download with Blob
            downloadBtn.href = blobUrl;
            downloadBtn.download = `${filename || 'attachment'}.pdf`;

            // Use object tag for better PDF reliability
            const objectTag = document.createElement('object');
            objectTag.data = blobUrl;
            objectTag.type = "application/pdf";
            objectTag.className = "w-full h-full border-0 rounded-lg";

            // Fallback text
            objectTag.innerHTML = `<p>لا يمكن عرض ملف PDF. <a href="${blobUrl}" download="${filename || 'attachment'}.pdf" class="text-blue-500 underline">اضغط هنا للتحميل</a></p>`;

            body.appendChild(objectTag);

        } catch (e) {
            console.error("PDF Blob Error", e);
            // Fallback to data URI
            // Fallback to data URI with object tag
            const objectTag = document.createElement('object');
            objectTag.data = data;
            objectTag.type = "application/pdf";
            objectTag.className = "w-full h-full border-0 rounded-lg";
            objectTag.innerHTML = `<p>لا يمكن عرض ملف PDF. <a href="${data}" download="${filename || 'attachment'}.pdf" class="text-blue-500 underline">اضغط هنا للتحميل</a></p>`;
            body.appendChild(objectTag);
            downloadBtn.href = data;
            downloadBtn.download = `${filename || 'attachment'}.pdf`;
        }
    } else {
        // For Image
        const img = document.createElement('img');
        img.src = data;
        img.className = "max-w-full max-h-full object-contain rounded-lg shadow-sm";
        body.appendChild(img);

        downloadBtn.href = data;
        downloadBtn.download = `${filename || 'attachment'}.jpg`;
    }

    modal.classList.remove('hidden');
}

function closeAttachmentViewer() {
    document.getElementById('attachment-viewer-modal').classList.add('hidden');
    document.getElementById('viewer-body').innerHTML = ''; // Clear memory
}



// --- 3. Expenses & Proofs Logic ---









async function archiveOrder(id) {
    const idx = orders.findIndex(o => o.id == id);
    if (idx === -1) return;

    if (!confirm('هل أنت متأكد من أرشفة هذا الطلب؟')) return;

    const order = orders[idx];

    // Add to archive — always use the SaddahDB reference directly
    if (!window.SaddahDB.data.archive) window.SaddahDB.data.archive = [];
    window.SaddahDB.data.archive.push(order);

    // Remove from active orders (splice keeps the reference intact)
    orders.splice(idx, 1);
    saveOrders(); // one save covers both archive and orders

    renderOrders();
    alert('تم أرشفة الطلب بنجاح');
}


// --- Core Functions ---

function setFilter(filter) {
    currentFilter = filter;
    ['all', 'confirmed', 'completed'].forEach(f => {
        const btn = document.getElementById(`btn-${f}`);
        if (f === filter) {
            btn.className = "flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition bg-slate-800 text-white shadow";
        } else {
            btn.className = "flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 transition";
        }
    });
    renderOrders();
}

function formatCurrency(num) {
    return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function printReport() {
    const printArea = document.getElementById('print-area');
    const now = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Calculate Totals
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalProfit = 0;
    let count = 0;

    const rows = orders.map((o, idx) => {
        count++;
        const total = parseFloat(o.financials.total) || 0;
        const expenses = (o.expenses || []).reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
        const profit = total - expenses;

        totalIncome += total;
        totalExpenses += expenses;
        totalProfit += profit;

        return `
            <tr class="border-b border-slate-100 text-xs">
                <td class="py-3 px-2 font-bold text-slate-700">#${o.id}</td>
                <td class="py-3 px-2 text-slate-600">${new Date(o.id).toLocaleDateString('en-GB')}</td>
                <td class="py-3 px-2 font-bold text-slate-800">${o.client.name}</td>
                <td class="py-3 px-2 text-slate-500">${o.client.type === 'company' ? 'شركة' : 'فرد'}</td>
                <td class="py-3 px-2 font-bold text-purple-600">${formatCurrency(total)}</td>
                <td class="py-3 px-2 text-red-500">${expenses > 0 ? formatCurrency(expenses) : '-'}</td>
                <td class="py-3 px-2 font-bold text-emerald-600">${formatCurrency(profit)}</td>
                <td class="py-3 px-2">
                    <span class="px-2 py-1 rounded-full text-[10px] ${o.isConfirmed ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}">
                        ${o.isConfirmed ? 'موثق' : 'غير موثق'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    printArea.innerHTML = `
        <div class="max-w-4xl mx-auto p-8 font-['Cairo']">
            <!-- Header -->
            <div class="flex justify-between items-end mb-8 border-b-2 border-slate-800 pb-4">
                <div>
                    <h1 class="text-3xl font-black text-slate-800 mb-2">تقرير المبيعات الشامل</h1>
                    <p class="text-slate-500 text-sm">تاريخ التقرير: ${now}</p>
                </div>
                <div class="text-left">
                    <h2 class="text-xl font-bold text-purple-600">صدة Saddah</h2>
                    <p class="text-xs text-slate-400">نظام إدارة التأجير</p>
                </div>
            </div>

            <!-- Summary Cards -->
            <div class="grid grid-cols-4 gap-4 mb-8">
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <p class="text-xs text-slate-500 mb-1">عدد الطلبات</p>
                    <p class="text-xl font-bold text-slate-800">${count}</p>
                </div>
                <div class="bg-purple-50 p-4 rounded-xl border border-purple-100">
                    <p class="text-xs text-purple-500 mb-1">إجمالي المبيعات</p>
                    <p class="text-xl font-bold text-purple-700">${formatCurrency(totalIncome)}</p>
                </div>
                <div class="bg-red-50 p-4 rounded-xl border border-red-100">
                    <p class="text-xs text-red-500 mb-1">إجمالي المصروفات</p>
                    <p class="text-xl font-bold text-red-700">${formatCurrency(totalExpenses)}</p>
                </div>
                <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                    <p class="text-xs text-emerald-500 mb-1">صافي الأرباح</p>
                    <p class="text-xl font-bold text-emerald-700">${formatCurrency(totalProfit)}</p>
                </div>
            </div>

            <!-- Table -->
            <table class="w-full text-right">
                <thead class="bg-slate-800 text-white text-xs">
                    <tr>
                        <th class="py-3 px-2 rounded-r-lg">رقم الطلب</th>
                        <th class="py-3 px-2">التاريخ</th>
                        <th class="py-3 px-2">العميل</th>
                        <th class="py-3 px-2">النوع</th>
                        <th class="py-3 px-2">القيمة</th>
                        <th class="py-3 px-2">المصروفات</th>
                        <th class="py-3 px-2">الربح</th>
                        <th class="py-3 px-2 rounded-l-lg">الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>

            <!-- Footer -->
            <div class="mt-8 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
                تم استخراج هذا التقرير تلقائياً من نظام "صدة" لإدارة التأجير
            </div>
        </div>
    `;

    window.print();
}


function renderOrders() {
    const container = document.getElementById('orders-container');
    const emptyMsg = document.getElementById('empty-msg');
    const search = document.getElementById('search-box').value.toLowerCase();

    container.innerHTML = '';

    // 1. حساب الإحصائيات (شاملة)
    let totalSales = 0;
    let totalCollected = 0;
    let totalSecurityHeld = 0;

    orders.forEach(o => {
        const total = parseFloat(o.financials.total) || 0;
        const deposit = parseFloat(o.financials.deposit) || 0;
        const security = parseFloat(o.financials.securityDeposit) || 0;
        const isCancelled = o.status === 'ملغي' || o.status === 'cancelled';

        // تهيئة كائن الدفع إذا لم يكن موجوداً
        if (!o.paymentStatus) o.paymentStatus = { deposit: deposit > 0, security: false, remaining: false, completed: false, securityReturned: false };
        if (o.paymentStatus.securityReturned === undefined) o.paymentStatus.securityReturned = false;

        // الطلب الملغي: القيمة والمحصّل = المبلغ المحتجز (العربون) فقط، ولا تأمين محتجز
        if (isCancelled) {
            const kept = (o.computed && o.computed.revenue) || deposit || 0;
            totalSales += kept;
            totalCollected += kept;
            return;
        }

        let collected = 0;
        if (o.paymentStatus.remaining) {
            collected = total;
        } else {
            collected = o.paymentStatus.deposit ? deposit : 0;
        }

        // حساب التأمين المحتجز: تم دفعه ولكن لم يرجع
        if (o.paymentStatus.security && !o.paymentStatus.securityReturned) {
            totalSecurityHeld += security;
        }

        totalSales += total;
        totalCollected += collected;
    });

    document.getElementById('stat-count').innerText = orders.length;
    document.getElementById('stat-total').innerText = formatCurrency(totalSales);
    document.getElementById('stat-collected').innerText = formatCurrency(totalCollected);
    document.getElementById('stat-security-held').innerText = formatCurrency(totalSecurityHeld);

    // 2. تصفية البيانات + ترتيب من الأحدث للأقدم (بتاريخ إنشاء الطلب)
    const filteredOrders = orders
        .filter(o => {
            const matchesSearch = (o.client.name && o.client.name.toLowerCase().includes(search)) ||
                (o.date && o.date.includes(search)) ||
                (o.id.toString().includes(search));

            let matchesFilter = true;
            if (currentFilter === 'confirmed') matchesFilter = o.isConfirmed === true;
            if (currentFilter === 'completed') matchesFilter = o.paymentStatus.completed === true;

            return matchesSearch && matchesFilter;
        })
        .sort((a, b) => b.id - a.id); // id = timestamp → الأحدث أولاً

    if (filteredOrders.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    } else {
        emptyMsg.classList.add('hidden');
    }

    // ─── تجميع حسب الشهر ────────────────────────────────────────────────
    const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                       'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

    function getMonthKey(order) {
        // نستخدم تاريخ التسليم إن وُجد وإلا نستخدم وقت إنشاء الطلب
        const d = order.client?.deliveryDate;
        if (d && /^\d{4}-\d{2}/.test(d)) return d.substring(0, 7); // YYYY-MM
        const dt = new Date(order.id);
        return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    }

    const monthMap = new Map();
    filteredOrders.forEach(o => {
        const key = getMonthKey(o);
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key).push(o);
    });

    // أحدث شهر أولاً
    const sortedMonths = Array.from(monthMap.keys()).sort().reverse();

    sortedMonths.forEach(monthKey => {
        const [yr, mn] = monthKey.split('-');
        const monthNum  = parseInt(mn);
        const monthName = MONTHS_AR[monthNum - 1] + ` (${monthNum}) ` + yr;
        const monthOrders = monthMap.get(monthKey);
        const monthTotal  = monthOrders.reduce((s, o) => {
            const cancelled = o.status === 'ملغي' || o.status === 'cancelled';
            const val = cancelled ? ((o.computed && o.computed.revenue) || parseFloat(o.financials?.deposit) || 0)
                                  : (parseFloat(o.financials?.total) || 0);
            return s + val;
        }, 0);

        // رأس الشهر
        container.innerHTML += `
            <div class="flex items-center gap-3 mt-8 mb-4 first:mt-0">
                <div class="h-px flex-1 bg-slate-200"></div>
                <div class="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 text-white text-xs font-bold shrink-0">
                    <i class="fa-regular fa-calendar-days"></i>
                    ${monthName}
                    <span class="bg-white/20 rounded-full px-2 py-0.5 text-[10px]">${monthOrders.length} طلب</span>
                    <span class="bg-emerald-500/30 rounded-full px-2 py-0.5 text-[10px]">${formatCurrency(monthTotal)} ر.س</span>
                </div>
                <div class="h-px flex-1 bg-slate-200"></div>
            </div>`;

    monthOrders.forEach(order => {
        // تهيئة
        if (!order.paymentStatus) {
            order.paymentStatus = {
                deposit: parseFloat(order.financials.deposit) > 0,
                security: false,
                remaining: false,
                completed: false,
                securityReturned: false
            };
        }
        // ضمان وجود خاصية الارجاع
        if (order.paymentStatus.securityReturned === undefined) order.paymentStatus.securityReturned = false;

        const ps = order.paymentStatus;
        const total = parseFloat(order.financials.total) || 0;
        const deposit = parseFloat(order.financials.deposit) || 0;
        const security = parseFloat(order.financials.securityDeposit) || 0;
        const isCancelled = order.status === 'ملغي' || order.status === 'cancelled';

        // قيمة الطلب المعروضة: للطلب الملغي = المبلغ المحتجز (العربون)، وإلا = الإجمالي
        const keptAmount = (order.computed && order.computed.revenue) || deposit || 0;
        const cardValue = isCancelled ? keptAmount : total;
        const displayedPaid = isCancelled ? keptAmount : (ps.remaining ? total : (ps.deposit ? deposit : 0));
        const displayedRemaining = isCancelled ? 0 : (total - displayedPaid);
        const dateObj = new Date(order.id);
        const dateStr = dateObj.toLocaleDateString('en-GB');

        const isConfirmed = order.isConfirmed === true;
        const clientTypeBadge = order.client.type === 'company'
            ? '<span class="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded font-bold border border-blue-100 ml-2">شركة</span>'
            : '';

        // فئات الأزرار
        const btnClass = (active) => active
            ? 'px-3 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 cursor-pointer bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm'
            : 'px-3 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 cursor-pointer bg-white text-slate-400 border-slate-200 hover:bg-slate-50 grayscale opacity-70 hover:opacity-100 hover:grayscale-0 transition-all';

        const returnBtnClass = (active) => active
            ? 'px-3 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 cursor-pointer bg-blue-100 text-blue-700 border-blue-200 shadow-sm'
            : 'px-3 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 cursor-pointer bg-white text-slate-400 border-slate-200 hover:bg-slate-50 grayscale opacity-70 hover:opacity-100 hover:grayscale-0 transition-all';

        const html = `
            <div class="bg-white rounded-2xl border border-slate-200 p-0 hover:shadow-lg transition-all group relative overflow-hidden ${ps.completed ? 'opacity-80 bg-slate-50' : ''}">
                <div class="absolute right-0 top-0 bottom-0 w-1.5 ${ps.completed ? 'bg-slate-400' : (isConfirmed ? 'bg-emerald-500' : 'bg-orange-300')}"></div>
                
                <div class="flex flex-col lg:flex-row">
                    <!-- بيانات العميل -->
                    <div class="p-5 flex items-start gap-4 flex-grow border-b lg:border-b-0 lg:border-l border-slate-100 min-w-[28%]">
                        <div class="bg-slate-50 w-12 h-12 rounded-2xl flex items-center justify-center text-slate-500 font-bold text-lg border border-slate-100 shrink-0 shadow-sm">
                            ${order.client.name.charAt(0)}
                        </div>
                        <div>
                            <div class="flex items-center flex-wrap gap-y-1 mb-1">
                                <h3 class="font-black text-lg text-slate-800 ml-2 ${(ps.completed || isCancelled) ? 'line-through text-slate-400' : ''}">${order.client.name}</h3>
                                ${clientTypeBadge}
                                ${ps.completed && !isCancelled ? '<span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">مكتمل</span>' : ''}
                                ${isCancelled ? '<span class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold border border-red-200">ملغي — محتجز العربون</span>' : ''}
                            </div>
                            <div class="text-xs text-slate-400 font-medium flex flex-wrap gap-3 items-center">
                                <span class="flex items-center gap-1"><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
                                <span class="font-mono text-slate-300">#${order.id.toString().slice(-4)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- البيانات المالية -->
                    <div class="p-4 flex items-center gap-4 flex-grow bg-slate-50/50 justify-between lg:justify-start border-b lg:border-b-0 lg:border-l border-slate-100">
                        <div class="text-center px-3">
                            <p class="text-[10px] text-slate-400 font-bold uppercase mb-1">القيمة</p>
                            <p class="text-sm font-black text-slate-700">${cardValue.toFixed(0)}</p>
                        </div>
                        <div class="w-px h-8 bg-slate-200"></div>
                        <div class="text-center px-3">
                            <p class="text-[10px] text-slate-400 font-bold uppercase mb-1">المدفوع</p>
                            <p class="text-sm font-bold text-emerald-600">${displayedPaid.toFixed(0)}</p>
                        </div>
                        <div class="w-px h-8 bg-slate-200"></div>
                        <div class="text-center px-3 relative">
                            <p class="text-[10px] text-slate-400 font-bold uppercase mb-1">المتبقي</p>
                            <p class="text-sm font-black ${displayedRemaining > 0 ? 'text-red-500' : 'text-slate-400'}">${displayedRemaining.toFixed(0)}</p>
                            ${displayedRemaining > 0 && !ps.completed ? '<div class="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>' : ''}
                        </div>
                        <button onclick="printOrder(${order.id}, 'invoice')" class="btn-icon bg-white text-emerald-600 border border-slate-200 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-emerald-50 border-emerald-100" title="طباعة الفاتورة">
                            <i class="fa-solid fa-print text-xs"></i>
                        </button>
                        <button onclick="printOrder(${order.id}, 'contract')" class="btn-icon bg-white text-indigo-600 border border-slate-200 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-indigo-50 border-indigo-100" title="طباعة العقد">
                            <i class="fa-solid fa-file-contract text-xs"></i>
                        </button>
                        ${order.contractUrl ? `<a href="${order.contractUrl}" target="_blank" class="btn-icon bg-white text-blue-500 border border-slate-200 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-blue-50" title="فتح رابط العقد (Drive)"><i class="fa-brands fa-google-drive text-xs"></i></a>` : ''}
                        <button onclick="editOrder(${order.id})" class="btn-icon text-slate-400 hover:text-orange-500 w-8 h-8 flex items-center justify-center transition" title="تعديل"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="window.OrdersActions.deleteOrder(${order.id})" class="btn-icon text-slate-300 hover:text-red-500 w-8 h-8 flex items-center justify-center transition" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                
                <!-- شريط حالة السداد والتنفيذ -->
                <div class="bg-slate-50 px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
                    <span class="text-[10px] font-bold text-slate-400 ml-2">حالة السداد:</span>
                    
                    <button onclick="window.OrdersActions.togglePayment(${order.id}, 'deposit')" class="${btnClass(ps.deposit)}">
                        <i class="fa-solid fa-check-circle"></i> العربون
                    </button>
                    
                    ${security > 0 ? `
                    <button onclick="window.OrdersActions.togglePayment(${order.id}, 'security')" class="${btnClass(ps.security)}">
                        <i class="fa-solid fa-shield"></i> دفع التأمين
                    </button>` : ''}
                    
                    <button onclick="window.OrdersActions.togglePayment(${order.id}, 'remaining')" class="${btnClass(ps.remaining)}">
                        <i class="fa-solid fa-money-bill-wave"></i> سداد كامل
                    </button>

                    <!-- زر إرجاع التأمين (يظهر فقط إذا كان هناك تأمين وتم دفعه) -->
                    ${security > 0 && ps.security ? `
                    <div class="w-px h-4 bg-slate-300 mx-1"></div>
                    <button onclick="window.OrdersActions.togglePayment(${order.id}, 'securityReturned')" class="${returnBtnClass(ps.securityReturned)}">
                        <i class="fa-solid fa-arrow-rotate-left"></i> إرجاع التأمين
                    </button>` : ''}
                    
                    <div class="flex-grow"></div>
                    
                    <button onclick="window.OrdersActions.togglePayment(${order.id}, 'completed')" class="${ps.completed ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 border border-slate-200'} px-4 py-1 rounded-lg text-[10px] font-bold flex items-center gap-2 hover:shadow-md transition">
                        <i class="fa-solid fa-flag-checkered"></i> اكتمال
                    </button>
                    
                    <button onclick="window.OrdersActions.toggleConfirmation(${order.id})" class="${isConfirmed ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-slate-400 bg-white border-slate-200'} border px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition" title="توثيق العقد">
                        ${isConfirmed ? '<i class="fa-solid fa-check"></i> موثق' : 'غير موثق'}
                    </button>

                    <button onclick="window.OrdersActions.toggleTaxInclusion(${order.id})" class="${order.financials.includeTaxInProfit ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-slate-400 bg-white border-slate-200'} border px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition" title="احتساب الضريبة مع الربح">
                        <i class="fa-solid fa-percent"></i> ${order.financials.includeTaxInProfit ? 'شامل الضريبة' : 'غير شامل'}
                    </button>
                </div>
            </div>
        `;
        container.innerHTML += html;
    }); // نهاية monthOrders.forEach
    }); // نهاية sortedMonths.forEach
}

function togglePayment(id, key) {
    const index = orders.findIndex(o => o.id == id);
    if (index !== -1) {
        if (!orders[index].paymentStatus) {
            orders[index].paymentStatus = { deposit: false, security: false, remaining: false, completed: false, securityReturned: false };
        }

        // عكس الحالة
        orders[index].paymentStatus[key] = !orders[index].paymentStatus[key];

        // منطق ذكي
        if (key === 'remaining' && orders[index].paymentStatus.remaining) {
            orders[index].paymentStatus.deposit = true; // إذا سدد كامل فالعربون مدفوع
        }

        // إذا ألغى دفع التأمين، نلغي إرجاعه تلقائياً
        if (key === 'security' && !orders[index].paymentStatus.security) {
            orders[index].paymentStatus.securityReturned = false;
        }

        
        saveOrders();
        

        renderOrders();
    }
}





function printOrder(id, type) {
    const order = orders.find(o => o.id == id);
    if (order) {
        localStorage.setItem('current_order', JSON.stringify(order));
        if (type === 'contract') window.open('contract_print.html', '_blank');
        else if (type === 'quotation') window.open('quotation_print.html', '_blank');
        else window.open('invoice_print.html', '_blank');
    }
}



async function editOrder(id) {
    const order = orders.find(o => o.id == id);
    if (!order) return;

    if (confirm('نقل بيانات هذا الطلب إلى الحاسبة للتعديل؟')) {
        let inventory = [];
        try {
            inventory = window.SaddahDB.data.inventory;
        } catch(e) {}
        let newCart = {};

        inventory.forEach(invItem => {
            const foundItem = order.items.find(ordItem => ordItem.name === invItem.name);
            if (foundItem) {
                const hasDecor = foundItem.desc.includes('شامل تنسيق');
                const chairs = foundItem.chairsCount > 0 ? foundItem.chairsCount : '';
                newCart[invItem.id] = {
                    qty: foundItem.qty,
                    chairs: chairs,
                    decor: hasDecor,
                    customDecor: ''
                };
            }
        });

        const editSession = {
            originalId: order.id, // Pass ID to identify update
            expenses: order.expenses || [],
            paymentProofs: order.paymentProofs || [],
            paymentStatus: order.paymentStatus || {},
            isConfirmed: order.isConfirmed || false,
            contractUrl: order.contractUrl || '', // Pass Drive Link
            client: order.client,
            cart: newCart,
            financials: {
                deposit: order.financials.deposit,
                securityDeposit: order.financials.securityDeposit,
                vatRate: order.financials.vatRate,
                delivery: order.financials.delivery
            }
        };
        localStorage.setItem('sadda_edit_session', JSON.stringify(editSession));
        window.location.href = 'calculator.html';
    }
}

function exportData() {
    const allData = window.SaddahDB.data;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allData));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `sadda_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// Alias — called from HTML buttons
function exportJSON() { exportData(); }

function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data.orders) { alert('ملف غير صالح'); return; }
                if (!confirm(`استيراد ${data.orders.length} طلب؟ سيحل محل البيانات الحالية.`)) return;
                orders = data.orders;
                window.SaddahDB.data = data;
                window.SaddahDB.save();
                renderOrders();
                alert('تم الاستيراد بنجاح ✓');
            } catch(err) {
                alert('خطأ في قراءة الملف');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function clearData() {
    if (!confirm('حذف جميع البيانات نهائياً؟ لا يمكن التراجع.')) return;
    orders = [];
    window.SaddahDB.data.orders = [];
    window.SaddahDB.save();
    renderOrders();
}

renderOrders();



// Expose to window
window.switchTab = typeof switchTab !== 'undefined' ? switchTab : window.switchTab;
window.openFinancialModal = typeof openFinancialModal !== 'undefined' ? openFinancialModal : window.openFinancialModal;
window.closeFinancialModal = typeof closeFinancialModal !== 'undefined' ? closeFinancialModal : window.closeFinancialModal;
window.switchFinTab = typeof switchFinTab !== 'undefined' ? switchFinTab : window.switchFinTab;
window.renderFinancialModal = typeof renderFinancialModal !== 'undefined' ? renderFinancialModal : window.renderFinancialModal;
window.togglePaymentStatus = typeof togglePaymentStatus !== 'undefined' ? togglePaymentStatus : window.togglePaymentStatus;
window.saveContractUrl = typeof saveContractUrl !== 'undefined' ? saveContractUrl : window.saveContractUrl;
window.toggleSecurityReturned = typeof toggleSecurityReturned !== 'undefined' ? toggleSecurityReturned : window.toggleSecurityReturned;
window.renderPaymentStatusUI = typeof renderPaymentStatusUI !== 'undefined' ? renderPaymentStatusUI : window.renderPaymentStatusUI;

window.openAttachmentViewer = typeof openAttachmentViewer !== 'undefined' ? openAttachmentViewer : window.openAttachmentViewer;
window.closeAttachmentViewer = typeof closeAttachmentViewer !== 'undefined' ? closeAttachmentViewer : window.closeAttachmentViewer;
window.deleteExpense = typeof deleteExpense !== 'undefined' ? deleteExpense : window.deleteExpense;
window.addExpense = typeof addExpense !== 'undefined' ? addExpense : window.addExpense;
window.handleProofUrl = typeof handleProofUrl !== 'undefined' ? handleProofUrl : window.handleProofUrl;
window.handleProofUpload = typeof handleProofUpload !== 'undefined' ? handleProofUpload : window.handleProofUpload;
window.deleteProof = typeof deleteProof !== 'undefined' ? deleteProof : window.deleteProof;
window.setFilter = typeof setFilter !== 'undefined' ? setFilter : window.setFilter;
window.formatCurrency = typeof formatCurrency !== 'undefined' ? formatCurrency : window.formatCurrency;
window.printReport = typeof printReport !== 'undefined' ? printReport : window.printReport;
window.renderOrders = typeof renderOrders !== 'undefined' ? renderOrders : window.renderOrders;
window.togglePayment = typeof togglePayment !== 'undefined' ? togglePayment : window.togglePayment;
window.toggleConfirmation = typeof toggleConfirmation !== 'undefined' ? toggleConfirmation : window.toggleConfirmation;
window.toggleTaxInclusion = typeof toggleTaxInclusion !== 'undefined' ? toggleTaxInclusion : window.toggleTaxInclusion;
window.printOrder = typeof printOrder !== 'undefined' ? printOrder : window.printOrder;
window.deleteOrder = typeof deleteOrder !== 'undefined' ? deleteOrder : window.deleteOrder;
window.editOrder = typeof editOrder !== 'undefined' ? editOrder : window.editOrder;
window.exportData    = exportData;
window.exportJSON    = exportJSON;
window.importJSON    = importJSON;
window.clearData     = clearData;
window.archiveOrder  = archiveOrder;


// Expose functions and vars for actions module
window.orders = orders;
window.saveOrders = saveOrders;
window.persistOrder = persistOrder;
window.renderOrders = renderOrders;
window.renderFinancialModal = renderFinancialModal;
window.closeFinancialModal = closeFinancialModal;
window.renderPaymentStatusUI = renderPaymentStatusUI;
window.activeOrderId = null;

// Monkey-patch activeOrderId so module can read it dynamically
Object.defineProperty(window, 'activeOrderId', {
    get: function() { return activeOrderId; },
    set: function(val) { activeOrderId = val; }
});
