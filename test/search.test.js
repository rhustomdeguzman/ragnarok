import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunkDocuments,
  lexicalSearch,
  searchDocuments,
} from "../src/search.js";

const documents = [
  {
    id: "handbook",
    name: "Handbook.txt",
    text: "The annual learning allowance is 800 dollars. Remote work is allowed three days per week.",
  },
  {
    id: "scan",
    name: "Scan.pdf",
    text: "[Page 1]\nVerification code: ORCHID 42.",
  },
];

test("search returns a relevant passage and its source", async () => {
  const result = await searchDocuments(documents, "learning allowance");
  assert.equal(result.sources[0].name, "Handbook.txt");
  assert.match(result.sources[0].text, /800/);
});

test("extracted OCR text is searchable", async () => {
  const result = await searchDocuments(documents, "ORCHID");
  assert.equal(result.sources[0].name, "Scan.pdf");
  assert.match(result.sources[0].text, /Page 1/);
});

test("unmatched terms return no passages", async () => {
  const chunks = await chunkDocuments(documents);
  assert.deepEqual(lexicalSearch(chunks, "astronaut"), []);
});

test("long documents split with overlap and source metadata", async () => {
  const chunks = await chunkDocuments([
    {
      id: "long",
      name: "Long.txt",
      text: "A sentence about document retrieval. ".repeat(150),
    },
  ]);
  assert.ok(chunks.length > 4);
  assert.ok(
    chunks.every((c) => c.text.length <= 1000 && c.name === "Long.txt"),
  );
  assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length);
  assert.ok(chunks[0].text.includes(chunks[1].text.slice(0, 80)));
});
