async function saveDocumentToOrderFS(order, file, fileNameToSave, subFolderName) {
    if (file && typeof window.compressImageFile === 'function') file = await window.compressImageFile(file);
    try {
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return false;
        
        let monthNum = new Date().getMonth() + 1;
        let yearNum = new Date().getFullYear();
        if (order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0];
            monthNum = parseInt(parts[1]);
        }
        
        const yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`);
        const monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`);
        const requestsDir = await monthDir.getDirectoryHandle('الطلبات');
        
        let unauditedDir, auditedDir;
        try { unauditedDir = await requestsDir.getDirectoryHandle('لم يتم الجرد'); } catch(e) {}
        try { auditedDir = await requestsDir.getDirectoryHandle('تم الجرد'); } catch(e) {}
        
        const [newName, oldName] = getOrderFolderNames(order);
        let folderName = newName;
        
        let orderDir = null;
        if (unauditedDir) {
            try { orderDir = await unauditedDir.getDirectoryHandle(newName); } catch(e) {}
            if (!orderDir) {
                try { orderDir = await unauditedDir.getDirectoryHandle(oldName); folderName = oldName; } catch(e) {}
            }
        }
        if (!orderDir && auditedDir) {
            try { orderDir = await auditedDir.getDirectoryHandle(newName); folderName = newName; } catch(e) {}
            if (!orderDir) {
                try { orderDir = await auditedDir.getDirectoryHandle(oldName); folderName = oldName; } catch(e) {}
            }
        }

        if (!orderDir) {
            if (!unauditedDir) {
                unauditedDir = await requestsDir.getDirectoryHandle('لم يتم الجرد', {create: true});
            }
            orderDir = await unauditedDir.getDirectoryHandle(newName, {create: true});
        }
        
        if (file && fileNameToSave) {
            let currentDir = orderDir;
            if (subFolderName) {
                const parts = subFolderName.split('/').filter(Boolean);
                for (const p of parts) {
                    currentDir = await currentDir.getDirectoryHandle(p, {create: true});
                }
            }
            const subDir = currentDir;
            const fileHandle = await subDir.getFileHandle(fileNameToSave, {create: true});
            const writable = await fileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
        }
        
        // Update JSON
        const jsonFileHandle = await orderDir.getFileHandle('بيانات_الطلب.json', {create: true});
        const jsonWritable = await jsonFileHandle.createWritable();
        await jsonWritable.write(JSON.stringify(order, null, 4));
        await jsonWritable.close();
        
        // Update Report
        const reportFileHandle = await orderDir.getFileHandle('تقرير_الطلب.txt', {create: true});
        const reportWritable = await reportFileHandle.createWritable();
        await reportWritable.write(generateReportTextFS(order));
        await reportWritable.close();
        
        return true;
    } catch(e) {
        console.error("FS Error:", e);
        return false;
    }
}

// حذف ملف واحد من مجلد فرعي داخل مجلد الطلب (مثل: مصروف بالغلط)
async function deleteDocumentFromOrderFS(order, fileName, subFolderName) {
    try {
        if (!fileName || !subFolderName) return false;
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return false;

        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }

        let yearDir, monthDir, requestsDir;
        try { yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`); } catch(e) { return false; }
        try { monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`); } catch(e) { return false; }
        try { requestsDir = await monthDir.getDirectoryHandle('الطلبات'); } catch(e) { return false; }

        const [newName, oldName] = getOrderFolderNames(order);
        let orderDir = null;
        for (const status of ['لم يتم الجرد', 'تم الجرد']) {
            let statusDir;
            try { statusDir = await requestsDir.getDirectoryHandle(status); } catch(e) { continue; }
            for (const fn of [newName, oldName]) {
                try { orderDir = await statusDir.getDirectoryHandle(fn); break; } catch(e) {}
            }
            if (orderDir) break;
        }
        if (!orderDir) return false;

        let currentDir = orderDir;
        if (subFolderName) {
            const parts = subFolderName.split('/').filter(Boolean);
            for (const p of parts) {
                try { currentDir = await currentDir.getDirectoryHandle(p); } catch(e) { return false; }
            }
        }
        let subDir = currentDir;
        try { await subDir.removeEntry(fileName, { recursive: true }); return true; } catch(e) { return false; }
    } catch(e) {
        console.error("FS file delete error:", e);
        return false;
    }
}

