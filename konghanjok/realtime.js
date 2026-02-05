// 실시간 매칭 시스템 (Firebase Realtime Database)
// 다른 기기/브라우저 간 실시간 통신 지원

const RealtimeMatch = {
  myId: null,
  myData: null,
  roomId: null,
  isHost: false,
  onMatchFound: null,
  onOpponentChoice: null,
  onOpponentLeft: null,
  _listeners: [],
  _matchRef: null,
  _roomRef: null,

  // 초기화
  init: function() {
    this.myId = this._getUserId();
    this._listeners = [];
    
    // 페이지 떠날 때 정리
    window.addEventListener('beforeunload', () => {
      this.leave();
    });

    console.log('[RealtimeMatch] 초기화됨:', this.myId);
    return this;
  },

  // 유저 ID 생성/가져오기
  _getUserId: function() {
    let id = localStorage.getItem('konghanjok_player_id');
    if (!id) {
      id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      localStorage.setItem('konghanjok_player_id', id);
    }
    return id;
  },

  // 매칭 시작
  findMatch: function(matchData) {
    this.myData = matchData;
    console.log('[RealtimeMatch] 매칭 시작:', matchData);

    // Firebase 연결 확인
    if (typeof firebase === 'undefined' || !firebase.database) {
      console.error('[RealtimeMatch] Firebase가 로드되지 않았습니다');
      alert('Firebase 연결 오류. 설정을 확인하세요.');
      return;
    }

    const db = firebase.database();
    const queueRef = db.ref('matchQueue');

    // 매칭 키 생성 (모델 기반)
    const matchKey = matchData.model.replace(/\s+/g, '_');

    // 상대방 찾기 (내가 필요한 방향을 가진 사람)
    const lookingForRef = queueRef.child(matchKey).child(matchData.needSide);
    
    lookingForRef.orderByChild('timestamp').limitToFirst(1).once('value', (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        // 매칭 상대 발견!
        const opponentId = Object.keys(data)[0];
        const opponentData = data[opponentId];
        
        if (opponentId !== this.myId) {
          console.log('[RealtimeMatch] 상대 발견:', opponentId);
          this._createRoom(opponentId, opponentData);
          // 상대를 대기열에서 제거
          lookingForRef.child(opponentId).remove();
          return;
        }
      }
      
      // 상대가 없으면 대기열에 등록
      this._joinQueue(matchKey);
    });
  },

  // 대기열에 등록
  _joinQueue: function(matchKey) {
    const db = firebase.database();
    const myQueueRef = db.ref('matchQueue/' + matchKey + '/' + this.myData.mySide + '/' + this.myId);
    
    this._matchRef = myQueueRef;
    
    myQueueRef.set({
      ...this.myData,
      playerId: this.myId,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    console.log('[RealtimeMatch] 대기열 등록됨');

    // 누군가 나를 찾아서 방을 만들었는지 감시
    const myRoomRef = db.ref('playerRooms/' + this.myId);
    myRoomRef.on('value', (snapshot) => {
      const roomData = snapshot.val();
      if (roomData && roomData.roomId) {
        console.log('[RealtimeMatch] 방 초대 받음:', roomData.roomId);
        this.roomId = roomData.roomId;
        this.isHost = false;
        
        // 대기열에서 제거
        myQueueRef.remove();
        myRoomRef.remove();
        
        if (this.onMatchFound) {
          this.onMatchFound(this.roomId, false, roomData.opponentData);
        }
      }
    });
    this._listeners.push({ ref: myRoomRef, event: 'value' });
  },

  // 방 생성 (호스트)
  _createRoom: function(opponentId, opponentData) {
    const db = firebase.database();
    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    
    this.roomId = roomId;
    this.isHost = true;

    // 방 정보 저장
    const roomRef = db.ref('gameRooms/' + roomId);
    roomRef.set({
      hostId: this.myId,
      guestId: opponentId,
      hostChoice: null,
      guestChoice: null,
      round: 1,
      status: 'playing',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    // 상대에게 방 정보 알림
    db.ref('playerRooms/' + opponentId).set({
      roomId: roomId,
      opponentData: this.myData
    });

    console.log('[RealtimeMatch] 방 생성:', roomId);

    if (this.onMatchFound) {
      this.onMatchFound(roomId, true, opponentData);
    }
  },

  // 방 참가 (게임 페이지에서 호출)
  joinRoom: function(roomId, isHost) {
    this.roomId = roomId;
    this.isHost = isHost;
    
    console.log('[RealtimeMatch] 방 참가:', roomId, '호스트:', isHost);
    
    const db = firebase.database();
    const roomRef = db.ref('gameRooms/' + roomId);
    this._roomRef = roomRef;

    // 상대 선택 감시
    roomRef.on('value', (snapshot) => {
      const room = snapshot.val();
      if (!room) {
        if (this.onOpponentLeft) this.onOpponentLeft();
        return;
      }

      // 상대 선택 확인
      const opponentChoice = isHost ? room.guestChoice : room.hostChoice;
      if (opponentChoice && this.onOpponentChoice) {
        this.onOpponentChoice(opponentChoice);
      }

      // 상대 나감 확인
      if (room.status === 'abandoned' && this.onOpponentLeft) {
        this.onOpponentLeft();
      }
    });
    this._listeners.push({ ref: roomRef, event: 'value' });
  },

  // 선택 전송
  sendChoice: function(choice) {
    if (!this.roomId) {
      console.error('[RealtimeMatch] 방 정보 없음');
      return;
    }

    const db = firebase.database();
    const choiceKey = this.isHost ? 'hostChoice' : 'guestChoice';
    
    db.ref('gameRooms/' + this.roomId + '/' + choiceKey).set(choice);
    console.log('[RealtimeMatch] 선택 전송:', choice);
  },

  // 라운드 리셋
  resetRound: function() {
    if (!this.roomId) return;

    const db = firebase.database();
    const roomRef = db.ref('gameRooms/' + this.roomId);
    
    roomRef.update({
      hostChoice: null,
      guestChoice: null,
      round: firebase.database.ServerValue.increment(1)
    });
    
    console.log('[RealtimeMatch] 라운드 리셋');
  },

  // 대기열 정보 가져오기 (UI용)
  getQueueInfo: function(callback) {
    if (!this.myData) return;
    
    const db = firebase.database();
    const matchKey = this.myData.model.replace(/\s+/g, '_');
    const queueRef = db.ref('matchQueue/' + matchKey);
    
    queueRef.once('value', (snapshot) => {
      const data = snapshot.val() || {};
      let total = 0;
      let hasOpponent = false;
      
      // 내가 필요한 방향에 상대가 있는지
      const needSideData = data[this.myData.needSide] || {};
      const needSideCount = Object.keys(needSideData).filter(id => id !== this.myId).length;
      
      // 내 방향 대기자 수
      const mySideData = data[this.myData.mySide] || {};
      const mySideCount = Object.keys(mySideData).length;
      
      total = needSideCount + mySideCount;
      hasOpponent = needSideCount > 0;
      
      callback({
        total: total,
        hasOpponent: hasOpponent,
        needSideCount: needSideCount,
        mySideCount: mySideCount
      });
    });
  },

  // 나가기
  leave: function() {
    console.log('[RealtimeMatch] 나가기');
    
    // 리스너 제거
    this._listeners.forEach(({ ref, event }) => {
      ref.off(event);
    });
    this._listeners = [];

    // 대기열에서 제거
    if (this._matchRef) {
      this._matchRef.remove();
    }

    // 방 상태 업데이트
    if (this._roomRef) {
      this._roomRef.update({ status: 'abandoned' });
    }
  },

  // 디버깅용: 전체 대기열 초기화
  clearAll: function() {
    const db = firebase.database();
    db.ref('matchQueue').remove();
    db.ref('gameRooms').remove();
    db.ref('playerRooms').remove();
    console.log('[RealtimeMatch] 모든 데이터 초기화됨');
  }
};
