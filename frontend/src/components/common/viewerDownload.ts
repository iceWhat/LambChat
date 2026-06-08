export function downloadUrl(url: string, fileName?: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName ?? "";
  anchor.click();
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  URL.revokeObjectURL(url);
}