// إنشاء مجلد داخل مجلد فرعي للطلب (عند إضافة مصروف بدون إيصال)
async function createFolderInOrderFS(order, newFolderName, subFolderName) {
    try {
        if (!newFolderName || !subFolderName) return false;
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return false;

        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }

        let yearDir, monthDir, requestsDir;
        try { yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`); } catch(e) { return false; }
        try { monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`); } catch(e) { return false; }
        try { requestsDir = await monthDir.getDirectoryHandle('الطلبات'); } catch(e) { return false; }

        const [newName, oldName] = getOrderFolderNames(order);
        let orderDir = null;
        for (const status of ['لم يتم الجرد', 'تم الجرد']) {
            let statusDir;
            try { statusDir = await requestsDir.getDirectoryHandle(status); } catch(e) { continue; }
            for (const fn of [newName, oldName]) {
                try { orderDir = await statusDir.getDirectoryHandle(fn); break; } catch(e) {}
            }
            if (orderDir) break;
        }
        if (!orderDir) return false;

        let currentDir = orderDir;
        if (subFolderName) {
            const parts = subFolderName.split('/').filter(Boolean);
            for (const p of parts) {
                currentDir = await currentDir.getDirectoryHandle(p, { create: true });
            }
        }
        const subDir = currentDir;
        await subDir.getDirectoryHandle(newFolderName, { create: true });
        return true;
    } catch(e) {
        console.error("FS folder create error:", e);
        return false;
    }
}

// إعادة تسمية/نقل مجلد مصروف (مستخدم عند إرجاع مصروف وتغيير الصافي)
async function renameExpenseFolderInOrderFS(order, oldFolderName, newFolderName) {
    try {
        if (!oldFolderName || !newFolderName || oldFolderName === newFolderName) return false;
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return false;

        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }

        let yearDir, monthDir, requestsDir;
        try { yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`); } catch(e) { return false; }
        try { monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`); } catch(e) { return false; }
        try { requestsDir = await monthDir.getDirectoryHandle('الطلبات'); } catch(e) { return false; }

        const [newName, oldName] = getOrderFolderNames(order);
        let orderDir = null;
        for (const status of ['لم يتم الجرد', 'تم الجرد']) {
            let statusDir;
            try { statusDir = await requestsDir.getDirectoryHandle(status); } catch(e) { continue; }
            for (const fn of [newName, oldName]) {
                try { orderDir = await statusDir.getDirectoryHandle(fn); break; } catch(e) {}
            }
            if (orderDir) break;
        }
        if (!orderDir) return false;

        let expDir;
        try { expDir = await orderDir.getDirectoryHandle('المصروفات'); } catch(e) { return false; }
        
        let oldFolder;
        try { oldFolder = await expDir.getDirectoryHandle(oldFolderName); } catch(e) { return false; }
        
        let newFolder = await expDir.getDirectoryHandle(newFolderName, { create: true });
        
        for await (const entry of oldFolder.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                const newFileHandle = await newFolder.getFileHandle(entry.name, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(await file.arrayBuffer());
                await writable.close();
            }
        }
        
        try { await expDir.removeEntry(oldFolderName, { recursive: true }); } catch(e) {}
        
        return true;
    } catch(e) {
        console.error("FS expense folder rename error:", e);
        return false;
    }
}

// نقل فاتورة مصروف مفردة إلى مجلد (يستخدم عندما لم يكن للمصروف مجلد من قبل وتم عمل مرتجع عليه)
async function moveStandaloneExpenseFileToFolder(order, fileName, newFolderName) {
    try {
        if (!fileName || !newFolderName) return false;
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return false;

        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }

        let yearDir, monthDir, requestsDir;
        try { yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`); } catch(e) { return false; }
        try { monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`); } catch(e) { return false; }
        try { requestsDir = await monthDir.getDirectoryHandle('الطلبات'); } catch(e) { return false; }

        const [newName, oldName] = getOrderFolderNames(order);
        let orderDir = null;
        for (const status of ['لم يتم الجرد', 'تم الجرد']) {
            let statusDir;
            try { statusDir = await requestsDir.getDirectoryHandle(status); } catch(e) { continue; }
            for (const fn of [newName, oldName]) {
                try { orderDir = await statusDir.getDirectoryHandle(fn); break; } catch(e) {}
            }
            if (orderDir) break;
        }
        if (!orderDir) return false;

        let expDir;
        try { expDir = await orderDir.getDirectoryHandle('المصروفات'); } catch(e) { return false; }
        
        let fileHandle;
        try { fileHandle = await expDir.getFileHandle(fileName); } catch(e) { return false; }
        
        let newFolder = await expDir.getDirectoryHandle(newFolderName, { create: true });
        
        const file = await fileHandle.getFile();
        const newFileHandle = await newFolder.getFileHandle(file.name, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
        
        try { await expDir.removeEntry(fileName); } catch(e) {}
        
        return true;
    } catch(e) {
        console.error("FS standalone file move error:", e);
        return false;
    }
}

