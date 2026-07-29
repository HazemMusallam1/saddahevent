// ============================================================================
// Finance - Dues Transfers Module: Actions & Data Mutations
// ============================================================================

window.DuesTransfersActions = (function () {
    
    function checkPerms() {
        if (!window.SaddahUser || !window.SaddahUser.perms.includes('*')) {
            alert('غير مصرح لك بإجراء هذا التعديل. يتطلب صلاحية إدارة (*).');
            return false;
        }
        return true;
    }

    function fileToDataUrl(file) {
        return new Promise((resolve) => { 
            const fr = new FileReader(); 
            fr.onload = () => resolve(fr.result); 
            fr.onerror = () => resolve(null); 
            fr.readAsDataURL(file); 
        });
    }

    function dataUrlExt(dataUrl, origName) {
        if (origName && origName.includes('.')) return origName.split('.').pop().toLowerCase();
        if (/pdf/i.test(dataUrl)) return 'pdf';
        if (/png/i.test(dataUrl)) return 'png';
        if (/webp/i.test(dataUrl)) return 'webp';
        return 'jpg';
    }

    // ─── Toggles & Individual Settlements ──────────────────────────────────
    function toggleProfit(id) {
        if (!checkPerms()) return;
        const o = window.allOrders().find(x => String(x.id) === String(id));
        if (!o) return;
        o.profitTransferred = !o.profitTransferred;
        o.profitTransferredAt = o.profitTransferred ? new Date().toISOString() : null;
        window.saveDb();
        window.renderProfits();
    }

    function toggleFuel(id) {
        if (!checkPerms()) return;
        const o = window.allOrders().find(x => String(x.id) === String(id));
        if (!o) return;
        o.fuelSettled = !o.fuelSettled;
        o.fuelSettledAt = o.fuelSettled ? new Date().toISOString() : null;
        window.saveDb();
        window.renderFuel();
    }

    function settleClaim(id) {
        if (!checkPerms()) return;
        const c = (window.SaddahDB.data.claims || []).find(x => String(x.id) === String(id));
        if (!c) return;
        if (!confirm('تأشير هذه المطالبة كـ«تم صرفها»؟')) return;
        c.status = 'settled';
        c.settledAt = new Date().toISOString();
        window.saveDb();
        window.renderClaims();
    }

    // ─── Batch Confirmations & File System ──────────────────────────────────
    async function confirmDuesBatch() {
        if (!window.duesBatchCtx) return;
        if (!checkPerms()) return;
        
        const { type, items, total, batchYear, batchMonth } = window.duesBatchCtx;
        const note = document.getElementById('db-note').value.trim();
        const file = document.getElementById('db-receipt').files[0] || null;
        const btn = document.getElementById('db-confirm');
        
        btn.disabled = true; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ والرفع...';

        const batchId = Date.now().toString().slice(-6);
        items.forEach(it => {
            const o = window.allOrders().find(x => String(x.id) === String(it.id));
            if (!o) return;
            if (type === 'profit') { 
                o.profitTransferred = true; 
                o.profitBatchId = batchId; 
                o.profitTransferredAt = new Date().toISOString(); 
            } else { 
                o.fuelSettled = true; 
                o.fuelBatchId = batchId; 
                o.fuelSettledAt = new Date().toISOString(); 
            }
        });
        
        window.saveDb();

        let folderMsg = '';
        try {
            const ok = await saveDuesBatchToFS(type, batchId, file, items, total, note, batchYear, batchMonth);
            folderMsg = ok ? '\n📁 حُفظ الإيصال والتفاصيل في مجلد السيرفر.' : '\n⚠️ تعذّر الحفظ في مجلد السيرفر.';
        } catch (e) { 
            folderMsg = '\n⚠️ خطأ أثناء الحفظ في المجلد: ' + ((e && e.message) || e); 
        }

        btn.disabled = false; 
        btn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد التسوية والحفظ';
        
        window.closeDuesBatch();
        
        if (type === 'profit') window.renderProfits(); 
        else window.renderFuel();
        
        alert(`تمت تسوية دفعة (${items.length} عناصر • ${window.fmt(total)} ر.س) ✓` + folderMsg);
    }

    async function saveDuesBatchToFS(type, batchId, file, items, total, note, batchYear, batchMonth) {
        if (typeof window.callFS !== 'function') return false;

        const kindFolder = type === 'profit' ? 'تحويل الارباح' : 'تحويل التشغيل';
        let folderPath = '';
        
        if (batchYear && batchYear !== '0000' && batchMonth) {
            folderPath = `سنة ${batchYear}/شهر ${batchMonth}/${kindFolder}/دفعة #${batchId}`;
        } else {
            folderPath = `تحويلات المستحقات/${kindFolder}/دفعة #${batchId}`;
        }

        try {
            // 1. Create Folder
            await window.callFS({ action: 'mkdir', path: folderPath });

            // 2. Upload JSON Details
            const details = {
                id: batchId, 
                type: kindFolder, 
                date: new Date().toLocaleString('ar-SA'),
                total, 
                note: note || '', 
                count: items.length,
                items: items.map(i => ({ order: i.name, amount: i.amount }))
            };
            
            // Encode JSON properly to Base64 (Handling UTF-8 Arabic characters)
            const jsonString = JSON.stringify(details, null, 4);
            const jsonB64 = btoa(unescape(encodeURIComponent(jsonString)));
            await window.callFS({ 
                action: 'save_base64', 
                path: `${folderPath}/تفاصيل_الدفعة.json`, 
                content: jsonB64 
            });

            // 3. Upload Receipt (Compressed if image)
            if (file) {
                const fileToUpload = (file.type.startsWith('image/') && typeof window.compressImageFile === 'function') 
                    ? await window.compressImageFile(file, 800) 
                    : file;
                
                const dataUrl = await fileToDataUrl(fileToUpload);
                if (dataUrl) {
                    const b64 = dataUrl.split(',')[1];
                    if (b64) {
                        const ext = dataUrlExt(dataUrl, file.name);
                        await window.callFS({ 
                            action: 'save_base64', 
                            path: `${folderPath}/ايصال_التحويل.${ext}`, 
                            content: b64 
                        });
                    }
                }
            }
            return true;
        } catch(e) {
            console.error('Server FS Error:', e);
            return false;
        }
    }

    return {
        toggleProfit,
        toggleFuel,
        settleClaim,
        confirmDuesBatch
    };
})();
