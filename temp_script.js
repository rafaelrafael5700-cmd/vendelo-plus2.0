
        // ===== CONEXIÓN A LA API Y SEGURIDAD =====
        const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMG6-c83fT4_jPIANihCC7DNpenjhKJ1um0dlpEsr2bm4pXdbQ5S7LcAFxv7J3ycqLwQ/exec";
        const MASTER_URL = "https://script.google.com/macros/s/AKfycbzMG6-c83fT4_jPIANihCC7DNpenjhKJ1um0dlpEsr2bm4pXdbQ5S7LcAFxv7J3ycqLwQ/exec";
        
        // Variables Globales
        let productos = [];
        let ventas = [];
        let movimientos = [];
        let clientes = [];
        let proveedores = [];
        let categorias = [];
        let pedidoActual = [];
        let usuarioActual = null;
        let tasa = 36.5; 
        let esPagoMixto = false;
        let metodoPago = "";
        let categoriaFiltro = "todos";
        let filtroStockBajo = false;
        window.licenciaActiva = true;

        // Variables para Compras (Reposición)
        let itemsNuevaCompra = [];
        let provCompraSeleccionado = null;
        let productoCompraSeleccionado = null;
        let esCompraDesdeStockBajo = false;
        let pedidoActualRecibir = null;
        let comprasChartInstance = null;

        // Módulo Clientes
        let deudorActivoDesktop = null;
        let deudasSeleccionadasDesktop = new Set();
        let ultimoAbonoDesktop = null;

        async function api(payload) {
            // BLOQUEO DE SEGURIDAD: Evitar conexiones a la base de datos maestra o vieja por error
            const accionesLibres = ["login", "registrarNuevoCliente", "loginUsuario", "registrarUsuario"];
            if (!accionesLibres.includes(payload.accion)) {
                const sheetId = usuarioActual ? usuarioActual.sheetId : null;
                
                if (!sheetId || sheetId.length < 20) {
                    console.error("CRITICAL: Intento de llamada API sin sheetId válido.");
                    return { ok: false, error: "ERROR CRÍTICO: Tu sesión no tiene una base de datos vinculada. Cierra sesión y vuelve a entrar." };
                }
                
                payload.sheetId = sheetId;
                // Debug log para confirmar a qué base de datos nos conectamos (ver en F12)
                console.log("%c🔌 [DESKTOP] CONECTANDO A DB:", "background: #2563eb; color: #fff; padding: 2px 5px; borderRadius: 4px;", sheetId);
            }

            document.getElementById('pantalla-carga-desktop').classList.remove('hidden');
            try {
                let res;
                let intentos = 0;
                while (intentos < 3) {
                    try {
                        res = await fetch(SCRIPT_URL, {
                            method: "POST",
                            body: JSON.stringify(payload)
                        });
                        if (res.ok) break;
                        
                        // Si la respuesta no es OK (ej. 500, 404), sumamos intento y esperamos
                        intentos++;
                        if (intentos < 3) await new Promise(r => setTimeout(r, 1000));
                    } catch (e) {
                        intentos++;
                        if (intentos === 3) throw e;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const text = await res.text();
                if (!text) throw new Error("Respuesta vacía del servidor");

                const data = JSON.parse(text);
                
                if (data.error && (data.error.includes("No se pudo abrir") || data.error.includes("ERROR CRÍTICO"))) {
                    // Si hay error de base de datos, mostramos pantalla de carga con error
                    document.getElementById('loading-text').innerHTML = `<span class="text-red-500 font-black">${data.error}</span>`;
                } else {
                    document.getElementById('pantalla-carga-desktop').classList.add('hidden');
                }
                
                return data;
            } catch (err) {
                document.getElementById('pantalla-carga-desktop').classList.add('hidden');
                console.error("Error de Conexión:", err);
                return { ok: false, error: err.toString() };
            }
        }

    function mostrarToast(msg, tipo = "error") {
        let toast = document.getElementById("desktop-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "desktop-toast";
            toast.className = "fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase text-white shadow-xl transition-all duration-300 z-[9999] opacity-0 translate-y-10";
            document.body.appendChild(toast);
        }
        toast.className = `fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase text-white shadow-xl transition-all duration-300 z-[9999] opacity-100 translate-y-0 ${tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'}`;
        toast.textContent = msg;
        
        if(toast.timer) clearTimeout(toast.timer);
        toast.timer = setTimeout(() => {
            toast.className = toast.className.replace("opacity-100", "opacity-0").replace("translate-y-0", "translate-y-10");
        }, 2800);
    }

    function mostrarLoading(show, msg = "") {
        const loader = document.getElementById('pantalla-carga-desktop');
        if (!loader) return;
        if (show) {
            loader.classList.remove('hidden');
        } else {
            loader.classList.add('hidden');
        }
    }

    async function cargarDatosIniciales() {
        const sesion = localStorage.getItem("usuarioVentasPlus");
        if (sesion) {
            usuarioActual = JSON.parse(sesion);
            document.getElementById('view-acceso').classList.remove('active');
            const elUser = document.getElementById('user-display-name');
            if(elUser) elUser.innerText = usuarioActual.nombre;
            await revalidarLicencia();
        } else {
            document.getElementById('view-acceso').classList.add('active');
            mostrarLoading(false);
            return;
        }

        try {
            // Cargar datos reales
            const resp = await api({ accion: "cargarTodo" });
            if (resp && resp.ok) {
                localStorage.setItem('vendelo_cache', JSON.stringify(resp));
                aplicarDatos(resp);
            } else {
                const errorMsg = resp ? resp.error : "Error de respuesta del servidor";
                throw new Error(errorMsg);
            }
        } catch (err) {
            console.error("Fallo de carga:", err);
            const cache = localStorage.getItem('vendelo_cache');
            
            if (err.message.includes("ERROR CRÍTICO") || err.message.includes("No se pudo abrir")) {
                // Mostrar error crítico en lugar de usar cache
                document.getElementById('loading-text').innerHTML = `<span class="text-red-500 font-black">${err.message}</span>`;
                document.getElementById('pantalla-carga-desktop').classList.remove('hidden');
                // No ocultamos el spinner para que se vea que falló algo serio
            } else if (cache) {
                aplicarDatos(JSON.parse(cache));
                mostrarToast("MODO LOCAL (Sin conexión)", "error");
            } else {
                mostrarToast("Error: " + err.message);
                document.getElementById('loading-text').innerText = "ERROR: " + err.message;
            }
        }
    }

        async function revalidarLicencia() {
            try {
                if (!usuarioActual) {
                    window.licenciaActiva = true; // No bloqueamos si no hay usuario logueado (pantalla de login)
                    return;
                }
                
                const response = await fetch(`${MASTER_URL}?id=${usuarioActual.usuario}&_=${new Date().getTime()}`);
                const data = await response.json();
                
                // Usar window.licenciaActiva como flag interno para restringir compras/inventario
                window.licenciaActiva = (data.permitido !== false);
                
                // Ocultar bloqueo visual si existía para no romper el resto de la app
                const overlay = document.getElementById('license-overlay');
                if(overlay) overlay.style.display = 'none';
                const badge = document.getElementById('status-text');
                
                if(badge) {
                    let nombrePlan = (data.plan || "PRO").replace(/^V.s*/i, "");
                    badge.innerText = nombrePlan;
                    badge.className = "text-[10px] font-black uppercase text-green-600 tracking-widest";
                    document.getElementById('status-dot').classList.replace('bg-red-500', 'bg-green-500');
                }
            } catch (error) {
                console.error("Error validando licencia:", error);
                // En caso de error de red, permitimos acceso temporal para no romper la UX
                window.licenciaActiva = true; 
            }
        }

        function bloquearAppDesktop(mensaje) {
            console.log("App bloqueada (visual desactivado):", mensaje);
            /*
            const reason = document.getElementById('license-reason');
            if (reason) reason.textContent = mensaje;
            const overlay = document.getElementById('license-overlay');
            if (overlay) overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            */
        }

        async function mostrarPlanesDesktop() {
            const container = document.getElementById('planes-lista');
            if(!container) return;
            
            container.innerHTML = '<div class="py-10 text-center text-slate-400 italic">Consultando promociones...</div>';
            const modal = document.getElementById('modal-planes');
            if(modal) modal.classList.remove('hidden');

            try {
                const resp = await fetch(`${MASTER_URL}?accion=getPlanes`);
                const planes = await resp.json();
                
                container.innerHTML = '';
                planes.forEach(p => {
                    const div = document.createElement('div');
                    div.className = "p-6 rounded-3xl border-2 border-slate-100 hover:border-blue-500 transition-all cursor-pointer group bg-white";
                    div.innerHTML = `
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-black uppercase tracking-tighter text-blue-600">${p.nombre}</span>
                            <span class="text-lg font-black text-slate-900">${p.precio}</span>
                        </div>
                        <p class="text-[11px] text-slate-500 font-medium mb-4">${p.descripcion}</p>
                        <a href="https://wa.me/521XXXXXXXXX?text=Hola,%20quiero%20el%20plan%20${encodeURIComponent(p.nombre)}" target="_blank" 
                           class="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase text-center block group-hover:bg-blue-600 transition-colors">
                           Contratar Ahora
                        </a>
                    `;
                    container.appendChild(div);
                });
            } catch (e) {
                container.innerHTML = '<div class="py-10 text-center text-red-500 italic">Error al cargar planes.</div>';
            }
        }

    // ===== GESTIÓN DE MODALES =====
    function toggleModalDesktop(show, maxWidthClass = 'max-w-2xl') {
        const container = document.getElementById('modal-container');
        const wrapper = document.getElementById('modal-content-wrapper');
        if(show) {
            // Reemplazar cualquier clase max-w- existente por la nueva
            wrapper.className = wrapper.className.replace(/max-w-S+/g, maxWidthClass);
            container.classList.remove('hidden');
            setTimeout(() => {
                wrapper.classList.remove('scale-95', 'opacity-0');
                wrapper.classList.add('scale-100', 'opacity-100');
            }, 10);
        } else {
            wrapper.classList.add('scale-95', 'opacity-0');
            wrapper.classList.remove('scale-100', 'opacity-100');
            setTimeout(() => {
                container.classList.add('hidden');
                // Restaurar al ancho por defecto al cerrar
                wrapper.className = wrapper.className.replace(/max-w-S+/g, 'max-w-2xl');
            }, 200);
        }
    }

    // ===== NAVEGACIÓN =====
    function showSection(section) {
        document.querySelectorAll('main section').forEach(s => s.classList.add('hidden'));
        document.getElementById('section-' + section).classList.remove('hidden');

        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        const navEl = document.getElementById('nav-' + section);
        if(navEl) navEl.classList.add('active');

        const titles = {
            'pos': 'Punto de Venta',
            'inventario': 'Gestión de Inventario',
            'ventas': 'Historial de Operaciones',
            'clientes': 'Directorio de Clientes',
            'compras': 'Gestión de Compras',
            'reportes': 'Análisis y Reportes',
            'caja': 'Control de Caja'
        };
        document.getElementById('section-title').innerText = titles[section] || 'Véndelo Plus';
        
        // Actualizar Cabecera (Buscador vs Atajos)
        updateHeaderContext(section);

        if (section === 'compras') {
            setTimeout(renderComprasDesktop, 100);
        } else if (section === 'ventas') {
            setTimeout(renderSalesHistory, 100);
        } else if (section === 'inventario') {
            setTimeout(renderInventory, 100);
        } else if (section === 'caja') {
            setTimeout(() => renderControlCaja(), 100);
        } else if (section === 'reportes') {
            setTimeout(() => {
                initChart();
                renderTopProducts();
            }, 100);
        } else if (section === 'clientes') {
            setTimeout(() => {
                renderClientesDesktop();
                renderDeudoresDesktop();
            }, 100);
        }
    }

    function updateHeaderContext(section) {
        const searchContainer = document.getElementById('header-search-container');
        const shortcutsContainer = document.getElementById('header-shortcuts-container');
        
        if (section === 'pos') {
            searchContainer.classList.remove('hidden');
            shortcutsContainer.classList.add('hidden');
            shortcutsContainer.innerHTML = '';
        } else {
            searchContainer.classList.add('hidden');
            shortcutsContainer.classList.remove('hidden');
            
            let html = '';
            if (section === 'compras') {
                html = `
                    <div onclick="abrirModalProveedores()" class="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-blue-600 cursor-pointer transition-all">
                        <i class="ph-bold ph-users text-lg"></i>
                        <span class="text-[10px] font-black uppercase tracking-widest">Proveedores</span>
                    </div>
                `;
            } else if (section === 'inventario') {
                html = `
                    <div onclick="abrirModalConfiguracion()" class="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-blue-600 cursor-pointer transition-all">
                        <i class="ph-bold ph-gear text-lg"></i>
                        <span class="text-[10px] font-black uppercase tracking-widest">Configuración</span>
                    </div>
                `;
            } else if (section === 'caja') {
                html = `
                    <div onclick="mostrarToast('Gestión de Cajeros próximamente', 'info')" class="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-blue-600 cursor-pointer transition-all">
                        <i class="ph-bold ph-identification-card text-lg"></i>
                        <span class="text-[10px] font-black uppercase tracking-widest">Cajeros</span>
                    </div>
                    <div class="h-4 w-[1px] bg-slate-200 mx-1"></div>
                    <div onclick="imprimirCierreCaja()" class="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-blue-600 cursor-pointer transition-all">
                        <i class="ph-bold ph-printer text-lg"></i>
                        <span class="text-[10px] font-black uppercase tracking-widest">Cierre</span>
                    </div>
                `;
            } else {
                html = `<span class="text-[10px] font-black text-slate-300 uppercase tracking-widest">Vista de Consulta</span>`;
            }
            shortcutsContainer.innerHTML = html;
        }
    }

    // ===== PUNTO DE VENTA (POS) =====
    function renderCategories() {
        const container = document.getElementById('pos-categories');
        if(!container) return;
        const categorias = ["todos", ...new Set(productos.map(p => p.categoria).filter(c => c))];
        container.innerHTML = categorias.map(c => `
            <button onclick="categoriaFiltro='${c}'; renderCategories(); renderPOS();" class="category-pill px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap border border-slate-200 transition-all ${categoriaFiltro === c ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-600 bg-white hover:bg-slate-50'}">${c}</button>
        `).join('');
    }

    function renderPOS(busqueda = "") {
        const grid = document.getElementById('pos-products-grid');
        if(!grid) return;
        grid.innerHTML = '';

        let filtrados = productos;
        if(categoriaFiltro !== "todos") {
            filtrados = filtrados.filter(p => p.categoria === categoriaFiltro);
        }
        if(busqueda.trim() !== "") {
            const q = busqueda.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
            filtrados = filtrados.filter(p => {
                const nombre = p.nombre.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
                const codigo = (p.codigo || "").toLowerCase();
                return nombre.includes(q) || codigo.includes(q);
            });
        }

        if(filtrados.length === 0) {
            grid.innerHTML = '<div class="col-span-full py-20 text-center text-slate-300 font-black uppercase text-xs">Sin productos encontrados</div>';
            return;
        }

        grid.innerHTML = filtrados.map(p => `
            <div onclick="agregarAlPedido('${p.id}')" class="product-card bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center text-center cursor-pointer hover:shadow-md transition-all active:scale-95">
                <div class="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-3">
                    <i class="ph-bold ph-package text-3xl"></i>
                </div>
                <h4 class="text-xs font-black text-slate-800 uppercase line-clamp-2 h-8">${p.nombre}</h4>
                <p class="text-sm font-black text-blue-600 mt-2">$${p.precio.toFixed(2)}</p>
                <span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Stock: ${p.stock.toFixed(2)}</span>
            </div>
        `).join('');
    }

    function filtrarClientesPOS(val) {
        const dropdown = document.getElementById('pos-cliente-dropdown');
        if(!dropdown) return;
        
        if (val.trim() === "") {
            dropdown.classList.add('hidden');
            return;
        }

        const q = val.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
        let matches = clientes.filter(c => {
            const n = (c.nombre || "").toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
            const t = (c.telefono || "").toString();
            return n.includes(q) || t.includes(q);
        });

        dropdown.classList.remove('hidden');
        let html = `
            <div onclick="seleccionarClientePOS('GENERAL', '')" class="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                <p class="text-xs font-black text-slate-800 uppercase">Cliente General</p>
            </div>
        `;

        matches.forEach(c => {
            html += `
                <div onclick="seleccionarClientePOS('${(c.nombre || "").replace(/'/g, "'")}', '${c.id}')" class="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 flex justify-between items-center">
                    <div>
                        <p class="text-xs font-black text-slate-800 uppercase">${c.nombre}</p>
                        <p class="text-[9px] font-bold text-slate-400">${c.telefono || 'Sin Teléfono'}</p>
                    </div>
                    <span class="text-[9px] font-black text-red-500">$${parseFloat(c.deuda||0).toFixed(2)}</span>
                </div>
            `;
        });

        if(val.trim() !== "" && !clientes.find(c => (c.nombre || "").toLowerCase() === val.toLowerCase())) {
            html += `
                <div onclick="abrirModalNuevoCliente('${val.replace(/'/g, "'")}')" class="p-3 bg-blue-50 hover:bg-blue-100 cursor-pointer flex items-center gap-2 text-blue-600">
                    <i class="ph-bold ph-user-plus"></i>
                    <p class="text-xs font-black uppercase">Crear "${val}"</p>
                </div>
            `;
        }

        dropdown.innerHTML = html;
    }

    function seleccionarClientePOS(nombre, id) {
        const el = document.getElementById('pos-cliente-input');
        if(el) {
            el.value = nombre.toUpperCase();
            el.dataset.clienteId = id;
        }
        const sel = document.getElementById('pos-cliente-select');
        if(sel) sel.value = nombre;
        
        const dd = document.getElementById('pos-cliente-dropdown');
        if(dd) dd.classList.add('hidden');
    }

    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.relative')) {
            const d = document.getElementById('pos-cliente-dropdown');
            if(d) d.classList.add('hidden');
            
            const invMenu = document.getElementById('inventory-options-menu');
            if(invMenu) invMenu.classList.add('hidden');
        } else {
            // Si hacemos click en un botón del menú de inventario, también lo cerramos
            const invMenu = document.getElementById('inventory-options-menu');
            if(invMenu && !e.target.closest('button[onclick*="toggleInventoryMenu"]')) {
                invMenu.classList.add('hidden');
            }
        }
    });

    function toggleInventoryMenu() {
        const menu = document.getElementById('inventory-options-menu');
        if(menu) menu.classList.toggle('hidden');
    }

    function toggleFiltroStockBajo() {
        filtroStockBajo = !filtroStockBajo;
        const btn = document.getElementById('btn-filtro-bajo');
        if(btn) {
            btn.innerHTML = filtroStockBajo 
                ? '<i class="ph-bold ph-x-circle text-slate-600"></i> Quitar Filtro Bajo' 
                : '<i class="ph-bold ph-warning-circle text-red-500"></i> Ver Stock Bajo';
        }
        renderInventory();
    }

    function abrirModalNuevoCliente(nombreSugerido = "") {
        let html = `
            <h3 class="text-2xl font-black text-slate-800 uppercase mb-8">Nuevo Cliente</h3>
            <form onsubmit="guardarNuevoCliente(event)" class="space-y-4">
                <input type="text" name="nombre" value="${nombreSugerido}" placeholder="Nombre Completo" required class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold">
                <input type="text" name="telefono" placeholder="Teléfono" class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold">
                <input type="text" name="direccion" placeholder="Dirección" class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold">
                <div class="flex gap-3 pt-4">
                    <button type="submit" class="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs">Guardar Cliente</button>
                    <button type="button" onclick="toggleModalDesktop(false)" class="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                </div>
            </form>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
    }

    async function guardarNuevoCliente(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.tipo = "CLIENTE";
        data.id = Date.now().toString();
        data.deuda = 0;

        const res = await api({ accion: "guardarDirectorio", item: JSON.stringify(data) });
        if(res && res.ok !== false) {
            clientes.push(data);
            seleccionarClientePOS(data.nombre);
            toggleModalDesktop(false);
            renderClients(); // Actualizar tabla de clientes
        } else {
            mostrarToast('Error al guardar cliente');
        }
    }

    function agregarAlPedido(id) {
        const prod = productos.find(p => String(p.id) === String(id));
        if(!prod || prod.stock <= 0) return mostrarToast('¡Sin stock disponible!');

        const item = pedidoActual.find(i => String(i.id) === String(id));
        if(item) {
            if(item.cantidad < prod.stock) item.cantidad++;
            else mostrarToast('Límite de stock alcanzado');
        } else {
            pedidoActual.push({...prod, cantidad: 1});
        }
        actualizarPedidoUI();
    }

    function actualizarPedidoUI() {
        const container = document.getElementById('pos-cart-items');
        if(!container) return;
        if(pedidoActual.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-slate-300 space-y-2">
                    <i class="ph-bold ph-shopping-cart text-6xl"></i>
                    <p class="text-xs font-black uppercase">Carrito Vacío</p>
                </div>
            `;
            document.getElementById('pos-subtotal').innerText = '$0.00';
            document.getElementById('pos-total').innerText = '$0.00';
            return;
        }

        container.innerHTML = pedidoActual.map(item => `
            <div class="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div class="flex-1">
                    <h4 class="text-xs font-black text-slate-800 uppercase">${item.nombre}</h4>
                    <p class="text-[10px] font-bold text-slate-400">$${parseFloat(item.precio).toFixed(2)} c/u</p>
                </div>
                <div class="flex items-center gap-3 bg-white rounded-xl px-3 py-1 border border-slate-200">
                    <button onclick="cambiarCantidad('${item.id}', -1)" class="text-blue-600"><i class="ph-bold ph-minus"></i></button>
                    <span class="text-xs font-black w-4 text-center">${item.cantidad}</span>
                    <button onclick="cambiarCantidad('${item.id}', 1)" class="text-blue-600"><i class="ph-bold ph-plus"></i></button>
                </div>
                <p class="text-xs font-black text-slate-800 w-16 text-right">$${(parseFloat(item.precio) * item.cantidad).toFixed(2)}</p>
            </div>
        `).join('');

        const total = pedidoActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        document.getElementById('pos-subtotal').innerText = '$' + total.toFixed(2);
        document.getElementById('pos-total').innerText = '$' + total.toFixed(2);
        document.getElementById('pos-total-bs').innerText = 'Bs. ' + (total * tasa).toFixed(2);
    }

    function cambiarCantidad(id, delta) {
        const item = pedidoActual.find(i => String(i.id) === String(id));
        if(item) {
            const prod = productos.find(p => String(p.id) === String(id));
            item.cantidad += delta;
            if(item.cantidad <= 0) {
                pedidoActual = pedidoActual.filter(i => String(i.id) !== String(id));
            } else if(prod && item.cantidad > prod.stock) {
                item.cantidad = prod.stock;
                mostrarToast('Stock máximo alcanzado');
            }
            actualizarPedidoUI();
        }
    }

    function abrirModalCobro() {
        if(pedidoActual.length === 0) return mostrarToast('El carrito está vacío');
        
        const total = pedidoActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        
        let html = `
            <div class="text-center mb-6">
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Procesar Pago</h3>
                <p class="text-sm font-bold text-slate-400">Seleccione el método de pago</p>
            </div>
            
            <div class="bg-slate-50 rounded-3xl p-6 mb-6 text-center border border-slate-100">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total a Pagar</p>
                <h2 class="text-4xl font-black text-blue-600">$${total.toFixed(2)}</h2>
                <p class="text-sm font-bold text-slate-500 mt-1">Bs. ${(total * tasa).toFixed(2)}</p>
            </div>

            <div class="grid grid-cols-3 gap-3 mb-6">
                <button onclick="seleccionarMetodoPago(this, 'EFECTIVO $')" class="metodo-btn p-3 rounded-2xl border-2 border-slate-100 text-[10px] font-black uppercase text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">EFECTIVO $</button>
                <button onclick="seleccionarMetodoPago(this, 'EFECTIVO BS')" class="metodo-btn p-3 rounded-2xl border-2 border-slate-100 text-[10px] font-black uppercase text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">EFECTIVO BS</button>
                <button onclick="seleccionarMetodoPago(this, 'ZELLE')" class="metodo-btn p-3 rounded-2xl border-2 border-slate-100 text-[10px] font-black uppercase text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">ZELLE</button>
                <button onclick="seleccionarMetodoPago(this, 'TRANSFERENCIA')" class="metodo-btn p-3 rounded-2xl border-2 border-slate-100 text-[10px] font-black uppercase text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">TRANSFERENCIA</button>
                <button onclick="seleccionarMetodoPago(this, 'PAGO MIXTO')" class="metodo-btn p-3 rounded-2xl border-2 border-slate-100 text-[10px] font-black uppercase text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">PAGO MIXTO</button>
                <button onclick="seleccionarMetodoPago(this, 'CREDITO')" class="metodo-btn p-3 rounded-2xl border-2 border-slate-100 text-[10px] font-black uppercase text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">CRÉDITO</button>
            </div>

            <div id="panel-mixto" class="hidden space-y-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p class="text-[10px] font-black text-slate-500 uppercase">Detalle Pago Mixto</p>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-[9px] font-bold text-slate-400 mb-1 block">MONTO EN $</label>
                        <input type="number" id="mixto-usd" placeholder="0.00" oninput="autoCalcularMixto('usd', ${total})" class="w-full bg-white rounded-xl px-4 py-3 text-sm font-bold border border-slate-200 outline-none focus:border-blue-500">
                    </div>
                    <div>
                        <label class="text-[9px] font-bold text-slate-400 mb-1 block">MONTO EN BS</label>
                        <input type="number" id="mixto-ves" placeholder="0.00" oninput="autoCalcularMixto('ves', ${total})" class="w-full bg-white rounded-xl px-4 py-3 text-sm font-bold border border-slate-200 outline-none focus:border-blue-500">
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3 pt-2">
                    <select id="tipo-usd" class="w-full bg-white rounded-xl px-4 py-2 text-[10px] font-bold border border-slate-200 outline-none">
                        <option value="EFECTIVO">USD EFECTIVO</option>
                        <option value="ZELLE">ZELLE / TRANSFERENCIA</option>
                    </select>
                    <select id="tipo-ves" class="w-full bg-white rounded-xl px-4 py-2 text-[10px] font-bold border border-slate-200 outline-none">
                        <option value="EFECTIVO">BS EFECTIVO</option>
                        <option value="TRANSFERENCIA">BS TRANSFERENCIA</option>
                        <option value="PAGO_MOVIL">PAGO MÓVIL</option>
                    </select>
                </div>

                <p id="mixto-resumen" class="text-[10px] font-bold text-blue-500 uppercase text-center mt-2">INGRESA UN MONTO Y EL SISTEMA COMPLETARÁ EL RESTO.</p>
            </div>

            <div id="panel-credito" class="hidden space-y-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p class="text-[10px] font-black text-slate-500 uppercase">Vencimiento del Crédito</p>
                <input type="date" id="fecha-vencimiento-credito" class="w-full bg-white rounded-xl px-4 py-3 text-sm font-bold border border-slate-200 outline-none focus:border-blue-500">
            </div>

            <div class="flex gap-3">
                <button onclick="confirmarVenta()" id="btn-procesar-venta" class="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-lg shadow-blue-100">Confirmar Venta</button>
                <button onclick="toggleModalDesktop(false)" class="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-xs">Cancelar</button>
            </div>
        `;
        
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
        metodoPago = "";
        esPagoMixto = false;
    }

    function seleccionarMetodoPago(btn, metodo) {
        document.querySelectorAll('.metodo-btn').forEach(b => {
            b.classList.remove('border-blue-500', 'text-blue-600', 'bg-blue-50');
            b.classList.add('border-slate-100', 'text-slate-600');
        });
        btn.classList.remove('border-slate-100', 'text-slate-600');
        btn.classList.add('border-blue-500', 'text-blue-600', 'bg-blue-50');
        
        metodoPago = metodo;
        esPagoMixto = (metodo === 'PAGO MIXTO');
        
        document.getElementById('panel-mixto').classList.toggle('hidden', !esPagoMixto);
        document.getElementById('panel-credito').classList.toggle('hidden', metodo !== 'CREDITO');
    }

    function autoCalcularMixto(source, totalUsd) {
        const usdInput = document.getElementById('mixto-usd');
        const vesInput = document.getElementById('mixto-ves');
        
        if (source === 'usd') {
            const val = parseFloat(usdInput.value) || 0;
            const restoUsd = totalUsd - val;
            vesInput.value = (restoUsd > 0) ? (restoUsd * tasa).toFixed(2) : "0.00";
        } else {
            const val = parseFloat(vesInput.value) || 0;
            const restoUsd = totalUsd - (val / tasa);
            usdInput.value = (restoUsd > 0) ? restoUsd.toFixed(2) : "0.00";
        }
        
        // Validar resumen
        const u = parseFloat(usdInput.value) || 0;
        const v = parseFloat(vesInput.value) || 0;
        const diff = totalUsd - (u + (v / tasa));
        const resumen = document.getElementById('mixto-resumen');
        
        if (Math.abs(diff) < 0.01) {
            resumen.innerText = "MONTO COMPLETADO CORRECTAMENTE";
            resumen.className = "text-[10px] font-bold text-green-600 uppercase text-center mt-2";
        } else {
            resumen.innerText = diff > 0 ? `FALTAN: $${diff.toFixed(2)}` : `VUELTO: $${Math.abs(diff).toFixed(2)}`;
            resumen.className = "text-[10px] font-bold text-blue-600 uppercase text-center mt-2";
        }
    }

    async function confirmarVenta() {
        if(!metodoPago) return mostrarToast("Seleccione un método de pago.");
        
        const total = pedidoActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        const btn = document.getElementById('btn-procesar-venta');
        btn.disabled = true;
        btn.innerText = "PROCESANDO...";

        let mixtoData = null;
        if(esPagoMixto) {
            const usdMonto = parseFloat(document.getElementById("mixto-usd").value || 0);
            const vesMonto = parseFloat(document.getElementById("mixto-ves").value || 0);
            const tipoUsd = document.getElementById('tipo-usd').value;
            const tipoVes = document.getElementById('tipo-ves').value;
            
            mixtoData = {
                usd: { monto: usdMonto, tipo: tipoUsd },
                ves: { monto: vesMonto, tipo: tipoVes }
            };
        }

        let fechaVencimiento = null;
        if (metodoPago === "CREDITO") {
            fechaVencimiento = document.getElementById("fecha-vencimiento-credito").value;
            if (!fechaVencimiento) {
                mostrarToast("Debe seleccionar una fecha de vencimiento.");
                btn.disabled = false;
                btn.innerText = "CONFIRMAR VENTA";
                return;
            }
        }

        const timestamp = Date.now();
        const idFac = timestamp.toString().slice(-6);
        const fechaObj = new Date();

        const venta = {
            id: idFac,
            timestamp: timestamp,
            fecha: fechaObj.toLocaleString(),
            items: pedidoActual.map(x => ({ nombre: x.nombre, cantidad: x.cantidad, subtotal: parseFloat(x.precio) * x.cantidad })),
            montoTotal: total,
            totalUsd: total,
            totalBs: total * tasa,
            metodo: esPagoMixto ? "PAGO MIXTO" : metodoPago,
            mixto: mixtoData,
            vencimiento: fechaVencimiento,
            vendedor: usuarioActual ? usuarioActual.nombre : "ADMIN",
            tipo: "VENTA",
            cliente: document.getElementById('pos-cliente-input').value || 'CLIENTE GENERAL',
            clienteId: document.getElementById('pos-cliente-input').dataset.clienteId || '',
            estado: metodoPago === "CREDITO" ? "PENDIENTE" : "PAGADO"
        };

        const res = await api({ accion: "guardarMovimiento", movimiento: JSON.stringify(venta) });
        
        if(res && res.ok !== false) {
            for (let i of pedidoActual) {
                await api({ accion: "actualizarStock", id: i.id, cantidad: -i.cantidad });
            }

            pedidoActual.forEach(item => {
                const p = productos.find(prod => String(prod.id) === String(item.id));
                if(p) p.stock -= item.cantidad;
            });
            ventas.unshift(venta);

            prepararTicket(venta);
            window.print();
            pedidoActual = [];
            actualizarPedidoUI();
            renderPOS();
            renderInventory();
            renderSalesHistory();
            toggleModalDesktop(false);
            mostrarToast('¡Venta procesada!', 'ok');
        } else {
            mostrarToast('Error al procesar la venta');
            btn.disabled = false;
            btn.innerText = "CONFIRMAR VENTA";
        }
    }

    function aplicarDatos(data) {
        if(!data) return;
        productos = (data.productos || []).map(p => ({
            ...p,
            costo: parseFloat(String(p.costo || 0).replace(/[^d.,]/g, '').replace(',', '.')) || 0,
            precio: parseFloat(String(p.venta || p.precio || 0).replace(/[^d.,]/g, '').replace(',', '.')) || 0,
            stock: parseFloat(String(p.stock || 0).replace(/[^d.,]/g, '').replace(',', '.')) || 0,
            stockMin: parseFloat(p.stockMin || 0) || 0
        }));
        movimientos = data.movimientos || [];
        ventas = (data.movimientos || []).filter(m => m.tipo === "VENTA");
        
        // Sincronizar clientes desde directorio (mismo origen que la app móvil)
        clientes = data.clientes || (data.directorio || []).filter(d => d.tipo === "CLIENTE");
        proveedores = (data.directorio || []).filter(d => d.tipo === "PROVEEDOR");
        tasa = data.config ? data.config.tasa : (data.tasa || 36.5);
        
        // Cargar categorías
        if (data.config && data.config.categorias) {
            try {
                categorias = JSON.parse(data.config.categorias);
            } catch(e) { 
                categorias = ["GENERAL"];
            }
        } else {
            categorias = [...new Set(productos.map(p => p.categoria || "GENERAL"))];
        }

        const compras = (data.movimientos || []).filter(m => m.tipo === "PEDIDO_COMPRA");
        renderComprasDesktop();

        renderDashboard();
        renderPOS();
        renderCategories();
        renderInventoryCategories();
        renderInventory();
        renderSalesHistory();
        renderClients();
        
        // Actualizar control de caja si está visible
        const cajaSec = document.getElementById('section-caja');
        if(cajaSec && !cajaSec.classList.contains('hidden')) {
            renderControlCaja(document.getElementById('caja-fecha').value);
        }
        
        // El módulo de compras se renderiza al entrar en la sección o al cargar datos
        try {
            renderComprasDesktop();
        } catch(e) { console.error("Error al renderizar compras:", e); }
    }

    // ===== GESTIÓN DE PROVEEDORES =====
    function abrirModalProveedores() {
        let html = `
            <div class="flex justify-between items-center mb-8">
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Directorio de Proveedores</h3>
                <button onclick="abrirModalNuevoProveedor()" class="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100">
                    <i class="ph-bold ph-user-plus text-lg"></i> Nuevo Proveedor
                </button>
            </div>
            
            <div class="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                <div class="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50/50 border-b border-slate-100">
                                <th class="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Proveedor</th>
                                <th class="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Contacto</th>
                                <th class="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Identificación</th>
                                <th class="px-6 py-4 text-[10px] font-black uppercase text-slate-400 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="proveedores-list-body">
                            ${renderProveedoresItems()}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                <button onclick="toggleModalDesktop(false)" class="px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-200 transition-all">Cerrar</button>
            </div>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true, 'max-w-4xl');
    }

    function renderProveedoresItems() {
        if (!proveedores || proveedores.length === 0) {
            return `<tr><td colspan="4" class="px-6 py-12 text-center text-xs font-bold text-slate-400 italic uppercase bg-slate-50/30">No se encontraron proveedores registrados</td></tr>`;
        }
        return proveedores.map(p => `
            <tr class="border-b border-slate-50 last:border-0 hover:bg-blue-50/30 transition-all">
                <td class="px-6 py-4">
                    <div class="text-sm font-black text-slate-800 uppercase">${p.nombre}</div>
                    <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">${p.direccion || 'Sin dirección'}</div>
                </td>
                <td class="px-6 py-4 text-xs font-bold text-slate-600">${p.telefono || '---'}</td>
                <td class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">${p.rif || 'N/A'}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="eliminarProveedor('${p.id}')" class="w-9 h-9 inline-flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all" title="Eliminar">
                        <i class="ph-bold ph-trash text-xl"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function abrirModalNuevoProveedor() {
        let html = `
            <div class="mb-8">
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Registrar Proveedor</h3>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Completa los datos del nuevo contacto comercial</p>
            </div>

            <form onsubmit="guardarNuevoProveedor(event)" class="space-y-5">
                <div class="space-y-2">
                    <label class="text-[10px] font-black text-slate-500 uppercase ml-1">Nombre Comercial / Empresa</label>
                    <input type="text" name="nombre" placeholder="Ej: Distribuidora Central C.A." required 
                        class="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl px-5 py-4 text-sm font-bold transition-all outline-none shadow-sm">
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div class="space-y-2">
                        <label class="text-[10px] font-black text-slate-500 uppercase ml-1">Teléfono de Contacto</label>
                        <input type="text" name="telefono" placeholder="Ej: 0412-1234567" 
                            class="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl px-5 py-4 text-sm font-bold transition-all outline-none shadow-sm">
                    </div>
                    <div class="space-y-2">
                        <label class="text-[10px] font-black text-slate-500 uppercase ml-1">RIF / Identificación</label>
                        <input type="text" name="rif" placeholder="Ej: J-12345678-9" 
                            class="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl px-5 py-4 text-sm font-bold transition-all outline-none shadow-sm">
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-[10px] font-black text-slate-500 uppercase ml-1">Dirección Fiscal / Ubicación</label>
                    <input type="text" name="direccion" placeholder="Ej: Av. Principal, Edif. Centro, Local 1" 
                        class="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl px-5 py-4 text-sm font-bold transition-all outline-none shadow-sm">
                </div>

                <div class="flex gap-4 pt-6">
                    <button type="submit" class="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all transform hover:-translate-y-1">
                        Guardar Proveedor
                    </button>
                    <button type="button" onclick="abrirModalProveedores()" class="flex-1 bg-slate-100 text-slate-600 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-slate-200 transition-all">
                        Cancelar
                    </button>
                </div>
            </form>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
    }

    async function guardarNuevoProveedor(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.tipo = "PROVEEDOR";
        data.id = "PROV_" + Date.now();
        data.deuda = 0;

        mostrarLoading(true, "Registrando Proveedor...");
        try {
            const res = await api({ accion: "guardarDirectorio", item: JSON.stringify(data) });
            if(res && res.ok !== false) {
                if(!Array.isArray(proveedores)) proveedores = [];
                proveedores.push(data);
                mostrarToast('Proveedor registrado con éxito', 'ok');
                abrirModalProveedores();
            } else {
                throw new Error(res.error || "Error de red");
            }
        } catch(err) {
            mostrarToast('Error al guardar: ' + err.message);
        } finally {
            mostrarLoading(false);
        }
    }

    async function eliminarProveedor(id) {
        if(!confirm('¿Seguro que deseas eliminar este proveedor?')) return;
        
        mostrarLoading(true, "Eliminando...");
        try {
            const res = await api({ accion: "eliminarDirectorio", id: id });
            if(res && res.ok !== false) {
                proveedores = proveedores.filter(p => String(p.id) !== String(id));
                mostrarToast('Proveedor eliminado correctamente', 'ok');
                const list = document.getElementById('proveedores-list-body');
                if(list) list.innerHTML = renderProveedoresItems();
            } else {
                throw new Error(res.error || "No se pudo eliminar");
            }
        } catch(err) {
            mostrarToast(err.message);
        } finally {
            mostrarLoading(false);
        }
    }

    function renderInventoryCategories() {
        const select = document.getElementById('inventory-category-filter');
        if(!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="todos">Todas las Categorías</option>' + 
            categorias.map(c => `<option value="${c}">${c}</option>`).join('');
        select.value = currentVal;
    }

    function renderDashboard() {
        const totalInventario = productos.reduce((acc, p) => acc + (parseFloat(p.stock) * parseFloat(p.precio)), 0);
        const elInv = document.getElementById('stat-inventory-value');
        if(elInv) elInv.innerText = `$${totalInventario.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        
        initChart();
        renderTopProducts();
    }

    let miGrafico = null;
    function initChart() {
        const ctx = document.getElementById('chart-ganancias-desktop');
        if(!ctx) return;
        
        const context = ctx.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');

        const hoy = new Date();
        const etiquetas = [];
        const dataVentas = [];

        for(let i=6; i>=0; i--) {
            const d = new Date();
            d.setDate(hoy.getDate() - i);
            const day = d.getDate();
            const month = d.getMonth() + 1;
            const year = d.getFullYear();
            const pad = (n) => n.toString().padStart(2, '0');
            const regexD = new RegExp(`^(${day}/${month}/${year}|${month}/${day}/${year}|${pad(day)}/${pad(month)}/${year}|${pad(month)}/${day}/${year})`);
            
            etiquetas.push(d.toLocaleDateString('es-ES', {weekday: 'short'}));
            
            const totalDia = ventas
                .filter(v => v.fecha && regexD.test(v.fecha))
                .reduce((acc, v) => acc + (parseFloat(v.montoTotal) || 0), 0);
            dataVentas.push(totalDia);
        }

        if(miGrafico) miGrafico.destroy();
        miGrafico = new Chart(ctx, {
            type: 'line',
            data: { 
                labels: etiquetas, 
                datasets: [{ 
                    data: dataVentas, 
                    borderColor: '#2563eb', 
                    borderWidth: 4,
                    fill: true, 
                    backgroundColor: gradient,
                    tension: 0.4,
                    pointRadius: 6,
                    pointHoverRadius: 9,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#2563eb',
                    pointBorderWidth: 3
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        titleFont: { size: 10, weight: 'bold' },
                        bodyFont: { size: 13, weight: '900' },
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return '$' + context.parsed.y.toLocaleString('es-ES', { minimumFractionDigits: 2 });
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9', drawBorder: false },
                        ticks: { 
                            font: { size: 10, weight: 'bold' },
                            color: '#94a3b8',
                            callback: value => '$' + value
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { 
                            font: { size: 10, weight: 'bold' },
                            color: '#94a3b8'
                        }
                    }
                }
            }
        });
    }

    function renderTopProducts() {
        const container = document.getElementById('metricas-dashboard');
        if(!container) return;
        const top = [...productos].sort((a,b) => b.stock - a.stock).slice(0, 5);
        container.innerHTML = top.map(p => `
            <div class="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                        <i class="ph-bold ph-star"></i>
                    </div>
                    <span class="text-xs font-bold text-slate-800 uppercase">${p.nombre}</span>
                </div>
                <span class="text-xs font-black text-slate-400">${parseFloat(p.stock).toFixed(0)} UNID.</span>
            </div>
        `).join('');
    }

    function renderInventory() {
        const tbody = document.getElementById('inventory-table-body');
        const busqueda = document.getElementById('inventory-search')?.value || "";
        const categoriaFiltro = document.getElementById('inventory-category-filter')?.value || "todos";
        if(!tbody) return;

        let filtrados = productos;

        // Filtro Categoría
        if(categoriaFiltro !== "todos") {
            filtrados = filtrados.filter(p => (p.categoria || "GENERAL") === categoriaFiltro);
        }

        // Filtro Stock Bajo
        if(filtroStockBajo) {
            filtrados = filtrados.filter(p => p.stock <= (p.stockMin || 5));
        }

        // Filtro Búsqueda
        if(busqueda.trim() !== "") {
            const q = busqueda.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
            filtrados = filtrados.filter(p => {
                const nombre = (p.nombre || "").toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
                const barcode = (p.barcode || "").toLowerCase();
                const id = (p.id || "").toString().toLowerCase();
                return nombre.includes(q) || barcode.includes(q) || id.includes(q);
            });
        }

        // Calcular KPIs de Inventario
        const totalProds = filtrados.length;
        const valorInv = filtrados.reduce((acc, p) => acc + (p.stock * p.precio), 0);
        const stockBajo = filtrados.filter(p => p.stock <= (p.stockMin || 5)).length;
        const margenProm = filtrados.length > 0 
            ? (filtrados.reduce((acc, p) => acc + (p.costo > 0 ? ((p.precio - p.costo) / p.costo) * 100 : 0), 0) / filtrados.length) 
            : 0;

        document.getElementById('inv-kpi-total').innerText = totalProds;
        document.getElementById('inv-kpi-valor').innerText = `$${valorInv.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        document.getElementById('inv-kpi-bajo').innerText = stockBajo;
        document.getElementById('inv-kpi-margen').innerText = `${margenProm.toFixed(1)}%`;

        tbody.innerHTML = filtrados.map(p => {
            const esStockBajo = p.stock <= (p.stockMin || 5);
            const ganancia = p.precio - p.costo;
            const margen = p.costo > 0 ? (ganancia / p.costo) * 100 : 0;

            return `
            <tr class="hover:bg-slate-50/50 transition-all ${esStockBajo ? 'bg-red-50/30' : ''}">
                <td class="px-6 py-5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 ${esStockBajo ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'} rounded-xl flex items-center justify-center">
                            <i class="ph-bold ${esStockBajo ? 'ph-warning-octagon' : 'ph-package'} text-lg"></i>
                        </div>
                        <div>
                            <p class="text-sm font-black text-slate-800 uppercase leading-none">${p.nombre}</p>
                            <p class="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">COD: ${p.barcode || p.id}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-5">
                    <span class="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[9px] font-black uppercase tracking-tighter">${p.categoria || 'GENERAL'}</span>
                </td>
                <td class="px-6 py-5 text-sm font-bold text-red-600">$${parseFloat(p.costo || 0).toFixed(2)}</td>
                <td class="px-6 py-5 text-sm font-bold text-blue-600">$${parseFloat(p.precio).toFixed(2)}</td>
                <td class="px-6 py-5">
                    <p class="text-sm font-bold text-emerald-600">$${ganancia.toFixed(2)}</p>
                    <p class="text-[9px] font-black text-emerald-400 uppercase">${margen.toFixed(0)}% MARGEN</p>
                </td>
                <td class="px-6 py-5">
                    <div class="flex flex-col">
                        <span class="text-sm font-black ${esStockBajo ? 'text-red-600' : 'text-slate-800'}">${parseFloat(p.stock).toFixed(2)} ${p.unidad || 'UN'}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">MIN: ${p.stockMin || 5}</span>
                    </div>
                </td>
                <td class="px-6 py-5">
                    <p class="text-xs font-bold text-slate-600 uppercase leading-none">${p.bloque || '-'} / ${p.estante || '-'}</p>
                    <p class="text-[9px] text-slate-400 uppercase font-bold mt-1">Ubicación</p>
                </td>
                <td class="px-6 py-5">
                    <span class="px-3 py-1 ${parseFloat(p.stock) > 0 ? 'bg-green-50 text-green-600' : 'bg-red-100 text-red-600'} rounded-full text-[9px] font-black uppercase tracking-tighter">
                        ${parseFloat(p.stock) > 0 ? (esStockBajo ? 'Stock Bajo' : 'Disponible') : 'Agotado'}
                    </span>
                </td>
                <td class="px-6 py-5 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="abrirModalProducto('${p.id}')" class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all active:scale-90">
                            <i class="ph-bold ph-pencil-simple"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `; }).join('');
    }

    function renderSalesHistory(busqueda = "") {
        const tbody = document.getElementById('sales-history-body');
        if(!tbody) return;
        
        // Formatos posibles de fecha: "4/30/2026" o "30/4/2026"
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        
        const pad = (n) => n.toString().padStart(2, '0');
        const regexHoy = new RegExp(`^(${day}/${month}/${year}|${month}/${day}/${year}|${pad(day)}/${pad(month)}/${year}|${pad(month)}/${pad(day)}/${year})`);

        let filtrados = ventas;
        if(busqueda.trim() !== "") {
            const q = busqueda.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
            filtrados = filtrados.filter(v => {
                const cliente = (v.cliente || "").toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
                const id = (v.id || "").toString().toLowerCase();
                return cliente.includes(q) || id.includes(q);
            });
        }

        const ventasHoy = ventas.filter(v => v.fecha && regexHoy.test(v.fecha));
        const totalHoy = ventasHoy.reduce((acc, v) => acc + (parseFloat(v.montoTotal) || 0), 0);
        const numTransacciones = ventasHoy.length;
        const ticketPromedio = numTransacciones > 0 ? totalHoy / numTransacciones : 0;

        const elTotal = document.getElementById('sales-today-total');
        const elCount = document.getElementById('sales-count');
        const elAverage = document.getElementById('sales-average');

        if(elTotal) elTotal.innerText = `$${totalHoy.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if(elCount) elCount.innerText = numTransacciones;
        if(elAverage) elAverage.innerText = `$${ticketPromedio.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        
        tbody.innerHTML = filtrados.slice(0, 50).map(v => `
            <tr class="hover:bg-slate-50/50 transition-all">
                <td class="px-8 py-5 text-xs font-black text-blue-600">#${v.id}</td>
                <td class="px-8 py-5 text-xs font-bold text-slate-500">${v.fecha}</td>
                <td class="px-8 py-5 text-xs font-bold text-slate-800 uppercase">${v.cliente || 'GENERAL'}</td>
                <td class="px-8 py-5">
                    <span class="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase">${v.metodo}</span>
                </td>
                <td class="px-8 py-5 text-sm font-black text-slate-800">$${parseFloat(v.montoTotal || 0).toFixed(2)}</td>
                <td class="px-8 py-5 text-right">
                    <button onclick="verDetalleOperacionDesktop('${v.id}')" class="text-blue-600 hover:text-blue-800 transition-all active:scale-90"><i class="ph-bold ph-magnifying-glass-plus text-lg"></i></button>
                </td>
            </tr>
        `).join('');
    }

    function calcularEstadoDeudas(cliente) {
        let deudas = movimientos
            .filter(m => m.tipo === "VENTA" && (m.metodo === "CREDITO" || m.metodo === "CRÉDITO") && m.cliente === cliente)
            .map(m => ({ ...m, montoPendiente: parseFloat(m.montoTotal || 0) }));
        
        deudas.sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
        let abonos = movimientos.filter(m => m.tipo === "ABONO" && m.cliente === cliente);

        abonos.forEach(abono => {
            let montoAbono = abono.montoTotal;
            if (abono.deudas && abono.deudas.length > 0) {
                for (let dId of abono.deudas) {
                    let deuda = deudas.find(d => d.id == dId);
                    if (deuda && deuda.montoPendiente > 0 && montoAbono > 0) {
                        let aDescontar = Math.min(deuda.montoPendiente, montoAbono);
                        deuda.montoPendiente -= aDescontar;
                        montoAbono -= aDescontar;
                    }
                }
            }
            if (montoAbono > 0) {
                for (let deuda of deudas) {
                    if (deuda.montoPendiente > 0 && montoAbono > 0) {
                        let aDescontar = Math.min(deuda.montoPendiente, montoAbono);
                        deuda.montoPendiente -= aDescontar;
                        montoAbono -= aDescontar;
                    }
                }
            }
        });

        return deudas.filter(d => d.montoPendiente > 0.01);
    }

    function switchTabClientes(tab) {
        document.getElementById('panel-directorio-cli').classList.add('hidden');
        document.getElementById('panel-deudores-cli').classList.add('hidden');
        document.getElementById('tab-directorio').classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
        document.getElementById('tab-directorio').classList.add('text-slate-500');
        document.getElementById('tab-deudores').classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
        document.getElementById('tab-deudores').classList.add('text-slate-500');

        if (tab === 'directorio') {
            document.getElementById('panel-directorio-cli').classList.remove('hidden');
            document.getElementById('tab-directorio').classList.add('bg-white', 'text-slate-800', 'shadow-sm');
            document.getElementById('tab-directorio').classList.remove('text-slate-500');
            renderClientesDesktop();
        } else {
            document.getElementById('panel-deudores-cli').classList.remove('hidden');
            document.getElementById('tab-deudores').classList.add('bg-white', 'text-slate-800', 'shadow-sm');
            document.getElementById('tab-deudores').classList.remove('text-slate-500');
            renderDeudoresDesktop();
        }
    }

    function renderStatsClientes() {
        const statsRow = document.getElementById('stats-clientes-desktop');
        if (!statsRow) return;

        let totalClientes = clientes.length;
        
        let clientesConDeuda = 0;
        let deudaTotal = 0;

        const clientesUnicos = new Set(
            movimientos
                .filter(m => (m.tipo === "VENTA" && (m.metodo === "CREDITO" || m.metodo === "CRÉDITO")) || m.tipo === "ABONO")
                .map(m => m.cliente || "CLIENTE GENERAL")
        );

        clientesUnicos.forEach(cliente => {
            const deudasPendientes = calcularEstadoDeudas(cliente);
            if (deudasPendientes.length > 0) {
                clientesConDeuda++;
                deudaTotal += deudasPendientes.reduce((s, d) => s + d.montoPendiente, 0);
            }
        });

        statsRow.innerHTML = `
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                    <i class="ph-bold ph-users text-blue-500 text-xl"></i>
                </div>
                <div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Clientes</p>
                    <p class="text-2xl font-black text-slate-800">${totalClientes}</p>
                </div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                    <i class="ph-bold ph-warning-circle text-amber-500 text-xl"></i>
                </div>
                <div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Con Crédito</p>
                    <p class="text-2xl font-black text-slate-800">${clientesConDeuda}</p>
                </div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
                    <i class="ph-bold ph-money text-red-500 text-xl"></i>
                </div>
                <div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deuda Global</p>
                    <p class="text-2xl font-black text-red-600">$${deudaTotal.toFixed(2)}</p>
                </div>
            </div>
        `;
    }

    function renderClientesDesktop(busqueda = "") {
        const grid = document.getElementById('clientes-grid-desktop');
        if (!grid) return;
        
        let filtrados = clientes;
        if (busqueda.trim() !== "") {
            const q = busqueda.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
            filtrados = filtrados.filter(c => {
                const nombre = c.nombre.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
                const telefono = (c.telefono || "").toString();
                return nombre.includes(q) || telefono.includes(q);
            });
        }

        const colors = ['bg-blue-100 text-blue-600', 'bg-emerald-100 text-emerald-600', 'bg-purple-100 text-purple-600', 'bg-pink-100 text-pink-600', 'bg-amber-100 text-amber-600'];

        grid.innerHTML = filtrados.map((c, i) => {
            const initial = c.nombre.charAt(0).toUpperCase();
            const colorClass = colors[i % colors.length];
            const deudas = calcularEstadoDeudas(c.nombre);
            const totalDeuda = deudas.reduce((sum, d) => sum + d.montoPendiente, 0);
            
            let badgeDeuda = '';
            if (totalDeuda > 0) {
                badgeDeuda = `<div class="mt-3 px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg flex justify-between items-center">
                    <span class="text-[10px] font-black text-red-400 uppercase">Deuda Pendiente</span>
                    <span class="text-xs font-black text-red-600">$${totalDeuda.toFixed(2)}</span>
                </div>`;
            }

            return `
                <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div class="flex gap-4 items-start mb-4">
                        <div class="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl flex-shrink-0 ${colorClass}">
                            ${initial}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-black text-slate-800 uppercase truncate">${c.nombre}</h4>
                            <p class="text-xs font-bold text-slate-400 truncate mt-0.5"><i class="ph-bold ph-phone mr-1"></i>${c.telefono || 'Sin teléfono'}</p>
                            <p class="text-[10px] font-bold text-slate-400 truncate mt-0.5"><i class="ph-bold ph-map-pin mr-1"></i>${c.direccion || 'Sin dirección'}</p>
                        </div>
                    </div>
                    
                    ${badgeDeuda}
                    
                    <div class="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-50">
                        <button onclick="verDetalleClienteDesktop('${c.id}')" class="flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase transition-all">
                            <i class="ph-bold ph-user-list text-sm"></i> Perfil
                        </button>
                        <a href="${c.telefono ? 'https://wa.me/'+c.telefono.replace(/D/g,'') : '#'}" target="_blank" class="flex items-center justify-center gap-1.5 py-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl text-[10px] font-black uppercase transition-all ${!c.telefono ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}">
                            <i class="ph-bold ph-whatsapp-logo text-sm"></i> WhatsApp
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderDeudoresDesktop() {
        const query = (document.getElementById("search-deudores-desktop")?.value || "").toLowerCase();
            
        const clientesUnicos = new Set(
            movimientos
                .filter(m => (m.tipo === "VENTA" && (m.metodo === "CREDITO" || m.metodo === "CRÉDITO")) || m.tipo === "ABONO")
                .map(m => m.cliente || "CLIENTE GENERAL")
        );

        let deudores = [];
        let totalGlobal = 0;

        clientesUnicos.forEach(cliente => {
            const deudasPendientes = calcularEstadoDeudas(cliente);
            if (deudasPendientes.length > 0) {
                const totalPendiente = deudasPendientes.reduce((s, d) => s + d.montoPendiente, 0);
                deudores.push({
                    nombre: cliente,
                    deudas: deudasPendientes,
                    total: totalPendiente
                });
                totalGlobal += totalPendiente;
            }
        });

        let deudoresFiltrados = deudores.filter((d) =>
            (d.nombre || '').toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "").includes(query.normalize("NFD").replace(/[u0300-u036f]/g, ""))
        );

        const totalEl = document.getElementById("total-deuda-desktop");
        if (totalEl) totalEl.innerText = `$${totalGlobal.toFixed(2)}`;

        const listaEl = document.getElementById("lista-deudores-desktop");
        if (!listaEl) return;
        
        listaEl.innerHTML = deudoresFiltrados.map((d) => {
            const tieneDeudasVencidas = d.deudas.some(deuda => (deuda.vencimiento || deuda.fechaVencimiento) && new Date(deuda.vencimiento || deuda.fechaVencimiento) < new Date());
            const bgClass = tieneDeudasVencidas ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100';
            
            return `
            <div class="p-6 rounded-3xl border-2 ${bgClass} shadow-sm hover:shadow-md transition-all group">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                        <h4 class="font-black text-slate-800 uppercase text-sm">${d.nombre}</h4>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deuda</p>
                        <p class="text-xl font-black text-red-600">$${d.total.toFixed(2)}</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-2 mb-4">
                    <span class="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase">
                        ${d.deudas.length} crédito(s)
                    </span>
                    ${tieneDeudasVencidas ? '<span class="px-2 py-1 bg-red-100 text-red-600 rounded text-[9px] font-black uppercase"><i class="ph-bold ph-warning mr-1"></i>Vencido</span>' : ''}
                </div>

                <button onclick="abrirDetalleDeudorDesktop('${d.nombre}')" class="w-full flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase transition-all">
                    Ver Deudas <i class="ph-bold ph-arrow-right"></i>
                </button>
            </div>
            `;
        }).join("");
    }

    function verDetalleClienteDesktop(id) {
        const c = clientes.find(x => String(x.id) === String(id));
        if(!c) return;
        
        const deudas = calcularEstadoDeudas(c.nombre);
        const totalDeuda = deudas.reduce((sum, d) => sum + d.montoPendiente, 0);

        const ultimasVentas = ventas
            .filter(v => v.cliente === c.nombre)
            .sort((a,b) => new Date(b.fechaISO) - new Date(a.fechaISO))
            .slice(0, 5);

        let html = `
            <div class="flex items-start gap-4 mb-6">
                <div class="w-16 h-16 rounded-3xl bg-blue-100 text-blue-600 flex items-center justify-center text-3xl font-black shrink-0">
                    ${c.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h3 class="text-2xl font-black text-slate-800 uppercase leading-none mb-2">${c.nombre}</h3>
                    <div class="flex gap-2">
                        <span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-black uppercase flex items-center gap-1"><i class="ph-bold ph-phone"></i> ${c.telefono || 'Sin teléfono'}</span>
                        <span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-black uppercase flex items-center gap-1"><i class="ph-bold ph-map-pin"></i> ${c.direccion || 'Sin dirección'}</span>
                    </div>
                </div>
            </div>

            ${totalDeuda > 0 ? `
                <div class="bg-red-50 border border-red-100 rounded-2xl p-5 mb-6 flex justify-between items-center">
                    <div>
                        <p class="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Deuda Activa</p>
                        <p class="text-3xl font-black text-red-600">$${totalDeuda.toFixed(2)}</p>
                    </div>
                    <button onclick="abrirDetalleDeudorDesktop('${c.nombre}')" class="px-5 py-3 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-200 hover:bg-red-600 transition-colors">
                        Procesar Abono
                    </button>
                </div>
            ` : `
                <div class="bg-green-50 border border-green-100 rounded-2xl p-5 mb-6 flex items-center gap-3">
                    <div class="w-10 h-10 bg-green-100 text-green-500 rounded-full flex items-center justify-center text-xl">
                        <i class="ph-bold ph-check"></i>
                    </div>
                    <div>
                        <p class="font-black text-green-600 uppercase text-sm">Cliente al día</p>
                        <p class="text-xs font-bold text-green-500">No presenta deudas pendientes</p>
                    </div>
                </div>
            `}

            <h4 class="font-black text-slate-800 uppercase text-xs tracking-widest mb-4">Últimas Compras</h4>
            <div class="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden mb-6">
                ${ultimasVentas.length > 0 ? ultimasVentas.map(v => `
                    <div class="p-4 border-b border-slate-100 last:border-0 flex justify-between items-center hover:bg-slate-100 transition-colors">
                        <div>
                            <p class="font-black text-slate-800 text-sm">#${v.id}</p>
                            <p class="text-[10px] font-bold text-slate-400">${v.fecha}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-black text-slate-800 text-sm">$${parseFloat(v.montoTotal||0).toFixed(2)}</p>
                            <span class="text-[9px] font-black px-2 py-0.5 rounded uppercase ${v.metodo === 'EFECTIVO' ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-600'}">${v.metodo}</span>
                        </div>
                    </div>
                `).join('') : '<p class="text-center text-xs font-bold text-slate-400 p-4">No hay compras registradas</p>'}
            </div>

            <button onclick="toggleModalDesktop(false)" class="w-full bg-slate-100 hover:bg-slate-200 py-4 rounded-2xl font-black uppercase text-xs transition-colors">Cerrar Perfil</button>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
    }

    function abrirDetalleDeudorDesktop(nombreCliente) {
        deudorActivoDesktop = nombreCliente;
        deudasSeleccionadasDesktop.clear();
        
        const deudasPendientes = calcularEstadoDeudas(nombreCliente);
        const totalPendiente = deudasPendientes.reduce((s, d) => s + d.montoPendiente, 0);

        let c = clientes.find(x => x.nombre === nombreCliente);
        let telefonoCliente = c ? c.telefono : '';

        let deudasHtml = deudasPendientes.map(deuda => {
            const fechaOperacion = deuda.fechaISO ? new Date(deuda.fechaISO).toLocaleDateString() : 'N/A';
            const fechaVencimiento = deuda.fechaVencimiento || deuda.vencimiento ? new Date(deuda.fechaVencimiento || deuda.vencimiento).toLocaleDateString() : 'Sin fecha';
            const esVencida = (deuda.fechaVencimiento || deuda.vencimiento) && new Date(deuda.fechaVencimiento || deuda.vencimiento) < new Date();
            
            const borderClass = esVencida ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white';
            const textClass = esVencida ? 'text-red-600' : 'text-slate-800';

            return `
                <div class="border-2 ${borderClass} rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all hover:border-blue-400" onclick="toggleDeudaSeleccionadaDesktop('${deuda.id}', this, ${deuda.montoPendiente})">
                    <div class="flex items-center gap-3">
                        <div class="w-5 h-5 rounded border-2 border-slate-300 flex items-center justify-center bg-white checkbox-deuda" id="check-${deuda.id}">
                            <i class="ph-bold ph-check text-white text-xs opacity-0"></i>
                        </div>
                        <div>
                            <p class="font-black ${textClass} text-sm">Venta #${deuda.id}</p>
                            <p class="text-[10px] font-bold text-slate-500">Fecha: ${fechaOperacion}</p>
                            <p class="text-[10px] font-bold text-slate-500">Vence: ${fechaVencimiento}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-black text-red-600 text-lg">$${deuda.montoPendiente.toFixed(2)}</p>
                        <p class="text-[9px] font-black text-slate-400 uppercase">Original: $${parseFloat(deuda.montoTotal).toFixed(2)}</p>
                    </div>
                </div>
            `;
        }).join("");

        let html = `
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Procesar Abono</h3>
                    <p class="text-xs font-bold text-slate-500 uppercase">${nombreCliente}</p>
                </div>
                ${telefonoCliente ? `
                <button onclick="enviarRecordatorioWS('${telefonoCliente}', '${nombreCliente}', ${totalPendiente})" class="bg-green-100 text-green-600 p-3 rounded-xl hover:bg-green-200 transition-colors">
                    <i class="ph-bold ph-whatsapp-logo text-xl"></i>
                </button>
                ` : ''}
            </div>

            <div class="bg-slate-50 rounded-2xl p-4 mb-6 flex justify-between items-center border border-slate-100">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Adeudado</span>
                <span class="text-2xl font-black text-red-600">$${totalPendiente.toFixed(2)}</span>
            </div>

            <div class="flex gap-2 mb-4">
                <button onclick="seleccionarTodasDeudasDesktop()" class="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 transition-colors">Marcar Todas</button>
                <button onclick="deseleccionarTodasDeudasDesktop()" class="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 transition-colors">Desmarcar Todas</button>
            </div>

            <div class="space-y-3 mb-6 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2" id="contenedor-deudas-desktop">
                ${deudasHtml}
            </div>

            <div class="bg-blue-50 border border-blue-100 rounded-3xl p-6">
                <label class="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Monto a Abonar (USD)</label>
                <div class="relative mb-4">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-blue-600">$</span>
                    <input type="number" id="input-abono-desktop" step="0.01" class="w-full bg-white border-2 border-blue-200 rounded-2xl pl-10 pr-4 py-4 text-2xl font-black text-blue-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-right" placeholder="0.00">
                </div>
                
                <div class="flex gap-3">
                    <button onclick="procesarAbonoDesktop()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-lg shadow-blue-200 transition-all active:scale-95 flex justify-center items-center gap-2">
                        <i class="ph-bold ph-check-circle text-lg"></i> Confirmar Pago
                    </button>
                    <button id="btn-imprimir-abono-desktop" onclick="imprimirAbonoDesktop()" class="hidden bg-slate-800 hover:bg-slate-900 text-white px-5 rounded-2xl font-black uppercase transition-all shadow-lg shadow-slate-200">
                        <i class="ph-bold ph-printer text-xl"></i>
                    </button>
                </div>
            </div>
            
            <button onclick="toggleModalDesktop(false)" class="w-full mt-4 text-xs font-black text-slate-400 uppercase hover:text-slate-600 transition-colors py-2">Cancelar</button>
        `;

        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
    }

    function toggleDeudaSeleccionadaDesktop(id, element, montoPendiente) {
        const checkbox = document.getElementById(`check-${id}`);
        const icon = checkbox.querySelector('i');
        
        if (deudasSeleccionadasDesktop.has(id)) {
            // Deseleccionar
            deudasSeleccionadasDesktop.forEach(item => {
                if(item.id === id) deudasSeleccionadasDesktop.delete(item);
            });
            element.classList.remove('border-blue-500', 'bg-blue-50/30');
            checkbox.classList.remove('bg-blue-500', 'border-blue-500');
            checkbox.classList.add('bg-white', 'border-slate-300');
            icon.classList.add('opacity-0');
        } else {
            // Seleccionar
            deudasSeleccionadasDesktop.add({id, monto: montoPendiente});
            element.classList.add('border-blue-500', 'bg-blue-50/30');
            checkbox.classList.remove('bg-white', 'border-slate-300');
            checkbox.classList.add('bg-blue-500', 'border-blue-500');
            icon.classList.remove('opacity-0');
        }
        actualizarMontoAbonoDesktop();
    }

    function actualizarMontoAbonoDesktop() {
        let total = 0;
        deudasSeleccionadasDesktop.forEach(d => total += d.monto);
        document.getElementById("input-abono-desktop").value = total > 0 ? total.toFixed(2) : "";
    }

    function seleccionarTodasDeudasDesktop() {
        const contenedor = document.getElementById('contenedor-deudas-desktop');
        const divs = contenedor.querySelectorAll('div[onclick^="toggleDeudaSeleccionadaDesktop"]');
        deudasSeleccionadasDesktop.clear();
        divs.forEach(div => {
            const onclickText = div.getAttribute('onclick');
            const match = onclickText.match(/toggleDeudaSeleccionadaDesktop\('([^']+)',\s*this,\s*([0-9.]+)\)/);
            if(match) {
                const id = match[1];
                const monto = parseFloat(match[2]);
                const checkbox = document.getElementById(`check-${id}`);
                const icon = checkbox.querySelector('i');
                
                deudasSeleccionadasDesktop.add({id, monto});
                div.classList.add('border-blue-500', 'bg-blue-50/30');
                checkbox.classList.remove('bg-white', 'border-slate-300');
                checkbox.classList.add('bg-blue-500', 'border-blue-500');
                icon.classList.remove('opacity-0');
            }
        });
        actualizarMontoAbonoDesktop();
    }

    function deseleccionarTodasDeudasDesktop() {
        deudasSeleccionadasDesktop.clear();
        const contenedor = document.getElementById('contenedor-deudas-desktop');
        const divs = contenedor.querySelectorAll('div[onclick^="toggleDeudaSeleccionadaDesktop"]');
        divs.forEach(div => {
            const onclickText = div.getAttribute('onclick');
            const match = onclickText.match(/toggleDeudaSeleccionadaDesktop\('([^']+)'/);
            if(match) {
                const id = match[1];
                const checkbox = document.getElementById(`check-${id}`);
                const icon = checkbox.querySelector('i');
                
                div.classList.remove('border-blue-500', 'bg-blue-50/30');
                checkbox.classList.remove('bg-blue-500', 'border-blue-500');
                checkbox.classList.add('bg-white', 'border-slate-300');
                icon.classList.add('opacity-0');
            }
        });
        actualizarMontoAbonoDesktop();
    }

    async function procesarAbonoDesktop() {
        const montoInput = document.getElementById("input-abono-desktop").value;
        const monto = parseFloat(montoInput);

        if (isNaN(monto) || monto <= 0) {
            mostrarToast("Ingresa un monto válido mayor a 0", "error");
            return;
        }

        const deudasArray = Array.from(deudasSeleccionadasDesktop).map(d => d.id);
        const nuevoMovimiento = {
            id: Date.now().toString(),
            tipo: "ABONO",
            cliente: deudorActivoDesktop,
            montoTotal: monto,
            fecha: new Date().toLocaleDateString('en-GB'),
            fechaISO: new Date().toISOString(),
            metodo: "EFECTIVO", // Asumido por defecto
            deudas: deudasArray,
            usuario: usuarioActual ? usuarioActual.nombre : "Admin"
        };

        // Guardado optimista
        movimientos.push(nuevoMovimiento);
        ultimoAbonoDesktop = nuevoMovimiento;
        
        // Refrescar vistas
        renderDeudoresDesktop();
        renderClientesDesktop();
        renderStatsClientes();

        // Cambiar botones
        const btnProcesar = document.querySelector('button[onclick="procesarAbonoDesktop()"]');
        if(btnProcesar) btnProcesar.innerText = "Abono Registrado ✓";
        const btnImprimir = document.getElementById('btn-imprimir-abono-desktop');
        if(btnImprimir) btnImprimir.classList.remove('hidden');

        mostrarToast("Abono procesado con éxito", "ok");

        // Enviar a backend
        api({ accion: "guardarMovimiento", movimiento: nuevoMovimiento });
    }

    function imprimirAbonoDesktop() {
        if (!ultimoAbonoDesktop) return;
        
        const c = clientes.find(x => x.nombre === ultimoAbonoDesktop.cliente);
        const htmlTicket = `
            <div style="font-family: monospace; font-size: 12px; width: 80mm; padding: 10px;">
                <div style="text-align: center; margin-bottom: 10px;">
                    <h2 style="font-size: 16px; margin:0;">VENDELO+</h2>
                    <p style="margin:0;">COMPROBANTE DE PAGO</p>
                    <p style="margin:0;">#${ultimoAbonoDesktop.id.substring(0,8)}</p>
                    <p style="margin:0;">${ultimoAbonoDesktop.fecha}</p>
                </div>
                <hr style="border-top: 1px dashed black; margin: 5px 0;">
                <p><strong>Cliente:</strong> ${ultimoAbonoDesktop.cliente}</p>
                ${c && c.telefono ? `<p><strong>Tel:</strong> ${c.telefono}</p>` : ''}
                <hr style="border-top: 1px dashed black; margin: 5px 0;">
                <div style="font-size: 14px; font-weight: bold; text-align: right; margin-top: 10px;">
                    MONTO ABONADO:<br>
                    <span style="font-size: 20px;">$${ultimoAbonoDesktop.montoTotal.toFixed(2)}</span>
                </div>
                <p style="font-size: 10px; margin-top: 5px; text-align: right;">Cajero: ${ultimoAbonoDesktop.usuario}</p>
                <div style="text-align: center; margin-top: 20px; font-size: 10px;">
                    <p>¡Gracias por su pago!</p>
                </div>
            </div>
        `;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Imprimir Comprobante</title></head><body>');
        printWindow.document.write(htmlTicket);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    }
    
    function enviarRecordatorioWS(telefono, nombre, monto) {
        const numeroLimpio = telefono.replace(/D/g, '');
        const mensaje = `Hola ${nombre}, le recordamos que tiene un saldo pendiente de $${monto.toFixed(2)}. Por favor, póngase al día lo antes posible. Gracias.`;
        window.open(`https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');
    }

    function verDetalleOperacionDesktop(id) {
        const op = ventas.find(v => String(v.id) === String(id));
        if(!op) return;

        let items = [];
        if (op.items) {
            try {
                items = typeof op.items === 'string' ? JSON.parse(op.items) : op.items;
            } catch (e) {
                console.error("Error parsing items:", e);
            }
        }

        const mTotal = parseFloat(op.montoTotal || 0);
        const mBs = op.totalBs ? parseFloat(op.totalBs) : (mTotal * tasa);

        let html = `
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Operación #${op.id}</h3>
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">${op.fecha}</p>
                </div>
                <span class="px-4 py-2 bg-blue-50 text-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest">${op.metodo}</span>
            </div>

            <div class="bg-slate-50 rounded-[2rem] p-6 mb-6 border border-slate-100">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Productos</p>
                <div class="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                    ${items.length > 0 ? items.map(item => `
                        <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-[10px] font-black">
                                    ${item.cantidad}x
                                </div>
                                <span class="text-xs font-bold text-slate-700 uppercase">${item.nombre}</span>
                            </div>
                            <span class="text-xs font-black text-slate-800">$${parseFloat(item.subtotal || 0).toFixed(2)}</span>
                        </div>
                    `).join('') : '<p class="text-xs font-bold text-slate-400 text-center py-4 uppercase">Sin detalle de productos</p>'}
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-8">
                <div class="bg-slate-900 p-6 rounded-[2rem] text-white">
                    <p class="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Total USD</p>
                    <h2 class="text-2xl font-black">$${mTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h2>
                </div>
                <div class="bg-blue-600 p-6 rounded-[2rem] text-white">
                    <p class="text-[9px] font-black opacity-60 uppercase tracking-widest mb-1">Total BS</p>
                    <h2 class="text-2xl font-black">Bs ${mBs.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h2>
                </div>
            </div>

            <button onclick="toggleModalDesktop(false)" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-5 rounded-2xl font-black uppercase text-xs transition-all active:scale-95">Cerrar Detalle</button>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
    }

    function abrirModalProducto(id = null) {
        const p = id ? productos.find(x => String(x.id) === String(id)) : { 
            nombre: "", categoria: "", costo: 0, precio: 0, stock: 0, 
            barcode: "", stockMin: 0, stockMax: 0, unidad: "UN", 
            proveedor: "", bloque: "", estante: "", img: "" 
        };
        
        let html = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">${id ? 'Editar' : 'Nuevo'} Producto</h3>
                ${id ? `<button onclick="eliminarProductoDesktop('${id}')" class="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all">Eliminar Producto</button>` : ''}
            </div>
            
            <form onsubmit="guardarProductoDesktop(event, ${id ? `'${id}'` : 'null'})" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <!-- Columna Imagen -->
                    <div class="md:col-span-1 space-y-4">
                        <div id="p-img-preview" class="w-full aspect-square rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shadow-inner">
                            ${p.img ? `<img src="${p.img}" class="w-full h-full object-cover">` : '<i class="ph-bold ph-image text-4xl text-slate-200"></i>'}
                        </div>
                        <input type="text" name="img" value="${p.img || ''}" oninput="document.getElementById('p-img-preview').innerHTML = this.value ? \`<img src='\${this.value}' class='w-full h-full object-cover'>\` : \`<i class='ph-bold ph-image text-4xl text-slate-200'></i>\`" 
                            placeholder="URL de Imagen" class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-xs font-bold border border-transparent focus:border-blue-500 outline-none">
                    </div>

                    <!-- Columna Datos Principales -->
                    <div class="md:col-span-2 space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Código de Barras</label>
                                <div class="relative">
                                    <input type="text" name="barcode" id="p-barcode" value="${p.barcode || ''}" placeholder="Escanear o ingresar..." 
                                        class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-blue-500 outline-none">
                                    <button type="button" onclick="abrirEscanerDesktop(c => { document.getElementById('p-barcode').value = c; })" 
                                        class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg">
                                        <i class="ph-bold ph-barcode"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Nombre del Producto</label>
                                <input type="text" name="nombre" value="${p.nombre}" placeholder="Ej: Coca Cola 1.5L" required 
                                    class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-blue-500 outline-none">
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Categoría</label>
                                <div class="flex gap-2">
                                    <select name="categoria" required class="flex-1 bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-blue-500 outline-none uppercase">
                                        <option value="">Seleccionar...</option>
                                        ${categorias.map(c => `<option value="${c}" ${p.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
                                    </select>
                                    <button type="button" onclick="abrirModalCrearCategoria()" class="w-12 h-12 flex items-center justify-center bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all">
                                        <i class="ph-bold ph-plus"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Proveedor</label>
                                <select name="proveedor" class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-blue-500 outline-none uppercase">
                                    <option value="">Sin Proveedor</option>
                                    ${proveedores.map(prov => `<option value="${prov.nombre}" ${p.proveedor === prov.nombre ? 'selected' : ''}>${prov.nombre}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-4">
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Costo ($)</label>
                                <input type="number" step="0.01" name="costo" value="${p.costo}" required 
                                    class="w-full bg-red-50 text-red-600 rounded-2xl px-4 py-3 text-sm font-bold outline-none border border-transparent focus:border-red-500">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Venta ($)</label>
                                <input type="number" step="0.01" name="venta" value="${p.precio}" required 
                                    class="w-full bg-blue-50 text-blue-600 rounded-2xl px-4 py-3 text-sm font-bold outline-none border border-transparent focus:border-blue-500">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Unidad</label>
                                <select name="unidad" class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-blue-500 outline-none">
                                    <option value="UN" ${p.unidad === 'UN' ? 'selected' : ''}>UNIDAD</option>
                                    <option value="KG" ${p.unidad === 'KG' ? 'selected' : ''}>KILOGRAMO</option>
                                    <option value="LT" ${p.unidad === 'LT' ? 'selected' : ''}>LITRO</option>
                                    <option value="MTS" ${p.unidad === 'MTS' ? 'selected' : ''}>METROS</option>
                                </select>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Stock Mínimo</label>
                                <input type="number" step="0.01" name="stockMin" value="${p.stockMin}" 
                                    class="w-full bg-orange-50 text-orange-600 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-orange-500 outline-none">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Stock Máximo</label>
                                <input type="number" step="0.01" name="stockMax" value="${p.stockMax || ''}" 
                                    class="w-full bg-green-50 text-green-600 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-green-500 outline-none">
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Bloque / Pasillo</label>
                                <input type="text" name="bloque" value="${p.bloque || ''}" placeholder="Ej: Pasillo A" 
                                    class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-blue-500 outline-none uppercase">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Estante / Nivel</label>
                                <input type="text" name="estante" value="${p.estante || ''}" placeholder="Ej: Nivel 3" 
                                    class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-blue-500 outline-none uppercase">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4 pt-4 border-t border-slate-100">
                    <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-blue-100 transition-all active:scale-95">Guardar Cambios</button>
                    <button type="button" onclick="toggleModalDesktop(false)" class="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-xs transition-all active:scale-95">Cancelar</button>
                </div>
            </form>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
    }

    async function guardarProductoDesktop(e, id) {
        e.preventDefault();
        if (!window.licenciaActiva) {
            if (typeof Swal !== 'undefined') Swal.fire('Acceso Restringido', 'Tu licencia ha expirado. Renueva para modificar el inventario.', 'warning');
            return;
        }
        const formData = new FormData(e.target);
        const prod = Object.fromEntries(formData.entries());
        
        // Mantener el ID original o generar uno nuevo
        const originalProd = id ? productos.find(x => String(x.id) === String(id)) : null;
        prod.id = id || Date.now().toString();
        
        // Preservar stock en edición (a menos que se quiera implementar ajuste aquí)
        prod.stock = originalProd ? originalProd.stock : 0;
        
        // Conversión de tipos
        prod.costo = parseFloat(prod.costo) || 0;
        prod.venta = parseFloat(prod.venta) || 0;
        prod.stockMin = parseFloat(prod.stockMin) || 0;
        prod.stockMax = parseFloat(prod.stockMax) || 0;
        
        const res = await api({ accion: "guardarProducto", producto: JSON.stringify(prod), oldId: id });
        if(res && res.ok) {
            toggleModalDesktop(false);
            mostrarToast("Producto guardado correctamente", "ok");
            cargarDatosIniciales();
        } else {
            mostrarToast(res.error || "Error al guardar producto", "error");
            console.error("Error guardando producto:", res);
        }
    }

    // ===== GESTIÓN DE COMPRAS (REPOSICIÓN) =====
    function getProductosStockBajo() {
        return productos.filter(p => (p.stockMin || 0) > 0 && p.stock < (p.stockMin || 0));
    }

    function abrirCompraDesdeStockBajo() {
        const bajos = getProductosStockBajo();
        if (bajos.length === 0) {
            mostrarToast("NO HAY PRODUCTOS CON STOCK BAJO", "error");
            return;
        }
        esCompraDesdeStockBajo = true;
        
        // Limpiar estado
        provCompraSeleccionado = null;
        itemsNuevaCompra = bajos.map(p => {
            const cantidadNecesaria = (p.stockMax && p.stockMax > 0)
                ? Math.max(1, Math.ceil(p.stockMax - p.stock))
                : Math.max(1, Math.ceil((p.stockMin || 0) - p.stock));
            return {
                id: p.id,
                nombre: p.nombre,
                cantidad: cantidadNecesaria,
                costo: p.costo || 0,
                descripcion: ''
            };
        });

        abrirModalNuevaCompra();
    }

    function abrirModalNuevaCompra() {
        let html = `
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Orden de Compra / Reposición</h3>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Generar pedido a proveedor</p>
                </div>
                <div class="flex flex-col items-end">
                    <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Total Estimado</p>
                    <span id="compra-total-display" class="text-2xl font-black text-blue-600">$0.00</span>
                </div>
            </div>

            <div class="grid grid-cols-12 gap-8">
                <!-- Columna Izquierda: Configuración -->
                <div class="col-span-4 space-y-6">
                    <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <label class="text-[9px] font-black text-slate-400 uppercase ml-2 mb-2 block">Proveedor</label>
                        <div class="relative">
                            <i class="ph-bold ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            <input type="text" id="search-prov-compra" oninput="buscarProvCompra(this.value)" placeholder="Buscar proveedor..." 
                                class="w-full bg-white rounded-2xl pl-10 pr-4 py-3 text-sm font-bold border border-slate-200 outline-none focus:border-blue-500 shadow-sm uppercase">
                            <div id="sug-prov-compra" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-40 overflow-y-auto z-50 hidden custom-scrollbar"></div>
                        </div>
                        <div id="prov-compra-sel" class="mt-3 hidden flex justify-between items-center bg-blue-50 p-3 rounded-2xl border border-blue-100">
                            <span id="prov-compra-nombre" class="text-[10px] font-black text-blue-600 uppercase truncate pr-2"></span>
                            <button onclick="deseleccionarProvCompra()" class="text-red-500 hover:text-red-700 transition-all shrink-0"><i class="ph-bold ph-x-circle text-lg"></i></button>
                        </div>
                    </div>

                    <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                        <div class="space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Método de Pago</label>
                            <select id="compra-metodo" onchange="toggleVencCompra()" class="w-full bg-white rounded-2xl px-4 py-3 text-sm font-bold border border-slate-200 outline-none focus:border-blue-500 shadow-sm uppercase">
                                <option value="EFECTIVO">CONTADO (EFECTIVO)</option>
                                <option value="CREDITO">CRÉDITO</option>
                            </select>
                        </div>
                        <div id="venc-compra-container" class="space-y-1 hidden">
                            <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Fecha de Vencimiento</label>
                            <input type="date" id="compra-vencimiento" class="w-full bg-white rounded-2xl px-4 py-3 text-sm font-bold border border-slate-200 outline-none focus:border-blue-500 shadow-sm">
                        </div>
                    </div>
                    
                    <button id="btn-guardar-compra" onclick="guardarFacturaCompra()" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-3xl font-black uppercase text-xs shadow-xl shadow-blue-100 transition-all active:scale-95">Procesar Orden de Compra</button>
                    <button onclick="toggleModalDesktop(false)" class="w-full bg-slate-100 text-slate-600 py-4 rounded-3xl font-black uppercase text-xs transition-all active:scale-95">Cancelar</button>
                </div>

                <!-- Columna Derecha: Items -->
                <div class="col-span-8 flex flex-col">
                    <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex-1 flex flex-col min-h-[400px]">
                        <label class="text-[9px] font-black text-slate-400 uppercase ml-2 mb-2 block">Agregar Productos</label>
                        <div class="relative mb-6 flex gap-2">
                            <div class="relative flex-1">
                                <i class="ph-bold ph-package absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                <input type="text" id="search-prod-compra" 
                                    oninput="buscarProductoCompra(this.value)" 
                                    onkeydown="if(event.key==='Enter') agregarItemCompraDirecto()"
                                    placeholder="Buscar por nombre o escanear código..." 
                                    class="w-full bg-white rounded-2xl pl-12 pr-4 py-4 text-sm font-bold border border-slate-200 outline-none focus:border-blue-500 shadow-sm uppercase">
                            </div>
                            <button onclick="abrirEscanerDesktop(c => { document.getElementById('search-prod-compra').value = c; agregarItemCompraDirecto(); })" 
                                class="bg-white border border-slate-200 text-slate-400 hover:text-blue-600 px-4 rounded-2xl transition-all shadow-sm">
                                <i class="ph-bold ph-barcode text-xl"></i>
                            </button>
                            <div id="sug-prod-compra" class="absolute left-0 right-14 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-60 overflow-y-auto z-50 hidden custom-scrollbar"></div>
                        </div>

                        <div id="lista-items-compra" class="space-y-3 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar flex-1">
                            <!-- Items aquí -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        renderItemsCompra();
        toggleModalDesktop(true, 'max-w-5xl');
    }

    function buscarProvCompra(q) {
        const div = document.getElementById("sug-prov-compra");
        if (!q.trim()) { div.classList.add("hidden"); return; }
        const matches = proveedores.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()));
        if (matches.length === 0) { div.classList.add("hidden"); return; }
        
        div.innerHTML = matches.map(m => `
            <div onclick="seleccionarProvCompra('${m.nombre}')" class="p-4 hover:bg-blue-50 cursor-pointer border-b border-slate-50 transition-all flex items-center gap-3">
                <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center"><i class="ph-bold ph-user"></i></div>
                <span class="text-xs font-black uppercase text-slate-700">${m.nombre}</span>
            </div>
        `).join("");
        div.classList.remove("hidden");
    }

    function seleccionarProvCompra(nombre) {
        provCompraSeleccionado = proveedores.find(p => p.nombre === nombre);
        document.getElementById("prov-compra-nombre").innerText = nombre;
        document.getElementById("prov-compra-sel").classList.remove("hidden");
        document.getElementById("sug-prov-compra").classList.add("hidden");
        document.getElementById("search-prov-compra").value = "";
    }

    function deseleccionarProvCompra() {
        provCompraSeleccionado = null;
        document.getElementById("prov-compra-sel").classList.add("hidden");
    }

    function buscarProductoCompra(q) {
        const div = document.getElementById("sug-prod-compra");
        if (!div) return;
        
        if (!q.trim()) { 
            div.classList.add("hidden"); 
            return; 
        }
        
        const term = q.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
        
        const matches = (productos || []).filter(p => {
            const nombre = (p.nombre || "").toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
            const codigo = (p.barcode || p.codigo || p.id || "").toString().toLowerCase();
            return nombre.includes(term) || codigo.includes(term);
        });

        if (matches.length === 0) { 
            div.innerHTML = `
                <div class="p-8 text-center flex flex-col items-center justify-center gap-2">
                    <i class="ph-bold ph-magnifying-glass text-slate-200 text-3xl"></i>
                    <p class="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">Sin resultados</p>
                </div>
            `;
            div.classList.remove("hidden");
            return; 
        }

        div.innerHTML = matches.slice(0, 15).map(p => `
            <div onclick="seleccionarProductoCompra('${p.id}')" class="p-4 hover:bg-blue-50 cursor-pointer border-b border-slate-50 transition-all flex justify-between items-center group">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-blue-100 group-hover:text-blue-600 transition-all">
                        <i class="ph-bold ph-package text-lg"></i>
                    </div>
                    <div>
                        <p class="text-xs font-black uppercase text-slate-800">${p.nombre}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                            CODE: ${p.barcode || p.id} | STOCK: ${parseFloat(p.stock || 0).toFixed(2)} | COSTO: $${parseFloat(p.costo || 0).toFixed(2)}
                        </p>
                    </div>
                </div>
                <div class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                    Agregar <i class="ph-bold ph-plus-circle"></i>
                </div>
            </div>
        `).join("");
        div.classList.remove("hidden");
    }

    function agregarItemCompraDirecto() {
        const q = document.getElementById("search-prod-compra").value.trim();
        if (!q) return;
        const p = productos.find(x => 
            (x.barcode && x.barcode === q) || 
            x.nombre.toLowerCase() === q.toLowerCase()
        );
        if (p) {
            seleccionarProductoCompra(p.id);
        } else {
            mostrarToast("Producto no encontrado");
        }
    }

    function seleccionarProductoCompra(id) {
        const p = productos.find(x => String(x.id) === String(id));
        if (!p) return;
        
        const existe = itemsNuevaCompra.find(i => String(i.id) === String(id));
        if (existe) {
            existe.cantidad++;
        } else {
            itemsNuevaCompra.push({
                id: p.id,
                nombre: p.nombre,
                barcode: p.barcode || '',
                cantidad: 1,
                costo: p.costo || 0,
                descripcion: ''
            });
        }
        
        document.getElementById("sug-prod-compra").classList.add("hidden");
        document.getElementById("search-prod-compra").value = "";
        renderItemsCompra();
    }

    function renderItemsCompra() {
        const container = document.getElementById("lista-items-compra");
        if (!container) return;
        
        if (itemsNuevaCompra.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-slate-300">
                    <i class="ph-bold ph-shopping-bag-open text-5xl mb-2"></i>
                    <p class="text-[10px] font-black uppercase italic">Sin productos en la orden</p>
                </div>
            `;
            const display = document.getElementById("compra-total-display");
            if (display) display.innerText = "$0.00";
            return;
        }

        container.innerHTML = itemsNuevaCompra.map((item, index) => `
            <div class="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-6 animate-in fade-in slide-in-from-right-2 group hover:border-blue-200 transition-all">
                <div class="flex-1 min-w-0 pl-2">
                    <p class="text-[10px] font-black text-blue-600 uppercase mb-0.5 tracking-tighter">#${item.id}</p>
                    <h5 class="text-xs font-black text-slate-800 uppercase truncate">${item.nombre}</h5>
                    <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">BC: ${item.barcode || '---'}</p>
                </div>
                
                <div class="flex items-center gap-6 shrink-0">
                    <!-- Cantidad -->
                    <div class="space-y-1">
                        <label class="text-[8px] font-black text-slate-400 uppercase ml-1 block">Cantidad</label>
                        <div class="flex items-center bg-slate-50 rounded-2xl px-2 py-1 border border-slate-100 shadow-inner">
                            <button onclick="actualizarCantidadCompra(${index}, -1)" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all"><i class="ph-bold ph-minus text-xs"></i></button>
                            <input type="number" step="0.01" value="${item.cantidad}" onchange="actualizarCantidadDirectaCompra(${index}, this.value)" 
                                class="w-12 bg-transparent border-none text-center text-xs font-black text-slate-800 outline-none">
                            <button onclick="actualizarCantidadCompra(${index}, 1)" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all"><i class="ph-bold ph-plus text-xs"></i></button>
                        </div>
                    </div>

                    <!-- Costo Unitario -->
                    <div class="space-y-1">
                        <label class="text-[8px] font-black text-slate-400 uppercase ml-1 block">Costo Unit.</label>
                        <div class="relative">
                            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">$</span>
                            <input type="number" step="0.01" value="${item.costo}" onchange="actualizarCostoCompra(${index}, this.value)" 
                                class="w-28 bg-slate-50 border border-transparent focus:border-blue-500 rounded-2xl pl-7 pr-4 py-2.5 text-xs font-black text-blue-600 outline-none transition-all shadow-inner">
                        </div>
                    </div>

                    <!-- Subtotal -->
                    <div class="space-y-1 text-right min-w-[100px] pr-2">
                        <label class="text-[8px] font-black text-slate-400 uppercase block">Subtotal</label>
                        <p class="text-sm font-black text-slate-800 py-2 tracking-tighter">$${(item.cantidad * item.costo).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                    </div>

                    <button onclick="eliminarItemCompra(${index})" class="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all">
                        <i class="ph-bold ph-trash text-lg"></i>
                    </button>
                </div>
            </div>
        `).join("");

        const total = itemsNuevaCompra.reduce((acc, i) => acc + (i.cantidad * i.costo), 0);
        const display = document.getElementById("compra-total-display");
        if (display) display.innerText = `$${total.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    }

    function actualizarCantidadCompra(index, delta) {
        itemsNuevaCompra[index].cantidad = Math.max(0.01, itemsNuevaCompra[index].cantidad + delta);
        renderItemsCompra();
    }

    function actualizarCantidadDirectaCompra(index, val) {
        itemsNuevaCompra[index].cantidad = Math.max(0.01, parseFloat(val) || 0);
        renderItemsCompra();
    }

    function actualizarCostoCompra(index, val) {
        itemsNuevaCompra[index].costo = Math.max(0, parseFloat(val) || 0);
        renderItemsCompra();
    }

    function eliminarItemCompra(index) {
        itemsNuevaCompra.splice(index, 1);
        renderItemsCompra();
    }

    function toggleVencCompra() {
        const metodo = document.getElementById("compra-metodo").value;
        const container = document.getElementById("venc-compra-container");
        if (metodo === "CREDITO") {
            container.classList.remove("hidden");
        } else {
            container.classList.add("hidden");
        }
    }

    async function guardarFacturaCompra() {
        if (!window.licenciaActiva) {
            if (typeof Swal !== 'undefined') Swal.fire('Acceso Restringido', 'Tu licencia ha expirado. Renueva para registrar compras.', 'warning');
            return;
        }
        if (!provCompraSeleccionado) return mostrarToast("Selecciona un proveedor");
        if (itemsNuevaCompra.length === 0) return mostrarToast("La orden está vacía");
        
        const metodo = document.getElementById("compra-metodo").value;
        const vencimiento = document.getElementById("compra-vencimiento")?.value;
        
        if (metodo === "CREDITO" && !vencimiento) {
            return mostrarToast("Seleccione fecha de vencimiento para el crédito");
        }

        mostrarLoading(true, "Procesando orden de compra...");
        
        const total = itemsNuevaCompra.reduce((acc, i) => acc + (i.cantidad * i.costo), 0);
        const prefijo = metodo === "CREDITO" ? "OC-" : "FC-";
        const id = prefijo + Date.now().toString().slice(-8);

        // El usuario solicitó que las compras queden en TRANSITO por defecto para control
        let estado = "TRANSITO";
        if (metodo === "EFECTIVO" && !esCompraDesdeStockBajo) {
            // Si el usuario quisiera que se cargue de inmediato, se podría alternar aquí.
            // Por ahora, seguimos la instrucción de dejarlo en TRANSITO para recepción.
            estado = "TRANSITO"; 
        }

        const pedido = {
            id: id,
            fecha: new Date().toLocaleString(),
            fechaISO: new Date().toISOString(),
            tipo: "PEDIDO_COMPRA",
            proveedor: provCompraSeleccionado.nombre,
            proveedorId: provCompraSeleccionado.id || "",
            items: itemsNuevaCompra,
            montoTotal: total,
            totalUsd: total,
            totalBs: total * tasa,
            metodo: metodo,
            vencimiento: vencimiento || null,
            estado: estado,
            vendedor: (usuarioActual && usuarioActual.nombre) ? usuarioActual.nombre : "ADMIN"
        };

        try {
            // Solo cargar stock inmediatamente si el estado es RECIBIDO
            // (Si es TRANSITO, el stock se cargará cuando el usuario use la función 'Recibir')
            if (estado === "RECIBIDO") {
                for (let item of itemsNuevaCompra) {
                    const prod = productos.find(x => String(x.id) === String(item.id));
                    if (prod) {
                        prod.stock += item.cantidad;
                        await api({ accion: "actualizarStock", id: prod.id, cantidad: item.cantidad, costo: item.costo });
                    }
                }
            }

            const res = await api({ accion: "guardarMovimiento", movimiento: JSON.stringify(pedido) });
            
            if (res && res.ok !== false) {
                mostrarToast("¡Orden de compra procesada correctamente!", "ok");
                itemsNuevaCompra = [];
                provCompraSeleccionado = null;
                esCompraDesdeStockBajo = false; // Resetear estado
                toggleModalDesktop(false);
                await cargarDatosIniciales();
            } else {
                mostrarToast("Error al guardar: " + (res.error || "Servidor no responde"));
            }
        } catch (e) {
            mostrarToast("Error fatal al procesar compra");
            console.error(e);
        } finally {
            mostrarLoading(false);
        }
    }

    function abrirModalEntradaStock() {
        let html = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Entrada de Stock</h3>
                <div class="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase">Registro de Mercancía</div>
            </div>
            
            <form onsubmit="procesarEntradaStockDesktop(event)" class="space-y-6">
                <div class="space-y-4">
                    <div class="space-y-1">
                        <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Seleccionar Producto</label>
                        <div class="relative">
                            <i class="ph-bold ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            <input type="text" id="ent-search" oninput="buscarProductoEntrada(this.value)" placeholder="Buscar por nombre o código..." 
                                class="w-full bg-slate-50 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold border border-transparent focus:border-emerald-500 outline-none shadow-inner">
                            <div id="ent-results" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-60 overflow-y-auto z-50 hidden custom-scrollbar"></div>
                        </div>
                    </div>

                    <input type="hidden" id="ent-prod-id" name="id" required>
                    
                    <div id="ent-prod-info" class="hidden bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                        <div class="flex justify-between items-center mb-4">
                            <div>
                                <p id="ent-prod-nombre" class="text-lg font-black text-slate-800 uppercase leading-none"></p>
                                <p id="ent-prod-stock" class="text-xs font-bold text-emerald-600 mt-1 uppercase"></p>
                            </div>
                            <button type="button" onclick="limpiarSeleccionEntrada()" class="text-slate-400 hover:text-red-500"><i class="ph-bold ph-x-circle text-2xl"></i></button>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Cantidad a Ingresar</label>
                                <input type="number" step="0.01" name="cantidad" id="ent-cantidad" required placeholder="0.00"
                                    class="w-full bg-white rounded-2xl px-4 py-4 text-lg font-black text-slate-800 border border-transparent focus:border-emerald-500 outline-none">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Nuevo Costo (Opcional)</label>
                                <input type="number" step="0.01" name="costo" id="ent-costo" placeholder="Mantiene actual"
                                    class="w-full bg-white rounded-2xl px-4 py-4 text-lg font-black text-slate-800 border border-transparent focus:border-emerald-500 outline-none">
                            </div>
                        </div>
                    </div>
                    
                    <div class="space-y-1">
                        <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Notas / Comentario</label>
                        <textarea name="notas" placeholder="Ej: Compra a proveedor X, Factura #123..." 
                            class="w-full bg-slate-50 rounded-2xl px-4 py-3 text-sm font-bold border border-transparent focus:border-emerald-500 outline-none h-24 resize-none"></textarea>
                    </div>
                </div>

                <div class="flex gap-4 pt-4 border-t border-slate-100">
                    <button type="submit" id="ent-submit-btn" disabled class="flex-1 bg-emerald-600 disabled:bg-slate-200 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-emerald-100 transition-all active:scale-95">Procesar Entrada</button>
                    <button type="button" onclick="toggleModalDesktop(false)" class="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-xs transition-all active:scale-95">Cancelar</button>
                </div>
            </form>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
    }

    function buscarProductoEntrada(q) {
        const resDiv = document.getElementById('ent-results');
        if(!q || q.length < 2) {
            resDiv.classList.add('hidden');
            return;
        }
        
        const query = q.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
        const filtrados = productos.filter(p => {
            const nombre = p.nombre.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
            return nombre.includes(query) || (p.barcode && p.barcode.toLowerCase().includes(query));
        }).slice(0, 5);

        if(filtrados.length > 0) {
            resDiv.innerHTML = filtrados.map(p => `
                <div onclick="seleccionarProductoEntrada('${p.id}')" class="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center transition-all">
                    <div>
                        <p class="text-sm font-black text-slate-800 uppercase">${p.nombre}</p>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">${p.categoria || 'SIN CAT'} | ${p.barcode || 'SIN COD'}</p>
                    </div>
                    <span class="text-xs font-black text-blue-600">$${parseFloat(p.precio).toFixed(2)}</span>
                </div>
            `).join('');
            resDiv.classList.remove('hidden');
        } else {
            resDiv.classList.add('hidden');
        }
    }
    function abrirModalAjustesMasivos() {
        let html = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Ajuste de Inventario</h3>
                <div class="bg-orange-50 text-orange-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase">Corrección de Stock</div>
            </div>
            
            <div class="space-y-6">
                <div class="relative">
                    <i class="ph-bold ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="text" oninput="buscarProductoAjuste(this.value)" placeholder="Buscar producto para ajustar..." 
                        class="w-full bg-slate-50 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold border border-transparent focus:border-orange-500 outline-none">
                    <div id="ajuste-results" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-80 overflow-y-auto z-50 hidden custom-scrollbar"></div>
                </div>

                <div id="ajuste-lista" class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    <div class="text-center py-12 text-slate-300">
                        <i class="ph-bold ph-hand-pointing text-4xl mb-2"></i>
                        <p class="text-[10px] font-black uppercase">Busca un producto para empezar</p>
                    </div>
                </div>

                <div class="flex gap-4 pt-4 border-t border-slate-100">
                    <button onclick="guardarAjustesDesktop()" class="flex-1 bg-slate-800 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl transition-all active:scale-95">Guardar Ajustes</button>
                    <button onclick="toggleModalDesktop(false)" class="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-xs active:scale-95">Cerrar</button>
                </div>
            </div>
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
        window.ajustesTemporales = {};
    }

    function buscarProductoAjuste(q) {
        const resDiv = document.getElementById('ajuste-results');
        if(!q || q.length < 2) { resDiv.classList.add('hidden'); return; }
        
        const query = q.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
        const filtrados = productos.filter(p => p.nombre.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "").includes(query)).slice(0, 5);

        if(filtrados.length > 0) {
            resDiv.innerHTML = filtrados.map(p => `
                <div onclick="agregarAAjuste('${p.id}')" class="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center">
                    <div>
                        <p class="text-sm font-black text-slate-800 uppercase">${p.nombre}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase">Stock actual: ${p.stock}</p>
                    </div>
                    <i class="ph-bold ph-plus-circle text-blue-600"></i>
                </div>
            `).join('');
            resDiv.classList.remove('hidden');
        } else { resDiv.classList.add('hidden'); }
    }

    function agregarAAjuste(id) {
        const p = productos.find(x => String(x.id) === String(id));
        if(!p || window.ajustesTemporales[id]) return;
        
        window.ajustesTemporales[id] = p.stock;
        renderListaAjuste();
        document.getElementById('ajuste-results').classList.add('hidden');
    }

    function renderListaAjuste() {
        const container = document.getElementById('ajuste-lista');
        const keys = Object.keys(window.ajustesTemporales);
        
        if(keys.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-slate-300"><i class="ph-bold ph-hand-pointing text-4xl mb-2"></i><p class="text-[10px] font-black uppercase">Busca un producto para empezar</p></div>`;
            return;
        }

        container.innerHTML = keys.map(id => {
            const p = productos.find(x => String(x.id) === String(id));
            return `
                <div class="bg-slate-50 p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-right-2">
                    <div class="flex-1">
                        <p class="text-xs font-black text-slate-800 uppercase">${p.nombre}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase">Original: ${p.stock}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="modificarAjuste('${id}', -1)" class="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-red-50 hover:text-red-600"><i class="ph-bold ph-minus"></i></button>
                        <input type="number" step="0.01" value="${window.ajustesTemporales[id]}" onchange="window.ajustesTemporales['${id}'] = this.value" 
                            class="w-20 bg-white border border-slate-200 rounded-lg px-2 py-2 text-center text-sm font-black text-slate-800 outline-none focus:border-blue-500">
                        <button onclick="modificarAjuste('${id}', 1)" class="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-emerald-50 hover:text-emerald-600"><i class="ph-bold ph-plus"></i></button>
                    </div>
                    <button onclick="quitarDeAjuste('${id}')" class="text-slate-300 hover:text-red-500"><i class="ph-bold ph-trash"></i></button>
                </div>
            `;
        }).join('');
    }

    function modificarAjuste(id, delta) {
        window.ajustesTemporales[id] = parseFloat(window.ajustesTemporales[id] || 0) + delta;
        renderListaAjuste();
    }

    function quitarDeAjuste(id) {
        delete window.ajustesTemporales[id];
        renderListaAjuste();
    }

    async function guardarAjustesDesktop() {
        if (!window.licenciaActiva) {
            if (typeof Swal !== 'undefined') Swal.fire('Acceso Restringido', 'Tu licencia ha expirado. Renueva para modificar el inventario.', 'warning');
            return;
        }
        const keys = Object.keys(window.ajustesTemporales);
        if(keys.length === 0) return mostrarToast("No hay cambios para guardar");
        
        mostrarToast("Guardando ajustes...", "info");
        
        // El backend suele preferir uno por uno o un batch si existe. 
        // Usaremos guardarProducto para cada uno actualizando solo el stock para mantener consistencia.
        let errores = 0;
        for(let id of keys) {
            const p = productos.find(x => String(x.id) === String(id));
            const prodUpdate = { ...p, stock: parseFloat(window.ajustesTemporales[id]) };
            const res = await api({ accion: "guardarProducto", producto: JSON.stringify(prodUpdate), oldId: id });
            if(!res || !res.ok) errores++;
        }
        
        if(errores === 0) {
            mostrarToast("Ajustes guardados correctamente", "ok");
            toggleModalDesktop(false);
            cargarDatosIniciales();
        } else {
            mostrarToast(`Error en ${errores} productos`);
        }
    }

    function generarReporteStock() {
        // Implementación simple de reporte para imprimir
        let printWindow = window.open('', '_blank');
        const html = `
            <html>
                <head>
                    <title>Reporte de Stock - ${new Date().toLocaleDateString()}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; color: #333; }
                        h1 { text-transform: uppercase; letter-spacing: -1px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #eee; padding: 12px; text-align: left; font-size: 12px; }
                        th { background: #f8f9fa; text-transform: uppercase; }
                        .stock-bajo { color: red; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h1>VENDELO+ CRM - REPORTE DE STOCK</h1>
                    <p>Fecha: ${new Date().toLocaleString()}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Categoría</th>
                                <th>Costo</th>
                                <th>Venta</th>
                                <th>Stock Actual</th>
                                <th>Ubicación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productos.map(p => `
                                <tr>
                                    <td>${p.nombre}</td>
                                    <td>${p.categoria || 'GENERAL'}</td>
                                    <td>$${parseFloat(p.costo || 0).toFixed(2)}</td>
                                    <td>$${parseFloat(p.precio).toFixed(2)}</td>
                                    <td class="${p.stock <= (p.stockMin || 5) ? 'stock-bajo' : ''}">${p.stock} ${p.unidad || 'UN'}</td>
                                    <td>${p.bloque || '-'}/${p.estante || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
    }

    function exportarExcel() {
        if(productos.length === 0) return mostrarToast("No hay datos para exportar");
        
        const headers = ["ID", "Nombre", "Categoria", "Costo", "Venta", "Stock", "Unidad", "Min", "Max", "Ubicacion", "Barcode"];
        const rows = productos.map(p => [
            p.id, p.nombre, p.categoria || "GENERAL", p.costo, p.precio, p.stock, p.unidad || "UN", p.stockMin, p.stockMax || "", `"${p.bloque || ""}-${p.estante || ""}"`, p.barcode || ""
        ]);
        
        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "n"
            + rows.map(e => e.join(",")).join("n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `inventario_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        mostrarToast("Archivo CSV generado", "ok");
    }

    function abrirModalEtiquetas() {
        let html = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter">Imprimir Etiquetas</h3>
                <div class="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase">Códigos de Barras</div>
            </div>
            
            <div class="space-y-6">
                <div class="relative">
                    <i class="ph-bold ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="text" oninput="buscarProductoEtiquetas(this.value)" placeholder="Buscar producto..." 
                        class="w-full bg-slate-50 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold border border-transparent focus:border-blue-500 outline-none">
                    <div id="etiquetas-results" class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-60 overflow-y-auto z-50 hidden custom-scrollbar"></div>
                </div>

                <div id="etiqueta-config" class="hidden bg-blue-50/50 p-6 rounded-3xl border border-blue-100 animate-in fade-in slide-in-from-top-2">
                    <p id="et-prod-nombre" class="text-sm font-black text-slate-800 uppercase mb-4 text-center"></p>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Cantidad de Copias</label>
                            <input type="number" id="et-cantidad" value="1" min="1" 
                                class="w-full bg-white rounded-2xl px-4 py-4 text-lg font-black text-slate-800 border border-transparent focus:border-blue-500 outline-none">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase ml-2">Tamaño</label>
                            <select id="et-tamano" class="w-full bg-white rounded-2xl px-4 py-4 text-sm font-black text-slate-800 border border-transparent focus:border-blue-500 outline-none">
                                <option value="small">Pequeño (38x25mm)</option>
                                <option value="medium">Mediano (50x30mm)</option>
                                <option value="large">Grande (100x50mm)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4 pt-4 border-t border-slate-100">
                    <button id="et-print-btn" disabled onclick="generarImpresionEtiquetas()" class="flex-1 bg-blue-600 disabled:bg-slate-200 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-blue-100 transition-all active:scale-95">Generar Etiquetas</button>
                    <button onclick="toggleModalDesktop(false)" class="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-xs active:scale-95">Cancelar</button>
                </div>
            </div>
            <input type="hidden" id="et-prod-id">
        `;
        document.getElementById('modal-inner-html').innerHTML = html;
        toggleModalDesktop(true);
    }

    function buscarProductoEtiquetas(q) {
        const resDiv = document.getElementById('etiquetas-results');
        if(!q || q.length < 2) { resDiv.classList.add('hidden'); return; }
        const query = q.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "");
        const filtrados = productos.filter(p => p.nombre.toLowerCase().normalize("NFD").replace(/[u0300-u036f]/g, "").includes(query)).slice(0, 5);
        if(filtrados.length > 0) {
            resDiv.innerHTML = filtrados.map(p => `
                <div onclick="seleccionarProductoEtiqueta('${p.id}')" class="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center">
                    <div>
                        <p class="text-sm font-black text-slate-800 uppercase">${p.nombre}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase">${p.barcode || 'SIN CÓDIGO'}</p>
                    </div>
                </div>
            `).join('');
            resDiv.classList.remove('hidden');
        } else { resDiv.classList.add('hidden'); }
    }

    function seleccionarProductoEtiqueta(id) {
        const p = productos.find(x => String(x.id) === String(id));
        if(!p) return;
        document.getElementById('et-prod-id').value = id;
        document.getElementById('et-prod-nombre').innerText = p.nombre;
        document.getElementById('etiquetas-results').classList.add('hidden');
        document.getElementById('etiqueta-config').classList.remove('hidden');
        document.getElementById('et-print-btn').disabled = false;
    }

    function generarImpresionEtiquetas() {
        const id = document.getElementById('et-prod-id').value;
        const cant = parseInt(document.getElementById('et-cantidad').value) || 1;
        const p = productos.find(x => String(x.id) === String(id));
        if(!p) return;

        let printWindow = window.open('', '_blank');
        const labels = Array(cant).fill(0).map(() => `
            <div class="label">
                <div class="name">${p.nombre}</div>
                <div class="price">$${parseFloat(p.precio).toFixed(2)}</div>
                <div class="barcode">${p.barcode || p.id}</div>
                <div class="code">${p.barcode || p.id}</div>
            </div>
        `).join('');

        const html = `
            <html>
                <head>
                    <style>
                        body { margin: 0; padding: 10px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
                        .label { border: 1px solid #ccc; width: 150px; height: 100px; padding: 10px; text-align: center; font-family: sans-serif; display: flex; flex-direction: column; justify-content: space-between; }
                        .name { font-size: 10px; font-weight: bold; overflow: hidden; height: 25px; text-transform: uppercase; }
                        .price { font-size: 14px; font-weight: 900; }
                        .barcode { font-family: 'Libre Barcode 39', cursive; font-size: 30px; }
                        .code { font-size: 8px; color: #666; }
                        @media print { .label { break-inside: avoid; } }
                    </style>
                    <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
                </head>
                <body>${labels}</body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 1000);
    }

    function seleccionarProductoEntrada(id) {
        const p = productos.find(x => String(x.id) === String(id));
        if(!p) return;
        
        document.getElementById('ent-prod-id').value = p.id;
        document.getElementById('ent-prod-nombre').innerText = p.nombre;
        document.getElementById('ent-prod-stock').innerText = `Stock Actual: ${p.stock} ${p.unidad || 'UN'}`;
        document.getElementById('ent-costo').value = p.costo || "";
        
        document.getElementById('ent-search').value = "";
        document.getElementById('ent-results').classList.add('hidden');
        document.getElementById('ent-prod-info').classList.remove('hidden');
        document.getElementById('ent-submit-btn').disabled = false;
        document.getElementById('ent-cantidad').focus();
    }

    function limpiarSeleccionEntrada() {
        document.getElementById('ent-prod-id').value = "";
        document.getElementById('ent-prod-info').classList.add('hidden');
        document.getElementById('ent-submit-btn').disabled = true;
    }

    async function procesarEntradaStockDesktop(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        if(!data.id || !data.cantidad || data.cantidad <= 0) return mostrarToast("Datos incompletos");
        
        mostrarToast("Procesando entrada...", "info");
        const res = await api({
            accion: "entradaStock",
            id: data.id,
            cantidad: data.cantidad,
            costo: data.costo,
            notas: data.notas || "Entrada desde Desktop"
        });
        
        if(res && res.ok) {
            toggleModalDesktop(false);
            mostrarToast("Stock actualizado correctamente", "ok");
            cargarDatosIniciales();
        } else {
            mostrarToast("Error al procesar entrada");
        }
    }

    function renderComprasDesktop() {
        const panelTransito = document.getElementById('lista-transito-desktop');
        const panelDeudas = document.getElementById('lista-cuentas-pagar-desktop');
        const kpiTotal = document.getElementById('compras-kpi-total');
        const kpiPagar = document.getElementById('compras-kpi-por-pagar');

        if (!panelTransito || !panelDeudas) return;

        const compras = (movimientos || []).filter(m => m.tipo === "PEDIDO_COMPRA");
        
        // KPIs
        let totalComprado = 0;
        let porPagar = 0;

        compras.forEach(c => {
            const monto = parseFloat(c.montoTotal || 0);
            totalComprado += monto;
            if (c.estado === "PENDIENTE_PAGO" || (c.estado === "RECIBIDO" && c.metodo === "CREDITO")) {
                const parts = (c.vencimiento || "").split('|');
                const saldoActual = parts[1] !== undefined ? parseFloat(parts[1]) : (c.saldo !== undefined ? c.saldo : monto);
                porPagar += saldoActual;
            }
        });
        
        if (kpiTotal) kpiTotal.innerText = '$' + totalComprado.toLocaleString('en-US', {minimumFractionDigits: 2});
        if (kpiPagar) kpiPagar.innerText = '$' + porPagar.toLocaleString('en-US', {minimumFractionDigits: 2});

        // Chart.js - Top 3 Productos
        try {
            renderComprasChart(compras);
        } catch(e) { console.error("Error en gráfica compras:", e); }

        // Panel En Tránsito
        const enTransito = compras.filter(c => c.estado === "TRANSITO");
        panelTransito.innerHTML = enTransito.length ? enTransito.map(c => `
            <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <p class="text-[10px] font-black text-blue-600 uppercase">#${c.id}</p>
                        <h5 class="text-xs font-black text-slate-800 uppercase truncate max-w-[150px]">${c.proveedor || 'S/P'}</h5>
                    </div>
                    <span class="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[9px] font-black uppercase italic">En Tránsito</span>
                </div>
                <div class="space-y-1 mb-4">
                    ${(c.items || []).slice(0, 2).map(it => `
                        <p class="text-[9px] font-bold text-slate-500 uppercase truncate">• ${it.cantidad}x ${it.nombre}</p>
                    `).join('')}
                    ${c.items && c.items.length > 2 ? `<p class="text-[9px] font-bold text-slate-300 uppercase italic">+ ${c.items.length - 2} más...</p>` : ''}
                </div>
                <div class="flex justify-between items-center pt-4 border-t border-slate-50">
                    <p class="text-sm font-black text-slate-800">$${parseFloat(c.montoTotal).toFixed(2)}</p>
                    <div class="flex gap-2">
                        <button onclick="imprimirOrdenCompraDesktop('${c.id}')" class="p-2 text-slate-400 hover:text-blue-600 transition-all"><i class="ph-bold ph-printer"></i></button>
                        <button onclick="recibirPedidoDesktop('${c.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-blue-700 transition-all">Recibir</button>
                    </div>
                </div>
            </div>
        `).join('') : '<p class="text-[10px] font-bold text-slate-400 uppercase italic text-center py-8">No hay pedidos en tránsito</p>';

        // Panel Cuentas por Pagar
        const hoy = new Date();
        const deudas = compras.filter(c => c.estado === "PENDIENTE_PAGO" || (c.estado === "RECIBIDO" && c.metodo === "CREDITO"));
        panelDeudas.innerHTML = deudas.length ? deudas.map(c => {
            // Extraer saldo de vencimiento si existe (Formato: FECHA|SALDO)
            const parts = (c.vencimiento || "").split('|');
            const fechaVenc = parts[0] || 'N/A';
            const saldoPersistido = parts[1] !== undefined ? parseFloat(parts[1]) : undefined;
            
            const esVencida = fechaVenc !== 'N/A' && new Date(fechaVenc) < hoy;
            const saldoActual = saldoPersistido !== undefined ? saldoPersistido : (c.saldo !== undefined ? c.saldo : c.montoTotal);

            return `
                <div class="bg-white p-5 rounded-3xl border ${esVencida ? 'border-red-200 bg-red-50/10' : 'border-slate-100'} shadow-sm hover:shadow-md transition-all">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-[10px] font-black text-amber-600 uppercase">FACTURA #${c.id}</p>
                            <h5 class="text-xs font-black text-slate-800 uppercase truncate max-w-[150px]">${c.proveedor || 'S/P'}</h5>
                        </div>
                        <span class="${esVencida ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'} px-3 py-1 rounded-full text-[9px] font-black uppercase italic">
                            ${esVencida ? 'VENCIDA' : 'PENDIENTE'}
                        </span>
                    </div>
                    <div class="flex items-center gap-2 mb-4">
                        <i class="ph-bold ph-calendar text-slate-400"></i>
                        <p class="text-[9px] font-bold text-slate-500 uppercase">Vence: ${fechaVenc}</p>
                    </div>
                    <div class="flex justify-between items-center pt-4 border-t border-slate-50">
                        <div>
                            <p class="text-[10px] font-black text-blue-600 uppercase leading-none mb-1">Saldo Pendiente</p>
                            <p class="text-sm font-black text-blue-700">$${parseFloat(saldoActual).toFixed(2)}</p>
                            <p class="text-[9px] font-bold text-slate-400 uppercase mt-1">Total: $${parseFloat(c.montoTotal).toFixed(2)}</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="abrirModalAbonoCompra('${c.id}')" class="bg-blue-600 text-white px-3 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-blue-700 transition-all">Abonar</button>
                            <button onclick="pagarFacturaProvDesktop('${c.id}')" class="bg-slate-800 text-white px-3 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-slate-900 transition-all">Liquidar</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('') : '<p class="text-[10px] font-bold text-slate-400 uppercase italic text-center py-8">No hay cuentas por pagar</p>';

        renderHistorialComprasDesktop();
    }

    function renderComprasChart(compras) {
        const ctx = document.getElementById('compras-chart-desktop');
        if (!ctx) return;

        // Contar productos más comprados
        const conteo = {};
        compras.forEach(c => {
            (c.items || []).forEach(it => {
                const nombre = it.nombre || "Producto Desconocido";
                conteo[nombre] = (conteo[nombre] || 0) + parseFloat(it.cantidad || 0);
            });
        });

        const top3 = Object.entries(conteo)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const container = ctx.parentNode;
        if (comprasChartInstance) comprasChartInstance.destroy();

        if (top3.length === 0) {
            container.innerHTML = `
                <div class="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                    <i class="ph-bold ph-chart-bar text-4xl mb-2 opacity-20"></i>
                    <p class="text-[9px] font-black uppercase italic tracking-widest opacity-50">Sin datos de compras</p>
                </div>
                <canvas id="compras-chart-desktop"></canvas>
            `;
            return;
        }

        // Si regresamos de un estado vacío, asegurar que el canvas existe
        if (!document.getElementById('compras-chart-desktop')) {
             container.innerHTML = '<canvas id="compras-chart-desktop"></canvas>';
        }
        const activeCtx = document.getElementById('compras-chart-desktop');
        const labels = top3.map(x => x[0].length > 15 ? x[0].substring(0, 15) + '...' : x[0]);
        const values = top3.map(x => x[1]);

        const chartCtx = activeCtx.getContext('2d');
        const gradient = chartCtx.createLinearGradient(0, 0, 400, 0);
        gradient.addColorStop(0, '#2563eb');
        gradient.addColorStop(1, '#60a5fa');

        comprasChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Unidades',
                    data: values,
                    backgroundColor: gradient,
                    hoverBackgroundColor: '#1d4ed8',
                    borderRadius: 12,
                    barThickness: 24,
                    maxBarThickness: 30
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleFont: { size: 11, weight: 'bold', family: 'Inter' },
                        bodyFont: { size: 10, family: 'Inter' },
                        padding: 12,
                        cornerRadius: 12,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { display: false },
                        ticks: { display: false }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 10, weight: '900', family: 'Inter' },
                            color: '#475569',
                            padding: 10
                        }
                    }
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    // --- NUEVAS FUNCIONES DE COMPRAS ---

    function renderHistorialComprasDesktop() {
        const tbody = document.getElementById('lista-historial-compras-desktop');
        if (!tbody) return;

        const desde = document.getElementById('filtro-compras-desde-desktop').value;
        const hasta = document.getElementById('filtro-compras-hasta-desktop').value;

        let filtrados = movimientos.filter(m => m.tipo === "PEDIDO_COMPRA");

        if (desde) filtrados = filtrados.filter(f => new Date(f.fechaISO || f.fecha) >= new Date(desde));
        if (hasta) filtrados = filtrados.filter(f => new Date(f.fechaISO || f.fecha) <= new Date(hasta + 'T23:59:59'));

        // KPIs del historial
        const totalGastado = filtrados.reduce((acc, c) => acc + parseFloat(c.montoTotal || 0), 0);
        document.getElementById('hist-compras-ordenes-desktop').innerText = filtrados.length;
        document.getElementById('hist-compras-total-desktop').innerText = '$' + totalGastado.toLocaleString('en-US', {minimumFractionDigits: 2});

        tbody.innerHTML = filtrados.map(c => {
            let badgeClass = "bg-slate-100 text-slate-600";
            if (c.estado === "RECIBIDO" || c.estado === "PAGADO") badgeClass = "bg-green-100 text-green-600";
            if (c.estado === "TRANSITO") badgeClass = "bg-blue-100 text-blue-600";
            if (c.estado === "PENDIENTE_PAGO") badgeClass = "bg-amber-100 text-amber-600";
            if (c.estado === "ANULADO") badgeClass = "bg-red-100 text-red-600";

            return `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-8 py-4 font-black text-blue-600 text-[10px]">#${c.id}</td>
                    <td class="px-8 py-4 text-[10px] text-slate-500 font-bold">${c.fecha}</td>
                    <td class="px-8 py-4 text-[10px] text-slate-800 font-black uppercase truncate max-w-[150px]">${c.proveedor || 'S/P'}</td>
                    <td class="px-8 py-4">
                        <span class="${badgeClass} px-3 py-1 rounded-full text-[9px] font-black uppercase italic">${c.estado}</span>
                    </td>
                    <td class="px-8 py-4 text-xs font-black text-slate-800">$${parseFloat(c.montoTotal).toFixed(2)}</td>
                    <td class="px-8 py-4 text-center">
                        <button onclick="verDetalleCompraDesktop('${c.id}')" class="text-slate-400 hover:text-blue-600 transition-all">
                            <i class="ph-bold ph-eye text-lg"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function recibirPedidoDesktop(id) {
        const pedido = movimientos.find(m => String(m.id) === String(id));
        if (!pedido) return;

        pedidoActualRecibir = JSON.parse(JSON.stringify(pedido));
        
        const content = `
            <div class="space-y-6">
                <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                    <div>
                        <p class="text-[10px] font-black text-slate-400 uppercase">Recibiendo Pedido</p>
                        <h4 class="text-lg font-black text-slate-800 uppercase">#${pedido.id}</h4>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black text-slate-400 uppercase">Proveedor</p>
                        <p class="text-sm font-black text-blue-600 uppercase">${pedido.proveedor}</p>
                    </div>
                </div>

                <div class="max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    <table class="w-full">
                        <thead class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <tr>
                                <th class="text-left pb-4">Producto</th>
                                <th class="text-center pb-4">Pedida</th>
                                <th class="text-center pb-4">Costo Unit.</th>
                                <th class="text-center pb-4">Recibida</th>
                                <th class="text-right pb-4">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${pedidoActualRecibir.items.map((it, idx) => {
                                const costoOriginal = it.costo || it.precio || 0;
                                const cantRecibida = it.cantidadRecibida !== undefined ? it.cantidadRecibida : it.cantidad;
                                return `
                                <tr>
                                    <td class="py-4">
                                        <p class="text-[10px] font-black text-slate-800 uppercase">${it.nombre}</p>
                                        <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">BC: ${it.barcode || '---'}</p>
                                    </td>
                                    <td class="py-4 text-center">
                                        <span class="bg-slate-100 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-500 shadow-sm">${it.cantidad}</span>
                                    </td>
                                    <td class="py-4 text-center">
                                        <div class="relative inline-block">
                                            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">$</span>
                                            <input type="number" step="0.01" value="${costoOriginal}" 
                                                onchange="actualizarMontoRecibidoDesktop(${idx}, 'costo', this.value)"
                                                class="w-24 bg-slate-50 border border-transparent focus:border-blue-500 rounded-xl pl-5 pr-2 py-2 text-center text-[10px] font-black text-blue-600 outline-none transition-all shadow-inner">
                                        </div>
                                    </td>
                                    <td class="py-4 text-center">
                                        <input type="number" step="0.01" value="${cantRecibida}" 
                                            onchange="actualizarMontoRecibidoDesktop(${idx}, 'cantidad', this.value)"
                                            class="w-20 bg-blue-50/50 border border-transparent focus:border-blue-500 rounded-xl px-2 py-2 text-center text-[10px] font-black text-blue-600 outline-none transition-all shadow-inner">
                                    </td>
                                    <td class="py-4 text-right">
                                        <p class="text-[11px] font-black text-slate-800 pr-2" id="subtotal-recibir-${idx}">$${(cantRecibida * costoOriginal).toFixed(2)}</p>
                                    </td>
                                </tr>
                            `;}).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="bg-slate-900 rounded-3xl p-6 flex justify-between items-center">
                    <div>
                        <p class="text-[9px] font-black text-slate-500 uppercase">Monto Original: <span class="line-through">$${parseFloat(pedido.montoTotal).toFixed(2)}</span></p>
                        <p class="text-xs font-black text-slate-300 uppercase mt-1 italic">Diferencia: <span id="diff-recepcion-desktop">$0.00</span></p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black text-blue-400 uppercase">Deuda Real a Cargar</p>
                        <p class="text-2xl font-black text-white tracking-tighter" id="total-recibir-desktop">$${parseFloat(pedido.montoTotal).toFixed(2)}</p>
                    </div>
                </div>

                <div class="flex gap-4">
                    <button onclick="anularPedidoEnTransitoDesktop('${pedido.id}')" 
                        class="flex-1 bg-red-50 text-red-600 py-4 rounded-2xl font-black uppercase text-xs hover:bg-red-100 transition-all">
                        Anular Pedido
                    </button>
                    <button onclick="confirmarRecepcionFinalDesktop()" 
                        class="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                        Confirmar Recepción y Cargar Stock
                    </button>
                </div>
            </div>
        `;

        document.getElementById('modal-inner-html').innerHTML = content;
        toggleModalDesktop(true, 'max-w-4xl');
        actualizarTotalRecibidoDesktop();
    }

    function actualizarMontoRecibidoDesktop(idx, campo, val) {
        if (!pedidoActualRecibir) return;
        const v = parseFloat(val) || 0;
        if (campo === 'costo') {
            pedidoActualRecibir.items[idx].costo = v;
            pedidoActualRecibir.items[idx].precio = v; // Mantener ambos por compatibilidad
        }
        if (campo === 'cantidad') pedidoActualRecibir.items[idx].cantidadRecibida = v;
        
        const it = pedidoActualRecibir.items[idx];
        const cant = it.cantidadRecibida !== undefined ? it.cantidadRecibida : it.cantidad;
        const sub = cant * (it.costo || it.precio || 0);
        
        const elSub = document.getElementById(`subtotal-recibir-${idx}`);
        if (elSub) elSub.innerText = '$' + sub.toFixed(2);
        
        actualizarTotalRecibidoDesktop();
    }

    function actualizarTotalRecibidoDesktop() {
        if (!pedidoActualRecibir) return;
        let total = 0;
        pedidoActualRecibir.items.forEach(it => {
            const cant = it.cantidadRecibida !== undefined ? it.cantidadRecibida : it.cantidad;
            total += cant * (it.costo || it.precio || 0);
        });
        pedidoActualRecibir.montoTotal = total;
        
        const elTotal = document.getElementById('total-recibir-desktop');
        if (elTotal) elTotal.innerText = '$' + total.toLocaleString('en-US', {minimumFractionDigits: 2});
        
        const original = movimientos.find(m => String(m.id) === String(pedidoActualRecibir.id))?.montoTotal || 0;
        const diff = total - original;
        const elDiff = document.getElementById('diff-recepcion-desktop');
        if (elDiff) {
            elDiff.innerText = (diff >= 0 ? '+' : '') + '$' + diff.toFixed(2);
            elDiff.className = diff < 0 ? 'text-green-400' : (diff > 0 ? 'text-red-400' : 'text-slate-300');
        }
    }

    async function confirmarRecepcionFinalDesktop() {
        if (!window.licenciaActiva) {
            if (typeof Swal !== 'undefined') Swal.fire('Acceso Restringido', 'Tu licencia ha expirado. Renueva para recibir compras.', 'warning');
            return;
        }
        if (!pedidoActualRecibir) return;
        mostrarLoading(true, "Procesando recepción...");

        try {
            // 1. Actualizar Stock y Costos
            for (let it of pedidoActualRecibir.items) {
                const cantReal = it.cantidadRecibida !== undefined ? it.cantidadRecibida : it.cantidad;
                if (cantReal > 0) {
                    const p = productos.find(x => String(x.id) === String(it.id));
                    if (p) {
                        p.stock += cantReal;
                        if (it.precio > 0) p.costo = it.precio;
                        await api({ accion: "actualizarStock", id: p.id, cantidad: cantReal, costo: it.precio });
                    }
                }
            }

            // 2. Cambiar estado del pedido
            const nuevoEstado = pedidoActualRecibir.metodo === "CREDITO" ? "PENDIENTE_PAGO" : "RECIBIDO";
            pedidoActualRecibir.estado = nuevoEstado;
            
            // Inicializar saldo si es crédito (Persistencia via vencimiento)
            if (nuevoEstado === "PENDIENTE_PAGO") {
                const fechaBase = (pedidoActualRecibir.vencimiento || "").split('|')[0];
                pedidoActualRecibir.saldo = pedidoActualRecibir.montoTotal;
                pedidoActualRecibir.vencimiento = `${fechaBase}|${pedidoActualRecibir.montoTotal}`;
            }
            
            // 3. Guardar movimiento actualizado (Stringify el objeto!)
            const res = await api({ accion: "guardarMovimiento", movimiento: JSON.stringify(pedidoActualRecibir) });
            if (res.ok) {
                mostrarToast("Recepción confirmada correctamente", "ok");
                await cargarDatosIniciales();
                toggleModalDesktop(false);
            } else {
                mostrarToast("Error: " + res.error);
            }
        } catch (e) {
            mostrarToast("Error fatal en recepción");
        } finally {
            mostrarLoading(false);
        }
    }

    async function anularPedidoEnTransitoDesktop(id) {
        if (!window.licenciaActiva) {
            if (typeof Swal !== 'undefined') Swal.fire('Acceso Restringido', 'Tu licencia ha expirado. Renueva para anular compras.', 'warning');
            return;
        }
        if (!confirm("¿Seguro que deseas ANULAR este pedido? Esta acción no se puede deshacer.")) return;
        
        mostrarLoading(true, "Anulando...");
        const pedido = movimientos.find(m => String(m.id) === String(id));
        if (pedido) {
            pedido.estado = "ANULADO";
            const res = await api({ accion: "guardarMovimiento", movimiento: JSON.stringify(pedido) });
            if (res.ok) {
                mostrarToast("Pedido anulado");
                await cargarDatosIniciales();
                toggleModalDesktop(false);
            }
        }
        mostrarLoading(false);
    }

    async function pagarFacturaProvDesktop(id) {
        if (!confirm("¿Confirmas que deseas LIQUIDAR la deuda total de esta factura?")) return;
        
        mostrarLoading(true, "Liquidando deuda...");
        const pedido = movimientos.find(m => String(m.id) === String(id));
        if (pedido) {
            const fechaBase = (pedido.vencimiento || "").split('|')[0];
            pedido.estado = "PAGADO";
            pedido.saldo = 0; 
            pedido.vencimiento = `${fechaBase}|0`; // Persistir saldo 0
            
            const res = await api({ accion: "guardarMovimiento", movimiento: JSON.stringify(pedido) });
            if (res.ok) {
                mostrarToast("Deuda liquidada correctamente", "ok");
                await cargarDatosIniciales();
            }
        }
        mostrarLoading(false);
    }

    function abrirModalAbonoCompra(id) {
        const c = movimientos.find(m => String(m.id) === String(id));
        if (!c) return;

        // Extraer saldo persistido
        const parts = (c.vencimiento || "").split('|');
        const saldoPersistido = parts[1] !== undefined ? parseFloat(parts[1]) : undefined;
        const saldoActual = saldoPersistido !== undefined ? saldoPersistido : (c.saldo !== undefined ? c.saldo : c.montoTotal);
        const totalFactura = parseFloat(c.montoTotal) || 0;

        const content = `
            <div class="space-y-6">
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="ph-bold ph-hand-coins text-2xl text-blue-600"></i>
                    </div>
                    <h4 class="text-xl font-black text-slate-800 uppercase tracking-tighter">Registrar Abono</h4>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Factura #${c.id} - ${c.proveedor || 'S/P'}</p>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Monto Total</p>
                        <p class="text-lg font-black text-slate-800 tracking-tighter">$${parseFloat(c.montoTotal).toFixed(2)}</p>
                    </div>
                    <div class="bg-blue-50 p-4 rounded-3xl border border-blue-100">
                        <p class="text-[9px] font-black text-blue-400 uppercase mb-1">Saldo Pendiente</p>
                        <p class="text-lg font-black text-blue-600 tracking-tighter">$${parseFloat(saldoActual).toFixed(2)}</p>
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-[10px] font-black text-slate-400 uppercase ml-2">Monto a Abonar</label>
                    <div class="relative">
                        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-300">$</span>
                        <input type="number" id="monto-abono-compra" step="0.01" max="${saldoActual}" value="${saldoActual}"
                            class="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-3xl pl-10 pr-6 py-4 text-xl font-black text-slate-800 outline-none transition-all shadow-inner"
                            placeholder="0.00">
                    </div>
                </div>

                <div class="flex gap-3 pt-2">
                    <button onclick="toggleModalDesktop(false)" class="flex-1 py-4 rounded-3xl font-black uppercase text-xs text-slate-400 hover:bg-slate-50 transition-all">Cancelar</button>
                    <button onclick="confirmarAbonoCompra('${c.id}')" class="flex-[2] bg-blue-600 text-white py-4 rounded-3xl font-black uppercase text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                        <i class="ph-bold ph-check-circle"></i> Confirmar Abono
                    </button>
                </div>
            </div>
        `;

        document.getElementById('modal-inner-html').innerHTML = content;
        toggleModalDesktop(true, 'max-w-md');
        
        setTimeout(() => {
            const input = document.getElementById('monto-abono-compra');
            if (input) {
                input.focus();
                input.select();
            }
        }, 300);
    }

    async function confirmarAbonoCompra(id) {
        const input = document.getElementById('monto-abono-compra');
        const abono = parseFloat(input.value);
        
        if (isNaN(abono) || abono <= 0) {
            mostrarToast("Por favor ingresa un monto válido");
            return;
        }

        const c = movimientos.find(m => String(m.id) === String(id));
        if (!c) return;

        const saldoActual = parseFloat(c.saldo !== undefined ? c.saldo : c.montoTotal) || 0;

        if (abono > saldoActual + 0.05) {
            mostrarToast("El abono no puede superar el saldo pendiente");
            return;
        }

        mostrarLoading(true, "Registrando abono...");
        try {
            const parts = (c.vencimiento || "").split('|');
            const fechaBase = parts[0];
            const saldoPersistido = parts[1] !== undefined ? parseFloat(parts[1]) : undefined;
            const saldoActual = saldoPersistido !== undefined ? saldoPersistido : (c.saldo !== undefined ? c.saldo : c.montoTotal);

            const nuevoSaldo = Math.max(0, saldoActual - abono);
            c.saldo = nuevoSaldo;
            
            // Persistencia forzada en campo vencimiento
            c.vencimiento = `${fechaBase}|${nuevoSaldo.toFixed(2)}`;

            if (nuevoSaldo <= 0) {
                c.estado = "PAGADO";
            }

            const res = await api({ accion: "guardarMovimiento", movimiento: JSON.stringify(c) });
            if (res.ok) {
                mostrarToast(nuevoSaldo <= 0 ? "¡Deuda liquidada!" : "Abono registrado con éxito", "ok");
                await cargarDatosIniciales();
                toggleModalDesktop(false);
            }
        } catch (e) {
            mostrarToast("Error al registrar abono");
        } finally {
            mostrarLoading(false);
        }
    }

    function verDetalleCompraDesktop(id) {
        const c = movimientos.find(m => String(m.id) === String(id));
        if (!c) return;

        const content = `
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="text-xl font-black text-slate-800 uppercase tracking-tighter">Detalle de Operación</h4>
                        <p class="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Orden #${c.id}</p>
                    </div>
                    <span class="bg-blue-100 text-blue-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase italic shadow-sm">${c.estado}</span>
                </div>
                
                <div class="grid grid-cols-3 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Proveedor</p>
                        <p class="text-[11px] font-black text-slate-800 uppercase truncate">${c.proveedor || 'S/P'}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Fecha / Hora</p>
                        <p class="text-[11px] font-black text-slate-800 uppercase">${c.fecha}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Realizado por</p>
                        <p class="text-[11px] font-black text-blue-600 uppercase">${c.vendedor || 'ADMIN'}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Método de Pago</p>
                        <p class="text-[11px] font-black text-slate-800 uppercase">${c.metodo || 'EFECTIVO'}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Vencimiento</p>
                        <p class="text-[11px] font-black text-slate-800 uppercase">${(c.vencimiento || "").split('|')[0] || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Total USD</p>
                        <p class="text-[11px] font-black text-green-600 uppercase">$${parseFloat(c.montoTotal).toFixed(2)}</p>
                    </div>
                </div>

                <div class="border border-slate-100 rounded-3xl overflow-hidden bg-white shadow-sm">
                    <table class="w-full text-[10px]">
                        <thead class="bg-slate-50 font-black text-slate-400 uppercase border-b border-slate-100">
                            <tr>
                                <th class="px-6 py-4 text-left">Código / Barras</th>
                                <th class="px-6 py-4 text-left">Producto</th>
                                <th class="px-6 py-4 text-center">Cant</th>
                                <th class="px-6 py-4 text-right">Costo Unit.</th>
                                <th class="px-6 py-4 text-right">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50 font-bold text-slate-600">
                            ${(c.items || []).map(it => `
                                <tr class="hover:bg-slate-50/50 transition-colors">
                                    <td class="px-6 py-4 font-mono text-blue-600">${it.barcode || it.id || 'N/A'}</td>
                                    <td class="px-6 py-4 uppercase text-slate-800">${it.nombre}</td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="bg-slate-100 px-2 py-1 rounded-lg text-[9px]">${it.cantidad}</span>
                                    </td>
                                    <td class="px-6 py-4 text-right">$${parseFloat(it.costo || it.precio || 0).toFixed(2)}</td>
                                    <td class="px-6 py-4 text-right font-black text-slate-800">$${(it.cantidad * (it.costo || it.precio || 0)).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="flex justify-between items-center bg-slate-900 p-8 rounded-[40px] shadow-2xl">
                    <div>
                        <p class="text-[10px] font-black text-blue-400 uppercase tracking-widest">Resumen de Operación</p>
                        <p class="text-xs font-bold text-slate-500 uppercase mt-1 italic">Deducciones e impuestos incluidos</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black text-slate-400 uppercase mb-1">${c.metodo === 'CREDITO' ? 'Saldo Pendiente' : 'Monto Neto Pagado'}</p>
                        <p class="text-3xl font-black text-white tracking-tighter">$${parseFloat((c.vencimiento || "").split('|')[1] !== undefined ? (c.vencimiento || "").split('|')[1] : (c.saldo !== undefined ? c.saldo : c.montoTotal)).toFixed(2)}</p>
                    </div>
                </div>

                <div class="flex gap-4">
                    <button onclick="imprimirOrdenCompraDesktop('${c.id}')" class="flex-1 bg-slate-100 text-slate-700 py-4 rounded-3xl font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                        <i class="ph-bold ph-printer text-lg"></i> Imprimir Comprobante
                    </button>
                    ${c.estado === 'TRANSITO' ? `
                        <button onclick="recibirPedidoDesktop('${c.id}')" class="flex-[2] bg-blue-600 text-white py-4 rounded-3xl font-black uppercase text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                            Confirmar Recepción de Mercancía
                        </button>
                    ` : ''}
                    ${c.estado === 'PENDIENTE_PAGO' ? `
                        <button onclick="pagarFacturaProvDesktop('${c.id}')" class="flex-[2] bg-slate-800 text-white py-4 rounded-3xl font-black uppercase text-xs hover:bg-slate-900 transition-all">
                            Registrar Pago Pendiente
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        document.getElementById('modal-inner-html').innerHTML = content;
        toggleModalDesktop(true, 'max-w-4xl');
    }

    function imprimirOrdenCompraDesktop(id) {
        const c = movimientos.find(m => String(m.id) === String(id));
        if (!c) return;

        const html = `
            <div style="padding: 40px; font-family: sans-serif; color: #1e293b;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
                    <div>
                        <h1 style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #0f172a;">VÉNDELO+ CRM</h1>
                        <p style="margin: 5px 0 0; font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase;">Orden de Compra Profesional</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0; font-size: 24px; font-weight: 900; color: #2563eb;">#${c.id}</h2>
                        <p style="margin: 5px 0 0; font-size: 12px; font-weight: 800; color: #64748b;">FECHA: ${c.fecha}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
                    <div style="background: #f8fafc; padding: 20px; border-radius: 20px;">
                        <p style="margin: 0 0 10px; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase;">Proveedor</p>
                        <p style="margin: 0; font-size: 16px; font-weight: 900; color: #1e293b; text-transform: uppercase;">${c.proveedor || 'S/P'}</p>
                    </div>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 20px;">
                        <p style="margin: 0 0 10px; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase;">Condiciones</p>
                        <p style="margin: 0; font-size: 16px; font-weight: 900; color: #1e293b; text-transform: uppercase;">MÉTODO: ${c.metodo || 'EFECTIVO'}</p>
                        ${c.vencimiento ? `<p style="margin: 5px 0 0; font-size: 12px; font-weight: 800; color: #ef4444;">VENCE: ${c.vencimiento}</p>` : ''}
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 15px; text-align: left; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">Producto</th>
                            <th style="padding: 15px; text-align: center; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">Cant.</th>
                            <th style="padding: 15px; text-align: right; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">P. Unit.</th>
                            <th style="padding: 15px; text-align: right; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody style="font-size: 12px; font-weight: 800;">
                        ${(c.items || []).map(it => {
                            const costo = it.costo || it.precio || 0;
                            return `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 15px; text-transform: uppercase; color: #334155;">${it.nombre}</td>
                                <td style="padding: 15px; text-align: center; color: #334155;">${it.cantidad}</td>
                                <td style="padding: 15px; text-align: right; color: #334155;">$${parseFloat(costo).toFixed(2)}</td>
                                <td style="padding: 15px; text-align: right; color: #0f172a;">$${(it.cantidad * costo).toFixed(2)}</td>
                            </tr>
                        `;}).join('')}
                    </tbody>
                </table>

                <div style="display: flex; justify-content: flex-end; margin-top: 40px;">
                    <div style="background: #0f172a; color: white; padding: 30px 50px; border-radius: 30px; text-align: right;">
                        <p style="margin: 0; font-size: 12px; font-weight: 900; color: #3b82f6; text-transform: uppercase; margin-bottom: 5px;">Total a Pagar</p>
                        <p style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px;">$${parseFloat(c.montoTotal).toFixed(2)}</p>
                    </div>
                </div>

                <div style="margin-top: 100px; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; text-align: center;">
                    <div>
                        <div style="border-top: 2px solid #cbd5e1; padding-top: 10px;">
                            <p style="margin: 0; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">Firma Autorizada</p>
                        </div>
                    </div>
                    <div>
                        <div style="border-top: 2px solid #cbd5e1; padding-top: 10px;">
                            <p style="margin: 0; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">Firma Recibido</p>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 60px; text-align: center; color: #94a3b8; font-size: 9px; font-weight: 800; text-transform: uppercase;">
                    <p>Generado por Véndelo+ CRM — ${new Date().toLocaleString()}</p>
                </div>
            </div>
        `;

        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Orden de Compra #${c.id}</title></head><body>${html}</body></html>`);
        win.document.close();
        setTimeout(() => {
            win.print();
            win.close();
        }, 500);
    }

    function imprimirHistorialComprasDesktop() {
        const desde = document.getElementById('filtro-compras-desde-desktop').value || 'INICIO';
        const hasta = document.getElementById('filtro-compras-hasta-desktop').value || 'HOY';
        
        let filtrados = movimientos.filter(m => m.tipo === "PEDIDO_COMPRA");
        if (desde !== 'INICIO') filtrados = filtrados.filter(f => new Date(f.fechaISO || f.fecha) >= new Date(desde));
        if (hasta !== 'HOY') filtrados = filtrados.filter(f => new Date(f.fechaISO || f.fecha) <= new Date(hasta + 'T23:59:59'));

        const total = filtrados.reduce((acc, c) => acc + parseFloat(c.montoTotal || 0), 0);

        const html = `
            <div style="padding: 30px; font-family: sans-serif;">
                <h1 style="text-align: center; font-weight: 900; color: #0f172a; margin-bottom: 5px;">REPORTE DE COMPRAS</h1>
                <p style="text-align: center; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 30px;">PERIODO: ${desde} AL ${hasta}</p>
                
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f1f5f9; text-align: left; font-size: 9px; font-weight: 900; text-transform: uppercase;">
                            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Fecha</th>
                            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">ID</th>
                            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Proveedor</th>
                            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Estado</th>
                            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody style="font-size: 10px; font-weight: 700;">
                        ${filtrados.map(c => `
                            <tr>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">${c.fecha}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">#${c.id}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-transform: uppercase;">${c.proveedor}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-transform: uppercase;">${c.estado}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">$${parseFloat(c.montoTotal).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div style="margin-top: 30px; text-align: right;">
                    <p style="font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase; margin: 0;">Total Comprado en Periodo</p>
                    <p style="font-size: 24px; font-weight: 900; color: #0f172a; margin: 0;">$${total.toFixed(2)}</p>
                </div>
            </div>
        `;

        const win = window.open('', '_blank');
        win.document.write(`<html><body>${html}</body></html>`);
        win.document.close();
        win.print();
        win.close();
    }

    function prepararTicket(venta) {
        const elId = document.getElementById('print-invoice-id');
        if(elId) elId.innerText = '#' + venta.id;
        const elDate = document.getElementById('print-date');
        if(elDate) elDate.innerText = venta.fecha;
        const elTotal = document.getElementById('print-total');
        if(elTotal) elTotal.innerText = '$' + parseFloat(venta.montoTotal).toFixed(2);


        const itemsContainer = document.getElementById('print-items');
        if(itemsContainer) {
            itemsContainer.innerHTML = venta.items.map(i => `
                <div class="flex justify-between py-1 text-[10px]">
                    <span>${i.cantidad}x ${i.nombre.substring(0, 20)}</span>
                    <span>$${parseFloat(i.subtotal).toFixed(2)}</span>
                </div>
            `).join('');
        }
    }
    function cambiarFechaCaja(delta) {
        const input = document.getElementById('caja-fecha');
        if(!input.value) input.value = new Date().toISOString().split('T')[0];
        
        let d = new Date(input.value + "T00:00:00");
        d.setDate(d.getDate() + delta);
        const newDate = d.toISOString().split('T')[0];
        input.value = newDate;
        renderControlCaja(newDate);
    }

    let chartCajaInstance = null;

    function renderControlCaja(fechaStr) {
        if(!fechaStr) {
            fechaStr = new Date().toISOString().split('T')[0];
            document.getElementById('caja-fecha').value = fechaStr;
        }

        const [y, m, d] = fechaStr.split('-').map(Number);
        const targetDateString = new Date(y, m - 1, d).toDateString();
        const pad = (n) => n.toString().padStart(2, '0');
        // Regex para detectar la fecha en el string "fecha" (soporta D/M/YYYY y M/D/YYYY)
        const regexFecha = new RegExp(`^(${d}/${m}/${y}|${m}/${d}/${y}|${pad(d)}/${pad(m)}/${y}|${pad(m)}/${pad(d)}/${y})`);

        const ventasDelDia = ventas.filter(v => {
            if (v.timestamp) {
                return new Date(v.timestamp).toDateString() === targetDateString;
            }
            if (v.id && v.id.length > 10) {
                return new Date(parseInt(v.id)).toDateString() === targetDateString;
            }
            return v.fecha && regexFecha.test(v.fecha);
        });

        const resumen = {
            usd_efectivo: 0, usd_zelle: 0,
            ves_efectivo: 0, ves_transfer: 0, ves_pmovil: 0,
            credito: 0, total_usd: 0, total_bs: 0
        };

        const tablaBody = document.getElementById('caja-tabla-transacciones');
        tablaBody.innerHTML = '';

        ventasDelDia.forEach(v => {
            const totalUSD = parseFloat(v.montoTotal || v.totalUsd || v.total || 0);
            const totalVES = v.totalBs ? parseFloat(v.totalBs) : totalUSD * tasa;

            if (v.metodo !== 'CREDITO') {
                resumen.total_usd += totalUSD;
                resumen.total_bs += totalVES;
            }

            if (v.mixto) {
                try {
                    const mix = typeof v.mixto === 'string' ? JSON.parse(v.mixto) : v.mixto;
                    if (mix.usd) {
                        if (mix.usd.tipo === 'EFECTIVO') resumen.usd_efectivo += parseFloat(mix.usd.monto || 0);
                        else resumen.usd_zelle += parseFloat(mix.usd.monto || 0);
                    }
                    if (mix.ves) {
                        if (mix.ves.tipo === 'EFECTIVO') resumen.ves_efectivo += parseFloat(mix.ves.monto || 0);
                        else if (mix.ves.tipo === 'PAGO_MOVIL') resumen.ves_pmovil += parseFloat(mix.ves.monto || 0);
                        else resumen.ves_transfer += parseFloat(mix.ves.monto || 0);
                    }
                } catch(e) {}
            } else {
                if (v.metodo === 'EFECTIVO $') resumen.usd_efectivo += totalUSD;
                else if (v.metodo === 'ZELLE') resumen.usd_zelle += totalUSD;
                else if (v.metodo === 'EFECTIVO BS') resumen.ves_efectivo += totalVES;
                else if (v.metodo === 'TRANSFERENCIA') resumen.ves_transfer += totalVES;
                else if (v.metodo === 'PAGO MÓVIL' || v.metodo === 'PAGO MÓVIL') resumen.ves_pmovil += totalVES;
                else if (v.metodo === 'CREDITO') resumen.credito += totalUSD;
            }

            // Extraer hora del string fecha o del ID
            let hora = "00:00";
            if (v.fecha && v.fecha.includes(':')) {
                const parts = v.fecha.split(' ');
                hora = parts[parts.length - 1].substring(0, 5);
            } else if (v.id && v.id.length > 10) {
                hora = new Date(parseInt(v.id)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            const tr = document.createElement('tr');
            tr.className = "border-b border-slate-50 hover:bg-slate-50/50 transition-all";
            tr.innerHTML = `
                <td class="px-6 py-4 text-[10px] font-black text-slate-400">${hora}</td>
                <td class="px-6 py-4 text-xs font-bold text-slate-800 uppercase truncate max-w-[150px]">${v.cliente || 'GENERAL'}</td>
                <td class="px-6 py-4"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider">${v.metodo}</span></td>
                <td class="px-6 py-4 text-right text-xs font-black text-emerald-600">$${totalUSD.toFixed(2)}</td>
                <td class="px-6 py-4 text-right text-xs font-bold text-blue-600">Bs ${totalVES.toFixed(2)}</td>
            `;
            tablaBody.appendChild(tr);
        });

        if(ventasDelDia.length === 0) {
            tablaBody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400">No hay transacciones registradas en esta fecha</td></tr>';
        }

        // Actualizar KPIs
        document.getElementById('caja-total-usd').innerText = `$${resumen.total_usd.toFixed(2)}`;
        document.getElementById('caja-total-bs').innerText = `Bs ${resumen.total_bs.toFixed(2)}`;
        document.getElementById('caja-total-tx').innerText = ventasDelDia.length;
        const avg = ventasDelDia.length > 0 ? (resumen.total_usd / ventasDelDia.length) : 0;
        document.getElementById('caja-ticket-promedio').innerText = `$${avg.toFixed(2)}`;
        document.getElementById('caja-total-creditos').innerText = `$${resumen.credito.toFixed(2)}`;

        // Actualizar Paneles USD
        document.getElementById('caja-usd-efectivo').innerText = `$${resumen.usd_efectivo.toFixed(2)}`;
        document.getElementById('caja-usd-zelle').innerText = `$${resumen.usd_zelle.toFixed(2)}`;
        
        const totalUsdReal = resumen.usd_efectivo + resumen.usd_zelle;
        const pctUsdEfectivo = totalUsdReal > 0 ? (resumen.usd_efectivo / totalUsdReal) * 100 : 0;
        const pctUsdZelle = totalUsdReal > 0 ? (resumen.usd_zelle / totalUsdReal) * 100 : 0;
        
        document.getElementById('bar-usd-efectivo').style.width = `${pctUsdEfectivo}%`;
        document.getElementById('bar-usd-zelle').style.width = `${pctUsdZelle}%`;

        // Actualizar Paneles BS
        document.getElementById('caja-ves-efectivo').innerText = `Bs ${resumen.ves_efectivo.toFixed(2)}`;
        document.getElementById('caja-ves-transfer').innerText = `Bs ${resumen.ves_transfer.toFixed(2)}`;
        document.getElementById('caja-ves-pmovil').innerText = `Bs ${resumen.ves_pmovil.toFixed(2)}`;

        const totalVesReal = resumen.ves_efectivo + resumen.ves_transfer + resumen.ves_pmovil;
        const pctVesEfectivo = totalVesReal > 0 ? (resumen.ves_efectivo / totalVesReal) * 100 : 0;
        const pctVesTransfer = totalVesReal > 0 ? (resumen.ves_transfer / totalVesReal) * 100 : 0;
        const pctVesPmovil = totalVesReal > 0 ? (resumen.ves_pmovil / totalVesReal) * 100 : 0;

        document.getElementById('bar-ves-efectivo').style.width = `${pctVesEfectivo}%`;
        document.getElementById('bar-ves-transfer').style.width = `${pctVesTransfer}%`;
        document.getElementById('bar-ves-pmovil').style.width = `${pctVesPmovil}%`;

        actualizarGraficoCaja(resumen);
    }

    function actualizarGraficoCaja(resumen) {
        const ctx = document.getElementById('chart-caja').getContext('2d');
        
        const values = [
            resumen.usd_efectivo, 
            resumen.usd_zelle, 
            resumen.ves_efectivo / tasa, // Convertir a USD para comparar
            resumen.ves_transfer / tasa, 
            resumen.ves_pmovil / tasa
        ];

        const labels = ['Efectivo $', 'Zelle', 'Efectivo Bs', 'Transferencia', 'Pago Móvil'];
        const bgColors = ['#3b82f6', '#60a5fa', '#10b981', '#34d399', '#6ee7b7'];

        if (chartCajaInstance) {
            chartCajaInstance.destroy();
        }

        chartCajaInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: bgColors,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 6,
                            font: { size: 10, family: 'Inter', weight: 'bold' }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let val = context.raw || 0;
                                return ` $${val.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function imprimirCierreCaja() {
        window.print();
    }


    // ===== DRAG AND DROP SIDEBAR (PREMIUM FEATURE) =====
    function initDragAndDrop() {
        const nav = document.getElementById('sidebar-nav');
        if(!nav) return;
        
        // Cargar orden guardado
        const orderStr = localStorage.getItem('vendelo_sidebar_order');
        if (orderStr) {
            try {
                const order = JSON.parse(orderStr);
                order.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.parentElement === nav) nav.appendChild(el);
                });
            } catch(e) { console.error("Error cargando orden:", e); }
        }

        let draggedItem = null;

        nav.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.sidebar-link[draggable="true"]');
            if (!item) return;
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        nav.addEventListener('dragend', (e) => {
            if (draggedItem) draggedItem.classList.remove('dragging');
            nav.querySelectorAll('.sidebar-link').forEach(i => i.classList.remove('drag-over'));
            draggedItem = null;
            
            // Persistir orden
            const ids = Array.from(nav.querySelectorAll('.sidebar-link')).map(el => el.id).filter(id => id);
            localStorage.setItem('vendelo_sidebar_order', JSON.stringify(ids));
        });

        nav.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target.closest('.sidebar-link[draggable="true"]');
            if (target && target !== draggedItem) {
                nav.querySelectorAll('.sidebar-link').forEach(i => i.classList.remove('drag-over'));
                target.classList.add('drag-over');
            }
        });

        nav.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = e.target.closest('.sidebar-link');
            if (target && draggedItem && target !== draggedItem) {
                const rect = target.getBoundingClientRect();
                const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
                nav.insertBefore(draggedItem, next ? target.nextSibling : target);
            }
        });
    }

    function toggleSidebar() {
        const sidebar = document.getElementById('main-sidebar');
        const icon = document.getElementById('sidebar-toggle-icon');
        sidebar.classList.toggle('sidebar-collapsed');
        
        if(sidebar.classList.contains('sidebar-collapsed')) {
            icon.classList.replace('ph-caret-left', 'ph-caret-right');
            localStorage.setItem('vendelo_sidebar_collapsed', 'true');
        } else {
            icon.classList.replace('ph-caret-right', 'ph-caret-left');
            localStorage.setItem('vendelo_sidebar_collapsed', 'false');
        }
    }

    // Restaurar estado del sidebar
    if(localStorage.getItem('vendelo_sidebar_collapsed') === 'true') {
        toggleSidebar();
    }

    function toggleAdminMenu(e) {
        if(e) e.stopPropagation();
        const dropdown = document.getElementById('admin-dropdown');
        const caret = document.getElementById('admin-caret');
        const isHidden = dropdown.classList.contains('hidden');
        
        // Cerrar otros si los hubiera
        dropdown.classList.toggle('hidden');
        if(!isHidden) {
            caret.classList.remove('rotate-180');
        } else {
            caret.classList.add('rotate-180');
        }
    }

    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('admin-dropdown');
        const container = document.querySelector('.user-info-container');
        if (dropdown && !dropdown.classList.contains('hidden') && !container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
            const caret = document.getElementById('admin-caret');
            if(caret) caret.classList.remove('rotate-180');
        }
    });

    // Funciones de configuración (Placeholders para futura implementación detallada)
    function abrirConfigEmpresa() {
        mostrarToast("Cargando Perfil de Empresa...", "info");
        // Aquí iría la lógica para abrir el modal de configuración de empresa
    }

    function abrirGestionUsuarios() {
        mostrarToast("Cargando Gestión de Usuarios...", "info");
    }

    function abrirConfigImpresion() {
        mostrarToast("Cargando Configuración de Impresión...", "info");
    }

    function abrirRespaldoDatos() {
        mostrarToast("Iniciando Respaldo de Base de Datos...", "info");
    }

    function logout() {
        if(confirm("¿Estás seguro que deseas cerrar sesión?")) {
            localStorage.clear();
            sessionStorage.clear();
            location.reload();
        }
    }

    // Funciones de Acceso Desktop (Integradas para paridad con Móvil)
    function mostrarRegistroDesktop() {
        document.getElementById('acceso-login').style.display = 'none';
        document.getElementById('acceso-registro').style.display = 'block';
    }

    function mostrarLoginDesktop() {
        document.getElementById('acceso-login').style.display = 'block';
        document.getElementById('acceso-registro').style.display = 'none';
    }

    async function iniciarSesionDesktop() {
        const btn = document.querySelector('#acceso-login .acceso-btn');
        if (btn && btn.disabled) return;

        try {
            const uEl = document.getElementById('login-usuario');
            const pEl = document.getElementById('login-pass');
            
            if(!uEl || !pEl) return;

            const u = uEl.value.trim().toLowerCase();
            const p = pEl.value.trim();

            if(!u || !p) {
                if (typeof Swal !== 'undefined') Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Ingresa usuario y contraseña' });
                else alert('Ingresa usuario y contraseña');
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.dataset.originalText = btn.innerHTML;
                btn.innerHTML = '<i class="ph ph-spinner animate-spin inline-block mr-2"></i> Cargando...';
                btn.style.opacity = '0.7';
                btn.style.cursor = 'not-allowed';
            }

            const idLimpio = u.split('@')[0];

            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Iniciando sesión...',
                    html: 'Conectando con tu base de datos',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });
            } else {
                console.log("Iniciando sesión...");
            }

            const url = `${MASTER_URL}?accion=login&usuario=${encodeURIComponent(idLimpio)}&password=${encodeURIComponent(p)}`;
            const resp = await fetch(url);
            const res = await resp.json();

            if (res && res.ok) {
                const userObj = res.usuario;
                userObj.password = p; // Guardamos pass para revalidar
                
                localStorage.removeItem("vendelo_cache"); // Limpiar cache previa
                localStorage.setItem("usuarioVentasPlus", JSON.stringify(userObj));
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Bienvenido!',
                        text: 'Accediendo al sistema...',
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => { location.reload(); });
                } else {
                    location.reload();
                }
            } else {
                if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Acceso Denegado', text: res.error || "Credenciales incorrectas" });
                else alert("Acceso Denegado: " + (res.error || "Credenciales incorrectas"));
            }
        } catch (e) {
            console.error(e);
            if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo conectar: ' + e.message });
            else alert('Error: ' + e.message);
        } finally {
            const btn = document.querySelector('#acceso-login .acceso-btn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalText || 'Entrar';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        }
    }

    async function registrarUsuarioDesktop() {
        const btn = document.querySelector('#acceso-registro .acceso-btn');
        if (btn && btn.disabled) return;

        try {
            const n = document.getElementById('reg-nombre').value.trim().toUpperCase();
            const c = document.getElementById('reg-correo').value.trim().toLowerCase();
            const u = document.getElementById('reg-usuario').value.trim().toLowerCase();
            const p = document.getElementById('reg-pass').value.trim();
            const d = document.getElementById('reg-depto').value;

            if(!n || !c || !u || !p) {
                if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Campos vacíos', text: 'Por favor completa todos los campos' });
                else alert('Por favor completa todos los campos');
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.dataset.originalText = btn.innerHTML;
                btn.innerHTML = '<i class="ph ph-spinner animate-spin inline-block mr-2"></i> Preparando su entorno...';
                btn.style.opacity = '0.7';
                btn.style.cursor = 'not-allowed';
            }

            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Creando base de datos',
                    html: 'Estamos configurando tu espacio de trabajo personal...<br><b>Esto puede tardar unos segundos.</b>',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });
            } else {
                console.log("Creando base de datos...");
            }

            const correoValido = u.includes('@') ? u : (c.includes('@') ? c : u + "@vendelo.plus");
            const idLimpio = u.split('@')[0];

            const url = `${MASTER_URL}?accion=registrarNuevoCliente&id=${encodeURIComponent(idLimpio)}&nombre=${encodeURIComponent(n)}&correo=${encodeURIComponent(correoValido)}&password=${encodeURIComponent(p)}`;
            const resp = await fetch(url);
            const res = await resp.json();

            if (res.ok) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Cuenta Creada!',
                        text: 'Tu base de datos ha sido creada exitosamente.',
                        confirmButtonColor: '#2563eb'
                    }).then(() => {
                        mostrarLoginDesktop();
                        document.getElementById('reg-nombre').value = '';
                        document.getElementById('reg-correo').value = '';
                        document.getElementById('reg-usuario').value = '';
                        document.getElementById('reg-pass').value = '';
                    });
                } else {
                    alert('¡Cuenta Creada exitosamente!');
                    mostrarLoginDesktop();
                }
            } else {
                if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Error', text: res.error || "Error al registrar" });
                else alert("Error: " + (res.error || "Error al registrar"));
            }
        } catch (e) {
            console.error(e);
            if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo conectar: ' + e.message });
            else alert('Error de conexión: ' + e.message);
        } finally {
            const btn = document.querySelector('#acceso-registro .acceso-btn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalText || 'Crear cuenta';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        }
    }

    document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    initDragAndDrop();
    showSection('pos');
    cargarDatosIniciales();
    window.addEventListener('load', revalidarLicencia);
    