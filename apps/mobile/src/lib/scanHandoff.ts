/** Passes a "scan the box" result from the camera screen back to the Add form. In memory only. */
export interface LabelScan {
  name?: string;
  strength?: string;
  barcode?: string;
  lines: string[];
  strengths: string[];
  boxPhoto?: string;
}

let pending: LabelScan | null = null;

export function putLabelScan(scan: LabelScan) {
  pending = scan;
}

export function takeLabelScan(): LabelScan | null {
  const s = pending;
  pending = null;
  return s;
}
