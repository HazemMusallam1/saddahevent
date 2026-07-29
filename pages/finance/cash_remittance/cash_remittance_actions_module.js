// ============================================================================
// Finance - Cash Remittance Module: Actions & Data Mutations
// ============================================================================

window.CashRemittanceActions = (function () {
    
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

    function safeFsName(s) {
        return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'ايصال';
    }

    async function markAsTransfer(key) {
        if (!checkPerms()) return;

        const [orderId, proofIndex] = key.split(':');
        const order = window.getOrders().find(o => String(o.id) === String(orderId));
        if (!order || !order.paymentProofs[proofIndex]) return;

        const p = order.paymentProofs[proofIndex];
        if (!confirm(`اعتبار دفعة "${p.desc || 'دفعة'}" (${window.fmt(p.amount)} ر.س) تحويلاً بنكياً وإزالتها من الكاش؟`)) return;

        p.method = 'transfer';
        p.settledToInstitution = true;

        window.selectedKeys.delete(key);
        await window.SaddahDB.save();
        
        if (window.showToast) window.showToast('تم تحويل الدفعة إلى بنكية بنجاح', 'success');
        window.render();
    }

    async function confirmRemittance() {
        if (window.selectedKeys.size === 0) return;
        if (!checkPerms()) return;

        const fileInput = document.getElementById('remit-receipt');
        const note = document.getElementById('remit-note').value.trim();

        if (fileInput.files.length === 0) {
            alert('يجب إرفاق إيصال التحويل للمؤسسة قبل التأكيد.');
            return;
        }

        const unsettled = window.getUnsettledCash();
        const selected = unsettled.filter(x => window.selectedKeys.has(`${x.orderId}:${x.proofIndex}`));
        const total = selected.reduce((s, x) => s + x.amount, 0);

        if (!confirm(`تأكيد تحويل ${window.fmt(total)} ر.س (${selected.length} دفعة) للمؤسسة؟`)) return;

        const btn = document.getElementById('confirm-btn');
        const originalBtnHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التأكيد والرفع...';

        const settlementId = Date.now();
        const settlementDate = new Date().toISOString();
        const originalFile = fileInput.files[0];
        
        // 1. Image Compression
        const fileToUpload = (originalFile.type.startsWith('image/') && typeof window.compressImageFile === 'function') 
            ? await window.compressImageFile(originalFile, 800) 
            : originalFile;
            
        // 2. Upload to FS
        let receiptPath = originalFile.name; // Fallback
        if (typeof window.callFS === 'function') {
            const dataUrl = await fileToDataUrl(fileToUpload);
            if (dataUrl) {
                const b64 = dataUrl.split(',')[1];
                if (b64) {
                    const ext = dataUrlExt(dataUrl, originalFile.name);
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = now.getMonth() + 1;
                    const folderPath = `توريدات كاش/سنة ${year}/شهر ${month}`;
                    const fileName = `ايصال_تسوية_${settlementId}.${ext}`;
                    const fullPath = `${folderPath}/${fileName}`;
                    
                    try {
                        await window.callFS({ action: 'mkdir', path: folderPath });
                        const res = await window.callFS({ action: 'save_base64', path: fullPath, content: b64 });
                        if (res && res.success) {
                            receiptPath = fullPath; // Use the actual server path
                        }
                    } catch (e) {
                        console.error('Failed to upload receipt to FS:', e);
                    }
                }
            }
        }

        // 3. Mutate Data
        const allOrdersList = window.getOrders();
        selected.forEach(x => {
            const order = allOrdersList.find(o => o.id === x.orderId);
            if (order && order.paymentProofs && order.paymentProofs[x.proofIndex]) {
                const p = order.paymentProofs[x.proofIndex];
                p.method = 'cash'; 
                p.settledToInstitution = true;
                p.settlementId = settlementId;
                p.settlementDate = settlementDate;
                p.settlementReceipt = receiptPath; // Stores actual path if successful
                if (note) p.settlementNote = note;
            }
        });

        // 4. Save and Update UI
        await window.SaddahDB.save();
        
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;

        window.selectedKeys.clear();
        fileInput.value = '';
        document.getElementById('remit-note').value = '';
        window.render();

        if (window.showToast) window.showToast(`✅ تم تحويل ${window.fmt(total)} ر.س للمؤسسة بنجاح.`, 'success');
        else alert(`✅ تم تحويل ${window.fmt(total)} ر.س للمؤسسة بنجاح.`);
    }

    return {
        markAsTransfer,
        confirmRemittance
    };
})();
