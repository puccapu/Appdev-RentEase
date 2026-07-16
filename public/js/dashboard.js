(function () {
    'use strict';

    // ============================================================
    //  REST API CONFIGURATION
    // ============================================================
    const API_BASE_URL = '/api'; // ← Update with your API base URL

    // --- API Service ---
    const ApiService = {
        async _fetch(endpoint, options = {}) {
            const url = `${API_BASE_URL}${endpoint}`;
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers,
            };
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }
            return response.json();
        },
        getUnits:       ()         => ApiService._fetch('/units'),
        createUnit:     (data)     => ApiService._fetch('/units',          { method: 'POST',   body: JSON.stringify(data) }),
        updateUnit:     (id, data) => ApiService._fetch(`/units/${id}`,    { method: 'PUT',    body: JSON.stringify(data) }),
        deleteUnit:     (id)       => ApiService._fetch(`/units/${id}`,    { method: 'DELETE' }),
        getLeases:      ()         => ApiService._fetch('/leases'),
        createLease:    (data)     => ApiService._fetch('/leases',         { method: 'POST',   body: JSON.stringify(data) }),
        updateLease:    (id, data) => ApiService._fetch(`/leases/${id}`,   { method: 'PUT',    body: JSON.stringify(data) }),
        deleteLease:    (id)       => ApiService._fetch(`/leases/${id}`,   { method: 'DELETE' }),
        getTenants:     ()         => ApiService._fetch('/tenants'),
        createTenant:   (data)     => ApiService._fetch('/tenants',        { method: 'POST',   body: JSON.stringify(data) }),
        updateTenant:   (id, data) => ApiService._fetch(`/tenants/${id}`,  { method: 'PUT',    body: JSON.stringify(data) }),
        deleteTenant:   (id)       => ApiService._fetch(`/tenants/${id}`,  { method: 'DELETE' }),
        getPayments:    ()         => ApiService._fetch('/payments'),
        createPayment:  (data)     => ApiService._fetch('/payments',       { method: 'POST',   body: JSON.stringify(data) }),
        updatePayment:  (id, data) => ApiService._fetch(`/payments/${id}`, { method: 'PUT',    body: JSON.stringify(data) }),
        deletePayment:  (id)       => ApiService._fetch(`/payments/${id}`, { method: 'DELETE' }),
        getEmployees:   ()         => ApiService._fetch('/employees'),
        createEmployee: (data)     => ApiService._fetch('/employees',         { method: 'POST',   body: JSON.stringify(data) }),
        updateEmployee: (id, data) => ApiService._fetch(`/employees/${id}`,   { method: 'PUT',    body: JSON.stringify(data) }),
        deleteEmployee: (id)       => ApiService._fetch(`/employees/${id}`,   { method: 'DELETE' }),
        getRecentActivity: ()      => ApiService._fetch('/recent-activity'),
    };

    // ============================================================
    //  DATA LAYER
    // ============================================================
    let units     = [];
    let leases    = [];
    let tenants   = [];
    let payments  = [];
    let employees = [];
    let recentActivity = [];

    // ---------- Helpers ----------
    function formatCurrency(amount) {
        return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function timeAgo(timestamp) {
        if (!timestamp) return '';
        const then = new Date(timestamp);
        const diffSec = Math.floor((Date.now() - then.getTime()) / 1000);
        if (diffSec < 0)   return 'just now';
        if (diffSec < 60)  return 'just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60)  return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24)   return `${diffHr}h ago`;
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7)   return `${diffDay}d ago`;
        return then.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    }

    function getStatusBadge(status) {
        const map = {
            'Available':  'available',
            'Occupied':   'occupied',
            'Paid':       'paid',
            'Overdue':    'overdue',
            'Pending':    'pending',
            'Active':     'active-lease',
            'Expired':    'expired',
            'Admin':      'admin',
            'Manager':    'manager',
            'Staff':      'staff',
        };
        const cls = map[status] || 'pending';
        return `<span class="badge ${cls}">${status}</span>`;
    }

    // ============================================================
    //  DATA MANAGER
    // ============================================================
    // IDs coming from the MySQL API are numbers, but every id read back out of the
    // DOM (data-edit-unit="...", hidden form fields, etc.) is always a string. Strict
    // === comparisons between the two silently fail (e.g. "Edit" buttons doing
    // nothing, "Tenant not found"). Normalize every id / foreign-key id to a string
    // right after loading so comparisons work consistently everywhere.
    function normalizeIds() {
        const toStr = v => (v === null || v === undefined || v === '') ? null : String(v);
        units     = (units     || []).map(u => ({ ...u, id: toStr(u.id) }));
        leases    = (leases    || []).map(l => ({ ...l, id: toStr(l.id), unitId: toStr(l.unitId) }));
        tenants   = (tenants   || []).map(t => ({ ...t, id: toStr(t.id), unitId: toStr(t.unitId) }));
        payments  = (payments  || []).map(p => ({ ...p, id: toStr(p.id) }));
        employees = (employees || []).map(e => ({ ...e, id: toStr(e.id) }));
    }

    const DataManager = {
        async loadAll() {
            const [u, l, t, p, e, ra] = await Promise.all([
                ApiService.getUnits(), ApiService.getLeases(), ApiService.getTenants(),
                ApiService.getPayments(), ApiService.getEmployees(), ApiService.getRecentActivity()
            ]);
            units = u || []; leases = l || []; tenants = t || [];
            payments = p || []; employees = e || []; recentActivity = ra || [];
            normalizeIds();
        },

        async saveUnit(data) {
            if (data.id) {
                const r = await ApiService.updateUnit(data.id, data);
                if (r) { const i = units.findIndex(u => u.id === data.id); if (i !== -1) units[i] = r; return r; }
            } else {
                const r = await ApiService.createUnit(data);
                if (r) { units.push(r); return r; }
            }
            return data;
        },
        async deleteUnit(id) {
            await ApiService.deleteUnit(id);
            units   = units.filter(u => u.id !== id);
            tenants = tenants.filter(t => t.unitId !== id);
        },

        async saveLease(data) {
            if (data.id) {
                const r = await ApiService.updateLease(data.id, data);
                if (r) { const i = leases.findIndex(l => l.id === data.id); if (i !== -1) leases[i] = r; return r; }
            } else {
                const r = await ApiService.createLease(data);
                if (r) { leases.push(r); return r; }
            }
            return data;
        },
        async deleteLease(id) {
            await ApiService.deleteLease(id);
            leases = leases.filter(l => l.id !== id);
        },

        async saveTenant(data) {
            if (data.id) {
                const r = await ApiService.updateTenant(data.id, data);
                if (r) { const i = tenants.findIndex(t => t.id === data.id); if (i !== -1) tenants[i] = r; return r; }
            } else {
                const r = await ApiService.createTenant(data);
                if (r) { tenants.push(r); return r; }
            }
            return data;
        },
        async deleteTenant(id) {
            await ApiService.deleteTenant(id);
            tenants = tenants.filter(t => t.id !== id);
        },

        async savePayment(data) {
            if (data.id) {
                const r = await ApiService.updatePayment(data.id, data);
                if (r) { const normalized = { ...r, id: String(r.id) }; const i = payments.findIndex(p => p.id === data.id); if (i !== -1) payments[i] = normalized; return normalized; }
            } else {
                const r = await ApiService.createPayment(data);
                if (r) { const normalized = { ...r, id: String(r.id) }; payments.push(normalized); return normalized; }
            }
            return data;
        },
        async deletePayment(id) {
            await ApiService.deletePayment(id);
            payments = payments.filter(p => p.id !== id);
        },

        async saveEmployee(data) {
            if (data.id) {
                const r = await ApiService.updateEmployee(data.id, data);
                if (r) { const i = employees.findIndex(e => e.id === data.id); if (i !== -1) employees[i] = r; return r; }
            } else {
                const r = await ApiService.createEmployee(data);
                if (r) { employees.push(r); return r; }
            }
            return data;
        },
        async deleteEmployee(id) {
            await ApiService.deleteEmployee(id);
            employees = employees.filter(e => e.id !== id);
        },
    };

    // ============================================================
    //  TOAST
    // ============================================================
    let toastTimeout = null;

    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const icon  = toast.querySelector('i');
        document.getElementById('toastMessage').textContent = message;
        toast.className = 'toast';
        if (type === 'error')        { toast.classList.add('error');   icon.className = 'fas fa-exclamation-circle'; }
        else if (type === 'warning') { toast.classList.add('warning'); icon.className = 'fas fa-exclamation-triangle'; }
        else                         { icon.className = 'fas fa-check-circle'; }
        clearTimeout(toastTimeout);
        void toast.offsetWidth;
        toast.classList.add('show');
        toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // ============================================================
    //  MODAL HELPERS
    // ============================================================
    function openModal(id)  { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('open'); });
    });
    document.querySelectorAll('[data-close]').forEach(el => {
        el.addEventListener('click', function () { closeModal(this.dataset.close); });
    });

    // ============================================================
    //  RENDER FUNCTIONS
    // ============================================================
    function getTenantForUnit(unitId) {
        const lease = leases.find(l => l.unitId === unitId);
        return lease ? lease.tenant : null;
    }

    // Derives a tenant's currently-leased unit(s) and lease status directly from the
    // leases table (matched by tenant name), instead of relying on the tenant's
    // stored unit_id / lease_status fields, which can go stale as leases are
    // created, renewed, or expire. This keeps the Tenants tab always in sync.
    function getTenantLeaseInfo(tenantName) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tenantLeases = leases.filter(l => l.tenant === tenantName);
        const activeLeases = tenantLeases.filter(l => {
            const start = new Date(l.start + 'T00:00:00');
            const end   = new Date(l.end + 'T00:00:00');
            return start <= today && end >= today;
        });
        const unitNumbers = activeLeases
            .map(l => units.find(u => u.id === l.unitId))
            .filter(Boolean)
            .map(u => u.number);
        let status;
        if (activeLeases.length > 0)      status = 'Active';
        else if (tenantLeases.length > 0) status = 'Expired';
        else                              status = 'Pending';
        return { status, unitNumbers };
    }

    function renderUnits() {
        const tbody = document.getElementById('unitsTableBody');
        const count = document.getElementById('unitCount');
        if (!units || units.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-door-open"></i><p>No units yet.</p></div></td></tr>`;
            count.textContent = '· 0 total'; return;
        }
        count.textContent = `· ${units.length} total`;
        tbody.innerHTML = units.map(u => {
            const tenantName = getTenantForUnit(u.id);
            return `<tr>
                <td><strong>${u.number}</strong></td>
                <td>${u.type}</td>
                <td>${formatCurrency(u.rent)}</td>
                <td>${getStatusBadge(u.status)}</td>
                <td>${tenantName || '—'}</td>
                <td style="text-align:center;">
                    <div class="action-group" style="justify-content:center;">
                        <button class="btn-edit" data-edit-unit="${u.id}"><i class="fas fa-pen"></i></button>
                        <button class="btn-danger" data-delete-unit="${u.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-edit-unit]').forEach(btn => btn.addEventListener('click', function () { openEditUnitModal(this.dataset.editUnit); }));
        tbody.querySelectorAll('[data-delete-unit]').forEach(btn => btn.addEventListener('click', function () { confirmDelete('unit', this.dataset.deleteUnit); }));
    }

    function renderLeases() {
        const tbody = document.getElementById('leasesTableBody');
        const count = document.getElementById('leaseCount');
        if (!leases || leases.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-file-signature"></i><p>No leases yet.</p></div></td></tr>`;
            count.textContent = '· 0 active'; return;
        }
        const active = leases.filter(l => new Date(l.end + 'T00:00:00') >= new Date()).length;
        count.textContent = `· ${active} active`;
        tbody.innerHTML = leases.map(l => {
            const unit = units.find(u => u.id === l.unitId);
            return `<tr>
                <td><strong>${l.id}</strong></td>
                <td>${l.tenant}</td>
                <td>${unit ? unit.number : '—'}</td>
                <td>${formatDate(l.start)}</td>
                <td>${formatDate(l.end)}</td>
                <td>${formatCurrency(l.rent)}</td>
                <td style="text-align:center;">
                    <div class="action-group" style="justify-content:center;">
                        <button class="btn-edit" data-edit-lease="${l.id}"><i class="fas fa-pen"></i></button>
                        <button class="btn-danger" data-delete-lease="${l.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-edit-lease]').forEach(btn => btn.addEventListener('click', function () { openEditLeaseModal(this.dataset.editLease); }));
        tbody.querySelectorAll('[data-delete-lease]').forEach(btn => btn.addEventListener('click', function () { confirmDelete('lease', this.dataset.deleteLease); }));
    }

    function renderTenants() {
        const tbody = document.getElementById('tenantsTableBody');
        const count = document.getElementById('tenantCount');
        if (!tenants || tenants.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>No tenants yet.</p></div></td></tr>`;
            count.textContent = '· 0 active'; return;
        }
        const active = tenants.filter(t => getTenantLeaseInfo(t.name).status === 'Active').length;
        count.textContent = `· ${active} active`;
        tbody.innerHTML = tenants.map(t => {
            const { status, unitNumbers } = getTenantLeaseInfo(t.name);
            const unitDisplay = unitNumbers.length ? unitNumbers.join(', ') : '—';
            return `<tr>
                <td><strong>${t.name}</strong></td>
                <td>${t.email || '—'}</td>
                <td>${t.phone || '—'}</td>
                <td>${unitDisplay}</td>
                <td>${getStatusBadge(status)}</td>
                <td style="text-align:center;">
                    <div class="action-group" style="justify-content:center;">
                        <button class="btn-edit" data-edit-tenant="${t.id}"><i class="fas fa-pen"></i></button>
                        <button class="btn-danger" data-delete-tenant="${t.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-edit-tenant]').forEach(btn => btn.addEventListener('click', function () { openEditTenantModal(this.dataset.editTenant); }));
        tbody.querySelectorAll('[data-delete-tenant]').forEach(btn => btn.addEventListener('click', function () { confirmDelete('tenant', this.dataset.deleteTenant); }));
    }

    function renderPayments() {
        const tbody = document.getElementById('paymentsTableBody');
        const count = document.getElementById('paymentCount');
        if (!payments || payments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-coins"></i><p>No payment records yet.</p></div></td></tr>`;
            count.textContent = '· 0 records'; return;
        }
        count.textContent = `· ${payments.length} records`;
        tbody.innerHTML = payments.map(p => `
            <tr>
                <td><strong>${p.id}</strong></td>
                <td>${formatDate(p.date)}</td>
                <td>${p.tenant}</td>
                <td>${p.unit}</td>
                <td>${formatCurrency(p.amount)}</td>
                <td>${getStatusBadge(p.status)}</td>
                <td style="text-align:center;">
                    <div class="action-group" style="justify-content:center;">
                        <button class="btn-edit" data-edit-payment="${p.id}"><i class="fas fa-pen"></i></button>
                        <button class="btn-danger" data-delete-payment="${p.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        tbody.querySelectorAll('[data-edit-payment]').forEach(btn => btn.addEventListener('click', function () { openEditPaymentModal(this.dataset.editPayment); }));
        tbody.querySelectorAll('[data-delete-payment]').forEach(btn => btn.addEventListener('click', function () { confirmDelete('payment', this.dataset.deletePayment); }));
    }

    function renderEmployees() {
        const tbody = document.getElementById('employeesTableBody');
        const count = document.getElementById('employeeCount');
    
        if (!employees || employees.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="empty-state">
                            <i class="fas fa-user-tie"></i>
                            <p>No employees yet. Click "Add Employee" to get started.</p>
                        </div>
                    </td>
                </tr>
            `;
            count.textContent = '· 0 employees';
            return;
        }
    
        count.textContent = `· ${employees.length} employee${employees.length !== 1 ? 's' : ''}`;
    
        tbody.innerHTML = employees.map(emp => `
            <tr>
                <td><strong>${emp.name}</strong></td>
                <td>${emp.email || '—'}</td>
                <td>${emp.phone || '—'}</td>
                <td>${getStatusBadge(emp.role || 'Staff')}</td>
                <td style="text-align: center;">
                    <div class="action-group" style="justify-content: center;">
                        <button class="btn-edit" data-edit-employee="${emp.id}"><i class="fas fa-pen"></i></button>
                        <button class="btn-danger" data-delete-employee="${emp.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    
        tbody.querySelectorAll('[data-edit-employee]').forEach(btn => {
            btn.addEventListener('click', function () { openEditEmployeeModal(this.dataset.editEmployee); });
        });
        tbody.querySelectorAll('[data-delete-employee]').forEach(btn => {
            btn.addEventListener('click', function () { confirmDelete('employee', this.dataset.deleteEmployee); });
        });
    }

    function renderDashboard() {
        const totalUnits    = units?.length || 0;
        const occupied      = units?.filter(u => u.status === 'Occupied').length || 0;
        const activeTenants = tenants?.filter(t => getTenantLeaseInfo(t.name).status === 'Active').length || 0;
        const totalRent     = leases?.reduce((s, l) => s + Number(l.rent), 0) || 0;
        const totalEmployees= employees?.length || 0;

        document.getElementById('statsGrid').innerHTML = `
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-door-open"></i></div>
                <div class="stat-value">${totalUnits}</div>
                <div class="stat-label">Total Units</div>
                <span class="stat-change"><i class="fas fa-arrow-up"></i> ${units?.filter(u => u.status === 'Available').length || 0} available</span>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-value">${occupied}</div>
                <div class="stat-label">Occupied</div>
                <span class="stat-change warning"><i class="fas fa-arrow-right"></i> ${totalUnits ? Math.round(occupied / totalUnits * 100) : 0}%</span>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-user-friends"></i></div>
                <div class="stat-value">${activeTenants}</div>
                <div class="stat-label">Active Tenants</div>
                <span class="stat-change"><i class="fas fa-arrow-up"></i> ${tenants?.filter(t => getTenantLeaseInfo(t.name).status === 'Pending').length || 0} pending</span>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-user-tie"></i></div>
                <div class="stat-value">${totalEmployees}</div>
                <div class="stat-label">Employees</div>
                <span class="stat-change"><i class="fas fa-arrow-up"></i> team</span>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-credit-card"></i></div>
                <div class="stat-value">${formatCurrency(totalRent)}</div>
                <div class="stat-label">Monthly Rent Roll</div>
                <span class="stat-change danger"><i class="fas fa-arrow-down"></i> ${payments?.filter(p => p.status === 'Overdue').length || 0} overdue</span>
            </div>
        `;

        const ACTIVITY_ICONS = {
            unit:     'fa-door-open',
            tenant:   'fa-user-friends',
            lease:    'fa-file-signature',
            payment:  'fa-coins',
            employee: 'fa-user-tie',
        };
        const ACTION_ICON_OVERRIDE = {
            DELETE: 'fa-trash',
        };

        const list = document.getElementById('activityList');
        list.innerHTML = !recentActivity || recentActivity.length === 0
            ? `<div class="empty-state" style="padding:10px 0;"><p style="font-size:0.85rem;">No recent activity.</p></div>`
            : recentActivity.slice(0, 5).map(a => {
                const icon = ACTION_ICON_OVERRIDE[a.action_type] || ACTIVITY_ICONS[a.entity_type] || 'fa-clock';
                const isDelete = a.action_type === 'DELETE';
                return `
                <div class="activity-item">
                    <div class="activity-icon"><i class="fas ${icon}"></i></div>
                    <div class="activity-content">
                        <div class="title">${a.description}</div>
                        <div class="desc">${a.username || 'Admin'} · ${a.entity_type ? a.entity_type.charAt(0).toUpperCase() + a.entity_type.slice(1) : ''}</div>
                    </div>
                    <div class="activity-time ${isDelete ? 'urgent' : ''}">${timeAgo(a.created_at)}</div>
                </div>
            `;
            }).join('');

        const totalRevenue  = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
        const overdueTotal  = payments?.filter(p => p.status === 'Overdue').reduce((s, p) => s + Number(p.amount), 0) || 0;
        const expiringLeases= leases?.filter(l => { const diff = (new Date(l.end + 'T00:00:00') - new Date()) / 86400000; return diff > 0 && diff <= 30; }).length || 0;

        document.getElementById('reportGrid').innerHTML = `
            <div class="report-card"><div class="num">${formatCurrency(totalRevenue)}</div><div class="label">Total Revenue</div></div>
            <div class="report-card"><div class="num">${totalUnits ? Math.round(occupied / totalUnits * 100) : 0}%</div><div class="label">Occupancy Rate</div></div>
            <div class="report-card"><div class="num">${formatCurrency(overdueTotal)}</div><div class="label">Total Overdue</div></div>
            <div class="report-card"><div class="num">${expiringLeases}</div><div class="label">Leases Ending Soon</div></div>
        `;

        const txBody = document.getElementById('recentTransactionsBody');
        txBody.innerHTML = !payments || payments.length === 0
            ? `<tr><td colspan="5"><div class="empty-state" style="padding:10px 0;"><p style="font-size:0.85rem;">No transactions yet.</p></div></td></tr>`
            : payments.slice().reverse().slice(0, 6).map(p => `
                <tr>
                    <td>${formatDate(p.date)}</td><td>${p.tenant}</td><td>${p.unit}</td>
                    <td>${formatCurrency(p.amount)}</td><td>Rent</td>
                </tr>
            `).join('');
    }

    // ============================================================
    //  CRUD — Units
    // ============================================================
    function openAddUnitModal() {
        document.getElementById('unitModalTitle').textContent = 'Add Unit';
        document.getElementById('unitSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Unit';
        document.getElementById('unitFormId').value = '';
        document.getElementById('unitForm').reset();
        document.getElementById('unitStatus').value = 'Available';
        openModal('unitModal');
    }
    function openEditUnitModal(id) {
        const unit = units.find(u => u.id === id); if (!unit) return;
        document.getElementById('unitModalTitle').textContent = 'Edit Unit';
        document.getElementById('unitSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Unit';
        document.getElementById('unitFormId').value = id;
        document.getElementById('unitNumber').value = unit.number;
        document.getElementById('unitType').value   = unit.type;
        document.getElementById('unitRent').value   = unit.rent;
        document.getElementById('unitStatus').value = unit.status;
        openModal('unitModal');
    }
    async function handleUnitFormSubmit(e) {
        e.preventDefault();
        const id     = document.getElementById('unitFormId').value;
        const number = document.getElementById('unitNumber').value.trim();
        const type   = document.getElementById('unitType').value;
        const rent   = parseFloat(document.getElementById('unitRent').value);
        const status = document.getElementById('unitStatus').value;
        if (!number)         { showToast('Please enter a unit number.', 'error'); return; }
        if (!rent || rent < 0){ showToast('Please enter a valid rent amount.', 'error'); return; }
        try {
            const data = { number, type, rent, status }; if (id) data.id = id;
            await DataManager.saveUnit(data); await DataManager.loadAll(); renderAll();
            closeModal('unitModal'); showToast(`Unit "${number}" ${id ? 'updated' : 'added'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    // ============================================================
    //  CRUD — Leases
    // ============================================================
    function populateLeaseUnitSelect(selectedId) {
        const sel = document.getElementById('leaseUnit');
        const available = units.filter(u => u.status === 'Available' || String(u.id) === String(selectedId));
        sel.innerHTML = '<option value="">— Select a unit —</option>' +
            available.map(u => `<option value="${u.id}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${u.number} (${u.type}) — ${formatCurrency(u.rent)}</option>`).join('');
        if (selectedId && !available.some(u => String(u.id) === String(selectedId))) {
            const occ = units.find(u => String(u.id) === String(selectedId));
            if (occ) sel.innerHTML += `<option value="${occ.id}" selected>${occ.number} (${occ.type}) — ${formatCurrency(occ.rent)}</option>`;
        }
    }
    function openAddLeaseModal() {
        document.getElementById('leaseModalTitle').textContent = 'New Lease';
        document.getElementById('leaseSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Lease';
        document.getElementById('leaseFormId').value = '';
        document.getElementById('leaseForm').reset();
        populateLeaseUnitSelect(null);
        const today = new Date();
        document.getElementById('leaseStart').value = today.toISOString().slice(0, 10);
        document.getElementById('leaseEnd').value   = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
        document.getElementById('leaseUnit').onchange = function () {
            const u = units.find(u => String(u.id) === String(this.value));
            if (u) document.getElementById('leaseRent').value = u.rent;
        };
        openModal('leaseModal');
    }
    function openEditLeaseModal(id) {
        const lease = leases.find(l => l.id === id); if (!lease) return;
        document.getElementById('leaseModalTitle').textContent = 'Edit Lease';
        document.getElementById('leaseSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Lease';
        document.getElementById('leaseFormId').value    = id;
        document.getElementById('leaseTenant').value    = lease.tenant;
        document.getElementById('leaseStart').value     = lease.start;
        document.getElementById('leaseEnd').value       = lease.end;
        document.getElementById('leaseRent').value      = lease.rent;
        populateLeaseUnitSelect(lease.unitId);
        openModal('leaseModal');
    }
    async function handleLeaseFormSubmit(e) {
        e.preventDefault();
        const id     = document.getElementById('leaseFormId').value;
        const tenant = document.getElementById('leaseTenant').value.trim();
        const unitId = document.getElementById('leaseUnit').value;
        const start  = document.getElementById('leaseStart').value;
        const end    = document.getElementById('leaseEnd').value;
        const rent   = parseFloat(document.getElementById('leaseRent').value);
        if (!tenant) { showToast('Please enter tenant name.', 'error'); return; }
        if (!unitId) { showToast('Please select a unit.', 'error'); return; }
        if (!start || !end) { showToast('Please select start and end dates.', 'error'); return; }
        if (new Date(end) < new Date(start)) { showToast('End date must be after start date.', 'error'); return; }
        if (!rent || rent < 0) { showToast('Please enter a valid rent amount.', 'error'); return; }
        try {
            const unit = units.find(u => String(u.id) === String(unitId)); if (!unit) { showToast('Unit not found.', 'error'); return; }
            const data = { tenant, unitId, start, end, rent }; if (id) data.id = id;
            if (!id && unit.status === 'Occupied') { showToast('This unit is already occupied.', 'warning'); return; }
            await DataManager.saveLease(data); await DataManager.loadAll(); renderAll();
            closeModal('leaseModal'); showToast(`Lease for "${tenant}" ${id ? 'updated' : 'created'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    // ============================================================
    //  CRUD — Tenants
    // ============================================================
    function populateTenantUnitSelect(selectedId) {
        const sel = document.getElementById('tenantUnit');
        sel.innerHTML = '<option value="">— None —</option>' +
            units.map(u => `<option value="${u.id}" ${u.id === selectedId ? 'selected' : ''}>${u.number} (${u.type})</option>`).join('');
    }
    function openAddTenantModal() {
        document.getElementById('tenantModalTitle').textContent = 'Add Tenant';
        document.getElementById('tenantSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Tenant';
        document.getElementById('tenantFormId').value = '';
        document.getElementById('tenantForm').reset();
        populateTenantUnitSelect(null);
        document.getElementById('tenantLeaseStatus').value = 'Pending';
        openModal('tenantModal');
    }
    function openEditTenantModal(id) {
        const tenant = tenants.find(t => t.id === id); if (!tenant) { showToast('Tenant not found.', 'error'); return; }
        document.getElementById('tenantModalTitle').textContent = `Edit ${tenant.name}`;
        document.getElementById('tenantSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Tenant';
        document.getElementById('tenantFormId').value        = id;
        document.getElementById('tenantName').value          = tenant.name;
        document.getElementById('tenantEmail').value         = tenant.email || '';
        document.getElementById('tenantPhone').value         = tenant.phone || '';
        document.getElementById('tenantLeaseStatus').value   = tenant.leaseStatus;
        populateTenantUnitSelect(tenant.unitId);
        openModal('tenantModal');
    }
    async function handleTenantFormSubmit(e) {
        e.preventDefault();
        const id          = document.getElementById('tenantFormId').value;
        const name        = document.getElementById('tenantName').value.trim();
        const email       = document.getElementById('tenantEmail').value.trim();
        const phone       = document.getElementById('tenantPhone').value.trim();
        const unitId      = document.getElementById('tenantUnit').value || null;
        const leaseStatus = document.getElementById('tenantLeaseStatus').value;
        if (!name) { showToast('Please enter a name.', 'error'); return; }
        try {
            const data = { name, email, phone, unitId, leaseStatus }; if (id) data.id = id;
            if (id) { const old = tenants.find(t => t.id === id); if (old && old.name !== name) leases.forEach(l => { if (l.tenant === old.name) l.tenant = name; }); }
            await DataManager.saveTenant(data); await DataManager.loadAll(); renderAll();
            closeModal('tenantModal'); showToast(`Tenant "${name}" ${id ? 'updated' : 'registered'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    // ============================================================
    //  CRUD — Payments
    // ============================================================
    // ---------- Tenant Name combobox (Record Payment) ----------
    // Restricts the "Tenant Name" field to registered tenants: typing filters a
    // dropdown of existing tenants, and picking one auto-fills the Unit field
    // from that tenant's currently-leased unit. Free text that doesn't match a
    // registered tenant is rejected on submit (see handlePaymentFormSubmit).
    function renderPaymentTenantSuggestions(query) {
        const list = document.getElementById('paymentTenantList');
        const q = (query || '').trim().toLowerCase();
        const matches = (tenants || [])
            .filter(t => !q || t.name.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, 8);

        if (!tenants || tenants.length === 0) {
            list.innerHTML = `<div class="combobox-empty">No registered tenants yet. Register a tenant first.</div>`;
        } else if (matches.length === 0) {
            list.innerHTML = `<div class="combobox-empty">No matching tenants</div>`;
        } else {
            list.innerHTML = matches.map(t => {
                const { unitNumbers } = getTenantLeaseInfo(t.name);
                const unitHint = unitNumbers.length ? `Unit ${unitNumbers.join(', ')}` : 'No unit assigned';
                return `<div class="combobox-item" data-tenant-id="${t.id}">${t.name}<small>${unitHint}</small></div>`;
            }).join('');
        }
        list.classList.add('open');
        list.querySelectorAll('.combobox-item[data-tenant-id]').forEach(item => {
            // mousedown (not click) fires before the input's blur, so the selection
            // registers before the dropdown gets hidden by the blur handler.
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectPaymentTenant(this.dataset.tenantId);
            });
        });
    }
    function selectPaymentTenant(tenantId) {
        const tenant = tenants.find(t => String(t.id) === String(tenantId));
        if (!tenant) return;
        const input = document.getElementById('paymentTenant');
        input.value = tenant.name;
        input.dataset.confirmedTenant = tenant.name;
        document.getElementById('paymentTenantList').classList.remove('open');
        const { unitNumbers } = getTenantLeaseInfo(tenant.name);
        document.getElementById('paymentUnit').value = unitNumbers.length ? unitNumbers[0] : '';
    }
    function closePaymentTenantList() {
        document.getElementById('paymentTenantList').classList.remove('open');
    }
    (function initPaymentTenantCombobox() {
        const input = document.getElementById('paymentTenant');
        input.addEventListener('input', function () {
            this.dataset.confirmedTenant = '';
            renderPaymentTenantSuggestions(this.value);
        });
        input.addEventListener('focus', function () { renderPaymentTenantSuggestions(this.value); });
        document.addEventListener('click', function (e) {
            if (!document.getElementById('paymentTenantCombobox').contains(e.target)) closePaymentTenantList();
        });
    })();

    function openAddPaymentModal() {
        document.getElementById('paymentModalTitle').textContent = 'Record Payment';
        document.getElementById('paymentSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Payment';
        document.getElementById('paymentFormId').value = '';
        document.getElementById('paymentForm').reset();
        document.getElementById('paymentTenant').dataset.confirmedTenant = '';
        closePaymentTenantList();
        document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10);
        openModal('paymentModal');
    }
    function openEditPaymentModal(id) {
        const payment = payments.find(p => String(p.id) === String(id)); if (!payment) { showToast('Payment not found.', 'error'); return; }
        document.getElementById('paymentModalTitle').textContent = 'Edit Payment';
        document.getElementById('paymentSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Payment';
        document.getElementById('paymentFormId').value   = id;
        document.getElementById('paymentTenant').value   = payment.tenant;
        document.getElementById('paymentTenant').dataset.confirmedTenant = payment.tenant;
        closePaymentTenantList();
        document.getElementById('paymentUnit').value     = payment.unit;
        document.getElementById('paymentDate').value     = payment.date;
        document.getElementById('paymentAmount').value   = payment.amount;
        document.getElementById('paymentStatus').value   = payment.status;
        openModal('paymentModal');
    }
    async function handlePaymentFormSubmit(e) {
        e.preventDefault();
        const id         = document.getElementById('paymentFormId').value;
        const tenantText = document.getElementById('paymentTenant').value.trim();
        const unit       = document.getElementById('paymentUnit').value.trim();
        const date       = document.getElementById('paymentDate').value;
        const amount     = parseFloat(document.getElementById('paymentAmount').value);
        const status     = document.getElementById('paymentStatus').value;
        if (!tenantText) { showToast('Please enter tenant name.', 'error'); return; }
        const matchedTenant = tenants.find(t => t.name.toLowerCase() === tenantText.toLowerCase());
        if (!matchedTenant) { showToast('Please select an existing tenant from the list.', 'error'); return; }
        const tenant = matchedTenant.name;
        if (!unit)   { showToast('Please enter unit number.', 'error'); return; }
        if (!date)   { showToast('Please select a date.', 'error'); return; }
        if (!amount || amount < 0) { showToast('Please enter a valid amount.', 'error'); return; }
        try {
            const data = { tenant, unit, date, amount, status }; if (id) data.id = id;
            await DataManager.savePayment(data); await DataManager.loadAll(); renderAll();
            closeModal('paymentModal'); showToast(`Payment for "${tenant}" ${id ? 'updated' : 'recorded'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    // ============================================================
    //  CRUD — Employees
    // ============================================================
    function openAddEmployeeModal() {
        document.getElementById('employeeModalTitle').textContent = 'Add Employee';
        document.getElementById('employeeSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Employee';
        document.getElementById('employeeFormId').value = '';
        document.getElementById('employeeForm').reset();
        document.getElementById('employeeRole').value = 'Staff';
        openModal('employeeModal');
    }
    function openEditEmployeeModal(id) {
        const emp = employees.find(e => e.id === id);
        if (!emp) { showToast('Employee not found.', 'error'); return; }
        document.getElementById('employeeModalTitle').textContent = `Edit ${emp.name}`;
        document.getElementById('employeeSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Employee';
        document.getElementById('employeeFormId').value  = id;
        document.getElementById('employeeName').value    = emp.name;
        document.getElementById('employeeEmail').value   = emp.email  || '';
        document.getElementById('employeePhone').value   = emp.phone  || '';
        document.getElementById('employeeRole').value    = emp.role   || 'Staff';
        openModal('employeeModal');
    }
    async function handleEmployeeFormSubmit(e) {
        e.preventDefault();
        const id    = document.getElementById('employeeFormId').value;
        const name  = document.getElementById('employeeName').value.trim();
        const email = document.getElementById('employeeEmail').value.trim();
        const phone = document.getElementById('employeePhone').value.trim();
        const role  = document.getElementById('employeeRole').value;
        if (!name) { showToast('Please enter a name.', 'error'); return; }
        try {
            const data = { name, email, phone, role }; if (id) data.id = id;
            await DataManager.saveEmployee(data); await DataManager.loadAll(); renderAll();
            closeModal('employeeModal'); showToast(`Employee "${name}" ${id ? 'updated' : 'added'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    // ============================================================
    //  DELETE CONFIRM
    // ============================================================
    let deleteTarget = null;

    function confirmDelete(type, id) {
        deleteTarget = { type, id };
        let name = '';
        if      (type === 'unit')     { const i = units.find(u => u.id === id);     name = i ? i.number  : 'this unit'; }
        else if (type === 'lease')    { const i = leases.find(l => l.id === id);    name = i ? i.tenant  : 'this lease'; }
        else if (type === 'tenant')   { const i = tenants.find(t => t.id === id);   name = i ? i.name    : 'this tenant'; }
        else if (type === 'payment')  { const i = payments.find(p => String(p.id) === String(id));  name = i ? i.tenant  : 'this payment'; }
        else if (type === 'employee') { const i = employees.find(e => e.id === id); name = i ? i.name    : 'this employee'; }

        let msg = `Are you sure you want to delete "${name}"? This action cannot be undone.`;
        let hasDependency = false;
        if (type === 'unit' && leases.some(l => l.unitId === id)) {
            msg = `"${name}" has active leases. Please end the lease first before deleting.`; hasDependency = true;
        } else if (type === 'tenant' && leases.some(l => l.tenant === name)) {
            msg = `"${name}" has an active lease. Please end the lease first before deleting.`; hasDependency = true;
        }
        document.getElementById('confirmMessage').textContent = msg;
        document.getElementById('confirmDeleteBtn').style.display = hasDependency ? 'none' : 'inline-flex';
        openModal('confirmModal');
    }

    document.getElementById('confirmDeleteBtn').addEventListener('click', async function () {
        if (!deleteTarget) return;
        const { type, id } = deleteTarget;
        try {
            if      (type === 'unit')     await DataManager.deleteUnit(id);
            else if (type === 'lease')    await DataManager.deleteLease(id);
            else if (type === 'tenant')   await DataManager.deleteTenant(id);
            else if (type === 'payment')  await DataManager.deletePayment(id);
            else if (type === 'employee') await DataManager.deleteEmployee(id);
            await DataManager.loadAll(); renderAll();
            closeModal('confirmModal'); showToast('Deleted successfully.');
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        deleteTarget = null;
    });

    // ============================================================
    //  REFRESH (current section)
    // ============================================================
    async function refresh() {
        showToast('Refreshing...', 'warning');
        try {
            await DataManager.loadAll();
            renderAll();
            const label = meta[currentSection]?.title || 'Page';
            showToast(label + ' refreshed!');
        } catch (err) {
            showToast('Refresh failed: ' + err.message, 'error');
        }
    }

    // ============================================================
    //  PDF GENERATION
    // ============================================================
    function generatePDF() {
        const element = document.getElementById('reportContent');
        if (!element) { showToast('Report content not found.', 'error'); return; }
        showToast('Generating PDF...', 'warning');
        const opt = {
            margin: 0.5,
            filename: 'RentEase_Report_' + new Date().toISOString().slice(0, 10) + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#0f1e26' },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        html2pdf().set(opt).from(element).save()
            .then(() => showToast('PDF downloaded successfully!'))
            .catch(err => showToast('PDF generation failed: ' + err.message, 'error'));
    }

    // ============================================================
    //  NAVIGATION
    // ============================================================
    const navLinks = document.querySelectorAll('#navLinks a');
    const sections = {
        dashboard: document.getElementById('section-dashboard'),
        units:     document.getElementById('section-units'),
        tenants:   document.getElementById('section-tenants'),
        leases:    document.getElementById('section-leases'),
        payments:  document.getElementById('section-payments'),
        employees: document.getElementById('section-employees'),
        reports:   document.getElementById('section-reports'),
    };
    const meta = {
        dashboard: { title: 'Welcome back, ' + (window.__loggedUser || 'Admin'), sub: "Here's what's happening with your rentals today.", action: 'New Lease' },
        units:     { title: 'Unit Management',    sub: 'View and manage all apartment units.',       action: 'Add Unit'        },
        tenants:   { title: 'Tenant Management',  sub: 'View and manage all registered tenants.',    action: 'Register Tenant' },
        leases:    { title: 'Lease Contracts',     sub: 'View and manage all lease agreements.',      action: 'New Lease'       },
        payments:  { title: 'Payment Records',     sub: 'View and manage all rental payments.',       action: 'Record Payment'  },
        employees: { title: 'Employee Management', sub: 'Manage your team members and their roles.', action: 'Add Employee'    },
        reports:   { title: 'Reports & Analytics', sub: 'Overview of property performance.',          action: 'Export PDF'      },
    };

    let currentSection = 'dashboard';

    function switchSection(sectionId) {
        currentSection = sectionId;
        Object.values(sections).forEach(el => el.classList.remove('active'));
        if (sections[sectionId]) sections[sectionId].classList.add('active');
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.section === sectionId));
        const d = meta[sectionId] || meta.dashboard;
        document.getElementById('pageTitle').innerHTML = `${d.title} <small>${d.sub}</small>`;
        document.getElementById('actionBtnText').textContent = d.action;
        document.getElementById('heroActionBtn').onclick = () => {
            if      (sectionId === 'units')                          openAddUnitModal();
            else if (sectionId === 'leases' || sectionId === 'dashboard') openAddLeaseModal();
            else if (sectionId === 'tenants')                        openAddTenantModal();
            else if (sectionId === 'payments')                       openAddPaymentModal();
            else if (sectionId === 'employees')                      openAddEmployeeModal();
            else if (sectionId === 'reports')                        generatePDF();
            else openAddLeaseModal();
        };
    }

    navLinks.forEach(link => link.addEventListener('click', function (e) {
        e.preventDefault(); if (this.dataset.section) switchSection(this.dataset.section);
    }));

    // ============================================================
    //  QUICK ACTIONS & BUTTONS
    // ============================================================
    document.querySelectorAll('[data-quick]').forEach(el => el.addEventListener('click', function (e) {
        e.preventDefault();
        const a = this.dataset.quick;
        if      (a === 'unit')     openAddUnitModal();
        else if (a === 'tenant')   openAddTenantModal();
        else if (a === 'payment')  openAddPaymentModal();
        else if (a === 'employee') openAddEmployeeModal();
        else if (a === 'report')   generatePDF();
    }));

    document.getElementById('exportBtn').addEventListener('click', generatePDF);
    document.getElementById('downloadPdfBtn').addEventListener('click', generatePDF);
    document.getElementById('refreshBtn').addEventListener('click', refresh);

    // ============================================================
    //  FORM SUBMITS
    // ============================================================
    document.getElementById('unitForm').addEventListener('submit', handleUnitFormSubmit);
    document.getElementById('leaseForm').addEventListener('submit', handleLeaseFormSubmit);
    document.getElementById('tenantForm').addEventListener('submit', handleTenantFormSubmit);
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentFormSubmit);
    document.getElementById('employeeForm').addEventListener('submit', handleEmployeeFormSubmit);

    // ============================================================
    //  PROFILE DROPDOWN
    // ============================================================
    const profileBtn = document.getElementById('profileBtn');
    const dropdown   = document.getElementById('profileDropdown');
    let dropdownOpen = false;

    profileBtn.addEventListener('click', function (e) {
        e.stopPropagation(); dropdownOpen = !dropdownOpen; dropdown.classList.toggle('open', dropdownOpen);
    });
    document.addEventListener('click', function (e) {
        if (!profileBtn.contains(e.target)) { dropdown.classList.remove('open'); dropdownOpen = false; }
    });
    dropdown.querySelectorAll('[data-action]').forEach(item => item.addEventListener('click', async function (e) {
        e.preventDefault();
        const action = this.dataset.action;
        if (action === 'logout') {
            if (confirm('Log out?')) {
                await fetch('/api/logout', { method: 'POST' });
                sessionStorage.removeItem('rentease_session');
                window.location.href = '/index.html';
            }
        } else if (action === 'profile' || action === 'employees') {
            window.location.href = '/profile.html';
        }
    }));

    // ============================================================
    //  RENDER ALL
    // ============================================================
    function renderAll() {
        renderUnits(); renderLeases(); renderTenants(); renderPayments(); renderEmployees(); renderDashboard(); 
        const badge = document.getElementById('apiBadge');
        if (badge) {
            badge.innerHTML = '<i class="fas fa-cloud"></i> API';
            badge.className = 'api-badge';
        }
        const active = document.querySelector('.nav-links a.active');
        if (active) {
            const map = { dashboard: 'New Lease', units: 'Add Unit', tenants: 'Register Tenant', leases: 'New Lease', payments: 'Record Payment', employees: 'Add Employee', reports: 'Export PDF' };
            const t = map[active.dataset.section];
            if (t) document.getElementById('actionBtnText').textContent = t;
        }
    }

    // ============================================================
    //  INIT
    // ============================================================
    (async function init() {
        // Auth guard — redirect to login if session is invalid
        const authRes = await fetch('/api/profile');
        if (authRes.status === 401) {
            window.location.href = '/index.html';
            return;
        }
        const profileData = await authRes.json();

        // Set username from the real profile (falls back to sessionStorage)
        const session = JSON.parse(sessionStorage.getItem('rentease_session') || '{}');
        const username = profileData.first_name || session.user || 'Admin';

        document.getElementById('profileUsername').textContent = username;
        document.getElementById('greetingName').textContent   = username;
        const avatarImg = document.querySelector('.user-profile img');
        if (avatarImg) avatarImg.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=003d47&color=fff&size=36';

        console.log(`📡 API Base URL: ${API_BASE_URL}`);

        await DataManager.loadAll();
        renderAll();
        switchSection('dashboard');
    })();

})();