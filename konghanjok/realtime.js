// =============================
// 실시간 2인 매칭 시스템
// Firebase Realtime Database 기반
// =============================
const RealtimeMatch = {
  myId: null,
  myData: null,
  roomId: null,
  isHost: false,
  onMatchFound: null,
  onOpponentChoice: null,
  onOpponentLeft: null,
  _listeners: [],
  _roomRef: null,

  // 초기화
  init() {
    this.myId = this._getOrCreatePlayerId();
    this._listeners = [];

    // 페이지 떠날 때 정리
    window.addEventListener('beforeunload', () => {
      this.leave();
    });

    console.log('[RealtimeMatch] 초기화됨:', this.myId);
    return this;
  },

  // 고유 playerId 생성/획득
  _getOrCreatePlayerId() {
    let id = localStorage.getItem('realtime_player_id');
    if (!id) {
      id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      localStorage.setItem('realtime_player_id', id);
    }
    return id;
  },

  // 매칭 시작
  findMatch(matchData) {
    this.myData = matchData;
    console.log('[RealtimeMatch] 매칭 시작:', matchData);

    const db = firebase.database();
    const queueRef = db.ref('matchQueue');
    const matchKey = matchData.model.replace(/\s+/g, '_');
    const lookingForRef = queueRef.child(matchKey).child(matchData.needSide);

    // 1️⃣ 상대방 찾기
    lookingForRef.orderByChild('timestamp').limitToFirst(1).once('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        const opponentId = Object.keys(data)[0];
        const opponentData = data[opponentId];
        if (opponentId !== this.myId) {
          console.log('[RealtimeMatch] 상대 발견:', opponentId);
          lookingForRef.child(opponentId).remove(); // 큐에서 제거
          this._createRoom(opponentId, opponentData);
          return;
        }
      }
      // 2️⃣ 상대 없으면 대기열 등록
      this._joinQueue(matchKey);
    });
  },

  // 대기열에 등록
  _joinQueue(matchKey) {
    const db = firebase.database();
    const myQueueRef = db.ref(`matchQueue/${matchKey}/${this.myData.mySide}/${this.myId}`);
    myQueueRef.set({
      ...this.myData,
      playerId: this.myId,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    this._matchRef = myQueueRef;
    console.log('[RealtimeMatch] 대기열 등록됨');

    // 내 playerRoom 감시 → 누군가 방 만들면 바로 join
    const myRoomRef = db.ref(`playerRooms/${this.myId}`);
    myRoomRef.on('value', snapshot => {
      const roomData = snapshot.val();
      if (roomData && roomData.roomId) {
        this.roomId = roomData.roomId;
        this.isHost = false;
        myQueueRef.remove();  // 큐에서 제거
        myRoomRef.remove();   // playerRoom 제거

        console.log('[RealtimeMatch] 방 초대 받음:', roomData.roomId);
        if (this.onMatchFound) {
          this.onMatchFound(roomData.roomId, false, roomData.opponentData);
        }

        // 바로 방 join
        this.joinRoom(this.roomId, false);
      }
    });
    this._listeners.push({ ref: myRoomRef, event: 'value' });
  },

  // 방 생성 (호스트)
  _createRoom(opponentId, opponentData) {
    const db = firebase.database();
    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.roomId = roomId;
    this.isHost = true;

    // 방 정보 저장
    const roomRef = db.ref(`gameRooms/${roomId}`);
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
    db.ref(`playerRooms/${opponentId}`).set({
      roomId: roomId,
      opponentData: this.myData
    });

    console.log('[RealtimeMatch] 방 생성:', roomId);
    if (this.onMatchFound) {
      this.onMatchFound(roomId, true, opponentData);
    }

    // 바로 방 join
    this.joinRoom(roomId, true);
  },

  // 방 참가
  joinRoom(roomId, isHost) {
    this.roomId = roomId;
    this.isHost = isHost;
    const db = firebase.database();
    const roomRef = db.ref(`gameRooms/${roomId}`);
    this._roomRef = roomRef;

    roomRef.on('value', snapshot => {
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
    console.log('[RealtimeMatch] 방 참가:', roomId, '호스트:', isHost);
  },

  // 선택 전송
  sendChoice(choice) {
    if (!this.roomId) return;
    const db = firebase.database();
    const choiceKey = this.isHost ? 'hostChoice' : 'guestChoice';
    db.ref(`gameRooms/${this.roomId}/${choiceKey}`).set(choice);
    console.log('[RealtimeMatch] 선택 전송:', choice);
  },

  // 라운드 리셋
  resetRound() {
    if (!this.roomId) return;
    const db = firebase.database();
    db.ref(`gameRooms/${this.roomId}`).update({
      hostChoice: null,
      guestChoice: null,
      round: firebase.database.ServerValue.increment(1)
    });
    console.log('[RealtimeMatch] 라운드 리셋');
  },

  // 나가기
  leave() {
    console.log('[RealtimeMatch] 나가기');
    this._listeners.forEach(({ ref, event }) => ref.off(event));
    this._listeners = [];

    if (this._matchRef) this._matchRef.remove();
    if (this._roomRef) this._roomRef.update({ status: 'abandoned' });
  },

  // 전체 대기열/방 초기화 (디버깅)
  clearAll() {
    const db = firebase.database();
    db.ref('matchQueue').remove();
    db.ref('gameRooms').remove();
    db.ref('playerRooms').remove();
    console.log('[RealtimeMatch] 모든 데이터 초기화됨');
  }
};
