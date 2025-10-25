// Public variables that will contain the OBJ file text (or null if not loaded)
window.objTextA = null;
window.objTextB = null;

window.output = null;
window.landmark = null;

function firstLoad() {
  const lastVisit = localStorage.getItem('lastVisit');

  let lastDate;

  try {
    if (lastVisit) {
      lastDate = JSON.parse(lastVisit).date;
    }
  } catch (e) {
    console.warn('stop trying to fuck this page, there\'s nobody to impress.');
    console.warn({lastVisit, e});
    localStorage.removeItem('lastVisit');
  }

  if (!lastDate || lastDate < new Date().setMonth(new Date().getMonth() - 6)) {
    document.getElementById('show-tutorial').classList.remove('hidden');

    document.getElementById('show-tutorial-last_visited').innerHTML =
      !lastDate ?
        'You\'re visiting this page for the first time. Want to see a quick tutorial?'
        : 'You haven\'t been here in a while. Need a quick tutorial?';
  } else {
    document.getElementById('show-tutorial').classList.add('hidden');
  }

  localStorage.setItem('lastVisit', JSON.stringify({date: new Date()}));
}

function hidePopup() {
  console.info('hiding popup ...');
  document.getElementById('show-tutorial').classList.add('hidden');
}

function showTutorial(stage) {
  console.log('showing tutorial stage:', stage)
  hidePopup();

  if (!stage) {
    document.getElementById(`tutorial-popup`).classList.add('hidden');
    return;
  }

  document.getElementById(`tutorial-popup`).classList.remove('hidden');

  document.getElementById('tutorial-stage-1').classList.add('hidden');
  document.getElementById('tutorial-stage-2').classList.add('hidden');
  document.getElementById('tutorial-stage-3').classList.add('hidden');
  document.getElementById('tutorial-stage-4').classList.add('hidden');

  document.getElementById(`tutorial-stage-${stage}`).classList.remove('hidden');
}

// Helper to wire one field
function setupField({ buttonSelector, inputId, dropId, metaId, targetVarName }) {
  const btn = document.querySelector("button[data-trigger='" + buttonSelector + "']");
  const input = document.getElementById(inputId);
  const drop = document.getElementById(dropId);
  const meta = document.getElementById(metaId);


  if (!btn || !input || !drop || !meta) return;


  // Open file dialog when button clicked
  btn.addEventListener('click', () => input.click());


  // When file selected via dialog
  input.addEventListener('change', (ev) => {
    const f = input.files && input.files[0];
    if (f) readFile(f, targetVarName, meta);
  });


  // Drag & drop
  ['dragenter', 'dragover'].forEach(ev => {
    drop.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      drop.classList.add('dragover');
    });
  });
  ['dragleave', 'dragend', 'drop'].forEach(ev => {
    drop.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('dragover');
    });
  });


  drop.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;

    processFileInput(dt, targetVarName, meta);
  });


  // Allow keyboard activation (Enter/Space)
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); input.click();
    }
  });
}

async function processFileInput(dataTransfer, target, meta) {
  const files = dataTransfer.files;

  if (files?.length === 2) {
    const [a,b] = files;

    const objectsA = getObjects(await readFile(a, null, meta));
    const objectsB = getObjects(await readFile(b, null, meta));

    const oaa = {file: a, objects: objectsA};
    const obb = {file: b, objects: objectsB};

    if (objectsA.length === objectsB.length) {
      if (objectsA.length !== 1) {
        alert('Landmark geometry contains more than one contiguous object. Your landmark should be a single object.');
        return;
      }
      console.log('processing just the landmark!');

      if (objectsA[0].vertices.length > objectsB[0].vertices.length) {
        await setUploadedFiles(obb, oaa);
      } else {
        await setUploadedFiles(oaa, obb);
      }
    } else if (objectsA.length > objectsB.length) {
      await setUploadedFiles(obb, oaa);
    } else {
      await setUploadedFiles(oaa, obb);
    }
  } else {
    const f = files && files[0];
    if (f) {
      const objects = getObjects(await readFile(f, target, meta));
      window[target] = objects;
      await renderModel(objects, target);

      setDropBoxContent(target, 'ok');
    }
  }

  // auto-process
  if (window.landmark && window.output) {
    document.getElementById('lpt1-info-box').classList.add('hidden');
    calculate();
  }
}

