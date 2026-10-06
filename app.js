const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz8FX1qyTUnQKP0MZ3mEH5uU_tmqBSIRdlyeqRxhhR_SBPOn6io6ROg64gWtvkVMAvz/exec";

let gestionesGlobal = {};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-sync").addEventListener("click", syncData);
    document.getElementById("excel-file").addEventListener("change", handleFile, false);
    syncData();
});

function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById("sync-status");
    statusEl.textContent = "Leyendo Excel...";
    statusEl.style.color = "#f39c12";

    const reader = new FileReader();
    reader.onload = async function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        statusEl.textContent = "Subiendo a la nube (esto puede tardar unos segundos)...";
        
        try {
            // Actualizar la interfaz inmediatamente con los datos locales
            processData(rows);

            await fetch(SCRIPT_URL, {
                method: "POST",
                mode: "no-cors",
                body: JSON.stringify({ action: "upload_data", data: rows })
            });
            
            statusEl.textContent = "¡Base de datos enviada y actualizada!";
            statusEl.style.color = "#27ae60";
            
            // Sincronizar de todos modos para obtener posibles gestiones nuevas
            setTimeout(syncData, 3000);
        } catch(err) {
            console.error(err);
            statusEl.textContent = "Error al subir a la nube.";
            statusEl.style.color = "#e74c3c";
        }
    };
    reader.readAsArrayBuffer(file);
}

async function syncData() {
    const statusEl = document.getElementById("sync-status");
    statusEl.textContent = "Sincronizando...";
    statusEl.style.color = "#f39c12";

    try {
        const urlNoCache = SCRIPT_URL + "?t=" + new Date().getTime();
        const response = await fetch(urlNoCache);
        const json = await response.json();
        
        gestionesGlobal = json.gestiones || {};
        const rows = json.data || [];
        
        if (rows.length > 0 && Array.isArray(rows[0])) {
            processData(rows);
            statusEl.textContent = "Sincronizado";
            statusEl.style.color = "#27ae60";
        } else {
            statusEl.textContent = "Sin datos. Pega tu Excel en la hoja Data de Google Sheets.";
            statusEl.style.color = "#e74c3c";
        }
    } catch(err) {
        console.error(err);
        statusEl.textContent = "Error de conexion";
        statusEl.style.color = "#e74c3c";
    }
}

async function updateGestionEnNube(dni, compromiso, carta1, carta2, estado) {
    if (!gestionesGlobal[dni]) gestionesGlobal[dni] = {};
    gestionesGlobal[dni].compromiso = compromiso;
    gestionesGlobal[dni].carta1 = carta1;
    gestionesGlobal[dni].carta2 = carta2;
    gestionesGlobal[dni].estado = estado;

    const url = new URL(SCRIPT_URL);
    url.searchParams.append("action", "update");
    url.searchParams.append("dni", dni);
    url.searchParams.append("compromiso", compromiso);
    url.searchParams.append("carta1", carta1);
    url.searchParams.append("carta2", carta2);
    url.searchParams.append("estado", estado);

    try {
        await fetch(url.toString(), { method: "GET" });
    } catch(err) {
        console.error("Error guardando gestion:", err);
    }
}

