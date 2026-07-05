import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

export class SavePlaceDto {
  @ApiProperty({ example: '665abc123def456789012345' })
  @IsMongoId()
  placeId: string;

  @ApiPropertyOptional({
    example: '665abc123def456789012346',
    description: 'room 컨텍스트 저장 시 여행방 ID',
  })
  @IsOptional()
  @IsMongoId()
  roomId?: string;
}
