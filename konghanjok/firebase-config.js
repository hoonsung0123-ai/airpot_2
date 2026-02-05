// Firebase 설정 파일
// ⚠️ 아래 설정을 본인의 Firebase 프로젝트 설정으로 교체하세요
// Firebase Console: https://console.firebase.google.com/

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

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
