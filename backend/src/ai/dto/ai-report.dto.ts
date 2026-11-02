import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GenerateReportDto {
  @IsString() @IsNotEmpty() @MaxLength(100) sessionId!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(99) run!: number;

  /** Absent : génère le bilan de tous les participants de la séance. */
  @IsOptional() @IsString() @MaxLength(100) participantId?: string;
}

export class ReportsQueryDto {
  @IsString() @IsNotEmpty() @MaxLength(100) sessionId!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(99) run!: number;
}

export class UsageQueryDto {
  @IsOptional() @IsString() @MaxLength(100) sessionId?: string;
}

export class EvidenceDto {
  @IsString() type!: string;

  @IsOptional() @IsString() id?: string;

  @IsOptional() @IsNumber() value?: number;
}

export class PointDto {
  @IsString() @MaxLength(300) text!: string;

  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => EvidenceDto) evidence!: EvidenceDto[];
}

export class CriterionEditDto {
  @IsString() @MaxLength(60) id!: string;

  @IsOptional() @IsString() @MaxLength(500) comment?: string;

  /** null retire la correction. */
  @IsOptional() @IsInt() @Min(0) @Max(10) teacherScore?: number | null;
}

export class EditReportDto {
  @IsOptional() @IsString() @MaxLength(800) summary?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CriterionEditDto)
  criteria?: CriterionEditDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => PointDto)
  strengths?: PointDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => PointDto)
  improvements?: PointDto[];
}

export class ValidateReportDto {
  /** Rend le bilan visible par l'étudiant concerné. Faux par défaut. */
  @IsOptional() @IsBoolean() publish?: boolean;
}

export class ReportIdParams {
  @IsUUID() id!: string;
}
