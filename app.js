(() => {
    "use strict";
    const { bundles, links, settings } = window.PATCH_CONFIG;
    const $ = id => document.getElementById(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MAX_NAME = 64;
    const NAME_RE = PatchSpec.NAME_RE;

    const state = {
        bundle: null, link: null,
        file: null,          // set only after the file was read successfully
        reading: null,       // FileReader in progress
        downloadUrl: null, busy: false, generated: false
    };

    const els = {
        form: $("patchForm"), steps: document.querySelectorAll(".step"),
        bundleOptions: $("bundleOptions"), linkOptions: $("linkOptions"),
        patchName: $("patchName"), nameField: document.querySelector(".field"), nameCount: $("nameCount"), nameHint: $("nameHint"),
        dropzone: $("dropzone"), dzLimit: $("dzLimit"), fileInput: $("fileInput"),
        fileCard: $("fileCard"), fileIconSvg: $("fileIconSvg"), fileName: $("fileName"), fileExt: $("fileExt"),
        fileSize: $("fileSize"), fileStatus: $("fileStatus"), fileProgress: $("fileProgress"), removeFile: $("removeFile"),
        error: $("error"), errorText: $("errorText"),
        generateBtn: $("generateBtn"), generateLabel: $("generateLabel"),
        progressWrap: $("progressWrap"), progressBar: $("progressBar"), progressLabel: $("progressLabel"), progressPct: $("progressPct"),
        ring: $("ring"), ringFill: $("ringFill"), ringText: $("ringText"), progressCaption: $("progressCaption"),
        sumPct: $("sumPct"), sumBar: $("sumBar"), sumStatus: $("sumStatus"), sumStatusText: $("sumStatusText"),
        result: $("result"), resName: $("resName"), resOut: $("resOut"), downloadLabel: $("downloadLabel"), resFile: $("resFile"), resSize: $("resSize"), resBundle: $("resBundle"), resLink: $("resLink"),
        downloadBtn: $("downloadBtn"), resetBtn: $("resetBtn"), toasts: $("toasts")
    };

    const svgUse = id => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;

    /* ---------- Selectable cards (keys only — real values never reach the DOM) ---------- */
    const CHOICE_ICONS = {
        bundle: ["assets/bundle.jpg", "assets/bundle.jpg", "assets/bundle.jpg"],
        link: ["assets/link-a.jpg", "assets/link-b.jpg", "assets/link-c.jpg"]
    };
    const CHOICE_SUB = { bundle: "Bundle package", link: "Destination link" };
    const isImage = v => /\.(jpe?g|png|webp)$/i.test(v);
    const iconMarkup = v => isImage(v) ? `<img src="${v}" alt="" draggable="false">`
        : v.startsWith("i-") ? svgUse(v) : `<svg viewBox="0 0 24 24" aria-hidden="true">${v}</svg>`;

    // Validate config.js once. Messages name the key only, never the value.
    const configIssues = [];
    function renderChoices(container, map, type, validate) {
        container.innerHTML = "";
        let firstEnabled = true;
        Object.keys(map).forEach((key, i) => {
            const label = (type === "bundle" ? "Bundle " : "Link ") + key;
            const problem = validate(map[key]);
            if (problem) configIssues.push({ label, problem });
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "choice gb";
            btn.dataset.key = key;
            btn.setAttribute("role", "radio");
            btn.setAttribute("aria-checked", "false");
            btn.disabled = !!problem;
            btn.tabIndex = !problem && firstEnabled ? 0 : -1;
            if (!problem) firstEnabled = false;
            const sub = !problem ? CHOICE_SUB[type] : problem === "is not configured" ? "Not configured" : "Invalid in config";
            btn.innerHTML =
                `<span class="choice-icon${isImage(CHOICE_ICONS[type][i % 3]) ? " choice-icon--img" : ""}">${iconMarkup(CHOICE_ICONS[type][i % 3])}</span>` +
                `<span><span class="choice-name">${label}</span><span class="choice-sub">${sub}</span></span>` +
                `<span class="choice-tick">${svgUse("i-check")}</span>`;
            btn.addEventListener("click", e => {
                if (state.busy) return;
                if (!reduceMotion && btn.getAttribute("aria-checked") !== "true") ripple(btn, e);
                select(type, key);
            });
            btn.addEventListener("pointermove", e => {
                const r = btn.getBoundingClientRect();
                btn.style.setProperty("--mx", e.clientX - r.left + "px");
                btn.style.setProperty("--my", e.clientY - r.top + "px");
            });
            container.appendChild(btn);
        });
        // Roving tabindex + arrow keys (standard radiogroup behaviour)
        container.addEventListener("keydown", e => {
            const items = [...container.children].filter(b => !b.disabled);
            const idx = items.indexOf(document.activeElement);
            if (idx < 0) return;
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            const next = items[(idx + step + items.length) % items.length];
            next.focus(); next.click();
        });
    }

    function ripple(btn, e) {
        const r = btn.getBoundingClientRect();
        const fromPointer = e.clientX || e.clientY;              // keyboard clicks start from the centre
        const span = document.createElement("span");
        span.className = "choice-ripple";
        span.style.setProperty("--rx", (fromPointer ? e.clientX - r.left : r.width / 2) + "px");
        span.style.setProperty("--ry", (fromPointer ? e.clientY - r.top : r.height / 2) + "px");
        btn.appendChild(span);
        span.addEventListener("animationend", () => span.remove());
    }

    function select(type, key) {
        if (state.busy || state[type] === key) return;
        state[type] = key;
        const container = type === "bundle" ? els.bundleOptions : els.linkOptions;
        container.querySelectorAll(".choice").forEach(b => {
            const on = b.dataset.key === key;
            b.setAttribute("aria-checked", String(on));
            b.tabIndex = on ? 0 : -1;
        });
        invalidateResult();
        update(type);
    }

    /* ---------- File handling ---------- */
    const FILE_KINDS = {
        archive: { ext: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"], icon: '<path d="M21 8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8"/><path d="M1.5 4h21v4h-21z"/><path d="M10 12h4"/>' },
        app:     { ext: ["ipa", "apk", "aab", "dmg", "pkg", "exe", "msi", "deb", "app", "appx"], icon: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>' },
        image:   { ext: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic"], icon: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-5-5L5 21"/>' },
        code:    { ext: ["js", "ts", "json", "xml", "plist", "yml", "yaml", "html", "css", "py", "sh", "cfg", "ini", "conf", "dylib", "so", "dll"], icon: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/>' },
        doc:     { ext: ["txt", "md", "pdf", "doc", "docx", "csv", "log"], icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>' }
    };
    const DEFAULT_FILE_ICON = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>';

    function fileKind(name) {
        const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
        for (const [kind, def] of Object.entries(FILE_KINDS)) if (def.ext.includes(ext)) return { kind, ext, icon: def.icon };
        return { kind: "file", ext, icon: DEFAULT_FILE_ICON };
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        const units = ["KB", "MB", "GB"];
        let v = bytes / 1024, i = 0;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return v.toFixed(v < 10 ? 2 : 1) + " " + units[i];
    }

    function setFileStatus(kind, text) {
        els.fileStatus.innerHTML = (kind === "ready" ? svgUse("i-check") : "") + `<span>${text}</span>`;
        els.fileCard.classList.toggle("ready", kind === "ready");
    }

    function acceptFile(file) {
        hideError();
        if (!file || state.busy) return;
        const exts = settings.acceptedExtensions || [];
        const fail = msg => { showError(msg); toast(msg, "error"); };
        if (exts.length && !exts.some(e => file.name.toLowerCase().endsWith(e.toLowerCase())))
            return fail(`Unsupported file type. Accepted: ${exts.join(", ")}`);
        if (file.size > settings.maxFileSizeMB * 1024 * 1024)
            return fail(`File exceeds the ${settings.maxFileSizeMB} MB limit.`);
        if (file.size === 0) return fail("The selected file is empty.");

        cancelRead();
        state.file = null;
        invalidateResult();

        const info = fileKind(file.name);
        els.fileCard.dataset.kind = info.kind;
        els.fileIconSvg.innerHTML = info.icon;
        els.fileExt.textContent = (info.ext || "file").toUpperCase().slice(0, 6);
        els.fileName.textContent = els.fileName.title = file.name;
        els.fileSize.textContent = formatSize(file.size);
        els.fileProgress.style.width = "0%";
        setFileStatus("loading", "Uploading 0%");
        els.fileCard.hidden = false;
        els.dropzone.hidden = true;

        // Read the file once locally: gives real progress and catches unreadable items (e.g. folders)
        const reader = new FileReader();
        state.reading = reader;
        update();
        reader.onprogress = e => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            els.fileProgress.style.width = pct + "%";
            setFileStatus("loading", `Uploading ${pct}%`);
        };
        reader.onload = () => {
            if (state.reading !== reader) return;
            state.reading = null;
            state.file = file;
            els.fileProgress.style.width = "100%";
            setFileStatus("ready", "Ready");
            update("file");
            toast(`${file.name} uploaded`, "success");
        };
        reader.onerror = () => {
            if (state.reading !== reader) return;
            state.reading = null;
            clearFile(true);
            const msg = "This file could not be read. Please choose another file.";
            showError(msg); toast(msg, "error");
        };
        reader.readAsArrayBuffer(file);
    }

    function cancelRead() {
        if (state.reading) { const r = state.reading; state.reading = null; try { r.abort(); } catch (_) {} }
    }

    function clearFile(silent) {
        cancelRead();
        state.file = null;
        els.fileInput.value = "";
        els.fileCard.hidden = true;
        els.dropzone.hidden = false;
        invalidateResult();
        update();
        if (!silent) toast("File removed");
    }

    const exts = settings.acceptedExtensions || [];
    if (exts.length) els.fileInput.accept = exts.join(",");
    els.dzLimit.textContent = (exts.length ? exts.join(" · ").toUpperCase() : "Any file type") + " · Max " + settings.maxFileSizeMB + " MB";

    els.fileInput.addEventListener("change", e => acceptFile(e.target.files[0]));
    els.removeFile.addEventListener("click", () => { if (!state.busy) clearFile(); });
    els.dropzone.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
    });

    let dragDepth = 0;
    const dzTitle = $("dzTitle"), dzTitleText = dzTitle.textContent;
    const setDrag = on => {
        els.dropzone.classList.toggle("drag", on);
        dzTitle.textContent = on ? "Drop to upload" : dzTitleText;
    };
    els.dropzone.addEventListener("dragenter", e => { e.preventDefault(); dragDepth++; setDrag(true); });
    els.dropzone.addEventListener("dragover", e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
    els.dropzone.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; setDrag(false); } });
    els.dropzone.addEventListener("drop", e => {
        e.preventDefault(); dragDepth = 0; setDrag(false);
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 1) toast("Only one file is used — the first one was selected.");
        if (files && files[0]) acceptFile(files[0]);
    });
    // Keep the browser from opening files dropped outside the zone
    ["dragover", "drop"].forEach(ev => window.addEventListener(ev, e => e.preventDefault()));

    /* ---------- Patch name ---------- */
    const cleanName = () => els.patchName.value.trim();
    const nameValid = () => NAME_RE.test(cleanName());
    const hintText = els.nameHint.querySelector("span");
    const HINT_DEFAULT = hintText.textContent;

    els.patchName.addEventListener("input", () => {
        const raw = els.patchName.value, v = raw.trim();
        const bad = v.length > 0 && !NAME_RE.test(v);
        els.nameField.classList.toggle("invalid", bad);
        els.nameField.classList.toggle("valid", !bad && v.length > 0);
        els.nameHint.classList.toggle("err", bad);
        els.patchName.setAttribute("aria-invalid", String(bad));
        hintText.textContent = bad ? "Use only letters, numbers, dot (.), dash (-) and underscore (_)." : HINT_DEFAULT;
        els.nameCount.textContent = `${raw.length}/${MAX_NAME}`;
        els.nameCount.classList.toggle("near", raw.length >= MAX_NAME - 8);
        invalidateResult();
        update("name");
    });

    /* ---------- State → UI ---------- */
    const SUM = {
        bundle: { get: () => state.bundle && "Bundle " + state.bundle, empty: "Not selected" },
        link:   { get: () => state.link && "Link " + state.link,       empty: "Not selected" },
        name:   { get: () => nameValid() && cleanName(),               empty: "Not set" },
        file:   { get: () => state.file && state.file.name,            empty: "No file" }
    };
    const sumItems = {};
    document.querySelectorAll(".sum-item").forEach(li => { sumItems[li.dataset.key] = li; });

    function update(changed) {
        const done = [!!state.bundle, !!state.link, nameValid(), !!state.file];
        const count = done.filter(Boolean).length;
        els.steps.forEach((s, i) => s.classList.toggle("done", done[i]));

        // header progress
        els.ringFill.style.strokeDashoffset = 113.1 * (1 - count / 4);
        els.ringText.textContent = `${count}/4`;
        els.ring.classList.toggle("full", count === 4);
        els.ring.setAttribute("aria-valuenow", count);
        els.progressCaption.textContent = count === 4 ? "All steps complete — ready to generate" : `${count} of 4 steps complete`;
        els.progressCaption.classList.toggle("complete", count === 4);

        // live summary
        els.sumPct.textContent = count * 25 + "%";
        els.sumBar.style.width = count * 25 + "%";
        Object.entries(SUM).forEach(([key, def]) => {
            const li = sumItems[key], val = def.get(), out = li.querySelector(".sum-val");
            const text = val || def.empty;
            if (out.textContent !== text) {
                out.textContent = text;
                out.title = val || "";
                if (key === changed || (changed === "file" && key === "file")) {
                    li.classList.remove("flash"); void li.offsetWidth; li.classList.add("flash");
                }
            }
            li.classList.toggle("set", !!val);
        });

        let cls = "", text;
        if (state.busy) { cls = "busy"; text = "Creating .3105 package…"; }
        else if (state.generated) { cls = "done"; text = ".3105 package ready to download"; }
        else if (state.reading) { cls = "busy"; text = "Uploading file…"; }
        else if (count === 4) { cls = "ready"; text = "Ready to generate"; }
        else { const left = 4 - count; text = `Waiting for input · ${left} step${left > 1 ? "s" : ""} left`; }
        els.sumStatus.className = "sum-status" + (cls ? " " + cls : "");
        els.sumStatusText.textContent = text;

        const wasDisabled = els.generateBtn.disabled;
        els.generateBtn.disabled = state.busy || count < 4;
        if (wasDisabled && count === 4 && !state.busy && !state.generated) {
            els.generateBtn.classList.remove("armed"); void els.generateBtn.offsetWidth;
            els.generateBtn.classList.add("armed");
        }
        els.removeFile.disabled = state.busy;
    }

    /* ---------- Feedback ---------- */
    function showError(msg) { els.errorText.textContent = msg; els.error.hidden = false; }
    function hideError() { els.error.hidden = true; }

    function toast(message, type = "info") {
        const icon = { success: "i-check", error: "i-alert", info: "i-info" }[type];
        const t = document.createElement("div");
        t.className = "toast " + type;
        t.setAttribute("role", type === "error" ? "alert" : "status");
        t.innerHTML = svgUse(icon) + "<span></span>";
        t.querySelector("span").textContent = message;
        els.toasts.appendChild(t);
        while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
        const leave = () => {
            if (!t.isConnected) return;
            t.classList.add("leaving");
            setTimeout(() => t.remove(), reduceMotion ? 0 : 250);
        };
        setTimeout(leave, type === "error" ? 4500 : 3000);
        t.addEventListener("click", leave);
    }

    function setProgress(pct, label) {
        els.progressBar.style.width = pct + "%";
        els.progressPct.textContent = pct + "%";
        if (label) els.progressLabel.textContent = label;
    }

    function invalidateResult() {
        if (state.downloadUrl) { URL.revokeObjectURL(state.downloadUrl); state.downloadUrl = null; }
        state.generated = false;
        els.result.hidden = true;
        fitSide();
    }

    // Sticky side column only while it fits in the viewport
    const side = document.querySelector(".side");
    function fitSide() { side.classList.toggle("tall", side.scrollHeight + 100 > window.innerHeight); }
    window.addEventListener("resize", fitSide);

    /* ---------- Generate ---------- */
    els.form.addEventListener("submit", async e => {
        e.preventDefault();
        if (els.generateBtn.disabled || state.busy) return;   // no double submits
        hideError();
        invalidateResult();

        state.busy = true;
        els.generateBtn.classList.remove("armed");
        els.generateBtn.classList.add("loading");
        els.generateBtn.setAttribute("aria-busy", "true");
        els.generateLabel.textContent = "CREATING .3105 PATCH...";
        els.progressWrap.hidden = false;
        setProgress(0, "Processing…");
        update();

        try {
            const patchName = cleanName();
            const started = performance.now();
            const { blob, filename, verified, format } = await buildPatch({
                bundleKey: state.bundle,
                linkKey: state.link,
                patchName,
                file: state.file,
                onProgress: setProgress
            });
            const elapsed = performance.now() - started;   // keep the state readable on tiny files
            if (elapsed < 700) await new Promise(r => setTimeout(r, 700 - elapsed));

            state.downloadUrl = URL.createObjectURL(blob);
            els.downloadBtn.href = state.downloadUrl;
            els.downloadBtn.download = filename;
            const set = (el, v) => { el.textContent = v; el.title = v; };
            set(els.resName, patchName);
            set(els.resOut, filename);
            const badge = $("resBadge");
            badge.textContent = verified ? "APP VERIFIED" : "SCHEMA V3";
            badge.classList.toggle("warn", !verified);
            $("resNote").classList.toggle("warn", !verified);
            $("resNoteText").textContent = verified
                ? `Format: ${format}.`
                : `Encoded with the public 3105 schema v3 codec (${format}). Import on your installed app version has not been confirmed.`;
            clearTimeout(dlTimer);
            els.downloadBtn.classList.remove("started");
            els.downloadLabel.textContent = "DOWNLOAD .3105 PATCH";
            set(els.resFile, state.file.name);
            set(els.resSize, formatSize(blob.size));
            set(els.resBundle, "Bundle " + state.bundle);
            set(els.resLink, "Link " + state.link);
            state.generated = true;
            els.result.hidden = false;
            toast(verified ? "3105 patch created" : ".3105 patch created — test import in your app", "success");
            fitSide();
            const r = els.result.getBoundingClientRect();
            if (r.bottom > window.innerHeight || r.top < 0) {
                els.result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
            }
            els.result.focus({ preventScroll: true });
        } catch (err) {
            console.error(err);
            const msg = "Failed to create .3105 patch: " + (err && err.message ? err.message : err);
            showError(msg); toast(".3105 patch creation failed", "error");
        } finally {
            state.busy = false;
            els.generateBtn.classList.remove("loading");
            els.generateBtn.removeAttribute("aria-busy");
            els.generateLabel.textContent = "CREATE .3105 PATCH";
            setTimeout(() => { els.progressWrap.hidden = true; }, 600);
            update();
        }
    });

    // drop the one-time class so hover styles take over again
    els.generateBtn.addEventListener("animationend", e => {
        if (e.animationName === "armed") els.generateBtn.classList.remove("armed");
    });

    let dlTimer;
    els.downloadBtn.addEventListener("click", () => {
        clearTimeout(dlTimer);
        els.downloadBtn.classList.add("started");
        els.downloadLabel.textContent = "DOWNLOAD STARTED";
        dlTimer = setTimeout(() => {
            els.downloadBtn.classList.remove("started");
            els.downloadLabel.textContent = "DOWNLOAD .3105 PATCH";
        }, 1800);
    });

    els.resetBtn.addEventListener("click", () => {
        invalidateResult();
        state.bundle = state.link = null;
        document.querySelectorAll(".choice").forEach(b => {
            b.setAttribute("aria-checked", "false");
            b.tabIndex = b === b.parentElement.querySelector(".choice:not(:disabled)") ? 0 : -1;
        });
        els.patchName.value = "";
        els.patchName.dispatchEvent(new Event("input"));
        clearFile(true);
        hideError();
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    /* ---------- Particles: very light, ~30fps, paused when hidden ---------- */
    (function particles() {
        const canvas = $("particles");
        const ctx = canvas.getContext("2d");
        if (!ctx || reduceMotion) return;
        let w, h, dots = [], last = 0;
        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = canvas.clientWidth; h = canvas.clientHeight;
            canvas.width = w * dpr; canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = Math.round(Math.min(36, (w * h) / 40000));
            dots = Array.from({ length: n }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
                r: Math.random() * 1.1 + .4, a: Math.random() * .35 + .1
            }));
        }
        function frame(t) {
            requestAnimationFrame(frame);
            if (document.hidden || t - last < 33) return;
            last = t;
            ctx.clearRect(0, 0, w, h);
            for (const d of dots) {
                d.x = (d.x + d.vx + w) % w; d.y = (d.y + d.vy + h) % h;
                ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283);
                ctx.fillStyle = `rgba(190,180,255,${d.a})`; ctx.fill();
            }
            ctx.lineWidth = .5;
            for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
                const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y, dist = dx * dx + dy * dy;
                if (dist < 10000) {
                    ctx.strokeStyle = `rgba(139,92,246,${.09 * (1 - dist / 10000)})`;
                    ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke();
                }
            }
        }
        resize();
        let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
        requestAnimationFrame(frame);
    })();

    renderChoices(els.bundleOptions, bundles, "bundle", PatchSpec.validateBundleId);
    renderChoices(els.linkOptions, links, "link", PatchSpec.validateRelPath);
    if (configIssues.length) {
        const configAlert = $("configAlert");
        const unset = configIssues.filter(c => c.problem === "is not configured").map(c => c.label);
        const invalid = configIssues.filter(c => c.problem !== "is not configured").map(c => c.label);
        const parts = [];
        if (unset.length) parts.push(`${unset.join(", ")} not configured`);
        if (invalid.length) parts.push(`${invalid.join(", ")} invalid`);
        $("configAlertText").textContent = `config.js: ${parts.join(" · ")}. See README.`;
        configAlert.hidden = false;
        configIssues.forEach(c => console.warn(`[3105 config] ${c.label} ${c.problem}`));
    }
    update();
})();
