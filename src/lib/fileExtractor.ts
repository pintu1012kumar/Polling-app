// lib/fileExtractor.ts
import mammoth from "mammoth";

// Minimal pdf.js types
interface PdfTextItem {
  str: string;
  transform: number[];
  fontName: string;
  width: number;
  height: number;
}
interface PdfTextContent {
  items: PdfTextItem[];
}
interface PdfPageProxy {
  getTextContent(options?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }): Promise<PdfTextContent>;
}
interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
}
interface PdfJsLib {
  version?: string;
  GlobalWorkerOptions: { workerSrc: string };
  disableWorker?: boolean;
  getDocument(params: { data: ArrayBuffer }): { promise: Promise<PdfDocumentProxy> };
}

let pdfjsLoader: Promise<PdfJsLib> | null = null;
export const loadPdfJsFromCdn = (): Promise<PdfJsLib> => {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (pdfjsLoader) return pdfjsLoader;
  pdfjsLoader = new Promise<PdfJsLib>((resolve, reject) => {
    const w = window as unknown as { pdfjsLib?: PdfJsLib };
    if (w.pdfjsLib) return resolve(w.pdfjsLib);
    const script = document.createElement("script");
    script.src = "/pdf.min.js";
    script.async = true;
    script.onload = () => resolve((window as any).pdfjsLib);
    script.onerror = () => {
      const cdn = document.createElement("script");
      cdn.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
      cdn.async = true;
      cdn.onload = () => resolve((window as any).pdfjsLib);
      cdn.onerror = () => reject(new Error("Failed to load pdf.js"));
      document.head.appendChild(cdn);
    };
    document.head.appendChild(script);
  });
  return pdfjsLoader;
};

// Convert file to HTML
export const convertFileUrlToHtml = async (
  fileUrl: string,
  fileType: string
): Promise<string> => {
  if (fileType.includes("image/")) {
    return `<div class="image-container"><img src="${fileUrl}" alt="Extracted Image" class="max-w-full h-auto mx-auto block" /></div>`;
  }

  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`HTTP error ${response.status}`);

  if (fileType.includes("pdf")) {
    const pdfjsLib: PdfJsLib = await loadPdfJsFromCdn();
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      text += content.items.map((it: any) => it.str).join(" ") + "\n\n";
    }
    return `<div class="pdf-content whitespace-pre-wrap">${text}</div>`;
  }

  if (fileType.includes("word") || fileType.includes("docx")) {
    const arrayBuffer = await response.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return `<div class="docx-content">${result.value}</div>`;
  }

  return "<div>Unsupported file type</div>";
};