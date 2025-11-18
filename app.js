/* Field Notes v2.8.4 — app.js */

let state = {
  project: "",
  rootDir: null,          // 親フォルダ (DirectoryHandle)
  currentLoc: null,       // 現在の Location 情報
  currentSampleIndex: 1,  // S001, S002, ...
  photos: [],             // [{ sampleId, blob, filename }]
  gps: null,
  macro: false,
  stream: null,
  track: null,
  zoomMax: 1,
  dirty: false,
  log: []                 // 保存ログ（最大20件）
};

/* -------------------------
   Utility
-------------------------- */

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => {
    t.style.display = "none";
  }, 1800);
}

function flash() {
  const f = document.getElementById("flash");
  f.style.opacity = 1;
  setTimeout(() => {
    f.style.opacity = 0;
  }, 150);
}

function updateMiniCounter() {
  const samples = new Set(state.photos.map((p) => p.sampleId)).size;
  const photos = state.photos.length;
  document.getElementById("miniCounter").textContent =
    `Samples: ${samples} • Photos: ${photos}`;
}

function updateDirty(flag) {
  state.dirty = flag;
  document.getElementById("dirtyBadge").textContent = flag ? "Unsaved ✎" : "Saved ✓";
}

function safeName(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function nowString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const dd = ("0" + d.getDate()).slice(-2);
  const hh = ("0" + d.getHours()).slice(-2);
  const mm = ("0" + d.getMinutes()).slice(-2);
  const ss = ("0" + d.getSeconds()).slice(-2);
  return `${y}${m}${dd} ${hh}${mm}${ss}`;
}

/* -------------------------
   GPS
-------------------------- */

async function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: null, lon: null, acc: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy
        });
      },
      () => {
        resolve({ lat: null, lon: null, acc: null });
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  });
}

/* -------------------------
   Camera
-------------------------- */

async function startCamera() {
  try {
    if (state.stream) {
      stopCamera();
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    if (state.macro) {
      // マクロ対応端末向け
      constraints.video.advanced = [{ focusMode: "macro" }];
    }

    state.stream = await navigator.mediaDevices.getUserMedia(constraints);

    const video = document.getElementById("video");
    video.srcObject = state.stream;
    await video.play();

    const [track] = state.stream.getVideoTracks();
    state.track = track;

    const caps = track.getCapabilities ? track.getCapabilities() : {};
    const zoomRow = document.getElementById("zoomRow");
    const zr = document.getElementById("zoomRange");
    const zv = document.getElementById("zoomVal");

    if (caps.zoom && typeof caps.zoom.max === "number") {
      state.zoomMax = caps.zoom.max || 1;
      zr.min = 1;
      zr.max = state.zoomMax;
      zr.value = 1;
      zr.step = 0.1;
      zoomRow.style.display = "flex";
      zv.textContent = "1.0×";
    } else {
      zoomRow.style.display = "none";
      zv.textContent = "";
    }

    document.getElementById("btnSnap").disabled = false;
  } catch (err) {
    console.error(err);
    toast("Failed to open camera.");
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
  }
  state.stream = null;
  state.track = null;
  document.getElementById("btnSnap").disabled = true;
}

document.getElementById("zoomRange").addEventListener("input", (e) => {
  const z = Number(e.target.value);
  if (state.track && state.track.applyConstraints) {
    state.track
      .applyConstraints({ advanced: [{ zoom: z }] })
      .catch((err) => console.warn("Zoom failed:", err));
  }
  document.getElementById("zoomVal").textContent = z.toFixed(1) + "×";
});

/* -------------------------
   Snap
-------------------------- */

async function snapPhoto() {
  if (!state.currentLoc) {
    toast("No location.");
    return;
  }

  const video = document.getElementById("video");
  if (!video || video.readyState < 2) {
    toast("Camera not ready.");
    return;
  }

  const canvas = document.getElementById("canvas");
  canvas.width = video.videoWidth || 1920;
  canvas.height = video.videoHeight || 1080;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      "image/jpeg",
      0.85
    );
  });

  if (!blob) {
    toast("Failed to capture.");
    return;
  }

  flash();

  const sampleId = `S${String(state.currentSampleIndex).padStart(3, "0")}`;
  const photoIndex =
    state.photos.filter((p) => p.sampleId === sampleId).length + 1;
  const fn = `${state.currentLoc.locationId}-${sampleId}-${String(
    photoIndex
  ).padStart(2, "0")}.jpg`;

  state.photos.push({
    sampleId,
    blob,
    filename: fn
  });

  updateMiniCounter();
  refreshGallery();
  updateDirty(true);
}

/* -------------------------
   Gallery
-------------------------- */

function refreshGallery() {
  const g = document.getElementById("gallery");
  g.innerHTML = "";

  state.photos.forEach((p) => {
    const url = URL.createObjectURL(p.blob);
    const img = document.createElement("img");
    img.src = url;
    img.alt = p.filename;

    img.addEventListener("click", () => openViewer(p));

    g.appendChild(img);
  });
}

function openViewer(photo) {
  const modal = document.getElementById("viewer");
  const img = document.getElementById("viewerImg");
  const url = URL.createObjectURL(photo.blob);
  img.src = url;
  modal.style.display = "flex";
}

document.getElementById("viewerClose").addEventListener("click", () => {
  document.getElementById("viewer").style.display = "none";
});

/* -------------------------
   New Location
-------------------------- */

