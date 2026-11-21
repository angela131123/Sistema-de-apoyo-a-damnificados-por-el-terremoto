const loginView = document.querySelector('#vista-acceso');
const login = document.querySelector('#acceso');
const loginButton = login.querySelector('button[type="submit"]');
const serverHelp = document.querySelector('#ayuda-servidor');
const panel = document.querySelector('#panel-damnificados');
const cards = document.querySelector('#fichas');
const template = document.querySelector('#plantilla-ficha');
const deliveryTemplate = document.querySelector('#plantilla-entrega');
const logout = document.querySelector('#salir');
const loginMessage = document.querySelector('#mensaje-acceso');
const panelMessage = document.querySelector('#mensaje-panel');
const title = document.querySelector('#titulo-consulta');
const total = document.querySelector('#total-registros');
const donationFlow = document.querySelector('#flujo-donaciones');
const donationDialog = document.querySelector('#dialogo-donacion');
const donationForm = document.querySelector('#registro-donacion');
const donationFields = donationForm.elements;
const donationButton = donationForm.querySelector('button[type="submit"]');
const donationCancel = donationForm.querySelector('[data-cancelar]');
const donationMessage = donationForm.querySelector('[role="status"]');
const directDonation = document.querySelector('#datos-donacion-directa');
const offerSummary = document.querySelector('#resumen-oferta');
const donationTitle = document.querySelector('#titulo-recepcion');
const shelterGuide = document.querySelector('#guia-albergues');
const shelterForm = document.querySelector('#registro-albergue');
const shelterMessage = document.querySelector('#mensaje-albergue');
const sections = new Map([...panel.querySelectorAll('.opcion-admin')].map((link) => [link.hash.slice(1), link]));
let csrf;
let activeQuery;
let donationResourceLoad;

async function api(url, options) {
  const response = await fetch(url, options);
  if (response.status === 204) return;
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    if (response.status === 404) {
      throw new Error('Esta opción no está disponible en el servidor abierto. Reinicia Node.js y vuelve a intentarlo.');
    }
    throw new Error('El servidor devolvió una respuesta inesperada. Intenta de nuevo.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'No se pudo completar la solicitud.');
  return data;
}

function showError(target, error) {
  target.className = 'alert alert-danger';
  target.textContent = error.message;
  target.hidden = false;
}

function showSaved(target, message) {
  target.className = 'alert alert-success mt-2 mb-0';
  target.textContent = message;
  target.hidden = false;
}

function buildNotice(person) {
  const assignedShelter = person.albergue
    ? 'En tu registro figura este albergue: ' + person.albergue
      + (person.direccion_albergue ? ' (' + person.direccion_albergue + ')' : '')
      + '. Confirma su atención antes de desplazarte.'
    : 'Si necesitas alojamiento temporal, indica tu barrio y cuántas personas requieren un cupo.';

  return [
    'Hola. Te compartimos información del sistema de apoyo a damnificados de Pereira.',
    assignedShelter,
    'Para consultar albergues habilitados y ayudas, llama a la Alcaldía al (606) 324 8000 y pide orientación de la DIGER. En caso de emergencia, llama al 123 o al 119.',
    'Para donar en especie, consulta con la Alcaldía qué puntos de acopio siguen activos y qué reciben. Para donaciones en dinero, consulta el sitio oficial de la Cruz Roja Colombiana: https://www.cruzrojacolombiana.org/',
  ].join('\n\n');
}

function renderNotice(container, person) {
  const status = document.createElement('p');
  status.className = 'mb-0';
  status.setAttribute('role', 'status');
  if (person.aviso_whatsapp) {
    status.textContent = 'Información enviada por WhatsApp.';
    container.append(status);
    return;
  }

  const phone = person.telefono?.trim() ?? '';
  const digits = phone.replace(/\D/g, '');
  const number = /^[3]\d{9}$/.test(digits) ? '57' + digits : digits;
  const colombianMobile = /^573\d{9}$/.test(number);
  const internationalPhone = phone.startsWith('+') && /^[1-9]\d{7,14}$/.test(number);
  if (!/^\+?[0-9\s().-]+$/.test(phone) || (!colombianMobile && !internationalPhone)) {
    status.textContent = 'El registro necesita un número válido para WhatsApp.';
    container.append(status);
    return;
  }

  const message = buildNotice(person);
  const preview = document.createElement('details');
  preview.className = 'mb-2';
  const summary = document.createElement('summary');
  summary.textContent = 'Ver mensaje para WhatsApp';
  const text = document.createElement('p');
  text.className = 'texto-aviso mt-2 mb-0';
  text.textContent = message;
  preview.append(summary, text);
  const open = document.createElement('a');
  open.className = 'btn btn-outline-success me-2 mb-2';
  open.textContent = 'Abrir WhatsApp';
  open.href = 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'btn boton-principal mb-2';
  confirm.textContent = 'Confirmar envío realizado';
  confirm.hidden = true;
  open.addEventListener('click', () => { confirm.hidden = false; });
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    try {
      const result = await api('/api/administrador/damnificados/' + encodeURIComponent(person.id_damnificado)
        + '/confirmar-whatsapp', { method: 'POST', headers: { 'X-CSRF-Token': csrf } });
      status.textContent = result.message;
      preview.remove();
      open.remove();
      confirm.remove();
    } catch (error) {
      status.textContent = error.message;
      confirm.disabled = false;
    }
  });
  container.append(preview, open, confirm, status);
}

