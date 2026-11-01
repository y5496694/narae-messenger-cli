# 나래 지역 메신저 CLI 0.1

17개 교육청의 지역 선택과 앱 연결을 분리합니다. **충북은 기존 CBE CLI의 전용 어댑터를 포함합니다.** 다른 지역은 실제 설치 앱을 바인딩하는 Windows UI Automation 공통 어댑터입니다. 전용 통신 프로토콜 17종을 구현·실검증했다는 뜻이 아닙니다. 현재 실제 업무 시험은 충북만 합니다.

```powershell
node cli.mjs --region 충북 status
node cli.mjs --region 충북 cbe notes list --box received --json
node cli.mjs --region 전북 status
node cli.mjs --region 전북 bind --pid 실제프로세스 --hwnd 실제창핸들
node cli.mjs --region 전북 inspect
node cli.mjs --region 전북 read --snapshot 실제조회ID --ref 실제항목
node cli.mjs --region 전북 analyze --path '실제 설치 폴더' --output 'D:\Codex\tmp\새근거.json'
```

`analyze`는 [REA](https://github.com/morluto/rea)의 `inspect-desktop-application`으로 설치물의 실제 런타임 근거를 저장합니다. REA는 별도 설치가 필요합니다. 실행 파일·접근성 트리와 실제 로그인 계정이 없는 지역의 읽기·전송 성공을 주장하지 않습니다.

UIA의 `fill`·`send`는 직전 `inspect`의 ID·ref, UTF-8 `--message-file`, 명시적 `--yes`가 필요합니다. 기존 입력이 비어 있어야 하며, `send`에는 실제 전송 버튼 `--button`과 전체 대화방 제목 `--expect-title`도 필요합니다. 프로세스·실행 파일 해시·창·표시 내용이 달라지면 변경하지 않습니다. 같은 조회 ID의 변경은 한 번만 시도합니다. 전송 후에는 `submitted_unconfirmed`이며 서버 수신 확인이 아닙니다. 타임아웃 뒤 자동 재전송하지 않습니다.

읽기는 `visible_accessibility_only`입니다. 렌더링된 접근성 텍스트만 읽으며 전체 과거 대화를 읽었다고 하지 않습니다. 접근성 미지원 앱은 REA로 해당 앱 전용 어댑터를 추가해야 합니다. 충북 이외 지역에 충북 계정이나 CDP 세션을 대신 연결하지 않습니다.

교육청·공식 공급사에서 확인한 지역별 제품 이름과 출처, 경기·제주 공식 설치물의 서명·해시는 `regions.json`에 기록합니다. [확인 범위](ANALYSIS.md)에서 설치물 관찰과 실제 동작 검증을 구분합니다. 확인하지 못한 제품의 이름·버전·실제 동작은 확정하지 않습니다.

개인 쪽지·연락처·캡처·인증정보는 공개 저장소에 넣지 않습니다. 기본 작업 자료는 `D:\Codex\narae-data\messengers`에 저장합니다. CBE 원본은 MIT 라이선스이며 `vendor/cbe`에 보존합니다.
