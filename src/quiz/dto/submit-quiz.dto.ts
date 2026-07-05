import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SubmitQuizDto {
  @ApiProperty({
    description: '문항 ID → 선택지 ID 매핑 (GET /quiz/questions 참고)',
    example: {
      q1: 'q1_a',
      q2: 'q2_b',
      q3: 'q3_a',
      q4: 'q4_b',
      q5: 'q5_a',
      q6: 'q6_b',
      q7: 'q7_a',
      q8: 'q8_b',
    },
  })
  @IsObject()
  answers: Record<string, string>;
}