function renderFollowUp(card, person) {
  const form = card.querySelector('[data-seguimiento]');
  const summary = card.querySelector('[data-estado-seguimiento]');
  const reasonLabel = form.querySelector('[data-motivo-seguimiento]');
  const state = form.elements.estado;
  const reason = form.elements.motivo;
  const button = form.querySelector('button');
  const message = form.querySelector('[role="status"]');
  form.action = '/api/administrador/damnificados/' + encodeURIComponent(person.id_damnificado) + '/seguimiento';

  function updateReasonField() {
    const pending = state.value === 'pendiente';
    reasonLabel.hidden = reason.disabled = pending;
    reason.required = !pending;
  }

  function showSavedFollowUp(savedState, savedReason) {
    state.value = savedState ?? 'pendiente';
    reason.value = savedReason ?? '';
    summary.textContent = state.value === 'pendiente' ? '' : ' · ' + state.selectedOptions[0].text;
    updateReasonField();
  }

  showSavedFollowUp(person.estado_seguimiento, person.motivo_seguimiento);
  state.addEventListener('change', () => {
    updateReasonField();
    message.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!csrf || button.disabled) return;
    const body = JSON.stringify(Object.fromEntries(new FormData(form)));
    state.disabled = reason.disabled = button.disabled = true;
    message.hidden = true;
    try {
      const result = await api(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body,
      });
      showSavedFollowUp(result.estado, result.motivo);
      message.className = 'alert alert-success mt-2 mb-0';
      message.textContent = result.message;
      message.hidden = false;
    } catch (error) {
      showError(message, error);
    } finally {
      state.disabled = button.disabled = false;
      updateReasonField();
    }
  });
}

function renderShelter(form, person, shelters) {
  if (!form) return;
  const select = form.elements.id_albergue;
  const button = form.querySelector('button');
  const message = form.querySelector('[role="status"]');
  if (!Array.isArray(shelters)) {
    if (person.id_albergue != null) {
      select.add(new Option(person.albergue || 'Albergue asignado', person.id_albergue));
      select.value = person.id_albergue;
    }
    select.disabled = button.disabled = true;
    showError(message, new Error('La lista de albergues no está disponible. Reinicia el servidor del proyecto y recarga esta página.'));
    return;
  }
  form.action = '/api/administrador/damnificados/' + person.id_damnificado + '/albergue';
  for (const shelter of shelters) {
    const free = Math.max(0, shelter.capacidad - shelter.personas_asignadas);
    const option = new Option(shelter.nombre + ' · ' + shelter.direccion + ' · Cupos libres: ' + free, shelter.id_albergue);
    option.disabled = free === 0 && shelter.id_albergue !== person.id_albergue;
    select.add(option);
  }
  select.value = person.id_albergue ?? '';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    select.disabled = button.disabled = true;
    message.hidden = true;
    try {
      const result = await api(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ id_albergue: select.value }),
      });
      loadSection(result.message);
    } catch (error) {
      showError(message, error);
    } finally {
      select.disabled = button.disabled = false;
    }
  });
}

