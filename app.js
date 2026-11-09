const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz8FX1qyTUnQKP0MZ3mEH5uU_tmqBSIRdlyeqRxhhR_SBPOn6io6ROg64gWtvkVMAvz/exec";

const NOMBRES_MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const fechaInicial = new Date();
let anioSeleccionado = fechaInicial.getFullYear();
let mesSeleccionado = fechaInicial.getMonth(); // 0 = Enero ... 11 = Diciembre

let gestionesNubeRaw = {};
let gestionesMesActual = {};
const saveTimers = {};

function obtenerClaveMes(anio = anioSeleccionado, mes = mesSeleccionado) {
    return `${anio}-${String(mes + 1).padStart(2, "0")}`;
}

function obtenerNombreMesAnio(anio = anioSeleccionado, mes = mesSeleccionado) {
    return `${NOMBRES_MESES[mes]} ${anio}`;
}

function tieneCompromisoValido(comp) {
    const str = limpiarTextoCompromiso(comp);
    return str !== "" && str !== "-";
}

// Permite guardar y recuperar la fecha de promesa incluso desde el texto sincronizado en la nube [PROM:YYYY-MM-DD]
function extraerFechaPromesaDeTexto(comp) {
    const str = String(comp || "");
    const match = str.match(/\[PROM:(\d{4}-\d{2}-\d{2})\]/);
    return match ? match[1] : "";
}

function limpiarTextoCompromiso(comp) {
    return String(comp || "").replace(/\s*\[PROM:\d{4}-\d{2}-\d{2}\]/g, "").trim();
}

function empacarCompromisoConFecha(textoLimpio, fechaPromesa) {
    const limpio = limpiarTextoCompromiso(textoLimpio);
    if (fechaPromesa) {
        return `${limpio || "-"} [PROM:${fechaPromesa}]`;
    }
    return limpio;
}

function parsearFechaSegura(valor) {
    if (!valor) return null;
    if (valor instanceof Date && !isNaN(valor)) {
        return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
    }
    if (typeof valor === "number" && valor > 25000 && valor < 80000) {
        const utcDays = Math.floor(valor - 25569);
        const d = new Date(utcDays * 86400 * 1000);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const str = String(valor).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
    }
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
        return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
    }
    const parsed = new Date(str);
    if (!isNaN(parsed)) {
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
    return null;
}

