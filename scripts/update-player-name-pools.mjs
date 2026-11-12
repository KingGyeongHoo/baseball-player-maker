import fs from 'node:fs';
import assert from 'node:assert/strict';

// User-provided list, 2026-11-12. Ranks and frequencies intentionally omitted.
const baseNames = `
서준 민준 도윤 시우 하준 예준 지호 주원 도현 지후 준우 준서 우진 선우 건우 현우 지훈 유준 은우 연우 이준 서진 시윤 민재 윤우 정우 현준 수호 유찬 지우 이안 승우 지환 승현 준혁 진우 시후 승민 우주 은호 민성 수현 지원 지한 준영 재윤 시현 태윤 한결 지안
시온 서우 이현 윤호 시원 하진 은찬 도하 민우 재원 로운 우빈 동현 율 민규 민찬 윤재 태오 재민 하율 지율 준호 준 하민 지민 태민 재현 이든 민호 현서 성민 승준 성현 하람 예성 지성 태현 다온 태양 규민 윤성 민혁 성준 주안 도영 도훈 지오 정민 은성 주호
예찬 건 준희 준수 도율 도준 태준 민석 하랑 강민 재하 시율 지완 시안 준성 유안 승원 승호 라온 서율 정현 우현 단우 성빈 현수 시훈 하온 이한 윤 도원 시완 민서 현 주환 정후 연준 원준 건희 유건 도경 서후 정원 온유 민수 정훈 동하 유현 서호 승윤 주영
시환 현민 민건 가온 민기 승빈 하늘 경민 재준 현성 세현 태율 도겸 태하 선호 호준 태훈 태영 재훈 도진 산 재이 태경 찬영 범준 동건 태이 지혁 하윤 윤찬 서원 시호 세준 연호 현진 성윤 로이 찬 태호 영준 재영 지운 찬우 주혁 현승 동윤 건호 윤후 유진 승재
우성 상현 찬희 승훈 규빈 주한 은율 재희 수혁 이도 성훈 현호 수민 우찬 태우 승찬 재우 우준 하성 동욱 강우 태인 현빈 주완 강현 아준 시헌 효준 준후 유민 주현 우영 상윤 동우 유빈 도연 준석 성우 원우 재혁 지용 윤서 아인 형준 인우 은준 이찬 진호 신우 용준
해준 승후 규현 호진 석현 동준 지웅 준형 지온 상우 서윤 승유 재율 하루 진혁 선율 민결 재호 혜성 유하 동훈 승환 은혁 은수 대현 유성 진서 도건 여준 세훈 승주 종현 영민 정빈 도운 우재 성원 준원 윤건 태건 노아 채민 영우 요한 건후 준현 한율 태환 유담 현석
서빈 태성 리안 호연 상민 시준 다원 한울 원 동혁 희찬 결 로건 준범 우혁 해솔 동규 성진 서하 은재 건율 윤수 서현 희준 주형 찬민 찬율 세윤 정호 가람 세진 이수 태원 해성 환희 민제 태웅 경준 하빈 연후 준민 성호 인성 민승 진영 정윤 승혁 민 상준 승헌
강 재성 이담 윤준 선재 희성 주성 승기 성재 규원 한별 호영 은후 주하 인호 리우 현규 시영 지윤 준하 강준 지섭 진욱 다니엘 진 로하 세민 서안 우석 동연 현욱 정환 수빈 시언 한솔 찬혁 창민 도형 예건 준기 한준 지석 성찬 지수 도헌 민후 건하 영훈 명준 솔
주헌 태연 기현 도빈 준휘 이진 서한 해인 리한 상훈 민율 재인 재형 환 은결 호윤 재용 시형 예담 주찬 이재 상원 기범 유호 태규 진성 겸 승연 동민 현재 수환 영재 유신 태희 영진 동원 승범 찬유 동호 유겸 지헌 훈 건영 재범 준모 한빈 한서 석준 태빈 연재
리호 민욱 재환 연수 찬빈 도균 채우 재빈 수찬 준환 유승 다율 진원 한 제이 혁 시하 상혁 영찬 희재 의준 근우 준이 강윤 하겸 재욱 준상 경훈 성욱 동주 유한 대한 은규 동환 찬호 단 리온 선준 지현 도담 윤혁 윤제 재유 형우 승규 재연 종혁 보겸 해온 지욱 성문 자욱
`.trim().split(/\s+/);