// إخراج فاتورة مصروف من المجلد الخاص بها وإعادتها للمصروفات العامة (تُستخدم عند حذف آخر مرتجع للمصروف)
async function moveExpenseFileOutOfFolder(order, folderName, originalFileName) {
    try {
        if (!folderName || !originalFileName) return false;
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return false;

        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }

        let yearDir, monthDir, requestsDir;
        try { yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`); } catch(e) { return false; }
        try { monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`); } catch(e) { return false; }
        try { requestsDir = await monthDir.getDirectoryHandle('الطلبات'); } catch(e) { return false; }

        const [newName, oldName] = getOrderFolderNames(order);
        let orderDir = null;
        for (const status of ['لم يتم الجرد', 'تم الجرد']) {
            let statusDir;
            try { statusDir = await requestsDir.getDirectoryHandle(status); } catch(e) { continue; }
            for (const fn of [newName, oldName]) {
                try { orderDir = await statusDir.getDirectoryHandle(fn); break; } catch(e) {}
            }
            if (orderDir) break;
        }
        if (!orderDir) return false;

        let expDir;
        try { expDir = await orderDir.getDirectoryHandle('المصروفات'); } catch(e) { return false; }
        
        let oldFolder;
        try { oldFolder = await expDir.getDirectoryHandle(folderName); } catch(e) { return false; }
        
        let fileHandle;
        try { fileHandle = await oldFolder.getFileHandle(originalFileName); } catch(e) { return false; }
        
        // Copy file to main expenses folder
        const file = await fileHandle.getFile();
        const newFileHandle = await expDir.getFileHandle(file.name, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
        
        // Remove the whole folder
        try { await expDir.removeEntry(folderName, { recursive: true }); } catch(e) {}
        
        return true;
    } catch(e) {
        console.error("FS file extract error:", e);
        return false;
    }
}

// إعادة تسمية ملÙ  داخل مجلد Ù رعي (عند تغيير اسم/مبلغ المصروÙ  بدون رÙ ع ملÙ  جديد)
async function renameDocumentInOrderFS(order, oldName, newName, subFolderName) {
    try {
        if (!oldName || !newName || oldName === newName) return false;
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return false;

        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }
        let yearDir, monthDir, requestsDir;
        try { yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`); } catch(e) { return false; }
        try { monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`); } catch(e) { return false; }
        try { requestsDir = await monthDir.getDirectoryHandle('الطلبات'); } catch(e) { return false; }

        const [newF, oldF] = getOrderFolderNames(order);
        let orderDir = null;
        for (const status of ['لم يتم الجرد', 'تم الجرد']) {
            let statusDir;
            try { statusDir = await requestsDir.getDirectoryHandle(status); } catch(e) { continue; }
            for (const fn of [newF, oldF]) {
                try { orderDir = await statusDir.getDirectoryHandle(fn); break; } catch(e) {}
            }
            if (orderDir) break;
        }
        if (!orderDir) return false;

        let currentDir = orderDir;
        if (subFolderName) {
            const parts = subFolderName.split('/').filter(Boolean);
            for (const p of parts) {
                try { currentDir = await currentDir.getDirectoryHandle(p); } catch(e) { return false; }
            }
        }
        let subDir = currentDir;

        let oldHandle;
        let isDir = false;
        try { 
            oldHandle = await subDir.getFileHandle(oldName); 
        } catch(e) { 
            try {
                oldHandle = await subDir.getDirectoryHandle(oldName);
                isDir = true;
            } catch(err2) {
                return false; 
            }
        }

        if (isDir) {
            // مجرد إنشاء مجلد جديد وإزالة القديم (يفترض أنه فارغ، وإذا لم يكن قد يفشل الحذف أو يمكننا حذفه recursively)
            await subDir.getDirectoryHandle(newName, { create: true });
            // نحاول نسخ محتوياته إذا لزم، ولكن للتبسيط نكتفي بالحذف
            try { await subDir.removeEntry(oldName, { recursive: true }); } catch(err) {}
            return true;
        } else {
            const buf = await (await oldHandle.getFile()).arrayBuffer();
            const newHandle = await subDir.getFileHandle(newName, { create: true });
            const w = await newHandle.createWritable();
            await w.write(buf);
            await w.close();
            await subDir.removeEntry(oldName);
            return true;
        }
    } catch(e) {
        console.error("FS rename error:", e);
        return false;
    }
}

