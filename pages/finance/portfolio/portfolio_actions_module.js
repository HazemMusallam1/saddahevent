// ============================================================================
// Finance - Portfolio Module: Actions & Data Mutations
// ============================================================================

window.PortfolioActions = (function () {
    
    function checkPerms() {
        if (!window.SaddahUser || !window.SaddahUser.perms.includes('*')) {
            alert('غير مصرح لك بإجراء هذا التعديل. يتطلب صلاحية إدارة (*).');
            return false;
        }
        return true;
    }

    async function excludeFromPortfolio(id) {
        if (!checkPerms()) return;
        
        const order = window.findOrderById(id);
        if (!order) return;
        
        const name = order.client ? order.client.name : 'الطلب';
        if (!confirm(`استبعاد طلب "${name}" من محفظة التشغيل؟\n(لن يُحذف الطلب — فقط يُستبعد من حساب المحفظة)`)) return;

        order.excludeFromPortfolio = true;
        await window.SaddahDB.save();
        window.loadPortfolioData();
    }

    async function restoreToPortfolio(id) {
        if (!checkPerms()) return;
        
        const order = window.findOrderById(id);
        if (!order) return;
        
        order.excludeFromPortfolio = false;
        await window.SaddahDB.save();
        window.loadPortfolioData();
    }

    return {
        excludeFromPortfolio,
        restoreToPortfolio
    };
})();
