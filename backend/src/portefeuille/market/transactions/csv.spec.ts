import { describe, it, expect } from 'vitest';
import { generateCsv } from './csv.js';

describe('CSV Utility', () => {
  it('génère un CSV simple avec BOM', () => {
    const headers = ['A', 'B'];
    const rows = [[1, 2], [3, 4]];
    const csv = generateCsv(headers, rows);
    
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('A,B');
    expect(csv).toContain('1,2');
    expect(csv).toContain('3,4');
  });

  it('échappe les virgules et les guillemets', () => {
    const headers = ['Nom', 'Note'];
    const rows = [['Doe, John', 'Il a dit "Bonjour"']];
    const csv = generateCsv(headers, rows);
    
    expect(csv).toContain('"Doe, John"');
    expect(csv).toContain('"Il a dit ""Bonjour"""');
  });
});