function formatShortDate(d) {
    if (!d || isNaN(d)) return "-";
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatearISOaCorto(isoStr) {
    if (!isoStr) return "";
    const partes = isoStr.split("-");
    if (partes.length !== 3) return isoStr;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function obtenerFechaHoraCorta() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function cargarGestionesLocalesMes(claveMes = obtenerClaveMes()) {
    let localGestiones = {};
    try {
        const cachedMes = localStorage.getItem("mora_gestiones_" + claveMes);
        if (cachedMes) {
            localGestiones = JSON.parse(cachedMes) || {};
        }

        const mesHoyClave = obtenerClaveMes(fechaInicial.getFullYear(), fechaInicial.getMonth());
        if ((claveMes === mesHoyClave || claveMes === "2026-09" || claveMes === "2026-10") && Object.keys(localGestiones).length === 0) {
            const cachedGeneral = localStorage.getItem("mora_cached_gestiones");
            if (cachedGeneral) {
                try {
                    const parsedGen = JSON.parse(cachedGeneral) || {};
                    Object.keys(parsedGen).forEach(k => {
                        if (!k.includes("__")) {
                            localGestiones[k] = parsedGen[k];
                        }
                    });
                } catch (e) {}
            }
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith("mora_") && !key.startsWith("mora_cached_") && !key.startsWith("mora_gestiones_") && !key.startsWith("mora_rows_") && !key.startsWith("mora_clientes_")) {
                    const dni = key.replace("mora_", "").trim();
                    try {
                        const val = JSON.parse(localStorage.getItem(key));
                        if (val && typeof val === "object") {
                            const existing = localGestiones[dni];
                            if (!existing || (val.updatedAt || 0) >= (existing.updatedAt || 0)) {
                                localGestiones[dni] = val;
                            }
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        console.error("Error leyendo gestiones locales del mes:", e);
    }
    return localGestiones;
}

function extraerGestionesNubeParaMes(nubeAll, claveMes = obtenerClaveMes()) {
    const resultadoNubeMes = {};
    if (!nubeAll || typeof nubeAll !== "object") return resultadoNubeMes;

    const sufijoMes = `__${claveMes}`;
    const mesHoyClave = obtenerClaveMes(fechaInicial.getFullYear(), fechaInicial.getMonth());

    Object.keys(nubeAll).forEach(rawKey => {
        const keyStr = String(rawKey).trim();
        if (keyStr.endsWith(sufijoMes)) {
            const dni = keyStr.slice(0, -sufijoMes.length);
            resultadoNubeMes[dni] = nubeAll[rawKey];
        } else if (!keyStr.includes("__") && (claveMes === mesHoyClave || claveMes === "2026-10")) {
            if (!resultadoNubeMes[keyStr]) {
                resultadoNubeMes[keyStr] = nubeAll[rawKey];
            }
        }
    });

    return resultadoNubeMes;
}

function fusionarGestiones(nubeGestiones, localGestiones) {
    const resultado = {};
    const dnis = new Set([
        ...Object.keys(nubeGestiones || {}),
        ...Object.keys(localGestiones || {})
    ]);

    dnis.forEach(rawDni => {
        const dni = String(rawDni).trim();
        const nube = (nubeGestiones && nubeGestiones[rawDni]) || {};
        const local = (localGestiones && localGestiones[dni]) || {};

        const nubeCompRaw = String(nube.compromiso || "").trim();
        const localCompRaw = String(local.compromiso || "").trim();

        const fechaPromNube = extraerFechaPromesaDeTexto(nubeCompRaw);
        const fechaPromLocal = local.fechaPromesa || extraerFechaPromesaDeTexto(localCompRaw);

        const nubeComp = limpiarTextoCompromiso(nubeCompRaw);
        const localComp = limpiarTextoCompromiso(localCompRaw);

        if (local.dirty) {
            const compFinal = localComp !== "" ? localComp : (nubeComp || "-");
            const fechaPromFinal = fechaPromLocal || fechaPromNube || "";
            resultado[dni] = {
                compromiso: compFinal,
                fechaPromesa: fechaPromFinal,
                carta1: local.carta1 !== undefined ? Boolean(local.carta1) : Boolean(nube.carta1),
                carta2: local.carta2 !== undefined ? Boolean(local.carta2) : Boolean(nube.carta2),
                estado: local.estado || nube.estado || "pendiente",
                llamado: local.llamado !== undefined ? Boolean(local.llamado) : (tieneCompromisoValido(compFinal) || Boolean(fechaPromFinal)),
                fechaLlamada: local.fechaLlamada || "",
                updatedAt: local.updatedAt || Date.now(),
                dirty: true
            };
        } else {
            const usarCompromisoLocal = tieneCompromisoValido(localComp) && !tieneCompromisoValido(nubeComp);
            const compFinal = usarCompromisoLocal ? localComp : (nubeComp || localComp || "-");
            const fechaPromFinal = fechaPromLocal || fechaPromNube || "";
            resultado[dni] = {
                compromiso: compFinal,
                fechaPromesa: fechaPromFinal,
                carta1: Boolean(nube.carta1 || local.carta1),
                carta2: Boolean(nube.carta2 || local.carta2),
                estado: (nube.estado && nube.estado !== "pendiente") ? nube.estado : (local.estado || nube.estado || "pendiente"),
                llamado: Boolean(local.llamado || tieneCompromisoValido(compFinal) || Boolean(fechaPromFinal)),
                fechaLlamada: local.fechaLlamada || "",
                updatedAt: local.updatedAt || Date.now(),
                dirty: false
            };
        }
    });

    return resultado;
}

// Detecta en qué otros meses del historial aparece este mismo DNI
function obtenerMesesReincidencia(dniKey, claveMesActual = obtenerClaveMes()) {
    const mesesPrevios = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("mora_clientes_")) {
                const clave = key.replace("mora_clientes_", "");
                if (clave === claveMesActual) continue;
                const lista = JSON.parse(localStorage.getItem(key) || "[]");
                const encontrado = lista.some(c => String(c.dni).trim() === dniKey && (parseInt(c.diasAtrasoExcel, 10) > 0 || !c.salioDeMoraEnSemana));
                if (encontrado) {
                    const partes = clave.split("-");
                    const mIdx = parseInt(partes[1], 10) - 1;
                    if (NOMBRES_MESES[mIdx]) {
                        mesesPrevios.push(`${NOMBRES_MESES[mIdx].slice(0, 3)} ${partes[0]}`);
                    }
                }
            }
        }
    } catch (e) {}
    return mesesPrevios;
}

// Convierte cualquier matriz de filas (con o sin cabecera) en una lista de objetos de clientes de Jhunior Vargas
function extraerClientesDeFilas(rows) {
    if (!rows || !Array.isArray(rows) || rows.length === 0) return [];

    if (rows[0] && !Array.isArray(rows[0]) && typeof rows[0] === "object" && rows[0].dni !== undefined) {
        return rows;
    }

    let hasHeader = false;
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        if (!Array.isArray(rows[i])) continue;
        const rowStrings = rows[i].map(c => String(c).toUpperCase().trim());
        if (rowStrings.includes("CLIENTE") || rowStrings.includes("NOMBRE CLIENTE") || rowStrings.includes("NOMBRE_CLIENTE")) {
            headerRowIndex = i;
            hasHeader = true;
            break;
        }
    }

    let idxCliente, idxVencimiento, idxMonto, idxCompromiso, idxAsesor, idxProceso, idxDiasMora, idxDiasMoraCierre, idxDni, idxCelular, idxAmortizacion, idxProducto, idxCuotas, idxAgencia, idxDireccion, idxDistrito, idxOrganizacion;
    let dataRows;

    if (hasHeader) {
        const headers = rows[headerRowIndex].map(h => String(h).toLowerCase().trim());
        dataRows = rows.slice(headerRowIndex + 1);

        const findExact = (exactNames) => headers.findIndex(h => exactNames.includes(h));

        idxCliente = findExact(["nombre_cliente", "nombre cliente", "cliente"]);
        idxVencimiento = findExact(["fecha compromiso", "vencimiento", "fecha de vencimiento", "fecha_vencimiento"]);
        idxMonto = findExact(["saldo inicial", "monto adeudado", "monto"]);
        idxCompromiso = findExact(["compromiso", "compromiso de pago"]);
        idxAsesor = findExact(["oficial negocios actual", "asesor"]);
        idxProceso = findExact(["fecha de proceso", "proceso", "fecha_proceso"]);
        idxDiasMora = findExact(["dias de mora actual", "días mora actual", "das mora actual", "mora actual", "dias_mora_actual"]);
        idxDiasMoraCierre = findExact(["dias de mora al cierre", "días mora cierre", "das mora cierre", "mora cierre"]);
        idxDni = findExact(["numero_documento", "numero documento", "dni", "documento"]);
        idxCelular = findExact(["celular_3", "telefono", "teléfono", "celular"]);
        idxAmortizacion = findExact(["amortizacion", "amortización"]);
        idxProducto = findExact(["producto_trt", "producto"]);
        idxCuotas = findExact(["nro cuotas", "cuotas", "n° cuotas"]);
        idxAgencia = findExact(["agencia"]);
        idxDireccion = findExact(["direccion", "dirección", "direccion_predio", "caserio", "sector"]);
        idxDistrito = findExact(["distrito", "distrito_predio"]);
        idxOrganizacion = findExact(["organizacion", "organización", "asociacion", "junta"]);

        if (idxCliente === -1) idxCliente = 0;
        if (idxVencimiento === -1) idxVencimiento = 1;
        if (idxMonto === -1) idxMonto = 2;
        if (idxDireccion === -1 && rows[headerRowIndex].length > 27) idxDireccion = 24;
        if (idxDistrito === -1 && rows[headerRowIndex].length > 27) idxDistrito = 27;
        if (idxOrganizacion === -1 && rows[headerRowIndex].length > 29) idxOrganizacion = 29;
    } else {
        dataRows = rows;
        idxProceso = 0;
        idxDiasMora = 2;
        idxDiasMoraCierre = 3;
        idxAgencia = 7;
        idxMonto = 8;
        idxCliente = 9;
        idxProducto = 14;
        idxAsesor = 15;
        idxDni = 19;
        idxCelular = 22;
        idxDireccion = 24;
        idxDistrito = 27;
        idxOrganizacion = 29;
        idxCuotas = 30;
        idxAmortizacion = 35;
        idxVencimiento = -1;
        idxCompromiso = -1;
    }

    let datosFiltrados = dataRows.filter(row => Array.isArray(row) && row.length > 0 && row.some(cell => cell !== ""));

    if (idxAsesor !== -1 || idxAgencia !== -1) {
        datosFiltrados = datosFiltrados.filter(row => {
            const asesor = idxAsesor !== -1 ? String(row[idxAsesor] || "").toUpperCase() : "";
            const agencia = idxAgencia !== -1 ? String(row[idxAgencia] || "").toUpperCase() : "";
            const matchAsesor = idxAsesor === -1 || (asesor.includes("JHUNIOR") && asesor.includes("VARGAS"));
            const matchAgencia = idxAgencia === -1 || agencia.includes("NORTE");
            return matchAsesor && matchAgencia;
        });
    }

    return datosFiltrados.map(row => {
        const dni = String(idxDni !== -1 ? (row[idxDni] || "-") : "-").trim();
        const cliente = String(row[idxCliente] || "-").trim();
        const celular = String(idxCelular !== -1 ? (row[idxCelular] || "-") : "-").trim();
        const producto = String(idxProducto !== -1 ? (row[idxProducto] || "-") : "-").trim();
        const cuotas = String(idxCuotas !== -1 ? (row[idxCuotas] || "-") : "-").trim();
        const direccion = idxDireccion !== -1 ? String(row[idxDireccion] || "").trim() : "";
        const distrito = idxDistrito !== -1 ? String(row[idxDistrito] || "").trim().toUpperCase() : "";
        const organizacion = idxOrganizacion !== -1 ? String(row[idxOrganizacion] || "").trim() : "";

        const procesoRaw = idxProceso !== -1 ? row[idxProceso] : null;
        const fechaBase = parsearFechaSegura(procesoRaw);
        const procesoISO = fechaBase ? `${fechaBase.getFullYear()}-${String(fechaBase.getMonth() + 1).padStart(2, "0")}-${String(fechaBase.getDate()).padStart(2, "0")}` : null;

        const compromisoExcel = idxCompromiso !== -1 ? String(row[idxCompromiso] || "-") : "-";
        const montoOriginal = parseFloat(String(row[idxMonto]).replace(/[^0-9.-]+/g, "")) || 0;
        const amortizacion = idxAmortizacion !== -1 ? (parseFloat(String(row[idxAmortizacion]).replace(/[^0-9.-]+/g, "")) || 0) : 0;
        const diasAtrasoExcel = idxDiasMora !== -1 && row[idxDiasMora] !== "" ? (parseInt(row[idxDiasMora], 10) || 0) : 0;
        const diasAtrasoCierre = idxDiasMoraCierre !== -1 && row[idxDiasMoraCierre] !== "" ? (parseInt(row[idxDiasMoraCierre], 10) || 0) : "-";

        return {
            dni,
            cliente,
            celular,
            producto,
            cuotas,
            direccion,
            distrito,
            organizacion,
            procesoISO,
            compromisoExcel,
            montoOriginal,
            amortizacion,
            diasAtrasoExcel,
            diasAtrasoCierre
        };
    });
}

// Fusiona los clientes que ya estaban en el mes con el nuevo Excel semanal del mismo mes
function fusionarClientesSemanaEnMes(clientesPreviosMes, clientesNuevoExcel, claveMes) {
    if (!clientesPreviosMes || clientesPreviosMes.length === 0) {
        return {
            listaFinal: clientesNuevoExcel,
            actualizados: 0,
            nuevos: clientesNuevoExcel.length,
            canceladosAuto: 0
        };
    }

    const mapaPrevios = new Map();
    clientesPreviosMes.forEach(c => {
        mapaPrevios.set(String(c.dni).trim(), c);
    });

    const dnisEnNuevoExcel = new Set();
    let actualizados = 0;
    let nuevos = 0;
    let canceladosAuto = 0;

    const listaFinal = [];

    clientesNuevoExcel.forEach(nuevo => {
        const dniKey = String(nuevo.dni).trim();
        dnisEnNuevoExcel.add(dniKey);

        if (mapaPrevios.has(dniKey)) {
            actualizados++;
            const previo = mapaPrevios.get(dniKey);
            listaFinal.push({
                ...previo,
                ...nuevo,
                celular: (nuevo.celular && nuevo.celular !== "-" && nuevo.celular !== "0") ? nuevo.celular : previo.celular,
                direccion: nuevo.direccion || previo.direccion || "",
                distrito: nuevo.distrito || previo.distrito || "",
                actualizadoSemana: true
            });
        } else {
            nuevos++;
            listaFinal.push({
                ...nuevo,
                nuevoEnSemana: true
            });
        }
    });

    clientesPreviosMes.forEach(previo => {
        const dniKey = String(previo.dni).trim();
        if (!dnisEnNuevoExcel.has(dniKey)) {
            listaFinal.push({
                ...previo,
                salioDeMoraEnSemana: true
            });
            const gest = gestionesMesActual[dniKey] || {};
            if (gest.estado !== "cancelo") {
                canceladosAuto++;
                guardarGestionLocalInmediato(
                    dniKey,
                    gest.compromiso || "Pagó / No figura en nuevo Excel semanal",
                    gest.fechaPromesa || "",
                    gest.carta1 || false,
                    gest.carta2 || false,
                    "cancelo",
                    gest.llamado || false,
                    gest.fechaLlamada || "",
                    true,
                    claveMes
                );
            }
        }
    });

    return {
        listaFinal,
        actualizados,
        nuevos,
        canceladosAuto
    };
}

function obtenerClientesGuardadosDelMes(claveMes = obtenerClaveMes()) {
    try {
        const guardado = localStorage.getItem("mora_clientes_" + claveMes);
        if (guardado) {
            const parsed = JSON.parse(guardado);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {}
    return null;
}

function guardarClientesDelMes(claveMes, listaClientes) {
    try {
        localStorage.setItem("mora_clientes_" + claveMes, JSON.stringify(listaClientes));
    } catch (e) {
        console.error("Error guardando clientes del mes:", e);
    }
}

window.filtrarRapido = function(filtroTramo) {
    const selectTramo = document.getElementById("filter-tramo");
    if (selectTramo) {
        selectTramo.value = filtroTramo;
        aplicarFiltrosTabla();
    }
};

function actualizarIndicadoresMesesUI() {
    const selectYear = document.getElementById("select-year");
    if (selectYear) {
        selectYear.value = String(anioSeleccionado);
    }

    const badge = document.getElementById("mes-activo-badge");
    if (badge) {
        badge.textContent = `Mes seleccionado: ${obtenerNombreMesAnio()}`;
    }

    const tabs = document.querySelectorAll(".month-tab");
    tabs.forEach(tab => {
        const m = parseInt(tab.getAttribute("data-month"), 10);
        tab.classList.toggle("active", m === mesSeleccionado);

        const clave = obtenerClaveMes(anioSeleccionado, m);
        const clientesMes = obtenerClientesGuardadosDelMes(clave);
        const countClientes = clientesMes ? clientesMes.length : 0;

        tab.textContent = countClientes > 0 ? `${NOMBRES_MESES[m]} (${countClientes})` : NOMBRES_MESES[m];
        tab.classList.toggle("has-data", countClientes > 0);
    });
}

function poblarFiltroDistritos(clientesProcesados) {
    const selectDistrito = document.getElementById("filter-distrito");
    if (!selectDistrito) return;

    const valorPrevio = selectDistrito.value || "todos";
    const conteoPorDistrito = {};

    clientesProcesados.forEach(c => {
        const dist = (c.distrito || "SIN DISTRITO").trim();
        if (dist) {
            conteoPorDistrito[dist] = (conteoPorDistrito[dist] || 0) + 1;
        }
    });

    selectDistrito.innerHTML = `<option value="todos">&#128205; Todos los Distritos (Ruta de Campo)</option>`;
    Object.keys(conteoPorDistrito).sort().forEach(dist => {
        const opt = document.createElement("option");
        opt.value = dist;
        opt.textContent = `📍 ${dist} (${conteoPorDistrito[dist]} cliente${conteoPorDistrito[dist] > 1 ? 's' : ''})`;
        selectDistrito.appendChild(opt);
    });

    if (conteoPorDistrito[valorPrevio]) {
        selectDistrito.value = valorPrevio;
    } else {
        selectDistrito.value = "todos";
    }
}

function cambiarMesSeleccionado(nuevoMes, nuevoAnio = anioSeleccionado) {
    mesSeleccionado = nuevoMes;
    anioSeleccionado = nuevoAnio;

    const claveMes = obtenerClaveMes();
    const localesMes = cargarGestionesLocalesMes(claveMes);
    const nubeMes = extraerGestionesNubeParaMes(gestionesNubeRaw, claveMes);
    gestionesMesActual = fusionarGestiones(nubeMes, localesMes);

    actualizarIndicadoresMesesUI();

    const clientesMes = obtenerClientesGuardadosDelMes(claveMes);
    if (clientesMes && clientesMes.length > 0) {
        renderizarClientesDelMes(clientesMes);
    } else {
        mostrarEstadoVacioMes();
    }
}

function mostrarEstadoVacioMes() {
    const tableBody = document.getElementById("table-body");
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="14" class="empty-state">
                    No hay clientes cargados en <strong>${obtenerNombreMesAnio()}</strong>.<br>
                    Haz clic en <strong>"Subir / Actualizar Excel de la Semana"</strong> para cargar tu cartera de mora de ${obtenerNombreMesAnio()}.
                </td>
            </tr>
        `;
    }
    document.getElementById("total-monto").textContent = "$0.00";
    document.getElementById("total-sin-llamar").textContent = "0";
    document.getElementById("total-tramo-1").textContent = "0";
    document.getElementById("total-tramo-2").textContent = "0";
    document.getElementById("total-preventiva").textContent = "0";
    const elPromHoy = document.getElementById("total-promesas-hoy");
    if (elPromHoy) elPromHoy.textContent = "0";
    const alertsBanner = document.getElementById("alerts-banner");
    if (alertsBanner) alertsBanner.style.display = "none";
    const recSection = document.getElementById("recovery-section");
    if (recSection) recSection.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-sync").addEventListener("click", () => syncData(0));
    document.getElementById("excel-file").addEventListener("change", handleFile, false);

    const btnClearMonth = document.getElementById("btn-clear-month");
    if (btnClearMonth) {
        btnClearMonth.addEventListener("click", () => {
            const nombreMes = obtenerNombreMesAnio();
            if (confirm(`¿Deseas limpiar la lista de clientes de ${nombreMes} para subir un Excel desde cero en este mes? (Los demás meses no se tocarán)`)) {
                const claveMes = obtenerClaveMes();
                localStorage.removeItem("mora_clientes_" + claveMes);
                actualizarIndicadoresMesesUI();
                mostrarEstadoVacioMes();
            }
        });
    }

    const tabs = document.querySelectorAll(".month-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const m = parseInt(tab.getAttribute("data-month"), 10);
            cambiarMesSeleccionado(m, anioSeleccionado);
        });
    });

    const selectYear = document.getElementById("select-year");
    if (selectYear) {
        selectYear.addEventListener("change", () => {
            cambiarMesSeleccionado(mesSeleccionado, parseInt(selectYear.value, 10));
        });
    }

    const filterSearch = document.getElementById("filter-search");
    const filterDistrito = document.getElementById("filter-distrito");
    const filterTramo = document.getElementById("filter-tramo");
    const filterEstado = document.getElementById("filter-estado");
    if (filterSearch) filterSearch.addEventListener("input", aplicarFiltrosTabla);
    if (filterDistrito) filterDistrito.addEventListener("change", aplicarFiltrosTabla);
    if (filterTramo) filterTramo.addEventListener("change", aplicarFiltrosTabla);
    if (filterEstado) filterEstado.addEventListener("change", aplicarFiltrosTabla);

    const btnSinLlamar = document.getElementById("btn-ver-sin-llamar");
    const btnPromesasHoy = document.getElementById("btn-ver-promesas-hoy");
    const btnFaltaFoto = document.getElementById("btn-ver-falta-foto");
    const btnPreventiva = document.getElementById("btn-ver-preventiva");
    const btnTodosAlerta = document.getElementById("btn-ver-todos-alerta");

    if (btnSinLlamar) btnSinLlamar.addEventListener("click", () => window.filtrarRapido("sin-llamar-mora"));
    if (btnPromesasHoy) btnPromesasHoy.addEventListener("click", () => window.filtrarRapido("promesas-hoy"));
    if (btnFaltaFoto) btnFaltaFoto.addEventListener("click", () => window.filtrarRapido("falta-foto-urgente"));
    if (btnPreventiva) btnPreventiva.addEventListener("click", () => window.filtrarRapido("preventiva-urgente"));
    if (btnTodosAlerta) btnTodosAlerta.addEventListener("click", () => window.filtrarRapido("todos"));

    migrarCacheGeneralSiEsNecesario();

    gestionesMesActual = cargarGestionesLocalesMes(obtenerClaveMes());
    actualizarIndicadoresMesesUI();

    const clientesMes = obtenerClientesGuardadosDelMes(obtenerClaveMes());
    if (clientesMes && clientesMes.length > 0) {
        renderizarClientesDelMes(clientesMes);
    } else {
        mostrarEstadoVacioMes();
    }

    syncData(0);
});

function migrarCacheGeneralSiEsNecesario() {
    try {
        const cachedRowsStr = localStorage.getItem("mora_cached_rows");
        if (!cachedRowsStr) return;

        let algunMesConDatos = false;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("mora_clientes_")) {
                algunMesConDatos = true;
                break;
            }
        }
        if (algunMesConDatos) return;

        const rows = JSON.parse(cachedRowsStr);
        const clientesExtraidos = extraerClientesDeFilas(rows);
        if (clientesExtraidos.length > 0) {
            const claveActual = obtenerClaveMes();
            guardarClientesDelMes(claveActual, clientesExtraidos);
        }
    } catch (e) {}
}

function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById("sync-status");
    statusEl.textContent = `Leyendo Excel semanal para ${obtenerNombreMesAnio()}...`;
    statusEl.style.color = "#f39c12";

    const reader = new FileReader();
    reader.onload = async function (ev) {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        try {
            const claveMes = obtenerClaveMes();
            const locales = cargarGestionesLocalesMes(claveMes);
            gestionesMesActual = fusionarGestiones(gestionesMesActual, locales);

            const clientesNuevosExcel = extraerClientesDeFilas(rows);
            if (clientesNuevosExcel.length === 0) {
                alert("No se encontraron clientes de Jhunior Vargas en este archivo Excel.");
                statusEl.textContent = "Sin clientes encontrados en el Excel.";
                statusEl.style.color = "#e74c3c";
                e.target.value = "";
                return;
            }

            const clientesPrevios = obtenerClientesGuardadosDelMes(claveMes) || [];
            const resultadoFusion = fusionarClientesSemanaEnMes(clientesPrevios, clientesNuevosExcel, claveMes);

            guardarClientesDelMes(claveMes, resultadoFusion.listaFinal);
            localStorage.setItem("mora_cached_rows", JSON.stringify(rows));
            actualizarIndicadoresMesesUI();
            renderizarClientesDelMes(resultadoFusion.listaFinal);

            if (clientesPrevios.length > 0) {
                statusEl.textContent = `¡${obtenerNombreMesAnio()} actualizado! (${resultadoFusion.actualizados} actualizados, ${resultadoFusion.nuevos} nuevos, ${resultadoFusion.canceladosAuto} pasaron a Canceló)`;
            } else {
                statusEl.textContent = `¡${clientesNuevosExcel.length} clientes cargados en ${obtenerNombreMesAnio()}!`;
            }
            statusEl.style.color = "#27ae60";

            await fetch(SCRIPT_URL, {
                method: "POST",
                mode: "no-cors",
                body: JSON.stringify({ action: "upload_data", mes: claveMes, data: rows })
            });

            setTimeout(() => syncData(0), 3000);
        } catch(err) {
            console.error(err);
            statusEl.textContent = `Guardado en ${obtenerNombreMesAnio()} (Modo local).`;
            statusEl.style.color = "#e67e22";
        }
        e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
}

async function sincronizarPendientesConNube() {
    const claveMes = obtenerClaveMes();
    const locales = cargarGestionesLocalesMes(claveMes);
    const pendientes = Object.entries(locales).filter(([_, val]) => val && val.dirty);
    for (const [dni, val] of pendientes) {
        await enviarGestionANube(dni, val.compromiso, val.fechaPromesa, val.carta1, val.carta2, val.estado, val.llamado, val.fechaLlamada, claveMes);
    }
}

async function syncData(retryCount = 0) {
    const statusEl = document.getElementById("sync-status");
    statusEl.textContent = retryCount > 0 ? `Reintentando conexión (${retryCount}/2)...` : "Sincronizando...";
    statusEl.style.color = "#f39c12";

    try {
        await sincronizarPendientesConNube();

        const urlNoCache = SCRIPT_URL + "?t=" + new Date().getTime();
        const response = await fetch(urlNoCache, {
            method: "GET",
            redirect: "follow",
            cache: "no-store"
        });
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        const json = await response.json();
        
        gestionesNubeRaw = json.gestiones || {};
        const claveMes = obtenerClaveMes();
        const locales = cargarGestionesLocalesMes(claveMes);
        const nubeMes = extraerGestionesNubeParaMes(gestionesNubeRaw, claveMes);
        gestionesMesActual = fusionarGestiones(nubeMes, locales);
        localStorage.setItem("mora_gestiones_" + claveMes, JSON.stringify(gestionesMesActual));

        const rowsNube = json.data || [];
        let clientesMes = obtenerClientesGuardadosDelMes(claveMes);

        // Si existen clientes pero les faltaba extraer distrito/dirección, enriquecerlos desde rowsNube
        if (rowsNube.length > 0 && Array.isArray(rowsNube[0])) {
            const extraidosNube = extraerClientesDeFilas(rowsNube);
            if (extraidosNube.length > 0) {
                const mesHoyClave = obtenerClaveMes(fechaInicial.getFullYear(), fechaInicial.getMonth());
                const fCorte = parsearFechaSegura(extraidosNube[0].procesoISO);
                const claveMesNube = fCorte ? obtenerClaveMes(fCorte.getFullYear(), fCorte.getMonth()) : mesHoyClave;

                if (!obtenerClientesGuardadosDelMes(claveMesNube)) {
                    guardarClientesDelMes(claveMesNube, extraidosNube);
                }
                if (claveMes === mesHoyClave && !clientesMes) {
                    guardarClientesDelMes(mesHoyClave, extraidosNube);
                    clientesMes = extraidosNube;
                } else if (clientesMes && clientesMes.some(c => c.distrito === undefined)) {
                    // Enriquecer con distrito y dirección
                    const mapaNube = new Map(extraidosNube.map(c => [String(c.dni).trim(), c]));
                    clientesMes = clientesMes.map(c => {
                        const n = mapaNube.get(String(c.dni).trim());
                        return n ? { ...c, distrito: c.distrito || n.distrito, direccion: c.direccion || n.direccion } : c;
                    });
                    guardarClientesDelMes(claveMes, clientesMes);
                }
            }
        }

        actualizarIndicadoresMesesUI();

        if (clientesMes && clientesMes.length > 0) {
            renderizarClientesDelMes(clientesMes);
            statusEl.textContent = `Sincronizado (${obtenerNombreMesAnio()}) ✓`;
            statusEl.style.color = "#27ae60";
        } else {
            mostrarEstadoVacioMes();
            statusEl.textContent = `${obtenerNombreMesAnio()} sin Excel cargado aún.`;
            statusEl.style.color = "#7f8c8d";
        }
    } catch(err) {
        console.error(err);
        if (retryCount < 2) {
            setTimeout(() => syncData(retryCount + 1), 1500);
            return;
        }
        const clientesMes = obtenerClientesGuardadosDelMes(obtenerClaveMes());
        if (clientesMes && clientesMes.length > 0) {
            gestionesMesActual = cargarGestionesLocalesMes(obtenerClaveMes());
            renderizarClientesDelMes(clientesMes);
            statusEl.textContent = `Modo local (${obtenerNombreMesAnio()})`;
            statusEl.style.color = "#e67e22";
            return;
        }
        mostrarEstadoVacioMes();
        statusEl.textContent = "Sin conexión a la nube (puedes subir tu Excel para trabajar en modo local)";
        statusEl.style.color = "#e67e22";
    }
}

function guardarGestionLocalInmediato(dni, compromiso, fechaPromesa, carta1, carta2, estado, llamado = false, fechaLlamada = "", dirty = true, claveMes = obtenerClaveMes()) {
    const dniKey = String(dni).trim();
    const prev = gestionesMesActual[dniKey] || {};
    const textoLimpio = limpiarTextoCompromiso(compromiso);
    const registro = {
        compromiso: textoLimpio,
        fechaPromesa: fechaPromesa !== undefined ? fechaPromesa : (prev.fechaPromesa || ""),
        carta1: Boolean(carta1),
        carta2: Boolean(carta2),
        estado: estado || "pendiente",
        llamado: Boolean(llamado || tieneCompromisoValido(textoLimpio) || Boolean(fechaPromesa)),
        fechaLlamada: fechaLlamada || prev.fechaLlamada || "",
        updatedAt: Date.now(),
        dirty: dirty
    };
    gestionesMesActual[dniKey] = registro;
    try {
        localStorage.setItem("mora_gestiones_" + claveMes, JSON.stringify(gestionesMesActual));
        localStorage.setItem("mora_" + dniKey, JSON.stringify(registro));
        localStorage.setItem("mora_cached_gestiones", JSON.stringify(gestionesMesActual));
        actualizarIndicadoresMesesUI();
    } catch (e) {
        console.error("Error guardando en localStorage:", e);
    }
}

async function enviarGestionANube(dni, compromiso, fechaPromesa, carta1, carta2, estado, llamado = false, fechaLlamada = "", claveMes = obtenerClaveMes()) {
    const dniKey = String(dni).trim();
    const dniConMes = `${dniKey}__${claveMes}`;
    const compromisoEmpacado = empacarCompromisoConFecha(compromiso, fechaPromesa);

    const url = new URL(SCRIPT_URL);
    url.searchParams.append("action", "update");
    url.searchParams.append("dni", dniConMes);
    url.searchParams.append("compromiso", compromisoEmpacado);
    url.searchParams.append("carta1", carta1);
    url.searchParams.append("carta2", carta2);
    url.searchParams.append("estado", estado);
    url.searchParams.append("t", Date.now());

    try {
        await fetch(url.toString(), {
            method: "GET",
            mode: "no-cors",
            keepalive: true,
            cache: "no-store"
        });
        const mesHoyClave = obtenerClaveMes(fechaInicial.getFullYear(), fechaInicial.getMonth());
        if (claveMes === mesHoyClave) {
            const urlCompat = new URL(SCRIPT_URL);
            urlCompat.searchParams.append("action", "update");
            urlCompat.searchParams.append("dni", dniKey);
            urlCompat.searchParams.append("compromiso", compromisoEmpacado);
            urlCompat.searchParams.append("carta1", carta1);
            urlCompat.searchParams.append("carta2", carta2);
            urlCompat.searchParams.append("estado", estado);
            urlCompat.searchParams.append("t", Date.now());
            fetch(urlCompat.toString(), { method: "GET", mode: "no-cors", keepalive: true, cache: "no-store" });
        }

        guardarGestionLocalInmediato(dniKey, compromiso, fechaPromesa, carta1, carta2, estado, llamado, fechaLlamada, false, claveMes);
        return true;
    } catch(err) {
        console.error("Error guardando gestion en la nube:", err);
        return false;
    }
}

function updateGestionEnNube(dni, compromiso, fechaPromesa, carta1, carta2, estado, llamado = false, fechaLlamada = "", inmediato = false, statusBadge = null) {
    const dniKey = String(dni).trim();
    const claveMes = obtenerClaveMes();
    guardarGestionLocalInmediato(dniKey, compromiso, fechaPromesa, carta1, carta2, estado, llamado, fechaLlamada, true, claveMes);

    if (statusBadge) {
        statusBadge.textContent = `✓ Guardado (${NOMBRES_MESES[mesSeleccionado]})`;
        statusBadge.style.color = "#27ae60";
        statusBadge.style.opacity = "1";
    }

    const timerKey = `${dniKey}__${claveMes}`;
    if (saveTimers[timerKey]) {
        clearTimeout(saveTimers[timerKey]);
    }

    if (inmediato) {
        enviarGestionANube(dniKey, compromiso, fechaPromesa, carta1, carta2, estado, llamado, fechaLlamada, claveMes);
    } else {
        saveTimers[timerKey] = setTimeout(() => {
            enviarGestionANube(dniKey, compromiso, fechaPromesa, carta1, carta2, estado, llamado, fechaLlamada, claveMes);
        }, 400);
    }
}

function renderizarClientesDelMes(listaClientes) {
    const tableBody = document.getElementById("table-body");
    tableBody.innerHTML = "";

    const hoy = new Date();
    const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const fechaFallback = new Date(anioSeleccionado, mesSeleccionado + 1, 0);
    fechaFallback.setHours(0, 0, 0, 0);

    const esMesActualOFuturo = (anioSeleccionado > hoy.getFullYear()) || (anioSeleccionado === hoy.getFullYear() && mesSeleccionado >= hoy.getMonth());
    const fechaCalculoMora = esMesActualOFuturo ? fechaHoy : new Date(anioSeleccionado, mesSeleccionado + 1, 0);

    let fechaReporteDetectada = null;
    const claveMesActual = obtenerClaveMes();

    const clientesProcesados = listaClientes.map(c => {
        const dni = String(c.dni || "-").trim();
        const cliente = c.cliente || "-";
        const celular = c.celular || "-";
        const producto = c.producto || "-";
        const cuotas = c.cuotas || "-";
        const direccion = c.direccion || "";
        const distrito = (c.distrito || "").toUpperCase();
        const organizacion = c.organizacion || "";
        const compromisoExcel = c.compromisoExcel || "-";
        const montoOriginal = parseFloat(c.montoOriginal) || 0;
        const amortizacion = parseFloat(c.amortizacion) || 0;
        let monto = montoOriginal - amortizacion;
        if (monto < 0) monto = 0;

        let fechaBase = parsearFechaSegura(c.procesoISO) || new Date(fechaFallback);
        if (!fechaReporteDetectada && c.procesoISO) {
            fechaReporteDetectada = fechaBase;
        }

        const diasAtrasoExcel = parseInt(c.diasAtrasoExcel, 10) || 0;
        const diasAtrasoCierre = c.diasAtrasoCierre !== undefined ? c.diasAtrasoCierre : "-";

        let fechaVenc = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate());
        fechaVenc.setDate(fechaVenc.getDate() - diasAtrasoExcel);

        const diasTranscurridosDesdeReporte = Math.round((fechaCalculoMora.getTime() - fechaBase.getTime()) / (1000 * 60 * 60 * 24));

        let diasAtrasoRealHoy = diasAtrasoExcel;
        if (diasTranscurridosDesdeReporte > 0) {
            diasAtrasoRealHoy = Math.round((fechaCalculoMora.getTime() - fechaVenc.getTime()) / (1000 * 60 * 60 * 24));
        }

        const diasAtrasoMostrar = diasAtrasoRealHoy < 0 ? 0 : diasAtrasoRealHoy;
        const entroAMoraDespues = (diasAtrasoExcel <= 0 && diasAtrasoRealHoy >= 1) || Boolean(c.nuevoEnSemana && diasAtrasoMostrar >= 1);
        const esPreventivaUrgente = (diasAtrasoRealHoy <= 0 && diasAtrasoRealHoy >= -3);
        const mesesReincidencia = obtenerMesesReincidencia(dni, claveMesActual);

        return {
            dni,
            cliente,
            celular,
            producto,
            cuotas,
            direccion,
            distrito,
            organizacion,
            compromisoExcel,
            montoOriginal,
            amortizacion,
            monto,
            fechaBase,
            fechaVenc,
            diasAtrasoExcel,
            diasAtrasoRealHoy,
            diasAtrasoMostrar,
            diasTranscurridosDesdeReporte,
            entroAMoraDespues,
            esPreventivaUrgente,
            diasAtrasoCierre,
            mesesReincidencia,
            nuevoEnSemana: Boolean(c.nuevoEnSemana),
            salioDeMoraEnSemana: Boolean(c.salioDeMoraEnSemana)
        };
    });

    poblarFiltroDistritos(clientesProcesados);

    clientesProcesados.sort((a, b) => {
        const aEnMora = a.diasAtrasoMostrar >= 1 ? 1 : 0;
        const bEnMora = b.diasAtrasoMostrar >= 1 ? 1 : 0;
        if (aEnMora !== bEnMora) return bEnMora - aEnMora;
        if (aEnMora === 1) {
            const aReciente = a.diasAtrasoMostrar <= 8 ? 1 : 0;
            const bReciente = b.diasAtrasoMostrar <= 8 ? 1 : 0;
            if (aReciente !== bReciente) return bReciente - aReciente;
            return a.diasAtrasoMostrar - b.diasAtrasoMostrar;
        }
        return b.diasAtrasoRealHoy - a.diasAtrasoRealHoy;
    });

    const infoActEl = document.getElementById("info-actualizacion");
    if (infoActEl) {
        const strReporte = fechaReporteDetectada ? formatShortDate(fechaReporteDetectada) : formatShortDate(fechaFallback);
        const strRef = formatShortDate(fechaCalculoMora);
        infoActEl.innerHTML = `&#128197; Mes: <strong>${obtenerNombreMesAnio()}</strong> | Último Excel: <strong>${strReporte}</strong> &rarr; Calculado al: <strong>${strRef}</strong>`;
    }

    clientesProcesados.forEach(item => {
        const {
            dni,
            cliente,
            celular,
            producto,
            cuotas,
            direccion,
            distrito,
            compromisoExcel,
            montoOriginal,
            amortizacion,
            monto,
            fechaVenc,
            diasAtrasoExcel,
            diasAtrasoRealHoy,
            diasAtrasoMostrar,
            diasTranscurridosDesdeReporte,
            entroAMoraDespues,
            esPreventivaUrgente,
            diasAtrasoCierre,
            mesesReincidencia,
            nuevoEnSemana
        } = item;

        let montoStyle = "text-align: right;";
        const montoFormateado = `$${monto.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        let montoHTML = montoFormateado;
        if (amortizacion > 0) {
            montoStyle = "background-color: #eafaf1; border-radius: 4px; padding: 5px; text-align: right;"; 
            montoHTML = `
                <div style="font-size: 0.8em; color: #7f8c8d; text-decoration: line-through;">$${montoOriginal.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div style="font-size: 0.85em; color: #e74c3c; margin-bottom: 2px;">- $${amortizacion.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div style="color: #27ae60; font-weight: bold; font-size: 1.05em;">${montoFormateado}</div>
            `;
        }

        const fechaMostrada = formatShortDate(fechaVenc);

        let fTramo1Fin = new Date(fechaVenc);
        fTramo1Fin.setDate(fechaVenc.getDate() + 8);
        let fTramo2Ini = new Date(fechaVenc);
        fTramo2Ini.setDate(fechaVenc.getDate() + 9);
        let fTramo2Fin = new Date(fechaVenc);
        fTramo2Fin.setDate(fechaVenc.getDate() + 30);

        const rango0a8 = `${formatShortDate(fechaVenc)} al ${formatShortDate(fTramo1Fin)}`;
        const rango9a30 = `${formatShortDate(fTramo2Ini)} al ${formatShortDate(fTramo2Fin)}`;

        let tramoStr = "Al día";
        let tramoClass = "tramo-al-dia";
        let tramoFilterKey = "al-dia";

        if (diasAtrasoMostrar >= 1 && diasAtrasoMostrar <= 8) {
            tramoStr = "Tramo 1 a 8 días";
            tramoClass = "tramo-1";
            tramoFilterKey = "tramo-1";
        } else if (diasAtrasoMostrar >= 9 && diasAtrasoMostrar <= 30) {
            tramoStr = "Tramo 9 a 30 días";
            tramoClass = "tramo-2";
            tramoFilterKey = "tramo-2";
        } else if (diasAtrasoMostrar > 30) {
            tramoStr = "Mayor a 30 días";
            tramoClass = "tramo-otro";
            tramoFilterKey = "tramo-otro";
        } else if (diasAtrasoRealHoy < 0) {
            const diasFaltan = Math.abs(diasAtrasoRealHoy);
            if (diasFaltan <= 3) {
                tramoStr = `⏰ Vence en ${diasFaltan} día(s)`;
                tramoClass = "tramo-1";
            } else {
                tramoStr = `Al día (vence en ${diasFaltan}d)`;
            }
        } else if (diasAtrasoRealHoy === 0) {
            tramoStr = "⏰ ¡VENCE HOY!";
            tramoClass = "tramo-2";
        }

        let detalleMoraHTML = `<div style="font-weight: bold; font-size: 1.1em;">${diasAtrasoMostrar}</div>`;
        if (nuevoEnSemana) {
            detalleMoraHTML += `<div style="font-size: 0.72em; color: #fff; background: #8e44ad; padding: 2px 5px; border-radius: 4px; margin-top: 3px; font-weight: bold; display: inline-block;">NUEVO ESTA SEMANA</div>`;
        } else if (diasTranscurridosDesdeReporte > 0) {
            if (entroAMoraDespues) {
                detalleMoraHTML += `<div style="font-size: 0.74em; color: #fff; background: #e74c3c; padding: 2px 5px; border-radius: 4px; margin-top: 3px; font-weight: bold; display: inline-block;">&#128680; PASÓ A MORA (Excel: ${diasAtrasoExcel}d)</div>`;
            } else if (diasAtrasoMostrar !== diasAtrasoExcel) {
                detalleMoraHTML += `<div style="font-size: 0.72em; color: #7f8c8d; margin-top: 2px;">En Excel: ${diasAtrasoExcel}d</div>`;
            }
        }

        // Ubicación para ruta de campo + Etiqueta de Reincidente
        let ubicacionHTML = "";
        if (distrito || direccion) {
            ubicacionHTML += `<div style="font-size: 0.76em; color: #1e8449; margin-top: 3px; font-weight: 600;">&#128205; ${distrito ? distrito + (direccion ? " - " : "") : ""}<span style="color:#555; font-weight:normal;">${direccion}</span></div>`;
        }
        if (mesesReincidencia.length > 0) {
            ubicacionHTML += `<div style="font-size: 0.72em; color: #8e44ad; background: #f5eef8; border: 1px solid #d7bde2; padding: 1px 5px; border-radius: 4px; margin-top: 3px; display: inline-block; font-weight: bold;">&#128260; Reincidente (${mesesReincidencia.join(", ")})</div>`;
        }

        let tramosFechasHTML = `
            <div style="margin-top: 5px; font-size: 0.78em; color: #555; font-weight: normal; line-height: 1.35; background: #f8f9fa; padding: 4px 6px; border-radius: 4px; border-left: 3px solid #bdc3c7;">
                <div><strong style="color:#e67e22;">0-8d:</strong> ${rango0a8}</div>
                <div><strong style="color:#c0392b;">9-30d:</strong> ${rango9a30}</div>
            </div>
        `;

        const horaActual = new Date().getHours();
        let saludo = horaActual >= 12 && horaActual < 19 ? "Buenas tardes" : (horaActual >= 19 ? "Buenas noches" : "Buenos días");
        let textoWhatsapp = `${saludo}, mi nombre es Jhunior Vargas, asesor de negocios de Agrobanco. Le escribo para comentarle que su préstamo `;
        if (diasAtrasoRealHoy < 0) {
            textoWhatsapp += `está próximo a vencer el día ${fechaMostrada} (en ${Math.abs(diasAtrasoRealHoy)} días). Por favor comunicarse conmigo para poder apoyarle con su pago puntual.`;
        } else if (diasAtrasoRealHoy === 0) {
            textoWhatsapp += `vence el día de HOY ${fechaMostrada}. Por favor comunicarse conmigo para confirmar su pago y evitar caer en mora.`;
        } else {
            textoWhatsapp += `cuenta con ${diasAtrasoMostrar} día(s) de atraso, porque venció el día ${fechaMostrada}. Por favor comunicarse conmigo de manera urgente para poder apoyarle.`;
        }
        
        let cleanPhone = String(celular).replace(/\D/g, "");
        let phoneWithCode = cleanPhone.length === 9 ? "51" + cleanPhone : cleanPhone;
        
        let celularHTML = celular;
        let botonesHTML = "";
        if (cleanPhone.length >= 7) {
            const urlWhatsapp = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(textoWhatsapp)}`;
            botonesHTML = `
                <div style="display:flex; gap:6px; justify-content:center; margin-bottom: 5px;">
                    <a href="tel:${cleanPhone}" class="btn-accion-llamar" title="Llamar" style="text-decoration:none; background-color:#3498db; color:white; padding:5px 8px; border-radius:5px; font-size:0.85em; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.15);">&#128222; Llamar</a>
                    <a href="${urlWhatsapp}" target="_blank" class="btn-accion-ws" title="WhatsApp" style="text-decoration:none; background-color:#25D366; color:white; padding:5px 8px; border-radius:5px; font-size:0.85em; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.15);">&#128172; WhatsApp</a>
                </div>
            `;
        }

        botonesHTML += `
            <label class="llamado-label" style="display:inline-flex; align-items:center; gap:4px; font-size:0.78em; cursor:pointer; padding:2px 6px; border-radius:4px; background:#f1f2f6; color:#57606f;">
                <input type="checkbox" class="llamado-chk"> <span class="llamado-text">Falta llamar</span>
            </label>
        `;

        const tr = document.createElement("tr");
        tr.dataset.dni = dni;
        tr.dataset.cliente = `${cliente} ${distrito} ${direccion}`.toLowerCase();
        tr.dataset.clienteNombre = String(cliente);
        tr.dataset.distrito = distrito || "SIN DISTRITO";
        tr.dataset.tramo = tramoFilterKey;
        tr.dataset.enMora = diasAtrasoMostrar >= 1 ? "si" : "no";
        tr.dataset.diasMora = diasAtrasoMostrar;
        tr.dataset.nuevoMora = entroAMoraDespues ? "si" : "no";
        tr.dataset.preventivaUrgente = esPreventivaUrgente ? "si" : "no";
        tr.dataset.reincidente = mesesReincidencia.length > 0 ? "si" : "no";
        tr.dataset.monto = monto;
        tr.dataset.montoOriginal = montoOriginal;
        tr.dataset.amortizacion = amortizacion;
        tr.dataset.phoneWithCode = phoneWithCode;
        tr.dataset.finTramo1 = formatShortDate(fTramo1Fin);

        if (entroAMoraDespues) {
            tr.classList.add("row-nuevo-mora");
        }

        tr.innerHTML = `
            <td>${dni}</td>
            <td>
                <strong>${cliente}</strong>
                ${ubicacionHTML}
            </td>
            <td>${celularHTML}</td>
            <td style="text-align:center;">${botonesHTML}</td>
            <td>${producto}</td>
            <td>${cuotas}</td>
            <td>${fechaMostrada}</td>
            <td>${detalleMoraHTML}</td>
            <td>${diasAtrasoCierre}</td>
            <td class="${tramoClass}">
                <div>${tramoStr}</div>
                ${tramosFechasHTML}
            </td>
            <td style="min-width: 185px;">
                <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
                    <span style="font-size:0.74em; color:#555; font-weight:bold;">&#128197; Promesa:</span>
                    <input type="date" class="fecha-promesa-input" style="padding:3px 5px; border:1px solid #bdc3c7; border-radius:4px; font-size:0.78em; flex:1; cursor:pointer;">
                </div>
                <div class="promesa-alerta-badge" style="display:none; font-size:0.73em; padding:2px 5px; border-radius:4px; margin-bottom:4px; font-weight:bold;"></div>
                <input type="text" class="compromiso-input" value="${limpiarTextoCompromiso(compromisoExcel)}" placeholder="Apunta el compromiso aquí...">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px;">
                    <div class="save-badge" style="font-size: 0.72em; color: #27ae60; min-height: 14px; opacity: 0; transition: opacity 0.2s;"></div>
                    ${cleanPhone.length >= 7 ? `<button type="button" class="btn-recordar-promesa" style="background:#f39c12; color:white; border:none; padding:2px 7px; border-radius:4px; font-size:0.72em; font-weight:bold; cursor:pointer;" title="Enviar recordatorio de compromiso por WhatsApp">&#128242; Recordar Pago</button>` : ""}
                </div>
            </td>
            <td style="${montoStyle}">${montoHTML}</td>
            <td class="cartas-td">
                <div class="alerta-foto-badge" style="display:none; font-size:0.72em; background:#fef5e7; color:#d35400; border:1px solid #f39c12; padding:2px 5px; border-radius:4px; margin-bottom:4px; font-weight:bold;"></div>
                <label class="carta-label" style="display:block; font-size:0.85em; cursor:pointer; margin-bottom:4px;" title="Rango: ${rango0a8}">
                    <input type="checkbox" class="carta-chk"> Carta 1 a 8 días <span style="display:block; font-size:0.85em; color:#7f8c8d; margin-left:18px;">(${rango0a8})</span>
                </label>
                <label class="carta-label" style="display:block; font-size:0.85em; cursor:pointer;" title="Rango: ${rango9a30}">
                    <input type="checkbox" class="carta-chk"> Carta 9 a 30 días <span style="display:block; font-size:0.85em; color:#7f8c8d; margin-left:18px;">(${rango9a30})</span>
                </label>
            </td>
            <td>
                <select class="status-select">
                    <option value="pendiente">Pendiente</option>
                    <option value="cancelo">Canceló</option>
                </select>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    if (clientesProcesados.length === 0) {
        mostrarEstadoVacioMes();
        return;
    }

    document.getElementById("summary-section").style.display = "flex";
    const filtersSection = document.getElementById("filters-section");
    if (filtersSection) filtersSection.style.display = "flex";
    const recSection = document.getElementById("recovery-section");
    if (recSection) recSection.style.display = "block";

    const cartaChks = document.querySelectorAll(".carta-chk");
    cartaChks.forEach(chk => {
        chk.addEventListener("change", function() {
            const label = this.closest("label");
            if (this.checked) {
                label.style.backgroundColor = "#d4e6f1"; 
                label.style.fontWeight = "bold";
                label.style.color = "#2980b9";
                label.style.padding = "2px 4px";
                label.style.borderRadius = "3px";
            } else {
                label.style.backgroundColor = "";
                label.style.fontWeight = "normal";
                label.style.color = "";
                label.style.padding = "0";
            }
        });
    });

    const trs = document.querySelectorAll("#table-body tr");
    trs.forEach(tr => {
        if (tr.querySelector(".empty-state")) return;
        const tds = tr.querySelectorAll("td");
        const dni = String(tds[0].innerText).trim();
        
        const btnLlamar = tds[3].querySelector(".btn-accion-llamar");
        const btnWs = tds[3].querySelector(".btn-accion-ws");
        const chkLlamado = tds[3].querySelector(".llamado-chk");
        const txtLlamado = tds[3].querySelector(".llamado-text");
        const lblLlamado = tds[3].querySelector(".llamado-label");

        const inputFechaProm = tds[10].querySelector(".fecha-promesa-input");
        const badgePromesa = tds[10].querySelector(".promesa-alerta-badge");
        const inputComp = tds[10].querySelector(".compromiso-input");
        const saveBadge = tds[10].querySelector(".save-badge");
        const btnRecordarProm = tds[10].querySelector(".btn-recordar-promesa");

        const badgeFoto = tds[12].querySelector(".alerta-foto-badge");
        const chks = tds[12].querySelectorAll("input[type='checkbox']");
        const selectEst = tds[13].querySelector("select");
        
        const saved = gestionesMesActual[dni];

        const actualizarAlertasVisualesFila = (estaLlamado, fechaStr = "") => {
            chkLlamado.checked = estaLlamado;
            const enMora = tr.dataset.enMora === "si";
            const diasMora = parseInt(tr.dataset.diasMora || "0", 10);
            const cancelado = selectEst.value === "cancelo";

            // 1. Indicador de llamada
            if (estaLlamado) {
                txtLlamado.textContent = fechaStr ? `✓ Llamado (${fechaStr})` : "✓ Ya llamado";
                lblLlamado.style.backgroundColor = "#d4efdf";
                lblLlamado.style.color = "#1e8449";
                lblLlamado.style.fontWeight = "bold";
                tr.classList.remove("row-urgente-sin-llamar");
            } else {
                txtLlamado.textContent = enMora && !cancelado ? "🚨 Falta llamar" : "Falta llamar";
                lblLlamado.style.backgroundColor = enMora && !cancelado ? "#fadbd8" : "#f1f2f6";
                lblLlamado.style.color = enMora && !cancelado ? "#c0392b" : "#57606f";
                lblLlamado.style.fontWeight = enMora && !cancelado ? "bold" : "normal";
                if (enMora && !cancelado) {
                    tr.classList.add("row-urgente-sin-llamar");
                } else {
                    tr.classList.remove("row-urgente-sin-llamar");
                }
            }

            // 2. Indicador de Fecha de Promesa de Pago
            const fProm = inputFechaProm.value;
            tr.dataset.promesaUrgente = "no";
            if (fProm && !cancelado) {
                if (fProm === hoyISO) {
                    badgePromesa.style.display = "block";
                    badgePromesa.style.backgroundColor = "#fef9e7";
                    badgePromesa.style.color = "#b7950b";
                    badgePromesa.style.border = "1px solid #f1c40f";
                    badgePromesa.innerHTML = `&#128176; ¡PROMESA PARA HOY!`;
                    tr.dataset.promesaUrgente = "si";
                } else if (fProm < hoyISO) {
                    badgePromesa.style.display = "block";
                    badgePromesa.style.backgroundColor = "#fdedec";
                    badgePromesa.style.color = "#c0392b";
                    badgePromesa.style.border = "1px solid #e74c3c";
                    badgePromesa.innerHTML = `&#9888; Promesa venció (${formatearISOaCorto(fProm)})`;
                    tr.dataset.promesaUrgente = "si";
                } else {
                    badgePromesa.style.display = "block";
                    badgePromesa.style.backgroundColor = "#eafaf1";
                    badgePromesa.style.color = "#1e8449";
                    badgePromesa.style.border = "1px solid #a9dfbf";
                    badgePromesa.innerHTML = `Promesa activa: ${formatearISOaCorto(fProm)}`;
                }
            } else {
                badgePromesa.style.display = "none";
            }

            // 3. Indicador de Plazo de Foto / Carta (Tramo 1-8d y 9-30d)
            tr.dataset.faltaFotoUrgente = "no";
            if (!cancelado && diasMora >= 5 && diasMora <= 8 && !chks[0].checked) {
                badgeFoto.style.display = "block";
                badgeFoto.innerHTML = `&#128248; ¡Urgente Foto 1-8d! (Cierra ${tr.dataset.finTramo1})`;
                tr.dataset.faltaFotoUrgente = "si";
            } else if (!cancelado && diasMora > 8 && !chks[0].checked) {
                badgeFoto.style.display = "block";
                badgeFoto.innerHTML = `&#128248; Falta marcar Carta/Foto 1-8d`;
                tr.dataset.faltaFotoUrgente = "si";
            } else if (!cancelado && diasMora >= 24 && !chks[1].checked) {
                badgeFoto.style.display = "block";
                badgeFoto.innerHTML = `&#128248; ¡Urgente Foto/Carta 9-30d!`;
                tr.dataset.faltaFotoUrgente = "si";
            } else {
                badgeFoto.style.display = "none";
            }
        };

        let fechaLlamadaActual = (saved && saved.fechaLlamada) ? saved.fechaLlamada : "";

        if (saved) {
            if (saved.compromiso !== undefined && saved.compromiso !== "") {
                inputComp.value = limpiarTextoCompromiso(saved.compromiso);
            }
            if (saved.fechaPromesa) {
                inputFechaProm.value = saved.fechaPromesa;
            }
            if (saved.carta1) { chks[0].checked = true; chks[0].dispatchEvent(new Event("change")); }
            if (saved.carta2) { chks[1].checked = true; chks[1].dispatchEvent(new Event("change")); }
            if (saved.estado) {
                selectEst.value = saved.estado;
                if (saved.estado === "cancelo") tr.classList.add("row-cancelo");
            }
        }

        const yaFueContactado = Boolean((saved && saved.llamado) || tieneCompromisoValido(inputComp.value) || Boolean(inputFechaProm.value));
        actualizarAlertasVisualesFila(yaFueContactado, fechaLlamadaActual);

        const registrarContacto = (forzarLlamado = null, inmediato = true) => {
            const estadoLlamado = forzarLlamado !== null ? forzarLlamado : (chkLlamado.checked || tieneCompromisoValido(inputComp.value) || Boolean(inputFechaProm.value));
            if (estadoLlamado && !fechaLlamadaActual) {
                fechaLlamadaActual = obtenerFechaHoraCorta();
            }
            if (forzarLlamado === true && !tieneCompromisoValido(inputComp.value)) {
                inputComp.value = `Llamado ${fechaLlamadaActual}`;
            }
            actualizarAlertasVisualesFila(estadoLlamado, fechaLlamadaActual);
            updateGestionEnNube(dni, inputComp.value, inputFechaProm.value, chks[0].checked, chks[1].checked, selectEst.value, estadoLlamado, fechaLlamadaActual, inmediato, saveBadge);
            recalcularResumen();
            aplicarFiltrosTabla();
        };

        if (btnLlamar) {
            btnLlamar.addEventListener("click", () => registrarContacto(true, true));
        }
        if (btnWs) {
            btnWs.addEventListener("click", () => registrarContacto(true, true));
        }
        chkLlamado.addEventListener("change", () => {
            if (!chkLlamado.checked && inputComp.value.startsWith("Llamado ")) {
                inputComp.value = "-";
            }
            registrarContacto(chkLlamado.checked, true);
        });

        inputFechaProm.addEventListener("change", () => {
            if (inputFechaProm.value && !fechaLlamadaActual) {
                fechaLlamadaActual = obtenerFechaHoraCorta();
            }
            const nuevoLlamado = chkLlamado.checked || Boolean(inputFechaProm.value) || tieneCompromisoValido(inputComp.value);
            actualizarAlertasVisualesFila(nuevoLlamado, fechaLlamadaActual);
            updateGestionEnNube(dni, inputComp.value, inputFechaProm.value, chks[0].checked, chks[1].checked, selectEst.value, nuevoLlamado, fechaLlamadaActual, true, saveBadge);
            recalcularResumen();
            aplicarFiltrosTabla();
        });

        if (btnRecordarProm) {
            btnRecordarProm.addEventListener("click", () => {
                const nombreCli = tr.dataset.clienteNombre || "Cliente";
                const montoCli = `$${(parseFloat(tr.dataset.monto || "0") || 0).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                const fPromTexto = inputFechaProm.value ? `el día ${formatearISOaCorto(inputFechaProm.value)}` : "en la fecha acordada";
                const notaComp = tieneCompromisoValido(inputComp.value) ? ` (${inputComp.value})` : "";
                const msg = `Hola Sr(a). ${nombreCli}, le saluda Jhunior Vargas, asesor de negocios de Agrobanco. Le escribo para recordarle su compromiso de pago acordado para ${fPromTexto}${notaComp} por el monto de ${montoCli}. Quedo atento al envío de su voucher de pago para registrar su abono. Muchas gracias.`;
                const url = `https://wa.me/${tr.dataset.phoneWithCode}?text=${encodeURIComponent(msg)}`;
                registrarContacto(true, true);
                window.open(url, "_blank");
            });
        }

        inputComp.addEventListener("input", () => {
            const tieneComp = tieneCompromisoValido(inputComp.value);
            if (tieneComp && !chkLlamado.checked) {
                if (!fechaLlamadaActual) fechaLlamadaActual = obtenerFechaHoraCorta();
                actualizarAlertasVisualesFila(true, fechaLlamadaActual);
            }
            updateGestionEnNube(dni, inputComp.value, inputFechaProm.value, chks[0].checked, chks[1].checked, selectEst.value, chkLlamado.checked || tieneComp, fechaLlamadaActual, false, saveBadge);
            recalcularResumen();
        });
        inputComp.addEventListener("blur", () => {
            const tieneComp = tieneCompromisoValido(inputComp.value);
            updateGestionEnNube(dni, inputComp.value, inputFechaProm.value, chks[0].checked, chks[1].checked, selectEst.value, chkLlamado.checked || tieneComp, fechaLlamadaActual, true, saveBadge);
            recalcularResumen();
        });
        chks[0].addEventListener("change", () => {
            actualizarAlertasVisualesFila(chkLlamado.checked, fechaLlamadaActual);
            updateGestionEnNube(dni, inputComp.value, inputFechaProm.value, chks[0].checked, chks[1].checked, selectEst.value, chkLlamado.checked, fechaLlamadaActual, true, saveBadge);
            recalcularResumen();
            aplicarFiltrosTabla();
        });
        chks[1].addEventListener("change", () => {
            actualizarAlertasVisualesFila(chkLlamado.checked, fechaLlamadaActual);
            updateGestionEnNube(dni, inputComp.value, inputFechaProm.value, chks[0].checked, chks[1].checked, selectEst.value, chkLlamado.checked, fechaLlamadaActual, true, saveBadge);
            recalcularResumen();
            aplicarFiltrosTabla();
        });
        selectEst.addEventListener("change", () => {
            if (selectEst.value === "cancelo") tr.classList.add("row-cancelo");
            else tr.classList.remove("row-cancelo");
            actualizarAlertasVisualesFila(chkLlamado.checked, fechaLlamadaActual);
            updateGestionEnNube(dni, inputComp.value, inputFechaProm.value, chks[0].checked, chks[1].checked, selectEst.value, chkLlamado.checked, fechaLlamadaActual, true, saveBadge);
            recalcularResumen();
            aplicarFiltrosTabla();
        });
    });

    recalcularResumen();
    aplicarFiltrosTabla();

    const btnExport = document.getElementById("btn-export");
    btnExport.style.display = "inline-block";
    btnExport.onclick = () => {
        const ws_data = [];
        ws_data.push(["Mes", "DNI", "Cliente", "Distrito", "Dirección / Caserío", "Teléfono", "Contactado", "Producto", "N° Cuotas", "Vencimiento", "Días Mora Actual", "Días Mora Cierre", "Tramo de Visita", "Fechas Tramo 0-8 días", "Fechas Tramo 9-30 días", "Fecha Promesa Pago", "Compromiso de Pago", "Monto Adeudado", "Carta 1 a 8 días", "Carta 9 a 30 días", "Estado"]);
        
        const rowsToExport = document.querySelectorAll("#table-body tr");
        rowsToExport.forEach(tr => {
            if(tr.querySelector(".empty-state") || tr.style.display === "none") return;
            const tds = tr.querySelectorAll("td");
            
            const dni = tds[0].innerText.trim();
            const cli = tr.dataset.clienteNombre || tds[1].innerText.split("\n")[0].trim();
            const dist = tr.dataset.distrito || "";
            const dir = tds[1].innerText.split("\n")[1] || "";
            const tel = tds[2].innerText.trim();
            const chkLlam = tds[3].querySelector(".llamado-chk");
            const contactado = (chkLlam && chkLlam.checked) ? "Sí" : "No";
            const prod = tds[4].innerText.trim();
            const cuo = tds[5].innerText.trim();
            const ven = tds[6].innerText.trim();
            const ma = tds[7].innerText.split("\n")[0].trim();
            const mc = tds[8].innerText.trim();
            const tramLines = tds[9].innerText.split("\n").map(s => s.trim()).filter(Boolean);
            const tram = tramLines[0] || "";
            const f0a8 = (tramLines[1] || "").replace("0-8d:", "").trim();
            const f9a30 = (tramLines[2] || "").replace("9-30d:", "").trim();
            const fProm = tds[10].querySelector(".fecha-promesa-input")?.value || "";
            const comp = tds[10].querySelector(".compromiso-input").value;
            const montoArr = tds[11].innerText.split("\n");
            const monto = montoArr[montoArr.length - 1].trim();
            const chks = tds[12].querySelectorAll("input[type='checkbox']");
            const c1 = chks[0].checked ? "Sí" : "No";
            const c2 = chks[1].checked ? "Sí" : "No";
            const est = tds[13].querySelector("select").value;
            
            ws_data.push([obtenerNombreMesAnio(), dni, cli, dist, dir, tel, contactado, prod, cuo, ven, ma, mc, tram, f0a8, f9a30, fProm, comp, monto, c1, c2, est]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Mora_${NOMBRES_MESES[mesSeleccionado]}_${anioSeleccionado}`);
        XLSX.writeFile(wb, `Mora_${NOMBRES_MESES[mesSeleccionado]}_${anioSeleccionado}.xlsx`);
    };
}

function recalcularResumen() {
    let totalMontoPendiente = 0;
    let totalCarteraMes = 0;
    let totalRecuperadoMes = 0;

    let tramo1Count = 0;
    let tramo2Count = 0;
    let sinLlamarMoraCount = 0;
    let promesasHoyCount = 0;
    let faltaFotoCount = 0;
    let preventivaUrgenteCount = 0;

    const nombresSinLlamar = [];
    const nombresNuevosMora = [];
    const nombresPromesasHoy = [];
    const nombresFaltaFoto = [];

    const trs = document.querySelectorAll("#table-body tr");
    trs.forEach(tr => {
        if (tr.querySelector(".empty-state")) return;
        const selectEst = tr.querySelector(".status-select");
        const cancelado = selectEst && selectEst.value === "cancelo";

        const montoOriginal = parseFloat(tr.dataset.montoOriginal || tr.dataset.monto || "0") || 0;
        const amortizacion = parseFloat(tr.dataset.amortizacion || "0") || 0;
        const montoActual = parseFloat(tr.dataset.monto || "0") || 0;

        totalCarteraMes += montoOriginal;
        if (cancelado) {
            totalRecuperadoMes += montoOriginal;
            return;
        } else {
            totalRecuperadoMes += amortizacion;
        }

        const tramo = tr.dataset.tramo;
        const enMora = tr.dataset.enMora === "si";
        const nuevoMora = tr.dataset.nuevoMora === "si";
        const prevUrgente = tr.dataset.preventivaUrgente === "si";
        const promUrgente = tr.dataset.promesaUrgente === "si";
        const fotoUrgente = tr.dataset.faltaFotoUrgente === "si";
        const chkLlamado = tr.querySelector(".llamado-chk");
        const llamado = chkLlamado && chkLlamado.checked;
        const nombre = tr.dataset.clienteNombre || "";
        const diasMora = tr.dataset.diasMora || "0";

        totalMontoPendiente += montoActual;
        if (tramo === "tramo-1") tramo1Count++;
        else if (tramo === "tramo-2") tramo2Count++;

        if (enMora && !llamado) {
            sinLlamarMoraCount++;
            nombresSinLlamar.push(`${nombre} (${diasMora}d)`);
        }
        if (nuevoMora && !llamado) {
            nombresNuevosMora.push(`${nombre} (${diasMora}d)`);
        }
        if (promUrgente) {
            promesasHoyCount++;
            nombresPromesasHoy.push(nombre);
        }
        if (fotoUrgente) {
            faltaFotoCount++;
            nombresFaltaFoto.push(`${nombre} (${diasMora}d)`);
        }
        if (prevUrgente && !llamado) {
            preventivaUrgenteCount++;
        }
    });

    // Actualizar barra de recuperación del mes
    const pctRecuperado = totalCarteraMes > 0 ? Math.min(100, Math.round((totalRecuperadoMes / totalCarteraMes) * 100)) : 0;
    const recMonthLabel = document.getElementById("recovery-month-label");
    if (recMonthLabel) recMonthLabel.textContent = obtenerNombreMesAnio();
    const recTotalEl = document.getElementById("rec-total-mes");
    if (recTotalEl) recTotalEl.textContent = `$${totalCarteraMes.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const recRecupEl = document.getElementById("rec-recuperado-mes");
    if (recRecupEl) recRecupEl.textContent = `$${totalRecuperadoMes.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${pctRecuperado}%)`;
    const recPendEl = document.getElementById("rec-pendiente-mes");
    if (recPendEl) recPendEl.textContent = `$${totalMontoPendiente.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const recBar = document.getElementById("rec-progress-bar");
    if (recBar) recBar.style.width = `${pctRecuperado}%`;

    // Actualizar tarjetas
    document.getElementById("total-monto").textContent = `$${totalMontoPendiente.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById("total-tramo-1").textContent = tramo1Count;
    document.getElementById("total-tramo-2").textContent = tramo2Count;

    const elSinLlamar = document.getElementById("total-sin-llamar");
    if (elSinLlamar) elSinLlamar.textContent = sinLlamarMoraCount;

    const elPromHoy = document.getElementById("total-promesas-hoy");
    if (elPromHoy) elPromHoy.textContent = promesasHoyCount;

    const elPreventiva = document.getElementById("total-preventiva");
    if (elPreventiva) elPreventiva.textContent = preventivaUrgenteCount;

    // Botones del banner de alerta
    const countSinLlamarBtn = document.getElementById("count-sin-llamar");
    if (countSinLlamarBtn) countSinLlamarBtn.textContent = sinLlamarMoraCount;
    const countPromBtn = document.getElementById("count-promesas-hoy");
    if (countPromBtn) countPromBtn.textContent = promesasHoyCount;
    const countFotoBtn = document.getElementById("count-falta-foto");
    if (countFotoBtn) countFotoBtn.textContent = faltaFotoCount;
    const countPrevBtn = document.getElementById("count-preventiva-urgente");
    if (countPrevBtn) countPrevBtn.textContent = preventivaUrgenteCount;

    const alertsBanner = document.getElementById("alerts-banner");
    const alertsDetail = document.getElementById("alerts-detail");
    if (alertsBanner && alertsDetail) {
        if (sinLlamarMoraCount > 0 || promesasHoyCount > 0 || faltaFotoCount > 0 || preventivaUrgenteCount > 0) {
            alertsBanner.style.display = "block";
            let htmlAlertas = "";
            if (nombresNuevosMora.length > 0) {
                htmlAlertas += `<div><strong style="color:#c0392b;">&#9888; ¡NUEVOS EN MORA SIN LLAMAR (${nombresNuevosMora.length})!:</strong> ${nombresNuevosMora.slice(0, 5).join(", ")}${nombresNuevosMora.length > 5 ? "..." : ""}</div>`;
            }
            if (sinLlamarMoraCount > 0) {
                htmlAlertas += `<div><strong style="color:#e74c3c;">&#128222; En mora SIN LLAMAR (${sinLlamarMoraCount}):</strong> ${nombresSinLlamar.slice(0, 5).join(", ")}${nombresSinLlamar.length > 5 ? "..." : ""}</div>`;
            }
            if (promesasHoyCount > 0) {
                htmlAlertas += `<div><strong style="color:#b7950b;">&#128176; Promesas de Pago para HOY o Vencidas (${promesasHoyCount}):</strong> ${nombresPromesasHoy.slice(0, 5).join(", ")}${nombresPromesasHoy.length > 5 ? "..." : ""} — ¡Envíales recordatorio de voucher!</div>`;
            }
            if (faltaFotoCount > 0) {
                htmlAlertas += `<div><strong style="color:#d35400;">&#128248; Urgente Tomar Foto / Marcar Carta (${faltaFotoCount}):</strong> ${nombresFaltaFoto.slice(0, 5).join(", ")}${nombresFaltaFoto.length > 5 ? "..." : ""}</div>`;
            }
            if (preventivaUrgenteCount > 0) {
                htmlAlertas += `<div><strong style="color:#2980b9;">&#9200; Preventiva:</strong> Tienes <strong>${preventivaUrgenteCount} cliente(s)</strong> que vencen HOY o en 1 a 3 días.</div>`;
            }
            alertsDetail.innerHTML = htmlAlertas;
        } else {
            alertsBanner.style.display = "none";
        }
    }
}

function aplicarFiltrosTabla() {
    const searchVal = (document.getElementById("filter-search")?.value || "").toLowerCase().trim();
    const distritoVal = document.getElementById("filter-distrito")?.value || "todos";
    const tramoVal = document.getElementById("filter-tramo")?.value || "todos";
    const estadoVal = document.getElementById("filter-estado")?.value || "todos";

    const trs = document.querySelectorAll("#table-body tr");
    trs.forEach(tr => {
        if (tr.querySelector(".empty-state")) return;

        const dni = (tr.dataset.dni || "").toLowerCase();
        const cliente = (tr.dataset.cliente || "").toLowerCase();
        const distrito = tr.dataset.distrito || "SIN DISTRITO";
        const tramo = tr.dataset.tramo || "";
        const enMora = tr.dataset.enMora === "si";
        const nuevoMora = tr.dataset.nuevoMora === "si";
        const prevUrgente = tr.dataset.preventivaUrgente === "si";
        const promUrgente = tr.dataset.promesaUrgente === "si";
        const fotoUrgente = tr.dataset.faltaFotoUrgente === "si";
        const reincidente = tr.dataset.reincidente === "si";
        const chkLlamado = tr.querySelector(".llamado-chk");
        const llamado = chkLlamado && chkLlamado.checked;
        const estado = tr.querySelector(".status-select")?.value || "pendiente";

        const matchSearch = !searchVal || dni.includes(searchVal) || cliente.includes(searchVal);
        const matchDistrito = (distritoVal === "todos") || (distrito === distritoVal);

        let matchTramo = true;
        if (tramoVal === "sin-llamar-mora") matchTramo = (enMora && !llamado && estado !== "cancelo");
        else if (tramoVal === "promesas-hoy") matchTramo = (promUrgente && estado !== "cancelo");
        else if (tramoVal === "falta-foto-urgente") matchTramo = (fotoUrgente && estado !== "cancelo");
        else if (tramoVal === "reincidentes") matchTramo = reincidente;
        else if (tramoVal === "nuevos-mora") matchTramo = nuevoMora;
        else if (tramoVal === "preventiva-urgente") matchTramo = prevUrgente;
        else if (tramoVal === "en-mora") matchTramo = enMora;
        else if (tramoVal !== "todos") matchTramo = (tramo === tramoVal);

        const matchEstado = (estadoVal === "todos") || (estado === estadoVal);

        tr.style.display = (matchSearch && matchDistrito && matchTramo && matchEstado) ? "" : "none";
    });
}
