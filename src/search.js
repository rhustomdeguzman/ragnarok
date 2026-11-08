import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 180,
});
export async function chunkDocuments(documents) {
  const result = [];
  for (const doc of documents) {
    const parts = await splitter.splitText(doc.text);
    parts.forEach((text, i) =>
      result.push({ id: `${doc.id}:${i}`, name: doc.name, chunk: i + 1, text }),
    );
  }
  return result;
}
const tokens = (text) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
export function lexicalSearch(chunks, query, k = 4) {
  const terms = [...new Set(tokens(query))];
  const documents = chunks.map((c) => tokens(c.text));
  const average =
    documents.reduce((n, d) => n + d.length, 0) / (documents.length || 1);
  const ranked = chunks.map((c, i) => {
    let score = 0;
    for (const term of terms) {
      const tf = documents[i].filter((t) => t === term).length;
      const df = documents.filter((d) => d.includes(term)).length;
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
      score +=
        (idf * tf * 2.2) /
        (tf + 1.2 * (0.25 + (0.75 * documents[i].length) / (average || 1)));
    }
    return { ...c, score };
  });
  return ranked
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function searchDocuments(documents, question) {
  const chunks = await chunkDocuments(documents);
  return { sources: lexicalSearch(chunks, question, 4) };
}