// كتابة علامة الإلغاء داخل مجلد الطلب + تحديث بيانات الطلب
async function writeCancelMarker(dirHandle, order) {
    try {
        const kept = (order.computed && order.computed.revenue) || parseFloat(order.financials?.deposit) || 0;
        const txt =
`🚫🚫🚫   طــلــب مــلــغــي   🚫🚫🚫
============================================

العميل: ${order.client?.name || ''}
رقم الطلب: ${order.id}
المبلغ المحتجز (العربون): ${kept} ريال
تاريخ الإلغاء: ${new Date().toLocaleDateString('ar-EG')}

ألغى العميل الطلب — تم حجز العربون واعتباره إيراد الطلب.
============================================`;
        const h = await dirHandle.getFileHandle('🚫 ملغي - اقرأني.txt', { create: true });
        const w = await h.createWritable(); await w.write(txt); await w.close();

        const jh = await dirHandle.getFileHandle('بيانات_الطلب.json', { create: true });
        const jw = await jh.createWritable(); await jw.write(JSON.stringify(order, null, 4)); await jw.close();
    } catch(e) { console.error('cancel marker error:', e); }
}

// قراءة رقم الطلب (id) من ملف بيانات_الطلب.json داخل مجلد
async function readFolderOrderId(folderHandle) {
    try {
        const fh = await folderHandle.getFileHandle('بيانات_الطلب.json');
        const f = await fh.getFile();
        const data = JSON.parse(await f.text());
        return (data && data.id != null) ? data.id : null;
    } catch(e) { return null; }
}

// البحث عن مجلد الطلب برقمه داخل "الطلبات" (في حالتي الجرد) — مطابقة مضمونة بالرقم لا بالاسم
async function findOrderFolderInRequests(requestsDir, orderId) {
    for (const status of ['لم يتم الجرد', 'تم الجرد']) {
        let sd; try { sd = await requestsDir.getDirectoryHandle(status); } catch(e) { continue; }
        for await (const [name, handle] of sd.entries()) {
            if (handle.kind !== 'directory') continue;
            const fid = await readFolderOrderId(handle);
            if (fid != null && String(fid) === String(orderId)) {
                return { statusDir: sd, folderHandle: handle, folderName: name };
            }
        }
    }
    return null;
}

// تطبيق الإلغاء على مجلد الطلب: إعادة تسميته ليبدأ بـ"ملغي" + إضافة ملف تنبيه
// تُرجع كائناً { ok, reason, from, to } لإظهار سبب الفشل بدل الصمت
async function applyCancellationToFolderFS(order) {
    try {
        if (typeof copyDirectory !== 'function') return { ok:false, reason:'دالة النسخ (copyDirectory) غير محمّلة' };
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return { ok:false, reason:'لم يتم منح صلاحية الوصول لمجلد النظام' };

        // الاسم الملغي (status = ملغي) → getOrderFolderNames يُرجع [اسم الملغي, الاسم العادي]
        const [cancelledName] = getOrderFolderNames(order);

        // المسار السريع: الشهر/السنة حسب تاريخ التسليم
        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }

        let found = null;
        try {
            const yd = await rootDir.getDirectoryHandle(`سنة ${yearNum}`);
            const md = await yd.getDirectoryHandle(`شهر ${monthNum}`);
            const rd = await md.getDirectoryHandle('الطلبات');
            found = await findOrderFolderInRequests(rd, order.id);
        } catch(e) {}

        // إن لم يُعثر عليه في الشهر المتوقع، افحص كل السنوات/الأشهر (احتياطاً)
        if (!found) {
            for await (const [yName, yHandle] of rootDir.entries()) {
                if (yHandle.kind !== 'directory' || yName.indexOf('سنة') !== 0) continue;
                for await (const [mName, mHandle] of yHandle.entries()) {
                    if (mHandle.kind !== 'directory' || mName.indexOf('شهر') !== 0) continue;
                    let rd; try { rd = await mHandle.getDirectoryHandle('الطلبات'); } catch(e){ continue; }
                    found = await findOrderFolderInRequests(rd, order.id);
                    if (found) break;
                }
                if (found) break;
            }
        }

        if (!found) return { ok:false, reason:'لم يُعثر على مجلد لهذا الطلب على القرص (ربما لم يُنشأ له مجلد بعد)' };

        // إذا كان المجلد بالفعل بالاسم الملغي → فقط حدّث العلامة
        if (found.folderName === cancelledName) {
            await writeCancelMarker(found.folderHandle, order);
            return { ok:true, from: found.folderName, to: cancelledName, renamed:false };
        }

        // أنشئ مجلداً بالاسم الملغي، انسخ المحتويات، اكتب العلامة، ثم احذف القديم
        const destDir = await found.statusDir.getDirectoryHandle(cancelledName, { create: true });
        await copyDirectory(found.folderHandle, destDir);
        await writeCancelMarker(destDir, order);
        try { await found.statusDir.removeEntry(found.folderName, { recursive: true }); } catch(e) {}
        return { ok:true, from: found.folderName, to: cancelledName, renamed:true };
    } catch(e) {
        console.error('apply cancellation to folder error:', e);
        return { ok:false, reason: (e && e.message) || String(e) };
    }
}