async function renderModel(objects, target) {
  const canvas = document.getElementById(`${target}-canvas`);

  const objects3 = normalizeObjectsGlobal(
    compileObj_global(
      objects,
      {output: 'object'}
    )
  );

  // correct vertex offsets
  objects3[0].faces = objects3[0].faces.map(([a,b,c]) => [a-1, b-1, c-1]);

  // auto-set "flip normals"
  if (target === 'output') {
    const orientation = checkNormalOrientation(objects3);
    console.log('output orientation:', orientation.orientation);
    document.getElementById('cb_flip_normals').checked = orientation.orientation === 'inward';
  }
  await renderTwoSidedLit(objects3, canvas);
}

/**
 * Manages appearance of file input form
 * @param {*} landmark {file: File, objects: []}. Undefined to _not_ set, null to clear
 * @param {*} output {file: File, objects: []}. Undefined to _not_ set, null to clear
 */
async function setUploadedFiles(landmark, output) {
  console.log('set uploaded file:', landmark, output);
  const metaLandmark = document.getElementById('metaLandmark');
  const metaOutput = document.getElementById('metaOutput');

  if (landmark !== undefined) {
    if (landmark === null) {
      metaLandmark.innerHTML = 'No file selected.';
      setDropBoxContent('landmark');
      window.landmark = undefined;
    } else {
      metaLandmark.innerHTML = '<span class="filename">' + escapeHtml(landmark.file.name) + '</span>' + ' — ' + landmark.file.size + ' bytes';
      window.landmark = landmark.objects;
      setDropBoxContent('landmark', 'ok');
      await renderModel(landmark.objects, 'landmark');
    }
  }
  if (output !== undefined) {
    if (output === null) {
      metaOutput.innerHTML = 'No file selected.';
      window.output = undefined;
      setDropBoxContent('output');
    } else {
      metaOutput.innerHTML = '<span class="filename">' + escapeHtml(output.file.name) + '</span>' + ' — ' + output.file.size + ' bytes';
      window.output = output.objects;
      window.suggestedExportFilename = `${output.file.name}__fixed.obj`
      setDropBoxContent('output', 'ok');
      await renderModel(output.objects, 'output');
    }
  }
}

/**
 * Resets the page
 */
function reset() {
  setUploadedFiles(null, null);
  document.getElementById('results-ready').classList.add('hidden');
}

/**
 * Sets drop box text.
 * @param {*} dropBoxFor
 * @param {*} status undefined, "ok", "err"
 *
 */
function setDropBoxContent(dropBoxFor, status) {
  console.log('setting drop box content:', dropBoxFor, status);

  const canvas = document.getElementById(`${dropBoxFor}-canvas`);
  const text = document.getElementById(`${dropBoxFor}-nofile`);

  switch (status) {
    case 'ok':
      canvas.classList.remove('hidden');
      text.classList.add('hidden');
      break;
    default:
      canvas.classList.add('hidden');
      text.classList.remove('hidden');
  }
}

async function readFile(file, targetVarName, metaEl) {
  if (!file.name.toLowerCase().endsWith('.obj')) {
    metaEl.textContent = 'Invalid file type — please select an .obj file';
    window[targetVarName] = null;
    return;
  }

  const reader = new FileReader();
  return new Promise( (resolve, reject) => {
    reader.onload = function () {
      const text = reader.result;
      if (targetVarName) {
        window[targetVarName] = text;
      }
      metaEl.innerHTML = '<span class="filename">' + escapeHtml(file.name) + '</span>' + ' — ' + file.size + ' bytes';
      console.log('Loaded', targetVarName, file.name, file.size, 'bytes');
      resolve(text);
    };
    reader.onerror = function (err) {
      console.error('File read error', err);
      metaEl.textContent = 'Error reading file';
      if (targetVarName) {
        window[targetVarName] = null;
      }
      reject(err);
    };
    reader.readAsText(file);
  });
}

function setConversionDefaults() {
  document.getElementById('cb_remove_landmarks').checked = true;
  document.getElementById('cb_invert_handedness').checked = true;
  document.getElementById('cb_split_loose').checked = true;
  document.getElementById('cb_resize').checked = true;
  document.getElementById('i_size').value = 100;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" })[c]); }


// Wire both fields
setupField({ buttonSelector: 'fileLandmark', inputId: 'inputLandmark', dropId: 'dropLandmark', metaId: 'metaLandmark', targetVarName: 'landmark' });
setupField({ buttonSelector: 'fileOutput', inputId: 'inputOutput', dropId: 'dropOutput', metaId: 'metaOutput', targetVarName: 'output' });
setConversionDefaults();
firstLoad();

// Prevent accidental navigation on drag over the window
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
