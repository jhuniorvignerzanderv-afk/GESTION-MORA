const fs = require('fs');
let appJsContent = fs.readFileSync('app.js', 'utf8');

// Replace top section
const newTop = \const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfc6dRBu5wpTFXzQg_ppK7xwUONfuOpVqAN9P4idF0hD1NfFEwK8QBvmjphgmNEhA8/exec';

let gestionesGlobal = {};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-sync').addEventListener('click', syncData);
    syncData();
});

async function syncData() {
    const statusEl = document.getElementById('sync-status');
    statusEl.textContent = 'Sincronizando...';
    statusEl.style.color = '#f39c12';

    try {
        const response = await fetch(SCRIPT_URL);
        const json = await response.json();
        
        gestionesGlobal = json.gestiones || {};
        const rows = json.data || [];
        
        if (rows.length > 0) {
            processData(rows);
            statusEl.textContent = 'Sincronizado ?';
            statusEl.style.color = '#27ae60';
        } else {
            statusEl.textContent = 'Sin datos. Pega tu Excel en la hoja Data de Google Sheets.';
            statusEl.style.color = '#e74c3c';
        }
    } catch(err) {
        console.error(err);
        statusEl.textContent = 'Error de conexion';
        statusEl.style.color = '#e74c3c';
    }
}

async function updateGestionEnNube(dni, compromiso, carta1, carta2, estado) {
    if (!gestionesGlobal[dni]) gestionesGlobal[dni] = {};
    gestionesGlobal[dni].compromiso = compromiso;
    gestionesGlobal[dni].carta1 = carta1;
    gestionesGlobal[dni].carta2 = carta2;
    gestionesGlobal[dni].estado = estado;

    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', 'update');
    url.searchParams.append('dni', dni);
    url.searchParams.append('compromiso', compromiso);
    url.searchParams.append('carta1', carta1);
    url.searchParams.append('carta2', carta2);
    url.searchParams.append('estado', estado);

    try {
        await fetch(url.toString(), { method: 'GET' });
    } catch(err) {
        console.error('Error guardando gestion:', err);
    }
}

function processData(rows) {\;

// Replace from start to processData
appJsContent = appJsContent.replace(/document\.getElementById\('excel-file'\)[\s\S]*?function processData\(rows\) \{/, newTop);

// Replace localStorage loading logic
const oldLocalLogic = \        // Cargar datos guardados si existen
        const saved = JSON.parse(localStorage.getItem('mora_' + dni));
        if (saved) {
            if (saved.compromiso) inputComp.value = saved.compromiso;
            if (saved.carta1) { chks[0].checked = true; chks[0].dispatchEvent(new Event('change')); }
            if (saved.carta2) { chks[1].checked = true; chks[1].dispatchEvent(new Event('change')); }
            if (saved.estado) { selectEst.value = saved.estado; selectEst.dispatchEvent(new Event('change')); }
        }
        
        // Funcin para guardar automoticamente
        const saveState = () => {
            const data = {
                compromiso: inputComp.value,
                carta1: chks[0].checked,
                carta2: chks[1].checked,
                estado: selectEst.value
            };
            localStorage.setItem('mora_' + dni, JSON.stringify(data));
        };\;

const newLocalLogic = \        // Cargar datos desde Google Sheets (gestionesGlobal)
        const saved = gestionesGlobal[dni];
        if (saved) {
            if (saved.compromiso) inputComp.value = saved.compromiso;
            if (saved.carta1) { chks[0].checked = true; chks[0].dispatchEvent(new Event('change')); }
            if (saved.carta2) { chks[1].checked = true; chks[1].dispatchEvent(new Event('change')); }
            if (saved.estado) { selectEst.value = saved.estado; selectEst.dispatchEvent(new Event('change')); }
        }
        
        // Funcin para guardar automoticamente en la nube
        const saveState = () => {
            updateGestionEnNube(dni, inputComp.value, chks[0].checked, chks[1].checked, selectEst.value);
        };\;

appJsContent = appJsContent.replace(/        \/\/ Cargar datos guardados si existen[\s\S]*?localStorage\.setItem\('mora_' \+ dni, JSON\.stringify\(data\)\);\n        };/, newLocalLogic);

fs.writeFileSync('app.js', appJsContent);