function processData(rows) {
    if (rows.length === 0) {
        alert("El archivo parece estar vacío.");
        return;
    }

    const tableBody = document.getElementById("table-body");
    tableBody.innerHTML = "";

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        if(!Array.isArray(rows[i])) continue;
        const rowStrings = rows[i].map(c => String(c).toUpperCase());
        if (rowStrings.some(cell => cell.includes("NOMBRE_CLIENTE") || cell.includes("CLIENTE"))) {
            headerRowIndex = i;
            break;
        }
    }

    const headers = rows[headerRowIndex].map(h => String(h).toLowerCase().trim());
    const dataRows = rows.slice(headerRowIndex + 1);

    const findExact = (exactNames) => {
        return headers.findIndex(h => exactNames.includes(h));
    };

    let idxCliente = findExact(["nombre_cliente", "cliente"]);
    let idxVencimiento = findExact(["fecha compromiso", "vencimiento"]); 
    let idxMonto = findExact(["saldo inicial", "monto adeudado"]);
    let idxCompromiso = findExact(["compromiso", "compromiso de pago"]);
    let idxAsesor = findExact(["oficial negocios actual", "asesor"]);
    let idxProceso = findExact(["fecha de proceso", "proceso"]); 
    let idxDiasMora = findExact(["dias de mora actual", "días mora actual", "das mora actual"]);
    let idxDiasMoraCierre = findExact(["dias de mora al cierre", "días mora cierre", "das mora cierre"]);
    let idxDni = findExact(["numero_documento", "dni"]);
    let idxCelular = findExact(["celular_3", "telefono", "celular"]);
    let idxAmortizacion = findExact(["amortizacion"]);
    let idxProducto = findExact(["producto_trt", "producto"]);
    let idxCuotas = findExact(["nro cuotas", "cuotas"]);
    let idxAgencia = findExact(["agencia"]);

    if (idxCliente === -1) idxCliente = 0;
    if (idxVencimiento === -1) idxVencimiento = 1;
    if (idxMonto === -1) idxMonto = 2;

    let datosFiltrados = dataRows.filter(row => row.length > 0 && row.some(cell => cell !== ""));
    
    if (idxAsesor !== -1 || idxAgencia !== -1) {
        datosFiltrados = datosFiltrados.filter(row => {
            const asesor = idxAsesor !== -1 ? String(row[idxAsesor] || "").toUpperCase() : "";
            const agencia = idxAgencia !== -1 ? String(row[idxAgencia] || "").toUpperCase() : "";
            const matchAsesor = idxAsesor === -1 || (asesor.includes("JHUNIOR") && asesor.includes("VARGAS"));
            const matchAgencia = idxAgencia === -1 || agencia.includes("NORTE");
            return matchAsesor && matchAgencia;
        });
    }

    let totalMonto = 0;
    let tramo1Count = 0; 
    let tramo2Count = 0; 
    let tramo3Count = 0; 

    const fechaActual = new Date();
    const fechaFallback = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 0);
    fechaFallback.setHours(0,0,0,0);

    datosFiltrados.forEach(row => {
        const dni = idxDni !== -1 ? (row[idxDni] || "-") : "-";
        const cliente = row[idxCliente] || "-";
        const celular = idxCelular !== -1 ? (row[idxCelular] || "-") : "-";
        const producto = idxProducto !== -1 ? (row[idxProducto] || "-") : "-";
        const cuotas = idxCuotas !== -1 ? (row[idxCuotas] || "-") : "-";
        let procesoVal = idxProceso !== -1 ? row[idxProceso] : null;
        const compromiso = idxCompromiso !== -1 ? (row[idxCompromiso] || "-") : "-";
        
        let montoOriginal = parseFloat(String(row[idxMonto]).replace(/[^0-9.-]+/g,"")) || 0;
        let amortizacion = idxAmortizacion !== -1 ? (parseFloat(String(row[idxAmortizacion]).replace(/[^0-9.-]+/g,"")) || 0) : 0;
        
        let monto = montoOriginal - amortizacion;
        if (monto < 0) monto = 0; 
        totalMonto += monto;
        
        let montoStyle = "text-align: right;";
        let montoHTML = `$${monto.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (amortizacion > 0) {
            montoStyle = "background-color: #eafaf1; border-radius: 4px; padding: 5px; text-align: right;"; 
            montoHTML = `
                <div style="font-size: 0.8em; color: #7f8c8d; text-decoration: line-through;">$${montoOriginal.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div style="font-size: 0.85em; color: #e74c3c; margin-bottom: 2px;">- $${amortizacion.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div style="color: #27ae60; font-weight: bold; font-size: 1.05em;">$${monto.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            `;
        }

        let diasAtrasoActual = 0;
        let diasAtrasoCierre = 0; 
        let tramoStr = "Al día";
        let tramoClass = "tramo-al-dia";
        let fechaMostrada = "-";

        let fechaBase = new Date(fechaFallback);
        if (procesoVal) {
            let parsedProceso = new Date(procesoVal);
            if (!isNaN(parsedProceso)) fechaBase = parsedProceso;
        }
        fechaBase.setHours(0,0,0,0);

        let diasAtrasoActualRaw = idxDiasMora !== -1 ? (parseInt(row[idxDiasMora], 10) || 0) : 0;
        diasAtrasoActual = diasAtrasoActualRaw;
        
        let fechaVenc = new Date(fechaBase);
        fechaVenc.setDate(fechaBase.getDate() - diasAtrasoActualRaw);
        fechaMostrada = fechaVenc.toLocaleDateString();

        diasAtrasoCierre = idxDiasMoraCierre !== -1 && row[idxDiasMoraCierre] !== "" ? (parseInt(row[idxDiasMoraCierre], 10) || 0) : "-";
        if (diasAtrasoActual < 0) diasAtrasoActual = 0;

        if (diasAtrasoActual >= 1 && diasAtrasoActual <= 8) {
            tramoStr = "Tramo 1 a 8 días";
            tramoClass = "tramo-1";
            tramo1Count++;
        } else if (diasAtrasoActual >= 9 && diasAtrasoActual <= 30) {
            tramoStr = "Tramo 9 a 30 días";
            tramoClass = "tramo-2";
            tramo2Count++;
        } else if (diasAtrasoActual > 30) {
            tramoStr = "Mayor a 30 días";
            tramoClass = "tramo-otro";
            tramo3Count++;
        }

        const horaActual = new Date().getHours();
        let saludo = horaActual >= 12 && horaActual < 19 ? "Buenas tardes" : (horaActual >= 19 ? "Buenas noches" : "Buenos días");
        let textoWhatsapp = `${saludo}, mi nombre es Jhunior Vargas, asesor de negocios de Agrobanco. Le escribo para comentarle que su préstamo `;
        if (diasAtrasoActualRaw <= 0) {
            textoWhatsapp += `está próximo a vencer el día ${fechaMostrada}. Por favor comunicarse conmigo para poder apoyarle.`;
        } else {
            textoWhatsapp += `cuenta con ${diasAtrasoActualRaw} días de atraso, porque venció el día ${fechaMostrada}. Por favor comunicarse conmigo para poder apoyarle.`;
        }
        
        let cleanPhone = String(celular).replace(/\D/g, "");
        let phoneWithCode = cleanPhone.length === 9 ? "51" + cleanPhone : cleanPhone;
        
        let celularHTML = celular;
        let botonesHTML = "";
        if (cleanPhone.length >= 7) {
            const urlWhatsapp = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(textoWhatsapp)}`;
            botonesHTML = `
                <div style="display:flex; gap:8px; justify-content:center;">
                    <a href="tel:${cleanPhone}" title="Llamar" style="text-decoration:none; background-color:#3498db; color:white; padding:5px 10px; border-radius:5px; font-size:0.9em; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.2);">&#128222; Llamar</a>
                    <a href="${urlWhatsapp}" target="_blank" title="WhatsApp" style="text-decoration:none; background-color:#25D366; color:white; padding:5px 10px; border-radius:5px; font-size:0.9em; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.2);">&#128172; WhatsApp</a>
                </div>
            `;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${dni}</td>
            <td>${cliente}</td>
            <td>${celularHTML}</td>
            <td>${botonesHTML}</td>
            <td>${producto}</td>
            <td>${cuotas}</td>
            <td>${fechaMostrada}</td>
            <td>${diasAtrasoActual}</td>
            <td>${diasAtrasoCierre}</td>
            <td class="${tramoClass}">${tramoStr}</td>
            <td><input type="text" class="compromiso-input" value="${compromiso}" placeholder="Escribe aquí..."></td>
            <td style="${montoStyle}">${montoHTML}</td>
            <td class="cartas-td">
                <label class="carta-label" style="display:block; font-size:0.85em; cursor:pointer; margin-bottom:4px;">
                    <input type="checkbox" class="carta-chk"> Carta 1 a 8 días
                </label>
                <label class="carta-label" style="display:block; font-size:0.85em; cursor:pointer;">
                    <input type="checkbox" class="carta-chk"> Carta 9 a 30 días
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

    if (datosFiltrados.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="14" class="empty-state">No se encontraron datos para mostrar.</td>`;
        tableBody.appendChild(tr);
    }

    document.getElementById("total-monto").textContent = `$${totalMonto.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById("total-tramo-1").textContent = tramo1Count;
    document.getElementById("total-tramo-2").textContent = tramo2Count;
    document.getElementById("total-tramo-3").textContent = tramo3Count;
    document.getElementById("summary-section").style.display = "flex";

    const selects = document.querySelectorAll(".status-select");
    selects.forEach(select => {
        select.addEventListener("change", function() {
            const tr = this.closest("tr");
            if (this.value === "cancelo") tr.classList.add("row-cancelo");
            else tr.classList.remove("row-cancelo");
        });
    });

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
        const dni = tds[0].innerText;
        
        const inputComp = tds[10].querySelector("input");
        const chks = tds[12].querySelectorAll("input[type='checkbox']");
        const selectEst = tds[13].querySelector("select");
        
        const saved = gestionesGlobal[dni];
        if (saved) {
            if (saved.compromiso) inputComp.value = saved.compromiso;
            if (saved.carta1) { chks[0].checked = true; chks[0].dispatchEvent(new Event("change")); }
            if (saved.carta2) { chks[1].checked = true; chks[1].dispatchEvent(new Event("change")); }
            if (saved.estado) { selectEst.value = saved.estado; selectEst.dispatchEvent(new Event("change")); }
        }
        
        const saveState = () => {
            updateGestionEnNube(dni, inputComp.value, chks[0].checked, chks[1].checked, selectEst.value);
        };
        
        inputComp.addEventListener("input", saveState);
        chks[0].addEventListener("change", saveState);
        chks[1].addEventListener("change", saveState);
        selectEst.addEventListener("change", saveState);
    });

    const btnExport = document.getElementById("btn-export");
    btnExport.style.display = "inline-block";
    btnExport.onclick = () => {
        const ws_data = [];
        ws_data.push(["DNI", "Cliente", "Teléfono", "Producto", "N° Cuotas", "Vencimiento", "Días Mora Actual", "Días Mora Cierre", "Tramo de Visita", "Compromiso de Pago", "Monto Adeudado", "Carta 1 a 8 días", "Carta 9 a 30 días", "Estado"]);
        
        const rowsToExport = document.querySelectorAll("#table-body tr");
        rowsToExport.forEach(tr => {
            if(tr.querySelector(".empty-state")) return;
            const tds = tr.querySelectorAll("td");
            
            const dni = tds[0].innerText;
            const cli = tds[1].innerText;
            const tel = tds[2].innerText;
            const prod = tds[4].innerText;
            const cuo = tds[5].innerText;
            const ven = tds[6].innerText;
            const ma = tds[7].innerText;
            const mc = tds[8].innerText;
            const tram = tds[9].innerText;
            const comp = tds[10].querySelector("input").value;
            const montoArr = tds[11].innerText.split("\n");
            const monto = montoArr[montoArr.length - 1].trim();
            const chks = tds[12].querySelectorAll("input[type='checkbox']");
            const c1 = chks[0].checked ? "Sí" : "No";
            const c2 = chks[1].checked ? "Sí" : "No";
            const est = tds[13].querySelector("select").value;
            
            ws_data.push([dni, cli, tel, prod, cuo, ven, ma, mc, tram, comp, monto, c1, c2, est]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Gestión Mora");
        XLSX.writeFile(wb, "Gestion_Actualizada.xlsx");
    };
}