// نقل مجلد الطلب من "لم يتم الجرد" إلى "تم الجرد" (نسخ كامل المحتويات ثم حذف الأصل)
// لا يحذف أي بيانات — مجرد إعادة تموضع المجلد. تُرجع { ok, reason, moved, folder }
async function moveOrderToAuditedFS(order) {
    try {
        if (typeof copyDirectory !== 'function') return { ok:false, reason:'دالة النسخ (copyDirectory) غير محمّلة' };
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return { ok:false, reason:'لم يتم منح صلاحية الوصول لمجلد النظام' };

        // المسار المتوقع حسب تاريخ التسليم
        let monthNum = new Date().getMonth() + 1, yearNum = new Date().getFullYear();
        if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
            const parts = order.client.deliveryDate.split('-');
            yearNum = parts[0]; monthNum = parseInt(parts[1]);
        }

        // إيجاد "الطلبات" + موقع مجلد الطلب (بحث بالرقم لضمان المطابقة بصرف النظر عن الاسم)
        let requestsDir = null, found = null;
        try {
            const yd = await rootDir.getDirectoryHandle(`سنة ${yearNum}`);
            const md = await yd.getDirectoryHandle(`شهر ${monthNum}`);
            requestsDir = await md.getDirectoryHandle('الطلبات');
            found = await findOrderFolderInRequests(requestsDir, order.id);
        } catch(e) {}

        // بحث احتياطي في كل السنوات/الأشهر
        if (!found) {
            for await (const [yName, yHandle] of rootDir.entries()) {
                if (yHandle.kind !== 'directory' || yName.indexOf('سنة') !== 0) continue;
                for await (const [mName, mHandle] of yHandle.entries()) {
                    if (mHandle.kind !== 'directory' || mName.indexOf('شهر') !== 0) continue;
                    let rd; try { rd = await mHandle.getDirectoryHandle('الطلبات'); } catch(e){ continue; }
                    found = await findOrderFolderInRequests(rd, order.id);
                    if (found) { requestsDir = rd; break; }
                }
                if (found) break;
            }
        }

        if (!found) return { ok:false, reason:'لم يُعثر على مجلد لهذا الطلب على القرص (ربما لم يُنشأ له مجلد بعد)' };

        // مجلد "تم الجرد" (يُنشأ إن لم يوجد)
        const auditedDir = await requestsDir.getDirectoryHandle('تم الجرد', { create: true });

        // هل المجلد موجود أصلاً داخل "تم الجرد"؟ (مقارنة مرجعية موثوقة)
        let alreadyAudited = false;
        try { alreadyAudited = await found.statusDir.isSameEntry(auditedDir); } catch(e) {}
        if (alreadyAudited) return { ok:true, moved:false, folder: found.folderName };

        // أنشئ الوجهة بنفس الاسم داخل "تم الجرد"، انسخ كل المحتويات، ثم احذف الأصل
        const destDir = await auditedDir.getDirectoryHandle(found.folderName, { create: true });
        await copyDirectory(found.folderHandle, destDir);
        try { await found.statusDir.removeEntry(found.folderName, { recursive: true }); } catch(e) {}
        return { ok:true, moved:true, folder: found.folderName };
    } catch(e) {
        console.error('move to audited error:', e);
        return { ok:false, reason: (e && e.message) || String(e) };
    }
}

