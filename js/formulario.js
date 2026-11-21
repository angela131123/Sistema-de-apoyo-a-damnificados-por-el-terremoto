const photoInput = document.querySelector('#fotos');
const previews = document.querySelector('#vista-fotos');
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
const form = document.querySelector('#registro');
const submit = form.querySelector('button');
const message = document.querySelector('#mensaje-registro');
let configuration;
let previewUrls = [];

function showMessage(text, success) {
  message.className = success ? 'alert alert-success' : 'alert alert-danger';
  message.textContent = text;
  message.hidden = false;
}

function updatePreviews() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  previews.replaceChildren();

  if (!configuration) return;
  const files = [...photoInput.files];
  const { maxPhotos, maxPhotoBytes } = configuration;
  if (files.length > maxPhotos || files.some((file) => file.size > maxPhotoBytes ||
      (file.type && !allowedTypes.includes(file.type)))) {
    photoInput.setCustomValidity('Adjunta hasta 3 fotos JPG, PNG o WebP de 3 MB cada una.');
    photoInput.reportValidity();
    return;
  }

  photoInput.setCustomValidity('');
  for (const [index, file] of files.entries()) {
    const item = document.createElement('div');
    item.className = 'col-6 col-md-4';
    const image = document.createElement('img');
    image.className = 'foto-afectacion rounded';
    image.alt = 'Vista previa de la foto ' + (index + 1);
    image.src = URL.createObjectURL(file);
    previewUrls.push(image.src);
    item.append(image);
    previews.append(item);
  }
}

photoInput.addEventListener('change', updatePreviews);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!configuration) return;
  submit.disabled = true;
  message.hidden = true;
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'X-CSRF-Token': configuration.csrf },
      body: new FormData(form),
    });
    const data = await response.json();
    showMessage(data.message, response.ok);
    if (response.ok) {
      form.reset();
      updatePreviews();
    }
  } catch {
    showMessage('No fue posible comunicarse con el servidor. Intenta de nuevo.', false);
  } finally {
    submit.disabled = false;
  }
});

async function startRegistration() {
  if (window.location.protocol === 'file:') {
    showMessage('Inicia Express con npm.cmd start y abre el formulario desde http://127.0.0.1:3000/.', false);
    return;
  }
  try {
    const response = await fetch('/api/sesion');
    if (!response.ok) throw new Error();
    await cargarRecursos(form.elements.id_recurso);
    configuration = await response.json();
    form.elements.fecha_nacimiento.max = configuration.today;
    updatePreviews();
    submit.disabled = false;
  } catch {
    showMessage('No fue posible abrir el formulario. Recarga la página e intenta de nuevo.', false);
  }
}

startRegistration();
