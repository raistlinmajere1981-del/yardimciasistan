import fs from "node:fs";
import path from "node:path";
import type { KnowledgeDocument, KnowledgeReaderOptions } from "../types";

export const DEFAULT_KNOWLEDGE_FILES = [
  "firma.md",
  "odalar.md",
  "restoran.md",
  "menu.md",
  "sik-sorulan-sorular.md"
] as const;

const DEFAULT_MAX_CHARS_PER_FILE = 2400;
const DEFAULT_MAX_TOTAL_CHARS = 9000;

export function loadKnowledgeDocuments(options: KnowledgeReaderOptions): KnowledgeDocument[] {
  const fileNames = options.fileNames ?? [...DEFAULT_KNOWLEDGE_FILES];
  const maxCharsPerFile = options.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const documents: KnowledgeDocument[] = [];
  let usedChars = 0;

  for (const fileName of fileNames) {
    if (usedChars >= maxTotalChars) {
      break;
    }

    const sourcePath = path.join(options.directory, fileName);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }

    const rawContent = fs.readFileSync(sourcePath, "utf8").trim();
    if (!rawContent) {
      continue;
    }

    const remainingChars = Math.max(0, maxTotalChars - usedChars);
    const limit = Math.min(maxCharsPerFile, remainingChars);
    const content = rawContent.slice(0, limit);
    usedChars += content.length;

    documents.push({
      id: path.basename(fileName, path.extname(fileName)),
      title: extractMarkdownTitle(rawContent) ?? path.basename(fileName),
      content,
      sourcePath,
      truncated: rawContent.length > content.length
    });
  }

  return documents;
}

function extractMarkdownTitle(content: string): string | null {
  const heading = content.split(/\r?\n/).find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : null;
}
