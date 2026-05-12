const dateInput = document.getElementById('date');
const noteInput = document.getElementById('note');
const saveButton = document.getElementById('save');
const messageEl = document.getElementById('message');
const loadReportButton = document.getElementById('loadReport');
const reportEl = document.getElementById('report');

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.className = isError ? 'message error' : 'message success';
}

async function fetchNote(date) {
  const response = await fetch(`/api/notes?date=${date}`);
  if (!response.ok) {
    throw new Error('Nepodařilo se načíst poznámku.');
  }
  return response.json();
}

async function saveNote(date, text) {
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, text }),
  });
  if (!response.ok) {
    throw new Error('Nepodařilo se uložit poznámku.');
  }
  return response.json();
}

async function loadReport() {
  const response = await fetch('/api/report');
  if (!response.ok) {
    throw new Error('Nepodařilo se načíst report.');
  }
  const notes = await response.json();
  if (!notes.length) {
    reportEl.innerHTML = '<p>Žádné uložené dny.</p>';
    return;
  }
  reportEl.innerHTML = notes
    .map(
      (note) => `
        <article class="report-card">
          <div class="report-card-header">
            <h3>${note.date}</h3>
            <button class="edit-note" data-date="${note.date}">Upravit</button>
          </div>
          <p>${note.text.replace(/\n/g, '<br />')}</p>
        </article>`,
    )
    .join('');

  const editButtons = reportEl.querySelectorAll('.edit-note');
  editButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      const target = event.currentTarget;
      const date = target.getAttribute('data-date');
      if (!date) return;
      dateInput.value = date;
      await loadDay();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

async function loadDay() {
  const date = dateInput.value;
  if (!date) return;
  try {
    const result = await fetchNote(date);
    noteInput.value = result.text || '';
  } catch (err) {
    showMessage(err.message, true);
  }
}

saveButton.addEventListener('click', async () => {
  const date = dateInput.value;
  const text = noteInput.value.trim();
  if (!date) {
    showMessage('Vyber datum.', true);
    return;
  }

  try {
    await saveNote(date, text);
    showMessage('Poznámka uložena.');
  } catch (err) {
    showMessage(err.message, true);
  }
});

loadReportButton.addEventListener('click', async () => {
  try {
    await loadReport();
  } catch (err) {
    showMessage(err.message, true);
  }
});

dateInput.addEventListener('change', loadDay);

const today = formatDate(new Date());
dateInput.value = today;
loadDay();
