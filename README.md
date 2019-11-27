## API List
1.	이동체 통계	/objects/counts	GET	
  •	이동체 개수 조회(전체+타입)
  •	View 영역 내의 이동체 개수 조회(전체 + 타입별)
2.	이동체 상세 정보 조회	/objects?name=,id=	GET	•	이동체 상세 정보 조회(기본정보+현재정보)
3.	이동체 이동경로 조회	/objects/:id/history	GET	•	이동체 기간 내 GPS 정보 조회

*4.	이동체 리스트 조회	/objects	GET	•	이동체 기본정보 리스트 조회*

5.	영역 검색	/objects?lat{},lng={},start=,end=	GET	•	특정 영역(폴리곤/원형/사각형) 내 이동체 리스트
6.	로그인	/login	POST	•	관리자 로그인 토큰 발급
7.	비밀번호 변경	/password	PUT	•	비밀번호 변경
8.	시스템 정보 변경	/environment	PUT	•	시스템 정보 변경(이름, 제목, 색상, 로고)
9.	맵 위치 지정	/map/center	PUT	•	지도 시작 위치 지정
10.	맵 위치 조회	/map/center	GET	•	지도 시작 위치 조회
11.	노출 이동체 지정	/map/types	PUT	•	메인 화면 노출 이동체 타입 지정
12.	노출 이동체 조회	/map/types	GET	•	노출 이동체 정보 조회
13.	이동체 타입 정보 조회	/types	GET	•	이동체 타입 리스트 정보 조회
14.	이동체 타입 등록	/types	POST	•	이동체 타입 등록
15.	이동체 등록	/objects	POST	•	이동체 등록
16.	이동체 정보 변경	/objects/:id	PUT	•	이동체 정보 변경
17.	메시지 알림	/messages	GET	•	알림 메시지 정보 조회