// Includes the supplied players, managers and coaches; uniform numbers omitted.
const roster = `
박진만 손주인 배영섭 이흥련 최일언 무라카미 박석진 정병곤 이종욱 채상병
이재희 원태인 김태훈 이승민 백정현 임기영 양창섭 배찬승 이승현 페덱 장찬희 김재윤 사토시 후라도
김도환 장승현 강민호 디아즈 류지혁 이해승 김영웅 김상준 전병우 이재현 박계범
윤정빈 김헌곤 최형우 김성윤 김현준 홍현빈 김지찬 박승규
이강철 김강 박경수 장재중 박기혁 김태한 김호 유한준 제춘모 최만호 전병두
고영표 스기모토 우규민 배제성 김민수 소형준 주권 오원석 박영현 김정운 박지훈
장성우 조대현 한승택 강현우 허경민 문상철 힐리어드 오윤석 권동진 장준원 손민석 김상수 류현인
김현수 안현민 배정대 최원준 이정훈 장진혁 김민혁 유준규
이범호 손승락 고영민 박기남 김연훈 김주찬 김지용 이동걸 이해창 조승범
곽도규 김태형 조상우 올러 최지민 황동하 이태양 이의리 김범수 전상현 양현종 한재승 정해영 시라카와 성영탁 홍민규
주효상 한준수 김태군 정현창 김규성 박민 변우혁 김선빈 하주석 황대인 이호연 김도영
박정우 박재현 카스트로 김호령 김민규 나성범
염경엽 김광삼 김일경 송지만 김용의 윤진호 김정준 최경철 정수성 장진용 모창민
임찬규 고우석 우강훈 이우찬 손주영 톨허스트 김강률 이상영 김진수 김윤식 장현식 박시원 카라스코 양우진 김영우 케네디
박동원 김민수 이주헌 오지환 손용준 문보경 오스틴 신민재 천성호 문정빈 구본혁 이영빈
박해민 최원영 홍창기 이재원 송찬의 문성주
김원형 손시헌 조인성 이진영 정재훈 홍원기 손지환 조중근 고토 임재현 가득염
박치국 타카다 김정우 김영현 최승용 이병헌 잭로그 이용찬 곽빈 벤자민 이영하 김택연 윤태호 최민석 김한중
김기연 양의지 윤준호 류현준 이유찬 강승호 세베리노 박지훈 양석환 오명진 안재석 박찬호
류승민 김민석 손아섭 정수빈 김대한 김인태 조수행
이숭용 조동화 조동찬 오준혁 경헌호 세리자와 임훈 윤재국 송신영 이승호 김성현
신상연 이건욱 조병현 전영준 최민준 아빌라 한두솔 김민준 문승원 박시후 김도현 변건우 이준기 이로운
조형우 신범수 이지영 안상현 고명준 박성한 김요셉 전의산 문상준 안재연 홍대인
채현우 에레디아 김재환 한유섬 오태곤 김정민 최지훈 임근우
김태형 조재영 이재율 이병규 강석천 이현곤 문규현 정경배 용덕한 이성곤 김상진
김진욱 현도훈 박세웅 구승민 김원중 박정민 이이무라 이영재 박세진 나균안 김기준 이준서 최준용 송재영
유강남 손성빈 박건우 전민재 고승민 한동희 김세민 나승엽 노진혁 박승욱 한태양 박찬형
황성빈 조세진 레이예스 김동혁 장두성 전준우 윤동희
이호준 서재응 김경태 김종호 이승호 진종길 전민수 김상훈 조영훈 박용근 이용훈
클레빈저 토다 김재열 임정호 이준혁 신영우 송명기 손주환 이용준 이재학 전사민 구창모 배재환 최요한
안중열 김형준 홍종표 김한별 최정원 도태훈 박민우 한재환 김휘집 블레인 오태양 김주원 신재인
천재환 한석현 권희동 박건우 고준휘 박시원 이우성
김경문 강인권 박승민 윤규진 김재걸 김우석 정현석 김민호 양승관 김정민 추승우
짐머맨 이형범 이상규 화이트 이민우 장유호 황준서 김종수 김서현 원종혁 강재민 조동욱 정우주 주현상 강건우
최재훈 장규현 허인서 정은원 이도윤 강백호 박정현 심우준 노시환 황영묵
권광민 김태연 페라자 유로결 이원석 최인호 문현빈 유민
설종진 문찬종 김준완 강병식 박승주 노병오 김태완 박도현 박정음 이용규
와일스 박윤성 김성진 김재웅 오석주 박진형 유토 하영민 알칸타라 배동현 전준표 박정훈 윤석원
김건희 김재현 오선진 김태진 최재영 박한결 최주환 안치홍 어준서
브룩스 이주형 추재현 임지열 이형종 박찬혁 박수종
`.trim().split(/\s+/);
const excluded = `무라카미 페덱 사토시 후라도 디아즈 스기모토 힐리어드 올러 시라카와 카스트로 톨허스트 카라스코 케네디 오스틴 고토 타카다 잭로그 벤자민 세베리노 세리자와 아빌라 에레디아 이이무라 레이예스 클레빈저 토다 블레인 짐머맨 화이트 페라자 와일스 유토 알칸타라 브룩스`.split(' ');
const historicalRoster = `선동열 최동원 이종범 이승엽 송진우 장효조 양준혁 구대성 이강철 장종훈 박철순 이만수 정민철 김태균 박용택 김용수 박재홍 정민태 이병규 김시진 임창용 김기태 박경완 백인천 김성한 조계현 이상훈 한대화 김동주 심정수 김재박 박정태 전준호 배영수 홍성흔 이순철 정근우 박진만 장성호 이호준 정명원 이범호 김재현 류중일 마해영 윤학길 김원형 박한이`.split(' ');
roster.push(...historicalRoster);
assert.equal(baseNames.length,502);
assert.equal(new Set(baseNames).size,502);
assert.ok(excluded.every(name=>roster.includes(name)));
const poolPath='lib/sim/player-name-pools.json';
const pools=JSON.parse(fs.readFileSync(poolPath,'utf8'));
const surnames=[...pools.surnames].sort((a,b)=>b.length-a.length);
const domestic=roster.filter(name=>!excluded.includes(name));
const parsed=domestic.map(fullName=>{
  const surname=surnames.find(s=>fullName.startsWith(s)) ?? fullName[0];
  return {fullName,surname,givenName:fullName.slice(surname.length)};
});
const addedSurnames=[...new Set(parsed.map(p=>p.surname))].filter(s=>!pools.surnames.includes(s));
// Any new surname needs a documented population before retaining weighted sampling.
assert.deepEqual(addedSurnames,[]);
const addedGivenNames=[...new Set(parsed.map(p=>p.givenName))].filter(n=>!baseNames.includes(n));
pools.version=3;
pools.givenNames=[...baseNames,...addedGivenNames];
assert.ok(pools.givenNames.every(n=>/^[가-힣]{1,3}$/.test(n)));
fs.writeFileSync(poolPath,JSON.stringify(pools,null,2)+'\n');
const statsPath='docs/player-name-statistics.json';
const previous=JSON.parse(fs.readFileSync(statsPath,'utf8'));
const stats={version:3,updatedAt:'2026-11-12',surnameSource:previous.surnameSource,surnameRanks:previous.surnameRanks,
  givenNameSource:{source:'사용자 제공 남자 이름 502개, KBO 10개 구단 선수·감독·코치 및 역대 선수 48명 명단',method:'순위·인원 무시. 외국인 선수·코치 제외 후 성/이름 분리. 기본 502개에 없는 이름만 중복 없이 추가. 모든 이름 동일 확률.',baseCount:baseNames.length,addedCount:addedGivenNames.length,selected:pools.givenNames.length,singleSyllableNames:pools.givenNames.filter(n=>n.length===1).length},
  baseGivenNames:baseNames,rosterEntries:roster,excludedForeignNames:excluded,parsedDomesticNames:parsed,addedSurnames,addedGivenNames};
fs.writeFileSync(statsPath,JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({surnames:pools.surnames.length,base:baseNames.length,added:addedGivenNames.length,total:pools.givenNames.length,foreignExcluded:excluded.length,rosterEntries:roster.length,singleSyllable:stats.givenNameSource.singleSyllableNames,addedSurnames,addedGivenNames},null,2));
