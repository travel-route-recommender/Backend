import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LatLngDto {
  @ApiProperty({ example: 37.5665 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 126.978 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class DirectionsRequestDto {
  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  origin: LatLngDto;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  destination: LatLngDto;

  @ApiPropertyOptional({
    type: [LatLngDto],
    description: '경유지 (최대 5개)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => LatLngDto)
  waypoints?: LatLngDto[];

  @ApiPropertyOptional({
    example: 'RECOMMEND',
    enum: ['RECOMMEND', 'TIME', 'DISTANCE'],
    description: '경로 우선순위. 기본 RECOMMEND',
  })
  @IsOptional()
  @IsString()
  @IsIn(['RECOMMEND', 'TIME', 'DISTANCE'])
  priority?: 'RECOMMEND' | 'TIME' | 'DISTANCE';

  @ApiPropertyOptional({
    example: true,
    description: 'true(기본)=요약만. false면 path(도로 좌표) 포함',
  })
  @IsOptional()
  @IsBoolean()
  summaryOnly?: boolean;
}

export class DirectionsFareDto {
  @ApiPropertyOptional({ example: 12000 })
  taxi?: number;

  @ApiPropertyOptional({ example: 0 })
  toll?: number;
}

export class DirectionsPathPointDto {
  @ApiProperty()
  lat: number;

  @ApiProperty()
  lng: number;
}

export class DirectionsResponseDto {
  @ApiProperty({ example: 4520, description: '이동 거리(미터)' })
  distanceMeters: number;

  @ApiProperty({ example: 780, description: '예상 이동 시간(초)' })
  durationSeconds: number;

  @ApiProperty({ type: DirectionsFareDto })
  fare: DirectionsFareDto;

  @ApiPropertyOptional({
    type: [DirectionsPathPointDto],
    description: '경로 좌표(summaryOnly=false일 때만)',
  })
  path?: DirectionsPathPointDto[];

  @ApiProperty({
    example: 'kakao-mobility',
    description: '데이터 소스',
  })
  source: string;
}
