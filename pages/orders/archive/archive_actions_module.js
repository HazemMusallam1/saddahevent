// ============================================================================
// Archive - Actions Module: Mutations & Logic
// ============================================================================

window.ArchiveActions = (function () {
    
    function checkPerms(actionDesc) {
        if (!window.SaddahUser || !window.SaddahUser.perms.includes('*')) {
            alert(`غير مصرح لك بإجراء هذا التعديل (${actionDesc}). يتطلب صلاحية إدارة (*).`);
            return false;
        }
        return true;
    }

    async function toggleAuditTax() {
        if (!window.currentAuditOrder) return;
        if (!window.currentAuditOrder.financials) window.currentAuditOrder.financials = {};
        window.currentAuditOrder.financials.includeTaxInProfit = !window.currentAuditOrder.financials.includeTaxInProfit;

        // Synchronize and save
        window.SaddahDB.data.orders = window.allOrders;
        await window.SaddahDB.save();

        window.openAuditModal(window.currentAuditOrder.id);
        window.renderDashboard();
    }

    function saveAuditStatus() {
        if (!window.currentAuditOrder) return;
        
        const isChecked = document.getElementById('audit-confirm-check').checked;
        window.currentAuditOrder.status = isChecked ? 'تم الجرد' : 'مكتمل';

        const orderIndex = window.allOrders.findIndex(o => o.id === window.currentAuditOrder.id);
        if (orderIndex !== -1) {
            window.allOrders[orderIndex] = window.currentAuditOrder;
            window.SaddahDB.data.orders = window.allOrders;
            window.SaddahDB.save();
        }

        window.filterArchive();
        window.closeAuditModal();
        
        alert('تم تحديث حالة الطلب وحفظ الجرد بنجاح!');
    }

    async function cancelOrder(id) {
        if (!confirm('هل أنت متأكد من إلغاء هذا الطلب؟ سيتم إيقاف المطالبة بالمتبقي واعتبار المدفوعات فقط كإجمالي للطلب (حجز العربون).')) return;
        
        const orderIndex = window.allOrders.findIndex(o => o.id.toString() === id.toString());
        if (orderIndex !== -1) {
            window.allOrders[orderIndex].status = 'ملغي';
            window.SaddahDB.data.orders = window.allOrders;
            await window.SaddahDB.save();

            let folderMsg = '';
            if (typeof window.applyCancellationToFolderFS === 'function') {
                try {
                    const r = await window.applyCancellationToFolderFS(window.allOrders[orderIndex]);
                    if (r && r.ok) {
                        folderMsg = `\n\n📁 تم تحديث المجلد على الجهاز:\n${r.to}`;
                    } else {
                        folderMsg = `\n\n⚠️ تعذّر تحديث مجلد الطلب على القرص:\n${(r && r.reason) || 'سبب غير معروف'}`;
                    }
                } catch(e) {
                    console.error('cancel folder error:', e);
                    folderMsg = `\n\n⚠️ خطأ أثناء تحديث المجلد: ${(e && e.message) || e}`;
                }
            }

            window.filterArchive();
            alert('تم إلغاء الطلب وحجز العربون.' + folderMsg);
        }
    }

    async function deleteOrder(id) {
        if (!checkPerms("حذف طلب نهائياً")) return;

        const linkedClaims = window.SaddahDB.rel.getClaimsForOrder(id);
        let confirmMsg = 'هل أنت متأكد؟ سيتم حذف هذا الطلب نهائياً مع كافة المرفقات ولن تتمكن من استعادته.';
        if (linkedClaims.length > 0) {
            confirmMsg += `\nوسيُحذف معه ${linkedClaims.length} مطالبة مرتبطة به.`;
        }
        if (!confirm(confirmMsg)) return;
        
        const orderIndex = window.allOrders.findIndex(o => o.id.toString() === id.toString());
        if (orderIndex !== -1) {
            const orderToDelete = window.allOrders[orderIndex];
            
            // USE cascadeDeleteOrder to prevent orphaned claims (Fixing the bug)
            const removed = window.SaddahDB.rel.cascadeDeleteOrder(id);
            window.allOrders = window.SaddahDB.data.orders; // Resync
            window.SaddahDB.save();
            
            window.filterArchive();
            
            let folderDeleted = false;
            if (typeof window.deleteOrderFolderFS === 'function') {
                try {
                    folderDeleted = await window.deleteOrderFolderFS(orderToDelete);
                } catch(e) {
                    console.error("Folder could not be deleted automatically", e);
                }
            }
            
            let msg = '';
            if (folderDeleted) {
                msg = 'تم حذف الطلب ومجلده الخاص بنجاح.';
            } else {
                msg = 'تم حذف الطلب من النظام بنجاح.\nملاحظة: لم نتمكن من إيجاد أو حذف مجلد الطلب من جهازك، قد تحتاج لحذفه يدوياً.';
            }
            
            if (removed && removed.claims > 0) {
                msg += `\nوحُذف ${removed.claims} مطالبة مرتبطة به.`;
            }
            alert(msg);
        }
    }

    return {
        toggleAuditTax,
        saveAuditStatus,
        cancelOrder,
        deleteOrder
    };
})();
