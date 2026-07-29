/**
 * OrderActions Module (Containers Pattern)
 * تم بناء هذا الملف وفقاً لمعايير Saddah ERP (Global Architectural Rules):
 * 1. Vanilla JS فقط.
 * 2. State Mutation عبر `window.SaddahDB.save()` فقط مع Reassignment.
 * 3. DOM Injection باستخدام Template Literals.
 * 4. Poka-Yoke لمنع الأخطاء الصامتة.
 */

window.OrderActions = {
    
    /**
     * Master Action Wrapper: يعالج مؤشرات التحميل، الصلاحيات، الأخطاء الصامتة، وحفظ البيانات
     */
    execute: async function(buttonElement, options, actionCallback) {
        if (options.requiresAdmin && (!window.SaddahUser || !window.SaddahUser.perms.includes('*'))) {
            if (typeof showToast === 'function') showToast('عذراً، ليس لديك صلاحية لإجراء هذا التعديل.', 'error');
            else alert('عذراً، ليس لديك صلاحية لإجراء هذا التعديل.');
            return false;
        }

        if (options.confirmMsg && !confirm(options.confirmMsg)) {
            return false;
        }

        let originalText = '';
        if (buttonElement) {
            originalText = buttonElement.innerHTML;
            buttonElement.disabled = true;
            buttonElement.classList.add('opacity-50', 'cursor-not-allowed');
            buttonElement.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...`;
        }

        try {
            await actionCallback();

            if (typeof window.updateCurrentOrderInDB === 'function') {
                await window.updateCurrentOrderInDB();
            }
            if (options.saveDB && typeof window.SaddahDB.save === 'function') {
                await window.SaddahDB.save();
            }

            if (options.successMsg && typeof showToast === 'function') {
                showToast(options.successMsg, 'success');
            } else if (options.successMsg) {
                alert(options.successMsg + ' ✓');
            }
            return true;

        } catch (error) {
            console.error('OrderAction Error:', error);
            if (error.name === 'QuotaExceededError') {
                if (typeof showToast === 'function') showToast('خطأ كارثي: مساحة التخزين ممتلئة. يرجى مسح بعض البيانات.', 'error');
                else alert('خطأ كارثي: مساحة التخزين ممتلئة.');
            } else {
                if (typeof showToast === 'function') showToast(`فشل الإجراء: ${error.message}`, 'error');
                else alert(`فشل الإجراء: ${error.message}`);
            }
            return false;
        } finally {
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.classList.remove('opacity-50', 'cursor-not-allowed');
                buttonElement.innerHTML = originalText;
            }
        }
    },

    // =========================================================
    // حاوية 1: المصروفات التشغيلية (Expenses Module)
    // =========================================================
    Expenses: {
        _editingIndex: null,

        openModal: function() {
            if (typeof closeDetailsModal === 'function') closeDetailsModal();
            this.cancelEdit();
            
            document.getElementById('exp-supplier').value = '';
            document.getElementById('exp-file').value = '';
            document.getElementById('exp-amount').value = '0';
            document.getElementById('exp-discount').value = '0';
            document.getElementById('exp-paid').value = '0';
            if (document.getElementById('exp-cash')) document.getElementById('exp-cash').value = '';
            if (document.getElementById('exp-transfer')) document.getElementById('exp-transfer').value = '';
            
            this.calc();
            this.renderList();
            
            const modal = document.getElementById('expenses-modal');
            if (modal) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    document.getElementById('expenses-modal-content').classList.remove('scale-95');
                }, 10);
            }
        },

        closeModal: function() {
            const fileDisplay = document.getElementById('exp-file-display');
            if (fileDisplay) fileDisplay.innerHTML = '';
            const modal = document.getElementById('expenses-modal');
            if (modal) {
                modal.classList.add('opacity-0');
                document.getElementById('expenses-modal-content').classList.add('scale-95');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        },

        calc: function() {
            const amount = Math.max(0, parseFloat(document.getElementById('exp-amount').value) || 0);
            const discount = Math.max(0, parseFloat(document.getElementById('exp-discount').value) || 0);
            const afterDiscount = Math.max(0, amount - discount);
            document.getElementById('exp-after-discount').value = afterDiscount;
            
            const taxAuto = document.getElementById('exp-tax-auto').checked;
            const VAT_RATE = 0.15;
            let tax = 0;
            
            if (taxAuto) {
                tax = afterDiscount * VAT_RATE;
                document.getElementById('exp-tax').value = tax.toFixed(2);
            } else {
                tax = Math.max(0, parseFloat(document.getElementById('exp-tax').value) || 0);
            }
            
            document.getElementById('exp-total').value = (afterDiscount + tax).toFixed(2);
        },

        toggleTaxMode: function() {
            const auto = document.getElementById('exp-tax-auto').checked;
            document.getElementById('exp-tax').readOnly = auto;
            this.calc();
        },

        renderList: function() {
            const listEl = document.getElementById('expenses-list');
            const totalEl = document.getElementById('exp-list-total');
            if (!listEl) return;
            
            const exps = (window.currentSelectedOrder && window.currentSelectedOrder.expenses) || [];
            
            if (exps.length === 0) {
                listEl.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">لا توجد مصروفات مسجلة</p>';
                if (totalEl) totalEl.innerText = 'الإجمالي: 0 ريال';
                return;
            }
            
            let total = 0;
            
            // UI Generation with template literals (Rule #3)
            listEl.innerHTML = exps.map((exp, idx) => {
                const gross = parseFloat(exp.total ?? exp.amount) || 0;
                const linkedReturnsTotal = (typeof getLinkedReturnsTotal === 'function') ? getLinkedReturnsTotal(window.currentSelectedOrder, idx) : 0;
                const amt = gross - linkedReturnsTotal;
                total += amt;
                
                let methodBadges = '';
                if (exp.cashPaid > 0) methodBadges += `<span class="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-bold">💵 ${exp.cashPaid}</span>`;
                if (exp.transferPaid > 0) methodBadges += `<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-bold">🏦 ${exp.transferPaid}</span>`;
                
                let attachIcon = '';
                if (exp.attachment) {
                    const link = typeof resolveAttachLink === 'function' ? resolveAttachLink(exp.attachment.link || exp.attachment.data || exp.attachment.url, 'المصروفات') : '';
                    if (link) {
                        attachIcon = `<button onclick="openPreviewModal('${link}', 'مرفق المصروف')" class="text-orange-500 hover:text-orange-700 transition" data-tip="عرض المرفق"><i class="fa-solid fa-eye"></i></button>`;
                    } else {
                        attachIcon = `<i class="fa-solid fa-paperclip text-slate-400"></i>`;
                    }
                }
                
                let claimTag = '';
                if (exp.claimId && Array.isArray(window.SaddahDB.data.claims)) {
                    const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
                    if (claim) {
                        const emp = typeof esc === 'function' ? esc(claim.employee || 'موظف') : (claim.employee || 'موظف');
                        const settled = claim.status === 'settled' || claim.batchId;
                        claimTag = settled
                            ? `<span class="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 font-bold whitespace-nowrap"><i class="fa-solid fa-hand-holding-dollar"></i> مطالبة: ${emp} ✓</span>`
                            : `<span class="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 font-bold whitespace-nowrap"><i class="fa-solid fa-hand-holding-dollar"></i> مطالبة: ${emp}</span>`;
                    }
                }
                
                let returnBadge = '';
                if (linkedReturnsTotal > 0) {
                    returnBadge = `<span class="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-bold whitespace-nowrap"><i class="fa-solid fa-rotate-left"></i> مرتجع: ${linkedReturnsTotal.toFixed(0)} ر.س</span>`;
                }
                
                return `
                    <div class="bg-white border ${returnBadge ? 'border-amber-200' : (claimTag ? 'border-purple-200' : 'border-slate-200')} rounded-xl p-3 flex items-center justify-between gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-sm text-slate-700 truncate">${exp.desc || exp.name || 'مصروف'}</div>
                            <div class="flex gap-1 mt-1 flex-wrap items-center">${claimTag}${returnBadge}${methodBadges} ${attachIcon}</div>
                        </div>
                        ${linkedReturnsTotal > 0
                            ? `<div class="shrink-0 text-left leading-none"><div class="text-[10px] text-slate-400 line-through">${gross.toFixed(0)}</div><div class="text-red-600 font-black text-sm mt-0.5">${amt.toFixed(0)} ر.س</div></div>`
                            : `<div class="text-red-600 font-black text-sm shrink-0">${amt.toFixed(0)} ر.س</div>`}
                        <button onclick="typeof openLinkedReturnModal === 'function' && openLinkedReturnModal(${idx})" title="تسجيل مرتجع على هذا المصروف" class="text-amber-400 hover:text-amber-600 transition shrink-0"><i class="fa-solid fa-rotate-left"></i></button>
                        <button onclick="OrderActions.Expenses.edit(${idx})" title="تعديل المصروف" class="text-slate-400 hover:text-orange-500 transition shrink-0"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="OrderActions.Expenses.delete(${idx}, this)" title="حذف المصروف" class="text-slate-300 hover:text-red-500 transition shrink-0"><i class="fa-solid fa-trash-can"></i></button>
                    </div>`;
            }).join('');
            
            if (totalEl) totalEl.innerText = `الإجمالي: ${total.toFixed(0)} ريال`;
        },

        edit: function(idx) {
            if (!window.currentSelectedOrder || !window.currentSelectedOrder.expenses) return;
            const exp = window.currentSelectedOrder.expenses[idx];
            if (!exp) return;
            
            this._editingIndex = idx;
            document.getElementById('exp-supplier').value = exp.desc || exp.name || '';
            document.getElementById('exp-amount').value   = exp.amount || exp.total || 0;
            document.getElementById('exp-discount').value = exp.discount || 0;
            if (document.getElementById('exp-date')) {
                document.getElementById('exp-date').value = exp.date ? exp.date.split('T')[0] : new Date().toISOString().split('T')[0];
            }
            
            document.getElementById('exp-tax-auto').checked = false;
            this.toggleTaxMode();
            
            const taxVal = (parseFloat(exp.total)||0) - ((parseFloat(exp.amount)||0) - (parseFloat(exp.discount)||0));
            document.getElementById('exp-tax').value = taxVal > 0 ? taxVal.toFixed(2) : 0;
            this.calc();
            
            document.getElementById('exp-paid').value = exp.paid || exp.total || 0;
            if (document.getElementById('exp-cash')) document.getElementById('exp-cash').value = exp.cashPaid || '';
            if (document.getElementById('exp-transfer')) document.getElementById('exp-transfer').value = exp.transferPaid || '';
            document.getElementById('exp-file').value = '';
            
            const claimChk = document.getElementById('track-expense-is-claim');
            const empBox   = document.getElementById('track-expense-employee-container');
            const empInput = document.getElementById('track-expense-employee-name');
            
            if (exp.claimId && Array.isArray(window.SaddahDB.data.claims)) {
                const claim = window.SaddahDB.data.claims.find(c => String(c.id) === String(exp.claimId));
                if (claim) {
                    if (claimChk) claimChk.checked = true;
                    if (empInput) empInput.value = claim.employee || '';
                    if (empBox) empBox.classList.remove('hidden');
                } else {
                    if (claimChk) claimChk.checked = false;
                    if (empInput) empInput.value = '';
                    if (empBox) empBox.classList.add('hidden');
                }
            } else {
                if (claimChk) claimChk.checked = false;
                if (empInput) empInput.value = '';
                if (empBox) empBox.classList.add('hidden');
            }
            
            const btn = document.querySelector('#expenses-modal button[onclick*="save"]');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تحديث المصروف';
            document.getElementById('exp-supplier').scrollIntoView({ behavior:'smooth', block:'center' });
            document.getElementById('exp-supplier').focus();
        },

        cancelEdit: function() {
            this._editingIndex = null;
            const btn = document.querySelector('#expenses-modal button[onclick*="save"]');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> إضافة المصروف للطلب';
        },

        save: async function(btn) {
            // سنستخدم الدالة القديمة مؤقتاً لتجنب تعقيد I/O الملفات الكبير الآن
            // ولضمان ثبات النظام 100% أثناء نقل الأقسام
            if (typeof window.saveExpenseToOrder === 'function') {
                window.editingExpenseIndex = this._editingIndex; // تزامن المتغيرات
                await window.saveExpenseToOrder(btn);
                this._editingIndex = window.editingExpenseIndex; // استرداد التزامن
                // تحديث الواجهة الخاصة بالحاوية
                this.renderList();
            }
        },

        delete: async function(idx, btn) {
            if (typeof window.deleteExpenseFromOrder === 'function') {
                await window.deleteExpenseFromOrder(idx, btn);
                this.renderList();
            }
        }
    },

    // =========================================================
    // حاوية 2: المرتجعات والتأمين (Returns Module)
    // =========================================================
    Returns: {
        processConfiscatedInsurance: function(amount, orderId) {
            amount = parseFloat(amount) || 0;
            if (amount <= 0) return;

            if (!window.SaddahDB.data.portfolio) window.SaddahDB.data.portfolio = {};
            if (!window.SaddahDB.data.portfolio.confiscated_insurances) {
                window.SaddahDB.data.portfolio.confiscated_insurances = 0;
            }

            window.SaddahDB.data.portfolio.confiscated_insurances += amount;
            // يجب استدعاء window.SaddahDB.save() بعد استخدام هذا الـ Container
        }
    },

    // =========================================================
    // حاوية 3: التكاليف الإضافية (Extra Costs Module)
    // =========================================================
    ExtraCosts: {
        openModal: function() {
            if (typeof closeDetailsModal === 'function') closeDetailsModal();
            const modal = document.getElementById('extra-modal');
            if (modal) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    document.getElementById('extra-modal-content').classList.remove('scale-95');
                }, 10);
            }
        },

        closeModal: function() {
            const modal = document.getElementById('extra-modal');
            if (modal) {
                modal.classList.add('opacity-0');
                document.getElementById('extra-modal-content').classList.add('scale-95');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        },

        uploadReceipt: async function(inputId, label, amount, oldFileName) {
            if (amount <= 0) return oldFileName || '';
            const fileInput = document.getElementById(inputId);
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                if (!oldFileName && amount > 0) {
                    const ok = confirm("لم يتم إرفاق إيصال لـ " + label + " بقيمة " + amount + ". هل تريد المتابعة بدون إيصال؟");
                    if (!ok) throw new Error("يرجى إرفاق الإيصال.");
                }
                return oldFileName || '';
            }
            if (typeof saveDocumentToOrderFS !== 'function') return oldFileName || '';
            const file = fileInput.files[0];
            const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
            const safe = label.replace(/[\\/:*?"<>|]/g, '-').trim();
            const fileName = `${safe} - ${amount} ريال.${ext}`;

            if (oldFileName && oldFileName !== fileName && typeof deleteDocumentFromOrderFS === 'function') {
                try { await deleteDocumentFromOrderFS(window.currentSelectedOrder, oldFileName, "الفواتير الإضافية"); } catch(e) {}
            }
            const ok = await saveDocumentToOrderFS(window.currentSelectedOrder, file, fileName, "الفواتير الإضافية");
            if (!ok) throw new Error("فشل حفظ إيصال " + label);
            return fileName;
        },

        _upsertClaim: function(kind, typeLabel, employee, amount, fileLink, existingClaimId) {
            if (!window.SaddahDB.data.claims) window.SaddahDB.data.claims = [];
            const claims = window.SaddahDB.data.claims;
            const orderId = window.currentSelectedOrder.id;
            const clientName = window.currentSelectedOrder.client?.name || 'عميل';
            const orderNum = '#' + String(orderId).slice(-4);
            const title = `${typeLabel} — ${clientName} (${orderNum})`;
            const desc = `${typeLabel} لطلب ${clientName} ${orderNum}`;
            
            let claim = null;
            if (existingClaimId) {
                claim = claims.find(c => String(c.id) === String(existingClaimId));
            }
            if (!claim) {
                claim = claims.find(c => c.orderId == orderId && c.kind === kind);
            }
            
            if (!employee || amount <= 0) {
                if (claim) {
                    const i = claims.indexOf(claim);
                    if (i > -1) claims.splice(i, 1);
                }
                return null;
            }
            if (claim) {
                claim.title = title;
                claim.desc = desc;
                claim.type = typeLabel;
                claim.clientName = clientName;
                claim.employee = employee;
                claim.amount = amount;
                if (fileLink) claim.fileLink = fileLink;
                return claim.id;
            } else {
                const newId = String(Date.now()) + Math.floor(Math.random() * 1000);
                claims.push({
                    id: newId,
                    orderId: orderId,
                    clientName: clientName,
                    kind: kind,
                    source: 'extra',
                    title: title,
                    desc: desc,
                    type: typeLabel,
                    amount: amount,
                    employee: employee,
                    status: 'pending',
                    date: new Date().toISOString().split('T')[0],
                    fileLink: fileLink || ''
                });
                return newId;
            }
        },

        save: async function(btnElement) {
            return await OrderActions.execute(btnElement, {
                saveDB: true,
                successMsg: 'تم حفظ التكاليف الإضافية'
            }, async () => {
                const order = window.currentSelectedOrder;
                if (!order) throw new Error("لا يوجد طلب محدد");
                if (!order.financials) order.financials = {};
                if (!order.extraFinancials) order.extraFinancials = {};
                
                const extDelivery = Math.max(0, parseFloat(document.getElementById('extra-ext-delivery')?.value) || 0);
                const whDelivery  = Math.max(0, parseFloat(document.getElementById('extra-wh-delivery')?.value) || 0);
                const fuel        = Math.max(0, parseFloat(document.getElementById('extra-fuel')?.value) || 0);
                if (extDelivery < 0 || whDelivery < 0 || fuel < 0) throw new Error("القيم لا يمكن أن تكون سالبة");
                
                const ex = order.extraFinancials;
                const extReceipt = await this.uploadReceipt('extra-ext-file', 'توصيل خارجي', extDelivery, ex.externalDeliveryReceipt);
                const whReceipt  = await this.uploadReceipt('extra-wh-file', 'تنزيل مستودع', whDelivery, ex.warehouseDeliveryReceipt);
                
                ex.externalDelivery  = extDelivery;
                ex.warehouseDelivery = whDelivery;
                ex.abdulrazzaqFuel   = fuel; // Fuel exception: deducted from operational share
                if (extReceipt) ex.externalDeliveryReceipt = extReceipt;
                if (whReceipt)  ex.warehouseDeliveryReceipt = whReceipt;
                
                const extIsClaim = document.getElementById('extra-ext-is-claim')?.checked;
                const extEmp     = document.getElementById('extra-ext-emp')?.value.trim();
                ex.extClaimId = this._upsertClaim('externalDelivery', 'توصيل خارجي', extIsClaim ? extEmp : '', extDelivery, extReceipt || ex.externalDeliveryReceipt, ex.extClaimId);
                
                const whIsClaim = document.getElementById('extra-wh-is-claim')?.checked;
                const whEmp     = document.getElementById('extra-wh-emp')?.value.trim();
                ex.whClaimId = this._upsertClaim('warehouseDelivery', 'تنزيل مستودع', whIsClaim ? whEmp : '', whDelivery, whReceipt || ex.warehouseDeliveryReceipt, ex.whClaimId);
                
                this.closeModal();
            });
        }
    },

    // =========================================================
    // حاوية 4: إثبات الدفع (Payment Proof Module)
    // =========================================================
    Payments: {
        _editingIndex: null,

        openModal: function() {
            if (typeof closeDetailsModal === 'function') closeDetailsModal();
            this.cancelEdit();
            const modal = document.getElementById('payments-modal');
            if (modal) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    document.getElementById('payments-modal-content').classList.remove('scale-95');
                }, 10);
            }
            if (typeof renderPaymentsSummary === 'function') renderPaymentsSummary();
            if (typeof renderPaymentsList === 'function') renderPaymentsList();
        },

        closeModal: function() {
            const modal = document.getElementById('payments-modal');
            if (modal) {
                modal.classList.add('opacity-0');
                document.getElementById('payments-modal-content').classList.add('scale-95');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        },

        cancelEdit: function() {
            this._editingIndex = null;
            const btn = document.querySelector('#payments-modal button[onclick="savePaymentToOrder(this)"]');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> إضافة الدفعة';
            if (document.getElementById('pay-desc')) document.getElementById('pay-desc').value = 'عربون';
            if (document.getElementById('pay-amount')) document.getElementById('pay-amount').value = '0';
            if (document.getElementById('pay-method')) document.getElementById('pay-method').value = 'كاش';
            if (document.getElementById('pay-date')) document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
            if (document.getElementById('pay-file')) document.getElementById('pay-file').value = '';
            
            // Uncheck all chips
            document.querySelectorAll('.pay-chip').forEach(c => {
                c.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
                c.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
                c.dataset.checked = 'false';
            });
        }
    , 
        edit: function(idx) {
            const order = window.currentSelectedOrder;
            if (!order || !order.payments || !order.payments[idx]) return;
            const pay = order.payments[idx];
            this._editingIndex = idx;
            document.getElementById('pay-desc').value = pay.desc || 'عربون';
            document.getElementById('pay-amount').value = pay.amount || 0;
            document.getElementById('pay-method').value = pay.method || 'كاش';
            document.getElementById('pay-date').value = pay.date ? pay.date.split('T')[0] : new Date().toISOString().split('T')[0];
            document.getElementById('pay-file').value = '';
            
            // Set chips
            if (typeof setPaymentChipsFromDesc === 'function') setPaymentChipsFromDesc(pay.desc);
            
            const btn = document.querySelector('#payments-modal button[onclick="savePaymentToOrder(this)"]');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تحديث الدفعة';
        },

        delete: async function(idx, btnElement) {
            return await OrderActions.execute(btnElement, {
                confirmMsg: 'حذف إثبات الدفع هذا؟ سيتم حذفه من الملفات أيضاً.',
                saveDB: true,
                successMsg: 'تم حذف إثبات الدفع'
            }, async () => {
                const order = window.currentSelectedOrder;
                if (!order || !order.payments) return;
                const pay = order.payments[idx];
                
                // Delete file from FS
                const fileName = pay.attachment && (pay.attachment.name || pay.attachment.data);
                if (fileName && typeof deleteDocumentFromOrderFS === 'function') {
                    try { await deleteDocumentFromOrderFS(order, fileName, "إثبات الدفع"); } catch(e) {}
                }
                
                order.payments.splice(idx, 1);
                
                if (this._editingIndex === idx) this.cancelEdit();
                else if (this._editingIndex !== null && this._editingIndex > idx) this._editingIndex--;
                
                if (typeof renderPaymentsList === 'function') renderPaymentsList();
                if (typeof renderPaymentsSummary === 'function') renderPaymentsSummary();
            });
        },

        save: async function(btnElement) {
            return await OrderActions.execute(btnElement, {
                saveDB: true,
                successMsg: 'تم حفظ الدفعة'
            }, async () => {
                const order = window.currentSelectedOrder;
                if (!order) throw new Error("لا يوجد طلب محدد");
                
                let desc = document.getElementById('pay-desc')?.value.trim() || 'دفعة';
                const checkedChips = typeof getCheckedChips === 'function' ? getCheckedChips() : [];
                if (checkedChips.length > 0) desc = checkedChips.join(' + ');
                
                const amount = parseFloat(document.getElementById('pay-amount')?.value) || 0;
                if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من الصفر");
                
                const method = document.getElementById('pay-method')?.value || 'كاش';
                const pDate = document.getElementById('pay-date')?.value || new Date().toISOString().split('T')[0];
                
                if (!order.payments) order.payments = [];
                const isEditing = this._editingIndex !== null && order.payments[this._editingIndex];
                const oldPay = isEditing ? order.payments[this._editingIndex] : null;
                
                const fileInput = document.getElementById('pay-file');
                let newFileName = oldPay && oldPay.attachment ? (oldPay.attachment.name || oldPay.attachment.data) : '';
                
                if (fileInput && fileInput.files && fileInput.files.length > 0) {
                    if (typeof saveDocumentToOrderFS === 'function') {
                        const file = fileInput.files[0];
                        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
                        const safe = desc.replace(/[\\/:*?"<>|]/g, '-').trim();
                        newFileName = `إثبات - ${safe} - ${amount} ريال.${ext}`;
                        
                        if (oldPay && oldPay.attachment && (oldPay.attachment.name || oldPay.attachment.data) !== newFileName) {
                            try { await deleteDocumentFromOrderFS(order, oldPay.attachment.name || oldPay.attachment.data, "إثبات الدفع"); } catch(e) {}
                        }
                        const ok = await saveDocumentToOrderFS(order, file, newFileName, "إثبات الدفع");
                        if (!ok) throw new Error("فشل حفظ الملف المرفق");
                    }
                }
                
                const entry = { desc, amount, method, date: pDate, attachment: null };
                if (newFileName) {
                    entry.attachment = { name: newFileName, link: `saddah://${order.id}/إثبات الدفع/${newFileName}` };
                }
                
                if (isEditing) {
                    order.payments[this._editingIndex] = entry;
                } else {
                    order.payments.push(entry);
                }
                
                this.cancelEdit();
                if (typeof renderPaymentsList === 'function') renderPaymentsList();
                if (typeof renderPaymentsSummary === 'function') renderPaymentsSummary();
            });
        } 
    },

    // =========================================================
    // حاوية 5: تفاصيل التقرير (Report Details Module)
    // =========================================================
    Report: {
        update: async function(btnElement) {
            const order = window.currentSelectedOrder;
            if (!order) return;
            const current = order.reportNotes || '';
            const notes = prompt('الرجاء إدخال ملاحظات / تفاصيل التقرير للطلب:', current);
            if (notes === null) return;
            
            return await OrderActions.execute(btnElement, {
                saveDB: true,
                successMsg: 'تم تحديث تفاصيل التقرير'
            }, async () => {
                order.reportNotes = notes;
            });
        }
    },

    // =========================================================
    // حاوية 6: عرض الفاتورة (Invoice Module)
    // =========================================================
    Invoice: {
        open: function() {
            const order = window.currentSelectedOrder;
            if (!order) {
                if (typeof showToast === 'function') showToast('لا يوجد طلب محدد', 'error');
                else alert('لا يوجد طلب محدد');
                return;
            }
            localStorage.setItem('saddah_invoice_order_id', order.id);
            window.open(window.SaddahBase + '/pages/prints/invoice_print/invoice_print.html', '_blank');
        }
    },

    // =========================================================
    // حاوية 7: عرض العقد (Contract Module)
    // =========================================================
    Contract: {
        open: function() {
            const order = window.currentSelectedOrder;
            if (!order) {
                if (typeof showToast === 'function') showToast('لا يوجد طلب محدد', 'error');
                else alert('لا يوجد طلب محدد');
                return;
            }
            localStorage.setItem('saddah_invoice_order_id', order.id);
            window.open(window.SaddahBase + '/pages/prints/invoice_print/invoice_print.html?mode=contract', '_blank');
        }
    },

    // =========================================================
    // حاوية 8: مجلد الطلب (Order Folder Module)
    // =========================================================
    Folder: {
        open: function() {
            const order = window.currentSelectedOrder;
            if (!order) {
                if (typeof showToast === 'function') showToast('لا يوجد طلب محدد', 'error');
                else alert('لا يوجد طلب محدد');
                return;
            }
            if (typeof renderOrderFolder === 'function') {
                renderOrderFolder(order);
            } else {
                if (typeof showToast === 'function') showToast('ميزة مجلد الطلب غير متوفرة حالياً.', 'warning');
                else alert('ميزة مجلد الطلب غير متوفرة حالياً.');
            }
        }
    },

    // =========================================================
    // حاوية 9: تأكيد الجرد (Inventory Confirmation Module)
    // =========================================================
    Inventory: {
        confirm: async function(btnElement) {
            return await OrderActions.execute(btnElement, {
                requiresAdmin: true,
                confirmMsg: "تأكيد جرد هذا الطلب؟\nسيتم نقله لحالة 'تم الجرد' ولن تتمكن من تعديله بعد الآن.",
                saveDB: true,
                successMsg: 'تم تأكيد الجرد بنجاح'
            }, async () => {
                const order = window.currentSelectedOrder;
                if (!order) throw new Error("لا يوجد طلب محدد");
                order.status = 'تم الجرد';
                order.auditedAt = new Date().toISOString();
                
                // Move folder in FS if fsHelpers is available
                if (typeof fsHelpers !== 'undefined' && fsHelpers.moveOrderFolderToAudited) {
                    try { await fsHelpers.moveOrderFolderToAudited(order); } catch(e) {}
                }
                
                // Close modal and refresh UI
                if (typeof closeDetailsModal === 'function') closeDetailsModal();
                if (typeof loadAndRenderOrders === 'function') loadAndRenderOrders();
            });
        }
    },

    // =========================================================
    // حاوية 10: إلغاء الطلب (Cancel Order Module)
    // =========================================================
    Cancel: {
        cancel: async function(btnElement) {
            return await OrderActions.execute(btnElement, {
                requiresAdmin: true,
                confirmMsg: "هل أنت متأكد من إلغاء هذا الطلب؟ سيتم خصم العربون وتصفير المتبقي.",
                saveDB: true,
                successMsg: 'تم إلغاء الطلب ونقله للأرشيف'
            }, async () => {
                const order = window.currentSelectedOrder;
                if (!order) throw new Error("لا يوجد طلب محدد");
                
                order.status = 'ملغي';
                
                // Archive order
                if (!Array.isArray(window.SaddahDB.data.archive)) window.SaddahDB.data.archive = [];
                window.SaddahDB.data.archive.push(order);
                
                // Remove from active orders array (assuming currentOrders points to window.SaddahDB.data.orders)
                const orders = window.SaddahDB.data.orders;
                const idx = orders.findIndex(o => o.id == order.id);
                if (idx > -1) {
                    orders.splice(idx, 1);
                    // Crucial: Must reassign for state mutability rule
                    window.SaddahDB.data.orders = [...orders]; 
                }
                
                // Rename folder in FS
                if (typeof applyCancellationToFolderFS === 'function') {
                    try { await applyCancellationToFolderFS(order); } catch(e) {}
                }
                
                // Close modal and refresh UI
                if (typeof closeDetailsModal === 'function') closeDetailsModal();
                if (typeof loadAndRenderOrders === 'function') loadAndRenderOrders();
            });
        }
    }
};

