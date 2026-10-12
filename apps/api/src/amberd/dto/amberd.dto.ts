import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PRIORITY_TIERS } from '@app-starter/shared';

/**
 * The definition body is validated in depth by `validateAgentDefinition` in the
 * service; the DTO only guarantees it is an object.
 */
export class AgentDefinitionDto {
  @ApiProperty({ description: 'Amberd Lite agent definition (schemaVersion 1.0)' })
  @IsObject()
  definition!: Record<string, unknown>;
}

export class ExecuteAgentDto {
  @ApiPropertyOptional({ description: 'Values for the agent variables' })
  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Extra email recipients for this run (added to the agent defaults)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  emailRecipients?: string[];
}

export class SetAgentStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'DRAFT'] })
  @IsIn(['ACTIVE', 'INACTIVE', 'DRAFT'])
  status!: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
}

export class ApprovalDecisionDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrentRuns?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxConnectionsPerSource?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  spendCapUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  spendWindowDays?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(900)
  timeoutSeconds?: number;

  @IsOptional()
  @IsIn(PRIORITY_TIERS as unknown as string[])
  defaultPriorityTier?: string;
}
