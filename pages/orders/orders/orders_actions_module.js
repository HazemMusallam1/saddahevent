// ============================================================================
// Orders - Actions Module: Mutations & Logic
// ============================================================================

window.OrdersActions = (function () {
    
    function checkPerms(actionDesc) {
        if (!window.SaddahUser || !window.SaddahUser.perms.includes('*')) {
            alert(`غير مصرح لك بإجراء هذا التعديل (${actionDesc}). يتطلب صلاحية إدارة (*).`);
            return false;
        }
        return true;
    }

    // -- Payment & Order Status Mutations --

    function togglePayment(orderId, type) {
        const orderIndex = window.orders.findIndex(o => o.id == orderId);
        if (orderIndex === -1) return;
        const order = window.orders[orderIndex];
        
        if (!order.paymentStatus) {
            order.paymentStatus = { deposit: false, security: false, remaining: false, completed: false, securityReturned: false };
        }

        if (type === 'deposit') {
            order.paymentStatus.deposit = !order.paymentStatus.deposit;
            if (!order.paymentStatus.deposit) {
                order.paymentStatus.remaining = false;
                order.paymentStatus.completed = false;
            }
        } else if (type === 'security') {
            order.paymentStatus.security = !order.paymentStatus.security;
        } else if (type === 'remaining') {
            if (!order.paymentStatus.deposit) {
                alert('يجب دفع العربون أولاً.');
                return;
            }
            order.paymentStatus.remaining = !order.paymentStatus.remaining;
            order.paymentStatus.completed = order.paymentStatus.remaining; 
        } else if (type === 'securityReturned') {
            order.paymentStatus.securityReturned = !order.paymentStatus.securityReturned;
        } else if (type === 'completed') {
            order.paymentStatus.completed = !order.paymentStatus.completed;
            if (order.paymentStatus.completed) {
                order.paymentStatus.deposit = true;
                order.paymentStatus.remaining = true;
            }
        }

        window.persistOrder(order.id);
        window.renderPaymentStatusUI(order);
        window.renderFinancialModal(); 
    }

    function toggleConfirmation(id) {
        const index = window.orders.findIndex(o => o.id == id);
        if (index !== -1) {
            window.orders[index].isConfirmed = !window.orders[index].isConfirmed;
            window.persistOrder(id);
            window.renderOrders();
        }
    }

    function toggleTaxInclusion(id) {
        const index = window.orders.findIndex(o => o.id == id);
        if (index !== -1) {
            if (!window.orders[index].financials) window.orders[index].financials = {};
            window.orders[index].financials.includeTaxInProfit = !window.orders[index].financials.includeTaxInProfit;
            window.persistOrder(id);
            window.renderOrders();
        }
    }
    
    async function deleteOrder(id) {
        if (!checkPerms("حذف طلب")) return;
        
        const linkedClaims = window.SaddahDB.rel.getClaimsForOrder(id);
        let confirmMsg = 'هل أنت متأكد من حذف هذا الطلب نهائياً؟\nسيُحذف من النظام ومن الأرشيف ومن مجلده على الجهاز.';
        if (linkedClaims.length > 0) {
            confirmMsg += `\nوسيُحذف معه ${linkedClaims.length} مطالبة مرتبطة به.`;
        }
        if (!confirm(confirmMsg)) return;

        const orderObj = window.SaddahDB.rel.getOrder(id);
        const removed = window.SaddahDB.rel.cascadeDeleteOrder(id);
        window.orders = window.SaddahDB.data.orders; 
        
        window.saveOrders();
        window.renderOrders();

        let folderMsg = '';
        if (orderObj && typeof window.deleteOrderFolderFS === 'function') {
            try {
                const ok = await window.deleteOrderFolderFS(orderObj);
                folderMsg = ok ? '\nوحُذف مجلده من الجهاز ✓' : '\nملاحظة: لم يُعثر على مجلده على الجهاز.';
            } catch (e) {
                console.error('فشل حذف المجلد:', e);
                folderMsg = '\nتعذّر حذف المجلد من الجهاز.';
            }
        }

        let msg = 'تم حذف الطلب من النظام ✓';
        if (removed.claims > 0) msg += `\nوحُذف ${removed.claims} مطالبة مرتبطة به.`;
        msg += folderMsg;
        alert(msg);
        
        if (window.activeOrderId == id) window.closeFinancialModal();
    }

    // -- Expenses --

    async function addExpense() {
        if (!window.activeOrderId) return;
        
        const desc = document.getElementById('expense-desc').value;
        const amount = parseFloat(document.getElementById('expense-amount').value);
        const fileInput = document.getElementById('expense-upload');
        const urlInput = document.getElementById('expense-url');
        const cashPaid = parseFloat(document.getElementById('expense-cash')?.value) || 0;
        const transferPaid = parseFloat(document.getElementById('expense-transfer')?.value) || 0;

        if (!desc || isNaN(amount)) {
            alert('يرجى إدخال الوصف والقيمة.');
            return;
        }

        const saveExpense = async (attachment = null) => {
            const orderIndex = window.orders.findIndex(o => o.id == window.activeOrderId);
            if (!window.orders[orderIndex].expenses) window.orders[orderIndex].expenses = [];

            const expDate = document.getElementById('exp-date') ? document.getElementById('exp-date').value : new Date().toISOString();
            const expEntry = { desc, amount, date: expDate, attachment };
            if (cashPaid > 0) expEntry.cashPaid = cashPaid;
            if (transferPaid > 0) expEntry.transferPaid = transferPaid;

            window.orders[orderIndex].expenses.push(expEntry);
            
            await window.persistOrder(window.orders[orderIndex].id);
            window.renderFinancialModal();

            document.getElementById('expense-desc').value = '';
            document.getElementById('expense-amount').value = '';
            if(fileInput) fileInput.value = '';
            if (urlInput) urlInput.value = '';
            if (document.getElementById('expense-cash')) document.getElementById('expense-cash').value = '';
            if (document.getElementById('expense-transfer')) document.getElementById('expense-transfer').value = '';
        };

        if (urlInput && urlInput.value.trim()) {
            await saveExpense({ type: 'link', data: urlInput.value.trim() });
        } else if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            try {
                const activeOrder = window.orders.find(o => o.id == window.activeOrderId);
                const fileExt = file.name.split('.').pop();
                const safeName = file.name.replace(/[^a-zA-Z0-9]/g, "_");
                const fileName = `expense_${Date.now()}_${safeName}.${fileExt}`;
                
                let url = "";
                if (typeof window.saveDocumentToOrderFS === 'function' && activeOrder) {
                    const success = await window.saveDocumentToOrderFS(activeOrder, file, fileName, "المصروفات");
                    url = (success && activeOrder.folderHandle) ? `saddah://${activeOrder.id}/المصروفات/${fileName}` : fileName;
                } else {
                    url = fileName;
                }

                await saveExpense({ type: file.type, data: url, name: file.name });
            } catch(e) {
                console.error(e);
                alert("خطأ في رفع الملف");
            }
        } else {
            await saveExpense();
        }
    }

    function deleteExpense(expenseIndex) {
        if (!window.activeOrderId) return;
        const orderIndex = window.orders.findIndex(o => o.id == window.activeOrderId);
        if (confirm('حذف هذا المصروف؟')) {
            window.orders[orderIndex].expenses.splice(expenseIndex, 1);
            window.persistOrder(window.activeOrderId);
            window.renderFinancialModal();
        }
    }

    // -- Proofs --

    function handleProofUrl() {
        if (!window.activeOrderId) return;
        const urlInput = document.getElementById('proof-url');
        if (!urlInput || !urlInput.value.trim()) {
            alert('يرجى إدخال الرابط');
            return;
        }

        const orderIndex = window.orders.findIndex(o => o.id == window.activeOrderId);
        if (orderIndex === -1) return;
        if (!window.orders[orderIndex].paymentProofs) window.orders[orderIndex].paymentProofs = [];

        window.orders[orderIndex].paymentProofs.push({
            type: 'link',
            data: urlInput.value.trim(),
            name: 'رابط خارجي',
            date: new Date().toISOString()
        });

        window.persistOrder(window.activeOrderId);
        window.renderFinancialModal();
        urlInput.value = '';
    }

    async function handleProofUpload(input) {
        if (!window.activeOrderId) return;
        const file = input.files[0];
        if (!file) return;

        try {
            const orderIndex = window.orders.findIndex(o => o.id == window.activeOrderId);
            if (orderIndex === -1) return;
            if (!window.orders[orderIndex].paymentProofs) window.orders[orderIndex].paymentProofs = [];
            
            const activeOrder = window.orders[orderIndex];
            const fileExt = file.name.split('.').pop();
            const safeName = file.name.replace(/[^a-zA-Z0-9]/g, "_");
            const fileName = `proof_${Date.now()}_${safeName}.${fileExt}`;
            
            let url = "";
            if (typeof window.saveDocumentToOrderFS === 'function' && activeOrder) {
                const success = await window.saveDocumentToOrderFS(activeOrder, file, fileName, "الدفعات");
                url = (success && activeOrder.folderHandle) ? `saddah://${activeOrder.id}/الدفعات/${fileName}` : fileName;
            } else {
                url = fileName;
            }

            window.orders[orderIndex].paymentProofs.push({
                type: file.type,
                data: url,
                name: file.name,
                date: new Date().toISOString()
            });
            
            window.persistOrder(window.activeOrderId);
            window.renderFinancialModal();
        } catch(err) {
            console.error("Upload error", err);
            alert('حدث خطأ أثناء إرفاق الإيصال');
        }
        input.value = '';
    }

    function deleteProof(proofIndex) {
        if (!window.activeOrderId) return;
        const orderIndex = window.orders.findIndex(o => o.id == window.activeOrderId);
        if (confirm('حذف هذه الصورة؟')) {
            window.orders[orderIndex].paymentProofs.splice(proofIndex, 1);
            window.persistOrder(window.activeOrderId);
            window.renderFinancialModal();
        }
    }

    return {
        togglePayment,
        toggleConfirmation,
        toggleTaxInclusion,
        deleteOrder,
        addExpense,
        deleteExpense,
        handleProofUrl,
        handleProofUpload,
        deleteProof
    };
})();
