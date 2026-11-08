import { searchDocuments } from "./search.js";
import { extractUpload } from "./ocr.js";
const samples = [
  {
    id: "example",
    name: "Example handbook.txt",
    text: "Example handbook. Employees receive 20 days of annual leave. The annual learning allowance is 800 dollars. Courses costing more than 200 dollars need manager approval. Remote work is allowed up to three days per week.",
  },
];
const $ = (id) => document.getElementById(id);
let docs = [],
  messages = [],
  busy = false,
  uploading = false,
  uploadController = null,
  editingId = null,
  timer;
try {
  const stored = localStorage.getItem("document-search-files-v1");
  docs = stored ? JSON.parse(stored) : [];
  if (
    !Array.isArray(docs) ||
    docs.some(
      (d) =>
        !d ||
        typeof d.text !== "string" ||
        typeof d.name !== "string" ||
        typeof d.id !== "string",
    )
  )
    docs = [];
} catch {
  docs = [];
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.remove("hidden");
  clearTimeout(timer);
  timer = setTimeout(() => $("toast").classList.add("hidden"), 4500);
}
function save() {
  try {
    localStorage.setItem("document-search-files-v1", JSON.stringify(docs));
  } catch {
    toast("Storage is full. Documents will last until this page closes.");
  }
}
function renderDocs() {
  $("count").textContent = docs.length;
  $("library").replaceChildren();
  docs.forEach((d) => {
    const row = el("div", "doc"),
      info = el("div", "doc-info"),
      name = el("div", "doc-name", d.name);
    name.title = d.name;
    info.append(
      name,
      el(
        "small",
        "",
        (d.extraction ? d.extraction + " · " : "") +
          d.text.length.toLocaleString() +
          " characters",
      ),
    );
    const review = el("button", "text-button", "Review");
    review.setAttribute("aria-label", "Review " + d.name);
    review.disabled = busy || uploading;
    review.onclick = () => {
      editingId = d.id;
      $("edit-title").textContent = "Review document";
      $("paste-name").value = d.name;
      $("paste-text").value = d.text;
      $("review-note").classList.remove("hidden");
      $("paste-form").querySelector("[type=submit]").textContent =
        "Save changes";
      $("paste-dialog").showModal();
    };
    info.append(review);
    const remove = el("button", "remove", "×");
    remove.setAttribute("aria-label", "Remove " + d.name);
    remove.disabled = busy || uploading;
    remove.onclick = () => {
      if (busy || uploading) return;
      docs = docs.filter((x) => x.id !== d.id);
      save();
      renderDocs();
    };
    row.append(info, remove);
    $("library").append(row);
  });
  if (!docs.length)
    $("library").append(el("div", "empty", "No documents added yet."));
}
function renderMessages() {
  const area = $("conversation");
  area.replaceChildren();
  if (!messages.length) {
    const welcome = el("div", "welcome");
    welcome.append(
      el("h1", "", "Search your documents"),
      el("p", "", "Upload a file, then search for words or ask a question."),
    );
    area.append(welcome);
    return;
  }
  messages.forEach((m) => {
    const box = el("div", "message " + m.role);
    box.append(
      el("div", "who", m.role === "user" ? "You" : "Sources"),
      el("div", "answer", m.text),
    );
    (m.sources || []).forEach((s, i) => {
      const detail = el("details", "source");
      detail.append(
        el(
          "summary",
          "",
          "[" + (i + 1) + "] " + s.name + " · passage " + s.chunk,
        ),
        el("p", "", s.text),
      );
      box.append(detail);
    });
    area.append(box);
  });
  area.scrollTop = area.scrollHeight;
}
async function ask(question) {
  if (busy || uploading) return;
  if (!docs.length) {
    toast("Upload a document first.");
    return;
  }
  busy = true;
  $("send").disabled = true;
  renderDocs();
  $("error").classList.add("hidden");
  messages.push({ role: "user", text: question });
  renderMessages();
  $("question").value = "";
  $("conversation").append(el("div", "pending", "Finding relevant passages…"));
  $("conversation").scrollTop = $("conversation").scrollHeight;
  try {
    const data = await searchDocuments(docs, question);
    messages.push({
      role: "assistant",
      text: data.sources.length
        ? "Matching passages from your documents:"
        : "No matching passages found. Try another question.",
      sources: data.sources,
    });
  } catch (error) {
    $("error").textContent = error.message;
    $("error").classList.remove("hidden");
    $("question").value = question;
  } finally {
    busy = false;
    $("send").disabled = false;
    renderDocs();
    renderMessages();
  }
}
$("ask-form").onsubmit = (e) => {
  e.preventDefault();
  const q = $("question").value.trim();
  if (q) ask(q);
};
$("question").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("ask-form").requestSubmit();
  }
};
function add(items) {
  if (busy) throw Error("Wait for the current search to finish.");
  if (docs.length + items.length > 20)
    throw Error("Maximum 20 documents per workspace.");
  if (docs.concat(items).reduce((n, d) => n + d.text.length, 0) > 300000)
    throw Error("Maximum workspace size is 300,000 characters.");
  docs.push(...items);
  save();
  renderDocs();
}
function uploadState(active) {
  uploading = active;
  ["upload", "paste", "samples", "send", "clear"].forEach(
    (id) => ($(id).disabled = active),
  );
  $("upload-progress").classList.toggle("hidden", !active);
  renderDocs();
}
$("cancel-upload").onclick = () => {
  uploadController?.abort();
  $("progress-label").textContent = "Canceling…";
  $("cancel-upload").disabled = true;
};
$("upload").onclick = () => {
  if (!busy && !uploading) $("file").click();
};
$("file").onchange = async () => {
  if (uploading || busy) return;
  const files = [...$("file").files];
  if (!files.length) return;
  uploadController = new AbortController();
  uploadState(true);
  $("cancel-upload").disabled = false;
  $("error").classList.add("hidden");
  try {
    if (docs.length + files.length > 20)
      throw Error("Maximum 20 documents per workspace.");
    const items = [];
    for (const f of files) {
      const result = await extractUpload(
        f,
        (text) => ($("progress-label").textContent = text),
        uploadController.signal,
      );
      if (uploadController.signal.aborted) throw Error("Upload canceled.");
      items.push({
        id: crypto.randomUUID(),
        name: f.name.slice(0, 200),
        ...result,
      });
      if (docs.concat(items).reduce((n, d) => n + d.text.length, 0) > 300000)
        throw Error(
          "Extracted text exceeds the 300,000-character workspace limit.",
        );
    }
    add(items);
    toast("Documents ready. Use Review to check extracted text.");
  } catch (e) {
    $("error").textContent = e.message;
    $("error").classList.remove("hidden");
  } finally {
    uploadState(false);
    uploadController = null;
    $("file").value = "";
  }
};
$("paste").onclick = () => {
  if (busy || uploading) return;
  editingId = null;
  $("paste-form").reset();
  $("edit-title").textContent = "Add a document";
  $("review-note").classList.add("hidden");
  $("paste-form").querySelector("[type=submit]").textContent = "Add document";
  $("paste-dialog").showModal();
};
$("cancel").onclick = () => $("paste-dialog").close();
$("paste-form").onsubmit = (e) => {
  e.preventDefault();
  if (busy || uploading) return;
  try {
    const name = $("paste-name").value.trim(),
      text = $("paste-text").value.trim();
    if (!name || !text) throw Error("Enter a name and document text.");
    if (editingId) {
      const next = docs.map((d) =>
        d.id === editingId ? { ...d, name, text } : d,
      );
      if (next.reduce((n, d) => n + d.text.length, 0) > 300000)
        throw Error("Maximum workspace size is 300,000 characters.");
      docs = next;
      save();
      renderDocs();
    } else add([{ id: crypto.randomUUID(), name, text }]);
    $("paste-dialog").close();
    toast(editingId ? "Document updated." : "Document added.");
  } catch (e) {
    toast(e.message);
  }
};
$("samples").onclick = () => {
  try {
    add(
      structuredClone(samples.filter((s) => !docs.some((d) => d.id === s.id))),
    );
    toast("Sample documents ready.");
  } catch (e) {
    toast(e.message);
  }
};
$("clear").onclick = () => {
  if (busy || uploading) return;
  messages = [];
  renderMessages();
  $("error").classList.add("hidden");
  $("question").value = "";
};
renderDocs();
renderMessages();