function renderCard(person, labels, photos, shelters) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.persona = person.id_damnificado;
  card.querySelector('[data-nombre]').textContent = person.nombres + ' ' + person.apellidos;
  card.querySelector('[data-id]').textContent = '· Registro #' + person.id_damnificado;
  const details = card.querySelector('[data-datos]');
  for (const [key, label] of Object.entries(labels)) {
    const term = document.createElement('dt');
    term.className = 'col-12 col-sm-5 col-lg-4';
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.className = 'col-12 col-sm-7 col-lg-8 text-break';
    definition.textContent = person[key] ?? 'Sin dato';
    details.append(term, definition);
  }

  const gallery = card.querySelector('[data-fotos]');
  if (!photos.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Sin fotos adjuntas.';
    gallery.append(empty);
  }
  for (const [index, photo] of photos.entries()) {
    const link = document.createElement('a');
    link.className = 'col-6 col-md-4';
    link.href = '/api/administrador/fotos/' + encodeURIComponent(photo.id_foto);
    const image = document.createElement('img');
    image.className = 'foto-afectacion rounded';
    image.loading = 'lazy';
    image.src = link.href;
    image.alt = 'Ver foto ' + (index + 1) + ' de la afectación';
    link.append(image);
    gallery.append(link);
  }
  renderNotice(card.querySelector('[data-aviso]'), person);
  renderFollowUp(card, person);
  renderShelter(card.querySelector('[data-asignacion]'), person, shelters);
  return card;
}

async function openDonation(offer) {
  const receiptId = crypto.randomUUID();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());
  donationForm.reset();
  donationFields.id_solicitud.value = receiptId;
  donationFields.id_oferta.value = offer?.id_oferta ?? '';
  donationFields.cantidad.value = offer?.cantidad ?? '';
  donationFields.fecha.value = donationFields.fecha.max = today;
  directDonation.hidden = directDonation.disabled = Boolean(offer);
  offerSummary.hidden = !offer;
  offerSummary.textContent = offer
    ? offer.donante + ' ofreció ' + offer.cantidad + ' ' + offer.unidad_medida + ' · ' + offer.recurso + '.'
    : '';
  donationTitle.textContent = offer ? 'Confirmar recepción' : 'Registrar donación recibida';
  donationMessage.hidden = true;
  donationButton.disabled = !offer;
  donationDialog.showModal();
  if (offer) {
    donationFields.cantidad.focus();
    return;
  }

  try {
    donationResourceLoad ??= cargarRecursos(donationFields.id_recurso).catch((error) => {
      donationResourceLoad = null;
      throw error;
    });
    await donationResourceLoad;
    if (donationFields.id_solicitud.value === receiptId) donationButton.disabled = false;
  } catch (error) {
    if (donationFields.id_solicitud.value === receiptId) showError(donationMessage, error);
  }
}

function renderDelivery(need) {
  const editor = deliveryTemplate.content.firstElementChild.cloneNode(true);
  const form = editor.querySelector('form');
  const amount = form.elements.cantidad;
  const button = form.querySelector('button');
  const message = form.querySelector('[role="status"]');
  form.action = '/api/administrador/necesidades/' + need.id_necesidad + '/entregas';
  amount.max = need.pendiente;
  amount.addEventListener('input', () => { delete form.dataset.solicitud; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.dataset.solicitud ??= crypto.randomUUID();
    amount.disabled = button.disabled = true;
    message.hidden = true;
    try {
      const result = await api(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ cantidad: amount.value, id_solicitud: form.dataset.solicitud }),
      });
      loadSection(result.message);
    } catch (error) {
      showError(message, error);
    } finally {
      amount.disabled = button.disabled = false;
    }
  });
  return editor;
}

function renderTable(columns, rows, section) {
  const showReception = section === 'ofertas';
  const showDelivery = section === 'necesidades';
  const container = document.createElement('div');
  container.className = 'table-responsive tarjeta';
  container.tabIndex = 0;
  container.setAttribute('role', 'region');
  container.setAttribute('aria-labelledby', title.id);
  const table = document.createElement('table');
  table.className = 'table table-striped align-middle mb-0';
  const heading = table.createTHead().insertRow();
  for (const label of Object.values(columns)) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    heading.append(cell);
  }
  if (showReception || showDelivery) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = showReception ? 'Recepción' : 'Entrega';
    heading.append(cell);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const cells = body.insertRow();
    for (const key of Object.keys(columns)) cells.insertCell().textContent = row[key] ?? 'Sin dato';
    if (showReception) {
      const cell = cells.insertCell();
      if (row.cantidad_recibida != null) {
        cell.textContent = 'Recibido: ' + row.cantidad_recibida + ' ' + row.unidad_medida;
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm boton-principal';
        button.textContent = 'Confirmar recepción';
        button.setAttribute('aria-label', 'Confirmar recepción de la oferta #' + row.id_oferta);
        button.addEventListener('click', () => openDonation(row));
        cell.append(button);
      }
    }
    if (showDelivery) {
      const cell = cells.insertCell();
      if (Number(row.pendiente) > 0) cell.append(renderDelivery(row));
      else cell.textContent = 'Completada';
    }
  }
  container.append(table);
  return container;
}