async function deleteOrderFolderFS(order) {
    try {
        const basePath = await findOrderPathAPI(order);
        if (!basePath) return false;
        
        const response = await callFS({ action: 'delete_dir', path: basePath });
        return response && response.success;
    } catch(e) {
        console.error('Error deleting order folder via PHP:', e);
        return false;
    }
}

async function massCreateFoldersFS() {
    try {
        const rootDir = await ensureSystemDirectoryAccess();
        if (!rootDir) return;
        
        // Read the Contract template and JS
        let contractHtmlTemplate = '';
        let contractJsTemplate = '';
        try {
            const htmlHandle = await rootDir.getFileHandle('contract_print.html');
            contractHtmlTemplate = await (await htmlHandle.getFile()).text();
            
            const jsDir = await rootDir.getDirectoryHandle('js');
            const jsHandle = await jsDir.getFileHandle('contract_print.js');
            contractJsTemplate = await (await jsHandle.getFile()).text();
        } catch(e) {
            console.error("Could not read contract template files", e);
        }
        
        let orders = window.SaddahDB.data.orders;
        let count = 0;
        
        for (const order of orders) {
            // Check condition: Confirmed OR Deposit Paid
            if (order.isConfirmed || (order.paymentStatus && order.paymentStatus.deposit)) {
                let monthNum = new Date().getMonth() + 1;
                let yearNum = new Date().getFullYear();
                
                if (order.client && order.client.deliveryDate && order.client.deliveryDate.includes('-')) {
                    const parts = order.client.deliveryDate.split('-');
                    yearNum = parts[0];
                    monthNum = parseInt(parts[1]);
                }
                
                // Recursively create paths
                const yearDir = await rootDir.getDirectoryHandle(`سنة ${yearNum}`, {create: true});
                const monthDir = await yearDir.getDirectoryHandle(`شهر ${monthNum}`, {create: true});
                const requestsDir = await monthDir.getDirectoryHandle('الطلبات', {create: true});
                const unauditedDir = await requestsDir.getDirectoryHandle('لم يتم الجرد', {create: true});
                await requestsDir.getDirectoryHandle('تم الجرد', {create: true});
                
                const [newName, oldName] = getOrderFolderNames(order);
                
                let orderDir = null;
                // Check if it already exists in audited
                try { orderDir = await requestsDir.getDirectoryHandle('تم الجرد').then(d => d.getDirectoryHandle(newName)); } catch(e) {}
                if (!orderDir) {
                    try { orderDir = await requestsDir.getDirectoryHandle('تم الجرد').then(d => d.getDirectoryHandle(oldName)); } catch(e) {}
                }
                
                if (!orderDir) {
                    // check or create in unaudited
                    try { orderDir = await unauditedDir.getDirectoryHandle(oldName); } catch(e) {}
                    if (!orderDir) {
                        orderDir = await unauditedDir.getDirectoryHandle(newName, {create: true});
                    }
                }
                
                // Save JSON Data (بيانات العميل والطلب)
                const jsonFileHandle = await orderDir.getFileHandle('بيانات_الطلب.json', {create: true});
                const jsonWritable = await jsonFileHandle.createWritable();
                await jsonWritable.write(JSON.stringify(order, null, 4));
                await jsonWritable.close();
                
                // Save Text Report (ملف تقرير)
                const txtFileHandle = await orderDir.getFileHandle('تقرير_الطلب.txt', {create: true});
                const txtWritable = await txtFileHandle.createWritable();
                await txtWritable.write(generateReportTextFS(order));
                await txtWritable.close();
                
                // Create Standard Subfolders
                try { await orderDir.getDirectoryHandle('الدفعات', {create: true}); } catch(e){}
                try { await orderDir.getDirectoryHandle('المصروفات', {create: true}); } catch(e){}
                try { await orderDir.getDirectoryHandle('صافي الربح', {create: true}); } catch(e){}
                try { await orderDir.getDirectoryHandle('المرتجعات', {create: true}); } catch(e){}
                
                // Generate Standalone HTML Contract if templates loaded
                if (contractHtmlTemplate && contractJsTemplate) {
                    let injectedJs = contractJsTemplate.replace(
                        "const data = JSON.parse(localStorage.getItem('current_order'));",
                        `const data = ${JSON.stringify(order)};`
                    );
                    
                    let standaloneHtml = contractHtmlTemplate.replace(
                        '<script src="js/contract_print.js"></script>',
                        `<script>${injectedJs}</script>`
                    );
                    
                    // Remove top action buttons - Actually, keep them so user can click print to save as PDF!
                    // standaloneHtml = standaloneHtml.replace(/<div\s+class="no-print[^>]*>.*?<\/div>/s, '');
                    
                    const contractFileHandle = await orderDir.getFileHandle('العقد.html', {create: true});
                    const contractWritable = await contractFileHandle.createWritable();
                    await contractWritable.write(standaloneHtml);
                    await contractWritable.close();
                }
                
                count++;
            }
        }
        alert('تم تهيئة وإنشاء المجلدات بنجاح لعدد ' + count + ' طلب موثق.');
    } catch(e) {
        console.error(e);
        alert('حدث خطأ أثناء الإنشاء. تأكد من إعطاء الصلاحيات.');
    }
}

