// src/lib/file-service.ts
import mammoth from "mammoth";
import { supabase } from "@/lib/supabaseClient";

export interface UploadedFile {
  name: string;
  id: string;
}

const CONTACT_RE = /@|twitter|linkedin|github|\d{7,}|\.com/i;
const SECTION_RE = /(technical skills|experience|projects|education)/i;

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
  getDocument(params: { data: ArrayBuffer }): {
    promise: Promise<PdfDocumentProxy>;
  };
}

let pdfjsLoader: Promise<PdfJsLib> | null = null;
export const loadPdfJsFromCdn = (): Promise<PdfJsLib> => {
  if (typeof window === "undefined")
    return Promise.reject(new Error("No window"));
  if (pdfjsLoader) return pdfjsLoader;
  pdfjsLoader = new Promise<PdfJsLib>((resolve, reject) => {
    const w = window as unknown as { pdfjsLib?: PdfJsLib };
    if (w.pdfjsLib) return resolve(w.pdfjsLib);
    const script = document.createElement("script");
    script.src = "/pdf.min.js";
    script.async = true;
    script.onload = () =>
      resolve((window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib);
    script.onerror = () => {
      const cdn = document.createElement("script");
      cdn.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
      cdn.async = true;
      cdn.onload = () =>
        resolve((window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib);
      cdn.onerror = () => reject(new Error("Failed to load pdf.js"));
      document.head.appendChild(cdn);
    };
    document.head.appendChild(script);
  });
  return pdfjsLoader;
};

// Helper: Get CSS styles from font properties
const getStyleFromFont = (item: PdfTextItem): string => {
  let styles = "";
  const fontSize = Math.max(12, item.transform[3]);
  const isBold =
    item.fontName.toLowerCase().includes("bold") ||
    item.fontName.toLowerCase().includes("black") ||
    item.fontName.toLowerCase().includes("semibold");
  const isItalic =
    item.fontName.toLowerCase().includes("italic") ||
    item.fontName.toLowerCase().includes("oblique");

  styles += `font-size: ${fontSize}px; `;
  styles += `font-weight: ${isBold ? "700" : "400"}; `;
  if (isItalic) {
    styles += "font-style: italic; ";
  }
  if (item.fontName && !item.fontName.includes("+")) {
    styles += `font-family: "${item.fontName}", Arial, sans-serif; `;
  }
  return styles;
};

export const convertFileUrlToHtml = async (
  fileUrl: string,
  fileType: string
): Promise<string> => {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`HTTP error ${response.status}`);

  if (fileType.includes("image/")) {
    return `<div class="image-container"><img src="${fileUrl}" alt="Extracted Image" class="max-w-full h-auto mx-auto block" /></div>`;
  }

  if (fileType.includes("pdf")) {
    const pdfjsLib: PdfJsLib = await loadPdfJsFromCdn();
    try {
      const headLocal = await fetch("/pdf.worker.min.js", { method: "HEAD" });
      if (headLocal.ok) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      } else {
        const headCdn = await fetch(
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js",
          { method: "HEAD" }
        );
        if (headCdn.ok) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        } else {
          pdfjsLib.disableWorker = true;
        }
      }
    } catch {
      pdfjsLib.disableWorker = true;
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const htmlParts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      const items = content.items as PdfTextItem[];

      // Group items by lines (Y position)
      const lines: { y: number; items: PdfTextItem[] }[] = [];
      const tolerance = 2;
      items.forEach((it: PdfTextItem) => {
        const [, , , , , y] = it.transform as number[];
        let line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push(it);
      });
      lines.sort((a, b) => b.y - a.y);

      // Table detection helpers (copied from second code)
      const isTableRow = (line: { items: PdfTextItem[] }) => {
        if (line.items.length < 2) return false;
        let prevX = line.items[0].transform[4];
        let colGaps = 0;
        for (let i = 1; i < line.items.length; i++) {
          const x = line.items[i].transform[4];
          if (x - prevX > 40) colGaps++;
          prevX = x;
        }
        return colGaps >= 1;
      };

      const renderTable = (rows: PdfTextItem[][]) => {
        let html = `<table class="pdf-table" style="margin:16px 0;width:100%;border-collapse:collapse;border:1px solid #ddd;">`;
        for (const row of rows) {
          html += "<tr>";
          for (const cell of row) {
            const isBold = cell.fontName.toLowerCase().includes("bold");
            html += `<td style="border:1px solid #ddd;padding:8px 12px;font-size:14px;${isBold ? "font-weight:700;background-color:#f9f9f9;" : ""}">${cell.str}</td>`;
          }
          html += "</tr>";
        }
        html += "</table>";
        return html;
      };

      let pageHtml = "";
      let tableRows: PdfTextItem[][] = [];

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = line.items.map((item) => item.str).join(" ").trim();
        if (!lineText) continue;

        if (isTableRow(line)) {
          tableRows.push(line.items);
          const nextLine = lines[lineIdx + 1];
          if (!nextLine || !isTableRow(nextLine)) {
            if (tableRows.length > 0) {
              pageHtml += renderTable(tableRows);
            }
            tableRows = [];
          }
          continue;
        }

        if (tableRows.length > 0) {
          pageHtml += renderTable(tableRows);
          tableRows = [];
        }

        let customStyle = "";
        const isHeader =
          line.items.length === 1 &&
          (line.items[0].fontName.toLowerCase().includes("bold") ||
            line.items[0].fontName.toLowerCase().includes("black"));
        if (isHeader) {
          customStyle =
            "font-size:20px;font-weight:700;margin:16px 0 8px;text-align:left;";
        }
        let lineHtml = "";
        line.items.forEach((item, index) => {
          const str = item.str;
          if (!str.trim()) return;
          const isBold = item.fontName.toLowerCase().includes("bold");
          const style = `font-size:${Math.max(
            12,
            item.transform[3]
          )}px;${isBold ? "font-weight:700;" : ""}`;
          const previousItem = line.items[index - 1];
          let spacing = "";
          if (previousItem) {
            const prevX = previousItem.transform[4] + previousItem.width;
            const currentX = item.transform[4];
            const spaceWidth = currentX - prevX;
            if (spaceWidth > 2) {
              spacing = `<span style="display:inline-block;width:${Math.min(
                spaceWidth,
                20
              )}px;"></span>`;
            }
          }
          lineHtml += `${spacing}<span style="${style}">${str}</span>`;
        });

        pageHtml += `<div style="${customStyle}">${lineHtml}</div>`;
      }

      if (tableRows.length > 0) {
        pageHtml += renderTable(tableRows);
      }

      htmlParts.push(pageHtml);
    }
    return `<div class="pdf-content">${htmlParts.join('<hr class="page-break" />')}</div>`;
  }

  if (fileType.includes("word") || fileType.includes("docx")) {
    const arrayBuffer = await response.arrayBuffer();

    interface MammothOptions {
      arrayBuffer: ArrayBuffer;
      convertImage?: ReturnType<typeof mammoth.images.imgElement>;
      styleMap?: string[];
    }

    const styleMap = [
      "p[style-name='Header'] => h1.docx-heading.docx-heading-1",
      "p[style-name='Heading 1'] => h1.docx-heading.docx-heading-1",
      "p[style-name='Heading 2'] => h2.docx-heading.docx-heading-2",
      "p[style-name='Heading 3'] => h3.docx-heading.docx-heading-3",
      "p[style-name='Heading 4'] => h4.docx-heading.docx-heading-4",
      "p[style-name='Heading 5'] => h5.docx-heading.docx-heading-5",
      "p[style-name='Heading 6'] => h6.docx-heading.docx-heading-6",
    ];

    const options: MammothOptions = {
      arrayBuffer,
      styleMap,
      convertImage: mammoth.images.imgElement((image) => {
        return image.read("base64").then((imageBuffer: string) => {
          const dataUri =
            "data:" + image.contentType + ";base64," + imageBuffer;
          return {
            src: dataUri,
            style:
              "max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
          };
        });
      }),
    };

    try {
      const result = await mammoth.convertToHtml(options);
      let enhancedHtml = result.value;

      enhancedHtml = enhancedHtml
        .replace(/<img([^>]*)>/g, '<img$1 class="docx-image">')
        .replace(/<table([^>]*)>/g, '<table$1 class="docx-table">')
        .replace(/<tr([^>]*)>/g, '<tr$1 class="docx-table-row">')
        .replace(/<td([^>]*)>/g, '<td$1 class="docx-table-cell">')
        .replace(/<th([^>]*)>/g, '<th$1 class="docx-table-header">')
        .replace(/<p([^>]*)>/g, '<p$1 class="docx-paragraph">')
        .replace(/<ul([^>]*)>/g, '<ul$1 class="docx-list docx-list-unordered">')
        .replace(/<ol([^>]*)>/g, '<ol$1 class="docx-list docx-list-ordered">')
        .replace(/<li([^>]*)>/g, '<li$1 class="docx-list-item">')
        .replace(/<strong([^>]*)>/g, '<strong$1 class="docx-strong">')
        .replace(/<em([^>]*)>/g, '<em$1 class="docx-emphasis">')
        .replace(/<a([^>]*)>/g, '<a$1 class="docx-link">');
      
      const listStyles = `
        <style>
          .docx-table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
            border: 1px solid #ddd;
          }
          .docx-table-row:nth-child(even) {
            background-color: #f9f9f9;
          }
          .docx-table-header {
            background-color: #f0f0f0;
            font-weight: bold;
            text-align: left;
            padding: 8px 12px;
            border: 1px solid #ddd;
          }
          .docx-table-cell {
            padding: 8px 12px;
            border: 1px solid #ddd;
          }
          .docx-list-unordered, .docx-list-ordered {
            padding-left: 20px !important; 
            margin-left: 0 !important;
          }
          .docx-list-unordered {
            list-style-type: disc !important;
          }
          .docx-list-ordered {
            list-style-type: decimal !important;
          }
          .docx-list-item ul, .docx-list-item ol {
            margin-top: 0;
            margin-bottom: 0;
          }
          .docx-heading-1 { font-size: 20px; font-weight: bold; margin: 16px 0; }
          .docx-heading-2 { font-size: 18px; font-weight: bold; margin: 14px 0; }
          .docx-heading-3 { font-size: 16px; font-weight: bold; margin: 12px 0; }
          .docx-heading-4 { font-size: 14px; font-weight: bold; margin: 10px 0; }
          .docx-heading-5 { font-size: 13px; font-weight: bold; margin: 8px 0; }
          .docx-heading-6 { font-size: 12px; font-weight: bold; margin: 6px 0; }
          .page-break {
            margin: 32px 0;
            border-top: 2px dashed #ddd;
          }
        </style>
      `;

      return `<div class="docx-content enhanced-docx">${listStyles}${enhancedHtml}</div>`;
    } catch (error) {
      console.error("Mammoth conversion error:", error);
      throw new Error("Failed to convert DOCX to HTML. Check the console for details.");
    }
  }

  throw new Error("Unsupported file type");
};


