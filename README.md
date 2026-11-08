# Document Search

Search text inside PDFs, scanned documents, images, and text files. Everything runs in the browser; no server or API key is needed.

## Use

Upload a file, wait for extraction, and enter keywords or a question. Expand a result to read the matching passage. Use **Review** beside a document to inspect and correct extracted text.

Supported formats: PDF, PNG, JPG, WebP, TXT, Markdown, CSV, and JSON. PDFs use their text layer where available. Scanned pages and images use English OCR.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:3001. Run `npm test` to check search behavior. Rebuild after changing source files.

## GitHub Pages

In the repository, open **Settings → Pages** and select **GitHub Actions** as the source. The included workflow tests, builds, and deploys the app when `main` changes. You can also run **Publish site** manually from the Actions tab.

The build outputs static files in `dist/`. Asset paths are relative, so the app works under a repository path such as `/ragnarok/`. Do not upload `node_modules` or commit API keys.

## How search works

LangChain's `RecursiveCharacterTextSplitter` splits document text into 1,000-character passages with 180-character overlap. A BM25 keyword ranker returns up to four relevant passages. Results are excerpts, not generated answers. Specific search terms work best; follow-up questions should repeat the topic.

PDF.js extracts text or renders scanned pages. Tesseract.js reads printed English from those page images. Both load on demand from pinned CDN versions. OCR runs locally; file bytes are not sent to a server for extraction or search.

## Limits

- 20 documents and 300,000 characters per workspace.
- 10 MB per PDF/image, 30 pages per PDF, 600 KB per text file.
- Documents are saved in this browser's local storage. Search history resets when the page reloads.
- Initial PDF/OCR library and language downloads require internet access.
- Blurry scans, handwriting, tables, and complex layouts may extract poorly. Review the text before relying on results.
- PDFs with a substantial text layer and separate scanned regions may need those regions uploaded as images.
- This Pages version provides OCR and keyword retrieval. It has no language-model backend or semantic embeddings.

## Source

- `src/app.js` — interface and workspace state
- `src/search.js` — LangChain splitting and BM25 ranking
- `src/ocr.js` — PDF and image extraction
- `src/styles.css` — responsive layout
- `scripts/` — static build and local preview
- `test/` — retrieval checks

Libraries: [LangChain](https://docs.langchain.com/oss/javascript/langchain/overview), [PDF.js](https://mozilla.github.io/pdf.js/), [Tesseract.js](https://github.com/naptha/tesseract.js).