function generateReportTextFS(orderData) {
    const totalOrder = parseFloat((orderData.financials?.total || '0').replace(' ريال', '')) || 0;
    
    let expensesText = '';
    let totalExpenses = 0;
    
    if (orderData.expenses && orderData.expenses.length > 0) {
        orderData.expenses.forEach(exp => {
            expensesText += `${exp.supplier || exp.name}: ${exp.total || exp.amount} ريال\n`;
            totalExpenses += (exp.total || exp.amount);
        });
    } else {
        expensesText = 'لا توجد مصروفات مسجلة\n';
    }
    
    let paymentsText = '';
    let totalPayments = 0;
    if (orderData.paymentProofs && orderData.paymentProofs.length > 0) {
        orderData.paymentProofs.forEach(pay => {
            paymentsText += `${pay.desc}: ${pay.amount} ريال\n`;
            totalPayments += parseFloat(pay.amount);
        });
    } else {
        paymentsText = 'لا يوجد مدفوعات مسجلة\n';
    }

    const comp = orderData.computed || {};
    const netProfit = comp.netProfit || 0;
    const operatingExpenses = comp.operatingShare || 0;
    const remainingProfit = comp.distributableProfit || 0;
    const groupShare = remainingProfit * 0.30;
    const personShare = groupShare / 2;
    
    const itemsText = (orderData.items || []).map(item => `الوصف: ${item.name} | ${item.desc || ''}`).join('\n');

    return `بيانات العقد والتقرير المالي
    
العميل: ${orderData.client?.name || 'غير محدد'}
التاريخ: ${orderData.date || 'غير محدد'}
تاريخ التسليم: ${orderData.client?.deliveryDate || 'غير محدد'}

مسؤول التوصيل: ${orderData.client?.deliveryPerson || 'غير محدد'}
مسؤول الإرجاع: ${orderData.client?.returnPerson || 'غير محدد'}
-----------------------

تفاصيل الطلب (العقد):
${itemsText}

-----------------------

إجمالي الطلب: ${totalOrder} ريال سعودي
إجمالي المصاريف: ${totalExpenses} ريال سعودي
صافي الربح: ${netProfit} ريال سعودي

-----------------------

${paymentsText}
إجمالي المستلم: ${totalPayments} ريال سعودي

-----------------------

مصروÙ ات التشغيل (10%): ${operatingExpenses} ريال سعودي
الربح المتبقي للتوزيع: ${remainingProfit} ريال سعودي

نصيب المجموعة (30%): ${groupShare} ريال سعودي
نصيب كل Ù رد (علي، محمد): ${personShare} ريال سعودي
`;
}