document.getElementById("btnNewLoc").addEventListener("click", () => {
  const project = document.getElementById("project").value.trim();
  const note = document.getElementById("locNote").value.trim();

  if (!note) {
    toast("Location note is required.");
    return;
  }

  if (!project) {
    toast("Project name is required.");
    return;
  }

  state.project = project;

  const ts = nowString();
  const locId = `L${ts.replace(/[^0-9]/g, "")}`;

  state.currentLoc = {
    created: ts,
    locationId: locId,
    note: note
  };

  state.photos = [];
  state.currentSampleIndex = 1;

  document.getElementById("locInfo").textContent =
    `Location: ${locId} (${note})`;

  refreshGallery();
  updateMiniCounter();
  updateDirty(false);

  // ★ 追加：Location作成後は Close & Save を必ず使えるようにする
  document.getElementById("btnCloseSave").disabled = false;
});

/* -------------------------
   Save (CSV + JSON + Photos → folder)
-------------------------- */

document.getElementById("btnPickFolder").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) {
    toast("File System Access API not supported.");
    return;
  }

  try {
    const dir = await window.showDirectoryPicker();
    state.rootDir = dir;
    toast("Save folder set.");
  } catch (e) {
    toast("Canceled.");
  }
});

document.getElementById("btnCloseSave").addEventListener("click", async () => {
  if (!state.currentLoc) {
    toast("No location.");
    return;
  }
  if (!state.rootDir) {
    toast("Pick save folder first.");
    return;
  }

  try {
    await saveLocation();
  } catch (err) {
    console.error(err);
    toast("Save failed.");
  }
});

async function saveLocation() {
  const loc = state.currentLoc;
  const safeNote = safeName(loc.note);
  const folderName = `${loc.created}_${loc.locationId}_${safeNote}`;

  const locDir = await state.rootDir.getDirectoryHandle(folderName, {
    create: true
  });

  // Photos
  for (const p of state.photos) {
    const f = await locDir.getFileHandle(p.filename, { create: true });
    const w = await f.createWritable();
    await w.write(p.blob);
    await w.close();

    pushLog(state.project, p.sampleId, p.filename);
  }

  // CSV
  const csv = makeCSV();
  const csvFn = `${loc.locationId}.csv`;
  const f1 = await locDir.getFileHandle(csvFn, { create: true });
  const w1 = await f1.createWritable();
  await w1.write(csv);
  await w1.close();

  // JSON
  const json = JSON.stringify(
    {
      project: state.project,
      gps: state.gps,
      location: state.currentLoc,
      photos: state.photos.map((p) => p.filename)
    },
    null,
    2
  );

  const jsonFn = `${loc.locationId}.json`;
  const f2 = await locDir.getFileHandle(jsonFn, { create: true });
  const w2 = await f2.createWritable();
  await w2.write(json);
  await w2.close();

  toast("Saved.");
  updateDirty(false);
}

function makeCSV() {
  const rows = [
    ["project", state.project],
    ["locationId", state.currentLoc.locationId],
    ["note", state.currentLoc.note],
    ["gps_lat", state.gps?.lat ?? ""],
    ["gps_lon", state.gps?.lon ?? ""],
    [],
    ["sampleId", "filename"]
  ];

  for (const p of state.photos) {
    rows.push([p.sampleId, p.filename]);
  }

  return rows.map((r) => r.join(",")).join("\n");
}

/* -------------------------
   Sample
-------------------------- */

document.getElementById("btnNextSample").addEventListener("click", () => {
  state.currentSampleIndex++;
  updateMiniCounter();
});

document.getElementById("btnClearAll").addEventListener("click", () => {
  if (!confirm("Clear all photos?")) return;
  state.photos = [];
  refreshGallery();
  updateMiniCounter();
  updateDirty(true);
});

/* -------------------------
   Log (max 20)
-------------------------- */

function pushLog(project, sample, filename) {
  state.log.unshift({ project, sample, filename });
  if (state.log.length > 20) state.log.pop();
  renderLog();
}

function renderLog() {
  const tbody = document.getElementById("logBody");
  tbody.innerHTML = "";
  state.log.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.project}</td>
      <td>${l.sample}</td>
      <td>${l.filename}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* -------------------------
   Macro toggle
-------------------------- */

document.getElementById("btnMacro").addEventListener("click", () => {
  state.macro = !state.macro;
  toast(state.macro ? "Macro ON" : "Macro OFF");
  startCamera();
});

/* -------------------------
   Camera button
-------------------------- */

document.getElementById("btnCamera").addEventListener("click", startCamera);
document.getElementById("btnSnap").addEventListener("click", snapPhoto);

/* -------------------------
   GPS button
-------------------------- */

document.getElementById("btnGPS").addEventListener("click", async () => {
  state.gps = await getGPS();
  toast("GPS updated");
});

/* -------------------------
   Auto Save button (ダミー実装)
-------------------------- */

document.getElementById("btnAutoSave").addEventListener("click", () => {
  // 仕様が固まっていないので、ひとまずトグル表示だけ
  const btn = document.getElementById("btnAutoSave");
  const isOff = btn.textContent.includes("OFF");
  btn.textContent = isOff
    ? "Auto Save: ON"
    : "Auto Save: OFF";
  toast(isOff ? "Auto Save (label only)" : "Auto Save off");
});

/* -------------------------
   Install button (PWA)
-------------------------- */

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("btnInstall").style.display = "inline-block";
});

document.getElementById("btnInstall").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === "accepted") {
    toast("App installed");
  }
});

/* -------------------------
   Init
-------------------------- */

(async function init() {
  // 起動時に Close & Save は無効にしておく
  const closeBtn = document.getElementById("btnCloseSave");
  if (closeBtn) closeBtn.disabled = true;

  state.gps = await getGPS();
})();