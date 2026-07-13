import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SubmitOnboardingSurveyDto {
  @ApiProperty({
    description: '온보딩 설문 문항 ID → 선택값 매핑',
    example: {
      ageRange: '20s',
      travelFrequency: 'few_times_year',
      preferredCompanion: 'friends',
    },
  })
  @IsObject()
  answers: Record<string, string>;
}
