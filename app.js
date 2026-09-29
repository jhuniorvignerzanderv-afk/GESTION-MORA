document.getElementById('excel-file').addEventListener('change', handleFile, false);

function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Leer como arreglo 2D (array de arrays) para buscar el encabezado manualmente
        let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        try {
            localStorage.setItem('mora_last_rows', JSON.stringify(rows));
        } catch(err) {
            console.warn("No se pudo guardar en local, tal vez es muy pesado", err);
        }

        processData(rows);
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const savedRows = localStorage.getItem('mora_last_rows');
        if (savedRows) {
            const rows = JSON.parse(savedRows);
            if (rows && rows.length > 0) {
                document.getElementById('file-name').textContent = "Cargado de memoria 💾";
                processData(rows);
            }
        }
    } catch(err) {
        console.warn("No se pudo cargar de memoria", err);
    }
});

function processData(rows) {
    if (rows.length === 0) {
        alert("El archivo parece estar vacío.");
        return;
    }

    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '';

    // Buscar la fila de encabezados (buscamos NOMBRE_CLIENTE o la fila con más columnas llenas)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const rowStrings = rows[i].map(c => String(c).toUpperCase());
        if (rowStrings.some(cell => cell.includes('NOMBRE_CLIENTE') || cell.includes('CLIENTE'))) {
            headerRowIndex = i;
            break;
        }
    }

    const headers = rows[headerRowIndex].map(h => String(h).toLowerCase());
    const dataRows = rows.slice(headerRowIndex + 1);

    // Limpiar encabezados de espacios extra
    const cleanHeaders = headers.map(h => h.trim());

    // Encontrar índices de columnas exactas usando los nombres que nos dio el usuario
    const findExact = (exactNames) => {
        return cleanHeaders.findIndex(h => exactNames.includes(h));
    };

    let idxCliente = findExact(['nombre_cliente']);
    let idxVencimiento = findExact(['fecha compromiso']); // O ajustarlo al que uses para vencimiento
    let idxMonto = findExact(['saldo inicial']);
    let idxCompromiso = findExact(['compromiso']);
    let idxAsesor = findExact(['oficial negocios actual']);
    let idxProceso = findExact(['fecha de proceso', 'proceso']); 
    let idxDiasMora = findExact(['dias de mora actual', 'días mora actual']);
    let idxDiasMoraCierre = findExact(['dias de mora al cierre', 'días mora cierre']);
    let idxDni = findExact(['numero_documento']);
    let idxCelular = findExact(['celular_3']);
    let idxAmortizacion = findExact(['amortizacion']);
    let idxProducto = findExact(['producto_trt']);
    let idxCuotas = findExact(['nro cuotas']);

    // Fallbacks
    if (idxCliente === -1) idxCliente = 0;
    if (idxVencimiento === -1) idxVencimiento = 1;
    if (idxMonto === -1) idxMonto = 2;

    // Filtrar por asesor
    let datosFiltrados = dataRows;
    if (idxAsesor !== -1) {
        datosFiltrados = dataRows.filter(row => {
            const asesor = String(row[idxAsesor] || '').toUpperCase();
            return asesor.includes('JHUNIOR') && asesor.includes('VARGAS');
        });
    }

    let totalMonto = 0;
    let tramo1Count = 0; 
    let tramo2Count = 0; 
    let tramo3Count = 0; 

    // Si no hay Fecha de Proceso, usar por defecto el último día del mes anterior
    const fechaActual = new Date();
    const fechaFallback = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 0);
    fechaFallback.setHours(0,0,0,0);

    // Filtrar filas vacías
    datosFiltrados = datosFiltrados.filter(row => row.length > 0 && row.some(cell => cell !== ""));

    datosFiltrados.forEach(row => {
        const dni = idxDni !== -1 ? (row[idxDni] || '-') : '-';
        const cliente = row[idxCliente] || '-';
        const celular = idxCelular !== -1 ? (row[idxCelular] || '-') : '-';
        const producto = idxProducto !== -1 ? (row[idxProducto] || '-') : '-';
        const cuotas = idxCuotas !== -1 ? (row[idxCuotas] || '-') : '-';
        let vencimiento = row[idxVencimiento];
        let procesoVal = idxProceso !== -1 ? row[idxProceso] : null;
        const compromiso = idxCompromiso !== -1 ? (row[idxCompromiso] || '-') : '-';
        
        let montoRaw = row[idxMonto];
        let montoOriginal = 0;
        if (typeof montoRaw === 'number') {
            montoOriginal = montoRaw;
        } else if (typeof montoRaw === 'string') {
            montoOriginal = parseFloat(montoRaw.replace(/[^0-9.-]+/g,"")) || 0;
        }
        
        let monto = montoOriginal;

        // Restar Amortización
        let amortizacionRaw = idxAmortizacion !== -1 ? row[idxAmortizacion] : 0;
        let amortizacion = 0;
        if (typeof amortizacionRaw === 'number') {
            amortizacion = amortizacionRaw;
        } else if (typeof amortizacionRaw === 'string') {
            amortizacion = parseFloat(amortizacionRaw.replace(/[^0-9.-]+/g,"")) || 0;
        }
        
        monto = monto - amortizacion;
        if (monto < 0) monto = 0; // Evitar deudas negativas
        
        totalMonto += monto;
        
        let montoStyle = "";
        let montoHTML = "";
        if (amortizacion > 0) {
            montoStyle = "background-color: #eafaf1; border-radius: 4px; padding: 5px; text-align: right;"; 
            montoHTML = `
                <div style="font-size: 0.8em; color: #7f8c8d; text-decoration: line-through;">$${montoOriginal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div style="font-size: 0.85em; color: #e74c3c; margin-bottom: 2px;">- $${amortizacion.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div style="color: #27ae60; font-weight: bold; font-size: 1.05em;">$${monto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            `;
        } else {
            montoStyle = "text-align: right;";
            montoHTML = `$${monto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        let diasAtrasoActual = 0;
        let diasAtrasoCierre = 0; // Nuevo
        let tramoStr = "Al día";
        let tramoClass = "tramo-al-dia";
        let fechaMostrada = "-";

        // Determinar la fecha base (Fecha de Proceso)
        let fechaBase = new Date(fechaFallback);
        if (procesoVal) {
            if (procesoVal instanceof Date) {
                fechaBase = new Date(procesoVal);
            } else {
                let parsedProceso = new Date(procesoVal);
                if (!isNaN(parsedProceso)) {
                    fechaBase = parsedProceso;
                }
            }
        }
        fechaBase.setHours(0,0,0,0);

        // Días Mora Actual
        if (idxDiasMora !== -1 && row[idxDiasMora] !== undefined && row[idxDiasMora] !== "") {
            diasAtrasoActual = parseInt(row[idxDiasMora], 10) || 0;
        }

        // Calcular Vencimiento: Fecha Base (Proceso) - Días Mora
        let fechaVenc = new Date(fechaBase);
        fechaVenc.setDate(fechaBase.getDate() - diasAtrasoActual);
        fechaMostrada = fechaVenc.toLocaleDateString();

        // Días Mora Cierre
        if (idxDiasMoraCierre !== -1 && row[idxDiasMoraCierre] !== undefined && row[idxDiasMoraCierre] !== "") {
            diasAtrasoCierre = parseInt(row[idxDiasMoraCierre], 10) || 0;
        } else {
            diasAtrasoCierre = '-';
        }

        if (diasAtrasoActual < 0) diasAtrasoActual = 0;

        // Tramo basado en Días Mora Actual
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

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dni}</td>
            <td>${cliente}</td>
            <td>${celular}</td>
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

    if (datosFiltrados.length === 0 && idxAsesor !== -1) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="13" class="empty-state">No se encontraron clientes para el asesor Jhunior Vargas Gordon.</td>`;
        tableBody.appendChild(tr);
    } else if (datosFiltrados.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="13" class="empty-state">No hay datos en el archivo.</td>`;
        tableBody.appendChild(tr);
    }

    document.getElementById('total-monto').textContent = `$${totalMonto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('total-tramo-1').textContent = tramo1Count;
    document.getElementById('total-tramo-2').textContent = tramo2Count;
    document.getElementById('total-tramo-3').textContent = tramo3Count;

    document.getElementById('summary-section').style.display = 'flex';

    // Agregar evento a los selectores de estado para pintar la fila
    const selects = document.querySelectorAll('.status-select');
    selects.forEach(select => {
        select.addEventListener('change', function() {
            const tr = this.closest('tr');
            if (this.value === 'cancelo') {
                tr.classList.add('row-cancelo');
            } else {
                tr.classList.remove('row-cancelo');
            }
        });
    });

    // Agregar evento a las casillas de cartas y aplicar estilos si ya están marcadas
    const cartaChks = document.querySelectorAll('.carta-chk');
    cartaChks.forEach(chk => {
        chk.addEventListener('change', function() {
            const label = this.closest('label');
            if (this.checked) {
                label.style.backgroundColor = '#d4e6f1'; 
                label.style.fontWeight = 'bold';
                label.style.color = '#2980b9';
                label.style.padding = '2px 4px';
                label.style.borderRadius = '3px';
            } else {
                label.style.backgroundColor = '';
                label.style.fontWeight = 'normal';
                label.style.color = '';
                label.style.padding = '0';
            }
        });
    });

    // Cargar y Guardar datos localmente (Autosave)
    const trs = document.querySelectorAll('#table-body tr');
    trs.forEach(tr => {
        if (tr.querySelector('.empty-state')) return;
        const tds = tr.querySelectorAll('td');
        const dni = tds[0].innerText;
        
        const inputComp = tds[9].querySelector('input');
        const chks = tds[11].querySelectorAll('input[type="checkbox"]');
        const selectEst = tds[12].querySelector('select');
        
        // Cargar datos guardados si existen
        const saved = JSON.parse(localStorage.getItem('mora_' + dni));
        if (saved) {
            if (saved.compromiso) inputComp.value = saved.compromiso;
            if (saved.carta1) { chks[0].checked = true; chks[0].dispatchEvent(new Event('change')); }
            if (saved.carta2) { chks[1].checked = true; chks[1].dispatchEvent(new Event('change')); }
            if (saved.estado) { selectEst.value = saved.estado; selectEst.dispatchEvent(new Event('change')); }
        }
        
        // Función para guardar automáticamente
        const saveState = () => {
            const data = {
                compromiso: inputComp.value,
                carta1: chks[0].checked,
                carta2: chks[1].checked,
                estado: selectEst.value
            };
            localStorage.setItem('mora_' + dni, JSON.stringify(data));
        };
        
        inputComp.addEventListener('input', saveState);
        chks[0].addEventListener('change', saveState);
        chks[1].addEventListener('change', saveState);
        selectEst.addEventListener('change', saveState);
    });

    // Mostrar botón de exportar y configurar
    const btnExport = document.getElementById('btn-export');
    btnExport.style.display = 'inline-block';
    btnExport.onclick = () => {
        const ws_data = [];
        // Cabeceras
        ws_data.push(["DNI", "Cliente", "Teléfono", "Producto", "N° Cuotas", "Vencimiento", "Días Mora Actual", "Días Mora Cierre", "Tramo de Visita", "Compromiso de Pago", "Monto Adeudado", "Carta 1 a 8 días", "Carta 9 a 30 días", "Estado"]);
        
        const rowsToExport = document.querySelectorAll('#table-body tr');
        rowsToExport.forEach(tr => {
            if(tr.querySelector('.empty-state')) return;
            const tds = tr.querySelectorAll('td');
            
            const dni = tds[0].innerText;
            const cli = tds[1].innerText;
            const tel = tds[2].innerText;
            const prod = tds[3].innerText;
            const cuo = tds[4].innerText;
            const ven = tds[5].innerText;
            const ma = tds[6].innerText;
            const mc = tds[7].innerText;
            const tram = tds[8].innerText;
            const comp = tds[9].querySelector('input').value;
            // Obtener el monto final (última línea)
            const montoArr = tds[10].innerText.split('\n');
            const monto = montoArr[montoArr.length - 1].trim();
            const chks = tds[11].querySelectorAll('input[type="checkbox"]');
            const c1 = chks[0].checked ? "Sí" : "No";
            const c2 = chks[1].checked ? "Sí" : "No";
            const est = tds[12].querySelector('select').value;
            
            ws_data.push([dni, cli, tel, prod, cuo, ven, ma, mc, tram, comp, monto, c1, c2, est]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Gestión Mora");
        XLSX.writeFile(wb, "Gestion_Actualizada.xlsx");
    };
}
