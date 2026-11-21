const form = document.querySelector('#oferta-donacion');
const submit = form.querySelector('button[type="submit"]');
const notice = document.querySelector('#mensaje-donacion');
let csrf;

function showNotice(message, success = false) {
  notice.className = success ? 'alert alert-success' : 'alert alert-danger';
  notice.textContent = message;
  notice.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!csrf) return;
  const data = Object.fromEntries(new FormData(form));
  if (!data.telefono.trim() && !data.correo.trim()) {
    showNotice('Escribe al menos un teléfono o un correo electrónico.');
    form.elements.telefono.focus();
    return;
  }

  submit.disabled = true;
  notice.hidden = true;
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    showNotice(result.message, response.ok);
    if (response.ok) form.reset();
  } catch {
    showNotice('No se pudo contactar al servidor. Intenta de nuevo.');
  } finally {
    submit.disabled = false;
  }
});

async function startDonation() {
  if (window.location.protocol === 'file:') {
    showNotice('Inicia Express con npm.cmd start y abre esta página desde http://127.0.0.1:3000/.');
    return;
  }
  try {
    const session = await fetch('/api/sesion');
    if (!session.ok) throw new Error('No se pudo iniciar el formulario.');
    await cargarRecursos(form.elements.id_recurso);
    csrf = (await session.json()).csrf;
    submit.disabled = false;
  } catch (error) {
    showNotice(error.message);
  }
}

startDonation();