// --- Cloud File System Helpers ---
async function callFS(payload) {
    const token = document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').getAttribute('content') : '';
    const res = await fetch(window.SaddahBase + '/api/handlers/fs.php', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Network response was not ok');
    return await res.json();
}

async function findOrderPathAPI(orderData) {
    let monthNum = new Date().getMonth() + 1;
    let yearNum = new Date().getFullYear();
    if (orderData.client && orderData.client.deliveryDate && orderData.client.deliveryDate.includes('-')) {
        const parts = orderData.client.deliveryDate.split('-');
        if (parts.length >= 2) {
            yearNum = parts[0];
            monthNum = parseInt(parts[1], 10);
        }
    }
    const yearFolderName = `سنة ${yearNum}`;
    const monthFolderName = `شهر ${monthNum}`;
    
    let folderNames = window.getOrderFolderNamesAPI ? window.getOrderFolderNamesAPI(orderData) : [orderData.folderName || 'بدون اسم'];
    let arabicName = folderNames[0];
    let englishName = folderNames[1] || arabicName;
    
    let statusFolder = 'لم يتم الجرد';
    const db = window.SaddahDB?.data;
    if (db && db.archive && db.archive.find(o => String(o.id) === String(orderData.id))) {
        statusFolder = 'تم الجرد';
    }
    
    const basePathArabic = `${yearFolderName}/${monthFolderName}/الطلبات/${statusFolder}/${arabicName}`;
    const basePathEnglish = `${yearFolderName}/${monthFolderName}/الطلبات/${statusFolder}/${englishName}`;
    
    if (arabicName === englishName) {
        return basePathArabic;
    }
    
    try {
        let res = await callFS({ action: 'check_exists', path: basePathArabic });
        if (res && res.exists) return basePathArabic;
        
        let res2 = await callFS({ action: 'check_exists', path: basePathEnglish });
        if (res2 && res2.exists) return basePathEnglish;
    } catch(e) {}
    
    return basePathArabic; // default to new arabic format
}

async function saveDocumentToOrderFS(order, file, fileName, subFolder) {
    if (file && typeof window.compressImageFile === 'function') file = await window.compressImageFile(file);
    try {
        const basePath = await findOrderPathAPI(order);
        let targetPath = basePath;
        if (subFolder) targetPath += `/${subFolder}`;
        
        if (file) {
            targetPath += `/${fileName}`;
            // Read file as base64
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onload = async () => {
                    const base64 = reader.result.split(',')[1];
                    try {
                        const res = await callFS({ action: 'save_base64', path: targetPath, content: base64 });
                        resolve(res.success);
                    } catch (e) {
                        reject(e);
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        } else if (order) {
            // Save JSON and TXT
            const jsonPath = `${basePath}/بيانات_الطلب.json`;
            await callFS({ action: 'save_text', path: jsonPath, content: JSON.stringify(order, null, 2) });
            
            // If generateReportTextFS is available, save report.txt
            if (typeof generateReportTextFS === 'function') {
                const reportPath = `${basePath}/تقرير_الطلب.txt`;
                await callFS({ action: 'save_text', path: reportPath, content: generateReportTextFS(order) });
            } else if (typeof generateReportText === 'function') {
                const reportPath = `${basePath}/تقرير_الطلب.txt`;
                await callFS({ action: 'save_text', path: reportPath, content: generateReportText(order) });
            }
            return true;
        }
    } catch(e) {
        console.error("FS Error:", e);
        return false;
    }
}

async function deleteDocumentFromOrderFS(order, fileName, subFolder) {
    const basePath = await findOrderPathAPI(order);
    let targetPath = basePath;
    if (subFolder) targetPath += `/${subFolder}`;
    targetPath += `/${fileName}`;
    await callFS({ action: 'delete', path: targetPath });
    return true;
}

async function renameDocumentInOrderFS(order, oldName, newName, subFolder) {
    const basePath = await findOrderPathAPI(order);
    let targetPath = basePath;
    if (subFolder) targetPath += `/${subFolder}`;
    await callFS({ action: 'rename', path: `${targetPath}/${oldName}`, newPath: `${targetPath}/${newName}` });
    return true;
}

async function createFolderInOrderFS(order, folderName, subFolder) {
    const basePath = await findOrderPathAPI(order);
    let targetPath = basePath;
    if (subFolder) targetPath += `/${subFolder}`;
    targetPath += `/${folderName}`;
    await callFS({ action: 'mkdir', path: targetPath });
    return true;
}



window.createInitialOrderFoldersAPI = async function(order) {
    if (typeof findOrderPathAPI !== 'function' || typeof callFS !== 'function') return;
    try {
        const basePath = await findOrderPathAPI(order);
        if (!basePath) return;
        
        const subfolders = ['الدفعات', 'المرتجعات', 'المصروفات', 'صافي الربح'];
        for (let sub of subfolders) {
            await callFS({ action: 'mkdir', path: `${basePath}/${sub}` });
        }
    } catch (e) {
        console.error('Error creating initial folders:', e);
    }
};


