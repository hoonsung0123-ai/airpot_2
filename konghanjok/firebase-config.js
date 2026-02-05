// Firebase 설정 파일
// ⚠️ 아래 설정을 본인의 Firebase 프로젝트 설정으로 교체하세요
// 
// === Firebase 설정 방법 ===
// 1. https://console.firebase.google.com/ 접속
// 2. "프로젝트 추가" 클릭
// 3. 프로젝트 이름 입력 (예: konghanjok-game)
// 4. Google Analytics 비활성화 후 "프로젝트 만들기"
// 5. 왼쪽 메뉴 "빌드" > "Realtime Database" 클릭
// 6. "데이터베이스 만들기" 클릭 > 위치 선택 > "테스트 모드"로 시작
// 7. 프로젝트 설정(톱니바퀴) > 일반 > 웹앱 추가(</>)
// 8. 앱 이름 입력 후 "앱 등록"
// 9. firebaseConfig 값을 아래에 복사

const firebaseConfig = {
  apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "your-project-id.firebaseapp.com",
  databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxxxxxx"
};

// 설정 검증
const isConfigured = firebaseConfig.apiKey !== "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" &&
                     !firebaseConfig.projectId.includes("your-project-id");

if (!isConfigured) {
  console.warn('⚠️ Firebase가 설정되지 않았습니다!');
  console.warn('firebase-config.js 파일을 열어 본인의 Firebase 프로젝트 설정으로 교체하세요.');
  console.warn('설정 방법: https://console.firebase.google.com/');
  
  // 개발/테스트 안내
  const warningDiv = document.createElement('div');
  warningDiv.innerHTML = `
    <div style="position:fixed;top:0;left:0;right:0;background:#c0392b;color:white;padding:12px 16px;z-index:9999;font-size:14px;text-align:center;">
      ⚠️ Firebase 설정 필요! <a href="firebase-config.js" style="color:#fff;text-decoration:underline;">firebase-config.js</a> 파일을 수정하세요.
      <a href="https://console.firebase.google.com/" target="_blank" style="color:#fff;margin-left:10px;">[Firebase Console 열기]</a>
    </div>
  `;
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertBefore(warningDiv, document.body.firstChild);
    document.body.style.paddingTop = '50px';
  });
}

// Firebase 초기화
try {
  firebase.initializeApp(firebaseConfig);
  console.log('[Firebase] 초기화 완료');
  
  // 연결 상태 확인
  if (isConfigured) {
    const connectedRef = firebase.database().ref('.info/connected');
    connectedRef.on('value', (snap) => {
      if (snap.val() === true) {
        console.log('[Firebase] 🟢 서버 연결됨');
      } else {
        console.log('[Firebase] 🔴 서버 연결 끊김');
      }
    });
  }
} catch (e) {
  console.error('[Firebase] 초기화 오류:', e);
}

// 유틸리티 함수들
const GameUtils = {
  // 고유 사용자 ID 생성/가져오기
  getUserId: function() {
    let userId = localStorage.getItem('konghanjok_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('konghanjok_user_id', userId);
    }
    return userId;
  },

  // 방 ID 생성
  generateRoomId: function() {
    return 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  },

  // 가위바위보 결과 계산
  getRPSResult: function(myChoice, theirChoice) {
    if (myChoice === theirChoice) return 'draw';
    if (
      (myChoice === 'scissors' && theirChoice === 'paper') ||
      (myChoice === 'rock' && theirChoice === 'scissors') ||
      (myChoice === 'paper' && theirChoice === 'rock')
    ) return 'win';
    return 'lose';
  },

  // 타임스탬프
  getTimestamp: function() {
    return firebase.database.ServerValue.TIMESTAMP;
  }
};
