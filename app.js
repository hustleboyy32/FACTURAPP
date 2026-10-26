/* FacturApp - editor y generador de facturas (sin backend) */
(function () {
  'use strict';

  const STORAGE_KEY = 'facturapp.estado';
  const COMP_NRO_INICIAL = 28711;
  const PUNTO_VENTA_INICIAL = '00079';
  const COMP_NRO_VIEJO = 1;
  const PUNTO_VENTA_VIEJO = 1;
  const ALICUOTA_IVA = 21;
  // Datos fiscales que venía cargando la plantilla. Si siguen intactos y el negocio
  // no tiene identidad propia, se descartan al abrir.
  const PLANTILLA_VIEJA = { iibb: '20367240416', inicio: '2018-06-04', puntoVenta: '00238', compNro: 28113 };
  const COPIAS = ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO'];
  const LIMPIEZA_IMPRESION_MS = 120000;

  const $ = (id) => document.getElementById(id);

  // ---------- estado ----------
  const estadoInicial = () => ({
    negocio: {
      nombre: '', razon: '', domicilio: '', cuit: '',
      iva: 'IVA Responsable Inscripto', iibb: '', inicio: '', ref: '',
      logo: '', // data URL (PNG en escala de grises) o '' si no hay logo
    },
    puntoVenta: PUNTO_VENTA_INICIAL,
    compNro: COMP_NRO_INICIAL,
    cliente: { cuit: '', nombre: '', domicilio: '', condVenta: 'Transferencia Bancaria' },
    items: [nuevoItem()],
    copias: { DUPLICADO: false, TRIPLICADO: false },
    cae: '',
    caeVto: '',
  });

  function nuevoItem() {
    return { codigo: codigoRandom(), producto: '', cantidad: 1, precio: 0 };
  }

  function codigoRandom(len = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
    return out;
  }

  let migrarPlantilla = false;
  let migrarNumeracion = false;
  let avisoStorage = false;
  let estado = cargar();
  let copiaVista = 'ORIGINAL'; // la copia que se muestra en la vista previa

  function esPlantillaVieja(g, negocio) {
    const sinIdentidad = !negocio.nombre && !negocio.razon && !negocio.cuit && !negocio.domicilio;
    return sinIdentidad
      && negocio.iibb === PLANTILLA_VIEJA.iibb
      && negocio.inicio === PLANTILLA_VIEJA.inicio
      && String(g.puntoVenta ?? '') === PLANTILLA_VIEJA.puntoVenta
      && Number(g.compNro) === PLANTILLA_VIEJA.compNro;
  }

  function cargar() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return estadoInicial();
      const g = JSON.parse(raw);
      const base = estadoInicial();
      const negocio = { ...base.negocio, ...(g.negocio || {}) };
      if (!negocio.iva) negocio.iva = base.negocio.iva;
      const plantillaVieja = esPlantillaVieja(g, negocio);
      if (plantillaVieja) {
        migrarPlantilla = true;
        negocio.iibb = '';
        negocio.inicio = '';
      }
      const puntoGuardado = String(g.puntoVenta ?? '').replace(/\D/g, '');
      const compGuardado = Number(g.compNro);
      const puntoViejo = !puntoGuardado || Number(puntoGuardado) === PUNTO_VENTA_VIEJO;
      const compViejo = !Number.isFinite(compGuardado) || compGuardado === COMP_NRO_VIEJO || compGuardado === 0;
      if (puntoViejo || compViejo) migrarNumeracion = true;
      return {
        ...base, ...g,
        negocio,
        puntoVenta: (plantillaVieja || puntoViejo) ? base.puntoVenta : puntoGuardado,
        compNro: (plantillaVieja || compViejo) ? base.compNro : compGuardado,
        cliente: { ...base.cliente, ...(g.cliente || {}) },
        copias: { ...base.copias, ...(g.copias || {}) },
        items: Array.isArray(g.items) && g.items.length ? g.items : base.items,
      };
    } catch { return estadoInicial(); }
  }
  function guardar() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
      avisoStorage = false;
      return true;
    } catch {
      if (!avisoStorage) {
        avisoStorage = true;
        alert('No se pudieron guardar los datos en este navegador. Si acabás de subir un logo, puede ser demasiado pesado y no quedó guardado.');
      }
      return false;
    }
  }
  if (migrarPlantilla || migrarNumeracion) guardar();

  // ---------- formato ----------
  const hoyISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const isoAFecha = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  // 866999,00 -> mismo formato que el comprobante original (coma decimal, sin separador de miles)
  const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',');
  const pad = (v, len) => String(v).replace(/\D/g, '').padStart(len, '0').slice(-len);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const BONIF_TRANSFERENCIA = 10;
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const aplicaBonif = () => /transferencia/i.test(estado.cliente.condVenta || '');
  const brutoItem = (it) => round2((Number(it.cantidad) || 0) * (Number(it.precio) || 0));
  const bonifItem = (it) => aplicaBonif() ? round2(brutoItem(it) * BONIF_TRANSFERENCIA / 100) : 0;
  const subtotalItem = (it) => round2(brutoItem(it) - bonifItem(it));
  const brutoFactura = () => round2(estado.items.reduce((acc, it) => acc + brutoItem(it), 0));
  const bonifFactura = () => round2(estado.items.reduce((acc, it) => acc + bonifItem(it), 0));
  const totalFactura = () => round2(brutoFactura() - bonifFactura());
  const formulaBonif = () => aplicaBonif()
    ? `${money(brutoFactura())} − ${BONIF_TRANSFERENCIA}% = ${money(totalFactura())}`
    : '';
  // Factura B de un responsable inscripto: el precio es final y el IVA va adentro.
  const aplicaIvaContenido = () => /responsable\s+inscripto/i.test(estado.negocio.iva || '');
  const ivaContenidoDe = (total) => aplicaIvaContenido() ? total * ALICUOTA_IVA / (100 + ALICUOTA_IVA) : 0;

  // CUIT/CUIL: 11 dígitos y dígito verificador (módulo 11).
  function cuitError(v) {
    if (!v) return '';
    if (!/^\d{11}$/.test(v)) return 'El CUIT tiene 11 dígitos.';
    const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(v[i]) * mult[i];
    const resto = sum % 11;
    const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
    return dv === Number(v[10]) ? '' : 'El dígito verificador no coincide.';
  }

  const erroresCuit = { negocioCuit: 'errNegocioCuit', clienteCuit: 'errClienteCuit' };
  function mostrarErrorCuit(inputId, valor) {
    const msg = cuitError(valor);
    const input = $(inputId);
    const err = $(erroresCuit[inputId]);
    input.classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    err.hidden = !msg;
    err.textContent = msg;
  }

  // ---------- inputs del negocio / cliente ----------
  const campos = [
    ['negocioNombre', () => estado.negocio.nombre, (v) => estado.negocio.nombre = v],
    ['negocioRazon', () => estado.negocio.razon, (v) => estado.negocio.razon = v],
    ['negocioDomicilio', () => estado.negocio.domicilio, (v) => estado.negocio.domicilio = v],
    ['negocioCuit', () => estado.negocio.cuit, (v) => estado.negocio.cuit = v.replace(/\D/g, '')],
    ['negocioIva', () => estado.negocio.iva, (v) => estado.negocio.iva = v],
    ['negocioIibb', () => estado.negocio.iibb, (v) => estado.negocio.iibb = v.replace(/\D/g, '')],
    ['negocioInicio', () => estado.negocio.inicio, (v) => estado.negocio.inicio = v],
    ['negocioRef', () => estado.negocio.ref, (v) => estado.negocio.ref = v],
    ['puntoVenta', () => estado.puntoVenta, (v) => estado.puntoVenta = v.replace(/\D/g, '')],
    ['compNro', () => String(estado.compNro), (v) => estado.compNro = Number(v.replace(/\D/g, '')) || 0],
    ['clienteCuit', () => estado.cliente.cuit, (v) => estado.cliente.cuit = v.replace(/\D/g, '')],
    ['clienteNombre', () => estado.cliente.nombre, (v) => estado.cliente.nombre = v],
    ['clienteDomicilio', () => estado.cliente.domicilio, (v) => estado.cliente.domicilio = v],
    ['clienteCondVenta', () => estado.cliente.condVenta, (v) => estado.cliente.condVenta = v],
    ['cae', () => estado.cae, (v) => estado.cae = v.replace(/\D/g, '').slice(0, 14)],
    ['caeVto', () => estado.caeVto, (v) => estado.caeVto = v],
  ];

  function conectarCampos() {
    for (const [id, get, set] of campos) {
      const el = $(id);
      el.value = get();
      if (erroresCuit[id]) mostrarErrorCuit(id, get());
      el.addEventListener('input', () => {
        set(el.value);
        guardar();
        if (erroresCuit[id]) mostrarErrorCuit(id, get());
        renderFactura();
      });
      el.addEventListener('blur', () => {
        el.value = get();
        if (erroresCuit[id]) mostrarErrorCuit(id, get());
      });
    }
    // La fecha de emisión es siempre la del día. El input solo la muestra.

    for (const c of ['DUPLICADO', 'TRIPLICADO']) {
      const cb = $(c === 'DUPLICADO' ? 'copiaDuplicado' : 'copiaTriplicado');
      cb.checked = !!estado.copias[c];
      cb.addEventListener('change', () => { estado.copias[c] = cb.checked; guardar(); renderCopias(); });
    }

    $('segCopias').addEventListener('click', (e) => {
      const b = e.target.closest('[data-copia]');
      if (!b) return;
      copiaVista = b.dataset.copia;
      renderCopias();
    });
  }

  // ---------- logo del negocio ----------
  const LOGO_MAX_W = 800, LOGO_MAX_H = 320;

  // Lee la imagen, la achica si hace falta y la pasa a escala de grises píxel por píxel.
  // Devuelve un data URL PNG (se guarda en localStorage y sale igual en el PDF).
  function procesarLogo(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('El archivo no es una imagen.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, LOGO_MAX_W / img.naturalWidth, LOGO_MAX_H / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * escala));
        const h = Math.max(1, Math.round(img.naturalHeight * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          // luminancia (Rec. 601): el mismo gris para R, G y B; el alfa se conserva
          const gris = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
          px[i] = px[i + 1] = px[i + 2] = gris;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  async function cargarLogo(file) {
    const anterior = estado.negocio.logo;
    try {
      estado.negocio.logo = await procesarLogo(file);
      if (!guardar()) {
        estado.negocio.logo = anterior;
        guardar();
        renderLogo();
        renderFactura();
        return;
      }
      renderLogo();
      renderFactura();
    } catch (err) {
      estado.negocio.logo = anterior;
      alert(err.message);
    }
  }

  function renderLogo() {
    const hay = !!estado.negocio.logo;
    $('logoPreview').hidden = !hay;
    $('logoPreview').src = estado.negocio.logo || '';
    $('logoEmpty').hidden = hay;
    $('logoActions').hidden = !hay;
  }

  function conectarLogo() {
    const zona = $('logoUpload'), input = $('logoFile');
    zona.addEventListener('click', (e) => {
      if (e.target.closest('#logoQuitar')) return;
      input.click();
    });
    input.addEventListener('change', () => { if (input.files[0]) cargarLogo(input.files[0]); input.value = ''; });
    $('logoQuitar').addEventListener('click', () => {
      estado.negocio.logo = '';
      guardar(); renderLogo(); renderFactura();
    });
    // arrastrar y soltar
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('drag'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('drag'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault(); zona.classList.remove('drag');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) cargarLogo(f);
    });
    renderLogo();
  }

  // ---------- editor de items ----------
  function renderEditorItems() {
    const cont = $('itemsEditor');
    cont.innerHTML = '';
    estado.items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <span class="idx">#${i + 1}</span>
        <div class="field"><label>Producto / Servicio</label>
          <input data-k="producto" data-i="${i}" value="${esc(it.producto)}" placeholder="Descripción del producto">
        </div>
        <div class="grid-2">
          <div class="field"><label>Cantidad</label><input data-k="cantidad" data-i="${i}" type="number" min="0" step="any" value="${esc(it.cantidad)}"></div>
          <div class="field"><label>Precio unitario</label><input data-k="precio" data-i="${i}" type="number" min="0" step="0.01" value="${esc(it.precio)}"></div>
        </div>
        <div class="meta">
          <span class="code" title="Código generado automáticamente">${esc(it.codigo)}</span>
          <button type="button" class="del" data-del="${i}" title="Quitar producto">✕ quitar</button>
          <span class="subtotal">$ ${money(subtotalItem(it))}</span>
        </div>`;
      cont.appendChild(row);
    });
  }

  $('itemsEditor').addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset.k) return;
    const it = estado.items[Number(el.dataset.i)];
    if (!it) return;
    it[el.dataset.k] = el.dataset.k === 'producto' ? el.value : (el.value === '' ? 0 : Number(el.value));
    guardar();
    // actualizar solo el subtotal de esa fila para no perder el foco
    el.closest('.item-row').querySelector('.subtotal').textContent = '$ ' + money(subtotalItem(it));
    renderFactura();
  });

  $('itemsEditor').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    estado.items.splice(Number(btn.dataset.del), 1);
    if (!estado.items.length) estado.items.push(nuevoItem());
    guardar(); render();
  });

  $('addItem').addEventListener('click', () => {
    estado.items.push(nuevoItem());
    guardar(); render();
    const inputs = $('itemsEditor').querySelectorAll('input[data-k="producto"]');
    inputs[inputs.length - 1]?.focus();
  });

  // ---------- vista previa ----------
  function datosFactura() {
    const n = estado.negocio, c = estado.cliente;
    const total = totalFactura();
    return {
      'negocio.nombre': n.nombre, 'negocio.razon': n.razon, 'negocio.domicilio': n.domicilio,
      'negocio.iva': n.iva, 'negocio.cuit': n.cuit, 'negocio.iibb': n.iibb,
      'negocio.inicio': isoAFecha(n.inicio), 'negocio.ref': n.ref,
      'puntoVenta': pad(estado.puntoVenta, 5), 'compNro': pad(estado.compNro, 8),
      'fecha': isoAFecha(hoyISO()),
      'cliente.cuit': c.cuit, 'cliente.nombre': c.nombre, 'cliente.domicilio': c.domicilio,
      'cliente.condVenta': c.condVenta,
      'formula': formulaBonif(),
      'subtotal': money(total), 'total': money(total),
      'ivaContenido': money(ivaContenidoDe(total)),
      'cae': estado.cae || '',
      'caeVto': isoAFecha(estado.caeVto),
    };
  }

  // Vuelca los datos en una hoja (.sheet) con la etiqueta de copia indicada.
  function llenarHoja(hoja, copia) {
    const d = datosFactura();
    hoja.querySelectorAll('[data-f]').forEach((el) => { el.textContent = d[el.dataset.f] ?? ''; });
    const formula = hoja.querySelector('[data-formula]');
    if (formula) formula.hidden = !aplicaBonif();
    hoja.querySelector('[data-copia-label]').textContent = copia;
    const brand = hoja.querySelector('[data-brand]');
    const img = hoja.querySelector('[data-logo]');
    const logo = estado.negocio.logo || '';
    if (img.getAttribute('src') !== logo) img.src = logo;
    brand.classList.toggle('has-logo', !!logo);
    const tbody = hoja.querySelector('[data-items]');
    tbody.innerHTML = '';
    for (const it of estado.items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cod">${esc(it.codigo)}</td>
        <td class="prod">${esc(it.producto)}</td>
        <td class="num">${money(it.cantidad)}</td>
        <td class="um">unidades</td>
        <td class="num">${money(it.precio)}</td>
        <td class="num">${money(aplicaBonif() ? BONIF_TRANSFERENCIA : 0)}</td>
        <td class="num">${money(bonifItem(it))}</td>
        <td class="num">${money(subtotalItem(it))}</td>`;
      tbody.appendChild(tr);
    }
  }

  const copiasSeleccionadas = () => COPIAS.filter((c) => c === 'ORIGINAL' || estado.copias[c]);

  function renderFactura() {
    const total = totalFactura();
    llenarHoja($('factura'), copiaVista);
    $('eTotal').textContent = money(total);
    const bonif = $('eBonifLine');
    bonif.hidden = !aplicaBonif();
    bonif.textContent = aplicaBonif() ? `Transferencia ${BONIF_TRANSFERENCIA}%: ${formulaBonif()}` : '';
    document.querySelectorAll('#itemsEditor .subtotal').forEach((el, i) => {
      const it = estado.items[i];
      if (it) el.textContent = '$ ' + money(subtotalItem(it));
    });
    $('eIva').textContent = money(ivaContenidoDe(total));
    $('eIvaLine').hidden = !aplicaIvaContenido();
    $('fechaEmision').value = hoyISO();
    $('chipPv').textContent = pad(estado.puntoVenta, 5);
    $('chipNro').textContent = pad(estado.compNro, 8);
    $('chipFecha').textContent = isoAFecha(hoyISO());
  }

  function renderCopias() {
    const sel = copiasSeleccionadas();
    // si la copia que se estaba viendo ya no está seleccionada, volver a la original
    if (!sel.includes(copiaVista)) copiaVista = 'ORIGINAL';
    $('segCopias').querySelectorAll('[data-copia]').forEach((b) => {
      const c = b.dataset.copia;
      b.classList.toggle('active', c === copiaVista);
      b.hidden = !sel.includes(c);
    });
    document.querySelectorAll('.copy').forEach((l) => {
      const cb = l.querySelector('input');
      l.classList.toggle('on', cb.checked);
    });
    $('pagesHint').textContent = sel.length + (sel.length === 1 ? ' página' : ' páginas');
    renderFactura();
  }

  function render() { renderEditorItems(); renderCopias(); }

  // ---------- generar (imprimir) ----------
  function generar() {
    const problemas = [];
    if (!estado.negocio.razon) problemas.push('razón social');
    if (!estado.negocio.cuit) problemas.push('CUIT del negocio');
    else if (cuitError(estado.negocio.cuit)) problemas.push('CUIT del negocio inválido');
    if (!estado.cliente.nombre) problemas.push('nombre del cliente');
    if (estado.cliente.cuit && cuitError(estado.cliente.cuit)) problemas.push('CUIT del cliente inválido');
    if (!estado.items.some((it) => it.producto)) problemas.push('al menos un producto');
    if (problemas.length && !confirm('Revisá antes de generar: ' + problemas.join(', ') + '.\n¿Generar igual?')) return;

    // Una hoja por copia: ORIGINAL + las que estén tildadas.
    const cont = $('copias');
    const original = $('factura');
    const extras = [];
    for (const copia of copiasSeleccionadas().slice(1)) {
      const hoja = original.cloneNode(true);
      hoja.removeAttribute('id');
      llenarHoja(hoja, copia);
      cont.appendChild(hoja);
      extras.push(hoja);
    }
    llenarHoja(original, 'ORIGINAL');

    const tituloAnterior = document.title;
    document.title = `Factura_${pad(estado.puntoVenta, 5)}-${pad(estado.compNro, 8)}`;
    let limpio = false;
    const limpiar = () => {
      if (limpio) return;
      limpio = true;
      extras.forEach((h) => h.remove());
      document.title = tituloAnterior;
      window.removeEventListener('afterprint', limpiar);
      renderFactura();
    };
    window.addEventListener('afterprint', limpiar);
    window.print();
    // print() no bloquea en algunos navegadores y afterprint a veces no se dispara.
    // Un timeout corto sacaba el duplicado y el triplicado antes de que el diálogo los tomara.
    setTimeout(limpiar, LIMPIEZA_IMPRESION_MS);
  }

  $('generar').addEventListener('click', generar);

  $('nuevaFactura').addEventListener('click', () => {
    if (!confirm('Se pasa al comprobante siguiente y se limpian cliente y productos. Los datos del negocio se mantienen. ¿Continuar?')) return;
    estado.compNro += 1;
    estado.cliente = { cuit: '', nombre: '', domicilio: '', condVenta: estado.cliente.condVenta };
    estado.items = [nuevoItem()];
    estado.cae = '';
    estado.caeVto = '';
    guardar();
    for (const [id, get] of campos) {
      $(id).value = get();
      if (erroresCuit[id]) mostrarErrorCuit(id, get());
    }
    render();
  });

  // ---------- arranque ----------
  conectarCampos();
  conectarLogo();
  render();
})();
