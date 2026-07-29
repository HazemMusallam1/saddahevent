// ============================================================================
// Finance - Claims Module: Actions & Data Mutations
// ============================================================================

window.ClaimsActions = (function () {
    // ── Helper ──
    function safeFsName(s) { return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'بند'; }
    
    function getClaimFolderPath(c) {
        const d = (c && c.date) ? new Date(c.date) : new Date();
        const dateObj = isNaN(d.getTime()) ? new Date() : d;
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth() + 1; // بدون صفر
        
        if (c && c.isCapital) {
            return `مطالبات رأس المال/سنة ${year}/شهر ${month}`;
        } else {
            return `سنة ${year}/شهر ${month}/مطالبات`;
        }
    }
    
    function dataUrlExt(dataUrl, origName) {
        if (origName && origName.includes('.')) return origName.split('.').pop().toLowerCase();
        if (/pdf/i.test(dataUrl)) return 'pdf';
        if (/png/i.test(dataUrl)) return 'png';
        if (/webp/i.test(dataUrl)) return 'webp';
        return 'jpg';
    }

    function fileToDataUrl(file) {
        return new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(null); fr.readAsDataURL(file); });
    }

    // ── Data Mutators ──
    function persistClaims() {
        window.SaddahDB.save();
    }

    function checkPerms() {
        if (!window.SaddahUser || !window.SaddahUser.perms.includes('*')) {
            alert('غير مصرح لك بإجراء هذا التعديل');
            return false;
        }
        return true;
    }

    async function saveClaimPendingInvoice(claim, dataUrl, origName) {
        const b64 = (String(dataUrl || '').split(',')[1]) || '';
        if (!b64 || typeof window.callFS !== 'function') return null;
        const ext = dataUrlExt(dataUrl, origName);
        const amount = parseFloat(claim.amount) || 0;
        const fname = `${safeFsName(claim.employee)} - ${amount} ريال - ${safeFsName(window.getClaimTitle(claim))}.${ext}`;
        const dir = `${getClaimFolderPath(claim)}/فواتير معلّقة`;
        const path = `${dir}/${fname}`;
        try {
            await window.callFS({ action: 'mkdir', path: dir });
            const r = await window.callFS({ action: 'save_base64', path, content: b64 });
            if (r && r.success) { claim.pendingInvoicePath = path; claim.pendingInvoiceName = fname; return path; }
        } catch (e) { console.error('pending invoice FS error:', e); }
        return null;
    }

    async function saveBatchToFS(batch, file, settledClaims) {
        if (typeof window.callFS !== 'function') return;
        try {
            const isCapital = (settledClaims && settledClaims.length > 0) ? settledClaims[0].isCapital : false;
            const dates = (settledClaims || []).map(c => c.date).filter(Boolean).sort();
            const dateStr = dates[0] || new Date().toISOString();
            const folderPath = getClaimFolderPath({ date: dateStr, isCapital: isCapital });
            const basePath = `${folderPath}/دفعة #${batch.id}`;
            
            await window.callFS({ action: 'mkdir', path: `${basePath}/الفواتير` });
            await window.callFS({ action: 'mkdir', path: `${basePath}/اثبات الدفع` });

            if (file) {
                const dataUrl = await fileToDataUrl(file);
                const b64 = (String(dataUrl || '').split(',')[1]) || '';
                const ext = dataUrlExt(dataUrl, file.name);
                if (b64) await window.callFS({ action: 'save_base64', path: `${basePath}/اثبات الدفع/ايصال_التحويل_${batch.id}.${ext}`, content: b64 });
            }

            for (const c of (settledClaims || [])) {
                const amount = parseFloat(c.amount) || 0;
                const baseName = `${safeFsName(c.employee)} - ${amount} ريال - ${safeFsName(window.getClaimTitle(c))}`;
                let moved = false;
                if (c.pendingInvoicePath) {
                    const ext = (c.pendingInvoiceName && c.pendingInvoiceName.includes('.')) ? c.pendingInvoiceName.split('.').pop() : 'jpg';
                    const dest = `${basePath}/الفواتير/${baseName}.${ext}`;
                    try {
                        const r = await window.callFS({ action: 'rename', old_path: c.pendingInvoicePath, new_path: dest });
                        if (r && r.success) { moved = true; c.invoicePath = dest; delete c.pendingInvoicePath; delete c.pendingInvoiceName; }
                    } catch (e) {}
                }
                if (!moved && c.invoiceBase64) {
                    const b64 = c.invoiceBase64.split(',')[1] || '';
                    const ext = dataUrlExt(c.invoiceBase64, c.invoiceName);
                    if (b64) { try { await window.callFS({ action: 'save_base64', path: `${basePath}/الفواتير/${baseName}.${ext}`, content: b64 }); c.invoicePath = `${basePath}/الفواتير/${baseName}.${ext}`; } catch (e) {} }
                }
            }

            const details = {
                id: batch.id,
                recipient: batch.employee,
                employees: batch.employees || [],
                date: new Date(batch.date).toLocaleString('ar-SA'),
                totalAmount: batch.totalAmount,
                claims: (settledClaims || []).map(c => ({ id: c.id, title: window.getClaimTitle(c), employee: c.employee, amount: c.amount, date: c.date }))
            };
            await window.callFS({ action: 'save_text', path: `${basePath}/تفاصيل.json`, content: JSON.stringify(details, null, 2) });
        } catch (e) {
            console.error('Claims FS error:', e);
        }
    }

    function deleteClaim(id) {
        if (!checkPerms()) return;
        const confirmation = prompt(`لحذف هذه المطالبة بشكل نهائي، يرجى كتابة كلمة "تأكيد" أدناه:`);
        if (confirmation === 'تأكيد') {
            window.SaddahDB.data.claims = window.SaddahDB.data.claims.filter(c => String(c.id) !== String(id));
            persistClaims();
            window.renderPendingClaims();
        } else if (confirmation !== null) {
            alert('لم يتم الحذف: الكلمة غير متطابقة.');
        }
    }

    function deleteBatch(batchId) {
        if (!checkPerms()) return;
        const confirmation = prompt(`تنبيه أمني: لحذف الدفعة رقم #${batchId} بشكل نهائي مع كافة فواتيرها، يرجى إدخال رقم الدفعة للتأكيد:`);
        if (confirmation === batchId) {
            window.SaddahDB.data.batches = window.SaddahDB.data.batches.filter(b => b.id !== batchId);
            window.SaddahDB.data.claims = window.SaddahDB.data.claims.filter(c => c.batchId !== batchId);
            persistClaims();
            alert('تم حذف الدفعة والفواتير المرتبطة بها نهائياً بنجاح.');
            window.renderBatches();
        } else if (confirmation !== null) {
            alert('لم يتم الحذف: رقم الدفعة غير متطابق.');
        }
    }

    async function saveCapitalClaim(e, btn) {
        e.preventDefault();
        const employee = document.getElementById('cc-employee').value.trim();
        const title = document.getElementById('cc-title').value.trim();
        const amount = parseFloat(document.getElementById('cc-amount').value);
        const fileInput = document.getElementById('cc-proof');
        const file = fileInput.files[0];

        if (!title || !employee || isNaN(amount) || amount <= 0) {
            alert("الرجاء إدخال اسم الموظف، وصف المطالبة، ومبلغ صحيح.");
            return;
        }

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ الحفظ...'; }

        const claimDate = document.getElementById('cc-date') ? document.getElementById('cc-date').value : new Date().toISOString();

        const claimObj = {
            id: Date.now().toString().slice(-6),
            title: title,
            amount: amount,
            employee: employee, 
            date: claimDate,
            status: 'pending',
            isCapital: true,
            invoiceBase64: null,
            invoiceName: null
        };

        if (file) {
            const compressedFile = (file.type.startsWith('image/') && typeof window.compressImageFile === 'function') ? await window.compressImageFile(file, 800) : file;
            const dataUrl = await fileToDataUrl(compressedFile);
            claimObj.invoiceBase64 = dataUrl;
            claimObj.invoiceName = file.name;
            await saveClaimPendingInvoice(claimObj, dataUrl, file.name);
            _finalizeCapitalClaim(claimObj, btn);
        } else {
            _finalizeCapitalClaim(claimObj, btn);
        }
    }

    function _finalizeCapitalClaim(claimObj, btn) {
        window.SaddahDB.data.claims.push(claimObj);
        persistClaims();
        window.closeCapitalClaimModal();
        if (window.showToast) window.showToast('تم إضافة المطالبة بنجاح.', 'success');
        else alert('تم إضافة المطالبة بنجاح.');
        window.renderPendingClaims();
        if (btn) { btn.disabled = false; btn.innerText = 'حفظ المطالبة'; }
    }

    function findOrderById(id) {
        const D = (window.SaddahDB && window.SaddahDB.data) || {};
        return (D.orders || []).find(o => String(o.id) === String(id))
            || (D.archive || []).find(o => String(o.id) === String(id))
            || null;
    }

    function saveEditClaim(e, editingClaimId, btn) {
        e.preventDefault();
        const c = window.SaddahDB.data.claims.find(x => String(x.id) === String(editingClaimId));
        if (!c) { window.closeEditClaim(); return; }

        const employee = document.getElementById('ec-employee').value.trim();
        const title = document.getElementById('ec-title').value.trim();
        const amount = parseFloat(document.getElementById('ec-amount').value);
        if (!employee || !title || isNaN(amount) || amount <= 0) { alert('يرجى إدخال اسم الموظف ووصف ومبلغ صحيح.'); return; }

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

        c.employee = employee;
        c.title = title;
        c.desc = title;
        c.amount = amount;

        let orderSynced = false;
        if (c.orderId != null) {
            const order = findOrderById(c.orderId);
            if (order && Array.isArray(order.expenses)) {
                const exp = order.expenses.find(x => x && String(x.claimId) === String(c.id));
                if (exp) {
                    exp.total = amount;
                    exp.amount = amount;
                    exp.discount = 0;
                    const baseDesc = title.split('—')[0].split(' لطلب ')[0].trim();
                    if (baseDesc) exp.desc = baseDesc;
                    orderSynced = true;
                }
            }
        }

        persistClaims();
        window.closeEditClaim();
        window.renderPendingClaims();
        if (window.showToast) window.showToast('تم تحديث المطالبة' + (orderSynced ? ' وتحديث الطلب المرتبط ✓' : ' ✓'), 'success');
        else alert('تم تحديث المطالبة' + (orderSynced ? ' وتحديث الطلب المرتبط ✓' : ' ✓'));
        if (btn) { btn.disabled = false; btn.innerText = 'حفظ التعديل'; }
    }

    async function settleBatch(e, editingBatchId, btn) {
        e.preventDefault();
        const fileInput = document.getElementById('batch-proof');
        const file = fileInput.files[0];

        const checked = document.querySelectorAll('.batch-claim-cb:checked');
        const selectedIds = Array.from(checked).map(cb => cb.value);

        if (selectedIds.length === 0) { alert('يرجى تحديد فاتورة واحدة على الأقل للتسوية.'); return; }
        if (!editingBatchId && !file) { alert('يرجى إرفاق إيصال التحويل.'); return; }

        const claims = window.SaddahDB.data.claims;
        const batches = window.SaddahDB.data.batches;

        const selectedClaims = claims.filter(c => selectedIds.includes(c.id));
        const hasCapital = selectedClaims.some(c => c.isCapital);
        const hasNormal = selectedClaims.some(c => !c.isCapital);
        if (hasCapital && hasNormal) {
            alert('لا يمكن تسوية مطالبات رأس المال مع مصروفات الطلبات في نفس الدفعة.');
            return;
        }

        const employees = [...new Set(selectedClaims.map(c => c.employee || 'بدون موظف'))];
        const total = selectedClaims.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
        const recipient = (document.getElementById('batch-recipient').value || '').trim() || (employees.length === 1 ? employees[0] : 'متعدد');

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ الحفظ...'; }

        if (editingBatchId) {
            const existingBatch = batches.find(b => String(b.id) === String(editingBatchId));
            if (!existingBatch) { if (btn) { btn.disabled = false; btn.innerText = 'حفظ التعديلات'; } return; }

            const oldIds = existingBatch.claimsIds || [];
            const removedIds = oldIds.filter(id => !selectedIds.includes(String(id)));
            removedIds.forEach(id => {
                const c = claims.find(x => String(x.id) === String(id));
                if (c) {
                    c.status = 'pending';
                    delete c.batchId;
                }
            });

            selectedClaims.forEach(c => {
                c.status = 'settled';
                c.batchId = editingBatchId;
            });

            existingBatch.employee = recipient;
            existingBatch.recipient = recipient;
            existingBatch.employees = employees;
            existingBatch.multi = employees.length > 1;
            existingBatch.totalAmount = total;
            existingBatch.claimsIds = selectedIds;
            existingBatch.claimsSnapshot = selectedClaims.map(c => ({ id: c.id, title: window.getClaimTitle(c), amount: parseFloat(c.amount) || 0, employee: c.employee || '' }));

            persistClaims();

            const processEditSave = async () => {
                await saveBatchToFS(existingBatch, file, selectedClaims);
                persistClaims();
                window.closeBatchModal();
                if (window.showToast) window.showToast('تم تعديل الدفعة بنجاح', 'success');
                else alert('تم تعديل الدفعة بنجاح');
                window.renderBatches();
                if (btn) { btn.disabled = false; btn.innerText = 'حفظ التعديلات'; }
            };

            if (file) {
                const compressedFile = (file.type.startsWith('image/') && typeof window.compressImageFile === 'function') ? await window.compressImageFile(file, 800) : file;
                const dataUrl = await fileToDataUrl(compressedFile);
                existingBatch.proofBase64 = dataUrl;
                existingBatch.proofType = file.type;
                await processEditSave();
            } else {
                await processEditSave();
            }

        } else {
            const batchId = Date.now().toString().slice(-6);
            let dataUrl = null;
            let fileType = null;
            
            if (file) {
                const compressedFile = (file.type.startsWith('image/') && typeof window.compressImageFile === 'function') ? await window.compressImageFile(file, 800) : file;
                dataUrl = await fileToDataUrl(compressedFile);
                fileType = file.type;
            }

            const newBatch = {
                id: batchId,
                employee: recipient,
                recipient: recipient,
                employees: employees,
                multi: employees.length > 1,
                date: new Date().toISOString(),
                totalAmount: total,
                claimsIds: selectedIds,
                claimsSnapshot: selectedClaims.map(c => ({ id: c.id, title: window.getClaimTitle(c), amount: parseFloat(c.amount) || 0, employee: c.employee || '' })),
                proofBase64: dataUrl,
                proofType: fileType
            };

            batches.push(newBatch);
            persistClaims();

            claims.forEach(c => {
                if (selectedIds.includes(c.id)) { c.status = 'settled'; c.batchId = batchId; }
            });
            persistClaims();

            const actualFile = (file && file.type.startsWith('image/') && typeof window.compressImageFile === 'function') ? await window.compressImageFile(file, 800) : file;
            await saveBatchToFS(newBatch, actualFile, selectedClaims);
            persistClaims();

            window.closeBatchModal();
            if (window.showToast) window.showToast('تم تسوية الدفعة بنجاح', 'success');
            else alert('تم تسوية الدفعة بنجاح');
            window.renderPendingClaims();
            if (btn) { btn.disabled = false; btn.innerText = 'تأكيد وحفظ الدفعة'; }
        }
    }

    function getBatchClaimObjects(b) {
        const ids = (b.claimsIds || []).map(String);
        return window.SaddahDB.data.claims.filter(c => ids.includes(String(c.id)));
    }

    async function claimInvoiceDataUrl(c) {
        if (c.invoiceBase64) return { dataUrl: c.invoiceBase64, name: c.invoiceName || 'فاتورة.jpg' };
        if (c.fileLink) {
            try {
                const url = window.resolveSaddahUrl ? window.resolveSaddahUrl(c.fileLink) : c.fileLink;
                const r = await fetch(url, { cache: 'no-store' });
                if (!r.ok) return null;
                const blob = await r.blob();
                if (!blob || !blob.size) return null;
                const dataUrl = await fileToDataUrl(blob);
                if (!dataUrl) return null;
                return { dataUrl, name: String(c.fileLink).split('/').pop() || 'فاتورة' };
            } catch (e) { return null; }
        }
        return null;
    }

    async function rebuildBatchFolder(b) {
        let invoices = 0, fails = 0;
        const settled = getBatchClaimObjects(b);
        
        const isCapital = (settled && settled.length > 0) ? settled[0].isCapital : false;
        const dates = settled.map(c => c.date).filter(Boolean).sort();
        const dateStr = dates[0] || (b.date ? new Date(b.date).toISOString() : new Date().toISOString());
        const folderPath = getClaimFolderPath({ date: dateStr, isCapital: isCapital });
        const basePath = `${folderPath}/دفعة #${b.id}`;

        await window.callFS({ action: 'mkdir', path: `${basePath}/الفواتير` });
        await window.callFS({ action: 'mkdir', path: `${basePath}/اثبات الدفع` });

        if (b.proofBase64) {
            const b64 = b.proofBase64.split(',')[1] || '';
            const ext = (b.proofType && b.proofType.includes('pdf')) ? 'pdf' : dataUrlExt(b.proofBase64, '');
            if (b64) { try { await window.callFS({ action: 'save_base64', path: `${basePath}/اثبات الدفع/ايصال_التحويل_${b.id}.${ext}`, content: b64 }); } catch (e) { fails++; } }
        }
        for (const c of settled) {
            const inv = await claimInvoiceDataUrl(c);
            if (!inv) continue;
            const b64 = inv.dataUrl.split(',')[1] || '';
            if (!b64) continue;
            const ext = dataUrlExt(inv.dataUrl, inv.name);
            const amount = parseFloat(c.amount) || 0;
            const baseName = `${safeFsName(c.employee)} - ${amount} ريال - ${safeFsName(window.getClaimTitle(c))}`;
            try { await window.callFS({ action: 'save_base64', path: `${basePath}/الفواتير/${baseName}.${ext}`, content: b64 }); c.invoicePath = `${basePath}/الفواتير/${baseName}.${ext}`; invoices++; }
            catch (e) { fails++; }
        }
        const details = {
            id: b.id, recipient: b.employee, employees: b.employees || [],
            date: b.date ? new Date(b.date).toLocaleString('ar-SA') : '', totalAmount: b.totalAmount,
            claims: (Array.isArray(b.claimsSnapshot) && b.claimsSnapshot.length) ? b.claimsSnapshot
                : settled.map(c => ({ id: c.id, title: window.getClaimTitle(c), employee: c.employee, amount: c.amount, date: c.date }))
        };
        try { await window.callFS({ action: 'save_text', path: `${basePath}/تفاصيل.json`, content: JSON.stringify(details, null, 2) }); } catch (e) {}
        return { invoices, fails };
    }

    async function rebuildClaimsFolders() {
        if (typeof window.callFS !== 'function') { alert('خدمة الملفات غير متاحة على هذه الصفحة.'); return; }
        if (!checkPerms()) return;
        if (!confirm('سيُعيد بناء مجلد المطالبات (الفواتير المعلّقة + مجلدات الدفعات) من البيانات المحفوظة. قد يستغرق وقتاً حسب عدد الفواتير. متابعة؟')) return;
        
        const btn = document.getElementById('rebuild-folders-btn');
        const orig = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ البناء…'; }
        let pendingDone = 0, batchDone = 0, invoicesDone = 0, fails = 0;
        try {
            const claims = window.SaddahDB.data.claims;
            const batches = window.SaddahDB.data.batches;
            
            for (const c of claims.filter(x => x.status === 'pending')) {
                const inv = await claimInvoiceDataUrl(c);
                if (inv) { const ok = await saveClaimPendingInvoice(c, inv.dataUrl, inv.name); if (ok) pendingDone++; else fails++; }
            }
            for (const b of batches) {
                const res = await rebuildBatchFolder(b);
                batchDone++; invoicesDone += res.invoices; fails += res.fails;
            }
            persistClaims();
            alert(`تم البناء ✓\n• ${pendingDone} فاتورة معلّقة\n• ${batchDone} دفعة (${invoicesDone} فاتورة بداخلها)` + (fails ? `\n• ${fails} فاتورة تعذّر جلبها (ربما الملف غير موجود)` : ''));
        } catch (e) { console.error('rebuild error:', e); alert('حدث خطأ أثناء إعادة البناء.'); }
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }

    return {
        deleteClaim,
        deleteBatch,
        saveCapitalClaim,
        saveEditClaim,
        settleBatch,
        rebuildClaimsFolders
    };
})();
