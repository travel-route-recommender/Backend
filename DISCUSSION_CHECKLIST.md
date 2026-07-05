# Backend 논의 체크리스트

FigJam 아키텍처 기준으로 **기능 확정이 필요한 항목**입니다. 담당자와 논의 후 이 문서에 결론을 기록하고 API/로직을 업데이트하세요.

---

## 1. 진입 / 계정

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 1.1 | 초대코드 참여 시 ID/PW 없이 임시 프로필만으로 room 입장? | 진입/계정 | _미정_ |
| 1.2 | guest → 정식 계정 전환(merge) API 필요? | 진입/계정 | _미정_ |
| 1.3 | guest onboarding은 room 단위 vs 전역? | 진입/계정 | _미정_ |
| 1.4 | MVP 소셜 로그인: Kakao만? Google/Apple Phase 2? | 진입/계정 | _Kakao API 구현됨, 나머지 Phase 2_ |
| 1.5 | 8문항 → TravelType 매핑 규칙 (현재: a/b count rule-based) | 퀴즈/두리 | _rule-based MVP 적용_ |

---

## 2. 메인 홈

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 2.1 | 인기 여행지: 수동 큐레이션 vs save/view 집계? | 홈 | _현재: places popularityScore seed_ |
| 2.2 | 홈 "두리 테스트" 재응시 가능? room별 별도? | 홈 | _미정_ |

---

## 3. 탐색 페이지

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 3.1 | Save vs 후보 담기 UI 동시 가능? | 탐색 | _API 분리됨 (user_saves / room candidates)_ |
| 3.2 | "저장만" 후 UX 분기 | 탐색 | _미정 (프론트)_ |
| 3.3 | 장소 데이터: Kakao 단독 vs 자체 DB 시드 | 탐색 | _Kakao + local cache + seed_ |

---

## 4. 내 여행 관리

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 4.1 | ongoing/completed 전환: 종료일 자동 vs 수동 | 여행관리 | _현재: PATCH status 수동_ |
| 4.2 | Manage My Trips vs 목록 API 분리 필요? | 여행관리 | _목록 API 하나로 충분 (GET /rooms/me)_ |

---

## 5. 여행방 생성

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 5.1 | Step 3 (날짜 외): 예산, 인원, room name? | 여행방 생성 | _title/dates PATCH 지원_ |
| 5.2 | 궁합테스트 멤버로 만들기 — userId 목록 출처 | 여행방 생성 | _POST /rooms/from-compatibility_ |
| 5.3 | invite link scheme & 만료 정책 | 여행방 생성 | _tripmatch://invite/:code, 만료 없음_ |

---

## 6. 여행방 홈

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 6.1 | progress 계산식 | 여행방 홈 | _5단계 heuristic MVP_ |
| 6.2 | N명 그룹 궁합 알고리즘 | 매칭 | _2인 tag intersection 확장 필요_ |
| 6.3 | owner/member 권한 | 여행방 홈 | _owner만 invite 재발급_ |

---

## 7. 두리 워크스페이스

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 7.1 | 실시간 협업 WebSocket 필요? | 워크스페이스 | _Phase 3_ |
| 7.2 | 후보 → 일정 이동 시 scheduled flag | 워크스페이스 | _scheduled 필드 추가됨_ |

---

## 8. 현재 일정표

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 8.1 | drag-drop 저장: debounce vs 매 요청 | 일정 | _PATCH reorder + PUT batch_ |
| 8.2 | time format: "HH:mm" vs ISO | 일정 | _HH:mm string MVP_ |
| 8.3 | priority must/optional/skip 일정 반영 | 일정 | _필드 저장, 로직 미적용_ |

---

## 9. 두리 제안 모듈 (Critical)

| # | 질문 | 담당 | 결론 |
|---|------|------|------|
| 9.1 | Rule-based vs LLM | 두리/AI | _MVP rule-based, LLM Phase 3_ |
| 9.2 | AdjustmentPlan/CourseRecommendation 통합 | 두리/매칭 | _room endpoints로 제공_ |
| 9.3 | J/P schedule style → draft 파라미터 | 두리 | _PATCH schedule-style_ |
| 9.4 | Kakao Directions 호출 & 캐싱 | 두리/백엔드 | _미구현_ |

---

## 확정 후 작업

1. 위 표 **결론** 컬럼 업데이트
2. 변경 필요 API는 Swagger + 프론트 `ApiClient` 동기화
3. Phase 2/3 티켓 생성
