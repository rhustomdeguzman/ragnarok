let pdfLibraryPromise, ocrLibraryPromise;
async function loadPdfLibrary() {
  if (!pdfLibraryPromise)
    pdfLibraryPromise = import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs"
    )
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc =
          "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
        return lib;
      })
      .catch(() => {
        pdfLibraryPromise = null;
        throw Error(
          "Could not load the PDF reader. Check your internet connection and retry.",
        );
      });
  return pdfLibraryPromise;
}
async function loadOcrLibrary() {
  if (window.Tesseract) return window.Tesseract;
  if (!ocrLibraryPromise)
    ocrLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => {
        script.remove();
        ocrLibraryPromise = null;
        reject(
          Error(
            "Could not load OCR. Check your internet connection and retry.",
          ),
        );
      };
      document.head.append(script);
    });
  return ocrLibraryPromise;
}
export async function extractUpload(file, progress, signal) {
  if (file.size > 10 * 1024 * 1024)
    throw Error("Maximum file size is 10 MB: " + file.name);
  const ext = file.name.split(".").pop().toLowerCase();
  if (
    !["pdf", "png", "jpg", "jpeg", "webp", "txt", "md", "csv", "json"].includes(
      ext,
    )
  )
    throw Error("Use PDF, PNG, JPG, WebP, TXT, Markdown, CSV, or JSON.");
  let worker, pdf, loadingTask, activeRender;
  const check = () => {
    if (signal.aborted) throw Error("Upload canceled.");
  };
  const cancel = () => {
    if (worker) void worker.terminate();
    if (loadingTask) void loadingTask.destroy();
    if (activeRender) activeRender.cancel();
  };
  signal.addEventListener("abort", cancel, { once: true });
  async function readImage(image, label) {
    check();
    progress(label + " · loading English OCR…");
    if (!worker) {
      const Tesseract = await loadOcrLibrary();
      check();
      worker = await Tesseract.createWorker("eng", 1, {
        workerPath:
          "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
        logger: (m) => {
          if (!signal.aborted)
            progress(
              label +
                " · " +
                (m.status === "recognizing text"
                  ? "reading text " + Math.round(m.progress * 100) + "%"
                  : m.status + "…"),
            );
        },
      });
    }
    check();
    let timeout;
    try {
      const result = await Promise.race([
        worker.recognize(image),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                Error("OCR took too long. Try a smaller or clearer scan."),
              ),
            120000,
          );
        }),
      ]);
      check();
      return result.data.text.trim();
    } finally {
      clearTimeout(timeout);
    }
  }
  try {
    check();
    progress("Reading " + file.name + "…");
    if (["txt", "md", "csv", "json"].includes(ext)) {
      if (file.size > 600000)
        throw Error("Text files must be smaller than 600 KB.");
      const text = await file.text();
      check();
      if (!text.trim() || text.includes("\u0000"))
        throw Error("No readable text in " + file.name);
      return { text, extraction: "text" };
    }
    if (ext === "pdf") {
      const lib = await loadPdfLibrary();
      check();
      loadingTask = lib.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
      });
      pdf = await loadingTask.promise;
      check();
      if (pdf.numPages > 30)
        throw Error(
          "Use a PDF with 30 pages or fewer. Split larger files first.",
        );
      const sections = [];
      let usedOcr = false,
        total = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        check();
        const label = file.name + " · page " + pageNumber + "/" + pdf.numPages;
        progress(label);
        const page = await pdf.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          let text = content.items
            .map((item) =>
              typeof item.str === "string"
                ? item.str + (item.hasEOL ? "\n" : " ")
                : "",
            )
            .join("")
            .trim();
          // Sparse text layers often contain only a scanned page's header/footer.
          let needsOcr = text.replace(/\s/g, "").length < 30;
          if (!needsOcr && text.length < 200) {
            const ops = await page.getOperatorList();
            needsOcr = ops.fnArray.some((op) =>
              [
                lib.OPS.paintImageXObject,
                lib.OPS.paintInlineImageXObject,
                lib.OPS.paintImageXObjectRepeat,
              ].includes(op),
            );
          }
          if (needsOcr) {
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(
              2.2,
              Math.sqrt(6000000 / (base.width * base.height)),
            );
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            try {
              activeRender = page.render({
                canvasContext: canvas.getContext("2d"),
                viewport,
                background: "white",
              });
              await activeRender.promise;
              activeRender = null;
              const recognized = await readImage(canvas, label);
              text = recognized || text;
              usedOcr = true;
            } finally {
              canvas.width = 0;
              canvas.height = 0;
            }
          }
          sections.push(
            "[Page " +
              pageNumber +
              "]\n" +
              (text || "(No readable text on this page.)"),
          );
          total += text.length;
          if (total > 300000)
            throw Error(
              "Extracted text exceeds the 300,000-character workspace limit. Split the PDF first.",
            );
        } finally {
          page.cleanup();
        }
      }
      if (sections.every((s) => s.includes("(No readable text on this page.)")))
        throw Error("No readable text found. Try a clearer scan.");
      return {
        text: sections.join("\n\n"),
        extraction: usedOcr ? "OCR · English" : "PDF text",
      };
    }
    const bitmap = await createImageBitmap(file);
    check();
    const scale = Math.min(
      1,
      Math.sqrt(6000000 / (bitmap.width * bitmap.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    try {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const text = await readImage(canvas, file.name);
      if (!text.trim())
        throw Error("No readable text found. Try a clearer image.");
      return { text, extraction: "OCR · English" };
    } finally {
      bitmap.close();
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch (error) {
    if (signal.aborted) throw Error("Upload canceled.");
    if (error.name === "PasswordException")
      throw Error("This PDF is password-protected. Upload an unlocked copy.");
    if (error.name === "InvalidPDFException")
      throw Error("This PDF could not be read. Try another file.");
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (worker) await worker.terminate().catch(() => {});
    if (loadingTask) await loadingTask.destroy().catch(() => {});
  }
}
