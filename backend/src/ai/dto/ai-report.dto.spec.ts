import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { EditReportDto, GenerateReportDto, ReportsQueryDto } from './ai-report.dto.js';

const errorsOf = async (cls: new () => object, data: object) => (await validate(plainToInstance(cls, data))).map((e) => e.property);

describe('DTO des bilans', () => {
  it('accepte une demande de génération valide, run reçu en chaîne dans l’URL', async () => {
    expect(await errorsOf(GenerateReportDto, { sessionId: 's1', run: 1 })).toEqual([]);
    expect(await errorsOf(ReportsQueryDto, { sessionId: 's1', run: '2' })).toEqual([]);
  });

  it('refuse un passage invalide ou une séance vide', async () => {
    expect(await errorsOf(GenerateReportDto, { sessionId: '', run: 1 })).toContain('sessionId');
    expect(await errorsOf(GenerateReportDto, { sessionId: 's', run: 0 })).toContain('run');
    expect(await errorsOf(GenerateReportDto, { sessionId: 's', run: 1.5 })).toContain('run');
  });

  it('valide les corrections imbriquées', async () => {
    expect(await errorsOf(EditReportDto, { criteria: [{ id: 'a', teacherScore: 3 }], strengths: [{ text: 'x', evidence: [{ type: 'minute', value: 3 }] }] })).toEqual([]);
    expect(await errorsOf(EditReportDto, { summary: 'a'.repeat(900) })).toContain('summary');
    expect(await errorsOf(EditReportDto, { criteria: [{ id: 'a', teacherScore: 50 }] })).toContain('criteria');
    expect(await errorsOf(EditReportDto, { strengths: Array.from({ length: 6 }, () => ({ text: 'x', evidence: [] })) })).toContain('strengths');
  });
});
