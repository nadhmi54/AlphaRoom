/**
 * Génère un CSV à la main, échappe les virgules et guillemets, et ajoute le BOM UTF-8.
 */
export function generateCsv(headers: string[], rows: any[][]): string {
  const BOM = '\uFEFF';
  
  const escape = (val: any) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = headers.map(escape).join(',');
  const dataRows = rows.map((row) => row.map(escape).join(',')).join('\n');

  return BOM + headerRow + '\n' + dataRows;
}
