(function () {
    'use strict';

    /*
        SECTION: REST API Configuration
        Purpose: Defines the base API URL and a thin ApiService wrapper around
        fetch for every CRUD endpoint the dashboard talks to.
    */
    const API_BASE_URL = '/api';

    const ApiService = {
        /*
            Name: _fetch
            Purpose: Shared fetch wrapper that adds JSON headers and throws with the
            server's error message when a request fails.
            Used by: dashboard.js (every ApiService.* method below)
            Found in: Line 15-27 in dashboard.js
        */
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
        getLeases:      (archived) => ApiService._fetch(`/leases${archived ? '?archived=true' : ''}`),
        createLease:    (data)     => ApiService._fetch('/leases',         { method: 'POST',   body: JSON.stringify(data) }),
        updateLease:    (id, data) => ApiService._fetch(`/leases/${id}`,   { method: 'PUT',    body: JSON.stringify(data) }),
        deleteLease:    (id)       => ApiService._fetch(`/leases/${id}`,   { method: 'DELETE' }),
        restoreLease:   (id)       => ApiService._fetch(`/leases/${id}/restore`,   { method: 'PUT' }),
        getTenants:     (archived) => ApiService._fetch(`/tenants${archived ? '?archived=true' : ''}`),
        createTenant:   (data)     => ApiService._fetch('/tenants',        { method: 'POST',   body: JSON.stringify(data) }),
        updateTenant:   (id, data) => ApiService._fetch(`/tenants/${id}`,  { method: 'PUT',    body: JSON.stringify(data) }),
        deleteTenant:   (id)       => ApiService._fetch(`/tenants/${id}`,  { method: 'DELETE' }),
        restoreTenant:  (id)       => ApiService._fetch(`/tenants/${id}/restore`,  { method: 'PUT' }),
        getPayments:    (archived) => ApiService._fetch(`/payments${archived ? '?archived=true' : ''}`),
        createPayment:  (data)     => ApiService._fetch('/payments',       { method: 'POST',   body: JSON.stringify(data) }),
        updatePayment:  (id, data) => ApiService._fetch(`/payments/${id}`, { method: 'PUT',    body: JSON.stringify(data) }),
        deletePayment:  (id)       => ApiService._fetch(`/payments/${id}`, { method: 'DELETE' }),
        restorePayment: (id)       => ApiService._fetch(`/payments/${id}/restore`, { method: 'PUT' }),
        getEmployees:   ()         => ApiService._fetch('/employees'),
        createEmployee: (data)     => ApiService._fetch('/employees',         { method: 'POST',   body: JSON.stringify(data) }),
        updateEmployee: (id, data) => ApiService._fetch(`/employees/${id}`,   { method: 'PUT',    body: JSON.stringify(data) }),
        deleteEmployee: (id)       => ApiService._fetch(`/employees/${id}`,   { method: 'DELETE' }),
        getRecentActivity: ()      => ApiService._fetch('/recent-activity'),
        getStats:            ()      => ApiService._fetch('/stats'),
        getUpcomingPayments: ()      => ApiService._fetch('/payments/upcoming'),
        searchTenants:       (q)     => ApiService._fetch(`/tenants/search?q=${encodeURIComponent(q || '')}`),
        unitHasActiveLease:   (unitId)   => ApiService._fetch(`/leases?unitId=${unitId}&activeOnly=true&page=1&limit=1`),
        tenantHasActiveLease: (tenantId) => ApiService._fetch(`/leases?tenantId=${tenantId}&activeOnly=true&page=1&limit=1`),

        /*
            Name: getUnitsPage / getTenantsPage / getLeasesPage / getPaymentsPage / getEmployeesPage
            Purpose: Fetches a single page of rows (PAGE_SIZE per page) for a table
            view, instead of the full list. The server responds with
            { rows, hasMore, page } whenever a `page` query param is present.
            Used by: dashboard.js (loadSectionPage)
        */
        getUnitsPage:     (page)           => ApiService._fetch(`/units?page=${page}&limit=${PAGE_SIZE}`),
        getTenantsPage:   (page, archived) => ApiService._fetch(`/tenants?page=${page}&limit=${PAGE_SIZE}${archived ? '&archived=true' : ''}`),
        getLeasesPage:    (page, archived) => ApiService._fetch(`/leases?page=${page}&limit=${PAGE_SIZE}${archived ? '&archived=true' : ''}`),
        getPaymentsPage:  (page, archived) => ApiService._fetch(`/payments?page=${page}&limit=${PAGE_SIZE}${archived ? '&archived=true' : ''}`),
        getEmployeesPage: (page)           => ApiService._fetch(`/employees?page=${page}&limit=${PAGE_SIZE}`),
    };

    /*
        SECTION: Pagination
        Purpose: Units, Tenants, Leases, Payments, Employees, and the Reports
        page's Recent Transactions table each fetch only PAGE_SIZE rows at a
        time from the server, rather than loading everything up front. The
        full in-memory arrays above (units/leases/tenants/payments/employees)
        are still loaded in full by DataManager.loadAll() because stats,
        comboboxes, cross-references (e.g. which unit a tenant leases), and
        PDF export all need the complete dataset — only what's painted into
        each table body is paginated.
    */
    const PAGE_SIZE = 5;

    const pagination = {
        units:     { page: 1, hasMore: false },
        tenants:   { page: 1, hasMore: false },
        leases:    { page: 1, hasMore: false },
        payments:  { page: 1, hasMore: false },
        employees: { page: 1, hasMore: false },
        reports:   { page: 1, hasMore: false },
    };

    let unitsPageRows     = [];
    let tenantsPageRows   = [];
    let leasesPageRows    = [];
    let paymentsPageRows  = [];
    let employeesPageRows = [];
    let reportsPageRows   = [];

    function normalizeUnitList(list)     { return (list || []).map(u => ({ ...u, id: toStr(u.id) })); }
    function normalizeEmployeeList(list) { return (list || []).map(e => ({ ...e, id: toStr(e.id) })); }

    const PAGE_FETCHERS = {
        units:     (page) => ApiService.getUnitsPage(page),
        tenants:   (page) => ApiService.getTenantsPage(page, archiveMode.tenants),
        leases:    (page) => ApiService.getLeasesPage(page, archiveMode.leases),
        payments:  (page) => ApiService.getPaymentsPage(page, archiveMode.payments),
        employees: (page) => ApiService.getEmployeesPage(page),
        reports:   (page) => ApiService.getPaymentsPage(page, false),
    };

    const PAGE_NORMALIZERS = {
        units:     normalizeUnitList,
        tenants:   normalizeTenantList,
        leases:    normalizeLeaseList,
        payments:  normalizePaymentList,
        employees: normalizeEmployeeList,
        reports:   normalizePaymentList,
    };

    /*
        Name: loadSectionPage
        Purpose: Fetches a single page of rows for one paginated table section
        and stores it for rendering. If the requested page comes back empty
        (e.g. the last item on the last page was just deleted), steps back
        one page and retries so the table never renders blank while hasMore
        controls remain accurate.
        Used by: dashboard.js (pagination Prev/Next buttons, archive toggle,
        every CRUD success handler, and the initial page load)
    */
    async function loadSectionPage(section, page) {
        let result;
        try {
            result = await PAGE_FETCHERS[section](page);
        } catch (err) {
            console.error(`Pagination fetch error (${section}):`, err);
            return;
        }
        let rows = result && result.rows ? result.rows : [];
        const hasMore = !!(result && result.hasMore);

        if (rows.length === 0 && page > 1) {
            return loadSectionPage(section, page - 1);
        }

        pagination[section].page = page;
        pagination[section].hasMore = hasMore;
        pagination[section].total = result && typeof result.total === 'number' ? result.total : (pagination[section].total || 0);
        pagination[section].activeCount = result && typeof result.activeCount === 'number' ? result.activeCount : pagination[section].activeCount;
        pagination[section].archivedCount = result && typeof result.archivedCount === 'number' ? result.archivedCount : pagination[section].archivedCount;
        rows = PAGE_NORMALIZERS[section](rows);

        if      (section === 'units')     unitsPageRows     = rows;
        else if (section === 'tenants')   tenantsPageRows   = rows;
        else if (section === 'leases')    leasesPageRows    = rows;
        else if (section === 'payments')  paymentsPageRows  = rows;
        else if (section === 'employees') employeesPageRows = rows;
        else if (section === 'reports')   reportsPageRows   = rows;

        renderPaginationControls(section);
        RENDER_BY_SECTION[section]();
        applyRolePermissions();
    }

    /*
        Name: reloadCurrentPage
        Purpose: Re-fetches whatever page a section is currently on, so
        pagination stays accurate after a create/update/delete/restore.
        Used by: dashboard.js (every CRUD success handler)
    */
    function reloadCurrentPage(section) {
        return loadSectionPage(section, pagination[section].page);
    }

    /*
        Name: renderPaginationControls
        Purpose: Shows/hides and enables/disables a section's Prev/Next
        buttons based on its current page and whether more rows exist.
        Used by: dashboard.js (loadSectionPage)
    */
    function renderPaginationControls(section) {
        const wrap = document.getElementById(`${section}Pagination`);
        if (!wrap) return;
        const state = pagination[section];
        const prevBtn = wrap.querySelector('[data-page-prev]');
        const nextBtn = wrap.querySelector('[data-page-next]');
        const label   = wrap.querySelector('[data-page-label]');
        if (prevBtn) prevBtn.style.visibility = state.page > 1 ? 'visible' : 'hidden';
        if (nextBtn) nextBtn.style.visibility = state.hasMore ? 'visible' : 'hidden';
        if (label)   label.textContent = `Page ${state.page}`;
        wrap.style.display = (state.page > 1 || state.hasMore) ? 'flex' : 'none';
    }

    /*
        Name: RENDER_BY_SECTION
        Purpose: Maps a pagination section name to the render function that
        should redraw its table once a new page of rows has loaded. Function
        declarations are hoisted, so it's safe to reference renderUnits, etc.
        here even though they're defined later in this file.
        Used by: dashboard.js (loadSectionPage)
    */
    const RENDER_BY_SECTION = {
        units:     () => renderUnits(),
        tenants:   () => renderTenants(),
        leases:    () => renderLeases(),
        payments:  () => renderPayments(),
        employees: () => renderEmployees(),
        reports:   () => renderReportsTable(),
    };

    /*
        Name: wirePaginationButtons
        Purpose: Wires up every section's Prev/Next pagination buttons once,
        at load time.
        Used by: dashboard.js (init)
    */
    function wirePaginationButtons() {
        Object.keys(pagination).forEach(section => {
            const wrap = document.getElementById(`${section}Pagination`);
            if (!wrap) return;
            const prevBtn = wrap.querySelector('[data-page-prev]');
            const nextBtn = wrap.querySelector('[data-page-next]');
            if (prevBtn) prevBtn.addEventListener('click', () => {
                if (pagination[section].page > 1) loadSectionPage(section, pagination[section].page - 1);
            });
            if (nextBtn) nextBtn.addEventListener('click', () => {
                if (pagination[section].hasMore) loadSectionPage(section, pagination[section].page + 1);
            });
        });
    }

    /*
        Name: loadAllSectionPages
        Purpose: Loads page 1 of every paginated table section. Called once
        at startup so every section (not just the one currently visible) is
        ready to display as soon as the user switches to it.
        Used by: dashboard.js (init)
    */
    function loadAllSectionPages() {
        return Promise.all(Object.keys(pagination).map(section => loadSectionPage(section, 1)));
    }

    /*
        SECTION: Data Layer
        Purpose: `units` is kept as a small, fully-loaded reference list (an
        apartment building's unit count is inherently bounded, and dropdowns
        like "assign a unit to this lease" need every option regardless of
        which page the Units table happens to be showing). Tenants, leases,
        payments, and employees, by contrast, can grow without bound over the
        life of the business, so none of them are kept as full in-memory
        arrays anymore — every table is paginated server-side, cross-reference
        fields (a unit's current tenant, a tenant's lease status/unit) are
        computed in SQL and travel with each row, and the few things that
        still need a fuller picture (autocomplete, dependency checks before a
        delete, PDF export, dashboard aggregates) fetch on demand instead.
    */
    let units = [];
    let recentActivity = [];
    let stats = {};
    let upcomingPayments = [];

    /*
        Name: ensureUnitsLoaded
        Purpose: Refreshes the `units` reference list right before something
        that needs every unit (a lease/tenant unit dropdown, rent lookups,
        occupancy validation) is about to use it, so it's never more than a
        moment stale without having to be preloaded at startup.
        Used by: dashboard.js (openAddLeaseModal, openEditLeaseModal,
        openAddTenantModal, openEditTenantModal, handleLeaseFormSubmit,
        handleTenantFormSubmit)
    */
    async function ensureUnitsLoaded() {
        units = normalizeUnitList(await ApiService.getUnits());
        return units;
    }

    /*
        SECTION: Role Permissions
        Purpose: The "manager" login (see seeder.js) only has edit privileges
        for Payments and Employees; Units, Tenants, and Leases (plus the
        dashboard's default "New Lease" action) are view-only for that role.
        currentUserRole is populated from GET /api/profile in init().
    */
    let currentUserRole = 'Admin';
    const MANAGER_VIEW_ONLY_SECTIONS = ['units', 'tenants', 'leases'];

    function isManagerRole() {
        return currentUserRole === 'Manager';
    }

    /*
        Name: disableButton
        Purpose: Visually greys out and disables a button/link so a
        restricted user can see the control but can't activate it.
        Used by: dashboard.js (applyRolePermissions, switchSection)
    */
    function disableButton(el) {
        if (!el) return;
        el.disabled = true;
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
    }

    /*
        Name: applyRolePermissions
        Purpose: For the limited-access "manager" role, greys out and disables
        every edit/delete/restore button on the Units, Tenants, and Leases
        tables, plus the quick-action tiles that create a unit or tenant.
        Payments and Employees stay fully editable. No-op for other roles.
        Used by: dashboard.js (renderAll)
    */
    function applyRolePermissions() {
        if (!isManagerRole()) return;

        MANAGER_VIEW_ONLY_SECTIONS.forEach(sectionId => {
            const section = document.getElementById(`section-${sectionId}`);
            if (!section) return;
            section.querySelectorAll('.btn-edit, .btn-danger, .btn-restore').forEach(disableButton);
        });

        document.querySelectorAll('[data-quick="unit"], [data-quick="tenant"]').forEach(disableButton);
    }

    /*
        SECTION: Archive Mode
        Purpose: Tracks whether Archive Mode is on for each of the Tenants,
        Leases, and Payments pages. Toggling it just re-fetches that
        section's current page with ?archived=true (see PAGE_FETCHERS and
        setArchiveMode below) — there's no separate "include archived" cache
        to maintain, since every table is paginated straight from the server.
    */
    const archiveMode = { tenants: false, leases: false, payments: false };

    /*
        Name: formatCurrency
        Purpose: Formats a number as a Philippine peso amount (e.g. ₱7,500).
        Used by: dashboard.js (all render* and pdf* functions)
        Found in: Line 58-60 in dashboard.js
    */
    function formatCurrency(amount) {
        return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    /*
        Name: formatDate
        Purpose: Formats an ISO date string into a short readable date (e.g. Jan 5, 2026), or an em dash if empty.
        Used by: dashboard.js (all render* and pdf* functions)
        Found in: Line 68-72 in dashboard.js
    */
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    /*
        Name: timeAgo
        Purpose: Converts a timestamp into a relative "time ago" string (e.g. "5m ago") for the activity feed.
        Used by: dashboard.js (renderDashboard, buildDashboardPDF)
        Found in: Line 80-92 in dashboard.js
    */
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

    /*
        Name: getStatusBadge
        Purpose: Renders a colored status badge (e.g. Available, Overdue, Active) as an HTML span.
        Used by: dashboard.js (all render* table functions)
        Found in: Line 111-121 in dashboard.js
    */
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

    /*
        Name: normalizeIds
        Purpose: Converts every id/foreign-key id in the loaded data to a string.
        IDs from the MySQL API are numbers, but ids read back out of the DOM
        (data-edit-unit="...", hidden form fields, etc.) are always strings,
        so strict === comparisons between the two would otherwise silently fail.
        Used by: dashboard.js (DataManager.loadAll)
        Found in: Line 142-149 in dashboard.js
    */
    const toStr = v => (v === null || v === undefined || v === '') ? null : String(v);

    /*
        Name: normalizeTenantList / normalizeLeaseList / normalizePaymentList
        Purpose: Same id-stringifying normalization as normalizeIds, but
        callable on any list (used for the archive-inclusive caches, which
        are fetched separately from the main tenants/leases/payments arrays).
        Used by: dashboard.js (normalizeIds, DataManager.loadAll)
    */
    function normalizeTenantList(list)  { return (list || []).map(t => ({ ...t, id: toStr(t.id), unitId: toStr(t.unitId) })); }
    function normalizeLeaseList(list)   { return (list || []).map(l => ({ ...l, id: toStr(l.id), unitId: toStr(l.unitId) })); }
    function normalizePaymentList(list) { return (list || []).map(p => ({ ...p, id: toStr(p.id) })); }

    /*
        Name: parseUnitNumbers
        Purpose: Splits a tenant's comma-separated `unitNumbers` string (as
        returned by TENANT_SELECT's GROUP_CONCAT) into an array, e.g.
        "101, 102" -> ["101", "102"]. Empty/null becomes an empty array.
        Used by: dashboard.js (selectPaymentTenant, openEditPaymentModal)
    */
    function parseUnitNumbers(unitNumbers) {
        return (unitNumbers || '').split(',').map(s => s.trim()).filter(Boolean);
    }

    /*
        Name: debounce
        Purpose: Delays calling `fn` until `wait` ms have passed since the
        last call — used so the tenant-search comboboxes don't fire a network
        request on every single keystroke.
        Used by: dashboard.js (initLeaseTenantCombobox, initPaymentTenantCombobox)
    */
    function debounce(fn, wait) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    /*
        SECTION: Data Manager
        Purpose: Wraps ApiService calls with local cache updates, so the UI's
        in-memory arrays (units, leases, tenants, payments, employees) stay in
        sync with the server after every create/update/delete.
    */
    const DataManager = {
        async loadAll() {
            const [u, ra, st, up] = await Promise.all([
                ApiService.getUnits(), ApiService.getRecentActivity(),
                ApiService.getStats(), ApiService.getUpcomingPayments(),
            ]);
            units = normalizeUnitList(u || []);
            recentActivity = ra || [];
            stats = st || {};
            upcomingPayments = normalizePaymentList(up || []);
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
            units = units.filter(u => u.id !== id);
        },

        // Leases, tenants, payments, and employees are no longer kept as full
        // in-memory arrays (see the Data Layer comment above), so their
        // create/update/delete/restore just relay to the API. Every call site
        // already reloads the relevant paginated table afterward (see
        // reloadCurrentPage), which is what actually refreshes what's on screen.
        async saveLease(data)     { return data.id ? ApiService.updateLease(data.id, data) : ApiService.createLease(data); },
        async deleteLease(id)     { return ApiService.deleteLease(id); },
        async restoreLease(id)    { return ApiService.restoreLease(id); },

        async saveTenant(data)    { return data.id ? ApiService.updateTenant(data.id, data) : ApiService.createTenant(data); },
        async deleteTenant(id)    { return ApiService.deleteTenant(id); },
        async restoreTenant(id)   { return ApiService.restoreTenant(id); },

        async savePayment(data)   { return data.id ? ApiService.updatePayment(data.id, data) : ApiService.createPayment(data); },
        async deletePayment(id)   { return ApiService.deletePayment(id); },
        async restorePayment(id)  { return ApiService.restorePayment(id); },

        async saveEmployee(data)  { return data.id ? ApiService.updateEmployee(data.id, data) : ApiService.createEmployee(data); },
        async deleteEmployee(id)  { return ApiService.deleteEmployee(id); },
    };

    /*
        Name: showToast
        Purpose: Shows a temporary toast notification (success, warning, or error) at the bottom of the dashboard.
        Used by: dashboard.js (every CRUD handler, refresh, and generatePDF)
        Found in: Line 251-263 in dashboard.js
    */
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

    /*
        Name: isValidPhone
        Purpose: Validates a phone number string. Empty is allowed (phone is optional
        everywhere it's collected); if a value is given, it must contain exactly 11
        digits once formatting characters (spaces, dashes, parentheses, "+") are stripped.
        Used by: dashboard.js (handleTenantFormSubmit, handleEmployeeFormSubmit)
        Found in: Line 267-271 in dashboard.js
    */
    function isValidPhone(phone) {
        const digits = (phone || '').replace(/\D/g, '');
        return digits.length === 0 || digits.length === 11;
    }

    /*
        Name: openModal / closeModal
        Purpose: Shows or hides a modal dialog by its element id.
        Used by: dashboard.js (every openAdd/openEdit modal function and closeModal call in this file)
        Found in: Line 279-280 in dashboard.js
    */
    function openModal(id)  { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('open'); });
    });
    document.querySelectorAll('[data-close]').forEach(el => {
        el.addEventListener('click', function () { closeModal(this.dataset.close); });
    });

    /*
        SECTION: Render Functions
        Purpose: Builds the HTML for each dashboard table/section from the
        in-memory data arrays, and wires up the edit/delete buttons they render.
    */
    /*
        Name: renderUnits
        Purpose: Renders the Units table body from the units array and wires up its edit/delete buttons.
        Used by: dashboard.js (renderAll)
        Found in: Line 340-361 in dashboard.js
    */
    function renderUnits() {
        const tbody = document.getElementById('unitsTableBody');
        const count = document.getElementById('unitCount');
        const total = pagination.units.total || 0;
        if (total === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-door-open"></i><p>No units yet.</p></div></td></tr>`;
            count.textContent = '· 0 total'; return;
        }
        count.textContent = `· ${total} total`;
        tbody.innerHTML = unitsPageRows.map(u => {
            return `<tr>
                <td><strong>${u.number}</strong></td>
                <td>${u.type}</td>
                <td>${formatCurrency(u.rent)}</td>
                <td>${getStatusBadge(u.status)}</td>
                <td>${u.tenantName || '—'}</td>
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

    /*
        Name: renderLeases
        Purpose: Renders the Leases table body from the current page of
        leases (unit numbers arrive pre-joined from the server) and wires up
        its edit/delete/restore buttons.
        Used by: dashboard.js (RENDER_BY_SECTION.leases)
    */
    function renderLeases() {
        const tbody = document.getElementById('leasesTableBody');
        const count = document.getElementById('leaseCount');
        const total = pagination.leases.total || 0;
        if (total === 0) {
            const emptyMsg = archiveMode.leases ? 'No leases found.' : 'No leases yet.';
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-file-signature"></i><p>${emptyMsg}</p></div></td></tr>`;
            count.textContent = archiveMode.leases ? '· 0 total' : '· 0 active'; return;
        }
        if (archiveMode.leases) {
            const archivedCount = pagination.leases.archivedCount || 0;
            count.textContent = `· ${total} total (${archivedCount} archived)`;
        } else {
            count.textContent = `· ${pagination.leases.activeCount || 0} active`;
        }
        tbody.innerHTML = leasesPageRows.map(l => {
            return `<tr${l.archived ? ' class="archived-row"' : ''}>
                <td><strong>${l.id}</strong>${l.archived ? ' <span class="badge archived-badge">Archived</span>' : ''}</td>
                <td>${l.tenant}</td>
                <td>${l.unitNumber || '—'}</td>
                <td>${formatDate(l.start)}</td>
                <td>${formatDate(l.end)}</td>
                <td>${formatCurrency(l.rent)}</td>
                <td style="text-align:center;">
                    <div class="action-group" style="justify-content:center;">
                        <button class="btn-edit" data-edit-lease="${l.id}"><i class="fas fa-pen"></i></button>
                        ${l.archived
                            ? `<button class="btn-restore" data-restore-lease="${l.id}"><i class="fas fa-rotate-left"></i></button>`
                            : `<button class="btn-danger" data-delete-lease="${l.id}"><i class="fas fa-trash"></i></button>`}
                    </div>
                </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-edit-lease]').forEach(btn => btn.addEventListener('click', function () { openEditLeaseModal(this.dataset.editLease); }));
        tbody.querySelectorAll('[data-delete-lease]').forEach(btn => btn.addEventListener('click', function () { confirmDelete('lease', this.dataset.deleteLease); }));
        tbody.querySelectorAll('[data-restore-lease]').forEach(btn => btn.addEventListener('click', function () { restoreItem('lease', this.dataset.restoreLease); }));
    }

    /*
        Name: renderTenants
        Purpose: Renders the Tenants table body from the current page of
        tenants (lease status and current unit(s) arrive pre-computed from
        the server) and wires up its edit/delete/restore buttons.
        Used by: dashboard.js (RENDER_BY_SECTION.tenants)
    */
    function renderTenants() {
        const tbody = document.getElementById('tenantsTableBody');
        const count = document.getElementById('tenantCount');
        const total = pagination.tenants.total || 0;
        if (total === 0) {
            const emptyMsg = archiveMode.tenants ? 'No tenants found.' : 'No tenants yet.';
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>${emptyMsg}</p></div></td></tr>`;
            count.textContent = archiveMode.tenants ? '· 0 total' : '· 0 active'; return;
        }
        if (archiveMode.tenants) {
            const archivedCount = pagination.tenants.archivedCount || 0;
            count.textContent = `· ${total} total (${archivedCount} archived)`;
        } else {
            count.textContent = `· ${stats.activeTenants || 0} active`;
        }
        tbody.innerHTML = tenantsPageRows.map(t => {
            const unitDisplay = t.unitNumbers || '—';
            return `<tr${t.archived ? ' class="archived-row"' : ''}>
                <td><strong>${t.name}</strong>${t.archived ? ' <span class="badge archived-badge">Archived</span>' : ''}</td>
                <td>${t.email || '—'}</td>
                <td>${t.phone || '—'}</td>
                <td>${unitDisplay}</td>
                <td>${getStatusBadge(t.leaseStatus)}</td>
                <td style="text-align:center;">
                    <div class="action-group" style="justify-content:center;">
                        <button class="btn-edit" data-edit-tenant="${t.id}"><i class="fas fa-pen"></i></button>
                        ${t.archived
                            ? `<button class="btn-restore" data-restore-tenant="${t.id}"><i class="fas fa-rotate-left"></i></button>`
                            : `<button class="btn-danger" data-delete-tenant="${t.id}"><i class="fas fa-trash"></i></button>`}
                    </div>
                </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-edit-tenant]').forEach(btn => btn.addEventListener('click', function () { openEditTenantModal(this.dataset.editTenant); }));
        tbody.querySelectorAll('[data-delete-tenant]').forEach(btn => btn.addEventListener('click', function () { confirmDelete('tenant', this.dataset.deleteTenant); }));
        tbody.querySelectorAll('[data-restore-tenant]').forEach(btn => btn.addEventListener('click', function () { restoreItem('tenant', this.dataset.restoreTenant); }));
    }

    /*
        Name: renderPayments
        Purpose: Renders the Payments table body from the current page of
        payments and wires up its edit/delete/restore buttons.
        Used by: dashboard.js (RENDER_BY_SECTION.payments)
    */
    function renderPayments() {
        const tbody = document.getElementById('paymentsTableBody');
        const count = document.getElementById('paymentCount');
        const total = pagination.payments.total || 0;
        if (total === 0) {
            const emptyMsg = archiveMode.payments ? 'No payment records found.' : 'No payment records yet.';
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-coins"></i><p>${emptyMsg}</p></div></td></tr>`;
            count.textContent = archiveMode.payments ? '· 0 total' : '· 0 records'; return;
        }
        if (archiveMode.payments) {
            const archivedCount = pagination.payments.archivedCount || 0;
            count.textContent = `· ${total} total (${archivedCount} archived)`;
        } else {
            count.textContent = `· ${total} records`;
        }
        tbody.innerHTML = paymentsPageRows.map(p => `
            <tr${p.archived ? ' class="archived-row"' : ''}>
                <td><strong>${p.id}</strong>${p.archived ? ' <span class="badge archived-badge">Archived</span>' : ''}</td>
                <td>${formatDate(p.date)}</td>
                <td>${p.tenant}</td>
                <td>${p.unit}</td>
                <td>${formatCurrency(p.amount)}</td>
                <td>${getStatusBadge(p.status)}</td>
                <td style="text-align:center;">
                    <div class="action-group" style="justify-content:center;">
                        <button class="btn-edit" data-edit-payment="${p.id}"><i class="fas fa-pen"></i></button>
                        ${p.archived
                            ? `<button class="btn-restore" data-restore-payment="${p.id}"><i class="fas fa-rotate-left"></i></button>`
                            : `<button class="btn-danger" data-delete-payment="${p.id}"><i class="fas fa-trash"></i></button>`}
                    </div>
                </td>
            </tr>
        `).join('');
        tbody.querySelectorAll('[data-edit-payment]').forEach(btn => btn.addEventListener('click', function () { openEditPaymentModal(this.dataset.editPayment); }));
        tbody.querySelectorAll('[data-delete-payment]').forEach(btn => btn.addEventListener('click', function () { confirmDelete('payment', this.dataset.deletePayment); }));
        tbody.querySelectorAll('[data-restore-payment]').forEach(btn => btn.addEventListener('click', function () { restoreItem('payment', this.dataset.restorePayment); }));
    }

    /*
        Name: renderEmployees
        Purpose: Renders the Employees table body from the current page of
        employees and wires up its edit/delete buttons.
        Used by: dashboard.js (RENDER_BY_SECTION.employees)
    */
    function renderEmployees() {
        const tbody = document.getElementById('employeesTableBody');
        const count = document.getElementById('employeeCount');
        const total = pagination.employees.total || 0;

        if (total === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
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

        count.textContent = `· ${total} employee${total !== 1 ? 's' : ''}`;

        tbody.innerHTML = employeesPageRows.map(emp => `
            <tr>
                <td><strong>${emp.name}</strong></td>
                <td>${emp.email || '—'}</td>
                <td>${emp.phone || '—'}</td>
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

    /*
        Name: renderDashboard
        Purpose: Renders the dashboard overview: stat cards, recent activity feed, report cards, and recent transactions.
        Used by: dashboard.js (renderAll)
        Found in: Line 518-607 in dashboard.js
    */
    function renderDashboard() {
        const totalUnits     = stats.totalUnits || 0;
        const occupied       = stats.occupiedUnits || 0;
        const activeTenants  = stats.activeTenants || 0;
        const totalRent      = stats.totalRent || 0;
        const totalEmployees = stats.totalEmployees || 0;
        const occupancyRate  = totalUnits ? Math.round(occupied / totalUnits * 100) : 0;

        document.getElementById('statsGrid').innerHTML = `
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-door-open"></i></div>
                <div class="stat-value">${totalUnits}</div>
                <div class="stat-label">Total Units</div>
                <span class="stat-change"><i class="fas fa-arrow-up"></i> ${stats.availableUnits || 0} available</span>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-value">${occupied}</div>
                <div class="stat-label">Occupied</div>
                <span class="stat-change warning"><i class="fas fa-arrow-right"></i> ${occupancyRate}%</span>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-user-friends"></i></div>
                <div class="stat-value">${activeTenants}</div>
                <div class="stat-label">Active Tenants</div>
                <span class="stat-change"><i class="fas fa-arrow-up"></i> ${stats.pendingTenants || 0} pending</span>
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
                <span class="stat-change danger"><i class="fas fa-arrow-down"></i> ${stats.overdueCount || 0} overdue</span>
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

        renderInbox();

        document.getElementById('reportGrid').innerHTML = `
            <div class="report-card"><div class="num">${formatCurrency(stats.totalRevenue || 0)}</div><div class="label">Total Revenue</div></div>
            <div class="report-card"><div class="num">${occupancyRate}%</div><div class="label">Occupancy Rate</div></div>
            <div class="report-card"><div class="num">${formatCurrency(stats.overdueTotal || 0)}</div><div class="label">Total Overdue</div></div>
            <div class="report-card"><div class="num">${stats.expiringLeases || 0}</div><div class="label">Leases Ending Soon</div></div>
        `;

        renderReportsTable();
    }

    /*
        Name: renderReportsTable
        Purpose: Renders the Reports page's "Recent Transactions" table from
        reportsPageRows (a paginated slice of payments, most-recent-first).
        Used by: dashboard.js (renderDashboard, RENDER_BY_SECTION.reports)
    */
    function renderReportsTable() {
        const txBody = document.getElementById('recentTransactionsBody');
        if (!txBody) return;
        txBody.innerHTML = reportsPageRows.length === 0
            ? `<tr><td colspan="5"><div class="empty-state" style="padding:10px 0;"><p style="font-size:0.85rem;">No transactions yet.</p></div></td></tr>`
            : reportsPageRows.map(p => `
                <tr>
                    <td>${formatDate(p.date)}</td><td>${p.tenant}</td><td>${p.unit}</td>
                    <td>${formatCurrency(p.amount)}</td><td>Rent</td>
                </tr>
            `).join('');
    }

    /*
        SECTION: Inbox Notifications
        Purpose: Tracks which upcoming-due-payment notifications the admin has
        cleared, persisted in localStorage so a "Clear all" survives refreshes
        without permanently hiding a payment that becomes newly relevant later
        (e.g. its due date having passed and a new payment record appearing).
    */
    const INBOX_CLEARED_KEY = 'rentease_inbox_cleared';

    /*
        Name: getClearedInboxIds
        Purpose: Reads the set of payment ids the admin has dismissed via "Clear all".
        Used by: dashboard.js (renderInbox)
        Found in: Line 609-616 in dashboard.js
    */
    function getClearedInboxIds() {
        try {
            return new Set(JSON.parse(localStorage.getItem(INBOX_CLEARED_KEY) || '[]'));
        } catch (e) {
            return new Set();
        }
    }

    /*
        Name: getInboxItems
        Purpose: Computes the list of rent payments still Pending but due
        within the next 3 days (the window before they'd auto-flip to
        Overdue), minus any the admin has already cleared.
        Used by: dashboard.js (renderInbox, clear-all handler)
        Found in: Line 618-634 in dashboard.js
    */
    function getInboxItems() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cleared = getClearedInboxIds();

        return (upcomingPayments || [])
            .filter(p => !cleared.has(String(p.id)))
            .map(p => {
                const due = new Date(p.date + 'T00:00:00');
                const diffDays = Math.round((due - today) / 86400000);
                return { ...p, diffDays };
            })
            .sort((a, b) => a.diffDays - b.diffDays);
    }

    /*
        Name: renderInbox
        Purpose: Renders the Inbox dropdown — an early-warning list of leases
        whose rent payment is still Pending but due within the next 3 days,
        so the admin can follow up before the payment (and the lease behind
        it) actually flips to Overdue.
        Used by: dashboard.js (renderDashboard)
        Found in: Line 636-660 in dashboard.js
    */
    function renderInbox() {
        const list  = document.getElementById('inboxList');
        const badge = document.getElementById('inboxBadge');
        if (!list) return;

        const upcoming = getInboxItems();

        if (badge) {
            badge.textContent = upcoming.length;
            badge.style.display = upcoming.length ? 'inline-flex' : 'none';
        }

        list.innerHTML = upcoming.length === 0
            ? `<div class="empty-state" style="padding:10px 0;"><p style="font-size:0.85rem;">No leases due soon. You're all caught up.</p></div>`
            : upcoming.map(p => {
                const dueLabel = p.diffDays === 0 ? 'Due today' : `Due in ${p.diffDays} day${p.diffDays === 1 ? '' : 's'}`;
                return `
                <div class="activity-item inbox-item">
                    <div class="activity-icon inbox-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="activity-content">
                        <div class="title">${p.tenant} · Unit ${p.unit}</div>
                        <div class="desc">Rent payment of ${formatCurrency(p.amount)} will become overdue if unpaid by ${formatDate(p.date)}</div>
                    </div>
                    <div class="activity-time ${p.diffDays === 0 ? 'due-today' : ''}">${dueLabel}</div>
                </div>
            `;
            }).join('');
    }

    /*
        SECTION: CRUD - Units
        Purpose: Opens the Add/Edit Unit modal and handles its form submission.
    */
    /*
        Name: openAddUnitModal
        Purpose: Resets and opens the unit modal in "Add" mode.
        Used by: dashboard.js (heroActionBtn/quick-action handlers for the units section)
        Found in: Line 622-629 in dashboard.js
    */
    function openAddUnitModal() {
        document.getElementById('unitModalTitle').textContent = 'Add Unit';
        document.getElementById('unitSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Unit';
        document.getElementById('unitFormId').value = '';
        document.getElementById('unitForm').reset();
        document.getElementById('unitStatus').value = 'Available';
        openModal('unitModal');
    }
    /*
        Name: openEditUnitModal
        Purpose: Populates and opens the unit modal in "Edit" mode for the given unit id.
        Used by: dashboard.js (renderUnits edit button)
        Found in: Line 639-648 in dashboard.js
    */
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
    /*
        Name: handleUnitFormSubmit
        Purpose: Validates the unit form and saves the unit (create or update), then refreshes the dashboard.
        Used by: dashboard.js (unitForm submit listener)
        Found in: Line 656-670 in dashboard.js
    */
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
            await DataManager.saveUnit(data); await DataManager.loadAll(); renderAll(); await reloadCurrentPage('units');
            closeModal('unitModal'); showToast(`Unit "${number}" ${id ? 'updated' : 'added'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    /*
        SECTION: CRUD - Leases
        Purpose: Manages the lease unit dropdown, the tenant-name autocomplete
        combobox, and the Add/Edit Lease modal and its form submission.
    */
    /*
        Name: populateLeaseUnitSelect
        Purpose: Fills the lease unit dropdown with available units, keeping the currently-selected unit visible even if occupied.
        Used by: dashboard.js (openAddLeaseModal, openEditLeaseModal)
        Found in: Line 680-689 in dashboard.js
    */
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
    /*
        Name: leaseTenantSearchResults
        Purpose: Caches the most recent tenant-search results shown in the
        Lease form's tenant combobox, so selectLeaseTenant can resolve a
        clicked suggestion's id without keeping a full tenants list around.
        Used by: dashboard.js (renderLeaseTenantSuggestions, selectLeaseTenant)
    */
    let leaseTenantSearchResults = [];

    /*
        Name: renderLeaseTenantSuggestions
        Purpose: Renders the tenant-name autocomplete dropdown for the New Lease
        form by searching the server for matching tenants. Unlike the Record
        Payment combobox, a name that doesn't match any registered tenant is
        not rejected on submit — the server auto-registers a new tenant for
        it (see syncTenantToUnit in server.js), so free text is intentionally
        allowed.
        Used by: dashboard.js (initLeaseTenantCombobox input/focus listeners)
    */
    async function renderLeaseTenantSuggestions(query) {
        const list = document.getElementById('leaseTenantList');
        const q = (query || '').trim();
        let matches;
        try {
            matches = normalizeTenantList(await ApiService.searchTenants(q));
        } catch (err) {
            list.innerHTML = `<div class="combobox-empty">Error searching tenants.</div>`;
            list.classList.add('open');
            return;
        }
        leaseTenantSearchResults = matches;

        if (matches.length === 0) {
            list.innerHTML = q
                ? `<div class="combobox-empty">No matching tenants — typing a new name will register them.</div>`
                : `<div class="combobox-empty">Start typing to search tenants, or type a new name to register one.</div>`;
        } else {
            list.innerHTML = matches.map(t => {
                const unitNumbers = parseUnitNumbers(t.unitNumbers);
                const unitHint = unitNumbers.length ? `Unit ${unitNumbers.join(', ')}` : 'No unit assigned';
                return `<div class="combobox-item" data-tenant-id="${t.id}">${t.name}<small>${unitHint}</small></div>`;
            }).join('');
        }
        list.classList.add('open');
        list.querySelectorAll('.combobox-item[data-tenant-id]').forEach(item => {
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectLeaseTenant(this.dataset.tenantId);
            });
        });
    }
    /*
        Name: selectLeaseTenant
        Purpose: Fills the lease tenant field with the chosen tenant's name and closes the suggestion list.
        Used by: dashboard.js (renderLeaseTenantSuggestions mousedown handler)
    */
    function selectLeaseTenant(tenantId) {
        const tenant = leaseTenantSearchResults.find(t => String(t.id) === String(tenantId));
        if (!tenant) return;
        const input = document.getElementById('leaseTenant');
        input.value = tenant.name;
        closeLeaseTenantList();
    }
    /*
        Name: closeLeaseTenantList
        Purpose: Hides the lease tenant-name suggestion dropdown.
        Used by: dashboard.js (selectLeaseTenant, openAddLeaseModal, openEditLeaseModal, initLeaseTenantCombobox)
    */
    function closeLeaseTenantList() {
        document.getElementById('leaseTenantList').classList.remove('open');
    }
    (function initLeaseTenantCombobox() {
        const input = document.getElementById('leaseTenant');
        const debouncedSuggest = debounce(v => renderLeaseTenantSuggestions(v), 250);
        input.addEventListener('input', function () { debouncedSuggest(this.value); });
        input.addEventListener('focus', function () { renderLeaseTenantSuggestions(this.value); });
        document.addEventListener('click', function (e) {
            if (!document.getElementById('leaseTenantCombobox').contains(e.target)) closeLeaseTenantList();
        });
    })();

    /*
        Name: openAddLeaseModal
        Purpose: Resets and opens the lease modal in "New" mode with sensible default dates.
        Used by: dashboard.js (heroActionBtn/quick-action handlers for leases and dashboard)
        Found in: Line 768-782 in dashboard.js
    */
    async function openAddLeaseModal() {
        document.getElementById('leaseModalTitle').textContent = 'New Lease';
        document.getElementById('leaseSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Lease';
        document.getElementById('leaseFormId').value = '';
        document.getElementById('leaseForm').reset();
        closeLeaseTenantList();
        await ensureUnitsLoaded();
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
    /*
        Name: openEditLeaseModal
        Purpose: Populates and opens the lease modal in "Edit" mode for the given lease id.
        Used by: dashboard.js (renderLeases edit button)
        Found in: Line 784-795 in dashboard.js
    */
    async function openEditLeaseModal(id) {
        const lease = leasesPageRows.find(l => l.id === id); if (!lease) return;
        document.getElementById('leaseModalTitle').textContent = 'Edit Lease';
        document.getElementById('leaseSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Lease';
        document.getElementById('leaseFormId').value    = id;
        document.getElementById('leaseTenant').value    = lease.tenant;
        closeLeaseTenantList();
        document.getElementById('leaseStart').value     = lease.start;
        document.getElementById('leaseEnd').value       = lease.end;
        document.getElementById('leaseRent').value      = lease.rent;
        await ensureUnitsLoaded();
        populateLeaseUnitSelect(lease.unitId);
        openModal('leaseModal');
    }
    /*
        Name: handleLeaseFormSubmit
        Purpose: Validates the lease form and saves the lease (create or update), then refreshes the dashboard.
        Used by: dashboard.js (leaseForm submit listener)
        Found in: Line 797-813 in dashboard.js
    */
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
            await Promise.all([reloadCurrentPage('leases'), reloadCurrentPage('units'), reloadCurrentPage('tenants')]);
            closeModal('leaseModal'); showToast(`Lease for "${tenant}" ${id ? 'updated' : 'created'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    /*
        SECTION: CRUD - Tenants
        Purpose: Opens the Add/Edit Tenant modal and handles its form submission.
    */
    /*
        Name: populateTenantUnitSelect
        Purpose: Fills the tenant modal's unit dropdown with available (non-occupied) units,
        pre-selecting the given unit if provided. The currently-selected unit is always kept
        in the list even if occupied, so editing a tenant doesn't hide their own unit.
        Used by: dashboard.js (openAddTenantModal, openEditTenantModal)
        Found in: Line 834-838 in dashboard.js
    */
    function populateTenantUnitSelect(selectedId) {
        const sel = document.getElementById('tenantUnit');
        const available = units.filter(u => u.status !== 'Occupied' || u.id === selectedId);
        sel.innerHTML = '<option value="">— None —</option>' +
            available.map(u => `<option value="${u.id}" ${u.id === selectedId ? 'selected' : ''}>${u.number} (${u.type})</option>`).join('');
    }
    /*
        Name: openAddTenantModal
        Purpose: Resets and opens the tenant modal in "Add" mode.
        Used by: dashboard.js (heroActionBtn/quick-action handlers for tenants)
        Found in: Line 844-851 in dashboard.js
    */
    async function openAddTenantModal() {
        document.getElementById('tenantModalTitle').textContent = 'Add Tenant';
        document.getElementById('tenantSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Tenant';
        document.getElementById('tenantFormId').value = '';
        document.getElementById('tenantForm').reset();
        await ensureUnitsLoaded();
        populateTenantUnitSelect(null);
        setTenantUnitFieldLocked(false);
        openModal('tenantModal');
    }
    /*
        Name: setTenantUnitFieldLocked
        Purpose: Locks (edit mode) or unlocks (add mode) the Assigned Unit field on
        the tenant modal. It only changes automatically once a lease is created,
        renewed, or ended, so it's only editable during registration.
        Used by: dashboard.js (openAddTenantModal, openEditTenantModal)
        Found in: Line 878-883 in dashboard.js
    */
    function setTenantUnitFieldLocked(locked) {
        document.getElementById('tenantUnit').disabled         = locked;
        document.getElementById('tenantUnitLabel').textContent = locked ? 'Assigned Unit' : 'Assigned Unit (optional)';
        document.getElementById('tenantUnitLockedNote').style.display = locked ? 'block' : 'none';
    }
    /*
        Name: openEditTenantModal
        Purpose: Populates and opens the tenant modal in "Edit" mode for the given tenant id.
        Used by: dashboard.js (renderTenants edit button)
        Found in: Line 853-864 in dashboard.js
    */
    async function openEditTenantModal(id) {
        const tenant = tenantsPageRows.find(t => t.id === id); if (!tenant) { showToast('Tenant not found.', 'error'); return; }
        document.getElementById('tenantModalTitle').textContent = `Edit ${tenant.name}`;
        document.getElementById('tenantSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Tenant';
        document.getElementById('tenantFormId').value        = id;
        document.getElementById('tenantName').value          = tenant.name;
        document.getElementById('tenantEmail').value         = tenant.email || '';
        document.getElementById('tenantPhone').value         = tenant.phone || '';
        await ensureUnitsLoaded();
        populateTenantUnitSelect(tenant.unitId);
        setTenantUnitFieldLocked(true);
        openModal('tenantModal');
    }
    /*
        Name: handleTenantFormSubmit
        Purpose: Validates the tenant form and saves the tenant (create or update), then refreshes the dashboard.
        Used by: dashboard.js (tenantForm submit listener)
        Found in: Line 866-881 in dashboard.js
    */
    async function handleTenantFormSubmit(e) {
        e.preventDefault();
        const id          = document.getElementById('tenantFormId').value;
        const name        = document.getElementById('tenantName').value.trim();
        const email       = document.getElementById('tenantEmail').value.trim();
        const phone       = document.getElementById('tenantPhone').value.trim();
        // Assigned Unit can only be set during registration; once a tenant
        // exists it's disabled on the form (see setTenantUnitFieldLocked),
        // but a disabled <select>'s value is still readable via JS — it was
        // set from the tenant's current unit when the modal opened — so an
        // edit always keeps that value regardless of the field being locked.
        let   unitId      = document.getElementById('tenantUnit').value || null;
        if (!name) { showToast('Please enter a name.', 'error'); return; }
        if (!isValidPhone(phone)) { showToast('Phone number must be exactly 11 digits.', 'error'); document.getElementById('tenantPhone').focus(); return; }
        try {
            const isNew = !id;

            let unit = null;
            if (unitId) {
                unit = units.find(u => String(u.id) === String(unitId));
                if (!unit) { showToast('Unit not found.', 'error'); return; }
                if (isNew && unit.status === 'Occupied') { showToast('This unit is already occupied.', 'warning'); return; }
            }

            const data = { name, email, phone, unitId }; if (id) data.id = id;
            await DataManager.saveTenant(data);

            if (isNew && unitId && unit) {
                const today = new Date();
                const start = today.toISOString().slice(0, 10);
                const end   = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
                await DataManager.saveLease({ tenant: name, unitId, start, end, rent: unit.rent });
            }

            await DataManager.loadAll(); renderAll();
            await Promise.all([reloadCurrentPage('tenants'), reloadCurrentPage('leases'), reloadCurrentPage('units')]);
            closeModal('tenantModal'); showToast(`Tenant "${name}" ${id ? 'updated' : 'registered'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    /*
        SECTION: CRUD - Payments
        Purpose: Manages the tenant-name autocomplete combobox, the unit
        field (plain input vs. dropdown for tenants with multiple leases),
        and the Add/Edit Payment modal and its form submission.
    */
    /*
        Name: renderPaymentTenantSuggestions
        Purpose: Restricts the "Tenant Name" field to registered tenants: typing
        filters a dropdown of existing tenants, and picking one auto-fills the
        Unit field from that tenant's currently-leased unit. Free text that
        doesn't match a registered tenant is rejected on submit (see
        handlePaymentFormSubmit).
        Used by: dashboard.js (initPaymentTenantCombobox input/focus listeners)
        Found in: Line 911-939 in dashboard.js
    */
    /*
        Name: paymentTenantSearchResults
        Purpose: Caches the most recent tenant-search results shown in the
        Payment form's tenant combobox, so selectPaymentTenant can resolve a
        clicked suggestion's id/unitNumbers without a full tenants list.
        Used by: dashboard.js (renderPaymentTenantSuggestions, selectPaymentTenant)
    */
    let paymentTenantSearchResults = [];

    /*
        Name: renderPaymentTenantSuggestions
        Purpose: Restricts the "Tenant Name" field to registered tenants: typing
        searches the server for matching tenants, and picking one auto-fills the
        Unit field from that tenant's currently-leased unit. Free text that
        doesn't match a registered tenant is rejected on submit (see
        handlePaymentFormSubmit).
        Used by: dashboard.js (initPaymentTenantCombobox input/focus listeners)
    */
    async function renderPaymentTenantSuggestions(query) {
        const list = document.getElementById('paymentTenantList');
        const q = (query || '').trim();
        let matches;
        try {
            matches = normalizeTenantList(await ApiService.searchTenants(q));
        } catch (err) {
            list.innerHTML = `<div class="combobox-empty">Error searching tenants.</div>`;
            list.classList.add('open');
            return;
        }
        paymentTenantSearchResults = matches;

        if (matches.length === 0) {
            list.innerHTML = q
                ? `<div class="combobox-empty">No matching tenants</div>`
                : `<div class="combobox-empty">Start typing to search registered tenants.</div>`;
        } else {
            list.innerHTML = matches.map(t => {
                const unitNumbers = parseUnitNumbers(t.unitNumbers);
                const unitHint = unitNumbers.length ? `Unit ${unitNumbers.join(', ')}` : 'No unit assigned';
                return `<div class="combobox-item" data-tenant-id="${t.id}">${t.name}<small>${unitHint}</small></div>`;
            }).join('');
        }
        list.classList.add('open');
        list.querySelectorAll('.combobox-item[data-tenant-id]').forEach(item => {
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectPaymentTenant(this.dataset.tenantId);
            });
        });
    }
    /*
        Name: getUnitRentByNumber
        Purpose: Looks up a unit's monthly rent by its unit number, for auto-filling the Amount field.
        Used by: dashboard.js (applyRentForUnit, initPaymentTenantCombobox)
        Found in: Line 946-949 in dashboard.js
    */
    function getUnitRentByNumber(unitNumber) {
        const u = units.find(u => u.number === unitNumber);
        return u ? u.rent : null;
    }
    /*
        Name: applyRentForUnit
        Purpose: Auto-fills the Amount field from the given unit's rent, clearing it if the unit doesn't resolve to a known rent.
        Used by: dashboard.js (setPaymentUnitField, initPaymentTenantCombobox)
        Found in: Line 957-960 in dashboard.js
    */
    function applyRentForUnit(unitNumber) {
        const rent = getUnitRentByNumber(unitNumber);
        document.getElementById('paymentAmount').value = (rent !== null && rent !== undefined) ? rent : '';
    }
    /*
        Name: setPaymentUnitField
        Purpose: Switches the Unit field between a plain auto-fill text input
        (single or no lease) and a dropdown (multiple active leases for the
        tenant). `selectedUnit` pre-fills/pre-selects whichever field ends up
        shown; if it isn't among unitNumbers it's still included so existing
        data is never silently lost. `autoFillAmount` (default true) also syncs
        the Amount field to the resolved unit's rent; pass false to leave an
        existing amount untouched (e.g. when opening Edit Payment on an
        already-recorded amount).
        Used by: dashboard.js (selectPaymentTenant, openAddPaymentModal, openEditPaymentModal, initPaymentTenantCombobox)
        Found in: Line 973-1000 in dashboard.js
    */
    function setPaymentUnitField(unitNumbers, selectedUnit, autoFillAmount) {
        const input  = document.getElementById('paymentUnit');
        const select = document.getElementById('paymentUnitSelect');
        const units_ = unitNumbers || [];
        if (units_.length > 1) {
            const options = units_.includes(selectedUnit) || !selectedUnit
                ? units_
                : units_.concat([selectedUnit]);
            select.innerHTML = options.map(u => `<option value="${u}" ${u === selectedUnit ? 'selected' : ''}>${u}</option>`).join('');
            if (!selectedUnit) select.value = options[0] || '';
            select.style.display = '';
            select.required = true;
            input.style.display = 'none';
            input.required = false;
            input.value = select.value;
        } else {
            input.style.display = '';
            input.required = true;
            select.style.display = 'none';
            select.required = false;
            select.innerHTML = '';
            input.value = selectedUnit || units_[0] || '';
        }
        if (autoFillAmount !== false) applyRentForUnit(input.style.display === 'none' ? select.value : input.value);
    }
    /*
        Name: selectPaymentTenant
        Purpose: Fills the payment tenant field with the chosen tenant's name and auto-fills their unit/amount.
        Used by: dashboard.js (renderPaymentTenantSuggestions mousedown handler)
        Found in: Line 1042-1050 in dashboard.js
    */
    function selectPaymentTenant(tenantId) {
        const tenant = paymentTenantSearchResults.find(t => String(t.id) === String(tenantId));
        if (!tenant) return;
        const input = document.getElementById('paymentTenant');
        input.value = tenant.name;
        input.dataset.confirmedTenant = tenant.name;
        document.getElementById('paymentTenantList').classList.remove('open');
        const unitNumbers = parseUnitNumbers(tenant.unitNumbers);
        setPaymentUnitField(unitNumbers, unitNumbers.length ? unitNumbers[0] : '');
    }
    /*
        Name: closePaymentTenantList
        Purpose: Hides the payment tenant-name suggestion dropdown.
        Used by: dashboard.js (selectPaymentTenant, openAddPaymentModal, openEditPaymentModal, initPaymentTenantCombobox)
        Found in: Line 1052-1054 in dashboard.js
    */
    function closePaymentTenantList() {
        document.getElementById('paymentTenantList').classList.remove('open');
    }
    (function initPaymentTenantCombobox() {
        const input = document.getElementById('paymentTenant');
        const debouncedSuggest = debounce(v => renderPaymentTenantSuggestions(v), 250);
        input.addEventListener('input', function () {
            this.dataset.confirmedTenant = '';
            debouncedSuggest(this.value);
            setPaymentUnitField([], '');
        });
        input.addEventListener('focus', function () { renderPaymentTenantSuggestions(this.value); });
        document.addEventListener('click', function (e) {
            if (!document.getElementById('paymentTenantCombobox').contains(e.target)) closePaymentTenantList();
        });
        document.getElementById('paymentUnitSelect').addEventListener('change', function () {
            applyRentForUnit(this.value);
        });
        document.getElementById('paymentUnit').addEventListener('input', function () {
            const rent = getUnitRentByNumber(this.value.trim());
            if (rent !== null && rent !== undefined) document.getElementById('paymentAmount').value = rent;
        });
    })();

    /*
        Name: openAddPaymentModal
        Purpose: Resets and opens the payment modal in "Record Payment" mode.
        Used by: dashboard.js (heroActionBtn/quick-action handlers for payments)
        Found in: Line 1081-1090 in dashboard.js
    */
    function openAddPaymentModal() {
        document.getElementById('paymentModalTitle').textContent = 'Record Payment';
        document.getElementById('paymentSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Payment';
        document.getElementById('paymentFormId').value = '';
        document.getElementById('paymentForm').reset();
        document.getElementById('paymentTenant').dataset.confirmedTenant = '';
        closePaymentTenantList();
        setPaymentUnitField([], '');
        document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10);
        openModal('paymentModal');
    }
    /*
        Name: openEditPaymentModal
        Purpose: Populates and opens the payment modal in "Edit" mode for the
        given payment id, looking it up from the current page (the edit
        button only ever renders for a row that's on screen). Looks up the
        tenant's currently-active unit(s) fresh via a name search, so the
        Unit field can switch to a dropdown for tenants with multiple leases.
        Used by: dashboard.js (renderPayments edit button)
    */
    async function openEditPaymentModal(id) {
        const payment = paymentsPageRows.find(p => String(p.id) === String(id)); if (!payment) { showToast('Payment not found.', 'error'); return; }
        document.getElementById('paymentModalTitle').textContent = 'Edit Payment';
        document.getElementById('paymentSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Payment';
        document.getElementById('paymentFormId').value   = id;
        document.getElementById('paymentTenant').value   = payment.tenant;
        document.getElementById('paymentTenant').dataset.confirmedTenant = payment.tenant;
        closePaymentTenantList();
        let unitNumbers = [payment.unit].filter(Boolean);
        try {
            const matches = normalizeTenantList(await ApiService.searchTenants(payment.tenant));
            const exact = matches.find(t => t.name.toLowerCase() === payment.tenant.toLowerCase());
            if (exact) unitNumbers = parseUnitNumbers(exact.unitNumbers);
        } catch (err) { /* fall back to just the payment's recorded unit */ }
        setPaymentUnitField(unitNumbers, payment.unit, false);
        document.getElementById('paymentDate').value     = payment.date;
        document.getElementById('paymentAmount').value   = payment.amount;
        document.getElementById('paymentStatus').value   = payment.status;
        openModal('paymentModal');
    }
    /*
        Name: handlePaymentFormSubmit
        Purpose: Validates the payment form (rejecting any tenant name that
        isn't already registered — confirmed by having been picked from the
        combobox, tracked via the field's confirmedTenant dataset) and saves
        the payment, then refreshes the dashboard.
        Used by: dashboard.js (paymentForm submit listener)
        Found in: Line 1108-1124 in dashboard.js
    */
    async function handlePaymentFormSubmit(e) {
        e.preventDefault();
        const id         = document.getElementById('paymentFormId').value;
        const tenantInput = document.getElementById('paymentTenant');
        const tenantText   = tenantInput.value.trim();
        const paymentUnitSelect = document.getElementById('paymentUnitSelect');
        const unit = (paymentUnitSelect.style.display !== 'none' ? paymentUnitSelect.value : document.getElementById('paymentUnit').value).trim();
        const date       = document.getElementById('paymentDate').value;
        const amount     = parseFloat(document.getElementById('paymentAmount').value);
        const status     = document.getElementById('paymentStatus').value;
        if (!tenantText) { showToast('Please enter tenant name.', 'error'); return; }
        if (tenantInput.dataset.confirmedTenant !== tenantText) {
            showToast('Please select an existing tenant from the list.', 'error'); return;
        }
        const tenant = tenantText;
        if (!unit)   { showToast('Please enter unit number.', 'error'); return; }
        if (!date)   { showToast('Please select a date.', 'error'); return; }
        if (!amount || amount < 0) { showToast('Please enter a valid amount.', 'error'); return; }
        try {
            const data = { tenant, unit, date, amount, status }; if (id) data.id = id;
            await DataManager.savePayment(data); await DataManager.loadAll(); renderAll();
            await Promise.all([reloadCurrentPage('payments'), reloadCurrentPage('reports')]);
            closeModal('paymentModal'); showToast(`Payment for "${tenant}" ${id ? 'updated' : 'recorded'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    /*
        SECTION: CRUD - Employees
        Purpose: Opens the Add/Edit Employee modal and handles its form submission.
    */
    /*
        Name: openAddEmployeeModal
        Purpose: Resets and opens the employee modal in "Add" mode.
        Used by: dashboard.js (heroActionBtn/quick-action handlers for employees)
        Found in: Line 1119-1126 in dashboard.js
    */
    function openAddEmployeeModal() {
        document.getElementById('employeeModalTitle').textContent = 'Add Employee';
        document.getElementById('employeeSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Employee';
        document.getElementById('employeeFormId').value = '';
        document.getElementById('employeeForm').reset();
        openModal('employeeModal');
    }
    /*
        Name: openEditEmployeeModal
        Purpose: Populates and opens the employee modal in "Edit" mode for the given employee id.
        Used by: dashboard.js (renderEmployees edit button)
        Found in: Line 1128-1138 in dashboard.js
    */
    function openEditEmployeeModal(id) {
        const emp = employeesPageRows.find(e => e.id === id);
        if (!emp) { showToast('Employee not found.', 'error'); return; }
        document.getElementById('employeeModalTitle').textContent = `Edit ${emp.name}`;
        document.getElementById('employeeSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Employee';
        document.getElementById('employeeFormId').value  = id;
        document.getElementById('employeeName').value    = emp.name;
        document.getElementById('employeeEmail').value   = emp.email  || '';
        document.getElementById('employeePhone').value   = emp.phone  || '';
        openModal('employeeModal');
    }
    /*
        Name: handleEmployeeFormSubmit
        Purpose: Validates the employee form and saves the employee (create or update), then refreshes the dashboard.
        Used by: dashboard.js (employeeForm submit listener)
        Found in: Line 1140-1153 in dashboard.js
    */
    async function handleEmployeeFormSubmit(e) {
        e.preventDefault();
        const id    = document.getElementById('employeeFormId').value;
        const name  = document.getElementById('employeeName').value.trim();
        const email = document.getElementById('employeeEmail').value.trim();
        const phone = document.getElementById('employeePhone').value.trim();
        if (!name) { showToast('Please enter a name.', 'error'); return; }
        if (!isValidPhone(phone)) { showToast('Phone number must be exactly 11 digits.', 'error'); document.getElementById('employeePhone').focus(); return; }
        try {
            const data = { name, email, phone }; if (id) data.id = id;
            await DataManager.saveEmployee(data); await DataManager.loadAll(); renderAll(); await reloadCurrentPage('employees');
            closeModal('employeeModal'); showToast(`Employee "${name}" ${id ? 'updated' : 'added'} successfully.`);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    /*
        SECTION: Delete Confirm
        Purpose: Shared confirmation modal for deleting a unit or employee
        (permanent) and archiving a tenant, lease, or payment (reversible via
        Archive Mode), including a dependency check that blocks removing a
        unit/tenant that still has an active lease.
    */
    let deleteTarget = null;

    /*
        Name: ARCHIVABLE_TYPES
        Purpose: Entity types whose "delete" button archives instead of
        permanently deleting the row. Units and employees are unaffected.
    */
    const ARCHIVABLE_TYPES = ['tenant', 'lease', 'payment'];

    /*
        Name: confirmDelete
        Purpose: Opens the shared confirmation modal for the given entity type/id.
        For tenants/leases/payments this archives the record (reversible via
        Archive Mode); for units/employees it permanently deletes it. Blocks
        the action if it has an active lease dependency.
        Used by: dashboard.js (every render* table's delete button)
        Found in: Line 1195-1214 in dashboard.js
    */
    async function confirmDelete(type, id) {
        deleteTarget = { type, id };
        let name = '';
        if      (type === 'unit')     { const i = units.find(u => u.id === id);              name = i ? i.number  : 'this unit'; }
        else if (type === 'lease')    { const i = leasesPageRows.find(l => l.id === id);     name = i ? i.tenant  : 'this lease'; }
        else if (type === 'tenant')   { const i = tenantsPageRows.find(t => t.id === id);    name = i ? i.name    : 'this tenant'; }
        else if (type === 'payment')  { const i = paymentsPageRows.find(p => String(p.id) === String(id)); name = i ? i.tenant : 'this payment'; }
        else if (type === 'employee') { const i = employeesPageRows.find(e => e.id === id);  name = i ? i.name    : 'this employee'; }

        const isArchivable = ARCHIVABLE_TYPES.includes(type);
        let msg = isArchivable
            ? `Are you sure you want to archive "${name}"? It will be hidden from view, but you can restore it later by turning on Archive Mode.`
            : `Are you sure you want to delete "${name}"? This action cannot be undone.`;
        let hasDependency = false;

        try {
            if (type === 'unit') {
                const result = await ApiService.unitHasActiveLease(id);
                if (result && result.rows && result.rows.length > 0) {
                    msg = `"${name}" has active leases. Please end the lease first before deleting.`; hasDependency = true;
                }
            } else if (type === 'tenant') {
                const result = await ApiService.tenantHasActiveLease(id);
                if (result && result.rows && result.rows.length > 0) {
                    msg = `"${name}" has an active lease. Please end the lease first before archiving.`; hasDependency = true;
                }
            }
        } catch (err) {
            console.error('Dependency check error:', err);
        }

        document.getElementById('confirmModalTitle').textContent = isArchivable ? 'Confirm Archive' : 'Confirm Delete';
        document.getElementById('confirmMessage').textContent = msg;
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.style.display = hasDependency ? 'none' : 'inline-flex';
        confirmBtn.innerHTML = isArchivable
            ? '<i class="fas fa-box-archive"></i> Archive'
            : '<i class="fas fa-trash"></i> Delete';
        openModal('confirmModal');
    }

    /*
        Name: TYPE_SECTIONS
        Purpose: Maps an entity type to the paginated section(s) whose
        current page should be reloaded after that entity is deleted or
        restored (e.g. deleting a lease frees up its unit and changes the
        tenant's derived lease status, so units and tenants get refreshed too).
        Used by: dashboard.js (confirmDeleteBtn click handler, restoreItem)
    */
    const TYPE_SECTIONS = {
        unit:     ['units'],
        lease:    ['leases', 'units', 'tenants'],
        tenant:   ['tenants'],
        payment:  ['payments', 'reports'],
        employee: ['employees'],
    };

    document.getElementById('confirmDeleteBtn').addEventListener('click', async function () {
        if (!deleteTarget) return;
        const { type, id } = deleteTarget;
        const isArchivable = ARCHIVABLE_TYPES.includes(type);
        try {
            if      (type === 'unit')     await DataManager.deleteUnit(id);
            else if (type === 'lease')    await DataManager.deleteLease(id);
            else if (type === 'tenant')   await DataManager.deleteTenant(id);
            else if (type === 'payment')  await DataManager.deletePayment(id);
            else if (type === 'employee') await DataManager.deleteEmployee(id);
            await DataManager.loadAll(); renderAll();
            await Promise.all((TYPE_SECTIONS[type] || []).map(reloadCurrentPage));
            closeModal('confirmModal');
            showToast(isArchivable ? 'Archived successfully.' : 'Deleted successfully.');
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        deleteTarget = null;
    });

    /*
        Name: restoreItem
        Purpose: Restores a previously-archived tenant, lease, or payment
        (clears its archived flag) and refreshes the affected table.
        Used by: dashboard.js (renderTenants/renderLeases/renderPayments restore buttons)
    */
    async function restoreItem(type, id) {
        try {
            if      (type === 'tenant')  await DataManager.restoreTenant(id);
            else if (type === 'lease')   await DataManager.restoreLease(id);
            else if (type === 'payment') await DataManager.restorePayment(id);
            await DataManager.loadAll();
            renderAll();
            await Promise.all((TYPE_SECTIONS[type] || []).map(reloadCurrentPage));
            showToast('Restored successfully.');
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    /*
        Name: setArchiveMode
        Purpose: Toggles Archive Mode for the Tenants, Leases, or Payments
        page and reloads that section's page 1 with ?archived=true, so
        archived rows show up alongside active ones.
        Used by: dashboard.js (tenantsArchiveToggle/leasesArchiveToggle/paymentsArchiveToggle change listeners)
    */
    async function setArchiveMode(section, enabled) {
        archiveMode[section] = enabled;
        try {
            await loadSectionPage(section, 1);
        } catch (err) {
            showToast('Error loading archive: ' + err.message, 'error');
            archiveMode[section] = false;
            const toggleIds = { tenants: 'tenantsArchiveToggle', leases: 'leasesArchiveToggle', payments: 'paymentsArchiveToggle' };
            const toggleEl = document.getElementById(toggleIds[section]);
            if (toggleEl) toggleEl.checked = false;
            await loadSectionPage(section, 1);
        }
        applyRolePermissions();
    }

    document.getElementById('tenantsArchiveToggle').addEventListener('change', function () { setArchiveMode('tenants', this.checked); });
    document.getElementById('leasesArchiveToggle').addEventListener('change', function () { setArchiveMode('leases', this.checked); });
    document.getElementById('paymentsArchiveToggle').addEventListener('change', function () { setArchiveMode('payments', this.checked); });

    /*
        Name: refresh
        Purpose: Reloads all data from the API and re-renders the currently active section.
        Used by: dashboard.js (refreshBtn click listener)
        Found in: Line 1263-1271 in dashboard.js
    */
    async function refresh() {
        showToast('Refreshing...', 'warning');
        try {
            await DataManager.loadAll();
            renderAll();
            await Promise.all(Object.keys(pagination).map(reloadCurrentPage));
            const label = meta[currentSection]?.title || 'Page';
            showToast(label + ' refreshed!');
        } catch (err) {
            showToast('Refresh failed: ' + err.message, 'error');
        }
    }

    /*
        SECTION: PDF Generation
        Purpose: The live dashboard uses a dark, translucent "glass" theme that
        html2canvas can't capture cleanly (it doesn't support backdrop-filter,
        and panels lose the gradient they're meant to blend into). Instead of
        screenshotting the dashboard, this section builds a dedicated light,
        print-friendly HTML layout from the underlying data for whichever page
        is active, then captures that layout as a PDF.
    */

    /*
        Name: pdfHeader
        Purpose: Builds the RentEase title/section-name header shown at the top of every generated PDF.
        Used by: dashboard.js (every buildXPDF function)
        Found in: Line 1259-1272 in dashboard.js
    */
    function pdfHeader(sectionTitle) {
        const generatedOn = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #000000; padding-bottom:16px; margin-bottom:24px;">
                <div>
                    <div style="font-size:22px; font-weight:700; color:#000000;">RentEase</div>
                    <div style="font-size:13px; color:#666666;">Apartment Rental Management System</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:16px; font-weight:700; color:#000000;">${sectionTitle}</div>
                    <div style="font-size:12px; color:#666666;">Generated ${generatedOn}</div>
                </div>
            </div>`;
    }

    /*
        Name: pdfFooter
        Purpose: Builds the standard footer line shown at the bottom of every generated PDF.
        Used by: dashboard.js (every buildXPDF function)
        Found in: Line 1279-1284 in dashboard.js
    */
    function pdfFooter() {
        return `
            <div style="margin-top:32px; padding-top:14px; border-top:1px solid #cccccc; font-size:11px; color:#666666; text-align:center;">
                RentEase v1.0 · This report was generated automatically from live property data.
            </div>`;
    }

    /*
        Name: pdfWrap
        Purpose: Wraps a PDF page's inner HTML in the shared white page container (size, padding, font).
        Used by: dashboard.js (every buildXPDF function)
        Found in: Line 1286-1288 in dashboard.js
    */
    function pdfWrap(innerHtml) {
        return `<div style="width:1000px; padding:40px 48px; background:#ffffff; color:#000000; font-family: Helvetica, Arial, sans-serif;">${innerHtml}</div>`;
    }

    /*
        Name: pdfStatCard
        Purpose: Renders a single label/value stat card used on the dashboard PDF summary.
        Used by: dashboard.js (buildDashboardPDF)
        Found in: Line 1290-1296 in dashboard.js
    */
    function pdfStatCard(label, value) {
        return `
            <div style="flex:1; min-width:180px; background:#f5f5f5; border:1px solid #cccccc; border-radius:10px; padding:16px 18px;">
                <div style="font-size:24px; font-weight:700; color:#000000;">${value}</div>
                <div style="font-size:12px; color:#666666; margin-top:4px;">${label}</div>
            </div>`;
    }

    /*
        Name: pdfBadge
        Purpose: Renders a status badge using grayscale fill/outline (instead of
        color) so status is still distinguishable on a black & white printout.
        Used by: dashboard.js (every buildXPDF function)
        Found in: Line 1301-1309 in dashboard.js
    */
    function pdfBadge(status) {
        const solid   = ['Paid', 'Occupied', 'Active'];
        const outline = ['Overdue', 'Expired'];
        const style = solid.includes(status)
            ? 'background:#000000; color:#ffffff;'
            : outline.includes(status)
                ? 'background:#ffffff; color:#000000; border:1.5px solid #000000;'
                : 'background:#e5e5e5; color:#000000;';
        return `<span style="display:inline-block; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:600; ${style}">${status}</span>`;
    }

    /*
        Name: pdfTable
        Purpose: Renders a full PDF table (header row + body rows, or an empty-state message) from column definitions and row HTML.
        Used by: dashboard.js (every buildXPDF function)
        Found in: Line 1311-1320 in dashboard.js
    */
    function pdfTable(columns, bodyRowsHtml, emptyMessage) {
        return `
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#000000;">
                        ${columns.map(c => `<th style="padding:10px 12px; text-align:${c.align || 'left'}; color:#ffffff; font-weight:600;">${c.label}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>${bodyRowsHtml.length ? bodyRowsHtml.join('') : `<tr><td colspan="${columns.length}" style="padding:16px; text-align:center; color:#666666;">${emptyMessage}</td></tr>`}</tbody>
            </table>`;
    }

    /*
        Name: pdfRow
        Purpose: Renders a single zebra-striped PDF table row from an array of cell values.
        Used by: dashboard.js (every buildXPDF function)
        Found in: Line 1322-1324 in dashboard.js
    */
    function pdfRow(cellsHtml, zebraIndex) {
        return `<tr style="background:${zebraIndex % 2 === 0 ? '#ffffff' : '#f2f2f2'};">${cellsHtml.map(c => `<td style="padding:10px 12px; border-bottom:1px solid #cccccc;${c.align ? ' text-align:' + c.align + ';' : ''}">${c.value}</td>`).join('')}</tr>`;
    }

    /*
        Name: buildUnitsPDF
        Purpose: Builds the print-friendly HTML page for the Units report.
        Used by: dashboard.js (generatePDF)
        Found in: Line 1326-1339 in dashboard.js
    */
    function buildUnitsPDF() {
        const rows = (units || []).map((u, i) => pdfRow([
            { value: `<strong>${u.number}</strong>` },
            { value: u.type },
            { value: formatCurrency(u.rent), align: 'right' },
            { value: pdfBadge(u.status) },
            { value: u.tenantName || '—' },
        ], i));
        const columns = [
            { label: 'Unit #' }, { label: 'Type' }, { label: 'Rent', align: 'right' },
            { label: 'Status' }, { label: 'Tenant' },
        ];
        return pdfWrap(pdfHeader('Unit Management') + pdfTable(columns, rows, 'No units yet.') + pdfFooter());
    }

    /*
        Name: buildTenantsPDF
        Purpose: Builds the print-friendly HTML page for the Tenants report.
        Fetches every (non-archived) tenant fresh at export time — since
        the Tenants table itself is paginated, there's no full tenant list
        already sitting in memory to reuse.
        Used by: dashboard.js (generatePDF)
    */
    async function buildTenantsPDF() {
        const allTenants = normalizeTenantList(await ApiService.getTenants());
        const rows = allTenants.map((t, i) => pdfRow([
            { value: `<strong>${t.name}</strong>` },
            { value: t.email || '—' },
            { value: t.phone || '—' },
            { value: t.unitNumbers || '—' },
            { value: pdfBadge(t.leaseStatus) },
        ], i));
        const columns = [
            { label: 'Name' }, { label: 'Email' }, { label: 'Phone' },
            { label: 'Unit(s)' }, { label: 'Status' },
        ];
        return pdfWrap(pdfHeader('Tenant Management') + pdfTable(columns, rows, 'No tenants yet.') + pdfFooter());
    }

    /*
        Name: buildLeasesPDF
        Purpose: Builds the print-friendly HTML page for the Leases report.
        Used by: dashboard.js (generatePDF)
        Found in: Line 1399-1417 in dashboard.js
    */
    async function buildLeasesPDF() {
        const allLeases = normalizeLeaseList(await ApiService.getLeases());
        const rows = allLeases.map((l, i) => pdfRow([
            { value: `<strong>${l.id}</strong>` },
            { value: l.tenant },
            { value: l.unitNumber || '—' },
            { value: formatDate(l.start) },
            { value: formatDate(l.end) },
            { value: formatCurrency(l.rent), align: 'right' },
        ], i));
        const columns = [
            { label: 'Lease ID' }, { label: 'Tenant' }, { label: 'Unit' },
            { label: 'Start' }, { label: 'End' }, { label: 'Rent', align: 'right' },
        ];
        return pdfWrap(pdfHeader('Lease Contracts') + pdfTable(columns, rows, 'No leases yet.') + pdfFooter());
    }

    /*
        Name: buildPaymentsPDF
        Purpose: Builds the print-friendly HTML page for the Payments report,
        fetching every (non-archived) payment fresh at export time.
        Used by: dashboard.js (generatePDF)
    */
    async function buildPaymentsPDF() {
        const allPayments = normalizePaymentList(await ApiService.getPayments());
        const rows = allPayments.map((p, i) => pdfRow([
            { value: `<strong>${p.id}</strong>` },
            { value: formatDate(p.date) },
            { value: p.tenant },
            { value: p.unit },
            { value: formatCurrency(p.amount), align: 'right' },
            { value: pdfBadge(p.status) },
        ], i));
        const columns = [
            { label: 'Payment ID' }, { label: 'Date' }, { label: 'Tenant' },
            { label: 'Unit' }, { label: 'Amount', align: 'right' }, { label: 'Status' },
        ];
        return pdfWrap(pdfHeader('Payment Records') + pdfTable(columns, rows, 'No payment records yet.') + pdfFooter());
    }

    /*
        Name: buildEmployeesPDF
        Purpose: Builds the print-friendly HTML page for the Employees report,
        fetching every employee fresh at export time.
        Used by: dashboard.js (generatePDF)
    */
    async function buildEmployeesPDF() {
        const allEmployees = normalizeEmployeeList(await ApiService.getEmployees());
        const rows = allEmployees.map((e, i) => pdfRow([
            { value: `<strong>${e.name}</strong>` },
            { value: e.email || '—' },
            { value: e.phone || '—' },
        ], i));
        const columns = [
            { label: 'Name' }, { label: 'Email' }, { label: 'Phone' },
        ];
        return pdfWrap(pdfHeader('Employee Management') + pdfTable(columns, rows, 'No employees yet.') + pdfFooter());
    }

    /*
        Name: buildDashboardPDF
        Purpose: Builds the print-friendly HTML page for the Dashboard overview report (stat cards, occupancy, recent activity, revenue).
        Used by: dashboard.js (generatePDF)
        Found in: Line 1463-1548 in dashboard.js
    */
    function buildDashboardPDF() {
        const totalUnits     = stats.totalUnits || 0;
        const occupied       = stats.occupiedUnits || 0;
        const activeTenants  = stats.activeTenants || 0;
        const totalRent      = stats.totalRent || 0;
        const totalEmployees = stats.totalEmployees || 0;

        const stats = `
            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:28px;">
                ${pdfStatCard('Total Units', totalUnits)}
                ${pdfStatCard('Occupied', occupied)}
                ${pdfStatCard('Active Tenants', activeTenants)}
                ${pdfStatCard('Employees', totalEmployees)}
                ${pdfStatCard('Monthly Rent Roll', formatCurrency(totalRent))}
            </div>`;

        const activityRows = (!recentActivity || recentActivity.length === 0)
            ? []
            : recentActivity.slice(0, 10).map((a, i) => pdfRow([
                { value: timeAgo(a.created_at) },
                { value: a.description },
                { value: a.username || 'Admin' },
            ], i));
        const activityTable = pdfTable(
            [{ label: 'When' }, { label: 'Activity' }, { label: 'By' }],
            activityRows,
            'No recent activity.'
        );

        return pdfWrap(
            pdfHeader('Dashboard Overview') + stats +
            `<div style="font-size:15px; font-weight:700; color:#000000; margin-bottom:10px;">Recent Activity</div>` +
            activityTable + pdfFooter()
        );
    }

    /*
        Name: buildReportsPDF
        Purpose: Builds the print-friendly HTML page for the Reports & Analytics report.
        Used by: dashboard.js (buildPrintableReportHTML)
        Found in: Line 1507-1544 in dashboard.js
    */
    async function buildReportsPDF() {
        const totalUnits     = stats.totalUnits || 0;
        const occupied       = stats.occupiedUnits || 0;
        const occupancyRate  = totalUnits ? Math.round(occupied / totalUnits * 100) : 0;
        const totalRevenue   = stats.totalRevenue || 0;
        const overdueTotal   = stats.overdueTotal || 0;
        const expiringLeases = stats.expiringLeases || 0;

        const stats = `
            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:28px;">
                ${pdfStatCard('Total Revenue', formatCurrency(totalRevenue))}
                ${pdfStatCard('Occupancy Rate', occupancyRate + '%')}
                ${pdfStatCard('Total Overdue', formatCurrency(overdueTotal))}
                ${pdfStatCard('Leases Ending Soon', expiringLeases)}
            </div>`;

        const allPayments = normalizePaymentList(await ApiService.getPayments());
        const rows = allPayments.slice(0, 10).map((p, i) => pdfRow([
            { value: formatDate(p.date) },
            { value: p.tenant },
            { value: p.unit },
            { value: formatCurrency(p.amount), align: 'right' },
            { value: 'Rent' },
        ], i));
        const table = pdfTable(
            [{ label: 'Date' }, { label: 'Tenant' }, { label: 'Unit' }, { label: 'Amount', align: 'right' }, { label: 'Type' }],
            rows,
            'No transactions yet.'
        );

        return pdfWrap(
            pdfHeader('Property Report') + stats +
            `<div style="font-size:15px; font-weight:700; color:#000000; margin-bottom:10px;">Recent Transactions</div>` +
            table + pdfFooter()
        );
    }

    /*
        Name: buildPrintableReportHTML
        Purpose: Picks the right buildXPDF function for the currently active dashboard section.
        Used by: dashboard.js (generatePDF)
        Found in: Line 1552-1563 in dashboard.js
    */
    async function buildPrintableReportHTML(section) {
        switch (section) {
            case 'units':     return buildUnitsPDF();
            case 'tenants':   return buildTenantsPDF();
            case 'leases':    return buildLeasesPDF();
            case 'payments':  return buildPaymentsPDF();
            case 'employees': return buildEmployeesPDF();
            case 'reports':   return buildReportsPDF();
            case 'dashboard':
            default:          return buildDashboardPDF();
        }
    }

    /*
        Name: generatePDF
        Purpose: Renders the printable report for the current section off-screen and exports it as a downloadable PDF via html2pdf.
        Some sections (Tenants, Leases, Payments, Employees, Reports) fetch a
        fresh, complete copy of their data at this point — since those tables
        are paginated on screen, there's no full list already sitting in
        memory for the report to reuse.
        Used by: dashboard.js (generatePdfBtn click listener)
    */
    async function generatePDF() {
        showToast('Generating PDF...', 'warning');

        let html;
        try {
            html = await buildPrintableReportHTML(currentSection);
        } catch (err) {
            showToast('PDF generation failed: ' + err.message, 'error');
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
        wrapper.style.left = '-10000px';
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        const sectionSlug = (currentSection || 'dashboard').charAt(0).toUpperCase() + (currentSection || 'dashboard').slice(1);
        const opt = {
            margin: 0.4,
            filename: `RentEase_${sectionSlug}_` + new Date().toISOString().slice(0, 10) + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        html2pdf().set(opt).from(wrapper.firstElementChild).save()
            .then(() => showToast('PDF downloaded successfully!'))
            .catch(err => showToast('PDF generation failed: ' + err.message, 'error'))
            .finally(() => wrapper.remove());
    }

    /*
        SECTION: Navigation
        Purpose: Maps each nav link/section id to its DOM element and page
        title/subtitle/action-button copy, and tracks which section is active.
    */
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
        employees: { title: 'Employee Management', sub: 'Manage your team members.', action: 'Add Employee'    },
        reports:   { title: 'Reports & Analytics', sub: 'Overview of property performance.' },
    };

    let currentSection = 'dashboard';

    /*
        Name: switchSection
        Purpose: Activates the given section (nav highlight, page title, and hero action button), wiring the hero button to the right "Add" modal for that section.
        Used by: dashboard.js (navLinks click listener)
        Found in: Line 1653-1676 in dashboard.js
    */
    function switchSection(sectionId) {
        currentSection = sectionId;
        Object.values(sections).forEach(el => el.classList.remove('active'));
        if (sections[sectionId]) sections[sectionId].classList.add('active');
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.section === sectionId));
        const d = meta[sectionId] || meta.dashboard;
        document.getElementById('pageTitle').innerHTML = `${d.title} <small>${d.sub}</small>`;
        const heroActionBtn = document.getElementById('heroActionBtn');
        if (sectionId === 'reports') {
            heroActionBtn.style.display = 'none';
        } else {
            heroActionBtn.style.display = '';
            document.getElementById('actionBtnText').textContent = d.action;
            heroActionBtn.onclick = () => {
                if      (sectionId === 'units')                          openAddUnitModal();
                else if (sectionId === 'leases' || sectionId === 'dashboard') openAddLeaseModal();
                else if (sectionId === 'tenants')                        openAddTenantModal();
                else if (sectionId === 'payments')                       openAddPaymentModal();
                else if (sectionId === 'employees')                      openAddEmployeeModal();
                else openAddLeaseModal();
            };

            // Manager role: dashboard's default action creates a lease, so it's
            // greyed out here too, alongside units/tenants/leases (view-only).
            heroActionBtn.disabled = false;
            heroActionBtn.classList.remove('is-disabled');
            heroActionBtn.removeAttribute('aria-disabled');
            if (isManagerRole() && (sectionId === 'dashboard' || MANAGER_VIEW_ONLY_SECTIONS.includes(sectionId))) {
                disableButton(heroActionBtn);
            }
        }
    }

    navLinks.forEach(link => link.addEventListener('click', function (e) {
        e.preventDefault(); if (this.dataset.section) switchSection(this.dataset.section);
    }));

    /*
        SECTION: Quick Actions & Buttons
        Purpose: Wires up the dashboard's quick-action shortcuts and top-level buttons (export PDF, refresh, etc).
    */
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
    document.getElementById('refreshBtn').addEventListener('click', refresh);

    /*
        SECTION: Form Submits
        Purpose: Wires each modal's form submit event to its handler function.
    */
    document.getElementById('unitForm').addEventListener('submit', handleUnitFormSubmit);
    document.getElementById('leaseForm').addEventListener('submit', handleLeaseFormSubmit);
    document.getElementById('tenantForm').addEventListener('submit', handleTenantFormSubmit);
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentFormSubmit);
    document.getElementById('employeeForm').addEventListener('submit', handleEmployeeFormSubmit);

    /*
        SECTION: Inbox Dropdown
        Purpose: Opens/closes the Inbox pill's dropdown and handles its
        "Clear all" button, which dismisses the currently-shown notifications.
    */
    const inboxBtn      = document.getElementById('inboxBtn');
    const inboxDropdown = document.getElementById('inboxDropdown');
    let inboxOpen = false;

    inboxBtn.addEventListener('click', function (e) {
        e.stopPropagation(); inboxOpen = !inboxOpen; inboxDropdown.classList.toggle('open', inboxOpen);
    });
    document.addEventListener('click', function (e) {
        if (!document.getElementById('inboxWrap').contains(e.target)) {
            inboxDropdown.classList.remove('open'); inboxOpen = false;
        }
    });
    document.getElementById('inboxClearBtn').addEventListener('click', function (e) {
        e.stopPropagation();
        const idsToClear = getInboxItems().map(p => String(p.id));
        if (idsToClear.length === 0) return;
        const cleared = getClearedInboxIds();
        idsToClear.forEach(id => cleared.add(id));
        localStorage.setItem(INBOX_CLEARED_KEY, JSON.stringify([...cleared]));
        renderInbox();
    });

    /*
        SECTION: Profile Dropdown
        Purpose: Opens/closes the top-right profile menu and handles its logout and profile-link actions.
    */
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

    /*
        Name: renderAll
        Purpose: Re-renders every section of the dashboard (units, leases, tenants, payments, employees, overview) and syncs the API badge and hero action button label.
        Used by: dashboard.js (init, refresh, and every CRUD save/delete handler)
        Found in: Line 1751-1764 in dashboard.js
    */
    function renderAll() {
        renderUnits(); renderLeases(); renderTenants(); renderPayments(); renderEmployees(); renderDashboard();
        applyRolePermissions();
        const badge = document.getElementById('apiBadge');
        if (badge) {
            badge.innerHTML = '<i class="fas fa-cloud"></i> API';
            badge.className = 'api-badge';
        }
        const active = document.querySelector('.nav-links a.active');
        if (active) {
            const map = { dashboard: 'New Lease', units: 'Add Unit', tenants: 'Register Tenant', leases: 'New Lease', payments: 'Record Payment', employees: 'Add Employee' };
            const t = map[active.dataset.section];
            if (t) document.getElementById('actionBtnText').textContent = t;
        }
    }

    /*
        SECTION: Init
        Purpose: Bootstraps the dashboard on page load: verifies the session
        (redirecting to login if invalid), applies the logged-in user's name
        to the header/greeting, loads all data, and switches to the dashboard section.
    */
    (async function init() {
        const authRes = await fetch('/api/profile');
        if (authRes.status === 401) {
            window.location.href = '/index.html';
            return;
        }
        const profileData = await authRes.json();
        currentUserRole = profileData.role || 'Admin';

        const session = JSON.parse(sessionStorage.getItem('rentease_session') || '{}');
        const username = profileData.first_name || session.user || 'Admin';

        document.getElementById('profileUsername').textContent = username;
        document.getElementById('greetingName').textContent   = username;
        meta.dashboard.title = 'Welcome back, ' + username;

        const avatarImg = document.querySelector('.user-profile img');
        if (avatarImg) avatarImg.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=003d47&color=fff&size=36';

        console.log(`📡 API Base URL: ${API_BASE_URL}`);

        await DataManager.loadAll();
        renderAll();
        wirePaginationButtons();
        await loadAllSectionPages();
        switchSection('dashboard');
    })();

})();