/**
 * Lists files uploaded by a user from a specific bucket and folder.
 * @param userId The ID of the user.
 * @returns A promise resolving to an array of uploaded files.
 */
export const listUserFiles = async (
  userId: string
): Promise<UploadedFile[]> => {
  const folderPath = `documents/${userId}/`;
  const { data, error } = await supabase.storage.from("files").list(folderPath);
  if (error) throw error;
  type MaybeWithId = { name: string; id?: string };
  return (data || []).map((f) => {
    const obj = f as unknown as MaybeWithId;
    return { name: obj.name, id: obj.id ?? obj.name } as UploadedFile;
  });
};

/**
 * Uploads a list of files for a specific user to a designated folder.
 * @param userId The ID of the user.
 * @param files The FileList object containing files to upload.
 * @returns A promise resolving to an array of upload results.
 */
export const uploadFilesForUser = async (userId: string, files: FileList) => {
  const uploadPromises = Array.from(files).map(async (file: File) => {
    const fileName = file.name;
    const filePath = `documents/${userId}/${fileName}`;
    const { data, error } = await supabase.storage
      .from("files")
      .upload(filePath, file, { upsert: true });
    if (error)
      return { success: false, original: file.name, error: error.message };
    return { success: true, original: file.name, stored: fileName, data };
  });
  return Promise.all(uploadPromises);
};

/**
 * Deletes a specific file for a user.
 * @param userId The ID of the user.
 * @param fileName The name of the file to delete.
 */
export const deleteUserFile = async (userId: string, fileName: string) => {
  const filePath = `documents/${userId}/${fileName}`;
  const { error } = await supabase.storage.from("files").remove([filePath]);
  if (error) throw error;
};

/**
 * Gets the public URL for a specific file for a user.
 * @param userId The ID of the user.
 * @param fileName The name of the file.
 * @returns The public URL of the file or null if not found.
 */
export const getPublicUrlForUserFile = (
  userId: string,
  fileName: string
): string | null => {
  const filePath = `documents/${userId}/${fileName}`;
  const { data } = supabase.storage.from("files").getPublicUrl(filePath);
  return data?.publicUrl ?? null;
};