async function loadSection(savedMessage) {
  activeQuery?.abort();
  const query = new AbortController();
  activeQuery = query;
  const requested = window.location.hash.slice(1);
  const section = sections.has(requested) ? requested : 'damnificados';
  for (const [name, link] of sections) {
    if (name === section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  title.textContent = section === 'damnificados' ? 'Damnificados registrados' : sections.get(section).textContent.trim();
  donationFlow.hidden = section !== 'donaciones';
  shelterGuide.hidden = section !== 'albergues';
  const openCards = new Set([...cards.querySelectorAll('[data-persona][open]')].map((card) => card.dataset.persona));
  if (savedMessage) showSaved(panelMessage, savedMessage);
  else panelMessage.hidden = true;
  cards.replaceChildren();
  total.textContent = 'Cargando registros…';
  try {
    const endpoint = section === 'damnificados' ? 'damnificados' : 'consultas/' + section;
    const data = await api('/api/administrador/' + endpoint, { signal: query.signal });
    if (query.signal.aborted) return;
    const rows = data.people ?? data.rows;
    total.textContent = rows.length ? 'Total de registros: ' + rows.length : 'Aún no hay registros en esta sección.';
    if (!rows.length) return;
    if (section === 'damnificados') {
      const list = document.createDocumentFragment();
      for (const person of rows) {
        const card = renderCard(person, data.labels, data.photos[person.id_damnificado] ?? [], data.shelters);
        card.open = openCards.has(card.dataset.persona);
        list.append(card);
      }
      cards.append(list);
    } else {
      cards.append(renderTable(data.columns, rows, section));
    }
  } catch (error) {
    if (query.signal.aborted) return;
    total.textContent = '';
    showError(panelMessage, error);
  }
}

async function loadPanel() {
  loginView.hidden = true;
  panel.hidden = false;
  await loadSection();
}

window.addEventListener('hashchange', () => {
  if (!panel.hidden) loadSection();
});

document.querySelector('#registrar-donacion').addEventListener('click', () => openDonation());
donationCancel.addEventListener('click', () => donationDialog.close());
donationDialog.addEventListener('cancel', (event) => {
  if (donationCancel.disabled) event.preventDefault();
});
donationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!csrf || donationButton.disabled) return;
  const body = JSON.stringify(Object.fromEntries(new FormData(donationForm)));
  donationButton.disabled = donationCancel.disabled = true;
  donationMessage.hidden = true;
  try {
    const result = await api(donationForm.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body,
    });
    donationDialog.close();
    loadSection(result.message);
  } catch (error) {
    showError(donationMessage, error);
  } finally {
    donationButton.disabled = donationCancel.disabled = false;
  }
});

shelterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!csrf) return;
  const button = shelterForm.querySelector('button[type="submit"]');
  button.disabled = true;
  shelterMessage.hidden = true;
  try {
    const result = await api(shelterForm.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(Object.fromEntries(new FormData(shelterForm))),
    });
    shelterForm.reset();
    shelterMessage.className = 'alert alert-success mt-2 mb-0';
    shelterMessage.textContent = result.message;
    shelterMessage.hidden = false;
    if (!shelterGuide.hidden) await loadSection();
  } catch (error) {
    showError(shelterMessage, error);
  } finally {
    button.disabled = false;
  }
});

login.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!csrf) return;
  loginMessage.hidden = true;
  loginButton.disabled = true;
  try {
    const result = await api(login.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(Object.fromEntries(new FormData(login))),
    });
    csrf = result.csrf;
    login.reset();
    await loadPanel();
  } catch (error) {
    showError(loginMessage, error);
  } finally {
    loginButton.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    await api('/api/administrador/salir', { method: 'POST', headers: { 'X-CSRF-Token': csrf } });
    window.location.replace('/administrador.html');
  } catch (error) {
    showError(panelMessage, error);
    logout.disabled = false;
  }
});

async function startAdmin() {
  if (window.location.protocol === 'file:') {
    serverHelp.hidden = false;
    return;
  }
  try {
    const session = await api('/api/sesion');
    if (typeof session?.csrf !== 'string') throw new Error('La sesión no está disponible.');
    csrf = session.csrf;
    if (session.admin) await loadPanel();
    else loginButton.disabled = false;
  } catch (error) {
    serverHelp.hidden = false;
  }
}

startAdmin();
